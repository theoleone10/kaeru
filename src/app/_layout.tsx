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
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { migrate } from '@/db/migrations';
import { AppProvider, useApp } from '@/state/AppProvider';
import { useCloudSync } from '@/sync/useCloudSync';
import { TimeProvider } from '@/time/TimeProvider';
import { FONTS } from '@/theme/colors';

function useNotificationTaps() {
  useEffect(() => {
    if (Platform.OS === 'web') return; // notifications are phone-only
    const open = (response: Notifications.NotificationResponse | null) => {
      if (response?.notification.request.content.data?.url === '/review') router.push('/review');
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

function ThemedStack() {
  const { colors, isDark } = useApp();
  const { onboarded } = useAuth();
  useNotificationTaps();
  useCloudSync();
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
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
          <Stack.Screen name="new-password" options={{ title: 'New password' }} />
          <Stack.Screen name="anki/[deck]" options={{ title: 'Study' }} />
          <Stack.Screen name="track/entry" options={{ title: 'Entry', presentation: 'modal' }} />
          <Stack.Screen name="track/shortcuts" options={{ title: 'Shortcuts' }} />
          <Stack.Screen name="track/activities" options={{ title: 'Activities' }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="email-auth" options={{ title: 'Sign in' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="timer/[action]" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="legal/privacy" options={{ title: 'Privacy Policy' }} />
        <Stack.Screen name="legal/terms" options={{ title: 'Terms of Use' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Keep the splash screen up until the fonts are ready (no flash of system font).
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
              <ThemedStack />
            </TimeProvider>
          </AuthProvider>
        </AppProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
