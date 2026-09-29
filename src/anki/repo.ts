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

export interface Limits {
  newPerDay: number;
  reviewsPerDay: number;
}

/** Cards introduced / reviews done today in a subtree (answers made in this app). */
async function doneToday(db: Db, path: string, now: number): Promise<{ newDone: number; reviewsDone: number }> {
  const t = subtree(path);
  const row = await db.getFirstAsync<{ newDone: number; reviewsDone: number }>(
    `SELECT
       COUNT(DISTINCT CASE WHEN r.prev_state = 0 THEN r.card_id END) AS newDone,
       COUNT(CASE WHEN r.prev_state = ${State.Review} THEN 1 END) AS reviewsDone
     FROM anki_revlog r JOIN anki_cards c ON c.id = r.card_id
     WHERE r.imported = 0 AND r.reviewed_at >= ? AND c.${t.sql}`,
    startOfDay(now),
    ...t.params,
  );
  return { newDone: row?.newDone ?? 0, reviewsDone: row?.reviewsDone ?? 0 };
}

/** Every deck and parent deck, with Anki-style new / learning / review counts (including subdecks). */
export async function listDecks(db: Db, now: number, limits: Limits): Promise<DeckNode[]> {
  const rows = await db.getAllAsync<{ name: string; state: number; due: number }>(
    `SELECT d.name, c.state, c.due FROM anki_cards c JOIN anki_decks d ON d.id = c.deck_id WHERE c.suspended = 0`,
  );
  const decks = await db.getAllAsync<{ name: string }>('SELECT DISTINCT d.name FROM anki_decks d JOIN anki_cards c ON c.deck_id = d.id');
  const paths = new Set<string>();
  for (const d of decks) {
    const parts = d.name.split('::');
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('::'));
  }
  const nodes: DeckNode[] = [];
  const endToday = endOfDay(now);
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const inTree = rows.filter((r) => r.name === path || r.name.startsWith(`${path}::`));
    const { newDone, reviewsDone } = await doneToday(db, path, now);
    const newAvail = inTree.filter((r) => r.state === State.New).length;
    const learn = inTree.filter((r) => (r.state === State.Learning || r.state === State.Relearning) && r.due <= now + LEARN_AHEAD_MS).length;
    const review = inTree.filter((r) => r.state === State.Review && r.due < endToday).length;
    const parts = path.split('::');
    nodes.push({
      path,
      name: parts[parts.length - 1],
      depth: parts.length - 1,
      newCount: Math.max(0, Math.min(newAvail, limits.newPerDay - newDone)),
      learnCount: learn,
      reviewCount: Math.max(0, Math.min(review, limits.reviewsPerDay - reviewsDone)),
      total: inTree.length,
    });
  }
  return nodes;
}

/**
 * Card ids for a study session, in order: learning cards due now, then reviews due today
 * mixed evenly with today's new cards (Anki's default "mix new with reviews").
 */
export async function buildStudyQueue(db: Db, path: string, now: number, limits: Limits): Promise<number[]> {
  const t = subtree(path);
  const { newDone, reviewsDone } = await doneToday(db, path, now);
  const learning = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM anki_cards WHERE suspended = 0 AND state IN (${State.Learning}, ${State.Relearning}) AND due <= ? AND ${t.sql} ORDER BY due`,
    now + LEARN_AHEAD_MS,
    ...t.params,
  );
  const reviews = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM anki_cards WHERE suspended = 0 AND state = ${State.Review} AND due < ? AND ${t.sql} ORDER BY due LIMIT ?`,
    endOfDay(now),
    ...t.params,
    Math.max(0, limits.reviewsPerDay - reviewsDone),
  );
  const fresh = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM anki_cards WHERE suspended = 0 AND state = ${State.New} AND ${t.sql} ORDER BY new_position, id LIMIT ?`,
    ...t.params,
    Math.max(0, limits.newPerDay - newDone),
  );
  return [...learning.map((r) => r.id), ...interleave(reviews.map((r) => r.id), fresh.map((r) => r.id))];
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
    await txn.runAsync(`DELETE FROM anki_decks WHERE id NOT IN (SELECT DISTINCT deck_id FROM anki_cards)`);
    await txn.runAsync('DELETE FROM anki_notes WHERE id NOT IN (SELECT DISTINCT note_id FROM anki_cards)');
    await txn.runAsync('DELETE FROM anki_notetypes WHERE id NOT IN (SELECT DISTINCT notetype_id FROM anki_notes)');
  });
}

export async function reviewsToday(db: Db, now: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_revlog WHERE imported = 0 AND reviewed_at >= ?', startOfDay(now));
  return row?.n ?? 0;
}
