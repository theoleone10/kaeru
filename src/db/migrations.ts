import type { SQLiteDatabase } from 'expo-sqlite';
import { SEED_GOAL_DAYS_SQL } from '../stats/goalDays';
import { transaction } from './repo';

/**
 * Triggers that bump sync_state.version on any change to `tables`, so cloud sync knows the
 * cloud copy is out of date. A new backed-up table needs a new migration calling this.
 */
const bumpTriggers = (tables: readonly string[]) =>
  tables
    .flatMap((t) =>
      (['INSERT', 'UPDATE', 'DELETE'] as const).map(
        (op) => `CREATE TRIGGER sync_bump_${t}_${op.toLowerCase()} AFTER ${op} ON ${t} BEGIN UPDATE sync_state SET version = version + 1; END;`,
      ),
    )
    .join('\n  ');

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
  INSERT INTO activities (name, color, position) VALUES ('Immersion', '#2F7FC1', 0), ('Study', '#3FA34D', 1);

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

  -- Anki: decks, note types and notes are keyed by Anki's own stable ids, so
  -- re-importing an updated export updates in place instead of duplicating.
  CREATE TABLE anki_imports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name   TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    notes       INTEGER NOT NULL,
    cards       INTEGER NOT NULL
  );

  CREATE TABLE anki_decks (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    anki_id INTEGER NOT NULL UNIQUE,
    name    TEXT NOT NULL
  );

  CREATE TABLE anki_notetypes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    anki_id   INTEGER NOT NULL UNIQUE,
    name      TEXT NOT NULL,
    is_cloze  INTEGER NOT NULL,
    css       TEXT NOT NULL,
    fields    TEXT NOT NULL,
    templates TEXT NOT NULL
  );

  CREATE TABLE anki_notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    notetype_id INTEGER NOT NULL REFERENCES anki_notetypes(id) ON DELETE CASCADE,
    guid        TEXT NOT NULL UNIQUE,
    fields      TEXT NOT NULL,
    tags        TEXT NOT NULL
  );

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
    prev_state  INTEGER NOT NULL,
    duration_ms INTEGER,
    imported    INTEGER NOT NULL DEFAULT 0,
    prev_card   TEXT
  );
  CREATE INDEX idx_anki_revlog_time ON anki_revlog(reviewed_at);
  CREATE INDEX idx_anki_revlog_card ON anki_revlog(card_id, reviewed_at);
  `,
  `
  -- Per-deck daily limits, keyed by the deck's "::" path (so they survive re-importing it).
  -- NULL means "use the default from Settings".
  CREATE TABLE anki_deck_limits (
    path            TEXT PRIMARY KEY NOT NULL,
    new_per_day     INTEGER,
    reviews_per_day INTEGER
  );
  `,
  `
  -- New cards in study order per deck, so a session reads each deck's first few without sorting them all.
  CREATE INDEX idx_anki_cards_new_order ON anki_cards(deck_id, suspended, state, new_position, id);
  `,
  `
  -- A counter bumped by every change to backed-up data, so cloud sync can skip uploads when nothing changed.
  CREATE TABLE sync_state (version INTEGER NOT NULL);
  INSERT INTO sync_state (version) VALUES (1);
  ${bumpTriggers([
    'cards',
    'review_logs',
    'example_seen',
    'settings',
    'activities',
    'time_entries',
    'anki_imports',
    'anki_decks',
    'anki_notetypes',
    'anki_notes',
    'anki_cards',
    'anki_revlog',
    'anki_deck_limits',
  ])}
  `,
  `
  -- Days on which at least one daily goal was reached: the streak. Seeded from every day
  -- with any study, which is what the streak counted before.
  CREATE TABLE goal_days (day TEXT PRIMARY KEY NOT NULL);
  ${SEED_GOAL_DAYS_SQL}
  ${bumpTriggers(['goal_days'])}
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
