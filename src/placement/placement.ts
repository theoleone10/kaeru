import { curriculum } from '../content/loader';
import { LEVELS, type Example, type GrammarPoint } from '../content/types';
import { stationOf, unitsFor, type Unit } from '../content/units';
import { shuffle, type Rng } from '../srs/queue';

/*
 * The placement quiz at sign-up: finds where on the grammar lines someone should start.
 *
 * Every unit of every level, N5 Unit 1 to the end of N1, is one step on a single track. Like a
 * binary search, it asks about the unit halfway between the last one known and the first one
 * not known, so ~55 units take about six units' worth of questions. A unit is known when both
 * sentences asked from it are right; one of two gets a tie-breaker. Then everything before the
 * first unit not known is marked as known, and that unit is where the learner starts.
 */

/** "I don't know" in the choices: honest answers place better than guesses. */
export const DONT_KNOW = '';

export interface PlacementQuestion {
  unit: number;
  point: GrammarPoint;
  example: Example;
  /** The blank's possible answers, shuffled; exactly one is accepted. */
  choices: string[];
}

export interface PlacementState {
  /** Every unit up to and including `lo` is known (-1: none yet). */
  lo: number;
  /** Units from `hi` on aren't known (units.length: none found yet). */
  hi: number;
  /** The unit being asked about, and its answers so far. */
  probe: number;
  answers: boolean[];
  /** Points already asked, so a tie-breaker uses another one. */
  asked: string[];
  questions: number;
}

export interface Placement {
  /** Index into placementUnits() of the unit to start at; units.length when all are known. */
  unit: number;
  /** Every point before it, to mark as known. */
  known: GrammarPoint[];
}

export function placementUnits(points: readonly GrammarPoint[] = curriculum): Unit[] {
  return LEVELS.flatMap((l) => unitsFor(l, points));
}

/** Where the first question goes, from what the learner says they know. */
export type Experience = 'some' | 'lots';

export function startPlacement(units: readonly Unit[], experience: Experience): PlacementState {
  // "Some": around the middle of N5. "Lots": the start of N4. The search moves from there.
  const n5 = units.filter((u) => u.level === 'N5').length;
  const probe = experience === 'some' ? Math.floor(n5 / 2) : Math.min(units.length - 1, n5);
  return { lo: -1, hi: units.length, probe: Math.max(0, probe), answers: [], asked: [], questions: 0 };
}

export function isDone(s: PlacementState): boolean {
  return s.hi - s.lo <= 1;
}

/** Wrong answers for an example: other points' blanks of about the same length, never an accepted or valid answer. */
function distractors(example: Example, point: GrammarPoint, pool: readonly GrammarPoint[], rng: Rng): string[] {
  const right = new Set([...example.accepted_answers, ...(example.valid_alternatives ?? []).map((v) => v.answer)]);
  const len = example.cloze_target.length;
  const seen = new Set<string>();
  const near: string[] = [];
  const far: string[] = [];
  for (const p of shuffle(pool, rng)) {
    if (p.id === point.id) continue;
    for (const e of p.examples) {
      const t = e.cloze_target;
      if (right.has(t) || seen.has(t) || example.japanese.includes(t)) continue;
      seen.add(t);
      (Math.abs(t.length - len) <= 1 ? near : far).push(t);
      break;
    }
  }
  return [...near, ...far].slice(0, 3);
}

/** The next question, or null when the placement is decided. */
export function nextQuestion(s: PlacementState, units: readonly Unit[], rng: Rng = Math.random): PlacementQuestion | null {
  if (isDone(s)) return null;
  const unit = units[s.probe];
  const fresh = unit.stations.map((st) => st.point).filter((p) => !s.asked.includes(p.id) && p.examples.length > 0);
  const point = shuffle(fresh.length ? fresh : unit.stations.map((st) => st.point), rng)[0];
  const example = shuffle(point.examples, rng)[0];
  const pool = curriculum.filter((p) => p.level === point.level);
  const choices = shuffle([example.cloze_target, ...distractors(example, point, pool, rng)], rng);
  return { unit: s.probe, point, example, choices };
}

export function isCorrect(q: Pick<PlacementQuestion, 'example'>, choice: string): boolean {
  return choice !== DONT_KNOW && q.example.accepted_answers.includes(choice);
}

/** Record an answer; moves on to another unit once this one is decided. */
export function answer(s: PlacementState, q: PlacementQuestion, choice: string): PlacementState {
  const answers = [...s.answers, isCorrect(q, choice)];
  const next = { ...s, answers, asked: [...s.asked, q.point.id], questions: s.questions + 1 };
  const right = answers.filter(Boolean).length;
  const wrong = answers.length - right;
  // Two right: known. Two wrong: not known. One each: a third sentence decides.
  if (right < 2 && wrong < 2) return next;
  const lo = right >= 2 ? s.probe : s.lo;
  const hi = right >= 2 ? s.hi : s.probe;
  return { ...next, lo, hi, probe: Math.floor((lo + hi) / 2) === lo ? lo + 1 : Math.floor((lo + hi) / 2), answers: [] };
}

export function result(s: PlacementState, units: readonly Unit[]): Placement {
  const unit = Math.max(0, Math.min(units.length, s.lo + 1));
  return { unit, known: units.slice(0, unit).flatMap((u) => u.stations.map((st) => st.point)) };
}

/** "N4 Unit 3 · N4-17": where a placement starts, for the result screen. */
export function describeStart(p: Placement, units: readonly Unit[]): { title: string; station: string | null } {
  const u = units[p.unit];
  if (!u) return { title: 'You know it all!', station: null };
  const first = stationOf(u.stations[0].point.id);
  return { title: `${u.level} Unit ${u.number}`, station: first ? `${u.level}-${String(first.number).padStart(2, '0')}` : null };
}
