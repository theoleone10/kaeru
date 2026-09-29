import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { Logo } from '@/components/Mascot';
import { T } from '@/components/ui';
import { useApp, useNow } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';

type IconName = keyof typeof Ionicons.glyphMap | 'frog';

/** Tab icon: outline when idle; filled on a soft clay chip when active (like the mockup). */
function TabIcon({ focused, icon, badge, dot }: { focused: boolean; icon: IconName; badge?: number; dot?: string }) {
  const { colors } = useApp();
  const filled = icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap;
  return (
    <View
      style={{
        width: 56,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.accentSoft : 'transparent',
      }}
    >
      {icon === 'frog' ? (
        <Logo size={30} color={focused ? colors.accent : colors.textMuted} cutout={focused ? colors.accentSoft : colors.surface} />
      ) : (
        <Ionicons name={focused ? filled : icon} size={25} color={focused ? colors.accent : colors.textMuted} />
      )}
      {badge ? (
        <View style={{ position: 'absolute', top: -4, right: 0, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: colors.correct, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}>
          <T variant="small" color="#FFFFFF" style={{ fontSize: 11, lineHeight: 14, fontWeight: '900' }}>
            {badge > 99 ? '99+' : String(badge)}
          </T>
        </View>
      ) : null}
      {dot ? <View style={{ position: 'absolute', top: 4, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: dot, borderWidth: 2, borderColor: colors.surface }} /> : null}
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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 2, minHeight: 66, paddingTop: 8 },
        tabBarItemStyle: { alignItems: 'center', justifyContent: 'center' },
        // Room for the whole chip, so it isn't clipped or pushed off-centre.
        tabBarIconStyle: { width: 56, height: 40 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="frog" /> }} />
      <Tabs.Screen name="grammar" options={{ title: 'Grammar', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="train-outline" badge={due} /> }} />
      <Tabs.Screen name="decks" options={{ title: 'Cards', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="albums-outline" /> }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="stats-chart-outline" dot={runningColor} /> }} />
    </Tabs>
  );
}
