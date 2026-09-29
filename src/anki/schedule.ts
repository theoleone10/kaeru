import { fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs';
import type { AnkiCardRow, AnkiRevlogRow } from './collection';

export { Rating, State };

const DAY = 24 * 60 * 60 * 1000;

/** Scheduling state of an imported card (dates as unix ms), mirroring the anki_cards columns. */
export interface AnkiSched {
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
  suspended: number;
  new_position: number;
}

/**
 * Anki-style FSRS: four buttons, 1m/10m learning steps, 10m relearning step,
 * 90% desired retention (Anki's default).
 */
export function createAnkiScheduler(enableFuzz = true): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: 0.9,
      enable_fuzz: enableFuzz,
      enable_short_term: true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m'],
      maximum_interval: 36500,
    }),
  );
}

export const ankiScheduler = createAnkiScheduler();

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** SM-2 ease (permille, 1300–~3000+) → FSRS difficulty (1 easy … 10 hard). */
export function difficultyFromEase(factor: number): number {
  if (!factor) return 5;
  return clamp(10 - ((factor - 1300) * 7) / 1700, 1, 10);
}

function parseData(data: string): { s?: number; d?: number; pos?: number } {
  if (!data) return {};
  try {
    const v = JSON.parse(data) as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
    return { s: num(v.s), d: num(v.d), pos: num(v.pos) };
  } catch {
    return {};
  }
}

/**
 * Convert an Anki card's scheduling into FSRS state.
 * - Uses Anki's own FSRS memory state (card.data s/d) when the user had FSRS on.
 * - Otherwise estimates it from SM-2: stability ≈ current interval (at 90% retention
 *   FSRS's interval equals stability), difficulty from ease.
 * Review due dates are days since collection creation; intraday learning dues are epoch seconds.
 */
export function convertAnkiCard(c: AnkiCardRow, crtSec: number, now: number): AnkiSched {
  const filtered = c.odid !== 0; // card is temporarily in a filtered deck: real values are in odue
  const due = filtered && c.odue ? c.odue : c.due;
  const data = parseData(c.data);
  const suspended = c.queue === -1 ? 1 : 0;
  const dayDue = (d: number) => crtSec * 1000 + d * DAY;
  const base = { reps: c.reps, lapses: c.lapses, suspended, learning_steps: 0 };

  const asNew = (): AnkiSched => ({
    ...base,
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    state: State.New,
    last_review: null,
    new_position: data.pos ?? (c.type === 0 ? due : 0),
  });

  if (c.type === 0) return asNew();

  const difficulty = clamp(data.d ?? difficultyFromEase(c.factor), 1, 10);

  if (c.type === 2) {
    const dueMs = dayDue(due);
    const ivl = Math.max(1, c.ivl);
    const lastReview = dueMs - ivl * DAY;
    return {
      ...base,
      due: dueMs,
      stability: Math.max(0.1, data.s ?? ivl),
      difficulty,
      elapsed_days: Math.max(0, Math.floor((now - lastReview) / DAY)),
      scheduled_days: ivl,
      state: State.Review,
      last_review: lastReview,
      new_position: 0,
    };
  }

  // Learning (1) / relearning (3). queue 1 = intraday (epoch seconds), queue 3 = day-based.
  const dueMs = c.queue === 3 || (c.queue !== 1 && due < 1e8) ? dayDue(due) : due * 1000;
  if (c.type === 1 && data.s === undefined) return { ...asNew(), due: Math.min(dueMs, now) }; // mid-first-learning: restart steps
  return {
    ...base,
    due: dueMs,
    stability: Math.max(0.1, data.s ?? Math.max(1, c.ivl)),
    difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    state: c.type === 3 ? State.Relearning : State.Learning,
    last_review: Math.min(dueMs, now),
    new_position: 0,
  };
}

/** Anki revlog rows worth keeping as history: real answers only (not manual reschedules). */
export function convertRevlog(r: AnkiRevlogRow): { reviewed_at: number; rating: Grade; duration_ms: number; prev_state: State } | null {
  if (r.ease < 1 || r.ease > 4 || r.type === 4 || r.type === 5) return null;
  const prev_state = r.type === 0 ? State.New : r.type === 2 ? State.Relearning : State.Review;
  return { reviewed_at: r.id, rating: r.ease as Grade, duration_ms: r.time, prev_state };
}

function toCard(s: AnkiSched): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review == null ? undefined : new Date(s.last_review),
  };
}

function fromCard(c: Card, base: AnkiSched): AnkiSched {
  return {
    ...base,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : null,
  };
}

export const GRADES: { rating: Grade; label: string }[] = [
  { rating: Rating.Again, label: 'Again' },
  { rating: Rating.Hard, label: 'Hard' },
  { rating: Rating.Good, label: 'Good' },
  { rating: Rating.Easy, label: 'Easy' },
];

/** The next state for every button, for showing intervals on the buttons and applying the choice. */
export function previewGrades(s: AnkiSched, now: number, scheduler: FSRS = ankiScheduler): Record<Grade, AnkiSched> {
  const preview = scheduler.repeat(toCard(s), new Date(now));
  const out = {} as Record<Grade, AnkiSched>;
  for (const { rating } of GRADES) out[rating] = fromCard(preview[rating].card, s);
  return out;
}

/** "1m", "10m", "3h", "4d", "2.1mo", "1.3y" — like Anki's button labels. */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min}m`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1).replace(/\.0$/, '')}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
}
