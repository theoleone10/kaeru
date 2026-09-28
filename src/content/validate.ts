import { countOccurrences, hasMalformedMarkup, parseFurigana, plainText, splitCloze } from './furigana';
import { LEVELS, type GrammarPoint, type LevelFile } from './types';
import { normalizeAnswer } from '../review/normalize';

const FORMALITIES = ['casual', 'neutral', 'polite', 'formal', 'written'];

/**
 * Validate all level files together. Returns human-readable errors (empty = valid).
 * Run by the test suite so a bad edit to /content fails loudly.
 */
export function validateContent(files: LevelFile[]): string[] {
  const errors: string[] = [];
  const pointIds = new Set<string>();
  const exampleIds = new Set<string>();
  const all: GrammarPoint[] = [];

  for (const file of files) {
    if (!LEVELS.includes(file.level)) errors.push(`Unknown level "${file.level}"`);
    if (!Array.isArray(file.points)) {
      errors.push(`${file.level}: "points" must be an array`);
      continue;
    }
    for (const p of file.points) {
      const where = `${file.level}/${p.id ?? '(missing id)'}`;
      if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) errors.push(`${where}: id must be lowercase a-z, 0-9, "-"`);
      if (pointIds.has(p.id)) errors.push(`${where}: duplicate grammar id`);
      pointIds.add(p.id);
      all.push(p);
      if (p.level !== file.level) errors.push(`${where}: level "${p.level}" does not match file level`);
      for (const key of ['title', 'meaning', 'explanation'] as const) {
        if (typeof p[key] !== 'string' || !p[key].trim()) errors.push(`${where}: "${key}" is required`);
      }
      for (const key of ['structure', 'nuances', 'common_mistakes', 'related_ids'] as const) {
        if (!Array.isArray(p[key])) errors.push(`${where}: "${key}" must be an array`);
      }
      if (!p.structure?.length) errors.push(`${where}: needs at least one structure line`);
      if (p.formality && !FORMALITIES.includes(p.formality)) errors.push(`${where}: bad formality "${p.formality}"`);
      if (!Array.isArray(p.examples) || p.examples.length < 4 || p.examples.length > 6) {
        errors.push(`${where}: needs 4-6 examples (has ${p.examples?.length ?? 0})`);
      }

      for (const ex of p.examples ?? []) {
        const exWhere = `${where}/${ex.id ?? '(missing example id)'}`;
        if (!ex.id) errors.push(`${exWhere}: example id is required`);
        if (exampleIds.has(ex.id)) errors.push(`${exWhere}: duplicate example id`);
        exampleIds.add(ex.id);
        if (!ex.japanese || !ex.english || !ex.furigana) errors.push(`${exWhere}: japanese, furigana and english are required`);
        if (hasMalformedMarkup(ex.furigana ?? '')) errors.push(`${exWhere}: malformed furigana markup`);
        const tokens = parseFurigana(ex.furigana ?? '');
        if (plainText(tokens) !== ex.japanese) {
          errors.push(`${exWhere}: furigana text "${plainText(tokens)}" does not match japanese "${ex.japanese}"`);
        }
        const occurrences = countOccurrences(ex.japanese ?? '', ex.cloze_target);
        if (!ex.cloze_target || occurrences === 0) {
          errors.push(`${exWhere}: cloze_target "${ex.cloze_target}" not found in sentence`);
        } else if (occurrences > 1 && !ex.cloze_occurrence) {
          errors.push(`${exWhere}: cloze_target "${ex.cloze_target}" appears ${occurrences}x — set cloze_occurrence`);
        } else if (ex.cloze_occurrence && ex.cloze_occurrence > occurrences) {
          errors.push(`${exWhere}: cloze_occurrence ${ex.cloze_occurrence} exceeds ${occurrences} occurrences`);
        } else if (!splitCloze(tokens, ex.cloze_target, ex.cloze_occurrence ?? 1)) {
          errors.push(`${exWhere}: cloze_target cuts through a furigana group`);
        }
        const accepted = (ex.accepted_answers ?? []).map(normalizeAnswer);
        if (!accepted.includes(normalizeAnswer(ex.cloze_target ?? ''))) {
          errors.push(`${exWhere}: accepted_answers must include cloze_target`);
        }
        for (const alt of ex.valid_alternatives ?? []) {
          if (accepted.includes(normalizeAnswer(alt.answer))) {
            errors.push(`${exWhere}: "${alt.answer}" is both accepted and a valid_alternative`);
          }
          if (!alt.note?.trim()) errors.push(`${exWhere}: valid_alternative "${alt.answer}" needs a note`);
        }
      }
    }
  }

  for (const p of all) {
    for (const rel of [...(p.related_ids ?? []), ...(p.comparisons ?? []).map((c) => c.id)]) {
      if (!pointIds.has(rel)) errors.push(`${p.level}/${p.id}: related id "${rel}" does not exist`);
      if (rel === p.id) errors.push(`${p.level}/${p.id}: relates to itself`);
    }
  }
  return errors;
}
