import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
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
import { Mascot } from './Mascot';
import { Choice, Heading } from './SetupChoice';
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
 */
export function PlacementFlow({ onFinish, onLevel }: { onFinish: () => void; onLevel?: (level: Level) => void }) {
  const db = useSQLiteContext();
  const { colors, refresh } = useApp();
  const units = useMemo(() => placementUnits(), []);
  const [level, setLevel] = useState<Level | null>(null);
  const [state, setState] = useState<PlacementState | null>(null);
  const [question, setQuestion] = useState<PlacementQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placement | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return (
      <View style={{ gap: spacing.xl }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Mascot size={96} mood="cheer" bounce />
          <T variant="small" style={{ fontWeight: '800' }}>
            YOUR STATION
          </T>
          {start.station && (
            <View style={[styles.sign, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
              <T variant="title" color={colors.accent}>
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
      </View>
    );
  }

  if (state && question) {
    const correct = picked != null && isCorrect(question, picked);
    // Roughly: a decided unit narrows the search by half.
    const progress = Math.min(0.95, state.questions / (2 * Math.ceil(Math.log2(units.length + 1))));
    return (
      <View style={{ gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <ProgressBar value={progress} />
          <T variant="small">{`Question ${state.questions + 1} · ${question.point.level}`}</T>
        </View>
        <Heading title="Fill the blank" body={question.example.english} />
        <View style={[styles.sentence, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ClozeSentence example={question.example} state={picked == null ? 'empty' : correct ? 'correct' : 'revealed'} />
        </View>
        <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
          {question.choices.map((c) => {
            const isRight = picked != null && question.example.accepted_answers.includes(c);
            const isWrongPick = picked === c && !isRight;
            return (
              <Pressable
                key={c}
                onPress={() => choose(c)}
                accessibilityRole="button"
                style={[
                  styles.option,
                  {
                    backgroundColor: isRight ? colors.correctSoft : isWrongPick ? colors.wrongSoft : colors.surface,
                    borderColor: isRight ? colors.correct : isWrongPick ? colors.wrong : colors.border,
                  },
                ]}
              >
                <T variant="heading" jp>
                  {c}
                </T>
              </Pressable>
            );
          })}
          <Button label="I don’t know" kind="ghost" onPress={() => choose(DONT_KNOW)} disabled={picked != null} />
        </View>
        <T variant="small" style={{ textAlign: 'center' }}>
          Not sure? Say so: guessing puts you further along than you are.
        </T>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xl }}>
      <Heading title="How much Japanese do you know?" body="Grammar is laid out like train lines, N5 to N1. Let’s find the station you should start at." />
      <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
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
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  sentence: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center' },
  option: { minHeight: TAP + 8, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  sign: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 4 },
});
