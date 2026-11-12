import { Text, View } from 'react-native';
import { AVATAR_COLORS, type AvatarColor } from '../profile/avatars';
import { useApp } from '../state/AppProvider';

/** The learner's profile icon: an emoji on a coloured circle. Defaults to their own. */
export function Avatar({ size = 40, emoji, color }: { size?: number; emoji?: string; color?: AvatarColor }) {
  const { colors, settings } = useApp();
  const bg = colors[AVATAR_COLORS[color ?? settings.avatarColor]];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.55, lineHeight: size * 0.72 }} allowFontScaling={false}>
        {emoji ?? settings.avatar}
      </Text>
    </View>
  );
}
