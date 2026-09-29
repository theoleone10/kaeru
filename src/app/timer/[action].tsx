import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '@/state/AppProvider';
import { parseTimerCommand } from '@/time/model';
import { startTimer, stopTimer, toggleTimer } from '@/time/repo';
import { useTime } from '@/time/TimeProvider';

/**
 * Deep-link target for iOS Shortcuts / Android automation:
 *   grammarapp://timer/start?activity=Immersion&note=Anime
 *   grammarapp://timer/stop
 *   grammarapp://timer/toggle?activity=Study
 * Runs the command, then shows the Track tab.
 */
export default function TimerLink() {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const { refresh } = useTime();
  const params = useLocalSearchParams<{ action: string; activity?: string; note?: string }>();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const cmd = parseTimerCommand(params.action, params);
      const now = Date.now();
      if (cmd?.kind === 'start') await startTimer(db, cmd.activity, now, 'shortcut', cmd.note);
      else if (cmd?.kind === 'stop') await stopTimer(db, now);
      else if (cmd?.kind === 'toggle') await toggleTimer(db, cmd.activity, now, 'shortcut', cmd.note);
      await refresh();
      router.replace('/track');
    })();
  }, [db, params, refresh]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
