import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import type { ForecastBucket } from "../srs/forecast";
import { useApp } from "../state/AppProvider";
import { FONTS } from "../theme/colors";
import { T } from "./ui";

const HEIGHT = 120;
const LABEL_H = 18;

/** One bar per day of upcoming reviews, today first. */
export function ForecastChart({ buckets }: { buckets: ForecastBucket[] }) {
  const { colors } = useApp();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const slot = width / buckets.length;
  const barW = Math.max(2, Math.min(22, slot * 0.62));
  const plotH = HEIGHT - LABEL_H - 14;
  // Numbers over the bars only when there's room for them.
  const showCounts = slot >= 16;

  return (
    <View
      style={{ minHeight: HEIGHT }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={`${total} reviews in the next ${buckets.length} days, ${buckets[0]?.count ?? 0} today`}
    >
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          {buckets.map((b, i) => {
            const h = b.count === 0 ? 2 : Math.max(4, (b.count / max) * plotH);
            const x = i * slot + (slot - barW) / 2;
            const y = HEIGHT - LABEL_H - h;
            return (
              <G key={b.start}>
                <Rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={Math.min(3, barW / 2)}
                  fill={
                    b.count
                      ? i === 0
                        ? colors.accent
                        : colors.chartBar
                      : colors.border
                  }
                />
                {b.count > 0 && (showCounts || b.count === max || i === 0) && (
                  <SvgText
                    x={x + barW / 2}
                    y={y - 3}
                    fontSize={10}
                    fontFamily={i === 0 ? FONTS.extra : FONTS.regular}
                    fill={i === 0 ? colors.accentInk : colors.textFaint}
                    textAnchor="middle"
                  >
                    {b.count}
                  </SvgText>
                )}
                {i % 7 === 0 && (
                  <SvgText
                    x={i === 0 ? x : x + barW / 2}
                    y={HEIGHT - 4}
                    fontSize={11}
                    fontFamily={i === 0 ? FONTS.extra : FONTS.regular}
                    fill={i === 0 ? colors.accentInk : colors.textFaint}
                    textAnchor={i === 0 ? "start" : "middle"}
                  >
                    {i === 0
                      ? "Today"
                      : new Date(b.start).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      )}
      {total === 0 && (
        // Laid over the empty chart, so the chart keeps its full height.
        <View
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: "center", paddingBottom: LABEL_H },
          ]}
          pointerEvents="none"
        >
          <T
            variant="small"
            color={colors.textFaint}
            style={{ textAlign: "center" }}
          >
            Nothing due in the next {buckets.length} days
          </T>
        </View>
      )}
    </View>
  );
}
