import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';
import { cleanDeckPath, createDeck } from '@/anki/notes';
import { Button, Section, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { radius, spacing, TAP } from '@/theme/colors';

/** Start an empty deck, then go straight to adding cards to it. */
export default function NewDeck() {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const [name, setName] = useState('');

  const create = async () => {
    try {
      await createDeck(db, name);
      router.replace({ pathname: '/anki/note', params: { deck: encodeURIComponent(cleanDeckPath(name)) } });
    } catch (e) {
      Alert.alert('Could not create the deck', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
      <Section label="Name">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Japanese::Verbs"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => cleanDeckPath(name) && create()}
          accessibilityLabel="Deck name"
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
        />
        <T variant="small">Use :: to put it inside another deck, like in Anki.</T>
      </Section>
      <Button label="Create deck" onPress={create} disabled={!cleanDeckPath(name)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: TAP, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 17 },
});
