import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate } from '@/db/migrations';
import { createAppTimeTracker, MAX_SEGMENT_MS } from '@/time/appTime';
import { getRunning, startTimer, stopTimer } from '@/time/repo';
import { openNodeDb } from './helpers/nodeDb';

const T = Date.UTC(2026, 9, 11, 9);
const MIN = 60 * 1000;

async function freshDb(): Promise<SQLiteDatabase> {
  const db = openNodeDb();
  await migrate(db);
  return db;
}

const autoEntries = (db: SQLiteDatabase) =>
  db.getAllAsync<{ started_at: number; ended_at: number | null; source: string; name: string }>(
    "SELECT e.started_at, e.ended_at, e.source, a.name FROM time_entries e JOIN activities a ON a.id = e.activity_id WHERE e.source = 'auto' ORDER BY e.started_at",
  );

describe('app time tracking', () => {
  it('logs time with the app open as one finished Study entry that grows', async () => {
    const db = await freshDb();
    const t = createAppTimeTracker(db);
    t.begin(T);
    await t.check(T + 30 * 1000);
    expect(await autoEntries(db)).toHaveLength(0); // under a minute: nothing yet
    await t.check(T + 2 * MIN);
    await t.check(T + 3 * MIN);
    await t.end(T + 5 * MIN);
    expect(await autoEntries(db)).toEqual([{ started_at: T, ended_at: T + 5 * MIN, source: 'auto', name: 'Study' }]);
    expect(await getRunning(db)).toBeNull(); // never a running timer
  });

  it('starts a new entry each time the app is opened', async () => {
    const db = await freshDb();
    const t = createAppTimeTracker(db);
    t.begin(T);
    await t.end(T + 2 * MIN);
    await t.end(T + 10 * MIN); // background again: nothing new
    t.begin(T + 20 * MIN);
    await t.end(T + 25 * MIN);
    expect((await autoEntries(db)).map((e) => [e.started_at, e.ended_at])).toEqual([
      [T, T + 2 * MIN],
      [T + 20 * MIN, T + 25 * MIN],
    ]);
  });

  it('stops counting while your own timer runs, then picks up again', async () => {
    const db = await freshDb();
    const t = createAppTimeTracker(db);
    t.begin(T);
    await startTimer(db, 'Immersion', T + 5 * MIN);
    await t.check(T + 6 * MIN);
    await t.check(T + 20 * MIN);
    await stopTimer(db, T + 30 * MIN);
    t.resumeIfIdle(T + 30 * MIN);
    await t.end(T + 40 * MIN);
    expect((await autoEntries(db)).map((e) => [e.started_at, e.ended_at])).toEqual([
      [T, T + 5 * MIN],
      [T + 30 * MIN, T + 40 * MIN],
    ]);
  });

  it('caps one stretch at two hours', async () => {
    const db = await freshDb();
    const t = createAppTimeTracker(db);
    t.begin(T);
    await t.end(T + MAX_SEGMENT_MS + 30 * MIN);
    const [e] = await autoEntries(db);
    expect(e.ended_at! - e.started_at).toBe(MAX_SEGMENT_MS);
  });
});
