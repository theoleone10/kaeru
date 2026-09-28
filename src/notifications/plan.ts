const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export interface ReminderSettings {
  enabled: boolean;
  /** Minutes after local midnight. Quiet hours may wrap past midnight (e.g. 22:00 → 08:00). */
  quietStart: number;
  quietEnd: number;
  /** Minimum hours between two reminders. */
  minGapHours: number;
}

/** Don't nag right after the user closes the app with reviews still pending. */
export const MIN_DELAY_FROM_NOW = HOUR;

function minuteOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

export function isQuietTime(ts: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false;
  const m = minuteOfDay(ts);
  return quietStart < quietEnd ? m >= quietStart && m < quietEnd : m >= quietStart || m < quietEnd;
}

/** If `ts` falls in quiet hours, move it to the end of that quiet period (local time). */
export function moveOutOfQuietHours(ts: number, quietStart: number, quietEnd: number): number {
  if (!isQuietTime(ts, quietStart, quietEnd)) return ts;
  const end = new Date(ts);
  end.setHours(Math.floor(quietEnd / 60), quietEnd % 60, 0, 0);
  if (end.getTime() <= ts) end.setDate(end.getDate() + 1);
  return end.getTime();
}

export interface PlanInput {
  /** Due times of all active cards. */
  dueTimes: readonly number[];
  now: number;
  /** When the last reminder was (or is assumed to have been) delivered. */
  lastNotifiedAt: number | null;
  settings: ReminderSettings;
}

export interface PlannedReminder {
  at: number;
  /** Reviews that will be due at that moment. */
  count: number;
}

/**
 * Decide when the single pending reminder should fire: when the next review is due,
 * but not sooner than an hour from now, not within `minGapHours` of the last one,
 * and never during quiet hours.
 */
export function planReminder({ dueTimes, now, lastNotifiedAt, settings }: PlanInput): PlannedReminder | null {
  if (!settings.enabled || dueTimes.length === 0) return null;
  const earliestDue = Math.min(...dueTimes);
  let at = Math.max(earliestDue, now + MIN_DELAY_FROM_NOW);
  if (lastNotifiedAt !== null) at = Math.max(at, lastNotifiedAt + settings.minGapHours * HOUR);
  at = moveOutOfQuietHours(at, settings.quietStart, settings.quietEnd);
  const count = dueTimes.filter((d) => d <= at).length;
  return { at, count };
}

export function formatMinuteOfDay(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
