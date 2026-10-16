import { formatDuration } from '../time/model';

export type StepId = 'learn' | 'review' | 'cards' | 'time';

/** Everything the day's plan is worked out from. */
export interface DayState {
  /** New grammar points per day (the user's goal). */
  newGoal: number;
  learnedToday: number;
  /** Grammar points not learned yet. */
  unlearned: number;
  /** Titles of the next lessons, for the Learn step. */
  nextTitles: string[];
  /** Grammar points in the SRS. */
  grammarCards: number;
  grammarDue: number;
  grammarReviewedToday: number;
  /** Imported Anki decks (top level). */
  decks: number;
  cardsDue: number;
  cardsReviewedToday: number;
  /** Time goals that apply today (per activity or all, daily or weekly), with time done in their current day or week. */
  timeGoals: TimeGoalState[];
}

export interface TimeGoalState {
  id: string;
  /** Activity name, or null when every activity counts. */
  activity: string | null;
  period: 'day' | 'week';
  goalMs: number;
  doneMs: number;
  /** Weekly goals: days left this week, today included. */
  daysLeft?: number;
}

export interface Step {
  id: StepId;
  /** Unique per step: the id, or `time:<goal id>` for time goals. */
  key: string;
  title: string;
  detail: string;
  done: boolean;
  /** 0–1, for the step's little progress ring. */
  progress: number;
  /** A weekly goal: shown every day, but the day can be done without finishing it. */
  weekly?: boolean;
}

export interface DayPlan {
  steps: Step[];
  /** The first step not done yet (today's steps before weekly goals). */
  next: Step | null;
  doneCount: number;
  allDone: boolean;
  /**
   * Today's grammar lessons are done: what extends the streak. When there's no lesson to do
   * (curriculum finished, or a new-points goal of 0), any finished step counts instead.
   */
  goalMet: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The day, in order: learn today's 1–2 new grammar points (lesson + quiz), review
 * grammar that's due, study flashcards, then reach each time goal (one activity or all of them, today or this week).
 * Steps that don't apply (no decks, no time goals, nothing left to learn, no reviews today)
 * are left out.
 */
export function dailyPlan(s: DayState): DayPlan {
  const steps: Step[] = [];

  const target = Math.min(s.newGoal, s.learnedToday + s.unlearned);
  if (target > 0) {
    const done = s.learnedToday >= target;
    const left = target - s.learnedToday;
    steps.push({
      id: 'learn',
      key: 'learn',
      title: done ? `Learned ${plural(s.learnedToday, 'new point')}` : `Learn ${plural(left, 'new point')}`,
      detail: done ? 'Lesson and quiz done' : s.nextTitles.slice(0, left).join(' · '),
      done,
      progress: Math.min(1, s.learnedToday / target),
    });
  }

  // Reviews are the SRS recap of earlier lessons, not today's quiz: the step only shows on a
  // day with reviews to do (or done), so a lesson alone never ticks it.
  if (s.grammarCards > 0 && (s.grammarDue > 0 || s.grammarReviewedToday > 0)) {
    const done = s.grammarDue === 0;
    steps.push({
      id: 'review',
      key: 'review',
      title: 'Review grammar',
      detail: s.grammarDue > 0 ? `${s.grammarDue} due` : `${s.grammarReviewedToday} reviewed today`,
      done,
      progress: done ? 1 : s.grammarReviewedToday / (s.grammarReviewedToday + s.grammarDue),
    });
  }

  if (s.decks > 0 && (s.cardsDue > 0 || s.cardsReviewedToday > 0)) {
    const done = s.cardsDue === 0;
    steps.push({
      id: 'cards',
      key: 'cards',
      title: 'Flashcards',
      detail: s.cardsDue > 0 ? `${plural(s.cardsDue, 'card')} to study` : `${s.cardsReviewedToday} studied today`,
      done,
      progress: done ? 1 : s.cardsReviewedToday / (s.cardsReviewedToday + s.cardsDue),
    });
  }

  for (const g of s.timeGoals) {
    const done = g.doneMs >= g.goalMs;
    const amount = g.goalMs < 60 * 60 * 1000 ? plural(Math.round(g.goalMs / 60000), 'minute') : formatDuration(g.goalMs);
    const week = g.period === 'week';
    const left = week && !done && g.daysLeft ? ` · ${g.daysLeft === 1 ? 'last day' : `${g.daysLeft} days left`}` : '';
    const all = g.activity === null ? ' · all activities count' : '';
    steps.push({
      id: 'time',
      key: `time:${g.id}`,
      title: `${amount} ${g.activity ? `of ${g.activity}` : 'practicing'}${week ? ' this week' : ''}`,
      detail: `${formatDuration(g.doneMs)} of ${formatDuration(g.goalMs)} ${week ? 'this week' : 'today'}${left || all}`,
      done,
      progress: Math.min(1, g.doneMs / g.goalMs),
      ...(week ? { weekly: true } : {}),
    });
  }

  const doneCount = steps.filter((x) => x.done).length;
  const learn = steps.find((x) => x.id === 'learn');
  // An unfinished weekly goal doesn't keep the day open, unless weekly goals are all there is.
  const daily = steps.filter((x) => !x.weekly);
  const counted = daily.length > 0 ? daily : steps;
  return {
    steps,
    next: daily.find((x) => !x.done) ?? steps.find((x) => !x.done) ?? null,
    doneCount,
    allDone: counted.length > 0 && counted.every((x) => x.done),
    goalMet: learn ? learn.done : doneCount > 0,
  };
}
