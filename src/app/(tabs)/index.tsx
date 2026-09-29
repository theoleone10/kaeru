import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { accountLabel, useAuth } from '@/auth/AuthProvider';
import { ForecastChart } from '@/components/ForecastChart';
import { Mascot } from '@/components/Mascot';
import { Button, Card, IconButton, ProgressBar, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { stationCode, stationOf, unitsFor } from '@/content/units';
import { getActivityTimes } from '@/db/repo';
import { forecast } from '@/srs/forecast';
import { availableLessonCount, lessonsLearnedToday } from '@/srs/lessons';
import { isMastered } from '@/srs/scheduler';
import { dayKey } from '@/stats/dates';
import { levelProgress } from '@/stats/levelProgress';
import { computeStreak } from '@/stats/streak';
import { useApp, useNow } from '@/state/AppProvider';
import { entryDuration, formatClock } from '@/time/model';
import { useTime } from '@/time/TimeProvider';
import { LEVEL_COLORS, radius, spacing } from '@/theme/colors';

const DAY = 24 * 60 * 60 * 1000;

function greeting(now: number): string {
  const h = new Date(now).getHours();
  return h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは';
}

function Flame({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9z" fill={color} />
    </Svg>
  );
}

/** Daily goal ring. */
function Ring({ value, total, size = 84 }: { value: number; total: number; size?: number }) {
  const { colors } = useApp();
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={12} fill="none" />
        {frac > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={frac >= 1 ? colors.correct : colors.gold}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * frac} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <T variant="heading" style={{ fontWeight: '900', fontSize: 18 }}>
        {value}/{total}
      </T>
    </View>
  );
}

export default function Dashboard() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors, cards, settings } = useApp();
  const { user } = useAuth();
  const { running, activityById, stop } = useTime();
  const now = useNow(running ? 1000 : 30_000);
  const [activity, setActivity] = useState<number[]>([]);

  // Recompute when progress changes (cards) or the day rolls over.
  const today = new Date(now).toDateString();
  useEffect(() => {
    getActivityTimes(db, Date.now() - 400 * DAY).then(setActivity);
  }, [db, cards, today]);

  const streak = computeStreak(activity, now);
  const activeDays = new Set(activity.map(dayKey));
  const active = cards.filter((c) => !c.suspended);
  const { dueNow, buckets } = forecast(
    active.map((c) => c.due),
    now,
  );
  const learnedToday = lessonsLearnedToday(cards.map((c) => c.learned_at), now);
  const learnedIds = new Set(cards.map((c) => c.grammar_id));
  const lessons = availableLessonCount(curriculum, learnedIds, learnedToday, settings.dailyLessonLimit);
  const next = curriculum.find((p) => !learnedIds.has(p.id));
  const station = next ? stationOf(next.id) : undefined;
  const unit = next && station ? unitsFor(next.level)[station.unit - 1] : undefined;
  const unitDone = unit ? unit.stations.filter((s) => learnedIds.has(s.point.id)).length : 0;
  const mastered = cards.filter(isMastered).length;
  const levels = levelProgress(curriculum, cards);
  const name = user ? accountLabel(user).split(/[ @]/)[0] : '';
  const line = next ? LEVEL_COLORS[next.level] : LEVEL_COLORS.N5;

  const bubble =
    dueNow > 0
      ? `${dueNow} ${dueNow === 1 ? 'review is' : 'reviews are'} waiting for you.`
      : lessons > 0
        ? `${lessons} new ${lessons === 1 ? 'point' : 'points'} left in today’s goal.`
        : next
          ? 'All done for today. See you tomorrow!'
          : 'You’ve learned every grammar point. すごい！';

  // Last 7 days, Monday-first labels.
  const week = Array.from({ length: 7 }, (_, i) => {
    const t = now - (6 - i) * DAY;
    return { t, on: activeDays.has(dayKey(t)), today: i === 6, label: new Date(t).toLocaleDateString([], { weekday: 'narrow' }) };
  });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topBar}>
        <View style={[styles.levelPill, { backgroundColor: line.soft }]}>
          <T variant="small" color={line.ink} style={{ fontWeight: '900', fontSize: 15 }}>
            {next?.level ?? 'N1'}
          </T>
          {station && (
            <T variant="small" color={line.ink} style={{ fontSize: 14 }}>
              · Unit {station.unit}
            </T>
          )}
        </View>
        <View style={styles.topStats}>
          <View style={styles.topStat} accessibilityLabel={`${streak.days} day streak`}>
            <Flame color={streak.studiedToday ? '#F08A3C' : colors.textMuted} />
            <T variant="heading" color={streak.studiedToday ? '#D9663D' : colors.textMuted} style={{ fontWeight: '900' }}>
              {streak.days}
            </T>
          </View>
          <View style={styles.topStat} accessibilityLabel={`${mastered} grammar points mastered`}>
            <Ionicons name="star" size={20} color={colors.gold} />
            <T variant="heading" color={colors.notice} style={{ fontWeight: '900' }}>
              {mastered}
            </T>
          </View>
          <IconButton label="Settings" onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
          </IconButton>
        </View>
      </View>

      <View style={styles.greeting}>
        <Mascot size={76} mood={dueNow > 0 || lessons > 0 ? 'happy' : 'cheer'} bounce />
        <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <T variant="heading" style={{ fontWeight: '900' }}>
            {greeting(now)}
            {name ? `、${name}` : ''}！
          </T>
          <T variant="muted">{bubble}</T>
        </View>
      </View>

      {next && station && (
        <View style={[styles.hero, { backgroundColor: colors.accent, borderBottomColor: colors.accentShadow }]}>
          <T variant="small" color="#FFFFFF" style={{ fontWeight: '900', letterSpacing: 1.2, opacity: 0.92 }}>
            UP NEXT · {stationCode(station)} · UNIT {station.unit}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <T variant="title" color="#FFFFFF" style={{ fontSize: 36, lineHeight: 46 }} numberOfLines={2}>
                {next.title}
              </T>
              <T variant="body" color="#FFFFFF" style={{ fontWeight: '700' }} numberOfLines={2}>
                {next.meaning}
              </T>
            </View>
            {unit && (
              <View style={styles.heroBadge} accessibilityLabel={`${unitDone} of ${unit.stations.length} in this unit`}>
                <T variant="small" color={colors.accent} style={{ fontWeight: '900', fontSize: 15 }}>
                  {unitDone}/{unit.stations.length}
                </T>
              </View>
            )}
          </View>
          <Button
            label={lessons > 0 ? 'Start lesson' : 'Daily limit reached'}
            kind="secondary"
            disabled={lessons === 0}
            onPress={() => router.push('/lessons')}
            style={{ marginTop: spacing.xs }}
          />
        </View>
      )}

      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <View style={styles.tileHead}>
            <View style={[styles.tileIcon, { backgroundColor: colors.correctSoft }]}>
              <Ionicons name="refresh" size={20} color={colors.correctText} />
            </View>
            <T variant="muted">Reviews</T>
          </View>
          <T variant="title" style={{ fontSize: 34, lineHeight: 40 }}>
            {dueNow}
            <T variant="muted"> due</T>
          </T>
          <Button label="Review" kind="success" small disabled={dueNow === 0} onPress={() => router.navigate('/review')} />
        </Card>
        <Card style={[styles.tile, { alignItems: 'center' }]}>
          <T variant="muted" style={{ alignSelf: 'flex-start' }}>
            Daily goal
          </T>
          <Ring value={Math.min(learnedToday, settings.dailyLessonLimit)} total={settings.dailyLessonLimit} />
          <T variant="small">points learned</T>
        </Card>
      </View>

      {running && (
        <Pressable onPress={() => router.navigate('/track')} accessibilityRole="button" accessibilityHint="Open time tracking">
          <View style={[styles.timer, { backgroundColor: colors.blueSoft, borderColor: activityById.get(running.activity_id)?.color ?? colors.blue }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: activityById.get(running.activity_id)?.color ?? colors.blue }} />
            <View style={{ flex: 1 }}>
              <T variant="body" color={colors.blueText} style={{ fontWeight: '900' }}>
                {activityById.get(running.activity_id)?.name ?? 'Timer'} running
              </T>
              {running.note ? (
                <T variant="small" color={colors.blueText}>
                  {running.note}
                </T>
              ) : null}
            </View>
            <T variant="heading" color={colors.blueText} style={{ fontWeight: '900', fontVariant: ['tabular-nums'] }}>
              {formatClock(entryDuration(running, now))}
            </T>
            <Pressable onPress={stop} accessibilityRole="button" accessibilityLabel="Stop timer" style={[styles.stop, { backgroundColor: colors.blue, borderBottomColor: colors.blueShadow }]}>
              <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
            </Pressable>
          </View>
        </Pressable>
      )}

      <View style={styles.week} accessibilityLabel={`Studied on ${week.filter((d) => d.on).length} of the last 7 days`}>
        {week.map((d) => (
          <View key={d.t} style={{ alignItems: 'center', gap: 4 }}>
            <View
              style={[
                styles.weekDot,
                { backgroundColor: d.on ? '#F08A3C' : colors.surfaceAlt },
                d.today && { borderWidth: 3, borderColor: d.on ? '#FBD6BD' : colors.border },
              ]}
            >
              {d.on && <Flame size={18} color="#FFFFFF" />}
            </View>
            <T variant="small" color={d.today ? colors.accent : colors.textMuted} style={{ fontWeight: '900' }}>
              {d.label}
            </T>
          </View>
        ))}
      </View>

      <Card style={{ gap: spacing.sm }}>
        <T variant="heading">Coming up (24h)</T>
        <ForecastChart buckets={buckets} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <T variant="heading">Your lines</T>
        {levels
          .filter((l) => l.total > 0)
          .map((l) => (
            <Pressable key={l.level} onPress={() => router.navigate({ pathname: '/grammar', params: { level: l.level } })} accessibilityRole="button" style={{ gap: 6 }}>
              <View style={styles.levelRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.lineBadge, { borderColor: LEVEL_COLORS[l.level].line }]}>
                    <T variant="small" color={LEVEL_COLORS[l.level].ink} style={{ fontSize: 11, fontWeight: '900' }}>
                      {l.level}
                    </T>
                  </View>
                  <T variant="body" style={{ fontWeight: '800' }}>
                    {l.learned} / {l.total}
                  </T>
                </View>
                <T variant="small">{l.mastered} mastered</T>
              </View>
              <ProgressBar value={l.learned / l.total} secondary={l.mastered / l.total} color={LEVEL_COLORS[l.level].line} />
            </Pressable>
          ))}
        <T variant="small">Bright = learned, green = mastered (next review 3+ weeks away).</T>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  topStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  greeting: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bubble: { flex: 1, borderWidth: 2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  hero: { borderRadius: 26, padding: spacing.xl - 4, gap: spacing.sm, borderBottomWidth: 6 },
  heroBadge: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', borderWidth: 5, borderColor: '#F4B79D', alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, gap: spacing.sm, padding: spacing.md },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 2, borderRadius: radius.lg, paddingVertical: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm },
  stop: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3 },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineBadge: { width: 30, height: 30, borderRadius: 15, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
});
