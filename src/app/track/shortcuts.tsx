import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Rule, Section, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { useTime } from '@/time/TimeProvider';
import { spacing, TAP } from '@/theme/colors';

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
      style={({ pressed }) => [styles.copyRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body" style={{ fontWeight: '700' }}>
          {label}
        </T>
        <T variant="small" color={colors.textFaint} style={{ fontSize: 12 }} numberOfLines={2}>
          {url}
        </T>
      </View>
      <Icon name={copied ? 'check' : 'copy'} size={20} color={copied ? colors.correct : colors.accentInk} strokeWidth={copied ? 2.6 : 2} />
    </Pressable>
  );
}

function Steps({ steps }: { steps: string[] }) {
  const { colors } = useApp();
  return steps.map((s, i) => (
    <View key={i} style={styles.step}>
      <View style={[styles.num, { backgroundColor: colors.accentSoft }]}>
        <T variant="small" color={colors.accentInk} style={{ fontWeight: '800' }} jp={false}>
          {i + 1}
        </T>
      </View>
      <T variant="body" color={colors.textMuted} style={{ flex: 1 }}>
        {s}
      </T>
    </View>
  ));
}

const ACTION_STEPS = [
  'Open the Shortcuts app, tap +, and search for “Kaeru”.',
  'Add Start Timer, Stop Timer, or Start or Stop Timer, and pick an activity.',
  'Optionally add it to your Home Screen or the Action button.',
];

const SIRI_PHRASES = ['“Start a timer in Kaeru”', '“Start Immersion in Kaeru”', '“Stop the timer in Kaeru”'];

const STEPS = [
  'Open the Shortcuts app and tap + to make a new shortcut.',
  'Add the action “Open URLs” and paste one of the links below.',
  'Rename it. Siri can now run it by name.',
];

/** How to drive the timer from iOS Shortcuts (or any automation app that can open a URL). */
export default function ShortcutsHelp() {
  const { colors } = useApp();
  const { activities } = useTime();
  const visible = activities.filter((a) => !a.archived);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: spacing.xxl, gap: 28 }}>
      {Platform.OS === 'ios' && (
        <Section label="Shortcuts app">
          <Steps steps={ACTION_STEPS} />
          <T variant="small">Or ask Siri: {SIRI_PHRASES.join(', ')}</T>
        </Section>
      )}

      <Section label={Platform.OS === 'ios' ? 'Or use a link' : 'Set up a shortcut'}>
        <Steps steps={STEPS} />
      </Section>

      <Section label="Links · tap to copy">
        <View>
          {[
            ...visible.map((a) => ({ key: `start-${a.id}`, label: `Start ${a.name}`, url: timerUrl('start', a.name) })),
            { key: 'stop', label: 'Stop the timer', url: timerUrl('stop') },
            ...visible.map((a) => ({ key: `toggle-${a.id}`, label: `Start / stop ${a.name} (one button)`, url: timerUrl('toggle', a.name) })),
          ].map((r, i) => (
            <View key={r.key}>
              {i > 0 && <Rule />}
              <CopyRow label={r.label} url={r.url} />
            </View>
          ))}
        </View>
        <T variant="small">Add a note with &amp;note=…</T>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: TAP },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
