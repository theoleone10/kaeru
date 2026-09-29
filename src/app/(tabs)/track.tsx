import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Mascot } from '@/components/Mascot';
import { Button, Card, IconButton, T } from '@/components/ui';
import { useApp, useNow } from '@/state/AppProvider';
import {
  dailyTotals,
  entryDuration,
  formatClock,
  formatDuration,
  parseTogglCsv,
  startOfDay,
  startOfWeek,
  totalsByActivity,
  trackingStreak,
  type Activity,
  type TimeEntry,
} from '@/time/model';
import { importEntries } from '@/time/repo';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing, TAP } from '@/theme/colors';

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS_SHOWN = 14;

function timeOfDay(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(t: number, now: number): string {
  const today = startOfDay(now);
  if (t === today) return 'Today';
  if (t === startOfDay(today - DAY / 2)) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

const HOUR = 60 * 60 * 1000;

/** Big progress ring: fills once per hour of the running timer. */
function TimerRing({ fraction, color, children }: { fraction: number; color: string; children: React.ReactNode }) {
  const { colors } = useApp();
  const size = 220;
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={18} fill={colors.surface} />
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
      </Svg>
      <View style={{ alignItems: 'center', paddingHorizontal: spacing.xl }}>{children}</View>
    </View>
  );
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** Horizontal bars of per-activity totals. */
function Totals({ totals, activities }: { totals: Map<number, number>; activities: Map<number, Activity> }) {
  const { colors } = useApp();
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (rows.length === 0) return <T variant="small">Nothing tracked yet.</T>;
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map(([id, ms]) => {
        const a = activities.get(id);
        return (
          <View key={id} style={{ gap: 4 }}>
            <View style={styles.rowBetween}>
              <View style={styles.inline}>
                <Dot color={a?.color ?? colors.textMuted} />
                <T variant="body">{a?.name ?? 'Deleted'}</T>
              </View>
              <T variant="body" style={{ fontVariant: ['tabular-nums'], fontWeight: '600' }}>
                {formatDuration(ms)}
              </T>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${(ms / max) * 100}%`, height: 6, backgroundColor: a?.color ?? colors.chartBar }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Last 7 days, stacked by activity. */
function WeekChart({ entries, activities, now }: { entries: TimeEntry[]; activities: Map<number, Activity>; now: number }) {
  const { colors } = useApp();
  const days = dailyTotals(entries, 7, now);
  const max = Math.max(30 * 60 * 1000, ...days.map((d) => d.total));
  const H = 110;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: H + 36 }}>
      {days.map((d) => (
        <View key={d.dayStart} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityLabel={`${dayLabel(d.dayStart, now)}: ${formatDuration(d.total)}`}>
          <T variant="small" style={{ fontSize: 10 }}>
            {d.total >= 60_000 ? formatDuration(d.total).replace(' ', '') : ''}
          </T>
          <View style={{ width: '70%', height: H, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
            {[...d.byActivity.entries()].map(([id, ms]) => (
              <View key={id} style={{ height: (ms / max) * H, backgroundColor: activities.get(id)?.color ?? colors.chartBar }} />
            ))}
          </View>
          <T variant="small" style={{ fontSize: 11 }}>
            {new Date(d.dayStart).toLocaleDateString([], { weekday: 'narrow' })}
          </T>
        </View>
      ))}
    </View>
  );
}

export default function Track() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors } = useApp();
  const { activities, entries, running, activityById, start, stop, refresh } = useTime();
  const now = useNow(running ? 1000 : 30_000);
  const [showDays, setShowDays] = useState(HISTORY_DAYS_SHOWN);
  const [importing, setImporting] = useState(false);

  const visible = activities.filter((a) => !a.archived);
  const today = totalsByActivity(entries, startOfDay(now), startOfDay(now) + 2 * DAY, now);
  const week = totalsByActivity(entries, startOfWeek(now), now + DAY, now);
  const todayTotal = [...today.values()].reduce((a, b) => a + b, 0);
  const weekTotal = [...week.values()].reduce((a, b) => a + b, 0);
  const streak = trackingStreak(entries, now);

  const byDay = useMemo(() => {
    const groups = new Map<number, TimeEntry[]>();
    for (const e of entries) {
      const d = startOfDay(e.started_at);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(e);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [entries]);

  const runningActivity = running ? activityById.get(running.activity_id) : undefined;

  const importToggl = async () => {
    setImporting(true);
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/octet-stream'] });
      if (picked.canceled) return;
      const parsed = parseTogglCsv(await picked.result.text());
      const added = await importEntries(db, parsed);
      await refresh();
      Alert.alert('Import finished', `Added ${added} of ${parsed.length} entries${added < parsed.length ? ' (the rest were already here)' : ''}.`);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
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
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.rowBetween}>
        <View>
          <T variant="title">Track</T>
          <T variant="muted">Immersion & study time</T>
        </View>
        <IconButton label="More tracking options" onPress={more}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.textMuted} />
        </IconButton>
      </View>

      <View style={{ alignItems: 'center', gap: spacing.md }}>
        {running ? (
          <>
            <TimerRing fraction={(entryDuration(running, now) % HOUR) / HOUR} color={runningActivity?.color ?? colors.blue}>
              <T variant="body" color={runningActivity?.color ?? colors.blue} style={{ fontWeight: '900' }}>
                {runningActivity?.name ?? 'Tracking'}
              </T>
              <T variant="title" style={{ fontSize: 44, lineHeight: 52, fontVariant: ['tabular-nums'] }}>
                {formatClock(entryDuration(running, now))}
              </T>
              <T variant="small" numberOfLines={1}>
                {running.note ? `${running.note} · ` : ''}since {timeOfDay(running.started_at)}
              </T>
            </TimerRing>
            <Button label="Stop" kind="danger" onPress={stop} style={{ width: 220 }} />
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: spacing.xs }}>
            <Mascot size={96} mood="sleep" />
            <T variant="heading">Not tracking</T>
            <T variant="small" style={{ textAlign: 'center' }}>
              Tap an activity to start. Starting another one switches over.
            </T>
          </View>
        )}
      </View>

      <View style={styles.chips}>
        {visible.map((a) => {
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
        <Pressable
          onPress={() => router.push('/track/activities')}
          accessibilityRole="button"
          accessibilityLabel="Add an activity"
          style={[styles.addChip, { borderColor: colors.border }]}
        >
          <Ionicons name="add" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.row}>
        <Card style={styles.stat}>
          <T variant="small">Today</T>
          <T variant="heading">{formatDuration(todayTotal)}</T>
        </Card>
        <Card style={styles.stat}>
          <T variant="small">This week</T>
          <T variant="heading">{formatDuration(weekTotal)}</T>
        </Card>
        <Card style={styles.stat} tone="gold">
          <T variant="small">Streak</T>
          <T variant="heading">
            {streak} {streak === 1 ? 'day' : 'days'}
          </T>
        </Card>
      </View>

      <Card style={{ gap: spacing.md }}>
        <T variant="heading">Last 7 days</T>
        <WeekChart entries={entries} activities={activityById} now={now} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <T variant="heading">Today</T>
        <Totals totals={today} activities={activityById} />
        <T variant="heading" style={{ marginTop: spacing.sm }}>
          This week
        </T>
        <Totals totals={week} activities={activityById} />
      </Card>

      <View style={{ gap: spacing.md }}>
        <View style={styles.rowBetween}>
          <T variant="heading">History</T>
          <Button label="Add entry" kind="ghost" onPress={() => router.push('/track/entry')} style={{ minHeight: 36 }} />
        </View>
        {byDay.length === 0 && <T variant="small">Your timer history will show up here.</T>}
        {byDay.slice(0, showDays).map(([day, list]) => (
          <Card key={day} style={{ gap: spacing.sm }}>
            <View style={styles.rowBetween}>
              <T variant="body" style={{ fontWeight: '600' }}>
                {dayLabel(day, now)}
              </T>
              <T variant="small">{formatDuration(list.reduce((s, e) => s + entryDuration(e, now), 0))}</T>
            </View>
            {list.map((e) => {
              const a = activityById.get(e.activity_id);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => router.push({ pathname: '/track/entry', params: { id: String(e.id) } })}
                  accessibilityRole="button"
                  accessibilityHint="Edit this entry"
                  style={({ pressed }) => [styles.entry, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Dot color={a?.color ?? colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <T variant="body" numberOfLines={1}>
                      {a?.name ?? 'Deleted'}
                      {e.note ? <T variant="muted"> · {e.note}</T> : null}
                    </T>
                    <T variant="small">
                      {timeOfDay(e.started_at)} – {e.ended_at ? timeOfDay(e.ended_at) : 'now'}
                      {e.source === 'auto' ? ' · in-app study' : e.source === 'shortcut' ? ' · Shortcut' : ''}
                    </T>
                  </View>
                  <T variant="body" style={{ fontVariant: ['tabular-nums'] }}>
                    {e.ended_at ? formatDuration(entryDuration(e, now)) : formatClock(entryDuration(e, now))}
                  </T>
                </Pressable>
              );
            })}
          </Card>
        ))}
        {byDay.length > showDays && <Button label="Show more" kind="ghost" onPress={() => setShowDays(showDays + HISTORY_DAYS_SHOWN)} />}
        {importing && <T variant="small">Importing…</T>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  stat: { flex: 1, gap: 4, padding: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TAP, paddingHorizontal: spacing.lg, borderRadius: 999, borderWidth: 2 },
  addChip: { width: TAP, height: TAP, borderRadius: TAP / 2, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
  iconButton: { width: TAP, height: TAP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
