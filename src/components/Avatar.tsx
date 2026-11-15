import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { AVATAR_COLORS, AVATAR_NAMES, type AvatarColor, type AvatarId } from '../profile/avatars';
import { useApp } from '../state/AppProvider';
import { FROG } from './Mascot';

const INK = '#2A1D16';
const BLUSH = '#FF9EAA';
/** Flips a drawing left to right across the middle of the 100×100 box. */
const MIRROR = 'matrix(-1 0 0 1 100 0)';

/**
 * A soft, lit-from-the-top-left fill: each character's fur or skin. Gradient ids are prefixed per
 * drawing, since on the web every SVG shares one document.
 */
function Shade({ id, light, base, dark }: { id: string; light: string; base: string; dark: string }) {
  return (
    <RadialGradient id={id} cx="38%" cy="26%" r="80%">
      <Stop offset="0" stopColor={light} />
      <Stop offset="0.55" stopColor={base} />
      <Stop offset="1" stopColor={dark} />
    </RadialGradient>
  );
}

/** A glossy eye: a dark oval with a big and a small catchlight. */
function Eye({ x, y, r = 4.2, color = INK }: { x: number; y: number; r?: number; color?: string }) {
  return (
    <G>
      <Ellipse cx={x} cy={y} rx={r} ry={r * 1.12} fill={color} />
      <Circle cx={x + r * 0.32} cy={y - r * 0.38} r={r * 0.42} fill="#FFFFFF" />
      <Circle cx={x - r * 0.35} cy={y + r * 0.42} r={r * 0.17} fill="#FFFFFF" opacity={0.85} />
    </G>
  );
}

function Blush({ y, dx = 21, rx = 5, opacity = 0.55 }: { y: number; dx?: number; rx?: number; opacity?: number }) {
  return (
    <G opacity={opacity}>
      <Ellipse cx={50 - dx} cy={y} rx={rx} ry={rx * 0.58} fill={BLUSH} />
      <Ellipse cx={50 + dx} cy={y} rx={rx} ry={rx * 0.58} fill={BLUSH} />
    </G>
  );
}

const stroke = (color: string, width = 2) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

/** A small cat-like "ω" mouth under a nose at (50, y). */
function CatMouth({ y, color = INK }: { y: number; color?: string }) {
  return <Path d={`M44.5 ${y}q2.75 3 5.5 0q2.75 3 5.5 0`} {...stroke(color, 1.8)} />;
}

/** Each character's face, drawn on a 100×100 grid and centred in its circle. */
function Character({ id, p }: { id: AvatarId; p: string }) {
  const fill = (name: string) => `url(#${p}${name})`;
  switch (id) {
    case 'frog':
      return (
        <G>
          <Defs>
            <Shade id={`${p}skin`} light={FROG.skinLight} base={FROG.skin} dark={FROG.skinShade} />
          </Defs>
          {/* Head with its two eye bumps (the mascot's outline). */}
          <G transform="translate(0 2)">
            <Path d="M18 41.5A15.5 15.5 0 1 1 44.5 26Q50 29 55.5 26A15.5 15.5 0 1 1 82 41.5C87.5 48 90 54 90 59C90 71 72 78 50 78S10 71 10 59C10 54 12.5 48 18 41.5Z" fill={fill('skin')} />
            <Circle cx={31} cy={33} r={10.5} fill="#FFFFFF" />
            <Circle cx={69} cy={33} r={10.5} fill="#FFFFFF" />
            <Eye x={32.5} y={34} r={5.6} color={FROG.pupil} />
            <Eye x={70.5} y={34} r={5.6} color={FROG.pupil} />
            <Circle cx={45} cy={50} r={1.2} fill={FROG.mouth} opacity={0.6} />
            <Circle cx={55} cy={50} r={1.2} fill={FROG.mouth} opacity={0.6} />
            <Blush y={60} dx={27} rx={5.5} opacity={0.85} />
            <Path d="M30 58Q50 70 70 58" {...stroke(FROG.mouth, 2.6)} />
          </G>
        </G>
      );
    case 'cat':
      return (
        <G>
          <Defs>
            <Shade id={`${p}fur`} light="#FFC57A" base="#F4A04B" dark="#DE8434" />
          </Defs>
          <G transform="translate(0 4)">
            {[0, 1].map((side) => (
              <G key={side} transform={side ? MIRROR : undefined}>
                <Path d="M19 44C16 32 16 20 19 13C20.5 10 23 10 25.5 12L42 25Z" fill="#E7913F" />
                <Path d="M22.5 34C21 27 21.5 21 23 17L35 26Z" fill={BLUSH} opacity={0.8} />
              </G>
            ))}
            <Ellipse cx={50} cy={50} rx={32} ry={28} fill={fill('fur')} />
            <Path d="M44 23.5l1.5 8M50 22.5v9M56 23.5l-1.5 8M19 46l6 1.5M18.5 52l6 0M81 46l-6 1.5M81.5 52l-6 0" {...stroke('#D9772C', 2.6)} />
            <Ellipse cx={50} cy={61} rx={13} ry={9.5} fill="#FFF6EA" />
            <Ellipse cx={36} cy={47} rx={4.2} ry={5.4} fill={INK} />
            <Circle cx={37.4} cy={45} r={1.8} fill="#FFFFFF" />
            <Ellipse cx={64} cy={47} rx={4.2} ry={5.4} fill={INK} />
            <Circle cx={65.4} cy={45} r={1.8} fill="#FFFFFF" />
            <Blush y={60} dx={23} />
            <Path d="M47.2 56h5.6l-2.8 3z" fill="#E26C6C" />
            <CatMouth y={59} />
            <Path d="M28 58l-11-2M28 62l-11 1M72 58l11-2M72 62l11 1" {...stroke('#C77434', 1.3)} />
          </G>
        </G>
      );
    case 'fox':
      return (
        <G>
          <Defs>
            <Shade id={`${p}fur`} light="#FF9C5C" base="#EC7436" dark="#D55E25" />
          </Defs>
          <G transform="translate(0 2)">
            {[0, 1].map((side) => (
              <G key={side} transform={side ? MIRROR : undefined}>
                <Path d="M17 42C14 30 14 18 17 9C18.5 6 21 6 23.5 8L42 25Z" fill="#E36D30" />
                <Path d="M17.5 22C17 16 17.5 12 18.5 9.5C19.5 7.5 21.5 7.5 23 9L28 13.5Z" fill="#3A241A" />
                <Path d="M21 35C20 29 20.5 24 21.5 20L33 27Z" fill="#FFE3D2" opacity={0.85} />
              </G>
            ))}
            <Path d="M50 80C38 80 20 70 15 53C13 43 20 32 31 27C37 24.5 43 24 50 24S63 24.5 69 27C80 32 87 43 85 53C80 70 62 80 50 80Z" fill={fill('fur')} />
            <Path d="M50 80C40 80 25 72 17 57C26 57 35 60 41 65C45 68.5 47.5 70 50 70S55 68.5 59 65C65 60 74 57 83 57C75 72 60 80 50 80Z" fill="#FFF8F0" />
            <Path d="M29 49q6-5 12 0M59 49q6-5 12 0" {...stroke(INK, 3)} />
            <Ellipse cx={50} cy={67} rx={4.6} ry={3.2} fill={INK} />
            <Circle cx={51.3} cy={66} r={1.2} fill="#FFFFFF" opacity={0.7} />
            <Path d="M50 70v2.5M46.5 73.5q3.5 2.5 3.5-1q0 3.5 3.5 1" {...stroke(INK, 1.6)} />
          </G>
        </G>
      );
    case 'panda':
      return (
        <G>
          <Defs>
            <Shade id={`${p}fur`} light="#FFFFFF" base="#F7F7F5" dark="#DCDCE2" />
          </Defs>
          <G transform="translate(0 2)">
            <Circle cx={23} cy={25} r={11} fill="#2B2E3B" />
            <Circle cx={77} cy={25} r={11} fill="#2B2E3B" />
            <Circle cx={23} cy={25} r={5} fill="#4A4E5E" />
            <Circle cx={77} cy={25} r={5} fill="#4A4E5E" />
            <Ellipse cx={50} cy={52} rx={32} ry={28.5} fill={fill('fur')} />
            <Ellipse cx={36} cy={50} rx={8.5} ry={11} transform="rotate(35 36 50)" fill="#2B2E3B" />
            <Ellipse cx={64} cy={50} rx={8.5} ry={11} transform="rotate(-35 64 50)" fill="#2B2E3B" />
            <Eye x={37} y={48.5} r={3.6} color="#0E0F15" />
            <Circle cx={37} cy={48.5} r={4.4} fill="none" stroke="#FFFFFF" strokeWidth={1} opacity={0.35} />
            <Eye x={63} y={48.5} r={3.6} color="#0E0F15" />
            <Circle cx={63} cy={48.5} r={4.4} fill="none" stroke="#FFFFFF" strokeWidth={1} opacity={0.35} />
            <Blush y={64} dx={23} rx={4.5} />
            <Ellipse cx={50} cy={61} rx={4.6} ry={3.2} fill="#2B2E3B" />
            <CatMouth y={64.5} color="#2B2E3B" />
          </G>
        </G>
      );
    case 'owl':
      return (
        <G>
          <Defs>
            <Shade id={`${p}fur`} light="#B98B62" base="#966A45" dark="#7A5234" />
          </Defs>
          {[0, 1].map((side) => (
            <Path key={side} transform={side ? MIRROR : undefined} d="M17 42C14 30 15 18 19 10C24 15 31 22 36 26Z" fill="#7A5234" />
          ))}
          <Path d="M50 20C73 20 87 34 87 54C87 75 70 86 50 86S13 75 13 54C13 34 27 20 50 20Z" fill={fill('fur')} />
          <Path d="M50 30C46 34 44 38 44 42L50 46L56 42C56 38 54 34 50 30Z" fill="#7A5234" opacity={0.5} />
          <Circle cx={35} cy={52} r={15.5} fill="#F3E3CB" />
          <Circle cx={65} cy={52} r={15.5} fill="#F3E3CB" />
          <Circle cx={35} cy={52} r={10} fill="#F2B23E" />
          <Circle cx={65} cy={52} r={10} fill="#F2B23E" />
          <Eye x={35} y={52} r={5.8} />
          <Eye x={65} y={52} r={5.8} />
          <Path d="M50 61l4.5 4.5-4.5 6.5-4.5-6.5z" fill="#E8932E" />
          <Path d="M36 78q3 2.5 6 0q3 2.5 6 0q3 2.5 6 0q3 2.5 6 0" {...stroke('#C8A47C', 1.5)} opacity={0.8} />
        </G>
      );
    case 'rabbit':
      return (
        <G>
          <Defs>
            <Shade id={`${p}fur`} light="#FFFFFF" base="#F3ECE6" dark="#DCCFC4" />
          </Defs>
          <G transform="translate(0 3)">
            {[0, 1].map((side) => (
              <G key={side} transform={side ? MIRROR : undefined}>
                <Path d="M33 40C27 30 26 16 29 8C31 3 37 3 39.5 8C43 16 43 30 41 40Z" fill={fill('fur')} />
                <Path d="M34.5 34C31 26 30.5 17 32 11C33 8 36 8 37.5 11C39.5 17 39.5 26 38.5 34Z" fill="#FFB8C2" />
              </G>
            ))}
            <Ellipse cx={50} cy={57} rx={30} ry={25} fill={fill('fur')} />
            <Eye x={38} y={54} r={4.2} />
            <Eye x={62} y={54} r={4.2} />
            <Blush y={64} dx={22} />
            <Path d="M47 61h6l-3 3z" fill="#F08A9C" />
            <Path d="M50 64v2" {...stroke(INK, 1.6)} />
            <CatMouth y={66} />
            <Path d="M30 63l-9-1.5M30 66.5l-9 1M70 63l9-1.5M70 66.5l9 1" {...stroke('#B9A898', 1.2)} />
          </G>
        </G>
      );
    case 'tanuki':
      return (
        <G>
          <Defs>
            <Shade id={`${p}fur`} light="#C49A70" base="#A57A52" dark="#87613F" />
          </Defs>
          <G transform="translate(0 0)">
            <Circle cx={23} cy={27} r={10} fill="#5B3F2A" />
            <Circle cx={77} cy={27} r={10} fill="#5B3F2A" />
            <Circle cx={23} cy={27} r={5} fill="#3A2818" />
            <Circle cx={77} cy={27} r={5} fill="#3A2818" />
            <Ellipse cx={50} cy={52} rx={33} ry={28.5} fill={fill('fur')} />
            <Path d="M37 28q13-7 26 0q-4 6-13 6t-13-6z" fill="#F3E2CA" opacity={0.85} />
            <Path d="M17 50C20 40 29 38 36 42C42 45 45 47 50 47S58 45 64 42C71 38 80 40 83 50C79 58 70 60 62 56C57 54 54 53 50 53S43 54 38 56C30 60 21 58 17 50Z" fill="#3A2818" />
            <Eye x={35} y={49} r={3.8} color="#120B06" />
            <Circle cx={36.4} cy={47.6} r={1.6} fill="#FFFFFF" />
            <Eye x={65} y={49} r={3.8} color="#120B06" />
            <Circle cx={66.4} cy={47.6} r={1.6} fill="#FFFFFF" />
            <Ellipse cx={50} cy={65} rx={14} ry={10} fill="#F3E2CA" />
            <Ellipse cx={50} cy={60.5} rx={4.4} ry={3} fill={INK} />
            <CatMouth y={64} />
            <Blush y={64} dx={25} rx={4.5} />
          </G>
        </G>
      );
    case 'riceball':
      return (
        <G>
          <Defs>
            <Shade id={`${p}rice`} light="#FFFFFF" base="#FBFAF6" dark="#E1DED4" />
          </Defs>
          <Ellipse cx={50} cy={89} rx={30} ry={3.5} fill="#1B1F33" opacity={0.08} />
          <Path d="M50 13C58 13 64 20 72 34C80 48 88 60 88 72C88 84 76 89 50 89S12 84 12 72C12 60 20 48 28 34C36 20 42 13 50 13Z" fill={fill('rice')} />
          <Path d="M33 64H67V88.4C62 88.8 56.5 89 50 89S38 88.8 33 88.4Z" fill="#253A2F" />
          <Path d="M36 68H64" {...stroke('#3C5A4A', 1.4)} opacity={0.7} />
          <Ellipse cx={42} cy={22} rx={2} ry={1.2} transform="rotate(-30 42 22)" fill="#E6E2D6" />
          <Ellipse cx={61} cy={30} rx={2} ry={1.2} transform="rotate(25 61 30)" fill="#E6E2D6" />
          <Ellipse cx={30} cy={56} rx={2} ry={1.2} transform="rotate(10 30 56)" fill="#E6E2D6" />
          <Ellipse cx={72} cy={62} rx={2} ry={1.2} transform="rotate(-15 72 62)" fill="#E6E2D6" />
          <Eye x={40} y={48} r={3.8} />
          <Eye x={60} y={48} r={3.8} />
          <Blush y={56} dx={19} rx={4.5} />
          <Path d="M46 54q4 4 8 0" {...stroke(INK, 2)} />
        </G>
      );
  }
}

/** A profile icon: a drawn character on a coloured circle. Defaults to the learner's own. */
export function Avatar({ size = 40, avatar, color, label }: { size?: number; avatar?: AvatarId; color?: AvatarColor; label?: string }) {
  const { colors, settings } = useApp();
  const p = `av${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const id = avatar ?? settings.avatar;
  const bg = colors[AVATAR_COLORS[color ?? settings.avatarColor]];
  return (
    <View accessible={!!label} accessibilityLabel={label ?? AVATAR_NAMES[id]} aria-hidden={!label}>
      <AvatarSvg size={size} id={id} bg={bg} prefix={p} />
    </View>
  );
}

/** The drawing alone, clipped to its circle (split out so it can be rendered without app state). */
export function AvatarSvg({ size, id, bg, prefix }: { size: number; id: AvatarId; bg: string; prefix: string }): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={`${prefix}clip`}>
          <Circle cx={50} cy={50} r={50} />
        </ClipPath>
        <RadialGradient id={`${prefix}glow`} cx="50%" cy="22%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <G clipPath={`url(#${prefix}clip)`}>
        <Circle cx={50} cy={50} r={50} fill={bg} />
        <Circle cx={50} cy={50} r={50} fill={`url(#${prefix}glow)`} />
        <Character id={id} p={prefix} />
      </G>
    </Svg>
  );
}
