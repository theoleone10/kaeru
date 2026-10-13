import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '../auth/supabase';
import { backupCounts, buildBackup, isEmptyProgress, parseBackup, type BackupData, type BackupFile } from '../backup/format';
import { getKv, readAllForBackup, replaceAllFromBackup, setKv } from '../db/repo';

/**
 * Cloud backup: one row per user in `user_progress` holding the same JSON as a
 * backup file. Last writer wins — the phone uploads when it goes to the background
 * or comes back (only if something changed), and on sign-in the user chooses which
 * copy to keep if both exist.
 */
const TABLE = 'user_progress';

/** Shown after restoring flashcards: media files stay on the phone they were imported on. */
export const ANKI_MEDIA_NOTE =
  "Images and audio from your Anki decks aren't in the backup. Import the decks' .apkg files again to bring them back; your progress is kept.";

export interface CloudSnapshot {
  backup: BackupFile;
  updatedAt: number;
}

function client() {
  if (!supabase) throw new Error('Accounts are not set up for this build.');
  return supabase;
}

/** Bumped by a trigger on every change to backed-up data (see migrations). */
export async function localVersion(db: Pick<SQLiteDatabase, 'getFirstAsync'>): Promise<number> {
  return (await db.getFirstAsync<{ version: number }>('SELECT version FROM sync_state'))?.version ?? 0;
}

/** True when there are changes the cloud copy doesn't have yet. */
export async function hasUnsyncedChanges(db: SQLiteDatabase): Promise<boolean> {
  const meta = await getKv(db, 'meta');
  return meta.syncedVersion !== (await localVersion(db));
}

/**
 * Upload this phone's progress. Skipped when nothing changed since the last upload or
 * restore, unless `force`. Returns whether it uploaded.
 */
export async function uploadProgress(db: SQLiteDatabase, userId: string, opts: { force?: boolean; now?: number } = {}): Promise<boolean> {
  const now = opts.now ?? Date.now();
  // Read the version first: anything written during the upload counts as a later change.
  const version = await localVersion(db);
  if (!opts.force && (await getKv(db, 'meta')).syncedVersion === version) return false;
  const backup = buildBackup(await readAllForBackup(db), now);
  const { error } = await client()
    .from(TABLE)
    .upsert({ user_id: userId, data: backup, updated_at: new Date(now).toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  await setKv(db, 'meta', 'lastCloudSync', now);
  await setKv(db, 'meta', 'syncedVersion', version);
  return true;
}

export async function downloadProgress(userId: string): Promise<CloudSnapshot | null> {
  const { data, error } = await client().from(TABLE).select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { backup: parseBackup(JSON.stringify(data.data)), updatedAt: Date.parse(data.updated_at) };
}

export async function restoreFromCloud(db: SQLiteDatabase, snapshot: CloudSnapshot, now = Date.now()): Promise<void> {
  await replaceAllFromBackup(db, snapshot.backup, snapshot.updatedAt);
  await setKv(db, 'meta', 'lastCloudSync', now);
  // The phone now matches the cloud copy.
  await setKv(db, 'meta', 'syncedVersion', await localVersion(db));
}

export type Reconcile = 'upload' | 'restore' | 'ask' | 'none';

/**
 * What to do right after signing in, given what's on the phone and in the cloud.
 * An empty side never overwrites a non-empty one; two non-empty copies ask the user.
 * Grammar, flashcards and time entries you made all count as progress.
 */
export function reconcileAction(local: BackupData, remote: BackupData | null): Reconcile {
  const localEmpty = isEmptyProgress(backupCounts(local));
  const remoteEmpty = !remote || isEmptyProgress(backupCounts(remote));
  if (remoteEmpty) return localEmpty ? 'none' : 'upload';
  if (localEmpty) return 'restore';
  return 'ask';
}
