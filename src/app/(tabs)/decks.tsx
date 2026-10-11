import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickAndImportAnki, type ImportPhase } from '@/anki/importer';
import { deleteDeck, listDecks, type DeckNode } from '@/anki/repo';
import { Mascot } from '@/components/Mascot';
import { Button, IconButton, ProgressBar, Section, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

const COUNT_COLORS = { new: '#2F7FC1', learn: '#C8562F', review: '#2E8B3E' };
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

  const openLimits = (d: DeckNode) => router.push({ pathname: '/anki/limits', params: { deck: encodeURIComponent(d.path) } });

  const options = (d: DeckNode) =>
    Alert.alert(d.path, `${d.total} cards`, [
      { text: 'Deck options', onPress: () => openLimits(d) },
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


  // Each top-level deck, then its subdecks under it.
  const ordered = (decks ?? []).filter((d) => d.depth === 0).flatMap((top) => [top, ...(decks ?? []).filter((d) => d.path.startsWith(`${top.path}::`))]);
  const study = (d: DeckNode) => router.push({ pathname: '/anki/[deck]', params: { deck: encodeURIComponent(d.path) } });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <T variant="title" style={{ fontSize: 32, lineHeight: 38 }}>
          Flashcards
        </T>
        <IconButton label="Import an Anki deck" onPress={importDeck}>
          <Ionicons name="add" size={26} color={colors.textMuted} />
        </IconButton>
      </View>

      {progress && (
        <Section label={PHASE_LABEL[progress.phase]}>
          <ProgressBar value={progress.fraction} color={colors.blue} />
          <T variant="small">Keep the app open.</T>
        </Section>
      )}

      {decks && decks.length === 0 && !progress && (
        <View style={{ gap: spacing.lg }}>
          <View style={styles.frog}>
            <Mascot size={84} mood="happy" bounce />
            <T variant="heading" style={{ flex: 1, fontWeight: '900' }}>
              Bring your Anki decks
            </T>
          </View>
          <Section label="How">
            {[
              'In Anki on your computer: File → Export → “Anki Deck Package”, with scheduling and media included.',
              'Save it where your phone can reach it, like iCloud Drive or AirDrop to Files.',
              'Tap Import and pick the file.',
            ].map((t, i) => (
              <View key={i} style={styles.howRow}>
                <View style={[styles.howNum, { backgroundColor: colors.accentSoft }]}>
                  <T variant="small" color={colors.accent} style={{ fontWeight: '900' }}>
                    {i + 1}
                  </T>
                </View>
                <T variant="body" style={{ flex: 1 }}>
                  {t}
                </T>
              </View>
            ))}
          </Section>
          <Button label="Import a deck" onPress={importDeck} />
        </View>
      )}

      {decks && decks.length > 0 && (
        <View>
          <View style={styles.deckRow}>
            <View style={{ flex: 1 }} />
            <T variant="small" style={styles.countHead} color={COUNT_COLORS.new}>
              New
            </T>
            <T variant="small" style={styles.countHead} color={COUNT_COLORS.learn}>
              Learn
            </T>
            <T variant="small" style={styles.countHead} color={COUNT_COLORS.review}>
              Due
            </T>
            <View style={{ width: 32 }} />
          </View>
          {ordered.map((d) => {
            const top = d.depth === 0;
            const todo = d.newCount + d.learnCount + d.reviewCount;
            return (
              <Pressable
                key={d.path}
                onPress={() => study(d)}
                onLongPress={() => options(d)}
                accessibilityRole="button"
                accessibilityLabel={`${d.path}: ${d.newCount} new, ${d.learnCount} learning, ${d.reviewCount} due`}
                accessibilityHint="Long-press for options"
                style={({ pressed }) => [styles.deckRow, top && styles.topRow, top && d !== ordered[0] && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, { paddingLeft: d.depth * spacing.lg, opacity: pressed ? 0.6 : 1 }]}
              >
                <T variant={top ? 'heading' : 'body'} color={top || todo > 0 ? colors.text : colors.textMuted} numberOfLines={1} style={{ flex: 1, fontWeight: top ? '900' : '700' }}>
                  {d.name}
                </T>
                <Count n={d.newCount} color={COUNT_COLORS.new} />
                <Count n={d.learnCount} color={COUNT_COLORS.learn} />
                <Count n={d.reviewCount} color={COUNT_COLORS.review} />
                {top ? (
                  <Pressable onPress={() => openLimits(d)} accessibilityRole="button" accessibilityLabel={`Options for ${d.name}`} hitSlop={10} style={styles.gear}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                  </Pressable>
                ) : (
                  <View style={{ width: 32 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  frog: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  howNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  deckRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: spacing.xs },
  topRow: { minHeight: 56, marginTop: spacing.xs },
  gear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  count: { width: 44, textAlign: 'right', fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  countHead: { width: 44, textAlign: 'right', fontWeight: '900' },
});
