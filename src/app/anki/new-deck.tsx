import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { cleanDeckPath, createDeck } from '@/anki/notes';
import { BottomBar, Input } from '@/components/FormControls';
import { Button, Section, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';


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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, gap: 22 }} keyboardShouldPersistTaps="handled">
        <Section label="Name" style={{ gap: 10 }}>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Japanese::Verbs"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => cleanDeckPath(name) && create()}
            accessibilityLabel="Deck name"
          />
          <T variant="small">Use :: to put it inside another deck, like in Anki.</T>
        </Section>
      </ScrollView>
      <BottomBar>
        <Button label="Create deck" onPress={create} disabled={!cleanDeckPath(name)} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}
