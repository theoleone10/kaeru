import { dailyPlan, type DayState } from '@/daily/plan';
import { sanitizeSettings } from '@/state/settings';
import { DEFAULT_TIME_GOALS, dailyPracticeMinutes, goalPeriodKey, goalsToCelebrate, daysLeftInWeek, goalActiveOn, goalDoneMs, goalWindow, repeatLabel, sanitizeTimeGoals, withDailyPractice } from '@/time/goals';
import type { TimeEntry } from '@/time/model';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// Wednesday 15 October 2025, 18:00 local.
const WED = new Date(2025, 9, 15, 18).getTime();
const at = (d: number, h: number) => new Date(2025, 9, d, h).getTime();
const entry = (id: number, activity: number, from: number, to: number | null): TimeEntry => ({ id, activity_id: activity, started_at: from, ended_at: to, note: '', source: 'timer' });

const IMMERSION = 1;
const STUDY = 2;
const entries = [
  entry(1, IMMERSION, at(13, 9), at(13, 10)), // Monday
  entry(2, STUDY, at(14, 9), at(14, 9) + 30 * MIN), // Tuesday
  entry(3, IMMERSION, at(15, 8), at(15, 8) + 45 * MIN), // today
  entry(4, IMMERSION, at(12, 9), at(12, 11)), // last Sunday: not this week
  entry(5, STUDY, WED - 20 * MIN, null), // running now
];

describe('time goals', () => {
  it('counts an activity for today or for the week (Monday to Sunday)', () => {
    expect(goalDoneMs({ activityId: IMMERSION, period: 'day' }, entries, WED)).toBe(45 * MIN);
    expect(goalDoneMs({ activityId: IMMERSION, period: 'week' }, entries, WED)).toBe(HOUR + 45 * MIN);
    expect(goalDoneMs({ activityId: STUDY, period: 'week' }, entries, WED)).toBe(50 * MIN);
    expect(goalDoneMs({ activityId: null, period: 'week' }, entries, WED)).toBe(2 * HOUR + 35 * MIN);
    expect(goalDoneMs({ activityId: null, period: 'day' }, entries, WED)).toBe(65 * MIN);
  });

  it('knows the week window and days left', () => {
    expect(goalWindow('week', WED)).toEqual({ from: at(13, 0), to: at(20, 0) });
    expect(daysLeftInWeek(at(13, 12))).toBe(7);
    expect(daysLeftInWeek(WED)).toBe(5);
    expect(daysLeftInWeek(at(19, 23))).toBe(1);
  });

  it('drops malformed goals and clamps minutes', () => {
    expect(
      sanitizeTimeGoals([
        { id: 'a', activityId: 1, period: 'day', minutes: 30 },
        { id: 'b', activityId: null, period: 'week', minutes: 99999 },
        { id: 'c', activityId: 'x', period: 'day', minutes: 30 },
        { id: 'd', activityId: 1, period: 'month', minutes: 30 },
        { id: 'e', activityId: 1, period: 'day', minutes: 30, days: [5, 1, 3, 9] },
        { id: 'f', activityId: 1, period: 'day', minutes: 30, days: [] },
        { id: 'g', activityId: 1, period: 'day', minutes: 30, days: [0, 1, 2, 3, 4, 5, 6] },
        null,
      ]),
    ).toEqual([
      { id: 'a', activityId: 1, period: 'day', minutes: 30 },
      { id: 'b', activityId: null, period: 'week', minutes: 7 * 24 * 60 },
      { id: 'e', activityId: 1, period: 'day', minutes: 30, days: [1, 3, 5] },
      { id: 'g', activityId: 1, period: 'day', minutes: 30 },
    ]);
    expect(sanitizeSettings({}).timeGoals).toEqual(DEFAULT_TIME_GOALS);
    expect(sanitizeSettings({ timeGoals: 'nope' }).timeGoals).toEqual(DEFAULT_TIME_GOALS);
  });

  it('turns the old single daily goal into a goal that can be deleted', () => {
    expect(sanitizeSettings({ dailyTimeGoalMin: 45 }).timeGoals).toEqual([{ id: 'daily', activityId: null, period: 'day', minutes: 45 }]);
    expect(sanitizeSettings({ dailyTimeGoalMin: 0 }).timeGoals).toEqual([]);
    // Goals saved before the old key was removed: the old goal joins them once.
    const study = { id: 's', activityId: 2, period: 'week', minutes: 300 };
    expect(sanitizeSettings({ dailyTimeGoalMin: 20, timeGoals: [study] }).timeGoals).toEqual([{ id: 'daily', activityId: null, period: 'day', minutes: 20 }, study]);
    // Once saved, the old key is gone and a deleted goal stays deleted.
    expect(sanitizeSettings({ timeGoals: [study] }).timeGoals).toEqual([study]);
    expect(sanitizeSettings({ timeGoals: [] }).timeGoals).toEqual([]);
  });

  it('applies custom days only on those days', () => {
    const mwf = { period: 'day' as const, days: [1, 3, 5] };
    expect(goalActiveOn(mwf, WED)).toBe(true);
    expect(goalActiveOn(mwf, at(14, 12))).toBe(false);
    expect(goalActiveOn({ period: 'week' }, at(14, 12))).toBe(true);
    expect(repeatLabel(mwf)).toBe('Mon, Wed, Fri');
    expect(repeatLabel({ period: 'day', days: [0, 6] })).toBe('Weekends');
    expect(repeatLabel({ period: 'day', days: [1, 2, 3, 4, 5] })).toBe('Weekdays');
    expect(repeatLabel({ period: 'day' })).toBe('Every day');
    expect(repeatLabel({ period: 'week' })).toBe('Every week');
    const goals = [{ id: 'x', activityId: null, ...mwf, minutes: 60 }];
    expect(dailyPracticeMinutes(goals, WED)).toBe(60);
    expect(dailyPracticeMinutes(goals, at(14, 12))).toBe(0);
  });

  it('sets or removes the every-day practice goal from onboarding', () => {
    expect(withDailyPractice(DEFAULT_TIME_GOALS, 60)).toEqual([{ ...DEFAULT_TIME_GOALS[0], minutes: 60 }]);
    expect(withDailyPractice(DEFAULT_TIME_GOALS, 0)).toEqual([]);
    expect(withDailyPractice([], 15)).toMatchObject([{ activityId: null, period: 'day', minutes: 15 }]);
  });

  it('adds each goal to the day plan as its own step', () => {
    const base: DayState = {
      newGoal: 2, learnedToday: 2, unlearned: 10, nextTitles: [], grammarCards: 0, grammarDue: 0, grammarReviewedToday: 0,
      decks: 0, cardsDue: 0, cardsReviewedToday: 0, timeGoals: [],
    };
    const plan = dailyPlan({
      ...base,
      timeGoals: [
        { id: 'i', activity: 'Immersion', period: 'day', goalMs: 30 * MIN, doneMs: 45 * MIN },
        { id: 's', activity: 'Study', period: 'week', goalMs: 5 * HOUR, doneMs: HOUR, daysLeft: 3 },
      ],
    });
    expect(plan.steps.map((s) => s.key)).toEqual(['learn', 'time:i', 'time:s']);
    const [, immersion, study] = plan.steps;
    expect(immersion).toMatchObject({ id: 'time', title: '30 minutes of Immersion', done: true, progress: 1 });
    expect(study).toMatchObject({ title: '5h 00m of Study this week', detail: '1h 00m of 5h 00m this week · 3 days left', done: false, progress: 0.2 });
    // The weekly goal isn't done, but it doesn't hold up the day.
    expect(plan.allDone).toBe(true);
  });
});

describe('weekly goals and the end of the day', () => {
  const base: DayState = {
    newGoal: 2, learnedToday: 2, unlearned: 10, nextTitles: [], grammarCards: 0, grammarDue: 0, grammarReviewedToday: 0,
    decks: 0, cardsDue: 0, cardsReviewedToday: 0, timeGoals: [],
  };
  const weekly = { id: 'w', activity: 'Study', period: 'week' as const, goalMs: 5 * HOUR, doneMs: HOUR, daysLeft: 3 };
  const daily = (doneMs: number) => ({ id: 'd', activity: null, period: 'day' as const, goalMs: 30 * MIN, doneMs });

  it('calls the day done when everything but an unfinished weekly goal is done', () => {
    const plan = dailyPlan({ ...base, timeGoals: [daily(30 * MIN), weekly] });
    expect(plan.allDone).toBe(true);
    expect(plan.next?.key).toBe('time:w');
    expect(plan.steps.find((s) => s.key === 'time:w')).toMatchObject({ done: false, weekly: true });
  });

  it('still waits for today’s steps, and suggests them before the weekly goal', () => {
    const plan = dailyPlan({ ...base, timeGoals: [weekly, daily(10 * MIN)] });
    expect(plan.allDone).toBe(false);
    expect(plan.next?.key).toBe('time:d');
  });

  it('needs the weekly goal when it is the only thing on the plan', () => {
    const only = { ...base, newGoal: 0, timeGoals: [weekly] };
    expect(dailyPlan(only).allDone).toBe(false);
    expect(dailyPlan({ ...only, timeGoals: [{ ...weekly, doneMs: 5 * HOUR }] }).allDone).toBe(true);
  });
});

describe('goal celebrations', () => {
  const goals = [
    { id: 'i', activityId: IMMERSION, period: 'day' as const, minutes: 30 },
    { id: 's', activityId: STUDY, period: 'week' as const, minutes: 40 },
    { id: 'a', activityId: null, period: 'day' as const, minutes: 120 },
    { id: 'mon', activityId: null, period: 'day' as const, days: [1], minutes: 1 },
  ];

  it('picks reached goals once per day or week', () => {
    expect(goalsToCelebrate(goals, entries, WED, {}).map((g) => g.id)).toEqual(['i', 's']);
    const seen = { i: goalPeriodKey(goals[0], WED), s: goalPeriodKey(goals[1], WED) };
    expect(seen).toEqual({ i: '2025-10-15', s: '2025-10-13' });
    expect(goalsToCelebrate(goals, entries, WED, seen)).toEqual([]);
    // Yesterday's celebration doesn't count for today.
    expect(goalsToCelebrate(goals, entries, WED, { ...seen, i: '2025-10-14' }).map((g) => g.id)).toEqual(['i']);
  });
});
