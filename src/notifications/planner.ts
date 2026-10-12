import { dayKey, previousDay, startOfLocalDay } from '../stats/dates';
import { computeStreak } from '../stats/streak';
import { formatDuration } from '../time/model';
import {
  comebackMessage,
  goalMessage,
  levelMessage,
  longTimerMessage,
  planMessage,
  reviewsMessage,
  streakMessage,
  streakMilestoneMessage,
  type Message,
} from './messages';
import { isQuietTime, moveOutOfQuietHours, planReminder } from './plan';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type NotifyKind = 'reviews' | 'streak' | 'plan' | 'wins';

export interface NotifySettings {
  enabled: boolean;
  kinds: Record<NotifyKind, boolean>;
  quietStart: number;
  quietEnd: number;
  /** Minimum hours between two review reminders. */
  minGapHours: number;
  dailyNewGrammar: number;
  /** 0 = no time goal. */
  timeGoalMs: number;
}

export interface NotifyInput {
  now: number;
  settings: NotifySettings;
  /** Due times of active grammar cards. */
  grammarDue: readonly number[];
  /** Due times of flashcards already in review (new cards aren't "due"). */
  cardDue: readonly number[];
  /** Every study timestamp from the last couple of months. */
  activity: readonly number[];
  learnedToday: number;
  /** Grammar points not learned yet. */
  unlearned: number;
  timeTodayMs: number;
  running: { startedAt: number; activity: string } | null;
  /** JLPT levels whose last point was learned in the last day. */
  levelsJustFinished: readonly string[];
  /** When the last review reminder went out (minimum-gap rule). */
  lastReviewNotifiedAt: number | null;
  /** Wins already scheduled, by key → time. Ones in the past were delivered. */
  celebrated: Readonly<Record<string, number>>;
}

export interface PlannedNotification {
  kind: NotifyKind;
  at: number;
  message: Message;
  /** Screen to open on tap. */
  url: string;
  /** Set on one-off wins so each is only celebrated once. */
  key?: string;
}

/** How many days ahead to schedule; anything further is re-planned next time the app closes. */
export const HORIZON_DAYS = 3;
export const MAX_PER_DAY = 3;
/** No two notifications closer than this. */
export const MIN_SPACING = 45 * MINUTE;
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];
const LONG_TIMER_HOURS = 3;

const DEFAULT_PLAN_MIN = 9 * 60;
const DEFAULT_STREAK_MIN = 20 * 60;

function minuteOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function atMinute(day: number, m: number): number {
  const d = new Date(day);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

export interface Habit {
  /** Usual minute of the day you start studying, or null without enough history. */
  usualStart: number | null;
  /** Usual minute of the day you finish. */
  usualEnd: number | null;
}

/**
 * When you usually study, from the last four weeks: the median first and last study
 * minute of each day you studied. Needs at least three days to say anything.
 * Times before 4am count as the previous evening.
 */
export function studyHabit(activity: readonly number[], now: number): Habit {
  const since = now - 28 * DAY;
  const byDay = new Map<string, number[]>();
  for (const t of activity) {
    if (t < since || t > now) continue;
    const shifted = t - 4 * HOUR; // a 1am session belongs to the night before
    const k = dayKey(shifted);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(minuteOfDay(shifted) + 4 * 60);
  }
  if (byDay.size < 3) return { usualStart: null, usualEnd: null };
  const days = [...byDay.values()];
  return { usualStart: median(days.map((d) => Math.min(...d))), usualEnd: median(days.map((d) => Math.max(...d))) };
}

/** Morning plan: a little before you usually start, never in quiet hours. */
export function planMinute(h: Habit): number {
  const m = h.usualStart === null ? DEFAULT_PLAN_MIN : Math.max(6 * 60, h.usualStart - 20);
  return Math.min(m, 22 * 60);
}

/**
 * Streak warning: an hour after you'd usually be done, so it only fires when today is
 * clearly off. Never earlier than 4pm, and at least an hour before quiet hours start.
 */
export function streakMinute(h: Habit, s: Pick<NotifySettings, 'quietStart' | 'quietEnd'>): number {
  let m = h.usualEnd === null ? DEFAULT_STREAK_MIN : h.usualEnd + 60;
  m = Math.max(16 * 60, Math.min(m, 23 * 60));
  const quietOpensEvening = s.quietStart !== s.quietEnd && s.quietStart >= 16 * 60;
  if (quietOpensEvening) m = Math.min(m, s.quietStart - 60);
  return m;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Everything to schedule for the next few days, assuming you don't open the app again
 * (it re-plans every time it closes). Ranked wins > streak > plan > timer > reviews,
 * then thinned to at most three a day, 45 minutes apart, outside quiet hours.
 */
export function planNotifications(input: NotifyInput): PlannedNotification[] {
  const { now, settings: st } = input;
  if (!st.enabled) return [];
  const out: (PlannedNotification & { rank: number })[] = [];
  const add = (rank: number, n: PlannedNotification) => out.push({ ...n, rank });
  const today = startOfLocalDay(now);
  const streak = computeStreak(input.activity, now);
  const habit = studyHabit(input.activity, now);
  const seed = (t: number, salt: number) => Math.floor(startOfLocalDay(t) / DAY) + salt;
  const lastStudy = input.activity.length ? Math.max(...input.activity.filter((t) => t <= now), 0) : 0;

  const days = Array.from({ length: HORIZON_DAYS }, (_, i) => {
    let d = today;
    for (let k = 0; k < i; k++) d = startOfLocalDay(d + DAY + 2 * HOUR); // DST-safe next day
    return d;
  });

  // ---- Wins: right after the moment, so they land while it still feels good.
  if (st.kinds.wins) {
    const soon = moveOutOfQuietHours(now + 20 * MINUTE, st.quietStart, st.quietEnd);
    const fresh = (key: string) => !(key in input.celebrated) || input.celebrated[key] > now;
    if (streak.studiedToday && STREAK_MILESTONES.includes(streak.days)) {
      const key = `streak-${streak.days}-${dayKey(now)}`;
      if (fresh(key)) add(0, { kind: 'wins', at: soon, key, url: '/progress', message: streakMilestoneMessage(streak.days, seed(now, 11)) });
    }
    for (const level of input.levelsJustFinished) {
      const key = `level-${level}`;
      if (fresh(key)) add(0, { kind: 'wins', at: soon, key, url: '/progress', message: levelMessage(level, seed(now, 13)) });
    }
    if (input.running && st.timeGoalMs > 0 && input.timeTodayMs < st.timeGoalMs) {
      const at = now + (st.timeGoalMs - input.timeTodayMs);
      if (startOfLocalDay(at) === today && !isQuietTime(at, st.quietStart, st.quietEnd)) {
        add(0, { kind: 'wins', at, url: '/timer', message: goalMessage(formatDuration(st.timeGoalMs), seed(now, 17)) });
      }
    }
    if (input.running) {
      const at = Math.max(input.running.startedAt + LONG_TIMER_HOURS * HOUR, now + 30 * MINUTE);
      const hours = Math.round((at - input.running.startedAt) / HOUR);
      add(3, {
        kind: 'wins',
        at: moveOutOfQuietHours(at, st.quietStart, st.quietEnd),
        url: '/timer',
        message: longTimerMessage(hours, input.running.activity, seed(now, 19)),
      });
    }
  }

  days.forEach((day, i) => {
    // Assume no more studying after now: on later days the streak has either survived
    // today (if you studied) or is gone.
    const studiedBy = (d: number) => (d === today ? streak.studiedToday : false);
    const aliveStreak = i === 0 ? streak.days : i === 1 && streak.studiedToday ? streak.days : 0;
    const missedBefore = lastStudy > 0 && startOfLocalDay(lastStudy) < startOfLocalDay(previousDay(day + 12 * HOUR));

    // ---- Streak saver (or a comeback nudge once it's gone).
    if (st.kinds.streak && !studiedBy(day)) {
      const at = atMinute(day, streakMinute(habit, st));
      if (at > now + 30 * MINUTE && aliveStreak > 0) {
        add(1, { kind: 'streak', at, url: '/', message: streakMessage(aliveStreak, seed(at, 3)) });
      }
    }

    // ---- Morning plan.
    if (st.kinds.plan && !studiedBy(day)) {
      const at = moveOutOfQuietHours(atMinute(day, planMinute(habit)), st.quietStart, st.quietEnd);
      if (at > now + 15 * MINUTE && startOfLocalDay(at) === day) {
        const newLeft = Math.min(st.dailyNewGrammar, input.unlearned) - (day === today ? input.learnedToday : 0);
        const grammar = input.grammarDue.filter((d) => d <= at).length;
        const cards = input.cardDue.filter((d) => d <= at).length;
        const parts = [
          newLeft > 0 ? plural(newLeft, 'new point') : '',
          grammar > 0 ? plural(grammar, 'review') : '',
          cards > 0 ? plural(cards, 'flashcard') : '',
          st.timeGoalMs > 0 ? `${formatDuration(st.timeGoalMs)} practice` : '',
        ].filter(Boolean);
        if (lastStudy > 0 && missedBefore && aliveStreak === 0) {
          if (st.kinds.streak) add(1, { kind: 'streak', at, url: '/', message: comebackMessage(seed(at, 5)) });
        } else if (parts.length > 0) {
          const next = (i === 0 ? streak.days : aliveStreak) + 1;
          const milestone = STREAK_MILESTONES.includes(next) && next > 3 ? next : undefined;
          add(2, { kind: 'plan', at, url: '/', message: planMessage(parts.join(' · '), seed(at, 7), milestone) });
        }
      }
    }
  });

  // ---- Reviews: when the next one comes due (the original reminder rule).
  if (st.kinds.reviews) {
    const all = [...input.grammarDue, ...input.cardDue];
    const r = planReminder({
      dueTimes: all,
      now,
      lastNotifiedAt: input.lastReviewNotifiedAt,
      settings: { enabled: true, quietStart: st.quietStart, quietEnd: st.quietEnd, minGapHours: st.minGapHours },
    });
    if (r) {
      const grammar = input.grammarDue.filter((d) => d <= r.at).length;
      const cards = input.cardDue.filter((d) => d <= r.at).length;
      add(4, { kind: 'reviews', at: r.at, url: grammar > 0 ? '/review' : '/decks', message: reviewsMessage(grammar, cards, seed(r.at, 1)) });
    }
  }

  // ---- Thin out: best first, max per day, spaced apart, inside the horizon.
  const horizonEnd = days[days.length - 1] + DAY + 2 * HOUR;
  const kept: PlannedNotification[] = [];
  const perDay = new Map<string, number>();
  for (const n of out.sort((a, b) => a.rank - b.rank || a.at - b.at)) {
    if (n.at <= now || n.at >= horizonEnd || isQuietTime(n.at, st.quietStart, st.quietEnd)) continue;
    const k = dayKey(n.at);
    if ((perDay.get(k) ?? 0) >= MAX_PER_DAY) continue;
    if (kept.some((x) => Math.abs(x.at - n.at) < MIN_SPACING)) continue;
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
    kept.push({ kind: n.kind, at: n.at, message: n.message, url: n.url, ...(n.key ? { key: n.key } : {}) });
  }
  return kept.sort((a, b) => a.at - b.at);
}
