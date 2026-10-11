import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flame } from '@/components/Flame';
import { ForecastChart } from '@/components/ForecastChart';
import { Mascot } from '@/components/Mascot';
import { Button, Card, ProgressBar, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { useToday } from '@/daily/useToday';
import { getReviewTimes } from '@/db/repo';
import { forecast } from '@/srs/forecast';
import { levelProgress } from '@/stats/levelProgress';
import { useApp, useNow } from '@/state/AppProvider';
import {
  dailyTotals,
  entryDuration,
  formatClock,
  formatDuration,
  formatTimeOfDay,
  startOfDay,
  startOfWeek,
  totalsByActivity,
  type Activity,
  type TimeEntry,
} from '@/time/model';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing, TAP } from '@/theme/colors';

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS_SHOWN = 14;

function dayLabel(t: number, now: number): string {
  const today = startOfDay(now);
  if (t === today) return 'Today';
  if (t === startOfDay(today - DAY / 2)) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
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

/** Time tracking stats: totals, the week by activity, and the editable history. */
function TimeStats() {
  const { colors } = useApp();
  const { entries, running, activityById } = useTime();
  const now = useNow(running ? 1000 : 30_000);
  const [showDays, setShowDays] = useState(HISTORY_DAYS_SHOWN);

  const today = totalsByActivity(entries, startOfDay(now), startOfDay(now) + 2 * DAY, now);
  const week = totalsByActivity(entries, startOfWeek(now), now + DAY, now);
  const todayTotal = [...today.values()].reduce((a, b) => a + b, 0);
  const weekTotal = [...week.values()].reduce((a, b) => a + b, 0);

  const byDay = useMemo(() => {
    const groups = new Map<number, TimeEntry[]>();
    for (const e of entries) {
      const d = startOfDay(e.started_at);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(e);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [entries]);

  return (
    <>
      <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
        <T variant="title" style={{ fontSize: 24, lineHeight: 30 }}>
          Time tracking
        </T>
        <Button label="Timer" kind="ghost" small onPress={() => router.navigate('/timer')} icon={<Ionicons name="timer-outline" size={18} color={colors.accent} />} />
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
        {byDay.length === 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Mascot size={48} mood="think" />
            <T variant="small" style={{ flex: 1 }}>
              Your timer history will show up here.
            </T>
          </View>
        )}
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
                      {formatTimeOfDay(e.started_at)} – {e.ended_at ? formatTimeOfDay(e.ended_at) : 'now'}
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
      </View>
    </>
  );
}

/** Everything together: streak, the last week across grammar, flashcards and time, and each JLPT line. */
function Overview() {
  const db = useSQLiteContext();
  const { colors, lines, cards } = useApp();
  const { entries } = useTime();
  const today = useToday();
  const { now, streak } = today;
  const [reviews, setReviews] = useState<{ grammar: number[]; cards: number[] }>({ grammar: [], cards: [] });

  const load = useCallback(async () => {
    setReviews(await getReviewTimes(db, startOfDay(Date.now()) - 7 * DAY));
    // Reload after any grammar or flashcard study.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, cards, today.cardsReviewedToday]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const days = dailyTotals(entries, 7, now).map((d) => {
    const end = d.dayStart + DAY + 60 * 60 * 1000; // DST slack; the next day's start is later anyway
    const inDay = (t: number) => t >= d.dayStart && t < end && startOfDay(t) === d.dayStart;
    return { ...d, grammar: reviews.grammar.filter(inDay).length, cards: reviews.cards.filter(inDay).length };
  });
  const levels = levelProgress(curriculum, cards);
  const { buckets } = forecast(
    cards.filter((c) => !c.suspended).map((c) => c.due),
    now,
  );
  const weekMs = days.reduce((s, d) => s + d.total, 0);
  const rows: { label: string; color: string; value: (d: (typeof days)[number]) => string }[] = [
    { label: 'Grammar', color: colors.correct, value: (d) => (d.grammar ? String(d.grammar) : '·') },
    { label: 'Cards', color: colors.blue, value: (d) => (d.cards ? String(d.cards) : '·') },
    { label: 'Time', color: colors.gold, value: (d) => (d.total >= 60_000 ? String(Math.round(d.total / 60_000)) : '·') },
  ];

  return (
    <>
      <View style={styles.row}>
        <Card style={styles.stat} tone="gold">
          <Flame size={22} color={streak.studiedToday ? '#F08A3C' : colors.textMuted} />
          <T variant="heading">{streak.days}</T>
          <T variant="small">day streak</T>
        </Card>
        <Card style={styles.stat}>
          <Ionicons name="train" size={20} color={colors.accent} />
          <T variant="heading">{cards.length}</T>
          <T variant="small">grammar learned</T>
        </Card>
        <Card style={styles.stat}>
          <Ionicons name="timer" size={20} color={colors.blue} />
          <T variant="heading">{formatDuration(weekMs)}</T>
          <T variant="small">last 7 days</T>
        </Card>
      </View>

      <Card style={{ gap: spacing.sm }}>
        <T variant="heading">Last 7 days</T>
        <View style={styles.gridRow}>
          <View style={styles.gridLabel} />
          {days.map((d) => (
            <T key={d.dayStart} variant="small" style={[styles.gridCell, { fontWeight: '900' }]} color={d.dayStart === startOfDay(now) ? colors.accent : colors.textMuted}>
              {new Date(d.dayStart).toLocaleDateString([], { weekday: 'narrow' })}
            </T>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.label} style={[styles.gridRow, { borderTopColor: colors.border, borderTopWidth: 2, paddingTop: spacing.sm }]}>
            <View style={[styles.gridLabel, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color }} />
              <T variant="small" style={{ fontWeight: '800' }}>
                {r.label}
              </T>
            </View>
            {days.map((d) => (
              <T key={d.dayStart} variant="body" style={[styles.gridCell, { fontWeight: '800', fontVariant: ['tabular-nums'] }]}>
                {r.value(d)}
              </T>
            ))}
          </View>
        ))}
        <T variant="small">Reviews answered per day, and minutes of tracked time.</T>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <T variant="heading">Your lines</T>
        {levels
          .filter((l) => l.total > 0)
          .map((l) => (
            <Pressable key={l.level} onPress={() => router.navigate({ pathname: '/grammar', params: { level: l.level } })} accessibilityRole="button" style={{ gap: 6 }}>
              <View style={styles.rowBetween}>
                <View style={styles.inline}>
                  <View style={[styles.lineBadge, { borderColor: lines[l.level].line }]}>
                    <T variant="small" color={lines[l.level].ink} style={{ fontSize: 11, fontWeight: '900' }}>
                      {l.level}
                    </T>
                  </View>
                  <T variant="body" style={{ fontWeight: '800' }}>
                    {l.learned} / {l.total}
                  </T>
                </View>
                <T variant="small">{l.mastered} mastered</T>
              </View>
              <ProgressBar value={l.learned / l.total} secondary={l.mastered / l.total} color={lines[l.level].line} />
            </Pressable>
          ))}
        <T variant="small">Bright = learned, green = mastered (next review 3+ weeks away).</T>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <T variant="heading">Grammar reviews coming up (24h)</T>
        <ForecastChart buckets={buckets} />
      </Card>
    </>
  );
}

/** Everything you've done: the overview, then time tracking stats. The timer itself is its own tab. */
export default function Progress() {
  const insets = useSafeAreaInsets();
  const { colors } = useApp();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}>
      <T variant="title">Progress</T>
      <Overview />
      <TimeStats />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  gridRow: { flexDirection: 'row', alignItems: 'center' },
  gridLabel: { width: 76 },
  gridCell: { flex: 1, textAlign: 'center' },
  lineBadge: { width: 30, height: 30, borderRadius: 15, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  stat: { flex: 1, gap: 4, padding: spacing.md },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
  iconButton: { width: TAP, height: TAP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
