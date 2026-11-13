import { useEffect, type ReactNode } from 'react';
import { playSound, type SoundName } from '../sound/sounds';
import { View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { spacing } from '../theme/colors';
import { Confetti } from './Confetti';
import { Mascot, type Mood } from './Mascot';
import { T } from './ui';

export interface Stat {
  label: string;
  value: string;
  tone?: 'accent' | 'blue' | 'green' | 'gold';
}

/** End-of-session screen: Kaeru the frog, a headline, big numbers side by side, then actions. */
export function Celebration({
  title,
  subtitle,
  stats = [],
  mood = 'cheer',
  confetti = false,
  sound = 'complete',
  children,
}: {
  title: string;
  subtitle?: string;
  stats?: Stat[];
  mood?: Mood;
  confetti?: boolean;
  /** Jingle played with the confetti. */
  sound?: SoundName;
  children?: ReactNode;
}) {
  const { colors } = useApp();
  const tone = { accent: colors.accentInk, blue: colors.blueText, green: colors.correctText, gold: colors.notice };
  useEffect(() => {
    if (confetti) playSound(sound);
  }, [confetti, sound]);
  return (
    <View style={{ flex: 1, padding: spacing.xl, gap: 26, justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <Mascot size={124} mood={mood} bounce />
        <T variant="title" style={{ textAlign: 'center' }}>
          {title}
        </T>
        {subtitle ? (
          <T variant="muted" style={{ textAlign: 'center', fontSize: 16, lineHeight: 24 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {stats.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 40, paddingVertical: spacing.xs }}>
          {stats.map((s) => (
            <View key={s.label} style={{ alignItems: 'center' }}>
              <T variant="title" color={s.tone ? tone[s.tone] : colors.text} style={{ fontSize: 28, lineHeight: 34 }} jp={false}>
                {s.value}
              </T>
              <T variant="small">{s.label}</T>
            </View>
          ))}
        </View>
      )}
      <View style={{ gap: spacing.md }}>{children}</View>
      {confetti && <Confetti />}
    </View>
  );
}
