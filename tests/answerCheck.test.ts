import { checkAnswer, isRetry } from '@/review/answerCheck';
import { convertRomajiInput, finalizeInput } from '@/review/kanaInput';
import { katakanaToHiragana, normalizeAnswer } from '@/review/normalize';

describe('normalizeAnswer', () => {
  it('strips whitespace and punctuation, including full-width', () => {
    expect(normalizeAnswer('  です。 ')).toBe('です');
    expect(normalizeAnswer('で　す！')).toBe('です');
    expect(normalizeAnswer('「たい」')).toBe('たい');
  });
  it('folds katakana to hiragana but keeps ー', () => {
    expect(normalizeAnswer('デス')).toBe('です');
    expect(katakanaToHiragana('コーヒー')).toBe('こーひー');
  });
  it('folds half-width kana and full-width ASCII', () => {
    expect(normalizeAnswer('ﾃﾞｽ')).toBe('です');
    expect(normalizeAnswer('ＡＢＣ')).toBe('abc');
  });
});

describe('checkAnswer', () => {
  const ex = {
    accepted_answers: ['行きたい', 'いきたい'],
    valid_alternatives: [{ answer: '行きます', note: 'Grammatical, but the target expresses wanting to go.' }],
  };

  it('accepts any accepted answer, in any normalisation', () => {
    expect(checkAnswer('行きたい', ex)).toEqual({ kind: 'correct' });
    expect(checkAnswer('いきたい', ex)).toEqual({ kind: 'correct' });
    expect(checkAnswer(' イキタイ。', ex)).toEqual({ kind: 'correct' });
  });

  it('flags valid-but-not-target answers for retry', () => {
    const r = checkAnswer('行きます', ex);
    expect(r).toEqual({ kind: 'alternative', note: ex.valid_alternatives[0].note });
    expect(isRetry(r)).toBe(true);
  });

  it('marks other answers wrong', () => {
    const r = checkAnswer('行った', ex);
    expect(r).toEqual({ kind: 'wrong' });
    expect(isRetry(r)).toBe(false);
  });

  it('ignores empty submissions', () => {
    expect(checkAnswer('  。', ex)).toEqual({ kind: 'empty' });
  });

  it('catches the wa/ha, e/he, o/wo romaji traps', () => {
    expect(checkAnswer('わ', { accepted_answers: ['は'] })).toEqual({ kind: 'kana-trap', suggestion: 'は' });
    expect(checkAnswer('え', { accepted_answers: ['へ'] })).toEqual({ kind: 'kana-trap', suggestion: 'へ' });
    expect(checkAnswer('お', { accepted_answers: ['を'] })).toEqual({ kind: 'kana-trap', suggestion: 'を' });
    expect(checkAnswer('にわ', { accepted_answers: ['には'] })).toEqual({ kind: 'kana-trap', suggestion: 'には' });
    expect(isRetry(checkAnswer('わ', { accepted_answers: ['は'] }))).toBe(true);
  });

  it('does not treat a correct わ as a trap', () => {
    expect(checkAnswer('わ', { accepted_answers: ['わ'] })).toEqual({ kind: 'correct' });
    expect(checkAnswer('か', { accepted_answers: ['は'] })).toEqual({ kind: 'wrong' });
  });

  it('asks for a retry when romaji is left over', () => {
    expect(checkAnswer('desu', { accepted_answers: ['です'] })).toEqual({ kind: 'unconverted' });
  });

  it('prefers "correct" when an answer is both accepted and a trap variant', () => {
    expect(checkAnswer('は', { accepted_answers: ['は'] })).toEqual({ kind: 'correct' });
  });
});

describe('romaji input', () => {
  it('converts romaji as you type, holding a trailing n', () => {
    expect(convertRomajiInput('desu')).toBe('です');
    expect(convertRomajiInput('ikitai')).toBe('いきたい');
    expect(convertRomajiInput('kan')).toBe('かn');
    expect(convertRomajiInput('kann')).toBe('かん');
    expect(convertRomajiInput('kana')).toBe('かな');
  });

  it('lowercases before converting (uppercase would become katakana)', () => {
    expect(convertRomajiInput('Desu')).toBe('です');
  });

  it('leaves Japanese keyboard input untouched', () => {
    expect(convertRomajiInput('行きたい')).toBe('行きたい');
  });

  it('keeps an incomplete romaji syllable until it can be converted', () => {
    expect(convertRomajiInput('でs')).toBe('でs');
    expect(convertRomajiInput('でsu')).toBe('です');
  });

  it('converts mixed kana and romaji', () => {
    expect(convertRomajiInput('行きtai')).toBe('行きたい');
  });

  it('finalizes a trailing n to ん', () => {
    expect(finalizeInput('ikimasen')).toBe('いきません');
    expect(finalizeInput('いきませn')).toBe('いきません');
    expect(finalizeInput(' です ')).toBe('です');
  });

  it('the typed particle "wa" becomes わ and is caught as a trap', () => {
    expect(checkAnswer(finalizeInput('wa'), { accepted_answers: ['は'] }).kind).toBe('kana-trap');
    expect(checkAnswer(finalizeInput('ha'), { accepted_answers: ['は'] }).kind).toBe('correct');
  });
});
