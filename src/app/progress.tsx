import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { ankiForecastInput, deckMaturity, type AnkiForecastInput, type DeckMaturity } from '@/anki/repo';
import { Flame } from '@/components/Flame';
import { ForecastChart } from '@/components/ForecastChart';
import { Button, ProgressBar, Section, Stat, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { useToday } from '@/daily/useToday';
import { getReviewTimes } from '@/db/repo';
import { addForecasts, applyDailyLimit, forecast } from '@/srs/forecast';
import { levelProgress } from '@/stats/levelProgress';
import { useApp, useNow } from '@/state/AppProvider';
import { dailyTotals, entryDuration, formatClock, formatDuration, formatTimeOfDay, startOfDay, type TimeEntry } from '@/time/model';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing, TAP } from '@/theme/colors';

const DAY = 24 * 60 * 60 * 1000;
/** The history lists this many recent entries; shorter blips are left out. */
const HISTORY_ENTRIES = 30;
const MIN_ENTRY_MS = 60 * 1000;
const MATURITY_COLORS = { new: '#2F7FC1', young: '#7BC67E', mature: '#2E8B3E' };

type TabId = 'grammar' | 'decks' | 'time';
const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'grammar', label: 'Grammar', icon: 'train-outline' },
  { id: 'decks', label: 'Decks', icon: 'albums-outline' },
  { id: 'time', label: 'Time', icon: 'timer-outline' },
];

interface Loaded {
  reviews: { grammar: number[]; cards: number[] };
  decks: DeckMaturity[];
  cardForecast: AnkiForecastInput;
}

function dayLabel(t: number, now: number): string {
  const today = startOfDay(now);
  if (t === today) return 'Today';
  if (t === startOfDay(today - DAY / 2)) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** The last 7 days (today last) as day starts. */
function lastWeek(now: number): number[] {
  return dailyTotals([], 7, now).map((d) => d.dayStart);
}

/** How many of `times` fall on each day. */
function countByDay(times: number[], days: number[]): number[] {
  return days.map((day) => times.filter((t) => startOfDay(t) === day).length);
}

interface Bar {
  dayStart: number;
  segments: { key: string | number; color: string; value: number }[];
}

/** One bar per day for the last week, open (no boxes), the value over each bar, an optional dotted goal line. */
function WeekBars({ bars, now, format, goal }: { bars: Bar[]; now: number; format: (v: number) => string; goal?: number }) {
  const { colors } = useApp();
  const totals = bars.map((b) => b.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, (goal ?? 0) * 1.25, ...totals);
  const H = 110;
  const LABEL = 16; // room above the tallest bar for its value
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: H + LABEL }}>
        {goal ? (
          <Svg width="100%" height={H + LABEL} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Line
              x1="0"
              x2="100%"
              y1={LABEL + H - (goal / max) * H}
              y2={LABEL + H - (goal / max) * H}
              stroke={colors.textMuted}
              strokeWidth={1.5}
              strokeDasharray="3 4"
              strokeLinecap="round"
            />
          </Svg>
        ) : null}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          {bars.map((b, i) => (
            <View key={b.dayStart} style={{ flex: 1, alignItems: 'center', gap: 2 }} accessibilityLabel={`${dayLabel(b.dayStart, now)}: ${format(totals[i]) || 'nothing'}`}>
              <T variant="small" style={{ fontSize: 10 }} numberOfLines={1}>
                {format(totals[i])}
              </T>
              <View style={{ width: '70%', borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden' }}>
                {b.segments.map((s) => (
                  <View key={s.key} style={{ height: (s.value / max) * H, backgroundColor: s.color }} />
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4 }}>
        {bars.map((b) => (
          <T key={b.dayStart} variant="small" style={{ flex: 1, textAlign: 'center', fontSize: 11 }} color={b.dayStart === startOfDay(now) ? colors.accent : colors.textMuted}>
            {new Date(b.dayStart).toLocaleDateString([], { weekday: 'narrow' })}
          </T>
        ))}
      </View>
    </View>
  );
}

const countLabel = (n: number) => (n > 0 ? String(n) : '');

/** A pie (donut) of parts, drawn clockwise from the top. */
function Donut({ parts, size = 76 }: { parts: { key: string; color: string; value: number }[]; size?: number }) {
  const { colors } = useApp();
  const stroke = size * 0.22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0);
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
      {total > 0 &&
        parts.map((p) => {
          const len = (p.value / total) * c;
          const el = (
            <Circle
              key={p.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={p.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return p.value > 0 ? el : null;
        })}
    </Svg>
  );
}

/** Today's bar is what's left today (as on Today); reviews over the daily maximum roll to the next days. */
function GrammarTab({ reviews, now, dueToday }: { reviews: number[]; now: number; dueToday: number }) {
  const { colors, lines, cards, settings } = useApp();
  const days = lastWeek(now);
  const counts = countByDay(reviews, days);
  const levels = levelProgress(curriculum, cards);
  const buckets = applyDailyLimit(
    forecast(
      cards.filter((c) => !c.suspended).map((c) => c.due),
      now,
    ),
    dueToday,
    settings.grammarMaxReviewsPerDay,
  );
  return (
    <>
      <Section label="Reviews · last 7 days">
        <WeekBars bars={days.map((d, i) => ({ dayStart: d, segments: [{ key: 'g', color: colors.correct, value: counts[i] }] }))} now={now} format={countLabel} />
      </Section>

      <Section label="Train lines">
        {levels
          .filter((l) => l.total > 0)
          .map((l) => (
            <Pressable key={l.level} onPress={() => router.navigate({ pathname: '/grammar', params: { level: l.level } })} accessibilityRole="button" style={styles.lineRow}>
              <View style={[styles.lineBadge, { borderColor: lines[l.level].line }]}>
                <T variant="small" color={lines[l.level].ink} style={{ fontSize: 11, fontWeight: '900' }}>
                  {l.level}
                </T>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <ProgressBar value={l.learned / l.total} secondary={l.mastered / l.total} color={lines[l.level].line} height={10} />
              </View>
              <T variant="small" style={{ width: 64, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {l.learned}/{l.total}
              </T>
            </Pressable>
          ))}
      </Section>

      <Section label="Upcoming reviews · next 30 days">
        <ForecastChart buckets={buckets} />
      </Section>
    </>
  );
}

/** Learning cards as they come due; reviews within the decks' daily limits, like studying (new cards aren't forecast, as in Anki). */
function DecksTab({ reviews, decks, cardForecast, now }: { reviews: number[]; decks: DeckMaturity[]; cardForecast: AnkiForecastInput; now: number }) {
  const { colors } = useApp();
  const days = lastWeek(now);
  const counts = countByDay(reviews, days);
  if (decks.length === 0) {
    return (
      <Section label="Decks">
        <T variant="small">No flashcards yet. Import an Anki deck or make your own from the Cards tab.</T>
        <Button label="Go to Cards" kind="secondary" onPress={() => router.navigate('/decks')} />
      </Section>
    );
  }
  return (
    <>
      <Section label="Reviews · last 7 days">
        <WeekBars bars={days.map((d, i) => ({ dayStart: d, segments: [{ key: 'c', color: colors.blue, value: counts[i] }] }))} now={now} format={countLabel} />
      </Section>

      <Section label="Cards by deck">
        <View style={styles.legend}>
          {(['new', 'young', 'mature'] as const).map((k) => (
            <View key={k} style={styles.inline}>
              <Dot color={MATURITY_COLORS[k]} />
              <T variant="small" style={{ fontWeight: '800' }}>
                {k[0].toUpperCase() + k.slice(1)}
              </T>
            </View>
          ))}
        </View>
        {decks.map((d) => {
          const total = d.new + d.young + d.mature;
          return (
            <View key={d.path} style={styles.deckRow} accessibilityLabel={`${d.path}: ${d.new} new, ${d.young} young, ${d.mature} mature`}>
              <Donut
                parts={[
                  { key: 'new', color: MATURITY_COLORS.new, value: d.new },
                  { key: 'young', color: MATURITY_COLORS.young, value: d.young },
                  { key: 'mature', color: MATURITY_COLORS.mature, value: d.mature },
                ]}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="body" style={{ fontWeight: '800' }} numberOfLines={1}>
                  {d.path}
                </T>
                <T variant="small">{`${total.toLocaleString()} cards`}</T>
                <View style={styles.counts}>
                  {(['new', 'young', 'mature'] as const).map((k) => (
                    <T key={k} variant="small" color={MATURITY_COLORS[k]} style={{ fontWeight: '900', fontVariant: ['tabular-nums'] }}>
                      {`${d[k].toLocaleString()} ${k}`}
                    </T>
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </Section>

      <Section label="Upcoming reviews · next 30 days">
        <ForecastChart
          buckets={addForecasts(
            forecast(cardForecast.learning, now),
            applyDailyLimit(forecast(cardForecast.review, now), cardForecast.reviewsLeftToday, cardForecast.reviewsPerDay),
          )}
        />
      </Section>
    </>
  );
}

function TimeTab() {
  const { colors, settings } = useApp();
  const { entries, running, activityById } = useTime();
  const now = useNow(running ? 1000 : 30_000);

  const week = dailyTotals(entries, 7, now);
  const todayMs = week[week.length - 1]?.total ?? 0;
  const weekMs = week.reduce((s, d) => s + d.total, 0);

  // The latest entries of a minute or more (a running timer always shows), grouped by day.
  const byDay = useMemo(() => {
    const recent = entries
      .filter((e) => !e.ended_at || entryDuration(e, now) >= MIN_ENTRY_MS)
      .sort((a, b) => b.started_at - a.started_at)
      .slice(0, HISTORY_ENTRIES);
    const groups = new Map<number, TimeEntry[]>();
    for (const e of recent) {
      const d = startOfDay(e.started_at);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(e);
    }
    return [...groups.entries()];
  }, [entries, now]);

  return (
    <>
      <Section label="Time · last 7 days">
        <WeekBars
          bars={week.map((d) => ({
            dayStart: d.dayStart,
            segments: [...d.byActivity.entries()].map(([id, ms]) => ({ key: id, color: activityById.get(id)?.color ?? colors.chartBar, value: ms })),
          }))}
          now={now}
          format={(ms) => (ms >= MIN_ENTRY_MS ? formatDuration(ms).replace(' ', '') : '')}
          goal={(settings.dailyTimeGoalMin || 30) * 60 * 1000}
        />
      </Section>

      <View style={styles.row}>
        <Stat value={formatDuration(todayMs)} label="Today" />
        <Stat value={formatDuration(weekMs)} label="Past 7 days" />
      </View>

      <Section
        label="History"
        right={
          <Pressable onPress={() => router.push('/track/entry')} accessibilityRole="button" accessibilityLabel="Add a past entry" hitSlop={10}>
            <Ionicons name="add" size={24} color={colors.accent} />
          </Pressable>
        }
      >
        {byDay.length === 0 && <T variant="small">Nothing tracked yet.</T>}
        {byDay.map(([day, list]) => (
          <View key={day} style={{ marginBottom: spacing.sm }}>
            <View style={styles.rowBetween}>
              <T variant="body" style={{ fontWeight: '900' }}>
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
                    </T>
                  </View>
                  <T variant="body" style={{ fontVariant: ['tabular-nums'] }}>
                    {e.ended_at ? formatDuration(entryDuration(e, now)) : formatClock(entryDuration(e, now))}
                  </T>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Section>
    </>
  );
}

/** Streak, grammar learned and time this week up top; then Grammar, Decks and Time in tabs. Opened from the streak on Today. */
export default function Progress() {
  const db = useSQLiteContext();
  const { colors, cards, settings } = useApp();
  const { entries, refresh } = useTime();
  const today = useToday();
  const { now, streak } = today;
  const [tab, setTab] = useState<TabId>('grammar');
  const [loaded, setLoaded] = useState<Loaded>({
    reviews: { grammar: [], cards: [] },
    decks: [],
    cardForecast: { learning: [], review: [], reviewsLeftToday: 0, reviewsPerDay: 0 },
  });

  const load = useCallback(async () => {
    const t = Date.now();
    const [reviews, decks, cardForecast] = await Promise.all([
      getReviewTimes(db, startOfDay(t) - 7 * DAY),
      deckMaturity(db),
      ankiForecastInput(db, t, { newPerDay: settings.ankiNewPerDay, reviewsPerDay: settings.ankiMaxReviewsPerDay }),
    ]);
    setLoaded({ reviews, decks, cardForecast });
    // Reload after any grammar or flashcard study, or a change to the daily limits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, cards, today.cardsReviewedToday, settings.ankiNewPerDay, settings.ankiMaxReviewsPerDay]);
  useFocusEffect(
    useCallback(() => {
      // Pick up the latest app time (saved every minute in the background).
      refresh();
      load();
    }, [refresh, load]),
  );

  const weekMs = dailyTotals(entries, 7, now).reduce((s, d) => s + d.total, 0);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <View style={styles.inline}>
            <Flame size={24} color={streak.goalMetToday ? '#F08A3C' : colors.textMuted} />
            <T variant="title" style={{ fontSize: 26, lineHeight: 32 }}>
              {streak.days}
            </T>
          </View>
          <T variant="small">day streak</T>
        </View>
        <Stat value={String(cards.length)} label="grammar learned" />
        <Stat value={formatDuration(weekMs)} label="last 7 days" />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && { backgroundColor: colors.surface }]}
            >
              <Ionicons name={active ? (t.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : t.icon} size={18} color={active ? colors.accent : colors.textMuted} />
              <T variant="small" color={active ? colors.accent : colors.textMuted} style={{ fontWeight: '900' }}>
                {t.label}
              </T>
            </Pressable>
          );
        })}
      </View>

      {tab === 'grammar' && <GrammarTab reviews={loaded.reviews.grammar} now={now} dueToday={today.grammarDue} />}
      {tab === 'decks' && <DecksTab reviews={loaded.reviews.cards} decks={loaded.decks} cardForecast={loaded.cardForecast} now={now} />}
      {tab === 'time' && <TimeTab />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  lineBadge: { width: 30, height: 30, borderRadius: 15, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  row: { flexDirection: 'row', gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
  tabs: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: radius.md - 2 },
  legend: { flexDirection: 'row', gap: spacing.lg },
  deckRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xs },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md },
});
