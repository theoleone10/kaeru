import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useApp } from '../state/AppProvider';
import { addEntry, ensureActivity, getRunning } from './repo';
import { useTime } from './TimeProvider';

const MIN_MS = 60 * 1000;
/** Idle cap: a segment never counts more than this, in case the phone sat on the screen. */
const MAX_MS = 2 * 60 * 60 * 1000;

/**
 * While `active`, time spent on this screen is logged to the "Study" activity —
 * unless a timer is already running (then the user is tracking it themselves).
 * Leaving the screen or backgrounding the app closes the segment.
 */
export function useAutoTrack(active: boolean) {
  const db = useSQLiteContext();
  const { settings } = useApp();
  const { refresh } = useTime();
  const startedAt = useRef<number | null>(null);
  const enabled = active && settings.autoTrackStudy;

  useEffect(() => {
    if (!enabled) return;
    const flush = async () => {
      const start = startedAt.current;
      startedAt.current = null;
      if (start == null) return;
      const end = Date.now();
      if (end - start < MIN_MS) return;
      if (await getRunning(db)) return;
      const studyId = await ensureActivity(db, 'Study');
      await addEntry(db, { activity_id: studyId, started_at: start, ended_at: Math.min(end, start + MAX_MS), source: 'auto' });
      await refresh();
    };
    startedAt.current = Date.now();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') startedAt.current = Date.now();
      else flush().catch(() => undefined);
    });
    return () => {
      sub.remove();
      flush().catch(() => undefined);
    };
  }, [db, enabled, refresh]);
}
