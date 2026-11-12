import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HIRAGANA, KANA_LESSONS, KATAKANA } from '../kana/data';
import { passedKanaLessons } from '../kana/repo';
import { useApp } from '../state/AppProvider';
import { radius, spacing } from '../theme/colors';
import { T } from './ui';

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
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
        <T jp color={colors.accent} style={{ fontSize: 26, lineHeight: 34, fontWeight: '900' }}>
          あ
        </T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body" style={{ fontWeight: '800' }}>
          {passed.size === 0 ? 'Learn to read kana' : 'Kana course'}
        </T>
        <T variant="small" numberOfLines={1}>
          {detail}
        </T>
        <T variant="small">{`Hiragana ${h}/${HIRAGANA.length} · Katakana ${k}/${KATAKANA.length}`}</T>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  badge: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
