import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Step, StepId } from '../daily/plan';
import { useToday } from '../daily/useToday';
import { useDayMilestones } from '../sound/useMilestoneSounds';
import { useApp } from '../state/AppProvider';
import { DayDoneCelebration } from './DayDoneCelebration';
import type { Palette } from '../theme/colors';
import { spacing } from '../theme/colors';
import { Icon, type IconName } from './Icon';
import { Button, IconTile, T } from './ui';

/** Each part of the day has its own icon and colour, used everywhere it appears. */
export function stepMeta(colors: Palette, id: StepId): { icon: IconName; color: string; soft: string; lip: string; ink: string } {
  switch (id) {
    case 'learn':
      return { icon: 'learn', color: colors.accent, soft: colors.accentSoft, lip: colors.accentShadow, ink: colors.accentInk };
    case 'review':
      return { icon: 'review', color: colors.correct, soft: colors.correctSoft, lip: colors.correctShadow, ink: colors.correctText };
    case 'cards':
      return { icon: 'cards', color: colors.blue, soft: colors.blueSoft, lip: colors.blueShadow, ink: colors.blueText };
    case 'time':
      return { icon: 'timer', color: colors.gold, soft: colors.goldSoft, lip: colors.goldShadow, ink: colors.notice };
  }
}

/**
 * A step's icon tile: green with a check when done, the step's colour with a lip when it's up
 * next (`next`), otherwise a soft tint of it.
 */
export function StepBadge({ step, size = 42, next = false }: { step: Step; size?: number; next?: boolean }) {
  const { colors } = useApp();
  const m = stepMeta(colors, step.id);
  if (step.done) return <IconTile icon={m.icon} color={colors.correct} size={size} done />;
  if (next) return <IconTile icon={m.icon} color={m.color} lip={m.lip} size={size} />;
  return <IconTile icon={m.icon} color={m.ink} soft={m.soft} size={size} filled={false} />;
}

/** The day's progress as a bar with one segment per step. */
export function StepSegments({ steps }: { steps: Step[] }) {
  const { colors } = useApp();
  return (
    <View style={styles.segments}>
      {steps.map((s) => (
        <View key={s.key} style={[styles.segment, { backgroundColor: s.done ? colors.correct : colors.border }]} />
      ))}
    </View>
  );
}

/** One row of the day's checklist: tile, title and detail; done rows fade, the next one gets a pill. */
export function StepRow({ step, isNext, onPress }: { step: Step; isNext: boolean; onPress: () => void }) {
  const { colors, isDark } = useApp();
  const m = stepMeta(colors, step.id);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${step.title}. ${step.detail}. ${step.done ? 'Done' : isNext ? 'Up next' : 'To do'}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
    >
      <StepBadge step={step} next={isNext} />
      <View style={{ flex: 1 }}>
        <T variant="body" color={step.done ? colors.textFaint : colors.text} style={{ fontWeight: isNext ? '800' : '700' }} numberOfLines={1}>
          {step.title}
        </T>
        {step.detail ? (
          <T variant="small" color={step.done ? colors.textFaint : colors.textMuted} numberOfLines={1}>
            {step.detail}
          </T>
        ) : null}
      </View>
      {isNext ? (
        <View style={[styles.nextPill, { backgroundColor: m.color }]}>
          <T variant="small" color={isDark ? colors.background : '#FFFFFF'} style={{ fontSize: 12, lineHeight: 16, fontWeight: '800' }}>
            Next
          </T>
        </View>
      ) : !step.done ? (
        <Icon name="chevronRight" size={18} color={colors.textFaint} strokeWidth={2.4} />
      ) : null}
    </Pressable>
  );
}

/** The day's steps as a checklist; the next one is highlighted. */
export function StepList({ steps, next, onOpen }: { steps: Step[]; next: Step | null; onOpen: (id: StepId) => void }) {
  return (
    <View style={{ marginHorizontal: -spacing.md }}>
      {steps.map((s) => (
        <StepRow key={s.key} step={s} isNext={next?.key === s.key} onPress={() => onOpen(s.id)} />
      ))}
    </View>
  );
}

/**
 * End-of-session actions: carry on with the next part of today's plan (anything but
 * the part just finished), or head back to Today.
 */
export function NextUp({ from }: { from: StepId }) {
  const { colors } = useApp();
  const { plan, goTo, loaded, streak, cardsDue } = useToday();
  useDayMilestones({ loaded, allDone: plan.allDone, streak: streak.days, goalMetToday: streak.goalMetToday });
  if (!loaded) return null;
  // Finishing one deck while another still has cards: carry on with flashcards first.
  const moreCards = from === 'cards' && plan.steps.some((s) => s.id === 'cards' && !s.done);
  const todo = plan.steps.filter((s) => !s.done && (s.id !== from || moreCards));
  // Today's steps first; a weekly goal comes up once they're done, as an optional extra.
  const next = (moreCards ? todo.find((s) => s.id === 'cards') : (todo.find((s) => !s.weekly) ?? todo[0])) ?? null;
  const left = todo.filter((s) => !s.weekly).length;
  const label = next?.id === 'cards' && moreCards ? `Next deck: ${cardsDue} ${cardsDue === 1 ? 'card' : 'cards'} left` : `Next: ${next?.title}`;
  return (
    <View style={{ gap: spacing.md }}>
      <DayDoneCelebration loaded={loaded} allDone={plan.allDone} streak={streak.days} />
      <View style={styles.dots} accessibilityLabel={`${plan.doneCount} of ${plan.steps.length} parts of today done`}>
        {plan.steps.map((s) => (
          <StepBadge key={s.key} step={s} size={40} />
        ))}
      </View>
      {next?.weekly && plan.allDone ? (
        <>
          <T variant="small" style={{ textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
            Done for today! Your weekly goal can wait, or keep going.
          </T>
          <Button label="Back to Today" onPress={() => router.dismissTo('/')} />
          <Button label={`Keep going: ${next.title}`} kind="ghost" onPress={() => goTo(next.id, 'replace')} />
        </>
      ) : next ? (
        <>
          <T variant="small" style={{ textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
            {left === 1 ? 'One more thing today' : `${left} more things today`}
          </T>
          <Button
            label={label}
            icon={<Icon name={stepMeta(colors, next.id).icon} size={20} color="#FFFFFF" filled cutout={colors.accent} />}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: 16 },
  nextPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
});
