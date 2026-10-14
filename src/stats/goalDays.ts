import type { SQLiteDatabase } from 'expo-sqlite';
import { dailyTotals, type TimeEntry } from '../time/model';
import { dayKey } from './dates';

type Db = Pick<SQLiteDatabase, 'getAllAsync' | 'runAsync'>;

/**
 * Every local day with any study activity, as goal days. Used once, when the streak changed
 * from "studied at all" to "reached a goal", so nobody loses the streak they already had,
 * and when restoring a backup made before goal days were saved. Runs on the phone, so
 * 'localtime' is the phone's time zone, like dayKey.
 */
export const SEED_GOAL_DAYS_SQL = `
  INSERT OR IGNORE INTO goal_days (day)
  SELECT DISTINCT date(t / 1000, 'unixepoch', 'localtime') FROM (
    SELECT reviewed_at AS t FROM review_logs
    UNION ALL SELECT learned_at FROM cards
    UNION ALL SELECT reviewed_at FROM anki_revlog
    UNION ALL SELECT started_at FROM time_entries
  );`;

/** Days (dayKey) on which a daily goal was reached, from `since` on. */
export async function getGoalDays(db: Pick<SQLiteDatabase, 'getAllAsync'>, since: number): Promise<string[]> {
  const rows = await db.getAllAsync<{ day: string }>('SELECT day FROM goal_days WHERE day >= ? ORDER BY day', dayKey(since));
  return rows.map((r) => r.day);
}

export async function markGoalDays(db: Db, days: readonly string[]): Promise<void> {
  for (const day of days) await db.runAsync('INSERT OR IGNORE INTO goal_days (day) VALUES (?)', day);
}

/**
 * Recent days whose tracked time reached the goal. Time can be logged after the fact
 * (Shortcuts, manual entries), so these are worked out from the entries rather than only
 * noticed while the app is open.
 */
export function timeGoalDays(entries: TimeEntry[], goalMs: number, now: number, days = 7): string[] {
  if (goalMs <= 0) return [];
  return dailyTotals(entries, days, now)
    .filter((d) => d.total >= goalMs)
    .map((d) => dayKey(d.dayStart));
}
