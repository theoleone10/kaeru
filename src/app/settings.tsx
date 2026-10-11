import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountLabel, useAuth } from '@/auth/AuthProvider';
import { exportBackup, pickBackup, restoreBackup } from '@/backup/exportImport';
import { Logo } from '@/components/Mascot';
import { Button, Section, Stepper, T } from '@/components/ui';
import { getKv, setKv } from '@/db/repo';
import { supportEmail } from '@/legal/text';
import { formatMinuteOfDay } from '@/notifications/plan';
import { requestNotificationPermission } from '@/notifications/schedule';
import { useApp } from '@/state/AppProvider';
import { LIMITS, sanitizeSettings, type ThemePreference } from '@/state/settings';
import { uploadProgress } from '@/sync/cloud';
import { radius, spacing, TAP } from '@/theme/colors';

function Row({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body">{label}</T>
        {detail && <T variant="small">{detail}</T>}
      </View>
      {children}
    </View>
  );
}

const DAY_MIN = 24 * 60;
const wrap = (m: number) => ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;

function TimeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Wraps around midnight in 30-minute steps.
  return <Stepper value={1} display={formatMinuteOfDay(value)} min={0} max={2} onChange={(v) => onChange(wrap(value + (v - 1) * 30))} />;
}

function AccountCard() {
  const db = useSQLiteContext();
  const { configured, user, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState<'sync' | 'signout' | 'delete' | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);

  useEffect(() => {
    getKv(db, 'meta').then((m) => setLastSync(typeof m.lastCloudSync === 'number' ? m.lastCloudSync : null));
  }, [db, user, busy]);

  if (!configured) return null;

  if (!user) {
    return (
      <Section label="Account">
        <T variant="small">Progress is only on this phone.</T>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </Section>
    );
  }

  const run = async (which: 'sync' | 'signout' | 'delete', task: () => Promise<void>, failTitle: string) => {
    setBusy(which);
    try {
      await task();
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const syncNow = () => run('sync', () => uploadProgress(db, user.id), 'Backup failed');

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your progress stays on this phone. Sign in again any time to keep backing it up.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () =>
          run('signout', async () => {
            await uploadProgress(db, user.id).catch(() => undefined); // best effort: save latest progress first
            await signOut();
          }, 'Sign-out failed'),
      },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and the progress backed up to it. Progress on this phone is kept. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () =>
            run('delete', async () => {
              await deleteAccount();
              await setKv(db, 'meta', 'syncedUserId', null);
              await setKv(db, 'meta', 'lastCloudSync', null);
              Alert.alert('Account deleted', 'Your account and its backed-up progress have been deleted.');
            }, 'Could not delete account'),
        },
      ],
    );

  return (
    <Section label="Account">
      <View style={{ gap: 2 }}>
        <T variant="body" style={{ fontWeight: '800' }}>
          {accountLabel(user)}
        </T>
        <T variant="small">{lastSync ? `Backed up ${new Date(lastSync).toLocaleString()}` : 'Not backed up yet'}</T>
      </View>
      <LinkRow label="Back up now" icon="cloud-upload-outline" onPress={syncNow} busy={busy === 'sync'} />
      <LinkRow label="Sign out" icon="log-out-outline" onPress={confirmSignOut} busy={busy === 'signout'} />
      <LinkRow label="Delete account" icon="trash-outline" onPress={confirmDelete} busy={busy === 'delete'} danger />
    </Section>
  );
}

function LinkRow({
  label,
  icon,
  onPress,
  href,
  busy,
  danger,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  href?: '/legal/privacy' | '/legal/terms';
  busy?: boolean;
  danger?: boolean;
}) {
  const { colors } = useApp();
  const tint = danger ? colors.wrong : colors.textMuted;
  // A plain Pressable rather than <Link asChild>: on web the Link slot drops the function style, so the row lost its layout.
  return (
    <Pressable
      onPress={href ? () => router.push(href) : onPress}
      disabled={busy}
      accessibilityRole={href ? 'link' : 'button'}
      style={({ pressed }) => [styles.row, { opacity: pressed || busy ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <T variant="body" color={danger ? colors.wrong : colors.text} style={{ flex: 1 }}>
        {label}
      </T>
      {busy ? <ActivityIndicator color={colors.textMuted} /> : href && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, colors, refresh } = useApp();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const switchColors = { true: colors.accent, false: colors.border };

  const toggleNotifications = async (on: boolean) => {
    if (on && !(await requestNotificationPermission())) {
      Alert.alert('Notifications are off', 'Allow notifications for this app in your phone settings to get review reminders.');
      return;
    }
    await updateSettings({ notificationsEnabled: on });
  };

  const doExport = async () => {
    setBusy('export');
    try {
      await exportBackup(db);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    setBusy('import');
    try {
      const backup = await pickBackup();
      if (!backup) return;
      Alert.alert(
        'Replace all progress?',
        `This backup from ${new Date(backup.exported_at).toLocaleString()} has ${backup.cards.length} learned points and ${backup.review_logs.length} reviews. Your current progress will be replaced.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreBackup(db, backup);
                await updateSettings(sanitizeSettings(await getKv(db, 'settings')));
                await refresh();
                Alert.alert('Backup restored');
              } catch (e) {
                Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}>
      <AccountCard />

      <Section label="Daily plan">
        <Row label="New grammar per day">
          <Stepper value={settings.dailyNewGrammar} {...LIMITS.dailyNewGrammar} onChange={(v) => updateSettings({ dailyNewGrammar: v })} />
        </Row>
        <Row label="Daily time goal">
          <Stepper
            value={settings.dailyTimeGoalMin}
            display={settings.dailyTimeGoalMin === 0 ? 'Off' : `${settings.dailyTimeGoalMin}m`}
            {...LIMITS.dailyTimeGoalMin}
            step={15}
            onChange={(v) => updateSettings({ dailyTimeGoalMin: v })}
          />
        </Row>
      </Section>

      <Section label="Display & input">
        <Row label="Furigana">
          <Switch value={settings.furigana} onValueChange={(v) => updateSettings({ furigana: v })} trackColor={switchColors} thumbColor="#FFFFFF" />
        </Row>
        <Row label="Sound effects">
          <Switch value={settings.soundEffects} onValueChange={(v) => updateSettings({ soundEffects: v })} trackColor={switchColors} thumbColor="#FFFFFF" />
        </Row>
        <Row label="Type romaji as kana">
          <Switch value={settings.romajiInput} onValueChange={(v) => updateSettings({ romajiInput: v })} trackColor={switchColors} thumbColor="#FFFFFF" />
        </Row>
        <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
          {(['system', 'light', 'dark'] as ThemePreference[]).map((t) => {
            const active = settings.theme === t;
            return (
              <Pressable
                key={t}
                onPress={() => updateSettings({ theme: t })}
                accessibilityRole="button"
                accessibilityLabel={`${t} appearance`}
                accessibilityState={{ selected: active }}
                style={[styles.segment, active && { backgroundColor: colors.surface }]}
              >
                <T variant="body" color={active ? colors.accent : colors.textMuted} style={{ fontWeight: '600' }}>
                  {t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}
                </T>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section label="Flashcards">
        <Row label="New cards per day" detail="Each deck can change this">
          <Stepper value={settings.ankiNewPerDay} {...LIMITS.ankiNewPerDay} onChange={(v) => updateSettings({ ankiNewPerDay: v })} />
        </Row>
        <Row label="Max reviews per day">
          <Stepper value={settings.ankiMaxReviewsPerDay} min={50} max={2000} step={50} onChange={(v) => updateSettings({ ankiMaxReviewsPerDay: v })} />
        </Row>
      </Section>

      <Section label="Time tracking">
        <Row label="Time in-app study" detail="Logged as Study">
          <Switch value={settings.autoTrackStudy} onValueChange={(v) => updateSettings({ autoTrackStudy: v })} trackColor={switchColors} thumbColor="#FFFFFF" />
        </Row>
      </Section>

      <Section label="Reminders">
        <Row label="Remind me when reviews are due">
          <Switch value={settings.notificationsEnabled} onValueChange={toggleNotifications} trackColor={switchColors} thumbColor="#FFFFFF" />
        </Row>
        {settings.notificationsEnabled && (
          <>
            <Row label="Quiet from">
              <TimeStepper value={settings.quietStart} onChange={(v) => updateSettings({ quietStart: v })} />
            </Row>
            <Row label="Quiet until">
              <TimeStepper value={settings.quietEnd} onChange={(v) => updateSettings({ quietEnd: v })} />
            </Row>
            <Row label="At most every">
              <Stepper
                value={settings.minReminderGapHours}
                display={`${settings.minReminderGapHours} h`}
                {...LIMITS.minReminderGapHours}
                onChange={(v) => updateSettings({ minReminderGapHours: v })}
              />
            </Row>
          </>
        )}
      </Section>

      <Section label="Backup file">
        <LinkRow label="Export progress" icon="share-outline" onPress={doExport} busy={busy === 'export'} />
        <LinkRow label="Restore from a file" icon="download-outline" onPress={doImport} busy={busy === 'import'} />
      </Section>

      <Section label="About">
        <LinkRow label="Privacy Policy" icon="shield-checkmark-outline" href="/legal/privacy" />
        <LinkRow label="Terms of Use" icon="document-text-outline" href="/legal/terms" />
        {supportEmail !== '' && (
          <LinkRow label="Contact support" icon="mail-outline" onPress={() => Linking.openURL(`mailto:${supportEmail}?subject=Kaeru%20support`)} />
        )}
      </Section>

      <View style={{ alignItems: 'center', gap: spacing.xs, marginTop: spacing.md }}>
        <Logo size={56} />
        <T variant="heading" style={{ fontWeight: '900' }}>
          Kaeru かえる
        </T>
      </View>
      <T variant="small" style={{ textAlign: 'center' }}>
        Version {Constants.expoConfig?.version ?? '—'}
      </T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
