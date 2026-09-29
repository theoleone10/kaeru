import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/auth/supabase';
import { useApp } from '@/state/AppProvider';

/**
 * Landing route for auth deep links (kaeru://auth-callback?code=…):
 * email confirmation, password reset, and OAuth redirects that open the app directly.
 */
export default function AuthCallback() {
  const { colors } = useApp();
  const { completeFromUrl, finishOnboarding } = useAuth();
  const params = useLocalSearchParams<{ code?: string; error_description?: string; next?: string }>();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    (async () => {
      try {
        if (params.error_description) throw new Error(params.error_description);
        if (params.code) await completeFromUrl(`?code=${encodeURIComponent(params.code)}`);
      } catch (e) {
        // The in-app browser may already have exchanged this code; only complain if we're still signed out.
        const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        if (!data.session) Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
      }
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      if (data.session) await finishOnboarding();
      router.replace(data.session && params.next === 'new-password' ? '/new-password' : '/');
    })();
  }, [params.code, params.error_description, params.next, completeFromUrl, finishOnboarding]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
