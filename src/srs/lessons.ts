import type { GrammarPoint } from '../content/types';
import { startOfLocalDay } from '../stats/dates';

export interface LessonLimits {
  batchSize: number;
  dailyLimit: number;
}

export function lessonsLearnedToday(learnedAt: readonly number[], now: number): number {
  const start = startOfLocalDay(now);
  return learnedAt.filter((t) => t >= start).length;
}

/**
 * Next lesson batch: unlearned points in curriculum order (content is ordered N5 → N1,
 * simplest first), capped by batch size and what is left of today's limit.
 */
export function nextLessonBatch(
  curriculum: readonly GrammarPoint[],
  learnedIds: ReadonlySet<string>,
  learnedToday: number,
  { batchSize, dailyLimit }: LessonLimits,
): GrammarPoint[] {
  const remainingToday = Math.max(0, dailyLimit - learnedToday);
  const size = Math.min(batchSize, remainingToday);
  if (size === 0) return [];
  return curriculum.filter((p) => !learnedIds.has(p.id)).slice(0, size);
}

export function availableLessonCount(
  curriculum: readonly GrammarPoint[],
  learnedIds: ReadonlySet<string>,
  learnedToday: number,
  dailyLimit: number,
): number {
  const unlearned = curriculum.filter((p) => !learnedIds.has(p.id)).length;
  return Math.min(unlearned, Math.max(0, dailyLimit - learnedToday));
}
