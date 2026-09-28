export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export const LEVELS: readonly JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

export type Formality = 'casual' | 'neutral' | 'polite' | 'formal' | 'written';

/** An answer that is grammatical in the sentence but is not the grammar being tested. */
export interface ValidAlternative {
  answer: string;
  note: string;
}

export interface Example {
  /** Stable id — keep it when editing the sentence so review history is preserved. */
  id: string;
  japanese: string;
  /** Same sentence with ruby markup: {漢字|かんじ}. Plain text outside braces. */
  furigana: string;
  english: string;
  /** Exact substring of `japanese` that is blanked out in reviews. */
  cloze_target: string;
  /** 1-based occurrence of cloze_target to blank, required only when it appears more than once. */
  cloze_occurrence?: number;
  /** Every answer that counts as correct (must include cloze_target). */
  accepted_answers: string[];
  valid_alternatives?: ValidAlternative[];
  /** Short hint shown under the blank. Falls back to the grammar point's meaning. */
  hint?: string;
}

export interface Comparison {
  id: string;
  note: string;
}

export interface GrammarPoint {
  id: string;
  level: JlptLevel;
  title: string;
  meaning: string;
  structure: string[];
  formality?: Formality;
  explanation: string;
  nuances: string[];
  common_mistakes: string[];
  comparisons?: Comparison[];
  related_ids: string[];
  examples: Example[];
}

export interface LevelFile {
  $schema?: string;
  level: JlptLevel;
  points: GrammarPoint[];
}
