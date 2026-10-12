import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { Logo } from '@/components/Mascot';
import { T } from '@/components/ui';
import { reviewCount } from '@/srs/queue';
import { useApp, useNow } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';

type IconName = keyof typeof Ionicons.glyphMap | 'frog';

/** Tab icon: outline and muted when idle; filled in indigo when active. */
function TabIcon({ focused, icon, badge, dot }: { focused: boolean; icon: IconName; badge?: number; dot?: string }) {
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
      {badge ? (
        <View style={{ position: 'absolute', top: -2, right: 4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.correct, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background }}>
          <T variant="small" color="#FFFFFF" style={{ fontSize: 11, lineHeight: 14, fontWeight: '900' }}>
            {badge > 99 ? '99+' : String(badge)}
          </T>
        </View>
      ) : null}
      {dot ? <View style={{ position: 'absolute', top: 2, right: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: dot, borderWidth: 2, borderColor: colors.background }} /> : null}
    </View>
  );
}

export default function TabLayout() {
  const { colors, cards, settings } = useApp();
  const { running, activityById } = useTime();
  const now = useNow();
  const due = reviewCount(cards, now, settings.grammarMaxReviewsPerDay);
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
      <Tabs.Screen name="grammar" options={{ title: 'Grammar', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="train-outline" badge={due} /> }} />
      <Tabs.Screen name="decks" options={{ title: 'Cards', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="albums-outline" /> }} />
      <Tabs.Screen name="timer" options={{ title: 'Timer', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="timer-outline" dot={runningColor} /> }} />
    </Tabs>
  );
}
