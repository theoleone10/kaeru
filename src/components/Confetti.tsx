import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppProvider';

const PIECES = 36;

/** A one-shot confetti burst from the top of the screen (skipped when Reduce Motion is on). */
export function Confetti() {
  const { colors } = useApp();
  // The palette's colours (indigo, gold, green, blue, flame, coral), so it matches light and dark.
  const palette = [colors.accent, colors.gold, colors.correct, colors.blue, colors.flame, colors.wrong];
  const progress = useState(() => new Animated.Value(0))[0];
  const { width, height } = Dimensions.get('window');
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: ((i * 97) % 100) / 100,
        drift: (((i * 53) % 21) - 10) * 6,
        delay: ((i * 37) % 10) / 25,
        spin: ((i * 29) % 5) + 2,
        tint: i % 6,
        w: 7 + (i % 3) * 2,
        h: 12 + (i % 4) * 2,
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
              backgroundColor: palette[p.tint],
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
