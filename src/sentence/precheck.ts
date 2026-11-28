import pointsFile from '../../content/sentences/points.json';
import { getPoint } from '../content/loader';

export type PrecheckError = 'too_short' | 'too_long' | 'not_japanese' | 'missing_target' | 'copied' | 'multiple';

interface PointConfig {
  target_forms: string[];
  sentence_prompts?: string[];
  accept_note?: string;
}

const CONFIG = (pointsFile as { points: Record<string, PointConfig> }).points;

export function pointConfig(id: string): PointConfig | undefined {
  return CONFIG[id];
}

const patternCache = new Map<string, RegExp[]>();
function patterns(id: string): RegExp[] {
  let p = patternCache.get(id);
  if (!p) {
    p = (CONFIG[id]?.target_forms ?? []).map((src) => new RegExp(src, 'u'));
    patternCache.set(id, p);
  }
  return p;
}

/** Full-width ASCII → half-width, half-width katakana kept, zero-width removed, spaces trimmed. */
export function normalizeSentence(text: string): string {
  return text
    .replace(/[​-‍﻿]/g, '')
    .replace(/[！-～]/g, (c) => {
      const ch = String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      // Keep Japanese sentence punctuation in its full-width form.
      return '!?'.includes(ch) ? c : ch;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿　-〿！-／：-？ー]/u;
const ENDERS = /[。！？!?]/u;

export function usesTarget(id: string, text: string): boolean {
  return patterns(id).some((re) => re.test(text));
}

/** Characters shared in order, as a share of the longer string (cheap near-copy check). */
function overlap(a: string, b: string): number {
  const strip = (s: string) => s.replace(/[\s。、！？!?「」]/g, '');
  const x = strip(a);
  const y = strip(b);
  if (!x || !y) return 0;
  const dp = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let prev = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j];
      dp[j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[y.length] / Math.max(x.length, y.length);
}

/** Instant checks before the model. Returns the first problem, or null if the sentence can be graded. */
export function precheck(id: string, raw: string): PrecheckError | null {
  const text = normalizeSentence(raw);
  const chars = [...text.replace(/\s/g, '')];
  if (chars.length < 4) return 'too_short';
  if (chars.length > 80) return 'too_long';
  const jp = chars.filter((c) => JAPANESE.test(c)).length;
  if (jp / chars.length < 0.6) return 'not_japanese';
  const firstEnd = text.search(ENDERS);
  if (firstEnd >= 0 && text.slice(firstEnd + 1).replace(/[。！？!?」』）)\s]/g, '').length > 0) return 'multiple';
  if (!usesTarget(id, text)) return 'missing_target';
  const point = getPoint(id);
  if (point?.examples.some((e) => overlap(e.japanese, text) >= 0.9)) return 'copied';
  return null;
}
