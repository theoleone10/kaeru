import type { SQLiteDatabase } from 'expo-sqlite';
import { transaction } from '../db/repo';
import type { AnkiCollection } from './collection';
import { convertAnkiCard, convertRevlog } from './schedule';

export interface ImportSummary {
  decks: number;
  notes: number;
  cards: number;
  /** Cards whose Anki progress replaced older progress already in the app. */
  updated: number;
  /** Cards kept as they were because the app's progress was newer. */
  keptNewer: number;
  reviews: number;
}

type Db = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'execAsync' | 'prepareAsync' | 'withExclusiveTransactionAsync' | 'withTransactionAsync'>;

const CARD_COLS = [
  'note_id',
  'deck_id',
  'ord',
  'new_position',
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'learning_steps',
  'reps',
  'lapses',
  'state',
  'last_review',
  'suspended',
] as const;

/**
 * Save a parsed collection. Decks, note types and notes are matched by Anki's ids / guid,
 * so importing a newer export of the same deck updates it. For cards already in the app,
 * whichever copy was reviewed more recently wins.
 */
export async function saveCollection(
  db: Db,
  col: AnkiCollection,
  fileName: string,
  now: number,
  onProgress?: (fraction: number) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = { decks: 0, notes: 0, cards: 0, updated: 0, keptNewer: 0, reviews: 0 };
  const usedDecks = new Set(col.cards.map((c) => (c.odid ? c.odid : c.did)));

  await transaction(db as SQLiteDatabase, async (txn) => {
    // Note types
    for (const nt of col.notetypes) {
      await txn.runAsync(
        `INSERT INTO anki_notetypes (anki_id, name, is_cloze, css, fields, templates) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(anki_id) DO UPDATE SET name = excluded.name, is_cloze = excluded.is_cloze, css = excluded.css,
           fields = excluded.fields, templates = excluded.templates`,
        nt.ankiId,
        nt.name,
        nt.isCloze ? 1 : 0,
        nt.css,
        JSON.stringify(nt.fields),
        JSON.stringify(nt.templates),
      );
    }
    const ntIds = new Map((await txn.getAllAsync<{ id: number; anki_id: number }>('SELECT id, anki_id FROM anki_notetypes')).map((r) => [r.anki_id, r.id]));

    // Decks (only ones that hold cards)
    for (const d of col.decks) {
      if (!usedDecks.has(d.ankiId)) continue;
      await txn.runAsync('INSERT INTO anki_decks (anki_id, name) VALUES (?, ?) ON CONFLICT(anki_id) DO UPDATE SET name = excluded.name', d.ankiId, d.name);
      summary.decks++;
    }
    const deckIds = new Map((await txn.getAllAsync<{ id: number; anki_id: number }>('SELECT id, anki_id FROM anki_decks')).map((r) => [r.anki_id, r.id]));

    // Notes
    const noteStmt = await txn.prepareAsync(
      `INSERT INTO anki_notes (notetype_id, guid, fields, tags) VALUES (?, ?, ?, ?)
       ON CONFLICT(guid) DO UPDATE SET notetype_id = excluded.notetype_id, fields = excluded.fields, tags = excluded.tags`,
    );
    try {
      let i = 0;
      for (const n of col.notes) {
        const ntId = ntIds.get(n.notetypeId);
        if (ntId === undefined) continue;
        await noteStmt.executeAsync(ntId, n.guid, JSON.stringify(n.fields), n.tags);
        summary.notes++;
        if (++i % 500 === 0) onProgress?.((0.4 * i) / col.notes.length);
      }
    } finally {
      await noteStmt.finalizeAsync();
    }
    const noteIdByGuid = new Map((await txn.getAllAsync<{ id: number; guid: string }>('SELECT id, guid FROM anki_notes')).map((r) => [r.guid, r.id]));
    const noteIdByAnki = new Map<number, number>();
    for (const n of col.notes) {
      const id = noteIdByGuid.get(n.guid);
      if (id !== undefined) noteIdByAnki.set(n.ankiId, id);
    }

    // Cards
    const existing = new Map(
      (await txn.getAllAsync<{ id: number; note_id: number; ord: number; last_review: number | null }>('SELECT id, note_id, ord, last_review FROM anki_cards')).map((r) => [
        `${r.note_id}:${r.ord}`,
        r,
      ]),
    );
    const insertStmt = await txn.prepareAsync(`INSERT INTO anki_cards (${CARD_COLS.join(', ')}) VALUES (${CARD_COLS.map(() => '?').join(', ')})`);
    const updateStmt = await txn.prepareAsync(`UPDATE anki_cards SET ${CARD_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`);
    const cardIdByAnki = new Map<number, number>();
    try {
      let i = 0;
      for (const c of col.cards) {
        const noteId = noteIdByAnki.get(c.nid);
        const deckId = deckIds.get(c.odid ? c.odid : c.did);
        if (noteId === undefined || deckId === undefined) continue;
        const sched = convertAnkiCard(c, col.crt, now);
        const row = { note_id: noteId, deck_id: deckId, ord: c.ord, ...sched };
        const values = CARD_COLS.map((k) => row[k]);
        const prev = existing.get(`${noteId}:${c.ord}`);
        if (!prev) {
          const res = await insertStmt.executeAsync(...values);
          cardIdByAnki.set(c.id, res.lastInsertRowId);
          summary.cards++;
        } else if ((sched.last_review ?? 0) > (prev.last_review ?? 0)) {
          await updateStmt.executeAsync(...values, prev.id);
          cardIdByAnki.set(c.id, prev.id);
          summary.updated++;
        } else {
          cardIdByAnki.set(c.id, prev.id);
          if ((prev.last_review ?? 0) > (sched.last_review ?? 0)) summary.keptNewer++;
        }
        if (++i % 500 === 0) onProgress?.(0.4 + (0.4 * i) / col.cards.length);
      }
    } finally {
      await insertStmt.finalizeAsync();
      await updateStmt.finalizeAsync();
    }

    // Review history (skip entries already imported earlier)
    const seen = new Set(
      (await txn.getAllAsync<{ card_id: number; reviewed_at: number }>('SELECT card_id, reviewed_at FROM anki_revlog WHERE imported = 1')).map(
        (r) => `${r.card_id}:${r.reviewed_at}`,
      ),
    );
    const logStmt = await txn.prepareAsync(
      'INSERT INTO anki_revlog (card_id, reviewed_at, rating, prev_state, duration_ms, imported) VALUES (?, ?, ?, ?, ?, 1)',
    );
    try {
      let i = 0;
      for (const r of col.revlog) {
        const cardId = cardIdByAnki.get(r.cid);
        const log = convertRevlog(r);
        if (cardId === undefined || !log || seen.has(`${cardId}:${log.reviewed_at}`)) continue;
        await logStmt.executeAsync(cardId, log.reviewed_at, log.rating, log.prev_state, log.duration_ms);
        summary.reviews++;
        if (++i % 2000 === 0) onProgress?.(0.8 + (0.2 * i) / col.revlog.length);
      }
    } finally {
      await logStmt.finalizeAsync();
    }

    await txn.runAsync(
      'INSERT INTO anki_imports (file_name, imported_at, notes, cards) VALUES (?, ?, ?, ?)',
      fileName,
      now,
      summary.notes,
      summary.cards + summary.updated,
    );
  });
  onProgress?.(1);
  return summary;
}
