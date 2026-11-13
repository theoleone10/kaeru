import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Mascot';
import { T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';

/** Tab icon: outline and grey when idle; filled in indigo when active. Today is the one-colour frog. */
function TabIcon({ focused, icon, dot }: { focused: boolean; icon: IconName | 'frog'; dot?: string }) {
  const { colors } = useApp();
  const tint = focused ? colors.accentInk : colors.textFaint;
  return (
    <View style={styles.icon}>
      {icon === 'frog' ? (
        <Logo size={28} color={tint} cutout={colors.bar} />
      ) : (
        <Icon name={icon} size={28} color={tint} filled={focused} cutout={colors.bar} strokeWidth={1.9} />
      )}
      {dot ? <View style={[styles.dot, { backgroundColor: dot, borderColor: colors.bar }]} /> : null}
    </View>
  );
}

function TabLabel({ focused, children }: { focused: boolean; children: string }) {
  const { colors } = useApp();
  return (
    <T variant="small" color={focused ? colors.accentInk : colors.textFaint} style={{ fontSize: 11, lineHeight: 14, fontWeight: focused ? '800' : '700' }}>
      {children}
    </T>
  );
}

export default function TabLayout() {
  const { colors } = useApp();
  const { running, activityById } = useTime();
  const runningColor = running ? (activityById.get(running.activity_id)?.color ?? colors.blue) : undefined;
  const label = ({ focused, children }: { focused: boolean; children: string }) => <TabLabel focused={focused}>{children}</TabLabel>;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarLabel: label,
        tabBarStyle: { backgroundColor: colors.bar, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth * 2, elevation: 0, minHeight: 64, paddingTop: 6 },
        tabBarItemStyle: { alignItems: 'center', justifyContent: 'center', gap: 3 },
        tabBarIconStyle: { width: 56, height: 30 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="frog" /> }} />
      <Tabs.Screen name="grammar" options={{ title: 'Grammar', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="grammar" /> }} />
      <Tabs.Screen name="decks" options={{ title: 'Cards', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="cards" /> }} />
      <Tabs.Screen name="timer" options={{ title: 'Timer', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="timer" dot={runningColor} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 0, right: 12, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
