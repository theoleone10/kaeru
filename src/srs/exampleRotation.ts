import type { Example } from '../content/types';
import type { Rng } from './queue';

export interface ExampleSeen {
  example_id: string;
  times_shown: number;
  last_shown_at: number | null;
}

/**
 * Pick the sentence for a review so the user can't memorise one sentence:
 * never repeat the most recently shown sentence (when there is a choice), then
 * prefer never-shown sentences, then the least recently shown. Ties are random.
 */
export function pickExample(
  examples: readonly Example[],
  seen: ReadonlyMap<string, ExampleSeen>,
  rng: Rng = Math.random,
): Example {
  if (examples.length === 0) throw new Error('Grammar point has no examples');
  if (examples.length === 1) return examples[0];

  const lastShownAt = (e: Example) => seen.get(e.id)?.last_shown_at ?? null;
  let mostRecent: Example | null = null;
  for (const e of examples) {
    const t = lastShownAt(e);
    if (t !== null && (mostRecent === null || t > (lastShownAt(mostRecent) ?? -Infinity))) mostRecent = e;
  }
  const candidates = examples.filter((e) => e !== mostRecent);

  // Never-shown first (null sorts as oldest), then oldest shown.
  const key = (e: Example) => lastShownAt(e) ?? -Infinity;
  const oldest = Math.min(...candidates.map(key));
  const best = candidates.filter((e) => key(e) === oldest);
  return best[Math.floor(rng() * best.length)];
}
