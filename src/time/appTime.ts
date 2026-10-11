import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureActivity, getRunning } from './repo';

const MIN_MS = 60 * 1000;
/** A single stretch never counts more than this, in case the phone sat on a screen. */
export const MAX_SEGMENT_MS = 2 * 60 * 60 * 1000;

/**
 * Logs time with Kaeru open to the "Study" activity (source 'auto'), quietly: it's saved as a
 * finished entry that grows while you use the app, never as a running timer. Each stretch in the
 * foreground becomes one entry once it passes a minute. Nothing is logged while a timer of your
 * own is running (that time is already tracked).
 */
export function createAppTimeTracker(db: SQLiteDatabase) {
  let start: number | null = null;
  let entryId: number | null = null;

  const save = async (end: number) => {
    if (start === null) return;
    const until = Math.min(end, start + MAX_SEGMENT_MS);
    if (until - start < MIN_MS) return;
    if (entryId === null) {
      const studyId = await ensureActivity(db, 'Study');
      const r = await db.runAsync("INSERT INTO time_entries (activity_id, started_at, ended_at, note, source) VALUES (?, ?, ?, '', 'auto')", studyId, start, until);
      entryId = r.lastInsertRowId;
    } else {
      await db.runAsync('UPDATE time_entries SET ended_at = ? WHERE id = ?', until, entryId);
    }
    // Past the cap: start a fresh stretch from now.
    if (end - start >= MAX_SEGMENT_MS) {
      start = end;
      entryId = null;
    }
  };

  return {
    /** The app came to the foreground (or tracking was switched on). */
    begin(now: number) {
      start = now;
      entryId = null;
    },
    /** Save progress so far. */
    async check(now: number): Promise<void> {
      if (start === null) return;
      const running = await getRunning(db);
      if (running) {
        // Count up to when your own timer took over, then stop until it ends.
        await save(Math.max(start, Math.min(now, running.started_at)));
        start = null;
        entryId = null;
        return;
      }
      await save(now);
    },
    /** The app went to the background: save and stop counting. */
    async end(now: number) {
      await this.check(now);
      start = null;
      entryId = null;
    },
    /** For the next check after a timer stops: count again from now. */
    resumeIfIdle(now: number) {
      if (start === null) start = now;
    },
  };
}
