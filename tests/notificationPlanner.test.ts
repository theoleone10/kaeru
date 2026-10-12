import { pick, reviewsMessage, streakMessage } from '@/notifications/messages';
import { MAX_PER_DAY, MIN_SPACING, planNotifications, streakMinute, studyHabit, type NotifyInput } from '@/notifications/planner';

// Tests run with TZ=UTC (see package.json), so local time == UTC here.
const at = (h: number, m = 0, day = 10) => Date.UTC(2026, 9, day, h, m);
const HOUR = 60 * 60 * 1000;
const hourOf = (t: number) => new Date(t).getUTCHours();
const dayOf = (t: number) => new Date(t).getUTCDate();

/** Studied at `h`:00 on each of the given days. */
const studied = (h: number, days: number[]) => days.map((d) => at(h, 0, d));

const base = (over: Partial<NotifyInput> = {}): NotifyInput => ({
  now: at(12),
  settings: {
    enabled: true,
    kinds: { reviews: true, streak: true, plan: true, wins: true },
    quietStart: 22 * 60,
    quietEnd: 8 * 60,
    minGapHours: 4,
    dailyNewGrammar: 2,
    timeGoalMs: 30 * 60 * 1000,
  },
  grammarDue: [],
  cardDue: [],
  activity: [],
  learnedToday: 0,
  unlearned: 100,
  timeTodayMs: 0,
  running: null,
  levelsJustFinished: [],
  lastReviewNotifiedAt: null,
  celebrated: {},
  ...over,
});

describe('studyHabit', () => {
  it('needs three days of history', () => {
    expect(studyHabit(studied(18, [8, 9]), at(12))).toEqual({ usualStart: null, usualEnd: null });
  });
  it('finds the usual start and end of a study day', () => {
    const activity = [...studied(18, [6, 7, 8, 9]), ...studied(19, [6, 7, 8, 9])];
    expect(studyHabit(activity, at(12))).toEqual({ usualStart: 18 * 60, usualEnd: 19 * 60 });
  });
  it('counts a 1am session as the night before', () => {
    const activity = [at(23, 0, 6), at(1, 0, 7), at(23, 0, 7), at(1, 0, 8), at(23, 0, 8), at(1, 0, 9)];
    expect(studyHabit(activity, at(12)).usualEnd).toBe(25 * 60);
  });
});

describe('streakMinute', () => {
  const s = { quietStart: 22 * 60, quietEnd: 8 * 60 };
  it('defaults to 8pm and stays an hour before quiet hours', () => {
    expect(streakMinute({ usualStart: null, usualEnd: null }, s)).toBe(20 * 60);
    expect(streakMinute({ usualStart: 20 * 60, usualEnd: 22 * 60 + 30 }, s)).toBe(21 * 60);
  });
  it('never fires before 4pm for morning studiers', () => {
    expect(streakMinute({ usualStart: 7 * 60, usualEnd: 8 * 60 }, s)).toBe(16 * 60);
  });
});

describe('planNotifications', () => {
  it('sends nothing when turned off', () => {
    const input = base({ grammarDue: [at(13)] });
    expect(planNotifications({ ...input, settings: { ...input.settings, enabled: false } })).toEqual([]);
  });

  it('warns about the streak in the evening if today has no study yet', () => {
    const plan = planNotifications(base({ activity: studied(18, [7, 8, 9]) }));
    const warn = plan.find((n) => n.kind === 'streak' && dayOf(n.at) === 10)!;
    expect(warn).toBeDefined();
    expect(hourOf(warn.at)).toBe(19); // usually done at 18:00, so an hour later
    expect(warn.message.title + warn.message.body).toContain('3 days');
  });

  it('skips the streak warning and today’s plan once you have studied today', () => {
    const plan = planNotifications(base({ activity: [...studied(18, [7, 8, 9]), at(10)] }));
    expect(plan.filter((n) => dayOf(n.at) === 10 && (n.kind === 'streak' || n.kind === 'plan'))).toEqual([]);
    // Tomorrow the streak is still alive, so it gets tomorrow's warning.
    const tomorrow = plan.find((n) => n.kind === 'streak' && dayOf(n.at) === 11)!;
    expect(tomorrow.message.title + tomorrow.message.body).toContain('4 days');
  });

  it('sends the morning plan a little before you usually start', () => {
    const plan = planNotifications(base({ now: at(6), activity: [...studied(9, [7, 8, 9])], grammarDue: [at(5)] }));
    const morning = plan.find((n) => n.kind === 'plan' && dayOf(n.at) === 10)!;
    expect(new Date(morning.at).getUTCHours() * 60 + new Date(morning.at).getUTCMinutes()).toBe(8 * 60 + 40);
    expect(morning.message.body).toBe('2 new points · 1 review · 30m practice');
  });

  it('switches to a comeback message after a missed day', () => {
    const plan = planNotifications(base({ activity: studied(18, [5, 6, 7]) }));
    const tomorrow = plan.filter((n) => dayOf(n.at) === 11);
    expect(tomorrow.some((n) => n.kind === 'plan')).toBe(false);
    expect(tomorrow.some((n) => n.kind === 'streak')).toBe(true);
  });

  it('celebrates the practice goal while the timer runs, once', () => {
    const plan = planNotifications(base({ running: { startedAt: at(11, 50), activity: 'Immersion' }, timeTodayMs: 10 * 60 * 1000 }));
    const win = plan.find((n) => n.kind === 'wins' && n.url === '/timer' && n.at === at(12, 20));
    expect(win).toBeDefined();
  });

  it('celebrates streak milestones only once', () => {
    const activity = [...studied(9, [4, 5, 6, 7, 8, 9]), at(11)];
    const first = planNotifications(base({ activity })).find((n) => n.key?.startsWith('streak-7'));
    expect(first).toBeDefined();
    const again = planNotifications(base({ activity, celebrated: { [first!.key!]: at(11) } })).find((n) => n.key?.startsWith('streak-7'));
    expect(again).toBeUndefined();
  });

  it('keeps it to three a day, spaced apart, and out of quiet hours', () => {
    const plan = planNotifications(
      base({
        now: at(7),
        activity: studied(12, [7, 8, 9]),
        grammarDue: [at(8), at(14)],
        cardDue: [at(9)],
        running: { startedAt: at(6), activity: 'Immersion' },
        levelsJustFinished: ['N5'],
      }),
    );
    const byDay = new Map<number, number>();
    for (const n of plan) byDay.set(dayOf(n.at), (byDay.get(dayOf(n.at)) ?? 0) + 1);
    for (const count of byDay.values()) expect(count).toBeLessThanOrEqual(MAX_PER_DAY);
    for (let i = 1; i < plan.length; i++) expect(plan[i].at - plan[i - 1].at).toBeGreaterThanOrEqual(MIN_SPACING);
    for (const n of plan) expect(hourOf(n.at) >= 8 && hourOf(n.at) < 22).toBe(true);
    expect(plan.some((n) => n.kind === 'wins' && n.key === 'level-N5')).toBe(true);
  });

  it('reminds about reviews when they come due, pointing at flashcards if no grammar is due', () => {
    const plan = planNotifications(base({ cardDue: [at(15)], settings: { ...base().settings, kinds: { reviews: true, streak: false, plan: false, wins: false } } }));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ kind: 'reviews', at: at(15), url: '/decks' });
    expect(plan[0].message.body).toContain('1 flashcard');
  });
});

describe('messages', () => {
  it('rotates day to day', () => {
    expect(pick(['a', 'b', 'c'], 0)).toBe('a');
    expect(pick(['a', 'b', 'c'], 4)).toBe('b');
    expect(reviewsMessage(2, 0, 1).title).not.toBe(reviewsMessage(2, 0, 2).title);
  });
  it('fills in counts', () => {
    for (let i = 0; i < 10; i++) expect(JSON.stringify(streakMessage(12, i))).toContain('12 days');
  });
});
