import Ionicons from '@expo/vector-icons/Ionicons';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Button, IconButton, Stat, T } from '@/components/ui';
import { useApp, useNow } from '@/state/AppProvider';
import { dailyTotals, entryDuration, formatClock, formatDuration, formatTimeOfDay, parseTogglCsv } from '@/time/model';
import { importEntries } from '@/time/repo';
import { useTime } from '@/time/TimeProvider';
import { spacing } from '@/theme/colors';

const HOUR = 60 * 60 * 1000;

/** Big progress ring: fills once per hour of the running timer. */
function TimerRing({ fraction, color, children }: { fraction: number; color: string; children: React.ReactNode }) {
  const { colors } = useApp();
  const size = 260;
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={18} fill="none" />
        {fraction > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={18}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.01, fraction) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={{ alignItems: 'center', paddingHorizontal: spacing.xl }}>{children}</View>
    </View>
  );
}

/** The timer: pick an activity, one big start / stop button, and the time on the clock. */
export default function Timer() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors } = useApp();
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

  const more = () =>
    Alert.alert('Time tracking', undefined, [
      { text: 'Add a past entry', onPress: () => router.push('/track/entry') },
      { text: 'Set up iPhone Shortcuts', onPress: () => router.push('/track/shortcuts') },
      { text: 'Manage activities', onPress: () => router.push('/track/activities') },
      { text: 'Import from Toggl (CSV)', onPress: importToggl },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <T variant="title" style={{ fontSize: 32, lineHeight: 38 }}>
          Timer
        </T>
        <IconButton label="More tracking options" onPress={more}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.textMuted} />
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
              style={[styles.chip, { borderColor: a.color, backgroundColor: active ? a.color : colors.background }]}
            >
              <T variant="body" color={active ? '#FFFFFF' : colors.text} style={{ fontWeight: '900' }}>
                {a.name}
              </T>
            </Pressable>
          );
        })}
        <Pressable onPress={() => router.push('/track/activities')} accessibilityRole="button" accessibilityLabel="Add an activity" style={[styles.addChip, { borderColor: colors.border }]}>
          <Ionicons name="add" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', gap: spacing.xl }}>
        <TimerRing fraction={running ? (elapsed % HOUR) / HOUR : 0} color={color}>
          <T variant="body" color={running ? color : colors.textMuted} style={{ fontWeight: '900' }} numberOfLines={1}>
            {selected?.name ?? 'Timer'}
          </T>
          <View accessible accessibilityLabel={running ? `${formatDuration(elapsed)} so far` : 'Not running'}>
            <T variant="title" color={running ? colors.text : colors.textMuted} style={{ fontSize: 56, lineHeight: 64, fontVariant: ['tabular-nums'] }}>
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
          icon={<Ionicons name={running ? 'stop' : 'play'} size={22} color="#FFFFFF" />}
          style={{ alignSelf: 'stretch' }}
        />
      </View>

      <View style={styles.row}>
        <Stat value={formatDuration(todayTotal)} label="Today" />
        <Stat value={formatDuration(weekTotal)} label="Past 7 days" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  chip: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.md },
});
