# grammarapp

A personal, offline JLPT grammar trainer (N5 → N1) inspired by Bunpro. Expo SDK 57 + React Native + TypeScript, Expo Router, SQLite, FSRS.

## Run it on your phone (Expo Go)

1. Install **Expo Go** from the App Store / Play Store (it must support SDK 57).
2. On your computer:
   ```bash
   npm install
   npx expo start
   ```
3. Scan the QR code (iOS: Camera app; Android: Expo Go). Phone and computer must be on the same Wi-Fi — if that's awkward, use `npx expo start --tunnel`.

Everything used runs in Expo Go; no development build is needed yet. (Review reminders are *local* notifications, which Expo Go supports.)

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Jest tests: SRS scheduling, answer checking, romaji input, furigana, reminders, backup format, and validation of every file in `/content` |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (expo config) |

## Editing grammar content

Content lives in `content/n5.json` … `content/n1.json`, one file per level, in curriculum order (simplest first). The shape is described by `content/grammar.schema.json`, so VS Code will autocomplete and flag mistakes. After editing, run `npm test` — the content test checks things like:

- furigana markup `{漢字|かんじ}` matches the `japanese` sentence exactly
- `cloze_target` occurs in the sentence (set `cloze_occurrence` if it appears more than once) and doesn't split a furigana group
- `cloze_target` is listed in `accepted_answers`
- ids are unique, `related_ids` exist, and each point has 4–6 examples

Keep `id`s stable once you've reviewed a point — progress is stored by id.

**Answers:** `accepted_answers` are all marked correct (list kanji and kana spellings). `valid_alternatives` are grammatical-but-not-the-target answers: the app shows the note and lets you retry instead of marking you wrong.

## How it works

- **Lessons** → reading pages for a batch (default 4, daily limit 12), then a quiz. The quiz is a normal review session restricted to the new points, so first answers feed FSRS directly; misses come back until answered correctly.
- **Reviews** → type the missing grammar. Romaji is converted to kana as you type (wanakana, IME mode); Japanese-keyboard input is never altered. Typing `wa`/`e`/`o` where the particle は/へ/を is expected gives a "Close!" retry rather than a fail. Sentences rotate so you don't memorise one.
- **SRS** → [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), retention 0.9, one 10-minute (re)learning step, pass/fail grading (Good/Again). **Undo** restores the card exactly as it was before the answer.
- **Storage** → SQLite (`src/db/migrations.ts`), fully offline. Settings → Backup exports/imports everything as JSON.

## Layout

```
src/app/            screens (Expo Router): (tabs)/index, grammar, review; lessons; grammar/[id]; settings
src/components/     UI: ReviewSession, LessonContent, Furigana/ClozeSentence, ForecastChart
src/srs/            FSRS wrapper, queue, sentence rotation, forecast, lesson batching
src/review/         answer normalisation + checking, romaji input
src/notifications/  reminder planning (pure) + scheduling
src/db/             schema migrations + queries
content/            grammar JSON + schema
tests/              Jest tests
```

## Web preview

`npx expo start --web` runs the app in a browser for quick checks (notifications are disabled there). The real target is the phone.
