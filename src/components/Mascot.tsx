import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View, type ViewProps } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

export type Mood = 'happy' | 'cheer' | 'think' | 'sad' | 'sleep';

const INK = '#231C17';
export const FROG = { skin: '#6CC04A', shade: '#4FA23A', belly: '#E4F5C8', blush: '#F6A38C' } as const;

/**
 * Decoration is hidden from screen readers; with a label it reads as one image. Uses the aria props
 * (react-native-web passes the older accessibility* props straight to the DOM).
 */
function a11y(label?: string): ViewProps {
  if (!label) return { 'aria-hidden': true };
  return { role: 'img', 'aria-label': label, ...(Platform.OS === 'web' ? null : { accessible: true }) };
}

/** Eye domes, round body and two little feet: drawn twice (fat ink stroke, then fill) so the outline is one shape. */
function Silhouette() {
  return (
    <>
      <Circle cx={31} cy={34} r={15} />
      <Circle cx={69} cy={34} r={15} />
      <Path d="M50 36C78 36 93 52 93 68C93 84 76 91 50 91S7 84 7 68C7 52 22 36 50 36z" />
      <Ellipse cx={27} cy={90} rx={11} ry={5.5} />
      <Ellipse cx={73} cy={90} rx={11} ry={5.5} />
    </>
  );
}

function Eyes({ mood }: { mood: Mood }) {
  if (mood === 'cheer' || mood === 'sleep') {
    const d = mood === 'cheer' ? 'M24 36q7-8 14 0M62 36q7-8 14 0' : 'M24 36q7 5 14 0M62 36q7 5 14 0';
    return <Path d={d} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />;
  }
  // Thinking: glancing up and to the side.
  const dx = mood === 'think' ? 2 : 0;
  const dy = mood === 'think' ? -3 : 0;
  return (
    <>
      <Circle cx={31} cy={34} r={9.5} fill="#FFFFFF" />
      <Circle cx={69} cy={34} r={9.5} fill="#FFFFFF" />
      <Circle cx={32 + dx} cy={35 + dy} r={5} fill={INK} />
      <Circle cx={70 + dx} cy={35 + dy} r={5} fill={INK} />
      <Circle cx={34 + dx} cy={33 + dy} r={1.8} fill="#FFFFFF" />
      <Circle cx={72 + dx} cy={33 + dy} r={1.8} fill="#FFFFFF" />
      {mood === 'sad' && <Path d="M23 24l12-5M77 24l-12-5" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />}
    </>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'cheer':
      return <Path d="M36 58q14 17 28 0z" fill="#E86A4B" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />;
    case 'sad':
      return <Path d="M40 66q10-8 20 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
    case 'think':
      return <Path d="M44 63h12" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
    case 'sleep':
      return <Ellipse cx={50} cy={63} rx={3.5} ry={3} fill={INK} />;
    default:
      return <Path d="M34 59q16 12 32 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
  }
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
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <G fill={INK} stroke={INK} strokeWidth={8} strokeLinejoin="round">
          <Silhouette />
        </G>
        <G fill={FROG.skin}>
          <Silhouette />
        </G>
        <Ellipse cx={50} cy={76} rx={25} ry={12} fill={FROG.belly} />
        <Path d="M19 84q3-5 8-5M81 84q-3-5-8-5" fill="none" stroke={FROG.shade} strokeWidth={3} strokeLinecap="round" />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
        <Ellipse cx={23} cy={58} rx={5.5} ry={3.2} fill={FROG.blush} />
        <Ellipse cx={77} cy={58} rx={5.5} ry={3.2} fill={FROG.blush} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The simplified frog face used as the logo (and app icon). Pass `color` for a one-colour
 * version (e.g. a tab icon), with `cutout` as the colour of the eye whites.
 */
export function Logo({ size = 40, color, cutout = '#FFFFFF', label }: { size?: number; color?: string; cutout?: string; label?: string }) {
  const skin = color ?? FROG.skin;
  const ink = color ?? INK;
  return (
    <View {...a11y(label)}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <G fill={skin}>
          <Circle cx={30} cy={38} r={17} />
          <Circle cx={70} cy={38} r={17} />
          <Path d="M50 40C80 40 94 55 94 68C94 81 76 86 50 86S6 81 6 68C6 55 20 40 50 40z" />
        </G>
        <Circle cx={30} cy={38} r={10} fill={cutout} />
        <Circle cx={70} cy={38} r={10} fill={cutout} />
        <Circle cx={31} cy={39} r={5.5} fill={ink} />
        <Circle cx={71} cy={39} r={5.5} fill={ink} />
        <Path d="M34 64q16 11 32 0" fill="none" stroke={color ? cutout : INK} strokeWidth={4.5} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
