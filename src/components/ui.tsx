import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useApp } from '../state/AppProvider';
import { radius, spacing, TAP } from '../theme/colors';

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'jp';

const TEXT: Record<Variant, TextStyle> = {
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  muted: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  jp: { fontSize: 22, lineHeight: 32 },
};

export function T({
  children,
  variant = 'body',
  style,
  color,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: Variant;
  style?: StyleProp<TextStyle>;
  color?: string;
  numberOfLines?: number;
}) {
  const { colors } = useApp();
  const c = color ?? (variant === 'muted' || variant === 'small' ? colors.textMuted : colors.text);
  return (
    <Text style={[TEXT[variant], { color: c }, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const { colors } = useApp();
  const bg = { primary: colors.accent, secondary: colors.accentSoft, ghost: 'transparent', danger: colors.wrongSoft }[kind];
  const fg = { primary: colors.accentText, secondary: colors.accent, ghost: colors.accent, danger: colors.wrong }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      disabled={disabled || loading}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        kind === 'ghost' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function ProgressBar({ value, secondary, height = 8 }: { value: number; secondary?: number; height?: number }) {
  const { colors } = useApp();
  const pct = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%` as const;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(value), backgroundColor: colors.chartBar }} />
      {secondary !== undefined && (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(secondary), backgroundColor: colors.accent }} />
      )}
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'notice' }) {
  const { colors } = useApp();
  const bg = { neutral: colors.surfaceAlt, accent: colors.accentSoft, notice: colors.noticeSoft }[tone];
  const fg = { neutral: colors.textMuted, accent: colors.accent, notice: colors.notice }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** Explanation text: paragraphs split on blank lines, *text* rendered as emphasis. */
export function RichText({ text }: { text: string }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: spacing.md }}>
      {text.split(/\n\s*\n/).map((para, i) => (
        <Text key={i} style={[TEXT.body, { color: colors.text }]}>
          {para.split(/(\*[^*]+\*)/).map((part, j) =>
            part.startsWith('*') && part.endsWith('*') ? (
              <Text key={j} style={{ fontStyle: 'italic', fontWeight: '600' }}>
                {part.slice(1, -1)}
              </Text>
            ) : (
              part
            ),
          )}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg },
  button: { minHeight: TAP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { fontSize: 17, fontWeight: '600' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
});
