import { migrate } from '@/db/migrations';
import { getActivityTimes, getAllCards, markKnown, setSuspended } from '@/db/repo';
import { buildQueue } from '@/srs/queue';
import { lessonsLearnedToday } from '@/srs/lessons';
import { gradeCard, isMastered, State } from '@/srs/scheduler';
import { openNodeDb } from './helpers/nodeDb';

const NOW = new Date(2026, 9, 11, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;
const points = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, level: 'N5' }));

describe('markKnown', () => {
  it('adds skipped points as learned but kept out of reviews', async () => {
    const db = openNodeDb();
    await migrate(db);
    expect(await markKnown(db, points, NOW)).toBe(8);
    const cards = await getAllCards(db);
    expect(cards).toHaveLength(8);
    for (const c of cards) {
      expect(c.state).toBe(State.Review);
      expect(c.suspended).toBe(1);
      expect(isMastered(c)).toBe(false);
    }
    // Never due, even long after.
    expect(buildQueue(cards, NOW + 400 * DAY)).toHaveLength(0);
  });

  it("doesn't use up today's lessons or count as study", async () => {
    const db = openNodeDb();
    await migrate(db);
    await markKnown(db, points, NOW);
    const cards = await getAllCards(db);
    expect(lessonsLearnedToday(cards.map((c) => c.learned_at), NOW)).toBe(0);
    expect(await getActivityTimes(db, NOW - 400 * DAY)).toHaveLength(0);
  });

  it('leaves points already learned alone', async () => {
    const db = openNodeDb();
    await migrate(db);
    await markKnown(db, points.slice(0, 3), NOW);
    expect(await markKnown(db, points, NOW + DAY)).toBe(5);
  });

  it('reviews normally if put back into reviews', async () => {
    const db = openNodeDb();
    await migrate(db);
    await markKnown(db, points.slice(0, 1), NOW);
    await setSuspended(db, 'p0', false);
    const [card] = await getAllCards(db);
    expect(buildQueue([card], card.due)).toHaveLength(1);
    const later = card.due;
    const pass = gradeCard({ card, correct: true, now: later, exampleId: 'e', answer: 'x' });
    expect(pass.card.due).toBeGreaterThan(later + 7 * DAY);
    const fail = gradeCard({ card, correct: false, now: later, exampleId: 'e', answer: 'x' });
    expect(fail.card.due).toBeLessThan(later + DAY);
  });
});
