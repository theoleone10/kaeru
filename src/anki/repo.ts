import type { SQLiteDatabase } from 'expo-sqlite';
import { transaction } from '../db/repo';
import type { AnkiNotetype } from './collection';
import { State, type AnkiSched } from './schedule';

const DAY = 24 * 60 * 60 * 1000;
/** Like Anki's "learn ahead limit": learning cards due this soon may be shown early. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

type Db = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'execAsync' | 'prepareAsync' | 'withExclusiveTransactionAsync' | 'withTransactionAsync'>;

export interface AnkiCardRecord extends AnkiSched {
  id: number;
  note_id: number;
  deck_id: number;
  ord: number;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(t: number): number {
  return startOfDay(t) + DAY + 1000; // midnight, with slack for DST
}

/** SQL condition selecting a deck and all its subdecks by name path. */
function subtree(path: string): { sql: string; params: (string | number)[] } {
  const prefix = `${path}::`;
  return {
    sql: 'deck_id IN (SELECT id FROM anki_decks WHERE name = ? OR substr(name, 1, ?) = ?)',
    params: [path, prefix.length, prefix],
  };
}

export interface DeckNode {
  /** Full "::" path; also the key for studying it. */
  path: string;
  name: string;
  depth: number;
  newCount: number;
  learnCount: number;
  reviewCount: number;
  total: number;
}

/** The defaults from Settings; a deck's own limits (see setDeckLimits) override them. */
export interface Limits {
  newPerDay: number;
  reviewsPerDay: number;
}

/** A deck's own daily limits; null means it uses the default. */
export interface DeckLimits {
  newPerDay: number | null;
  reviewsPerDay: number | null;
}

export async function getDeckLimits(db: Db, path: string): Promise<DeckLimits> {
  const row = await db.getFirstAsync<{ new_per_day: number | null; reviews_per_day: number | null }>(
    'SELECT new_per_day, reviews_per_day FROM anki_deck_limits WHERE path = ?',
    path,
  );
  return { newPerDay: row?.new_per_day ?? null, reviewsPerDay: row?.reviews_per_day ?? null };
}

export async function setDeckLimits(db: Db, path: string, limits: DeckLimits): Promise<void> {
  if (limits.newPerDay == null && limits.reviewsPerDay == null) {
    await db.runAsync('DELETE FROM anki_deck_limits WHERE path = ?', path);
    return;
  }
  await db.runAsync(
    'INSERT INTO anki_deck_limits (path, new_per_day, reviews_per_day) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET new_per_day = excluded.new_per_day, reviews_per_day = excluded.reviews_per_day',
    path,
    limits.newPerDay,
    limits.reviewsPerDay,
  );
}

const inSubtree = (name: string, path: string) => name === path || name.startsWith(`${path}::`);

/**
 * How many more new cards and reviews each deck allows today: its own limit (or the default)
 * minus what was done today in it and its subdecks (answers made in this app).
 */
async function remainingToday(db: Db, now: number, defaults: Limits): Promise<{ newLeft: (path: string) => number; reviewsLeft: (path: string) => number }> {
  const done = await db.getAllAsync<{ name: string; newDone: number; reviewsDone: number }>(
    `SELECT d.name,
       COUNT(DISTINCT CASE WHEN r.prev_state = ${State.New} THEN r.card_id END) AS newDone,
       COUNT(CASE WHEN r.prev_state = ${State.Review} THEN 1 END) AS reviewsDone
     FROM anki_revlog r JOIN anki_cards c ON c.id = r.card_id JOIN anki_decks d ON d.id = c.deck_id
     WHERE r.imported = 0 AND r.reviewed_at >= ?
     GROUP BY d.name`,
    startOfDay(now),
  );
  const own = new Map(
    (await db.getAllAsync<{ path: string; new_per_day: number | null; reviews_per_day: number | null }>('SELECT * FROM anki_deck_limits')).map((r) => [r.path, r]),
  );
  const sum = (path: string, key: 'newDone' | 'reviewsDone') => done.filter((d) => inSubtree(d.name, path)).reduce((n, d) => n + d[key], 0);
  return {
    newLeft: (path) => Math.max(0, (own.get(path)?.new_per_day ?? defaults.newPerDay) - sum(path, 'newDone')),
    reviewsLeft: (path) => Math.max(0, (own.get(path)?.reviews_per_day ?? defaults.reviewsPerDay) - sum(path, 'reviewsDone')),
  };
}

/**
 * Like Anki: studying `root`, a card is taken only while its own deck and every parent up to
 * `root` still have room today (so a subdeck's limit holds inside its parent's session too).
 */
export function takeWithinLimits<C extends { deck: string }>(cards: C[], root: string, left: (path: string) => number): C[] {
  const room = new Map<string, number>();
  const taken: C[] = [];
  const rootDepth = root.split('::').length;
  for (const card of cards) {
    const parts = card.deck.split('::');
    const chain: string[] = [];
    for (let i = rootDepth; i <= parts.length; i++) chain.push(parts.slice(0, i).join('::'));
    for (const p of chain) if (!room.has(p)) room.set(p, left(p));
    if (chain.every((p) => room.get(p)! > 0)) {
      for (const p of chain) room.set(p, room.get(p)! - 1);
      taken.push(card);
    }
  }
  return taken;
}

/**
 * How many cards a deck tree gives today with Anki's nested limits: a deck's own cards plus what
 * each subdeck gives, capped by the deck's own room. This is exactly what takeWithinLimits takes
 * from the same cards, whatever their order.
 */
function nestedCount(path: string, own: Map<string, number>, children: Map<string, string[]>, left: (path: string) => number, memo: Map<string, number>): number {
  const hit = memo.get(path);
  if (hit !== undefined) return hit;
  const sub = (children.get(path) ?? []).reduce((n, c) => n + nestedCount(c, own, children, left, memo), 0);
  const n = Math.min(left(path), (own.get(path) ?? 0) + sub);
  memo.set(path, n);
  return n;
}

/**
 * Every deck and parent deck, with Anki-style new / learning / review counts (including
 * subdecks). Counted per deck in SQL, so it stays quick with tens of thousands of cards.
 */
export async function listDecks(db: Db, now: number, defaults: Limits): Promise<DeckNode[]> {
  const rows = await db.getAllAsync<{ deck: string; fresh: number; learn: number; review: number; total: number }>(
    `SELECT d.name AS deck,
       TOTAL(c.state = ${State.New}) AS fresh,
       TOTAL(c.state IN (${State.Learning}, ${State.Relearning}) AND c.due <= ?) AS learn,
       TOTAL(c.state = ${State.Review} AND c.due < ?) AS review,
       COUNT(c.id) AS total
     FROM anki_decks d LEFT JOIN anki_cards c ON c.deck_id = d.id AND c.suspended = 0
     GROUP BY d.name`,
    now + LEARN_AHEAD_MS,
    endOfDay(now),
  );
  const paths = new Set<string>();
  const children = new Map<string, string[]>();
  for (const r of rows) {
    const parts = r.deck.split('::');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('::');
      if (paths.has(p)) continue;
      paths.add(p);
      if (i > 1) {
        const parent = parts.slice(0, i - 1).join('::');
        children.set(parent, [...(children.get(parent) ?? []), p]);
      }
    }
  }
  const { newLeft, reviewsLeft } = await remainingToday(db, now, defaults);
  const own = (key: 'fresh' | 'review') => new Map(rows.map((r) => [r.deck, r[key]]));
  const ownNew = own('fresh');
  const ownReview = own('review');
  const newMemo = new Map<string, number>();
  const reviewMemo = new Map<string, number>();
  const sumTree = (path: string, key: 'learn' | 'total') => rows.filter((r) => inSubtree(r.deck, path)).reduce((n, r) => n + r[key], 0);

  return [...paths]
    .sort((a, b) => a.localeCompare(b))
    .map((path) => {
      const parts = path.split('::');
      return {
        path,
        name: parts[parts.length - 1],
        depth: parts.length - 1,
        newCount: nestedCount(path, ownNew, children, newLeft, newMemo),
        learnCount: sumTree(path, 'learn'),
        reviewCount: nestedCount(path, ownReview, children, reviewsLeft, reviewMemo),
        total: sumTree(path, 'total'),
      };
    });
}

/**
 * Card ids for a study session, in order: learning cards due now, then reviews due today
 * mixed evenly with today's new cards (Anki's default "mix new with reviews").
 *
 * Each deck can give at most `left(path)` cards (every deck's limits include the studied
 * deck's), and what it gives is always the start of its own list, so only that many are read
 * per deck instead of every new card in the collection.
 */
export async function buildStudyQueue(db: Db, path: string, now: number, defaults: Limits): Promise<number[]> {
  const t = subtree(path);
  const { newLeft, reviewsLeft } = await remainingToday(db, now, defaults);
  const learning = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM anki_cards WHERE suspended = 0 AND state IN (${State.Learning}, ${State.Relearning}) AND due <= ? AND ${t.sql} ORDER BY due`,
    now + LEARN_AHEAD_MS,
    ...t.params,
  );
  const decks = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM anki_decks WHERE name = ? OR substr(name, 1, ?) = ?', ...t.params);
  /** The first `bound` matching cards of each deck (one indexed query per deck), merged in study order. */
  const firstPerDeck = async (where: string, order: 'due' | 'new_position', bound: number, ...params: number[]) => {
    if (bound <= 0) return [];
    const out: { id: number; deck: string; key: number }[] = [];
    for (const d of decks) {
      const rows = await db.getAllAsync<{ id: number; key: number }>(
        `SELECT id, ${order} AS key FROM anki_cards WHERE deck_id = ? AND suspended = 0 AND ${where} ORDER BY ${order}, id LIMIT ?`,
        d.id,
        ...params,
        bound,
      );
      for (const r of rows) out.push({ ...r, deck: d.name });
    }
    return out.sort((x, y) => x.key - y.key || x.id - y.id);
  };
  const reviews = await firstPerDeck(`state = ${State.Review} AND due < ?`, 'due', reviewsLeft(path), endOfDay(now));
  const fresh = await firstPerDeck(`state = ${State.New}`, 'new_position', newLeft(path));
  return [
    ...learning.map((r) => r.id),
    ...interleave(
      takeWithinLimits(reviews, path, reviewsLeft).map((r) => r.id),
      takeWithinLimits(fresh, path, newLeft).map((r) => r.id),
    ),
  ];
}

/** Spread `b` evenly through `a`. */
export function interleave<T>(a: T[], b: T[]): T[] {
  if (b.length === 0) return a;
  if (a.length === 0) return b;
  const out: T[] = [];
  const step = (a.length + b.length) / b.length;
  let ai = 0;
  let bi = 0;
  for (let i = 0; i < a.length + b.length; i++) {
    const wantB = bi < b.length && (ai >= a.length || Math.floor((i + 1) / step) > bi);
    out.push(wantB ? b[bi++] : a[ai++]);
  }
  return out;
}

export interface StudyCard {
  card: AnkiCardRecord;
  fields: Record<string, string>;
  tags: string;
  deck: string;
  notetype: AnkiNotetype;
}

export async function getStudyCard(db: Db, id: number): Promise<StudyCard | null> {
  const row = await db.getFirstAsync<
    AnkiCardRecord & { note_fields: string; tags: string; deck: string; nt_name: string; is_cloze: number; css: string; nt_fields: string; templates: string; nt_anki: number }
  >(
    `SELECT c.*, n.fields AS note_fields, n.tags, d.name AS deck, t.name AS nt_name, t.is_cloze, t.css, t.fields AS nt_fields, t.templates, t.anki_id AS nt_anki
     FROM anki_cards c JOIN anki_notes n ON n.id = c.note_id JOIN anki_notetypes t ON t.id = n.notetype_id JOIN anki_decks d ON d.id = c.deck_id
     WHERE c.id = ?`,
    id,
  );
  if (!row) return null;
  const names = JSON.parse(row.nt_fields) as string[];
  const values = JSON.parse(row.note_fields) as string[];
  const fields: Record<string, string> = {};
  names.forEach((n, i) => (fields[n] = values[i] ?? ''));
  const { note_fields: _nf, tags, deck, nt_name, is_cloze, css, nt_fields: _ntf, templates, nt_anki, ...card } = row;
  return {
    card,
    fields,
    tags,
    deck,
    notetype: { ankiId: nt_anki, name: nt_name, isCloze: is_cloze === 1, css, fields: names, templates: JSON.parse(templates) },
  };
}

const SCHED_COLS = ['due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses', 'state', 'last_review'] as const;

/** Save an answer. Returns the review log id (for undo). */
export async function answerCard(db: Db, before: AnkiCardRecord, after: AnkiSched, rating: number, now: number, durationMs: number): Promise<number> {
  let logId = 0;
  await transaction(db as SQLiteDatabase, async (txn) => {
    await txn.runAsync(`UPDATE anki_cards SET ${SCHED_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...SCHED_COLS.map((c) => after[c]), before.id);
    const res = await txn.runAsync(
      'INSERT INTO anki_revlog (card_id, reviewed_at, rating, prev_state, duration_ms, imported, prev_card) VALUES (?, ?, ?, ?, ?, 0, ?)',
      before.id,
      now,
      rating,
      before.state,
      durationMs,
      JSON.stringify(before),
    );
    logId = res.lastInsertRowId;
  });
  return logId;
}

/** Undo an answer: restore the card exactly as it was and drop the log. Returns the restored card id. */
export async function undoAnswer(db: Db, logId: number): Promise<number | null> {
  const log = await db.getFirstAsync<{ prev_card: string | null; card_id: number }>('SELECT prev_card, card_id FROM anki_revlog WHERE id = ?', logId);
  if (!log?.prev_card) return null;
  const prev = JSON.parse(log.prev_card) as AnkiCardRecord;
  await transaction(db as SQLiteDatabase, async (txn) => {
    await txn.runAsync(`UPDATE anki_cards SET ${SCHED_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...SCHED_COLS.map((c) => prev[c]), prev.id);
    await txn.runAsync('DELETE FROM anki_revlog WHERE id = ?', logId);
  });
  return log.card_id;
}

export async function setCardSuspended(db: Db, id: number, suspended: boolean): Promise<void> {
  await db.runAsync('UPDATE anki_cards SET suspended = ? WHERE id = ?', suspended ? 1 : 0, id);
}

/** Next time something in the subtree becomes due (for the "come back at" message). */
export async function nextDue(db: Db, path: string, now: number): Promise<number | null> {
  const t = subtree(path);
  const row = await db.getFirstAsync<{ due: number | null }>(
    `SELECT MIN(due) AS due FROM anki_cards WHERE suspended = 0 AND state != ${State.New} AND due > ? AND ${t.sql}`,
    now,
    ...t.params,
  );
  return row?.due ?? null;
}

/** Delete a deck and its subdecks, plus notes and note types nothing uses any more. */
export async function deleteDeck(db: Db, path: string): Promise<void> {
  const t = subtree(path);
  await transaction(db as SQLiteDatabase, async (txn) => {
    await txn.runAsync(`DELETE FROM anki_cards WHERE ${t.sql}`, ...t.params);
    await txn.runAsync('DELETE FROM anki_deck_limits WHERE path = ? OR substr(path, 1, ?) = ?', ...t.params);
    await txn.runAsync('DELETE FROM anki_decks WHERE name = ? OR substr(name, 1, ?) = ?', ...t.params);
    await txn.runAsync('DELETE FROM anki_notes WHERE id NOT IN (SELECT DISTINCT note_id FROM anki_cards)');
    await txn.runAsync('DELETE FROM anki_notetypes WHERE id NOT IN (SELECT DISTINCT notetype_id FROM anki_notes)');
  });
}

export async function reviewsToday(db: Db, now: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_revlog WHERE imported = 0 AND reviewed_at >= ?', startOfDay(now));
  return row?.n ?? 0;
}

/** Today's flashcard work across all top-level decks, and the first deck with something to study. */
export async function ankiToday(db: Db, now: number, limits: Limits): Promise<{ decks: number; due: number; firstDeck: string | null; reviewed: number }> {
  const top = (await listDecks(db, now, limits)).filter((d) => d.depth === 0);
  const todo = (d: DeckNode) => d.newCount + d.learnCount + d.reviewCount;
  return {
    decks: top.length,
    due: top.reduce((s, d) => s + todo(d), 0),
    firstDeck: top.find((d) => todo(d) > 0)?.path ?? null,
    reviewed: await reviewsToday(db, now),
  };
}

/** Anki's card maturity: young until the interval reaches three weeks. */
export const MATURE_DAYS = 21;

export interface DeckMaturity {
  /** Top-level deck; subdecks count toward it. */
  path: string;
  new: number;
  /** Learning, relearning, and reviews with an interval under three weeks. */
  young: number;
  mature: number;
}

/** New / young / mature card counts for each top-level deck (suspended cards left out). */
export async function deckMaturity(db: Db): Promise<DeckMaturity[]> {
  const rows = await db.getAllAsync<{ top: string; n: number; m: number; t: number }>(
    `SELECT CASE WHEN instr(d.name, '::') > 0 THEN substr(d.name, 1, instr(d.name, '::') - 1) ELSE d.name END AS top,
            TOTAL(c.state = ${State.New}) AS n,
            TOTAL(c.state = ${State.Review} AND c.scheduled_days >= ${MATURE_DAYS}) AS m,
            COUNT(*) AS t
     FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id
     WHERE c.suspended = 0
     GROUP BY top ORDER BY top`,
  );
  return rows.map((r) => ({ path: r.top, new: r.n, mature: r.m, young: r.t - r.n - r.m }));
}

/** Due times of every studied (not new), unsuspended flashcard, for the review forecast. */
export async function ankiDueTimes(db: Db): Promise<number[]> {
  const rows = await db.getAllAsync<{ due: number }>(`SELECT due FROM anki_cards WHERE suspended = 0 AND state != ${State.New}`);
  return rows.map((r) => r.due);
}
