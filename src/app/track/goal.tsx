import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BottomBar, Chip, Input } from '@/components/FormControls';
import { Button, Section, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { GOAL_MINUTES, newGoalId, repeatLabel, WEEK_ORDER, type TimeGoal } from '@/time/goals';
import { useTime } from '@/time/TimeProvider';
import { fontFor, spacing } from '@/theme/colors';

type Repeat = 'day' | 'week' | 'custom';
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Add or edit one time goal: how long, for which activity, and how it repeats. `?id=` edits. */
export default function GoalForm() {
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen options={{ title: existing ? 'Edit goal' : 'New goal' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section label="Time" style={styles.section}>
          <View style={styles.timeRow}>
            <Input value={hours} onChangeText={setHours} keyboardType="number-pad" selectTextOnFocus maxLength={3} accessibilityLabel="Hours" style={styles.num} />
            <T variant="body" color={colors.textMuted} style={styles.unit}>
              h
            </T>
            <Input value={mins} onChangeText={setMins} keyboardType="number-pad" selectTextOnFocus maxLength={4} accessibilityLabel="Minutes" style={[styles.num, { marginLeft: 10 }]} />
            <T variant="body" color={colors.textMuted} style={styles.unit}>
              m
            </T>
          </View>
          {!Number.isFinite(minutes) || minutes > GOAL_MINUTES.max ? (
            <T variant="small" color={colors.wrongText}>
              Enter whole hours and minutes, up to a week.
            </T>
          ) : null}
        </Section>

        <Section label="Activity" style={styles.section}>
          <View style={styles.chips} accessibilityRole="radiogroup">
            <Chip role="radio" label="All activities" active={activityId === null} color={colors.gold} onPress={() => setActivityId(null)} />
            {visible.map((a) => (
              <Chip role="radio" key={a.id} label={a.name} active={activityId === a.id} color={a.color} onPress={() => setActivityId(a.id)} />
            ))}
          </View>
        </Section>

        <Section label="Repeats" style={styles.section}>
          <View style={styles.chips} accessibilityRole="radiogroup">
            <Chip role="radio" label="Every day" active={repeat === 'day'} onPress={() => setRepeat('day')} />
            <Chip role="radio" label="Every week" active={repeat === 'week'} onPress={() => setRepeat('week')} />
            <Chip role="radio" label="Custom" active={repeat === 'custom'} onPress={() => setRepeat('custom')} />
          </View>
          {repeat === 'custom' && (
            <>
              <View style={styles.days}>
                {WEEK_ORDER.map((d) => {
                  const on = days.includes(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => toggleDay(d)}
                      accessibilityRole="checkbox"
                      accessibilityLabel={DAY_NAMES[d]}
                      accessibilityState={{ checked: on }}
                      hitSlop={2}
                      style={[styles.day, on ? { backgroundColor: colors.accent, borderColor: colors.accent } : { borderColor: colors.border }]}
                    >
                      <T variant="small" color={on ? '#FFFFFF' : colors.textMuted} style={{ fontSize: 14, fontWeight: '800' }}>
                        {LETTERS[d]}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
              <T variant="small">{days.length ? `This much time on each of these days: ${repeatLabel({ period: 'day', days: days.length < 7 ? [...days].sort() : undefined })}.` : 'Pick at least one day.'}</T>
            </>
          )}
          {repeat === 'week' && <T variant="small">Counted Monday to Sunday, however you spread it.</T>}
        </Section>
      </ScrollView>
      <BottomBar>
        <Button label={existing ? 'Save goal' : 'Add goal'} onPress={save} disabled={!valid} />
        {existing && <Button label="Delete goal" kind="ghost" onPress={remove} />}
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: spacing.xl, gap: 28 },
  section: { gap: 12 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  num: { width: 76, minHeight: 60, borderRadius: 16, paddingHorizontal: 4, fontSize: 28, fontFamily: fontFor('800'), textAlign: 'center' },
  unit: { fontSize: 18, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  days: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  day: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
