import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ProgressBar, Section, T } from '@/components/ui';
import { HIRAGANA, KANA_LESSONS, KATAKANA, type KanaLesson } from '@/kana/data';
import { passedKanaLessons, passKanaLessons } from '@/kana/repo';
import { useApp } from '@/state/AppProvider';
import { radius, spacing } from '@/theme/colors';

/** The kana course: hiragana then katakana, a row at a time, plus practice of everything learned. */
export default function KanaCourse() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors } = useApp();
  const [passed, setPassed] = useState<Map<string, number> | null>(null);

  const load = useCallback(async () => setPassed(await passedKanaLessons(db)), [db]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!passed) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  const nextUp = KANA_LESSONS.find((l) => !passed.has(l.id));
  const anyPassed = passed.size > 0;

  const knowAlready = (lessons: KanaLesson[], name: string) =>
    Alert.alert(`Mark ${name} as known?`, 'Its lessons will show as passed. You can still open and practise them any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark as known',
        onPress: async () => {
          await passKanaLessons(
            db,
            lessons.map((l) => l.id),
            Date.now(),
          );
          await load();
        },
      },
    ]);

  const part = (name: string, lessons: KanaLesson[]) => {
    const done = lessons.filter((l) => passed.has(l.id)).length;
    return (
      <Section label={`${name} · ${done}/${lessons.length}`} right={done < lessons.length ? <Button label="I know these" kind="ghost" small onPress={() => knowAlready(lessons, name)} /> : undefined}>
        <ProgressBar value={done / lessons.length} />
        {lessons.map((l) => {
          const isPassed = passed.has(l.id);
          const isNext = nextUp?.id === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => router.push(`/kana/${l.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${name}: ${l.title}. ${isPassed ? 'Passed' : isNext ? 'Up next' : 'Not started'}`}
              style={({ pressed }) => [
                styles.lesson,
                { backgroundColor: isNext ? colors.accentSoft : colors.surface, borderColor: isNext ? colors.accent : colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <T jp style={{ fontSize: 22, lineHeight: 30, fontWeight: '800', width: 84 }} numberOfLines={1}>
                {l.kana
                  .slice(0, 3)
                  .map((k) => k.kana)
                  .join('')}
              </T>
              <View style={{ flex: 1 }}>
                <T variant="body" style={{ fontWeight: '800' }}>
                  {l.title}
                </T>
                <T variant="small">{isNext ? 'Up next' : `${l.kana.length} kana`}</T>
              </View>
              <Ionicons name={isPassed ? 'checkmark-circle' : 'chevron-forward'} size={22} color={isPassed ? colors.correct : colors.textMuted} />
            </Pressable>
          );
        })}
      </Section>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
      <T variant="muted">
        Japanese is written with two sets of kana, 46 sounds each, plus kanji. Hiragana comes first: it’s in every sentence. Katakana writes loanwords and names.
      </T>
      {nextUp && <Button label={`${passed.size === 0 ? 'Start' : 'Continue'}: ${nextUp.script === 'hiragana' ? 'Hiragana' : 'Katakana'} · ${nextUp.title}`} onPress={() => router.push(`/kana/${nextUp.id}`)} />}
      {anyPassed && <Button label="Practise everything learned" kind={nextUp ? 'secondary' : 'primary'} onPress={() => router.push('/kana/review')} />}
      {part('Hiragana', HIRAGANA)}
      {part('Katakana', KATAKANA)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  lesson: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
