import { readAnkiForBackup } from '@/anki/backup';
import { renderCard } from '@/anki/render';
import { listDecks } from '@/anki/repo';
import { addStarterDeck, rubyHtml, STARTER_DECK, STARTER_NOTETYPE, STARTER_WORDS, starterFields, starterWordsAdded } from '@/anki/starter';
import { hasMalformedMarkup, parseFurigana, plainText } from '@/content/furigana';
import { migrate } from '@/db/migrations';
import { openNodeDb } from './helpers/nodeDb';

const NOW = +new Date(2026, 9, 11, 12);
const KANJI = /[㐀-鿿々]/;
const KANA_ONLY = /^[぀-ヿー・ 〜]+$/;

describe('starter word list', () => {
  it('has 600 distinct words', () => {
    expect(STARTER_WORDS).toHaveLength(600);
    expect(new Set(STARTER_WORDS.map((w) => w[0])).size).toBe(600);
  });

  it.each(STARTER_WORDS.map((w) => [w[0], w] as const))('%s is well-formed', (_word, [word, reading, meaning, example, translation]) => {
    expect(meaning.trim()).not.toBe('');
    expect(translation.trim()).not.toBe('');
    // A reading for words with kanji (kana only), none for kana-only words.
    if (KANJI.test(word)) expect(reading).toMatch(/^[぀-ゟ /]+$/);
    else expect(reading).toBe('');
    // Furigana on every kanji in the example, and nothing malformed.
    expect(hasMalformedMarkup(example)).toBe(false);
    const tokens = parseFurigana(example);
    for (const t of tokens) {
      if (t.reading) expect(t.reading).toMatch(KANA_ONLY);
      else expect(t.text).not.toMatch(KANJI);
    }
    // The example uses the word (verbs and adjectives may be conjugated).
    const plain = plainText(tokens);
    const stem = word.endsWith('する') && word.length > 2 ? word.slice(0, -2) : word.length > 1 && 'うくぐすつぬぶむるい'.includes(word.slice(-1)) ? word.slice(0, -1) : word;
    expect(plain.includes(word) || plain.includes(stem)).toBe(true);
  });
});

describe('starter deck', () => {
  it('adds every word as a new card, in order, once', async () => {
    const db = openNodeDb();
    await migrate(db);
    expect(await addStarterDeck(db, NOW)).toBe(600);
    expect(await starterWordsAdded(db)).toBe(600);
    const deck = (await listDecks(db, NOW, { newPerDay: 10, reviewsPerDay: 100 })).find((d) => d.path === STARTER_DECK)!;
    expect(deck.total).toBe(600);
    expect(deck.newCount).toBe(10);
    const first = await db.getFirstAsync<{ fields: string }>(
      'SELECT n.fields FROM anki_cards c JOIN anki_notes n ON n.id = c.note_id ORDER BY c.new_position LIMIT 1',
    );
    expect(JSON.parse(first!.fields)[0]).toBe(STARTER_WORDS[0][0]);
    // Adding again only brings back deleted words.
    expect(await addStarterDeck(db, NOW)).toBe(0);
    await db.runAsync("DELETE FROM anki_cards WHERE note_id IN (SELECT id FROM anki_notes WHERE guid = 'kaeru-starter-5')");
    await db.runAsync("DELETE FROM anki_notes WHERE guid = 'kaeru-starter-5'");
    expect(await addStarterDeck(db, NOW)).toBe(1);
    // Backed up like any other deck.
    expect((await readAnkiForBackup(db)).anki_notes).toHaveLength(600);
  });

  it('renders the word with its reading, then the meaning and example', () => {
    const word = STARTER_WORDS.find((w) => w[0] === '食べる')!;
    const fields = starterFields(word);
    const ctx = { fields: Object.fromEntries(STARTER_NOTETYPE.fields.map((f, i) => [f, fields[i]])), tags: '', deck: STARTER_DECK, notetype: STARTER_NOTETYPE.name, cardName: 'Meaning', ord: 0, isCloze: false };
    const t = STARTER_NOTETYPE.templates[0];
    const card = renderCard(t.qfmt, t.afmt, ctx);
    expect(card.question).toContain('<ruby>食べる<rt>たべる</rt></ruby>');
    expect(card.answer).toContain('to eat');
    expect(card.answer).toContain('<ruby>朝<rt>あさ</rt></ruby>');
  });

  it('turns furigana markup into ruby', () => {
    expect(rubyHtml('{私|わたし}は<b>')).toBe('<ruby>私<rt>わたし</rt></ruby>は&lt;b&gt;');
  });
});
