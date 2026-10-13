import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { readAllForBackup, replaceAllFromBackup } from '../db/repo';
import { dayKey } from '../stats/dates';
import { buildBackup, parseBackup, type BackupFile } from './format';

/** Write a backup JSON to the cache directory and open the share sheet. */
export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const now = Date.now();
  const backup = buildBackup(await readAllForBackup(db), now);
  const file = new File(Paths.cache, `kaeru-backup-${dayKey(now)}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save Kaeru backup' });
}

/** Let the user pick a backup file and parse it. Returns null if they cancel. */
export async function pickBackup(): Promise<BackupFile | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'] });
  if (picked.canceled) return null;
  return parseBackup(await picked.result.text());
}

export async function restoreBackup(db: SQLiteDatabase, backup: BackupFile): Promise<void> {
  await replaceAllFromBackup(db, backup, Date.parse(backup.exported_at));
}
