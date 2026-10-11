import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LessonContent } from '@/components/LessonContent';
import { Mascot } from '@/components/Mascot';
import { Button, Section, T } from '@/components/ui';
import { getPoint } from '@/content/loader';
import { getPointStats, resetPoint, type PointStats } from '@/db/repo';
import { isMastered, retrievability, State } from '@/srs/scheduler';
import { useApp, useNow } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

const STATE_LABEL: Record<State, string> = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
};

function formatDue(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'Due now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `In ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `In ${hours} h`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <T variant="heading" style={{ fontWeight: '900' }}>
        {value}
      </T>
      <T variant="small">{label}</T>
    </View>
  );
}

export default function GrammarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { cardsById, refresh, colors } = useApp();
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
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}>
        <Section label={card ? 'Your progress' : undefined}>
          {card ? (
            <>
              <View style={styles.grid}>
                <Stat label="Status" value={isMastered(card) ? 'Mastered' : STATE_LABEL[card.state as State]} />
                <Stat label="Next review" value={card.suspended ? 'Suspended' : formatDue(card.due)} />
                <Stat label="Reviews" value={String(stats?.reviews ?? 0)} />
                <Stat label="Accuracy" value={stats && stats.reviews > 0 ? `${Math.round((stats.correct / stats.reviews) * 100)}%` : '—'} />
                <Stat label="Recall now" value={card.last_review ? `${Math.round(retrievability(card, now) * 100)}%` : '—'} />
                <Stat label="Stability" value={card.stability ? `${card.stability.toFixed(1)} days` : '—'} />
              </View>
              <Pressable onPress={reset} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                <T variant="body" color={colors.wrong} style={{ fontWeight: '800' }}>
                  Reset progress
                </T>
              </Pressable>
            </>
          ) : (
            <Button label="Learn this now" onPress={() => router.push({ pathname: '/lessons', params: { id: point.id } })} />
          )}
        </Section>
        <LessonContent point={point} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  stat: { width: '50%', gap: 2 },
});
