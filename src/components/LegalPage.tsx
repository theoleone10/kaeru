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
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
      <Stack.Screen options={{ title: doc.title }} />
      <T variant="small">Last updated {doc.updated}</T>
      {doc.sections.map((s) => (
        <View key={s.heading} style={{ gap: spacing.xs }}>
          <T variant="heading">{s.heading}</T>
          <T variant="body">{s.body}</T>
        </View>
      ))}
    </ScrollView>
  );
}
