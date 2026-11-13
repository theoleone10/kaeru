import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button, IconTile, Rule, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { repeatLabel } from '@/time/goals';
import { formatDuration } from '@/time/model';
import { useTime } from '@/time/TimeProvider';
import { spacing } from '@/theme/colors';

/** Every time goal; tap one to change it, + to add one. */
export default function Goals() {
  const insets = useSafeAreaInsets();
  const { colors, settings } = useApp();
  const { activityById } = useTime();
  const add = () => router.push('/track/goal');

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + spacing.xxl }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="Add a goal" hitSlop={10} style={[styles.add, { backgroundColor: colors.accentSoft }]}>
              <Icon name="plus" size={20} color={colors.accentInk} strokeWidth={2.4} />
            </Pressable>
          ),
        }}
      />
      {settings.timeGoals.length === 0 ? (
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl }}>
          <T variant="muted" style={{ textAlign: 'center' }}>
            No time goals yet. Set one for immersion, study, or everything together: every day, every week, or on the days you choose.
          </T>
          <Button label="Add a goal" onPress={add} icon={<Icon name="plus" size={20} color="#FFFFFF" strokeWidth={2.4} />} />
        </View>
      ) : (
        settings.timeGoals.map((g, i) => {
          const activity = g.activityId === null ? null : activityById.get(g.activityId);
          const name = g.activityId === null ? 'All activities' : (activity?.name ?? 'Deleted activity');
          const hidden = g.activityId !== null && (!activity || !!activity.archived);
          return (
            <View key={g.id}>
              {i > 0 && <Rule />}
              <Pressable
                onPress={() => router.push({ pathname: '/track/goal', params: { id: g.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${formatDuration(g.minutes * 60 * 1000)}, ${repeatLabel(g)}. Edit.`}
                style={({ pressed }) => [styles.goal, { opacity: pressed ? 0.6 : 1 }]}
              >
                <IconTile icon="timer" color={activity?.color ?? colors.gold} size={38} />
                <View style={{ flex: 1 }}>
                  <T variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
                    {name}
                  </T>
                  <T variant="small" numberOfLines={1}>
                    {repeatLabel(g)}
                    {hidden ? ' · activity hidden' : ''}
                  </T>
                </View>
                <T variant="heading" jp={false} style={{ fontSize: 18, fontVariant: ['tabular-nums'] }}>
                  {formatDuration(g.minutes * 60 * 1000)}
                </T>
                <Icon name="chevronRight" size={18} color={colors.textFaint} />
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  goal: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm },
  add: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
