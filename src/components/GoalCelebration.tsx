import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, View } from 'react-native';
import { getKv, setKv } from '../db/repo';
import { playSound } from '../sound/sounds';
import { useApp, useNow } from '../state/AppProvider';
import { spacing } from '../theme/colors';
import { goalPeriodKey, goalsToCelebrate, repeatLabel, type TimeGoal } from '../time/goals';
import { formatDuration } from '../time/model';
import { useTime } from '../time/TimeProvider';
import { Confetti } from './Confetti';
import { Mascot } from './Mascot';
import { setGoalPopupOpen } from './popupGate';
import { Button, darken, IconTile, T } from './ui';

/**
 * "Congratulations!" when a time goal is reached: while timing in the app, or on coming back to it
 * after time was logged elsewhere (a Shortcut, or a timer left running). Each goal pops up once per
 * day or week; what's been celebrated is kept in meta.goals_celebrated.
 */
export function GoalCelebration() {
  const db = useSQLiteContext();
  const { colors, settings } = useApp();
  const { entries, running, activityById } = useTime();
  const tick = useNow(running ? 5000 : 60_000);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [shown, setShown] = useState<TimeGoal[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active || busy.current) return;
    busy.current = true;
    (async () => {
      const now = Date.now();
      const visible = settings.timeGoals.filter((g) => g.activityId === null || (activityById.get(g.activityId) && !activityById.get(g.activityId)!.archived));
      const meta = await getKv(db, 'meta');
      const celebrated = (meta.goals_celebrated && typeof meta.goals_celebrated === 'object' ? meta.goals_celebrated : {}) as Record<string, string>;
      const reached = goalsToCelebrate(visible, entries, now, celebrated);
      if (!reached.length) return;
      // Saved before showing, so a goal never pops up twice (even if the app is closed right away).
      await setKv(db, 'meta', 'goals_celebrated', { ...celebrated, ...Object.fromEntries(reached.map((g) => [g.id, goalPeriodKey(g, now)])) });
      setShown((cur) => [...cur, ...reached.filter((g) => !cur.some((c) => c.id === g.id))]);
      playSound('goal');
    })()
      .catch((e) => console.warn('Could not check time goals', e))
      .finally(() => {
        busy.current = false;
      });
  }, [db, active, tick, entries, settings.timeGoals, activityById]);

  useEffect(() => setGoalPopupOpen(shown.length > 0), [shown.length]);

  const name = (g: TimeGoal) => (g.activityId === null ? 'practice' : (activityById.get(g.activityId)?.name ?? 'practice'));
  const tint = (g: TimeGoal) => (g.activityId === null ? colors.gold : (activityById.get(g.activityId)?.color ?? colors.gold));
  const line = (g: TimeGoal) => `${formatDuration(g.minutes * 60 * 1000)} of ${name(g)} ${g.period === 'week' ? 'this week' : 'today'}`;

  return (
    <Modal visible={shown.length > 0} transparent animationType="fade" onRequestClose={() => setShown([])}>
      <View style={{ flex: 1, backgroundColor: 'rgba(16,19,31,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <View
          accessibilityViewIsModal
          style={{ alignSelf: 'stretch', maxWidth: 440, backgroundColor: colors.background, borderRadius: 28, paddingTop: 30, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg, alignItems: 'center' }}
        >
          <Mascot size={112} mood="cheer" bounce />
          <T variant="title" style={{ textAlign: 'center', fontSize: 30, lineHeight: 38 }}>
            Congratulations!
          </T>
          <View style={{ gap: spacing.md, alignSelf: 'stretch' }}>
            <T variant="muted" style={{ textAlign: 'center' }}>
              {shown.length === 1 ? 'You reached your goal:' : 'You reached your goals:'}
            </T>
            {shown.map((g) => (
              <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconTile icon="timer" color={tint(g)} lip={darken(tint(g))} size={36} />
                <T variant="body" style={{ flex: 1, fontWeight: '700' }}>
                  {line(g)}
                  {g.period === 'day' && g.days ? ` (${repeatLabel(g)})` : ''}
                </T>
              </View>
            ))}
          </View>
          <Button label="Nice!" onPress={() => setShown([])} style={{ alignSelf: 'stretch', marginTop: 6 }} />
        </View>
        {shown.length > 0 && <Confetti />}
      </View>
    </Modal>
  );
}
