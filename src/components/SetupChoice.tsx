import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { radius, spacing } from '../theme/colors';
import { T } from './ui';

/** One choice in a list: a big tappable card, outlined when picked. */
export function Choice({ title, detail, note, selected, onPress }: { title: string; detail?: string; note?: string; selected: boolean; onPress: () => void }) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          borderBottomColor: selected ? colors.accentShadow : colors.borderStrong,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="heading" color={selected ? colors.accent : colors.text}>
          {title}
        </T>
        {!!detail && <T variant="small">{detail}</T>}
      </View>
      {!!note && (
        <T variant="small" color={selected ? colors.accent : colors.textMuted} style={{ fontWeight: '800' }}>
          {note}
        </T>
      )}
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={selected ? colors.accent : colors.borderStrong} />
    </Pressable>
  );
}

export function Heading({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <T variant="title">{title}</T>
      <T variant="muted">{body}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 4 },
});
