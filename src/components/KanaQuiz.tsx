import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { requeueMissed, type KanaAnswer, type KanaQuestion } from '../kana/practice';
import { playSound } from '../sound/sounds';
import { useApp } from '../state/AppProvider';
import { radius, spacing } from '../theme/colors';
import { Pill, ProgressBar, T } from './ui';

/** How long feedback shows before moving on (longer after a miss, to take in the right one). */
const NEXT_MS = { right: 550, wrong: 1400 };
/** Read in the tap handler, not during render. */
const clock = () => Date.now();

/**
 * Multiple-choice kana practice: see a kana and pick its romaji, or the reverse. A miss shows
 * the right answer and comes back a few questions later. Calls onDone with every answer.
 */
export function KanaQuiz({ questions, onDone }: { questions: KanaQuestion[]; onDone: (answers: KanaAnswer[]) => void }) {
  const { colors } = useApp();
  const [queue, setQueue] = useState(questions);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const answers = useRef<KanaAnswer[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const q = queue[index];
  if (!q) return null;

  const choose = (choice: string) => {
    if (picked != null) return;
    const correct = choice === q.answer;
    setPicked(choice);
    answers.current.push({ kana: q.kana, correct, retry: !!q.retry, at: clock() });
    Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    playSound(correct ? 'correct' : 'wrong');
    const next = correct ? queue : requeueMissed(queue, index);
    timer.current = setTimeout(
      () => {
        setPicked(null);
        if (index + 1 >= next.length) {
          onDone(answers.current);
          return;
        }
        setQueue(next);
        setIndex(index + 1);
      },
      correct ? NEXT_MS.right : NEXT_MS.wrong,
    );
  };

  const reading = q.direction === 'read';
  return (
    <View style={{ gap: spacing.lg, flex: 1 }}>
      <ProgressBar value={index / queue.length} height={14} color={colors.correct} />
      <View style={styles.prompt}>
        <T variant="muted" style={{ textAlign: 'center', fontWeight: '700' }}>
          {reading ? 'How do you read this?' : `Which ${q.script} is “${q.prompt}”?`}
        </T>
        <T jp={reading} style={{ fontSize: reading ? 120 : 64, lineHeight: reading ? 144 : 80, fontWeight: '800' }}>
          {q.prompt}
        </T>
        {q.retry && <Pill label="Again" tone="gold" />}
      </View>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {q.choices.map((c) => {
          const isAnswer = picked != null && c === q.answer;
          const isWrongPick = picked === c && c !== q.answer;
          const face = isAnswer
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
                styles.choice,
                {
                  backgroundColor: face.bg,
                  borderColor: face.ring,
                  borderBottomColor: face.lip,
                  borderWidth: isAnswer || isWrongPick ? 2.5 : 2,
                  borderBottomWidth: 5,
                  transform: [{ translateY: pressed && picked == null ? 2 : 0 }],
                },
              ]}
            >
              <T jp={!reading} color={face.fg} style={{ fontSize: reading ? 22 : 36, lineHeight: reading ? 30 : 46, fontWeight: '700' }}>
                {c}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 200 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  choice: { flexBasis: '45%', flexGrow: 1, minHeight: 68, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
});
