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

## Web preview

`npx expo start --web` runs the app in a browser for quick checks (notifications are disabled there). The real target is the phone.

## Getting it on the App Store — step by step

Everything in the code is done; what's left needs your accounts, so only you can do it. Budget: $99/year (Apple). Supabase and Google are free at this size. Plan on an afternoon, plus 1–3 days waiting for Apple.

### 0. On your computer (once)

1. Install [Node.js 22+](https://nodejs.org) and Git, then:
   ```bash
   git clone https://github.com/theoleone10/kaeru.git
   cd kaeru
   npm install
   npx eas-cli@latest login          # create a free Expo account at expo.dev first
   npx eas-cli@latest init           # links the project to your Expo account (writes the projectId into app.json — commit it)
   ```
2. The store name is **Kaeru** (`expo.name` in `app.json`) — check it's still free by searching the App Store before you submit; App Store Connect names are max 30 characters, so you have room to add a subtitle like "Kaeru – JLPT Grammar" if it's taken.

### 1. Apple Developer account

1. Enrol at [developer.apple.com/programs](https://developer.apple.com/programs/enroll/) as an individual ($99/year). Approval takes anywhere from minutes to 48 hours.
2. In [Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list), open the App ID `com.theoleone.kaeru` once the first build has created it (step 4), or create it now, and make sure **Sign In with Apple** is ticked. (If you want a different bundle ID, change `ios.bundleIdentifier` in `app.json` *before* the first build — it can't change after release.)
3. In [App Store Connect → Apps](https://appstoreconnect.apple.com/apps) → **+ New App**: platform iOS, your store name, primary language English, bundle ID `com.theoleone.kaeru`, SKU `kaeru`, full access.

### 2. Supabase (accounts + cloud backup)

Skip this whole step if you want to ship without accounts: with no Supabase values the app has no sign-in screens and works fully offline. (Then in step 6 say the app collects no data.)

1. Create a free project at [supabase.com](https://supabase.com) (pick the region nearest you; save the database password somewhere safe).
2. **SQL Editor** → New query → paste the contents of `supabase/migrations/20260929000000_accounts.sql` → **Run**.
3. **Project Settings → API**: copy the *Project URL* and the *publishable / anon* key.
4. **Authentication → URL Configuration → Redirect URLs**: add `kaeru://**` (and `exp://**` if you'll test sign-in in Expo Go).
5. **Authentication → Sign In / Providers**:
   - **Email**: already on. Leave "Confirm email" on.
   - **Apple**: turn on, and in *Client IDs* enter `com.theoleone.kaeru`. That's all native iPhone sign-in needs. (Apple sign-in on Android additionally needs a Services ID + key from the Apple portal; skip unless you ship Android.)
   - **Google**: in [Google Cloud Console](https://console.cloud.google.com) create a project → **APIs & Services → OAuth consent screen** (External, app name, your email, publish it) → **Credentials → Create credentials → OAuth client ID**, type *Web application*, and add the *Callback URL* Supabase shows on its Google provider page as an authorised redirect URI. Paste the client ID and secret back into Supabase and turn Google on.
     - For the native iOS sign-in sheet, create a second OAuth client ID of type *iOS* with bundle ID `com.theoleone.kaeru`. Put both client IDs in `src/auth/google.ts`, put the iOS client's reversed ID (`com.googleusercontent.apps.…`) as `iosUrlScheme` on the google-signin plugin in `app.json`, and in Supabase's Google provider add the iOS client ID to **Client IDs** (comma-separated after the web one) and turn on **Skip nonce checks**.
6. Give the build these values (the `.env` file is never uploaded, so EAS needs its own copy):
   ```bash
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR-PROJECT.supabase.co" --visibility plaintext
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_KEY --value "YOUR-ANON-KEY" --visibility plaintext
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPPORT_EMAIL --value "you@example.com" --visibility plaintext
   ```
   (Repeat with `--environment preview` if you'll make preview builds. For running locally, copy `.env.example` to `.env` and fill in the same values.)

### 3. Privacy policy page

App Store Connect needs a public URL. The text is already written in `src/legal/text.ts` (Privacy Policy and Terms). Paste both into a free page — e.g. a public [Notion](https://notion.so) page or a GitHub Pages site — and keep the URLs. If you skipped Supabase, delete the "Data stored with an account" section first.

### 4. Build

```bash
npx eas-cli@latest build --platform ios --profile production
```
- Sign in with your Apple ID when asked and let EAS **create the distribution certificate and provisioning profile** (answer yes to each prompt).
- The build runs in the cloud (~15–25 min). The build number increases automatically each time.

### 5. Test it on your iPhone (TestFlight)

```bash
npx eas-cli@latest submit --platform ios --latest
```
- When asked, let EAS create an App Store Connect API key.
- After ~10–30 min of processing, open App Store Connect → your app → **TestFlight**, add yourself as an internal tester, and install the **TestFlight** app on your phone. Try: a lesson, reviews, sign up with email / Apple / Google, Settings → Delete account, the timer from a Shortcut, and an Anki import.
- Found a bug? Fix it, run step 4 and 5 again.

### 6. Fill in the App Store listing

In App Store Connect → your app:

- **App Information**: category *Education* (secondary *Reference*), content rights: no third-party content, age rating questionnaire → all "None" → **4+**.
- **Pricing and Availability**: Free, all countries (or pick).
- **App Privacy** → Privacy Policy URL (step 3), then *Data collection*:
  - With accounts: **Contact Info → Email Address** and **User Content → Other User Content** (study progress). For both: *used for App Functionality*, *linked to the user*, *not used for tracking*.
  - Without accounts: "No, we do not collect data".
- **Version 1.0 page**:
  - Screenshots: at least one set for **6.9" iPhone** (1320 × 2868). Take them on an iPhone 16/17 Pro Max or in the Xcode simulator (Cmd+S). Good ones: Home, the train map, a review with the green "Nice!" panel, Track, Decks.
  - Promotional text, description, keywords (e.g. `japanese,grammar,jlpt,n5,n4,n3,anki,srs,bunpro,study,nihongo`), support URL (your privacy page or any contact page), marketing URL optional.
  - **Build**: pick the build from step 5.
  - **App Review Information**: your contact details, and under *Sign-in required* either untick it (sign-in is optional — mention that the app is fully usable via **Use without an account**) or give a demo email + password you created in the app.
  - **Notes** for the reviewer, e.g.: "Sign-in is optional. Anki import accepts .apkg files exported from Anki. Timer links (kaeru://timer/start) are for the user's own iOS Shortcuts."
- Export compliance is answered automatically (the app declares no non-exempt encryption).

### 7. Submit

Click **Add for Review → Submit**. Review usually takes 1–3 days. If Apple rejects something, the message says which guideline — fix, rebuild (step 4), resubmit (step 5 + pick the new build).

### After launch

**Releasing:** work happens on `dev`; merging `dev` into `master` ships it, through **Xcode Cloud** (App Store Connect is connected to this GitHub repo). Xcode Cloud clones the repo and runs `ios/ci_scripts/ci_post_clone.sh`, which installs Node and CocoaPods, runs `npm ci`, writes `.env`, and generates the native project with `expo prebuild`. Then it archives `ios/Kaeru.xcworkspace`, signs it with Apple's cloud-managed certificates, and uploads it to TestFlight. It does not send the version to App Review: pick the build on the version page and click **Add for Review** yourself. The build number is `1000 +` Xcode Cloud's build number; the version comes from `app.json`.

`ios/` is generated and ignored by git, except `ios/ci_scripts/`. `npx expo prebuild --clean` deletes that folder on your machine too; bring it back with `git checkout ios/ci_scripts`.

One-time setup, in App Store Connect → the app → **Xcode Cloud → Manage Workflows** (or Xcode → Report navigator → Cloud):

1. **Workflow:** product *Kaeru*, workspace `ios/Kaeru.xcworkspace`, scheme *Kaeru*.
2. **Start condition:** *Branch Changes* on `master`.
3. **Actions:** *Archive – iOS*, deployment preparation *App Store Connect*.
4. **Post-actions:** *TestFlight Internal Testing* (or External) so builds appear in TestFlight.
5. **Environment → Environment Variables:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (mark it *Secret*) and `EXPO_PUBLIC_SUPPORT_EMAIL`, with the production values from `.env`. Add `APPLE_TEAM_ID` too if a build says no team is selected for signing.

Bump `version` in `app.json` before merging a release whose previous version is already live; Apple won't accept a new build for an approved version.

- **Content-only or JS fixes** can go out without review via OTA updates: `npx eas-cli@latest update --channel production` (set up once with `npx eas-cli@latest update:configure`).
- **New native modules or app.json changes** need a new build (step 4) and review.
- Bump `version` in `app.json` (e.g. 1.0.1) for each store release.

### Known gaps to be aware of

- Apple asks apps with Sign in with Apple to also revoke the Apple token when an account is deleted. The app does this through the `revoke-apple` edge function (`supabase/functions/revoke-apple`): deploy it with `npx supabase functions deploy revoke-apple` and set its secrets (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID`). Without it, deleting still works and only the revoke is skipped.
- Anki media (images, audio, fonts) stays on the phone; decks, cards and their progress are backed up. On Android, deck fonts loaded with `@font-face` may not show, because the card WebView isn't allowed to read files from other files (so a deck's scripts can't read the app's data).
