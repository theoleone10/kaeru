import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useApp } from '../state/AppProvider';
import { createAppTimeTracker } from './appTime';
import { useTime } from './TimeProvider';

/** How often the growing entry is saved while the app is open. */
const CHECK_MS = 60 * 1000;

/** Tracks time with the app open, for the whole app (mounted once in the root layout). */
export function useAppTimeTracking() {
  const db = useSQLiteContext();
  const { settings } = useApp();
  const { refresh, running } = useTime();
  const tracker = useRef<ReturnType<typeof createAppTimeTracker> | null>(null);
  const enabled = settings.autoTrackStudy;

  useEffect(() => {
    if (!enabled) return;
    const t = createAppTimeTracker(db);
    tracker.current = t;
    if (AppState.currentState === 'active') t.begin(Date.now());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') t.begin(Date.now());
      else t.end(Date.now()).then(refresh, () => undefined);
    });
    const tick = setInterval(() => {
      if (AppState.currentState === 'active') t.check(Date.now()).catch(() => undefined);
    }, CHECK_MS);
    return () => {
      sub.remove();
      clearInterval(tick);
      tracker.current = null;
      t.end(Date.now()).catch(() => undefined);
    };
  }, [db, enabled, refresh]);

  // When your own timer stops, app time starts counting again.
  useEffect(() => {
    if (!running && AppState.currentState === 'active') tracker.current?.resumeIfIdle(Date.now());
  }, [running]);
}
