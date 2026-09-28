export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  batchSize: number;
  dailyLessonLimit: number;
  furigana: boolean;
  romajiInput: boolean;
  theme: ThemePreference;
  notificationsEnabled: boolean;
  /** Minutes after local midnight. */
  quietStart: number;
  quietEnd: number;
  minReminderGapHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
  batchSize: 4,
  dailyLessonLimit: 12,
  furigana: true,
  romajiInput: true,
  theme: 'system',
  notificationsEnabled: false,
  quietStart: 22 * 60,
  quietEnd: 8 * 60,
  minReminderGapHours: 4,
};

export const LIMITS = {
  batchSize: { min: 1, max: 10 },
  dailyLessonLimit: { min: 1, max: 50 },
  minReminderGapHours: { min: 1, max: 12 },
} as const;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

/** Merge stored values over defaults, dropping anything malformed. */
export function sanitizeSettings(raw: Record<string, unknown>): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  const num = (k: keyof Settings) => (typeof raw[k] === 'number' && Number.isFinite(raw[k]) ? (raw[k] as number) : undefined);
  const bool = (k: keyof Settings) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : undefined);

  const batch = num('batchSize');
  if (batch !== undefined) s.batchSize = clamp(batch, LIMITS.batchSize.min, LIMITS.batchSize.max);
  const daily = num('dailyLessonLimit');
  if (daily !== undefined) s.dailyLessonLimit = clamp(daily, LIMITS.dailyLessonLimit.min, LIMITS.dailyLessonLimit.max);
  const gap = num('minReminderGapHours');
  if (gap !== undefined) s.minReminderGapHours = clamp(gap, LIMITS.minReminderGapHours.min, LIMITS.minReminderGapHours.max);
  const qs = num('quietStart');
  if (qs !== undefined) s.quietStart = clamp(qs, 0, 24 * 60 - 1);
  const qe = num('quietEnd');
  if (qe !== undefined) s.quietEnd = clamp(qe, 0, 24 * 60 - 1);
  for (const k of ['furigana', 'romajiInput', 'notificationsEnabled'] as const) {
    const b = bool(k);
    if (b !== undefined) s[k] = b;
  }
  if (raw.theme === 'system' || raw.theme === 'light' || raw.theme === 'dark') s.theme = raw.theme;
  return s;
}
