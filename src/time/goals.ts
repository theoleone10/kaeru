import { overlap, startOfDay, startOfWeek, type TimeEntry } from './model';

export type GoalPeriod = 'day' | 'week';

/** A time goal: one activity (or all of them), per day, per week, or on chosen days of the week. */
export interface TimeGoal {
  id: string;
  /** null = every activity counts. */
  activityId: number | null;
  period: GoalPeriod;
  /** Daily goals only: the weekdays it applies on (0 = Sunday … 6 = Saturday). Missing = every day. */
  days?: number[];
  minutes: number;
}

/** Up to a full week of time. */
export const GOAL_MINUTES = { min: 1, max: 7 * 24 * 60 } as const;

/** New installs start with half an hour a day of anything. */
export const DEFAULT_TIME_GOALS: TimeGoal[] = [{ id: 'daily', activityId: null, period: 'day', minutes: 30 }];

const isEveryDayPractice = (g: TimeGoal) => g.activityId === null && g.period === 'day' && !g.days;

const clampMinutes = (n: number) => Math.min(GOAL_MINUTES.max, Math.max(GOAL_MINUTES.min, Math.round(n)));

/**
 * Keep only well-formed goals (settings come from storage, backups and other devices). Before
 * goals were a list there was one daily goal for all activities (`dailyTimeGoalMin`): while that
 * key is still stored (it's removed the first time goals are saved), it becomes the first goal.
 */
export function sanitizeTimeGoals(raw: unknown, legacyDailyMin?: unknown): TimeGoal[] {
  const legacy = typeof legacyDailyMin === 'number' && Number.isFinite(legacyDailyMin) ? legacyDailyMin : null;
  const goals = Array.isArray(raw) ? validGoals(raw) : legacy === null ? DEFAULT_TIME_GOALS : [];
  if (legacy === null || legacy <= 0 || goals.some(isEveryDayPractice)) return goals;
  return [{ ...DEFAULT_TIME_GOALS[0], minutes: clampMinutes(legacy) }, ...goals];
}

function validGoals(raw: unknown[]): TimeGoal[] {
  const out: TimeGoal[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const { id, activityId, period, minutes, days } = g as Record<string, unknown>;
    if (typeof id !== 'string' || (period !== 'day' && period !== 'week')) continue;
    if (activityId !== null && (typeof activityId !== 'number' || !Number.isInteger(activityId))) continue;
    if (typeof minutes !== 'number' || !Number.isFinite(minutes)) continue;
    const goal: TimeGoal = { id, activityId, period, minutes: clampMinutes(minutes) };
    if (period === 'day' && Array.isArray(days)) {
      const valid = [...new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      if (valid.length === 0) continue;
      if (valid.length < 7) goal.days = valid;
    }
    out.push(goal);
  }
  return out;
}

/** Whether a goal is on for the day containing `t` (weekly goals always are). */
export function goalActiveOn(goal: Pick<TimeGoal, 'period' | 'days'>, t: number): boolean {
  return goal.period === 'week' || !goal.days || goal.days.includes(new Date(t).getDay());
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday-first order for pickers and labels. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "Every day", "Every week", "Weekdays", "Weekends", "Mon, Wed, Fri". */
export function repeatLabel(goal: Pick<TimeGoal, 'period' | 'days'>): string {
  if (goal.period === 'week') return 'Every week';
  if (!goal.days) return 'Every day';
  const key = goal.days.join(',');
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  return WEEK_ORDER.filter((d) => goal.days!.includes(d))
    .map((d) => DAY_NAMES[d])
    .join(', ');
}

/** Start and end of the goal's current day or week (Monday to Monday). */
export function goalWindow(period: GoalPeriod, now: number): { from: number; to: number } {
  const from = period === 'day' ? startOfDay(now) : startOfWeek(now);
  const end = new Date(from);
  end.setDate(end.getDate() + (period === 'day' ? 1 : 7));
  return { from, to: end.getTime() };
}

/** Time counted toward the goal so far in its current day or week. */
export function goalDoneMs(goal: Pick<TimeGoal, 'activityId' | 'period'>, entries: TimeEntry[], now: number): number {
  const { from, to } = goalWindow(goal.period, now);
  let ms = 0;
  for (const e of entries) if (goal.activityId === null || e.activity_id === goal.activityId) ms += overlap(e, from, to, now);
  return ms;
}

/** Days left in the week, today included (Monday 7 … Sunday 1). */
export function daysLeftInWeek(now: number): number {
  return 7 - ((new Date(now).getDay() + 6) % 7);
}

/**
 * The daily practice goal for all activities that applies on `now`'s day, in minutes (0 = none).
 * Used where one daily number is needed: the "goal reached" sound and notification, the week
 * chart's goal line, and the streak on days without a lesson.
 */
export function dailyPracticeMinutes(goals: TimeGoal[], now: number): number {
  return goals.find((g) => g.activityId === null && g.period === 'day' && goalActiveOn(g, now))?.minutes ?? 0;
}


/** The every-day goal for all activities, in minutes (0 = none): what onboarding sets. */
export function everyDayPracticeMinutes(goals: TimeGoal[]): number {
  return goals.find(isEveryDayPractice)?.minutes ?? 0;
}

/** Set (or remove, with 0) the every-day goal for all activities, as onboarding does. */
export function withDailyPractice(goals: TimeGoal[], minutes: number): TimeGoal[] {
  const i = goals.findIndex(isEveryDayPractice);
  if (minutes <= 0) return i < 0 ? goals : goals.filter((_, j) => j !== i);
  if (i < 0) return [{ ...DEFAULT_TIME_GOALS[0], id: newGoalId(), minutes }, ...goals];
  return goals.map((g, j) => (j === i ? { ...g, minutes } : g));
}

export function newGoalId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Which period of a goal `now` falls in, e.g. "2025-10-15" (a day, or the Monday a week starts). */
export function goalPeriodKey(goal: Pick<TimeGoal, 'period'>, now: number): string {
  const d = new Date(goalWindow(goal.period, now).from);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Goals reached in their current day or week that haven't been celebrated yet. `celebrated`
 * maps goal id → the period it was last celebrated for, so each goal pops up once per period,
 * whenever the app next sees it (time can be logged from Shortcuts while the app is closed).
 */
export function goalsToCelebrate<G extends TimeGoal>(goals: G[], entries: TimeEntry[], now: number, celebrated: Record<string, string>): G[] {
  return goals.filter((g) => goalActiveOn(g, now) && celebrated[g.id] !== goalPeriodKey(g, now) && goalDoneMs(g, entries, now) >= g.minutes * 60 * 1000);
}
