import type { Example, GrammarPoint } from '../content/types';
import { startOfNextLocalDay } from '../stats/dates';
import { shuffle, type Rng } from './queue';
import { gradeCard, newCard, type StoredCard, type StoredLog } from './scheduler';

/** Sentences asked per grammar point in the post-lesson quiz. */
export const QUIZ_PER_POINT = 3;

export interface QuizItem {
  point: GrammarPoint;
  example: Example;
  /** A second go at a sentence missed earlier in the quiz (doesn't count toward the score). */
  retry?: boolean;
}

export interface QuizAnswer {
  pointId: string;
  exampleId: string;
  correct: boolean;
  retry: boolean;
  at: number;
}

/**
 * A short quiz on freshly learned points: a few different sentences per point, in rounds
 * (one sentence of each point per round) so the same point is never asked twice in a row
 * when there's more than one.
 */
export function buildQuiz(points: readonly GrammarPoint[], rng: Rng = Math.random, perPoint = QUIZ_PER_POINT): QuizItem[] {
  const picks = points.map((p) => shuffle(p.examples, rng).slice(0, perPoint).map((example) => ({ point: p, example })));
  const rounds = Math.max(0, ...picks.map((p) => p.length));
  const out: QuizItem[] = [];
  for (let r = 0; r < rounds; r++) {
    const round = shuffle(
      picks.flatMap((p) => (p[r] ? [p[r]] : [])),
      rng,
    );
    // Don't start a round with the point that ended the previous one.
    if (round.length > 1 && out.length > 0 && round[0].point.id === out[out.length - 1].point.id) {
      [round[0], round[1]] = [round[1], round[0]];
    }
    out.push(...round);
  }
  return out;
}

export interface PointResult {
  asked: number;
  correct: number;
  passed: boolean;
}

/**
 * Score per point from first attempts only. A point passes with at most one miss in
 * three (none when fewer sentences were asked): it enters reviews on a normal interval.
 * A point that didn't pass enters reviews in learning, so it comes back within minutes.
 */
export function scoreQuiz(pointIds: readonly string[], answers: readonly QuizAnswer[]): Map<string, PointResult> {
  const out = new Map<string, PointResult>();
  for (const id of pointIds) {
    const first = answers.filter((a) => a.pointId === id && !a.retry);
    const correct = first.filter((a) => a.correct).length;
    const misses = first.length - correct;
    out.set(id, { asked: first.length, correct, passed: first.length > 0 && misses <= Math.floor(first.length / 3) });
  }
  return out;
}

/**
 * The SRS entry for each quizzed point: a new card graded once with the quiz result
 * (Good if passed, Again if not), logged against the last sentence asked. The lesson and
 * quiz are today's practice, so the first review is tomorrow at the earliest.
 */
export function cardsFromQuiz(
  points: readonly GrammarPoint[],
  answers: readonly QuizAnswer[],
  now: number,
): { card: StoredCard; log: StoredLog; passed: boolean }[] {
  const scores = scoreQuiz(
    points.map((p) => p.id),
    answers,
  );
  return points.map((p) => {
    const passed = scores.get(p.id)?.passed ?? false;
    const mine = answers.filter((a) => a.pointId === p.id);
    const last = mine[mine.length - 1];
    const graded = gradeCard({
      card: newCard(p.id, p.level, now),
      correct: passed,
      now,
      exampleId: last?.exampleId ?? p.examples[0].id,
      answer: 'quiz',
    });
    const due = Math.max(graded.card.due, startOfNextLocalDay(now));
    return { card: { ...graded.card, due }, log: graded.log, passed };
  });
}
