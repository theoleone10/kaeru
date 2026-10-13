import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { State } from '../anki/schedule';
import { curriculum } from '../content/loader';
import { getActivityTimes, getKv, setKv } from '../db/repo';
import { lessonsLearnedToday } from '../srs/lessons';
import type { StoredCard } from '../srs/scheduler';
import type { Settings } from '../state/settings';
import { startOfDay, totalsByActivity } from '../time/model';
import { getRunning, listActivities, listEntriesSince } from '../time/repo';
import { planNotifications, type NotifyKind } from './planner';

// Local notifications only — these work in Expo Go (remote push does not).
const DAY = 24 * 60 * 60 * 1000;

/** One Android channel per kind, so each can also be muted from the phone's own settings. */
const CHANNELS: Record<NotifyKind, string> = {
  reviews: 'Reviews ready',
  streak: 'Streak saver',
  plan: 'Daily plan',
  wins: 'Wins & milestones',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const [id, name] of Object.entries(CHANNELS)) {
    await Notifications.setNotificationChannelAsync(id, { name, importance: Notifications.AndroidImportance.DEFAULT });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** JLPT levels whose every point is learned, with the last one learned in the past day. */
function levelsJustFinished(cards: readonly StoredCard[], now: number): string[] {
  const learnedAt = new Map(cards.map((c) => [c.grammar_id, c.learned_at]));
  const levels = [...new Set(curriculum.map((p) => p.level))];
  return levels.filter((level) => {
    const points = curriculum.filter((p) => p.level === level);
    if (points.length === 0 || !points.every((p) => learnedAt.has(p.id))) return false;
    return Math.max(...points.map((p) => learnedAt.get(p.id) ?? 0)) > now - DAY;
  });
}

/** The reschedule in progress; calls queue behind it so two never interleave. */
let queue: Promise<void> = Promise.resolve();

/**
 * Replace every pending notification with a fresh plan for the next few days.
 * Calls run one at a time: two at once could each cancel, then each schedule, leaving duplicates.
 * meta.reminder_at is when the last review reminder was scheduled; once it has passed
 * we assume it was delivered and use it for the minimum-gap rule. meta.celebrated maps
 * each one-off win to when it was scheduled, so wins are only sent once.
 */
export function rescheduleNotifications(db: SQLiteDatabase, settings: Settings, cards: readonly StoredCard[]): Promise<void> {
  const run = queue.then(() => reschedule(db, settings, cards));
  queue = run;
  return run;
}

async function reschedule(db: SQLiteDatabase, settings: Settings, cards: readonly StoredCard[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = Date.now();
    const meta = await getKv(db, 'meta');
    let lastNotifiedAt = typeof meta.last_notified_at === 'number' ? meta.last_notified_at : null;
    if (typeof meta.reminder_at === 'number' && meta.reminder_at <= now) {
      lastNotifiedAt = meta.reminder_at;
      await setKv(db, 'meta', 'last_notified_at', lastNotifiedAt);
    }
    await setKv(db, 'meta', 'reminder_at', null);

    if (!settings.notificationsEnabled) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await ensureChannels();

    const [activity, cardRows, entries, running, activities] = await Promise.all([
      getActivityTimes(db, now - 60 * DAY),
      db.getAllAsync<{ due: number }>('SELECT due FROM anki_cards WHERE suspended = 0 AND state != ?', State.New),
      listEntriesSince(db, startOfDay(now) - DAY),
      getRunning(db),
      listActivities(db),
    ]);
    const learned = new Set(cards.map((c) => c.grammar_id));
    const celebrated = (meta.celebrated && typeof meta.celebrated === 'object' ? meta.celebrated : {}) as Record<string, number>;

    const planned = planNotifications({
      now,
      settings: {
        enabled: true,
        kinds: { reviews: settings.notifyReviews, streak: settings.notifyStreak, plan: settings.notifyPlan, wins: settings.notifyWins },
        quietStart: settings.quietStart,
        quietEnd: settings.quietEnd,
        minGapHours: settings.minReminderGapHours,
        dailyNewGrammar: settings.dailyNewGrammar,
        timeGoalMs: settings.dailyTimeGoalMin * 60 * 1000,
      },
      grammarDue: cards.filter((c) => !c.suspended).map((c) => c.due),
      cardDue: cardRows.map((r) => r.due),
      activity,
      learnedToday: lessonsLearnedToday(
        cards.map((c) => c.learned_at),
        now,
      ),
      unlearned: curriculum.filter((p) => !learned.has(p.id)).length,
      timeTodayMs: [...totalsByActivity(entries, startOfDay(now), startOfDay(now) + 2 * DAY, now).values()].reduce((a, b) => a + b, 0),
      running: running ? { startedAt: running.started_at, activity: activities.find((a) => a.id === running.activity_id)?.name ?? 'your timer' } : null,
      levelsJustFinished: levelsJustFinished(cards, now),
      lastReviewNotifiedAt: lastNotifiedAt,
      celebrated,
    });

    const nextCelebrated = { ...celebrated };
    for (const n of planned) {
      await Notifications.scheduleNotificationAsync({
        content: { title: n.message.title, body: n.message.body, data: { url: n.url, kind: n.kind } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: n.kind },
      });
      if (n.kind === 'reviews') await setKv(db, 'meta', 'reminder_at', n.at);
      if (n.key) nextCelebrated[n.key] = n.at;
    }
    // Forget wins older than a couple of weeks so the list doesn't grow forever (level wins stay).
    for (const [k, at] of Object.entries(nextCelebrated)) if (k.startsWith('streak-') && at < now - 14 * DAY) delete nextCelebrated[k];
    await setKv(db, 'meta', 'celebrated', nextCelebrated);
  } catch (e) {
    console.warn('Could not schedule notifications', e);
  }
}
