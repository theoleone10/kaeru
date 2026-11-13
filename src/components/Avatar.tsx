import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { AVATAR_COLORS, AVATAR_NAMES, type AvatarColor, type AvatarId } from '../profile/avatars';
import { useApp } from '../state/AppProvider';
import { FrogArt } from './Mascot';

const INK = '#2A1A10';
const BLUSH = '#F7B9B0';

/** Each character drawn on a 72×72 grid, centred on its coloured circle. */
function Character({ id }: { id: AvatarId }) {
  switch (id) {
    case 'frog':
      return (
        <Svg x={5} y={9} width={62} height={62} viewBox="6 12 108 108">
          <FrogArt shadow={false} />
        </Svg>
      );
    case 'cat':
      return (
        <G>
          <Path d="M15 18l11 9-11 9zM57 18l-11 9 11 9z" fill="#E8973A" />
          <Path d="M17 22l6 6-6 5zM55 22l-6 6 6 5z" fill={BLUSH} />
          <Ellipse cx={36} cy={42} rx={21} ry={19} fill="#F2A54A" />
          <Path d="M30 25q6 4 12 0" fill="none" stroke="#D9822E" strokeWidth={2.5} strokeLinecap="round" />
          <Ellipse cx={36} cy={50} rx={9} ry={6.5} fill="#FFF4E2" />
          <Circle cx={28} cy={41} r={2.8} fill="#3A2510" />
          <Circle cx={44} cy={41} r={2.8} fill="#3A2510" />
          <Path d="M34 47h4l-2 2z" fill="#D9663D" />
          <Path d="M32 51q4 3 8 0" fill="none" stroke="#3A2510" strokeWidth={1.8} strokeLinecap="round" />
        </G>
      );
    case 'fox':
      return (
        <G>
          <Path d="M14 16l14 12-12 8zM58 16L44 28l12 8z" fill="#D9663D" />
          <Path d="M17 21l7 7-6 4zM55 21l-7 7 6 4z" fill={INK} opacity={0.35} />
          <Path d="M12 32c4-8 14-10 24-10s20 2 24 10c-4 14-14 24-24 24S16 46 12 32z" fill="#E5763F" />
          <Path d="M20 38c6 2 10 6 16 16 6-10 10-14 16-16-4 10-10 18-16 18s-12-8-16-18z" fill="#FFFFFF" />
          <Circle cx={27} cy={36} r={2.8} fill={INK} />
          <Circle cx={45} cy={36} r={2.8} fill={INK} />
          <Circle cx={36} cy={49} r={2.6} fill={INK} />
        </G>
      );
    case 'panda':
      return (
        <G>
          <Circle cx={18} cy={22} r={8} fill="#2A2D3A" />
          <Circle cx={54} cy={22} r={8} fill="#2A2D3A" />
          <Circle cx={36} cy={40} r={22} fill="#FFFFFF" />
          <Ellipse cx={27} cy={38} rx={5.5} ry={7} transform="rotate(-25 27 38)" fill="#2A2D3A" />
          <Ellipse cx={45} cy={38} rx={5.5} ry={7} transform="rotate(25 45 38)" fill="#2A2D3A" />
          <Circle cx={28} cy={38} r={2} fill="#FFFFFF" />
          <Circle cx={44} cy={38} r={2} fill="#FFFFFF" />
          <Ellipse cx={36} cy={48} rx={3.5} ry={2.5} fill="#2A2D3A" />
          <Path d="M33 52q3 2 6 0" fill="none" stroke="#2A2D3A" strokeWidth={1.8} strokeLinecap="round" />
        </G>
      );
    case 'owl':
      return (
        <G>
          <Path d="M16 18l10 8M56 18l-10 8" stroke="#7A5638" strokeWidth={5} strokeLinecap="round" />
          <Path d="M14 40c0-14 10-20 22-20s22 6 22 20-10 20-22 20-22-6-22-20z" fill="#9A6E48" />
          <Path d="M24 52q12 8 24 0" fill="none" stroke="#C49A72" strokeWidth={2.5} strokeLinecap="round" />
          <Circle cx={27} cy={38} r={8} fill="#FFFFFF" />
          <Circle cx={45} cy={38} r={8} fill="#FFFFFF" />
          <Circle cx={27} cy={38} r={3.6} fill={INK} />
          <Circle cx={45} cy={38} r={3.6} fill={INK} />
          <Path d="M33 45l3 5 3-5z" fill="#F2B33D" />
        </G>
      );
    case 'rabbit':
      return (
        <G>
          <Ellipse cx={27} cy={18} rx={6} ry={15} fill="#FFFFFF" stroke="#E2DAEE" strokeWidth={1.5} />
          <Ellipse cx={45} cy={18} rx={6} ry={15} fill="#FFFFFF" stroke="#E2DAEE" strokeWidth={1.5} />
          <Ellipse cx={27} cy={19} rx={2.8} ry={10} fill={BLUSH} />
          <Ellipse cx={45} cy={19} rx={2.8} ry={10} fill={BLUSH} />
          <Circle cx={36} cy={44} r={20} fill="#FFFFFF" stroke="#E2DAEE" strokeWidth={1.5} />
          <Circle cx={29} cy={42} r={2.8} fill="#2A2D3A" />
          <Circle cx={43} cy={42} r={2.8} fill="#2A2D3A" />
          <Path d="M34 48h4l-2 2z" fill="#E58A9A" />
          <Path d="M36 50v2.5M33 53q3 2 3-0.5q0 2.5 3 0.5" fill="none" stroke="#2A2D3A" strokeWidth={1.5} strokeLinecap="round" />
          <Ellipse cx={24} cy={49} rx={3.5} ry={2.2} fill={BLUSH} />
          <Ellipse cx={48} cy={49} rx={3.5} ry={2.2} fill={BLUSH} />
        </G>
      );
    case 'tanuki':
      return (
        <G>
          <Circle cx={18} cy={22} r={7} fill="#6E4E33" />
          <Circle cx={54} cy={22} r={7} fill="#6E4E33" />
          <Circle cx={18} cy={22} r={3.5} fill="#3A2818" />
          <Circle cx={54} cy={22} r={3.5} fill="#3A2818" />
          <Ellipse cx={36} cy={40} rx={23} ry={20} fill="#9C7552" />
          <Path d="M14 40q8-8 16-2q6 4 12 0q8-6 16 2q-6 8-16 4q-6-3-12 0q-10 4-16-4z" fill="#3A2818" />
          <Circle cx={27} cy={40} r={2.6} fill="#FFFFFF" />
          <Circle cx={45} cy={40} r={2.6} fill="#FFFFFF" />
          <Ellipse cx={36} cy={51} rx={9} ry={6} fill="#F0DEC6" />
          <Ellipse cx={36} cy={48.5} rx={3} ry={2} fill={INK} />
        </G>
      );
    case 'riceball':
      return (
        <G>
          <Path d="M36 13c6 0 22 24 22 34 0 8-10 11-22 11s-22-3-22-11c0-10 16-34 22-34z" fill="#FFFFFF" stroke="#D3D7E5" strokeWidth={1.5} />
          <Rect x={24} y={44} width={24} height={14} rx={2} fill="#2A3A32" />
          <Circle cx={30} cy={36} r={2.4} fill="#1B1F33" />
          <Circle cx={42} cy={36} r={2.4} fill="#1B1F33" />
          <Path d="M33 40q3 3 6 0" fill="none" stroke="#1B1F33" strokeWidth={2} strokeLinecap="round" />
          <Ellipse cx={26} cy={40} rx={3} ry={1.8} fill={BLUSH} />
          <Ellipse cx={46} cy={40} rx={3} ry={1.8} fill={BLUSH} />
        </G>
      );
  }
}

/** A profile icon: a drawn character on a coloured circle. Defaults to the learner's own. */
export function Avatar({ size = 40, avatar, color, label }: { size?: number; avatar?: AvatarId; color?: AvatarColor; label?: string }) {
  const { colors, settings } = useApp();
  const id = avatar ?? settings.avatar;
  const bg = colors[AVATAR_COLORS[color ?? settings.avatarColor]];
  return (
    <View accessible={!!label} accessibilityLabel={label ?? AVATAR_NAMES[id]} aria-hidden={!label}>
      <Svg width={size} height={size} viewBox="0 0 72 72">
        <Circle cx={36} cy={36} r={36} fill={bg} />
        <Character id={id} />
      </Svg>
    </View>
  );
}
