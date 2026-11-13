import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { DateTimeField } from '@/components/DateTimeField';
import { BottomBar, Chip, Input } from '@/components/FormControls';
import { Button, Rule, Section, T } from '@/components/ui';
import { useApp, useNow } from '@/state/AppProvider';
import { entryDuration, formatDuration, type TimeEntry } from '@/time/model';
import { addEntry, deleteEntry, updateEntry } from '@/time/repo';
import { useTime } from '@/time/TimeProvider';
import { spacing } from '@/theme/colors';

const HOUR = 60 * 60 * 1000;

/** Add a past entry (no id) or edit / delete an existing one. */
export default function EntryEditor() {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const { activities, entries, refresh } = useTime();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing: TimeEntry | undefined = id ? entries.find((e) => e.id === Number(id)) : undefined;
  const visible = activities.filter((a) => !a.archived || a.id === existing?.activity_id);

  const [chosenActivity, setActivityId] = useState<number | null>(existing?.activity_id ?? null);
  const activityId = chosenActivity ?? visible[0]?.id ?? null;
  const [start, setStart] = useState(() => existing?.started_at ?? Date.now() - HOUR);
  const [end, setEnd] = useState<number | null>(() => (existing ? existing.ended_at : Date.now()));
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);

  const save = async () => {
    if (activityId == null) return;
    setBusy(true);
    try {
      if (existing) await updateEntry(db, existing.id, { activity_id: activityId, started_at: start, ended_at: end, note: note.trim() });
      else await addEntry(db, { activity_id: activityId, started_at: start, ended_at: end ?? Date.now(), note: note.trim() });
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete this entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(db, existing!.id);
          await refresh();
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen options={{ title: existing ? 'Edit entry' : 'Add entry' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section label="Activity" style={{ gap: 12 }}>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {visible.map((a) => (
              <Chip key={a.id} role="radio" label={a.name} color={a.color} active={a.id === activityId} onPress={() => setActivityId(a.id)} />
            ))}
          </View>
        </Section>

        <Section
          label="When"
          style={{ gap: 6 }}
          right={
            <T variant="small" style={{ fontSize: 14, fontWeight: '700' }}>
              {formatDuration(entryDuration({ started_at: start, ended_at: end }, now))}
            </T>
          }
        >
          <View>
            <Rule />
            <DateTimeField label="Start" value={start} onChange={setStart} />
            <Rule />
            {end != null ? (
              <DateTimeField label="End" value={end} onChange={setEnd} />
            ) : (
              <View style={styles.running}>
                <T variant="body" style={{ fontWeight: '700' }}>
                  End
                </T>
                <T variant="small">Still running</T>
              </View>
            )}
            <Rule />
          </View>
        </Section>

        <Section label="Note" style={{ gap: 10 }}>
          <Input value={note} onChangeText={setNote} placeholder="Optional" accessibilityLabel="Note" />
        </Section>
      </ScrollView>
      <BottomBar>
        <Button label="Save" onPress={save} loading={busy} disabled={activityId == null} />
        {existing && <Button label="Delete entry" kind="danger" onPress={remove} />}
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: spacing.xl, gap: 28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  running: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 54 },
});
