import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { parseTimerCommand, type Activity, type TimeEntry, type TimerCommand } from './model';
import { getRunning, startTimer, stopTimer, toggleTimer } from './repo';

/*
 * The iOS Shortcuts / Siri actions (plugins/app-intents/KaeruIntents.swift) run without opening
 * the app, so they can't touch the database. Each one drops a JSON command into
 * Documents/timer-inbox; the app applies them here, with the time they were made. In return the
 * app mirrors its activities and running timer to Documents/timer-state.json for the actions.
 */

const INBOX_DIR = 'timer-inbox';
const STATE_FILE = 'timer-state.json';

export interface InboxCommand {
  command: TimerCommand;
  at: number;
}

/** Parse one queued command; null for anything malformed. */
export function parseInboxCommand(text: string): InboxCommand | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const { action, activity, note, at } = raw as Record<string, unknown>;
  if (typeof action !== 'string' || typeof at !== 'number' || !Number.isFinite(at)) return null;
  const command = parseTimerCommand(action, {
    activity: typeof activity === 'string' ? activity : undefined,
    note: typeof note === 'string' ? note : undefined,
  });
  return command ? { command, at } : null;
}

/** Apply a queued command at its own time (never before the running timer's start). */
export async function applyInboxCommand(db: SQLiteDatabase, { command, at }: InboxCommand): Promise<void> {
  const running = await getRunning(db);
  const t = Math.max(at, running?.started_at ?? 0);
  if (command.kind === 'start') await startTimer(db, command.activity, t, 'shortcut', command.note);
  else if (command.kind === 'stop') await stopTimer(db, t);
  else await toggleTimer(db, command.activity, t, 'shortcut', command.note);
}

let draining = false;

/** Apply and remove every queued command, oldest first. Returns whether anything was applied. */
export async function drainShortcutInbox(db: SQLiteDatabase): Promise<boolean> {
  if (Platform.OS !== 'ios' || draining) return false;
  draining = true;
  try {
    const dir = new Directory(Paths.document, INBOX_DIR);
    if (!dir.exists) return false;
    const files = dir.list().filter((f): f is File => f instanceof File && f.name.endsWith('.json'));
    const commands: InboxCommand[] = [];
    for (const file of files) {
      const parsed = parseInboxCommand(await file.text());
      // Removed before applying: a crash mid-way loses one tap rather than applying it twice.
      file.delete();
      if (parsed) commands.push(parsed);
    }
    commands.sort((a, b) => a.at - b.at);
    for (const c of commands) await applyInboxCommand(db, c);
    return commands.length > 0;
  } finally {
    draining = false;
  }
}

/** What the Shortcuts actions read: activity names to offer, and what's running. */
export function timerStateForShortcuts(activities: Activity[], running: TimeEntry | null) {
  return {
    activities: activities.filter((a) => !a.archived).map((a) => a.name),
    running: running ? (activities.find((a) => a.id === running.activity_id)?.name ?? null) : null,
  };
}

export function writeShortcutState(activities: Activity[], running: TimeEntry | null): void {
  if (Platform.OS !== 'ios') return;
  const file = new File(Paths.document, STATE_FILE);
  if (!file.exists) file.create();
  file.write(JSON.stringify(timerStateForShortcuts(activities, running)));
}
