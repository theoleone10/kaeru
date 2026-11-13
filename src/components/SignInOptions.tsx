import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Link, router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useApp } from '../state/AppProvider';
import { radius, spacing, TAP } from '../theme/colors';
import { Icon } from './Icon';
import { fontStyle, T } from './ui';

const LIP_PROVIDER = 3;

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

  return (
    <View style={{ gap: spacing.md }}>
      {nativeApple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radius.md}
          style={{ height: TAP + 2, opacity: busy ? 0.6 : 1 }}
          onPress={() => !busy && run('apple')}
        />
      ) : (
        <ProviderButton
          icon={<Ionicons name="logo-apple" size={20} color={isDark ? '#000000' : '#FFFFFF'} />}
          label="Continue with Apple"
          onPress={() => run('apple')}
          busy={busy === 'apple'}
          disabled={!!busy}
          face={isDark ? { bg: '#FFFFFF', lip: colors.textMuted, fg: '#000000' } : { bg: '#1B1F33', lip: '#000000', fg: '#FFFFFF' }}
        />
      )}
      <ProviderButton icon={<GoogleLogo />} label="Continue with Google" onPress={() => run('google')} busy={busy === 'google'} disabled={!!busy} />
      <ProviderButton
        icon={<Icon name="mail" size={20} color={colors.accentInk} />}
        label="Continue with email"
        onPress={() => router.push(newAccount ? { pathname: '/email-auth', params: { mode: 'signup' } } : '/email-auth')}
        disabled={!!busy}
      />
    </View>
  );
}

/** Google's four-colour "G" (brand mark, drawn as given). */
function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
      <Path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
      <Path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" fill="#FBBC05" />
      <Path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" fill="#EA4335" />
    </Svg>
  );
}

/** A provider button: an outlined face on a lip (or a solid face, for Apple). */
function ProviderButton({
  icon,
  label,
  onPress,
  busy,
  disabled,
  face,
}: {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
  busy?: boolean;
  disabled?: boolean;
  face?: { bg: string; lip: string; fg: string };
}) {
  const { colors } = useApp();
  const c = face ?? { bg: colors.surface, lip: colors.borderStrong, fg: colors.text };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      onPress={onPress}
      disabled={disabled}
      style={{ minHeight: TAP + 2 + LIP_PROVIDER, opacity: disabled && !busy ? 0.5 : 1 }}
    >
      {({ pressed }) => (
        <>
          <View style={[StyleSheet.absoluteFill, { top: LIP_PROVIDER, borderRadius: radius.md, backgroundColor: c.lip }]} />
          <View
            style={[
              styles.button,
              {
                backgroundColor: c.bg,
                borderColor: face ? c.bg : colors.border,
                transform: [{ translateY: pressed ? LIP_PROVIDER : 0 }],
              },
            ]}
          >
            {icon}
            <T variant="body" color={c.fg} style={{ fontWeight: '700' }}>
              {busy ? 'Signing in…' : label}
            </T>
          </View>
        </>
      )}
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
      <T variant="body" color={colors.accentInk} style={{ fontWeight: '700', textAlign: 'center', fontSize: 15 }}>
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
      <Link href="/legal/terms" style={[{ color: colors.accentInk }, fontStyle({ fontWeight: '700' }, false)]}>
        Terms
      </Link>{' '}
      and{' '}
      <Link href="/legal/privacy" style={[{ color: colors.accentInk }, fontStyle({ fontWeight: '700' }, false)]}>
        Privacy Policy
      </Link>
      .
    </T>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP + 2,
    borderRadius: radius.md,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
});
