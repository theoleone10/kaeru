import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toKana } from 'wanakana';
import { Pill, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { LEVELS, type GrammarPoint, type JlptLevel } from '@/content/types';
import { katakanaToHiragana } from '@/review/normalize';
import { isMastered } from '@/srs/scheduler';
import { useApp } from '@/state/AppProvider';
import { radius, spacing, TAP } from '@/theme/colors';

type Filter = 'all' | 'learned' | 'unlearned';

const fold = (s: string) => katakanaToHiragana(s.toLowerCase());
// Japanese side (title + structure) and English side (meaning) are searched separately
// so a romaji query like "mo" matches も without matching every English word containing "mo".
const INDEX = new Map(
  curriculum.map((p) => [p.id, { jp: fold([p.title, ...p.structure].join(' ')), en: fold(`${p.meaning} ${p.id}`) }]),
);

function matches(p: GrammarPoint, q: string): boolean {
  const idx = INDEX.get(p.id)!;
  if (/[a-z]/.test(q)) {
    const kana = toKana(q);
    // "wa" / "e" / "o" should also find the particles は / へ / を.
    const particle = kana.replace(/わ/g, 'は').replace(/え/g, 'へ').replace(/お/g, 'を');
    if (!/[a-z]/.test(kana) && (idx.jp.includes(kana) || idx.jp.includes(particle))) return true;
    return q.length >= 3 && (idx.en.includes(q) || idx.jp.includes(q));
  }
  return idx.jp.includes(q) || idx.en.includes(q);
}

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useApp();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && { backgroundColor: colors.surface }]}
          >
            <T variant="body" color={active ? colors.accent : colors.textMuted} style={{ fontWeight: '600', fontSize: 15 }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function GrammarIndex() {
  const insets = useSafeAreaInsets();
  const { colors, cardsById } = useApp();
  const [level, setLevel] = useState<JlptLevel>('N5');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = fold(query.trim());
    return curriculum.filter((p) => {
      if (!q && p.level !== level) return false;
      const learned = cardsById.has(p.id);
      if (filter === 'learned' && !learned) return false;
      if (filter === 'unlearned' && learned) return false;
      return !q || matches(p, q);
    });
  }, [query, level, filter, cardsById]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <T variant="title">Grammar</T>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Japanese, romaji or English"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          accessibilityLabel="Search grammar"
        />
        {!query.trim() && <Segmented options={LEVELS.map((l) => ({ value: l, label: l }))} value={level} onChange={setLevel} />}
        <Segmented
          options={[
            { value: 'all', label: 'All' },
            { value: 'learned', label: 'Learned' },
            { value: 'unlearned', label: 'Not learned' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>
      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm }}
        ListEmptyComponent={
          <T variant="muted" style={{ textAlign: 'center', marginTop: spacing.xl }}>
            {curriculum.some((p) => p.level === level) || query ? 'No matching grammar.' : `${level} content is coming in a later phase.`}
          </T>
        }
        renderItem={({ item }) => {
          const card = cardsById.get(item.id);
          const status = !card ? null : isMastered(card) ? 'Mastered' : 'Learned';
          return (
            <Pressable
              onPress={() => router.push(`/grammar/${item.id}`)}
              style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.dot, { backgroundColor: card ? colors.accent : colors.border }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="body" style={{ fontSize: 18, fontWeight: '600' }}>
                  {item.title}
                </T>
                <T variant="small" numberOfLines={1}>
                  {item.meaning}
                </T>
              </View>
              {query.trim() ? <Pill label={item.level} /> : status && <Pill label={status} tone="accent" />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: TAP, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, fontSize: 17 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
