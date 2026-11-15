import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { Flame } from '@/components/Flame';
import { Icon } from '@/components/Icon';
import { KanaCourseCard } from '@/components/KanaCourseCard';
import { Button, Section, Stat, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { stationCode, stationOf } from '@/content/units';
import { useToday } from '@/daily/useToday';
import { AVATAR_COLORS, AVATAR_NAMES, AVATAR_NAMES_JA, AVATARS, type AvatarColor, type AvatarId } from '@/profile/avatars';
import { useApp, useNow } from '@/state/AppProvider';
import { formatDuration } from '@/time/model';
import { useTime } from '@/time/TimeProvider';
import { spacing, TAP } from '@/theme/colors';

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Your corner of Kaeru: icon, streak and key numbers, the kana course and the placement quiz. */
export default function Profile() {
  const insets = useSafeAreaInsets();
  const { colors, lines, settings, updateSettings, cards, isDark } = useApp();
  const { user } = useAuth();
  const { streak } = useToday();
  const { entries } = useTime();
  const now = useNow();
  const [picking, setPicking] = useState(false);

  const learned = new Set(cards.map((c) => c.grammar_id));
  const next = curriculum.find((p) => !learned.has(p.id));
  const station = next ? stationOf(next.id) : undefined;
  // Time logged in the last seven days (the part of each entry inside them).
  const weekMs = entries.reduce((sum, e) => sum + Math.max(0, Math.min(e.ended_at ?? now, now) - Math.max(e.started_at, now - WEEK)), 0);

  const pick = (patch: { avatar?: AvatarId; avatarColor?: AvatarColor }) => {
    Haptics.selectionAsync().catch(() => undefined);
    updateSettings(patch).catch(() => undefined);
  };

  const selectedRing = (on: boolean) => ({ borderColor: on ? colors.accent : 'transparent' });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: spacing.lg, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={10} style={styles.headerButton}>
              <Icon name="settings" size={24} color={colors.textMuted} />
            </Pressable>
          ),
        }}
      />

      <View style={{ alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={() => setPicking((p) => !p)}
          accessibilityRole="button"
          accessibilityLabel="Change your icon"
          accessibilityState={{ expanded: picking }}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
        >
          <View style={[styles.portrait, { borderColor: isDark ? colors.surfaceAlt : colors.surface, boxShadow: isDark ? undefined : '0px 4px 14px rgba(27,31,51,0.14)' }]}>
            <Avatar size={128} />
          </View>
          <View style={[styles.edit, { backgroundColor: colors.accent, borderColor: colors.background }]}>
            <Icon name={picking ? 'close' : 'pencil'} size={16} color={colors.accentText} strokeWidth={2.4} />
          </View>
        </Pressable>
        <T variant="small" style={{ fontSize: 14, lineHeight: 20 }}>
          {user?.email ?? 'Not signed in'}
        </T>
      </View>

      {picking && (
        <Section label="Your icon">
          <View style={styles.grid}>
            {AVATARS.map((a) => {
              const on = a === settings.avatar;
              return (
                <Pressable
                  key={a}
                  onPress={() => pick({ avatar: a })}
                  accessibilityRole="button"
                  accessibilityLabel={`${AVATAR_NAMES_JA[a]}, ${AVATAR_NAMES[a]}`}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [styles.cell, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
                >
                  <View style={[styles.cellRing, selectedRing(on)]}>
                    <Avatar size={64} avatar={a} />
                  </View>
                  <T variant="small" color={on ? colors.accentInk : colors.textMuted} style={{ fontSize: 13, lineHeight: 18, fontWeight: on ? '800' : '600' }} numberOfLines={1}>
                    {AVATAR_NAMES_JA[a]}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel="Background colour">
            {(Object.keys(AVATAR_COLORS) as AvatarColor[]).map((c) => (
              <Pressable
                key={c}
                onPress={() => pick({ avatarColor: c })}
                accessibilityRole="button"
                accessibilityLabel={`${c} background`}
                accessibilityState={{ selected: c === settings.avatarColor }}
                hitSlop={4}
                style={[styles.swatchRing, selectedRing(c === settings.avatarColor)]}
              >
                <View style={[styles.swatch, { backgroundColor: colors[AVATAR_COLORS[c]] }]} />
              </Pressable>
            ))}
          </View>
        </Section>
      )}

      <View style={styles.streak}>
        <Flame size={52} color={streak.goalMetToday ? colors.flame : colors.textFaint} core={streak.goalMetToday ? undefined : colors.surfaceAlt} />
        <View style={{ flex: 1 }}>
          <T variant="title" style={{ fontSize: 30, lineHeight: 36 }}>{`${streak.days} day${streak.days === 1 ? '' : 's'}`}</T>
          <T variant="small" style={{ fontSize: 14, lineHeight: 20 }}>
            {streak.goalMetToday ? 'Streak kept today. Nice!' : 'Reach a daily goal to keep your streak.'}
          </T>
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <View style={[styles.stats, { borderColor: colors.border }]}>
          <Stat value={String(learned.size)} label="grammar learned" />
          <Stat value={station ? stationCode(station) : 'All'} label="your station" color={station ? lines[station.point.level]?.ink : colors.correctText} />
          <Stat value={formatDuration(weekMs)} label="this week" />
        </View>
        <Pressable onPress={() => router.push('/progress')} accessibilityRole="button" accessibilityLabel="See all progress" hitSlop={4} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
          <T variant="body" color={colors.accentInk} style={{ fontSize: 15, fontWeight: '700' }}>
            See all progress
          </T>
          <Icon name="chevronRight" size={16} color={colors.accentInk} strokeWidth={2.6} />
        </Pressable>
      </View>

      <Section label="Kana">
        <KanaCourseCard />
        <View style={styles.row}>
          <T variant="body" style={{ flex: 1 }}>
            Show the kana course on Today
          </T>
          <Switch
            value={settings.studyKana}
            onValueChange={(v) => updateSettings({ studyKana: v })}
            accessibilityLabel="Show the kana course on Today"
            trackColor={{ true: colors.accent, false: colors.borderStrong }}
            thumbColor="#FFFFFF"
            {...WEB_THUMB}
            ios_backgroundColor={colors.borderStrong}
          />
        </View>
      </Section>

      <Section label="Find your station">
        <T variant="body" style={{ fontSize: 15, lineHeight: 22 }}>
          A short quiz on the grammar lines. Everything before the station it finds is marked as known.
        </T>
        <Button label="Take the placement quiz" kind="secondary" onPress={() => router.push('/placement')} style={{ marginTop: spacing.xs }} />
      </Section>
    </ScrollView>
  );
}

/** react-native-web's Switch takes the on-state thumb colour separately. */
const WEB_THUMB = { activeThumbColor: '#FFFFFF' } as object;

const styles = StyleSheet.create({
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  portrait: { borderRadius: 70, borderWidth: 4 },
  edit: { position: 'absolute', right: 2, bottom: 4, width: 36, height: 36, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  cell: { width: '25%', alignItems: 'center', gap: 4 },
  cellRing: { padding: 3, borderRadius: 40, borderWidth: 2.5 },
  colors: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  swatchRing: { padding: 3, borderRadius: 26, borderWidth: 2.5 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(0,0,0,0.06)' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stats: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth * 2, borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, alignSelf: 'center', paddingHorizontal: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
});
