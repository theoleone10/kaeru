import { State, type StoredCard } from './scheduler';

/** Learning/relearning cards due within this window are pulled forward when nothing else is due. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

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

/**
 * Build a review queue: everything due now, learning cards first, the rest shuffled so
 * the order itself can't become a cue. If nothing is due, pull in (re)learning cards due
 * within the learn-ahead window so a short session can finish its misses.
 * `onlyIds` restricts the queue (used by the post-lesson quiz).
 */
export function buildQueue(
  cards: readonly StoredCard[],
  now: number,
  { onlyIds, rng = Math.random }: { onlyIds?: ReadonlySet<string>; rng?: Rng } = {},
): StoredCard[] {
  const pool = cards.filter((c) => !c.suspended && (!onlyIds || onlyIds.has(c.grammar_id)));
  const due = pool.filter((c) => c.due <= now);
  if (due.length > 0) {
    const learning = due.filter((c) => c.state === State.Learning || c.state === State.Relearning);
    const rest = due.filter((c) => c.state !== State.Learning && c.state !== State.Relearning);
    return [...shuffle(learning, rng), ...shuffle(rest, rng)];
  }
  return pool
    .filter((c) => (c.state === State.Learning || c.state === State.Relearning) && c.due <= now + LEARN_AHEAD_MS)
    .sort((a, b) => a.due - b.due);
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
