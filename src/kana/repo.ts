import type { SQLiteDatabase } from 'expo-sqlite';
import { transaction } from '../db/repo';
import type { KanaAnswer, KanaStat } from './practice';

type Db = Pick<SQLiteDatabase, 'getAllAsync' | 'runAsync'>;

export interface KanaLessonRow {
  lesson: string;
  passed_at: number;
}

/** The kana course's progress, as backed up. */
export interface KanaBackup {
  lessons: KanaLessonRow[];
  progress: KanaStat[];
}

export async function passedKanaLessons(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<KanaLessonRow>('SELECT lesson, passed_at FROM kana_lessons');
  return new Map(rows.map((r) => [r.lesson, r.passed_at]));
}

export async function kanaStats(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<Map<string, KanaStat>> {
  const rows = await db.getAllAsync<KanaStat>('SELECT kana, correct, wrong, streak, last_at FROM kana_progress');
  return new Map(rows.map((r) => [r.kana, r]));
}

/** Count each answer against its kana: a right one extends the run, a wrong one ends it. */
export async function recordKanaAnswers(db: SQLiteDatabase, answers: readonly KanaAnswer[]): Promise<void> {
  await transaction(db, async (txn) => {
    for (const a of answers) {
      await txn.runAsync(
        `INSERT INTO kana_progress (kana, correct, wrong, streak, last_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kana) DO UPDATE SET
           correct = correct + excluded.correct,
           wrong = wrong + excluded.wrong,
           streak = CASE WHEN excluded.correct = 1 THEN streak + 1 ELSE 0 END,
           last_at = MAX(last_at, excluded.last_at)`,
        a.kana,
        a.correct ? 1 : 0,
        a.correct ? 0 : 1,
        a.correct ? 1 : 0,
        a.at,
      );
    }
  });
}

/** Mark lessons passed (keeps the first time each was passed). */
export async function passKanaLessons(db: Db, lessons: readonly string[], at: number): Promise<void> {
  for (const l of lessons) await db.runAsync('INSERT OR IGNORE INTO kana_lessons (lesson, passed_at) VALUES (?, ?)', l, at);
}

export async function readKanaForBackup(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<KanaBackup> {
  const [lessons, progress] = await Promise.all([
    db.getAllAsync<KanaLessonRow>('SELECT lesson, passed_at FROM kana_lessons ORDER BY lesson'),
    db.getAllAsync<KanaStat>('SELECT kana, correct, wrong, streak, last_at FROM kana_progress ORDER BY kana'),
  ]);
  return { lessons, progress };
}

/** Replace the kana course's progress. Run inside a transaction. */
export async function replaceKana(txn: Pick<SQLiteDatabase, 'execAsync' | 'runAsync'>, data: KanaBackup): Promise<void> {
  await txn.execAsync('DELETE FROM kana_lessons; DELETE FROM kana_progress;');
  for (const l of data.lessons) await txn.runAsync('INSERT INTO kana_lessons (lesson, passed_at) VALUES (?, ?)', l.lesson, l.passed_at);
  for (const p of data.progress) {
    await txn.runAsync('INSERT INTO kana_progress (kana, correct, wrong, streak, last_at) VALUES (?, ?, ?, ?, ?)', p.kana, p.correct, p.wrong, p.streak, p.last_at);
  }
}

/** Check a backup's `kana` section. Throws with a readable path. */
export function validateKana(raw: unknown): KanaBackup {
  const obj = raw as Record<string, unknown> | null;
  if (typeof obj !== 'object' || obj === null || !Array.isArray(obj.lessons) || !Array.isArray(obj.progress)) throw new Error('Backup has malformed kana data.');
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  obj.lessons.forEach((l: Record<string, unknown>, i) => {
    if (typeof l?.lesson !== 'string' || !num(l.passed_at)) throw new Error(`kana.lessons[${i}] is invalid`);
  });
  obj.progress.forEach((p: Record<string, unknown>, i) => {
    if (typeof p?.kana !== 'string' || !num(p.correct) || !num(p.wrong) || !num(p.streak) || !num(p.last_at)) throw new Error(`kana.progress[${i}] is invalid`);
  });
  return obj as unknown as KanaBackup;
}
