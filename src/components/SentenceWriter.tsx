import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button, Pill, T } from '@/components/ui';
import type { GrammarPoint } from '@/content/types';
import { convertRomajiInput, finalizeInput } from '@/review/kanaInput';
import { getGrader, type GradeResult } from '@/sentence/grader';
import { hintFor } from '@/sentence/hints';
import { pointConfig } from '@/sentence/precheck';
import { saveAttempt, type AttemptSource } from '@/sentence/repo';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

/**
 * "Use it in a sentence": the learner writes a sentence with `point`, it's checked on the
 * phone and saved. `onDone` gets the verdict when they move on (Next, Later or Skip).
 */
export function SentenceWriter({ point, source, onDone }: { point: GrammarPoint; source: AttemptSource; onDone: (result: GradeResult | null) => void }) {
  const db = useSQLiteContext();
  const { colors, settings, refresh } = useApp();
  const [text, setText] = useState('');
  const [result, setResult] = useState<GradeResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [showIdea, setShowIdea] = useState(false);
  const idea = pointConfig(point.id)?.sentence_prompts?.[0];

  const check = async () => {
    setChecking(true);
    const r = await getGrader().grade(point.id, finalizeInput(text));
    await saveAttempt(db, { grammar_id: point.id, sentence: r.sentence, verdict: r.verdict, error_type: r.errorType, source, model_version: r.modelVersion, created_at: Date.now() });
    setResult(r);
    setChecking(false);
    await refresh();
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <T variant="heading">Use it in a sentence</T>
        <Pill label="BETA" tone="accent" />
      </View>
      <T variant="body">
        {point.title}: {point.meaning}
      </T>
      {point.structure[0] ? (
        <T variant="small" color={colors.textFaint}>
          {point.structure[0]}
        </T>
      ) : null}
      <T variant="body" jp={false}>{`Write your own sentence using ${point.title}.`}</T>
      {idea ? (
        showIdea ? (
          <T variant="small">{idea}</T>
        ) : (
          <Button label="Need an idea?" kind="ghost" onPress={() => setShowIdea(true)} />
        )
      ) : null}
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(settings.romajiInput ? convertRomajiInput(t) : t);
          if (result) setResult(null);
        }}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        placeholder="ここに文を書いてください"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="Your sentence"
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
      />
      {result ? (
        <View style={[styles.card, { borderColor: result.verdict === 'correct' ? colors.correctText : result.verdict === 'incorrect' ? colors.wrongText : colors.border }]}>
          <T variant="heading" color={result.verdict === 'correct' ? colors.correctText : result.verdict === 'incorrect' ? colors.wrongText : undefined} jp={false}>
            {result.verdict === 'correct' ? 'Correct ✓' : result.verdict === 'incorrect' ? 'Not quite' : 'Not sure'}
          </T>
          <T variant="body" jp={false}>
            {result.verdict === 'correct'
              ? (pointConfig(point.id)?.accept_note ?? `Nice, that's a natural use of ${point.title}.`)
              : result.verdict === 'incorrect'
                ? hintFor(point.id, result.errorType ?? 'ungrammatical')
                : "I couldn't check this one confidently. Try a simpler sentence?"}
          </T>
          {result.verdict === 'correct' ? (
            <Button label="Next" onPress={() => onDone(result)} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Later" kind="ghost" onPress={() => onDone(result)} style={{ flex: 1 }} />
              <Button label="Try again" onPress={() => setResult(null)} style={{ flex: 2 }} />
            </View>
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Skip for now" kind="ghost" onPress={() => onDone(null)} style={{ flex: 1 }} />
          <Button label="Check" onPress={check} disabled={checking || text.trim().length === 0} style={{ flex: 2 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 96, borderWidth: 2, borderRadius: 14, padding: 14, fontSize: 20, textAlignVertical: 'top' },
  card: { borderWidth: 2, borderRadius: 14, padding: 14, gap: spacing.sm },
});
