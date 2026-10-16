import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ankiToday } from '../anki/repo';
import { curriculum } from '../content/loader';
import { getActivityTimes } from '../db/repo';
import { lessonsLearnedToday } from '../srs/lessons';
import { todaysReviews } from '../srs/queue';
import { dayKey } from '../stats/dates';
import { getGoalDays, markGoalDays, timeGoalDays } from '../stats/goalDays';
import { computeStreak } from '../stats/streak';
import { useApp, useNow } from '../state/AppProvider';
import { dailyPracticeMinutes, daysLeftInWeek, goalActiveOn, goalDoneMs } from '../time/goals';
import { startOfDay, totalsByActivity } from '../time/model';
import { useTime } from '../time/TimeProvider';
import { dailyPlan, type DayPlan, type StepId } from './plan';

const DAY = 24 * 60 * 60 * 1000;

interface Loaded {
  decks: number;
  cardsDue: number;
  cardsReviewedToday: number;
  firstDeck: string | null;
  activity: number[];
  goalDays: string[];
}

export interface Today {
  plan: DayPlan;
  now: number;
  /** Days in a row with at least one goal reached. */
  streak: { days: number; goalMetToday: boolean };
  /** Every study timestamp from the last ~13 months (grammar, flashcards, tracked time). */
  activity: number[];
  grammarDue: number;
  learnedToday: number;
  cardsDue: number;
  cardsReviewedToday: number;
  grammarReviewedToday: number;
  timeTodayMs: number;
  firstDeck: string | null;
  loaded: boolean;
  /** Open a step. `replace` swaps the current study screen instead of stacking another. */
  goTo: (step: StepId, how?: 'push' | 'replace') => void;
}

/**
 * The day at a glance, shared by Today, Progress and the end of every study session:
 * what's due across grammar and flashcards, time tracked, the streak and the plan.
 */
export function useToday(): Today {
  const db = useSQLiteContext();
  const { cards, settings } = useApp();
  const { entries, running, activityById } = useTime();
  const now = useNow(running ? 1000 : 30_000);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const { ankiNewPerDay, ankiMaxReviewsPerDay } = settings;

  // Reload whenever the screen comes into focus, or progress changes while it's open.
  const load = useCallback(async () => {
    const t = Date.now();
    const [anki, activity, goalDays] = await Promise.all([
      ankiToday(db, t, { newPerDay: ankiNewPerDay, reviewsPerDay: ankiMaxReviewsPerDay }),
      getActivityTimes(db, t - 400 * DAY),
      getGoalDays(db, t - 400 * DAY),
    ]);
    setLoaded({ decks: anki.decks, cardsDue: anki.due, cardsReviewedToday: anki.reviewed, firstDeck: anki.firstDeck, activity, goalDays });
    // `cards` and `entries` are deliberate triggers: they change after every study step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ankiNewPerDay, ankiMaxReviewsPerDay, cards, entries]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const learnedIds = new Set(cards.map((c) => c.grammar_id));
  const unlearned = curriculum.filter((p) => !learnedIds.has(p.id));
  const learnedToday = lessonsLearnedToday(
    cards.map((c) => c.learned_at),
    now,
  );
  const grammar = todaysReviews(cards, now, { maxPerDay: settings.grammarMaxReviewsPerDay });
  const grammarDue = grammar.queue.length;
  const timeTodayMs = [...totalsByActivity(entries, startOfDay(now), startOfDay(now) + 2 * DAY, now).values()].reduce((a, b) => a + b, 0);
  const l = loaded ?? { decks: 0, cardsDue: 0, cardsReviewedToday: 0, firstDeck: null, activity: [], goalDays: [] };

  const plan = dailyPlan({
    newGoal: settings.dailyNewGrammar,
    learnedToday,
    unlearned: unlearned.length,
    nextTitles: unlearned.slice(0, settings.dailyNewGrammar).map((p) => p.title),
    grammarCards: cards.length,
    grammarDue,
    grammarReviewedToday: grammar.done,
    decks: l.decks,
    cardsDue: l.cardsDue,
    cardsReviewedToday: l.cardsReviewedToday,
    // Goals for a hidden or deleted activity are left out until it's back, and so are
    // goals for other days of the week.
    timeGoals: settings.timeGoals.flatMap((g) => {
      const activity = g.activityId === null ? null : activityById.get(g.activityId);
      if (activity === undefined || activity?.archived || !goalActiveOn(g, now)) return [];
      return [{ id: g.id, activity: activity?.name ?? null, period: g.period, goalMs: g.minutes * 60 * 1000, doneMs: goalDoneMs(g, entries, now), daysLeft: daysLeftInWeek(now) }];
    }),
  });

  // Save goal days as they happen: today's once the plan shows the goal reached. Without a lesson
  // to do, recent days whose time goal was met by time logged afterwards count too.
  const timeGoalMs = dailyPracticeMinutes(settings.timeGoals, now) * 60 * 1000;
  const lessonDay = plan.steps.some((s) => s.id === 'learn');
  const reached = [...(lessonDay ? [] : timeGoalDays(entries, timeGoalMs, now)), ...(loaded && plan.goalMet ? [dayKey(now)] : [])];
  const missing = reached.filter((d) => !l.goalDays.includes(d));
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!loaded || !missingKey) return;
    markGoalDays(db, missingKey.split(',')).then(load, (e) => console.warn('Could not save goal day', e));
  }, [db, loaded, missingKey, load]);

  const goTo = useCallback(
    (step: StepId, how: 'push' | 'replace' = 'push') => {
      const open = (href: Parameters<typeof router.push>[0]) => (how === 'replace' ? router.replace(href) : router.push(href));
      if (step === 'learn') open('/lessons');
      else if (step === 'review') open('/review');
      else if (step === 'cards' && l.firstDeck) open({ pathname: '/anki/[deck]', params: { deck: encodeURIComponent(l.firstDeck) } });
      // A tab: from a finished session, close it rather than stacking the tabs on top of it
      // (which would leave the session one swipe back).
      else if (how === 'replace') router.dismissTo(step === 'cards' ? '/decks' : '/timer');
      else router.navigate(step === 'cards' ? '/decks' : '/timer');
    },
    [l.firstDeck],
  );

  return {
    plan,
    now,
    streak: computeStreak([...l.goalDays, ...missing], now),
    activity: l.activity,
    grammarDue,
    learnedToday,
    cardsDue: l.cardsDue,
    cardsReviewedToday: l.cardsReviewedToday,
    grammarReviewedToday: grammar.done,
    timeTodayMs,
    firstDeck: l.firstDeck,
    loaded: loaded !== null,
    goTo,
  };
}
