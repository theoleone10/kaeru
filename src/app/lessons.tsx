import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { LessonContent } from '@/components/LessonContent';
import { ReviewSession } from '@/components/ReviewSession';
import { SentenceWriter } from '@/components/SentenceWriter';
import { Celebration } from '@/components/Celebration';
import { NextUp } from '@/components/DayPlan';
import { StreakExtended } from '@/components/StreakExtended';
import { Button, ProgressBar, T } from '@/components/ui';
import { curriculum, getPoint } from '@/content/loader';
import type { GrammarPoint } from '@/content/types';
import { useToday } from '@/daily/useToday';
import { saveQuizResults } from '@/db/repo';
import { lessonsLearnedToday, nextLessonBatch } from '@/srs/lessons';
import { buildQuiz, cardsFromQuiz, type QuizAnswer, type QuizItem } from '@/srs/quiz';
import { sentencePracticeOn } from '@/sentence/grader';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

/**
 * Today's lesson: read each new point (1–2 a day by default), then a short quiz of a
 * few sentences per point. When the quiz is over the points go into the SRS, scheduled
 * by how the quiz went. `?id=` teaches one specific point (from the grammar screen);
 * `?extra=1` teaches one more point after the daily goal is met.
 */
export default function Lessons() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id, extra } = useLocalSearchParams<{ id?: string; extra?: string }>();
  const { colors, cards, settings, refresh } = useApp();
  const { streak } = useToday();

  // Freeze the batch when the screen opens so it doesn't shift as cards are created.
  const [batch] = useState<GrammarPoint[]>(() => {
      const learned = new Set(cards.map((c) => c.grammar_id));
      if (id) {
        const p = getPoint(id);
        return p && !learned.has(p.id) ? [p] : [];
      }
      if (extra) return curriculum.filter((p) => !learned.has(p.id)).slice(0, 1);
      return nextLessonBatch(curriculum, learned, lessonsLearnedToday(cards.map((c) => c.learned_at), Date.now()), settings.dailyNewGrammar);
  });

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<'learn' | 'quiz' | 'sentence'>('learn');
  /** Which point the sentence step is on; past the end means the sentences are over. */
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [quizItems, setQuizItems] = useState<QuizItem[]>([]);
  const [passed, setPassed] = useState<Map<string, boolean> | null>(null);
  /** Whether today already counted for the streak when the quiz ended. */
  const [metBefore, setMetBefore] = useState<boolean | null>(null);
  const scroll = useRef<ScrollView>(null);

  const close = () => {
    if (batch.length > 0 && !passed) {
      Alert.alert(step === 'quiz' ? 'Leave the quiz?' : 'Leave the lesson?', 'These grammar points won’t be added to your reviews until you finish the quiz.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const go = (i: number) => {
    setIndex(i);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const startQuiz = () => {
    setQuizItems(buildQuiz(batch));
    setStep('quiz');
  };

  const finishQuiz = async (answers: QuizAnswer[]) => {
    setMetBefore(streak.goalMetToday);
    const seeds = cardsFromQuiz(batch, answers, Date.now());
    await saveQuizResults(db, seeds, answers);
    setPassed(new Map(seeds.map((s) => [s.card.grammar_id, s.passed])));
    await refresh();
    // The quiz is saved, so leaving during the sentence step loses nothing.
    if (sentencePracticeOn(settings)) setStep('sentence');
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close lessons" hitSlop={8} style={styles.close}>
        <Icon name="close" size={22} color={colors.textFaint} strokeWidth={2.4} />
      </Pressable>
      {/* The quiz shows its own progress bar, so only the lessons get this one. */}
      {step === 'learn' && batch.length > 0 ? (
        <>
          <View style={{ flex: 1 }} accessibilityLabel={`Lesson ${index + 1} of ${batch.length}`}>
            <ProgressBar value={(index + 1) / batch.length} height={14} color={colors.accent} />
          </View>
          <T variant="small" style={{ fontWeight: '700' }} jp={false}>
            {`${index + 1} of ${batch.length}`}
          </T>
        </>
      ) : (
        <T variant="small" style={{ flex: 1, fontWeight: '700' }} jp={false}>
          {step === 'quiz' ? 'Quiz' : 'Lessons'}
        </T>
      )}
    </View>
  );

  if (batch.length === 0) {
    const anyLeft = curriculum.some((p) => !cards.some((c) => c.grammar_id === p.id));
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Celebration
          title={anyLeft ? 'Today’s grammar is learned' : 'Every point learned!'}
          subtitle={anyLeft ? 'A little every day sticks best. Tomorrow brings the next stations, and reviews keep today’s fresh.' : 'You’ve finished the whole curriculum. Reviews keep it all fresh.'}
          mood="cheer"
        >
          <NextUp from="learn" />
          {anyLeft && <Button label="Learn one more anyway" kind="ghost" onPress={() => router.replace({ pathname: '/lessons', params: { extra: '1' } })} />}
        </Celebration>
      </View>
    );
  }

  if (step === 'quiz' || step === 'sentence') {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
        <ReviewSession
          onClose={close}
          closeLabel="Close lessons"
          quiz={{ items: quizItems, onComplete: finishQuiz }}
          bottomInset={insets.bottom}
          emptyState={(_next, summary) => {
            const shaky = batch.filter((p) => passed?.get(p.id) === false);
            return (
              <Celebration
                title="Lesson complete!"
                subtitle={
                  shaky.length === 0
                    ? `${batch.map((p) => p.title).join(' and ')} ${batch.length === 1 ? 'is' : 'are'} in your reviews now. First review in a couple of days.`
                    : `Added to your reviews. ${shaky.map((p) => p.title).join(' and ')} needs another look, so it comes up first in tomorrow’s reviews.`
                }
                confetti={shaky.length === 0}
                sound="lesson"
                stats={[
                  { label: 'Learned', value: String(batch.length), tone: 'accent' },
                  { label: 'Quiz', value: summary.reviewed ? `${summary.correct}/${summary.reviewed}` : '—', tone: 'green' },
                ]}
              >
                {metBefore === false && streak.goalMetToday && <StreakExtended days={streak.days} />}
                <NextUp from="learn" />
              </Celebration>
            );
          }}
        />
        {step === 'sentence' && sentenceIndex < batch.length && (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close lessons" hitSlop={8} style={styles.close}>
            <Icon name="close" size={22} color={colors.textFaint} strokeWidth={2.4} />
          </Pressable>
          <T variant="small" style={{ flex: 1, fontWeight: '700' }} jp={false}>
            {`Sentence ${sentenceIndex + 1} of ${batch.length}`}
          </T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
          <SentenceWriter key={batch[sentenceIndex].id} point={batch[sentenceIndex]} source="lesson" onDone={() => setSentenceIndex((i) => i + 1)} />
        </ScrollView>
      </View>
        )}
      </View>
    );
  }

  const point = batch[index];
  const last = index === batch.length - 1;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: spacing.lg, paddingBottom: spacing.xxl }}>
        <LessonContent point={point} kicker="new" />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Button label="Back" kind="ghost" onPress={() => go(index - 1)} disabled={index === 0} style={{ flex: 1 }} />
        <Button label={last ? 'Take the quiz' : 'Next'} onPress={last ? startQuiz : () => go(index + 1)} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.sm,
    paddingRight: 20,
    paddingBottom: spacing.sm,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth * 2 },
});
