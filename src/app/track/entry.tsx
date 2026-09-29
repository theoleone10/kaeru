import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { DateTimeField } from '@/components/DateTimeField';
import { Button, Card, T } from '@/components/ui';
import { useApp, useNow } from '@/state/AppProvider';
import { entryDuration, formatDuration, type TimeEntry } from '@/time/model';
import { addEntry, deleteEntry, updateEntry } from '@/time/repo';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing, TAP } from '@/theme/colors';

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
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? 'Edit entry' : 'Add entry' }} />
      <Card style={{ gap: spacing.md }}>
        <T variant="heading">Activity</T>
        <View style={styles.chips}>
          {visible.map((a) => {
            const active = a.id === activityId;
            return (
              <Pressable
                key={a.id}
                onPress={() => setActivityId(a.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, { borderColor: a.color, backgroundColor: active ? a.color : colors.surface }]}
              >
                <T variant="body" color={active ? '#FFFFFF' : colors.text} style={{ fontWeight: '600' }}>
                  {a.name}
                </T>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <DateTimeField label="Start" value={start} onChange={setStart} />
        {end != null ? <DateTimeField label="End" value={end} onChange={setEnd} /> : <T variant="small">Still running — stop it from the Progress tab.</T>}
        <T variant="small">Duration: {formatDuration(entryDuration({ started_at: start, ended_at: end }, now))}</T>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <T variant="heading">Note</T>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Anime, podcast, textbook chapter 3"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
        />
      </Card>

      <Button label="Save" onPress={save} loading={busy} disabled={activityId == null} />
      {existing && <Button label="Delete entry" kind="danger" onPress={remove} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: TAP, paddingHorizontal: spacing.lg, borderRadius: 999, borderWidth: 2, justifyContent: 'center' },
  input: { minHeight: TAP, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 17 },
});
