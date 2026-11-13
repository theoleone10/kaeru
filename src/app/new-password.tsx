import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { MIN_PASSWORD } from '@/auth/validation';
import { Button, fontStyle, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { radius, spacing, TAP } from '@/theme/colors';

/** Reached from a password-reset email link, after the link has signed the user in. */
export default function NewPassword() {
  const { colors } = useApp();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (password.length < MIN_PASSWORD) return Alert.alert('Password too short', `Use at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    try {
      await updatePassword(password);
      Alert.alert('Password updated');
      router.replace('/');
    } catch (e) {
      Alert.alert('Could not update password', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
      <T variant="muted">Choose a new password for your account.</T>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoFocus
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder={`At least ${MIN_PASSWORD} characters`}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
        onSubmitEditing={save}
      />
      <Button label="Save password" onPress={save} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: TAP, borderWidth: 2, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 17, ...fontStyle({ fontWeight: '500' }, false) },
});
