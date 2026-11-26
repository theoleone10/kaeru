import { bucketRange, countInBuckets, MAX_BARS, rangeLabel, resolveRange } from '@/stats/range';

const day = (m: number, d: number, h = 0, y = 2026) => +new Date(y, m, d, h);
const now = day(10, 26, 15); // Thu Nov 26 2026, 3pm

describe('resolveRange', () => {
  it('ends every preset at the end of today', () => {
    for (const p of ['7d', '30d', '90d', '1y', 'all'] as const) expect(resolveRange(p, now).to).toBe(day(10, 27));
  });

  it('counts today as one of the days', () => {
    expect(resolveRange('7d', now).from).toBe(day(10, 20));
    expect(resolveRange('30d', now).from).toBe(day(9, 28));
    expect(resolveRange('1y', now).from).toBe(day(10, 27, 0, 2025));
  });

  it('starts "all" at the earliest record, or today when there is none', () => {
    expect(resolveRange('all', now, { earliest: day(2, 3, 9) }).from).toBe(day(2, 3));
    expect(resolveRange('all', now).from).toBe(day(10, 26));
  });

  it('covers whole custom days, in either order', () => {
    expect(resolveRange('custom', now, { custom: { from: day(10, 10, 18), to: day(10, 1, 7) } })).toEqual({ from: day(10, 1), to: day(10, 11) });
  });
});

describe('bucketRange', () => {
  it('uses one bar a day for a week or two', () => {
    const r = bucketRange(resolveRange('7d', now));
    expect(r.unit).toBe('day');
    expect(r.buckets.map((b) => b.start)).toEqual([20, 21, 22, 23, 24, 25, 26].map((d) => day(10, d)));
  });

  it('switches to weeks, clipped to the range', () => {
    const r = bucketRange(resolveRange('30d', now));
    expect(r.unit).toBe('week');
    expect(r.buckets[0]).toEqual({ start: day(9, 28), end: day(10, 2) }); // Oct 28 (Wed) to Mon Nov 2
    expect(r.buckets[r.buckets.length - 1]).toEqual({ start: day(10, 23), end: day(10, 27) });
  });

  it('uses months for a year and wider buckets for longer histories', () => {
    expect(bucketRange(resolveRange('1y', now)).unit).toBe('month');
    expect(bucketRange(resolveRange('all', now, { earliest: day(0, 1, 0, 2024) })).unit).toBe('quarter');
    expect(bucketRange(resolveRange('all', now, { earliest: day(0, 1, 0, 2018) })).unit).toBe('year');
  });

  it('never shows more than MAX_BARS bars, with no gaps', () => {
    for (const p of ['7d', '30d', '90d', '1y'] as const) {
      const { buckets } = bucketRange(resolveRange(p, now));
      expect(buckets.length).toBeLessThanOrEqual(MAX_BARS);
      buckets.slice(1).forEach((b, i) => expect(b.start).toBe(buckets[i].end));
    }
  });
});

describe('countInBuckets', () => {
  it('counts times in their bucket and ignores the rest', () => {
    const { buckets } = bucketRange(resolveRange('7d', now));
    expect(countInBuckets([day(10, 19, 23), day(10, 20), day(10, 20, 12), day(10, 26, 14), day(10, 27)], buckets)).toEqual([2, 0, 0, 0, 0, 0, 1]);
  });
});

describe('rangeLabel', () => {
  it('names presets and custom ranges', () => {
    expect(rangeLabel('all', resolveRange('all', now))).toBe('all time');
    const custom = rangeLabel('custom', { from: day(10, 1), to: day(10, 11) });
    expect(custom).toContain('–');
  });
});
