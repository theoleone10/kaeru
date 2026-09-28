import { toKana } from 'wanakana';

const HAS_ASCII_LETTER = /[A-Za-z]/;

/**
 * Live romaji → kana conversion for onChangeText.
 * Text without ASCII letters is returned untouched so we never rewrite the value
 * while a Japanese IME is composing (which breaks composition on iOS).
 * IMEMode keeps a trailing "n" as-is until the next letter decides ん vs な行.
 * Uppercase is lowered first because wanakana maps uppercase to katakana.
 */
export function convertRomajiInput(text: string): string {
  if (!HAS_ASCII_LETTER.test(text)) return text;
  return toKana(text.toLowerCase(), { IMEMode: true });
}

/** Final conversion on submit: a trailing "n" becomes ん. */
export function finalizeInput(text: string): string {
  const trimmed = text.trim();
  if (!HAS_ASCII_LETTER.test(trimmed)) return trimmed;
  return toKana(trimmed.toLowerCase());
}
