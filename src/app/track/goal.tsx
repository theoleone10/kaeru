import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Section, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { GOAL_MINUTES, newGoalId, repeatLabel, WEEK_ORDER, type TimeGoal } from '@/time/goals';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing, TAP } from '@/theme/colors';

type Repeat = 'day' | 'week' | 'custom';
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Chip({ label, active, color, onPress, a11y }: { label: string; active: boolean; color: string; onPress: () => void; a11y?: string }) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: active }}
      style={[styles.chip, { borderColor: color, backgroundColor: active ? color : colors.background }]}
    >
      <T variant="body" color={active ? '#FFFFFF' : colors.text} style={{ fontWeight: '900' }}>
        {label}
      </T>
    </Pressable>
  );
}

/** Add or edit one time goal: how long, for which activity, and how it repeats. `?id=` edits. */
export default function GoalForm() {
  const insets = useSafeAreaInsets();
  const { colors, settings, updateSettings } = useApp();
  const { activities } = useTime();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = settings.timeGoals.find((g) => g.id === id);
  const visible = activities.filter((a) => !a.archived || a.id === existing?.activityId);

  const start = existing?.minutes ?? 30;
  const [hours, setHours] = useState(String(Math.floor(start / 60)));
  const [mins, setMins] = useState(String(start % 60));
  const [activityId, setActivityId] = useState<number | null>(existing ? existing.activityId : (visible[0]?.id ?? null));
  const [repeat, setRepeat] = useState<Repeat>(existing?.period === 'week' ? 'week' : existing?.days ? 'custom' : 'day');
  const [days, setDays] = useState<number[]>(existing?.days ?? [1, 2, 3, 4, 5]);

  const num = (s: string) => (/^\d+$/.test(s.trim()) ? parseInt(s, 10) : s.trim() === '' ? 0 : NaN);
  const minutes = num(hours) * 60 + num(mins);
  const valid = Number.isFinite(minutes) && minutes >= GOAL_MINUTES.min && minutes <= GOAL_MINUTES.max && (repeat !== 'custom' || days.length > 0);

  const goal: TimeGoal = {
    id: existing?.id ?? newGoalId(),
    activityId,
    period: repeat === 'week' ? 'week' : 'day',
    minutes,
    ...(repeat === 'custom' && days.length < 7 ? { days: [...days].sort() } : {}),
  };

  const save = async () => {
    if (!valid) return;
    await updateSettings({ timeGoals: existing ? settings.timeGoals.map((g) => (g.id === goal.id ? goal : g)) : [...settings.timeGoals, goal] });
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete this goal?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await updateSettings({ timeGoals: settings.timeGoals.filter((g) => g.id !== existing?.id) });
          router.back();
        },
      },
    ]);

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  const input = [styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: existing ? 'Edit goal' : 'New goal' }} />

      <Section label="Time">
        <View style={styles.timeRow}>
          <TextInput value={hours} onChangeText={setHours} keyboardType="number-pad" selectTextOnFocus maxLength={3} accessibilityLabel="Hours" style={input} />
          <T variant="body" style={{ fontWeight: '800' }}>
            h
          </T>
          <TextInput value={mins} onChangeText={setMins} keyboardType="number-pad" selectTextOnFocus maxLength={4} accessibilityLabel="Minutes" style={input} />
          <T variant="body" style={{ fontWeight: '800' }}>
            m
          </T>
        </View>
        {!Number.isFinite(minutes) || minutes > GOAL_MINUTES.max ? (
          <T variant="small" color={colors.wrong}>
            Enter whole hours and minutes, up to a week.
          </T>
        ) : null}
      </Section>

      <Section label="Activity">
        <View style={styles.chips} accessibilityRole="radiogroup">
          <Chip label="All activities" active={activityId === null} color={colors.gold} onPress={() => setActivityId(null)} />
          {visible.map((a) => (
            <Chip key={a.id} label={a.name} active={activityId === a.id} color={a.color} onPress={() => setActivityId(a.id)} />
          ))}
        </View>
      </Section>

      <Section label="Repeats">
        <View style={styles.chips} accessibilityRole="radiogroup">
          <Chip label="Every day" active={repeat === 'day'} color={colors.accent} onPress={() => setRepeat('day')} />
          <Chip label="Every week" active={repeat === 'week'} color={colors.accent} onPress={() => setRepeat('week')} />
          <Chip label="Custom" active={repeat === 'custom'} color={colors.accent} onPress={() => setRepeat('custom')} />
        </View>
        {repeat === 'custom' && (
          <>
            <View style={styles.days}>
              {WEEK_ORDER.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => toggleDay(d)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={DAY_NAMES[d]}
                  accessibilityState={{ checked: days.includes(d) }}
                  style={[styles.day, { borderColor: colors.accent, backgroundColor: days.includes(d) ? colors.accent : colors.background }]}
                >
                  <T variant="body" color={days.includes(d) ? '#FFFFFF' : colors.text} style={{ fontWeight: '900' }}>
                    {LETTERS[d]}
                  </T>
                </Pressable>
              ))}
            </View>
            <T variant="small">{days.length ? `This much time on each of these days: ${repeatLabel({ period: 'day', days: days.length < 7 ? [...days].sort() : undefined })}.` : 'Pick at least one day.'}</T>
          </>
        )}
        {repeat === 'week' && <T variant="small">Counted Monday to Sunday, however you spread it.</T>}
      </Section>

      <View style={{ gap: spacing.md }}>
        <Button label={existing ? 'Save goal' : 'Add goal'} onPress={save} disabled={!valid} />
        {existing && <Button label="Delete goal" kind="ghost" onPress={remove} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1, minHeight: TAP + 8, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
