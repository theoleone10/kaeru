# Sentence Practice (on-device AI) — spec

Status: draft · Platform: iOS only · Launches as a **beta, off by default, switched on in Settings** (§3.6) · Owner: Kaeru

## 1. Summary

After the quiz at the end of a lesson, the learner gets one more step: **"Use it in a sentence."** They write their own Japanese sentence with the grammar point they just learned. A small AI model on the phone checks it and replies:

- **Correct:** the point gets a ✓ for sentence practice.
- **Not quite:** a short hint about what went wrong. The learner can try again now or later.

"Later" means: open that grammar point from the Grammar map and tap **Try a sentence**. The sentence ✓ shows on the point's screen **only once the learner has written a correct sentence**.

The step is **optional and never blocks progress**. The quiz result is saved before it starts, a failed sentence changes nothing in the reviews, and the learner can skip.

How it's checked:
1. **Quick checks in TypeScript**: is it Japanese, does it use the grammar point, is it copied from an example.
2. **A fine-tuned ModernBERT-Ja model** (Core ML, on the phone, downloaded once, ~70–140MB) gives a verdict and an error type.
3. **The hint text** is written ahead of time for each grammar point and error type, then reviewed by a human. The phone never generates text, so a hint can't be made-up or wrong Japanese.

How it's built (§7): correct sentences come from Kaeru's examples and Tatoeba, and most wrong sentences are made by code that breaks correct ones. Claude, through the owner's Claude Code subscription (or a small API run, about $2–20), writes the hints and the sentences that need judgment. Training runs on the owner's Windows laptop (NVIDIA GPU), and the iPhone conversion runs on a GitHub Actions macOS runner. Users pay nothing.

### Goals
- Practise *producing* grammar. The rest of the app trains recognition (cloze).
- Free, offline and private. The sentence never leaves the phone except through the learner's own backup or sync.
- Fair grading:
  - A correct sentence is accepted at least 92% of the time (few false "not quite"s).
  - A wrong sentence is caught at least 85% of the time.
- A result in under 300ms after tapping Check.

### Non-goals (v1)
- Android, web and Expo Go. The step and the button are hidden there (§9).
- Being on for everyone. v1 is a beta that learners turn on themselves (§3.6).
- Correcting the sentence or rewriting it for the learner.
- Feeding results into FSRS. Sentence practice doesn't change scheduling, reviews or streaks.
- Grading anything other than the target grammar point (vocabulary, kanji or spelling choices are ignored unless they make the target usage wrong).

---

## 2. Facts this spec relies on (checked 2026-11-28)

| Fact | Source |
|---|---|
| Expo SDK 57 (`expo ~57.0.25`), RN 0.86.3 | `package.json` |
| Effective iOS minimum is **16.4** | `expo-modules-core@57.0.19` podspec |
| There are 427 grammar points and 2,106 example sentences, each point with `meaning`, `structure`, `explanation`, `nuances`, `common_mistakes`, `comparisons` and `examples[].accepted_answers` | `content/n*.json`, `content/grammar.schema.json` |
| How lessons work: `src/app/lessons.tsx` has the steps `'learn' → 'quiz'`. `finishQuiz` calls `saveQuizResults` and then `ReviewSession`'s `emptyState` shows the "Lesson complete!" celebration | code |
| How the grammar point screen works: `src/app/grammar/[id].tsx` shows "Your progress" for learned points and "Learn this now" otherwise | code |
| The Grammar map (`src/app/(tabs)/grammar.tsx`) already uses ✓ for *learned* and ★ for *mastered* | code |
| Romaji to kana as you type: `convertRomajiInput` / `finalizeInput` in `src/review/kanaInput.ts` | code |
| The backup format is **v5** (CLAUDE.md says v3, which is out of date); there are 16 migrations, so the next one is 17 | `src/backup/format.ts`, `src/db/migrations.ts` |
| ModernBERT-Ja (SB Intuitions):<br>• MIT licence (slides and 130m card; **confirm the 70m card field before release**)<br>• SentencePiece unigram tokenizer, 102,400-piece vocabulary, no MeCab<br>• Sizes 30m / 70m / 130m | Hugging Face cards, JLR2025 slides |
| Core ML conversion of ModernBERT:<br>• Pin torch 2.7.0, transformers 4.48.3, coremltools 9.0<br>• One public conversion gives silently wrong outputs<br>• int8 halved the size but doubled latency in one test | community conversions (`znaat/modernbert-coreml`, `takahashim/ruri-v3-130m-coreml`) |
| docs.expo.dev was **unreachable** while writing this | Check every Expo API named here against `https://docs.expo.dev/versions/v57.0.0/` before coding (AGENTS.md) |

---

## 3. User experience

### 3.1 In the lesson (new last step)
The flow is `learn → quiz → sentence → done`.

1. The quiz ends and the results are saved, exactly as today.
2. A new **Sentence** step runs once for each point in the batch (usually 1–2). The progress header reads "Sentence 1 of 2". The screen shows:
   - The point title and meaning, for example **〜ばかりに: "just because…" (bad result)**, plus the first `structure` line as a reminder.
   - The prompt: "Write your own sentence using 〜ばかりに." There's a collapsible "Need an idea?" with one English situation, taken from `sentence_prompts` in the content file (§6.1).
   - A multi-line text box. Romaji turns into kana using the same IME mode as reviews; input from a Japanese keyboard is never changed.
   - Buttons: **Check** (primary), **Skip for now** (ghost).
3. Check shows one of three results:
   - **Correct ✓**: "Nice, that's a natural use of 〜ばかりに." Confetti and the `lesson` sound, a short note on the sentence if one exists for that point, then **Next**.
   - **Not quite**: the hint for the error type (§6.2), for example "ばかりに is for a *bad* result. For a good one, try おかげで." Buttons: **Try again** (keeps the text so the learner can edit it) and **Later**.
   - **Not sure**, when the model's confidence is in the middle band: "I couldn't check this one confidently. Try a simpler sentence?" Buttons: **Try again** and **Later**. This does **not** count as a fail in the stats.
4. There's no limit on attempts. **Later** and **Skip for now** both move to the next point, or to the celebration.
5. The celebration adds a stat tile, **Sentences 1/2**, next to Learned and Quiz.

Leaving during the sentence step loses nothing: the points are already in reviews. The "Leave the quiz?" alert doesn't appear during this step.

### 3.2 Trying again later: the grammar point screen
On `grammar/[id]`, for **learned points only** (those with a card), add a section after "Your progress":

- **Not done yet:** a "Use it in a sentence" heading, the line "Write your own sentence to earn the ✓.", and a **Try a sentence** button that opens `sentence/[id]`.
- **Done:** "Use it in a sentence ✓", the learner's best correct sentence (the latest one marked correct), and a ghost button **Write another**. More correct sentences don't change anything; they're stored for the learner.
- If the learner has failed before, show a small caption, "Last try: not quite · 2 days ago".

### 3.3 Where the ✓ shows
- The point screen (§3.2) is where it's earned and shown. This is the "check in the lesson" the owner asked for.
- On the Grammar map, a station row whose sentence is done gets a small pencil-check badge next to the title. The existing station marker (✓ learned / ★ mastered) is **unchanged**, so map progress and the current-station logic don't move.
- On Progress, add a line under each JLPT level: "Sentences written: 14 / 96".

### 3.4 Screens (Expo Router)
| Route | Purpose |
|---|---|
| `src/app/lessons.tsx` | Add the `'sentence'` step (§5.1) |
| `src/app/sentence/[id].tsx` | The same writer used outside a lesson. Presented as a modal, opened from the point screen |
| `src/app/sentence/download.tsx` (modal) | The model download: size, Wi-Fi note, progress |
| `src/components/SentenceWriter.tsx` | The shared UI: prompt, input, Check, the result card |

Register `sentence/[id]` (modal, title "Use it in a sentence") and `sentence/download` in `src/app/_layout.tsx`.

### 3.5 When the model isn't ready
- **Not downloaded yet**, during a lesson: the Sentence step shows the writer and a banner, "Checking sentences needs a one-time 70MB download". The buttons are **Download** and **Skip for now**. Checking works once the download finishes.
- **Downloading:** Check is disabled, with "Getting ready… 43%".
- **Load failed:** skip the step silently in the lesson. The point screen shows "Sentence checking isn't available on this device right now."

### 3.6 Beta switch
Sentence practice ships as a **beta**: **off by default**, and the learner can switch it on or off at any time.

**In Settings,** add a **Beta features** section (on iOS only) with:
- **Sentence practice**, an on/off switch. The caption reads: "Write your own sentence after each lesson. Checked on your phone. Needs a one-time 70MB download."
- When it's on, two more rows appear:
  - "Download automatically on Wi-Fi" (on by default)
  - "Sentence checker (70MB) · Delete"

**When it's off:**
- The lesson ends after the quiz, exactly as today.
- The point-screen section (§3.2), the map badge and the Progress counts (§3.3) are hidden.
- Nothing downloads, and the model isn't loaded.

**Turning it on:**
- Opens `sentence/download` (§3.4) straight away. "Not now" keeps the switch on, and the download is offered again at the next Sentence step.
- On Wi-Fi with auto-download on, the download starts without asking.

**Turning it off:**
- Keeps the learner's attempts and ✓s (they're progress, §10). They show again if it's turned back on.
- Keeps the downloaded model, so turning it back on is instant. "Delete" in Settings frees the space.

**Beta label:** every sentence screen shows a small **BETA** chip next to the title. The result card's "I think this is right" link (§10.4) reads "Report a wrong result" while in beta.

**One-time invitation:** on the "Lesson complete!" screen, at most once (after the learner's 3rd finished lesson), a dismissible card: "New: practise writing sentences (beta)". It has two buttons:
- **Try it** turns the switch on and opens the download.
- **No thanks** hides the card for good (`meta.sentence_beta_invite_dismissed`).

**Remote off switch:** `latest.json` (§8) may contain `"paused": true` with an optional `"message"`. While it's set, the app treats the feature as off even when the switch is on, and shows the message in Settings. This lets a bad model be pulled during the beta without an app update. Attempts are untouched.

**Leaving beta** (a later release): flip the default to on for new installs, keep the switch, and drop the BETA chip. That decision follows §13 P7.

---

## 4. Architecture

```
text box ──► finalizeInput (kana) ──► normalize ──► pre-checks (TS) ──fail──► instant hint
                                                        │ pass
                                                        ▼
                         SentencePiece tokenizer (TS)  →  ids [1×192]
                                                        ▼
                         KaeruGrader native module (Swift, Core ML)
                                                        ▼
                     { p_correct, errorType probabilities } ──► calibrate ──► verdict + hint id
                                                        ▼
                                 save attempt (SQLite) ──► UI
```

- Everything except the model itself is TypeScript, so it can be tested in Jest in every time zone.
- The native module only turns token ids into numbers.

---

## 5. App changes in detail

### 5.1 `src/app/lessons.tsx`
- `step` becomes `'learn' | 'quiz' | 'sentence'`.
- `finishQuiz` stays the same: it saves first. Then:
  - If `sentencePracticeOn()` (§9) is true, call `setStep('sentence')`.
  - Otherwise show the existing celebration.
- The celebration's `emptyState` is moved so it can be shown from the sentence step's last point too. Extract it into a `LessonDone` component that takes the `sentenceResults` map.
- `close()` during `'sentence'` just goes back, with no alert (the progress is saved).

### 5.2 `src/sentence/` (new, TypeScript)
| File | Job |
|---|---|
| `precheck.ts` | Instant checks before the model:<br>1. Length 4–80 characters after trimming.<br>2. At least 60% Japanese characters (kana, kanji, Japanese punctuation).<br>3. **Uses the target**: matches one of the point's `target_forms` patterns (§6.1). Failing gives the `missing_target` hint.<br>4. **Not copied**: not an exact or near (≥90% character overlap) copy of the point's own example sentences. Failing gives "Try writing your own sentence."<br>5. Only one sentence: text after the first 。！？ counts as a second sentence and gives "One sentence at a time." |
| `normalize.ts` | Full-width ASCII to half-width, half-width katakana to full-width, remove zero-width characters. Keep the learner's spelling otherwise |
| `tokenizer.ts` | A SentencePiece unigram tokenizer (Viterbi with byte fallback) built from `tokenizer.json`. It must match Python `transformers==4.48.3` exactly (golden test, §11) |
| `input.ts` | Builds the model input: `"[{level}] {title}：{meaning}" [SEP] "{sentence}"`, padded or cut to **192 tokens** |
| `grader.ts` | `grade(pointId, text): Promise<GradeResult>`. Runs precheck, then the model, then calibration. Returns `{ verdict: 'correct' | 'incorrect' | 'unsure', errorType?, hintKey, modelVersion }` |
| `calibrate.ts` | Uses the `manifest.thresholds` (§7.10):<br>• `p ≥ accept` gives `correct`<br>• `p ≤ reject` gives `incorrect`, with the top error type<br>• Anything in between gives `unsure` |
| `hints.ts` | Turns `(pointId, errorType)` into hint text from `content/sentences/feedback.json`, falling back to the generic text for that error type |
| `modelStore.ts` | Download, verification and versioning (§8) |
| `repo.ts` | Attempt storage and queries (§10) |

### 5.3 `src/app/grammar/[id].tsx`
- Add the section from §3.2. Read `getSentenceStatus(db, id)`, which returns `{ done, best?, lastAttempt? }`, and re-read when the modal closes. Use `useFocusEffect` from expo-router, or have the modal call `refresh()`.

### 5.4 `src/app/(tabs)/grammar.tsx` and `progress.tsx`
- Add the pencil-check badge from §3.3 and the per-level counts. Load `sentence_done` ids once, as a `Set<string>`, through `AppProvider`, next to `cardsById`.

---

## 6. Content (authored offline, shipped in the app)

### 6.1 `content/sentences/points.json` + schema
There must be one entry for every grammar id (a test checks this):
```jsonc
{
  "n2-bakari-ni": {
    "target_forms": ["ばかりに"],                       // regex, loose; conjugated forms of the grammar itself
    "sentence_prompts": ["Say that a small mistake caused a big problem."],
    "accept_note": "Remember: ばかりに always leads to something you regret."  // optional, shown on correct
  },
  "n4-te-shimau": {
    "target_forms": ["てしまう|てしまった|てしまい|でしまう|でしまった|ちゃう|ちゃった|じゃう|じゃった"],
    "sentence_prompts": ["Say you accidentally did something.", "Say you finished something completely."]
  }
}
```
- Each `target_forms` pattern must match the `cloze_target` of **all** of that point's own examples. That's 2,106 checks for free (§11).

### 6.2 `content/sentences/feedback.json`: error types and hints
These are the fixed **error types**. The model predicts one of them, and the list is the same for every point:

| key | Meaning | Example hint (written per point) |
|---|---|---|
| `missing_target` | Doesn't use the point (caught by the prechecks) | "Use 〜ばかりに somewhere in your sentence." |
| `connection` | Wrong form before or after the point (conjugation or attachment) | "ばかりに comes after the plain past or ている: 言ったばかりに." |
| `meaning` | Grammatical, but the point doesn't fit the meaning or situation | "ばかりに is for a bad result. For a good result, use おかげで." |
| `register` | Formality clash (e.g. casual って in a です/ます frame) | "って is casual; with です, use と言っていました." |
| `particle` | A particle error that breaks the target structure | "The thing you want takes が with 〜たい here." |
| `lookalike` | Used a similar point instead (e.g. ために for purpose vs cause) | "This is the 'purpose' ために. This lesson is the 'because' one." |
| `ungrammatical` | Other grammar errors in the sentence that make it unclear | "Something else in the sentence isn't quite right. Try a shorter one." |
| `unnatural` | Grammatical but no native speaker would say it | "Grammatically fine, but it sounds odd. Try a more everyday situation." |

- `feedback.json` has `{ "_generic": { errorType: text }, "<pointId>": { errorType: text } }`. Per-point text is optional and falls back to `_generic`. The target is per-point text for `connection` and `meaning` on every point, and for `lookalike` wherever the point has `comparisons`.
- Hints never quote the learner's sentence back with a correction. They describe the rule, so they can't be wrong about the learner's specific words.

---

## 7. Training the model

The plan in short:
- **Correct sentences come from data that already exists**: Kaeru's own examples, plus Tatoeba.
- **Most wrong sentences are made by code** that breaks correct sentences on purpose.
- **Claude only does the parts that need judgment**, working through the owner's **Claude Code subscription**, or a cheap API run if the terms say no (§7.1).
- **Training runs on the owner's Windows laptop (NVIDIA GPU)**, and the iPhone conversion runs on a GitHub Actions macOS runner.

### 7.0 Costs at a glance

| Step | Where it runs | Cost |
|---|---|---|
| Correct sentences (Kaeru examples, Tatoeba) | Windows laptop (WSL2) | Free |
| Wrong sentences made by code (§7.4) | Windows laptop (WSL2) | Free |
| Patterns, hints and corruption config (§7.3, C1–C2) | Claude Code subscription | Subscription |
| Judgment sentences and spot checks (§7.5, C3–C4) | Subscription; **or** the API with Haiku 5.5 / Sonnet 5.5 if the terms don't allow it | Subscription, or about **$2–20** |
| Gold test set (§7.7) | Native speaker | Their time (~15h) |
| Training and calibration (§7.8–7.10) | Windows laptop, NVIDIA GPU | Free (electricity) |
| Conversion to Core ML, parity check, Core ML evaluation (§7.11–7.12) | GitHub Actions **macOS** runner, started by hand | Free allowance (macOS minutes count extra; check current GitHub billing) |

### 7.1 Step 0: check the terms (before any data work)
- Writing app content (C1–C2: patterns, hints, corruption rules) in Claude Code is ordinary software work.
- Generating **training data** (C3–C4) with a consumer subscription (Pro/Max) is the part to check. Older versions of Anthropic's Consumer Terms banned using the service "to develop or train any artificial intelligence or machine learning algorithms or models". Read the *prohibited uses* section of the current Consumer Terms and record the decision in `ml/sentence-grader/DECISIONS.md`.
  - **If it's allowed:** run C3–C4 in Claude Code sessions (§7.5).
  - **If it's not, or it's unclear:** run the same prompts through the API with `api_runner.ts` (§7.5.3). The API falls under the Commercial Terms. At these volumes it costs about $2 with Haiku 5.5 or about $10–20 with Sonnet 5.5.

### 7.2 Folder layout (`ml/sentence-grader/`, never bundled)
```
ml/sentence-grader/
  README.md                 how to run everything, start to finish
  DECISIONS.md              terms check, labeler choice, model choice, with dates
  DATA_LICENSES.md          Tatoeba attribution, tool licences
  package.json              tsx scripts (data pipeline reuses src/sentence/*.ts)
  requirements.txt          pinned Python deps (§7.8)
  config/
    corruptions.json        per-point corruption settings (C2)
    pipeline.yaml           caps, ratios, seeds, paths
  prompts/
    C3-judgment.md          prompt for judgment sentences
    C4-spotcheck.md         prompt for spot checks
  queue/                    one line per work item; *.done files mark progress
  scripts/                  numbered steps, see §7.3–7.11
  src/conjugate.py          small verb/adjective conjugator (§7.4.1)
  data/                     gitignored: raw downloads, jsonl outputs
  reports/                  committed: dataset stats, eval reports per version
  tests/                    pytest + jest for the pipeline
.github/workflows/grader-convert.yml   macOS job for §7.11–7.12 (manual trigger)
```
- Everything under `ml/` runs inside **WSL2 (Ubuntu)** on the Windows laptop (§7.8). Keep the repo clone and `data/` in the WSL filesystem (`~/kaeru`), not under `/mnt/c`, because file access there is much slower.
- Add `ml/` to `metro.config.js` `blockList` and to `tsconfig.json` `exclude`.
- Add `ml/sentence-grader/data/` and `ml/sentence-grader/out/` to `.gitignore`.

### 7.3 Content and corruption config (Claude Code subscription)
| Task | Output | Notes |
|---|---|---|
| **C1** | `content/sentences/points.json`, `feedback.json` (§6) | One PR per JLPT level, reviewed by the owner. Tests in §11 must pass |
| **C2** | `ml/sentence-grader/config/corruptions.json` | Per point, which corruption operations apply and their parameters, e.g.:<br>`{ "n2-bakari-ni": { "connection": { "slot": "before", "from": ["V-ta","V-teiru"], "to": ["V-dict","V-masu-stem","V-te"] }, "lookalike": [{ "swap": "ばかりに", "with": "おかげで", "error": "meaning" }], "register": false } }` |

Run them as normal Claude Code sessions in this repo, a level at a time ("Do C1 for N4 following docs/specs/sentence-practice.md §6 and §7.3").

### 7.4 Data pipeline (laptop, free)

**D1: Point cards.** `scripts/01_cards.ts` reads `content/n*.json` and `content/sentences/*.json` and writes `data/cards.jsonl`, one per point.

**D2: Correct sentences.** `scripts/02_positives.ts` collects them from:
1. **Kaeru examples:** all 2,106, labelled with their own point.
2. **Tatoeba:** download the Japanese sentence export (`jpn_sentences.tsv.bz2` from downloads.tatoeba.org/exports/per_language/jpn/; check the current path). Licence CC BY 2.0 FR, with some sentences CC0; credit it in `DATA_LICENSES.md`. No Tatoeba text ships in the app. Quality filter:
   - Keep sentences whose owner is listed as a native Japanese speaker (`user_languages` export, level 5), or that are linked to an English translation.
   - Keep 5–40 characters.
   - Drop sentences with ASCII letters.
3. **Matching:** run each sentence through the app's own `precheck.ts` target matching for every point. Each match becomes `{text, point_id, source}`, and one sentence can match several points.
4. **Balance:**
   - **Cap 400 positives per point** (common points like は and が would otherwise drown the rest).
   - Points with **fewer than 60** go on `queue/C3-fill.txt` so Claude writes the missing ones (§7.5).

**D3: Kana-only copies.** `scripts/03_kana.py` uses `fugashi` + `unidic-lite` (offline, BSD/MIT) to convert 30% of positives to all-hiragana. Learners who type romaji produce sentences like this. The copies keep their label.

**D4: Wrong sentences by corruption.** `scripts/04_corrupt.py` runs **1–2 corruptions of different types** on each positive, using `corruptions.json` and `fugashi`:

| Operation | Error type | What it does |
|---|---|---|
| `connection` | `connection` | Find the word right before (or after) the target. Re-conjugate it to one of the wrong forms in `to` with `src/conjugate.py` (§7.4.1). E.g. 言った**ばかりに** becomes 言う**ばかりに** / 言います**ばかりに** |
| `particle` | `particle` | Swap a particle inside the target's frame (が↔を, に↔で, は↔が) only where the config marks it as required |
| `register` | `register` | Put a casual target into a です/ます sentence, or the reverse, where the config marks the point's formality as strict |
| `lookalike` | `lookalike` / `meaning` | Replace the target with a confusable point's form from `comparisons` or C2, where the swap makes the meaning wrong |
| `drop` | `connection` | Remove a required piece (e.g. the の in のに, or the て in てしまう) |

Each corruption records `{text, point_id, error_type, op, rule_id, source_id}`.

Guards:
- The corrupted sentence must still pass `precheck` target matching, except for `drop`. Otherwise it would be a `missing_target` case, which the prechecks already handle.
- It must differ from the original.
- A rule whose spot-check error rate (C4) is **above 10%** is turned off.

**D5: Assemble.** `scripts/05_assemble.ts` merges D2–D4 with the C3 outputs, removes exact and near duplicates (character 5-gram Jaccard ≥0.9 within a point), and writes `data/dataset.jsonl`.
- Target mix: **~40% correct / ~60% wrong**. Wrong rows have no error type over 30% of the total.
- Expected size: **80k–120k rows**. `reports/dataset-<date>.md` records counts per level, point, source and error type.

**D6: Split.** `scripts/06_split.ts`:
- **Group by `source_id`**, so a correct sentence and its corruptions always land in the same split.
- 90% train / 10% validation, stratified by level.
- The gold set (§7.7) is excluded entirely: drop any row within 0.9 Jaccard of a gold sentence.

#### 7.4.1 `src/conjugate.py`
- A small, rule-based conjugator for verbs (godan, ichidan, する, 来る, 行く's irregular て-form) and i-/na-adjectives. It produces: dictionary, ます-stem, ます, ない, た, て, ている, volitional, potential, conditional (ば/たら), passive, causative.
- It gets each word's verb class and dictionary form from UniDic (`fugashi`).
- `tests/test_conjugate.py` checks it against a table of 200 verbs and adjectives × all forms.

### 7.5 Judgment work by Claude (C3–C4)
The code can't make these two kinds of data:

| Task | Per point | Total | What |
|---|---|---|---|
| **C3** | 6 `meaning` + 4 `unnatural` + 3 `ungrammatical`, plus **fill** to 60 correct where D2 had too few | ~6k wrong + up to ~10k correct | Sentences in the point's level vocabulary, 5–30 characters, using the target |
| **C4** | — | ~3,000 | Spot check a random 3% of D4 corruptions: "is this actually wrong, and is the error type right?" Gives an error rate per rule |

#### 7.5.1 Formats
- **C3 output**, `data/claude/C3/<pointId>.jsonl`, one line per sentence:
  ```json
  {"text": "...", "label": "correct|incorrect", "error_type": "meaning|unnatural|ungrammatical|null", "register": "casual|polite|written", "note": "≤15 words"}
  ```
- **C4 output**, `data/claude/C4/<batch>.jsonl`:
  ```json
  {"id": "...", "really_wrong": true, "error_type_ok": true, "note": "≤15 words"}
  ```
- `scripts/validate_claude.ts` checks the schema, that the text passes the prechecks, the level vocabulary (warning only), and duplicates. Invalid lines go to `data/claude/rejects.jsonl` and their point returns to the queue.

#### 7.5.2 Running them in Claude Code (subscription path)
- The queues are `queue/C3.txt` (point ids) and `queue/C4.txt` (batch ids of 100 corruptions). A finished item writes `queue/<task>/<id>.done`.
- **One session** works through a chunk and then stops. A prompt like: *"Follow `ml/sentence-grader/prompts/C3-judgment.md`. Take the next 10 undone ids from `queue/C3.txt`, write their outputs, run `npm --prefix ml/sentence-grader run validate`, fix rejects, and mark them done."* That's ~43 sessions for C3 and ~30 for C4, spread over days to stay inside usage limits.
- Each prompt file includes the point card from D1, the error-type definitions from §6.2, five correct and five wrong examples, and the output format. Sessions must not see the gold set.
- **Optional automation:** `scripts/run_queue.sh` runs Claude Code in headless mode (`claude -p`) in a loop, one chunk per call, and stops when a call fails (usage limit reached). Check the current headless flags in the Claude Code docs before relying on it.

#### 7.5.3 API path (if the terms check says no)
- `scripts/api_runner.ts` reads the same prompts and queues and sends them through the **Message Batches API** (50% off) with structured outputs (`output_config.format` set to the schemas above). Default **Claude Haiku 5.5**; `--model claude-sonnet-5-5` for higher quality.
- Results come back in any order, so key them by `custom_id = "<task>:<id>"`. Retry `errored`/`expired` items once, and re-send `refusal` items individually.
- **Estimate:**
  - C3 is ~430 requests × ~3k output tokens.
  - C4 is ~30 requests × ~2k output tokens.
  - The prompts are cached.

  That's **about $1–3 with Haiku 5.5, about $10–20 with Sonnet 5.5**. `api_runner.ts --dry-run` prints a token estimate before spending anything.

### 7.6 Pilot (do this before the full run)
1. C1–C2 for **40 points** (20 from N5, 20 from N2). Then D1–D4 and C3–C4 for those points only.
2. The native speaker grades **400** of the pilot rows: 200 corruptions and 200 C3 rows.
3. Measure:
   - The corruption error rate for each rule (from the native speaker, compared with C4's Claude spot check).
   - C3 agreement with the native speaker.
   - How many sessions C3/C4 actually took.
4. Decide, and write in `DECISIONS.md`:
   - Which rules to keep.
   - Whether C4 by Claude is trustworthy enough to replace the human for the remaining rules (agreement ≥90%).
   - Subscription or API.
5. Train a quick 70m model on the pilot data (§7.9, 1 epoch) to confirm the setup learns.

### 7.7 Gold test set (native speaker)
- **2,000 sentences**, never trained on:
  - **500 written by real learners**: the owner, friends, opt-in beta testers. Collect them through the app's dev build, which can export attempts as a file.
  - **900 from the pipeline:** 300 Kaeru-style positives, 300 corruptions, 300 C3.
  - **600 Tatoeba positives, plus their corruptions**, from points not in the pilot.
- `scripts/07_gold_sheet.py` writes a CSV for Google Sheets with the columns `id, point, meaning, sentence, verdict (correct/incorrect), error_type, natural (1–3), comment`. `scripts/08_gold_import.py` reads it back, and **rows the grader is unsure about are double-checked**.
- About 15 hours of native-speaker time.

### 7.8 Training on the Windows laptop (NVIDIA)
**Why WSL2:** the pipeline uses bash scripts, `fugashi`/UniDic and the pinned PyTorch build, which all run most smoothly in Linux. WSL2 gives Linux on Windows with full access to the NVIDIA GPU.

**One-time setup:**
1. Update the **Windows** NVIDIA driver (GeForce/Studio driver from NVIDIA). **Don't** install a Linux GPU driver inside WSL: WSL2 uses the Windows driver.
2. In PowerShell (admin), run `wsl --install -d Ubuntu-24.04`, then restart.
3. In Ubuntu, run `nvidia-smi`. It should list the GPU. If it doesn't, fix the driver before continuing.
4. Install the tools:
   ```bash
   sudo apt update && sudo apt install -y python3.11 python3.11-venv git build-essential
   # Node (for the tsx data scripts) via nvm, matching the repo's Node version
   git clone <repo> ~/kaeru && cd ~/kaeru && npm ci
   cd ml/sentence-grader
   python3.11 -m venv .venv && source .venv/bin/activate
   pip install torch==2.7.0 --index-url https://download.pytorch.org/whl/cu128
   pip install -r requirements.txt      # transformers==4.48.3 coremltools==9.0 datasets
                                        # scikit-learn fugashi unidic-lite pyyaml numpy
   python scripts/00_check_device.py    # must print "cuda", the GPU name, VRAM and a 1-step timing
   ```
   - The `cu128` build covers current NVIDIA laptop GPUs, including RTX 50-series. For an older card where it fails, try `cu126`.
5. Install Claude Code inside WSL as well, so the C1–C4 sessions (§7.3, §7.5) run against the same clone.

**Pinned versions:** transformers 5.x produces an operation coremltools can't convert, and these are the versions known to convert ModernBERT correctly. `coremltools` installs on Linux for **converting**, but running a Core ML model needs macOS, so the parity check and Core ML evaluation run on the macOS runner (§7.11).

**Model:**
- `sbintuitions/modernbert-ja-70m` downloads from Hugging Face on the first run. Check the licence field on its card first.
- Load it with `attn_implementation="sdpa"`. Don't install FlashAttention: the speed gain is small at this size, and its build is fragile.

**GPU memory:**

| Model | 8GB VRAM | 12GB+ VRAM |
|---|---|---|
| 70m | batch 32, seq 192, bf16 | same |
| 130m | batch 16 × gradient accumulation 2 | batch 32 |

`00_check_device.py` prints the largest batch that fits.

**Timing:** on a laptop RTX 40/50-series GPU, one 4-epoch run of 70m on ~100k rows should take **under an hour**; 130m about twice that. 3 seeds of each fit in one evening. `00_check_device.py` measures the real speed before the full run.

**Running overnight:**
- Plug the laptop in and set Windows to never sleep while plugged in (Settings → System → Power).
- Run training inside `tmux`, so closing the terminal doesn't stop it.
- Laptop GPUs slow down when hot. Raise the back of the laptop, and check `nvidia-smi` temperatures in the first 10 minutes.

**Handing off to the macOS runner:** after calibration (§7.10), `scripts/10b_export.py` writes `out/<run>/handoff/` containing:
- the best checkpoint (safetensors) and `thresholds.json`;
- `parity_inputs.npz`: 2,000 tokenized validation inputs with their PyTorch logits;
- `gold_inputs.npz`: the tokenized gold set and its labels.

It uploads them to a **private** Supabase Storage bucket, `grader-handoff/<run>/`, using a service key kept in the laptop's environment only. The gold set holds learner sentences, so it never goes in the repo or a public bucket.

### 7.9 Model and training settings (`scripts/09_train.py`)
- **Input:** `"[{level}] {title}：{meaning}" [SEP] "{sentence}"`, max **192** tokens, built with the tokenizer from the model repo.
- **Model:** the ModernBERT-Ja encoder with **two heads** on the mean-pooled output:
  - **Head A:** `p_correct`, a sigmoid with BCE loss.
  - **Head B:** the error type, a 7-way softmax with CE loss, computed only on incorrect rows.

  Loss = `BCE + 0.5 × CE`.
- **Hyperparameters to start with:**

  | Setting | Value |
  |---|---|
  | learning rate | 3e-5 (heads 1e-4) |
  | epochs | 4, early stop on validation balanced accuracy |
  | batch | 32 (use gradient accumulation if memory runs short) |
  | warmup | 6% |
  | weight decay | 0.01 |
  | seeds | 1, 2, 3 |

- **Precision:** bf16 on CUDA. On MPS start with fp32, and try `torch.autocast("mps", dtype=torch.float16)` if the speed test says it helps without NaNs.
- **Augmentation, applied on the fly:** swap full-width and half-width punctuation (p=0.2), drop the final 。 (p=0.3), and swap between 、 and no comma (p=0.1).
- **Logging:** each epoch writes validation metrics to `out/<run>/metrics.jsonl`, and the best checkpoint is saved to `out/<run>/best/`.
- **Choosing 70m vs 130m:** train `modernbert-ja-130m` with the same settings as the challenger. Ship it only if it beats 70m by **≥3 points of balanced accuracy on gold** and its int8 Core ML file is ≤150MB.

### 7.10 Calibration (`scripts/10_calibrate.py`)
- Temperature-scale Head A on validation.
- Set the thresholds:
  - **`accept`**: the lowest `p` where false-accepts are ≤10% on validation.
  - **`reject`**: the highest `p` where false-rejects are ≤5%.
  - The gap between them is `unsure`. It must be ≤15% of validation rows; otherwise the model isn't good enough yet.
- Per-level thresholds if a level has ≥150 validation rows, otherwise global.
- Writes `out/<run>/thresholds.json`.

### 7.11 Conversion and parity (`scripts/11_convert.py`, `12_parity.py`; GitHub Actions macOS runner)
- **Runner:** `.github/workflows/grader-convert.yml`, `workflow_dispatch` with the inputs `run` (handoff id) and `publish` (false by default), on `runs-on: macos-latest`. The steps are:
  1. Set up Python 3.11 and install `requirements.txt` with CPU-only torch.
  2. Download `grader-handoff/<run>/` using the GitHub secrets `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
  3. Run 11 → 12 → 13.
  4. Upload `out/<version>/` and the eval report as workflow artifacts.
  5. Run 14 (§7.13) only when `publish` is true **and** the gate passed.

  Expect about 10–20 minutes per run.
- The owner downloads the eval report artifact and commits it to `reports/`.
- Trace the best checkpoint and convert it with `coremltools.convert`:
  - Fixed input shape `[1,192]` (int32 `input_ids`, `attention_mask`).
  - Outputs `p_logit [1]` and `err_logits [1,7]`.
  - `compute_precision=FLOAT16`, `minimum_deployment_target=iOS16`.
- Try int8 weight quantization (`coremltools.optimize`). Keep it if it passes parity. Latency doesn't matter for one sentence, and int8 brings 70m to about 70MB.
- **Parity gate** (the build fails otherwise): on 2,000 validation inputs, PyTorch and Core ML must give:
  - logits within 0.02,
  - the same verdict ≥99.9% of the time,
  - the same error type ≥99.5% of the time.

  This guards against conversions that silently give wrong outputs.
- **Output files** go in `out/<version>/`: `KaeruGrader.mlpackage`, `tokenizer.json`, and `manifest.json` (format in §8), with sha256 hashes filled in.

### 7.12 Evaluation and release gate (`scripts/13_evaluate.py`)
On the macOS runner, the script runs the **converted Core ML model** on the gold set (`gold_inputs.npz`) and writes `reports/eval-<version>.md`, which is committed. Only this report counts for the release gate. On the laptop, `scripts/13_evaluate.py --torch` gives the same report from PyTorch, for quick checks between runs. The report includes:
- the confusion matrix,
- per-level and per-source tables, with the learner-written subset reported separately,
- the 50 worst false-rejects, for review.

The gate:
- Correct sentences accepted ≥92%.
- Wrong sentences caught ≥85%.
- `unsure` ≤12%.
- The right error type, when caught, ≥70%.
- No JLPT level more than 5 points below the overall figures.
- Learner-written correct sentences accepted ≥88%.

### 7.13 Publish (`scripts/14_publish.ts`)
- Upload `out/<version>/*` to Supabase Storage `grader-models/<version>/` and update `latest.json`. This needs a service key in the **local environment only**, never committed.
- Tag the commit `grader-<version>`, so the data config, thresholds and report can always be traced.

### 7.14 Retraining later
1. Add the reports from §10.4 and new learner sentences to the gold candidates.
2. Re-run D2–D6, plus C3 for any changed points.
3. Retrain, compare with the last `reports/eval-*.md`, and publish only if the gate passes **and** the scores aren't worse.

---

## 8. Model delivery
- **Hosting:** Supabase Storage, public bucket `grader-models/<version>/…`, plus `latest.json`. Supabase is already a dependency, and the files contain no user data.
- **When it downloads:**
  - **Only while sentence practice is switched on** (§3.6). Never while it's off.
  - On Wi-Fi, automatically when the switch is turned on or at the next app open, if "Download automatically on Wi-Fi" is on (the default).
  - On cellular, the in-lesson banner asks first (§3.5).
  - Settings shows "Sentence checker (70MB) · Delete".
- **How:** `expo-file-system` download (check the SDK 57 API for resumable downloads) to Application Support, with `isExcludedFromBackup = true`. Then verify the `sha256`, call `loadModel`, and record `meta.grader_model_version`. Delete the old version only after the new one has loaded.
- **Update check:** fetch `latest.json` when the app opens a sentence screen or Settings → Beta features, at most once a day, and only while the switch is on. It's also where the remote off switch lives (`paused`, §3.6).
- **Compatibility:**
  - Keep the current model if `minAppVersion` is greater than the app version.
  - If `contentHash` doesn't match the bundled content, keep working but log it in dev builds.
- **Old results stay done.** A ✓ earned under an earlier model stays done after an update; the model isn't re-run on old sentences.

---

## 9. Native: local Expo module `modules/kaeru-grader/`

Check the exact API against the SDK 57 "Modules API" and local-module docs first. Create it with `npx create-expo-module@latest --local` (the SDK 57 tag). Never hand-edit `ios/` (CNG).

```
modules/kaeru-grader/
  expo-module.config.json   // { "platforms": ["apple"], "apple": { "modules": ["KaeruGraderModule"] } }
  index.ts                  // typed wrapper; isAvailable() === false off iOS
  ios/KaeruGrader.podspec   // links CoreML.framework
  ios/KaeruGraderModule.swift
```

JS API:
```ts
isAvailable(): boolean
loadModel(path: string): Promise<{ computeUnits: string }>   // compiles .mlpackage → .mlmodelc once, caches it
unloadModel(): Promise<void>
predict(inputIds: number[], attentionMask: number[]): Promise<{ pLogit: number; errLogits: number[] }>
```
- `MLModelConfiguration.computeUnits = .all`. Run `prediction` off the main thread. Unload on a memory warning, and reload lazily on the next `predict`.
- Throw a typed error on a wrong input length.

**`graderAvailable()`** (TS) is `Platform.OS === 'ios' && KaeruGrader.isAvailable()`. It controls whether the Settings switch is shown at all.

**`sentencePracticeOn()`** is `graderAvailable() && settings.sentencePracticeEnabled && !latest.paused`. When it's false, the sentence step, the point-screen section, the map badge and the Progress counts are **hidden**, not shown greyed out.

**Developer mode:** in `__DEV__` on any platform, a fake grader (`grader.dev.ts`) that runs only the prechecks lets the UI be built in Expo Go or on Android. It's never used in release builds.

---

## 10. Data, backup and sync

### 10.1 Migration 17
```sql
CREATE TABLE sentence_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grammar_id TEXT NOT NULL,
  sentence TEXT NOT NULL,
  verdict TEXT NOT NULL,            -- 'correct' | 'incorrect' | 'unsure'
  error_type TEXT,                  -- null when correct/unsure, or a precheck key
  source TEXT NOT NULL,             -- 'lesson' | 'point'
  model_version TEXT NOT NULL,      -- 'precheck' when the prechecks decided
  created_at INTEGER NOT NULL
);
CREATE INDEX sentence_attempts_point ON sentence_attempts (grammar_id, created_at);
${bumpTriggers(['sentence_attempts'])}
```
- **Done** means at least one row has `verdict = 'correct'` for that `grammar_id`. This is computed, not stored, so it can never go out of sync.
- `resetPoint` (`src/db/repo.ts`) also deletes that point's attempts, because the point becomes a new lesson again.

### 10.2 Backup v6 (`src/backup/format.ts`)
- `BACKUP_FORMAT_VERSION = 6`. Add `sentence_attempts?: Row[]` with a validator.
- `readAllForBackup` / `replaceAllFromBackup` include the table. **Restoring a v1–v5 file (no section) keeps the phone's own attempts**, the same as `anki` / `kana`.
- `backupCounts`: add `sentencesDone` (distinct points with a correct attempt). Include it in `isEmptyProgress` and `describeCounts` ("12 sentences"), so `reconcileAction` never silently replaces them.
- Update CLAUDE.md: the backup note goes from "currently v3" to "currently v6", plus a line about this table.
- Model files are not backed up.

### 10.3 Settings and meta
- `settings` (synced, so the choice follows the learner to a new phone): `sentence_practice_enabled` (default **false**), `grader_auto_download` (default true). Add both to `src/state/settings.ts` with defaults, so older backups without them still load.
- `meta` (device only): `sentence_beta_invite_dismissed`, `grader_paused_message` (the last `latest.json` value).
- `meta` (device only): `grader_model_version`, `grader_model_path`, `grader_reports` (§10.4).

### 10.4 "I think this is right"
- Under a *Not quite* result, a small link stores `{pointId, sentence, p, errorType, modelVersion}` in `meta.grader_reports` (at most 200, local only). It does **not** award the ✓.
- Later (v1.1, opt-in), Settings could export these reports as a file through `expo-sharing`, so they can feed the gold set (§7.7) and the next training round (§7.14).

---

## 11. Testing

Everything must pass `npm run test:zones`, and dates use local-time constructors.

| Test | Checks |
|---|---|
| `tests/sentence/content.test.ts` | Every grammar id has an entry in `points.json`; every regex compiles; **each point's `target_forms` match the `cloze_target` of all its examples**; every `feedback.json` key is a real point and error type; `_generic` covers every type |
| `tests/sentence/precheck.test.ts` | Length, Japanese ratio, missing target, copy detection, more than one sentence; kana-only input |
| `tests/sentence/tokenizer.test.ts` | Golden match with Python on 2,000 sentences (`tests/fixtures/sentence/tokenizer-golden.json`, trimmed vocabulary) |
| `tests/sentence/calibrate.test.ts` | Threshold bands, per-level fallback, error-type argmax |
| `tests/sentence/repo.test.ts` | Done = any correct; reset clears attempts; ordering by time |
| `tests/backup*.test.ts` (extend) | v6 round-trip; v5 restore keeps the phone's attempts; counts include `sentencesDone` |
| `tests/sentence/lessonFlow.test.ts` | The step order `learn → quiz → sentence → done`; the quiz is saved before the sentence step; skipping changes no cards |
| `tests/sentence/betaSwitch.test.ts` | Off by default; when off, no sentence step, no downloads, sections hidden; turning off keeps attempts; `paused` in `latest.json` acts as off; the invitation shows at most once, after the 3rd lesson; older settings without the keys load with defaults |
| `ml/sentence-grader/tests/` (pytest + jest) | Conjugator table (§7.4.1); every corruption op on fixture sentences; split leakage (no `source_id` or gold near-duplicate across splits); Claude output validator; threshold calibration; parity gate |
| Manual, on device | 50 sentences typed in romaji and with a Japanese keyboard; airplane mode after download; oldest test iPhone: load <1.5s, predict <300ms, extra memory <200MB |

---

## 12. Files to add or change
```
content/sentences/points.json, feedback.json (+ schemas)        new content
src/sentence/{precheck,normalize,tokenizer,input,grader,calibrate,hints,modelStore,repo}.ts
src/sentence/grader.dev.ts                                      dev-only fake
src/components/SentenceWriter.tsx, LessonDone.tsx
src/app/lessons.tsx                                             'sentence' step
src/app/sentence/[id].tsx, sentence/download.tsx, _layout.tsx
src/app/grammar/[id].tsx, (tabs)/grammar.tsx, progress.tsx, settings.tsx (Beta features section)
src/state/settings.ts                                           sentence_practice_enabled, grader_auto_download
.github/workflows/grader-convert.yml                            macOS convert/parity/eval job
src/state/AppProvider.tsx                                       sentenceDone set
src/db/migrations.ts (17), src/db/repo.ts, src/backup/format.ts (v6)
src/legal/privacy.tsx                                           sentences stay on device / in your backup
modules/kaeru-grader/**
ml/sentence-grader/**                                           offline, not bundled
tests/sentence/**, tests/fixtures/sentence/**
CLAUDE.md
```

---

## 13. Milestones
| Phase | Deliverable | Exit criterion |
|---|---|---|
| **P0: UI with the dev grader** | Beta switch (§3.6), lesson step, point-screen section, map badge, migration 17, backup v6, all with prechecks only | Flow tests and backup tests pass; works in Expo Go in `__DEV__` |
| **P1: Terms and content** | Terms check (§7.1); C1–C2 for all levels, reviewed | Decision recorded; content tests pass (target_forms match every example) |
| **P2: Pilot** | §7.6 on 40 points | Corruption rules kept or cut; subscription vs API decided; pilot model learns |
| **P3: Data and gold** | D1–D6 and C3–C4 for all points; gold set (§7.7) | Dataset report written; gold set finished |
| **P4: Model** | §7.8–7.10 on the Windows laptop, §7.11–7.12 on the macOS runner: 70m (and 130m) trained, calibrated, converted, parity-gated | Release gate §7.12 met on the converted model |
| **P5: Native and delivery** | `modules/kaeru-grader`, tokenizer golden test, download flow | On-device targets met; works offline |
| **P6: Beta release** | App Store release with the switch off by default, plus TestFlight testers | Real learners write 200+ sentences; review the reports and false-rejects |
| **P7: Out of beta** | Default on for new installs, no BETA chip | Over 4+ weeks of beta: release gate still met on the learner-written gold subset, reports under 3% of checks, no `paused` needed |

---

## 14. Risks and open questions
1. **False "not quite" on good sentences** is the worst failure for motivation. *Mitigations:* the `unsure` band, the accept target of 92% or more, and "I think this is right" reports. If the learner-written gold subset misses the target, widen the unsure band before release.
2. **Code-made errors don't look like real learner errors.** Corruptions are cleaner and more regular than real mistakes. *Mitigations:* the C3 judgment sentences, ≥500 real learner sentences in the gold set (reported separately), and opt-in reports feeding retraining (§7.14).
3. **Some corruptions are accidentally still correct** (e.g. a particle swap that also works). *Mitigations:* config-limited swaps, the C4 spot check, and turning off any rule above a 10% error rate.
4. **Kana-only sentences** (from romaji typing) are ambiguous. They're trained on explicitly and reported separately.
5. **Core ML conversion of ModernBERT** may give silently wrong outputs. The parity gate and the pinned toolchain cover this.
6. **Open: what the ✓ means.** This spec adds a *separate* sentence ✓ (on the point screen, plus a badge on the map) and leaves the map's learned ✓ alone. If the owner instead wants the station's ✓ to require a sentence, the current-station logic in `(tabs)/grammar.tsx` and the level progress counts need a separate design.
7. **Open: richer feedback later.** On iPhones with Apple Intelligence, Apple's on-device Foundation Models could add a free-text explanation on top of this grader. Out of scope for v1; check Apple's adapter and toolkit requirements first.
8. **Windows training, macOS conversion.** The laptop can't run Core ML, so the release gate depends on the macOS runner (§7.11). If GitHub's macOS minutes become a problem, the fallback is borrowing any Mac for the 10–20 minute convert-and-check step.
9. **Tatoeba coverage** of rare N1 points will be thin. C3 fill covers the gap, and its share per point is reported in the dataset report.
