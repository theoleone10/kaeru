import type { SQLiteDatabase } from 'expo-sqlite';

export type Verdict = 'correct' | 'incorrect' | 'unsure';
export type AttemptSource = 'lesson' | 'point';

export interface SentenceAttempt {
  id?: number;
  grammar_id: string;
  sentence: string;
  verdict: Verdict;
  error_type: string | null;
  source: AttemptSource;
  model_version: string;
  created_at: number;
}

type Db = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

export async function saveAttempt(db: Pick<SQLiteDatabase, 'runAsync'>, a: SentenceAttempt): Promise<void> {
  await db.runAsync(
    'INSERT INTO sentence_attempts (grammar_id, sentence, verdict, error_type, source, model_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    a.grammar_id,
    a.sentence,
    a.verdict,
    a.error_type,
    a.source,
    a.model_version,
    a.created_at,
  );
}

/** Points with at least one correct sentence. */
export async function sentenceDoneIds(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ grammar_id: string }>("SELECT DISTINCT grammar_id FROM sentence_attempts WHERE verdict = 'correct'");
  return new Set(rows.map((r) => r.grammar_id));
}

export interface SentenceStatus {
  done: boolean;
  /** The latest correct sentence. */
  best?: SentenceAttempt;
  lastAttempt?: SentenceAttempt;
}

export async function getSentenceStatus(db: Db, grammarId: string): Promise<SentenceStatus> {
  const best = await db.getFirstAsync<SentenceAttempt>(
    "SELECT * FROM sentence_attempts WHERE grammar_id = ? AND verdict = 'correct' ORDER BY created_at DESC, id DESC LIMIT 1",
    grammarId,
  );
  const last = await db.getFirstAsync<SentenceAttempt>('SELECT * FROM sentence_attempts WHERE grammar_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', grammarId);
  return { done: !!best, best: best ?? undefined, lastAttempt: last ?? undefined };
}

export function readSentencesForBackup(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<SentenceAttempt[]> {
  return db.getAllAsync<SentenceAttempt>('SELECT grammar_id, sentence, verdict, error_type, source, model_version, created_at FROM sentence_attempts ORDER BY id');
}

/** Replace all attempts. Run inside a transaction. */
export async function replaceSentences(txn: Pick<SQLiteDatabase, 'execAsync' | 'runAsync'>, rows: readonly SentenceAttempt[]): Promise<void> {
  await txn.execAsync('DELETE FROM sentence_attempts;');
  for (const r of rows) await saveAttempt(txn, r);
}

const VERDICTS = new Set(['correct', 'incorrect', 'unsure']);

/** Check a backup's `sentence_attempts` section. Throws with a readable path. */
export function validateSentences(raw: unknown): SentenceAttempt[] {
  if (!Array.isArray(raw)) throw new Error('Backup has malformed sentence_attempts.');
  raw.forEach((r: Record<string, unknown>, i) => {
    const ok =
      typeof r === 'object' &&
      r !== null &&
      typeof r.grammar_id === 'string' &&
      typeof r.sentence === 'string' &&
      typeof r.verdict === 'string' &&
      VERDICTS.has(r.verdict) &&
      (r.error_type === null || typeof r.error_type === 'string') &&
      typeof r.source === 'string' &&
      typeof r.model_version === 'string' &&
      typeof r.created_at === 'number' &&
      Number.isFinite(r.created_at);
    if (!ok) throw new Error(`sentence_attempts[${i}] is invalid`);
  });
  return raw as SentenceAttempt[];
}

/** Distinct points with a correct sentence. */
export function countSentencesDone(rows: readonly SentenceAttempt[]): number {
  return new Set(rows.filter((r) => r.verdict === 'correct').map((r) => r.grammar_id)).size;
}
