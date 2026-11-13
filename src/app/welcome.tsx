import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/components/Icon';
import { Mascot } from '@/components/Mascot';
import { Button, IconTile, T } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useApp } from '@/state/AppProvider';
import { spacing, type Palette } from '@/theme/colors';

const FEATURES: { icon: IconName; text: string; tone: (c: Palette, dark: boolean) => { color: string; soft: string } }[] = [
  { icon: 'grammar', text: 'Over 400 grammar points from JLPT N5 to N1', tone: (c) => ({ color: c.accentInk, soft: c.accentSoft }) },
  { icon: 'review', text: 'Spaced-repetition reviews with fill-in-the-blank sentences', tone: (c, d) => ({ color: d ? c.correctText : c.correctShadow, soft: c.correctSoft }) },
  { icon: 'cards', text: '600 starter words as flashcards, or bring your Anki decks', tone: (c) => ({ color: c.blueText, soft: c.blueSoft }) },
  { icon: 'timer', text: 'Track your study time against a daily goal', tone: (c, d) => ({ color: d ? c.notice : c.goldShadow, soft: c.goldSoft }) },
];

/** First-launch screen: set up a new account, or log in to an existing one. */
export default function Welcome() {
  const { colors, isDark } = useApp();
  const { returning } = useAuth();
  const insets = useSafeAreaInsets();

  // Logged out of an account: straight to logging in, no setup.
  if (returning) return <Redirect href="/login" />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={{ gap: spacing.md, alignItems: 'flex-start' }}>
        <Mascot size={112} mood="cheer" bounce label="Kaeru the frog, the app mascot" />
        <T variant="title" style={{ fontSize: 46, lineHeight: 56, letterSpacing: 1 }}>
          かえる
        </T>
        <T variant="body" style={{ fontSize: 20, lineHeight: 28, fontWeight: '700' }}>
          Learn Japanese grammar, one point at a time.
        </T>
      </View>

      <View style={{ gap: spacing.lg }}>
        {FEATURES.map((f) => {
          const tone = f.tone(colors, isDark);
          return (
            <View key={f.icon} style={styles.feature}>
              <IconTile icon={f.icon} color={tone.color} soft={tone.soft} size={40} filled={false} />
              <T variant="body" style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>
                {f.text}
              </T>
            </View>
          );
        })}
      </View>

      <View style={{ flexGrow: 1 }} />

      <View style={{ gap: spacing.md }}>
        <Button label="Get started" onPress={() => router.push('/setup')} />
        <Button label="I already have an account" kind="secondary" onPress={() => router.push('/login')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: 28 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
