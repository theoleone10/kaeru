import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Link, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountLabel, useAuth } from '@/auth/AuthProvider';
import { exportBackup, pickBackup, restoreBackup } from '@/backup/exportImport';
import { Button, Card, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { LEVELS } from '@/content/types';
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

function Stepper({ value, display, onChange, min, max, step = 1 }: { value: number; display?: string; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  const { colors } = useApp();
  const btn = (label: string, next: number, disabled: boolean) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === '−' ? 'Decrease' : 'Increase'}
      style={({ pressed }) => [styles.stepBtn, { backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}
    >
      <T variant="heading" color={colors.accent}>
        {label}
      </T>
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {btn('−', Math.max(min, value - step), value <= min)}
      <T variant="body" style={{ minWidth: 56, textAlign: 'center', fontWeight: '600' }}>
        {display ?? value}
      </T>
      {btn('+', Math.min(max, value + step), value >= max)}
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
      <Card style={styles.card}>
        <T variant="heading">Account</T>
        <T variant="small">You&apos;re using the app without an account, so progress is only on this phone. Sign in to back it up to your account and use it on another phone.</T>
        <Button label="Sign in or create account" onPress={() => router.push('/sign-in')} />
      </Card>
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
    <Card style={styles.card}>
      <T variant="heading">Account</T>
      <View style={{ gap: 2 }}>
        <T variant="body">{accountLabel(user)}</T>
        <T variant="small">{lastSync ? `Backed up ${new Date(lastSync).toLocaleString()}` : 'Not backed up yet'} · backs up automatically when you leave the app</T>
      </View>
      <Button label="Back up now" kind="secondary" onPress={syncNow} loading={busy === 'sync'} />
      <Button label="Sign out" kind="ghost" onPress={confirmSignOut} loading={busy === 'signout'} />
      <Button label="Delete account" kind="danger" onPress={confirmDelete} loading={busy === 'delete'} />
    </Card>
  );
}

function LinkRow({ label, icon, onPress, href }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; href?: '/legal/privacy' | '/legal/terms' }) {
  const { colors } = useApp();
  const row = (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <T variant="body" style={{ flex: 1 }}>
        {label}
      </T>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
  return href ? (
    <Link href={href} asChild>
      {row}
    </Link>
  ) : (
    row
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
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
      <AccountCard />

      <Card style={styles.card}>
        <T variant="heading">Lessons</T>
        <Row label="Batch size" detail="New grammar points per lesson">
          <Stepper value={settings.batchSize} {...LIMITS.batchSize} onChange={(v) => updateSettings({ batchSize: v })} />
        </Row>
        <Row label="Daily limit" detail="Maximum new points per day">
          <Stepper value={settings.dailyLessonLimit} {...LIMITS.dailyLessonLimit} onChange={(v) => updateSettings({ dailyLessonLimit: v })} />
        </Row>
      </Card>

      <Card style={styles.card}>
        <T variant="heading">Display & input</T>
        <Row label="Furigana" detail="Readings above kanji">
          <Switch value={settings.furigana} onValueChange={(v) => updateSettings({ furigana: v })} trackColor={switchColors} thumbColor="#FFFFFF" />
        </Row>
        <Row label="Romaji → kana" detail="Convert typed romaji in reviews. Japanese keyboard input is never changed.">
          <Switch value={settings.romajiInput} onValueChange={(v) => updateSettings({ romajiInput: v })} trackColor={switchColors} thumbColor="#FFFFFF" />
        </Row>
        <View style={{ gap: spacing.sm }}>
          <T variant="body">Appearance</T>
          <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
            {(['system', 'light', 'dark'] as ThemePreference[]).map((t) => {
              const active = settings.theme === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => updateSettings({ theme: t })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.segment, active && { backgroundColor: colors.surface }]}
                >
                  <T variant="body" color={active ? colors.accent : colors.textMuted} style={{ fontWeight: '600' }}>
                    {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <T variant="heading">Review reminders</T>
        <Row label="Notify when reviews are due">
          <Switch value={settings.notificationsEnabled} onValueChange={toggleNotifications} trackColor={switchColors} thumbColor="#FFFFFF" />
        </Row>
        {settings.notificationsEnabled && (
          <>
            <Row label="Quiet hours start">
              <TimeStepper value={settings.quietStart} onChange={(v) => updateSettings({ quietStart: v })} />
            </Row>
            <Row label="Quiet hours end">
              <TimeStepper value={settings.quietEnd} onChange={(v) => updateSettings({ quietEnd: v })} />
            </Row>
            <Row label="At most one reminder every">
              <Stepper
                value={settings.minReminderGapHours}
                display={`${settings.minReminderGapHours} h`}
                {...LIMITS.minReminderGapHours}
                onChange={(v) => updateSettings({ minReminderGapHours: v })}
              />
            </Row>
          </>
        )}
      </Card>

      <Card style={styles.card}>
        <T variant="heading">Backup file</T>
        <T variant="small">Export your progress as a file (e.g. to Files, Drive or email), or restore one. Useful without an account, or as an extra copy.</T>
        <Button label="Export progress" kind="secondary" onPress={doExport} loading={busy === 'export'} />
        <Button label="Import from backup" kind="ghost" onPress={doImport} loading={busy === 'import'} />
      </Card>

      <Card style={[styles.card, { gap: 0 }]}>
        <T variant="heading" style={{ marginBottom: spacing.sm }}>
          About
        </T>
        <LinkRow label="Privacy Policy" icon="shield-checkmark-outline" href="/legal/privacy" />
        <LinkRow label="Terms of Use" icon="document-text-outline" href="/legal/terms" />
        {supportEmail !== '' && (
          <LinkRow label="Contact support" icon="mail-outline" onPress={() => Linking.openURL(`mailto:${supportEmail}?subject=Grammar%20app%20support`)} />
        )}
      </Card>

      <T variant="small" style={{ textAlign: 'center' }}>
        Version {Constants.expoConfig?.version ?? '—'}
      </T>
      <T variant="small" style={{ textAlign: 'center' }}>
        {LEVELS.map((l) => `${l}: ${curriculum.filter((p) => p.level === l).length}`).join(' · ')}
      </T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepBtn: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
