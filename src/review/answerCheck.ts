import type { Example } from '../content/types';
import { normalizeAnswer } from './normalize';

export type CheckResult =
  /** Matches an accepted answer. */
  | { kind: 'correct' }
  /** Grammatical, but not the grammar being tested — let the user retry. */
  | { kind: 'alternative'; note: string }
  /** Romaji spelling trap (wa/ha, e/he, o/wo) — let the user retry. */
  | { kind: 'kana-trap'; suggestion: string }
  /** Leftover romaji that could not become kana — let the user retry. */
  | { kind: 'unconverted' }
  /** Nothing typed — ignore the submit. */
  | { kind: 'empty' }
  | { kind: 'wrong' };

/** Results that give the user another attempt without grading. */
export function isRetry(result: CheckResult): boolean {
  return result.kind === 'alternative' || result.kind === 'kana-trap' || result.kind === 'unconverted';
}

// Typing the particle as it is pronounced gives the wrong kana.
const TRAPS: Record<string, string> = { わ: 'は', え: 'へ', お: 'を' };
const MAX_TRAP_POSITIONS = 6;

/** Every way of swapping pronounced-kana for particle-kana in `s` (excluding `s` itself). */
function trapVariants(s: string): string[] {
  const positions = [...s].flatMap((c, i) => (TRAPS[c] ? [i] : [])).slice(0, MAX_TRAP_POSITIONS);
  const chars = [...s];
  const out: string[] = [];
  for (let mask = 1; mask < 1 << positions.length; mask++) {
    const copy = [...chars];
    positions.forEach((pos, bit) => {
      if (mask & (1 << bit)) copy[pos] = TRAPS[copy[pos]];
    });
    out.push(copy.join(''));
  }
  return out;
}

export function checkAnswer(input: string, example: Pick<Example, 'accepted_answers' | 'valid_alternatives'>): CheckResult {
  const answer = normalizeAnswer(input);
  if (!answer) return { kind: 'empty' };

  const accepted = new Map(example.accepted_answers.map((a) => [normalizeAnswer(a), a]));
  if (accepted.has(answer)) return { kind: 'correct' };

  const alt = (example.valid_alternatives ?? []).find((a) => normalizeAnswer(a.answer) === answer);
  if (alt) return { kind: 'alternative', note: alt.note };

  if (/[a-z]/.test(answer)) return { kind: 'unconverted' };

  for (const variant of trapVariants(answer)) {
    const match = accepted.get(variant);
    if (match) return { kind: 'kana-trap', suggestion: match };
  }
  return { kind: 'wrong' };
}
