// Punctuation and symbols that never matter for a grammar answer.
// Note: ー (long vowel mark) is deliberately NOT stripped — it is part of words.
const IGNORED = /[\s。、，．,.!?！？「」『』（）()［］[\]【】・…‥~〜"'“”‘’]/g;

/** Katakana → hiragana (ァ..ヶ). Leaves ー and everything else untouched. */
export function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * Canonical form used to compare a typed answer against accepted answers:
 * NFKC (full-width ASCII → ASCII, half-width kana → full-width), punctuation and
 * whitespace removed, katakana folded to hiragana, ASCII lowercased.
 */
export function normalizeAnswer(input: string): string {
  return katakanaToHiragana(input.normalize('NFKC').replace(IGNORED, '')).toLowerCase();
}
