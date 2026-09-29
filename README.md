# grammarapp

A JLPT grammar trainer (N5 → N1) inspired by Bunpro, covering every section of Tae Kim's *Guide to Japanese Grammar*. Expo SDK 57 + React Native + TypeScript, Expo Router, SQLite, FSRS. Works fully offline; optional accounts (Apple, Google, email) back progress up to Supabase.

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
- **Storage** → SQLite (`src/db/migrations.ts`), fully offline. Settings → Backup file exports/imports everything as JSON.
- **Accounts (optional)** → Supabase Auth. The first launch shows a welcome screen (Apple / Google / email, or *Use without an account*). A signed-in phone uploads the same backup JSON to `user_progress` whenever the app goes to the background; signing in on a phone that already has progress asks which copy to keep. Settings → Account has back up now, sign out and delete account.

## Layout

```
src/app/            screens (Expo Router): (tabs)/index, grammar, review; lessons; grammar/[id]; settings;
                    welcome, sign-in, email-auth, new-password, auth-callback, legal/privacy, legal/terms
src/auth/           Supabase client, AuthProvider (Apple / Google / email), redirect parsing
src/sync/           cloud backup upload / restore / reconcile
src/legal/          privacy policy + terms text (publish the same text at a public URL)
supabase/           database migration (progress table, row-level security, delete_account)
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

## Accounts setup (Supabase)

1. Create a project at supabase.com. In the SQL editor run `supabase/migrations/20260929000000_accounts.sql` (or `supabase db push`).
2. Copy `.env.example` to `.env` and fill in the project URL and publishable (anon) key from Project Settings → API. Add your support email.
3. Authentication → URL Configuration: add `grammarapp://**` to *Redirect URLs* (and `exp://**` while testing in Expo Go).
4. Authentication → Sign In / Providers:
   - **Email**: on by default. Keep "Confirm email" on.
   - **Apple**: needs an Apple Developer account. Add `com.theoleone.grammarapp` to *Client IDs* (native sign-in). For Apple on Android, also create a Services ID + key in the Apple Developer portal and fill in the OAuth fields.
   - **Google**: create an OAuth client (type *Web application*) in Google Cloud Console with Supabase's callback URL as the redirect URI, then paste its client ID and secret into Supabase.
5. For EAS builds, `.env` isn't uploaded. Create the same variables for each environment: `npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value … --visibility plaintext` (repeat for the key and support email, and for `preview` / `development`).

## Releasing to the App Store

`eas.json` has three profiles: `development` (dev client), `preview` (internal install; Android APK) and `production` (store build, build number auto-increments).

1. Apple Developer Program membership ($99/year), then in App Store Connect create the app with bundle ID `com.theoleone.grammarapp`. The name must be unique on the store — "Grammar" is almost certainly taken, so choose e.g. "Bunpō – JLPT Grammar" and set `expo.name` to match if you want the home-screen name to change.
2. `npx eas-cli@latest build --platform ios --profile production` — EAS creates the certificates and provisioning profile for you.
3. `npx eas-cli@latest submit --platform ios --latest` uploads it to TestFlight / App Store Connect.
4. In App Store Connect fill in:
   - **Privacy Policy URL**: publish the text from `src/legal/text.ts` (e.g. GitHub Pages or Notion) and paste the URL.
   - **App Privacy**: *Contact Info → Email address* and *User Content → Other (study progress)*, both linked to the user, used for App Functionality, not for tracking. No other data types.
   - **Sign-in for review**: give App Review an email/password test account (or say sign-in is optional — the app is fully usable via *Use without an account*).
   - Screenshots (6.9" and 6.5" iPhone), description, keywords, support URL, age rating (4+), category Education.
5. Export compliance is pre-answered (`ITSAppUsesNonExemptEncryption = false` via `ios.config.usesNonExemptEncryption`).

App Store rules this build already meets: Sign in with Apple is offered alongside Google (4.8), accounts can be deleted in-app (5.1.1(v)), sign-in isn't required to use the app (5.1.1), and a privacy policy is reachable in-app.
