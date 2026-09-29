import { curriculum } from '@/content/loader';
import { LEVELS } from '@/content/types';
import { stationCode, stationOf, UNIT_SIZE, unitsFor } from '@/content/units';

describe('grammar train map units', () => {
  it('numbers every point once, in curriculum order, per level', () => {
    for (const level of LEVELS) {
      const stations = unitsFor(level).flatMap((u) => u.stations);
      expect(stations.map((s) => s.point.id)).toEqual(curriculum.filter((p) => p.level === level).map((p) => p.id));
      expect(stations.map((s) => s.number)).toEqual(stations.map((_, i) => i + 1));
    }
  });

  it('groups stations into units of UNIT_SIZE', () => {
    const units = unitsFor('N5');
    expect(units[0].stations).toHaveLength(UNIT_SIZE);
    expect(units.every((u, i) => u.number === i + 1)).toBe(true);
  });

  it('formats station codes like subway numbering', () => {
    const s = stationOf(curriculum.find((p) => p.level === 'N4')!.id)!;
    expect(stationCode(s)).toBe('N4-01');
    expect(s.unit).toBe(1);
  });
});
