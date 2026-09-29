import { curriculum } from './loader';
import { LEVELS, type GrammarPoint, type JlptLevel } from './types';

/** Stations per unit on the grammar train map. */
export const UNIT_SIZE = 8;

export interface Station {
  point: GrammarPoint;
  /** 1-based position within its level: the station number (N5-12). */
  number: number;
  unit: number;
}

export interface Unit {
  level: JlptLevel;
  /** 1-based. */
  number: number;
  stations: Station[];
}

/** Station code as shown on signs, e.g. "N5-07". */
export function stationCode(s: Pick<Station, 'number'> & { point: Pick<GrammarPoint, 'level'> }): string {
  return `${s.point.level}-${String(s.number).padStart(2, '0')}`;
}

export function unitsFor(level: JlptLevel, points: readonly GrammarPoint[] = curriculum): Unit[] {
  const inLevel = points.filter((p) => p.level === level);
  const units: Unit[] = [];
  inLevel.forEach((point, i) => {
    const unit = Math.floor(i / UNIT_SIZE) + 1;
    if (!units[unit - 1]) units[unit - 1] = { level, number: unit, stations: [] };
    units[unit - 1].stations.push({ point, number: i + 1, unit });
  });
  return units;
}

const STATIONS = new Map<string, Station>();
for (const level of LEVELS) for (const u of unitsFor(level)) for (const s of u.stations) STATIONS.set(s.point.id, s);

export function stationOf(id: string): Station | undefined {
  return STATIONS.get(id);
}
