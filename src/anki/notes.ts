import type { SQLiteDatabase } from 'expo-sqlite';
import { transaction } from '../db/repo';
import type { AnkiNotetype } from './collection';
import { clozeNumbers, renderTemplate, stripHtml } from './render';
import { State } from './schedule';

type Db = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'execAsync' | 'prepareAsync' | 'withExclusiveTransactionAsync' | 'withTransactionAsync'>;

const CARD_CSS = `.card {
  font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
  font-size: 22px;
  text-align: center;
}`;

export type BuiltinKind = 'basic' | 'reversed' | 'vocab';

/**
 * Note types Kaeru can make cards with. Fixed Anki ids, so cards made on different phones
 * (or exported and imported again) share one note type instead of piling up copies.
 */
export const BUILTIN_NOTETYPES: Record<BuiltinKind, AnkiNotetype & { label: string; hint: Record<string, string> }> = {
  basic: {
    ankiId: 1735689600001,
    name: 'Kaeru Basic',
    label: 'Basic',
    isCloze: false,
    css: CARD_CSS,
    fields: ['Front', 'Back'],
    hint: { Front: '食べる', Back: 'to eat' },
    templates: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}' }],
  },
  reversed: {
    ankiId: 1735689600002,
    name: 'Kaeru Basic (and reversed card)',
    label: 'Basic + reversed',
    isCloze: false,
    css: CARD_CSS,
    fields: ['Front', 'Back'],
    hint: { Front: '食べる', Back: 'to eat' },
    templates: [
      { name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}' },
      { name: 'Card 2', qfmt: '{{Back}}', afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}' },
    ],
  },
  vocab: {
    ankiId: 1735689600003,
    name: 'Kaeru Japanese Vocab',
    label: 'Japanese vocab',
    isCloze: false,
    css: `${CARD_CSS}
.word { font-size: 44px; margin: 12px 0; }
.word rt { font-size: 0.4em; }
.meaning { font-size: 24px; }
.example { font-size: 18px; margin-top: 16px; opacity: 0.75; }`,
    fields: ['Word', 'Reading', 'Meaning', 'Example'],
    hint: { Word: '食べる', Reading: 'たべる', Meaning: 'to eat', Example: '朝ごはんを食べる。' },
    templates: [
      {
        name: 'Recognition',
        qfmt: '<div class="word">{{Word}}</div>',
        afmt: '<div class="word">{{#Reading}}<ruby>{{Word}}<rt>{{Reading}}</rt></ruby>{{/Reading}}{{^Reading}}{{Word}}{{/Reading}}</div>\n\n<hr id=answer>\n\n<div class="meaning">{{Meaning}}</div>\n{{#Example}}<div class="example">{{Example}}</div>{{/Example}}',
      },
    ],
  },
};

const BUILTIN_IDS = new Set(Object.values(BUILTIN_NOTETYPES).map((n) => n.ankiId));

/** Make sure a built-in note type is in the database; returns its row id. */
export async function ensureNotetype(db: Pick<Db, 'runAsync' | 'getFirstAsync'>, nt: AnkiNotetype): Promise<number> {
  await db.runAsync(
    `INSERT INTO anki_notetypes (anki_id, name, is_cloze, css, fields, templates) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(anki_id) DO NOTHING`,
    nt.ankiId,
    nt.name,
    nt.isCloze ? 1 : 0,
    nt.css,
    JSON.stringify(nt.fields),
    JSON.stringify(nt.templates),
  );
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM anki_notetypes WHERE anki_id = ?', nt.ankiId);
  return row!.id;
}

// ---------- Fields: plain text in the editor, HTML in the note ----------

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A field as the editor shows it: plain text, unless it holds real HTML (then it's edited as-is). */
export function fieldToEditable(html: string): { text: string; raw: boolean } {
  if (/<(?!br\s*\/?>)[a-z/!]/i.test(html)) return { text: html, raw: true };
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  return { text, raw: false };
}

export function editableToField(e: { text: string; raw: boolean }): string {
  const t = e.text.replace(/\s+$/, '');
  return e.raw ? t : escapeHtml(t).replace(/\n/g, '<br>');
}

// ---------- Decks ----------

/** Normalise a deck path typed by the user ("Japanese :: Verbs" → "Japanese::Verbs"). */
export function cleanDeckPath(path: string): string {
  return path
    .split('::')
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('::');
}

/** Create a deck (and nothing else); returns its row id. An existing deck with that path is reused. */
export async function createDeck(db: Pick<Db, 'runAsync' | 'getFirstAsync'>, path: string, now = Date.now()): Promise<number> {
  const name = cleanDeckPath(path);
  if (!name) throw new Error('Give the deck a name.');
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM anki_decks WHERE name = ?', name);
  if (existing) return existing.id;
  const top = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(anki_id) AS m FROM anki_decks');
  const ankiId = Math.max(now, (top?.m ?? 0) + 1);
  const res = await db.runAsync('INSERT INTO anki_decks (anki_id, name) VALUES (?, ?)', ankiId, name);
  return res.lastInsertRowId;
}

/**
 * Rename a deck, moving its subdecks with it ("::" in the new name moves it under another
 * deck). Its own daily limits follow. Refuses if a deck with the new name already exists.
 */
export async function renameDeck(db: Db, from: string, to: string): Promise<string> {
  const target = cleanDeckPath(to);
  if (!target) throw new Error('Give the deck a name.');
  if (target === from) return target;
  const prefix = `${from}::`;
  const rows = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM anki_decks WHERE name = ? OR substr(name, 1, ?) = ?', from, prefix.length, prefix);
  if (rows.length === 0) throw new Error('This deck no longer exists.');
  const renamed = (name: string) => target + name.slice(from.length);
  const moving = new Set(rows.map((r) => r.id));
  const taken = await db.getAllAsync<{ id: number; name: string }>(
    `SELECT id, name FROM anki_decks WHERE name IN (${rows.map(() => '?').join(', ')})`,
    ...rows.map((r) => renamed(r.name)),
  );
  const clash = taken.find((t) => !moving.has(t.id));
  if (clash) throw new Error(`There’s already a deck called “${clash.name.replaceAll('::', ' › ')}”.`);

  await transaction(db as SQLiteDatabase, async (txn) => {
    // Two steps so a rename like A → A::B never collides with itself midway.
    for (const r of rows) await txn.runAsync('UPDATE anki_decks SET name = ? WHERE id = ?', `\u0000${r.id}`, r.id);
    for (const r of rows) await txn.runAsync('UPDATE anki_decks SET name = ? WHERE id = ?', renamed(r.name), r.id);
    await txn.runAsync(
      'UPDATE anki_deck_limits SET path = ? || substr(path, ?) WHERE path = ? OR substr(path, 1, ?) = ?',
      target,
      from.length + 1,
      from,
      prefix.length,
      prefix,
    );
  });
  return target;
}

/** Every deck path you can add cards to, parents included. */
export async function deckPaths(db: Pick<Db, 'getAllAsync'>): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM anki_decks');
  const out = new Set<string>();
  for (const r of rows) {
    const parts = r.name.split('::');
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('::'));
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

// ---------- Notes ----------

/** Which card ordinals a note should have: one per non-empty template front, or per cloze number. */
export function cardOrdinals(nt: Pick<AnkiNotetype, 'isCloze' | 'templates' | 'fields' | 'name'>, values: string[]): number[] {
  if (nt.isCloze) return clozeNumbers(values).map((n) => n - 1);
  const fields: Record<string, string> = {};
  nt.fields.forEach((f, i) => (fields[f] = values[i] ?? ''));
  return nt.templates
    .map((t, ord) => ({ ord, front: renderTemplate(t.qfmt, { fields, ord, isCloze: false, tags: '', deck: '', notetype: nt.name, cardName: t.name }, 'front') }))
    .filter(({ front }) => stripHtml(front).length > 0 || /<img|\[sound/i.test(front))
    .map(({ ord }) => ord);
}

function newGuid(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

type Txn = Pick<Db, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

/** Add new cards (in "new" state, after every other new card) for the given ordinals. */
export async function insertNewCards(txn: Txn, noteId: number, deckId: number, ords: number[], now: number): Promise<void> {
  const pos = await txn.getFirstAsync<{ m: number | null }>('SELECT MAX(new_position) AS m FROM anki_cards');
  let next = (pos?.m ?? 0) + 1;
  for (const ord of ords) {
    await txn.runAsync(
      `INSERT INTO anki_cards (note_id, deck_id, ord, new_position, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, suspended)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?, NULL, 0)`,
      noteId,
      deckId,
      ord,
      next++,
      now,
      State.New,
    );
  }
}

export class EmptyNoteError extends Error {
  constructor() {
    super('Fill in the first field so there’s something to study.');
  }
}

/** Add a note of a built-in type to a deck (created if needed). Returns how many cards it made. */
export async function addNote(db: Db, kind: BuiltinKind, deckPath: string, values: string[], now = Date.now()): Promise<number> {
  const nt = BUILTIN_NOTETYPES[kind];
  const ords = cardOrdinals(nt, values);
  if (ords.length === 0) throw new EmptyNoteError();
  let made = 0;
  await transaction(db as SQLiteDatabase, async (txn) => {
    const ntId = await ensureNotetype(txn, nt);
    const deckId = await createDeck(txn, deckPath, now);
    const res = await txn.runAsync('INSERT INTO anki_notes (notetype_id, guid, fields, tags) VALUES (?, ?, ?, ?)', ntId, newGuid(), JSON.stringify(values), '');
    await insertNewCards(txn, res.lastInsertRowId, deckId, ords, now);
    made = ords.length;
  });
  return made;
}

export interface EditableNote {
  id: number;
  notetype: AnkiNotetype;
  values: string[];
  deck: string;
  cards: number;
  builtin: boolean;
}

export async function getNote(db: Pick<Db, 'getFirstAsync'>, noteId: number): Promise<EditableNote | null> {
  const row = await db.getFirstAsync<{ id: number; fields: string; nt_anki: number; nt_name: string; is_cloze: number; css: string; nt_fields: string; templates: string; deck: string | null; cards: number }>(
    `SELECT n.id, n.fields, t.anki_id AS nt_anki, t.name AS nt_name, t.is_cloze, t.css, t.fields AS nt_fields, t.templates,
       (SELECT d.name FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id WHERE c.note_id = n.id ORDER BY c.ord LIMIT 1) AS deck,
       (SELECT COUNT(*) FROM anki_cards c WHERE c.note_id = n.id) AS cards
     FROM anki_notes n JOIN anki_notetypes t ON t.id = n.notetype_id WHERE n.id = ?`,
    noteId,
  );
  if (!row) return null;
  const names = JSON.parse(row.nt_fields) as string[];
  const values = JSON.parse(row.fields) as string[];
  return {
    id: row.id,
    notetype: { ankiId: row.nt_anki, name: row.nt_name, isCloze: row.is_cloze === 1, css: row.css, fields: names, templates: JSON.parse(row.templates) },
    values: names.map((_, i) => values[i] ?? ''),
    deck: row.deck ?? '',
    cards: row.cards,
    builtin: BUILTIN_IDS.has(row.nt_anki),
  };
}

/**
 * Save edited fields. Like Anki, a template (or cloze number) that now has something on its
 * front gets a new card; cards whose front became empty are kept. Returns the cards added.
 */
export async function updateNote(db: Db, noteId: number, values: string[], now = Date.now()): Promise<number> {
  const note = await getNote(db, noteId);
  if (!note) throw new Error('This card no longer exists.');
  const want = cardOrdinals(note.notetype, values);
  if (want.length === 0 && note.cards === 0) throw new EmptyNoteError();
  let added = 0;
  await transaction(db as SQLiteDatabase, async (txn) => {
    await txn.runAsync('UPDATE anki_notes SET fields = ? WHERE id = ?', JSON.stringify(values), noteId);
    const have = new Set((await txn.getAllAsync<{ ord: number }>('SELECT ord FROM anki_cards WHERE note_id = ?', noteId)).map((r) => r.ord));
    const missing = want.filter((o) => !have.has(o));
    if (missing.length === 0) return;
    const deck = await txn.getFirstAsync<{ deck_id: number }>('SELECT deck_id FROM anki_cards WHERE note_id = ? ORDER BY ord LIMIT 1', noteId);
    if (!deck) return;
    await insertNewCards(txn, noteId, deck.deck_id, missing, now);
    added = missing.length;
  });
  return added;
}

/** Delete a note with all its cards and their review history. */
export async function deleteNote(db: Db, noteId: number): Promise<void> {
  await transaction(db as SQLiteDatabase, async (txn) => {
    await txn.runAsync('DELETE FROM anki_revlog WHERE card_id IN (SELECT id FROM anki_cards WHERE note_id = ?)', noteId);
    await txn.runAsync('DELETE FROM anki_cards WHERE note_id = ?', noteId);
    await txn.runAsync('DELETE FROM anki_notes WHERE id = ?', noteId);
  });
}
