import { forecast } from '@/srs/forecast';
import { availableLessonCount, lessonsLearnedToday, nextLessonBatch } from '@/srs/lessons';
import { computeStreak } from '@/stats/streak';
import { levelProgress } from '@/stats/levelProgress';
import { newCard, State } from '@/srs/scheduler';
import type { GrammarPoint } from '@/content/types';

const at = (h: number, m = 0, day = 10) => Date.UTC(2026, 0, day, h, m);
const HOUR = 60 * 60 * 1000;

describe('forecast', () => {
  it('buckets by clock hour and counts overdue separately', () => {
    const now = at(10, 30);
    const { dueNow, buckets } = forecast([at(9), at(10, 30), at(10, 45), at(11, 0), at(11, 59), at(15, 10), now + 30 * HOUR], now);
    expect(dueNow).toBe(2);
    expect(buckets).toHaveLength(24);
    expect(buckets[0]).toEqual({ start: now, count: 1 });
    expect(buckets[1]).toEqual({ start: at(11), count: 2 });
    expect(buckets[5]).toEqual({ start: at(15), count: 1 });
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(4);
  });
});

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak([at(9, 0, 8), at(22, 0, 9), at(8, 0, 10), at(9, 0, 10)], at(12))).toEqual({ days: 3, studiedToday: true });
  });
  it('stays alive until the end of today if yesterday was studied', () => {
    expect(computeStreak([at(9, 0, 8), at(9, 0, 9)], at(12))).toEqual({ days: 2, studiedToday: false });
  });
  it('breaks after a missed day', () => {
    expect(computeStreak([at(9, 0, 7), at(9, 0, 8)], at(12))).toEqual({ days: 0, studiedToday: false });
    expect(computeStreak([], at(12))).toEqual({ days: 0, studiedToday: false });
  });
});

const point = (id: string, level: GrammarPoint['level'] = 'N5') => ({ id, level }) as GrammarPoint;

describe('lessons', () => {
  const curriculum = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => point(id));

  it('takes the next unlearned points in order', () => {
    const batch = nextLessonBatch(curriculum, new Set(['a', 'c']), 0, { batchSize: 3, dailyLimit: 10 });
    expect(batch.map((p) => p.id)).toEqual(['b', 'd', 'e']);
  });

  it('respects the daily limit', () => {
    expect(nextLessonBatch(curriculum, new Set(), 9, { batchSize: 3, dailyLimit: 10 }).map((p) => p.id)).toEqual(['a']);
    expect(nextLessonBatch(curriculum, new Set(), 10, { batchSize: 3, dailyLimit: 10 })).toEqual([]);
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
