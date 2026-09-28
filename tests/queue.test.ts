import { buildQueue, LEARN_AHEAD_MS, nextDueAt, shuffle } from '@/srs/queue';
import { newCard, State, type StoredCard } from '@/srs/scheduler';
import { pickExample, type ExampleSeen } from '@/srs/exampleRotation';
import type { Example } from '@/content/types';

const NOW = Date.UTC(2026, 0, 1, 12);
const MIN = 60 * 1000;

function card(id: string, due: number, state = State.Review, suspended = 0): StoredCard {
  return { ...newCard(id, 'N5', NOW - 100 * MIN), due, state, suspended };
}

function seededRng(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('buildQueue', () => {
  it('includes only due, unsuspended cards', () => {
    const q = buildQueue([card('a', NOW - 1), card('b', NOW + MIN), card('c', NOW - 1, State.Review, 1), card('d', NOW)], NOW);
    expect(q.map((c) => c.grammar_id).sort()).toEqual(['a', 'd']);
  });

  it('puts learning cards before review cards', () => {
    const q = buildQueue(
      [card('r1', NOW - 1), card('l1', NOW - 1, State.Learning), card('r2', NOW - 1), card('l2', NOW - 1, State.Relearning)],
      NOW,
      { rng: seededRng() },
    );
    expect(q.slice(0, 2).map((c) => c.grammar_id).sort()).toEqual(['l1', 'l2']);
  });

  it('learns ahead only (re)learning cards when nothing is due', () => {
    const q = buildQueue(
      [card('soon', NOW + 5 * MIN, State.Learning), card('rev', NOW + 5 * MIN, State.Review), card('far', NOW + LEARN_AHEAD_MS + 1, State.Learning)],
      NOW,
    );
    expect(q.map((c) => c.grammar_id)).toEqual(['soon']);
  });

  it('restricts to onlyIds (lesson quiz)', () => {
    const q = buildQueue([card('a', NOW), card('b', NOW)], NOW, { onlyIds: new Set(['b']) });
    expect(q.map((c) => c.grammar_id)).toEqual(['b']);
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
