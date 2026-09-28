const HOUR = 60 * 60 * 1000;

export interface ForecastBucket {
  /** Start of the hour bucket (unix ms). */
  start: number;
  count: number;
}

/**
 * Reviews becoming due over the next `hours` hours, bucketed by clock hour.
 * Bucket 0 runs from `now` to the top of the next hour. Items already due are
 * reported separately as `dueNow`, not in the buckets.
 */
export function forecast(dueTimes: readonly number[], now: number, hours = 24): { dueNow: number; buckets: ForecastBucket[] } {
  const firstHourEnd = Math.floor(now / HOUR) * HOUR + HOUR;
  const buckets: ForecastBucket[] = Array.from({ length: hours }, (_, i) => ({
    start: i === 0 ? now : firstHourEnd + (i - 1) * HOUR,
    count: 0,
  }));
  const end = firstHourEnd + (hours - 1) * HOUR;
  let dueNow = 0;
  for (const due of dueTimes) {
    if (due <= now) {
      dueNow++;
    } else if (due < end) {
      const idx = due < firstHourEnd ? 0 : 1 + Math.floor((due - firstHourEnd) / HOUR);
      buckets[idx].count++;
    }
  }
  return { dueNow, buckets };
}
