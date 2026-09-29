import type { SQLiteDatabase } from 'expo-sqlite';
import { transaction } from './repo';

/**
 * Ordered schema migrations. The array index + 1 is the schema version stored in
 * PRAGMA user_version. Never edit a shipped migration — append a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE cards (
    grammar_id     TEXT PRIMARY KEY NOT NULL,
    level          TEXT NOT NULL,
    due            INTEGER NOT NULL,
    stability      REAL NOT NULL,
    difficulty     REAL NOT NULL,
    elapsed_days   INTEGER NOT NULL,
    scheduled_days INTEGER NOT NULL,
    learning_steps INTEGER NOT NULL,
    reps           INTEGER NOT NULL,
    lapses         INTEGER NOT NULL,
    state          INTEGER NOT NULL,
    last_review    INTEGER,
    learned_at     INTEGER NOT NULL,
    suspended      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_cards_due ON cards(suspended, due);

  CREATE TABLE review_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    grammar_id        TEXT NOT NULL,
    example_id        TEXT NOT NULL,
    rating            INTEGER NOT NULL,
    answer            TEXT NOT NULL,
    reviewed_at       INTEGER NOT NULL,
    duration_ms       INTEGER,
    prev_card         TEXT NOT NULL,
    state             INTEGER NOT NULL,
    due               INTEGER NOT NULL,
    stability         REAL NOT NULL,
    difficulty        REAL NOT NULL,
    elapsed_days      INTEGER NOT NULL,
    last_elapsed_days INTEGER NOT NULL,
    scheduled_days    INTEGER NOT NULL,
    learning_steps    INTEGER NOT NULL
  );
  CREATE INDEX idx_logs_time ON review_logs(reviewed_at);
  CREATE INDEX idx_logs_grammar ON review_logs(grammar_id, reviewed_at);

  CREATE TABLE example_seen (
    example_id    TEXT PRIMARY KEY NOT NULL,
    grammar_id    TEXT NOT NULL,
    times_shown   INTEGER NOT NULL DEFAULT 0,
    times_wrong   INTEGER NOT NULL DEFAULT 0,
    last_shown_at INTEGER
  );
  CREATE INDEX idx_seen_grammar ON example_seen(grammar_id);

  CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `,
  `
  CREATE TABLE activities (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color      TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    archived   INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO activities (name, color, position) VALUES ('Immersion', '#3F7FBF', 0), ('Study', '#3F6E5A', 1);

  CREATE TABLE time_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL REFERENCES activities(id),
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    note        TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'timer'
  );
  CREATE INDEX idx_time_started ON time_entries(started_at);
  CREATE INDEX idx_time_running ON time_entries(ended_at) WHERE ended_at IS NULL;

  CREATE TABLE anki_imports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name   TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    media_dir   TEXT NOT NULL
  );

  CREATE TABLE anki_decks (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL REFERENCES anki_imports(id) ON DELETE CASCADE,
    anki_id   INTEGER NOT NULL,
    name      TEXT NOT NULL
  );
  CREATE INDEX idx_anki_decks_import ON anki_decks(import_id, anki_id);

  CREATE TABLE anki_notetypes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL REFERENCES anki_imports(id) ON DELETE CASCADE,
    anki_id   INTEGER NOT NULL,
    name      TEXT NOT NULL,
    is_cloze  INTEGER NOT NULL,
    css       TEXT NOT NULL,
    fields    TEXT NOT NULL,
    templates TEXT NOT NULL
  );
  CREATE INDEX idx_anki_notetypes_import ON anki_notetypes(import_id, anki_id);

  CREATE TABLE anki_notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    notetype_id INTEGER NOT NULL REFERENCES anki_notetypes(id) ON DELETE CASCADE,
    guid        TEXT NOT NULL,
    fields      TEXT NOT NULL,
    tags        TEXT NOT NULL
  );
  CREATE INDEX idx_anki_notes_guid ON anki_notes(guid);

  CREATE TABLE anki_cards (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id        INTEGER NOT NULL REFERENCES anki_notes(id) ON DELETE CASCADE,
    deck_id        INTEGER NOT NULL REFERENCES anki_decks(id) ON DELETE CASCADE,
    ord            INTEGER NOT NULL,
    new_position   INTEGER NOT NULL,
    due            INTEGER NOT NULL,
    stability      REAL NOT NULL,
    difficulty     REAL NOT NULL,
    elapsed_days   INTEGER NOT NULL,
    scheduled_days INTEGER NOT NULL,
    learning_steps INTEGER NOT NULL,
    reps           INTEGER NOT NULL,
    lapses         INTEGER NOT NULL,
    state          INTEGER NOT NULL,
    last_review    INTEGER,
    suspended      INTEGER NOT NULL DEFAULT 0,
    UNIQUE (note_id, ord)
  );
  CREATE INDEX idx_anki_cards_deck_due ON anki_cards(deck_id, suspended, state, due);

  CREATE TABLE anki_revlog (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     INTEGER NOT NULL REFERENCES anki_cards(id) ON DELETE CASCADE,
    reviewed_at INTEGER NOT NULL,
    rating      INTEGER NOT NULL,
    duration_ms INTEGER,
    imported    INTEGER NOT NULL DEFAULT 0,
    prev_card   TEXT
  );
  CREATE INDEX idx_anki_revlog_time ON anki_revlog(reviewed_at);
  CREATE INDEX idx_anki_revlog_card ON anki_revlog(card_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await transaction(db, async (txn) => {
      await txn.execAsync(sql);
      await txn.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
