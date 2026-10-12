import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { Step, StepId } from '../daily/plan';
import { useToday } from '../daily/useToday';
import { useDayMilestones } from '../sound/useMilestoneSounds';
import { useApp } from '../state/AppProvider';
import type { Palette } from '../theme/colors';
import { spacing } from '../theme/colors';
import { Button, T } from './ui';

type IconName = keyof typeof Ionicons.glyphMap;

/** Each part of the day has its own icon and colour, used everywhere it appears. */
export function stepMeta(colors: Palette, id: StepId): { icon: IconName; color: string; soft: string } {
  switch (id) {
    case 'learn':
      return { icon: 'school', color: colors.accent, soft: colors.accentSoft };
    case 'review':
      return { icon: 'refresh', color: colors.correct, soft: colors.correctSoft };
    case 'cards':
      return { icon: 'albums', color: colors.blue, soft: colors.blueSoft };
    case 'time':
      return { icon: 'timer', color: colors.gold, soft: colors.goldSoft };
  }
}

/** Round step badge: a progress ring around the step's icon, a check when done. */
export function StepBadge({ step, size = 44 }: { step: Step; size?: number }) {
  const { colors } = useApp();
  const m = stepMeta(colors, step.id);
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill={step.done ? m.color : m.soft} stroke={step.done ? m.color : colors.border} strokeWidth={4} />
        {!step.done && step.progress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={m.color}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${c * step.progress} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <Ionicons name={step.done ? 'checkmark' : m.icon} size={size * 0.45} color={step.done ? '#FFFFFF' : m.color} />
    </View>
  );
}

/** The day's steps as a checklist; the next one is highlighted. */
export function StepList({ steps, next, onOpen }: { steps: Step[]; next: Step | null; onOpen: (id: StepId) => void }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: spacing.sm }}>
      {steps.map((s) => {
        const isNext = next?.id === s.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => onOpen(s.id)}
            accessibilityRole="button"
            accessibilityLabel={`${s.title}. ${s.detail}. ${s.done ? 'Done' : isNext ? 'Up next' : 'To do'}`}
            style={({ pressed }) => [
              styles.row,
              { borderColor: isNext ? stepMeta(colors, s.id).color : 'transparent', backgroundColor: isNext ? colors.surface : 'transparent', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <StepBadge step={s} />
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
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * End-of-session actions: carry on with the next part of today's plan (anything but
 * the part just finished), or head back to Today.
 */
export function NextUp({ from }: { from: StepId }) {
  const { colors } = useApp();
  const { plan, goTo, loaded, streak } = useToday();
  useDayMilestones({ loaded, allDone: plan.allDone, streak: streak.days, studiedToday: streak.studiedToday });
  if (!loaded) return null;
  const next = plan.steps.find((s) => !s.done && s.id !== from) ?? null;
  const left = plan.steps.filter((s) => !s.done && s.id !== from).length;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.dots} accessibilityLabel={`${plan.doneCount} of ${plan.steps.length} parts of today done`}>
        {plan.steps.map((s) => (
          <StepBadge key={s.id} step={s} size={36} />
        ))}
      </View>
      {next ? (
        <>
          <T variant="small" style={{ textAlign: 'center' }}>
            {left === 1 ? 'One more thing today' : `${left} more things today`}
          </T>
          <Button
            label={`Next: ${next.title}`}
            icon={<Ionicons name={stepMeta(colors, next.id).icon} size={20} color="#FFFFFF" />}
            onPress={() => goTo(next.id, 'replace')}
          />
          <Button label="Back to Today" kind="ghost" onPress={() => router.dismissTo('/')} />
        </>
      ) : (
        <Button label="Back to Today" onPress={() => router.dismissTo('/')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 18, borderWidth: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
});
