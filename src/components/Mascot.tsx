import { useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, View, type ViewProps } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

export type Mood = 'happy' | 'cheer' | 'think' | 'sad' | 'sleep';

/** Kaeru's colours. */
export const FROG = {
  skinLight: '#82D178',
  skin: '#5DB85B',
  skinShade: '#43A04A',
  feet: '#46A24C',
  belly: '#FFFDF5',
  bellyShade: '#EEE9D6',
  pupil: '#1E2B22',
  mouth: '#2A6E33',
  blush: '#FFA3AE',
  tongue: '#FF95A2',
} as const;

/** One smooth outline: the head with its two eye bumps, flowing into a round body. */
const BODY = 'M22.4 46.9A19 19 0 1 1 55.2 28Q60 31 64.8 28A19 19 0 1 1 97.6 46.9C105 56 110 68 110 82C110 100 88 108 60 108S10 100 10 82C10 68 15 56 22.4 46.9Z';
const BELLY = 'M27 87C27 73 42 67 60 67S93 73 93 87C93 99 79 105 60 105S27 99 27 87Z';
/** The head alone, for the one-colour mark. */
const HEAD = 'M22.4 46.9A19 19 0 1 1 55.2 28Q60 31 64.8 28A19 19 0 1 1 97.6 46.9C105 56 108 63 108 70C108 84 88 90 60 90S12 84 12 70C12 63 15 56 22.4 46.9Z';

/**
 * Decoration is hidden from screen readers; with a label it reads as one image. Uses the aria props
 * (react-native-web passes the older accessibility* props straight to the DOM).
 */
function a11y(label?: string): ViewProps {
  if (!label) return { 'aria-hidden': true };
  return { role: 'img', 'aria-label': label, ...(Platform.OS === 'web' ? null : { accessible: true }) };
}

/** SVG ids must be unique per drawing (on the web they share one document). */
function useSvgId(): string {
  return `k${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Open eyes, with the pupils nudged by (dx, dy); the left pupil mirrors dx. */
function Eyes({ dx, dy }: { dx: number; dy: number }) {
  return (
    <>
      <Circle cx={38} cy={37} r={12.5} fill="#FFFFFF" />
      <Circle cx={82} cy={37} r={12.5} fill="#FFFFFF" />
      {[38 + dx, 82 - dx].map((x) => (
        <Circle key={x} cx={x} cy={37 + dy} r={7} fill={FROG.pupil} />
      ))}
      {[38 + dx, 82 - dx].map((x) => (
        <Circle key={`s${x}`} cx={x + 2.5} cy={37 + dy - 2.8} r={2.5} fill="#FFFFFF" />
      ))}
    </>
  );
}

const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Face({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'happy':
      return (
        <>
          <Eyes dx={2} dy={1.5} />
          <Path d="M45 54.5Q60 63 75 54.5" stroke={FROG.mouth} strokeWidth={2.8} {...line} />
        </>
      );
    case 'cheer':
      return (
        <>
          <Path d="M29.5 39.5q8.5-10 17 0M73.5 39.5q8.5-10 17 0" stroke={FROG.pupil} strokeWidth={3.2} {...line} />
          <Path d="M46 52Q60 72 74 52Z" fill={FROG.mouth} stroke={FROG.mouth} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M53 62q7-4.5 14 0q-7 4-14 0z" fill={FROG.tongue} />
        </>
      );
    case 'think':
      return (
        <>
          <Eyes dx={4} dy={-3} />
          <Path d="M53 57h14" stroke={FROG.mouth} strokeWidth={2.8} {...line} />
        </>
      );
    case 'sad':
      return (
        <>
          <Eyes dx={0} dy={4} />
          <Path d="M51 59Q60 53 69 59" stroke={FROG.mouth} strokeWidth={2.8} {...line} />
        </>
      );
    case 'sleep':
      return (
        <>
          <Path d="M29.5 37q8.5 7 17 0M73.5 37q8.5 7 17 0" stroke={FROG.pupil} strokeWidth={3.2} {...line} />
          <Path d="M55 57q5 2.5 10 0" stroke={FROG.mouth} strokeWidth={2.8} {...line} />
        </>
      );
  }
}

/** The frog itself, in a 120×120 box. `shadow` adds the soft ground shadow. */
export function FrogArt({ mood = 'happy', shadow = true }: { mood?: Mood; shadow?: boolean }) {
  const id = useSvgId();
  return (
    <>
      <Defs>
        <RadialGradient id={`${id}s`} cx="38%" cy="28%" r="80%">
          <Stop offset="0" stopColor={FROG.skinLight} />
          <Stop offset="0.55" stopColor={FROG.skin} />
          <Stop offset="1" stopColor={FROG.skinShade} />
        </RadialGradient>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={FROG.belly} />
          <Stop offset="1" stopColor={FROG.bellyShade} />
        </LinearGradient>
      </Defs>
      {shadow && <Ellipse cx={60} cy={113} rx={38} ry={3.5} fill="#1B1F33" opacity={0.08} />}
      <Ellipse cx={34} cy={107} rx={15} ry={6.5} fill={FROG.feet} />
      <Ellipse cx={86} cy={107} rx={15} ry={6.5} fill={FROG.feet} />
      <Path d={BODY} fill={`url(#${id}s)`} />
      <Path d={BELLY} fill={`url(#${id}b)`} />
      <Ellipse cx={27} cy={55} rx={6} ry={3.2} fill={FROG.blush} opacity={0.7} />
      <Ellipse cx={93} cy={55} rx={6} ry={3.2} fill={FROG.blush} opacity={0.7} />
      <Face mood={mood} />
    </>
  );
}

/**
 * Kaeru the frog (かえる), the app's mascot. `bounce` gives a gentle idle hop. It's decoration,
 * so it's hidden from screen readers unless labelled.
 */
export function Mascot({ size = 72, mood = 'happy', bounce = false, label }: { size?: number; mood?: Mood; bounce?: boolean; label?: string }) {
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

  return (
    <Animated.View style={{ transform: [{ translateY: y }] }} {...a11y(label)}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <FrogArt mood={mood} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The frog's head as a one-colour mark (Today tab icon, Settings footer). `cutout` is the colour
 * of the eyes and smile, normally whatever sits behind the mark. Without `color` it's the full frog face.
 */
export function Logo({ size = 40, color, cutout, label }: { size?: number; color?: string; cutout?: string; label?: string }) {
  if (!color) {
    return (
      <View {...a11y(label)}>
        <Svg width={size} height={size} viewBox="6 12 108 108">
          <FrogArt shadow={false} />
        </Svg>
      </View>
    );
  }
  const hole = cutout ?? '#FFFFFF';
  return (
    <View {...a11y(label)}>
      <Svg width={size} height={size} viewBox="8 13 104 80">
        <Path d={HEAD} fill={color} />
        <Circle cx={38} cy={37} r={12.5} fill={hole} />
        <Circle cx={82} cy={37} r={12.5} fill={hole} />
        <Circle cx={40} cy={38.5} r={7} fill={color} />
        <Circle cx={80} cy={38.5} r={7} fill={color} />
        <Path d="M45 56Q60 65 75 56" stroke={hole} strokeWidth={5} {...line} />
      </Svg>
    </View>
  );
}
