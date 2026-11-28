import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { readAnkiForBackup, replaceAnki } from '../anki/backup';
import type { BackupData, ExampleSeenRow } from '../backup/format';
import { readKanaForBackup, replaceKana } from '../kana/repo';
import type { ExampleSeen } from '../srs/exampleRotation';
import { readSentencesForBackup, replaceSentences } from '../sentence/repo';
import { QUIZ_ANSWER } from '../srs/quiz';
import { cardBeforeLog, knownCard, type StoredCard, type StoredLog } from '../srs/scheduler';
import { SEED_GOAL_DAYS_SQL } from '../stats/goalDays';
import type { Activity, TimeEntry } from '../time/model';

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
export async function transaction(db: SQLiteDatabase, task: (txn: Executor & Pick<SQLiteDatabase, 'execAsync' | 'prepareAsync'>) => Promise<void>): Promise<void> {
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

export async function setSuspended(db: SQLiteDatabase, grammarId: string, suspended: boolean): Promise<void> {
  await db.runAsync('UPDATE cards SET suspended = ? WHERE grammar_id = ?', suspended ? 1 : 0, grammarId);
}

/** Forget a point entirely: it becomes a new lesson again. */
export async function resetPoint(db: SQLiteDatabase, grammarId: string): Promise<void> {
  await transaction(db, async (txn) => {
    await txn.runAsync('DELETE FROM cards WHERE grammar_id = ?', grammarId);
    await txn.runAsync('DELETE FROM review_logs WHERE grammar_id = ?', grammarId);
    await txn.runAsync('DELETE FROM example_seen WHERE grammar_id = ?', grammarId);
    await txn.runAsync('DELETE FROM sentence_attempts WHERE grammar_id = ?', grammarId);
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

/**
 * Finish a lesson: put the quizzed points into the SRS (card + its first review log) and
 * mark every quiz sentence as shown, so reviews start with sentences not seen yet.
 */
export async function saveQuizResults(
  db: SQLiteDatabase,
  seeds: { card: StoredCard; log: StoredLog }[],
  answers: { pointId: string; exampleId: string; correct: boolean; at: number }[],
): Promise<void> {
  await transaction(db, async (txn) => {
    for (const { card, log } of seeds) {
      if (await txn.getFirstAsync('SELECT grammar_id FROM cards WHERE grammar_id = ?', card.grammar_id)) continue;
      await upsertCard(txn, card);
      await insertLog(txn, log);
    }
    for (const a of answers) {
      await txn.runAsync(
        `INSERT INTO example_seen (example_id, grammar_id, times_shown, times_wrong, last_shown_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(example_id) DO UPDATE SET
           times_shown = times_shown + 1,
           times_wrong = times_wrong + excluded.times_wrong,
           last_shown_at = MAX(COALESCE(last_shown_at, 0), excluded.last_shown_at)`,
        a.exampleId,
        a.pointId,
        a.correct ? 0 : 1,
        a.at,
      );
    }
  });
}

/**
 * Mark grammar points as already known (skipping them on the map): learned, but kept out of
 * reviews. Points already learned are left alone. Returns how many were added.
 */
export async function markKnown(db: SQLiteDatabase, points: readonly { id: string; level: string }[], now = Date.now()): Promise<number> {
  let added = 0;
  await transaction(db, async (txn) => {
    for (const p of points) {
      if (await txn.getFirstAsync('SELECT grammar_id FROM cards WHERE grammar_id = ?', p.id)) continue;
      await upsertCard(txn, knownCard(p.id, p.level, now));
      added++;
    }
  });
  return added;
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

/** Reviews of a point, not counting the quiz after its lesson. */
export async function getPointStats(db: SQLiteDatabase, grammarId: string): Promise<PointStats> {
  const row = await db.getFirstAsync<{ reviews: number; correct: number | null; last: number | null }>(
    `SELECT COUNT(*) AS reviews, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct, MAX(reviewed_at) AS last
     FROM review_logs WHERE grammar_id = ? AND answer != '${QUIZ_ANSWER}'`,
    grammarId,
  );
  return { reviews: row?.reviews ?? 0, correct: row?.correct ?? 0, lastReviewedAt: row?.last ?? null };
}

/**
 * Timestamps of any study since `since`, for the streak: grammar reviews and lessons,
 * flashcard reviews, and tracked immersion/study time.
 */
export async function getActivityTimes(db: Pick<SQLiteDatabase, 'getAllAsync'>, since: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ t: number }>(
    `SELECT reviewed_at AS t FROM review_logs WHERE reviewed_at >= ?
     UNION ALL SELECT learned_at AS t FROM cards WHERE learned_at >= ?
     UNION ALL SELECT reviewed_at AS t FROM anki_revlog WHERE reviewed_at >= ?
     UNION ALL SELECT started_at AS t FROM time_entries WHERE started_at >= ?`,
    since,
    since,
    since,
    since,
  );
  return rows.map((r) => r.t);
}

/** Review timestamps since `since`, split into grammar and flashcards (for per-day charts). Lesson quizzes aren't reviews. */
export async function getReviewTimes(db: Pick<SQLiteDatabase, 'getAllAsync'>, since: number): Promise<{ grammar: number[]; cards: number[] }> {
  const rows = await db.getAllAsync<{ t: number; k: string }>(
    `SELECT reviewed_at AS t, 'g' AS k FROM review_logs WHERE reviewed_at >= ? AND answer != '${QUIZ_ANSWER}'
     UNION ALL SELECT reviewed_at AS t, 'c' AS k FROM anki_revlog WHERE reviewed_at >= ?`,
    since,
    since,
  );
  return { grammar: rows.filter((r) => r.k === 'g').map((r) => r.t), cards: rows.filter((r) => r.k === 'c').map((r) => r.t) };
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
  const [cards, logs, seen, settings, activities, timeEntries, anki, goalDays, kana, sentences] = await Promise.all([
    getAllCards(db),
    db.getAllAsync<StoredLog & { id?: number }>('SELECT * FROM review_logs ORDER BY id'),
    db.getAllAsync<ExampleSeenRow>('SELECT * FROM example_seen'),
    getKv(db, 'settings'),
    db.getAllAsync<Activity>('SELECT * FROM activities ORDER BY id'),
    db.getAllAsync<TimeEntry>('SELECT * FROM time_entries ORDER BY id'),
    readAnkiForBackup(db),
    db.getAllAsync<{ day: string }>('SELECT day FROM goal_days ORDER BY day'),
    readKanaForBackup(db),
    readSentencesForBackup(db),
  ]);
  return {
    cards,
    review_logs: logs.map(({ id: _id, ...rest }) => rest),
    example_seen: seen,
    settings,
    activities,
    time_entries: timeEntries,
    anki,
    goal_days: goalDays.map((g) => g.day),
    kana,
    sentence_attempts: sentences,
  };
}

/**
 * Replace all progress with the backup's contents, in one transaction. A timer that was
 * running when the backup was made is stopped at `stopRunningAt` (when the backup was
 * made), so it doesn't keep counting on this phone.
 */
export async function replaceAllFromBackup(db: SQLiteDatabase, data: BackupData, stopRunningAt: number): Promise<void> {
  const stopAt = Number.isFinite(stopRunningAt) ? stopRunningAt : Date.now();
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
    // Backups made before time tracking have no activities: keep the phone's own then.
    if (data.activities.length > 0) {
      await txn.execAsync('DELETE FROM time_entries; DELETE FROM activities;');
      for (const a of data.activities) {
        await txn.runAsync('INSERT INTO activities (id, name, color, position, archived) VALUES (?, ?, ?, ?, ?)', a.id, a.name, a.color, a.position, a.archived);
      }
      for (const e of data.time_entries) {
        await txn.runAsync(
          'INSERT INTO time_entries (id, activity_id, started_at, ended_at, note, source) VALUES (?, ?, ?, ?, ?, ?)',
          e.id,
          e.activity_id,
          e.started_at,
          e.ended_at ?? Math.max(e.started_at, stopAt),
          e.note,
          e.source,
        );
      }
    }
    // Backups made before Anki decks were included: keep the phone's own decks.
    if (data.anki) await replaceAnki(txn, data.anki);
    // Backups made before goal days were saved: count every day with study in them, as the
    // migration did (and keep the phone's own).
    if (data.goal_days) {
      await txn.execAsync('DELETE FROM goal_days;');
      for (const day of data.goal_days) await txn.runAsync('INSERT OR IGNORE INTO goal_days (day) VALUES (?)', day);
    } else {
      await txn.execAsync(SEED_GOAL_DAYS_SQL);
    }
    // Backups made before the kana course: keep the phone's own kana progress.
    if (data.kana) await replaceKana(txn, data.kana);
    // Backups made before sentence practice: keep the phone's own attempts.
    if (data.sentence_attempts) await replaceSentences(txn, data.sentence_attempts);
  });
}
