import { cardBeforeLog, createScheduler, gradeCard, isMastered, newCard, Rating, retrievability, State, type StoredCard } from '@/srs/scheduler';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const scheduler = createScheduler({ enableFuzz: false });

function review(card: StoredCard, correct: boolean, now: number) {
  return gradeCard({ card, correct, now, exampleId: 'ex-1', answer: 'x', scheduler });
}

describe('newCard', () => {
  it('is New, due immediately, with no reviews', () => {
    const c = newCard('n5-desu', 'N5', T0);
    expect(c).toMatchObject({ grammar_id: 'n5-desu', level: 'N5', state: State.New, due: T0, reps: 0, lapses: 0, learned_at: T0, suspended: 0, last_review: null });
  });
});

describe('gradeCard', () => {
  it('correct first answer graduates to a multi-day review interval', () => {
    const { card, log } = review(newCard('a', 'N5', T0), true, T0);
    expect(card.state).toBe(State.Review);
    expect(card.due - T0).toBeGreaterThanOrEqual(DAY);
    expect(card.reps).toBe(1);
    expect(card.last_review).toBe(T0);
    expect(log.rating).toBe(Rating.Good);
  });

  it('wrong first answer enters learning and comes back in 10 minutes', () => {
    const { card, log } = review(newCard('a', 'N5', T0), false, T0);
    expect(card.state).toBe(State.Learning);
    expect(card.due - T0).toBe(10 * MIN);
    expect(log.rating).toBe(Rating.Again);
  });

  it('intervals grow with consecutive correct answers', () => {
    let card = newCard('a', 'N5', T0);
    let now = T0;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      card = review(card, true, now).card;
      intervals.push(card.due - now);
      now = card.due;
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it('a lapse on a review card counts a lapse, relearns in 10 minutes and lowers stability', () => {
    let card = review(newCard('a', 'N5', T0), true, T0).card;
    card = review(card, true, card.due).card;
    const before = card;
    const { card: after } = review(before, false, before.due);
    expect(after.state).toBe(State.Relearning);
    expect(after.lapses).toBe(1);
    expect(after.due - before.due).toBe(10 * MIN);
    expect(after.stability).toBeLessThan(before.stability);
  });

  it('preserves non-FSRS fields', () => {
    const c = { ...newCard('a', 'N4', T0), suspended: 0, learned_at: T0 - 5 };
    const { card } = review(c, true, T0);
    expect(card).toMatchObject({ grammar_id: 'a', level: 'N4', learned_at: T0 - 5 });
  });

  it('records the answer, example and timing in the log', () => {
    const { log } = gradeCard({ card: newCard('a', 'N5', T0), correct: true, now: T0, exampleId: 'a-3', answer: 'です', durationMs: 4200, scheduler });
    expect(log).toMatchObject({ grammar_id: 'a', example_id: 'a-3', answer: 'です', duration_ms: 4200, reviewed_at: T0 });
  });
});

describe('undo', () => {
  it('restores the exact card state from before the review', () => {
    const start = review(newCard('a', 'N5', T0), true, T0).card;
    const { log } = review(start, false, start.due + DAY);
    expect(cardBeforeLog(log)).toEqual(start);
  });

  it('undo then correct answer gives the same result as answering correctly in the first place', () => {
    const start = review(newCard('a', 'N5', T0), true, T0).card;
    const now = start.due;
    const wrong = review(start, false, now);
    const redo = review(cardBeforeLog(wrong.log), true, now);
    expect(redo.card).toEqual(review(start, true, now).card);
  });
});

describe('retrievability / mastery', () => {
  it('is 0 for new cards and decays over time', () => {
    const c0 = newCard('a', 'N5', T0);
    expect(retrievability(c0, T0, scheduler)).toBe(0);
    const c1 = review(c0, true, T0).card;
    const soon = retrievability(c1, T0 + DAY, scheduler);
    const later = retrievability(c1, T0 + 30 * DAY, scheduler);
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeLessThanOrEqual(1);
  });

  it('mastered means a review interval of 21+ days', () => {
    expect(isMastered({ state: State.Review, scheduled_days: 21 })).toBe(true);
    expect(isMastered({ state: State.Review, scheduled_days: 20 })).toBe(false);
    expect(isMastered({ state: State.Relearning, scheduled_days: 40 })).toBe(false);
  });
});
