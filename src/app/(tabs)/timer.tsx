import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { mix } from '@/components/FormControls';
import { Icon } from '@/components/Icon';
import { Button, IconButton, ProgressBar, Section, Stat, T } from '@/components/ui';
import { useApp, useNow } from '@/state/AppProvider';
import { dailyTotals, entryDuration, formatClock, formatDuration, formatTimeOfDay, parseTogglCsv } from '@/time/model';
import { daysLeftInWeek, goalActiveOn, goalDoneMs, repeatLabel } from '@/time/goals';
import { importEntries } from '@/time/repo';
import { useTime } from '@/time/TimeProvider';
import { spacing } from '@/theme/colors';

const HOUR = 60 * 60 * 1000;

/** Big thin progress ring: fills once per hour of the running timer, with a knob at its tip. */
function TimerRing({ fraction, color, children }: { fraction: number; color: string; children: React.ReactNode }) {
  const { colors } = useApp();
  const size = 260;
  const stroke = 14;
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {fraction > 0 && (
          <>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0.01, fraction) * c} ${c}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            <Circle cx={size / 2 + r * Math.cos(angle)} cy={size / 2 + r * Math.sin(angle)} r={9} fill={colors.surface} stroke={color} strokeWidth={4} />
          </>
        )}
      </Svg>
      <View style={{ alignItems: 'center', gap: 2, paddingHorizontal: spacing.xl }}>{children}</View>
    </View>
  );
}

/** The timer: pick an activity, one big start / stop button, and the time on the clock. */
export default function Timer() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors, isDark, settings } = useApp();
  const { activities, entries, running, activityById, start, stop, refresh } = useTime();
  const now = useNow(running ? 1000 : 30_000);
  const [picked, setPicked] = useState<number | null>(null);

  const visible = activities.filter((a) => !a.archived);
  // The running activity, else the one picked here, else the first.
  const selectedId = running?.activity_id ?? (picked != null && visible.some((a) => a.id === picked) ? picked : visible[0]?.id);
  const selected = selectedId != null ? activityById.get(selectedId) : undefined;
  const color = selected?.color ?? colors.blue;

  // Totals for the selected timer only: today and the past 7 days (today included).
  // Time in the app is logged to Study, so it counts there too.
  const week = dailyTotals(entries, 7, now);
  const of = (d: (typeof week)[number] | undefined) => (selectedId != null ? (d?.byActivity.get(selectedId) ?? 0) : 0);
  const todayTotal = of(week[week.length - 1]);
  const weekTotal = week.reduce((s, d) => s + of(d), 0);
  const elapsed = running ? entryDuration(running, now) : 0;

  const choose = (id: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setPicked(id);
    // While timing, picking another activity switches over (the current one ends now).
    if (running && running.activity_id !== id) start(id);
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (running) stop();
    else if (selectedId != null) start(selectedId);
  };

  const importToggl = async () => {
    try {
      const file = await File.pickFileAsync({ mimeTypes: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/octet-stream'] });
      if (file.canceled) return;
      const parsed = parseTogglCsv(await file.result.text());
      const added = await importEntries(db, parsed);
      await refresh();
      Alert.alert('Import finished', `Added ${added} of ${parsed.length} entries${added < parsed.length ? ' (the rest were already here)' : ''}.`);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  // Every goal except those for hidden activities; daily goals that are off today show as a rest day.
  const goals = settings.timeGoals.flatMap((g) => {
    const activity = g.activityId === null ? null : activityById.get(g.activityId);
    if (activity === undefined || activity?.archived) return [];
    const goalMs = g.minutes * 60 * 1000;
    return [{ ...g, name: activity?.name ?? 'All activities', color: activity?.color ?? colors.gold, goalMs, doneMs: goalDoneMs(g, entries, now), today: goalActiveOn(g, now) }];
  });

  const more = () =>
    Alert.alert('Time tracking', undefined, [
      { text: 'Time goals', onPress: () => router.push('/track/goals') },
      { text: 'Add a past entry', onPress: () => router.push('/track/entry') },
      { text: 'Set up iPhone Shortcuts', onPress: () => router.push('/track/shortcuts') },
      { text: 'Manage activities', onPress: () => router.push('/track/activities') },
      { text: 'Import from Toggl (CSV)', onPress: importToggl },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const ink = (c: string) => (isDark ? mix(c, '#FFFFFF', 0.45) : mix(c, '#000000', 0.3));
  const outline = (c: string) => mix(c, colors.background, isDark ? 0.55 : 0.6);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <T variant="title" style={{ fontSize: 34, lineHeight: 40 }}>
          Timer
        </T>
        <IconButton label="More tracking options" onPress={more}>
          <Icon name="more" size={22} color={colors.textMuted} filled />
        </IconButton>
      </View>

      <View style={styles.chips} accessibilityRole="radiogroup">
        {visible.map((a) => {
          const active = a.id === selectedId;
          return (
            <Pressable
              key={a.id}
              onPress={() => choose(a.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={running && !active ? `Switch to ${a.name}` : a.name}
              hitSlop={2}
              style={({ pressed }) => [styles.chip, active ? { backgroundColor: a.color, borderColor: a.color } : { borderColor: outline(a.color) }, { opacity: pressed ? 0.75 : 1 }]}
            >
              <T variant="body" color={active ? '#FFFFFF' : ink(a.color)} style={{ fontSize: 15, lineHeight: 20, fontWeight: active ? '800' : '700' }} numberOfLines={1}>
                {a.name}
              </T>
            </Pressable>
          );
        })}
        <Pressable onPress={() => router.push('/track/activities')} accessibilityRole="button" accessibilityLabel="Add an activity" hitSlop={2} style={[styles.addChip, { borderColor: isDark ? colors.border : colors.borderStrong }]}>
          <Icon name="plus" size={18} color={colors.textFaint} strokeWidth={2.4} />
        </Pressable>
      </View>

      <TimerRing fraction={running ? (elapsed % HOUR) / HOUR : 0} color={color}>
        <T variant="body" color={running ? ink(color) : colors.textMuted} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }} numberOfLines={1}>
          {selected?.name ?? 'Timer'}
        </T>
        <View accessible accessibilityLabel={running ? `${formatDuration(elapsed)} so far` : 'Not running'}>
          <T variant="title" jp={false} color={running ? colors.text : colors.textFaint} style={{ fontSize: 52, lineHeight: 60, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>
            {formatClock(elapsed)}
          </T>
        </View>
        <T variant="small" numberOfLines={1}>
          {running ? `${running.note ? `${running.note} · ` : ''}since ${formatTimeOfDay(running.started_at)}` : 'Ready'}
        </T>
      </TimerRing>
      <Button
        label={running ? 'Stop' : selected ? `Start ${selected.name}` : 'Start'}
        kind={running ? 'danger' : 'success'}
        color={running ? undefined : selected?.color}
        onPress={toggle}
        disabled={!running && !selected}
        icon={<Icon name={running ? 'stop' : 'play'} size={18} color="#FFFFFF" filled />}
      />

      <View style={styles.row}>
        <Stat value={formatDuration(todayTotal)} label="Today" />
        <Stat value={formatDuration(weekTotal)} label="Past 7 days" />
      </View>

      <Section
        label="Goals"
        style={{ gap: 10 }}
        right={
          <Pressable onPress={() => router.push('/track/goals')} accessibilityRole="button" accessibilityLabel="Edit time goals" hitSlop={12}>
            <T variant="body" color={colors.accentInk} style={{ fontSize: 14, lineHeight: 20, fontWeight: '700' }}>
              {goals.length ? 'Edit' : 'Add'}
            </T>
          </Pressable>
        }
      >
        {goals.length === 0 ? (
          <Pressable onPress={() => router.push('/track/goals')} accessibilityRole="button">
            <T variant="muted">Set a daily or weekly goal for immersion, study, or everything together.</T>
          </Pressable>
        ) : (
          goals.map((g) => {
            const done = g.doneMs >= g.goalMs;
            const days = daysLeftInWeek(now);
            if (!g.today) {
              return (
                <View key={g.id} style={styles.goalHead}>
                  <T variant="body" color={colors.textMuted} style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {`${g.name} · ${formatDuration(g.goalMs)}`}
                  </T>
                  <T variant="small" color={colors.textFaint}>{`${repeatLabel(g)} · not today`}</T>
                </View>
              );
            }
            return (
              <View key={g.id} style={{ gap: 6, paddingBottom: 4 }} accessible accessibilityLabel={`${g.name}, ${formatDuration(g.doneMs)} of ${formatDuration(g.goalMs)} ${g.period === 'day' ? 'today' : 'this week'}`}>
                <View style={styles.goalHead}>
                  <T variant="body" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {g.name}
                    <T variant="body" color={colors.textMuted}>{` ${g.period === 'day' ? 'today' : 'this week'}`}</T>
                  </T>
                  <View style={styles.goalAmount}>
                    <T variant="small" jp={false} color={done ? colors.correctText : colors.textMuted} style={{ fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                      {done ? formatDuration(g.doneMs) : `${formatDuration(g.doneMs)} / ${formatDuration(g.goalMs)}`}
                    </T>
                    {done && <Icon name="check" size={16} color={colors.correctText} strokeWidth={2.8} />}
                  </View>
                </View>
                <ProgressBar value={Math.min(1, g.doneMs / g.goalMs)} color={done ? colors.correct : g.color} height={8} />
                {g.period === 'week' && !done && (
                  <T variant="small">{`${formatDuration(g.goalMs - g.doneMs)} to go · ${days === 1 ? 'last day' : `${days} days left`}`}</T>
                )}
              </View>
            );
          })
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 22, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 18, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addChip: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.md, paddingTop: 4 },
  goalHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  goalAmount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
