/** Time tracking (Toggl-style): activities and start/stop entries, all times unix ms. */

export interface Activity {
  id: number;
  name: string;
  color: string;
  position: number;
  archived: number;
}

export interface TimeEntry {
  id: number;
  activity_id: number;
  started_at: number;
  /** null while the timer is running */
  ended_at: number | null;
  note: string;
  /** 'timer' | 'manual' | 'shortcut' | 'auto' | 'import' */
  source: string;
}

export const ACTIVITY_COLORS = ['#2F7FC1', '#3FA34D', '#8E5BB5', '#D9663D', '#F2B33D', '#2A9D8F', '#E4574B'];

const DAY = 24 * 60 * 60 * 1000;

export function entryDuration(e: Pick<TimeEntry, 'started_at' | 'ended_at'>, now: number): number {
  return Math.max(0, (e.ended_at ?? now) - e.started_at);
}

/** Local midnight at or before `t`. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week containing `t`. */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

/** Time of `e` that falls inside [from, to). Entries crossing midnight are split between days. */
export function overlap(e: Pick<TimeEntry, 'started_at' | 'ended_at'>, from: number, to: number, now: number): number {
  const s = Math.max(e.started_at, from);
  const end = Math.min(e.ended_at ?? now, to);
  return Math.max(0, end - s);
}

/** Total per activity id within [from, to). */
export function totalsByActivity(entries: TimeEntry[], from: number, to: number, now: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of entries) {
    const ms = overlap(e, from, to, now);
    if (ms > 0) out.set(e.activity_id, (out.get(e.activity_id) ?? 0) + ms);
  }
  return out;
}

export interface DayTotals {
  dayStart: number;
  byActivity: Map<number, number>;
  total: number;
}

/** The last `days` days (oldest first, ending today), each with per-activity totals. */
export function dailyTotals(entries: TimeEntry[], days: number, now: number): DayTotals[] {
  const out: DayTotals[] = [];
  const today = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const from = d.getTime();
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    const byActivity = totalsByActivity(entries, from, next.getTime(), now);
    let total = 0;
    for (const v of byActivity.values()) total += v;
    out.push({ dayStart: from, byActivity, total });
  }
  return out;
}

/** Consecutive days (ending today, or yesterday if nothing yet today) with any tracked time. */
export function trackingStreak(entries: TimeEntry[], now: number): number {
  const days = new Set<number>();
  for (const e of entries) {
    // A long entry counts for every day it touches.
    for (let t = startOfDay(e.started_at); t < (e.ended_at ?? now); t += DAY) days.add(startOfDay(t + DAY / 2));
  }
  let cursor = startOfDay(now);
  if (!days.has(cursor)) cursor = startOfDay(cursor - DAY / 2);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = startOfDay(cursor - DAY / 2);
  }
  return streak;
}

/** 1:05:09, 12:03 — for a running clock. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 2h 05m, 45m, 0m — for totals. */
export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// ---------- Shortcuts / deep links ----------

export type TimerCommand =
  | { kind: 'start'; activity: string; note: string }
  | { kind: 'stop' }
  | { kind: 'toggle'; activity: string; note: string };

/**
 * kaeru://timer/start?activity=Immersion&note=Anime
 * kaeru://timer/stop
 * kaeru://timer/toggle?activity=Study
 */
export function parseTimerCommand(action: string | undefined, params: { activity?: string; note?: string }): TimerCommand | null {
  const activity = (params.activity ?? '').trim() || 'Immersion';
  const note = (params.note ?? '').trim();
  switch ((action ?? '').toLowerCase()) {
    case 'start':
      return { kind: 'start', activity, note };
    case 'stop':
      return { kind: 'stop' };
    case 'toggle':
      return { kind: 'toggle', activity, note };
    default:
      return null;
  }
}

// ---------- Toggl CSV import ----------

export interface ImportedEntry {
  activity: string;
  started_at: number;
  ended_at: number;
  note: string;
}

/** RFC 4180-ish CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function localTime(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h = 0, mi = 0, s = 0] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

/**
 * Toggl Track "Detailed report" CSV export. Uses Project as the activity (falling back to
 * Description), Description as the note. Dates are YYYY-MM-DD in local time.
 */
export function parseTogglCsv(text: string): ImportedEntry[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The file has no time entries.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    project: col('project'),
    description: col('description'),
    startDate: col('start date'),
    startTime: col('start time'),
    endDate: col('end date'),
    endTime: col('end time'),
  };
  if (idx.startDate < 0 || idx.startTime < 0 || idx.endDate < 0 || idx.endTime < 0) {
    throw new Error('This doesn’t look like a Toggl export. In Toggl, open Reports → Detailed and export as CSV.');
  }
  const out: ImportedEntry[] = [];
  for (const r of rows.slice(1)) {
    const started_at = localTime(r[idx.startDate] ?? '', r[idx.startTime] ?? '');
    const ended_at = localTime(r[idx.endDate] ?? '', r[idx.endTime] ?? '');
    if (!Number.isFinite(started_at) || !Number.isFinite(ended_at) || ended_at <= started_at) continue;
    const project = idx.project >= 0 ? (r[idx.project] ?? '').trim() : '';
    const description = idx.description >= 0 ? (r[idx.description] ?? '').trim() : '';
    out.push({ activity: project || description || 'Imported', started_at, ended_at, note: project ? description : '' });
  }
  return out;
}
