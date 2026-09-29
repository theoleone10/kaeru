import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { T } from '@/components/ui';
import { useApp, useNow } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';

type IconName = keyof typeof Ionicons.glyphMap;

/** Tab icon: outline when idle; filled on a soft clay chip when active (like the mockup). */
function TabIcon({ focused, icon, badge, dot }: { focused: boolean; icon: IconName; badge?: number; dot?: string }) {
  const { colors } = useApp();
  const filled = icon.replace('-outline', '') as IconName;
  return (
    <View
      style={{
        width: 58,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.accentSoft : 'transparent',
        borderWidth: 2,
        borderColor: focused ? colors.accent : 'transparent',
      }}
    >
      <Ionicons name={focused ? filled : icon} size={26} color={focused ? colors.accent : colors.textMuted} />
      {badge ? (
        <View style={{ position: 'absolute', top: -6, right: 2, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: colors.correct, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}>
          <T variant="small" color="#FFFFFF" style={{ fontSize: 11, lineHeight: 14, fontWeight: '900' }}>
            {badge > 99 ? '99+' : String(badge)}
          </T>
        </View>
      ) : null}
      {dot ? <View style={{ position: 'absolute', top: 2, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: dot, borderWidth: 2, borderColor: colors.surface }} /> : null}
    </View>
  );
}

export default function TabLayout() {
  const { colors, cards } = useApp();
  const { running, activityById } = useTime();
  const now = useNow();
  const due = cards.filter((c) => !c.suspended && c.due <= now).length;
  const runningColor = running ? (activityById.get(running.activity_id)?.color ?? colors.blue) : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 2, minHeight: 70, paddingTop: 8 },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="home-outline" /> }} />
      <Tabs.Screen name="grammar" options={{ title: 'Grammar', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="train-outline" /> }} />
      <Tabs.Screen name="review" options={{ title: 'Review', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="refresh-circle-outline" badge={due} /> }} />
      <Tabs.Screen name="decks" options={{ title: 'Decks', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="albums-outline" /> }} />
      <Tabs.Screen name="track" options={{ title: 'Track', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="timer-outline" dot={runningColor} /> }} />
    </Tabs>
  );
}
