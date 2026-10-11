import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useApp } from '../state/AppProvider';

export type Mood = 'happy' | 'cheer' | 'think' | 'sad' | 'sleep';

/**
 * Kaeru, the frog mascot (drawn to match the app icon). `bounce` gives a gentle
 * idle hop (respecting the idea that it's decoration: it's hidden from screen
 * readers unless labelled).
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

  // The icon's two colours: forest-green skin and a cream belly, eyes and cheeks.
  const skin = isDark ? '#4F7D68' : '#436B59';
  const cream = '#F7E9C4';
  const pupil = '#2F4A3E';
  const closed = mood === 'cheer' || mood === 'sleep';
  return (
    <Animated.View
      style={{ transform: [{ translateY: y }] }}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={29} cy={28} r={17} fill={skin} />
        <Circle cx={71} cy={28} r={17} fill={skin} />
        <Path d="M50 24C78 24 94 44 94 66c0 19-18 29-44 29S6 85 6 66C6 44 22 24 50 24z" fill={skin} />
        <Ellipse cx={50} cy={79} rx={27} ry={15} fill={cream} />
        {closed ? (
          mood === 'cheer' ? (
            // Happy closed eyes: upward arcs.
            <Path d="M21 31q8-10 16 0M63 31q8-10 16 0" fill="none" stroke={cream} strokeWidth={5} strokeLinecap="round" />
          ) : (
            <Path d="M21 28q8 8 16 0M63 28q8 8 16 0" fill="none" stroke={cream} strokeWidth={5} strokeLinecap="round" />
          )
        ) : (
          <>
            <Circle cx={29} cy={28} r={11} fill={cream} />
            <Circle cx={71} cy={28} r={11} fill={cream} />
            {mood === 'think' ? (
              <>
                <Circle cx={32} cy={24} r={5.5} fill={pupil} />
                <Circle cx={74} cy={24} r={5.5} fill={pupil} />
              </>
            ) : mood === 'sad' ? (
              <>
                <Circle cx={29} cy={32} r={5.5} fill={pupil} />
                <Circle cx={71} cy={32} r={5.5} fill={pupil} />
              </>
            ) : (
              <>
                <Circle cx={31} cy={29} r={6} fill={pupil} />
                <Circle cx={69} cy={29} r={6} fill={pupil} />
              </>
            )}
          </>
        )}
        {mood === 'cheer' ? (
          <Path d="M41 49q9 12 18 0z" fill={pupil} stroke={cream} strokeWidth={3} strokeLinejoin="round" />
        ) : mood === 'sad' ? (
          <Path d="M43 55q7-6 14 0" fill="none" stroke={cream} strokeWidth={3.5} strokeLinecap="round" />
        ) : mood === 'think' || mood === 'sleep' ? (
          <Path d="M45 52h10" stroke={cream} strokeWidth={3.5} strokeLinecap="round" />
        ) : (
          <Path d="M43 50q7 7 14 0" fill="none" stroke={cream} strokeWidth={3.5} strokeLinecap="round" />
        )}
        <Ellipse cx={22} cy={52} rx={6.5} ry={4} fill={cream} />
        <Ellipse cx={78} cy={52} rx={6.5} ry={4} fill={cream} />
      </Svg>
    </Animated.View>
  );
}
