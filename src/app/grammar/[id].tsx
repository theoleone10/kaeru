import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LessonContent } from '@/components/LessonContent';
import { Mascot } from '@/components/Mascot';
import { Button, Section, T } from '@/components/ui';
import { getPoint } from '@/content/loader';
import { getPointStats, resetPoint, setSuspended, type PointStats } from '@/db/repo';
import { sentencePracticeOn } from '@/sentence/grader';
import { getSentenceStatus, type SentenceStatus } from '@/sentence/repo';
import { isMastered, retrievability, State } from '@/srs/scheduler';
import { useApp, useNow } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

const STATE_LABEL: Record<State, string> = { [State.New]: 'New', [State.Learning]: 'Learning', [State.Review]: 'Review', [State.Relearning]: 'Relearning' };

function formatDue(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'Due now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `In ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `In ${hours} h`;
  const d = new Date(ts);
  // The year only when it isn't this one, so the date fits its column.
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : null) });
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <T variant="heading" color={color} style={{ fontSize: 20, lineHeight: 26 }} numberOfLines={1}>
        {value}
      </T>
      <T variant="small" style={{ fontSize: 12, lineHeight: 16 }}>
        {label}
      </T>
    </View>
  );
}

export default function GrammarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { cardsById, refresh, colors, settings } = useApp();
  const [sentence, setSentence] = useState<SentenceStatus | null>(null);
  useFocusEffect(
    useCallback(() => {
      getSentenceStatus(db, id).then(setSentence);
    }, [db, id]),
  );
  const point = getPoint(id);
  const card = cardsById.get(id);
  const [stats, setStats] = useState<PointStats | null>(null);

  const now = useNow();

  // Re-read stats whenever this point's card changes (e.g. after a review or reset).
  useEffect(() => {
    getPointStats(db, id).then(setStats);
  }, [db, id, card]);

  if (!point) {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.md, alignItems: 'center' }}>
        <Mascot size={96} mood="sad" />
        <T variant="body">Grammar point “{id}” was not found.</T>
      </View>
    );
  }

  const addToReviews = async () => {
    await setSuspended(db, point.id, false);
    await refresh();
  };

  const reset = () =>
    Alert.alert('Reset this grammar point?', 'Its review history is deleted and it becomes a new lesson again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await resetPoint(db, point.id);
          await refresh();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: point.title }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}>
        <LessonContent
          point={point}
          afterHeader={
            <Section label={card ? 'Your progress' : undefined} style={{ gap: spacing.md }}>
              {card ? (
                <>
                  <View style={[styles.grid, { borderColor: colors.border }]}>
                    <Stat
                      label="Status"
                      value={isMastered(card) ? 'Mastered' : STATE_LABEL[card.state as State]}
                      color={isMastered(card) ? colors.notice : card.state === State.Review ? colors.correctText : undefined}
                    />
                    <Stat label="Next review" value={card.suspended ? (card.learned_at === 0 ? 'Skipped' : 'Suspended') : formatDue(card.due)} />
                    <Stat label="Reviews" value={String(stats?.reviews ?? 0)} />
                    <Stat label="Accuracy" value={stats && stats.reviews > 0 ? `${Math.round((stats.correct / stats.reviews) * 100)}%` : '—'} />
                    <Stat label="Recall now" value={card.last_review ? `${Math.round(retrievability(card, now) * 100)}%` : '—'} />
                    <Stat label="Stability" value={card.stability ? `${card.stability.toFixed(1)} days` : '—'} />
                  </View>
                  {card.suspended ? <Button label="Add to reviews" kind="secondary" onPress={addToReviews} /> : null}
                  {sentencePracticeOn(settings) && (
                    <View style={{ gap: spacing.sm }}>
                      <T variant="heading" style={{ fontSize: 18 }} jp={false}>
                        {sentence?.done ? 'Use it in a sentence ✓' : 'Use it in a sentence'}
                      </T>
                      {sentence?.done && sentence.best ? (
                        <T variant="body">{sentence.best.sentence}</T>
                      ) : (
                        <T variant="small" jp={false}>
                          {sentence?.lastAttempt ? 'Last try: not quite. Write your own sentence to earn the ✓.' : 'Write your own sentence to earn the ✓.'}
                        </T>
                      )}
                      <Button
                        label={sentence?.done ? 'Write another' : 'Try a sentence'}
                        kind={sentence?.done ? 'ghost' : 'secondary'}
                        onPress={() => router.push(`/sentence/${point.id}`)}
                      />
                    </View>
                  )}
                  <Pressable onPress={reset} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
                    <T variant="body" color={colors.wrongText} style={{ fontSize: 15, fontWeight: '700' }}>
                      Reset progress
                    </T>
                  </Pressable>
                </>
              ) : (
                <Button label="Learn this now" onPress={() => router.push({ pathname: '/lessons', params: { id: point.id } })} />
              )}
            </Section>
          }
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth * 2, borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  stat: { width: '33.33%', paddingRight: spacing.sm },
});
