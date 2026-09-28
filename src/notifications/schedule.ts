import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { getKv, setKv } from '../db/repo';
import type { StoredCard } from '../srs/scheduler';
import type { Settings } from '../state/settings';
import { planReminder } from './plan';

// Local notifications only — these work in Expo Go (remote push does not).
const CHANNEL_ID = 'reviews';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Review reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Replace the single pending reminder with a freshly planned one.
 * meta.reminder_at is the time of the last reminder we scheduled; if it has already
 * passed, we assume it was delivered and use it for the minimum-gap rule.
 */
export async function rescheduleReminder(db: SQLiteDatabase, settings: Settings, cards: readonly StoredCard[]): Promise<void> {
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

    const plan = planReminder({
      dueTimes: cards.filter((c) => !c.suspended).map((c) => c.due),
      now,
      lastNotifiedAt,
      settings: {
        enabled: settings.notificationsEnabled,
        quietStart: settings.quietStart,
        quietEnd: settings.quietEnd,
        minGapHours: settings.minReminderGapHours,
      },
    });
    if (!plan) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Grammar reviews are ready',
        body: plan.count === 1 ? '1 review is waiting for you.' : `${plan.count} reviews are waiting for you.`,
        data: { url: '/review' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.at,
        channelId: CHANNEL_ID,
      },
    });
    await setKv(db, 'meta', 'reminder_at', plan.at);
  } catch (e) {
    console.warn('Could not schedule reminder', e);
  }
}
