import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const COLORS = ['#D9663D', '#F2B33D', '#3FA34D', '#2F7FC1', '#8E5BB5', '#F6A38C'];
const PIECES = 36;

/** A one-shot confetti burst from the top of the screen (skipped when Reduce Motion is on). */
export function Confetti() {
  const progress = useState(() => new Animated.Value(0))[0];
  const { width, height } = Dimensions.get('window');
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: ((i * 97) % 100) / 100,
        drift: (((i * 53) % 21) - 10) * 6,
        delay: ((i * 37) % 10) / 25,
        spin: ((i * 29) % 5) + 2,
        color: COLORS[i % COLORS.length],
        w: 6 + (i % 3) * 3,
        h: 10 + (i % 4) * 3,
      })),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      Animated.timing(progress, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [progress]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
      {pieces.map((p, i) => {
        const start = p.delay;
        const t = progress.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x * width,
              top: -20,
              width: p.w,
              height: p.h,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity: t.interpolate({ inputRange: [0, 0.01, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 180}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
