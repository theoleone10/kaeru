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

function formatNext(ts: number | null): string {
  if (ts === null) return 'No reviews scheduled yet.';
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Next review ${sameDay ? 'today' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}.`;
}

/** Grammar reviews: everything due, then on to the rest of today's plan. */
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
        emptyState={(nextDue, summary) =>
          summary.reviewed > 0 ? (
            <Celebration
              title="Reviews done!"
              subtitle={formatNext(nextDue)}
              confetti={summary.correct / summary.reviewed >= 0.8}
              stats={[
                { label: 'Reviewed', value: String(summary.reviewed), tone: 'blue' },
                { label: 'Accuracy', value: `${Math.round((summary.correct / summary.reviewed) * 100)}%`, tone: 'green' },
              ]}
            >
              <NextUp from="review" />
            </Celebration>
          ) : (
            <Celebration title="All caught up" subtitle={formatNext(nextDue)} mood="sleep">
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
