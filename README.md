# kaeru

A JLPT grammar trainer (N5 → N1). Expo SDK 57 + React Native + TypeScript, Expo Router, SQLite, FSRS. Works fully offline; optional accounts (Apple, Google, email) back progress up to Supabase.

## Run it on your phone (Expo Go)

1. Install **Expo Go** from the App Store / Play Store (it must support SDK 57).
2. On your computer:
   ```bash
   npm install
   npx expo start
   ```
3. Scan the QR code (iOS: Camera app; Android: Expo Go). Phone and computer must be on the same Wi-Fi — if that's awkward, use `npx expo start --tunnel`.

Everything except native Sign in with Apple runs in Expo Go (review reminders are *local* notifications). Without a `.env` the app has no accounts and behaves exactly as an offline app. To test sign-in on a phone use a development build: `npx eas-cli@latest build --profile development`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Jest tests: SRS scheduling, answer checking, romaji input, furigana, reminders, backup format and restore (including Anki decks), cloud sync, time tracking, Anki import (real `.apkg` fixtures through the real migrations on Node's SQLite) and rendering, and validation of every file in `/content` |
| `npm run test:zones` | The tests in four time zones (UTC, Tokyo, New York, Auckland): day boundaries, quiet hours and streaks use local time. CI runs the same four |
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

The app is built around one daily routine, shown on the **Today** tab. The routine has up to four steps, and a step that doesn't apply to you is left out:

1. **Learn**: today's 1–2 new grammar points, then a short quiz.
2. **Review**: grammar that's due.
3. **Flashcards**: your Anki decks.
4. **Immerse**: reach your daily time goal.

Each step shows its progress. One button always takes you to the next step. When a session ends, it offers the next step or a way back to Today. Your streak counts any study: grammar, flashcards or tracked time.

- **Tabs** → Today · Grammar (the train map) · Cards (your Anki decks) · Timer. Tap the streak at the top of Today for Progress.
  - Timer is a big start / stop button with the time on the clock: pick an activity, tap Start (picking another while it runs switches over). Its ⋯ menu adds past entries, sets up Shortcuts, manages activities and imports from Toggl.
  - Progress (from the streak on Today) is all the stats on one page: your streak and a 7-day table of grammar reviews, flashcards and minutes tracked, each JLPT level's progress, the next 24 hours of reviews, then time tracking's totals, 7-day chart and editable history.
- **Lessons** → you read each new point, then take a quiz.
  - **Size:** the quiz asks 3 different sentences per point. A missed sentence comes back once at the end, and that retry isn't scored.
  - **Passing:** a point passes with at most one miss out of three.
  - **Entering reviews:** a point you pass goes into reviews with its first review in about 2 days. A point you don't pass comes back within 10 minutes.
  - **Next sentences:** quiz sentences count as seen, so your reviews start with sentences you haven't met yet.
  - **Leaving early:** a point is only added once you finish the quiz.
- **Settings → Daily plan** sets new grammar per day (1–5, default 2) and the daily time goal (default 30m, or Off). *Learn one more* on Today lets you go past the goal.
- **Reviews** → type the missing grammar. Romaji is converted to kana as you type (wanakana, IME mode); Japanese-keyboard input is never altered. Typing `wa`/`e`/`o` where the particle は/へ/を is expected gives a "Close!" retry rather than a fail. Sentences rotate so you don't memorise one.
- **SRS** → [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), retention 0.9, one 10-minute (re)learning step, pass/fail grading (Good/Again). **Undo** restores the card exactly as it was before the answer.
- **Storage** → SQLite (`src/db/migrations.ts`), fully offline. Settings → Backup file exports/imports everything as JSON: grammar progress, settings, time tracking and Anki decks with their progress. Anki images and audio aren't included (they can be hundreds of MB); after restoring on a new phone, re-import the decks' `.apkg` files to bring them back, and the newer progress is kept.
- **Time tracking** → a Toggl-style timer (Immersion, Study, or your own activities).
  - **Where:** start and stop it on the Timer tab or from the chips on Today; daily and weekly totals, a 7-day chart and editable history are on Progress.
  - **Time in Kaeru:** time with the app open logs to Study in the background when no timer is running. It counts on Progress and toward the daily goal, but not in the Timer tab's totals (Settings → Time tracking).
  - **Toggl import:** you can import past time from a Toggl *Detailed report* CSV (Timer → ⋯).
- **iOS Shortcuts and Siri** → Kaeru adds *Start Timer*, *Stop Timer* and *Start or Stop Timer* actions (with an activity picker) and Siri phrases such as "Start Immersion in Kaeru". They run without opening the app: each queues a command in `Documents/timer-inbox`, which the app applies with the original time when it's next active, and the app mirrors its activities and running timer to `Documents/timer-state.json` for the actions to read (`src/time/shortcutInbox.ts`). The Swift lives in `plugins/app-intents/` and a config plugin adds it to the app target at build time, so it needs a development or App Store build (not Expo Go) and iOS 16+.
- **Timer links** → the timer can also be driven by links, so any Shortcut (or Siri, Back Tap, the Action button, a Home Screen icon, or Android automation apps) can start and stop it with an *Open URLs* action:
  - `kaeru://timer/start?activity=Immersion&note=Anime` (starting another activity stops the current one)
  - `kaeru://timer/stop`
  - `kaeru://timer/toggle?activity=Study` (one button to start / stop)
  Timer → ⋯ → *Set up iPhone Shortcuts* lists copyable links. The app opens briefly to record the time.
- **Anki decks** → Cards tab → Import imports an `.apkg` / `.colpkg` exported from Anki with *Include scheduling information* and *Include media*. Both package formats are read (Anki ≤ 2.1.49 and the current zstd/protobuf format). Notes, note types (templates + CSS), decks and subdecks, media, review history and each card's progress come across: if you used FSRS in Anki its memory state is used directly, otherwise stability ≈ current interval and difficulty is estimated from ease. Cards render in a WebView with Anki's template language (fields, conditionals, cloze, furigana/kana/kanji, hint, FrontSide, [sound:]). Reviews use FSRS with Anki's four buttons, 1m/10m learning steps, and per-day new/review limits: defaults in Settings → Anki decks, and each deck's own in its options (⚙︎ on the Cards tab, which can also delete it). Like Anki, a subdeck's own limit still applies when you study its parent. Re-importing a newer export of the same deck updates it; for each card the more recently reviewed copy wins. `{{type:}}` fields show the answer instead of a typing box, and add-on-specific template features aren't supported.
- **Accounts (optional)** → Supabase Auth. The first launch shows a welcome screen (Apple / Google / email, or *Use without an account*). A signed-in phone uploads the same backup JSON to `user_progress` when the app goes to the background or comes back, but only if something changed (a trigger-maintained counter in `sync_state` tracks changes). Signing in on a phone that already has progress (grammar, flashcards or time entries) asks which copy to keep; an empty side never silently replaces the other. Settings → Account has back up now, sign out and delete account.

## Look & feel

Friendly and focused: cool paper background, aizome (Japanese indigo) primary, chunky 3D buttons that press down (with a haptic tick), lipped cards, Nunito for UI text and Zen Maru Gothic for Japanese (only two Japanese weights ship, ~3.7 MB each). Kaeru the frog (`src/components/Mascot.tsx`) is the mascot, drawn to match the app icon, and reacts to how you're doing; its face on its own (`Logo`) is the Today tab icon and the Settings footer, soft sound effects play for answers, timers and finished sessions (generated by `scripts/make-sounds.py`; they mix with your music/podcasts, respect the silent switch and can be turned off in Settings), finished lessons and good review sessions end with confetti (skipped with Reduce Motion), and light/dark follow the system (or Settings). The Grammar tab is a train map: each JLPT level is a coloured line, each point a numbered station (N5-12), units are transfers, and a platform-style sign shows your current stop. Palette, fonts and line colours live in `src/theme/colors.ts`; the chunky components in `src/components/ui.tsx`.

## Layout

```
src/app/            screens (Expo Router): (tabs)/index (Today), grammar, decks, progress; lessons; review; grammar/[id]; settings;
                    welcome, sign-in, email-auth, new-password, auth-callback, legal/privacy, legal/terms
src/auth/           Supabase client, AuthProvider (Apple / Google / email), redirect parsing
src/sync/           cloud backup upload / restore / reconcile
src/time/           time tracking: model (totals, Toggl CSV, Shortcut links), repo, provider, auto-tracking
src/anki/           Anki import (package unzip, collection reader, protobuf, store), template rendering, FSRS scheduling, deck queries
src/legal/          privacy policy + terms text (publish the same text at a public URL)
supabase/           database migration (progress table, row-level security, delete_account)
src/components/     UI: ReviewSession, LessonContent, Furigana/ClozeSentence, ForecastChart
src/daily/          the daily plan (pure) and useToday (what's due across grammar, flashcards and time)
src/srs/            FSRS wrapper, queue, sentence rotation, forecast, lesson batching, post-lesson quiz
src/review/         answer normalisation + checking, romaji input
src/notifications/  reminder planning (pure) + scheduling
src/db/             schema migrations + queries
content/            grammar JSON + schema
tests/              Jest tests
```

