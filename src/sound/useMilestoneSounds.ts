import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef } from 'react';
import { curriculum } from '../content/loader';
import { getKv, setKv } from '../db/repo';
import { STREAK_MILESTONES } from '../notifications/planner';
import { dayKey } from '../stats/dates';
import { useApp } from '../state/AppProvider';
import { playSound, type SoundName } from './sounds';

/**
 * Play `sound` the first time `when` is true on a given day, remembered across restarts
 * (meta.sound_played maps each sound to the day it last played).
 */
export function useOncePerDaySound(sound: SoundName, when: boolean, delayMs = 0): void {
  const db = useSQLiteContext();
  useEffect(() => {
    if (!when) return;
    let cancelled = false;
    (async () => {
      const today = dayKey(Date.now());
      const meta = await getKv(db, 'meta');
      const played = (meta.sound_played && typeof meta.sound_played === 'object' ? meta.sound_played : {}) as Record<string, string>;
      if (cancelled || played[sound] === today) return;
      await setKv(db, 'meta', 'sound_played', { ...played, [sound]: today });
      playSound(sound, delayMs);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [db, sound, when, delayMs]);
}

/** Fanfares for the end of a session: a streak milestone, else the whole day's plan done. */
export function useDayMilestones({ loaded, allDone, streak, goalMetToday }: { loaded: boolean; allDone: boolean; streak: number; goalMetToday: boolean }): void {
  const milestone = loaded && goalMetToday && STREAK_MILESTONES.includes(streak);
  useOncePerDaySound('streak', milestone, 1400);
  useOncePerDaySound('dayDone', loaded && allDone && !milestone, 1400);
}

/**
 * App-wide milestone that can happen anywhere: the last grammar point of a JLPT level learned.
 * (Time goals reached get their own popup, GoalCelebration.)
 */
export function useMilestoneSounds(): void {
  const { cards } = useApp();

  const complete = useMemo(() => {
    const learned = new Set(cards.map((c) => c.grammar_id));
    const levels = [...new Set(curriculum.map((p) => p.level))];
    return levels.filter((l) => curriculum.every((p) => p.level !== l || learned.has(p.id))).join(',');
  }, [cards]);
  const lastComplete = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastComplete.current;
    lastComplete.current = complete;
    if (prev !== null && complete.split(',').some((l) => l && !prev.split(',').includes(l))) playSound('level', 1500);
  }, [complete]);
}
