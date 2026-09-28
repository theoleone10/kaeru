import { useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import type { ForecastBucket } from '../srs/forecast';
import { useApp } from '../state/AppProvider';
import { T } from './ui';

const HEIGHT = 120;
const LABEL_H = 18;

/** 24 hourly bars of upcoming reviews. */
export function ForecastChart({ buckets }: { buckets: ForecastBucket[] }) {
  const { colors } = useApp();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const slot = width / buckets.length;
  const barW = Math.max(2, slot * 0.66);
  const plotH = HEIGHT - LABEL_H - 14;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={`${total} reviews coming up in the next 24 hours`}
    >
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          {buckets.map((b, i) => {
            const h = b.count === 0 ? 2 : Math.max(4, (b.count / max) * plotH);
            const x = i * slot + (slot - barW) / 2;
            const y = HEIGHT - LABEL_H - h;
            const hour = new Date(b.start).getHours();
            return (
              <G key={i}>
                <Rect x={x} y={y} width={barW} height={h} rx={2} fill={b.count ? colors.chartBar : colors.surfaceAlt} />
                {b.count > 0 && (
                  <SvgText x={x + barW / 2} y={y - 3} fontSize={10} fill={colors.textMuted} textAnchor="middle">
                    {b.count}
                  </SvgText>
                )}
                {i % 6 === 0 && (
                  <SvgText x={i === 0 ? x : x + barW / 2} y={HEIGHT - 4} fontSize={10} fill={colors.textMuted} textAnchor={i === 0 ? 'start' : 'middle'}>
                    {i === 0 ? 'now' : `${hour}:00`}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      )}
      {total === 0 && (
        <T variant="small" style={{ textAlign: 'center', marginTop: -HEIGHT / 2 - 10 }}>
          Nothing due in the next 24 hours
        </T>
      )}
    </View>
  );
}
