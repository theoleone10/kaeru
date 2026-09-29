import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing, TAP } from '@/theme/colors';

function timerUrl(action: 'start' | 'stop' | 'toggle', activity?: string): string {
  return Linking.createURL(`timer/${action}`, activity ? { queryParams: { activity } } : undefined);
}

function CopyRow({ label, url }: { label: string; url: string }) {
  const { colors } = useApp();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      accessibilityRole="button"
      accessibilityHint="Copies the link"
      style={({ pressed }) => [styles.copyRow, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body" style={{ fontWeight: '600' }}>
          {label}
        </T>
        <T variant="small" style={{ fontFamily: 'Menlo' }} numberOfLines={2}>
          {url}
        </T>
      </View>
      <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={colors.accent} />
    </Pressable>
  );
}

const STEPS = [
  'Open the Shortcuts app and tap + to make a new shortcut.',
  'Add the action “Open URLs” and paste one of the links below.',
  'Rename the shortcut (e.g. “Start immersion”). Siri can now run it by name.',
  'Optional: add it to your Home Screen, a widget, the Action button, or Back Tap (Settings → Accessibility → Touch → Back Tap).',
];

/** How to drive the timer from iOS Shortcuts (or any automation app that can open a URL). */
export default function ShortcutsHelp() {
  const { activities } = useTime();
  const visible = activities.filter((a) => !a.archived);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card style={{ gap: spacing.sm }}>
        <T variant="heading">Set up a shortcut</T>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <T variant="body" style={{ fontWeight: '700', width: 18 }}>
              {i + 1}.
            </T>
            <T variant="body" style={{ flex: 1 }}>
              {s}
            </T>
          </View>
        ))}
        <T variant="small">
          Running a shortcut opens the app for a moment to record the time, then you can switch straight back. Starting a new activity stops the one that was running.
        </T>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <T variant="heading">Links — tap to copy</T>
        {visible.map((a) => (
          <CopyRow key={`start-${a.id}`} label={`Start ${a.name}`} url={timerUrl('start', a.name)} />
        ))}
        <CopyRow label="Stop the timer" url={timerUrl('stop')} />
        {visible.map((a) => (
          <CopyRow key={`toggle-${a.id}`} label={`Start / stop ${a.name} (one button)`} url={timerUrl('toggle', a.name)} />
        ))}
        <T variant="small">
          Add a note with &amp;note=…, e.g. …?activity=Immersion&amp;note=Anime. An activity name that doesn&apos;t exist yet is created automatically.
        </T>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, minHeight: TAP },
});
