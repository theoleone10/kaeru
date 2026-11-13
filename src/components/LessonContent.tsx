import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { getPoint } from "../content/loader";
import type { GrammarPoint } from "../content/types";
import { useApp } from "../state/AppProvider";
import { stationOf } from "../content/units";
import { radius, spacing } from "../theme/colors";
import { ExampleSentence } from "./Furigana";
import { Icon } from "./Icon";
import { RichText, Section, T } from "./ui";

function Bullets({ items }: { items: string[] }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.sm }}>
          <T variant="body" color={colors.textFaint} jp={false}>
            •
          </T>
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
      style={({ pressed }) => [
        styles.link,
        { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T
          variant="body"
          color={colors.accentInk}
          style={{ fontSize: 17, fontWeight: "700" }}
        >
          {p.title}
        </T>
        <T variant="small">{note ?? p.meaning}</T>
      </View>
      <Icon
        name="chevronRight"
        size={18}
        color={colors.textFaint}
        strokeWidth={2.6}
      />
    </Pressable>
  );
}

const KANA_ONLY = /^[〜～ぁ-ゟ゠-ヿ一-鿿・ー…]+$/;

/** The structure lines as chips: slots on soft chips, the grammar itself on a filled indigo chip. */
function Structure({ point }: { point: GrammarPoint }) {
  const { colors } = useApp();
  const title = point.title.replace(/[〜～]/g, "");
  return (
    <View style={{ gap: spacing.sm }}>
      {point.structure.map((line, i) => {
        const parts = line.split(/\s+\+\s+/);
        return (
          <View key={i} style={styles.structureRow}>
            {parts.map((part, j) => {
              const bare = part.trim().replace(/[〜～]/g, "");
              const isGrammar =
                KANA_ONLY.test(part.trim()) &&
                bare.length > 0 &&
                title.includes(bare);
              return (
                <View key={j} style={styles.structureRow}>
                  {j > 0 && (
                    <T
                      variant="body"
                      color={colors.textFaint}
                      style={{ fontSize: 18, fontWeight: "700" }}
                      jp={false}
                    >
                      +
                    </T>
                  )}
                  {part.trim() === "" ? null : (
                    <View
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isGrammar
                            ? colors.accent
                            : colors.accentSoft,
                        },
                      ]}
                    >
                      <T
                        variant="body"
                        color={isGrammar ? colors.accentText : colors.accentInk}
                        style={{
                          fontSize: isGrammar ? 17 : 15,
                          lineHeight: 22,
                          fontWeight: isGrammar ? "800" : "700",
                        }}
                      >
                        {part.trim()}
                      </T>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

export function FuriganaToggle() {
  const { settings, updateSettings, colors } = useApp();
  return (
    <View style={styles.toggle}>
      <T variant="small" style={{ fontWeight: "700" }}>
        Furigana
      </T>
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

/**
 * Full lesson content for a grammar point (used by lessons and the grammar detail screen).
 * `kicker` picks the small line over the title; `afterHeader` goes between the title and the lesson (the grammar page's progress).
 */
export function LessonContent({
  point,
  kicker = "station",
  afterHeader,
}: {
  point: GrammarPoint;
  kicker?: "station" | "new";
  afterHeader?: ReactNode;
}) {
  const { colors, lines } = useApp();
  const station = stationOf(point.id);
  const line = lines[point.level] ?? lines.N5;
  const label = [
    point.level,
    station ? `Unit ${station.unit}` : null,
    kicker === "new"
      ? "New grammar"
      : station
        ? `Station ${station.number}`
        : null,
    point.formality && point.formality !== "neutral"
      ? point.formality[0].toUpperCase() + point.formality.slice(1)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: spacing.xs }}>
        <T
          variant="small"
          color={line.ink}
          style={{ fontWeight: "700" }}
          jp={false}
        >
          {label}
        </T>
        <T variant="title" style={{ fontSize: 40, lineHeight: 50 }}>
          {point.title}
        </T>
        <T variant="muted" style={{ fontSize: 17, lineHeight: 24 }}>
          {point.meaning}
        </T>
      </View>

      {afterHeader}

      <Structure point={point} />

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
        <Section label="Compared with" style={{ gap: 4 }}>
          {point.comparisons.map((c) => (
            <PointLink key={c.id} id={c.id} note={c.note} />
          ))}
        </Section>
      )}

      <Section label="Examples" right={<FuriganaToggle />} style={{ gap: 4 }}>
        {point.examples.map((ex) => (
          <View
            key={ex.id}
            style={[styles.example, { borderTopColor: colors.border }]}
          >
            <ExampleSentence example={ex} size={20} />
            <T variant="small" style={{ fontSize: 14, lineHeight: 20 }}>
              {ex.english}
            </T>
          </View>
        ))}
      </Section>

      {point.related_ids.length > 0 && (
        <Section label="Related" style={{ gap: 4 }}>
          {point.related_ids.map((id) => (
            <PointLink key={id} id={id} />
          ))}
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  structureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.sm,
    justifyContent: "center",
    flexShrink: 1,
  },
  example: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: 10,
    gap: 2,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
