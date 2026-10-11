import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { playSound } from '../sound/sounds';
import type { Activity, TimeEntry } from './model';
import { getRunning, listActivities, listEntriesSince, startTimer, stopTimer } from './repo';
import { drainShortcutInbox, writeShortcutState } from './shortcutInbox';

const HISTORY_DAYS = 120;
const DAY = 24 * 60 * 60 * 1000;
/** How often to pick up Shortcuts actions run while the app is open (e.g. Back Tap). */
const INBOX_POLL_MS = 5000;

interface TimeContextValue {
  activities: Activity[];
  /** Entries from the last ~4 months, newest first (includes the running one). */
  entries: TimeEntry[];
  running: TimeEntry | null;
  activityById: Map<number, Activity>;
  refresh: () => Promise<void>;
  start: (activity: string | number, source?: string) => Promise<void>;
  stop: () => Promise<void>;
}

const TimeContext = createContext<TimeContextValue | null>(null);

export function TimeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [running, setRunning] = useState<TimeEntry | null>(null);

  const refresh = useCallback(async () => {
    await drainShortcutInbox(db).catch(() => false);
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

  useEffect(() => {
    (async () => {
      await refresh();
    })();
    // Shortcut links and actions can change the timer while the app was in the background.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    // Actions run while the app is open don't change its state, so check for them now and then.
    const poll = setInterval(async () => {
      if (AppState.currentState === 'active' && (await drainShortcutInbox(db).catch(() => false))) await refresh();
    }, INBOX_POLL_MS);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [db, refresh]);

  const start = useCallback(
    async (activity: string | number, source = 'timer') => {
      await startTimer(db, activity, Date.now(), source);
      playSound('start');
      await refresh();
    },
    [db, refresh],
  );

  const stop = useCallback(async () => {
    await stopTimer(db, Date.now());
    playSound('stop');
    await refresh();
  }, [db, refresh]);

  const value = useMemo<TimeContextValue>(
    () => ({ activities, entries, running, activityById: new Map(activities.map((a) => [a.id, a])), refresh, start, stop }),
    [activities, entries, running, refresh, start, stop],
  );
  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

export function useTime(): TimeContextValue {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error('useTime must be used inside <TimeProvider>');
  return ctx;
}
