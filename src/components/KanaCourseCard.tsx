import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HIRAGANA, KANA_LESSONS, KATAKANA } from '../kana/data';
import { passedKanaLessons } from '../kana/repo';
import { useApp } from '../state/AppProvider';
import { Icon } from './Icon';
import { IconTile, T } from './ui';

/**
 * The way into the kana course. `whileLearning` hides it once every lesson is passed (or marked
 * known), for Today; the Cards tab always shows it.
 */
export function KanaCourseCard({ whileLearning = false }: { whileLearning?: boolean }) {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const [passed, setPassed] = useState<Set<string> | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      passedKanaLessons(db)
        .then((p) => alive && setPassed(new Set(p.keys())))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [db]),
  );
  if (!passed) return null;
  const next = KANA_LESSONS.find((l) => !passed.has(l.id));
  if (whileLearning && !next) return null;
  const h = HIRAGANA.filter((l) => passed.has(l.id)).length;
  const k = KATAKANA.filter((l) => passed.has(l.id)).length;
  const detail = next
    ? `${passed.size === 0 ? 'Start' : 'Next'}: ${next.script === 'hiragana' ? 'Hiragana' : 'Katakana'} · ${next.title}`
    : 'All learned. Practise any time.';

  return (
    <Pressable
      onPress={() => router.push('/kana')}
      accessibilityRole="button"
      accessibilityLabel={`Kana course. Hiragana ${h} of ${HIRAGANA.length}, katakana ${k} of ${KATAKANA.length}. ${detail}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <IconTile icon="kana" color={colors.accentInk} soft={colors.accentSoft} filled={false} />
      <View style={{ flex: 1 }}>
        <T variant="body" style={{ fontWeight: '700' }}>
          {passed.size === 0 ? 'Learn to read kana' : 'Kana course'}
        </T>
        <T variant="small" numberOfLines={1}>
          {detail}
        </T>
        <T variant="small" color={colors.textFaint}>{`Hiragana ${h}/${HIRAGANA.length} · Katakana ${k}/${KATAKANA.length}`}</T>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textFaint} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, paddingVertical: 10 },
});
