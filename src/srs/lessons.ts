import type { GrammarPoint } from '../content/types';
import { startOfLocalDay } from '../stats/dates';

export function lessonsLearnedToday(learnedAt: readonly number[], now: number): number {
  const start = startOfLocalDay(now);
  return learnedAt.filter((t) => t >= start).length;
}

/**
 * Today's lesson: the next unlearned points in curriculum order (content is ordered
 * N5 → N1, simplest first), as many as are left of the daily goal.
 */
export function nextLessonBatch(
  curriculum: readonly GrammarPoint[],
  learnedIds: ReadonlySet<string>,
  learnedToday: number,
  dailyGoal: number,
): GrammarPoint[] {
  const size = Math.max(0, dailyGoal - learnedToday);
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
