import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '@/state/AppProvider';
import { parseTimerCommand } from '@/time/model';
import { useTime } from '@/time/TimeProvider';

/**
 * Deep-link target for iOS Shortcuts / Android automation:
 *   kaeru://timer/start?activity=Immersion&note=Anime
 *   kaeru://timer/stop
 *   kaeru://timer/toggle?activity=Study
 * Runs the command, then shows the Timer tab.
 */
export default function TimerLink() {
  const { colors } = useApp();
  const { command, refresh } = useTime();
  const params = useLocalSearchParams<{ action: string; activity?: string; note?: string }>();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      // Through the timer's queue, after any queued Shortcuts actions, so neither undoes the other.
      const cmd = parseTimerCommand(params.action, params);
      if (cmd) await command(cmd).catch(() => undefined);
      else await refresh();
      router.replace('/timer');
    })();
  }, [params, command, refresh]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
