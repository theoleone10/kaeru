import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Celebration } from '@/components/Celebration';
import { NextUp } from '@/components/DayPlan';
import { ReviewSession } from '@/components/ReviewSession';
import { T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { spacing, TAP } from '@/theme/colors';

function formatNext(ts: number | null, held: number): string {
  if (held > 0) return `That’s today’s maximum. ${held === 1 ? '1 more review waits' : `${held} more reviews wait`} for tomorrow.`;
  if (ts === null) return 'No reviews scheduled yet.';
  const d = new Date(ts);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return 'Next reviews tomorrow.';
  return `Next reviews ${d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}.`;
}

/** Grammar reviews: today's set, misses at the end until they're right, then on to the rest of the plan. */
export default function Review() {
  const insets = useSafeAreaInsets();
  const { colors } = useApp();

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close reviews" hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={30} color={colors.textMuted} />
        </Pressable>
        <T variant="small" style={{ fontWeight: '900', letterSpacing: 0.8 }}>
          GRAMMAR REVIEW
        </T>
      </View>
      <ReviewSession
        bottomInset={insets.bottom}
        emptyState={(nextDue, summary, held) =>
          summary.reviewed > 0 ? (
            <Celebration
              title="Reviews done!"
              subtitle={formatNext(nextDue, held)}
              confetti={summary.correct / summary.reviewed >= 0.8}
              sound="reviews"
              stats={[
                { label: 'Reviewed', value: String(summary.reviewed), tone: 'blue' },
                { label: 'Accuracy', value: `${Math.round((summary.correct / summary.reviewed) * 100)}%`, tone: 'green' },
              ]}
            >
              <NextUp from="review" />
            </Celebration>
          ) : (
            <Celebration title="All caught up" subtitle={formatNext(nextDue, held)} mood="sleep">
              <NextUp from="review" />
            </Celebration>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  close: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
});
