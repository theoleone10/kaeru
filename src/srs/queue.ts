import { startOfLocalDay, startOfNextLocalDay } from '../stats/dates';
import type { StoredCard } from './scheduler';

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function isDue(card: StoredCard, now: number): boolean {
  return !card.suspended && card.due <= now;
}

export interface DailyReviews {
  /** Today's reviews still to do: fresh ones (shuffled), then today's misses in the order they were missed. */
  queue: StoredCard[];
  /** Cards reviewed today and finished (scheduled for another day). */
  done: number;
  /** Cards due today held back by the daily maximum. */
  held: number;
}

/**
 * Today's grammar reviews, Anki-style: the set is fixed for the day. It's every card due
 * before midnight, up to `maxPerDay` (most overdue first). A miss stays in today's set
 * (its short relearning step keeps it due today) until it's answered right. Points
 * learned today aren't in it: their first review is tomorrow.
 * `onlyIds` restricts it to some points.
 */
export function todaysReviews(
  cards: readonly StoredCard[],
  now: number,
  { maxPerDay, onlyIds, rng = Math.random }: { maxPerDay: number; onlyIds?: ReadonlySet<string>; rng?: Rng },
): DailyReviews {
  const dayStart = startOfLocalDay(now);
  const dayEnd = startOfNextLocalDay(now);
  const pool = cards.filter((c) => !c.suspended && c.learned_at < dayStart && (!onlyIds || onlyIds.has(c.grammar_id)));
  const touched = (c: StoredCard) => c.last_review != null && c.last_review >= dayStart;
  const dueToday = pool.filter((c) => c.due < dayEnd);
  const misses = dueToday.filter(touched).sort((a, b) => a.last_review! - b.last_review!);
  const fresh = dueToday.filter((c) => !touched(c)).sort((a, b) => a.due - b.due);
  const done = pool.filter((c) => touched(c) && c.due >= dayEnd).length;
  const slots = Math.max(0, maxPerDay - done - misses.length);
  const today = fresh.slice(0, slots);
  return { queue: [...shuffle(today, rng), ...misses], done, held: fresh.length - today.length };
}

/** How many grammar reviews are left today (what a session started now would hold). */
export function reviewCount(cards: readonly StoredCard[], now: number, maxPerDay: number): number {
  return todaysReviews(cards, now, { maxPerDay }).queue.length;
}

/** Earliest future due time among active cards, or null. */
export function nextDueAt(cards: readonly StoredCard[], now: number): number | null {
  let next: number | null = null;
  for (const c of cards) {
    if (c.suspended || c.due <= now) continue;
    if (next === null || c.due < next) next = c.due;
  }
  return next;
}
