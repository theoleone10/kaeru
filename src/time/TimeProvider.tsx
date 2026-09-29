import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Activity, TimeEntry } from './model';
import { getRunning, listActivities, listEntriesSince, startTimer, stopTimer } from './repo';

const HISTORY_DAYS = 120;
const DAY = 24 * 60 * 60 * 1000;

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
    const [a, e, r] = await Promise.all([listActivities(db), listEntriesSince(db, Date.now() - HISTORY_DAYS * DAY), getRunning(db)]);
    setActivities(a);
    setEntries(e);
    setRunning(r);
  }, [db]);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
    // Shortcut links can change the timer while the app was in the background.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const start = useCallback(
    async (activity: string | number, source = 'timer') => {
      await startTimer(db, activity, Date.now(), source);
      await refresh();
    },
    [db, refresh],
  );

  const stop = useCallback(async () => {
    await stopTimer(db, Date.now());
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
