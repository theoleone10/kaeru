import { useEffect, type ReactNode } from 'react';
import { playSound } from '../sound/sounds';
import { View } from 'react-native';
import { spacing } from '../theme/colors';
import { Confetti } from './Confetti';
import { Mascot, type Mood } from './Mascot';
import { T } from './ui';

export interface Stat {
  label: string;
  value: string;
  tone?: 'accent' | 'blue' | 'green' | 'gold';
}

/** End-of-session screen: Kaeru the frog, a headline, a row of stat tiles, then actions. */
export function Celebration({
  title,
  subtitle,
  stats = [],
  mood = 'cheer',
  confetti = false,
  children,
}: {
  title: string;
  subtitle?: string;
  stats?: Stat[];
  mood?: Mood;
  confetti?: boolean;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (confetti) playSound('complete');
  }, [confetti]);
  return (
    <View style={{ flex: 1, padding: spacing.xl, gap: spacing.xl, justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Mascot size={120} mood={mood} bounce />
        <T variant="title" style={{ textAlign: 'center' }}>
          {title}
        </T>
        {subtitle ? (
          <T variant="muted" style={{ textAlign: 'center' }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {stats.length > 0 && (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {stats.map((s) => (
            <View key={s.label} style={{ flex: 1, alignItems: 'center', gap: 0 }}>
              <T variant="title" style={{ fontSize: 28, lineHeight: 34 }}>
                {s.value}
              </T>
              <T variant="small" style={{ fontWeight: '900', letterSpacing: 1 }}>
                {s.label.toUpperCase()}
              </T>
            </View>
          ))}
        </View>
      )}
      <View style={{ gap: spacing.md }}>{children}</View>
      {confetti && <Confetti />}
    </View>
  );
}
