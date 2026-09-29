import { Directory, File, Paths } from 'expo-file-system';
import { defaultDatabaseDirectory, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { readCollection, type AnkiCollection } from './collection';
import { safeMediaName, unpackPackage, type UnpackResult } from './package';
import { saveCollection, type ImportSummary } from './store';

/** All imported Anki media lives here; card HTML is written here too so relative paths resolve. */
export function ankiMediaDir(): Directory {
  const dir = new Directory(Paths.document, 'anki-media');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export type ImportPhase = 'unpacking' | 'reading' | 'saving' | 'media';

export interface ImportResult extends ImportSummary {
  fileName: string;
  media: number;
}

const TEMP_DB_PREFIX = 'anki-import-';

/**
 * Let the user pick an .apkg / .colpkg (exported from Anki with "Include scheduling
 * information" and "Include media") and import it. Returns null if they cancel.
 */
export async function pickAndImportAnki(db: SQLiteDatabase, onProgress: (phase: ImportPhase, fraction: number) => void): Promise<ImportResult | null> {
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  const source = picked.result;
  const fileName = decodeURIComponent(source.uri.split('/').pop() ?? 'deck.apkg');
  if (!/\.(apkg|colpkg)$/i.test(fileName)) {
    throw new Error('Choose an Anki package (.apkg or .colpkg). In Anki: File → Export → “Anki Deck Package”.');
  }

  const now = Date.now();
  const staging = new Directory(Paths.cache, `anki-import-${now}`);
  staging.create({ intermediates: true });
  const dbDir = new Directory(`file://${defaultDatabaseDirectory}`);
  if (!dbDir.exists) dbDir.create({ intermediates: true });
  const tempDbs: File[] = [];

  try {
    // 1. Unpack: collections into the SQLite folder, media into staging (named by number).
    const handle = source.open();
    let result: UnpackResult;
    try {
      result = await unpackPackage(
        (n) => handle.readBytes(n),
        source.size,
        {
          entry(name, bytes) {
            const isCollection = name.startsWith('collection.');
            const target = isCollection ? new File(dbDir, `${TEMP_DB_PREFIX}${name}.db`) : new File(staging, safeMediaName(name));
            if (target.exists) target.delete();
            target.create();
            target.write(bytes);
            if (isCollection) tempDbs.push(target);
          },
        },
        (f) => onProgress('unpacking', f),
      );
    } finally {
      handle.close();
    }

    // 2. Read the collection.
    onProgress('reading', 0);
    const colDb = await openDatabaseAsync(`${TEMP_DB_PREFIX}${result.collection}.db`);
    let collection: AnkiCollection;
    try {
      collection = await readCollection(colDb);
    } finally {
      await colDb.closeAsync();
    }
    if (collection.cards.length === 0) throw new Error('This package has no cards.');

    // 3. Save notes, cards and progress.
    const summary = await saveCollection(db, collection, fileName, now, (f) => onProgress('saving', f));

    // 4. Move media into place under their real names.
    const mediaDir = ankiMediaDir();
    let media = 0;
    const entries = [...result.mediaMap];
    for (let i = 0; i < entries.length; i++) {
      const [zipName, realName] = entries[i];
      const src = new File(staging, safeMediaName(zipName));
      if (!src.exists) continue;
      const dest = new File(mediaDir, safeMediaName(realName));
      if (dest.exists) dest.delete();
      src.moveSync(dest);
      media++;
      if (i % 50 === 0) {
        onProgress('media', i / entries.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return { ...summary, fileName, media };
  } finally {
    for (const f of tempDbs) {
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        const extra = new File(`${f.uri}${suffix}`);
        if (extra.exists) extra.delete();
      }
    }
    if (staging.exists) staging.delete();
  }
}
