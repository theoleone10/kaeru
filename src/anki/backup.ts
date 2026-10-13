import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Anki data in a backup: every anki_* table row for row, ids included, so the foreign keys
 * between them survive a restore. Media files are not included (they can run to hundreds
 * of MB); re-importing the .apkg brings them back and keeps the newer progress.
 */
export const ANKI_TABLES = {
  anki_imports: ['id', 'file_name', 'imported_at', 'notes', 'cards'],
  anki_decks: ['id', 'anki_id', 'name'],
  anki_notetypes: ['id', 'anki_id', 'name', 'is_cloze', 'css', 'fields', 'templates'],
  anki_notes: ['id', 'notetype_id', 'guid', 'fields', 'tags'],
  anki_cards: [
    'id',
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
  ],
  anki_revlog: ['id', 'card_id', 'reviewed_at', 'rating', 'prev_state', 'duration_ms', 'imported', 'prev_card'],
  anki_deck_limits: ['path', 'new_per_day', 'reviews_per_day'],
} as const;

export type AnkiTable = keyof typeof ANKI_TABLES;
export type AnkiBackup = Record<AnkiTable, Record<string, unknown>[]>;

/** Parents before children, so inserts satisfy the foreign keys (deletes run in reverse). */
const ORDER: AnkiTable[] = ['anki_imports', 'anki_decks', 'anki_notetypes', 'anki_notes', 'anki_cards', 'anki_revlog', 'anki_deck_limits'];

/** Text columns; every other column holds a number. */
const TEXT = new Set(['file_name', 'name', 'css', 'fields', 'templates', 'guid', 'tags', 'path', 'prev_card']);

/** Columns that may be NULL; every other column must be present in each row. */
const NULLABLE: Partial<Record<AnkiTable, readonly string[]>> = {
  anki_cards: ['last_review'],
  anki_revlog: ['duration_ms', 'prev_card'],
  anki_deck_limits: ['new_per_day', 'reviews_per_day'],
};

export async function readAnkiForBackup(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<AnkiBackup> {
  const out = {} as AnkiBackup;
  for (const table of ORDER) {
    const cols = ANKI_TABLES[table];
    out[table] = await db.getAllAsync<Record<string, unknown>>(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY ${cols[0]}`);
  }
  return out;
}

/** Replace all Anki rows with the backup's. Run inside a transaction. */
export async function replaceAnki(txn: Pick<SQLiteDatabase, 'execAsync' | 'prepareAsync'>, data: AnkiBackup): Promise<void> {
  for (const table of [...ORDER].reverse()) await txn.execAsync(`DELETE FROM ${table};`);
  for (const table of ORDER) {
    const cols = ANKI_TABLES[table];
    const stmt = await txn.prepareAsync(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    try {
      for (const row of data[table]) await stmt.executeAsync(...cols.map((c) => (row[c] ?? null) as string | number | null));
    } finally {
      await stmt.finalizeAsync();
    }
  }
}

/** Check the shape of a backup's `anki` section. Throws with a readable path. */
export function validateAnki(raw: unknown): AnkiBackup {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Backup has malformed Anki data.');
  const obj = raw as Record<string, unknown>;
  for (const table of ORDER) {
    const rows = obj[table];
    if (!Array.isArray(rows)) throw new Error(`Backup is missing Anki ${table}.`);
    const nullable = NULLABLE[table] ?? [];
    rows.forEach((row, i) => {
      if (typeof row !== 'object' || row === null) throw new Error(`anki.${table}[${i}]: not an object`);
      for (const c of ANKI_TABLES[table]) {
        const v = (row as Record<string, unknown>)[c];
        const ok = v === null ? nullable.includes(c) : TEXT.has(c) ? typeof v === 'string' : typeof v === 'number' && Number.isFinite(v);
        if (!ok) throw new Error(`anki.${table}[${i}]: "${c}" is missing or invalid`);
      }
    });
  }
  return obj as AnkiBackup;
}

/** How many flashcards a backup holds (for prompts and the "is this side empty" check). */
export function ankiCardCount(data: AnkiBackup | undefined): number {
  return data?.anki_cards.length ?? 0;
}
