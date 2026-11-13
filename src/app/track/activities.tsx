import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Input } from '@/components/FormControls';
import { Icon } from '@/components/Icon';
import { Button, Rule, Section, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { ACTIVITY_COLORS, type Activity } from '@/time/model';
import { archiveActivity, ensureActivity, renameActivity, setActivityColor } from '@/time/repo';
import { useTime } from '@/time/TimeProvider';
import { spacing } from '@/theme/colors';

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
    <View style={styles.item}>
      <Input value={name} onChangeText={setName} onEndEditing={commitName} returnKeyType="done" accessibilityLabel="Activity name" />
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
            hitSlop={4}
            style={[styles.swatch, { backgroundColor: c }]}
          >
            {c === activity.color && <Icon name="check" size={18} color="#FFFFFF" strokeWidth={3} />}
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        hitSlop={12}
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
        <T variant="body" color={colors.accentInk} style={{ fontSize: 14, lineHeight: 20, fontWeight: '700' }}>
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

  const shown = activities.filter((a) => !a.archived);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View>
        {shown.map((a, i) => (
          <View key={a.id}>
            {i > 0 && <Rule />}
            <ActivityRow activity={a} />
          </View>
        ))}
      </View>
      <Section label="New activity" style={{ gap: 10 }}>
        <Input value={newName} onChangeText={setNewName} onSubmitEditing={add} placeholder="Name" accessibilityLabel="New activity name" />
        <Button label="Add" onPress={add} disabled={!newName.trim()} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.xl },
  item: { gap: spacing.md, paddingVertical: spacing.lg },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
