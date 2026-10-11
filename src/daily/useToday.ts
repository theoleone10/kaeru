import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ankiToday } from '../anki/repo';
import { curriculum } from '../content/loader';
import { getActivityTimes, getReviewCountSince } from '../db/repo';
import { lessonsLearnedToday } from '../srs/lessons';
import { startOfLocalDay } from '../stats/dates';
import { computeStreak } from '../stats/streak';
import { useApp, useNow } from '../state/AppProvider';
import { startOfDay, totalsByActivity } from '../time/model';
import { useTime } from '../time/TimeProvider';
import { dailyPlan, type DayPlan, type StepId } from './plan';

const DAY = 24 * 60 * 60 * 1000;

interface Loaded {
  decks: number;
  cardsDue: number;
  cardsReviewedToday: number;
  firstDeck: string | null;
  grammarReviewedToday: number;
  activity: number[];
}

export interface Today {
  plan: DayPlan;
  now: number;
  streak: { days: number; studiedToday: boolean };
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
  const { entries, running } = useTime();
  const now = useNow(running ? 1000 : 30_000);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const { ankiNewPerDay, ankiMaxReviewsPerDay } = settings;

  // Reload whenever the screen comes into focus, or progress changes while it's open.
  const load = useCallback(async () => {
    const t = Date.now();
    const [anki, grammarReviewedToday, activity] = await Promise.all([
      ankiToday(db, t, { newPerDay: ankiNewPerDay, reviewsPerDay: ankiMaxReviewsPerDay }),
      getReviewCountSince(db, startOfLocalDay(t)),
      getActivityTimes(db, t - 400 * DAY),
    ]);
    setLoaded({ decks: anki.decks, cardsDue: anki.due, cardsReviewedToday: anki.reviewed, firstDeck: anki.firstDeck, grammarReviewedToday, activity });
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
  const grammarDue = cards.filter((c) => !c.suspended && c.due <= now).length;
  const timeTodayMs = [...totalsByActivity(entries, startOfDay(now), startOfDay(now) + 2 * DAY, now).values()].reduce((a, b) => a + b, 0);
  const l = loaded ?? { decks: 0, cardsDue: 0, cardsReviewedToday: 0, firstDeck: null, grammarReviewedToday: 0, activity: [] };

  const plan = dailyPlan({
    newGoal: settings.dailyNewGrammar,
    learnedToday,
    unlearned: unlearned.length,
    nextTitles: unlearned.slice(0, settings.dailyNewGrammar).map((p) => p.title),
    grammarCards: cards.length,
    grammarDue,
    grammarReviewedToday: l.grammarReviewedToday,
    decks: l.decks,
    cardsDue: l.cardsDue,
    cardsReviewedToday: l.cardsReviewedToday,
    timeGoalMs: settings.dailyTimeGoalMin * 60 * 1000,
    timeTodayMs,
  });

  const goTo = useCallback(
    (step: StepId, how: 'push' | 'replace' = 'push') => {
      const open = (href: Parameters<typeof router.push>[0]) => (how === 'replace' ? router.replace(href) : router.push(href));
      if (step === 'learn') open('/lessons');
      else if (step === 'review') open('/review');
      else if (step === 'cards' && l.firstDeck) open({ pathname: '/anki/[deck]', params: { deck: encodeURIComponent(l.firstDeck) } });
      else router.navigate(step === 'cards' ? '/decks' : '/timer');
    },
    [l.firstDeck],
  );

  return {
    plan,
    now,
    streak: computeStreak(l.activity, now),
    activity: l.activity,
    grammarDue,
    learnedToday,
    cardsDue: l.cardsDue,
    cardsReviewedToday: l.cardsReviewedToday,
    grammarReviewedToday: l.grammarReviewedToday,
    timeTodayMs,
    firstDeck: l.firstDeck,
    loaded: loaded !== null,
    goTo,
  };
}
