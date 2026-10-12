import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { Logo } from '@/components/Mascot';
import { useApp } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';

type IconName = keyof typeof Ionicons.glyphMap | 'frog';

/** Tab icon: outline and muted when idle; filled in indigo when active. */
function TabIcon({ focused, icon, dot }: { focused: boolean; icon: IconName; dot?: string }) {
  const { colors } = useApp();
  const filled = icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap;
  const tint = focused ? colors.accent : colors.textMuted;
  return (
    <View style={{ width: 56, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      {icon === 'frog' ? (
        <Logo size={28} color={tint} cutout={colors.background} />
      ) : (
        <Ionicons name={focused ? filled : icon} size={25} color={tint} />
      )}
      {dot ? <View style={{ position: 'absolute', top: 2, right: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: dot, borderWidth: 2, borderColor: colors.background }} /> : null}
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useApp();
  const { running, activityById } = useTime();
  const runningColor = running ? (activityById.get(running.activity_id)?.color ?? colors.blue) : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0, minHeight: 62, paddingTop: 6 },
        tabBarItemStyle: { alignItems: 'center', justifyContent: 'center' },
        tabBarIconStyle: { width: 56, height: 44 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="frog" /> }} />
      <Tabs.Screen name="grammar" options={{ title: 'Grammar', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="train-outline" /> }} />
      <Tabs.Screen name="decks" options={{ title: 'Cards', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="albums-outline" /> }} />
      <Tabs.Screen name="timer" options={{ title: 'Timer', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="timer-outline" dot={runningColor} /> }} />
    </Tabs>
  );
}
