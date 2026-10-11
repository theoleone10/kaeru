/** Something Kaeru the frog says on Today: simple Japanese, with an English gloss. */
export interface FrogLine {
  jp: string;
  en: string;
}

/** What the lines are chosen from. */
export interface FrogContext {
  now: number;
  /** Parts of today's plan done, and how many there are. */
  done: number;
  total: number;
  streak: number;
  timerRunning: boolean;
}

function greeting(hour: number): FrogLine {
  if (hour < 5) return { jp: 'まだ起きてる？', en: 'Still up?' };
  if (hour < 11) return { jp: 'おはよう！', en: 'Good morning!' };
  if (hour < 18) return { jp: 'こんにちは！', en: 'Hello!' };
  return { jp: 'こんばんは！', en: 'Good evening!' };
}

const ANYTIME: FrogLine[] = [
  { jp: 'ケロケロ！', en: 'Ribbit ribbit!' },
  { jp: '一歩ずつね。', en: 'One step at a time.' },
  { jp: 'ゆっくりでいいよ。', en: 'No need to rush.' },
  { jp: 'いっしょにがんばろう！', en: 'Let’s do our best together!' },
];

/**
 * Every line that fits right now. Today shows one at random and picks another when the
 * frog is tapped, so it says something different through the day.
 */
export function frogLines(c: FrogContext): FrogLine[] {
  const hour = new Date(c.now).getHours();
  const left = c.total - c.done;
  const lines: FrogLine[] = [greeting(hour)];

  if (c.total > 0 && left === 0) {
    // Finished: only praise, no nudging.
    return [
      { jp: 'おつかれさま！', en: 'Great work today!' },
      { jp: 'よくできました！', en: 'Well done!' },
      { jp: '今日はもうばっちり！', en: 'You’re all set for today!' },
      ...(hour >= 20 ? [{ jp: 'ゆっくり休んでね。', en: 'Get some good rest.' }] : []),
    ];
  }

  if (c.timerRunning) lines.push({ jp: 'その調子！', en: 'Keep it up!' });
  if (left === 1) lines.push({ jp: 'あと少し！', en: 'Almost there!' });
  else if (c.done > 0) lines.push({ jp: 'いい感じ！', en: 'Going well!' });
  else lines.push({ jp: '今日もがんばろう！', en: 'Let’s give it our best today!' });
  if (c.streak >= 2) lines.push({ jp: `${c.streak}日連続！すごい！`, en: `${c.streak} days in a row. Amazing!` });
  if (hour >= 5 && hour < 11) lines.push({ jp: '朝の勉強、えらいね！', en: 'Studying in the morning. Nice!' });
  if (hour >= 21) lines.push({ jp: '寝る前に少しだけ？', en: 'A little before bed?' });
  return [...lines, ...ANYTIME];
}
