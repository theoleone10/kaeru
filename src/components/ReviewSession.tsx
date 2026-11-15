import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPoint } from '../content/loader';
import type { Example, GrammarPoint } from '../content/types';
import { getAllCards, getExampleSeen, saveReview, undoReview } from '../db/repo';
import { checkAnswer, isRetry, type CheckResult } from '../review/answerCheck';
import { convertRomajiInput, finalizeInput } from '../review/kanaInput';
import { pickExample } from '../srs/exampleRotation';
import type { QuizAnswer, QuizItem } from '../srs/quiz';
import { startOfNextLocalDay } from '../stats/dates';
import { nextDueAt, todaysReviews } from '../srs/queue';
import { gradeCard, type StoredCard } from '../srs/scheduler';
import { playSound } from '../sound/sounds';
import { useApp } from '../state/AppProvider';
import { FONTS, radius, spacing } from '../theme/colors';
import { ClozeSentence } from './Furigana';
import { Icon } from './Icon';
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
  /** `requeued`: a miss that went back on the end of this session's queue. */
  | { kind: 'result'; correct: boolean; answer: string; logId: number; requeued?: boolean }
  /** `held`: reviews due today but over the daily maximum. */
  | { kind: 'done'; nextDue: number | null; held: number };

export interface SessionSummary {
  reviewed: number;
  correct: number;
}

/** Whether the on-screen keyboard is up (so the bottom safe-area padding can go). */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
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
  onClose,
  closeLabel = 'Close',
}: {
  /** Shows a close button at the left of the top bar (and over the empty state). */
  onClose?: () => void;
  closeLabel?: string;
  onlyIds?: readonly string[];
  emptyState?: (nextDue: number | null, summary: SessionSummary, held: number) => React.ReactNode;
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
  // Read when the queue is built, so changing the setting doesn't restart a session.
  const maxPerDay = useRef(settings.grammarMaxReviewsPerDay);
  const [quizLeft, setQuizLeft] = useState(quiz?.items.length ?? 0);
  const keyboardShown = useKeyboardShown();

  /**
   * Show `card` with `rest` as the queue behind it. Both are set after the database read,
   * in one render: setting the queue first would briefly show one card fewer left (and
   * jump the progress bar) while the previous result is still on screen.
   */
  const present = useCallback(
    async (card: StoredCard, rest: StoredCard[]) => {
      const point = getPoint(card.grammar_id)!;
      const seen = await getExampleSeen(db, card.grammar_id);
      setQueue(rest);
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
          setPhase({ kind: 'done', nextDue: null, held: 0 });
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
        const now = Date.now();
        const today = todaysReviews(all, now, { maxPerDay: maxPerDay.current, onlyIds: onlySet.current });
        q = today.queue;
        if (q.length === 0) {
          const pool = onlySet.current ? all.filter((c) => onlySet.current!.has(c.grammar_id)) : all;
          setQueue([]);
          setCurrent(null);
          // Today's set is done, so the next one is on a later day.
          setPhase({ kind: 'done', nextDue: nextDueAt(pool, startOfNextLocalDay(now) - 1), held: today.held });
          return;
        }
      }
      const [head, ...tail] = q;
      await present(head, tail);
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
      // A miss goes to the end, after the other misses, and keeps coming back until it's right.
      const requeued = !correct;
      if (requeued) setQueue((q) => [...q, graded.card]);
      setInput(answer);
      setPhase({ kind: 'result', correct, answer, logId, requeued });
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
        if (phase.requeued) setQueue((q) => q.slice(0, -1));
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

  const closeButton = onClose ? (
    <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={8} style={styles.close}>
      <Icon name="close" size={22} color={colors.textFaint} strokeWidth={2.4} />
    </Pressable>
  ) : null;

  if (phase.kind === 'loading') return <View style={{ flex: 1, backgroundColor: colors.background }}>{closeButton && <View style={styles.closeRow}>{closeButton}</View>}</View>;
  if (phase.kind === 'done' || !current) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {closeButton && <View style={styles.closeRow}>{closeButton}</View>}
        {emptyState?.(phase.kind === 'done' ? phase.nextDue : null, summary, phase.kind === 'done' ? phase.held : 0)}
      </View>
    );
  }

  const { example, point } = current;
  const remaining = (quiz ? quizLeft : queue.length) + (phase.kind === 'result' ? 0 : 1);
  const result = phase.kind === 'result' ? phase : null;
  const retry = phase.kind === 'answering' ? phase.retry : undefined;
  const inputBorder = retry ? colors.notice : input ? colors.accentInk : colors.borderStrong;
  const done = summary.reviewed;
  const line = lines[point.level] ?? lines.N5;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <View style={[styles.topRow, !onClose && { paddingLeft: 20 }]}>
        {closeButton}
        <View style={{ flex: 1 }}>
          <ProgressBar value={done / Math.max(1, done + remaining)} height={14} color={colors.correct} />
        </View>
        <View style={styles.combo} accessibilityLabel={`${combo} correct in a row`}>
          <Icon name="flame" size={combo > 0 ? 22 : 20} color={combo > 0 ? colors.flame : colors.textFaint} filled cutout={combo > 0 ? '#FFD27A' : colors.background} />
          <T variant="heading" color={combo > 0 ? colors.flameText : colors.textFaint} style={{ fontSize: 17, lineHeight: 22 }} jp={false}>
            {combo}
          </T>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.levelChip, { backgroundColor: line.soft }]}>
            <T variant="small" color={line.ink} style={{ fontSize: 12, lineHeight: 16, fontWeight: '800' }} jp={false}>
              {point.level}
            </T>
          </View>
          <T variant="small" style={{ fontSize: 14, lineHeight: 20 }}>
            {current.retry ? 'Try again · ' : ''}
            {remaining} left
          </T>
        </View>

        <View style={{ gap: 14, paddingTop: spacing.sm }}>
          <ClozeSentence example={example} state={result ? (result.correct ? 'correct' : 'wrong') : 'empty'} typed={result ? undefined : input.trim()} size={30} />
          <T variant="body" color={colors.textMuted}>
            {example.english}
          </T>
        </View>

        {!result && (
          <View style={styles.hint}>
            <Icon name="hint" size={18} color={colors.notice} />
            <T variant="small" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
              Hint: {example.hint ?? point.meaning}
            </T>
          </View>
        )}

        {retry && (
          <View style={styles.hint}>
            <Icon name="info" size={18} color={colors.notice} />
            <T variant="body" color={colors.notice} style={{ flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>
              {retryMessage(retry)}
            </T>
          </View>
        )}
      </ScrollView>

      {/*
        One tray for typing and the verdict. The input stays mounted (and focused) through the
        result, so the keyboard doesn't drop and come back between cards: the tray takes the
        result colour, the verdict grows out of its top, and Check turns into Continue.
      */}
      <View
        style={[
          styles.dock,
          {
            backgroundColor: result ? (result.correct ? colors.correctSoft : colors.wrongSoft) : colors.bar,
            borderColor: result ? 'transparent' : colors.border,
            paddingBottom: keyboardShown ? spacing.md : spacing.lg + bottomInset,
          },
        ]}
      >
        <View style={styles.perch} pointerEvents="none">
          <Mascot size={56} mood={result ? (result.correct ? 'cheer' : 'sad') : 'think'} />
        </View>
        {result && (
          <Verdict key={phase.kind === 'result' ? phase.logId : 0} correct={result.correct} onUndo={undo}>
            {!result.correct && (
              <T variant="body" style={{ fontSize: 18, lineHeight: 26, fontWeight: '700' }}>
                Answer: {example.accepted_answers.join(' / ')}
              </T>
            )}
            <Pressable
              onPress={() => router.push(`/grammar/${point.id}`)}
              accessibilityRole="link"
              hitSlop={8}
              style={({ pressed }) => [styles.pointLink, { opacity: pressed ? 0.6 : 1 }]}
            >
              <T variant="body" color={result.correct ? colors.correctText : colors.wrongText} style={{ flexShrink: 1, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>
                {point.title} · {point.meaning}
              </T>
              <Icon name="chevronRight" size={14} color={result.correct ? colors.correctText : colors.wrongText} strokeWidth={2.8} />
            </Pressable>
          </Verdict>
        )}
        <View style={styles.composer}>
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
            placeholder={settings.romajiInput ? 'Kana or romaji' : 'Your answer'}
            placeholderTextColor={colors.textFaint}
            style={[
              styles.input,
              result
                ? { color: result.correct ? colors.correctText : colors.wrongText, borderColor: `${result.correct ? colors.correct : colors.wrong}55`, backgroundColor: colors.surface }
                : { color: colors.text, borderColor: inputBorder, backgroundColor: colors.surface },
              { fontFamily: FONTS.jpBold },
            ]}
            accessibilityLabel={result ? `Your answer: ${result.answer}` : 'Answer'}
          />
          <Button
            label={result ? 'Continue' : 'Check'}
            kind={result && !result.correct ? 'danger' : 'success'}
            onPress={submit}
            disabled={!result && !input.trim()}
            style={styles.action}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** The verdict at the top of the tray: badge, 正解！ / Not quite, Undo, and the details. Pops in with a little bounce. */
function Verdict({ correct, onUndo, children }: { correct: boolean; onUndo: () => void; children: React.ReactNode }) {
  const { colors } = useApp();
  const enter = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [enter]);
  const ink = correct ? colors.correctText : colors.wrongText;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{
        gap: 6,
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} accessible accessibilityLabel={correct ? 'Nice! 正解' : 'Not quite'}>
          <View style={styles.badge}>
            <View style={[styles.resultIcon, { top: 3, position: 'absolute', backgroundColor: correct ? colors.correctShadow : colors.wrongShadow }]} />
            <View style={[styles.resultIcon, { backgroundColor: correct ? colors.correct : colors.wrong }]}>
              <Icon name={correct ? 'check' : 'close'} size={correct ? 20 : 18} color="#FFFFFF" strokeWidth={3.2} />
            </View>
          </View>
          <T variant="title" color={ink} style={{ fontSize: 24, lineHeight: 30 }}>
            {correct ? '正解！' : 'Not quite'}
          </T>
          {correct && (
            <T variant="body" color={ink} style={{ fontSize: 15 }}>
              Nice!
            </T>
          )}
        </View>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          accessibilityHint="Take back this answer and try again"
          hitSlop={10}
          style={({ pressed }) => [styles.undo, { borderColor: `${correct ? colors.correct : colors.wrong}66`, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="undo" size={15} color={ink} strokeWidth={2.6} />
          <T variant="small" color={ink} style={{ fontSize: 14, fontWeight: '700' }} jp={false}>
            Undo
          </T>
        </Pressable>
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
  // Bottom padding leaves room for the frog perched on the tray.
  scroll: { paddingHorizontal: 20, paddingTop: spacing.lg, paddingBottom: 56, gap: 22, flexGrow: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.sm, paddingRight: 20, paddingTop: spacing.xs },
  closeRow: { paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  combo: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 36 },
  levelChip: { height: 24, paddingHorizontal: 9, borderRadius: 999, justifyContent: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dock: { paddingHorizontal: 16, paddingTop: 16, gap: 12, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: StyleSheet.hairlineWidth * 2, borderBottomWidth: 0 },
  perch: { position: 'absolute', right: 22, top: -46 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minWidth: 0, width: 0, minHeight: 56, borderWidth: 2, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 22 },
  action: { minWidth: 118 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 2 },
  pointLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  badge: { width: 34, height: 37 },
  resultIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
