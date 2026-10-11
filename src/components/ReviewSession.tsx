import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Animated, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPoint } from '../content/loader';
import type { Example, GrammarPoint } from '../content/types';
import { getAllCards, getExampleSeen, saveReview, undoReview } from '../db/repo';
import { checkAnswer, isRetry, type CheckResult } from '../review/answerCheck';
import { convertRomajiInput, finalizeInput } from '../review/kanaInput';
import { pickExample } from '../srs/exampleRotation';
import type { QuizAnswer, QuizItem } from '../srs/quiz';
import { buildQueue, nextDueAt } from '../srs/queue';
import { gradeCard, type StoredCard } from '../srs/scheduler';
import { playSound } from '../sound/sounds';
import { useApp } from '../state/AppProvider';
import { FONTS, radius, spacing, TAP } from '../theme/colors';
import { ClozeSentence } from './Furigana';
import { Mascot } from './Mascot';
import { Button, ProgressBar, T } from './ui';

interface Current {
  /** Absent in a quiz: quiz answers don't touch the SRS until the quiz is over. */
  card?: StoredCard;
  retry?: boolean;
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
 * The review loop, shared by grammar reviews and the post-lesson quiz.
 * `onlyIds` limits the session to specific grammar points. With `quiz`, it asks the
 * given sentences instead of due cards (a missed sentence comes back once at the end)
 * and hands the answers to `quiz.onComplete` before showing the empty state.
 */
export function ReviewSession({
  onlyIds,
  emptyState,
  onFinished,
  bottomInset = 0,
  quiz,
}: {
  onlyIds?: readonly string[];
  emptyState?: (nextDue: number | null, summary: SessionSummary) => React.ReactNode;
  onFinished?: (summary: SessionSummary) => void;
  /** Extra space below the footer (e.g. when no tab bar sits under it). */
  bottomInset?: number;
  quiz?: { items: QuizItem[]; onComplete: (answers: QuizAnswer[]) => Promise<void> };
}) {
  const db = useSQLiteContext();
  const { settings, colors, lines, refresh } = useApp();
  const [queue, setQueue] = useState<StoredCard[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [input, setInput] = useState('');
  const [summary, setSummary] = useState<SessionSummary>({ reviewed: 0, correct: 0 });
  const [combo, setCombo] = useState(0);
  const comboBefore = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const onlySet = useRef(onlyIds ? new Set(onlyIds) : undefined);
  const busy = useRef(false);
  const quizQueue = useRef<QuizItem[]>(quiz ? [...quiz.items] : []);
  const quizAnswers = useRef<QuizAnswer[]>([]);
  const quizRef = useRef(quiz);
  const [quizLeft, setQuizLeft] = useState(quiz?.items.length ?? 0);

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
      if (quizRef.current) {
        const item = quizQueue.current.shift();
        setQuizLeft(quizQueue.current.length);
        if (!item) {
          await quizRef.current.onComplete(quizAnswers.current);
          setCurrent(null);
          setPhase({ kind: 'done', nextDue: null });
          return;
        }
        setCurrent({ point: item.point, example: item.example, retry: item.retry, shownAt: Date.now() });
        setInput('');
        setPhase({ kind: 'answering' });
        inputRef.current?.focus();
        return;
      }
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
      if (phase.kind === 'done' && !quizRef.current) advance([]);
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
      if (!current.card) {
        // Quiz: remember the answer; a first-try miss is asked again at the end.
        quizAnswers.current.push({ pointId: current.point.id, exampleId: current.example.id, correct, retry: !!current.retry, at: now });
        if (!correct && !current.retry) quizQueue.current.push({ point: current.point, example: current.example, retry: true });
        setQuizLeft(quizQueue.current.length);
        setInput(answer);
        setPhase({ kind: 'result', correct, answer, logId: quizAnswers.current.length });
        if (!current.retry) setSummary((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
        comboBefore.current = combo;
        setCombo(correct ? combo + 1 : 0);
        Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
        playSound(correct ? 'correct' : 'wrong');
        return;
      }
      const graded = gradeCard({ card: current.card, correct, now, exampleId: current.example.id, answer, durationMs: now - current.shownAt });
      const logId = await saveReview(db, graded.card, graded.log, correct);
      setInput(answer);
      setPhase({ kind: 'result', correct, answer, logId });
      setSummary((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
      comboBefore.current = combo;
      setCombo(correct ? combo + 1 : 0);
      Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      playSound(correct ? 'correct' : 'wrong');
      refresh();
    } finally {
      busy.current = false;
    }
  };

  const undo = async () => {
    if (phase.kind !== 'result' || !current || busy.current) return;
    busy.current = true;
    try {
      if (!current.card) {
        const a = quizAnswers.current.pop();
        if (a && !a.correct && !a.retry) quizQueue.current.pop();
        setQuizLeft(quizQueue.current.length);
        setCurrent({ ...current, shownAt: Date.now() });
        if (!current.retry) setSummary((s) => ({ reviewed: s.reviewed - 1, correct: s.correct - (phase.correct ? 1 : 0) }));
      } else {
        const restored = await undoReview(db, phase.logId);
        if (restored) setCurrent({ ...current, card: restored, shownAt: Date.now() });
        setSummary((s) => ({ reviewed: s.reviewed - 1, correct: s.correct - (phase.correct ? 1 : 0) }));
      }
      setCombo(comboBefore.current);
      setInput(phase.answer);
      setPhase({ kind: 'answering' });
      Haptics.selectionAsync();
      if (current.card) refresh();
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
  const remaining = (quiz ? quizLeft : queue.length) + (phase.kind === 'result' ? 0 : 1);
  const result = phase.kind === 'result' ? phase : null;
  const retry = phase.kind === 'answering' ? phase.retry : undefined;
  const inputBorder = result ? (result.correct ? colors.correct : colors.wrong) : retry ? colors.notice : colors.border;
  const inputBg = result ? (result.correct ? colors.correctSoft : colors.wrongSoft) : colors.surface;
  const done = summary.reviewed;
  const line = lines[point.level] ?? lines.N5;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={0} secondary={done / Math.max(1, done + remaining)} height={16} />
          </View>
          <View style={styles.combo} accessibilityLabel={`${combo} correct in a row`}>
            <Ionicons name="flame" size={20} color={combo > 0 ? '#F08A3C' : colors.textMuted} />
            <T variant="heading" color={combo > 0 ? '#D9663D' : colors.textMuted} style={{ fontWeight: '900' }}>
              {combo}
            </T>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={[styles.levelChip, { backgroundColor: line.soft }]}>
            <T variant="small" color={line.ink} style={{ fontWeight: '900' }}>
              {point.level}
            </T>
          </View>
          <T variant="muted">
            {current.retry ? 'Try again · ' : ''}{remaining} left
          </T>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <Mascot size={60} mood={result ? (result.correct ? 'cheer' : 'sad') : 'think'} />
          <View style={[styles.bubble, { backgroundColor: colors.surface }]}>
            <ClozeSentence example={example} state={result ? (result.correct ? 'correct' : 'wrong') : 'empty'} />
            <T variant="muted">{example.english}</T>
          </View>
        </View>

        {!result && (
          <View style={[styles.hint, { backgroundColor: colors.surfaceAlt }]}>
            <T variant="small" style={{ fontWeight: '800' }}>
              Hint: {example.hint ?? point.meaning}
            </T>
          </View>
        )}

        {retry && (
          <View style={[styles.notice, { backgroundColor: colors.noticeSoft }]}>
            <T variant="muted" color={colors.notice}>
              {retryMessage(retry)}
            </T>
          </View>
        )}
      </ScrollView>

      {result ? (
        <ResultPanel key={phase.kind === 'result' ? phase.logId : 0} correct={result.correct} bottomInset={bottomInset}>
          {!result.correct && <T variant="body">You typed: {result.answer}</T>}
          <T variant="body" style={{ fontWeight: '800' }}>
            {result.correct ? '' : 'Answer: '}
            {example.accepted_answers.join(' / ')}
          </T>
          <Pressable onPress={() => router.push(`/grammar/${point.id}`)} accessibilityRole="link" hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
            <T variant="body" color={result.correct ? colors.correctText : colors.wrong} style={{ fontWeight: '800' }}>
              {point.title} · {point.meaning} ›
            </T>
          </Pressable>
          <View style={styles.buttons}>
            <Button label="Undo" kind="ghost" onPress={undo} style={{ flex: 1 }} accessibilityHint="Take back this answer and try again" />
            <Button label="Continue" kind={result.correct ? 'success' : 'danger'} onPress={next} style={{ flex: 2 }} />
          </View>
        </ResultPanel>
      ) : (
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
            returnKeyType="done"
            placeholder={settings.romajiInput ? 'Type in kana or romaji' : 'Type your answer'}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: inputBorder, backgroundColor: inputBg, fontFamily: FONTS.jpBold }]}
            accessibilityLabel="Answer"
          />
          <Button label="Check" kind="success" onPress={submit} disabled={!input.trim()} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Slides up with a little bounce: green for correct, red for a miss. */
function ResultPanel({ correct, bottomInset, children }: { correct: boolean; bottomInset: number; children: React.ReactNode }) {
  const { colors } = useApp();
  const enter = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [enter]);
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.panel,
        {
          backgroundColor: correct ? colors.correctSoft : colors.wrongSoft,
          paddingBottom: spacing.lg + bottomInset,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={[styles.resultIcon, { backgroundColor: colors.surface }]}>
          <Ionicons name={correct ? 'checkmark' : 'close'} size={28} color={correct ? colors.correctText : colors.wrong} />
        </View>
        <T variant="title" color={correct ? colors.correctText : colors.wrong} style={{ fontSize: 24, lineHeight: 30 }}>
          {correct ? 'Nice! 正解' : 'Not quite'}
        </T>
      </View>
      {children}
    </Animated.View>
  );
}

/** Bottom padding for screens without a tab bar under the footer. */
export function useFooterInset(): number {
  return useSafeAreaInsets().bottom;
}

const styles = StyleSheet.create({
  bubble: { flex: 1, gap: spacing.md, borderRadius: 20, padding: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  combo: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  levelChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  hint: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 6 },
  notice: { borderRadius: radius.md, padding: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm, borderTopWidth: 2 },
  input: { minHeight: TAP + 6, borderWidth: 2, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 22 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  panel: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.xs, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  resultIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
