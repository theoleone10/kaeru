import { addNote } from '@/anki/notes';
import { ankiDueTimes, deckMaturity } from '@/anki/repo';
import { State } from '@/anki/schedule';
import { migrate } from '@/db/migrations';
import { openNodeDb } from './helpers/nodeDb';

const NOW = Date.UTC(2026, 9, 12, 12);

describe('deckMaturity', () => {
  it('counts new, young and mature cards per top-level deck, subdecks included', async () => {
    const db = openNodeDb();
    await migrate(db);
    for (let i = 0; i < 5; i++) await addNote(db, 'basic', 'Japanese', [`a${i}`, 'x'], NOW);
    await addNote(db, 'basic', 'Japanese::Verbs', ['v', 'x'], NOW);
    await addNote(db, 'basic', 'Kana', ['k', 'x'], NOW);
    const ids = (await db.getAllAsync<{ id: number }>('SELECT id FROM anki_cards ORDER BY id')).map((r) => r.id);
    const set = (id: number, state: number, days: number, suspended = 0) =>
      db.runAsync('UPDATE anki_cards SET state = ?, scheduled_days = ?, suspended = ?, due = ? WHERE id = ?', state, days, suspended, NOW + days * 86400000, id);
    await set(ids[0], State.Review, 30); // mature
    await set(ids[1], State.Review, 5); // young
    await set(ids[2], State.Learning, 0); // young
    await set(ids[3], State.Review, 40, 1); // suspended: left out
    await set(ids[5], State.Review, 21); // mature (subdeck)

    expect(await deckMaturity(db)).toEqual([
      { path: 'Japanese', new: 1, young: 2, mature: 2 },
      { path: 'Kana', new: 1, young: 0, mature: 0 },
    ]);
    expect((await ankiDueTimes(db)).length).toBe(4);
  });
});
