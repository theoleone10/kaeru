import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useApp } from '../state/AppProvider';
import { radius, spacing, TAP } from '../theme/colors';
import { T } from './ui';

/**
 * Apple, Google and email sign-in buttons. Calls `onSignedIn` after a successful sign-in.
 * `newAccount` opens the email screen on creating an account rather than signing in.
 */
export function SignInOptions({ onSignedIn, newAccount = false }: { onSignedIn: () => void; newAccount?: boolean }) {
  const { colors, isDark } = useApp();
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [nativeApple, setNativeApple] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setNativeApple);
  }, []);

  const run = async (which: 'apple' | 'google') => {
    setBusy(which);
    try {
      const ok = which === 'apple' ? await signInWithApple() : await signInWithGoogle();
      if (ok) onSignedIn();
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const outlined = { backgroundColor: colors.surface, borderColor: colors.border };

  return (
    <View style={{ gap: spacing.md }}>
      {nativeApple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radius.md}
          style={{ height: TAP + 4, opacity: busy ? 0.6 : 1 }}
          onPress={() => !busy && run('apple')}
        />
      ) : (
        <ProviderButton icon="logo-apple" label="Continue with Apple" onPress={() => run('apple')} busy={busy === 'apple'} disabled={!!busy} style={outlined} />
      )}
      <ProviderButton icon="logo-google" label="Continue with Google" onPress={() => run('google')} busy={busy === 'google'} disabled={!!busy} style={outlined} />
      <ProviderButton icon="mail-outline" label="Continue with email" onPress={() => router.push(newAccount ? { pathname: '/email-auth', params: { mode: 'signup' } } : '/email-auth')} disabled={!!busy} style={outlined} />
    </View>
  );
}

function ProviderButton({
  icon,
  label,
  onPress,
  busy,
  disabled,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  busy?: boolean;
  disabled?: boolean;
  style?: object;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, style, { opacity: disabled && !busy ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={[styles.label, { color: colors.text }]}>{busy ? 'Signing in…' : label}</Text>
    </Pressable>
  );
}

/** The quiet way past signing in: a text link, so it doesn't compete with the sign-in buttons. */
export function NoAccountLink({ onPress }: { onPress: () => void }) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Progress is kept on this phone only"
      hitSlop={8}
      style={({ pressed }) => ({ minHeight: TAP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, opacity: pressed ? 0.6 : 1 })}
    >
      <T variant="body" color={colors.accent} style={{ fontWeight: '700', textAlign: 'center' }}>
        Continue without an account
      </T>
    </Pressable>
  );
}

/** Small print shown under sign-in buttons, linking to the legal pages. */
export function LegalNote() {
  const { colors } = useApp();
  return (
    <T variant="small" style={{ textAlign: 'center' }}>
      By continuing you agree to the{' '}
      <Link href="/legal/terms" style={{ color: colors.accent, fontWeight: '600' }}>
        Terms
      </Link>{' '}
      and{' '}
      <Link href="/legal/privacy" style={{ color: colors.accent, fontWeight: '600' }}>
        Privacy Policy
      </Link>
      .
    </T>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  label: { fontSize: 17, fontWeight: '600' },
});
