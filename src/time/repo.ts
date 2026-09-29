import type { SQLiteDatabase } from 'expo-sqlite';
import { transaction } from '../db/repo';
import { ACTIVITY_COLORS, type Activity, type ImportedEntry, type TimeEntry } from './model';

export function listActivities(db: SQLiteDatabase): Promise<Activity[]> {
  return db.getAllAsync<Activity>('SELECT * FROM activities ORDER BY position, id');
}

/** Find an activity by name (case-insensitive), creating it if it doesn't exist. */
export async function ensureActivity(db: Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>, name: string): Promise<number> {
  const clean = name.trim().slice(0, 40) || 'Immersion';
  const existing = await db.getFirstAsync<{ id: number; archived: number }>('SELECT id, archived FROM activities WHERE name = ? COLLATE NOCASE', clean);
  if (existing) {
    if (existing.archived) await db.runAsync('UPDATE activities SET archived = 0 WHERE id = ?', existing.id);
    return existing.id;
  }
  const count = (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM activities'))?.n ?? 0;
  const res = await db.runAsync(
    'INSERT INTO activities (name, color, position) VALUES (?, ?, ?)',
    clean,
    ACTIVITY_COLORS[count % ACTIVITY_COLORS.length],
    count,
  );
  return res.lastInsertRowId;
}

export async function renameActivity(db: SQLiteDatabase, id: number, name: string): Promise<void> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error('Enter a name.');
  const clash = await db.getFirstAsync<{ id: number }>('SELECT id FROM activities WHERE name = ? COLLATE NOCASE AND id != ?', clean, id);
  if (clash) throw new Error(`There's already an activity called ${clean}.`);
  await db.runAsync('UPDATE activities SET name = ? WHERE id = ?', clean, id);
}

export async function setActivityColor(db: SQLiteDatabase, id: number, color: string): Promise<void> {
  await db.runAsync('UPDATE activities SET color = ? WHERE id = ?', color, id);
}

/** Hide an activity from the start buttons; its history stays. */
export async function archiveActivity(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('UPDATE activities SET archived = 1 WHERE id = ?', id);
}

export function getRunning(db: Pick<SQLiteDatabase, 'getFirstAsync'>): Promise<TimeEntry | null> {
  return db.getFirstAsync<TimeEntry>('SELECT * FROM time_entries WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1');
}

export function listEntriesSince(db: SQLiteDatabase, since: number): Promise<TimeEntry[]> {
  // Include entries that started earlier but run into the window.
  return db.getAllAsync<TimeEntry>(
    'SELECT * FROM time_entries WHERE started_at >= ? OR ended_at IS NULL OR ended_at >= ? ORDER BY started_at DESC',
    since,
    since,
  );
}

/** Start a timer for `activity`, stopping any running one first (like Toggl). */
export async function startTimer(db: SQLiteDatabase, activity: string | number, now: number, source = 'timer', note = ''): Promise<void> {
  await transaction(db, async (txn) => {
    await txn.runAsync('UPDATE time_entries SET ended_at = ? WHERE ended_at IS NULL', now);
    const activityId = typeof activity === 'number' ? activity : await ensureActivity(txn, activity);
    await txn.runAsync('INSERT INTO time_entries (activity_id, started_at, ended_at, note, source) VALUES (?, ?, NULL, ?, ?)', activityId, now, note, source);
  });
}

/** Stop the running timer. Returns false if nothing was running. */
export async function stopTimer(db: SQLiteDatabase, now: number): Promise<boolean> {
  const res = await db.runAsync('UPDATE time_entries SET ended_at = ? WHERE ended_at IS NULL', now);
  return res.changes > 0;
}

/** Stop if `activity` is running; otherwise start it. Returns what happened. */
export async function toggleTimer(db: SQLiteDatabase, activity: string, now: number, source = 'shortcut', note = ''): Promise<'started' | 'stopped'> {
  const running = await getRunning(db);
  if (running) {
    const act = await db.getFirstAsync<{ name: string }>('SELECT name FROM activities WHERE id = ?', running.activity_id);
    if (act && act.name.toLowerCase() === activity.trim().toLowerCase()) {
      await stopTimer(db, now);
      return 'stopped';
    }
  }
  await startTimer(db, activity, now, source, note);
  return 'started';
}

export async function addEntry(db: SQLiteDatabase, entry: { activity_id: number; started_at: number; ended_at: number; note?: string; source?: string }): Promise<void> {
  if (entry.ended_at <= entry.started_at) throw new Error('The end time must be after the start time.');
  await db.runAsync(
    'INSERT INTO time_entries (activity_id, started_at, ended_at, note, source) VALUES (?, ?, ?, ?, ?)',
    entry.activity_id,
    entry.started_at,
    entry.ended_at,
    entry.note ?? '',
    entry.source ?? 'manual',
  );
}

export async function updateEntry(db: SQLiteDatabase, id: number, patch: { activity_id: number; started_at: number; ended_at: number | null; note: string }): Promise<void> {
  if (patch.ended_at != null && patch.ended_at <= patch.started_at) throw new Error('The end time must be after the start time.');
  await db.runAsync(
    'UPDATE time_entries SET activity_id = ?, started_at = ?, ended_at = ?, note = ? WHERE id = ?',
    patch.activity_id,
    patch.started_at,
    patch.ended_at,
    patch.note,
    id,
  );
}

export async function deleteEntry(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM time_entries WHERE id = ?', id);
}

/** Import finished entries, skipping any that already exist (same activity and start time). Returns how many were added. */
export async function importEntries(db: SQLiteDatabase, entries: ImportedEntry[], source = 'import'): Promise<number> {
  let added = 0;
  await transaction(db, async (txn) => {
    const ids = new Map<string, number>();
    for (const e of entries) {
      const key = e.activity.toLowerCase();
      if (!ids.has(key)) ids.set(key, await ensureActivity(txn, e.activity));
      const activityId = ids.get(key)!;
      const dup = await txn.getFirstAsync('SELECT id FROM time_entries WHERE activity_id = ? AND started_at = ?', activityId, e.started_at);
      if (dup) continue;
      await txn.runAsync(
        'INSERT INTO time_entries (activity_id, started_at, ended_at, note, source) VALUES (?, ?, ?, ?, ?)',
        activityId,
        e.started_at,
        e.ended_at,
        e.note,
        source,
      );
      added++;
    }
  });
  return added;
}
