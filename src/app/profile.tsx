import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { Flame } from '@/components/Flame';
import { KanaCourseCard } from '@/components/KanaCourseCard';
import { Button, Section, Stat, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { stationCode, stationOf } from '@/content/units';
import { useToday } from '@/daily/useToday';
import { AVATAR_COLORS, AVATARS, type AvatarColor, type AvatarId } from '@/profile/avatars';
import { useApp, useNow } from '@/state/AppProvider';
import { formatDuration } from '@/time/model';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing, TAP } from '@/theme/colors';

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Your corner of Kaeru: icon, streak and key numbers, the kana course and the placement quiz. */
export default function Profile() {
  const insets = useSafeAreaInsets();
  const { colors, settings, updateSettings, cards } = useApp();
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

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={10}>
              <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
            </Pressable>
          ),
        }}
      />

      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => setPicking((p) => !p)} accessibilityRole="button" accessibilityLabel="Change your icon">
          <Avatar size={104} />
          <View style={[styles.edit, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name={picking ? 'close' : 'pencil'} size={16} color={colors.accent} />
          </View>
        </Pressable>
        <T variant="small">{user?.email ?? 'Not signed in'}</T>
      </View>

      {picking && (
        <Section label="Your icon">
          <View style={styles.grid}>
            {AVATARS.map((a) => (
              <Pressable
                key={a}
                onPress={() => pick({ avatar: a })}
                accessibilityRole="button"
                accessibilityLabel={a}
                accessibilityState={{ selected: a === settings.avatar }}
                style={[styles.cell, { borderColor: a === settings.avatar ? colors.accent : 'transparent' }]}
              >
                <Avatar size={44} avatar={a} />
              </Pressable>
            ))}
          </View>
          <View style={styles.colors}>
            {(Object.keys(AVATAR_COLORS) as AvatarColor[]).map((c) => (
              <Pressable
                key={c}
                onPress={() => pick({ avatarColor: c })}
                accessibilityRole="button"
                accessibilityLabel={`${c} background`}
                accessibilityState={{ selected: c === settings.avatarColor }}
                style={[styles.swatch, { backgroundColor: colors[AVATAR_COLORS[c]], borderColor: c === settings.avatarColor ? colors.accent : colors.border }]}
              />
            ))}
          </View>
        </Section>
      )}

      <View style={[styles.streak, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Flame size={34} color={streak.goalMetToday ? '#F08A3C' : colors.textMuted} />
        <View style={{ flex: 1 }}>
          <T variant="title" style={{ fontSize: 28, lineHeight: 34 }}>{`${streak.days} day${streak.days === 1 ? '' : 's'}`}</T>
          <T variant="small">{streak.goalMetToday ? 'Streak kept today. Nice!' : 'Reach a daily goal to keep your streak.'}</T>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={String(learned.size)} label="grammar learned" />
        <Stat value={station ? stationCode(station) : 'All'} label="your station" />
        <Stat value={formatDuration(weekMs)} label="this week" />
      </View>
      <Button label="See all progress" kind="ghost" small onPress={() => router.push('/progress')} />

      <Section label="Kana">
        <KanaCourseCard />
        <View style={styles.row}>
          <T variant="body" style={{ flex: 1 }}>
            Show the kana course on Today
          </T>
          <Switch value={settings.studyKana} onValueChange={(v) => updateSettings({ studyKana: v })} accessibilityLabel="Show the kana course on Today" />
        </View>
      </Section>

      <Section label="Find your station">
        <T variant="body">A short quiz on the grammar lines. Everything before the station it finds is marked as known.</T>
        <Button label="Take the placement quiz" kind="secondary" onPress={() => router.push('/placement')} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  edit: { position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  cell: { padding: 3, borderRadius: 28, borderWidth: 2 },
  colors: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center', marginTop: spacing.sm },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
});
