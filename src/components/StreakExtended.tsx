import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { useOncePerDaySound } from '../sound/useMilestoneSounds';
import { useApp } from '../state/AppProvider';
import { spacing } from '../theme/colors';
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
      style={{ transform: [{ scale }], alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.lg + 2, borderRadius: 999, backgroundColor: colors.flameSoft }}
    >
      <Flame size={30} color={colors.flame} />
      <View>
        <T variant="body" color={colors.flameText} style={{ fontWeight: '800', fontSize: 17, lineHeight: 22 }}>
          {`${days}-day streak!`}
        </T>
        <T variant="small" color={colors.flameText} style={{ fontWeight: '700', fontSize: 12, lineHeight: 16 }}>
          Streak extended
        </T>
      </View>
    </Animated.View>
  );
}
