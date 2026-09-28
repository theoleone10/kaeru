/**
 * Furigana markup: `{私|わたし}は{学生|がくせい}です。`
 * Braced groups carry a reading; everything else is plain text.
 */
export interface RubyToken {
  text: string;
  reading?: string;
}

const GROUP = /\{([^{}|]+)\|([^{}|]+)\}/g;

export function parseFurigana(markup: string): RubyToken[] {
  const tokens: RubyToken[] = [];
  let last = 0;
  for (const m of markup.matchAll(GROUP)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ text: markup.slice(last, idx) });
    tokens.push({ text: m[1], reading: m[2] });
    last = idx + m[0].length;
  }
  if (last < markup.length) tokens.push({ text: markup.slice(last) });
  return tokens;
}

export function plainText(tokens: RubyToken[]): string {
  return tokens.map((t) => t.text).join('');
}

/** True if the markup has stray braces or pipes that the parser would treat as plain text. */
export function hasMalformedMarkup(markup: string): boolean {
  return /[{}|]/.test(markup.replace(GROUP, ''));
}

/** Character index of the nth (1-based) occurrence of `needle`, or -1. */
export function nthIndexOf(haystack: string, needle: string, n: number): number {
  let idx = -1;
  for (let i = 0; i < n; i++) {
    idx = haystack.indexOf(needle, idx + 1);
    if (idx === -1) return -1;
  }
  return idx;
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return count;
}

export interface ClozeSplit {
  before: RubyToken[];
  blank: RubyToken[];
  after: RubyToken[];
}

/**
 * Split tokens around the cloze target. Plain-text tokens may be cut anywhere;
 * a ruby group must fall entirely inside or outside the blank (returns null otherwise).
 */
export function splitCloze(tokens: RubyToken[], target: string, occurrence = 1): ClozeSplit | null {
  const text = plainText(tokens);
  const start = nthIndexOf(text, target, occurrence);
  if (start === -1 || !target) return null;
  const end = start + target.length;

  const out: ClozeSplit = { before: [], blank: [], after: [] };
  let pos = 0;
  for (const tok of tokens) {
    const tStart = pos;
    const tEnd = pos + tok.text.length;
    pos = tEnd;
    if (tEnd <= start) {
      out.before.push(tok);
    } else if (tStart >= end) {
      out.after.push(tok);
    } else if (tStart >= start && tEnd <= end) {
      out.blank.push(tok);
    } else if (tok.reading) {
      return null; // target cuts through a ruby group
    } else {
      const a = Math.max(start, tStart) - tStart;
      const b = Math.min(end, tEnd) - tStart;
      if (a > 0) out.before.push({ text: tok.text.slice(0, a) });
      out.blank.push({ text: tok.text.slice(a, b) });
      if (b < tok.text.length) out.after.push({ text: tok.text.slice(b) });
    }
  }
  return out;
}

// Characters that must not start a line / must not end one (kinsoku shori).
const NO_LINE_START = /^[。、，．！？」』）〕】ー・…ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]$/;
const NO_LINE_END = /^[「『（〔【]$/;

/**
 * Break tokens into wrap clusters: ruby groups stay whole, plain text is split per
 * character so lines can wrap anywhere, except that closing punctuation and small
 * kana stay glued to the previous character and opening brackets to the next.
 */
export function clusters(tokens: RubyToken[]): RubyToken[][] {
  const out: RubyToken[][] = [];
  let pendingOpen: RubyToken[] = [];
  for (const t of tokens.flatMap<RubyToken>((t) => (t.reading ? [t] : [...t.text].map((ch) => ({ text: ch }))))) {
    if (!t.reading && NO_LINE_START.test(t.text) && out.length > 0 && pendingOpen.length === 0) {
      out[out.length - 1].push(t);
    } else if (!t.reading && NO_LINE_END.test(t.text)) {
      pendingOpen.push(t);
    } else {
      out.push([...pendingOpen, t]);
      pendingOpen = [];
    }
  }
  if (pendingOpen.length) out.push(pendingOpen);
  return out;
}

/** Split leading no-line-start punctuation off `tokens` so it can stay with a preceding blank. */
export function takeLeadingPunctuation(tokens: RubyToken[]): [RubyToken[], RubyToken[]] {
  const lead: RubyToken[] = [];
  const rest = [...tokens];
  while (rest.length && !rest[0].reading) {
    const first = rest[0].text;
    let i = 0;
    while (i < first.length && NO_LINE_START.test(first[i])) i++;
    if (i === 0) break;
    lead.push({ text: first.slice(0, i) });
    if (i < first.length) {
      rest[0] = { text: first.slice(i) };
      break;
    }
    rest.shift();
  }
  return [lead, rest];
}
