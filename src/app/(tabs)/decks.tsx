import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exportDeck } from '@/anki/exporter';
import { pickAndImportAnki, type ImportPhase } from '@/anki/importer';
import { deleteDeck, listDecks, type DeckNode } from '@/anki/repo';
import { addStarterDeck, STARTER_DECK, STARTER_WORDS, starterWordsAdded } from '@/anki/starter';
import { Icon } from '@/components/Icon';
import { Mascot } from '@/components/Mascot';
import { Button, IconButton, ProgressBar, Section, T } from '@/components/ui';
import type { Palette } from '@/theme/colors';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

/** New / Learn / Due: blue, red, green (the counts), with darker inks for the column heads. */
const countColors = (c: Palette) => ({
  new: { n: c.blue, head: c.blueText },
  learn: { n: c.wrong, head: c.wrongText },
  review: { n: c.correct, head: c.correctText },
});
const PHASE_LABEL: Record<ImportPhase, string> = {
  unpacking: 'Unpacking…',
  reading: 'Reading the collection…',
  saving: 'Saving cards and progress…',
  media: 'Copying images and audio…',
};

function Count({ n, color, small, wide }: { n: number; color: string; small?: boolean; wide?: boolean }) {
  const { colors } = useApp();
  return (
    <T variant="body" jp={false} color={n > 0 ? color : colors.textFaint} style={[styles.count, wide && { width: 48 }, n === 0 && { opacity: 0.55 }, small && { fontSize: 15 }]}>
      {n}
    </T>
  );
}

export default function Decks() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors, settings } = useApp();
  const [decks, setDecks] = useState<DeckNode[] | null>(null);
  const [progress, setProgress] = useState<{ phase: ImportPhase; fraction: number } | null>(null);
  /** Starter words not in the collection (all of them until it's added). */
  const [starterMissing, setStarterMissing] = useState(0);
  const [addingStarter, setAddingStarter] = useState(false);
  const { ankiNewPerDay, ankiMaxReviewsPerDay } = settings;

  const load = useCallback(async () => {
    setDecks(await listDecks(db, Date.now(), { newPerDay: ankiNewPerDay, reviewsPerDay: ankiMaxReviewsPerDay }));
    setStarterMissing(STARTER_WORDS.length - (await starterWordsAdded(db)));
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

  const addStarter = async () => {
    setAddingStarter(true);
    try {
      const n = await addStarterDeck(db);
      Alert.alert(STARTER_DECK, `${n} words added. They come in a few at a time: your new-cards-per-day limit sets the pace.`);
    } catch (e) {
      Alert.alert('Could not add the deck', e instanceof Error ? e.message : String(e));
    } finally {
      setAddingStarter(false);
      await load();
    }
  };

  const openLimits = (d: DeckNode) => router.push({ pathname: '/anki/limits', params: { deck: encodeURIComponent(d.path) } });
  const addCards = (path?: string) => router.push({ pathname: '/anki/note', params: path ? { deck: encodeURIComponent(path) } : {} });

  const doExport = async (d: DeckNode) => {
    try {
      await exportDeck(db, d.path);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const addMenu = () =>
    Alert.alert('Flashcards', undefined, [
      ...((decks?.length ?? 0) > 0 ? [{ text: 'Add cards', onPress: () => addCards() }] : []),
      { text: 'New deck', onPress: () => router.push('/anki/new-deck') },
      { text: 'Import an Anki deck', onPress: importDeck },
      ...(starterMissing > 0 ? [{ text: `Add ${STARTER_DECK} (beginner words)`, onPress: addStarter }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const options = (d: DeckNode) =>
    Alert.alert(d.path, `${d.total} cards`, [
      { text: 'Add cards', onPress: () => addCards(d.path) },
      ...(d.total > 0 ? [{ text: 'Export as Anki deck', onPress: () => doExport(d) }] : []),
      { text: 'Rename or deck options', onPress: () => openLimits(d) },
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

  const cc = countColors(colors);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <T variant="title" style={{ fontSize: 34, lineHeight: 40 }}>
          Flashcards
        </T>
        <IconButton label="Add cards, a new deck, or import" tone="accent" onPress={addMenu}>
          <Icon name="plus" size={22} color={colors.accentInk} strokeWidth={2.4} />
        </IconButton>
      </View>

      {progress && (
        <Section label={PHASE_LABEL[progress.phase]}>
          <ProgressBar value={progress.fraction} color={colors.blue} />
          <T variant="small">Keep the app open.</T>
        </Section>
      )}

      {decks && decks.length === 0 && !progress && (
        <View style={{ gap: spacing.xl }}>
          <View style={styles.frog}>
            <Mascot size={84} mood="happy" bounce />
            <T variant="heading" style={{ flex: 1, fontSize: 21, lineHeight: 28 }}>
              Make cards, or bring your Anki decks
            </T>
          </View>
          <Section label="New to Japanese?">
            <T variant="body" color={colors.textMuted}>{`${STARTER_DECK}: the ${STARTER_WORDS.length} everyday words to learn first, each with its reading, meaning and an example sentence.`}</T>
            <Button label="Add the starter deck" kind="success" onPress={addStarter} loading={addingStarter} style={{ marginTop: spacing.xs }} />
          </Section>
          <Section label="How">
            {[
              'In Anki on your computer: File → Export → “Anki Deck Package”, with scheduling and media included.',
              'Save it where your phone can reach it, like iCloud Drive or AirDrop to Files.',
              'Tap Import and pick the file.',
            ].map((t, i) => (
              <View key={i} style={styles.howRow}>
                <View style={[styles.howNum, { backgroundColor: colors.accentSoft }]}>
                  <T variant="small" color={colors.accentInk} style={{ fontWeight: '800' }} jp={false}>
                    {i + 1}
                  </T>
                </View>
                <T variant="body" color={colors.textMuted} style={{ flex: 1 }}>
                  {t}
                </T>
              </View>
            ))}
          </Section>
          <View style={{ gap: spacing.md }}>
            <Button label="Import a deck" onPress={importDeck} />
            <Button label="Start a new deck" kind="secondary" onPress={() => router.push('/anki/new-deck')} />
          </View>
        </View>
      )}

      {decks && decks.length > 0 && (
        <View>
          <View style={[styles.deckRow, { minHeight: 30 }]}>
            <T variant="small" style={[styles.countHead, { flex: 1, textAlign: 'left' }]}>
              Decks
            </T>
            <T variant="small" style={styles.countHead} color={cc.new.head}>
              New
            </T>
            <T variant="small" style={[styles.countHead, { width: 48 }]} color={cc.learn.head}>
              Learn
            </T>
            <T variant="small" style={styles.countHead} color={cc.review.head}>
              Due
            </T>
            <View style={{ width: 32 }} />
          </View>
          {ordered.map((d) => {
            const top = d.depth === 0;
            const todo = d.newCount + d.learnCount + d.reviewCount;
            return (
              // The row and its options button are siblings, so neither button sits inside the other.
              <View
                key={d.path}
                style={[styles.deckRow, top ? styles.topRow : styles.subRow, top && { borderTopColor: colors.border, borderTopWidth: 1 }]}
              >
                <Pressable
                  onPress={() => study(d)}
                  onLongPress={() => options(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.path}: ${d.newCount} new, ${d.learnCount} learning, ${d.reviewCount} due`}
                  accessibilityHint="Long-press for options"
                  style={({ pressed }) => [styles.deckPress, { paddingLeft: (d.depth > 0 ? 18 : 0) + Math.max(0, d.depth - 1) * spacing.lg, opacity: pressed ? 0.6 : 1 }]}
                >
                  <View style={styles.name}>
                    {!top && <View style={[styles.dash, { backgroundColor: colors.textFaint }]} />}
                    <T variant="body" color={todo > 0 ? colors.text : colors.textMuted} numberOfLines={1} style={{ flex: 1, fontSize: top ? 18 : 16, lineHeight: top ? 24 : 22, fontWeight: top ? '700' : '500' }}>
                      {d.name}
                    </T>
                  </View>
                  <Count n={d.newCount} color={cc.new.n} small={!top} />
                  <Count n={d.learnCount} color={cc.learn.n} small={!top} wide />
                  <Count n={d.reviewCount} color={cc.review.n} small={!top} />
                </Pressable>
                {top ? (
                  <Pressable onPress={() => openLimits(d)} accessibilityRole="button" accessibilityLabel={`Options for ${d.name}`} hitSlop={10} style={styles.gear}>
                    <Icon name="more" size={20} color={colors.textFaint} filled />
                  </Pressable>
                ) : (
                  <View style={{ width: 32 }} />
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 22, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  frog: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  howNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  deckRow: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  deckPress: { flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  topRow: { minHeight: 58 },
  subRow: { minHeight: 46 },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dash: { width: 8, height: 2, borderRadius: 1, opacity: 0.6 },
  gear: { width: 32, height: 32, alignItems: 'flex-end', justifyContent: 'center' },
  count: { width: 44, textAlign: 'right', fontSize: 16, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  countHead: { width: 44, textAlign: 'right', fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
