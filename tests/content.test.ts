import { allLevelFiles, curriculum } from '@/content/loader';
import { validateContent } from '@/content/validate';
import type { LevelFile } from '@/content/types';

describe('bundled content', () => {
  it('passes validation', () => {
    expect(validateContent(allLevelFiles)).toEqual([]);
  });

  it('has the full N5 set', () => {
    expect(curriculum.filter((p) => p.level === 'N5').length).toBeGreaterThanOrEqual(80);
  });

  it('keeps the Phase 1 points so existing progress still matches', () => {
    const ids = new Set(curriculum.map((p) => p.id));
    for (const id of ['n5-desu', 'n5-wa-topic', 'n5-ka-question', 'n5-no-possessive', 'n5-mo', 'n5-ja-arimasen', 'n5-masu', 'n5-masen',
      'n5-wo', 'n5-ni-time', 'n5-e-ni-destination', 'n5-de-place', 'n5-mashita', 'n5-ga-arimasu-imasu', 'n5-tai']) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

describe('validateContent', () => {
  const good = (): LevelFile => ({
    level: 'N5',
    points: [
      {
        id: 'n5-a',
        level: 'N5',
        title: 'A',
        meaning: 'a',
        structure: ['X'],
        explanation: 'x',
        nuances: [],
        common_mistakes: [],
        related_ids: [],
        examples: [1, 2, 3, 4].map((i) => ({
          id: `n5-a-${i}`,
          japanese: '私は学生です。',
          furigana: '{私|わたし}は{学生|がくせい}です。',
          english: 'I am a student.',
          cloze_target: 'です',
          accepted_answers: ['です'],
        })),
      },
    ],
  });

  it('accepts a valid file', () => {
    expect(validateContent([good()])).toEqual([]);
  });

  it('catches furigana that does not match the sentence', () => {
    const f = good();
    f.points[0].examples[0].furigana = '{私|わたし}は{先生|せんせい}です。';
    expect(validateContent([f]).join()).toMatch('does not match japanese');
  });

  it('catches ambiguous or missing cloze targets', () => {
    const f = good();
    f.points[0].examples[0].cloze_target = 'で';
    f.points[0].examples[0].japanese = '学校で勉強です。';
    f.points[0].examples[0].furigana = '{学校|がっこう}で{勉強|べんきょう}です。';
    f.points[0].examples[0].accepted_answers = ['で'];
    expect(validateContent([f]).join()).toMatch('set cloze_occurrence');
    f.points[0].examples[0].cloze_occurrence = 1;
    expect(validateContent([f])).toEqual([]);
    f.points[0].examples[1].cloze_target = 'ます';
    expect(validateContent([f]).join()).toMatch('not found');
  });

  it('requires cloze_target among accepted answers', () => {
    const f = good();
    f.points[0].examples[0].accepted_answers = ['だ'];
    expect(validateContent([f]).join()).toMatch('must include cloze_target');
  });

  it('catches unknown related ids, duplicate ids and example counts', () => {
    const f = good();
    f.points[0].related_ids = ['n5-nope'];
    f.points[0].examples[1].id = 'n5-a-1';
    f.points[0].examples = f.points[0].examples.slice(0, 3);
    const errors = validateContent([f]).join('\n');
    expect(errors).toMatch('related id "n5-nope"');
    expect(errors).toMatch('duplicate example id');
    expect(errors).toMatch('needs 4-6 examples');
  });
});
