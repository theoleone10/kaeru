import { frogLines } from '@/daily/frogLines';

const at = (h: number) => new Date(2026, 9, 11, h).getTime();
const base = { done: 0, total: 3, streak: 0, timerRunning: false };

describe('frogLines', () => {
  it('greets for the time of day', () => {
    expect(frogLines({ ...base, now: at(8) })[0].jp).toBe('おはよう！');
    expect(frogLines({ ...base, now: at(14) })[0].jp).toBe('こんにちは！');
    expect(frogLines({ ...base, now: at(20) })[0].jp).toBe('こんばんは！');
    expect(frogLines({ ...base, now: at(2) })[0].jp).toBe('まだ起きてる？');
  });

  it('only praises once the day is done', () => {
    const lines = frogLines({ ...base, now: at(14), done: 3 });
    expect(lines.map((l) => l.jp)).toContain('おつかれさま！');
    expect(lines.map((l) => l.jp)).not.toContain('今日もがんばろう！');
  });

  it('mentions the streak and the last step', () => {
    const jp = frogLines({ ...base, now: at(14), done: 2, streak: 5 }).map((l) => l.jp);
    expect(jp).toContain('あと少し！');
    expect(jp).toContain('5日連続！すごい！');
  });
});
