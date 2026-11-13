import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * Accounts are optional: without these two values (see .env.example) the app runs
 * exactly as before — fully offline, no sign-in screens.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY?.trim();

/**
 * Never throws: this runs as the app starts, where an error closes a release build at once.
 * A malformed URL (quotes, the variable name pasted in, no https://) makes createClient throw,
 * so the app runs offline instead, as without accounts.
 */
function connect(): SupabaseClient | null {
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: {
        // expo-sqlite's localStorage polyfill persists the session on device.
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  } catch (e) {
    console.warn('Accounts are off: EXPO_PUBLIC_SUPABASE_URL is not a valid https URL.', e);
    return null;
  }
}

export const supabase: SupabaseClient | null = connect();

export const authConfigured = supabase !== null;

// Only refresh tokens while the app is in the foreground (Supabase's React Native guidance).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
