import { buildBackup, parseBackup } from '@/backup/format';
import { createScheduler, gradeCard, newCard } from '@/srs/scheduler';

const T0 = Date.UTC(2026, 0, 1);

function sample() {
  const card0 = newCard('n5-desu', 'N5', T0);
  const { card, log } = gradeCard({ card: card0, correct: true, now: T0, exampleId: 'n5-desu-1', answer: 'です', scheduler: createScheduler({ enableFuzz: false }) });
  return buildBackup(
    {
      cards: [card],
      review_logs: [log],
      example_seen: [{ example_id: 'n5-desu-1', grammar_id: 'n5-desu', times_shown: 1, times_wrong: 0, last_shown_at: T0 }],
      settings: { batchSize: 4, furigana: true },
    },
    T0,
  );
}

describe('backup format', () => {
  it('round-trips through JSON', () => {
    const b = sample();
    expect(parseBackup(JSON.stringify(b))).toEqual(b);
  });

  it('rejects non-JSON and foreign files', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON');
    expect(() => parseBackup('{"app":"other"}')).toThrow('not a grammar app backup');
  });

  it('rejects backups from a newer format', () => {
    expect(() => parseBackup(JSON.stringify({ ...sample(), format_version: 99 }))).toThrow('newer version');
  });

  it('rejects malformed rows with a readable path', () => {
    const b = sample();
    (b.cards[0] as unknown as Record<string, unknown>).due = 'soon';
    expect(() => parseBackup(JSON.stringify(b))).toThrow('cards[0]: "due" must be a number');
  });
});
