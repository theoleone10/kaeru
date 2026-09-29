import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReviewSession } from '@/components/ReviewSession';
import { Celebration } from '@/components/Celebration';
import { Button } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { availableLessonCount, lessonsLearnedToday } from '@/srs/lessons';
import { useApp, useNow } from '@/state/AppProvider';

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
      <ReviewSession
        emptyState={(nextDue, summary) =>
          summary.reviewed > 0 ? (
            <Celebration
              title="Session complete!"
              subtitle={formatNext(nextDue)}
              confetti={summary.correct / summary.reviewed >= 0.8}
              stats={[
                { label: 'Reviewed', value: String(summary.reviewed), tone: 'blue' },
                { label: 'Accuracy', value: `${Math.round((summary.correct / summary.reviewed) * 100)}%`, tone: 'green' },
              ]}
            >
              {lessons > 0 && <Button label={`Learn ${Math.min(lessons, settings.batchSize)} new points`} onPress={() => router.push('/lessons')} />}
            </Celebration>
          ) : (
            <Celebration title="All caught up" subtitle={formatNext(nextDue)} mood="sleep">
              {lessons > 0 && <Button label={`Learn ${Math.min(lessons, settings.batchSize)} new points`} onPress={() => router.push('/lessons')} />}
            </Celebration>
          )
        }
      />
    </View>
  );
}
