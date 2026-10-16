import { buildStudyQueue, replacementCards, setCardSuspended } from '@/anki/repo';
import { State } from '@/anki/schedule';
import { migrate } from '@/db/migrations';
import { openNodeDb } from './helpers/nodeDb';

const NOW = new Date(2026, 9, 11, 12).getTime();
const LIMITS = { newPerDay: 3, reviewsPerDay: 100 };

async function deck(newCards: number, reviews: number) {
  const db = openNodeDb();
  await migrate(db);
  await db.runAsync(`INSERT INTO anki_notetypes (anki_id,name,is_cloze,css,fields,templates) VALUES (1,'Basic',0,'','["F"]','[]')`);
  await db.runAsync(`INSERT INTO anki_decks (anki_id,name) VALUES (1,'D')`);
  const add = async (i: number, state: number, due: number) => {
    await db.runAsync('INSERT INTO anki_notes (notetype_id,guid,fields,tags) VALUES (1,?,?,?)', `g${i}`, '["x"]', '');
    await db.runAsync(
      `INSERT INTO anki_cards (note_id,deck_id,ord,new_position,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review,suspended)
       VALUES (?,1,0,?,?,1,5,0,1,0,0,0,?,NULL,0)`,
      i + 1, i, due, state,
    );
  };
  let i = 0;
  for (let n = 0; n < newCards; n++) await add(i++, State.New, 0);
  for (let n = 0; n < reviews; n++) await add(i++, State.Review, NOW - 1000);
  return db;
}

describe('suspending a card mid-session', () => {
  it('brings in the next new card in line', async () => {
    const db = await deck(5, 2);
    const queue = await buildStudyQueue(db, 'D', NOW, LIMITS);
    const known = new Set(queue);
    const fresh = await db.getAllAsync<{ id: number }>(`SELECT id FROM anki_cards WHERE state = ${State.New} ORDER BY new_position`);
    expect(fresh.filter((r) => known.has(r.id))).toHaveLength(3);
    const suspended = fresh[1].id;
    await setCardSuspended(db, suspended, true);
    expect(await replacementCards(db, 'D', NOW, LIMITS, State.New, (id) => known.has(id))).toEqual([fresh[3].id]);
  });

  it('brings nothing in when no more new cards are left', async () => {
    const db = await deck(3, 1);
    const queue = await buildStudyQueue(db, 'D', NOW, LIMITS);
    await setCardSuspended(db, queue[0], true);
    expect(await replacementCards(db, 'D', NOW, LIMITS, State.New, (id) => queue.includes(id))).toEqual([]);
  });

  it('never replaces a learning card', async () => {
    const db = await deck(5, 0);
    expect(await replacementCards(db, 'D', NOW, LIMITS, State.Learning, () => false)).toEqual([]);
  });
});
