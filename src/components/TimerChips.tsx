import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp, useNow } from '../state/AppProvider';
import { entryDuration, formatClock } from '../time/model';
import { useTime } from '../time/TimeProvider';
import { spacing } from '../theme/colors';
import { Icon } from './Icon';
import { T } from './ui';

const SHADOW = '0px 1px 2px rgba(27,31,51,0.06), 0px 2px 8px rgba(27,31,51,0.06)';

/**
 * One pill per activity: tap to start it (switching over), tap the running one to stop.
 * The running pill fills with the activity's colour and shows the time on the clock.
 */
export function TimerChips({ showAdd = true }: { showAdd?: boolean }) {
  const { colors, isDark } = useApp();
  const { activities, running, start, stop } = useTime();
  const now = useNow(running ? 1000 : 60_000);
  return (
    <View style={styles.chips}>
      {activities
        .filter((a) => !a.archived)
        .map((a) => {
          const active = running?.activity_id === a.id;
          return (
            <Pressable
              key={a.id}
              onPress={() => (active ? stop() : start(a.id))}
              onPressIn={() => Haptics.selectionAsync().catch(() => undefined)}
              accessibilityRole="button"
              accessibilityLabel={active ? `Stop ${a.name}` : `Start ${a.name}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: active ? a.color : colors.surface,
                  borderColor: active ? a.color : isDark ? colors.border : colors.surface,
                  boxShadow: isDark || active ? undefined : SHADOW,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon name={active ? 'stop' : 'play'} size={14} color={active ? '#FFFFFF' : a.color} />
              <T variant="body" color={active ? '#FFFFFF' : colors.text} style={{ fontWeight: '700', fontSize: 15, lineHeight: 20 }}>
                {a.name}
              </T>
              {active && running && (
                <T variant="body" color="#FFFFFF" style={{ fontWeight: '800', fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] }}>
                  {formatClock(entryDuration(running, now))}
                </T>
              )}
            </Pressable>
          );
        })}
      {showAdd && (
        <Pressable
          onPress={() => router.push('/track/activities')}
          accessibilityRole="button"
          accessibilityLabel="Add an activity"
          style={({ pressed }) => [styles.addChip, { borderColor: colors.borderStrong, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          <Icon name="plus" size={20} color={colors.textMuted} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1 },
  addChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
