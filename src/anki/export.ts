import { strToU8, zipSync } from 'fflate';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { AnkiNotetype } from './collection';
import { stripHtml } from './render';
import { ankiRevlogType, toAnkiCard, type AnkiSched } from './schedule';
import { sha1Hex } from './sha1';

/**
 * Exporting a deck as an .apkg Anki can import, with scheduling and history.
 *
 * The package uses Anki's long-standing "schema 11" layout (collection.anki2: plain SQLite
 * with note types and decks as JSON), which every Anki since 2.1 — desktop, AnkiMobile and
 * AnkiDroid — imports. Card progress goes both into the classic SM-2 columns and, as FSRS
 * memory state, into card.data, which Anki uses when FSRS is on.
 */

const DAY = 24 * 60 * 60 * 1000;
const FIELD_SEP = '\x1f';

type Reader = Pick<SQLiteDatabase, 'getAllAsync'>;
/** What the collection writer needs: expo-sqlite, or node:sqlite in tests. */
export type SqlWriter = Pick<SQLiteDatabase, 'execAsync' | 'runAsync'>;

interface ExportCard extends AnkiSched {
  id: number;
  note_id: number;
  deck: string;
  ord: number;
}

export interface DeckExport {
  path: string;
  decks: { ankiId: number; name: string }[];
  notetypes: AnkiNotetype[];
  notes: { id: number; guid: string; ntAnkiId: number; values: string[]; tags: string }[];
  cards: ExportCard[];
  revlog: { card_id: number; reviewed_at: number; rating: number; prev_state: number; duration_ms: number | null }[];
  /** Media file names the notes and note types refer to. */
  media: string[];
}

/** Every media file a piece of card HTML refers to: images, audio, and "_font.ttf"-style CSS assets. */
export function mediaReferences(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<img[^>]*?\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) out.add(m[1] ?? m[2] ?? m[3]);
  for (const m of html.matchAll(/\[sound:([^\]]+)\]/g)) out.add(m[1].trim());
  for (const m of html.matchAll(/url\(\s*["']?(_[^"')]+)["']?\s*\)/g)) out.add(m[1]);
  return [...out].filter((n) => !/^(https?:|data:)/i.test(n)).map((n) => {
    try {
      return decodeURIComponent(n);
    } catch {
      return n;
    }
  });
}

/** Read a deck and its subdecks (cards, their notes and note types, history and media names). */
export async function readDeckExport(db: Reader, path: string): Promise<DeckExport> {
  const prefix = `${path}::`;
  const inTree = 'd.name = ? OR substr(d.name, 1, ?) = ?';
  const params = [path, prefix.length, prefix] as const;

  const decks = await db.getAllAsync<{ anki_id: number; name: string }>(`SELECT d.anki_id, d.name FROM anki_decks d WHERE ${inTree}`, ...params);
  const cards = await db.getAllAsync<ExportCard>(`SELECT c.*, d.name AS deck FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id WHERE ${inTree} ORDER BY c.id`, ...params);
  const notes = await db.getAllAsync<{ id: number; guid: string; fields: string; tags: string; nt_anki: number }>(
    `SELECT n.id, n.guid, n.fields, n.tags, t.anki_id AS nt_anki FROM anki_notes n JOIN anki_notetypes t ON t.id = n.notetype_id
     WHERE n.id IN (SELECT c.note_id FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id WHERE ${inTree}) ORDER BY n.id`,
    ...params,
  );
  const notetypes = await db.getAllAsync<{ anki_id: number; name: string; is_cloze: number; css: string; fields: string; templates: string }>(
    `SELECT * FROM anki_notetypes WHERE anki_id IN (${[...new Set(notes.map((n) => n.nt_anki))].join(',') || 'NULL'})`,
  );
  const revlog = await db.getAllAsync<DeckExport['revlog'][number]>(
    `SELECT r.card_id, r.reviewed_at, r.rating, r.prev_state, r.duration_ms FROM anki_revlog r
     WHERE r.card_id IN (SELECT c.id FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id WHERE ${inTree}) ORDER BY r.reviewed_at`,
    ...params,
  );

  const nts: AnkiNotetype[] = notetypes.map((t) => ({
    ankiId: t.anki_id,
    name: t.name,
    isCloze: t.is_cloze === 1,
    css: t.css,
    fields: JSON.parse(t.fields),
    templates: JSON.parse(t.templates),
  }));
  const parsedNotes = notes.map((n) => ({ id: n.id, guid: n.guid, ntAnkiId: n.nt_anki, values: JSON.parse(n.fields) as string[], tags: n.tags }));
  const media = new Set<string>();
  for (const n of parsedNotes) for (const v of n.values) for (const m of mediaReferences(v)) media.add(m);
  for (const t of nts) {
    for (const m of mediaReferences(t.css)) media.add(m);
    for (const tm of t.templates) for (const m of mediaReferences(tm.qfmt + tm.afmt)) media.add(m);
  }

  return { path, decks: decks.map((d) => ({ ankiId: d.anki_id, name: d.name })), notetypes: nts, notes: parsedNotes, cards, revlog, media: [...media] };
}

const SCHEMA_11 = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null,
  dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null,
  tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null,
  usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null,
  data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null,
  lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

const DECK_CONF = {
  id: 1,
  name: 'Default',
  mod: 0,
  usn: 0,
  maxTaken: 60,
  autoplay: true,
  timer: 0,
  replayq: true,
  dyn: false,
  new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
  lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
  rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
};

function deckJson(id: number, name: string, modSec: number) {
  return {
    id,
    name,
    mod: modSec,
    usn: -1,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    browserCollapsed: false,
    desc: '',
    dyn: 0,
    conf: 1,
    extendNew: 0,
    extendRev: 0,
  };
}

function modelJson(nt: AnkiNotetype, deckId: number, modSec: number) {
  return {
    id: nt.ankiId,
    name: nt.name,
    type: nt.isCloze ? 1 : 0,
    mod: modSec,
    usn: -1,
    sortf: 0,
    did: deckId,
    tmpls: nt.templates.map((t, ord) => ({ name: t.name, ord, qfmt: t.qfmt, afmt: t.afmt, did: null, bqfmt: '', bafmt: '' })),
    flds: nt.fields.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
    css: nt.css,
    latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}',
    latexsvg: false,
    req: nt.templates.map((_, ord) => [ord, 'any', nt.fields.map((__, i) => i)]),
    tags: [],
    vers: [],
  };
}

/** 4am local time ten years back: the collection's "creation time", which review due days count from. */
export function exportCrt(now: number): number {
  const d = new Date(now - 3650 * DAY);
  d.setHours(4, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Write the export into an empty SQLite database as an Anki schema-11 collection. */
export async function writeCollection(db: SqlWriter, ex: DeckExport, now: number): Promise<void> {
  const crt = exportCrt(now);
  const modSec = Math.floor(now / 1000);

  // Decks: the exported ones, any parents they need, and Anki's required Default deck.
  const deckIds = new Map(ex.decks.map((d) => [d.name, d.ankiId]));
  let fresh = now;
  for (const name of [...deckIds.keys()]) {
    const parts = name.split('::');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('::');
      if (!deckIds.has(parent)) deckIds.set(parent, ++fresh);
    }
  }
  const decks: Record<string, ReturnType<typeof deckJson>> = {};
  if (![...deckIds.values()].includes(1)) decks['1'] = deckJson(1, 'Default', modSec);
  for (const [name, id] of deckIds) decks[String(id)] = deckJson(id, name, modSec);
  const topDeck = deckIds.get(ex.path) ?? 1;

  const models: Record<string, ReturnType<typeof modelJson>> = {};
  for (const nt of ex.notetypes) models[String(nt.ankiId)] = modelJson(nt, topDeck, modSec);

  const nextPos = ex.cards.reduce((m, c) => Math.max(m, c.new_position), 0) + 1;
  const conf = {
    nextPos,
    estTimes: true,
    activeDecks: [topDeck],
    sortType: 'noteFld',
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: topDeck,
    newSpread: 0,
    dueCounts: true,
    curModel: ex.notetypes[0]?.ankiId ?? null,
    collapseTime: 1200,
  };

  await db.execAsync(SCHEMA_11);
  await db.runAsync(
    'INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
    crt,
    now,
    now,
    JSON.stringify(conf),
    JSON.stringify(models),
    JSON.stringify(decks),
    JSON.stringify({ '1': DECK_CONF }),
    '{}',
  );

  // Ids only need to be unique inside the file; Anki matches notes by guid on import.
  const base = now - ex.cards.length - ex.notes.length - 1;
  const noteIds = new Map<number, number>();
  await db.execAsync('BEGIN');
  try {
    ex.notes.forEach((n, i) => noteIds.set(n.id, base + i));
    for (const n of ex.notes) {
      const sort = stripHtml(n.values[0] ?? '');
      await db.runAsync(
        'INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, ?)',
        noteIds.get(n.id)!,
        n.guid,
        n.ntAnkiId,
        modSec,
        n.tags ? ` ${n.tags.trim()} ` : '',
        n.values.join(FIELD_SEP),
        sort,
        parseInt(sha1Hex(sort).slice(0, 8), 16),
        '',
      );
    }
    const cardIds = new Map<number, number>();
    for (const [i, c] of ex.cards.entries()) {
      const id = base + ex.notes.length + i;
      cardIds.set(c.id, id);
      const a = toAnkiCard(c, crt, now);
      await db.runAsync(
        'INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)',
        id,
        noteIds.get(c.note_id)!,
        deckIds.get(c.deck)!,
        c.ord,
        modSec,
        a.type,
        a.queue,
        a.due,
        a.ivl,
        a.factor,
        c.reps,
        c.lapses,
        a.left,
        a.data,
      );
    }
    const usedIds = new Set<number>();
    for (const r of ex.revlog) {
      const cid = cardIds.get(r.card_id);
      if (cid === undefined) continue;
      let id = r.reviewed_at;
      while (usedIds.has(id)) id++;
      usedIds.add(id);
      await db.runAsync(
        'INSERT INTO revlog VALUES (?, ?, -1, ?, 0, 0, 0, ?, ?)',
        id,
        cid,
        r.rating,
        Math.min(60_000, Math.max(0, r.duration_ms ?? 0)),
        ankiRevlogType(r.prev_state),
      );
    }
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

/** Zip a collection and its media into an .apkg. */
export function buildPackage(collection: Uint8Array, media: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    'collection.anki2': collection,
  };
  const map: Record<string, string> = {};
  media.forEach((m, i) => {
    map[String(i)] = m.name;
    // Images and audio are already compressed: store them as-is.
    files[String(i)] = [m.bytes, { level: 0 }];
  });
  files.media = strToU8(JSON.stringify(map));
  return zipSync(files, { level: 6 });
}
