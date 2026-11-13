import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  addNote,
  BUILTIN_NOTETYPES,
  cleanDeckPath,
  deckPaths,
  deleteNote,
  editableToField,
  EmptyNoteError,
  fieldToEditable,
  getNote,
  updateNote,
  type BuiltinKind,
  type EditableNote,
} from '@/anki/notes';
import { BottomBar, Chip, Input } from '@/components/FormControls';
import { Icon } from '@/components/Icon';
import { Button, Section, T } from '@/components/ui';
import { getKv, setKv } from '@/db/repo';
import { useApp } from '@/state/AppProvider';
import { spacing } from '@/theme/colors';

const KINDS: BuiltinKind[] = ['basic', 'reversed', 'vocab'];

type Field = { text: string; raw: boolean };

/**
 * Add cards to a deck (?deck=path) with one of Kaeru's note types, or edit a card's note
 * (?note=id). After adding, the fields clear so the next card can go straight in.
 */
export default function NoteEditor() {
  const db = useSQLiteContext();
  const { colors } = useApp();
  const params = useLocalSearchParams<{ deck?: string; note?: string }>();
  const noteId = params.note ? Number(params.note) : null;

  const [editing, setEditing] = useState<EditableNote | null>(null);
  const [kind, setKind] = useState<BuiltinKind>('basic');
  const [deck, setDeck] = useState(params.deck ? decodeURIComponent(params.deck) : '');
  const [decks, setDecks] = useState<string[]>([]);
  const [newDeck, setNewDeck] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const firstInput = useRef<TextInput>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (noteId !== null) {
        const note = await getNote(db, noteId);
        if (!alive) return;
        if (!note) {
          router.back();
          return;
        }
        setEditing(note);
        setFields(note.values.map(fieldToEditable));
        return;
      }
      const [paths, meta] = await Promise.all([deckPaths(db), getKv(db, 'meta')]);
      if (!alive) return;
      setDecks(paths);
      const lastKind = meta.anki_add_kind as BuiltinKind | undefined;
      const k = lastKind && KINDS.includes(lastKind) ? lastKind : 'basic';
      setKind(k);
      setFields(BUILTIN_NOTETYPES[k].fields.map(() => ({ text: '', raw: false })));
      setDeck((d) => d || (typeof meta.anki_add_deck === 'string' && paths.includes(meta.anki_add_deck) ? meta.anki_add_deck : (paths[0] ?? '')));
      if (paths.length === 0) setNewDeck('');
    })();
    return () => {
      alive = false;
    };
  }, [db, noteId]);

  const names = editing ? editing.notetype.fields : BUILTIN_NOTETYPES[kind].fields;
  const hints: Record<string, string> = editing ? {} : BUILTIN_NOTETYPES[kind].hint;
  const targetDeck = cleanDeckPath(newDeck ?? deck);

  const pickKind = (k: BuiltinKind) => {
    // Keep what's typed where the field names match (Front/Back between Basic types).
    const prev = Object.fromEntries(BUILTIN_NOTETYPES[kind].fields.map((n, i) => [n, fields[i]]));
    setKind(k);
    setFields(BUILTIN_NOTETYPES[k].fields.map((n) => prev[n] ?? { text: '', raw: false }));
  };

  const setField = (i: number, text: string) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, text } : f)));

  const save = async () => {
    const values = fields.map(editableToField);
    setBusy(true);
    try {
      if (editing) {
        const more = await updateNote(db, editing.id, values);
        if (more > 0) Alert.alert('Saved', `Added ${more === 1 ? 'a new card' : `${more} new cards`} for the fields you filled in.`);
        router.back();
        return;
      }
      if (!targetDeck) throw new Error('Pick a deck or name a new one.');
      const made = await addNote(db, kind, targetDeck, values);
      await setKv(db, 'meta', 'anki_add_kind', kind);
      await setKv(db, 'meta', 'anki_add_deck', targetDeck);
      if (newDeck !== null) {
        setDecks(await deckPaths(db));
        setDeck(targetDeck);
        setNewDeck(null);
      }
      setFields(fields.map(() => ({ text: '', raw: false })));
      setAdded(`Added ${made === 1 ? '1 card' : `${made} cards`} to ${targetDeck}`);
      firstInput.current?.focus();
    } catch (e) {
      Alert.alert(e instanceof EmptyNoteError ? 'Nothing to study' : 'Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!editing) return;
    Alert.alert('Delete this note?', `This deletes ${editing.cards === 1 ? 'its card' : `its ${editing.cards} cards`} and your progress on ${editing.cards === 1 ? 'it' : 'them'}. This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(db, editing.id);
          router.back();
        },
      },
    ]);
  };

  const canSave = fields.some((f) => f.text.trim()) && (editing !== null || targetDeck !== '');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen options={{ title: editing ? 'Edit card' : 'Add cards' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {editing ? (
          <T variant="small">
            {editing.notetype.name} · {editing.deck.replaceAll('::', ' › ')}
          </T>
        ) : (
          <>
            <Section label="Type" style={styles.section}>
              <View style={styles.chips}>
                {KINDS.map((k) => (
                  <Chip key={k} label={BUILTIN_NOTETYPES[k].label} active={kind === k} onPress={() => pickKind(k)} />
                ))}
              </View>
            </Section>
            <Section label="Deck" style={styles.section}>
              <View style={styles.chips}>
                {decks.map((d) => (
                  <Chip
                    key={d}
                    label={d.replaceAll('::', ' › ')}
                    active={newDeck === null && deck === d}
                    onPress={() => {
                      setDeck(d);
                      setNewDeck(null);
                    }}
                  />
                ))}
                <Chip label="New deck" icon="plus" active={newDeck !== null} onPress={() => setNewDeck(newDeck ?? '')} />
              </View>
              {newDeck !== null && (
                <Input
                  value={newDeck}
                  onChangeText={setNewDeck}
                  placeholder="Deck name (use :: for a subdeck)"
                  autoFocus={decks.length > 0}
                  accessibilityLabel="New deck name"
                />
              )}
            </Section>
          </>
        )}

        <Section label="Fields" style={{ gap: 14 }}>
          {names.map((name, i) => (
            <View key={`${kind}-${name}`} style={{ gap: 6 }}>
              <View style={styles.fieldHead}>
                <T variant="small" style={{ fontWeight: '700' }}>
                  {name}
                </T>
                {fields[i]?.raw && <T variant="small" color={colors.textFaint}>HTML</T>}
              </View>
              <Input
                ref={i === 0 ? firstInput : undefined}
                value={fields[i]?.text ?? ''}
                onChangeText={(t) => setField(i, t)}
                placeholder={hints[name] ?? ''}
                multiline
                big
                autoCapitalize="none"
                autoFocus={i === 0 && editing === null && decks.length > 0}
                accessibilityLabel={name}
                style={styles.multiline}
              />
            </View>
          ))}
        </Section>

        {added && !editing && (
          <View style={styles.added}>
            <Icon name="check" size={20} color={colors.correct} strokeWidth={2.6} />
            <T variant="small" color={colors.correctText} style={{ fontWeight: '700', flex: 1 }}>
              {added}
            </T>
          </View>
        )}
      </ScrollView>
      <BottomBar>
        <Button label={editing ? 'Save' : 'Add card'} onPress={save} loading={busy} disabled={!canSave} />
        {editing && <Button label="Delete note" kind="danger" onPress={confirmDelete} />}
        {!editing && added && <Button label="Done" kind="ghost" onPress={() => router.back()} />}
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: spacing.xl, gap: 22 },
  section: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  multiline: { paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between' },
  added: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
