import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { cleanDeckPath, renameDeck } from '@/anki/notes';
import { exportDeck } from '@/anki/exporter';
import { deleteDeck, getDeckLimits, getTodayNewLimit, newLearnedToday, setDeckLimits, setTodayNewLimit, type DeckLimits } from '@/anki/repo';
import { BottomBar, Input } from '@/components/FormControls';
import { Button, Rule, Section, Stepper, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { LIMITS } from '@/state/settings';
import { spacing } from '@/theme/colors';

/** One limit: the deck's own value, or the default from Settings until it's changed. */
function LimitRow({
  label,
  value,
  fallback,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  fallback: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number | null) => void;
}) {
  return (
    <View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <T variant="body" style={styles.rowTitle}>
            {label}
          </T>
          {value == null && <T variant="small" style={{ fontSize: 12, lineHeight: 16 }}>Default</T>}
        </View>
        <Stepper value={value ?? fallback} min={min} max={max} step={step} onChange={onChange} />
      </View>
      {value != null && <Button label={`Use the default (${fallback})`} kind="ghost" small onPress={() => onChange(null)} style={{ alignSelf: 'flex-start', marginBottom: spacing.sm }} />}
    </View>
  );
}

/** Deck options: its own new-card and review limits per day (like Anki's), and deleting it. */
export default function DeckOptionsScreen() {
  const db = useSQLiteContext();
  const { colors, settings } = useApp();
  const { deck } = useLocalSearchParams<{ deck: string }>();
  const path = decodeURIComponent(deck ?? '');
  const [name, setName] = useState(path);
  const [limits, setLimits] = useState<DeckLimits | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  /** New cards for today only (null: the usual number), and how many were learned today. */
  const [today, setToday] = useState<{ newCards: number | null; learned: number } | null>(null);

  const [exporting, setExporting] = useState(false);

  // On focus, so the card count is right after adding cards from here.
  useFocusEffect(
    useCallback(() => {
    let alive = true;
    getDeckLimits(db, path).then((l) => alive && setLimits(l));
    const now = Date.now();
    Promise.all([getTodayNewLimit(db, path, now), newLearnedToday(db, path, now)]).then(([newCards, learned]) => alive && setToday({ newCards, learned }));
    db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM anki_cards WHERE deck_id IN (SELECT id FROM anki_decks WHERE name = ? OR substr(name, 1, ?) = ?)',
      path,
      path.length + 2,
      `${path}::`,
    ).then((r) => alive && setTotal(r?.n ?? 0));
    return () => {
      alive = false;
    };
  }, [db, path]),
  );

  const doExport = async () => {
    setExporting(true);
    try {
      await exportDeck(db, path);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const update = (patch: Partial<DeckLimits>) => {
    if (!limits) return;
    const next = { ...limits, ...patch };
    setLimits(next);
    setDeckLimits(db, path, next).catch(() => undefined);
  };

  const updateToday = (newCards: number | null) => {
    if (!today) return;
    setToday({ ...today, newCards });
    setTodayNewLimit(db, path, newCards, Date.now()).catch(() => undefined);
  };

  const confirmDelete = () =>
    Alert.alert(
      `Delete ${path}?`,
      `This removes ${total != null ? `its ${total.toLocaleString()} cards` : 'its cards'}, any subdecks, and your progress on them from this app. Your Anki collection isn’t affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDeck(db, path);
            router.back();
          },
        },
      ],
    );

  const rename = async () => {
    try {
      const to = await renameDeck(db, path, name);
      setName(to);
      router.setParams({ deck: encodeURIComponent(to) });
    } catch (e) {
      Alert.alert('Could not rename the deck', e instanceof Error ? e.message : String(e));
      setName(path);
    }
  };
  const renamed = cleanDeckPath(name) !== '' && cleanDeckPath(name) !== path;

  const parts = path.split('::');
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: parts[parts.length - 1] || 'Deck options' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <T variant="small" style={{ flex: 1 }}>
            {parts.length > 1 ? path.replaceAll('::', ' › ') : ''}
          </T>
          {total != null && (
            <T variant="heading" style={{ fontSize: 22, lineHeight: 28 }} jp={false}>
              {total.toLocaleString()}
              <T variant="muted" style={{ fontSize: 14 }}>{' cards'}</T>
            </T>
          )}
        </View>
        <Section label="Name">
          <Input value={name} onChangeText={setName} onSubmitEditing={() => renamed && rename()} returnKeyType="done" autoCorrect={false} accessibilityLabel="Deck name" />
          {renamed ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Cancel" kind="ghost" small onPress={() => setName(path)} style={{ flex: 1 }} />
              <Button label="Rename" small onPress={rename} style={{ flex: 1 }} />
            </View>
          ) : (
            <T variant="small" style={{ fontSize: 12, lineHeight: 16 }}>
              Subdecks move with it. Use :: to put it inside another deck.
            </T>
          )}
        </Section>
        {limits && (
          <Section label="Per day" style={{ gap: 6 }}>
            <View>
              <Rule />
              <LimitRow
                label="New cards"
                value={limits.newPerDay}
                fallback={settings.ankiNewPerDay}
                step={1}
                min={LIMITS.ankiNewPerDay.min}
                max={LIMITS.ankiNewPerDay.max}
                onChange={(v) => update({ newPerDay: v })}
              />
              <Rule />
              <LimitRow
                label="Max reviews"
                value={limits.reviewsPerDay}
                fallback={settings.ankiMaxReviewsPerDay}
                step={50}
                min={0}
                max={2000}
                onChange={(v) => update({ reviewsPerDay: v })}
              />
              <Rule />
            </View>
          </Section>
        )}
        {limits && today && (
          <Section label="Just for today" style={{ gap: 6 }}>
            <View>
              <Rule />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <T variant="body" style={styles.rowTitle}>
                    New cards today
                  </T>
                  <T variant="small" style={{ fontSize: 12, lineHeight: 16 }}>
                    {today.newCards == null ? 'As usual' : `${today.learned} learned so far`}
                  </T>
                </View>
                <Stepper
                  value={today.newCards ?? limits.newPerDay ?? settings.ankiNewPerDay}
                  min={0}
                  max={LIMITS.ankiNewPerDay.max}
                  step={5}
                  onChange={(v) => updateToday(v)}
                />
              </View>
              {today.newCards != null && (
                <Button
                  label={`Back to usual (${limits.newPerDay ?? settings.ankiNewPerDay})`}
                  kind="ghost"
                  small
                  onPress={() => updateToday(null)}
                  style={{ alignSelf: 'flex-start', marginBottom: spacing.sm }}
                />
              )}
              <Rule />
            </View>
            <T variant="small" style={{ fontSize: 12 }}>
              Want a lighter or a bigger day? This changes only today; tomorrow the deck goes back to its usual number.
            </T>
          </Section>
        )}

        <Section label="Export">
          <T variant="small" style={{ fontSize: 12 }}>
            An .apkg with your progress, review history and media. Opens in Anki, AnkiMobile and AnkiDroid, or import it back here.
          </T>
        </Section>

        <Button label="Delete deck" kind="danger" onPress={confirmDelete} />
      </ScrollView>
      <BottomBar>
        <Button label="Add cards" onPress={() => router.push({ pathname: '/anki/note', params: { deck: encodeURIComponent(path) } })} />
        <Button label="Export as Anki deck" kind="secondary" onPress={doExport} loading={exporting} disabled={total === 0} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: spacing.xl, gap: spacing.xl },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 4 },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
