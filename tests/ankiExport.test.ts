/// <reference types="node" />
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readCollection } from '@/anki/collection';
import { buildPackage, mediaReferences, readDeckExport, writeCollection, exportCrt } from '@/anki/export';
import {
  addNote,
  cardOrdinals,
  BUILTIN_NOTETYPES,
  cleanDeckPath,
  createDeck,
  deckPaths,
  deleteNote,
  editableToField,
  fieldToEditable,
  getNote,
  updateNote,
  renameDeck,
  EmptyNoteError,
} from '@/anki/notes';
import { unpackPackage } from '@/anki/package';
import { answerCard, getStudyCard, listDecks } from '@/anki/repo';
import { convertAnkiCard, createAnkiScheduler, previewGrades, Rating, State, toAnkiCard, type AnkiSched } from '@/anki/schedule';
import { sha1Hex } from '@/anki/sha1';
import { saveCollection } from '@/anki/store';
import { migrate } from '@/db/migrations';
import { openNodeDb } from './helpers/nodeDb';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12);
const limits = { newPerDay: 20, reviewsPerDay: 200 };

async function freshDb() {
  const db = openNodeDb();
  await migrate(db);
  return db;
}

const cardsOf = (db: Awaited<ReturnType<typeof freshDb>>) =>
  db.getAllAsync<{ id: number; note_id: number; ord: number; state: number; new_position: number; deck: string }>(
    'SELECT c.id, c.note_id, c.ord, c.state, c.new_position, d.name AS deck FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id ORDER BY c.id',
  );

describe('decks and notes', () => {
  it('creates empty decks that show up in the deck list, parents included', async () => {
    const db = await freshDb();
    await createDeck(db, ' Japanese :: Verbs ', NOW);
    expect(cleanDeckPath(' a ::  b  c :: ')).toBe('a::b c');
    expect(await deckPaths(db)).toEqual(['Japanese', 'Japanese::Verbs']);
    expect((await listDecks(db, NOW, limits)).map((d) => [d.path, d.total])).toEqual([
      ['Japanese', 0],
      ['Japanese::Verbs', 0],
    ]);
    // Creating it again reuses it.
    expect(await createDeck(db, 'Japanese::Verbs', NOW)).toBe(await createDeck(db, 'Japanese::Verbs', NOW));
  });

  it('adds notes of each built-in type as new cards, in order', async () => {
    const db = await freshDb();
    expect(await addNote(db, 'basic', 'Words', ['犬', 'dog'], NOW)).toBe(1);
    expect(await addNote(db, 'reversed', 'Words', ['猫', 'cat'], NOW)).toBe(2);
    expect(await addNote(db, 'vocab', 'Words::JLPT', ['食べる', 'たべる', 'to eat', ''], NOW)).toBe(1);
    const cards = await cardsOf(db);
    expect(cards.map((c) => [c.deck, c.ord, c.state])).toEqual([
      ['Words', 0, State.New],
      ['Words', 0, State.New],
      ['Words', 1, State.New],
      ['Words::JLPT', 0, State.New],
    ]);
    expect(cards.map((c) => c.new_position)).toEqual([1, 2, 3, 4]);
    expect((await listDecks(db, NOW, limits))[0]).toMatchObject({ path: 'Words', newCount: 4, total: 4 });

    const vocab = (await getStudyCard(db, cards[3].id))!;
    expect(vocab.fields).toEqual({ Word: '食べる', Reading: 'たべる', Meaning: 'to eat', Example: '' });
  });

  it('renames a deck with its subdecks and limits, and refuses a name that is taken', async () => {
    const db = await freshDb();
    await addNote(db, 'basic', 'Japanese', ['犬', 'dog'], NOW);
    await addNote(db, 'basic', 'Japanese::Verbs', ['食べる', 'to eat'], NOW);
    await addNote(db, 'basic', 'Other', ['x', 'y'], NOW);
    await db.runAsync("INSERT INTO anki_deck_limits (path, new_per_day, reviews_per_day) VALUES ('Japanese::Verbs', 5, NULL)");
    expect(await renameDeck(db, 'Japanese', ' 日本語 ')).toBe('日本語');
    expect(await deckPaths(db)).toEqual(['Other', '日本語', '日本語::Verbs']);
    expect(await db.getAllAsync('SELECT path, new_per_day FROM anki_deck_limits')).toEqual([{ path: '日本語::Verbs', new_per_day: 5 }]);
    expect((await cardsOf(db)).map((c) => c.deck)).toEqual(['日本語', '日本語::Verbs', 'Other']);

    await expect(renameDeck(db, '日本語', 'Other')).rejects.toThrow('already a deck');
    // Moving a deck inside itself still works.
    await renameDeck(db, '日本語', '日本語::Old');
    expect(await deckPaths(db)).toEqual(['Other', '日本語', '日本語::Old', '日本語::Old::Verbs']);
  });

  it('refuses a note with nothing to study', async () => {
    const db = await freshDb();
    await expect(addNote(db, 'basic', 'Words', ['', 'dog'], NOW)).rejects.toBeInstanceOf(EmptyNoteError);
  });

  it('makes a reversed card only once the back is filled in, like Anki', async () => {
    expect(cardOrdinals(BUILTIN_NOTETYPES.reversed, ['猫', ''])).toEqual([0]);
    const db = await freshDb();
    await addNote(db, 'reversed', 'Words', ['猫', ''], NOW);
    const [card] = await cardsOf(db);
    expect(await updateNote(db, card.note_id, ['猫', 'cat'], NOW)).toBe(1);
    expect((await cardsOf(db)).map((c) => c.ord)).toEqual([0, 1]);
    const note = (await getNote(db, card.note_id))!;
    expect(note).toMatchObject({ values: ['猫', 'cat'], deck: 'Words', cards: 2, builtin: true });
  });

  it('deletes a note with its cards and history', async () => {
    const db = await freshDb();
    await addNote(db, 'basic', 'Words', ['犬', 'dog'], NOW);
    const [card] = await cardsOf(db);
    const study = (await getStudyCard(db, card.id))!;
    await answerCard(db, study.card, previewGrades(study.card, NOW, createAnkiScheduler(false))[Rating.Good], Rating.Good, NOW, 2000);
    await deleteNote(db, card.note_id);
    expect(await cardsOf(db)).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM anki_revlog')).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM anki_notes')).toEqual([]);
    // The deck stays (now empty).
    expect(await deckPaths(db)).toEqual(['Words']);
  });

  it('edits plain text as text and real HTML as HTML', () => {
    expect(fieldToEditable('a &lt;b&gt;<br>c &amp; d')).toEqual({ text: 'a <b>\nc & d', raw: false });
    expect(editableToField({ text: 'a <b>\nc & d', raw: false })).toBe('a &lt;b&gt;<br>c &amp; d');
    expect(fieldToEditable('<b>bold</b>')).toEqual({ text: '<b>bold</b>', raw: true });
    expect(editableToField({ text: '<b>bold</b>\n', raw: true })).toBe('<b>bold</b>');
  });
});

describe('export', () => {
  it('computes SHA-1 like Anki', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1Hex('食べる')).toHaveLength(40);
  });

  it('finds the media a card uses', () => {
    expect(mediaReferences('<img src="a b.jpg"> [sound:x.mp3] <img src=\'https://e.com/y.png\'> @font-face { src: url("_jp.ttf") }').sort()).toEqual(['_jp.ttf', 'a b.jpg', 'x.mp3']);
  });

  it('round-trips scheduling through Anki’s card columns', () => {
    const crt = exportCrt(NOW);
    const review: AnkiSched = {
      due: NOW + 5 * DAY,
      stability: 12.5,
      difficulty: 4.2,
      elapsed_days: 7,
      scheduled_days: 12,
      learning_steps: 0,
      reps: 6,
      lapses: 1,
      state: State.Review,
      last_review: NOW - 7 * DAY,
      suspended: 0,
      new_position: 0,
    };
    const a = toAnkiCard(review, crt, NOW);
    expect(a).toMatchObject({ type: 2, queue: 2, ivl: 12 });
    const back = convertAnkiCard({ id: 1, nid: 1, did: 1, ord: 0, type: a.type, queue: a.queue, due: a.due, ivl: a.ivl, factor: a.factor, reps: 6, lapses: 1, odue: 0, odid: 0, data: a.data }, crt, NOW);
    expect(back).toMatchObject({ state: State.Review, stability: 12.5, difficulty: 4.2, reps: 6, lapses: 1, scheduled_days: 12 });
    expect(Math.abs(back.due - review.due)).toBeLessThan(DAY);

    const suspendedNew = toAnkiCard({ ...review, state: State.New, suspended: 1, new_position: 7 }, crt, NOW);
    expect(suspendedNew).toMatchObject({ type: 0, queue: -1, due: 7 });
  });

  it('exports a deck with subdecks, progress and history that imports back unchanged', async () => {
    const db = await freshDb();
    await addNote(db, 'basic', 'Japanese', ['犬', 'dog'], NOW - 3 * DAY);
    await addNote(db, 'vocab', 'Japanese::Verbs', ['食べる', 'たべる', 'to eat', '<img src="eat.png">'], NOW - 3 * DAY);
    await addNote(db, 'basic', 'Other', ['not exported', 'x'], NOW - 3 * DAY);
    // Study the first card a few times so it has real progress and history.
    const [first] = await cardsOf(db);
    const sched = createAnkiScheduler(false);
    for (const [t, r] of [
      [NOW - 3 * DAY, Rating.Good],
      [NOW - 3 * DAY + 10 * 60 * 1000, Rating.Good],
      [NOW - 1 * DAY, Rating.Good],
    ] as const) {
      const c = (await getStudyCard(db, first.id))!.card;
      await answerCard(db, c, previewGrades(c, t, sched)[r], r, t, 4000);
    }
    const before = (await getStudyCard(db, first.id))!.card;
    expect(before.state).toBe(State.Review);

    const ex = await readDeckExport(db, 'Japanese');
    expect(ex.cards).toHaveLength(2);
    expect(ex.notes.map((n) => n.values[0])).toEqual(['犬', '食べる']);
    expect(ex.media).toEqual(['eat.png']);

    // Write the collection to a real SQLite file and zip it like the app does.
    const path = join(mkdtempSync(join(tmpdir(), 'kaeru-export-')), 'collection.anki2');
    const out = openNodeDb(path);
    await writeCollection(out, ex, NOW);
    await out.closeAsync();
    const pkg = buildPackage(new Uint8Array(readFileSync(path)), [{ name: 'eat.png', bytes: new Uint8Array([1, 2, 3]) }]);

    // Unpack and read it with the importer, as Anki-format input.
    let pos = 0;
    const entries = new Map<string, Uint8Array>();
    const unpacked = await unpackPackage(
      (n) => {
        const chunk = pkg.subarray(pos, pos + n);
        pos += chunk.length;
        return chunk;
      },
      pkg.length,
      { entry: (name, bytes) => void entries.set(name, bytes) },
    );
    expect(unpacked.collection).toBe('collection.anki2');
    expect([...unpacked.mediaMap.values()]).toEqual(['eat.png']);
    const readPath = join(mkdtempSync(join(tmpdir(), 'kaeru-read-')), 'c.db');
    require('fs').writeFileSync(readPath, entries.get('collection.anki2')!);
    const reader = openNodeDb(readPath);
    const col = await readCollection(reader);
    await reader.closeAsync();
    expect(col.decks.map((d) => d.name).sort()).toEqual(['Default', 'Japanese', 'Japanese::Verbs']);
    expect(col.revlog).toHaveLength(3);

    // Into a fresh app: same notes, same progress.
    const other = await freshDb();
    const summary = await saveCollection(other, col, 'Japanese.apkg', NOW);
    expect(summary).toMatchObject({ notes: 2, cards: 2, reviews: 3 });
    const imported = await cardsOf(other);
    const again = (await getStudyCard(other, imported[0].id))!;
    expect(again.fields).toEqual({ Front: '犬', Back: 'dog' });
    expect(again.card).toMatchObject({ state: State.Review, reps: before.reps, lapses: before.lapses, scheduled_days: before.scheduled_days });
    expect(again.card.stability).toBeCloseTo(before.stability, 3);
    expect(again.card.difficulty).toBeCloseTo(before.difficulty, 3);
    expect(Math.abs(again.card.due - before.due)).toBeLessThan(DAY);
    expect((await getStudyCard(other, imported[1].id))!.notetype.name).toBe('Kaeru Japanese Vocab');

    // Back into the original app: matched by guid, nothing duplicated.
    const back = await saveCollection(db, col, 'Japanese.apkg', NOW);
    expect(back).toMatchObject({ cards: 0, reviews: 3 });
    expect(await cardsOf(db)).toHaveLength(3);
  });
});
