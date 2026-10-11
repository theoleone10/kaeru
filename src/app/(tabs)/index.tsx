import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { accountLabel, useAuth } from '@/auth/AuthProvider';
import { stepMeta, StepList } from '@/components/DayPlan';
import { Flame } from '@/components/Flame';
import { Mascot } from '@/components/Mascot';
import { TimerChips } from '@/components/TimerChips';
import { Button, Card, IconButton, ProgressBar, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { stationOf } from '@/content/units';
import type { Step } from '@/daily/plan';
import { useToday } from '@/daily/useToday';
import { isMastered } from '@/srs/scheduler';
import { dayKey } from '@/stats/dates';
import { useApp } from '@/state/AppProvider';
import { entryDuration, formatClock, formatDuration, startOfWeek, totalsByActivity } from '@/time/model';
import { useTime } from '@/time/TimeProvider';
import { LEVEL_COLORS, radius, spacing } from '@/theme/colors';

const DAY = 24 * 60 * 60 * 1000;

function greeting(now: number): string {
  const h = new Date(now).getHours();
  return h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは';
}

/** How much of today's plan is done. */
function Ring({ value, total, size = 64 }: { value: number; total: number; size?: number }) {
  const { colors } = useApp();
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.35)" strokeWidth={9} fill="none" />
        {frac > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={frac >= 1 ? colors.gold : '#FFFFFF'}
            strokeWidth={9}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * frac} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <T variant="body" color="#FFFFFF" style={{ fontWeight: '900' }}>
        {value}/{total}
      </T>
    </View>
  );
}

/** What Kaeru says: points at the next part of the day. */
function nudge(next: Step | null, allDone: boolean): string {
  if (allDone) return 'That’s everything for today. おつかれさま！';
  switch (next?.id) {
    case 'learn':
      return 'Let’s start with today’s new grammar.';
    case 'review':
      return 'Time to review what you’ve learned.';
    case 'cards':
      return 'Your flashcards are waiting.';
    case 'time':
      return 'Nearly there: a little immersion to finish the day.';
    default:
      return 'Start your first lesson to begin your journey.';
  }
}

/** A tappable number tile in the "Your progress" row. */
function Tile({
  icon,
  color,
  soft,
  label,
  value,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  soft: string;
  label: string;
  value: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}, ${sub}`} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.75 : 1 }]}>
      <Card style={styles.tile}>
        <View style={[styles.tileIcon, { backgroundColor: soft }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <T variant="small" style={{ fontWeight: '800' }}>
          {label}
        </T>
        <T variant="heading" style={{ fontWeight: '900', fontSize: 20 }} numberOfLines={1}>
          {value}
        </T>
        <T variant="small" numberOfLines={1}>
          {sub}
        </T>
      </Card>
    </Pressable>
  );
}

export default function Today() {
  const insets = useSafeAreaInsets();
  const { colors, cards, settings } = useApp();
  const { user } = useAuth();
  const { running, activityById, entries } = useTime();
  const today = useToday();
  const { plan, now, streak } = today;

  const learnedIds = new Set(cards.map((c) => c.grammar_id));
  const next = curriculum.find((p) => !learnedIds.has(p.id));
  const station = next ? stationOf(next.id) : undefined;
  const mastered = cards.filter(isMastered).length;
  const name = user ? accountLabel(user).split(/[ @]/)[0] : '';
  const line = next ? LEVEL_COLORS[next.level] : LEVEL_COLORS.N1;
  const weekMs = [...totalsByActivity(entries, startOfWeek(now), now + DAY, now).values()].reduce((a, b) => a + b, 0);
  const goalMs = settings.dailyTimeGoalMin * 60 * 1000;
  const activeDays = new Set(today.activity.map(dayKey));
  const runningActivity = running ? activityById.get(running.activity_id) : undefined;

  const week = Array.from({ length: 7 }, (_, i) => {
    const t = now - (6 - i) * DAY;
    return { t, on: activeDays.has(dayKey(t)), today: i === 6, label: new Date(t).toLocaleDateString([], { weekday: 'narrow' }) };
  });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.navigate({ pathname: '/grammar', params: { level: next?.level ?? 'N1' } })}
          accessibilityRole="button"
          accessibilityLabel={`${next?.level ?? 'N1'} line, open the grammar map`}
          style={[styles.levelPill, { backgroundColor: line.soft }]}
        >
          <T variant="small" color={line.ink} style={{ fontWeight: '900', fontSize: 15 }}>
            {next?.level ?? 'N1'}
          </T>
          {station && (
            <T variant="small" color={line.ink} style={{ fontSize: 14 }}>
              · Unit {station.unit}
            </T>
          )}
        </Pressable>
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
        <Mascot size={76} mood={plan.allDone ? 'cheer' : 'happy'} bounce />
        <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <T variant="heading" style={{ fontWeight: '900' }}>
            {greeting(now)}
            {name ? `、${name}` : ''}！
          </T>
          <T variant="muted">{nudge(plan.next, plan.allDone)}</T>
        </View>
      </View>

      <View style={[styles.plan, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong }]}>
        <View style={[styles.planHead, { backgroundColor: colors.accent, borderBottomColor: colors.accentShadow }]}>
          <View style={{ flex: 1 }}>
            <T variant="small" color="#FFFFFF" style={{ fontWeight: '900', letterSpacing: 1.2, opacity: 0.92 }}>
              TODAY · {new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
            </T>
            <T variant="title" color="#FFFFFF" style={{ fontSize: 26, lineHeight: 32 }}>
              {plan.allDone ? 'All done!' : plan.doneCount === 0 ? 'Your daily plan' : 'Keep going'}
            </T>
          </View>
          {plan.steps.length > 0 && <Ring value={plan.doneCount} total={plan.steps.length} />}
        </View>
        <View style={{ padding: spacing.md, gap: spacing.md }}>
          <StepList steps={plan.steps} next={plan.next} onOpen={(id) => today.goTo(id)} />
          {plan.next ? (
            <Button
              label={
                plan.next.id === 'learn'
                  ? 'Start today’s lesson'
                  : plan.next.id === 'review'
                    ? `Review ${today.grammarDue} ${today.grammarDue === 1 ? 'point' : 'points'}`
                    : plan.next.id === 'cards'
                      ? 'Study flashcards'
                      : 'Open the timer'
              }
              kind={plan.next.id === 'review' ? 'success' : plan.next.id === 'cards' ? 'blue' : 'primary'}
              icon={<Ionicons name={stepMeta(colors, plan.next.id).icon} size={20} color="#FFFFFF" />}
              onPress={() => today.goTo(plan.next!.id)}
            />
          ) : next ? (
            <Button label="Learn one more point" kind="ghost" onPress={() => router.push({ pathname: '/lessons', params: { extra: '1' } })} />
          ) : null}
        </View>
      </View>

      <Card style={{ gap: spacing.md }}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <T variant="heading">Immersion & study</T>
            <T variant="small">
              {formatDuration(today.timeTodayMs)} today{goalMs > 0 ? ` of ${formatDuration(goalMs)}` : ''} · lessons and reviews count too
            </T>
          </View>
          <IconButton label="Open time tracking" onPress={() => router.navigate({ pathname: '/progress', params: { tab: 'time' } })}>
            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
          </IconButton>
        </View>
        {goalMs > 0 && <ProgressBar value={Math.min(1, today.timeTodayMs / goalMs)} color={colors.gold} />}
        {running && (
          <View style={[styles.timer, { backgroundColor: colors.blueSoft, borderColor: runningActivity?.color ?? colors.blue }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: runningActivity?.color ?? colors.blue }} />
            <T variant="body" color={colors.blueText} style={{ flex: 1, fontWeight: '900' }} numberOfLines={1}>
              {runningActivity?.name ?? 'Timer'}
              {running.note ? ` · ${running.note}` : ''}
            </T>
            <T variant="heading" color={colors.blueText} style={{ fontWeight: '900', fontVariant: ['tabular-nums'] }}>
              {formatClock(entryDuration(running, now))}
            </T>
          </View>
        )}
        <TimerChips showAdd={false} />
      </Card>

      <View style={{ gap: spacing.sm }}>
        <T variant="heading">Your progress</T>
        <View style={styles.tiles}>
          <Tile
            icon="train"
            color={colors.accent}
            soft={colors.accentSoft}
            label="Grammar"
            value={`${cards.length}/${curriculum.length}`}
            sub={`${mastered} mastered`}
            onPress={() => router.navigate('/grammar')}
          />
          <Tile
            icon="albums"
            color={colors.blue}
            soft={colors.blueSoft}
            label="Flashcards"
            value={String(today.cardsReviewedToday)}
            sub={today.cardsDue > 0 ? `${today.cardsDue} left today` : 'studied today'}
            onPress={() => router.navigate('/decks')}
          />
          <Tile icon="timer" color={colors.notice} soft={colors.goldSoft} label="This week" value={formatDuration(weekMs)} sub="tracked" onPress={() => router.navigate('/progress')} />
        </View>
      </View>

      <Pressable
        onPress={() => router.navigate('/progress')}
        accessibilityRole="button"
        accessibilityLabel={`${streak.days} day streak. Studied on ${week.filter((d) => d.on).length} of the last 7 days. Open progress.`}
      >
        <Card style={{ gap: spacing.md }}>
          <View style={styles.rowBetween}>
            <T variant="heading">{streak.days} day streak</T>
            <Flame size={22} color={streak.studiedToday ? '#F08A3C' : colors.textMuted} />
          </View>
          <View style={styles.week}>
            {week.map((d) => (
              <View key={d.t} style={{ alignItems: 'center', gap: 4 }}>
                <View style={[styles.weekDot, { backgroundColor: d.on ? '#F08A3C' : colors.surfaceAlt }, d.today && { borderWidth: 3, borderColor: d.on ? '#FBD6BD' : colors.border }]}>
                  {d.on && <Flame size={18} color="#FFFFFF" />}
                </View>
                <T variant="small" color={d.today ? colors.accent : colors.textMuted} style={{ fontWeight: '900' }}>
                  {d.label}
                </T>
              </View>
            ))}
          </View>
          <T variant="small">Grammar, flashcards and tracked time all keep your streak alive.</T>
        </Card>
      </Pressable>
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
  plan: { borderRadius: 26, borderWidth: 2, borderBottomWidth: 6, overflow: 'hidden' },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { gap: 2, padding: spacing.md },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 2, borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
