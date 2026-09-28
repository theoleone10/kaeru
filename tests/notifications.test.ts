import { isQuietTime, moveOutOfQuietHours, planReminder, type ReminderSettings } from '@/notifications/plan';

// Tests run with TZ=UTC (see package.json), so local time == UTC here.
const at = (h: number, m = 0, day = 1) => Date.UTC(2026, 0, day, h, m);
const HOUR = 60 * 60 * 1000;
const settings: ReminderSettings = { enabled: true, quietStart: 22 * 60, quietEnd: 8 * 60, minGapHours: 4 };

describe('quiet hours', () => {
  it('handles windows that wrap past midnight', () => {
    expect(isQuietTime(at(23), 22 * 60, 8 * 60)).toBe(true);
    expect(isQuietTime(at(3), 22 * 60, 8 * 60)).toBe(true);
    expect(isQuietTime(at(8), 22 * 60, 8 * 60)).toBe(false);
    expect(isQuietTime(at(12), 22 * 60, 8 * 60)).toBe(false);
  });
  it('handles same-day windows', () => {
    expect(isQuietTime(at(13), 12 * 60, 14 * 60)).toBe(true);
    expect(isQuietTime(at(14), 12 * 60, 14 * 60)).toBe(false);
  });
  it('equal start and end means no quiet hours', () => {
    expect(isQuietTime(at(3), 0, 0)).toBe(false);
  });
  it('moves late-night times to the next morning and early-morning times to the same morning', () => {
    expect(moveOutOfQuietHours(at(23, 30), 22 * 60, 8 * 60)).toBe(at(8, 0, 2));
    expect(moveOutOfQuietHours(at(2), 22 * 60, 8 * 60)).toBe(at(8));
    expect(moveOutOfQuietHours(at(15), 22 * 60, 8 * 60)).toBe(at(15));
  });
});

describe('planReminder', () => {
  it('returns null when disabled or nothing is scheduled', () => {
    expect(planReminder({ dueTimes: [at(12)], now: at(10), lastNotifiedAt: null, settings: { ...settings, enabled: false } })).toBeNull();
    expect(planReminder({ dueTimes: [], now: at(10), lastNotifiedAt: null, settings })).toBeNull();
  });

  it('fires when the next review is due, counting everything due by then', () => {
    expect(planReminder({ dueTimes: [at(15), at(14), at(18)], now: at(10), lastNotifiedAt: null, settings })).toEqual({ at: at(14), count: 1 });
  });

  it('waits at least an hour if reviews are already due', () => {
    expect(planReminder({ dueTimes: [at(9), at(10, 30)], now: at(10), lastNotifiedAt: null, settings })).toEqual({ at: at(11), count: 2 });
  });

  it('respects the minimum gap since the last reminder', () => {
    const r = planReminder({ dueTimes: [at(14)], now: at(13), lastNotifiedAt: at(12), settings });
    expect(r?.at).toBe(at(12) + 4 * HOUR);
  });

  it('never fires during quiet hours', () => {
    const r = planReminder({ dueTimes: [at(23), at(2, 0, 2)], now: at(20), lastNotifiedAt: null, settings });
    expect(r).toEqual({ at: at(8, 0, 2), count: 2 });
  });

  it('applies the gap before pushing out of quiet hours', () => {
    const r = planReminder({ dueTimes: [at(19)], now: at(19), lastNotifiedAt: at(19), settings });
    expect(r?.at).toBe(at(8, 0, 2));
  });
});
