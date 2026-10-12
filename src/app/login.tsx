import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { Mascot } from '@/components/Mascot';
import { LegalNote, NoAccountLink, SignInOptions } from '@/components/SignInOptions';
import { T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

/** Log in to an existing account: no setup, your settings and progress come from the account. */
export default function Login() {
  const { colors } = useApp();
  const { finishOnboarding, returning } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, gap: spacing.xl, paddingTop: returning ? insets.top + spacing.xxl : spacing.xl, paddingBottom: insets.bottom + spacing.xl }}
    >
      <Stack.Screen options={{ headerShown: !returning }} />
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Mascot size={96} mood="happy" bounce />
        <T variant="title" style={{ textAlign: 'center' }}>
          Welcome back
        </T>
        <T variant="muted" style={{ textAlign: 'center' }}>
          Log in to pick up where you left off.
        </T>
      </View>

      <SignInOptions onSignedIn={finishOnboarding} />

      <View style={{ flex: 1 }} />

      <View style={{ gap: spacing.md }}>
        <Pressable onPress={() => router.push('/setup')} accessibilityRole="button" hitSlop={8}>
          <T variant="body" style={{ textAlign: 'center' }}>
            New here?{' '}
            <T variant="body" color={colors.accent} style={{ fontWeight: '700' }}>
              Set up Kaeru
            </T>
          </T>
        </Pressable>
        <NoAccountLink onPress={finishOnboarding} />
        <LegalNote />
      </View>
    </ScrollView>
  );
}
