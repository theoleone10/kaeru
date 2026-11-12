import { curriculum } from '@/content/loader';
import { answer, DONT_KNOW, isDone, nextQuestion, placementUnits, result, startPlacement, describeStart, type PlacementState } from '@/placement/placement';

const units = placementUnits();

/** Small seeded RNG so failures reproduce. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

/** Someone who knows exactly the units before `knows`, answering every question. */
function run(knows: number, experience: 'some' | 'lots', seed = 1) {
  const r = rng(seed);
  let s: PlacementState = startPlacement(units, experience);
  for (let i = 0; i < 100 && !isDone(s); i++) {
    const q = nextQuestion(s, units, r)!;
    s = answer(s, q, q.unit < knows ? q.example.cloze_target : DONT_KNOW);
  }
  return { s, placement: result(s, units) };
}

describe('placement quiz', () => {
  it('covers the whole curriculum, unit by unit', () => {
    expect(units.flatMap((u) => u.stations.map((st) => st.point.id))).toEqual(curriculum.map((p) => p.id));
  });

  it.each([0, 1, 3, 7, 12, 20, 33, units.length - 1, units.length])('places someone who knows %i units at that unit', (knows) => {
    for (const experience of ['some', 'lots'] as const) {
      const { s, placement } = run(knows, experience);
      expect(placement.unit).toBe(knows);
      expect(placement.known).toHaveLength(units.slice(0, knows).reduce((n, u) => n + u.stations.length, 0));
      // About a binary search's worth of questions, never a slog.
      expect(s.questions).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(units.length + 1)) + 2);
    }
  });

  it('asks a tie-breaker from another point when a unit is split', () => {
    const r = rng(3);
    let s = startPlacement(units, 'some');
    const q1 = nextQuestion(s, units, r)!;
    s = answer(s, q1, q1.example.cloze_target);
    const q2 = nextQuestion(s, units, r)!;
    s = answer(s, q2, DONT_KNOW);
    const q3 = nextQuestion(s, units, r)!;
    expect(q3.unit).toBe(q1.unit);
    expect(new Set([q1.point.id, q2.point.id, q3.point.id]).size).toBe(3);
  });

  it('offers one accepted answer among distinct choices', () => {
    const r = rng(5);
    for (let u = 0; u < units.length; u++) {
      const s: PlacementState = { lo: u - 1, hi: u + 1, probe: u, answers: [], asked: [], questions: 0 };
      const q = nextQuestion(s, units, r)!;
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      expect(q.choices.filter((c) => q.example.accepted_answers.includes(c))).toEqual([q.example.cloze_target]);
      const valid = (q.example.valid_alternatives ?? []).map((v) => v.answer);
      expect(q.choices.filter((c) => valid.includes(c))).toEqual([]);
    }
  });

  it('names where you start', () => {
    expect(describeStart({ unit: 0, known: [] }, units)).toEqual({ title: 'N5 Unit 1', station: 'N5-01' });
    expect(describeStart({ unit: units.length, known: [] }, units).station).toBeNull();
  });
});
