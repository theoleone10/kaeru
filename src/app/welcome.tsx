import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/components/Mascot';
import { Button, T } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'library-outline', text: 'Over 400 grammar points from JLPT N5 to N1' },
  { icon: 'repeat-outline', text: 'Spaced-repetition reviews with fill-in-the-blank sentences' },
  { icon: 'albums-outline', text: 'Bring your Anki decks and study them alongside' },
  { icon: 'time-outline', text: 'Track your study time against a daily goal' },
];

/** First-launch screen: set up a new account, or log in to an existing one. */
export default function Welcome() {
  const { colors } = useApp();
  const { returning } = useAuth();
  const insets = useSafeAreaInsets();

  // Logged out of an account: straight to logging in, no setup.
  if (returning) return <Redirect href="/login" />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
        <Mascot size={110} mood="cheer" bounce label="Kaeru the frog, the app mascot" />
        <T variant="title" style={{ fontSize: 44, lineHeight: 56 }}>
          かえる
        </T>
        <T variant="heading">Learn Japanese grammar, one point at a time.</T>
      </View>

      <View style={{ gap: spacing.md }}>
        {FEATURES.map((f) => (
          <View key={f.icon} style={styles.feature}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={f.icon} size={22} color={colors.accent} />
            </View>
            <T variant="body" style={{ flex: 1 }}>
              {f.text}
            </T>
          </View>
        ))}
      </View>

      <View style={{ gap: spacing.md }}>
        <Button label="Get started" onPress={() => router.push('/setup')} />
        <Button label="I already have an account" kind="secondary" onPress={() => router.push('/login')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'space-between', padding: spacing.xl, gap: spacing.xxl },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
