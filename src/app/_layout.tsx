import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { migrate } from '@/db/migrations';
import { AppProvider, useApp } from '@/state/AppProvider';

function useNotificationTaps() {
  useEffect(() => {
    if (Platform.OS === 'web') return; // notifications are phone-only
    const open = (response: Notifications.NotificationResponse | null) => {
      if (response?.notification.request.content.data?.url === '/review') router.navigate('/review');
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

function ThemedStack() {
  const { colors, isDark } = useApp();
  useNotificationTaps();
  const base = isDark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: colors.accent, background: colors.background, card: colors.surface, text: colors.text, border: colors.border },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerShadowVisible: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="lessons" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="grammar/[id]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="grammar.db" onInit={migrate}>
        <AppProvider>
          <ThemedStack />
        </AppProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
