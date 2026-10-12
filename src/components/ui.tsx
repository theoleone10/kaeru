import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { playSound } from '../sound/sounds';
import { useApp } from '../state/AppProvider';
import { fontFor, LIP, radius, spacing, TAP, type Palette } from '../theme/colors';

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'jp';

const TEXT: Record<Variant, TextStyle> = {
  title: { fontSize: 30, lineHeight: 36, fontWeight: '900' },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  muted: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  jp: { fontSize: 22, lineHeight: 32, fontWeight: '700' },
};

const CJK = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;

function containsCjk(node: ReactNode): boolean {
  if (typeof node === 'string') return CJK.test(node);
  if (Array.isArray(node)) return node.some(containsCjk);
  return false;
}

/**
 * Map a weight to the loaded font file (native custom fonts need one family per weight).
 * Japanese text uses Zen Maru Gothic; everything else Nunito.
 */
export function fontStyle(style: StyleProp<TextStyle>, jp: boolean): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  return { fontFamily: fontFor(flat.fontWeight, jp), fontWeight: 'normal' };
}

export function T({
  children,
  variant = 'body',
  style,
  color,
  numberOfLines,
  jp,
}: {
  children: ReactNode;
  variant?: Variant;
  style?: StyleProp<TextStyle>;
  color?: string;
  numberOfLines?: number;
  /** Force (or disable) the Japanese font. Default: on when the text contains kana/kanji. */
  jp?: boolean;
}) {
  const { colors } = useApp();
  const c = color ?? (variant === 'muted' || variant === 'small' ? colors.textMuted : colors.text);
  const useJp = jp ?? (variant === 'jp' || containsCjk(children));
  const merged = [TEXT[variant], { color: c }, style];
  return (
    <Text style={[...merged, fontStyle(merged, useJp)]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/**
 * A plain block on the page background: a small-caps label (with an optional control on the
 * right), then its content. Used instead of cards, like the 今日 list on Today.
 */
export function Section({ label, right, children, style }: { label?: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {(label || right) && (
        <View style={styles.sectionHead}>
          <T variant="small" style={{ flex: 1, fontWeight: '900', letterSpacing: 1 }}>
            {label?.toUpperCase()}
          </T>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

/** A big number with a small label under it, for rows of stats. */
export function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={{ flex: 1, gap: 0 }}>
      <T variant="title" color={color} style={{ fontSize: 26, lineHeight: 32 }} numberOfLines={1}>
        {value}
      </T>
      <T variant="small">{label}</T>
    </View>
  );
}

/** A white card with a soft 3D lip. */
export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'accent' | 'blue' | 'green' | 'gold' }) {
  const { colors } = useApp();
  const tint = tone ? toneColors(colors, tone) : null;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tint ? tint.soft : colors.surface,
          borderColor: tint ? tint.edge : colors.border,
          borderBottomColor: tint ? tint.edge : colors.borderStrong,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function toneColors(colors: Palette, tone: 'accent' | 'blue' | 'green' | 'gold') {
  return {
    accent: { soft: colors.accentSoft, edge: colors.accent },
    blue: { soft: colors.blueSoft, edge: colors.blue },
    green: { soft: colors.correctSoft, edge: colors.correct },
    gold: { soft: colors.goldSoft, edge: colors.gold },
  }[tone];
}

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'blue';

export function buttonColors(colors: Palette, kind: ButtonKind): { bg: string; lip: string; fg: string; border?: string } {
  switch (kind) {
    case 'primary':
      return { bg: colors.accent, lip: colors.accentShadow, fg: colors.accentText };
    case 'success':
      return { bg: colors.correct, lip: colors.correctShadow, fg: '#FFFFFF' };
    case 'blue':
      return { bg: colors.blue, lip: colors.blueShadow, fg: '#FFFFFF' };
    case 'danger':
      return { bg: colors.wrong, lip: colors.wrongShadow, fg: '#FFFFFF' };
    case 'secondary':
      return { bg: colors.surface, lip: colors.borderStrong, fg: colors.accent, border: colors.border };
    case 'ghost':
      return { bg: 'transparent', lip: 'transparent', fg: colors.accent, border: colors.border };
  }
}

/** A #RRGGBB colour darkened by `amount` (0–1), for a button's lip. */
export function darken(hex: string, amount = 0.25): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Chunky 3D button: a coloured face on a darker lip that presses down when tapped.
 * Labels are uppercase and extra-bold, like a game button.
 */
export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  style,
  accessibilityHint,
  icon,
  small,
  sound,
  color,
}: {
  label: string;
  onPress: () => void;
  /** Main buttons pop by default; pass false where the action has its own sound. */
  sound?: boolean;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  icon?: ReactNode;
  small?: boolean;
  /** A custom face colour (with white text and a darker lip), e.g. a timer's colour. */
  color?: string;
}) {
  const { colors } = useApp();
  const c = color ? { bg: color, lip: darken(color), fg: '#FFFFFF' } : buttonColors(colors, kind);
  const height = small ? 40 : TAP;
  const lip = kind === 'ghost' ? 0 : small ? 3 : LIP;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading) }}
      disabled={disabled || loading}
      onPress={() => {
        if (sound ?? kind === 'primary') playSound('button');
        onPress();
      }}
      onPressIn={() => Haptics.selectionAsync().catch(() => undefined)}
      hitSlop={6}
      style={[{ minHeight: height + lip, opacity: disabled ? 0.45 : 1 }, style]}
    >
      {({ pressed }) => (
        <>
          <View style={[StyleSheet.absoluteFill, { top: lip, borderRadius: radius.md, backgroundColor: c.lip }]} />
          <View
            style={[
              styles.buttonFace,
              {
                minHeight: height,
                backgroundColor: c.bg,
                borderColor: c.border ?? c.bg,
                borderWidth: c.border ? 2 : 0,
                transform: [{ translateY: pressed && !disabled ? lip : 0 }],
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={c.fg} />
            ) : (
              <>
                {icon}
                <T variant="body" color={c.fg} jp={false} style={{ fontWeight: '900', fontSize: small ? 14 : 17, letterSpacing: 0.8 }}>
                  {label.toUpperCase()}
                </T>
              </>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

const pct = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%` as const;

function BarFill({ v, color, height }: { v: number; color: string; height: number }) {
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(v), borderRadius: height / 2, backgroundColor: color, overflow: 'hidden' }}>
      {height >= 10 && <View style={{ marginTop: height * 0.2, marginHorizontal: 6, height: Math.max(2, height * 0.2), borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' }} />}
    </View>
  );
}

export function ProgressBar({ value, secondary, height = 12, color }: { value: number; secondary?: number; height?: number; color?: string }) {
  const { colors } = useApp();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      {value > 0 && <BarFill v={value} color={color ?? colors.gold} height={height} />}
      {secondary !== undefined && secondary > 0 && <BarFill v={secondary} color={colors.correct} height={height} />}
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'notice' | 'green' | 'blue' | 'gold' }) {
  const { colors } = useApp();
  const bg = { neutral: colors.surfaceAlt, accent: colors.accentSoft, notice: colors.noticeSoft, green: colors.correctSoft, blue: colors.blueSoft, gold: colors.goldSoft }[tone];
  const fg = { neutral: colors.textMuted, accent: colors.accent, notice: colors.notice, green: colors.correctText, blue: colors.blueText, gold: colors.notice }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <T variant="small" color={fg} style={{ fontSize: 12, fontWeight: '900' }}>
        {label}
      </T>
    </View>
  );
}

/** Explanation text: paragraphs split on blank lines, *text* rendered as emphasis. */
export function RichText({ text }: { text: string }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: spacing.md }}>
      {text.split(/\n\s*\n/).map((para, i) => (
        <Text key={i} style={[TEXT.body, { color: colors.text }, fontStyle(TEXT.body, CJK.test(para))]}>
          {para.split(/(\*[^*]+\*)/).map((part, j) =>
            part.startsWith('*') && part.endsWith('*') ? (
              <Text key={j} style={[{ fontStyle: 'italic' }, fontStyle({ fontWeight: '800' }, CJK.test(part))]}>
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

/** Round icon button (settings, more, close) on a soft chip. */
export function IconButton({ children, onPress, label, tone = 'neutral' }: { children: ReactNode; onPress: () => void; label: string; tone?: 'neutral' | 'accent' }) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: tone === 'accent' ? colors.accentSoft : colors.surfaceAlt, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}

/**
 * − value + control for small numeric settings. Without a custom `display`, the number can
 * also be tapped and typed exactly (clamped to min–max when you finish).
 */
export function Stepper({ value, display, onChange, min, max, step = 1 }: { value: number; display?: string; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  const { colors } = useApp();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  };
  const btn = (label: string, next: number, disabled: boolean) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === '−' ? 'Decrease' : 'Increase'}
      style={({ pressed }) => [styles.stepBtn, { backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}
    >
      <T variant="heading" color={colors.accent}>
        {label}
      </T>
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {btn('−', Math.max(min, value - step), value <= min)}
      {display !== undefined ? (
        <T variant="body" style={{ minWidth: 56, textAlign: 'center', fontWeight: '600' }}>
          {display}
        </T>
      ) : (
        <TextInput
          value={draft ?? String(value)}
          onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ''))}
          onFocus={() => setDraft(String(value))}
          onEndEditing={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          maxLength={String(max).length}
          accessibilityLabel={`Value, ${value}. Tap to type a number`}
          style={[TEXT.body, fontStyle({ fontWeight: '800' }, false), styles.stepInput, { color: colors.text, borderBottomColor: colors.border }]}
        />
      )}
      {btn('+', Math.min(max, value + step), value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 2 + LIP, padding: spacing.lg },
  buttonFace: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  iconButton: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepInput: { minWidth: 56, textAlign: 'center', paddingVertical: 4, borderBottomWidth: 2 },
  stepBtn: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
