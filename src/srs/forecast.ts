import { startOfLocalDay } from '../stats/dates';

export interface ForecastBucket {
  /** Local midnight starting the day (unix ms). */
  start: number;
  count: number;
}

/**
 * Reviews becoming due over the next `days` days, one bucket per local calendar day.
 * Today's bucket also holds everything already overdue (like Anki's forecast).
 */
export function forecast(dueTimes: readonly number[], now: number, days = 30): ForecastBucket[] {
  const starts: number[] = [];
  const d = new Date(startOfLocalDay(now));
  for (let i = 0; i <= days; i++) {
    starts.push(d.getTime());
    d.setDate(d.getDate() + 1); // DST-safe: calendar days, not 24h steps
  }
  const buckets = starts.slice(0, days).map((start) => ({ start, count: 0 }));
  const end = starts[days];
  for (const due of dueTimes) {
    if (due >= end) continue;
    if (due < starts[1]) {
      buckets[0].count++;
      continue;
    }
    // Binary search for the day holding `due`.
    let lo = 1;
    let hi = days - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= due) lo = mid;
      else hi = mid - 1;
    }
    buckets[lo].count++;
  }
  return buckets;
}
