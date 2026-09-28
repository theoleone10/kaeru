import { dayKey, previousDay } from './dates';

/**
 * Consecutive local days with at least one study activity (review or lesson).
 * A streak is still alive if today has no activity yet but yesterday did.
 */
export function computeStreak(activityTimes: readonly number[], now: number): { days: number; studiedToday: boolean } {
  const days = new Set(activityTimes.map(dayKey));
  const studiedToday = days.has(dayKey(now));
  let cursor = studiedToday ? now : previousDay(now);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count++;
    cursor = previousDay(cursor);
  }
  return { days: count, studiedToday };
}
