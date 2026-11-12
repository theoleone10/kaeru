import type { SQLiteDatabase } from 'expo-sqlite';
import { validateAnki } from '@/anki/backup';
import { buildStudyQueue, getTodayNewLimit, learnMoreToday, listDecks, newCardsLeft, newLearnedToday, setDeckLimits, setTodayNewLimit } from '@/anki/repo';
import { State } from '@/anki/schedule';
import { migrate } from '@/db/migrations';
import { readAllForBackup, replaceAllFromBackup } from '@/db/repo';
import { openNodeDb } from './helpers/nodeDb';

const NOW = +new Date(2026, 9, 11, 12);
const TOMORROW = +new Date(2026, 9, 12, 9);
const LIMITS = { newPerDay: 5, reviewsPerDay: 100 };

/** One deck with `n` new cards. */
async function deck(n: number): Promise<SQLiteDatabase> {
  const db = openNodeDb();
  await migrate(db);
  await db.runAsync(`INSERT INTO anki_notetypes (anki_id,name,is_cloze,css,fields,templates) VALUES (1,'Basic',0,'','["F"]','[]')`);
  await db.runAsync(`INSERT INTO anki_decks (anki_id,name) VALUES (1,'Words')`);
  for (let i = 0; i < n; i++) {
    await db.runAsync('INSERT INTO anki_notes (notetype_id,guid,fields,tags) VALUES (1,?,?,?)', `g${i}`, '["x"]', '');
    await db.runAsync(
      `INSERT INTO anki_cards (note_id,deck_id,ord,new_position,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review,suspended)
       VALUES (?,1,0,?,0,0,0,0,0,0,0,0,?,NULL,0)`,
      i + 1,
      i,
      State.New,
    );
  }
  return db;
}

/** Pretend `ids` were learned at `at` (a first answer on a new card). */
async function learn(db: SQLiteDatabase, ids: number[], at: number) {
  for (const id of ids) {
    await db.runAsync('UPDATE anki_cards SET state = ? WHERE id = ?', State.Learning, id);
    await db.runAsync('INSERT INTO anki_revlog (card_id,reviewed_at,rating,prev_state,duration_ms,imported) VALUES (?,?,3,?,1000,0)', id, at, State.New);
  }
}

const newToday = async (db: SQLiteDatabase, now: number) => (await listDecks(db, now, LIMITS)).find((d) => d.path === 'Words')!.newCount;

describe('new cards just for today', () => {
  it('overrides the usual number today only', async () => {
    const db = await deck(40);
    await setDeckLimits(db, 'Words', { newPerDay: 8, reviewsPerDay: null });
    expect(await newToday(db, NOW)).toBe(8);
    await setTodayNewLimit(db, 'Words', 15, NOW);
    expect(await getTodayNewLimit(db, 'Words', NOW)).toBe(15);
    expect(await newToday(db, NOW)).toBe(15);
    expect(await buildStudyQueue(db, 'Words', NOW, LIMITS)).toHaveLength(15);
    // Tomorrow the deck's own limit is back.
    expect(await getTodayNewLimit(db, 'Words', TOMORROW)).toBeNull();
    expect(await newToday(db, TOMORROW)).toBe(8);
  });

  it('can make today lighter too, counting what was already learned', async () => {
    const db = await deck(40);
    await learn(db, [1, 2], NOW - 60_000);
    await setTodayNewLimit(db, 'Words', 3, NOW);
    expect(await newLearnedToday(db, 'Words', NOW)).toBe(2);
    expect(await newToday(db, NOW)).toBe(1);
  });

  it('clearing it goes back to the usual number and tidies the row away', async () => {
    const db = await deck(10);
    await setTodayNewLimit(db, 'Words', 9, NOW);
    await setTodayNewLimit(db, 'Words', null, NOW);
    expect(await newToday(db, NOW)).toBe(5);
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_deck_limits'))!.n).toBe(0);
  });

  it('keeps the deck limits when only today changes, and the reverse', async () => {
    const db = await deck(10);
    await setDeckLimits(db, 'Words', { newPerDay: 2, reviewsPerDay: 50 });
    await setTodayNewLimit(db, 'Words', 7, NOW);
    await setDeckLimits(db, 'Words', { newPerDay: 3, reviewsPerDay: 50 }, NOW);
    expect(await getTodayNewLimit(db, 'Words', NOW)).toBe(7);
    await setTodayNewLimit(db, 'Words', null, NOW);
    expect(await newToday(db, NOW)).toBe(3);
  });

  it('"learn more today" lets that many more in after the day\'s cards are done', async () => {
    const db = await deck(30);
    await learn(db, [1, 2, 3, 4, 5], NOW - 60_000);
    expect(await newToday(db, NOW)).toBe(0);
    await learnMoreToday(db, 'Words', 10, NOW, LIMITS);
    expect(await newToday(db, NOW)).toBe(10);
    expect(await newCardsLeft(db, 'Words')).toBe(25);
  });

  it('survives a backup, and older backups without it still load', async () => {
    const db = await deck(10);
    await setTodayNewLimit(db, 'Words', 12, NOW);
    const backup = await readAllForBackup(db);
    expect(backup.anki!.anki_deck_limits).toEqual([{ path: 'Words', new_per_day: null, reviews_per_day: null, today_new: 12, today_day: '2026-10-11' }]);
    const other = await deck(10);
    await replaceAllFromBackup(other, backup, NOW);
    expect(await getTodayNewLimit(other, 'Words', NOW)).toBe(12);

    const old = { ...backup.anki!, anki_deck_limits: [{ path: 'Words', new_per_day: 4, reviews_per_day: null }] };
    expect(validateAnki(old).anki_deck_limits).toHaveLength(1);
  });
});
