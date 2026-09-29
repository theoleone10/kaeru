import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickAndImportAnki, type ImportPhase } from '@/anki/importer';
import { deleteDeck, listDecks, type DeckNode } from '@/anki/repo';
import { Button, Card, ProgressBar, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { radius, spacing, TAP } from '@/theme/colors';

const COUNT_COLORS = { new: '#3B82F6', learn: '#DC2626', review: '#16A34A' };
const PHASE_LABEL: Record<ImportPhase, string> = {
  unpacking: 'Unpacking…',
  reading: 'Reading the collection…',
  saving: 'Saving cards and progress…',
  media: 'Copying images and audio…',
};

function Count({ n, color }: { n: number; color: string }) {
  const { colors } = useApp();
  return <Text style={[styles.count, { color: n > 0 ? color : colors.textMuted }]}>{n}</Text>;
}

export default function Decks() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors, settings } = useApp();
  const [decks, setDecks] = useState<DeckNode[] | null>(null);
  const [progress, setProgress] = useState<{ phase: ImportPhase; fraction: number } | null>(null);
  const { ankiNewPerDay, ankiMaxReviewsPerDay } = settings;

  const load = useCallback(async () => {
    setDecks(await listDecks(db, Date.now(), { newPerDay: ankiNewPerDay, reviewsPerDay: ankiMaxReviewsPerDay }));
  }, [db, ankiNewPerDay, ankiMaxReviewsPerDay]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const importDeck = async () => {
    try {
      const result = await pickAndImportAnki(db, (phase, fraction) => setProgress({ phase, fraction }));
      if (!result) return;
      const lines = [
        `${result.cards} new cards from ${result.notes} notes${result.media ? `, ${result.media} media files` : ''}.`,
        result.reviews ? `${result.reviews} past reviews imported with your progress.` : '',
        result.updated ? `${result.updated} cards updated with newer progress from Anki.` : '',
        result.keptNewer ? `${result.keptNewer} cards kept this app’s newer progress.` : '',
      ].filter(Boolean);
      Alert.alert(`Imported ${result.fileName}`, lines.join('\n'));
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      await load();
    }
  };

  const options = (d: DeckNode) =>
    Alert.alert(d.path, `${d.total} cards`, [
      { text: 'Study', onPress: () => router.push({ pathname: '/anki/[deck]', params: { deck: encodeURIComponent(d.path) } }) },
      {
        text: 'Delete deck',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Delete ${d.path}?`, `This removes its ${d.total} cards${d.depth === 0 ? ' and subdecks' : ''} and your progress on them from this app. Your Anki collection isn’t affected.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await deleteDeck(db, d.path);
                await load();
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const totals = (decks ?? []).filter((d) => d.depth === 0).reduce((a, d) => ({ n: a.n + d.newCount, l: a.l + d.learnCount, r: a.r + d.reviewCount }), { n: 0, l: 0, r: 0 });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View>
          <T variant="title">Decks</T>
          <T variant="muted">Your Anki decks</T>
        </View>
        <Pressable
          onPress={importDeck}
          disabled={!!progress}
          accessibilityRole="button"
          accessibilityLabel="Import an Anki deck"
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surfaceAlt, opacity: progress ? 0.4 : pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="add" size={28} color={colors.text} />
        </Pressable>
      </View>

      {progress && (
        <Card style={{ gap: spacing.sm }}>
          <T variant="body">{PHASE_LABEL[progress.phase]}</T>
          <ProgressBar value={progress.fraction} />
          <T variant="small">Big decks with lots of audio can take a minute. Keep the app open.</T>
        </Card>
      )}

      {decks && decks.length === 0 && !progress && (
        <Card style={{ gap: spacing.md }}>
          <T variant="heading">Bring your Anki decks</T>
          <T variant="body">Your cards, scheduling progress, review history, images and audio all come across.</T>
          <T variant="small">
            1. In Anki on your computer: File → Export → “Anki Deck Package (*.apkg)”, tick “Include scheduling information” and “Include media”.{'\n'}
            2. Save it somewhere your phone can reach (iCloud Drive, Google Drive, AirDrop to Files).{'\n'}
            3. Tap Import and pick the file. Importing a newer export of the same deck later updates it rather than duplicating it.
          </T>
          <Button label="Import a deck" onPress={importDeck} />
        </Card>
      )}

      {decks && decks.length > 0 && (
        <Card style={{ paddingVertical: spacing.sm, gap: 0 }}>
          <View style={[styles.row, { minHeight: 32 }]}>
            <T variant="small" style={{ flex: 1 }}>
              Deck
            </T>
            <T variant="small" style={styles.countHead}>
              New
            </T>
            <T variant="small" style={styles.countHead}>
              Learn
            </T>
            <T variant="small" style={styles.countHead}>
              Due
            </T>
          </View>
          {decks.map((d) => (
            <Pressable
              key={d.path}
              onPress={() => router.push({ pathname: '/anki/[deck]', params: { deck: encodeURIComponent(d.path) } })}
              onLongPress={() => options(d)}
              accessibilityRole="button"
              accessibilityLabel={`${d.path}: ${d.newCount} new, ${d.learnCount} learning, ${d.reviewCount} due`}
              accessibilityHint="Opens a study session. Long-press for options."
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1, borderTopColor: colors.border }]}
            >
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: d.depth * spacing.lg, gap: spacing.xs }}>
                {d.depth > 0 && <Ionicons name="return-down-forward" size={14} color={colors.textMuted} />}
                <T variant="body" numberOfLines={1} style={{ flexShrink: 1, fontWeight: d.depth === 0 ? '600' : '400' }}>
                  {d.name}
                </T>
              </View>
              <Count n={d.newCount} color={COUNT_COLORS.new} />
              <Count n={d.learnCount} color={COUNT_COLORS.learn} />
              <Count n={d.reviewCount} color={COUNT_COLORS.review} />
            </Pressable>
          ))}
        </Card>
      )}

      {decks && decks.length > 0 && (
        <T variant="small" style={{ textAlign: 'center' }}>
          Today: {totals.n} new · {totals.l} learning · {totals.r} due. Long-press a deck to delete it. New cards per day: Settings → Anki decks.
        </T>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: TAP, height: TAP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: TAP, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'transparent' },
  count: { width: 44, textAlign: 'right', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  countHead: { width: 44, textAlign: 'right' },
});
