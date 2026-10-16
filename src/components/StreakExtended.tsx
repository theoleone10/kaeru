import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { useOncePerDaySound } from '../sound/useMilestoneSounds';
import { useApp } from '../state/AppProvider';
import { radius, spacing } from '../theme/colors';
import { Flame } from './Flame';
import { T } from './ui';

/** "Streak extended!" badge for the end of the lesson that kept the streak going: pops in, flame and day count. */
export function StreakExtended({ days }: { days: number }) {
  const { colors } = useApp();
  const scale = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.sequence([
      Animated.delay(500),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [scale]);
  useOncePerDaySound('streak', true, 1400);
  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLabel={`Streak extended. ${days} day streak.`}
      style={{ transform: [{ scale }], alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.goldSoft }}
    >
      <Flame size={34} color="#F08A3C" />
      <View>
        <T variant="heading" color="#D9663D" style={{ fontWeight: '900' }}>
          {`${days}-day streak!`}
        </T>
        <T variant="small" color="#B5532F" style={{ fontWeight: '800' }}>
          Streak extended
        </T>
      </View>
    </Animated.View>
  );
}
