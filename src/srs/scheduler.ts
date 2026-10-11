import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS } from 'ts-fsrs';

export { Rating, State };

/** A card row as stored in SQLite (dates as unix ms). */
export interface StoredCard {
  grammar_id: string;
  level: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review: number | null;
  learned_at: number;
  suspended: number;
}

/** A review log row as stored in SQLite (minus its autoincrement id). */
export interface StoredLog {
  grammar_id: string;
  example_id: string;
  rating: Rating;
  answer: string;
  reviewed_at: number;
  duration_ms: number | null;
  prev_card: string;
  state: State;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
}

export interface SchedulerOptions {
  requestRetention?: number;
  enableFuzz?: boolean;
}

/**
 * Typed answers are pass/fail, so we only use Again and Good.
 * One 10-minute (re)learning step: a correct first answer graduates straight to
 * FSRS intervals; a miss comes back in 10 minutes.
 */
export function createScheduler({ requestRetention = 0.9, enableFuzz = true }: SchedulerOptions = {}): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: requestRetention,
      enable_fuzz: enableFuzz,
      enable_short_term: true,
      learning_steps: ['10m'],
      relearning_steps: ['10m'],
      maximum_interval: 36500,
    }),
  );
}

export const defaultScheduler = createScheduler();

function toFsrs(card: StoredCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review == null ? undefined : new Date(card.last_review),
  };
}

function fromFsrs(card: Card, base: StoredCard): StoredCard {
  return {
    ...base,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

/** A freshly learned card, due immediately. */
export function newCard(grammarId: string, level: string, now: number): StoredCard {
  const empty = createEmptyCard(new Date(now));
  return fromFsrs(empty, {
    grammar_id: grammarId,
    level,
    learned_at: now,
    suspended: 0,
  } as StoredCard);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A point you said you already know (skipped on the map): learned, but suspended so it never
 * comes up in reviews. If it's put back into reviews later, it starts a month out.
 * learned_at is 0 ("before you started"), so it doesn't count as today's lesson or as study
 * on your streak.
 */
export function knownCard(grammarId: string, level: string, now: number): StoredCard {
  return {
    grammar_id: grammarId,
    level,
    due: now + 30 * DAY_MS,
    stability: 30,
    difficulty: 3,
    elapsed_days: 0,
    // Under 21 days, so it shows as learned rather than mastered.
    scheduled_days: 14,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: State.Review,
    last_review: now,
    learned_at: 0,
    suspended: 1,
  };
}

export interface GradeInput {
  card: StoredCard;
  correct: boolean;
  now: number;
  exampleId: string;
  answer: string;
  durationMs?: number | null;
  scheduler?: FSRS;
}

export function gradeCard({ card, correct, now, exampleId, answer, durationMs = null, scheduler = defaultScheduler }: GradeInput): {
  card: StoredCard;
  log: StoredLog;
} {
  const rating = correct ? Rating.Good : Rating.Again;
  const result = scheduler.next(toFsrs(card), new Date(now), rating);
  return {
    card: fromFsrs(result.card, card),
    log: {
      grammar_id: card.grammar_id,
      example_id: exampleId,
      rating,
      answer,
      reviewed_at: now,
      duration_ms: durationMs,
      prev_card: JSON.stringify(card),
      state: result.log.state,
      due: result.log.due.getTime(),
      stability: result.log.stability,
      difficulty: result.log.difficulty,
      elapsed_days: result.log.elapsed_days,
      last_elapsed_days: result.log.last_elapsed_days,
      scheduled_days: result.log.scheduled_days,
      learning_steps: result.log.learning_steps,
    },
  };
}

/** Undo a review: the card exactly as it was before the logged review. */
export function cardBeforeLog(log: Pick<StoredLog, 'prev_card'>): StoredCard {
  return JSON.parse(log.prev_card) as StoredCard;
}

const DAY = 24 * 60 * 60 * 1000;

/** Current probability of recall (0-1) for display on the grammar screen. */
export function retrievability(card: StoredCard, now: number, scheduler: FSRS = defaultScheduler): number {
  if (card.state === State.New || card.last_review == null) return 0;
  const elapsedDays = Math.max(0, (now - card.last_review) / DAY);
  return scheduler.forgetting_curve(elapsedDays, card.stability);
}

/** A point counts as "mastered" once its next interval is three weeks or more. */
export function isMastered(card: Pick<StoredCard, 'state' | 'scheduled_days'>): boolean {
  return card.state === State.Review && card.scheduled_days >= 21;
}
