import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LessonContent } from '@/components/LessonContent';
import { ReviewSession } from '@/components/ReviewSession';
import { Celebration } from '@/components/Celebration';
import { Button, ProgressBar, T } from '@/components/ui';
import { curriculum, getPoint } from '@/content/loader';
import type { GrammarPoint } from '@/content/types';
import { addLearnedCards } from '@/db/repo';
import { lessonsLearnedToday, nextLessonBatch } from '@/srs/lessons';
import { newCard } from '@/srs/scheduler';
import { useApp } from '@/state/AppProvider';
import { useAutoTrack } from '@/time/useAutoTrack';
import { spacing, TAP } from '@/theme/colors';

/**
 * Lesson flow: read each point in the batch, then a short quiz. The quiz is a
 * restricted review session, so first answers feed straight into FSRS.
 * `?id=` teaches one specific point (from "Learn now" on the grammar screen).
 */
export default function Lessons() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, cards, settings, refresh } = useApp();

  // Freeze the batch when the screen opens so it doesn't shift as cards are created.
  const [batch] = useState<GrammarPoint[]>(() => {
      const learned = new Set(cards.map((c) => c.grammar_id));
      if (id) {
        const p = getPoint(id);
        return p && !learned.has(p.id) ? [p] : [];
      }
      return nextLessonBatch(curriculum, learned, lessonsLearnedToday(cards.map((c) => c.learned_at), Date.now()), {
        batchSize: settings.batchSize,
        dailyLimit: settings.dailyLessonLimit,
      });
  });

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<'learn' | 'quiz'>('learn');
  useAutoTrack(step === 'learn');
  const scroll = useRef<ScrollView>(null);

  const close = () => {
    if (step === 'learn' && batch.length > 0) {
      Alert.alert('Leave lessons?', 'These grammar points will stay unlearned.', [
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

  const startQuiz = async () => {
    const now = Date.now();
    await addLearnedCards(
      db,
      batch.map((p) => newCard(p.id, p.level, now)),
    );
    await refresh();
    setStep('quiz');
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: colors.border }]}>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close lessons" hitSlop={8} style={styles.close}>
        <Ionicons name="close" size={30} color={colors.textMuted} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <ProgressBar value={step === 'quiz' ? 1 : batch.length ? (index + 1) / batch.length : 0} height={16} color={colors.accent} />
        <T variant="small" style={{ fontWeight: '900' }}>
          {step === 'quiz' ? 'QUIZ TIME' : batch.length ? `LESSON ${index + 1} OF ${batch.length}` : 'LESSONS'}
        </T>
      </View>
    </View>
  );

  if (batch.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Celebration title="No lessons right now" subtitle="Today’s lesson limit is reached, or everything is learned. Reviews keep your streak going!" mood="sleep">
          <Button label="Back" onPress={() => router.back()} />
        </Celebration>
      </View>
    );
  }

  if (step === 'quiz') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <ReviewSession
          onlyIds={batch.map((p) => p.id)}
          bottomInset={insets.bottom}
          emptyState={(_next, summary) => (
            <Celebration
              title="Lesson complete!"
              subtitle={`${batch.length} new ${batch.length === 1 ? 'station' : 'stations'} on your line. They’re in your review schedule now.`}
              confetti
              stats={[
                { label: 'Learned', value: String(batch.length), tone: 'accent' },
                { label: 'Accuracy', value: summary.reviewed ? `${Math.round((summary.correct / summary.reviewed) * 100)}%` : '—', tone: 'green' },
              ]}
            >
              <Button label="Continue" kind="success" onPress={() => router.back()} />
            </Celebration>
          )}
        />
      </View>
    );
  }

  const point = batch[index];
  const last = index === batch.length - 1;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <ScrollView ref={scroll} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <LessonContent point={point} />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border }]}>
        <Button label="Back" kind="ghost" onPress={() => go(index - 1)} disabled={index === 0} style={{ flex: 1 }} />
        <Button label={last ? 'Start quiz' : 'Next'} onPress={last ? startQuiz : () => go(index + 1)} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingRight: spacing.lg,
    paddingBottom: spacing.sm,
  },
  close: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 2 },
});
