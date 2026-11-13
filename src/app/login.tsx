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
      contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, gap: spacing.xxl, paddingTop: returning ? insets.top + 72 : spacing.xl, paddingBottom: insets.bottom + spacing.xl }}
    >
      <Stack.Screen options={{ headerShown: !returning }} />
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Mascot size={96} mood="happy" bounce />
        <T variant="title" style={{ textAlign: 'center' }}>
          Welcome back
        </T>
        <T variant="muted" style={{ textAlign: 'center', fontSize: 16 }}>
          Log in to pick up where you left off.
        </T>
      </View>

      <SignInOptions onSignedIn={finishOnboarding} />

      <View style={{ flex: 1 }} />

      <View style={{ gap: spacing.xs, alignItems: 'center' }}>
        <Pressable onPress={() => router.push('/setup')} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T variant="body" style={{ textAlign: 'center', fontSize: 15 }}>
            New here?{' '}
            <T variant="body" color={colors.accentInk} style={{ fontWeight: '700', fontSize: 15 }}>
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
