/// <reference types="node" />
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ANKI_TABLES } from '@/anki/backup';
import { readCollection } from '@/anki/collection';
import { unpackPackage } from '@/anki/package';
import { setDeckLimits } from '@/anki/repo';
import { saveCollection } from '@/anki/store';
import { backupCounts, buildBackup, describeCounts, parseBackup } from '@/backup/format';
import { migrate } from '@/db/migrations';
import { markKnown, readAllForBackup, replaceAllFromBackup } from '@/db/repo';
import { localVersion, restoreFromCloud, uploadProgress } from '@/sync/cloud';
import { dayKey } from '@/stats/dates';
import { addEntry, startTimer } from '@/time/repo';
import { openNodeDb } from './helpers/nodeDb';

const upserts: unknown[] = [];
jest.mock('@/auth/supabase', () => ({
  authConfigured: true,
  supabase: {
    from: () => ({
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: null };
      },
    }),
  },
}));

const CRT = 1767225600;
const NOW = (CRT + 95 * 86400) * 1000;
const HOUR = 3600_000;

async function importFixture(db: SQLiteDatabase, name: string) {
  const bytes = new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));
  let pos = 0;
  const read = (n: number) => {
    const chunk = bytes.subarray(pos, pos + n);
    pos += chunk.length;
    return chunk;
  };
  const entries = new Map<string, Uint8Array>();
  const { collection } = await unpackPackage(read, bytes.length, { entry: (n, b) => void entries.set(n, b) });
  const path = join(mkdtempSync(join(tmpdir(), 'anki-')), 'c.db');
  writeFileSync(path, entries.get(collection)!);
  const src = openNodeDb(path);
  const col = await readCollection(src);
  await src.closeAsync();
  await saveCollection(db, col, name, NOW);
}

async function freshDb(): Promise<SQLiteDatabase> {
  const db = openNodeDb();
  await migrate(db);
  return db;
}

/** A phone with grammar, flashcards (with limits) and time tracking, including a running timer. */
async function fullPhone(): Promise<SQLiteDatabase> {
  const db = await freshDb();
  await markKnown(db, [{ id: 'n5-desu', level: 'N5' }], NOW);
  await importFixture(db, 'modern.apkg');
  const deck = (await db.getFirstAsync<{ name: string }>('SELECT name FROM anki_decks'))!.name;
  await setDeckLimits(db, deck, { newPerDay: 7, reviewsPerDay: null });
  await addEntry(db, { activity_id: 1, started_at: NOW - 3 * HOUR, ended_at: NOW - 2 * HOUR, note: 'Anime' });
  await startTimer(db, 'Study', NOW - HOUR);
  return db;
}

describe('backup with Anki decks', () => {
  it('round-trips every Anki table through a backup file onto another phone', async () => {
    const a = await fullPhone();
    const original = await readAllForBackup(a);
    expect(original.anki!.anki_cards.length).toBeGreaterThan(0);
    expect(original.anki!.anki_revlog.length).toBeGreaterThan(0);
    expect(original.anki!.anki_deck_limits).toHaveLength(1);

    const file = parseBackup(JSON.stringify(buildBackup(original, NOW)));
    const b = await freshDb();
    await replaceAllFromBackup(b, file, NOW);
    const restored = await readAllForBackup(b);

    expect(restored.anki).toEqual(original.anki);
    expect(restored.cards).toEqual(original.cards);
    // The timer that was running when the backup was made stops at that moment.
    const running = original.time_entries.find((e) => e.ended_at === null)!;
    expect(restored.time_entries.find((e) => e.id === running.id)!.ended_at).toBe(NOW);
    expect(await b.getFirstAsync('SELECT id FROM time_entries WHERE ended_at IS NULL')).toBeNull();
  });

  it('keeps the phone’s own decks when restoring an older backup without Anki data', async () => {
    const phone = await fullPhone();
    const decksBefore = (await readAllForBackup(phone)).anki;
    const { anki: _anki, ...v2 } = buildBackup(await readAllForBackup(await freshDb()), NOW);
    await replaceAllFromBackup(phone, parseBackup(JSON.stringify({ ...v2, format_version: 2 })), NOW);
    expect((await readAllForBackup(phone)).anki).toEqual(decksBefore);
  });

  it('round-trips goal days, and rebuilds them from study history for older backups', async () => {
    const a = await fullPhone();
    await a.runAsync("INSERT INTO goal_days (day) VALUES ('2026-01-02')");
    const original = await readAllForBackup(a);
    expect(original.goal_days).toContain('2026-01-02');

    const b = await freshDb();
    await replaceAllFromBackup(b, parseBackup(JSON.stringify(buildBackup(original, NOW))), NOW);
    expect((await readAllForBackup(b)).goal_days).toEqual(original.goal_days);

    const { goal_days: _g, ...v3 } = buildBackup(original, NOW);
    const c = await freshDb();
    await replaceAllFromBackup(c, parseBackup(JSON.stringify({ ...v3, format_version: 3 })), NOW);
    const rebuilt = (await readAllForBackup(c)).goal_days!;
    expect(rebuilt).not.toContain('2026-01-02');
    expect(rebuilt).toContain(dayKey(NOW - 3 * HOUR)); // the tracked time
  });

  it('rejects malformed goal days', async () => {
    const backup = buildBackup(await readAllForBackup(await freshDb()), NOW);
    expect(() => parseBackup(JSON.stringify({ ...backup, goal_days: ['yesterday'] }))).toThrow('goal_days');
  });

  it('rejects malformed Anki rows with a readable path', async () => {
    const backup = buildBackup(await readAllForBackup(await fullPhone()), NOW);
    (backup.anki!.anki_cards[0] as Record<string, unknown>).due = 'soon';
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('anki.anki_cards[0]: "due"');
  });

  it('describes what a backup holds', async () => {
    const counts = backupCounts(await readAllForBackup(await fullPhone()));
    expect(counts.points).toBe(1);
    expect(counts.timeEntries).toBe(2);
    expect(describeCounts(counts)).toMatch(/^1 grammar point, \d+ flashcards and 2 time entries$/);
    expect(describeCounts({ points: 0, reviews: 0, flashcards: 0, timeEntries: 0 })).toBe('no progress');
  });
});

describe('cloud upload', () => {
  beforeEach(() => {
    upserts.length = 0;
  });

  it('bumps the change counter on writes to backed-up tables, not on meta', async () => {
    const db = await freshDb();
    const v0 = await localVersion(db);
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('x', '1')");
    expect(await localVersion(db)).toBe(v0);
    await addEntry(db, { activity_id: 1, started_at: NOW - HOUR, ended_at: NOW });
    expect(await localVersion(db)).toBeGreaterThan(v0);
  });

  it('has change triggers on every table a backup holds', async () => {
    const db = await freshDb();
    const triggers = await db.getAllAsync<{ tbl_name: string }>("SELECT tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync_bump_%'");
    const covered = new Set(triggers.map((t) => t.tbl_name));
    const backedUp = ['cards', 'review_logs', 'example_seen', 'settings', 'activities', 'time_entries', 'goal_days', ...Object.keys(ANKI_TABLES)];
    expect(backedUp.filter((t) => !covered.has(t))).toEqual([]);
  });

  it('skips the upload when nothing changed since the last one', async () => {
    const db = await fullPhone();
    expect(await uploadProgress(db, 'u1', { now: NOW })).toBe(true);
    expect(await uploadProgress(db, 'u1', { now: NOW })).toBe(false);
    expect(await uploadProgress(db, 'u1', { now: NOW, force: true })).toBe(true);
    await addEntry(db, { activity_id: 1, started_at: NOW, ended_at: NOW + HOUR });
    expect(await uploadProgress(db, 'u1', { now: NOW })).toBe(true);
    expect(upserts).toHaveLength(3);
  });

  it('counts a restored phone as in sync with the cloud', async () => {
    const backup = buildBackup(await readAllForBackup(await fullPhone()), NOW);
    const db = await freshDb();
    await restoreFromCloud(db, { backup, updatedAt: NOW }, NOW);
    expect(await uploadProgress(db, 'u1', { now: NOW })).toBe(false);
  });
});
