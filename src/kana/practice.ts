import { shuffle, type Rng } from '../srs/queue';
import { ALL_KANA, CONFUSABLE, type Kana, type KanaLesson, type Script } from './data';

/** "read": see the kana, pick its romaji. "find": see the romaji, pick the kana. */
export type Direction = 'read' | 'find';

export interface KanaQuestion {
  kana: string;
  romaji: string;
  script: Script;
  direction: Direction;
  /** What's shown: the kana for "read", the romaji for "find". */
  prompt: string;
  choices: string[];
  answer: string;
  /** A second go at one missed earlier (doesn't count toward the score). */
  retry?: boolean;
}

export interface KanaAnswer {
  kana: string;
  correct: boolean;
  retry: boolean;
  at: number;
}

/** Share of first tries that must be right to pass a lesson. */
export const PASS_SHARE = 0.8;
export const CHOICES = 4;

type CourseKana = (typeof ALL_KANA)[number];
const BY_KANA = new Map(ALL_KANA.map((k) => [k.kana, k]));

/**
 * Up to three wrong answers from `pool` (the kana taught so far): look-alikes first, so practice
 * trains the differences that matter, then the same lesson, then the rest, all in the same
 * script; anything else only if that's not enough. Never one that would also be right (じ and
 * ぢ are both "ji").
 */
export function distractors(target: CourseKana, direction: Direction, pool: readonly CourseKana[], rng: Rng): CourseKana[] {
  const same = (k: CourseKana) => k.script === target.script && k.kana !== target.kana && k.romaji !== target.romaji;
  const looks = new Set(CONFUSABLE.filter((g) => g.includes(target.kana)).flat());
  const inPool = new Set(pool.map((k) => k.kana));
  const tiers = [
    // Look-alikes matter when reading the kana and when finding it, but only ones already taught.
    shuffle(
      [...looks].map((c) => BY_KANA.get(c)).filter((k): k is CourseKana => !!k && same(k) && inPool.has(k.kana)),
      rng,
    ),
    shuffle(
      pool.filter((k) => same(k) && k.lesson === target.lesson),
      rng,
    ),
    shuffle(pool.filter(same), rng),
    shuffle(ALL_KANA.filter(same), rng),
  ];
  const out: CourseKana[] = [];
  const seen = new Set<string>();
  for (const tier of tiers) {
    for (const k of tier) {
      const key = direction === 'read' ? k.romaji : k.kana;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(k);
      if (out.length === CHOICES - 1) return out;
    }
  }
  return out;
}

export function question(k: Kana, direction: Direction, pool: readonly Kana[], rng: Rng = Math.random): KanaQuestion {
  const target = BY_KANA.get(k.kana)!;
  const poolCourse = pool.map((p) => BY_KANA.get(p.kana)).filter((p): p is CourseKana => !!p);
  const wrong = distractors(target, direction, poolCourse, rng);
  const pick = (x: CourseKana) => (direction === 'read' ? x.romaji : x.kana);
  return {
    kana: target.kana,
    romaji: target.romaji,
    script: target.script,
    direction,
    prompt: direction === 'read' ? target.kana : target.romaji,
    choices: shuffle([pick(target), ...wrong.map(pick)], rng),
    answer: pick(target),
  };
}

/** Avoid the same kana twice in a row where possible. */
function spread(qs: KanaQuestion[]): KanaQuestion[] {
  const out = [...qs];
  for (let i = 1; i < out.length; i++) {
    if (out[i].kana !== out[i - 1].kana) continue;
    const j = out.findIndex((q, idx) => idx > i && q.kana !== out[i - 1].kana && (idx + 1 >= out.length || out[idx + 1]?.kana !== out[i].kana));
    if (j > 0) [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Kana taught up to and including `lesson`, in its script. */
export function taughtBy(lesson: KanaLesson): Kana[] {
  const lessons = ALL_KANA.filter((k) => k.script === lesson.script);
  const last = lessons.map((k) => k.lesson).lastIndexOf(lesson.id);
  return lessons.slice(0, last + 1);
}

/** A lesson's practice: every kana read once and found once, mixed; wrong answers come from kana taught so far. */
export function lessonPractice(lesson: KanaLesson, rng: Rng = Math.random): KanaQuestion[] {
  const pool = taughtBy(lesson);
  const qs = lesson.kana.flatMap((k) => [question(k, 'read', pool, rng), question(k, 'find', pool, rng)]);
  return spread(shuffle(qs, rng));
}

export interface KanaStat {
  kana: string;
  correct: number;
  wrong: number;
  streak: number;
  last_at: number;
}

/**
 * Review across everything learned, weakest first: kana missed more than they're got right,
 * then ones on a short run of right answers, then ones not practised for longest.
 */
export function reviewPractice(learned: readonly Kana[], stats: ReadonlyMap<string, KanaStat>, count = 20, rng: Rng = Math.random): KanaQuestion[] {
  const weight = (k: Kana) => {
    const s = stats.get(k.kana);
    if (!s) return 3;
    return Math.max(0.2, 1 + s.wrong - 0.5 * s.correct + (s.streak < 3 ? 1.5 : 0));
  };
  const ranked = shuffle(learned, rng)
    .map((k) => ({ k, w: weight(k) + rng() * 0.5, at: stats.get(k.kana)?.last_at ?? 0 }))
    .sort((a, b) => b.w - a.w || a.at - b.at)
    .slice(0, count)
    .map((x) => x.k);
  const qs = ranked.map((k, i) => question(k, i % 2 === 0 ? 'read' : 'find', learned, rng));
  return spread(shuffle(qs, rng));
}

/** First tries only; retries don't count. */
export function scorePractice(answers: readonly KanaAnswer[]): { asked: number; correct: number; passed: boolean } {
  const first = answers.filter((a) => !a.retry);
  const correct = first.filter((a) => a.correct).length;
  return { asked: first.length, correct, passed: first.length > 0 && correct / first.length >= PASS_SHARE };
}

/** A missed question comes back a few questions later (once). */
export function requeueMissed(queue: KanaQuestion[], index: number, rng: Rng = Math.random): KanaQuestion[] {
  const q = queue[index];
  if (q.retry) return queue;
  const at = Math.min(queue.length, index + 3 + Math.floor(rng() * 3));
  const again = { ...q, retry: true, choices: shuffle(q.choices, rng) };
  return [...queue.slice(0, at), again, ...queue.slice(at)];
}
