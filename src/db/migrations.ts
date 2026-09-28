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
