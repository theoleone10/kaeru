import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { getKv, setKv } from '../db/repo';
import { dayKey } from '../stats/dates';
import { useApp } from '../state/AppProvider';
import { radius, spacing } from '../theme/colors';
import { Confetti } from './Confetti';
import { Mascot } from './Mascot';
import { useGoalPopupOpen } from './popupGate';
import { Button, T } from './ui';

const CHEERS = [
  { jp: 'ぜんぶできた！', en: 'Every single thing on today’s list: done. Kaeru is doing a victory hop!' },
  { jp: 'すごいね！', en: 'Clean sweep! Kaeru is croaking your name across the pond.' },
  { jp: 'やったー！', en: 'Nothing left to do today. Time for a lily pad nap.' },
  { jp: 'かんぺき！', en: 'A perfect day. Even the flies are impressed.' },
];
const BUTTONS = ['Ribbit!', 'ケロケロ！', 'Hop hop!', 'Yay!'];

/** Shown from Today and from the end of a study session, so both can race to claim the day. */
let claiming = false;

/**
 * A playful "Congratulations!" the first time every part of today's plan is ticked off.
 * Once a day (meta.day_done_shown holds the day it last showed), only on the focused screen,
 * and after any time-goal popup is closed.
 */
export function DayDoneCelebration({ loaded, allDone, streak }: { loaded: boolean; allDone: boolean; streak: number }) {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const goalPopupOpen = useGoalPopupOpen();
  const [focused, setFocused] = useState(false);
  const [cheer, setCheer] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!loaded || !allDone || !focused || goalPopupOpen || claiming) return;
    claiming = true;
    (async () => {
      const today = dayKey(Date.now());
      const meta = await getKv(db, 'meta');
      if (meta.day_done_shown === today) return;
      // Saved before showing, so it never pops up twice (even if the app is closed right away).
      await setKv(db, 'meta', 'day_done_shown', today);
      setCheer(Math.floor(Math.random() * 1000));
    })()
      .catch((e) => console.warn('Could not check the day plan', e))
      .finally(() => {
        claiming = false;
      });
  }, [db, loaded, allDone, focused, goalPopupOpen]);

  if (cheer === null) return null;
  const line = CHEERS[cheer % CHEERS.length];
  const close = () => setCheer(null);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <View
          accessibilityViewIsModal
          style={{ alignSelf: 'stretch', backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg, alignItems: 'center' }}
        >
          <Mascot size={110} mood="cheer" bounce />
          <T variant="title" style={{ textAlign: 'center' }}>
            Congratulations!
          </T>
          <View style={{ gap: spacing.xs, alignItems: 'center' }}>
            <T variant="heading" style={{ textAlign: 'center', fontWeight: '900' }}>
              {`🎉 ${line.jp}`}
            </T>
            <T variant="muted" style={{ textAlign: 'center' }}>
              {line.en}
            </T>
            {streak > 1 && (
              <T variant="body" style={{ textAlign: 'center', fontWeight: '800' }}>
                {`🔥 ${streak} days in a row`}
              </T>
            )}
          </View>
          <Button label={BUTTONS[Math.floor(cheer / CHEERS.length) % BUTTONS.length]} onPress={close} style={{ alignSelf: 'stretch' }} />
        </View>
        <Confetti />
      </View>
    </Modal>
  );
}
