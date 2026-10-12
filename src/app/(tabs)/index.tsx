import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StepBadge } from '@/components/DayPlan';
import { Flame } from '@/components/Flame';
import { Mascot } from '@/components/Mascot';
import { TimerChips } from '@/components/TimerChips';
import { IconButton, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { stationOf } from '@/content/units';
import { frogLines } from '@/daily/frogLines';
import { useToday } from '@/daily/useToday';
import { useDayMilestones } from '@/sound/useMilestoneSounds';
import { useApp } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';
import { spacing } from '@/theme/colors';

const pick = () => Math.floor(Math.random() * 1000);

export default function Today() {
  const insets = useSafeAreaInsets();
  const { colors, lines, cards } = useApp();
  const { running } = useTime();
  const today = useToday();
  const { plan, now, streak } = today;
  // Catches a day finished outside a study session (e.g. by stopping the timer).
  useDayMilestones({ loaded: today.loaded, allDone: plan.allDone, streak: streak.days, studiedToday: streak.studiedToday });
  // Which of the frog's lines to show: a new one each visit, and each tap on the frog.
  const [seed, setSeed] = useState(pick);
  useFocusEffect(useCallback(() => setSeed(pick()), []));

  const learnedIds = new Set(cards.map((c) => c.grammar_id));
  const next = curriculum.find((p) => !learnedIds.has(p.id));
  const station = next ? stationOf(next.id) : undefined;
  const line = next ? lines[next.level] : lines.N1;

  const said = frogLines({ now, done: plan.doneCount, total: plan.steps.length, streak: streak.days, timerRunning: !!running });
  const say = said[seed % said.length];
  const date = new Date(now);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}
    >
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
          <Pressable
            onPress={() => router.push('/progress')}
            accessibilityRole="button"
            accessibilityLabel={`${streak.days} day streak. Open progress.`}
            hitSlop={8}
            style={({ pressed }) => [styles.topStat, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Flame color={streak.studiedToday ? '#F08A3C' : colors.textMuted} />
            <T variant="heading" color={streak.studiedToday ? '#D9663D' : colors.textMuted} style={{ fontWeight: '900' }}>
              {streak.days}
            </T>
          </Pressable>
          <IconButton label="Settings" onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
          </IconButton>
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <T variant="small" style={{ fontWeight: '800', fontSize: 15 }}>
          {date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
        </T>
        <T variant="title" style={{ fontSize: 32, lineHeight: 38 }}>
          {date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        </T>
      </View>

      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          setSeed((s) => s + 1 + Math.floor(Math.random() * (said.length - 1)));
        }}
        accessibilityRole="button"
        accessibilityLabel={`Kaeru says: ${say.jp} ${say.en}`}
        accessibilityHint="Tap for something else"
        style={styles.frog}
      >
        <Mascot size={92} mood={plan.allDone ? 'cheer' : 'happy'} bounce />
        <View style={[styles.bubble, { backgroundColor: colors.surface }]}>
          <View style={[styles.tail, { borderRightColor: colors.surface }]} />
          <T variant="heading" style={{ fontWeight: '900' }}>
            {say.jp}
          </T>
          <T variant="small">{say.en}</T>
        </View>
      </Pressable>

      {plan.steps.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <T variant="small" style={{ fontWeight: '900', letterSpacing: 1 }}>
            {plan.allDone ? '今日 · ALL DONE' : `今日 · ${plan.doneCount}/${plan.steps.length}`}
          </T>
          {plan.steps.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => today.goTo(s.id)}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}. ${s.detail}. ${s.done ? 'Done' : 'To do'}`}
              style={({ pressed }) => [styles.step, { opacity: pressed ? 0.6 : 1 }]}
            >
              <StepBadge step={s} size={40} />
              <View style={{ flex: 1 }}>
                <T variant="body" color={s.done ? colors.textMuted : colors.text} style={{ fontWeight: '800', textDecorationLine: s.done ? 'line-through' : 'none' }} numberOfLines={1}>
                  {s.title}
                </T>
                {s.detail ? (
                  <T variant="small" numberOfLines={1}>
                    {s.detail}
                  </T>
                ) : null}
              </View>
              {!s.done && <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ flex: 1 }} />
      <TimerChips showAdd={false} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  topStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  frog: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bubble: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  tail: {
    position: 'absolute',
    left: -10,
    top: '50%',
    marginTop: -8,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderRightWidth: 11,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
});
