import { buildBackup, backupCounts, describeCounts, parseBackup } from '@/backup/format';
import { allLevelFiles, curriculum } from '@/content/loader';
import { migrate } from '@/db/migrations';
import { readAllForBackup, replaceAllFromBackup, resetPoint } from '@/db/repo';
import { calibrate, devGrader } from '@/sentence/grader';
import { hintFor } from '@/sentence/hints';
import { normalizeSentence, pointConfig, precheck, usesTarget } from '@/sentence/precheck';
import { getSentenceStatus, saveAttempt, sentenceDoneIds, type SentenceAttempt } from '@/sentence/repo';
import { DEFAULT_SETTINGS, sanitizeSettings } from '@/state/settings';
import feedback from '../content/sentences/feedback.json';
import { openNodeDb } from './helpers/nodeDb';

const at = (d: number, h = 12) => +new Date(2026, 10, d, h);

describe('sentence content', () => {
  it('has a config for every grammar point, and nothing else', () => {
    for (const p of curriculum) expect(pointConfig(p.id)).toBeDefined();
    const ids = new Set(curriculum.map((p) => p.id));
    const cfg = require('../content/sentences/points.json').points as Record<string, unknown>;
    for (const id of Object.keys(cfg)) expect(ids.has(id)).toBe(true);
  });

  it("matches every example's cloze target with the point's own target forms", () => {
    for (const f of allLevelFiles) {
      for (const p of f.points) for (const e of p.examples) expect([p.id, e.id, usesTarget(p.id, e.japanese)]).toEqual([p.id, e.id, true]);
    }
  });

  it('has generic hints for every error type', () => {
    for (const k of ['missing_target', 'copied', 'too_short', 'too_long', 'not_japanese', 'multiple', 'connection', 'meaning', 'register', 'particle', 'lookalike', 'ungrammatical', 'unnatural']) {
      expect((feedback._generic as Record<string, string>)[k]).toBeTruthy();
    }
    expect(hintFor('n5-mo', 'missing_target')).toContain('Use ');
    expect(hintFor('n5-mo', 'missing_target')).not.toContain('{title}');
  });
});

describe('precheck', () => {
  const point = curriculum.find((p) => p.id === 'n3-tte')!;

  it('passes an original sentence that uses the point', () => {
    expect(precheck(point.id, 'あの映画って、本当に面白いの？')).toBeNull();
  });

  it('catches short, long, non-Japanese, missing and multiple sentences', () => {
    expect(precheck(point.id, 'って')).toBe('too_short');
    expect(precheck(point.id, 'あ'.repeat(81) + 'って')).toBe('too_long');
    expect(precheck(point.id, 'this is not japanese tte')).toBe('not_japanese');
    expect(precheck(point.id, '明日は雨が降ります。')).toBe('missing_target');
    expect(precheck(point.id, '彼、来ないって。明日は雨だって。')).toBe('multiple');
  });

  it('allows closing quotes and brackets after the last full stop', () => {
    expect(precheck(point.id, '「彼、会社を辞めるんだって。」')).not.toBe('multiple');
  });

  it('rejects copies of the lesson examples, even with small changes', () => {
    expect(precheck(point.id, point.examples[0].japanese)).toBe('copied');
    expect(precheck(point.id, point.examples[0].japanese.replace('。', '！'))).toBe('copied');
  });

  it('normalizes full-width ASCII and zero-width characters', () => {
    expect(normalizeSentence('ＡＢＣ​って？ ')).toBe('ABCって？');
  });
});

describe('grading', () => {
  it('dev grader: prechecks decide, otherwise correct', async () => {
    expect(await devGrader.grade('n3-tte', '明日は雨です。')).toMatchObject({ verdict: 'incorrect', errorType: 'missing_target', modelVersion: 'precheck' });
    expect(await devGrader.grade('n3-tte', 'あの映画って、本当に面白いの？')).toMatchObject({ verdict: 'correct', errorType: null });
  });

  it('calibrate: bands and top error type', () => {
    const t = { accept: 0.8, reject: 0.3 };
    const types = ['connection', 'meaning', 'register'];
    expect(calibrate(0.9, [0, 0, 0], types, t)).toEqual({ verdict: 'correct', errorType: null });
    expect(calibrate(0.5, [0, 0, 0], types, t)).toEqual({ verdict: 'unsure', errorType: null });
    expect(calibrate(0.1, [0.1, 2, -1], types, t)).toEqual({ verdict: 'incorrect', errorType: 'meaning' });
  });
});

describe('settings', () => {
  it('sentence practice is off by default and survives older settings', () => {
    expect(DEFAULT_SETTINGS.sentencePracticeEnabled).toBe(false);
    expect(sanitizeSettings({}).sentencePracticeEnabled).toBe(false);
    expect(sanitizeSettings({}).graderAutoDownload).toBe(true);
    expect(sanitizeSettings({ sentencePracticeEnabled: true }).sentencePracticeEnabled).toBe(true);
    expect(sanitizeSettings({ sentencePracticeEnabled: 'yes' }).sentencePracticeEnabled).toBe(false);
  });
});

describe('sentence attempts', () => {
  const attempt = (over: Partial<SentenceAttempt>): SentenceAttempt => ({
    grammar_id: 'n3-tte',
    sentence: 'あの映画って、面白いの？',
    verdict: 'incorrect',
    error_type: 'meaning',
    source: 'lesson',
    model_version: 'dev',
    created_at: at(1),
    ...over,
  });

  it('is done once any attempt is correct, keeping the latest correct one', async () => {
    const db = openNodeDb();
    await migrate(db);
    await saveAttempt(db, attempt({ created_at: at(1) }));
    expect((await getSentenceStatus(db, 'n3-tte')).done).toBe(false);
    await saveAttempt(db, attempt({ verdict: 'correct', error_type: null, sentence: 'A', created_at: at(2) }));
    await saveAttempt(db, attempt({ verdict: 'correct', error_type: null, sentence: 'B', created_at: at(3) }));
    await saveAttempt(db, attempt({ created_at: at(4) }));
    const s = await getSentenceStatus(db, 'n3-tte');
    expect(s.done).toBe(true);
    expect(s.best?.sentence).toBe('B');
    expect(s.lastAttempt?.verdict).toBe('incorrect');
    expect([...(await sentenceDoneIds(db))]).toEqual(['n3-tte']);
    await resetPoint(db, 'n3-tte');
    expect((await getSentenceStatus(db, 'n3-tte')).done).toBe(false);
  });

  it('round-trips through a v6 backup and keeps the phone’s own on an older one', async () => {
    const db = openNodeDb();
    await migrate(db);
    await saveAttempt(db, attempt({ verdict: 'correct', error_type: null }));
    const data = await readAllForBackup(db);
    const file = parseBackup(JSON.stringify(buildBackup(data, at(5))));
    expect(file.sentence_attempts).toHaveLength(1);
    expect(backupCounts(file).sentencesDone).toBe(1);
    expect(describeCounts({ ...backupCounts(file), points: 0, reviews: 0 })).toBe('1 sentence');

    const other = openNodeDb();
    await migrate(other);
    await replaceAllFromBackup(other, file, at(5));
    expect((await getSentenceStatus(other, 'n3-tte')).done).toBe(true);

    // A v5 file has no sentence_attempts: restoring it keeps what the phone has.
    const { sentence_attempts: _s, ...v5 } = file;
    await replaceAllFromBackup(other, { ...v5 }, at(6));
    expect((await getSentenceStatus(other, 'n3-tte')).done).toBe(true);
  });

  it('rejects malformed attempts in a backup', () => {
    const base = buildBackup({ cards: [], review_logs: [], example_seen: [], settings: {}, activities: [], time_entries: [] }, at(1));
    expect(() => parseBackup(JSON.stringify({ ...base, sentence_attempts: [{ grammar_id: 'x', verdict: 'maybe' }] }))).toThrow('sentence_attempts[0]');
  });
});
