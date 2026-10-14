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

/**
 * A day only takes so many reviews, like the review queue: today's bucket becomes what is
 * actually left today (`todayLeft`, after the daily limit and what's done), and anything
 * over a day's limit waits for the next day, and so on down the month.
 */
export function applyDailyLimit(buckets: readonly ForecastBucket[], todayLeft: number, perDay: number): ForecastBucket[] {
  const out = buckets.map((b) => ({ ...b }));
  if (out.length === 0) return out;
  let carry = Math.max(0, out[0].count - todayLeft);
  out[0].count = Math.min(out[0].count, Math.max(0, todayLeft));
  for (let i = 1; i < out.length; i++) {
    const total = out[i].count + carry;
    out[i].count = Math.min(total, perDay);
    carry = total - out[i].count;
  }
  return out;
}

/** Day-by-day sum of forecasts over the same days. */
export function addForecasts(a: readonly ForecastBucket[], b: readonly ForecastBucket[]): ForecastBucket[] {
  return a.map((x, i) => ({ start: x.start, count: x.count + (b[i]?.count ?? 0) }));
}
