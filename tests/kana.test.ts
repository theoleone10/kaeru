import { buildBackup, parseBackup, backupCounts, isEmptyProgress } from '@/backup/format';
import { migrate } from '@/db/migrations';
import { readAllForBackup, replaceAllFromBackup } from '@/db/repo';
import { ALL_KANA, CONFUSABLE, HIRAGANA, KANA_LESSONS, KATAKANA, getLesson } from '@/kana/data';
import { distractors, lessonPractice, question, requeueMissed, reviewPractice, scorePractice, type KanaStat } from '@/kana/practice';
import { kanaStats, passKanaLessons, passedKanaLessons, recordKanaAnswers } from '@/kana/repo';
import { openNodeDb } from './helpers/nodeDb';

const NOW = +new Date(2026, 9, 11, 12);

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

/** Split a word into course kana, longest match first (きょ before き). */
function tokens(word: string): string[] | null {
  const known = new Set(ALL_KANA.map((k) => k.kana));
  const out: string[] = [];
  for (let i = 0; i < word.length; ) {
    const two = word.slice(i, i + 2);
    if (known.has(two)) {
      out.push(two);
      i += 2;
    } else {
      out.push(word[i]);
      i += 1;
    }
  }
  return out;
}

describe('kana course content', () => {
  it('covers all 46 basic hiragana and katakana, each once', () => {
    const basics = (lessons: typeof HIRAGANA) => lessons.slice(0, 9).flatMap((l) => l.kana.map((k) => k.kana));
    expect(basics(HIRAGANA)).toHaveLength(46);
    expect(basics(KATAKANA)).toHaveLength(46);
    const all = ALL_KANA.map((k) => k.kana);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(KANA_LESSONS.map((l) => l.id)).size).toBe(KANA_LESSONS.length);
  });

  it('pairs hiragana and katakana rows with the same romaji', () => {
    for (let i = 0; i < HIRAGANA.length; i++) {
      expect(KATAKANA[i].kana.map((k) => k.romaji)).toEqual(HIRAGANA[i].kana.map((k) => k.romaji));
    }
  });

  it.each(KANA_LESSONS.map((l) => [l.id, l] as const))('lesson %s: example words use only kana taught so far', (_id, lesson) => {
    const upTo = KANA_LESSONS.filter((l) => l.script === lesson.script).slice(0, KANA_LESSONS.filter((l) => l.script === lesson.script).indexOf(lesson) + 1);
    const allowed = new Set(upTo.flatMap((l) => l.kana.map((k) => k.kana)));
    // Long-vowel dash in katakana from the start; small tsu once combinations are taught.
    if (lesson.script === 'katakana') allowed.add('ー');
    if (upTo.some((l) => l.id === 'h13')) allowed.add('っ');
    if (upTo.some((l) => l.id === 'k13')) allowed.add('ッ');
    expect(lesson.words.length).toBeGreaterThanOrEqual(2);
    for (const w of lesson.words) {
      for (const t of tokens(w.word)!) expect([w.word, t, allowed.has(t)]).toEqual([w.word, t, true]);
    }
  });

  it('only lists course kana as look-alikes', () => {
    const known = new Set(ALL_KANA.map((k) => k.kana));
    for (const g of CONFUSABLE) for (const k of g) expect(known.has(k)).toBe(true);
  });
});

describe('kana practice', () => {
  it('asks every kana of a lesson both ways', () => {
    const lesson = getLesson('h3')!;
    const qs = lessonPractice(lesson, rng(1));
    expect(qs).toHaveLength(10);
    for (const k of lesson.kana) {
      expect(qs.filter((q) => q.kana === k.kana).map((q) => q.direction).sort()).toEqual(['find', 'read']);
    }
  });

  it('offers four distinct choices with exactly one right answer, never a sound-alike', () => {
    const r = rng(2);
    for (const k of ALL_KANA) {
      for (const dir of ['read', 'find'] as const) {
        const q = question(k, dir, getLesson(k.lesson)!.kana, r);
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices).size).toBe(4);
        expect(q.choices.filter((c) => c === q.answer)).toHaveLength(1);
        // じ/ぢ and ず/づ are both right for "ji"/"zu", so only one of each pair is offered.
        const sameSound = ALL_KANA.filter((o) => o.script === k.script && o.romaji === k.romaji).map((o) => (dir === 'read' ? o.romaji : o.kana));
        expect(q.choices.filter((c) => sameSound.includes(c))).toEqual([q.answer]);
      }
    }
  });

  it('prefers look-alikes as wrong answers', () => {
    const shi = ALL_KANA.find((k) => k.kana === 'シ')!;
    const wrong = distractors(shi, 'read', ALL_KANA, rng(4)).map((k) => k.kana);
    expect(wrong.every((k) => ['ツ', 'ン', 'ソ', 'ノ'].includes(k))).toBe(true);
  });

  it('passes a lesson at 80% of first tries, ignoring retries', () => {
    const a = (correct: boolean, retry = false) => ({ kana: 'あ', correct, retry, at: NOW });
    expect(scorePractice([a(true), a(true), a(true), a(true), a(false), a(true, true)]).passed).toBe(true);
    expect(scorePractice([a(true), a(true), a(false), a(false), a(true, true)]).passed).toBe(false);
  });

  it('brings a missed question back once, a little later', () => {
    const qs = lessonPractice(getLesson('h1')!, rng(5));
    const after = requeueMissed(qs, 0, rng(6));
    expect(after).toHaveLength(qs.length + 1);
    const again = after.findIndex((q, i) => i > 0 && q.retry);
    expect(again).toBeGreaterThanOrEqual(3);
    expect(requeueMissed(after, again, rng(7))).toHaveLength(after.length);
  });

  it('reviews the weakest kana first', () => {
    const learned = getLesson('h1')!.kana;
    const stats = new Map<string, KanaStat>(learned.map((k) => [k.kana, { kana: k.kana, correct: 10, wrong: 0, streak: 10, last_at: NOW }]));
    stats.set('え', { kana: 'え', correct: 1, wrong: 5, streak: 0, last_at: NOW });
    const qs = reviewPractice(learned, stats, 2, rng(8));
    expect(qs.map((q) => q.kana)).toContain('え');
  });
});

describe('kana progress', () => {
  it('is stored, backed up, counted, and kept when restoring an older backup', async () => {
    const db = openNodeDb();
    await migrate(db);
    await recordKanaAnswers(db, [
      { kana: 'あ', correct: true, retry: false, at: NOW },
      { kana: 'あ', correct: true, retry: false, at: NOW + 1 },
      { kana: 'い', correct: false, retry: false, at: NOW },
      { kana: 'あ', correct: false, retry: true, at: NOW + 2 },
    ]);
    await passKanaLessons(db, ['h1'], NOW);
    await passKanaLessons(db, ['h1'], NOW + 99);
    expect([...(await passedKanaLessons(db)).entries()]).toEqual([['h1', NOW]]);
    expect((await kanaStats(db)).get('あ')).toEqual({ kana: 'あ', correct: 2, wrong: 1, streak: 0, last_at: NOW + 2 });

    const backup = parseBackup(JSON.stringify(buildBackup(await readAllForBackup(db), NOW)));
    expect(backup.kana!.lessons).toHaveLength(1);
    expect(backupCounts(backup).kanaLessons).toBe(1);
    expect(isEmptyProgress(backupCounts(backup))).toBe(false);

    const other = openNodeDb();
    await migrate(other);
    await replaceAllFromBackup(other, backup, NOW);
    expect((await kanaStats(other)).get('い')!.wrong).toBe(1);

    // A v4 backup has no kana section: the phone keeps its own.
    const { kana: _kana, ...v4 } = backup;
    await replaceAllFromBackup(db, parseBackup(JSON.stringify({ ...v4, format_version: 4 })), NOW);
    expect((await passedKanaLessons(db)).has('h1')).toBe(true);
  });

  it('rejects malformed kana data in a backup', async () => {
    const db = openNodeDb();
    await migrate(db);
    const file = buildBackup(await readAllForBackup(db), NOW);
    expect(() => parseBackup(JSON.stringify({ ...file, kana: { lessons: [{ lesson: 1 }], progress: [] } }))).toThrow('kana.lessons[0]');
  });
});
