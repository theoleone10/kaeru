import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountLabel, useAuth } from '@/auth/AuthProvider';
import { exportBackup, pickBackup, restoreBackup } from '@/backup/exportImport';
import { backupCounts, describeCounts } from '@/backup/format';
import type { IconName } from '@/components/Icon';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Mascot';
import { Button, IconTile, Section, Stepper, T } from '@/components/ui';
import { getKv, setKv } from '@/db/repo';
import { supportEmail } from '@/legal/text';
import { formatMinuteOfDay } from '@/notifications/plan';
import { requestNotificationPermission } from '@/notifications/schedule';
import { graderAvailable } from '@/sentence/grader';
import { useApp } from '@/state/AppProvider';
import { LIMITS, sanitizeSettings, type ThemePreference } from '@/state/settings';
import { ANKI_MEDIA_NOTE, uploadProgress } from '@/sync/cloud';
import { useTime } from '@/time/TimeProvider';
import { spacing } from '@/theme/colors';

/** A settings row: a rule above, the label (and a quiet detail) on the left, a control on the right. */
function Row({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  const { colors } = useApp();
  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="body" style={{ fontWeight: '700' }}>
          {label}
        </T>
        {detail && <T variant="small">{detail}</T>}
      </View>
      {children}
    </View>
  );
}

/** A labelled group of rows, closed off with a rule under the last one. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useApp();
  return (
    <Section label={label} style={{ gap: 6 }}>
      <View style={{ borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border }}>{children}</View>
    </Section>
  );
}

/** A switch in the app's colours. */
function Toggle({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  const { colors } = useApp();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={label}
      trackColor={{ true: colors.correct, false: colors.borderStrong }}
      thumbColor="#FFFFFF"
      {...WEB_THUMB}
      ios_backgroundColor={colors.borderStrong}
    />
  );
}

const DAY_MIN = 24 * 60;
const wrap = (m: number) => ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;

function TimeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Wraps around midnight in 30-minute steps.
  return <Stepper value={1} display={formatMinuteOfDay(value)} min={0} max={2} onChange={(v) => onChange(wrap(value + (v - 1) * 30))} />;
}

/** Account, cloud backup, backup files, sign out and delete — together at the bottom of Settings. */
function AccountCard({ fileRows }: { fileRows: React.ReactNode }) {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const { configured, user, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState<'sync' | 'signout' | 'delete' | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);

  useEffect(() => {
    getKv(db, 'meta').then((m) => setLastSync(typeof m.lastCloudSync === 'number' ? m.lastCloudSync : null));
  }, [db, user, busy]);

  if (!configured || !user) {
    return (
      <Section label="Account & backup" style={{ gap: 6 }}>
        {configured && (
          <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
            <T variant="muted">Progress is only on this phone. Sign in to back it up.</T>
            <Button label="Sign in" onPress={() => router.push('/sign-in')} />
          </View>
        )}
        <View style={{ borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border }}>{fileRows}</View>
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

  const syncNow = () => run('sync', async () => {
    await uploadProgress(db, user.id, { force: true });
  }, 'Backup failed');

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your progress stays on this phone. Log in again any time to keep backing it up.', [
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
      `This permanently deletes your account and the progress backed up to it. Progress on this phone is kept. This cannot be undone.${user.app_metadata?.provider === 'apple' ? ' Apple will ask you to confirm.' : ''}`,
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
    <Group label="Account & backup">
      <View style={[styles.row, { borderTopColor: colors.border }]}>
        <IconTile icon="person" color={colors.accentInk} soft={colors.accentSoft} size={34} />
        <View style={{ flex: 1, gap: 1 }}>
          <T variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
            {accountLabel(user)}
          </T>
          <T variant="small">{lastSync ? `Backed up ${new Date(lastSync).toLocaleString()}` : 'Not backed up yet'}</T>
        </View>
      </View>
      <LinkRow label="Back up now" icon="cloudUp" onPress={syncNow} busy={busy === 'sync'} />
      {fileRows}
      <LinkRow label="Sign out" icon="logout" onPress={confirmSignOut} busy={busy === 'signout'} />
      <LinkRow label="Delete account" icon="trash" onPress={confirmDelete} busy={busy === 'delete'} danger />
    </Group>
  );
}

function LinkRow({
  label,
  icon,
  onPress,
  href,
  busy,
  danger,
  chevron,
}: {
  label: string;
  /** A small soft icon tile on the left (account rows). */
  icon?: IconName;
  onPress?: () => void;
  href?: '/legal/privacy' | '/legal/terms';
  busy?: boolean;
  danger?: boolean;
  chevron?: boolean;
}) {
  const { colors } = useApp();
  const tile =
    icon === 'cloudUp'
      ? { color: colors.accentInk, soft: colors.accentSoft }
      : icon === 'upload' || icon === 'download'
        ? { color: colors.blueText, soft: colors.blueSoft }
        : danger
          ? { color: colors.wrongText, soft: colors.wrongSoft }
          : { color: colors.textMuted, soft: colors.surfaceAlt };
  // A plain Pressable rather than <Link asChild>: on web the Link slot drops the function style, so the row lost its layout.
  return (
    <Pressable
      onPress={href ? () => router.push(href) : onPress}
      disabled={busy}
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { borderTopColor: colors.border, opacity: pressed || busy ? 0.6 : 1 }]}
    >
      {icon && <IconTile icon={icon} color={tile.color} soft={tile.soft} size={34} filled={false} />}
      <T variant="body" color={danger ? colors.wrongText : colors.text} style={{ flex: 1, fontWeight: '700' }}>
        {label}
      </T>
      {busy ? <ActivityIndicator color={colors.textMuted} /> : (href || chevron) && <Icon name="chevronRight" size={18} color={colors.textFaint} strokeWidth={2.4} />}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, colors, refresh } = useApp();
  const { refresh: refreshTime } = useTime();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const toggleNotifications = async (on: boolean) => {
    if (on && !(await requestNotificationPermission())) {
      Alert.alert('Notifications are off', 'Allow notifications for Kaeru in your phone settings to get reminders.');
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
        `This backup from ${new Date(backup.exported_at).toLocaleString()} has ${describeCounts(backupCounts(backup))}. Your current progress will be replaced.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreBackup(db, backup);
                await updateSettings(sanitizeSettings(await getKv(db, 'settings')));
                await Promise.all([refresh(), refreshTime()]);
                Alert.alert('Backup restored', backupCounts(backup).flashcards > 0 ? ANKI_MEDIA_NOTE : undefined);
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
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: spacing.md, gap: 22, paddingBottom: insets.bottom + spacing.xxl }}>
      <Group label="Daily plan">
        <Row label="New grammar per day">
          <Stepper value={settings.dailyNewGrammar} {...LIMITS.dailyNewGrammar} onChange={(v) => updateSettings({ dailyNewGrammar: v })} />
        </Row>
        <Row label="Max grammar reviews per day">
          <Stepper
            value={settings.grammarMaxReviewsPerDay}
            {...LIMITS.grammarMaxReviewsPerDay}
            step={10}
            onChange={(v) => updateSettings({ grammarMaxReviewsPerDay: v })}
          />
        </Row>
        <LinkRow label="Edit time goals" onPress={() => router.push('/track/goals')} chevron />
      </Group>

      {graderAvailable() && (
        <Group label="Beta features">
          <Row label="Sentence practice" detail="Write your own sentence after each lesson. Checked on your phone.">
            <Toggle value={settings.sentencePracticeEnabled} onValueChange={(v) => updateSettings({ sentencePracticeEnabled: v })} label="Sentence practice" />
          </Row>
          {settings.sentencePracticeEnabled && (
            <Row label="Download checker on Wi-Fi">
              <Toggle value={settings.graderAutoDownload} onValueChange={(v) => updateSettings({ graderAutoDownload: v })} label="Download checker on Wi-Fi" />
            </Row>
          )}
        </Group>
      )}

      <Group label="Display & input">
        <Row label="Furigana">
          <Toggle value={settings.furigana} onValueChange={(v) => updateSettings({ furigana: v })} label="Furigana" />
        </Row>
        <Row label="Sound effects">
          <Toggle value={settings.soundEffects} onValueChange={(v) => updateSettings({ soundEffects: v })} label="Sound effects" />
        </Row>
        <Row label="Type romaji as kana">
          <Toggle value={settings.romajiInput} onValueChange={(v) => updateSettings({ romajiInput: v })} label="Type romaji as kana" />
        </Row>
        <Row label="Theme">
          <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="radiogroup">
            {(['system', 'light', 'dark'] as ThemePreference[]).map((t) => {
              const active = settings.theme === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => updateSettings({ theme: t })}
                  accessibilityRole="radio"
                  accessibilityLabel={`${t} appearance`}
                  accessibilityState={{ selected: active, checked: active }}
                  style={[styles.segment, active && [styles.segmentOn, { backgroundColor: colors.surface }]]}
                >
                  <T variant="small" color={active ? colors.accentInk : colors.textMuted} style={{ fontSize: 14, lineHeight: 20, fontWeight: active ? '800' : '700' }}>
                    {t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </Row>
      </Group>

      <Group label="Flashcards">
        <Row label="New cards per day" detail="Each deck can change this">
          <Stepper value={settings.ankiNewPerDay} {...LIMITS.ankiNewPerDay} onChange={(v) => updateSettings({ ankiNewPerDay: v })} />
        </Row>
        <Row label="Max reviews per day">
          <Stepper value={settings.ankiMaxReviewsPerDay} min={50} max={2000} step={50} onChange={(v) => updateSettings({ ankiMaxReviewsPerDay: v })} />
        </Row>
        <Row label="Desired retention" detail="Higher: shorter gaps between reviews, more of them">
          <Stepper
            value={settings.ankiRetention}
            display={`${settings.ankiRetention}%`}
            {...LIMITS.ankiRetention}
            onChange={(v) => updateSettings({ ankiRetention: v })}
          />
        </Row>
      </Group>

      <Group label="Time tracking">
        <Row label="Track time in Kaeru" detail="Counted as Study on Progress">
          <Toggle value={settings.autoTrackStudy} onValueChange={(v) => updateSettings({ autoTrackStudy: v })} label="Track time in Kaeru" />
        </Row>
      </Group>

      <Group label="Notifications">
        <Row label="Notifications" detail="Timed around when you usually study">
          <Toggle value={settings.notificationsEnabled} onValueChange={toggleNotifications} label="Notifications" />
        </Row>
        {settings.notificationsEnabled && (
          <>
            <Row label="Reviews ready" detail="When grammar or flashcards come due">
              <Toggle value={settings.notifyReviews} onValueChange={(v) => updateSettings({ notifyReviews: v })} label="Reviews ready" />
            </Row>
            <Row label="Streak saver" detail="An evening nudge if no task is done yet today">
              <Toggle value={settings.notifyStreak} onValueChange={(v) => updateSettings({ notifyStreak: v })} label="Streak saver" />
            </Row>
            <Row label="Daily plan" detail="What's on today, before you usually start">
              <Toggle value={settings.notifyPlan} onValueChange={(v) => updateSettings({ notifyPlan: v })} label="Daily plan" />
            </Row>
            <Row label="Wins & milestones" detail="Goals reached, streaks, finished levels, long timers">
              <Toggle value={settings.notifyWins} onValueChange={(v) => updateSettings({ notifyWins: v })} label="Wins & milestones" />
            </Row>
            <Row label="Quiet from">
              <TimeStepper value={settings.quietStart} onChange={(v) => updateSettings({ quietStart: v })} />
            </Row>
            <Row label="Quiet until">
              <TimeStepper value={settings.quietEnd} onChange={(v) => updateSettings({ quietEnd: v })} />
            </Row>
            {settings.notifyReviews && (
              <Row label="Review reminders at most every">
                <Stepper
                  value={settings.minReminderGapHours}
                  display={`${settings.minReminderGapHours} h`}
                  {...LIMITS.minReminderGapHours}
                  onChange={(v) => updateSettings({ minReminderGapHours: v })}
                />
              </Row>
            )}
          </>
        )}
      </Group>

      <Group label="About">
        <LinkRow label="Privacy Policy" href="/legal/privacy" />
        <LinkRow label="Terms of Use" href="/legal/terms" />
        {supportEmail !== '' && (
          <LinkRow label="Contact support" chevron onPress={() => Linking.openURL(`mailto:${supportEmail}?subject=Kaeru%20support`)} />
        )}
      </Group>

      <AccountCard
        fileRows={
          <>
            <LinkRow label="Export progress to a file" icon="upload" onPress={doExport} busy={busy === 'export'} />
            <LinkRow label="Restore from a file" icon="download" onPress={doImport} busy={busy === 'import'} />
          </>
        }
      />

      <View style={{ alignItems: 'center', gap: spacing.xs, marginTop: spacing.md }}>
        <Logo size={56} />
        <T variant="heading" jp>
          Kaeru かえる
        </T>
      </View>
      <T variant="small" color={colors.textFaint} style={{ textAlign: 'center', marginTop: -spacing.md }}>
        Version {Constants.expoConfig?.version ?? '—'}
      </T>
    </ScrollView>
  );
}

/** react-native-web's Switch takes the on-state thumb colour separately. */
const WEB_THUMB = { activeThumbColor: '#FFFFFF' } as object;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 54, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segment: { minHeight: 36, paddingHorizontal: 14, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { shadowColor: '#1B1F33', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});
