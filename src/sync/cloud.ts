import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '../auth/supabase';
import { buildBackup, parseBackup, type BackupFile } from '../backup/format';
import { readAllForBackup, replaceAllFromBackup, setKv } from '../db/repo';

/**
 * Cloud backup: one row per user in `user_progress` holding the same JSON as a
 * backup file. Last writer wins — the phone uploads when it goes to the
 * background, and on sign-in the user chooses which copy to keep if both exist.
 */
const TABLE = 'user_progress';

export interface CloudSnapshot {
  backup: BackupFile;
  updatedAt: number;
}

function client() {
  if (!supabase) throw new Error('Accounts are not set up for this build.');
  return supabase;
}

export async function uploadProgress(db: SQLiteDatabase, userId: string, now = Date.now()): Promise<void> {
  const backup = buildBackup(await readAllForBackup(db), now);
  const { error } = await client()
    .from(TABLE)
    .upsert({ user_id: userId, data: backup, updated_at: new Date(now).toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  await setKv(db, 'meta', 'lastCloudSync', now);
}

export async function downloadProgress(userId: string): Promise<CloudSnapshot | null> {
  const { data, error } = await client().from(TABLE).select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { backup: parseBackup(JSON.stringify(data.data)), updatedAt: Date.parse(data.updated_at) };
}

export async function restoreFromCloud(db: SQLiteDatabase, snapshot: CloudSnapshot, now = Date.now()): Promise<void> {
  await replaceAllFromBackup(db, snapshot.backup);
  await setKv(db, 'meta', 'lastCloudSync', now);
}

export type Reconcile = 'upload' | 'restore' | 'ask' | 'none';

/**
 * What to do right after signing in, given what's on the phone and in the cloud.
 * An empty side never overwrites a non-empty one; two non-empty copies ask the user.
 */
export function reconcileAction(localCards: number, localReviews: number, remote: BackupFile | null): Reconcile {
  const localEmpty = localCards === 0 && localReviews === 0;
  const remoteEmpty = !remote || (remote.cards.length === 0 && remote.review_logs.length === 0);
  if (remoteEmpty) return localEmpty ? 'none' : 'upload';
  if (localEmpty) return 'restore';
  return 'ask';
}
