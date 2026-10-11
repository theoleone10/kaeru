import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button, Section, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { ACTIVITY_COLORS, type Activity } from '@/time/model';
import { archiveActivity, ensureActivity, renameActivity, setActivityColor } from '@/time/repo';
import { useTime } from '@/time/TimeProvider';
import { radius, spacing, TAP } from '@/theme/colors';

function ActivityRow({ activity }: { activity: Activity }) {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const { refresh } = useTime();
  const [name, setName] = useState(activity.name);

  const commitName = async () => {
    if (name.trim() === activity.name) return;
    try {
      await renameActivity(db, activity.id, name);
      await refresh();
    } catch (e) {
      Alert.alert('Could not rename', e instanceof Error ? e.message : String(e));
      setName(activity.name);
    }
  };

  return (
    <View style={[styles.item, { borderBottomColor: colors.border }]}>
      <TextInput
        value={name}
        onChangeText={setName}
        onEndEditing={commitName}
        returnKeyType="done"
        accessibilityLabel="Activity name"
        style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {ACTIVITY_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={async () => {
              await setActivityColor(db, activity.id, c);
              await refresh();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Colour ${c}`}
            accessibilityState={{ selected: c === activity.color }}
            style={[styles.swatch, { backgroundColor: c, borderColor: c === activity.color ? colors.text : 'transparent' }]}
          />
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        style={{ alignSelf: 'flex-start' }}
        onPress={() =>
          Alert.alert(`Hide ${activity.name}?`, 'Its history is kept, and starting it from a shortcut brings it back.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Hide',
              onPress: async () => {
                await archiveActivity(db, activity.id);
                await refresh();
              },
            },
          ])
        }
      >
        <T variant="small" color={colors.textMuted} style={{ fontWeight: '800' }}>
          Hide
        </T>
      </Pressable>
    </View>
  );
}

export default function Activities() {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const { activities, refresh } = useTime();
  const [newName, setNewName] = useState('');

  const add = async () => {
    if (!newName.trim()) return;
    await ensureActivity(db, newName);
    setNewName('');
    await refresh();
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
      {activities
        .filter((a) => !a.archived)
        .map((a) => (
          <ActivityRow key={a.id} activity={a} />
        ))}
      <Section label="New activity">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={add}
          placeholder="Name"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
        />
        <Button label="Add" onPress={add} disabled={!newName.trim()} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: TAP, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 17 },
  item: { gap: spacing.md, paddingBottom: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
