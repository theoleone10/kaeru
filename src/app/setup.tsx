import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickAndImportAnki, type ImportPhase } from '@/anki/importer';
import { listDecks, type DeckNode } from '@/anki/repo';
import { addStarterDeck, STARTER_DECK, STARTER_WORDS } from '@/anki/starter';
import { useAuth } from '@/auth/AuthProvider';
import { pointsForLevel } from '@/content/loader';
import { Mascot } from '@/components/Mascot';
import { PlacementFlow } from '@/components/PlacementFlow';
import { Choice, Heading } from '@/components/SetupChoice';
import { LegalNote, NoAccountLink, SignInOptions } from '@/components/SignInOptions';
import { Button, IconButton, ProgressBar, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { radius, spacing } from '@/theme/colors';
import { everyDayPracticeMinutes, withDailyPractice } from '@/time/goals';

const STEPS = ['level', 'grammar', 'time', 'anki', 'account'] as const;
type Step = (typeof STEPS)[number];

const N5_POINTS = pointsForLevel('N5').length;

const GRAMMAR_CHOICES = [
  { value: 1, title: 'Easy-going', note: 'A gentle start' },
  { value: 2, title: 'Steady', note: 'Recommended' },
  { value: 3, title: 'Serious', note: 'Faster, more reviews' },
  { value: 5, title: 'Intense', note: 'The most reviews' },
];

const TIME_CHOICES = [
  { value: 15, title: 'Casual' },
  { value: 30, title: 'Regular' },
  { value: 60, title: 'Serious' },
  { value: 120, title: 'Intense' },
  { value: 0, title: 'No goal' },
];

const IMPORT_LABEL: Record<ImportPhase, string> = {
  unpacking: 'Unpacking…',
  reading: 'Reading the collection…',
  saving: 'Saving cards and progress…',
  media: 'Copying images and audio…',
};

function minutes(m: number): string {
  if (m < 60) return `${m} min`;
  return m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${Math.floor(m / 60)}h ${m % 60}m`;
}


/**
 * Setting up a new account: where to start on the grammar lines (a placement quiz), how much grammar a day, a daily time goal, any Anki decks to bring,
 * then signing up. Each choice is saved as it's made and can be changed later in Settings.
 */
export default function Setup() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors, settings, updateSettings } = useApp();
  const { finishOnboarding } = useAuth();
  const [step, setStep] = useState<Step>('level');
  const [decks, setDecks] = useState<DeckNode[]>([]);
  const [importing, setImporting] = useState<{ phase: ImportPhase; fraction: number } | null>(null);

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)]);
  const back = () => (index === 0 ? router.back() : setStep(STEPS[index - 1]));

  const pick = (patch: Parameters<typeof updateSettings>[0]) => {
    Haptics.selectionAsync().catch(() => undefined);
    updateSettings(patch).catch(() => undefined);
  };

  const [addingStarter, setAddingStarter] = useState(false);
  const showDecks = async () => {
    const all = await listDecks(db, Date.now(), { newPerDay: settings.ankiNewPerDay, reviewsPerDay: settings.ankiMaxReviewsPerDay });
    setDecks(all.filter((d) => d.depth === 0));
  };
  const addStarter = async () => {
    setAddingStarter(true);
    try {
      await addStarterDeck(db);
      await showDecks();
    } catch (e) {
      Alert.alert('Could not add the deck', e instanceof Error ? e.message : String(e));
    } finally {
      setAddingStarter(false);
    }
  };
  const hasStarter = decks.some((d) => d.path === STARTER_DECK);

  const importDeck = async () => {
    try {
      const result = await pickAndImportAnki(db, (phase, fraction) => setImporting({ phase, fraction }));
      if (!result) return;
      await showDecks();
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconButton label="Back" onPress={back}>
          <Ionicons name="chevron-back" size={26} color={colors.textMuted} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <ProgressBar value={(index + 1) / STEPS.length} />
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        {step === 'level' && <PlacementFlow onFinish={next} />}

        {step === 'grammar' && (
          <>
            <Heading title="How much grammar a day?" body="Each day you get one short lesson and quiz on your new points, then reviews of the ones you’ve learned." />
            <View style={styles.choices} accessibilityRole="radiogroup">
              {GRAMMAR_CHOICES.map((c) => (
                <Choice
                  key={c.value}
                  title={`${c.value} new point${c.value === 1 ? '' : 's'}`}
                  detail={`${c.title} · all of N5 in about ${Math.ceil(N5_POINTS / c.value / 7)} weeks`}
                  note={c.value === 2 ? c.note : undefined}
                  selected={settings.dailyNewGrammar === c.value}
                  onPress={() => pick({ dailyNewGrammar: c.value })}
                />
              ))}
            </View>
          </>
        )}

        {step === 'time' && (
          <>
            <Heading title="Your daily time goal" body="Lessons, reviews and flashcards count, and so does time you log with the timer: reading, listening, watching." />
            <View style={styles.choices} accessibilityRole="radiogroup">
              {TIME_CHOICES.map((c) => (
                <Choice
                  key={c.value}
                  title={c.value === 0 ? 'No goal' : `${minutes(c.value)} a day`}
                  detail={c.value === 0 ? 'Just track your time' : `${c.title} · ${minutes(c.value * 7)} a week`}
                  selected={everyDayPracticeMinutes(settings.timeGoals) === c.value}
                  onPress={() => pick({ timeGoals: withDailyPractice(settings.timeGoals, c.value) })}
                />
              ))}
            </View>
          </>
        )}

        {step === 'anki' && (
          <>
            <Heading
              title="Learn words with flashcards"
              body="Start with the words beginners need most, or bring your own Anki decks with their progress. You can do either later from the Cards tab."
            />
            {!hasStarter && (
              <Choice
                title={STARTER_DECK}
                detail={`The ${STARTER_WORDS.length} everyday words to learn first, with readings and example sentences`}
                note="Beginners"
                selected={false}
                onPress={addStarter}
              />
            )}
            {addingStarter && <T variant="small">Adding the words…</T>}
            {decks.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                {decks.map((d) => (
                  <View key={d.path} style={[styles.deck, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.correct} />
                    <T variant="body" style={{ flex: 1, fontWeight: '800' }} numberOfLines={1}>
                      {d.name}
                    </T>
                    <T variant="small">{`${d.total.toLocaleString()} cards`}</T>
                  </View>
                ))}
              </View>
            )}
            {importing ? (
              <View style={{ gap: spacing.sm }}>
                <T variant="small">{IMPORT_LABEL[importing.phase]}</T>
                <ProgressBar value={importing.fraction} />
              </View>
            ) : (
              <Button
                label="Import an Anki deck"
                kind="secondary"
                icon={<Ionicons name="download-outline" size={20} color={colors.accent} />}
                onPress={importDeck}
              />
            )}
            <T variant="small">In Anki: File → Export → “Anki Deck Package (*.apkg)”, with scheduling information and media included.</T>
          </>
        )}

        {step === 'account' && (
          <>
            <View style={{ alignItems: 'center' }}>
              <Mascot size={96} mood="cheer" bounce />
            </View>
            <Heading title="Save your progress" body="Create an account to back up your progress and pick it up on another phone." />
            <SignInOptions onSignedIn={finishOnboarding} newAccount />
          </>
        )}

        <View style={{ flex: 1 }} />

        {step === 'level' ? null : step === 'account' ? (
          <View style={{ gap: spacing.md }}>
            <NoAccountLink onPress={finishOnboarding} />
            <LegalNote />
          </View>
        ) : (
          <Button
            label={step === 'anki' && decks.length === 0 ? 'Skip for now' : 'Continue'}
            kind={step === 'anki' && decks.length === 0 ? 'ghost' : 'primary'}
            onPress={next}
            disabled={!!importing}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  content: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
  choices: { gap: spacing.md },
  deck: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
