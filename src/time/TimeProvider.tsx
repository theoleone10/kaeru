import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { playSound } from '../sound/sounds';
import type { Activity, TimeEntry, TimerCommand } from './model';
import { getRunning, listActivities, listEntriesSince, startTimer, stopTimer, toggleTimer } from './repo';
import { drainShortcutInbox, onInboxApplied, writeShortcutState } from './shortcutInbox';

const HISTORY_DAYS = 120;
const DAY = 24 * 60 * 60 * 1000;
/** How often to pick up Shortcuts actions run while the app is open (e.g. Back Tap). */
const INBOX_POLL_MS = 2000;

interface TimeContextValue {
  activities: Activity[];
  /** Entries from the last ~4 months, newest first (includes the running one). */
  entries: TimeEntry[];
  running: TimeEntry | null;
  activityById: Map<number, Activity>;
  refresh: () => Promise<void>;
  start: (activity: string | number, source?: string) => Promise<void>;
  stop: () => Promise<void>;
  /** Run a timer command (from a kaeru://timer link) now, after any queued Shortcuts actions. */
  command: (cmd: TimerCommand, source?: string) => Promise<void>;
}

const TimeContext = createContext<TimeContextValue | null>(null);

export function TimeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [running, setRunning] = useState<TimeEntry | null>(null);

  // Refreshes run one at a time. Two at once (e.g. on coming back to the app) could let one read
  // the database while the other was still applying a queued Shortcuts command, then mirror that
  // stale timer to the Shortcuts actions last: Stop Timer would then think nothing was running.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const load = useCallback(async () => {
    const [a, e, r] = await Promise.all([listActivities(db), listEntriesSince(db, Date.now() - HISTORY_DAYS * DAY), getRunning(db)]);
    setActivities(a);
    setEntries(e);
    setRunning(r);
    try {
      writeShortcutState(a, r);
    } catch {
      // Only the Shortcuts actions' activity list and Toggle would be a little stale.
    }
  }, [db]);

  const refresh = useCallback(
    () =>
      serial(async () => {
        await drainShortcutInbox(db).catch(() => false);
        await load();
      }),
    [db, serial, load],
  );

  /**
   * Every change to the timer goes through here, one at a time and after the Shortcuts inbox is
   * applied. Otherwise a Start Timer action queued earlier could be applied after a stop made
   * here, and start the timer again.
   */
  const change = useCallback(
    (job: (now: number) => Promise<unknown>) =>
      serial(async () => {
        await drainShortcutInbox(db).catch(() => false);
        await job(Date.now());
        await load();
      }),
    [db, serial, load],
  );

  useEffect(() => {
    (async () => {
      await refresh();
    })();
    // Shortcut links and actions can change the timer while the app was in the background.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    // Actions run while the app is open don't change its state, so check for them now and then.
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') drainShortcutInbox(db).catch(() => false);
    }, INBOX_POLL_MS);
    // Whoever applied queued actions (this poll, the notification planner), show the result.
    const unsubscribe = onInboxApplied(() => {
      serial(load).catch(() => undefined);
    });
    return () => {
      sub.remove();
      clearInterval(poll);
      unsubscribe();
    };
  }, [db, refresh, serial, load]);

  const start = useCallback(
    async (activity: string | number, source = 'timer') => {
      await change((now) => startTimer(db, activity, now, source));
      playSound('start');
    },
    [db, change],
  );

  const stop = useCallback(async () => {
    await change((now) => stopTimer(db, now));
    playSound('stop');
  }, [db, change]);

  const command = useCallback(
    async (cmd: TimerCommand, source = 'shortcut') => {
      await change((now) => {
        if (cmd.kind === 'start') return startTimer(db, cmd.activity, now, source, cmd.note);
        if (cmd.kind === 'stop') return stopTimer(db, now);
        return toggleTimer(db, cmd.activity, now, source, cmd.note);
      });
      playSound(cmd.kind === 'stop' ? 'stop' : 'start');
    },
    [db, change],
  );

  const value = useMemo<TimeContextValue>(
    () => ({ activities, entries, running, activityById: new Map(activities.map((a) => [a.id, a])), refresh, start, stop, command }),
    [activities, entries, running, refresh, start, stop, command],
  );
  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

export function useTime(): TimeContextValue {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error('useTime must be used inside <TimeProvider>');
  return ctx;
}
