import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SentenceWriter } from '@/components/SentenceWriter';
import { T } from '@/components/ui';
import { getPoint } from '@/content/loader';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

/** Try a sentence again from a grammar point's screen. */
export default function TrySentence() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const point = getPoint(id);
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
      {point ? <SentenceWriter point={point} source="point" onDone={() => router.back()} /> : <T variant="body">Grammar point not found.</T>}
    </ScrollView>
  );
}
