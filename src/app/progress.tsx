import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import {
  ankiForecastInput,
  deckMaturity,
  type AnkiForecastInput,
  type DeckMaturity,
} from "@/anki/repo";
import { Flame } from "@/components/Flame";
import { ForecastChart } from "@/components/ForecastChart";
import { Icon } from "@/components/Icon";
import { Button, Rule, Section, Stat, T } from "@/components/ui";
import { curriculum } from "@/content/loader";
import { useToday } from "@/daily/useToday";
import { getReviewTimes } from "@/db/repo";
import { addForecasts, applyDailyLimit, forecast } from "@/srs/forecast";
import { levelProgress } from "@/stats/levelProgress";
import { useApp, useNow } from "@/state/AppProvider";
import { dailyPracticeMinutes } from "@/time/goals";
import {
  dailyTotals,
  entryDuration,
  formatClock,
  formatDuration,
  formatTimeOfDay,
  startOfDay,
  type TimeEntry,
} from "@/time/model";
import { useTime } from "@/time/TimeProvider";
import { spacing, TAP } from "@/theme/colors";

const DAY = 24 * 60 * 60 * 1000;
/** The history lists this many recent entries; shorter blips are left out. */
const HISTORY_ENTRIES = 30;
const MIN_ENTRY_MS = 60 * 1000;
const MATURITY_COLORS = { new: "#2F7FC1", young: "#7BC67E", mature: "#2E8B3E" };

type TabId = "grammar" | "decks" | "time";
const TABS: { id: TabId; label: string }[] = [
  { id: "grammar", label: "Grammar" },
  { id: "decks", label: "Cards" },
  { id: "time", label: "Time" },
];

interface Loaded {
  reviews: { grammar: number[]; cards: number[] };
  decks: DeckMaturity[];
  cardForecast: AnkiForecastInput;
}

function dayLabel(t: number, now: number): string {
  const today = startOfDay(now);
  if (t === today) return "Today";
  if (t === startOfDay(today - DAY / 2)) return "Yesterday";
  return new Date(t).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
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

/** A short weekday name ("Mo", "Tu") for a bar's label. */
function weekdayShort(t: number): string {
  return new Date(t).toLocaleDateString([], { weekday: "short" }).slice(0, 2);
}

/**
 * One bar per day for the last week, open (no boxes), the value over each bar, an optional dotted goal line.
 * Today's bar (when it's a single series) and label are in the accent colour.
 */
function WeekBars({
  bars,
  now,
  format,
  goal,
}: {
  bars: Bar[];
  now: number;
  format: (v: number) => string;
  goal?: number;
}) {
  const { colors } = useApp();
  const totals = bars.map((b) => b.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, (goal ?? 0) * 1.25, ...totals);
  const today = startOfDay(now);
  const H = 110;
  const LABEL = 16; // room above the tallest bar for its value
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: H + LABEL }}>
        {goal ? (
          <Svg
            width="100%"
            height={H + LABEL}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Line
              x1="0"
              x2="100%"
              y1={LABEL + H - (goal / max) * H}
              y2={LABEL + H - (goal / max) * H}
              stroke={colors.textFaint}
              strokeWidth={1.5}
              strokeDasharray="3 4"
              strokeLinecap="round"
            />
          </Svg>
        ) : null}
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "flex-end",
            gap: spacing.sm,
          }}
        >
          {bars.map((b, i) => {
            const isToday = b.dayStart === today;
            return (
              <View
                key={b.dayStart}
                style={{ flex: 1, alignItems: "center", gap: 3 }}
                accessibilityLabel={`${dayLabel(b.dayStart, now)}: ${format(totals[i]) || "nothing"}`}
              >
                <T
                  variant="small"
                  color={isToday ? colors.accentInk : colors.textFaint}
                  style={{
                    fontSize: 10,
                    lineHeight: 13,
                    fontWeight: isToday ? "800" : "500",
                  }}
                  numberOfLines={1}
                >
                  {format(totals[i])}
                </T>
                <View
                  style={{
                    width: 22,
                    maxWidth: "80%",
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    borderBottomLeftRadius: 3,
                    borderBottomRightRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  {b.segments.map((s) => (
                    <View
                      key={s.key}
                      style={{
                        height: (s.value / max) * H,
                        backgroundColor:
                          isToday && b.segments.length === 1
                            ? colors.accent
                            : s.color,
                      }}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {bars.map((b) => {
          const isToday = b.dayStart === today;
          return (
            <T
              key={b.dayStart}
              variant="small"
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 11,
                lineHeight: 14,
                fontWeight: isToday ? "800" : "500",
              }}
              color={isToday ? colors.accentInk : colors.textFaint}
              numberOfLines={1}
            >
              {isToday ? "Today" : weekdayShort(b.dayStart)}
            </T>
          );
        })}
      </View>
    </View>
  );
}

/** A thin bar for a train line: learned in the line's colour, mastered in gold over it. */
function LineBar({
  learned,
  mastered,
  color,
}: {
  learned: number;
  mastered: number;
  color: string;
}) {
  const { colors } = useApp();
  const w = (v: number) =>
    `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%` as const;
  return (
    <View
      style={{
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.border,
        overflow: "hidden",
      }}
    >
      {learned > 0 && (
        <View
          style={[
            styles.lineFill,
            { width: w(learned), backgroundColor: color },
          ]}
        />
      )}
      {mastered > 0 && (
        <View
          style={[
            styles.lineFill,
            { width: w(mastered), backgroundColor: colors.gold },
          ]}
        />
      )}
    </View>
  );
}

/** A small square colour key with its label. */
function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.inline}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
      <T variant="small" style={{ fontSize: 12, lineHeight: 16 }}>
        {label}
      </T>
    </View>
  );
}

/** A section label with a quieter suffix: "Reviews · last 7 days". */
function Label({ title, sub }: { title: string; sub?: string }) {
  return (
    <T
      variant="body"
      style={{ fontSize: 15, lineHeight: 22, fontWeight: "800" }}
    >
      {title}
      {sub ? (
        <T variant="muted" style={{ fontSize: 15, lineHeight: 22 }}>
          {` · ${sub}`}
        </T>
      ) : null}
    </T>
  );
}

const countLabel = (n: number) => (n > 0 ? String(n) : "");

/** A pie (donut) of parts, drawn clockwise from the top. */
function Donut({
  parts,
  size = 76,
}: {
  parts: { key: string; color: string; value: number }[];
  size?: number;
}) {
  const { colors } = useApp();
  const stroke = size * 0.22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0);
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.surfaceAlt}
        strokeWidth={stroke}
        fill="none"
      />
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
function GrammarTab({
  reviews,
  now,
  dueToday,
}: {
  reviews: number[];
  now: number;
  dueToday: number;
}) {
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
      <Section>
        <Label title="Reviews" sub="last 7 days" />
        <WeekBars
          bars={days.map((d, i) => ({
            dayStart: d,
            segments: [{ key: "g", color: colors.correct, value: counts[i] }],
          }))}
          now={now}
          format={countLabel}
        />
      </Section>

      <Section label="Train lines" style={{ gap: spacing.xs }}>
        {levels
          .filter((l) => l.total > 0)
          .map((l) => (
            <Pressable
              key={l.level}
              onPress={() =>
                router.navigate({
                  pathname: "/grammar",
                  params: { level: l.level },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`${l.level}: ${l.learned} of ${l.total} learned, ${l.mastered} mastered`}
              style={({ pressed }) => [
                styles.lineRow,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View
                style={[styles.lineBadge, { borderColor: lines[l.level].line }]}
              >
                <T
                  variant="small"
                  color={lines[l.level].ink}
                  style={{ fontSize: 11, lineHeight: 14, fontWeight: "800" }}
                >
                  {l.level}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <LineBar
                  learned={l.learned / l.total}
                  mastered={l.mastered / l.total}
                  color={lines[l.level].line}
                />
              </View>
              <T
                variant="small"
                style={{
                  width: 60,
                  textAlign: "right",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {l.learned}/{l.total}
              </T>
            </Pressable>
          ))}
        <View style={[styles.legend, { paddingTop: 6 }]}>
          <Key color={colors.correct} label="Learned" />
          <Key color={colors.gold} label="Mastered" />
        </View>
      </Section>

      <Section>
        <Label title="Upcoming reviews" sub="next 30 days" />
        <ForecastChart buckets={buckets} />
      </Section>
    </>
  );
}

/** Learning cards as they come due; reviews within the decks' daily limits, like studying (new cards aren't forecast, as in Anki). */
function DecksTab({
  reviews,
  decks,
  cardForecast,
  now,
}: {
  reviews: number[];
  decks: DeckMaturity[];
  cardForecast: AnkiForecastInput;
  now: number;
}) {
  const { colors } = useApp();
  const days = lastWeek(now);
  const counts = countByDay(reviews, days);
  if (decks.length === 0) {
    return (
      <Section label="Decks">
        <T variant="muted">
          No flashcards yet. Import an Anki deck or make your own from the Cards
          tab.
        </T>
        <Button
          label="Go to Cards"
          kind="secondary"
          onPress={() => router.navigate("/decks")}
        />
      </Section>
    );
  }
  return (
    <>
      <Section>
        <Label title="Reviews" sub="last 7 days" />
        <WeekBars
          bars={days.map((d, i) => ({
            dayStart: d,
            segments: [{ key: "c", color: colors.blue, value: counts[i] }],
          }))}
          now={now}
          format={countLabel}
        />
      </Section>

      <Section label="Cards by deck">
        <View style={styles.legend}>
          {(["new", "young", "mature"] as const).map((k) => (
            <Key
              key={k}
              color={MATURITY_COLORS[k]}
              label={k[0].toUpperCase() + k.slice(1)}
            />
          ))}
        </View>
        {decks.map((d, i) => {
          const total = d.new + d.young + d.mature;
          return (
            <View
              key={d.path}
              style={[
                styles.deckRow,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth * 2,
                  borderTopColor: colors.border,
                },
              ]}
              accessibilityLabel={`${d.path}: ${d.new} new, ${d.young} young, ${d.mature} mature`}
            >
              <Donut
                parts={[
                  { key: "new", color: MATURITY_COLORS.new, value: d.new },
                  {
                    key: "young",
                    color: MATURITY_COLORS.young,
                    value: d.young,
                  },
                  {
                    key: "mature",
                    color: MATURITY_COLORS.mature,
                    value: d.mature,
                  },
                ]}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <T
                  variant="body"
                  style={{ fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {d.path}
                </T>
                <T variant="small">{`${total.toLocaleString()} cards`}</T>
                <View style={styles.counts}>
                  {(["new", "young", "mature"] as const).map((k) => (
                    <T
                      key={k}
                      variant="small"
                      color={MATURITY_COLORS[k]}
                      style={{
                        fontWeight: "700",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {`${d[k].toLocaleString()} ${k}`}
                    </T>
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </Section>

      <Section>
        <Label title="Upcoming reviews" sub="next 30 days" />
        <ForecastChart
          buckets={addForecasts(
            forecast(cardForecast.learning, now),
            applyDailyLimit(
              forecast(cardForecast.review, now),
              cardForecast.reviewsLeftToday,
              cardForecast.reviewsPerDay,
            ),
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
      <Section>
        <Label title="Time" sub="last 7 days" />
        <WeekBars
          bars={week.map((d) => ({
            dayStart: d.dayStart,
            segments: [...d.byActivity.entries()].map(([id, ms]) => ({
              key: id,
              color: activityById.get(id)?.color ?? colors.chartBar,
              value: ms,
            })),
          }))}
          now={now}
          format={(ms) =>
            ms >= MIN_ENTRY_MS ? formatDuration(ms).replace(" ", "") : ""
          }
          goal={
            (dailyPracticeMinutes(settings.timeGoals, now) || 30) * 60 * 1000
          }
        />
      </Section>

      <View
        style={[styles.row, styles.statRow, { borderColor: colors.border }]}
      >
        <Stat value={formatDuration(todayMs)} label="Today" />
        <Stat value={formatDuration(weekMs)} label="Past 7 days" />
      </View>

      <Section
        label="History"
        right={
          <Pressable
            onPress={() => router.push("/track/entry")}
            accessibilityRole="button"
            accessibilityLabel="Add a past entry"
            hitSlop={10}
            style={styles.addButton}
          >
            <Icon
              name="plus"
              size={22}
              color={colors.accentInk}
              strokeWidth={2.4}
            />
          </Pressable>
        }
      >
        {byDay.length === 0 && <T variant="muted">Nothing tracked yet.</T>}
        {byDay.map(([day, list]) => (
          <View key={day} style={{ marginBottom: spacing.md }}>
            <View style={[styles.rowBetween, { paddingBottom: spacing.xs }]}>
              <T
                variant="body"
                style={{ fontSize: 15, fontWeight: "700" }}
                color={colors.textMuted}
              >
                {dayLabel(day, now)}
              </T>
              <T variant="small">
                {formatDuration(
                  list.reduce((s, e) => s + entryDuration(e, now), 0),
                )}
              </T>
            </View>
            {list.map((e, i) => {
              const a = activityById.get(e.activity_id);
              return (
                <View key={e.id}>
                  {i > 0 && <Rule />}
                  <Pressable
                    key={e.id}
                    onPress={() =>
                      router.push({
                        pathname: "/track/entry",
                        params: { id: String(e.id) },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityHint="Edit this entry"
                    style={({ pressed }) => [
                      styles.entry,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Dot color={a?.color ?? colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <T
                        variant="body"
                        style={{ fontWeight: "700" }}
                        numberOfLines={1}
                      >
                        {a?.name ?? "Deleted"}
                        {e.note ? (
                          <T variant="muted" style={{ fontWeight: "500" }}>
                            {" "}
                            · {e.note}
                          </T>
                        ) : null}
                      </T>
                      <T variant="small">
                        {formatTimeOfDay(e.started_at)} –{" "}
                        {e.ended_at ? formatTimeOfDay(e.ended_at) : "now"}
                      </T>
                    </View>
                    <T
                      variant="body"
                      style={{
                        fontWeight: "700",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {e.ended_at
                        ? formatDuration(entryDuration(e, now))
                        : formatClock(entryDuration(e, now))}
                    </T>
                  </Pressable>
                </View>
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
  const [tab, setTab] = useState<TabId>("grammar");
  const [loaded, setLoaded] = useState<Loaded>({
    reviews: { grammar: [], cards: [] },
    decks: [],
    cardForecast: {
      learning: [],
      review: [],
      reviewsLeftToday: 0,
      reviewsPerDay: 0,
    },
  });

  const load = useCallback(async () => {
    const t = Date.now();
    const [reviews, decks, cardForecast] = await Promise.all([
      getReviewTimes(db, startOfDay(t) - 7 * DAY),
      deckMaturity(db),
      ankiForecastInput(db, t, {
        newPerDay: settings.ankiNewPerDay,
        reviewsPerDay: settings.ankiMaxReviewsPerDay,
      }),
    ]);
    setLoaded({ reviews, decks, cardForecast });
    // Reload after any grammar or flashcard study, or a change to the daily limits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    db,
    cards,
    today.cardsReviewedToday,
    settings.ankiNewPerDay,
    settings.ankiMaxReviewsPerDay,
  ]);
  useFocusEffect(
    useCallback(() => {
      // Pick up the latest app time (saved every minute in the background).
      refresh();
      load();
    }, [refresh, load]),
  );

  const weekMs = dailyTotals(entries, 7, now).reduce((s, d) => s + d.total, 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <View style={[styles.inline, { gap: 4 }]}>
            <Flame
              size={24}
              color={streak.goalMetToday ? colors.flame : colors.textFaint}
              core={streak.goalMetToday ? undefined : colors.surfaceAlt}
            />
            <T variant="title" style={{ fontSize: 26, lineHeight: 32 }}>
              {streak.days}
            </T>
          </View>
          <T variant="small">day streak</T>
        </View>
        <Stat value={String(cards.length)} label="grammar learned" />
        <Stat value={formatDuration(weekMs)} label="last 7 days" />
      </View>

      <View
        style={[styles.tabs, { borderBottomColor: colors.border }]}
        accessibilityRole="tablist"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[
                styles.tab,
                { borderBottomColor: active ? colors.accent : "transparent" },
              ]}
            >
              <T
                variant="body"
                color={active ? colors.accentInk : colors.textMuted}
                style={{
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: active ? "800" : "700",
                }}
              >
                {t.label}
              </T>
            </Pressable>
          );
        })}
      </View>

      {tab === "grammar" && (
        <GrammarTab
          reviews={loaded.reviews.grammar}
          now={now}
          dueToday={today.grammarDue}
        />
      )}
      {tab === "decks" && (
        <DecksTab
          reviews={loaded.reviews.cards}
          decks={loaded.decks}
          cardForecast={loaded.cardForecast}
          now={now}
        />
      )}
      {tab === "time" && <TimeTab />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  lineBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  lineFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 5,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  row: { flexDirection: "row", gap: spacing.md },
  statRow: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  inline: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: TAP,
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -10,
    marginRight: -10,
  },
  tabs: {
    flexDirection: "row",
    gap: 22,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    marginTop: -spacing.xs,
  },
  tab: {
    minHeight: 44,
    justifyContent: "center",
    borderBottomWidth: 3,
    marginBottom: -StyleSheet.hairlineWidth * 2,
  },
  legend: { flexDirection: "row", gap: spacing.lg },
  deckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  counts: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md },
});
