import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Celebration } from '@/components/Celebration';
import { KanaQuiz } from '@/components/KanaQuiz';
import { Button, T } from '@/components/ui';
import { KANA_LESSONS } from '@/kana/data';
import { reviewPractice, scorePractice, type KanaAnswer, type KanaQuestion } from '@/kana/practice';
import { kanaStats, passedKanaLessons, recordKanaAnswers } from '@/kana/repo';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

/** Twenty questions across every kana learned, weakest first. */
export default function KanaReview() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors } = useApp();
  const [questions, setQuestions] = useState<KanaQuestion[] | null>(null);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState<{ asked: number; correct: number } | null>(null);

  const build = useCallback(async () => {
    const [passed, stats] = await Promise.all([passedKanaLessons(db), kanaStats(db)]);
    const learned = KANA_LESSONS.filter((l) => passed.has(l.id)).flatMap((l) => l.kana);
    setQuestions(learned.length ? reviewPractice(learned, stats) : []);
    setScore(null);
    setRound((r) => r + 1);
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      if (!questions) build();
    }, [questions, build]),
  );

  const finish = async (answers: KanaAnswer[]) => {
    setScore(scorePractice(answers));
    await recordKanaAnswers(db, answers).catch(() => undefined);
  };

  if (score) {
    const great = score.correct / Math.max(1, score.asked) >= 0.9;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: insets.bottom }}>
        <Celebration
          title={great ? 'Sharp eyes!' : 'Good practice'}
          subtitle="The kana you missed come up first next time."
          mood={great ? 'cheer' : 'happy'}
          confetti={great}
          sound="reviews"
          stats={[{ label: 'Right first time', value: `${score.correct}/${score.asked}`, tone: great ? 'green' : 'gold' }]}
        >
          <Button label="Another round" onPress={build} />
          <Button label="Done" kind="ghost" onPress={() => router.back()} />
        </Celebration>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
      {questions && questions.length === 0 && <T variant="muted">Pass a lesson first, then practise here.</T>}
      {questions && questions.length > 0 && <KanaQuiz key={round} questions={questions} onDone={finish} />}
    </View>
  );
}
