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
  /** 0 = no time goal. */
  timeGoalMs: number;
  timeTodayMs: number;
}

export interface Step {
  id: StepId;
  title: string;
  detail: string;
  done: boolean;
  /** 0–1, for the step's little progress ring. */
  progress: number;
}

export interface DayPlan {
  steps: Step[];
  /** The first step not done yet. */
  next: Step | null;
  doneCount: number;
  allDone: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The day, in order: learn today's 1–2 new grammar points (lesson + quiz), review
 * grammar that's due, study flashcards, then reach the daily practice time goal (all tracked activities count).
 * Steps that don't apply (no decks, no time goal, nothing left to learn) are left out.
 */
export function dailyPlan(s: DayState): DayPlan {
  const steps: Step[] = [];

  const target = Math.min(s.newGoal, s.learnedToday + s.unlearned);
  if (target > 0) {
    const done = s.learnedToday >= target;
    const left = target - s.learnedToday;
    steps.push({
      id: 'learn',
      title: done ? `Learned ${plural(s.learnedToday, 'new point')}` : `Learn ${plural(left, 'new point')}`,
      detail: done ? 'Lesson and quiz done' : s.nextTitles.slice(0, left).join(' · '),
      done,
      progress: Math.min(1, s.learnedToday / target),
    });
  }

  if (s.grammarCards > 0) {
    const done = s.grammarDue === 0;
    steps.push({
      id: 'review',
      title: 'Review grammar',
      detail:
        s.grammarDue > 0
          ? `${s.grammarDue} due`
          : s.grammarReviewedToday > 0
            ? `${s.grammarReviewedToday} reviewed today`
            : 'Nothing due right now',
      done,
      progress: done ? 1 : s.grammarReviewedToday / (s.grammarReviewedToday + s.grammarDue),
    });
  }

  if (s.decks > 0) {
    const done = s.cardsDue === 0;
    steps.push({
      id: 'cards',
      title: 'Flashcards',
      detail: s.cardsDue > 0 ? `${plural(s.cardsDue, 'card')} to study` : s.cardsReviewedToday > 0 ? `${s.cardsReviewedToday} studied today` : 'Nothing due today',
      done,
      progress: done ? 1 : s.cardsReviewedToday / (s.cardsReviewedToday + s.cardsDue),
    });
  }

  if (s.timeGoalMs > 0) {
    const done = s.timeTodayMs >= s.timeGoalMs;
    steps.push({
      id: 'time',
      title: `${s.timeGoalMs < 60 * 60 * 1000 ? plural(Math.round(s.timeGoalMs / 60000), 'minute') : formatDuration(s.timeGoalMs)} practicing`,
      detail: `${formatDuration(s.timeTodayMs)} of ${formatDuration(s.timeGoalMs)} today · all activities count`,
      done,
      progress: Math.min(1, s.timeTodayMs / s.timeGoalMs),
    });
  }

  const doneCount = steps.filter((x) => x.done).length;
  return { steps, next: steps.find((x) => !x.done) ?? null, doneCount, allDone: steps.length > 0 && doneCount === steps.length };
}
