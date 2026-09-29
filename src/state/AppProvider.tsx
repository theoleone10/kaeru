import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Appearance, AppState, useColorScheme } from 'react-native';
import { getAllCards, getKv, setKv } from '../db/repo';
import { rescheduleReminder } from '../notifications/schedule';
import type { StoredCard } from '../srs/scheduler';
import { dark, light, type Palette } from '../theme/colors';
import { setSoundEnabled } from '../sound/sounds';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from './settings';

interface AppContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  cards: StoredCard[];
  cardsById: Map<string, StoredCard>;
  /** Reload cards from the database after any change to progress. */
  refresh: () => Promise<void>;
  colors: Palette;
  isDark: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [cards, setCards] = useState<StoredCard[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setCards(await getAllCards(db));
  }, [db]);

  useEffect(() => {
    (async () => {
      setSettings(sanitizeSettings(await getKv(db, 'settings')));
      await refresh();
      setLoaded(true);
    })();
  }, [db, refresh]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      for (const [k, v] of Object.entries(patch)) await setKv(db, 'settings', k, v);
    },
    [db, settings],
  );

  useEffect(() => {
    setSoundEnabled(settings.soundEffects);
  }, [settings.soundEffects]);

  // Theme: 'system' follows the OS; otherwise override it. On device we also tell
  // the OS so native pieces (keyboard, alerts) match; web has no such API.
  useEffect(() => {
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(settings.theme === 'system' ? 'unspecified' : settings.theme);
    }
  }, [settings.theme]);
  const scheme = useColorScheme();
  const isDark = settings.theme === 'system' ? scheme === 'dark' : settings.theme === 'dark';

  // Re-plan the review reminder when the app goes to the background and when
  // reminder settings change (not on every review — that would churn needlessly).
  const latest = useRef({ settings, cards });
  useEffect(() => {
    latest.current = { settings, cards };
  }, [settings, cards]);
  const { notificationsEnabled, quietStart, quietEnd, minReminderGapHours } = settings;
  useEffect(() => {
    if (!loaded) return;
    rescheduleReminder(db, latest.current.settings, latest.current.cards);
  }, [db, loaded, notificationsEnabled, quietStart, quietEnd, minReminderGapHours]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') rescheduleReminder(db, latest.current.settings, latest.current.cards);
    });
    return () => sub.remove();
  }, [db]);

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      updateSettings,
      cards,
      cardsById: new Map(cards.map((c) => [c.grammar_id, c])),
      refresh,
      colors: isDark ? dark : light,
      isDark,
    }),
    [settings, updateSettings, cards, refresh, isDark],
  );

  if (!loaded) return null;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Re-render every `ms` so due counts stay current while a screen is open. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
