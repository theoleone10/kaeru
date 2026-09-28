import { LEVELS, type GrammarPoint, type JlptLevel } from '../content/types';
import { isMastered, type StoredCard } from '../srs/scheduler';

export interface LevelProgress {
  level: JlptLevel;
  total: number;
  learned: number;
  mastered: number;
}

export function levelProgress(points: readonly GrammarPoint[], cards: readonly StoredCard[]): LevelProgress[] {
  const byId = new Map(cards.map((c) => [c.grammar_id, c]));
  return LEVELS.map((level) => {
    const inLevel = points.filter((p) => p.level === level);
    let learned = 0;
    let mastered = 0;
    for (const p of inLevel) {
      const card = byId.get(p.id);
      if (!card) continue;
      learned++;
      if (isMastered(card)) mastered++;
    }
    return { level, total: inLevel.length, learned, mastered };
  });
}
