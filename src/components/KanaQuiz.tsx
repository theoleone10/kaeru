import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { requeueMissed, type KanaAnswer, type KanaQuestion } from '../kana/practice';
import { playSound } from '../sound/sounds';
import { useApp } from '../state/AppProvider';
import { radius, spacing } from '../theme/colors';
import { ProgressBar, T } from './ui';

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
    <View style={{ gap: spacing.xl, flex: 1 }}>
      <ProgressBar value={index / queue.length} />
      <T variant="small" style={{ textAlign: 'center', fontWeight: '800' }}>
        {reading ? 'How do you read this?' : `Which ${q.script} is “${q.prompt}”?`}
      </T>
      <View style={[styles.prompt, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <T jp={reading} style={{ fontSize: reading ? 88 : 56, lineHeight: reading ? 110 : 70, fontWeight: '800' }}>
          {q.prompt}
        </T>
        {q.retry && <T variant="small">Again</T>}
      </View>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {q.choices.map((c) => {
          const isAnswer = picked != null && c === q.answer;
          const isWrongPick = picked === c && c !== q.answer;
          return (
            <Pressable
              key={c}
              onPress={() => choose(c)}
              accessibilityRole="button"
              accessibilityLabel={c}
              style={({ pressed }) => [
                styles.choice,
                {
                  backgroundColor: isAnswer ? colors.correctSoft : isWrongPick ? colors.wrongSoft : colors.surface,
                  borderColor: isAnswer ? colors.correct : isWrongPick ? colors.wrong : colors.border,
                  borderBottomColor: isAnswer ? colors.correctShadow : isWrongPick ? colors.wrongShadow : colors.borderStrong,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <T jp={!reading} style={{ fontSize: reading ? 26 : 40, lineHeight: reading ? 32 : 52, fontWeight: '800' }}>
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
  prompt: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, borderRadius: radius.lg, borderWidth: 1, minHeight: 170 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  choice: { flexBasis: '47%', flexGrow: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 4 },
});
