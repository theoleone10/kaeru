import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { markKnown } from '../db/repo';
import {
  answer,
  describeStart,
  DONT_KNOW,
  isCorrect,
  isDone,
  nextQuestion,
  placementUnits,
  result,
  startPlacement,
  type Experience,
  type Placement,
  type PlacementQuestion,
  type PlacementState,
} from '../placement/placement';
import { useApp } from '../state/AppProvider';
import { radius, spacing, TAP } from '../theme/colors';
import { ClozeSentence } from './Furigana';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { Choice, ChoiceList, Heading } from './SetupChoice';
import { Button, ProgressBar, T } from './ui';

export type Level = 'new' | Experience;

const LEVEL_CHOICES: { value: Level; title: string; detail: string }[] = [
  { value: 'new', title: 'Brand new', detail: 'Start with kana and the first station of N5' },
  { value: 'some', title: 'I know some', detail: 'An optional quiz can find your station' },
  { value: 'lots', title: 'I’ve studied a while', detail: 'An optional quiz can find your station' },
];

/** How long the right answer shows before the next question. */
const FEEDBACK_MS = 700;

/**
 * "Find your place on the line": how much Japanese you know, then (unless brand new) an optional
 * placement quiz, then where you'll start. Everything before that station is marked as known.
 * Calls onFinish once the learner has a starting point (or keeps the beginning).
 *
 * Give it the whole screen below any header: it scrolls its own pages, and the quiz is laid
 * out like a review (one progress bar at the top, the choices in a tray along the bottom).
 * `onQuizChange` says when the quiz is showing, so a host can hide its own progress bar.
 */
export function PlacementFlow({
  onFinish,
  onLevel,
  onQuizChange,
  bottomInset = 0,
}: {
  onFinish: () => void;
  onLevel?: (level: Level) => void;
  onQuizChange?: (quizzing: boolean) => void;
  bottomInset?: number;
}) {
  const db = useSQLiteContext();
  const { colors, lines, refresh } = useApp();
  const units = useMemo(() => placementUnits(), []);
  const [level, setLevel] = useState<Level | null>(null);
  const [state, setState] = useState<PlacementState | null>(null);
  const [question, setQuestion] = useState<PlacementQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placement | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quizzing = !!(state && question);
  useEffect(() => {
    onQuizChange?.(quizzing);
  }, [quizzing, onQuizChange]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const page = (children: React.ReactNode) => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.page, { paddingBottom: bottomInset + spacing.xl }]}>
      {children}
    </ScrollView>
  );

  const begin = () => {
    if (!level) return;
    if (level === 'new') {
      onFinish();
      return;
    }
    const s = startPlacement(units, level);
    setState(s);
    setQuestion(nextQuestion(s, units));
  };

  const choose = (choice: string) => {
    if (!state || !question || picked != null) return;
    setPicked(choice);
    Haptics.notificationAsync(isCorrect(question, choice) ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    const next = answer(state, question, choice);
    timer.current = setTimeout(() => {
      setPicked(null);
      setState(next);
      if (isDone(next)) {
        setQuestion(null);
        setPlaced(result(next, units));
      } else {
        setQuestion(nextQuestion(next, units));
      }
    }, FEEDBACK_MS);
  };

  const accept = async () => {
    if (!placed) return;
    setSaving(true);
    try {
      await markKnown(db, placed.known);
      await refresh();
      onFinish();
    } catch (e) {
      Alert.alert('Could not save your place', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    if (timer.current) clearTimeout(timer.current);
    setState(null);
    setQuestion(null);
    setPicked(null);
    setPlaced(null);
  };

  if (placed) {
    const start = describeStart(placed, units);
    return page(
      <View style={{ gap: spacing.xl }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Mascot size={96} mood="cheer" bounce />
          <T variant="small" style={{ fontWeight: '700' }}>
            Your station
          </T>
          {start.station && (
            <View style={[styles.sign, { backgroundColor: colors.surface, borderColor: colors.accent, borderBottomColor: colors.accentShadow }]}>
              <T variant="title" color={colors.accentInk}>
                {start.station}
              </T>
            </View>
          )}
          <T variant="title" style={{ textAlign: 'center' }}>
            {start.station ? `You’ll start at ${start.title}` : start.title}
          </T>
          <T variant="muted" style={{ textAlign: 'center' }}>
            {placed.known.length > 0
              ? `${placed.known.length} grammar points before it will be marked as known. They won’t come up in lessons, and you can still open them on the Grammar tab.`
              : 'Starting from the very first station is the right call. You’ll be through the first unit in no time.'}
          </T>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Button label={placed.known.length > 0 ? 'Start here' : 'Continue'} onPress={accept} loading={saving} />
          {placed.known.length > 0 && <Button label="Start from the beginning instead" kind="ghost" onPress={onFinish} disabled={saving} />}
          <Button label="Take the quiz again" kind="ghost" onPress={restart} disabled={saving} />
        </View>
      </View>,
    );
  }

  if (state && question) {
    const correct = picked != null && isCorrect(question, picked);
    const wrongPick = picked != null && !correct && picked !== DONT_KNOW;
    // Roughly: a decided unit narrows the search by half.
    const progress = Math.min(0.95, state.questions / (2 * Math.ceil(Math.log2(units.length + 1))));
    const line = lines[question.point.level] ?? lines.N5;
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <Pressable onPress={restart} accessibilityRole="button" accessibilityLabel="Leave the quiz" hitSlop={8} style={styles.close}>
            <Icon name="close" size={22} color={colors.textFaint} strokeWidth={2.4} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <ProgressBar value={progress} height={14} color={colors.accent} />
          </View>
          <View style={{ width: 20 }} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.levelChip, { backgroundColor: line.soft }]}>
              <T variant="small" color={line.ink} style={{ fontSize: 12, lineHeight: 16, fontWeight: '800' }} jp={false}>
                {question.point.level}
              </T>
            </View>
            <T variant="small" style={{ fontSize: 14, lineHeight: 20 }}>
              Question {state.questions + 1} · Fill the blank
            </T>
          </View>
          <View style={{ gap: 14, paddingTop: spacing.sm }}>
            <ClozeSentence example={question.example} state={picked == null ? 'empty' : correct ? 'correct' : 'revealed'} size={30} />
            <T variant="body" color={colors.textMuted}>
              {question.example.english}
            </T>
          </View>
        </ScrollView>
        {/* The choices sit in a tray along the bottom, so a sentence that wraps doesn't move them. */}
        <View
          style={[
            styles.dock,
            {
              backgroundColor: correct ? colors.correctSoft : wrongPick ? colors.wrongSoft : colors.bar,
              borderColor: correct || wrongPick ? 'transparent' : colors.border,
              paddingBottom: spacing.md + bottomInset,
            },
          ]}
        >
          <View style={styles.perch} pointerEvents="none">
            <Mascot size={56} mood={picked == null ? 'think' : correct ? 'cheer' : 'sad'} />
          </View>
          <View style={styles.grid}>
            {question.choices.map((c) => {
              const isRight = picked != null && question.example.accepted_answers.includes(c);
              const isWrongPick = picked === c && !isRight;
              const face = isRight
                ? { bg: colors.correctSoft, ring: colors.correct, lip: colors.correctShadow, fg: colors.correctText }
                : isWrongPick
                  ? { bg: colors.wrongSoft, ring: colors.wrong, lip: colors.wrongShadow, fg: colors.wrongText }
                  : { bg: colors.surface, ring: colors.border, lip: colors.borderStrong, fg: colors.text };
              return (
                <Pressable
                  key={c}
                  onPress={() => choose(c)}
                  accessibilityRole="button"
                  accessibilityLabel={c}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: face.bg,
                      borderColor: face.ring,
                      borderBottomColor: face.lip,
                      borderWidth: isRight || isWrongPick ? 2.5 : 2,
                      borderBottomWidth: 5,
                      transform: [{ translateY: pressed && picked == null ? 2 : 0 }],
                    },
                  ]}
                >
                  <T variant="jp" color={face.fg} style={{ fontSize: 22, lineHeight: 30 }}>
                    {c}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <Button label="I don’t know" kind="ghost" onPress={() => choose(DONT_KNOW)} disabled={picked != null} />
          <T variant="small" color={colors.textFaint} style={{ textAlign: 'center', fontSize: 13, lineHeight: 18 }}>
            Not sure? Say so: a guess can place you too far along.
          </T>
        </View>
      </View>
    );
  }

  return page(
    <View style={{ gap: 26 }}>
      <Heading title="How much Japanese do you know?" body="Grammar is laid out like train lines, N5 to N1. Let’s find the station you should start at." />
      <ChoiceList>
        {LEVEL_CHOICES.map((c) => (
          <Choice
            key={c.value}
            title={c.title}
            detail={c.detail}
            selected={level === c.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              setLevel(c.value);
              onLevel?.(c.value);
            }}
          />
        ))}
      </ChoiceList>
      {level == null || level === 'new' ? (
        <Button label="Continue" onPress={begin} disabled={level == null} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Button label="Take the quiz (2 min)" onPress={begin} />
          <Button label="Skip the quiz" kind="ghost" onPress={onFinish} />
          <T variant="small" style={{ textAlign: 'center' }}>
            You can take it later from your profile, or mark units as known on the Grammar tab.
          </T>
        </View>
      )}
    </View>,
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 20, paddingTop: spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.sm, paddingTop: spacing.xs },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  levelChip: { height: 24, paddingHorizontal: 9, borderRadius: 999, justifyContent: 'center' },
  // Bottom padding leaves room for the frog perched on the tray.
  body: { flexGrow: 1, paddingHorizontal: 20, paddingTop: spacing.lg, paddingBottom: 56, gap: 22 },
  dock: { paddingHorizontal: 16, paddingTop: 18, gap: 4, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: StyleSheet.hairlineWidth * 2, borderBottomWidth: 0 },
  perch: { position: 'absolute', right: 22, top: -46 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 6 },
  option: { flexBasis: '45%', flexGrow: 1, minHeight: TAP + 8, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  sign: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 3, borderBottomWidth: 6 },
});
