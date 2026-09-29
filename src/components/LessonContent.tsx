import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { getPoint } from '../content/loader';
import type { GrammarPoint } from '../content/types';
import { useApp } from '../state/AppProvider';
import { stationCode, stationOf } from '../content/units';
import { LEVEL_COLORS, radius, spacing } from '../theme/colors';
import { FuriganaText } from './Furigana';
import { Card, Pill, RichText, T } from './ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <T variant="heading">{title}</T>
      {children}
    </View>
  );
}

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
      style={({ pressed }) => [styles.link, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
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
  const { colors } = useApp();
  const station = stationOf(point.id);
  const line = LEVEL_COLORS[point.level] ?? LEVEL_COLORS.N5;
  return (
    <View style={{ gap: spacing.xl }}>
      <View style={[styles.sign, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
        <View style={[styles.band, { backgroundColor: line.line }]}>
          <T variant="small" color="#FFFFFF" style={{ fontWeight: '900', letterSpacing: 0.8 }}>
            {point.level} LINE{station ? ` · UNIT ${station.unit}` : ''}
          </T>
          {station && (
            <T variant="small" color="#FFFFFF" style={{ fontWeight: '900', letterSpacing: 0.8 }}>
              {stationCode(station)}
            </T>
          )}
        </View>
        <View style={{ padding: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
          <T variant="title" style={{ fontSize: 32, lineHeight: 44, textAlign: 'center' }}>
            {point.title}
          </T>
          <T variant="muted" style={{ textAlign: 'center' }}>
            {point.meaning}
          </T>
          {point.formality && <Pill label={point.formality} />}
        </View>
      </View>

      <Card style={{ gap: spacing.sm }} tone="accent">
        <T variant="small" color={colors.accent} style={{ fontWeight: '900' }}>
          STRUCTURE
        </T>
        {point.structure.map((s, i) => (
          <T key={i} variant="body" style={{ fontSize: 17 }}>
            {s}
          </T>
        ))}
      </Card>

      <Section title="How it works">
        <RichText text={point.explanation} />
      </Section>

      {point.nuances.length > 0 && (
        <Section title="Nuance & formality">
          <Bullets items={point.nuances} />
        </Section>
      )}

      {point.common_mistakes.length > 0 && (
        <Section title="Common mistakes">
          <Bullets items={point.common_mistakes} />
        </Section>
      )}

      {point.comparisons && point.comparisons.length > 0 && (
        <Section title="Compared with">
          {point.comparisons.map((c) => (
            <PointLink key={c.id} id={c.id} note={c.note} />
          ))}
        </Section>
      )}

      <Section title="Examples">
        <FuriganaToggle />
        {point.examples.map((ex) => (
          <Card key={ex.id} style={{ gap: spacing.sm }}>
            <FuriganaText markup={ex.furigana} size={21} />
            <T variant="muted">{ex.english}</T>
          </Card>
        ))}
      </Section>

      {point.related_ids.length > 0 && (
        <Section title="Related grammar">
          {point.related_ids.map((id) => (
            <PointLink key={id} id={id} />
          ))}
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sign: { borderRadius: 18, borderWidth: 2, borderBottomWidth: 6, overflow: 'hidden' },
  band: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6 },
  link: { borderRadius: radius.md, padding: spacing.md, gap: 2, minHeight: 52, justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
});
