import { validateAnki, type AnkiBackup } from '../anki/backup';
import { validateKana, type KanaBackup } from '../kana/repo';
import type { ExampleSeen } from '../srs/exampleRotation';
import type { StoredCard, StoredLog } from '../srs/scheduler';
import type { Activity, TimeEntry } from '../time/model';

/** Kept from before the app was called Kaeru, so older backup files still load. */
export const BACKUP_APP_ID = 'jlpt-grammar';
/**
 * v2 added time tracking (activities, time_entries); v3 added Anki decks (anki); v4 the streak
 * (goal_days); v5 the kana course (kana). Older files still load.
 */
export const BACKUP_FORMAT_VERSION = 5;

export interface ExampleSeenRow extends ExampleSeen {
  grammar_id: string;
  times_wrong: number;
}

export interface BackupData {
  cards: StoredCard[];
  review_logs: StoredLog[];
  example_seen: ExampleSeenRow[];
  settings: Record<string, unknown>;
  activities: Activity[];
  time_entries: TimeEntry[];
  /** Missing in v1/v2 files: restoring one of those keeps the phone's own decks. */
  anki?: AnkiBackup;
  /** Days a daily goal was reached (dayKey). Missing before v4: restoring rebuilds it from the study history. */
  goal_days?: string[];
  /** Kana course progress. Missing before v5: restoring one of those keeps the phone's own. */
  kana?: KanaBackup;
}

export interface BackupFile extends BackupData {
  app: typeof BACKUP_APP_ID;
  format_version: number;
  exported_at: string;
}

export function buildBackup(data: BackupData, now: number): BackupFile {
  return { app: BACKUP_APP_ID, format_version: BACKUP_FORMAT_VERSION, exported_at: new Date(now).toISOString(), ...data };
}

const CARD_NUMBERS = [
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'learning_steps',
  'reps',
  'lapses',
  'state',
  'learned_at',
  'suspended',
] as const;
const LOG_NUMBERS = [
  'rating',
  'reviewed_at',
  'state',
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'last_elapsed_days',
  'scheduled_days',
  'learning_steps',
] as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireFields(row: unknown, where: string, strings: readonly string[], numbers: readonly string[]): void {
  if (!isObj(row)) throw new Error(`${where}: not an object`);
  for (const k of strings) if (typeof row[k] !== 'string') throw new Error(`${where}: "${k}" must be a string`);
  for (const k of numbers) if (typeof row[k] !== 'number' || !Number.isFinite(row[k])) throw new Error(`${where}: "${k}" must be a number`);
}

/** Parse and validate a backup file. Throws an Error with a readable message on bad input. */
export function parseBackup(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP_ID) throw new Error('This is not a Kaeru backup file.');
  if (typeof raw.format_version !== 'number' || raw.format_version > BACKUP_FORMAT_VERSION) {
    throw new Error('This backup was made by a newer version of the app.');
  }
  if (!Array.isArray(raw.cards) || !Array.isArray(raw.review_logs) || !Array.isArray(raw.example_seen) || !isObj(raw.settings)) {
    throw new Error('Backup is missing cards, review_logs, example_seen or settings.');
  }
  raw.cards.forEach((c, i) => {
    requireFields(c, `cards[${i}]`, ['grammar_id', 'level'], CARD_NUMBERS);
    const lr = (c as Record<string, unknown>).last_review;
    if (lr !== null && typeof lr !== 'number') throw new Error(`cards[${i}]: "last_review" must be a number or null`);
  });
  raw.review_logs.forEach((l, i) => {
    requireFields(l, `review_logs[${i}]`, ['grammar_id', 'example_id', 'answer', 'prev_card'], LOG_NUMBERS);
  });
  raw.example_seen.forEach((e, i) => {
    requireFields(e, `example_seen[${i}]`, ['example_id', 'grammar_id'], ['times_shown', 'times_wrong']);
  });
  // v1 backups predate time tracking.
  const activities = raw.activities ?? [];
  const entries = raw.time_entries ?? [];
  if (!Array.isArray(activities) || !Array.isArray(entries)) throw new Error('Backup has malformed time tracking data.');
  activities.forEach((a, i) => requireFields(a, `activities[${i}]`, ['name', 'color'], ['id', 'position', 'archived']));
  entries.forEach((e, i) => {
    requireFields(e, `time_entries[${i}]`, ['note', 'source'], ['id', 'activity_id', 'started_at']);
    const end = (e as Record<string, unknown>).ended_at;
    if (end !== null && typeof end !== 'number') throw new Error(`time_entries[${i}]: "ended_at" must be a number or null`);
  });
  const anki = raw.anki === undefined ? undefined : validateAnki(raw.anki);
  const goalDays = raw.goal_days;
  if (goalDays !== undefined && (!Array.isArray(goalDays) || goalDays.some((d) => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)))) {
    throw new Error('Backup has malformed goal_days.');
  }
  const kana = raw.kana === undefined ? undefined : validateKana(raw.kana);
  return { ...(raw as unknown as BackupFile), activities, time_entries: entries, anki, goal_days: goalDays, kana } as BackupFile;
}

export interface BackupCounts {
  points: number;
  reviews: number;
  flashcards: number;
  /** Time entries you made yourself (timer, Shortcuts, manual, imports), not the automatic time-in-app ones. */
  timeEntries: number;
  /** Kana course lessons passed. */
  kanaLessons: number;
}

export function backupCounts(data: BackupData): BackupCounts {
  return {
    points: data.cards.length,
    reviews: data.review_logs.length,
    flashcards: data.anki?.anki_cards.length ?? 0,
    timeEntries: data.time_entries.filter((e) => e.source !== 'auto').length,
    kanaLessons: data.kana?.lessons.length ?? 0,
  };
}

export function isEmptyProgress(c: BackupCounts): boolean {
  return c.points === 0 && c.reviews === 0 && c.flashcards === 0 && c.timeEntries === 0 && c.kanaLessons === 0;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** "12 grammar points, 340 flashcards and 25 time entries" (or "no progress"). */
export function describeCounts(c: BackupCounts): string {
  const parts = [
    c.points || c.reviews ? plural(c.points, 'grammar point') : '',
    c.flashcards ? plural(c.flashcards, 'flashcard') : '',
    c.timeEntries ? plural(c.timeEntries, 'time entry').replace('entrys', 'entries') : '',
    c.kanaLessons ? plural(c.kanaLessons, 'kana lesson') : '',
  ].filter(Boolean);
  if (parts.length === 0) return 'no progress';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
