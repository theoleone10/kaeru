import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ForecastChart } from '@/components/ForecastChart';
import { Button, Card, ProgressBar, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { getActivityTimes } from '@/db/repo';
import { forecast } from '@/srs/forecast';
import { availableLessonCount, lessonsLearnedToday } from '@/srs/lessons';
import { levelProgress } from '@/stats/levelProgress';
import { computeStreak } from '@/stats/streak';
import { useApp, useNow } from '@/state/AppProvider';
import { spacing, TAP } from '@/theme/colors';

const DAY = 24 * 60 * 60 * 1000;

export default function Dashboard() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors, cards, settings } = useApp();
  const now = useNow();
  const [streak, setStreak] = useState({ days: 0, studiedToday: false });

  // Recompute when progress changes (cards) or the day rolls over (now).
  const today = new Date(now).toDateString();
  useEffect(() => {
    const t = Date.now();
    getActivityTimes(db, t - 400 * DAY).then((times) => setStreak(computeStreak(times, t)));
  }, [db, cards, today]);

  const active = cards.filter((c) => !c.suspended);
  const { dueNow, buckets } = forecast(
    active.map((c) => c.due),
    now,
  );
  const learnedToday = lessonsLearnedToday(cards.map((c) => c.learned_at), now);
  const learnedIds = new Set(cards.map((c) => c.grammar_id));
  const lessons = availableLessonCount(curriculum, learnedIds, learnedToday, settings.dailyLessonLimit);
  const unlearnedTotal = curriculum.length - learnedIds.size;
  const levels = levelProgress(curriculum, cards);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View>
          <T variant="title">文法</T>
          <T variant="muted">JLPT grammar</T>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.row}>
        <Card style={styles.stat}>
          <T variant="small">Reviews due</T>
          <T variant="title" color={dueNow > 0 ? colors.accent : colors.text}>
            {dueNow}
          </T>
        </Card>
        <Card style={styles.stat}>
          <T variant="small">Lessons</T>
          <T variant="title">{lessons}</T>
        </Card>
        <Card style={styles.stat}>
          <T variant="small">Streak</T>
          <T variant="title" color={streak.studiedToday ? colors.accent : colors.text}>
            {streak.days}
            <T variant="small"> {streak.days === 1 ? 'day' : 'days'}</T>
          </T>
        </Card>
      </View>

      <Button label={dueNow > 0 ? `Start reviews (${dueNow})` : 'No reviews due'} onPress={() => router.navigate('/review')} disabled={dueNow === 0} />
      <Button
        label={lessons > 0 ? `Learn new grammar (${Math.min(lessons, settings.batchSize)})` : unlearnedTotal === 0 ? 'All grammar learned' : 'Daily lesson limit reached'}
        kind="secondary"
        onPress={() => router.push('/lessons')}
        disabled={lessons === 0}
      />

      <Card style={{ gap: spacing.sm }}>
        <T variant="heading">Next 24 hours</T>
        <ForecastChart buckets={buckets} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <T variant="heading">Progress</T>
        {levels
          .filter((l) => l.total > 0)
          .map((l) => (
            <View key={l.level} style={{ gap: 6 }}>
              <View style={styles.levelRow}>
                <T variant="body" style={{ fontWeight: '600' }}>
                  {l.level}
                </T>
                <T variant="small">
                  {l.learned} / {l.total} learned · {l.mastered} mastered
                </T>
              </View>
              <ProgressBar value={l.learned / l.total} secondary={l.mastered / l.total} />
            </View>
          ))}
        <T variant="small">Mastered = next review is three weeks or more away.</T>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  iconButton: { width: TAP, height: TAP, borderRadius: TAP / 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
