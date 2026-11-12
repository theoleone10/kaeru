import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black';
import { ZenMaruGothic_500Medium } from '@expo-google-fonts/zen-maru-gothic/500Medium';
import { ZenMaruGothic_700Bold } from '@expo-google-fonts/zen-maru-gothic/700Bold';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { GoalCelebration } from '@/components/GoalCelebration';
import { LoadingScreen } from '@/components/LoadingScreen';
import { migrate } from '@/db/migrations';
import { AppProvider, useApp } from '@/state/AppProvider';
import { useMilestoneSounds } from '@/sound/useMilestoneSounds';
import { useCloudSync } from '@/sync/useCloudSync';
import { useAppTimeTracking } from '@/time/useAppTimeTracking';
import { TimeProvider } from '@/time/TimeProvider';
import { FONTS } from '@/theme/colors';

// The native splash (plain blue) stays up until the loading screen has drawn over it.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function useNotificationTaps() {
  useEffect(() => {
    if (Platform.OS === 'web') return; // notifications are phone-only
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (url === '/review' || url === '/progress') router.push(url);
      else if (url === '/' || url === '/decks' || url === '/timer') router.navigate(url);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

function ThemedStack({ onReady }: { onReady: () => void }) {
  const { colors, isDark } = useApp();
  const { onboarded } = useAuth();
  useNotificationTaps();
  useCloudSync();
  useAppTimeTracking();
  useMilestoneSounds();
  useEffect(onReady, [onReady]);
  const base = isDark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: colors.accent, background: colors.background, card: colors.surface, text: colors.text, border: colors.border },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { fontFamily: FONTS.black, fontSize: 18, color: colors.text },
          headerTintColor: colors.accent,
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="lessons" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="review" options={{ headerShown: false }} />
          <Stack.Screen name="grammar/[id]" options={{ title: '' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="progress" options={{ title: 'Progress' }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
          <Stack.Screen name="new-password" options={{ title: 'New password' }} />
          <Stack.Screen name="anki/[deck]" options={{ title: 'Study' }} />
          <Stack.Screen name="anki/limits" options={{ title: 'Deck options', presentation: 'modal' }} />
          <Stack.Screen name="anki/note" options={{ title: 'Add cards', presentation: 'modal' }} />
          <Stack.Screen name="anki/new-deck" options={{ title: 'New deck', presentation: 'modal' }} />
          <Stack.Screen name="track/entry" options={{ title: 'Entry', presentation: 'modal' }} />
          <Stack.Screen name="track/shortcuts" options={{ title: 'Shortcuts' }} />
          <Stack.Screen name="track/activities" options={{ title: 'Activities' }} />
          <Stack.Screen name="track/goals" options={{ title: 'Time goals' }} />
          <Stack.Screen name="track/goal" options={{ title: 'Goal', presentation: 'modal' }} />
          <Stack.Screen name="placement" options={{ title: 'Find your station', presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="setup" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: 'Log in' }} />
        </Stack.Protected>
        <Stack.Screen name="email-auth" options={{ title: 'Sign in' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="timer/[action]" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="legal/privacy" options={{ title: 'Privacy Policy' }} />
        <Stack.Screen name="legal/terms" options={{ title: 'Terms of Use' }} />
      </Stack>
      {onboarded && <GoalCelebration />}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Keep the splash screen up until the fonts are ready (no flash of system font).
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  const [fontsLoaded, fontError] = useFonts({
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    ZenMaruGothic_500Medium,
    ZenMaruGothic_700Bold,
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="grammar.db" onInit={migrate}>
        <AppProvider>
          <AuthProvider>
            <TimeProvider>
              <ThemedStack onReady={markReady} />
            </TimeProvider>
          </AuthProvider>
        </AppProvider>
      </SQLiteProvider>
      <LoadingScreen ready={ready} />
    </SafeAreaProvider>
  );
}
