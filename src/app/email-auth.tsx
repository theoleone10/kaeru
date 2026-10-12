import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { MIN_PASSWORD, validEmail } from '@/auth/validation';
import { LegalNote } from '@/components/SignInOptions';
import { Button, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { radius, spacing, TAP } from '@/theme/colors';

/** Email + password sign-in and sign-up. */
export default function EmailAuth() {
  const { colors } = useApp();
  const { signInWithEmail, signUpWithEmail, sendPasswordReset, finishOnboarding, onboarded } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>(params.mode === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const done = async () => {
    const wasOnboarded = onboarded;
    await finishOnboarding();
    // From Settings: return there. From the welcome screen, finishing onboarding opens the app.
    if (wasOnboarded) router.dismissTo('/settings');
  };

  const submit = async () => {
    if (!validEmail(email)) return Alert.alert('Check your email', 'Enter a valid email address.');
    if (mode === 'signup' && password.length < MIN_PASSWORD) return Alert.alert('Password too short', `Use at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        await done();
      } else {
        const needsConfirm = await signUpWithEmail(email, password);
        if (needsConfirm) {
          Alert.alert('Confirm your email', `We sent a link to ${email.trim()}. Open it on this phone to finish creating your account, then sign in.`);
          setMode('signin');
        } else {
          await done();
        }
      }
    } catch (e) {
      Alert.alert(mode === 'signin' ? 'Sign-in failed' : 'Sign-up failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!validEmail(email)) return Alert.alert('Enter your email', 'Type the email address for your account first.');
    try {
      await sendPasswordReset(email);
      Alert.alert('Check your email', 'We sent a link to reset your password. Open it on this phone.');
    } catch (e) {
      Alert.alert('Could not send reset email', e instanceof Error ? e.message : String(e));
    }
  };

  const input = [styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: mode === 'signin' ? 'Sign in' : 'Create account' }} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.sm }}>
          <T variant="small">Email</T>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            style={input}
          />
        </View>
        <View style={{ gap: spacing.sm }}>
          <T variant="small">Password</T>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : ''}
            placeholderTextColor={colors.textMuted}
            style={input}
            onSubmitEditing={submit}
          />
        </View>
        <Button label={mode === 'signin' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
        {mode === 'signin' && (
          <Pressable onPress={forgot} accessibilityRole="button" hitSlop={8}>
            <T variant="body" color={colors.accent} style={{ textAlign: 'center' }}>
              Forgot password?
            </T>
          </Pressable>
        )}
        <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} accessibilityRole="button" hitSlop={8}>
          <T variant="body" style={{ textAlign: 'center' }}>
            {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
            <T variant="body" color={colors.accent} style={{ fontWeight: '600' }}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </T>
          </T>
        </Pressable>
        {mode === 'signup' && <LegalNote />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: TAP, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 17 },
});
