import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { useTime } from '../time/TimeProvider';
import { spacing, TAP } from '../theme/colors';
import { T } from './ui';

/** One chunky chip per activity: tap to start it (switching over), tap the running one to stop. */
export function TimerChips({ showAdd = true }: { showAdd?: boolean }) {
  const { colors } = useApp();
  const { activities, running, start, stop } = useTime();
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
                  borderColor: a.color,
                  backgroundColor: active ? a.color : colors.surface,
                  borderBottomWidth: pressed ? 2 : 5,
                  transform: [{ translateY: pressed ? 3 : 0 }],
                },
              ]}
            >
              <Ionicons name={active ? 'stop' : 'play'} size={16} color={active ? '#FFFFFF' : a.color} />
              <T variant="body" color={active ? '#FFFFFF' : colors.text} style={{ fontWeight: '900' }}>
                {a.name}
              </T>
            </Pressable>
          );
        })}
      {showAdd && (
        <Pressable onPress={() => router.push('/track/activities')} accessibilityRole="button" accessibilityLabel="Add an activity" style={[styles.addChip, { borderColor: colors.border }]}>
          <Ionicons name="add" size={22} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TAP, paddingHorizontal: spacing.lg, borderRadius: 999, borderWidth: 2 },
  addChip: { width: TAP, height: TAP, borderRadius: TAP / 2, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
