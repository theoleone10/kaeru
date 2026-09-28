import n5 from '../../content/n5.json';
import n4 from '../../content/n4.json';
import n3 from '../../content/n3.json';
import n2 from '../../content/n2.json';
import n1 from '../../content/n1.json';
import type { GrammarPoint, JlptLevel, LevelFile } from './types';

export const allLevelFiles: LevelFile[] = [n5, n4, n3, n2, n1] as LevelFile[];

/** Every grammar point in study order: N5 → N1, file order within each level. */
export const curriculum: GrammarPoint[] = allLevelFiles.flatMap((f) => f.points);

const byId = new Map(curriculum.map((p) => [p.id, p]));

export function getPoint(id: string): GrammarPoint | undefined {
  return byId.get(id);
}

export function pointsForLevel(level: JlptLevel): GrammarPoint[] {
  return curriculum.filter((p) => p.level === level);
}

/** Position of a point in the overall curriculum (for sorting). */
export const curriculumIndex = new Map(curriculum.map((p, i) => [p.id, i]));
