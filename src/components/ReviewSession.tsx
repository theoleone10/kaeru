import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPoint } from '../content/loader';
import type { Example, GrammarPoint } from '../content/types';
import { getAllCards, getExampleSeen, saveReview, undoReview } from '../db/repo';
import { checkAnswer, isRetry, type CheckResult } from '../review/answerCheck';
import { convertRomajiInput, finalizeInput } from '../review/kanaInput';
import { pickExample } from '../srs/exampleRotation';
import { buildQueue, nextDueAt } from '../srs/queue';
import { gradeCard, type StoredCard } from '../srs/scheduler';
import { useApp } from '../state/AppProvider';
import { useAutoTrack } from '../time/useAutoTrack';
import { radius, spacing, TAP } from '../theme/colors';
import { ClozeSentence } from './Furigana';
import { Button, Card, T } from './ui';

interface Current {
  card: StoredCard;
  point: GrammarPoint;
  example: Example;
  shownAt: number;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'answering'; retry?: Exclude<CheckResult, { kind: 'correct' | 'wrong' | 'empty' }> }
  | { kind: 'result'; correct: boolean; answer: string; logId: number }
  | { kind: 'done'; nextDue: number | null };

export interface SessionSummary {
  reviewed: number;
  correct: number;
}

function retryMessage(r: NonNullable<Extract<Phase, { kind: 'answering' }>['retry']>): string {
  switch (r.kind) {
    case 'alternative':
      return r.note;
    case 'kana-trap':
      return `Close! As a particle this is written ${r.suggestion}. (Type "${r.suggestion === 'は' ? 'ha' : r.suggestion === 'へ' ? 'he' : 'wo'}".)`;
    case 'unconverted':
      return 'Part of your answer is still romaji. Finish the word and try again.';
  }
}

/**
 * The review loop, shared by the Review tab and the post-lesson quiz.
 * `onlyIds` limits the session to specific grammar points.
 */
export function ReviewSession({
  onlyIds,
  emptyState,
  onFinished,
  bottomInset = 0,
}: {
  onlyIds?: readonly string[];
  emptyState?: (nextDue: number | null, summary: SessionSummary) => React.ReactNode;
  onFinished?: (summary: SessionSummary) => void;
  /** Extra space below the footer (e.g. when no tab bar sits under it). */
  bottomInset?: number;
}) {
  const db = useSQLiteContext();
  const { settings, colors, refresh } = useApp();
  const [queue, setQueue] = useState<StoredCard[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  useAutoTrack(phase.kind === 'answering' || phase.kind === 'result');
  const [input, setInput] = useState('');
  const [summary, setSummary] = useState<SessionSummary>({ reviewed: 0, correct: 0 });
  const inputRef = useRef<TextInput>(null);
  const onlySet = useRef(onlyIds ? new Set(onlyIds) : undefined);
  const busy = useRef(false);

  const present = useCallback(
    async (card: StoredCard) => {
      const point = getPoint(card.grammar_id)!;
      const seen = await getExampleSeen(db, card.grammar_id);
      setCurrent({ card, point, example: pickExample(point.examples, seen), shownAt: Date.now() });
      setInput('');
      setPhase({ kind: 'answering' });
      inputRef.current?.focus();
    },
    [db],
  );

  /** Take the next card, rebuilding the queue from the database when it runs out. */
  const advance = useCallback(
    async (rest: StoredCard[]) => {
      let q = rest;
      if (q.length === 0) {
        const all = (await getAllCards(db)).filter((c) => getPoint(c.grammar_id));
        q = buildQueue(all, Date.now(), { onlyIds: onlySet.current });
        if (q.length === 0) {
          const pool = onlySet.current ? all.filter((c) => onlySet.current!.has(c.grammar_id)) : all;
          setQueue([]);
          setCurrent(null);
          setPhase({ kind: 'done', nextDue: nextDueAt(pool, Date.now()) });
          return;
        }
      }
      const [head, ...tail] = q;
      setQueue(tail);
      await present(head);
    },
    [db, present],
  );

  useEffect(() => {
    advance([]);
  }, [advance]);

  // Coming back to an idle Review tab: check whether anything new is due.
  useFocusEffect(
    useCallback(() => {
      if (phase.kind === 'done') advance([]);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase.kind]),
  );

  const onChangeText = (text: string) => {
    if (phase.kind !== 'answering') return; // input is frozen while showing the result
    setInput(settings.romajiInput ? convertRomajiInput(text) : text);
  };

  const submit = async () => {
    if (!current || busy.current) return;
    if (phase.kind === 'result') return next();
    if (phase.kind !== 'answering') return;
    const answer = settings.romajiInput ? finalizeInput(input) : input.trim();
    const result = checkAnswer(answer, current.example);
    if (result.kind === 'empty') return;
    if (result.kind !== 'correct' && result.kind !== 'wrong' && isRetry(result)) {
      setInput(answer);
      setPhase({ kind: 'answering', retry: result });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    busy.current = true;
    try {
      const correct = result.kind === 'correct';
      const now = Date.now();
      const graded = gradeCard({ card: current.card, correct, now, exampleId: current.example.id, answer, durationMs: now - current.shownAt });
      const logId = await saveReview(db, graded.card, graded.log, correct);
      setInput(answer);
      setPhase({ kind: 'result', correct, answer, logId });
      setSummary((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
      Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      refresh();
    } finally {
      busy.current = false;
    }
  };

  const undo = async () => {
    if (phase.kind !== 'result' || !current || busy.current) return;
    busy.current = true;
    try {
      const restored = await undoReview(db, phase.logId);
      if (restored) setCurrent({ ...current, card: restored, shownAt: Date.now() });
      setSummary((s) => ({ reviewed: s.reviewed - 1, correct: s.correct - (phase.correct ? 1 : 0) }));
      setInput(phase.answer);
      setPhase({ kind: 'answering' });
      Haptics.selectionAsync();
      refresh();
      inputRef.current?.focus();
    } finally {
      busy.current = false;
    }
  };

  const next = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await advance(queue);
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (phase.kind === 'done' && onFinished) onFinished(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind]);

  if (phase.kind === 'loading') return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (phase.kind === 'done' || !current) {
    return <View style={{ flex: 1, backgroundColor: colors.background }}>{emptyState?.(phase.kind === 'done' ? phase.nextDue : null, summary)}</View>;
  }

  const { example, point } = current;
  const remaining = queue.length + (phase.kind === 'result' ? 0 : 1);
  const result = phase.kind === 'result' ? phase : null;
  const retry = phase.kind === 'answering' ? phase.retry : undefined;
  const inputBorder = result ? (result.correct ? colors.correct : colors.wrong) : retry ? colors.notice : colors.border;
  const inputBg = result ? (result.correct ? colors.correctSoft : colors.wrongSoft) : colors.surface;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <T variant="small">{remaining} left</T>
          <T variant="small">
            {summary.reviewed > 0 ? `${Math.round((summary.correct / summary.reviewed) * 100)}% correct` : ' '}
          </T>
        </View>

        <Card style={{ gap: spacing.lg }}>
          <T variant="muted">{example.english}</T>
          <ClozeSentence example={example} state={result ? (result.correct ? 'correct' : 'wrong') : 'empty'} />
          {!result && (
            <T variant="small" color={colors.accent}>
              Hint: {example.hint ?? point.meaning}
            </T>
          )}
        </Card>

        {retry && (
          <View style={[styles.notice, { backgroundColor: colors.noticeSoft }]}>
            <T variant="muted" color={colors.notice}>
              {retryMessage(retry)}
            </T>
          </View>
        )}

        {result && (
          <Card style={{ gap: spacing.sm, backgroundColor: result.correct ? colors.correctSoft : colors.wrongSoft, borderColor: 'transparent' }}>
            <T variant="heading" color={result.correct ? colors.correct : colors.wrong}>
              {result.correct ? 'Correct' : 'Not quite'}
            </T>
            {!result.correct && <T variant="body">You typed: {result.answer}</T>}
            <T variant="body">
              Answer: {example.accepted_answers.join(' / ')}
            </T>
            <Pressable onPress={() => router.push(`/grammar/${point.id}`)} accessibilityRole="link" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
              <T variant="body" color={colors.accent} style={{ fontWeight: '600' }}>
                {point.title} — {point.meaning} ›
              </T>
            </Pressable>
          </Card>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: spacing.md + bottomInset }]}>
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={onChangeText}
          onSubmitEditing={submit}
          submitBehavior="submit"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          returnKeyType={result ? 'next' : 'done'}
          placeholder={settings.romajiInput ? 'Type in kana or romaji' : 'Type your answer'}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: inputBorder, backgroundColor: inputBg }]}
          accessibilityLabel="Answer"
        />
        <View style={styles.buttons}>
          {result ? (
            <>
              <Button label="Undo" kind="ghost" onPress={undo} style={{ flex: 1 }} accessibilityHint="Take back this answer and try again" />
              <Button label="Next" onPress={next} style={{ flex: 2 }} />
            </>
          ) : (
            <Button label="Check" onPress={submit} disabled={!input.trim()} style={{ flex: 1 }} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Bottom padding for screens without a tab bar under the footer. */
export function useFooterInset(): number {
  return useSafeAreaInsets().bottom;
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  notice: { borderRadius: radius.md, padding: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { minHeight: TAP + 4, borderWidth: 2, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 22 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
});
