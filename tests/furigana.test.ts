import { clusters, countOccurrences, hasMalformedMarkup, parseFurigana, plainText, splitCloze, takeLeadingPunctuation } from '@/content/furigana';

describe('parseFurigana', () => {
  it('parses ruby groups and plain text', () => {
    expect(parseFurigana('{私|わたし}は{学生|がくせい}です。')).toEqual([
      { text: '私', reading: 'わたし' },
      { text: 'は' },
      { text: '学生', reading: 'がくせい' },
      { text: 'です。' },
    ]);
  });
  it('handles text with no ruby', () => {
    expect(parseFurigana('これはペンです。')).toEqual([{ text: 'これはペンです。' }]);
  });
  it('round-trips to plain text', () => {
    expect(plainText(parseFurigana('{毎日|まいにち}{日本語|にほんご}を{勉強|べんきょう}します。'))).toBe('毎日日本語を勉強します。');
  });
  it('detects malformed markup', () => {
    expect(hasMalformedMarkup('{私|わたし}は')).toBe(false);
    expect(hasMalformedMarkup('{私わたし}は')).toBe(true);
    expect(hasMalformedMarkup('{私|わたし は')).toBe(true);
  });
});

describe('splitCloze', () => {
  const tokens = parseFurigana('{私|わたし}は{学生|がくせい}です。');

  it('splits inside a plain-text token', () => {
    expect(splitCloze(tokens, 'です')).toEqual({
      before: [{ text: '私', reading: 'わたし' }, { text: 'は' }, { text: '学生', reading: 'がくせい' }],
      blank: [{ text: 'です' }],
      after: [{ text: '。' }],
    });
  });

  it('can blank a whole ruby group', () => {
    const t = parseFurigana('{京都|きょうと}へ{行|い}きたいです。');
    const s = splitCloze(t, '行きたい');
    expect(s?.blank).toEqual([{ text: '行', reading: 'い' }, { text: 'きたい' }]);
    expect(plainText(s!.after)).toBe('です。');
  });

  it('refuses to cut through a ruby group', () => {
    expect(splitCloze(parseFurigana('{学生|がくせい}です'), '生')).toBeNull();
  });

  it('uses the requested occurrence', () => {
    const t = parseFurigana('{学校|がっこう}で{勉強|べんきょう}するのが{好|す}きです。');
    expect(countOccurrences(plainText(t), 'で')).toBe(2);
    const s = splitCloze(t, 'で', 1)!;
    expect(plainText(s.before)).toBe('学校');
    const s2 = splitCloze(t, 'で', 2)!;
    expect(plainText(s2.before)).toBe('学校で勉強するのが好き');
  });

  it('returns null when the target is missing', () => {
    expect(splitCloze(tokens, 'ます')).toBeNull();
  });
});

describe('line-break clusters', () => {
  const texts = (markup: string) => clusters(parseFurigana(markup)).map((c) => c.map((t) => t.text).join(''));

  it('splits plain text per character and keeps ruby groups whole', () => {
    expect(texts('{学生|がくせい}です')).toEqual(['学生', 'で', 'す']);
  });
  it('keeps closing punctuation and small kana with the previous character', () => {
    expect(texts('{学生|がくせい}です。')).toEqual(['学生', 'で', 'す。']);
    expect(texts('ちょっと、')).toEqual(['ちょっ', 'と、']);
  });
  it('keeps opening brackets with the next character', () => {
    expect(texts('「はい」')).toEqual(['「は', 'い」']);
  });
  it('splits leading punctuation off for the cloze blank', () => {
    const [lead, rest] = takeLeadingPunctuation(parseFurigana('。{私|わたし}'));
    expect(lead).toEqual([{ text: '。' }]);
    expect(rest).toEqual([{ text: '私', reading: 'わたし' }]);
  });
});
