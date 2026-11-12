import type { SQLiteDatabase } from 'expo-sqlite';
import starter from '../../content/starter-words.json';
import { parseFurigana } from '../content/furigana';
import { transaction } from '../db/repo';
import type { AnkiNotetype } from './collection';
import { createDeck, ensureNotetype, insertNewCards } from './notes';

/*
 * The built-in beginner deck: 600 everyday words (content/starter-words.json), most useful
 * first. Added like any other deck, so daily limits, the forecast, export and backups all work
 * on it. Notes have fixed guids: adding it again only brings back words that were deleted, and
 * an exported copy imported later matches the same notes.
 */

export const STARTER_DECK = 'Kaeru Starter 600';
const GUID_PREFIX = 'kaeru-starter-';

/** Word, Reading, Meaning, example (furigana markup), translation. */
export type StarterWord = [string, string, string, string, string];
export const STARTER_WORDS = (starter as unknown as { words: StarterWord[] }).words;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `{漢字|かんじ}` markup as Anki ruby HTML. */
export function rubyHtml(markup: string): string {
  return parseFurigana(markup)
    .map((t) => (t.reading ? `<ruby>${escapeHtml(t.text)}<rt>${escapeHtml(t.reading)}</rt></ruby>` : escapeHtml(t.text)))
    .join('');
}

/** The reading shows on the front too: the card asks for the meaning, and beginners can't read kanji yet. */
export const STARTER_NOTETYPE: AnkiNotetype = {
  ankiId: 1735689600004,
  name: 'Kaeru Starter Words',
  isCloze: false,
  css: `.card {
  font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
  font-size: 22px;
  text-align: center;
}
.word { font-size: 44px; margin: 12px 0; }
.word rt { font-size: 0.4em; }
.meaning { font-size: 26px; font-weight: bold; }
.example { font-size: 20px; margin-top: 20px; }
.example rt { font-size: 0.5em; }
.translation { font-size: 16px; margin-top: 6px; opacity: 0.7; }`,
  fields: ['Word', 'Reading', 'Meaning', 'Example', 'Translation'],
  templates: [
    {
      name: 'Meaning',
      qfmt: '<div class="word">{{#Reading}}<ruby>{{Word}}<rt>{{Reading}}</rt></ruby>{{/Reading}}{{^Reading}}{{Word}}{{/Reading}}</div>',
      afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n<div class="meaning">{{Meaning}}</div>\n<div class="example">{{Example}}</div>\n<div class="translation">{{Translation}}</div>',
    },
  ],
};

/** Note fields for one word. */
export function starterFields([word, reading, meaning, example, translation]: StarterWord): string[] {
  return [escapeHtml(word), escapeHtml(reading), escapeHtml(meaning), rubyHtml(example), escapeHtml(translation)];
}

/** How many of the starter words are in the collection now. */
export async function starterWordsAdded(db: Pick<SQLiteDatabase, 'getFirstAsync'>): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_notes WHERE substr(guid, 1, ?) = ?', GUID_PREFIX.length, GUID_PREFIX);
  return row?.n ?? 0;
}

/**
 * Add the starter deck (or the words missing from it), in order. Returns how many words were
 * added. Words already in the collection, wherever they've been moved, are left alone.
 */
export async function addStarterDeck(db: SQLiteDatabase, now = Date.now()): Promise<number> {
  let added = 0;
  await transaction(db, async (txn) => {
    const ntId = await ensureNotetype(txn, STARTER_NOTETYPE);
    const deckId = await createDeck(txn, STARTER_DECK, now);
    const have = new Set(
      (await txn.getAllAsync<{ guid: string }>('SELECT guid FROM anki_notes WHERE substr(guid, 1, ?) = ?', GUID_PREFIX.length, GUID_PREFIX)).map((r) => r.guid),
    );
    for (const [i, word] of STARTER_WORDS.entries()) {
      const guid = `${GUID_PREFIX}${i + 1}`;
      if (have.has(guid)) continue;
      const res = await txn.runAsync('INSERT INTO anki_notes (notetype_id, guid, fields, tags) VALUES (?, ?, ?, ?)', ntId, guid, JSON.stringify(starterFields(word)), 'kaeru-starter');
      await insertNewCards(txn, res.lastInsertRowId, deckId, [0], now);
      added++;
    }
  });
  return added;
}
