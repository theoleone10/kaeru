import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Celebration } from '@/components/Celebration';
import { KanaQuiz } from '@/components/KanaQuiz';
import { Button, Section, T } from '@/components/ui';
import { getLesson, KANA_LESSONS } from '@/kana/data';
import { lessonPractice, scorePractice, type KanaAnswer } from '@/kana/practice';
import { passKanaLessons, recordKanaAnswers } from '@/kana/repo';
import { useApp } from '@/state/AppProvider';
import { radius, spacing } from '@/theme/colors';

type Phase = 'learn' | 'practice' | 'done';

/** One kana lesson: meet the new kana, practise them both ways, pass at 80%. */
export default function KanaLessonScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors } = useApp();
  const { lesson: id } = useLocalSearchParams<{ lesson: string }>();
  const lesson = getLesson(id ?? '');
  const [phase, setPhase] = useState<Phase>('learn');
  const [focus, setFocus] = useState(0);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState<{ asked: number; correct: number; passed: boolean } | null>(null);
  const questions = useMemo(() => (lesson ? lessonPractice(lesson) : []), [lesson, round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lesson) {
    return (
      <View style={{ flex: 1, padding: spacing.xl, backgroundColor: colors.background }}>
        <T variant="body">This lesson doesn’t exist.</T>
      </View>
    );
  }
  const next = KANA_LESSONS[KANA_LESSONS.indexOf(lesson) + 1];
  const title = `${lesson.script === 'hiragana' ? 'Hiragana' : 'Katakana'} · ${lesson.title}`;

  const finish = async (answers: KanaAnswer[]) => {
    const s = scorePractice(answers);
    setScore(s);
    setPhase('done');
    await recordKanaAnswers(db, answers).catch(() => undefined);
    if (s.passed) await passKanaLessons(db, [lesson.id], Date.now()).catch(() => undefined);
  };

  if (phase === 'done' && score) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: insets.bottom }}>
        <Stack.Screen options={{ title }} />
        <Celebration
          title={score.passed ? 'Lesson passed!' : 'Almost there'}
          subtitle={score.passed ? `${lesson.kana.length} new ${lesson.script} learned.` : `You need ${Math.ceil(score.asked * 0.8)} of ${score.asked} right first time. One more go?`}
          mood={score.passed ? 'cheer' : 'think'}
          confetti={score.passed}
          sound="lesson"
          stats={[{ label: 'Right first time', value: `${score.correct}/${score.asked}`, tone: score.passed ? 'green' : 'gold' }]}
        >
          {score.passed && next ? (
            <Button label={`Next: ${next.script === lesson.script ? next.title : `Katakana · ${next.title}`}`} onPress={() => router.replace(`/kana/${next.id}`)} />
          ) : null}
          <Button
            label={score.passed ? 'Practise again' : 'Try again'}
            kind={score.passed ? 'ghost' : 'primary'}
            onPress={() => {
              setRound((r) => r + 1);
              setPhase('practice');
            }}
          />
          <Button label="Back to the course" kind="ghost" onPress={() => router.back()} />
        </Celebration>
      </View>
    );
  }

  if (phase === 'practice') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg }}>
        <Stack.Screen options={{ title }} />
        <KanaQuiz key={round} questions={questions} onDone={finish} />
      </View>
    );
  }

  const shown = lesson.kana[focus];
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
      <Stack.Screen options={{ title }} />
      <View style={[styles.big, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <T jp style={{ fontSize: 110, lineHeight: 136, fontWeight: '800' }}>
          {shown.kana}
        </T>
        <T variant="title" color={colors.accent}>
          {shown.romaji}
        </T>
      </View>
      <View style={styles.row} accessibilityRole="tablist">
        {lesson.kana.map((k, i) => (
          <Pressable
            key={k.kana}
            onPress={() => setFocus(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === focus }}
            accessibilityLabel={`${k.kana}, ${k.romaji}`}
            style={[styles.cell, { backgroundColor: i === focus ? colors.accentSoft : colors.surface, borderColor: i === focus ? colors.accent : colors.border }]}
          >
            <T jp style={{ fontSize: 26, lineHeight: 34, fontWeight: '800' }}>
              {k.kana}
            </T>
            <T variant="small">{k.romaji}</T>
          </Pressable>
        ))}
      </View>
      <Section label="Good to know">
        <T variant="body">{lesson.tip}</T>
      </Section>
      <Section label="Words to read">
        {lesson.words.map((w) => (
          <View key={w.word} style={styles.word}>
            <T jp style={{ fontSize: 24, lineHeight: 32, fontWeight: '800' }}>
              {w.word}
            </T>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <T variant="body">{w.romaji}</T>
              <T variant="small">{w.meaning}</T>
            </View>
          </View>
        ))}
      </Section>
      <Button label="Practise these" onPress={() => setPhase('practice')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  big: { alignItems: 'center', paddingVertical: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  cell: { width: 64, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 2, paddingVertical: 4 },
  word: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
});
