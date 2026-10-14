/// <reference types="node" />
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readCollection, type AnkiCollection } from '@/anki/collection';
import { unpackPackage } from '@/anki/package';
import { cardContent, cardDocument, cloze, showScript, clozeNumbers, furigana, kana, kanji, renderCard, stripHtml, type RenderContext } from '@/anki/render';
import { convertAnkiCard, convertRevlog, difficultyFromEase, formatInterval, previewGrades, createAnkiScheduler, Rating, State } from '@/anki/schedule';
import { answerCard, ankiToday, buildStudyQueue, deleteDeck, getDeckLimits, getStudyCard, interleave, listDecks, setDeckLimits, takeWithinLimits, undoAnswer } from '@/anki/repo';
import { saveCollection } from '@/anki/store';
import { migrate } from '@/db/migrations';
import { openNodeDb } from './helpers/nodeDb';

const DAY = 24 * 60 * 60 * 1000;
const CRT = 1767225600;
const NOW = (CRT + 95 * 86400) * 1000;

async function unpackFixture(name: string) {
  const bytes = new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));
  let pos = 0;
  const read = (n: number) => {
    const chunk = bytes.subarray(pos, pos + n);
    pos += chunk.length;
    return chunk;
  };
  const entries = new Map<string, Uint8Array>();
  const result = await unpackPackage(read, bytes.length, { entry: (n, b) => void entries.set(n, b) });
  return { ...result, entries };
}

async function loadCollection(name: string): Promise<{ col: AnkiCollection; media: Map<string, Uint8Array> }> {
  const { collection, mediaMap, entries } = await unpackFixture(name);
  const dir = mkdtempSync(join(tmpdir(), 'anki-'));
  const path = join(dir, 'c.db');
  writeFileSync(path, entries.get(collection)!);
  const db = openNodeDb(path);
  const col = await readCollection(db);
  await db.closeAsync();
  const media = new Map<string, Uint8Array>();
  for (const [zipName, realName] of mediaMap) media.set(realName, entries.get(zipName)!);
  return { col, media };
}

describe.each(['legacy.apkg', 'modern.apkg'])('reading %s', (file) => {
  let col: AnkiCollection;
  let media: Map<string, Uint8Array>;
  beforeAll(async () => {
    ({ col, media } = await loadCollection(file));
  });

  it('picks the real collection and maps media names', async () => {
    const { collection } = await unpackFixture(file);
    expect(collection).toBe(file === 'modern.apkg' ? 'collection.anki21b' : 'collection.anki2');
    expect(new TextDecoder().decode(media.get('neko.mp3'))).toBe('ID3-fake-audio');
  });

  it('reads note types, fields and templates', () => {
    const basic = col.notetypes.find((n) => n.name.startsWith('Basic'))!;
    expect(basic.fields).toEqual(['Front', 'Back']);
    expect(basic.templates.map((t) => t.qfmt)).toEqual(['{{Front}}', '{{Back}}']);
    expect(basic.isCloze).toBe(false);
    expect(basic.css).toContain('font-size: 30px');
    expect(col.notetypes.find((n) => n.name === 'Cloze')!.isCloze).toBe(true);
  });

  it('reads decks with :: paths, notes, cards and history', () => {
    expect(col.crt).toBe(CRT);
    expect(col.decks.map((d) => d.name).sort()).toEqual(['Default', 'Japanese::Grammar', 'Japanese::Vocab']);
    expect(col.notes.find((n) => n.guid === 'g-basic-1')!.fields).toEqual(['猫[ねこ]', 'cat [sound:neko.mp3]']);
    expect(col.cards).toHaveLength(4);
    expect(col.revlog).toHaveLength(4);
  });
});

describe('saving an import', () => {
  it('stores decks, notes, cards and history, and re-importing updates instead of duplicating', async () => {
    const db = openNodeDb();
    await migrate(db);
    const { col } = await loadCollection('modern.apkg');

    const first = await saveCollection(db, col, 'modern.apkg', NOW);
    expect(first).toMatchObject({ decks: 2, notes: 2, cards: 4, updated: 0, reviews: 3 });

    const decks = await db.getAllAsync<{ name: string }>('SELECT name FROM anki_decks ORDER BY name');
    expect(decks.map((d) => d.name)).toEqual(['Japanese::Grammar', 'Japanese::Vocab']);

    const review = await db.getFirstAsync<{ state: number; due: number; scheduled_days: number; stability: number }>(
      `SELECT c.state, c.due, c.scheduled_days, c.stability FROM anki_cards c JOIN anki_notes n ON n.id = c.note_id WHERE n.guid = 'g-basic-1' AND c.ord = 0`,
    );
    expect(review).toEqual({ state: State.Review, due: (CRT + 100 * 86400) * 1000, scheduled_days: 10, stability: 10 });

    const suspended = await db.getFirstAsync<{ suspended: number; stability: number; difficulty: number }>(
      `SELECT c.suspended, c.stability, c.difficulty FROM anki_cards c JOIN anki_notes n ON n.id = c.note_id WHERE n.guid = 'g-cloze-1' AND c.ord = 0`,
    );
    expect(suspended).toEqual({ suspended: 1, stability: 4.5, difficulty: 7.2 });

    // Same file again: nothing new, no duplicate history.
    const again = await saveCollection(db, col, 'modern.apkg', NOW);
    expect(again).toMatchObject({ cards: 0, updated: 0, reviews: 0 });
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_cards'))!.n).toBe(4);
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_revlog'))!.n).toBe(3);

    // A newer export (reviewed more in Anki) replaces the app's older progress.
    const newer: AnkiCollection = { ...col, cards: col.cards.map((c) => (c.id === 11 ? { ...c, due: 130, ivl: 30, reps: 6 } : c)) };
    const third = await saveCollection(db, newer, 'modern.apkg', NOW);
    expect(third.updated).toBe(1);
  });
});

describe('convertAnkiCard', () => {
  const base = { id: 1, nid: 1, did: 1, ord: 0, type: 2, queue: 2, due: 100, ivl: 10, factor: 2500, reps: 3, lapses: 0, odue: 0, odid: 0, data: '' };

  it('turns a review card into an FSRS review card', () => {
    const s = convertAnkiCard(base, CRT, NOW);
    expect(s.state).toBe(State.Review);
    expect(s.due).toBe((CRT + 100 * 86400) * 1000);
    expect(s.last_review).toBe((CRT + 90 * 86400) * 1000);
    expect(s.stability).toBe(10);
    expect(s.difficulty).toBeCloseTo(difficultyFromEase(2500));
  });

  it('uses the real deck and due date for cards sitting in a filtered deck', () => {
    const s = convertAnkiCard({ ...base, did: 999, due: -100000, odid: 5, odue: 120 }, CRT, NOW);
    expect(s.due).toBe((CRT + 120 * 86400) * 1000);
  });

  it('prefers Anki’s own FSRS memory state', () => {
    const s = convertAnkiCard({ ...base, data: '{"s":42.5,"d":3.1}' }, CRT, NOW);
    expect(s.stability).toBe(42.5);
    expect(s.difficulty).toBe(3.1);
  });

  it('keeps new-card order and restarts cards stuck mid-way through first learning', () => {
    expect(convertAnkiCard({ ...base, type: 0, queue: 0, due: 37 }, CRT, NOW)).toMatchObject({ state: State.New, new_position: 37 });
    expect(convertAnkiCard({ ...base, type: 1, queue: 1, due: CRT + 10 }, CRT, NOW).state).toBe(State.New);
  });

  it('maps ease to difficulty monotonically', () => {
    expect(difficultyFromEase(1300)).toBe(10);
    expect(difficultyFromEase(3000)).toBe(3);
    expect(difficultyFromEase(2500)).toBeGreaterThan(difficultyFromEase(2800));
  });
});

describe('convertRevlog', () => {
  it('keeps answers and drops manual reschedules', () => {
    expect(convertRevlog({ id: 5, cid: 1, ease: 3, ivl: 1, time: 4000, type: 1 })).toEqual({ reviewed_at: 5, rating: Rating.Good, duration_ms: 4000, prev_state: State.Review });
    expect(convertRevlog({ id: 5, cid: 1, ease: 0, ivl: 1, time: 0, type: 4 })).toBeNull();
  });
});

describe('scheduling answers', () => {
  it('gives increasing intervals for Again < Hard < Good < Easy on a review card', () => {
    const s = convertAnkiCard({ id: 1, nid: 1, did: 1, ord: 0, type: 2, queue: 2, due: 95, ivl: 10, factor: 2500, reps: 3, lapses: 0, odue: 0, odid: 0, data: '' }, CRT, NOW);
    const p = previewGrades(s, NOW, createAnkiScheduler(false));
    const iv = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((r) => p[r as 1 | 2 | 3 | 4].due - NOW);
    expect(iv[0]).toBeLessThan(iv[1]);
    expect(iv[1]).toBeLessThan(iv[2]);
    expect(iv[2]).toBeLessThan(iv[3]);
    expect(p[Rating.Again].lapses).toBe(1);
  });

  it('gives shorter intervals at a higher desired retention', () => {
    const s = convertAnkiCard({ id: 1, nid: 1, did: 1, ord: 0, type: 2, queue: 2, due: 95, ivl: 10, factor: 2500, reps: 3, lapses: 0, odue: 0, odid: 0, data: '' }, CRT, NOW);
    const good = (r: number) => previewGrades(s, NOW, createAnkiScheduler(false, r))[Rating.Good].due;
    expect(good(0.95)).toBeLessThan(good(0.92));
    expect(good(0.92)).toBeLessThan(good(0.9));
  });

  it.each([
    [60_000, '1m'],
    [10 * 60_000, '10m'],
    [3 * 3600_000, '3h'],
    [4 * DAY, '4d'],
    [63 * DAY, '2.1mo'],
    [400 * DAY, '1.1y'],
  ])('formats %d as %s', (ms, s) => expect(formatInterval(ms)).toBe(s));
});

describe('template rendering', () => {
  const ctx = (fields: Record<string, string>, extra: Partial<RenderContext> = {}): RenderContext => ({
    fields,
    ord: 0,
    isCloze: false,
    tags: 'animal',
    deck: 'Japanese::Vocab',
    notetype: 'Basic',
    cardName: 'Card 1',
    ...extra,
  });

  it('fills fields, FrontSide and conditionals', () => {
    const r = renderCard('{{Front}}{{#Hint}} ({{Hint}}){{/Hint}}{{^Hint}}!{{/Hint}}', '{{FrontSide}}<hr id=answer>{{Back}} {{Subdeck}}', ctx({ Front: '猫', Back: 'cat', Hint: '' }));
    expect(r.question).toBe('猫!');
    expect(r.answer).toBe('猫!<hr id=answer>cat Vocab');
  });

  it('treats a field holding only markup as empty', () => {
    expect(renderCard('{{#Extra}}X{{/Extra}}', '', ctx({ Extra: '<br><div></div>' })).question).toBe('');
  });

  it('applies furigana, kana and kanji filters', () => {
    expect(furigana('猫[ねこ]が 好[す]き')).toBe('<ruby><rb>猫</rb><rt>ねこ</rt></ruby>が<ruby><rb>好</rb><rt>す</rt></ruby>き');
    expect(kana(' 日本[にほん]')).toBe('にほん');
    expect(kanji(' 日本[にほん]')).toBe('日本');
    expect(furigana('[sound:a.mp3]')).toBe('[sound:a.mp3]');
    expect(renderCard('{{furigana:Front}}', '', ctx({ Front: '猫[ねこ]' })).question).toContain('<rt>ねこ</rt>');
  });

  it('renders cloze deletions for the active card only', () => {
    const text = '{{c1::猫}}が{{c2::好き::like}}です';
    expect(cloze(text, 1, 'front')).toBe('<span class="cloze">[...]</span>が好きです');
    expect(cloze(text, 2, 'front')).toBe('猫が<span class="cloze">[like]</span>です');
    expect(cloze(text, 2, 'back')).toBe('猫が<span class="cloze">好き</span>です');
    expect(clozeNumbers([text])).toEqual([1, 2]);
    const r = renderCard('{{cloze:Text}}', '{{cloze:Text}}<br>{{type:cloze:Text}}', ctx({ Text: text }, { isCloze: true, ord: 1 }));
    expect(r.question).toContain('[like]');
    expect(r.answer).toContain('<code>好き</code>');
  });

  it('shows type: answers only on the back', () => {
    const r = renderCard('{{Front}}{{type:Back}}', '{{FrontSide}}<hr id=answer>{{type:Back}}', ctx({ Front: 'Q', Back: 'A<b>!</b>' }));
    expect(r.question).toBe('Q');
    expect(r.answer).toContain('<code>A!</code>');
  });

  it('does not replay question audio on the answer side', () => {
    const r = renderCard('{{Front}}', '{{FrontSide}}{{Back}}', ctx({ Front: '[sound:q.mp3]', Back: '[sound:a.mp3]' }));
    const c = cardContent({ body: r.answer, css: '', ord: 0, dark: false, autoplay: true });
    expect(c.sounds).toEqual([
      { src: 'q.mp3', auto: false },
      { src: 'a.mp3', auto: true },
    ]);
    expect(c.html).not.toContain('[sound');
  });

  it('adds Anki card classes and night mode', () => {
    const c = cardContent({ body: 'x', css: '.card{color:red}', ord: 2, dark: true, autoplay: false });
    expect(c.bodyClass).toBe('card card3 nightMode night_mode');
    expect(c.htmlClass).toBe('night-mode');
    const doc = cardDocument(c);
    expect(doc).toContain('window.kaeruShow({"html":"x","css":".card{color:red}"');
    expect(doc).toContain('<div id="qa"></div>');
  });

  it('builds a script that is safe to inject for any card text', () => {
    const c = cardContent({ body: 'a\u2028b</script>"\'', css: '', ord: 0, dark: false, autoplay: false });
    const js = showScript(c);
    expect(js).not.toMatch(/[\u2028\u2029]/);
    // Runs, and hands kaeruShow exactly the content.
    let got: unknown;
    new Function('window', js)({ kaeruShow: (x: unknown) => (got = x) });
    expect(got).toEqual(c);
  });

  it('strips HTML for text:', () => {
    expect(stripHtml('a<br>b&nbsp;<b>c</b>')).toBe('a b c');
  });
});

describe('studying imported decks', () => {
  const limits = { newPerDay: 20, reviewsPerDay: 200 };
  // Day 101: the review card (due day 100) is due; the relearned-from-scratch card and the new card are new.
  const T = (CRT + 101 * 86400) * 1000;

  async function setup() {
    const db = openNodeDb();
    await migrate(db);
    const { col } = await loadCollection('legacy.apkg');
    await saveCollection(db, col, 'legacy.apkg', T);
    return db;
  }

  it('lists parent and child decks with counts including subdecks', async () => {
    const db = await setup();
    const decks = await listDecks(db, T, limits);
    expect(decks.map((d) => [d.path, d.depth, d.newCount, d.reviewCount])).toEqual([
      ['Japanese', 0, 2, 1],
      ['Japanese::Grammar', 1, 1, 0],
      ['Japanese::Vocab', 1, 1, 1],
    ]);
  });

  it('builds a queue, applies an answer, respects the new-card limit and undoes', async () => {
    const db = await setup();
    const queue = await buildStudyQueue(db, 'Japanese', T, limits);
    expect(queue).toHaveLength(3); // 1 review + 2 new (suspended card excluded)

    const first = (await getStudyCard(db, queue[0]))!;
    expect(first.deck).toMatch(/^Japanese::/);
    expect(Object.keys(first.fields).length).toBeGreaterThan(0);

    const newCard = (await Promise.all(queue.map((id) => getStudyCard(db, id)))).find((c) => c!.card.state === State.New)!;
    const after = previewGrades(newCard.card, T, createAnkiScheduler(false))[Rating.Good];
    const logId = await answerCard(db, newCard.card, after, Rating.Good, T, 3000);

    // The answered card is now in learning (due in 10 minutes, so it comes back this session);
    // with a limit of one new card a day, no other new card is offered.
    const next = await Promise.all((await buildStudyQueue(db, 'Japanese', T, { ...limits, newPerDay: 1 })).map((id) => getStudyCard(db, id)));
    expect(next.find((c) => c!.card.id === newCard.card.id)!.card.state).toBe(State.Learning);
    expect(next.filter((c) => c!.card.state === State.New)).toHaveLength(0);
    expect((await listDecks(db, T, { ...limits, newPerDay: 1 }))[0].newCount).toBe(0);

    await undoAnswer(db, logId);
    expect((await getStudyCard(db, newCard.card.id))!.card).toEqual(newCard.card);
    expect((await listDecks(db, T, { ...limits, newPerDay: 1 }))[0].newCount).toBe(1);
  });

  it('deletes a deck with its now-unused notes', async () => {
    const db = await setup();
    await deleteDeck(db, 'Japanese::Grammar');
    expect((await listDecks(db, T, limits)).map((d) => d.path)).toEqual(['Japanese', 'Japanese::Vocab']);
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_notes'))!.n).toBe(1);
  });

  it('uses a deck’s own daily limits, and a subdeck’s limit holds inside its parent', async () => {
    const db = await setup();
    await setDeckLimits(db, 'Japanese::Vocab', { newPerDay: 0, reviewsPerDay: null });
    expect((await listDecks(db, T, limits)).map((d) => [d.path, d.newCount, d.reviewCount])).toEqual([
      ['Japanese', 1, 1],
      ['Japanese::Grammar', 1, 0],
      ['Japanese::Vocab', 0, 1],
    ]);
    // Studying the parent: Vocab's new card stays out, its review is still in.
    const queue = await Promise.all((await buildStudyQueue(db, 'Japanese', T, limits)).map((id) => getStudyCard(db, id)));
    expect(queue.filter((c) => c!.card.state === State.New).map((c) => c!.deck)).toEqual(['Japanese::Grammar']);
    expect(queue.some((c) => c!.deck === 'Japanese::Vocab' && c!.card.state === State.Review)).toBe(true);

    // A parent's own limit caps the whole session; reviews can be paused too.
    await setDeckLimits(db, 'Japanese', { newPerDay: 5, reviewsPerDay: 0 });
    expect((await listDecks(db, T, limits))[0]).toMatchObject({ path: 'Japanese', newCount: 1, reviewCount: 0 });
    expect(await getDeckLimits(db, 'Japanese')).toEqual({ newPerDay: 5, reviewsPerDay: 0 });

    // Back to the defaults.
    await setDeckLimits(db, 'Japanese', { newPerDay: null, reviewsPerDay: null });
    await setDeckLimits(db, 'Japanese::Vocab', { newPerDay: null, reviewsPerDay: null });
    expect(await getDeckLimits(db, 'Japanese')).toEqual({ newPerDay: null, reviewsPerDay: null });
    expect((await listDecks(db, T, limits))[0]).toMatchObject({ newCount: 2, reviewCount: 1 });
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_deck_limits'))!.n).toBe(0);
  });

  it('deleting a deck forgets its limits and its subdecks’ limits', async () => {
    const db = await setup();
    await setDeckLimits(db, 'Japanese', { newPerDay: 5, reviewsPerDay: null });
    await setDeckLimits(db, 'Japanese::Vocab', { newPerDay: 1, reviewsPerDay: null });
    await deleteDeck(db, 'Japanese');
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_deck_limits'))!.n).toBe(0);
  });

  it('takes cards only while the deck and every parent up to the studied deck have room', () => {
    const cards = [
      { id: 1, deck: 'A::B' },
      { id: 2, deck: 'A::B' },
      { id: 3, deck: 'A::C' },
      { id: 4, deck: 'A' },
      { id: 5, deck: 'A::B::D' },
    ];
    const left = (p: string) => ({ A: 3, 'A::B': 1 })[p] ?? 99;
    expect(takeWithinLimits(cards, 'A', left).map((c) => c.id)).toEqual([1, 3, 4]);
    // Studying the subdeck alone ignores the parent's limit.
    expect(takeWithinLimits(cards.filter((c) => c.deck.startsWith('A::B')), 'A::B', left).map((c) => c.id)).toEqual([1]);
  });

  it('interleaves new cards evenly through reviews', () => {
    expect(interleave<number | string>([1, 2, 3, 4], ['a', 'b'])).toEqual([1, 2, 'a', 3, 4, 'b']);
    expect(interleave<number | string>([], ['a'])).toEqual(['a']);
    expect(interleave([1], [])).toEqual([1]);
  });
});
