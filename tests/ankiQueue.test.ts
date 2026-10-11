import type { SQLiteDatabase } from 'expo-sqlite';
import { buildStudyQueue, interleave, LEARN_AHEAD_MS, listDecks, setDeckLimits, takeWithinLimits, type Limits } from '@/anki/repo';
import { State } from '@/anki/schedule';
import { migrate } from '@/db/migrations';
import { openNodeDb } from './helpers/nodeDb';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 11, 12).getTime();
const END_TODAY = new Date(2026, 9, 12).getTime() + 1000;
const DECKS = ['A', 'A::x', 'A::y', 'A::y::deep', 'B', 'B::z', 'C'];
const inTree = (name: string, path: string) => name === path || name.startsWith(`${path}::`);

/** Small seeded RNG so failures reproduce. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

async function collection(seed: number): Promise<SQLiteDatabase> {
  const r = rng(seed);
  const db = openNodeDb();
  await migrate(db);
  await db.runAsync(`INSERT INTO anki_notetypes (anki_id,name,is_cloze,css,fields,templates) VALUES (1,'Basic',0,'','["F"]','[]')`);
  for (const [i, d] of DECKS.entries()) await db.runAsync('INSERT INTO anki_decks (anki_id,name) VALUES (?,?)', i + 1, d);
  for (let i = 0; i < 300; i++) {
    await db.runAsync('INSERT INTO anki_notes (notetype_id,guid,fields,tags) VALUES (1,?,?,?)', `g${i}`, '["x"]', '');
    const state = [State.New, State.New, State.Review, State.Review, State.Learning, State.Relearning][Math.floor(r() * 6)];
    const due = NOW + Math.floor((r() - 0.6) * 3 * DAY);
    await db.runAsync(
      `INSERT INTO anki_cards (note_id,deck_id,ord,new_position,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review,suspended)
       VALUES (?,?,0,?,?,1,5,0,1,0,0,0,?,NULL,?)`,
      i + 1,
      Math.floor(r() * DECKS.length) + 1,
      Math.floor(r() * 50), // ties on purpose
      due,
      state,
      r() < 0.1 ? 1 : 0,
    );
  }
  // Some per-deck overrides, including tighter subdeck limits than their parent.
  await setDeckLimits(db, 'A::y', { newPerDay: 3, reviewsPerDay: 4 });
  await setDeckLimits(db, 'B', { newPerDay: 50, reviewsPerDay: null });
  await setDeckLimits(db, 'A::x', { newPerDay: 0, reviewsPerDay: 2 });
  return db;
}

/** The previous implementation: load every card and filter in JS. */
async function reference(db: SQLiteDatabase, path: string, limits: Limits) {
  const own = new Map(
    (await db.getAllAsync<{ path: string; new_per_day: number | null; reviews_per_day: number | null }>('SELECT * FROM anki_deck_limits')).map((r) => [r.path, r]),
  );
  const newLeft = (p: string) => own.get(p)?.new_per_day ?? limits.newPerDay;
  const reviewsLeft = (p: string) => own.get(p)?.reviews_per_day ?? limits.reviewsPerDay;
  const rows = await db.getAllAsync<{ id: number; deck: string; state: number; due: number }>(
    `SELECT c.id, d.name AS deck, c.state, c.due FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id WHERE c.suspended = 0 ORDER BY c.new_position, c.id`,
  );
  const tree = rows.filter((x) => inTree(x.deck, path));
  const fresh = tree.filter((x) => x.state === State.New);
  const reviews = tree.filter((x) => x.state === State.Review && x.due < END_TODAY).sort((a, b) => a.due - b.due || a.id - b.id);
  const learning = tree.filter((x) => (x.state === State.Learning || x.state === State.Relearning) && x.due <= NOW + LEARN_AHEAD_MS).sort((a, b) => a.due - b.due);
  const newTaken = takeWithinLimits(fresh, path, newLeft);
  const reviewTaken = takeWithinLimits(reviews, path, reviewsLeft);
  return {
    counts: { newCount: newTaken.length, learnCount: learning.length, reviewCount: reviewTaken.length, total: tree.length },
    queue: [...learning.map((x) => x.id), ...interleave(reviewTaken.map((x) => x.id), newTaken.map((x) => x.id))],
  };
}

describe('deck counts and study queue match loading every card', () => {
  const limitSets: Limits[] = [
    { newPerDay: 20, reviewsPerDay: 200 },
    { newPerDay: 5, reviewsPerDay: 7 },
    { newPerDay: 0, reviewsPerDay: 1 },
  ];
  for (const seed of [1, 2, 3, 4]) {
    for (const limits of limitSets) {
      it(`collection ${seed}, ${limits.newPerDay} new / ${limits.reviewsPerDay} reviews`, async () => {
        const db = await collection(seed);
        const nodes = await listDecks(db, NOW, limits);
        expect(nodes.map((n) => n.path)).toEqual(['A', 'A::x', 'A::y', 'A::y::deep', 'B', 'B::z', 'C']);
        for (const n of nodes) {
          const ref = await reference(db, n.path, limits);
          expect({ path: n.path, newCount: n.newCount, learnCount: n.learnCount, reviewCount: n.reviewCount, total: n.total }).toEqual({ path: n.path, ...ref.counts });
          expect(await buildStudyQueue(db, n.path, NOW, limits)).toEqual(ref.queue);
        }
      });
    }
  }
});
