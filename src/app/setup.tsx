import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickAndImportAnki, type ImportPhase } from '@/anki/importer';
import { listDecks, type DeckNode } from '@/anki/repo';
import { addStarterDeck, STARTER_DECK, STARTER_WORDS } from '@/anki/starter';
import { useAuth } from '@/auth/AuthProvider';
import { pointsForLevel } from '@/content/loader';
import { Mascot } from '@/components/Mascot';
import { PlacementFlow, type Level } from '@/components/PlacementFlow';
import { Icon } from '@/components/Icon';
import { Choice, ChoiceList, Heading, StepBar } from '@/components/SetupChoice';
import { LegalNote, NoAccountLink, SignInOptions } from '@/components/SignInOptions';
import { Button, IconTile, ProgressBar, Rule, T } from '@/components/ui';
import { KANA_LESSONS } from '@/kana/data';
import { passKanaLessons } from '@/kana/repo';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';
import { everyDayPracticeMinutes, withDailyPractice } from '@/time/goals';

const STEPS = ['level', 'kana', 'grammar', 'time', 'anki', 'account'] as const;
type Step = (typeof STEPS)[number];

const N5_POINTS = pointsForLevel('N5').length;

type KanaChoice = 'yes' | 'known' | 'later';
const KANA_CHOICES: { value: KanaChoice; title: string; detail: string }[] = [
  { value: 'yes', title: 'Yes, teach me', detail: 'Short lessons, hiragana then katakana, on your Today page' },
  { value: 'known', title: 'I can already read them', detail: 'The course is marked as done' },
  { value: 'later', title: 'Not now', detail: 'It stays on your profile for whenever you want it' },
];

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
 * Setting up a new account: how much Japanese you know (with an optional placement quiz), whether
 * to learn kana, how much grammar a day, a daily time goal, any Anki decks to bring,
 * then signing up. Each choice is saved as it's made and can be changed later in Settings.
 */
export default function Setup() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors, settings, updateSettings } = useApp();
  const { finishOnboarding } = useAuth();
  const [step, setStep] = useState<Step>('level');
  /** From the first question; suggests the kana answer (brand new: learn them). */
  const [level, setLevel] = useState<Level | null>(null);
  const [kana, setKana] = useState<KanaChoice | null>(null);
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

  /** Kana on Today only if they want lessons; "already read them" marks the course done. */
  const confirmKana = async () => {
    if (!kana) return;
    await updateSettings({ studyKana: kana === 'yes' }).catch(() => undefined);
    if (kana === 'known') {
      await passKanaLessons(
        db,
        KANA_LESSONS.map((l) => l.id),
        Date.now(),
      ).catch(() => undefined);
    }
    next();
  };

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
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.md }}>
      <View style={styles.header}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="chevronLeft" size={22} color={colors.accentInk} strokeWidth={2.6} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <StepBar step={index + 1} count={STEPS.length} />
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        {step === 'level' && (
          <PlacementFlow
            onLevel={(l) => {
              setLevel(l);
              if (!kana) setKana(l === 'new' ? 'yes' : null);
            }}
            onFinish={next}
          />
        )}

        {step === 'kana' && (
          <>
            <Heading
              title="Learn to read kana?"
              body="Hiragana and katakana are the two Japanese alphabets, 46 sounds each. Everything else builds on them."
            />
            <ChoiceList>
              {KANA_CHOICES.map((c) => (
                <Choice
                  key={c.value}
                  title={c.title}
                  detail={c.detail}
                  note={c.value === 'yes' && level === 'new' ? 'Recommended' : undefined}
                  selected={kana === c.value}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setKana(c.value);
                  }}
                />
              ))}
            </ChoiceList>
          </>
        )}

        {step === 'grammar' && (
          <>
            <Heading title="How much grammar a day?" body="Each day you get one short lesson and quiz on your new points, then reviews of the ones you’ve learned." />
            <ChoiceList>
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
            </ChoiceList>
          </>
        )}

        {step === 'time' && (
          <>
            <Heading title="Your daily time goal" body="Lessons, reviews and flashcards count, and so does time you log with the timer: reading, listening, watching." />
            <ChoiceList>
              {TIME_CHOICES.map((c) => (
                <Choice
                  key={c.value}
                  title={c.value === 0 ? 'No goal' : `${minutes(c.value)} a day`}
                  detail={c.value === 0 ? 'Just track your time' : `${c.title} · ${minutes(c.value * 7)} a week`}
                  selected={everyDayPracticeMinutes(settings.timeGoals) === c.value}
                  onPress={() => pick({ timeGoals: withDailyPractice(settings.timeGoals, c.value) })}
                />
              ))}
            </ChoiceList>
          </>
        )}

        {step === 'anki' && (
          <>
            <Heading
              title="Want a deck of words to start with?"
              body="Kaeru comes with one, or bring your own Anki decks with their progress. You can do either later from the Cards tab."
            />
            <ChoiceList radio={false}>
              <Choice
                title={STARTER_DECK}
                detail={
                  addingStarter
                    ? 'Adding the words…'
                    : hasStarter
                      ? 'Added. A few new words a day.'
                      : `The ${STARTER_WORDS.length} everyday words to learn first, with readings and example sentences`
                }
                note={hasStarter ? undefined : 'Beginners'}
                selected={hasStarter}
                onPress={() => !hasStarter && !addingStarter && addStarter()}
              />
              <Choice
                title="Import my own Anki deck"
                detail="An .apkg file: in Anki, File → Export → “Anki Deck Package”, with scheduling and media"
                selected={decks.some((d) => d.path !== STARTER_DECK)}
                onPress={() => !importing && importDeck()}
              />
            </ChoiceList>
            {decks.some((d) => d.path !== STARTER_DECK) && (
              <View>
                {decks.filter((d) => d.path !== STARTER_DECK).map((d, i) => (
                  <View key={d.path}>
                    {i > 0 && <Rule />}
                    <View style={styles.deck}>
                      <IconTile icon="check" color={colors.correct} size={28} done />
                      <T variant="body" style={{ flex: 1, fontWeight: '700' }} numberOfLines={1}>
                        {d.name}
                      </T>
                      <T variant="small">{`${d.total.toLocaleString()} cards`}</T>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {importing && (
              <View style={{ gap: spacing.sm }}>
                <T variant="small">{IMPORT_LABEL[importing.phase]}</T>
                <ProgressBar value={importing.fraction} />
              </View>
            )}
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
            onPress={step === 'kana' ? confirmKana : next}
            disabled={!!importing || addingStarter || (step === 'kana' && !kana)}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 12, minHeight: 44 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: spacing.xl, gap: 26 },
  deck: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingVertical: spacing.sm },
});
