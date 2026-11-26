import { startOfLocalDay, startOfNextLocalDay } from './dates';

/** The date ranges the Progress screen can show. */
export type RangePreset = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
];

/** Whole local days: `from` is the first day's midnight, `to` the midnight after the last day. */
export interface DateRange {
  from: number;
  to: number;
}

export type BucketUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface Bucket {
  start: number;
  /** exclusive */
  end: number;
}

/** Charts show at most this many bars; longer ranges use wider buckets. */
export const MAX_BARS = 14;

function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/**
 * The days a preset covers, ending today. `earliest` is the oldest thing on record (for "All");
 * `custom` is the user's own first and last day (in any order).
 */
export function resolveRange(
  preset: RangePreset,
  now: number,
  opts: { earliest?: number; custom?: { from: number; to: number } } = {},
): DateRange {
  const to = startOfNextLocalDay(now);
  const today = startOfLocalDay(now);
  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to };
    case '30d':
      return { from: addDays(today, -29), to };
    case '90d':
      return { from: addDays(today, -89), to };
    case '1y': {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      return { from: addDays(d.getTime(), 1), to };
    }
    case 'all':
      return { from: Math.min(today, startOfLocalDay(opts.earliest ?? now)), to };
    case 'custom': {
      const c = opts.custom ?? { from: now, to: now };
      const a = startOfLocalDay(Math.min(c.from, c.to));
      const b = startOfNextLocalDay(Math.max(c.from, c.to));
      return { from: a, to: b };
    }
  }
}

/** The bucket of `unit` that contains `t`. */
function unitStart(t: number, unit: BucketUnit): number {
  const d = new Date(startOfLocalDay(t));
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (unit === 'month' || unit === 'quarter' || unit === 'year') d.setDate(1);
  if (unit === 'quarter') d.setMonth(d.getMonth() - (d.getMonth() % 3));
  if (unit === 'year') d.setMonth(0);
  return d.getTime();
}

function nextUnit(t: number, unit: BucketUnit): number {
  const d = new Date(t);
  if (unit === 'day') d.setDate(d.getDate() + 1);
  if (unit === 'week') d.setDate(d.getDate() + 7);
  if (unit === 'month') d.setMonth(d.getMonth() + 1);
  if (unit === 'quarter') d.setMonth(d.getMonth() + 3);
  if (unit === 'year') d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}

function split(range: DateRange, unit: BucketUnit): Bucket[] {
  const out: Bucket[] = [];
  for (let s = unitStart(range.from, unit); s < range.to; s = nextUnit(s, unit)) {
    out.push({ start: Math.max(s, range.from), end: Math.min(nextUnit(s, unit), range.to) });
  }
  return out;
}

/** The range cut into the finest calendar buckets (days, weeks, months, quarters, years) that fit in MAX_BARS. */
export function bucketRange(range: DateRange): { unit: BucketUnit; buckets: Bucket[] } {
  const units: BucketUnit[] = ['day', 'week', 'month', 'quarter', 'year'];
  for (const unit of units) {
    const buckets = split(range, unit);
    if (buckets.length <= MAX_BARS || unit === 'year') return { unit, buckets };
  }
  throw new Error('unreachable');
}

/** How many of `times` fall in each bucket (buckets in order, no gaps). */
export function countInBuckets(times: number[], buckets: Bucket[]): number[] {
  const counts = buckets.map(() => 0);
  for (const t of times) {
    let lo = 0;
    let hi = buckets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < buckets[mid].start) hi = mid - 1;
      else if (t >= buckets[mid].end) lo = mid + 1;
      else {
        counts[mid]++;
        break;
      }
    }
  }
  return counts;
}

/** A short label under a bar. */
export function bucketLabel(b: Bucket, unit: BucketUnit, count: number): string {
  const d = new Date(b.start);
  switch (unit) {
    case 'day':
      return count <= 7 ? d.toLocaleDateString([], { weekday: 'short' }).slice(0, 2) : String(d.getDate());
    case 'week':
      return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
    case 'month':
      return d.toLocaleDateString([], { month: 'short' });
    case 'quarter':
      return `Q${Math.floor(d.getMonth() / 3) + 1}`;
    case 'year':
      return String(d.getFullYear());
  }
}

/** A fuller name for screen readers: "Week of Nov 24", "March 2026". */
export function bucketName(b: Bucket, unit: BucketUnit): string {
  const d = new Date(b.start);
  switch (unit) {
    case 'day':
      return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    case 'week':
      return `Week of ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    case 'month':
      return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
    case 'quarter':
      return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    case 'year':
      return String(d.getFullYear());
  }
}

/** "last 30 days", "all time", "Nov 1 – Nov 26". */
export function rangeLabel(preset: RangePreset, range: DateRange): string {
  switch (preset) {
    case '7d':
      return 'last 7 days';
    case '30d':
      return 'last 30 days';
    case '90d':
      return 'last 90 days';
    case '1y':
      return 'last year';
    case 'all':
      return 'all time';
    case 'custom': {
      const first = new Date(range.from);
      const last = new Date(addDays(range.to, -1));
      const sameYear = first.getFullYear() === last.getFullYear() && first.getFullYear() === new Date().getFullYear();
      const fmt = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
      return first.getTime() === last.getTime() ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
    }
  }
}
