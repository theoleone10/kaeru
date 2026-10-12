/**
 * What Kaeru says on the lock screen. Each kind has its own tone: gentle for reviews and
 * the morning plan, cheeky for a streak about to break, loud for wins. Lines rotate by
 * day so the same one doesn't show up twice in a row.
 */

export interface Message {
  title: string;
  body: string;
}

/** A stable pick that changes from day to day (and differs between kinds on the same day). */
export function pick<T>(list: readonly T[], seed: number): T {
  return list[((Math.floor(seed) % list.length) + list.length) % list.length];
}

const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Grammar reviews and flashcards that are due. Gentle, a little Japanese. */
export function reviewsMessage(grammar: number, cards: number, seed: number): Message {
  const parts = [grammar > 0 ? s(grammar, 'grammar review') : '', cards > 0 ? s(cards, 'flashcard') : ''].filter(Boolean);
  const what = parts.join(' and ');
  const n = grammar + cards;
  return pick<Message>(
    [
      { title: 'ケロ！復習の時間だよ 🍃', body: `${what} ${n === 1 ? 'is' : 'are'} ready for you.` },
      { title: 'Reviews are ready 🐸', body: `${what} hopping around, waiting for you.` },
      { title: 'ちょっとだけ復習しよう？', body: `Just a quick one? ${what} to go.` },
      { title: 'Your pond is full 🪷', body: `${what} floated up for review.` },
      { title: 'おかえり！', body: `Perfect timing: ${what} just came due.` },
      { title: 'A few minutes, big gains ✨', body: `Catch ${what} while they're fresh.` },
      { title: 'ケロケロ、待ってるよ', body: `${what} would love a visit.` },
      { title: 'Memory check-in 🧠', body: `${what} ${n === 1 ? 'is' : 'are'} due. Remembering now keeps it for weeks.` },
      { title: '復習タイム！', body: `${what}. Hop to it! 🐸` },
      { title: 'Tiny task, happy frog', body: `Clear ${what} and Kaeru does a little dance.` },
    ],
    seed,
  );
}

/** Evening warning: studied yesterday, nothing yet today. Cheeky. */
export function streakMessage(days: number, seed: number): Message {
  const d = s(days, 'day');
  return pick<Message>(
    [
      { title: `${d}... gone at midnight?? 👀`, body: 'One review is all it takes. The frog is watching.' },
      { title: 'Your streak is sweating 💦', body: `${d} in a row, and it ends tonight unless you show up.` },
      { title: 'えっ、今日はまだ？', body: `No study yet today. Your ${d} streak is on the line.` },
      { title: 'The frog is disappointed 🐸', body: `Not angry. Just disappointed. Save your ${d} streak?` },
      { title: `Don't let ${d} croak`, body: 'Two minutes of reviews keeps it alive. Ribbit.' },
      { title: 'ケロ…さびしい', body: `Kaeru misses you. Also your ${d} streak does.` },
      { title: 'Streak emergency 🚨', body: `${d} streak, a few hours left. This is not a drill.` },
      { title: 'Hey. Psst. 👀', body: `Your ${d} streak resets at midnight. Just saying.` },
      { title: 'まだ間に合う！', body: `There's still time to keep your ${d} streak going.` },
      { title: 'Plot twist: you study today', body: `Keep the ${d} streak alive. You've got this.` },
    ],
    seed,
  );
}

/** A day or more without studying. Sweet with a wink. */
export function comebackMessage(seed: number): Message {
  return pick<Message>(
    [
      { title: 'ケロ？どこ行ったの？', body: 'Kaeru has been staring at the door. Come say hi?' },
      { title: 'The pond is quiet without you 🪷', body: 'Start a fresh streak with one lesson today.' },
      { title: 'No guilt, just frogs 🐸', body: "Pick up right where you left off. It's all saved." },
      { title: 'おかえりの準備できてるよ', body: 'Your reviews are waiting. Five minutes is plenty.' },
      { title: 'New streak, who dis', body: 'Day 1 starts with a single review.' },
      { title: 'Kaeru wrote you a haiku', body: 'Quiet little pond / a frog waits for its learner / please come back today' },
      { title: '一日一歩', body: 'One step a day. Today can be step one again.' },
      { title: "We kept your seat warm 🔥", body: 'Grammar, flashcards, a bit of immersion. Your pick.' },
    ],
    seed,
  );
}

/** Morning: today's plan in one line. Gentle and upbeat. */
export function planMessage(summary: string, seed: number, milestone?: number): Message {
  if (milestone) {
    return pick<Message>(
      [
        { title: `Today makes ${milestone} days in a row! 🎯`, body: summary },
        { title: `あと一日で${milestone}日連続！`, body: `One more day to hit ${milestone}. ${summary}` },
        { title: `Day ${milestone} is calling 📣`, body: summary },
      ],
      seed,
    );
  }
  return pick<Message>(
    [
      { title: 'おはよう！今日のプラン 🐸', body: summary },
      { title: "Today's pond 🪷", body: summary },
      { title: 'ケロ！今日もがんばろう', body: summary },
      { title: 'A tiny plan for today ✨', body: summary },
      { title: "Here's what's hopping today", body: summary },
      { title: '今日のメニュー', body: summary },
      { title: 'Ready when you are 🐸', body: summary },
      { title: 'Small steps, every day', body: summary },
    ],
    seed,
  );
}

/** Today's practice goal reached while the timer runs. Celebratory. */
export function goalMessage(goal: string, seed: number): Message {
  return pick<Message>(
    [
      { title: `すごい！${goal} done today 🎉`, body: 'Daily practice goal: crushed. Keep going if you like!' },
      { title: 'Goal reached! 🐸🎉', body: `${goal} of practice today. Kaeru is doing backflips.` },
      { title: 'やった！', body: `That's your ${goal} for today. Everything from here is bonus.` },
      { title: 'Practice goal ✅', body: `${goal} in the bag. Nice work.` },
      { title: 'Ribbit of approval 🐸', body: `You hit ${goal} today.` },
      { title: '目標達成！', body: `${goal} of practice. Your brain thanks you.` },
      { title: 'Look at you go ✨', body: `${goal} done. Stop whenever you like.` },
      { title: 'That is a lot of Japanese', body: `${goal} goal reached. お疲れさま!` },
    ],
    seed,
  );
}

/** A streak milestone hit today. */
export function streakMilestoneMessage(days: number, seed: number): Message {
  return pick<Message>(
    [
      { title: `すごい！${days}-day streak! 🎉`, body: `${days} days in a row. Kaeru is very proud.` },
      { title: `${days} days straight 🔥`, body: 'Consistency is the whole secret. You have it.' },
      { title: `${days}日連続達成！`, body: 'This calls for a celebratory croak. 🐸' },
      { title: `Milestone: ${days} days 🏆`, body: 'Most people quit. You kept showing up.' },
      { title: `${days}! ${days}!! 🎊`, body: `That's a ${days}-day streak. Unreal.` },
      { title: 'Streak legend 🐸👑', body: `${days} days in a row and counting.` },
    ],
    seed,
  );
}

/** Every grammar point of a JLPT level learned. */
export function levelMessage(level: string, seed: number): Message {
  return pick<Message>(
    [
      { title: `${level} complete! 🎓`, body: `Every ${level} grammar point learned. おめでとう!` },
      { title: `おめでとう！${level}クリア 🎉`, body: 'A whole JLPT level of grammar. Huge.' },
      { title: `You finished ${level} 🐸🏆`, body: 'Kaeru is throwing a pond party.' },
      { title: `${level}: done ✅`, body: 'On to the next line. You earned a break first.' },
    ],
    seed,
  );
}

/** A timer that's been running for hours (probably forgotten). */
export function longTimerMessage(hours: number, activity: string, seed: number): Message {
  const h = s(hours, 'hour');
  return pick<Message>(
    [
      { title: `Still on ${activity}? ⏱️`, body: `Your timer has been running for ${h}. Tap to stop it if you're done.` },
      { title: 'タイマー、まだ動いてるよ', body: `${activity} has been going for ${h}.` },
      { title: `${h} of ${activity}! 😮`, body: 'Impressive, or a forgotten timer? Tap to check.' },
      { title: 'Kaeru noticed something 👀', body: `The ${activity} timer is at ${h}. Still going?` },
      { title: 'Marathon mode? 🏃', body: `${h} of ${activity} so far. Stop the timer if you're done.` },
      { title: 'ケロ？まだやってる？', body: `${activity} timer: ${h} and counting.` },
    ],
    seed,
  );
}
