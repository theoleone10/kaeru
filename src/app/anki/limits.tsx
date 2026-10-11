import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { deleteDeck, getDeckLimits, setDeckLimits, type DeckLimits } from '@/anki/repo';
import { Button, Section, Stepper, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { LIMITS } from '@/state/settings';
import { spacing, TAP } from '@/theme/colors';

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
    <View style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="body">{label}</T>
          {value == null && <T variant="small">Default</T>}
        </View>
        <Stepper value={value ?? fallback} min={min} max={max} step={step} onChange={onChange} />
      </View>
      {value != null && <Button label={`Use the default (${fallback})`} kind="ghost" small onPress={() => onChange(null)} />}
    </View>
  );
}

/** Deck options: its own new-card and review limits per day (like Anki's), and deleting it. */
export default function DeckOptionsScreen() {
  const db = useSQLiteContext();
  const { colors, settings } = useApp();
  const { deck } = useLocalSearchParams<{ deck: string }>();
  const path = decodeURIComponent(deck ?? '');
  const [limits, setLimits] = useState<DeckLimits | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getDeckLimits(db, path).then((l) => alive && setLimits(l));
    db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM anki_cards WHERE deck_id IN (SELECT id FROM anki_decks WHERE name = ? OR substr(name, 1, ?) = ?)',
      path,
      path.length + 2,
      `${path}::`,
    ).then((r) => alive && setTotal(r?.n ?? 0));
    return () => {
      alive = false;
    };
  }, [db, path]);

  const update = (patch: Partial<DeckLimits>) => {
    if (!limits) return;
    const next = { ...limits, ...patch };
    setLimits(next);
    setDeckLimits(db, path, next).catch(() => undefined);
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

  const parts = path.split('::');
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}>
      <Stack.Screen options={{ title: parts[parts.length - 1] || 'Deck options' }} />
      <View style={styles.row}>
        <T variant="small" style={{ flex: 1 }}>
          {parts.length > 1 ? path.replaceAll('::', ' › ') : ''}
        </T>
        {total != null && <T variant="heading">{`${total.toLocaleString()} cards`}</T>}
      </View>
      {limits && (
        <Section label="Per day">
          <LimitRow
            label="New cards"
            value={limits.newPerDay}
            fallback={settings.ankiNewPerDay}
            step={5}
            min={LIMITS.ankiNewPerDay.min}
            max={LIMITS.ankiNewPerDay.max}
            onChange={(v) => update({ newPerDay: v })}
          />
          <LimitRow
            label="Max reviews"
            value={limits.reviewsPerDay}
            fallback={settings.ankiMaxReviewsPerDay}
            step={50}
            min={0}
            max={2000}
            onChange={(v) => update({ reviewsPerDay: v })}
          />
        </Section>
      )}

      <Button label="Delete deck" kind="danger" onPress={confirmDelete} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
});
