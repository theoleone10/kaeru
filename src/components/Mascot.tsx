import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useApp } from '../state/AppProvider';

export type Mood = 'happy' | 'cheer' | 'think' | 'sad' | 'sleep';

/**
 * Musubi, the onigiri mascot. `bounce` gives a gentle idle hop (respecting
 * the idea that it's decoration: it's hidden from screen readers unless labelled).
 */
export function Mascot({ size = 72, mood = 'happy', bounce = false, label }: { size?: number; mood?: Mood; bounce?: boolean; label?: string }) {
  const { isDark } = useApp();
  const y = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (!bounce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -5, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce, y]);

  const ink = '#231C17';
  const rice = isDark ? '#F7F3EC' : '#FFFFFF';
  return (
    <Animated.View
      style={{ transform: [{ translateY: y }] }}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d="M50 8C60 8 90 58 90 72c0 12-12 20-40 20S10 84 10 72C10 58 40 8 50 8z" fill={rice} stroke={ink} strokeWidth={4} strokeLinejoin="round" />
        <Path d="M28 70h44v19c-6 2-14 3-22 3s-16-1-22-3z" fill="#2C3A2E" stroke={ink} strokeWidth={4} strokeLinejoin="round" />
        {mood === 'cheer' ? (
          <>
            <Path d="M33 52q5-6 10 0M57 52q5-6 10 0" fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />
            <Path d="M42 59q8 9 16 0z" fill="#E86A4B" stroke={ink} strokeWidth={3} strokeLinejoin="round" />
          </>
        ) : mood === 'sleep' ? (
          <>
            <Path d="M33 53h10M57 53h10" stroke={ink} strokeWidth={4} strokeLinecap="round" />
            <Path d="M46 61h8" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />
          </>
        ) : (
          <>
            <Circle cx={38} cy={52} r={4.5} fill={ink} />
            <Circle cx={62} cy={52} r={4.5} fill={ink} />
            {mood === 'sad' ? (
              <Path d="M44 63q6-5 12 0" fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />
            ) : mood === 'think' ? (
              <Path d="M45 61h10" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />
            ) : (
              <Path d="M44 60q6 6 12 0" fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />
            )}
          </>
        )}
        <Ellipse cx={29} cy={60} rx={5} ry={3} fill="#F6A38C" />
        <Ellipse cx={71} cy={60} rx={5} ry={3} fill="#F6A38C" />
      </Svg>
    </Animated.View>
  );
}
