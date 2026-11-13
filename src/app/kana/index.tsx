import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button, ProgressBar, T } from '@/components/ui';
import { HIRAGANA, KANA_LESSONS, KATAKANA, type KanaLesson } from '@/kana/data';
import { passedKanaLessons, passKanaLessons } from '@/kana/repo';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

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

  const part = (name: string, jpName: string, lessons: KanaLesson[]) => {
    const done = lessons.filter((l) => passed.has(l.id)).length;
    return (
      <View>
        <View style={styles.partHead}>
          <T variant="body" style={{ flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '800' }}>
            {`${jpName} `}
            <T variant="muted" style={{ fontSize: 15, lineHeight: 22 }}>{`${name} · ${done}/${lessons.length}`}</T>
          </T>
          {done < lessons.length && <Button label="I know these" kind="ghost" small onPress={() => knowAlready(lessons, name)} style={{ marginRight: -spacing.lg }} />}
        </View>
        <View style={{ marginBottom: spacing.sm }}>
          <ProgressBar value={done / lessons.length} height={6} color={colors.correct} />
        </View>
        {lessons.map((l) => {
          const isPassed = passed.has(l.id);
          const isNext = nextUp?.id === l.id;
          const tile = isPassed
            ? { backgroundColor: colors.correct, borderColor: colors.correct }
            : isNext
              ? { backgroundColor: colors.accentSoft, borderColor: colors.accent }
              : { backgroundColor: colors.surface, borderColor: colors.border };
          return (
            <Pressable
              key={l.id}
              onPress={() => router.push(`/kana/${l.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${name}: ${l.title}. ${isPassed ? 'Passed' : isNext ? 'Up next' : 'Not started'}`}
              style={({ pressed }) => [styles.lesson, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={[styles.tile, tile, { borderWidth: isNext ? 2.5 : isPassed ? 0 : 2 }]}>
                <T jp color={isPassed ? '#FFFFFF' : isNext ? colors.accentInk : colors.textFaint} style={{ fontSize: 20, lineHeight: 26, fontWeight: '800' }}>
                  {l.kana[0]?.kana}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="body" color={isNext ? colors.accentInk : isPassed ? colors.text : colors.textMuted} style={{ fontSize: 17, lineHeight: 23, fontWeight: '700' }}>
                  {l.title}
                </T>
                <T variant="small" numberOfLines={1}>
                  {isNext ? 'Up next' : isPassed ? l.kana.map((k) => k.kana).join(' ') : `${l.kana.length} kana`}
                </T>
              </View>
              {isPassed ? (
                <Icon name="check" size={20} color={colors.correct} strokeWidth={3} />
              ) : isNext ? (
                <Icon name="chevronRight" size={18} color={colors.accentInk} strokeWidth={2.6} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: spacing.md, gap: 20, paddingBottom: insets.bottom + spacing.xl }}>
      <T variant="muted" style={{ lineHeight: 23 }}>
        Japanese is written with two sets of kana, 46 sounds each, plus kanji. Hiragana comes first: it’s in every sentence. Katakana writes loanwords and names.
      </T>
      {nextUp && <Button label={`${passed.size === 0 ? 'Start' : 'Continue'}: ${nextUp.script === 'hiragana' ? 'Hiragana' : 'Katakana'} · ${nextUp.title}`} onPress={() => router.push(`/kana/${nextUp.id}`)} icon={<Icon name="play" size={16} color={colors.accentText} filled />} />}
      {anyPassed && <Button label="Practise everything learned" kind={nextUp ? 'secondary' : 'primary'} onPress={() => router.push('/kana/review')} />}
      <View style={{ gap: spacing.xl, marginTop: spacing.xs }}>
        {part('Hiragana', 'ひらがな', HIRAGANA)}
        {part('Katakana', 'カタカナ', KATAKANA)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  partHead: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingBottom: 2 },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 7 },
  tile: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
