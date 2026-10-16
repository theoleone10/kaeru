import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { repeatLabel } from '@/time/goals';
import { formatDuration } from '@/time/model';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing } from '@/theme/colors';

/** Every time goal; tap one to change it, + to add one. */
export default function Goals() {
  const insets = useSafeAreaInsets();
  const { colors, settings } = useApp();
  const { activityById } = useTime();
  const add = () => router.push('/track/goal');

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xxl }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="Add a goal" hitSlop={10}>
              <Ionicons name="add-circle" size={28} color={colors.accent} />
            </Pressable>
          ),
        }}
      />
      {settings.timeGoals.length === 0 ? (
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl }}>
          <T variant="muted" style={{ textAlign: 'center' }}>
            No time goals yet. Set one for immersion, study, or everything together: every day, every week, or on the days you choose.
          </T>
          <Button label="Add a goal" onPress={add} icon={<Ionicons name="add" size={22} color="#FFFFFF" />} />
        </View>
      ) : (
        settings.timeGoals.map((g) => {
          const activity = g.activityId === null ? null : activityById.get(g.activityId);
          const name = g.activityId === null ? 'All activities' : (activity?.name ?? 'Deleted activity');
          const hidden = g.activityId !== null && (!activity || !!activity.archived);
          return (
            <Pressable
              key={g.id}
              onPress={() => router.push({ pathname: '/track/goal', params: { id: g.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${formatDuration(g.minutes * 60 * 1000)}, ${repeatLabel(g)}. Edit.`}
              style={({ pressed }) => [styles.goal, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.dot, { backgroundColor: activity?.color ?? colors.gold }]} />
              <View style={{ flex: 1 }}>
                <T variant="body" style={{ fontWeight: '800' }} numberOfLines={1}>
                  {name}
                </T>
                <T variant="small" numberOfLines={1}>
                  {repeatLabel(g)}
                  {hidden ? ' · activity hidden' : ''}
                </T>
              </View>
              <T variant="heading" style={{ fontWeight: '900', fontVariant: ['tabular-nums'] }}>
                {formatDuration(g.minutes * 60 * 1000)}
              </T>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  goal: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
