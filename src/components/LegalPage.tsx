import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LegalDoc } from '../legal/text';
import { useApp } from '../state/AppProvider';
import { spacing } from '../theme/colors';
import { T } from './ui';

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: spacing.lg, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}>
      <Stack.Screen options={{ title: doc.title }} />
      <T variant="small" color={colors.textFaint}>
        Last updated {doc.updated}
      </T>
      {doc.sections.map((s) => (
        <View key={s.heading} style={{ gap: spacing.xs }}>
          <T variant="body" style={{ fontSize: 17, lineHeight: 24, fontWeight: '800' }}>
            {s.heading}
          </T>
          <T variant="body" style={{ fontSize: 15, lineHeight: 23 }} color={colors.textMuted}>
            {s.body}
          </T>
        </View>
      ))}
    </ScrollView>
  );
}
