import { useState, type ReactNode, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppProvider';
import { fontFor, spacing } from '../theme/colors';
import { Icon, type IconName } from './Icon';
import { T } from './ui';

/** Blend two #RRGGBB colours: t = 0 gives `a`, 1 gives `b`. Anything else is returned as `a`. */
export function mix(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a);
  const pb = /^#([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  return `#${[16, 8, 0]
    .map((s) => {
      const x = (na >> s) & 255;
      const y = (nb >> s) & 255;
      return Math.round(x + (y - x) * t)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/**
 * A pill choice: filled with its colour when selected, outlined (2px) when not.
 * With a custom colour (an activity's), the outline is a soft tint and the label a deeper ink of it.
 */
export function Chip({
  label,
  active,
  onPress,
  color,
  icon,
  role = 'button',
  a11y,
  size = 'md',
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
  icon?: IconName;
  role?: 'button' | 'radio';
  a11y?: string;
  size?: 'md' | 'lg';
}) {
  const { colors, isDark } = useApp();
  const fill = color ?? colors.accent;
  const outline = color ? mix(color, colors.background, isDark ? 0.55 : 0.6) : colors.border;
  const ink = color ? (isDark ? mix(color, '#FFFFFF', 0.45) : mix(color, '#000000', 0.3)) : colors.text;
  const fg = active ? '#FFFFFF' : ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: active }}
      hitSlop={size === 'md' ? 2 : 0}
      style={({ pressed }) => [
        styles.chip,
        size === 'lg' && { minHeight: 44, paddingHorizontal: 18 },
        active ? { backgroundColor: fill, borderColor: fill } : { borderColor: outline },
        { opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {icon && <Icon name={icon} size={16} color={fg} strokeWidth={2.4} />}
      <T variant="body" color={fg} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

/** A white rounded field with a 2px border that turns indigo while focused. */
export function Input({ ref, style, big, onFocus, onBlur, ...props }: TextInputProps & { ref?: Ref<TextInput>; big?: boolean; style?: StyleProp<TextStyle> }) {
  const { colors } = useApp();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textFaint}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        big && { fontSize: 18 },
        { fontFamily: fontFor('700'), color: colors.text, backgroundColor: colors.surface, borderColor: focused ? colors.accentInk : colors.border },
        style,
      ]}
    />
  );
}

/** The bar at the bottom of a form that holds its main action (and maybe a second one). */
export function BottomBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const { colors } = useApp();
  return <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm, backgroundColor: colors.background }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 2 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 2, paddingHorizontal: 14, fontSize: 16, outlineWidth: 0 },
  bar: { paddingHorizontal: 20, paddingTop: 14, gap: spacing.md },
});
