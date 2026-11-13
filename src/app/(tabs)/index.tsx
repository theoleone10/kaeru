import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { DayDoneCelebration } from '@/components/DayDoneCelebration';
import { StepRow, StepSegments } from '@/components/DayPlan';
import { Flame } from '@/components/Flame';
import { KanaCourseCard } from '@/components/KanaCourseCard';
import { Mascot } from '@/components/Mascot';
import { TimerChips } from '@/components/TimerChips';
import { T } from '@/components/ui';
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
  const { colors, lines, cards, settings, isDark } = useApp();
  const { running } = useTime();
  const today = useToday();
  const { plan, now, streak } = today;
  // Catches a day finished outside a study session (e.g. by stopping the timer).
  useDayMilestones({ loaded: today.loaded, allDone: plan.allDone, streak: streak.days, goalMetToday: streak.goalMetToday });
  // Which of the frog's lines to show: a new one each visit, and each tap on the frog.
  const [seed, setSeed] = useState(pick);
  useFocusEffect(useCallback(() => setSeed(pick()), []));

  const learnedIds = new Set(cards.map((c) => c.grammar_id));
  const next = curriculum.find((p) => !learnedIds.has(p.id));
  const station = next ? stationOf(next.id) : undefined;
  const line = next ? lines[next.level] : lines.N1;

  const said = frogLines({ now, done: plan.allDone ? plan.steps.length : plan.doneCount, total: plan.steps.length, streak: streak.days, timerRunning: !!running });
  const say = said[seed % said.length];
  const date = new Date(now);

  const level = next?.level ?? 'N1';
  const lit = streak.goalMetToday;
  const lift = isDark ? undefined : SHADOW;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.navigate({ pathname: '/grammar', params: { level } })}
          accessibilityRole="button"
          accessibilityLabel={`${level} line, open the grammar map`}
          hitSlop={4}
          style={({ pressed }) => [styles.levelPill, { backgroundColor: colors.surface, boxShadow: lift, paddingRight: station ? 14 : 5, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
        >
          <View style={[styles.levelBadge, { backgroundColor: line.line }]}>
            <T variant="small" color="#FFFFFF" style={{ fontWeight: '800', fontSize: 11, lineHeight: 14 }}>
              {level}
            </T>
          </View>
          {station && (
            <T variant="small" color={line.ink} style={{ fontSize: 14, lineHeight: 20, fontWeight: '700' }}>
              Unit {station.unit}
            </T>
          )}
        </Pressable>
        <View style={styles.topStats}>
          <Pressable
            onPress={() => router.push('/progress')}
            accessibilityRole="button"
            accessibilityLabel={`${streak.days} day streak. Open progress.`}
            hitSlop={4}
            style={({ pressed }) => [styles.streak, { backgroundColor: lit ? colors.flameSoft : colors.surfaceAlt, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
          >
            <Flame size={18} color={lit ? colors.flame : colors.textFaint} core={lit ? undefined : colors.surfaceAlt} />
            <T variant="body" color={lit ? colors.flameText : colors.textMuted} style={{ fontWeight: '800', fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] }}>
              {streak.days}
            </T>
          </Pressable>
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            hitSlop={6}
            style={({ pressed }) => [styles.avatar, { borderColor: isDark ? 'transparent' : colors.surface, boxShadow: isDark ? undefined : '0px 1px 4px rgba(27,31,51,0.12)', transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          >
            <Avatar size={40} />
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <T variant="small" style={{ fontSize: 14, lineHeight: 20 }}>
          {date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
        </T>
        <T variant="title" style={{ fontSize: 34, lineHeight: 40 }}>
          {date.toLocaleDateString([], { weekday: 'long' })}
        </T>
        <T variant="muted" style={{ fontSize: 17, lineHeight: 24 }}>
          {date.toLocaleDateString([], { day: 'numeric', month: 'long' })}
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
        <Mascot size={90} mood={plan.allDone ? 'cheer' : 'happy'} bounce />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="body" style={{ fontSize: 18, lineHeight: 26, fontWeight: '700' }}>
            {say.jp}
          </T>
          <T variant="small">{say.en}</T>
        </View>
      </Pressable>

      {plan.steps.length > 0 && (
        <View>
          <View style={styles.listHead}>
            <T variant="body" style={{ fontSize: 15, lineHeight: 22, fontWeight: '800' }}>
              今日{' '}
              <T variant="muted" style={{ fontSize: 15, lineHeight: 22 }}>
                Today
              </T>
            </T>
            <T variant="small" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {plan.allDone ? 'All done' : `${plan.doneCount} of ${plan.steps.length}`}
            </T>
          </View>
          <View style={{ paddingBottom: 10 }}>
            <StepSegments steps={plan.steps} />
          </View>
          <View style={{ marginHorizontal: -spacing.md }}>
            {plan.steps.map((s) => (
              <StepRow key={s.key} step={s} isNext={plan.next?.key === s.key} onPress={() => today.goTo(s.id)} />
            ))}
          </View>
        </View>
      )}

      {settings.studyKana && <KanaCourseCard whileLearning />}

      <View style={{ flex: 1 }} />
      <View style={{ paddingBottom: spacing.sm }}>
        <TimerChips showAdd={false} />
      </View>
      <DayDoneCelebration loaded={today.loaded} allDone={plan.allDone} streak={streak.days} />
    </ScrollView>
  );
}

const SHADOW = '0px 1px 2px rgba(27,31,51,0.06), 0px 2px 8px rgba(27,31,51,0.05)';

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: spacing.lg, gap: 22 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36, paddingLeft: 5, borderRadius: 999 },
  levelBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  topStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: spacing.md, borderRadius: 999 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  frog: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
});
