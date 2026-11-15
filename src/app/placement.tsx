import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlacementFlow } from '@/components/PlacementFlow';
import { useApp } from '@/state/AppProvider';

/** The placement quiz again, from the Grammar tab: find (or move up to) your station. */
export default function PlacementScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const done = () => (router.canGoBack() ? router.back() : router.replace('/grammar'));
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PlacementFlow onFinish={done} bottomInset={insets.bottom} />
    </View>
  );
}
