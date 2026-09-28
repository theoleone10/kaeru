import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exportBackup, pickBackup, restoreBackup } from '@/backup/exportImport';
import { Button, Card, T } from '@/components/ui';
import { curriculum } from '@/content/loader';
import { LEVELS } from '@/content/types';
import { getKv } from '@/db/repo';
import { formatMinuteOfDay } from '@/notifications/plan';
import { requestNotificationPermission } from '@/notifications/schedule';
import { useApp } from '@/state/AppProvider';
import { LIMITS, sanitizeSettings, type ThemePreference } from '@/state/settings';
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
        <T variant="heading">Backup</T>
        <T variant="small">Progress lives only on this phone. Export a backup file now and then (e.g. to Files, Drive or email).</T>
        <Button label="Export progress" kind="secondary" onPress={doExport} loading={busy === 'export'} />
        <Button label="Import from backup" kind="ghost" onPress={doImport} loading={busy === 'import'} />
      </Card>

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
