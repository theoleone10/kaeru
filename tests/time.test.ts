import {
  dailyTotals,
  entryDuration,
  formatClock,
  formatDuration,
  parseCsv,
  parseTimerCommand,
  parseTogglCsv,
  startOfWeek,
  totalsByActivity,
  trackingStreak,
  type TimeEntry,
} from '@/time/model';

// Tests run with TZ=UTC.
const H = 60 * 60 * 1000;
const DAY = 24 * H;
const MON = Date.UTC(2026, 8, 28); // Monday 28 Sep 2026

let nextId = 1;
const entry = (activity_id: number, start: number, end: number | null): TimeEntry => ({
  id: nextId++,
  activity_id,
  started_at: start,
  ended_at: end,
  note: '',
  source: 'timer',
});

describe('durations and totals', () => {
  it('counts a running entry up to now', () => {
    expect(entryDuration(entry(1, MON, null), MON + 90_000)).toBe(90_000);
  });

  it('splits an entry that crosses midnight between days', () => {
    const e = entry(1, MON + 23 * H, MON + DAY + 2 * H);
    const days = dailyTotals([e], 2, MON + DAY + 12 * H);
    expect(days.map((d) => d.total)).toEqual([H, 2 * H]);
  });

  it('totals per activity inside a window', () => {
    const entries = [entry(1, MON + H, MON + 2 * H), entry(2, MON + 3 * H, MON + 3.5 * H), entry(1, MON + 5 * H, MON + 5.25 * H)];
    const t = totalsByActivity(entries, MON, MON + DAY, MON + 12 * H);
    expect(t.get(1)).toBe(1.25 * H);
    expect(t.get(2)).toBe(0.5 * H);
  });

  it('weeks start on Monday', () => {
    expect(startOfWeek(MON + 3 * DAY + 5 * H)).toBe(MON);
    expect(startOfWeek(MON - H)).toBe(MON - 7 * DAY);
  });
});

describe('trackingStreak', () => {
  it('counts consecutive days ending today', () => {
    const now = MON + 2 * DAY + 20 * H;
    const entries = [entry(1, MON + 10 * H, MON + 11 * H), entry(1, MON + DAY + 10 * H, MON + DAY + 11 * H), entry(1, MON + 2 * DAY + 9 * H, MON + 2 * DAY + 10 * H)];
    expect(trackingStreak(entries, now)).toBe(3);
  });

  it('keeps yesterday’s streak alive until today ends', () => {
    const now = MON + DAY + 8 * H;
    expect(trackingStreak([entry(1, MON + 10 * H, MON + 11 * H)], now)).toBe(1);
  });

  it('breaks on a gap', () => {
    const now = MON + 3 * DAY + 20 * H;
    expect(trackingStreak([entry(1, MON + 10 * H, MON + 11 * H)], now)).toBe(0);
  });
});

describe('formatting', () => {
  it.each([
    [0, '0:00'],
    [65_000, '1:05'],
    [H + 5 * 60_000 + 9_000, '1:05:09'],
  ])('clock %d → %s', (ms, s) => expect(formatClock(ms)).toBe(s));

  it.each([
    [0, '0m'],
    [45 * 60_000, '45m'],
    [2 * H + 5 * 60_000, '2h 05m'],
  ])('duration %d → %s', (ms, s) => expect(formatDuration(ms)).toBe(s));
});

describe('parseTimerCommand', () => {
  it('parses start, stop and toggle links', () => {
    expect(parseTimerCommand('start', { activity: ' Study ', note: 'Genki ch.3' })).toEqual({ kind: 'start', activity: 'Study', note: 'Genki ch.3' });
    expect(parseTimerCommand('STOP', {})).toEqual({ kind: 'stop' });
    expect(parseTimerCommand('toggle', {})).toEqual({ kind: 'toggle', activity: 'Immersion', note: '' });
  });

  it('rejects unknown actions', () => {
    expect(parseTimerCommand('pause', {})).toBeNull();
    expect(parseTimerCommand(undefined, {})).toBeNull();
  });
});

describe('Toggl CSV import', () => {
  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('reads a Toggl detailed export', () => {
    const csv = [
      'User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags',
      'Me,me@x.com,,Immersion,,"Anime, subbed",No,2026-09-01,20:00:00,2026-09-01,21:30:00,01:30:00,',
      'Me,me@x.com,,,,Study,No,2026-09-02,23:30:00,2026-09-03,00:15:00,00:45:00,',
      'Me,me@x.com,,Broken,,,No,2026-09-02,10:00:00,2026-09-02,09:00:00,00:00:00,',
    ].join('\n');
    const out = parseTogglCsv(csv);
    expect(out).toEqual([
      { activity: 'Immersion', started_at: Date.UTC(2026, 8, 1, 20), ended_at: Date.UTC(2026, 8, 1, 21, 30), note: 'Anime, subbed' },
      { activity: 'Study', started_at: Date.UTC(2026, 8, 2, 23, 30), ended_at: Date.UTC(2026, 8, 3, 0, 15), note: '' },
    ]);
  });

  it('explains a file that is not a Toggl export', () => {
    expect(() => parseTogglCsv('name,value\na,1')).toThrow('Toggl');
  });
});
