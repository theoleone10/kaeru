import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { getPoint } from '../content/loader';
import type { GrammarPoint } from '../content/types';
import { useApp } from '../state/AppProvider';
import { stationOf } from '../content/units';
import { radius, spacing } from '../theme/colors';
import { FuriganaText } from './Furigana';
import { RichText, Section, T } from './ui';

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <T variant="body">•</T>
          <T variant="body" style={{ flex: 1 }}>
            {item}
          </T>
        </View>
      ))}
    </View>
  );
}

function PointLink({ id, note }: { id: string; note?: string }) {
  const { colors } = useApp();
  const p = getPoint(id);
  if (!p) return null;
  return (
    <Pressable
      onPress={() => router.push(`/grammar/${id}`)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      <T variant="body" color={colors.accent} style={{ fontWeight: '600' }}>
        {p.title} ›
      </T>
      <T variant="small">{note ?? p.meaning}</T>
    </Pressable>
  );
}

export function FuriganaToggle() {
  const { settings, updateSettings, colors } = useApp();
  return (
    <View style={styles.toggle}>
      <T variant="small">Furigana</T>
      <Switch
        value={settings.furigana}
        onValueChange={(v) => updateSettings({ furigana: v })}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor="#FFFFFF"
        accessibilityLabel="Show furigana"
      />
    </View>
  );
}

/** Full lesson content for a grammar point (used by lessons and the grammar detail screen). */
export function LessonContent({ point }: { point: GrammarPoint }) {
  const { colors, lines } = useApp();
  const station = stationOf(point.id);
  const line = lines[point.level] ?? lines.N5;
  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.xs }}>
        <T variant="small" color={line.ink} style={{ fontWeight: '900', letterSpacing: 1 }}>
          {point.level}
          {station ? ` · UNIT ${station.unit}` : ''}
          {point.formality ? ` · ${point.formality.toUpperCase()}` : ''}
        </T>
        <T variant="title" style={{ fontSize: 34, lineHeight: 46 }}>
          {point.title}
        </T>
        <T variant="muted">{point.meaning}</T>
      </View>

      <View style={[styles.structure, { backgroundColor: colors.accentSoft }]}>
        {point.structure.map((s, i) => (
          <T key={i} variant="body" style={{ fontSize: 17 }}>
            {s}
          </T>
        ))}
      </View>

      <Section label="How it works">
        <RichText text={point.explanation} />
      </Section>

      {point.nuances.length > 0 && (
        <Section label="Nuance">
          <Bullets items={point.nuances} />
        </Section>
      )}

      {point.common_mistakes.length > 0 && (
        <Section label="Common mistakes">
          <Bullets items={point.common_mistakes} />
        </Section>
      )}

      {point.comparisons && point.comparisons.length > 0 && (
        <Section label="Compared with">
          {point.comparisons.map((c) => (
            <PointLink key={c.id} id={c.id} note={c.note} />
          ))}
        </Section>
      )}

      <Section label="Examples" right={<FuriganaToggle />}>
        {point.examples.map((ex) => (
          <View key={ex.id} style={[styles.example, { borderLeftColor: line.line }]}>
            <FuriganaText markup={ex.furigana} size={21} />
            <T variant="muted">{ex.english}</T>
          </View>
        ))}
      </Section>

      {point.related_ids.length > 0 && (
        <Section label="Related">
          {point.related_ids.map((id) => (
            <PointLink key={id} id={id} />
          ))}
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  structure: { borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  example: { borderLeftWidth: 4, paddingLeft: spacing.md, paddingVertical: 2, gap: spacing.xs, marginBottom: spacing.sm },
  link: { paddingVertical: spacing.sm, gap: 2, minHeight: 48, justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
});
