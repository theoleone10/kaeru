import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Mascot } from '@/components/Mascot';
import { LegalNote, SignInOptions } from '@/components/SignInOptions';
import { T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

/** Sign in later, from Settings, after starting without an account. */
export default function SignIn() {
  const { colors } = useApp();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}>
      <View style={{ alignItems: 'center' }}>
        <Mascot size={96} mood="happy" bounce />
      </View>
      <T variant="muted" style={{ textAlign: 'center' }}>
        Sign in to back up your progress to your account and pick it up on another phone. Your current progress on this phone is kept.
      </T>
      <SignInOptions onSignedIn={() => router.back()} />
      <LegalNote />
    </ScrollView>
  );
}
