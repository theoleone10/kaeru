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
 * Desired retention: the chance of still remembering a card when it comes due. Higher means
 * shorter intervals and more reviews. FSRS-6's default parameters are fitted to Anki users at
 * large, and at Anki's 90% they space a card answered Good 2d → 11d → 46d → 5mo; 92% gives
 * 2d → 8d → 28d → 3mo, a little firmer for a new learner. Settings can move it (80–97%).
 */
export const DEFAULT_RETENTION = 0.92;

/** Anki-style FSRS-6: four buttons, 1m/10m learning steps, 10m relearning step. */
export function createAnkiScheduler(enableFuzz = true, retention = DEFAULT_RETENTION): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: retention,
      enable_fuzz: enableFuzz,
      enable_short_term: true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m'],
      maximum_interval: 36500,
    }),
  );
}

export const ankiScheduler = createAnkiScheduler();

const byRetention = new Map<number, FSRS>([[DEFAULT_RETENTION, ankiScheduler]]);

/** The scheduler for a desired retention (0–1), made once per value. */
export function schedulerFor(retention: number): FSRS {
  let s = byRetention.get(retention);
  if (!s) byRetention.set(retention, (s = createAnkiScheduler(true, retention)));
  return s;
}

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

/** FSRS difficulty → SM-2 ease (permille): the inverse of difficultyFromEase. */
export function easeFromDifficulty(difficulty: number): number {
  return Math.round(1300 + ((10 - clamp(difficulty, 1, 10)) * 1700) / 7);
}

/** An Anki `cards` row's scheduling columns. */
export interface AnkiCardSched {
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  left: number;
  data: string;
}

/**
 * The inverse of convertAnkiCard, for exporting: FSRS state → Anki's columns, with the
 * memory state in card.data so Anki (with FSRS on) picks up exactly where this app left off.
 * `crtSec` is the exported collection's creation time; review dues are days from it.
 */
export function toAnkiCard(s: AnkiSched, crtSec: number, now: number): AnkiCardSched {
  const day = (ms: number) => Math.floor((ms - crtSec * 1000) / DAY);
  // s/d: FSRS memory state; lrt: last review (unix seconds), which newer Anki keeps alongside it.
  const memory = JSON.stringify({
    s: Math.round(s.stability * 10000) / 10000,
    d: Math.round(s.difficulty * 10000) / 10000,
    ...(s.last_review ? { lrt: Math.floor(s.last_review / 1000) } : {}),
  });
  const queueOr = (q: number) => (s.suspended ? -1 : q);
  if (s.state === State.New) {
    return { type: 0, queue: queueOr(0), due: s.new_position, ivl: 0, factor: 0, left: 0, data: '' };
  }
  const factor = easeFromDifficulty(s.difficulty);
  if (s.state === State.Review) {
    return { type: 2, queue: queueOr(2), due: day(s.due), ivl: Math.max(1, s.scheduled_days), factor, left: 0, data: memory };
  }
  // (Re)learning: intraday steps are due as epoch seconds; anything a day or more away by day number.
  const intraday = s.due - now < DAY;
  return {
    type: s.state === State.Relearning ? 3 : 1,
    queue: queueOr(intraday ? 1 : 3),
    due: intraday ? Math.floor(s.due / 1000) : day(s.due),
    ivl: s.state === State.Relearning ? Math.max(1, Math.round(s.stability)) : 0,
    factor,
    left: 1001,
    data: memory,
  };
}

/** Kaeru review history → Anki revlog type (0 learn, 1 review, 2 relearn). */
export function ankiRevlogType(prevState: number): number {
  return prevState === State.Review ? 1 : prevState === State.Relearning ? 2 : 0;
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
