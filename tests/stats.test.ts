import { forecast } from '@/srs/forecast';
import { availableLessonCount, lessonsLearnedToday, nextLessonBatch } from '@/srs/lessons';
import { computeStreak } from '@/stats/streak';
import { dayKey } from '@/stats/dates';
import { levelProgress } from '@/stats/levelProgress';
import { newCard, State } from '@/srs/scheduler';
import type { GrammarPoint } from '@/content/types';

const at = (h: number, m = 0, day = 10) => +new Date(2026, 0, day, h, m);

describe('forecast', () => {
  it('buckets the next 30 days by local day, with overdue in today', () => {
    const local = (day: number, h = 12) => new Date(2026, 0, day, h).getTime();
    const now = local(10, 15);
    const buckets = forecast([local(1), local(10, 9), local(10, 23), local(11, 0), local(11, 8), local(20), local(39, 23), local(40, 1), local(60)], now);
    expect(buckets).toHaveLength(30);
    expect(buckets[0]).toEqual({ start: new Date(2026, 0, 10).getTime(), count: 3 }); // overdue + rest of today
    expect(buckets[1]).toEqual({ start: new Date(2026, 0, 11).getTime(), count: 2 });
    expect(buckets[10].count).toBe(1);
    expect(buckets[29]).toEqual({ start: new Date(2026, 1, 8).getTime(), count: 1 });
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(7); // day 40 and later are past the window
  });
});

describe('streak', () => {
  const days = (...ts: number[]) => ts.map(dayKey);
  it('counts consecutive goal days ending today', () => {
    expect(computeStreak(days(at(9, 0, 8), at(22, 0, 9), at(8, 0, 10)), at(12))).toEqual({ days: 3, goalMetToday: true });
  });
  it('stays alive until the end of today if yesterday reached a goal', () => {
    expect(computeStreak(days(at(9, 0, 8), at(9, 0, 9)), at(12))).toEqual({ days: 2, goalMetToday: false });
  });
  it('breaks after a day without a goal', () => {
    expect(computeStreak(days(at(9, 0, 7), at(9, 0, 8)), at(12))).toEqual({ days: 0, goalMetToday: false });
    expect(computeStreak([], at(12))).toEqual({ days: 0, goalMetToday: false });
  });
});

const point = (id: string, level: GrammarPoint['level'] = 'N5') => ({ id, level }) as GrammarPoint;

describe('lessons', () => {
  const curriculum = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => point(id));

  it('takes the next unlearned points in order', () => {
    const batch = nextLessonBatch(curriculum, new Set(['a', 'c']), 0, 3);
    expect(batch.map((p) => p.id)).toEqual(['b', 'd', 'e']);
  });

  it('respects the daily goal', () => {
    expect(nextLessonBatch(curriculum, new Set(), 1, 2).map((p) => p.id)).toEqual(['a']);
    expect(nextLessonBatch(curriculum, new Set(), 2, 2)).toEqual([]);
    expect(availableLessonCount(curriculum, new Set(['a']), 2, 5)).toBe(3);
  });

  it('counts lessons learned since local midnight', () => {
    expect(lessonsLearnedToday([at(23, 0, 9), at(0, 30), at(11)], at(12))).toBe(2);
  });
});

describe('levelProgress', () => {
  it('counts learned and mastered per level', () => {
    const points = [point('a'), point('b'), point('c'), point('x', 'N4')];
    const cards = [
      { ...newCard('a', 'N5', 0), state: State.Review, scheduled_days: 30 },
      { ...newCard('b', 'N5', 0), state: State.Review, scheduled_days: 3 },
    ];
    const p = levelProgress(points, cards);
    expect(p[0]).toEqual({ level: 'N5', total: 3, learned: 2, mastered: 1 });
    expect(p[1]).toEqual({ level: 'N4', total: 1, learned: 0, mastered: 0 });
    expect(p.map((l) => l.level)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1']);
  });
});
