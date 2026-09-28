import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReviewSession } from '@/components/ReviewSession';
import { Button, Card, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { availableLessonCount, lessonsLearnedToday } from '@/srs/lessons';
import { useApp, useNow } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

function formatNext(ts: number | null): string {
  if (ts === null) return 'No reviews scheduled yet.';
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Next review ${sameDay ? 'today' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}.`;
}

export default function ReviewTab() {
  const insets = useSafeAreaInsets();
  const { colors, cards, settings } = useApp();
  const now = useNow();
  const learned = new Set(cards.map((c) => c.grammar_id));
  const lessons = availableLessonCount(
    curriculum,
    learned,
    lessonsLearnedToday(cards.map((c) => c.learned_at), now),
    settings.dailyLessonLimit,
  );

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
      <T variant="title" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        Review
      </T>
      <ReviewSession
        emptyState={(nextDue, summary) => (
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            <Card style={{ gap: spacing.sm }}>
              <T variant="heading">{summary.reviewed > 0 ? 'Session complete' : 'All caught up'}</T>
              {summary.reviewed > 0 && (
                <T variant="body">
                  {summary.correct} / {summary.reviewed} correct
                </T>
              )}
              <T variant="muted">{formatNext(nextDue)}</T>
            </Card>
            {lessons > 0 && <Button label={`Learn new grammar (${Math.min(lessons, settings.batchSize)})`} kind="secondary" onPress={() => router.push('/lessons')} />}
          </View>
        )}
      />
    </View>
  );
}
