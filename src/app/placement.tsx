import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlacementFlow } from '@/components/PlacementFlow';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

/** The placement quiz again, from the Grammar tab: find (or move up to) your station. */
export default function PlacementScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const done = () => (router.canGoBack() ? router.back() : router.replace('/grammar'));
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
      <PlacementFlow onFinish={done} />
    </ScrollView>
  );
}
