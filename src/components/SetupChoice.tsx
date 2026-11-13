import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { spacing } from '../theme/colors';
import { T } from './ui';

/** One choice in a list: a radio row with a thin rule above it. Put rows in a `ChoiceList`. */
export function Choice({ title, detail, note, selected, onPress }: { title: string; detail?: string; note?: string; selected: boolean; onPress: () => void }) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={[title, detail, note].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.choice, { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.radio,
          selected ? { borderWidth: 7, borderColor: colors.accent } : { borderWidth: 2, borderColor: colors.borderStrong },
        ]}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="body" color={selected ? colors.accentInk : colors.text} style={{ fontSize: 18, lineHeight: 25, fontWeight: '700' }}>
          {title}
        </T>
        {!!detail && <T variant="small">{detail}</T>}
      </View>
      {!!note && (
        <View style={[styles.note, { backgroundColor: colors.accentSoft }]}>
          <T variant="small" color={colors.accentInk} style={{ fontSize: 12, lineHeight: 16, fontWeight: '800' }}>
            {note}
          </T>
        </View>
      )}
    </Pressable>
  );
}

/** A radio group of `Choice` rows, closed off with a rule under the last one. */
export function ChoiceList({ children, radio = true }: { children: ReactNode; radio?: boolean }) {
  const { colors } = useApp();
  return (
    <View accessibilityRole={radio ? 'radiogroup' : undefined} style={{ borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border }}>
      {children}
    </View>
  );
}

export function Heading({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <T variant="title" style={{ fontSize: 30, lineHeight: 38 }}>
        {title}
      </T>
      <T variant="muted">{body}</T>
    </View>
  );
}

/** Segmented step progress for multi-step flows: one short bar per step, filled up to the current one. */
export function StepBar({ step, count }: { step: number; count: number }) {
  const { colors } = useApp();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${count}`}
      accessibilityValue={{ min: 0, max: count, now: step }}
      style={{ flexDirection: 'row', gap: 5 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < step ? colors.accent : colors.border }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  radio: { width: 24, height: 24, borderRadius: 12 },
  note: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
