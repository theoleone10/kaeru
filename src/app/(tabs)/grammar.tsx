import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toKana } from 'wanakana';
import { Icon } from '@/components/Icon';
import { Mascot } from '@/components/Mascot';
import { Button, fontStyle, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { LEVELS, type GrammarPoint, type JlptLevel } from '@/content/types';
import { stationCode, unitsFor, type Station } from '@/content/units';
import { markKnown } from '@/db/repo';
import { katakanaToHiragana } from '@/review/normalize';
import { sentencePracticeOn } from '@/sentence/grader';
import { sentenceDoneIds } from '@/sentence/repo';
import { isMastered } from '@/srs/scheduler';
import { useApp } from '@/state/AppProvider';
import { dark, radius, spacing, TAP, type LineColors } from '@/theme/colors';

const UNIT_H = 44;
const STATION_H = 58;
const CURRENT_H = 70;

const fold = (s: string) => katakanaToHiragana(s.toLowerCase());
// Japanese side (title + structure) and English side (meaning) are searched separately
// so a romaji query like "mo" matches も without matching every English word containing "mo".
const INDEX = new Map(curriculum.map((p) => [p.id, { jp: fold([p.title, ...p.structure].join(' ')), en: fold(`${p.meaning} ${p.id}`) }]));

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
type Row =
  | { kind: 'unit'; unit: number; first: boolean; count: number; done: number; points: GrammarPoint[] }
  | { kind: 'station'; station: Station; status: Status; last: boolean; nextTravelled: boolean };

const MARKER = 32;
const CURRENT_MARKER = 46;

/** Round station marker: gold star (mastered), line-coloured check (learned), the frog (you are here), or the station number. */
function StationMarker({ station, status, line }: { station: Station; status: Status; line: LineColors }) {
  const { colors } = useApp();
  if (status === 'current') {
    return (
      <View style={[styles.ring, { borderColor: colors.background, borderRadius: CURRENT_MARKER / 2 + 3 }]}>
        <View style={[styles.currentMarker, { backgroundColor: colors.accentSoft, borderColor: colors.accentInk }]}>
          <Mascot size={32} mood="happy" />
        </View>
      </View>
    );
  }
  if (status === 'learned' || status === 'mastered') {
    const mastered = status === 'mastered';
    return (
      <View style={[styles.ring, { borderColor: colors.background }]} accessibilityLabel={mastered ? 'Mastered' : 'Learned'}>
        <View style={[styles.marker, { backgroundColor: mastered ? colors.gold : line.line }]}>
          <Icon name={mastered ? 'star' : 'check'} size={mastered ? 18 : 16} color="#FFFFFF" filled={mastered} strokeWidth={3.2} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.ring, { borderColor: colors.background }]}>
      <View style={[styles.marker, { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors === dark ? colors.border : colors.borderStrong }]}>
        <T variant="small" color={colors.textMuted} style={{ fontSize: 12, lineHeight: 14, fontWeight: '800' }} jp={false}>
          {station.number}
        </T>
      </View>
    </View>
  );
}

/** Solid line where you've travelled, dots ahead. */
function Track({ solid, color, dots, style }: { solid: boolean; color: string; dots: string; style?: { top?: number | `${number}%`; bottom?: number | `${number}%` } }) {
  if (solid) return <View style={[styles.track, { backgroundColor: color }, style]} />;
  return (
    <View style={[styles.dotTrack, style]}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dots }} />
      ))}
    </View>
  );
}

export default function GrammarMap() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { colors, lines, cardsById, refresh, settings } = useApp();
  const sentencesOn = sentencePracticeOn(settings);
  // Points with a correct practice sentence get a small pencil badge (beta).
  const [sentenceDone, setSentenceDone] = useState<Set<string>>(new Set());
  useFocusEffect(
    useCallback(() => {
      if (sentencesOn) sentenceDoneIds(db).then(setSentenceDone);
    }, [db, sentencesOn]),
  );
  const params = useLocalSearchParams<{ level?: string }>();
  const nextGlobal = useMemo(() => curriculum.find((p) => !cardsById.has(p.id)), [cardsById]);
  const [chosen, setLevel] = useState<JlptLevel | null>(null);
  const level: JlptLevel = chosen ?? ((LEVELS as readonly string[]).includes(params.level ?? '') ? (params.level as JlptLevel) : (nextGlobal?.level ?? 'N5'));
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const line = lines[level];
  const dots = colors === dark ? colors.textFaint : colors.borderStrong;

  const { rows, current, startIndex, layout } = useMemo(() => {
    const units = unitsFor(level);
    const stations = units.flatMap((u) => u.stations);
    const currentStation = stations.find((s) => !cardsById.has(s.point.id)) ?? stations[stations.length - 1];
    const out: Row[] = [];
    units.forEach((u, ui) => {
      const done = u.stations.filter((s) => cardsById.has(s.point.id)).length;
      out.push({ kind: 'unit', unit: u.number, first: ui === 0, count: u.stations.length, done, points: u.stations.map((s) => s.point) });
      u.stations.forEach((s, si) => {
        const card = cardsById.get(s.point.id);
        const status: Status = card ? (isMastered(card) ? 'mastered' : 'learned') : s === currentStation ? 'current' : 'ahead';
        const next = u.stations[si + 1] ?? units[ui + 1]?.stations[0];
        out.push({ kind: 'station', station: s, status, last: ui === units.length - 1 && si === u.stations.length - 1, nextTravelled: !!next && cardsById.has(next.point.id) });
      });
    });
    // The unit you're on opens at the top of the map.
    const startIndex = Math.max(
      0,
      out.findIndex((r) => r.kind === 'unit' && r.unit === currentStation?.unit),
    );
    // Fixed row heights, so the list can jump straight there.
    const layout: { length: number; offset: number; index: number }[] = [];
    let offset = 0;
    out.forEach((r, index) => {
      const length = r.kind === 'unit' ? UNIT_H : r.station === currentStation ? CURRENT_H : STATION_H;
      layout.push({ length, offset, index });
      offset += length;
    });
    return { rows: out, current: currentStation, startIndex, layout };
  }, [level, cardsById]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    return q ? curriculum.filter((p) => matches(p, q)) : [];
  }, [query]);

  const skip = async (points: GrammarPoint[]) => {
    await markKnown(db, points);
    await refresh();
  };

  /** Skip ahead from a unit header: everything before it, or just this unit, becomes known. */
  const unitOptions = (unit: number, points: GrammarPoint[]) => {
    const unlearned = (list: readonly GrammarPoint[]) => list.filter((p) => !cardsById.has(p.id));
    const inUnit = unlearned(points);
    const firstIndex = curriculum.findIndex((p) => p.id === points[0]?.id);
    const before = unlearned(curriculum.slice(0, Math.max(0, firstIndex)));
    const n = (k: number) => `${k} grammar point${k === 1 ? '' : 's'}`;
    const confirm = (title: string, list: GrammarPoint[]) =>
      Alert.alert(title, `${n(list.length)} will be marked as known and won't come up in reviews.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark as known', onPress: () => skip(list) },
      ]);
    const actions = [
      ...(before.length > 0 ? [{ text: 'Start from here', onPress: () => confirm(`Skip to ${level} Unit ${unit}?`, before) }] : []),
      ...(inUnit.length > 0 ? [{ text: 'I know this unit', onPress: () => confirm(`Mark ${level} Unit ${unit} as known?`, inUnit) }] : []),
    ];
    if (actions.length === 0) Alert.alert(`${level} Unit ${unit}`, 'Everything up to here is already learned.');
    else Alert.alert(`${level} Unit ${unit}`, undefined, [...actions, { text: 'Cancel', style: 'cancel' }]);
  };

  const travelledAt = (i: number) => {
    const r = rows[i];
    return r?.kind === 'station' && (r.status === 'learned' || r.status === 'mastered');
  };

  const isNextLesson = current && nextGlobal?.id === current.point.id && !cardsById.has(current.point.id);

  const header = current ? (
    <View style={{ gap: 4, paddingBottom: spacing.lg }}>
      <T variant="small" color={line.ink} style={{ fontWeight: '700' }} jp={false}>
        {`${level} · Unit ${current.unit} · Station ${current.number}`}
      </T>
      <T variant="title" style={{ fontSize: 40, lineHeight: 50 }} numberOfLines={1}>
        {current.point.title}
      </T>
      <T variant="muted" style={{ fontSize: 16 }} numberOfLines={2}>
        {current.point.meaning}
      </T>
      <Button
        label={isNextLesson ? 'Start lesson' : 'Open'}
        icon={isNextLesson ? <Icon name="play" size={16} color="#FFFFFF" filled /> : undefined}
        onPress={() => (isNextLesson ? router.push('/lessons') : router.push(`/grammar/${current.point.id}`))}
        style={{ marginTop: spacing.lg }}
      />
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
            placeholder="Search grammar"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[styles.search, fontStyle({ fontWeight: '500' }, false), { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
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
                  hitSlop={{ top: 5, bottom: 5 }}
                  style={({ pressed }) => [
                    styles.linePill,
                    active ? { backgroundColor: c.line, borderColor: c.line, paddingHorizontal: 14 } : { borderColor: c.line, width: 40 },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <T variant="small" color={active ? '#FFFFFF' : c.ink} style={{ fontWeight: active ? '800' : '700', fontSize: active ? 14 : 13 }} jp={false}>
                    {active ? `${l} Line` : l}
                  </T>
                </Pressable>
              );
            })}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={searching ? 'Close search' : 'Search grammar'}
          hitSlop={4}
          onPress={() => {
            setSearching(!searching);
            setQuery('');
          }}
          style={({ pressed }) => [styles.searchButton, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
        >
          <Icon name={searching ? 'close' : 'search'} size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {searching ? (
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: spacing.xxl }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: spacing.md, marginTop: spacing.xl }}>
              <Mascot size={80} mood={query.trim() ? 'sad' : 'think'} />
              <T variant="muted" style={{ textAlign: 'center' }}>
                {query.trim() ? 'No matches.' : 'Japanese, romaji or English'}
              </T>
            </View>
          }
          renderItem={({ item }) => {
            const card = cardsById.get(item.id);
            return (
              <Pressable onPress={() => router.push(`/grammar/${item.id}`)} style={({ pressed }) => [styles.result, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                <View style={[styles.lineDot, { borderColor: lines[item.level].line }]} />
                <View style={{ flex: 1 }}>
                  <T variant="body" style={{ fontSize: 17, fontWeight: '700' }}>
                    {item.title}
                  </T>
                  <T variant="small" numberOfLines={1}>
                    {item.meaning}
                  </T>
                </View>
                {card ? (
                  <Icon name={isMastered(card) ? 'star' : 'check'} size={20} filled={isMastered(card)} strokeWidth={2.8} color={isMastered(card) ? colors.gold : lines[item.level].line} />
                ) : (
                  <T variant="small" color={lines[item.level].ink} style={{ fontWeight: '800' }} jp={false}>
                    {item.level}
                  </T>
                )}
              </Pressable>
            );
          }}
        />
      ) : (
        <>
          <View style={{ paddingHorizontal: 20 }}>{header}</View>
          <FlatList
            // A fresh list per line, so switching lines opens at that line's current unit too.
            key={level}
            data={rows}
            keyExtractor={(r) => (r.kind === 'unit' ? `u${r.unit}` : r.station.point.id)}
            initialScrollIndex={startIndex}
            getItemLayout={(_data, index) => layout[index]}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: spacing.xxl }}
            renderItem={({ item, index }) => {
              if (item.kind === 'unit') {
                return (
                  <Pressable
                    onPress={() => unitOptions(item.unit, item.points)}
                    accessibilityRole="button"
                    accessibilityLabel={`Unit ${item.unit}`}
                    accessibilityHint="Skip to this unit, or mark it as known"
                    style={({ pressed }) => [styles.unitRow, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <View style={styles.trackCol}>
                      <Track solid={travelledAt(index + 1)} color={line.line} dots={dots} style={item.first ? { top: '50%', bottom: 0 } : undefined} />
                      <View style={[styles.transfer, { borderColor: line.line, backgroundColor: colors.background }]} />
                    </View>
                    <T variant="small" color={line.ink} style={{ flex: 1, fontWeight: '800' }} jp={false}>
                      {`Unit ${item.unit}`}
                    </T>
                    <T variant="small" color={colors.textFaint} jp={false}>
                      {`${item.done} of ${item.count}`}
                    </T>
                  </Pressable>
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
                  style={({ pressed }) => [styles.stationRow, isCurrent && { height: CURRENT_H }, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={styles.trackCol}>
                    {travelled ? (
                      <>
                        <Track solid color={line.line} dots={dots} style={{ top: 0, bottom: item.last ? '50%' : item.nextTravelled ? 0 : '50%' }} />
                        {!item.last && !item.nextTravelled && <Track solid={false} color={line.line} dots={dots} style={{ top: '50%', bottom: 0 }} />}
                      </>
                    ) : (
                      <Track solid={false} color={line.line} dots={dots} style={item.last ? { top: 0, bottom: '50%' } : undefined} />
                    )}
                    <StationMarker station={station} status={status} line={line} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <T
                        variant="body"
                        color={isCurrent ? colors.accentInk : status === 'ahead' ? colors.textMuted : colors.text}
                        style={{ fontSize: isCurrent ? 18 : 17, lineHeight: 24, fontWeight: isCurrent ? '800' : '700', flexShrink: 1 }}
                        numberOfLines={1}
                      >
                        {station.point.title}
                      </T>
                      {sentencesOn && sentenceDone.has(station.point.id) ? (
                        <View accessibilityLabel="Sentence written">
                          <Icon name="pencil" size={14} color={colors.correctText} strokeWidth={2.6} />
                        </View>
                      ) : null}
                    </View>
                    <T variant="small" color={status === 'ahead' ? colors.textFaint : colors.textMuted} numberOfLines={1}>
                      {isCurrent ? 'You are here' : station.point.meaning}
                    </T>
                  </View>
                </Pressable>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 20, paddingBottom: 20 },
  lines: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' },
  linePill: { height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  searchButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 2, paddingHorizontal: spacing.lg, fontSize: 17 },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: UNIT_H },
  transfer: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: STATION_H },
  trackCol: { width: 36, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', top: 0, bottom: 0, width: 4 },
  dotTrack: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'space-evenly', alignItems: 'center' },
  ring: { borderWidth: 3, borderRadius: MARKER / 2 + 3 },
  marker: { width: MARKER, height: MARKER, borderRadius: MARKER / 2, alignItems: 'center', justifyContent: 'center' },
  currentMarker: { width: CURRENT_MARKER, height: CURRENT_MARKER, borderRadius: CURRENT_MARKER / 2, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: TAP + 8, borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  lineDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
});
