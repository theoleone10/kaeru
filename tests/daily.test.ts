/// <reference types="node" />
import { dailyPlan, type DayState } from '@/daily/plan';
import { buildQuiz, cardsFromQuiz, scoreQuiz, type QuizAnswer } from '@/srs/quiz';
import { State } from '@/srs/scheduler';
import { getActivityTimes, getAllCards, getExampleSeen, getPointStats, getReviewTimes, saveQuizResults } from '@/db/repo';
import { migrate } from '@/db/migrations';
import { SEED_GOAL_DAYS_SQL, getGoalDays, markGoalDays, timeGoalDays } from '@/stats/goalDays';
import { dayKey } from '@/stats/dates';
import type { GrammarPoint } from '@/content/types';
import { startOfNextLocalDay } from '@/stats/dates';
import { openNodeDb } from './helpers/nodeDb';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const NOW = Date.UTC(2026, 8, 29, 12);

const base: DayState = {
  newGoal: 2,
  learnedToday: 0,
  unlearned: 300,
  nextTitles: ['〜ても', '〜てもいい', '〜てはいけない'],
  grammarCards: 40,
  grammarDue: 12,
  grammarReviewedToday: 0,
  decks: 1,
  cardsDue: 30,
  cardsReviewedToday: 0,
  timeGoalMs: 30 * MIN,
  timeTodayMs: 0,
};

describe('dailyPlan', () => {
  it('orders the day: learn, review grammar, flashcards, time', () => {
    const plan = dailyPlan(base);
    expect(plan.steps.map((s) => s.id)).toEqual(['learn', 'review', 'cards', 'time']);
    expect(plan.next?.id).toBe('learn');
    expect(plan.steps[0]).toMatchObject({ title: 'Learn 2 new points', detail: '〜ても · 〜てもいい', done: false });
    expect(plan.doneCount).toBe(0);
  });

  it('moves on as steps finish and celebrates when everything is done', () => {
    const halfway = dailyPlan({ ...base, learnedToday: 2, grammarDue: 0, grammarReviewedToday: 12 });
    expect(halfway.next?.id).toBe('cards');
    expect(halfway.doneCount).toBe(2);
    const done = dailyPlan({ ...base, learnedToday: 2, grammarDue: 0, cardsDue: 0, cardsReviewedToday: 30, timeTodayMs: 45 * MIN });
    expect(done.allDone).toBe(true);
    expect(done.next).toBeNull();
  });

  it('leaves out steps that do not apply', () => {
    const fresh = dailyPlan({ ...base, grammarCards: 0, grammarDue: 0, decks: 0, cardsDue: 0, timeGoalMs: 0 });
    expect(fresh.steps.map((s) => s.id)).toEqual(['learn']);
    const finished = dailyPlan({ ...base, unlearned: 0 });
    expect(finished.steps.map((s) => s.id)).toEqual(['review', 'cards', 'time']);
  });

  it('counts a goal for the streak only when it was actually done today', () => {
    expect(dailyPlan(base).goalMet).toBe(false);
    // Nothing due and nothing reviewed: no review steps today, so nothing to earn there.
    const idle = dailyPlan({ ...base, grammarDue: 0, cardsDue: 0 });
    expect(idle.steps.map((x) => x.id)).toEqual(['learn', 'time']);
    expect(idle.goalMet).toBe(false);
    expect(dailyPlan({ ...base, grammarDue: 0, grammarReviewedToday: 3 }).goalMet).toBe(true);
    expect(dailyPlan({ ...base, cardsDue: 0, cardsReviewedToday: 5 }).goalMet).toBe(true);
    expect(dailyPlan({ ...base, learnedToday: 2 }).goalMet).toBe(true);
    expect(dailyPlan({ ...base, timeTodayMs: 30 * MIN }).goalMet).toBe(true);
    // Some reviews done but some still due: not yet.
    expect(dailyPlan({ ...base, grammarReviewedToday: 5, cardsReviewedToday: 5, timeTodayMs: 29 * MIN, learnedToday: 1 }).goalMet).toBe(false);
  });

  it('does not tick reviews off after a lesson: its quiz is not a review', () => {
    // Just learned the first points: their first review is tomorrow, so nothing is due.
    const afterLesson = dailyPlan({ ...base, learnedToday: 2, grammarCards: 2, grammarDue: 0, grammarReviewedToday: 0 });
    expect(afterLesson.steps.map((x) => x.id)).toEqual(['learn', 'cards', 'time']);
    expect(afterLesson.doneCount).toBe(1);
    // Reviews done today keep the step, ticked.
    const reviewed = dailyPlan({ ...base, grammarDue: 0, grammarReviewedToday: 4 });
    expect(reviewed.steps.find((x) => x.id === 'review')).toMatchObject({ done: true, detail: '4 reviewed today' });
  });

  it('only asks for what is left of the curriculum', () => {
    expect(dailyPlan({ ...base, unlearned: 1 }).steps[0].title).toBe('Learn 1 new point');
    expect(dailyPlan({ ...base, learnedToday: 1 }).steps[0]).toMatchObject({ title: 'Learn 1 new point', progress: 0.5 });
  });
});

const ex = (pid: string, n: number) => ({ id: `${pid}-${n}`, japanese: '', furigana: '', english: '', cloze_target: '', accepted_answers: [] });
const point = (id: string, examples = 5) => ({ id, level: 'N5', title: id, examples: Array.from({ length: examples }, (_, i) => ex(id, i)) }) as unknown as GrammarPoint;
const seq = () => {
  let i = 0;
  return () => ((i++ * 0.37) % 1);
};

describe('quiz', () => {
  it('asks three different sentences per point, never the same point twice in a row', () => {
    const items = buildQuiz([point('a'), point('b')], seq());
    expect(items).toHaveLength(6);
    for (const id of ['a', 'b']) {
      const mine = items.filter((q) => q.point.id === id).map((q) => q.example.id);
      expect(new Set(mine).size).toBe(3);
    }
    for (let i = 1; i < items.length; i++) expect(items[i].point.id).not.toBe(items[i - 1].point.id);
  });

  it('uses every sentence when a point has fewer than three', () => {
    expect(buildQuiz([point('a', 2)], seq())).toHaveLength(2);
  });

  const answer = (pointId: string, correct: boolean, retry = false): QuizAnswer => ({ pointId, exampleId: `${pointId}-x`, correct, retry, at: NOW });

  it('passes a point with at most one first-try miss; retries do not count', () => {
    const scores = scoreQuiz(
      ['a', 'b'],
      [answer('a', true), answer('a', false), answer('a', true), answer('a', true, true), answer('b', false), answer('b', false), answer('b', true)],
    );
    expect(scores.get('a')).toEqual({ asked: 3, correct: 2, passed: true });
    expect(scores.get('b')).toEqual({ asked: 3, correct: 1, passed: false });
  });

  it('puts passed points on a normal interval and missed ones back in learning, from tomorrow', () => {
    const [a, b] = cardsFromQuiz([point('a'), point('b')], [answer('a', true), answer('b', false)], NOW);
    expect(a.card.state).toBe(State.Review);
    expect(a.card.due).toBeGreaterThanOrEqual(NOW + DAY);
    expect(b.card.state).toBe(State.Learning);
    expect(b.card.due).toBe(startOfNextLocalDay(NOW));
    expect(a.card.learned_at).toBe(NOW);
  });

  it('saves the quiz into the SRS and marks its sentences as seen', async () => {
    const db = openNodeDb();
    await migrate(db);
    const answers = [
      { pointId: 'a', exampleId: 'a-1', correct: true, retry: false, at: NOW - 2 * MIN },
      { pointId: 'a', exampleId: 'a-2', correct: false, retry: false, at: NOW - MIN },
      { pointId: 'a', exampleId: 'a-2', correct: true, retry: true, at: NOW },
    ];
    const seeds = cardsFromQuiz([point('a')], answers, NOW);
    await saveQuizResults(db, seeds, answers);
    await saveQuizResults(db, seeds, answers); // a second save doesn't duplicate the card or log
    const cards = await getAllCards(db);
    expect(cards).toHaveLength(1);
    const logs = await db.getAllAsync<{ example_id: string }>('SELECT example_id FROM review_logs');
    expect(logs).toEqual([{ example_id: 'a-2' }]);
    const seen = await getExampleSeen(db, 'a');
    expect(seen.get('a-2')?.last_shown_at).toBe(NOW);
    expect(seen.has('a-1')).toBe(true);
    // The quiz seeds the SRS but isn't a review.
    expect((await getPointStats(db, 'a')).reviews).toBe(0);
    expect((await getReviewTimes(db, NOW - DAY)).grammar).toEqual([]);
    expect(await getActivityTimes(db, NOW - DAY)).toContain(NOW);
  });
});

describe('streak activity', () => {
  it('counts grammar, flashcards and tracked time', async () => {
    const db = openNodeDb();
    await migrate(db);
    await db.runAsync("INSERT INTO time_entries (activity_id, started_at, ended_at, note, source) VALUES (1, ?, ?, '', 'timer')", NOW - DAY, NOW - DAY + 30 * MIN);
    const times = await getActivityTimes(db, NOW - 7 * DAY);
    expect(times).toEqual([NOW - DAY]);
  });
});

describe('goal days', () => {
  it('starts from every day that already had study, so existing streaks carry over', async () => {
    const db = openNodeDb();
    await migrate(db);
    await db.runAsync("INSERT INTO time_entries (activity_id, started_at, ended_at, note, source) VALUES (1, ?, ?, '', 'timer')", NOW - DAY, NOW - DAY + 5 * MIN);
    await db.execAsync(SEED_GOAL_DAYS_SQL);
    expect(await getGoalDays(db, NOW - 7 * DAY)).toEqual([dayKey(NOW - DAY)]);
    await markGoalDays(db, [dayKey(NOW), dayKey(NOW)]);
    expect(await getGoalDays(db, NOW - 7 * DAY)).toEqual([dayKey(NOW - DAY), dayKey(NOW)]);
  });

  it('finds recent days whose time goal was met, even when logged later', () => {
    const entry = (start: number, mins: number) => ({ id: 1, activity_id: 1, started_at: start, ended_at: start + mins * MIN, note: '', source: 'manual' });
    const entries = [entry(NOW - 2 * DAY, 35), entry(NOW - DAY, 10)];
    expect(timeGoalDays(entries, 30 * MIN, NOW)).toEqual([dayKey(NOW - 2 * DAY)]);
    expect(timeGoalDays(entries, 0, NOW)).toEqual([]);
  });
});
