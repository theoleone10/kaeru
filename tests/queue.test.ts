import { nextDueAt, reviewCount, shuffle, todaysReviews } from '@/srs/queue';
import { gradeCard, newCard, State, type StoredCard } from '@/srs/scheduler';
import { startOfNextLocalDay } from '@/stats/dates';
import { pickExample, type ExampleSeen } from '@/srs/exampleRotation';
import type { Example } from '@/content/types';

const NOW = +new Date(2026, 0, 1, 12);
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function card(id: string, due: number, state = State.Review, suspended = 0): StoredCard {
  return { ...newCard(id, 'N5', NOW - 30 * DAY), due, state, suspended, last_review: NOW - 10 * DAY };
}

function seededRng(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('todaysReviews', () => {
  const opts = { maxPerDay: 100, rng: seededRng() };
  const ids = (q: StoredCard[]) => q.map((c) => c.grammar_id);
  const TOMORROW = startOfNextLocalDay(NOW);

  it('is every unsuspended card due before midnight, not just due right now', () => {
    const q = todaysReviews(
      [card('a', NOW - DAY), card('later', NOW + 3 * HOUR), card('tmrw', TOMORROW), card('off', NOW - 1, State.Review, 1)],
      NOW,
      opts,
    ).queue;
    expect(ids(q).sort()).toEqual(['a', 'later']);
  });

  it("leaves out points learned today: their first review is tomorrow", () => {
    const fresh = { ...card('new', NOW - 1, State.Learning), learned_at: NOW - HOUR };
    expect(todaysReviews([fresh], NOW, opts).queue).toHaveLength(0);
    expect(todaysReviews([fresh], TOMORROW + HOUR, opts).queue).toHaveLength(1);
  });

  it("doesn't grow during the day: a right answer leaves the set, a miss stays", () => {
    const cards = [card('a', NOW - 1), card('b', NOW - 1), card('c', NOW + HOUR)];
    expect(todaysReviews(cards, NOW, opts).queue).toHaveLength(3);
    const right = gradeCard({ card: cards[0], correct: true, now: NOW, exampleId: 'e', answer: '' }).card;
    const miss = gradeCard({ card: cards[1], correct: false, now: NOW + MIN, exampleId: 'e', answer: '' }).card;
    const after = todaysReviews([right, miss, cards[2]], NOW + 2 * MIN, opts);
    expect(ids(after.queue)).toEqual(['c', 'b']);
    expect(after.done).toBe(1);
    // Later today the count is the same: nothing new comes due mid-day.
    expect(todaysReviews([right, miss, cards[2]], NOW + 5 * HOUR, opts).queue).toHaveLength(2);
  });

  it('puts misses at the end, in the order they were missed', () => {
    const missed = (id: string, at: number) => ({ ...card(id, NOW + 10 * MIN, State.Relearning), last_review: at });
    const q = todaysReviews([missed('m2', NOW - MIN), card('x', NOW - 1), missed('m1', NOW - 2 * MIN), card('y', NOW - 1)], NOW, opts).queue;
    expect(ids(q).slice(2)).toEqual(['m1', 'm2']);
    expect(ids(q.slice(0, 2)).sort()).toEqual(['x', 'y']);
  });

  it('caps the day at maxPerDay, most overdue first, counting what was already done', () => {
    const cards = [card('old', NOW - 3 * DAY), card('mid', NOW - DAY), card('new', NOW - 1)];
    const t = todaysReviews(cards, NOW, { ...opts, maxPerDay: 2 });
    expect(ids(t.queue).sort()).toEqual(['mid', 'old']);
    expect(t.held).toBe(1);
    const doneOne = { ...card('done', TOMORROW + DAY), last_review: NOW - HOUR };
    expect(ids(todaysReviews([...cards, doneOne], NOW, { ...opts, maxPerDay: 2 }).queue)).toEqual(['old']);
  });

  it('reviewCount matches the queue', () => {
    const cards = [card('a', NOW - 1), card('b', NOW + HOUR), card('c', TOMORROW)];
    expect(reviewCount(cards, NOW, 100)).toBe(2);
  });

  it('restricts to onlyIds', () => {
    expect(ids(todaysReviews([card('a', NOW), card('b', NOW)], NOW, { ...opts, onlyIds: new Set(['b']) }).queue)).toEqual(['b']);
  });
});

describe('nextDueAt', () => {
  it('returns the earliest future due time', () => {
    expect(nextDueAt([card('a', NOW - 1), card('b', NOW + 5), card('c', NOW + 2), card('d', NOW + 1, State.Review, 1)], NOW)).toBe(NOW + 2);
    expect(nextDueAt([], NOW)).toBeNull();
  });
});

describe('shuffle', () => {
  it('is a permutation and does not mutate', () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, seededRng(7));
    expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('pickExample', () => {
  const ex = (id: string) => ({ id }) as Example;
  const examples = [ex('e1'), ex('e2'), ex('e3'), ex('e4')];
  const seen = (rows: [string, number | null][]) =>
    new Map<string, ExampleSeen>(rows.map(([id, t]) => [id, { example_id: id, times_shown: t === null ? 0 : 1, last_shown_at: t }]));

  it('prefers never-shown sentences', () => {
    const s = seen([['e1', 10], ['e2', 20], ['e3', 30]]);
    expect(pickExample(examples, s).id).toBe('e4');
  });

  it('then the least recently shown', () => {
    const s = seen([['e1', 40], ['e2', 20], ['e3', 30], ['e4', 50]]);
    expect(pickExample(examples, s).id).toBe('e2');
  });

  it('never repeats the most recent sentence back-to-back', () => {
    const two = [ex('a'), ex('b')];
    expect(pickExample(two, seen([['a', 5]])).id).toBe('b');
    expect(pickExample(two, seen([['a', 5], ['b', 1]])).id).toBe('b');
    expect(pickExample(two, seen([['a', 1], ['b', 5]])).id).toBe('a');
  });

  it('rotates through every sentence over repeated reviews', () => {
    const s = new Map<string, ExampleSeen>();
    const order: string[] = [];
    for (let t = 1; t <= 8; t++) {
      const pick = pickExample(examples, s, seededRng(t));
      order.push(pick.id);
      s.set(pick.id, { example_id: pick.id, times_shown: (s.get(pick.id)?.times_shown ?? 0) + 1, last_shown_at: t });
    }
    expect(new Set(order.slice(0, 4)).size).toBe(4);
    expect(new Set(order.slice(4, 8)).size).toBe(4);
  });

  it('works with a single example', () => {
    expect(pickExample([ex('only')], seen([['only', 1]])).id).toBe('only');
  });
});
