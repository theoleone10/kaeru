import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toKana } from 'wanakana';
import { Mascot } from '@/components/Mascot';
import { Button, IconButton, Pill, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { LEVELS, type GrammarPoint, type JlptLevel } from '@/content/types';
import { stationCode, unitsFor, type Station } from '@/content/units';
import { katakanaToHiragana } from '@/review/normalize';
import { isMastered } from '@/srs/scheduler';
import { useApp } from '@/state/AppProvider';
import { radius, spacing, TAP, type LineColors } from '@/theme/colors';

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

type Status = 'mastered' | 'learned' | 'current' | 'ahead';
type Row = { kind: 'unit'; unit: number; first: boolean; count: number } | { kind: 'station'; station: Station; status: Status; last: boolean };

/** Round station marker in the Tokyo subway style: line-coloured ring with the station number. */
function StationMarker({ station, status, line }: { station: Station; status: Status; line: LineColors }) {
  const { colors } = useApp();
  if (status === 'current') {
    return (
      <View style={[styles.currentMarker, { backgroundColor: colors.accent, borderBottomColor: colors.accentShadow }]}>
        <Mascot size={42} mood="happy" />
      </View>
    );
  }
  if (status === 'learned' || status === 'mastered') {
    return (
      <View style={[styles.marker, { backgroundColor: line.line, borderColor: colors.surface, shadowColor: line.line }]}>
        <Ionicons name="checkmark" size={20} color="#FFFFFF" />
      </View>
    );
  }
  return (
    <View style={[styles.marker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <T variant="small" color={colors.textMuted} style={{ fontSize: 7, lineHeight: 8, fontWeight: '900' }}>
        {station.point.level}
      </T>
      <T variant="small" color={colors.text} style={{ fontSize: 12, lineHeight: 13, fontWeight: '900' }}>
        {station.number}
      </T>
    </View>
  );
}

/** Solid line where you've travelled, dots ahead. */
function Track({ solid, color, dots }: { solid: boolean; color: string; dots: string }) {
  if (solid) return <View style={[styles.track, { backgroundColor: color }]} />;
  return (
    <View style={styles.dotTrack}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dots }} />
      ))}
    </View>
  );
}

export default function GrammarMap() {
  const insets = useSafeAreaInsets();
  const { colors, lines, cardsById } = useApp();
  const params = useLocalSearchParams<{ level?: string }>();
  const nextGlobal = useMemo(() => curriculum.find((p) => !cardsById.has(p.id)), [cardsById]);
  const [chosen, setLevel] = useState<JlptLevel | null>(null);
  const level: JlptLevel = chosen ?? ((LEVELS as readonly string[]).includes(params.level ?? '') ? (params.level as JlptLevel) : (nextGlobal?.level ?? 'N5'));
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const line = lines[level];

  const { rows, current, prev, next } = useMemo(() => {
    const units = unitsFor(level);
    const stations = units.flatMap((u) => u.stations);
    const currentStation = stations.find((s) => !cardsById.has(s.point.id)) ?? stations[stations.length - 1];
    const out: Row[] = [];
    units.forEach((u, ui) => {
      out.push({ kind: 'unit', unit: u.number, first: ui === 0, count: u.stations.length });
      u.stations.forEach((s, si) => {
        const card = cardsById.get(s.point.id);
        const status: Status = card ? (isMastered(card) ? 'mastered' : 'learned') : s === currentStation ? 'current' : 'ahead';
        out.push({ kind: 'station', station: s, status, last: ui === units.length - 1 && si === u.stations.length - 1 });
      });
    });
    const i = currentStation ? stations.indexOf(currentStation) : -1;
    return { rows: out, current: currentStation, prev: stations[i - 1], next: stations[i + 1] };
  }, [level, cardsById]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    return q ? curriculum.filter((p) => matches(p, q)) : [];
  }, [query]);

  const isNextLesson = current && nextGlobal?.id === current.point.id && !cardsById.has(current.point.id);

  const header = current ? (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
      <View style={[styles.sign, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
        <View style={[styles.signBand, { backgroundColor: line.line }]}>
          <T variant="small" color="#FFFFFF" style={{ fontWeight: '900', letterSpacing: 0.8 }}>
            {level} LINE · UNIT {current.unit}
          </T>
          <T variant="small" color="#FFFFFF" style={{ fontWeight: '900', letterSpacing: 0.8 }}>
            {stationCode(current)}
          </T>
        </View>
        <View style={{ padding: spacing.md, alignItems: 'center', gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[styles.signBadge, { borderColor: line.line }]}>
              <T variant="small" color={line.ink} style={{ fontSize: 8, lineHeight: 9, fontWeight: '900' }}>
                {level}
              </T>
              <T variant="small" color={colors.text} style={{ fontSize: 13, lineHeight: 14, fontWeight: '900' }}>
                {current.number}
              </T>
            </View>
            <T variant="title" style={{ fontSize: 28, lineHeight: 38, flexShrink: 1 }} numberOfLines={1}>
              {current.point.title}
            </T>
          </View>
          <T variant="muted" style={{ textAlign: 'center' }} numberOfLines={2}>
            {current.point.meaning}
          </T>
          <View style={[styles.signNeighbours, { borderTopColor: colors.border }]}>
            <T variant="small" numberOfLines={1} style={{ flex: 1 }}>
              {prev ? `← ${prev.point.title}` : ''}
            </T>
            <T variant="small" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
              {next ? `${next.point.title} →` : ''}
            </T>
          </View>
          <Button
            label={isNextLesson ? 'Board lesson' : cardsById.has(current.point.id) ? 'Line complete · review' : 'View station'}
            icon={<Ionicons name={isNextLesson ? 'train' : 'eye'} size={20} color="#FFFFFF" />}
            onPress={() => (isNextLesson ? router.push('/lessons') : router.push(`/grammar/${current.point.id}`))}
            style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
          />
          {!isNextLesson && nextGlobal && !cardsById.has(current.point.id) && (
            <T variant="small" style={{ textAlign: 'center', marginTop: spacing.xs }}>
              Lessons follow the lines in order: your next stop is {nextGlobal.title} ({nextGlobal.level}).
            </T>
          )}
        </View>
      </View>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, paddingTop: insets.top + spacing.sm, backgroundColor: colors.background }}>
      <View style={styles.topRow}>
        {searching ? (
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Search Japanese, romaji or English"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            accessibilityLabel="Search grammar"
          />
        ) : (
          <View style={styles.lines} accessibilityRole="tablist">
            {LEVELS.map((l) => {
              const active = l === level;
              const c = lines[l];
              return (
                <Pressable
                  key={l}
                  onPress={() => setLevel(l)}
                  accessibilityRole="tab"
                  accessibilityLabel={`${l} line`}
                  accessibilityState={{ selected: active }}
                  style={[styles.linePill, active ? { backgroundColor: c.line, borderColor: c.line, paddingHorizontal: 12 } : { borderColor: c.line, backgroundColor: colors.surface }]}
                >
                  <T variant="small" color={active ? '#FFFFFF' : c.ink} style={{ fontWeight: '900', fontSize: 13 }}>
                    {active ? `${l} Line` : l}
                  </T>
                </Pressable>
              );
            })}
          </View>
        )}
        <IconButton
          label={searching ? 'Close search' : 'Search grammar'}
          onPress={() => {
            setSearching(!searching);
            setQuery('');
          }}
        >
          <Ionicons name={searching ? 'close' : 'search'} size={22} color={colors.textMuted} />
        </IconButton>
      </View>

      {searching ? (
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: spacing.md, marginTop: spacing.xl }}>
              <Mascot size={80} mood={query.trim() ? 'sad' : 'think'} />
              <T variant="muted" style={{ textAlign: 'center' }}>
                {query.trim() ? 'No matching grammar.' : 'Type to search all 400+ points.'}
              </T>
            </View>
          }
          renderItem={({ item }) => {
            const card = cardsById.get(item.id);
            return (
              <Pressable
                onPress={() => router.push(`/grammar/${item.id}`)}
                style={({ pressed }) => [styles.result, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.lineDot, { borderColor: lines[item.level].line }]} />
                <View style={{ flex: 1 }}>
                  <T variant="body" style={{ fontSize: 18, fontWeight: '700' }}>
                    {item.title}
                  </T>
                  <T variant="small" numberOfLines={1}>
                    {item.meaning}
                  </T>
                </View>
                <Pill label={card ? (isMastered(card) ? 'Mastered' : 'Learned') : item.level} tone={card ? (isMastered(card) ? 'gold' : 'green') : 'neutral'} />
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => (r.kind === 'unit' ? `u${r.unit}` : r.station.point.id)}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
          renderItem={({ item }) => {
            if (item.kind === 'unit') {
              return (
                <View style={styles.unitRow}>
                  <View style={styles.trackCol}>
                    <View style={[styles.transfer, { borderColor: line.line, backgroundColor: colors.surface }]} />
                  </View>
                  <View style={[styles.unitCard, { backgroundColor: line.soft }]}>
                    <T variant="body" color={line.ink} style={{ fontWeight: '900' }}>
                      {item.first ? `${level} Line · Unit ${item.unit}` : `Transfer · Unit ${item.unit}`}
                    </T>
                    <T variant="small" color={line.ink}>
                      {item.count} stations
                    </T>
                  </View>
                </View>
              );
            }
            const { station, status } = item;
            const travelled = status === 'learned' || status === 'mastered';
            const isCurrent = status === 'current';
            return (
              <Pressable
                onPress={() => router.push(`/grammar/${station.point.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${stationCode(station)} ${station.point.title}, ${station.point.meaning}, ${status === 'ahead' ? 'not learned yet' : status === 'current' ? 'you are here' : status}`}
                style={({ pressed }) => [
                  styles.stationRow,
                  isCurrent && [styles.currentRow, { backgroundColor: colors.surface, borderColor: colors.accentSoft, borderBottomColor: colors.accent }],
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={styles.trackCol}>
                  {!isCurrent && <Track solid={travelled} color={line.line} dots={colors.border} />}
                  <StationMarker station={station} status={status} line={line} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <T variant="body" color={status === 'ahead' ? colors.textMuted : colors.text} style={{ fontSize: 17, fontWeight: isCurrent ? '800' : '700' }} numberOfLines={1}>
                    {station.point.title}
                  </T>
                  <T variant="small" color={isCurrent ? colors.accent : colors.textMuted} numberOfLines={1}>
                    {stationCode(station)} · {isCurrent ? 'You are here' : station.point.meaning}
                  </T>
                </View>
                {status === 'mastered' && <Pill label="★ Mastered" tone="gold" />}
                {status === 'learned' && <Pill label="Learning" tone="green" />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  lines: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' },
  linePill: { minWidth: 40, height: 40, borderRadius: 20, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 2, paddingHorizontal: spacing.lg, fontSize: 17 },
  sign: { borderRadius: 18, borderWidth: 2, borderBottomWidth: 6, overflow: 'hidden' },
  signBand: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6 },
  signBadge: { width: 38, height: 38, borderRadius: 19, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  signNeighbours: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 2, borderStyle: 'dashed' },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
  unitCard: { flex: 1, borderRadius: 14, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  transfer: { width: 42, height: 28, borderRadius: 14, borderWidth: 4 },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 62 },
  currentRow: { minHeight: 78, marginVertical: 4, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 20, borderWidth: 2, borderBottomWidth: 5 },
  trackCol: { width: 64, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', top: 0, bottom: 0, width: 10, borderRadius: 5 },
  dotTrack: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'space-evenly', alignItems: 'center' },
  marker: { width: 38, height: 38, borderRadius: 19, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  currentMarker: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 2, minHeight: TAP + 12 },
  lineDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 4 },
});
