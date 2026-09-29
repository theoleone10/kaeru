import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LegalNote, SignInOptions } from '@/components/SignInOptions';
import { Button, T } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'library-outline', text: 'Every JLPT grammar point from N5 to N1' },
  { icon: 'repeat-outline', text: 'Spaced-repetition reviews with fill-in-the-blank sentences' },
  { icon: 'cloud-done-outline', text: 'Sign in to back up progress and continue on another phone' },
];

/** First-launch screen. Signing in is optional: the whole app works without an account. */
export default function Welcome() {
  const { colors } = useApp();
  const { finishOnboarding } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={{ gap: spacing.sm }}>
        <T variant="title" style={{ fontSize: 44 }}>
          文法
        </T>
        <T variant="heading">Learn Japanese grammar, one point at a time.</T>
      </View>

      <View style={{ gap: spacing.md }}>
        {FEATURES.map((f) => (
          <View key={f.icon} style={styles.feature}>
            <Ionicons name={f.icon} size={22} color={colors.accent} />
            <T variant="body" style={{ flex: 1 }}>
              {f.text}
            </T>
          </View>
        ))}
      </View>

      <View style={{ gap: spacing.md }}>
        <SignInOptions onSignedIn={finishOnboarding} />
        <Button label="Use without an account" kind="ghost" onPress={finishOnboarding} accessibilityHint="Progress is kept on this phone only" />
        <LegalNote />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'space-between', padding: spacing.xl, gap: spacing.xxl },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
