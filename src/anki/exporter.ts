import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { defaultDatabaseDirectory, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { dayKey } from '../stats/dates';
import { buildPackage, readDeckExport, writeCollection } from './export';
import { ankiMediaDir } from './importer';
import { safeMediaName } from './package';

export interface ExportResult {
  cards: number;
  notes: number;
  reviews: number;
  media: number;
}

/**
 * Export a deck (with subdecks, progress, history and media) as an .apkg and open the share
 * sheet, so it can go to Files, AirDrop, or straight into Anki.
 */
export async function exportDeck(db: SQLiteDatabase, path: string): Promise<ExportResult> {
  const now = Date.now();
  const ex = await readDeckExport(db, path);
  if (ex.cards.length === 0) throw new Error('This deck has no cards to export yet.');

  // 1. Build the collection in a scratch database next to the app's own.
  const dbName = `anki-export-${now}.db`;
  const colDb = await openDatabaseAsync(dbName);
  try {
    await writeCollection(colDb, ex, now);
  } finally {
    await colDb.closeAsync();
  }
  const dbFile = new File(new Directory(`file://${defaultDatabaseDirectory}`), dbName);
  const leftovers = ['', '-wal', '-shm', '-journal'].map((s) => new File(`${dbFile.uri}${s}`));

  try {
    const collection = await dbFile.bytes();

    // 2. Media the cards use (missing files are skipped: Anki just shows them as missing).
    const mediaDir = ankiMediaDir();
    const media: { name: string; bytes: Uint8Array }[] = [];
    for (const name of ex.media) {
      const f = new File(mediaDir, safeMediaName(name));
      if (f.exists) media.push({ name, bytes: await f.bytes() });
    }

    // 3. Zip and share.
    const pkg = buildPackage(collection, media);
    const safeName = path.replace(/::/g, ' - ').replace(/[/\\:*?"<>|]/g, '_').slice(0, 80) || 'Deck';
    const out = new File(Paths.cache, `${safeName} ${dayKey(now)}.apkg`);
    if (out.exists) out.delete();
    out.create();
    out.write(pkg);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(out.uri, { mimeType: 'application/octet-stream', UTI: 'public.data', dialogTitle: `Export ${path}` });
    return { cards: ex.cards.length, notes: ex.notes.length, reviews: ex.revlog.length, media: media.length };
  } finally {
    for (const f of leftovers) if (f.exists) f.delete();
  }
}
