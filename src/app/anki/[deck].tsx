import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteNote } from '@/anki/notes';
import { cardContent, renderCard } from '@/anki/render';
import { answerCard, buildStudyQueue, getStudyCard, LEARN_AHEAD_MS, nextDue, replacementCards, setCardSuspended, undoAnswer, type StudyCard } from '@/anki/repo';
import { formatInterval, GRADES, previewGrades, schedulerFor, State, type AnkiSched } from '@/anki/schedule';
import { AnkiCardView } from '@/components/AnkiCardView';
import { Celebration } from '@/components/Celebration';
import { NextUp } from '@/components/DayPlan';
import { Button, T } from '@/components/ui';
import { playSound } from '@/sound/sounds';
import { useApp } from '@/state/AppProvider';
import { radius, spacing, TAP } from '@/theme/colors';

const COUNT_COLORS = { new: '#2F7FC1', learn: '#C8562F', review: '#2E8B3E' };
const GRADE_COLORS: Record<number, { face: string; lip: string }> = {
  1: { face: '#DD4B3E', lip: '#AE3226' },
  2: { face: '#B7791F', lip: '#8A5A0B' },
  3: { face: '#3FA34D', lip: '#2E7D39' },
  4: { face: '#2F7FC1', lip: '#1F5F95' },
};

interface Session {
  queue: number[];
  /** Cards in (re)learning, waiting for their step to come due. */
  learning: { id: number; due: number }[];
  states: Record<number, number>;
  history: { logId: number; cardId: number }[];
}

interface Showing {
  card: StudyCard;
  side: 'question' | 'answer';
  shownAt: number;
  /** Set when the answer is revealed: the result of each button and when it was computed. */
  previews: { at: number; byRating: Record<1 | 2 | 3 | 4, AnkiSched> } | null;
}

/** Take the next card: learning cards that are due, then the main queue, then learning cards due soon. */
async function takeNext(db: SQLiteDatabase, s: Session, now: number): Promise<{ session: Session; card: StudyCard | null }> {
  const learning = [...s.learning].sort((a, b) => a.due - b.due);
  const queue = [...s.queue];
  for (;;) {
    let id: number | undefined;
    if (learning[0] && learning[0].due <= now) id = learning.shift()!.id;
    else if (queue.length) id = queue.shift();
    else if (learning[0] && learning[0].due <= now + LEARN_AHEAD_MS) id = learning.shift()!.id;
    if (id === undefined) return { session: { ...s, queue, learning }, card: null };
    const card = await getStudyCard(db, id);
    if (card) return { session: { ...s, queue, learning }, card };
  }
}

/** Event handlers read the time through this (keeps Date.now() out of render for the compiler lint). */
const clock = () => Date.now();

function stateKey(s: number | undefined): 'new' | 'learn' | 'review' {
  return s === State.New ? 'new' : s === State.Review ? 'review' : 'learn';
}

export default function AnkiStudy() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colors, isDark, settings } = useApp();
  const { deck } = useLocalSearchParams<{ deck: string }>();
  const path = decodeURIComponent(deck ?? '');
  const { ankiNewPerDay, ankiMaxReviewsPerDay } = settings;

  const [session, setSession] = useState<Session | null>(null);
  const [showing, setShowing] = useState<Showing | null>(null);
  const [finished, setFinished] = useState<{ next: number | null } | null>(null);

  const show = async (s: Session) => {
    const now = clock();
    const { session: next, card } = await takeNext(db, s, now);
    setSession(next);
    if (!card) {
      setShowing(null);
      setFinished({ next: await nextDue(db, path, now) });
    } else {
      setFinished(null);
      setShowing({ card, side: 'question', shownAt: clock(), previews: null });
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const now = clock();
      const ids = await buildStudyQueue(db, path, now, { newPerDay: ankiNewPerDay, reviewsPerDay: ankiMaxReviewsPerDay });
      const rows = ids.length ? await db.getAllAsync<{ id: number; state: number }>(`SELECT id, state FROM anki_cards WHERE id IN (${ids.join(',')})`) : [];
      const initial: Session = { queue: ids, learning: [], states: Object.fromEntries(rows.map((r) => [r.id, r.state])), history: [] };
      const { session: next, card } = await takeNext(db, initial, now);
      if (!alive) return;
      setSession(next);
      if (card) setShowing({ card, side: 'question', shownAt: now, previews: null });
      else setFinished({ next: await nextDue(db, path, now) });
    })();
    return () => {
      alive = false;
    };
  }, [db, path, ankiNewPerDay, ankiMaxReviewsPerDay]);

  // Coming back from editing or deleting the card: show its new version, or move on.
  const latest = useRef({ showing, session });
  useEffect(() => {
    latest.current = { showing, session };
  }, [showing, session]);
  const left = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (left.current) {
        const { showing: cur, session: s } = latest.current;
        if (cur && s) {
          getStudyCard(db, cur.card.card.id).then((fresh) => {
            if (!fresh) show(s);
            else setShowing((sh) => (sh && sh.card.card.id === fresh.card.id ? { ...sh, card: fresh } : sh));
          });
        }
      }
      return () => {
        left.current = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db]),
  );

  const studyCard = showing?.card;
  const rendered = useMemo(() => {
    if (!studyCard) return null;
    const card = studyCard;
    const nt = card.notetype;
    const tmpl = nt.isCloze ? nt.templates[0] : nt.templates[card.card.ord];
    if (!tmpl) return { question: '<p>This card’s template is missing.</p>', answer: '' };
    return renderCard(tmpl.qfmt, tmpl.afmt, {
      fields: card.fields,
      ord: card.card.ord,
      isCloze: nt.isCloze,
      tags: card.tags,
      deck: card.deck,
      notetype: nt.name,
      cardName: tmpl.name,
    });
  }, [studyCard]);

  const side = showing?.side;
  const content = useMemo(() => {
    if (!showing || !rendered) return null;
    return cardContent({
      body: side === 'question' ? rendered.question : rendered.answer,
      css: showing.card.notetype.css,
      ord: showing.card.card.ord,
      dark: isDark,
      autoplay: true,
    });
    // Rebuild only when the card, side or theme changes (not when previews are added).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing?.card, side, rendered, isDark]);

  const reveal = () => {
    if (!showing) return;
    const at = clock();
    setShowing({ ...showing, side: 'answer', previews: { at, byRating: previewGrades(showing.card.card, at, schedulerFor(settings.ankiRetention / 100)) } });
  };

  const grade = async (rating: 1 | 2 | 3 | 4) => {
    if (!showing?.previews || !session) return;
    const now = clock();
    const after = showing.previews.byRating[rating];
    playSound(rating === 1 ? 'wrong' : 'tap');
    const logId = await answerCard(db, showing.card.card, after, rating, now, Math.min(now - showing.shownAt, 60_000));
    const id = showing.card.card.id;
    const inLearning = after.state === State.Learning || after.state === State.Relearning;
    await show({
      ...session,
      learning: inLearning ? [...session.learning, { id, due: after.due }] : session.learning,
      states: { ...session.states, [id]: after.state },
      history: [...session.history, { logId, cardId: id }],
    });
  };

  const undo = async () => {
    if (!session) return;
    const last = session.history[session.history.length - 1];
    if (!last) return;
    const cardId = await undoAnswer(db, last.logId);
    if (cardId == null) return;
    const card = await getStudyCard(db, cardId);
    if (!card) return;
    setSession({
      ...session,
      // Whatever was showing goes back to the front of the queue.
      queue: showing ? [showing.card.card.id, ...session.queue] : session.queue,
      learning: session.learning.filter((p) => p.id !== cardId),
      states: { ...session.states, [cardId]: card.card.state },
      history: session.history.slice(0, -1),
    });
    setFinished(null);
    setShowing({ card, side: 'question', shownAt: clock(), previews: null });
  };

  const more = () => {
    if (!showing || !session) return;
    Alert.alert('Card', undefined, [
      ...(session.history.length ? [{ text: 'Undo last answer', onPress: undo }] : []),
      { text: 'Edit card', onPress: () => router.push({ pathname: '/anki/note', params: { note: String(showing.card.card.note_id) } }) },
      {
        text: 'Delete note',
        style: 'destructive' as const,
        onPress: () =>
          Alert.alert('Delete this note?', 'Its cards and your progress on them are deleted. This can’t be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await deleteNote(db, showing.card.card.note_id);
                await show({ ...session, queue: session.queue.filter((id) => id !== showing.card.card.id) });
              },
            },
          ]),
      },
      {
        text: 'Suspend card',
        onPress: async () => {
          const { id, state } = showing.card.card;
          await setCardSuspended(db, id, true);
          // A suspended new card (or review) frees a slot in today's limit: the next card in line takes its place now.
          const extra = await replacementCards(db, path, clock(), { newPerDay: ankiNewPerDay, reviewsPerDay: ankiMaxReviewsPerDay }, state, (c) => c === id || c in session.states);
          await show({
            ...session,
            queue: [...extra, ...session.queue],
            states: { ...session.states, ...Object.fromEntries(extra.map((c) => [c, state])) },
          });
        },
      },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const counts = useMemo(() => {
    const c = { new: 0, learn: 0, review: 0 };
    if (!session) return c;
    c.learn += session.learning.length;
    for (const id of session.queue) c[stateKey(session.states[id])]++;
    if (showing) c[stateKey(showing.card.card.state)]++;
    return c;
  }, [session, showing]);

  const title = path.split('::').pop() ?? 'Deck';
  const answered = session?.history.length ?? 0;

  if (finished) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: insets.bottom }}>
        <Stack.Screen options={{ title }} />
        <Celebration
          title={answered > 0 ? 'Deck cleared!' : 'Nothing due'}
          subtitle={
            finished.next
              ? `Next card due ${new Date(finished.next).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`
              : 'Nothing else is scheduled.'
          }
          mood={answered > 0 ? 'cheer' : 'sleep'}
          confetti={answered > 0}
          sound="deck"
          stats={answered > 0 ? [{ label: 'Answered', value: String(answered), tone: 'green' }] : []}
        >
          {answered > 0 && <Button label="Undo last answer" kind="ghost" onPress={undo} />}
          <NextUp from="cards" />
        </Celebration>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable onPress={more} accessibilityRole="button" accessibilityLabel="Card options" hitSlop={10}>
              <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={colors.accent} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.counts} accessibilityLabel={`${counts.new} new, ${counts.learn} learning, ${counts.review} to review`}>
        {(['new', 'learn', 'review'] as const).map((k) => (
          <Text key={k} style={[styles.count, { color: COUNT_COLORS[k] }, showing && stateKey(showing.card.card.state) === k && styles.countActive]}>
            {counts[k]}
          </Text>
        ))}
      </View>

      <View style={{ flex: 1 }}>{content ? <AnkiCardView content={content} /> : null}</View>

      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        {!showing?.previews ? (
          <Button label="Show answer" onPress={reveal} disabled={!showing} haptic={false} />
        ) : (
          <View style={styles.grades}>
            {GRADES.map(({ rating, label }) => {
              const r = rating as 1 | 2 | 3 | 4;
              const interval = formatInterval(showing.previews!.byRating[r].due - showing.previews!.at);
              return (
                <Pressable
                  key={rating}
                  onPress={() => grade(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, next in ${interval}`}
                  style={({ pressed }) => [styles.grade, { backgroundColor: GRADE_COLORS[rating].face, borderBottomColor: GRADE_COLORS[rating].lip, borderBottomWidth: pressed ? 1 : 5, transform: [{ translateY: pressed ? 4 : 0 }] }]}
                >
                  <T variant="small" color="#FFFFFF" style={{ fontWeight: '600' }}>
                    {interval}
                  </T>
                  <T variant="body" color="#FFFFFF" style={{ fontWeight: '700' }}>
                    {label}
                  </T>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  counts: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.sm },
  count: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  countActive: { textDecorationLine: 'underline' },
  bar: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  grades: { flexDirection: 'row', gap: spacing.sm },
  grade: { flex: 1, minHeight: TAP + 12, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
