import { dayKey, previousDay } from './dates';

/**
 * Consecutive local days on which at least one daily goal was reached (`goalDays` are
 * dayKey strings, see goal_days). A streak is still alive if today has no goal yet but
 * yesterday did.
 */
export function computeStreak(goalDays: Iterable<string>, now: number): { days: number; goalMetToday: boolean } {
  const days = new Set(goalDays);
  const goalMetToday = days.has(dayKey(now));
  let cursor = goalMetToday ? now : previousDay(now);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count++;
    cursor = previousDay(cursor);
  }
  return { days: count, goalMetToday };
}
