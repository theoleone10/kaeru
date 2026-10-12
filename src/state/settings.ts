export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  /** New grammar points per day: one lesson + quiz covers them all. */
  dailyNewGrammar: number;
  /** Most grammar reviews in a day; the rest wait for the next day. */
  grammarMaxReviewsPerDay: number;
  /** Daily immersion/study time goal in minutes (0 = no goal). */
  dailyTimeGoalMin: number;
  furigana: boolean;
  romajiInput: boolean;
  theme: ThemePreference;
  notificationsEnabled: boolean;
  /** Minutes after local midnight. */
  quietStart: number;
  quietEnd: number;
  minReminderGapHours: number;
  /** Which kinds of notification to send (when notifications are on). */
  notifyReviews: boolean;
  notifyStreak: boolean;
  notifyPlan: boolean;
  notifyWins: boolean;
  /** Log in-app study sessions to the Study activity when no timer is running. */
  autoTrackStudy: boolean;
  /** New Anki cards introduced per deck per day. */
  ankiNewPerDay: number;
  ankiMaxReviewsPerDay: number;
  soundEffects: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNewGrammar: 2,
  grammarMaxReviewsPerDay: 100,
  dailyTimeGoalMin: 30,
  furigana: true,
  romajiInput: true,
  theme: 'system',
  notificationsEnabled: false,
  quietStart: 22 * 60,
  quietEnd: 8 * 60,
  minReminderGapHours: 4,
  notifyReviews: true,
  notifyStreak: true,
  notifyPlan: true,
  notifyWins: true,
  autoTrackStudy: true,
  ankiNewPerDay: 20,
  ankiMaxReviewsPerDay: 200,
  soundEffects: true,
};

export const LIMITS = {
  dailyNewGrammar: { min: 1, max: 5 },
  grammarMaxReviewsPerDay: { min: 10, max: 500 },
  dailyTimeGoalMin: { min: 0, max: 480 },
  minReminderGapHours: { min: 1, max: 12 },
  ankiNewPerDay: { min: 0, max: 200 },
  ankiMaxReviewsPerDay: { min: 10, max: 9999 },
} as const;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

/** Merge stored values over defaults, dropping anything malformed. */
export function sanitizeSettings(raw: Record<string, unknown>): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  const num = (k: keyof Settings) => (typeof raw[k] === 'number' && Number.isFinite(raw[k]) ? (raw[k] as number) : undefined);
  const bool = (k: keyof Settings) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : undefined);

  const daily = num('dailyNewGrammar');
  if (daily !== undefined) s.dailyNewGrammar = clamp(daily, LIMITS.dailyNewGrammar.min, LIMITS.dailyNewGrammar.max);
  const gmax = num('grammarMaxReviewsPerDay');
  if (gmax !== undefined) s.grammarMaxReviewsPerDay = clamp(gmax, LIMITS.grammarMaxReviewsPerDay.min, LIMITS.grammarMaxReviewsPerDay.max);
  const goal = num('dailyTimeGoalMin');
  if (goal !== undefined) s.dailyTimeGoalMin = clamp(goal, LIMITS.dailyTimeGoalMin.min, LIMITS.dailyTimeGoalMin.max);
  const gap = num('minReminderGapHours');
  if (gap !== undefined) s.minReminderGapHours = clamp(gap, LIMITS.minReminderGapHours.min, LIMITS.minReminderGapHours.max);
  const anew = num('ankiNewPerDay');
  if (anew !== undefined) s.ankiNewPerDay = clamp(anew, LIMITS.ankiNewPerDay.min, LIMITS.ankiNewPerDay.max);
  const arev = num('ankiMaxReviewsPerDay');
  if (arev !== undefined) s.ankiMaxReviewsPerDay = clamp(arev, LIMITS.ankiMaxReviewsPerDay.min, LIMITS.ankiMaxReviewsPerDay.max);
  const qs = num('quietStart');
  if (qs !== undefined) s.quietStart = clamp(qs, 0, 24 * 60 - 1);
  const qe = num('quietEnd');
  if (qe !== undefined) s.quietEnd = clamp(qe, 0, 24 * 60 - 1);
  for (const k of [
    'furigana',
    'romajiInput',
    'notificationsEnabled',
    'notifyReviews',
    'notifyStreak',
    'notifyPlan',
    'notifyWins',
    'autoTrackStudy',
    'soundEffects',
  ] as const) {
    const b = bool(k);
    if (b !== undefined) s[k] = b;
  }
  if (raw.theme === 'system' || raw.theme === 'light' || raw.theme === 'dark') s.theme = raw.theme;
  return s;
}
