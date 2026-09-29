import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { useApp, useNow } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';

export default function TabLayout() {
  const { colors, cards } = useApp();
  const { running } = useTime();
  const now = useNow();
  const due = cards.filter((c) => !c.suspended && c.due <= now).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="grammar"
        options={{ title: 'Grammar', tabBarIcon: ({ color, size }) => <Ionicons name="library-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Review',
          tabBarBadge: due > 0 ? (due > 99 ? '99+' : due) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.accentText },
          tabBarIcon: ({ color, size }) => <Ionicons name="create-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: 'Track',
          tabBarBadge: running ? '●' : undefined,
          tabBarBadgeStyle: { backgroundColor: 'transparent', color: colors.wrong, fontSize: 10 },
          tabBarIcon: ({ color, size }) => <Ionicons name="timer-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
