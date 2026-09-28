import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import type { BackupData, ExampleSeenRow } from '../backup/format';
import type { ExampleSeen } from '../srs/exampleRotation';
import { cardBeforeLog, type StoredCard, type StoredLog } from '../srs/scheduler';

const CARD_COLUMNS = [
  'grammar_id',
  'level',
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
  'learned_at',
  'suspended',
] as const;

const LOG_COLUMNS = [
  'grammar_id',
  'example_id',
  'rating',
  'answer',
  'reviewed_at',
  'duration_ms',
  'prev_card',
  'state',
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'last_elapsed_days',
  'scheduled_days',
  'learning_steps',
] as const;

type Executor = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

/**
 * Exclusive transaction on device (other queries can't interleave). The web build
 * (browser preview only) doesn't support exclusive transactions, so it falls back.
 */
export async function transaction(db: SQLiteDatabase, task: (txn: Executor & Pick<SQLiteDatabase, 'execAsync'>) => Promise<void>): Promise<void> {
  if (Platform.OS === 'web') return db.withTransactionAsync(() => task(db));
  return db.withExclusiveTransactionAsync(task);
}

const placeholders = (n: number) => Array(n).fill('?').join(', ');

async function upsertCard(db: Executor, card: StoredCard): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO cards (${CARD_COLUMNS.join(', ')}) VALUES (${placeholders(CARD_COLUMNS.length)})`,
    CARD_COLUMNS.map((c) => card[c]),
  );
}

async function insertLog(db: Executor, log: StoredLog): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO review_logs (${LOG_COLUMNS.join(', ')}) VALUES (${placeholders(LOG_COLUMNS.length)})`,
    LOG_COLUMNS.map((c) => log[c]),
  );
  return res.lastInsertRowId;
}

// ---------- cards ----------

export function getAllCards(db: SQLiteDatabase): Promise<StoredCard[]> {
  return db.getAllAsync<StoredCard>('SELECT * FROM cards');
}

/** Lesson completion: create cards for newly learned points (existing cards are kept). */
export async function addLearnedCards(db: SQLiteDatabase, cards: StoredCard[]): Promise<void> {
  await transaction(db, async (txn) => {
    for (const card of cards) {
      const existing = await txn.getFirstAsync('SELECT grammar_id FROM cards WHERE grammar_id = ?', card.grammar_id);
      if (!existing) await upsertCard(txn, card);
    }
  });
}

export async function setSuspended(db: SQLiteDatabase, grammarId: string, suspended: boolean): Promise<void> {
  await db.runAsync('UPDATE cards SET suspended = ? WHERE grammar_id = ?', suspended ? 1 : 0, grammarId);
}

/** Forget a point entirely: it becomes a new lesson again. */
export async function resetPoint(db: SQLiteDatabase, grammarId: string): Promise<void> {
  await transaction(db, async (txn) => {
    await txn.runAsync('DELETE FROM cards WHERE grammar_id = ?', grammarId);
    await txn.runAsync('DELETE FROM review_logs WHERE grammar_id = ?', grammarId);
    await txn.runAsync('DELETE FROM example_seen WHERE grammar_id = ?', grammarId);
  });
}

// ---------- reviews ----------

/** Persist a graded review atomically. Returns the log id (needed for undo). */
export async function saveReview(db: SQLiteDatabase, card: StoredCard, log: StoredLog, correct: boolean): Promise<number> {
  let logId = 0;
  await transaction(db, async (txn) => {
    await upsertCard(txn, card);
    logId = await insertLog(txn, log);
    await txn.runAsync(
      `INSERT INTO example_seen (example_id, grammar_id, times_shown, times_wrong, last_shown_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(example_id) DO UPDATE SET
         times_shown = times_shown + 1,
         times_wrong = times_wrong + excluded.times_wrong,
         last_shown_at = excluded.last_shown_at`,
      log.example_id,
      log.grammar_id,
      correct ? 0 : 1,
      log.reviewed_at,
    );
  });
  return logId;
}

/** Undo a review: restore the card to its pre-review state and drop the log. */
export async function undoReview(db: SQLiteDatabase, logId: number): Promise<StoredCard | null> {
  let restored: StoredCard | null = null;
  await transaction(db, async (txn) => {
    const log = await txn.getFirstAsync<StoredLog & { id: number }>('SELECT * FROM review_logs WHERE id = ?', logId);
    if (!log) return;
    restored = cardBeforeLog(log);
    await upsertCard(txn, restored);
    await txn.runAsync('DELETE FROM review_logs WHERE id = ?', logId);
    await txn.runAsync(
      `UPDATE example_seen SET
         times_shown = MAX(0, times_shown - 1),
         times_wrong = MAX(0, times_wrong - ?)
       WHERE example_id = ?`,
      log.rating === 1 ? 1 : 0,
      log.example_id,
    );
  });
  return restored;
}

export async function getExampleSeen(db: SQLiteDatabase, grammarId: string): Promise<Map<string, ExampleSeen>> {
  const rows = await db.getAllAsync<ExampleSeen>(
    'SELECT example_id, times_shown, last_shown_at FROM example_seen WHERE grammar_id = ?',
    grammarId,
  );
  return new Map(rows.map((r) => [r.example_id, r]));
}

export interface PointStats {
  reviews: number;
  correct: number;
  lastReviewedAt: number | null;
}

export async function getPointStats(db: SQLiteDatabase, grammarId: string): Promise<PointStats> {
  const row = await db.getFirstAsync<{ reviews: number; correct: number | null; last: number | null }>(
    `SELECT COUNT(*) AS reviews, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct, MAX(reviewed_at) AS last
     FROM review_logs WHERE grammar_id = ?`,
    grammarId,
  );
  return { reviews: row?.reviews ?? 0, correct: row?.correct ?? 0, lastReviewedAt: row?.last ?? null };
}

/** Timestamps of study activity (reviews + lessons) since `since`, for the streak. */
export async function getActivityTimes(db: SQLiteDatabase, since: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ t: number }>(
    'SELECT reviewed_at AS t FROM review_logs WHERE reviewed_at >= ? UNION ALL SELECT learned_at AS t FROM cards WHERE learned_at >= ?',
    since,
    since,
  );
  return rows.map((r) => r.t);
}

export async function getReviewCountSince(db: SQLiteDatabase, since: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM review_logs WHERE reviewed_at >= ?', since);
  return row?.n ?? 0;
}

// ---------- key/value ----------

export async function getKv(db: SQLiteDatabase, table: 'settings' | 'meta'): Promise<Record<string, unknown>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(`SELECT key, value FROM ${table}`);
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      // ignore corrupt values; defaults apply
    }
  }
  return out;
}

export async function setKv(db: Executor, table: 'settings' | 'meta', key: string, value: unknown): Promise<void> {
  if (value === undefined || value === null) {
    await db.runAsync(`DELETE FROM ${table} WHERE key = ?`, key);
  } else {
    await db.runAsync(`INSERT OR REPLACE INTO ${table} (key, value) VALUES (?, ?)`, key, JSON.stringify(value));
  }
}

// ---------- backup ----------

export async function readAllForBackup(db: SQLiteDatabase): Promise<BackupData> {
  const [cards, logs, seen, settings] = await Promise.all([
    getAllCards(db),
    db.getAllAsync<StoredLog & { id?: number }>('SELECT * FROM review_logs ORDER BY id'),
    db.getAllAsync<ExampleSeenRow>('SELECT * FROM example_seen'),
    getKv(db, 'settings'),
  ]);
  return {
    cards,
    review_logs: logs.map(({ id: _id, ...rest }) => rest),
    example_seen: seen,
    settings,
  };
}

/** Replace all progress with the backup's contents, in one transaction. */
export async function replaceAllFromBackup(db: SQLiteDatabase, data: BackupData): Promise<void> {
  await transaction(db, async (txn) => {
    await txn.execAsync('DELETE FROM cards; DELETE FROM review_logs; DELETE FROM example_seen; DELETE FROM settings;');
    for (const card of data.cards) await upsertCard(txn, card);
    for (const log of data.review_logs) await insertLog(txn, log);
    for (const s of data.example_seen) {
      await txn.runAsync(
        'INSERT INTO example_seen (example_id, grammar_id, times_shown, times_wrong, last_shown_at) VALUES (?, ?, ?, ?, ?)',
        s.example_id,
        s.grammar_id,
        s.times_shown,
        s.times_wrong,
        s.last_shown_at ?? null,
      );
    }
    for (const [k, v] of Object.entries(data.settings)) await setKv(txn, 'settings', k, v);
  });
}
