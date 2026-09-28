import type { ExampleSeen } from '../srs/exampleRotation';
import type { StoredCard, StoredLog } from '../srs/scheduler';

export const BACKUP_APP_ID = 'jlpt-grammar';
export const BACKUP_FORMAT_VERSION = 1;

export interface ExampleSeenRow extends ExampleSeen {
  grammar_id: string;
  times_wrong: number;
}

export interface BackupData {
  cards: StoredCard[];
  review_logs: StoredLog[];
  example_seen: ExampleSeenRow[];
  settings: Record<string, unknown>;
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
  if (!isObj(raw) || raw.app !== BACKUP_APP_ID) throw new Error('This is not a grammar app backup file.');
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
  return raw as unknown as BackupFile;
}
