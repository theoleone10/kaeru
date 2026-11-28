# Sentence Practice (on-device AI) — spec

Status: draft · Platform: iOS only · Owner: Kaeru

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

### Goals
- Practise *producing* grammar. The rest of the app trains recognition (cloze).
- Free, offline and private. The sentence never leaves the phone except through the learner's own backup or sync.
- Fair grading:
  - A correct sentence is accepted at least 92% of the time (few false "not quite"s).
  - A wrong sentence is caught at least 85% of the time.
- A result in under 300ms after tapping Check.

### Non-goals (v1)
- Android, web and Expo Go. The step and the button are hidden there (§9).
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
  - If `graderAvailable()` (§9) is true, call `setStep('sentence')`.
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
| `calibrate.ts` | Uses the `manifest.thresholds` (§7.6):<br>• `p ≥ accept` gives `correct`<br>• `p ≤ reject` gives `incorrect`, with the top error type<br>• Anything in between gives `unsure` |
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

## 7. The model: building it, and who does each task

The offline pipeline lives in `ml/sentence-grader/` (Python plus Node scripts). It is never bundled: exclude it in `metro.config.js` and `tsconfig.json`.

Pinned in `requirements.txt`: `torch==2.7.0`, `transformers==4.48.3`, `coremltools==9.0`, `anthropic`, `openai` (router client only), `datasets`, `scikit-learn`.

### 7.1 Who does what

| # | Task | Done by | Why | Rough cost |
|---|---|---|---|---|
| T1 | Write `points.json` (`target_forms`, prompts) and `feedback.json` hints for 427 points | **Claude Opus 5.5** in Claude Code, level by level; **human review** in PRs | Needs grammar judgment; this is shipped content, so a person checks it | Interactive |
| T2 | Generate **learner-style sentences** per point:<br>• **correct**: ~100, across registers, including **kana-only** versions (learners typing romaji produce all-kana sentences)<br>• **incorrect**: ~150, ~20 for each error type, imitating real learner mistakes at that level<br>• **off-target**: ~30, lookalike points | **Claude Opus 5.5** via the **Message Batches API** (50% off), structured outputs, effort `medium` | Realistic wrong sentences decide how good the grader is | ~427 × 6 requests × ~3k output tokens ≈ 7.7M out → **≈$80** |
| T3 | **Blind re-label**: grade each generated sentence without seeing what it was meant to be (`correct` / `incorrect` + error type + `natural` 1–3) | **Claude Opus 5.5**, Batches, structured outputs, effort `medium` | Generators make mistakes: an "intended wrong" sentence is sometimes right. Only keep rows where the intent and the blind label agree | ~120k × ~1.2k in / 80 out ≈ **$400** |
| T4 | **Second opinion** on a 20% stratified sample plus every row where T2 and T3 disagree | **A non-Anthropic model through OmniRouter** (OpenAI-compatible), model set in config (`ROUTER_MODEL`) | Catches mistakes the main labeler makes consistently | ≈$50–150 |
| T5 | Settle three-way disagreements | **Claude Opus 5.5**, effort `high`, sees all labels and reasons; anything still unclear goes to the **human queue** | Extra effort only where it matters | ≈$30 |
| T6 | **Gold test set**: 2,500 sentences, including **≥500 written by real learners** (the owner, friends, beta testers who opt in), graded by a **native speaker** | **A human**; Opus 5.5 pre-labels, the human confirms | Gold must not be model-only. Real learner errors differ from synthetic ones | Human time (~20h) |
| T7 | Fine-tune, calibrate, convert, check parity | `train.py` on **one rented GPU** (L4/A10, 2–4h per run) | **Base model: `sbintuitions/modernbert-ja-70m`.** Challenger: `modernbert-ja-130m`. 30m is too small to judge whether a sentence is grammatical | ≈$10–30 per run |
| T8 | On the phone | **Core ML** | No generative model on the device | Free for users |
| T9 | App code (TS, Swift module, UI, tests) | **Claude Code** sessions with reviewed PRs | — | — |

**Routing rule:** call Claude models directly with the Anthropic SDK. The Batches API discount and native structured outputs need the first-party API. Use **OmniRouter** only for non-Claude models (T4), through `ROUTER_BASE_URL` and `ROUTER_API_KEY` from the environment, never committed.

Costs are estimates at batch prices, using prompt caching for the shared rubric and point card. Re-estimate after the pilot (§7.4).

**Data sources not used:** the NAIST Lang-8 learner corpus and similar sets are research or non-commercial only.

### 7.2 Prompts and schemas
- **The point card**, cached in the system prompt, is built from the content: title, meaning, structure, explanation, nuances, common_mistakes, comparisons, and 3 examples. It also contains the error-type table from §6.2 with definitions.
- **T2 output schema** (`output_config.format`, `additionalProperties: false`):
  ```json
  { "sentences": [ { "text": "...", "intended": "correct|incorrect",
                     "error_type": "connection|meaning|register|particle|lookalike|ungrammatical|unnatural|null",
                     "kana_only": false, "register": "casual|polite|written" } ] }
  ```
  The prompt rules:
  - The level's vocabulary only, for example N5 words for N5 points. This keeps sentences learner-like.
  - 5–30 characters.
  - The grammar must appear, except in lookalike rows.
  - No copying of the content examples.
- **T3 output schema:**
  ```json
  { "verdict": "correct|incorrect", "error_type": "...|null", "natural": 1, "reason": "≤20 words" }
  ```
- **Batch handling:**
  - Key results by `custom_id = "<pointId>:<sha1(text)>"`, because results come back in any order.
  - Retry `errored` and `expired` items once.
  - Refusal fallbacks aren't available in Batches, so re-send `stop_reason: "refusal"` items one at a time.
  - Write everything to `data/*.jsonl`.
- Every generated row also goes through `precheck.ts` (run under Node). A row that fails the prechecks is labelled `missing_target`, or dropped if the precheck itself is wrong. A precheck bug goes back to T1 as a rule gap.

### 7.3 Training set rules
- **Keep** a row only if T2's intent matches T3, or if T4/T5 settled it.
- **Label "correct"** means verdict `correct` **and** `natural ≥ 2`. Natural = 1 is labelled `unnatural`.
- **Balance:** about 40% correct and 60% incorrect overall, and at least 10% kana-only.
- **Splits:** hold out 10% per point for validation, and split by **generation request** so near-duplicates never cross over. The gold set (T6) is never trained on.

### 7.4 Pilot before the full run
1. Run T1–T3 for 40 points (20 from N5, 20 from N2) with **both** Opus 5.5 and **Sonnet 5.5** doing the T3 labels.
2. The native speaker grades 400 of those sentences.
3. Report each labeler's agreement with the human. Pick the labeler for the full T3 run. Choosing Sonnet would save about half of T3's cost; **that's the owner's call**.
4. Train a quick 70m model on the pilot data to check the setup learns at all before spending on the full run.

### 7.5 Model and training
- `AutoModel` encoder with **two heads** on the [CLS] / mean-pooled output:
  - **Head A:** `p_correct`, a sigmoid trained with BCE.
  - **Head B:** the error type, a softmax over the 7 model-predicted types (everything except `missing_target`), trained only on incorrect rows.
- **Loss:** `BCE + 0.5 × CE`. Start with learning rate 3e-5, 4 epochs, batch 32, max length 192, warmup 6%, bf16. Seeds {1, 2, 3}; report the mean.
- **Augmentation:** for each correct row, add its kana-only version with probability 0.3 (via `pykakasi`, or have T2 output both). Randomly swap full-width and half-width punctuation.

### 7.6 Calibration
- Temperature-scale Head A on validation.
- Set the thresholds:
  - **`accept`**: the lowest `p` where the false-accept rate is ≤10% on validation.
  - **`reject`**: the highest `p` where the false-reject rate is ≤5%.
  - The gap between them is `unsure`. It must be ≤15% of validation rows; otherwise the model isn't good enough yet.
- Per-level thresholds, if there are ≥150 validation rows per level, otherwise global. Store them as `thresholds: { "_default": {...}, "N1": {...} }`.

### 7.7 Conversion and parity (release-blocking)
- `coremltools.convert` on the traced model:
  - Fixed input shape `[1,192]`, int32 `input_ids` and `attention_mask`.
  - Outputs: `p_logit [1]`, `err_logits [1,7]`.
  - `compute_precision=FLOAT16`, `minimum_deployment_target=iOS16`.
- **Parity gate:** on 2,000 held-out inputs, PyTorch and Core ML (on a Mac) must give:
  - logits within 0.02 (max absolute difference),
  - the same verdict ≥99.9% of the time,
  - the same error type ≥99.5% of the time.

  The build fails otherwise.
- **Size:** about 140MB at fp16 for 70m. Try int8 weight quantization (`coremltools.optimize`); ship it if it passes parity. For a single sentence, the extra latency doesn't matter, and int8 brings it to about 70MB.
- Pick 70m vs 130m: ship 130m only if it beats 70m by ≥3 points of balanced accuracy on gold **and** its int8 size is ≤150MB.
- **Output files:** `KaeruGrader.mlpackage`, `tokenizer.json`, and `manifest.json`:
  ```json
  { "version": "2027.01.1", "base": "modernbert-ja-70m", "seq": 192,
    "errorTypes": ["connection","meaning","register","particle","lookalike","ungrammatical","unnatural"],
    "files": { "model": {"url": "...", "sha256": "...", "bytes": 0},
               "tokenizer": {"url": "...", "sha256": "...", "bytes": 0} },
    "thresholds": { "_default": {"accept": 0.78, "reject": 0.35} },
    "minAppVersion": "1.3.0", "contentHash": "sha256 of points.json + feedback.json" }
  ```

### 7.8 Release gate (gold set, on the converted model)
- Correct sentences accepted ≥92%.
- Wrong sentences caught ≥85%.
- `unsure` ≤12%.
- The right error type, when caught, ≥70%. It's shown as a hint, so a near-miss is tolerable.
- No JLPT level more than 5 points below the overall figures.
- Learner-written subset reported separately, and accepted ≥88%.

---

## 8. Model delivery
- **Hosting:** Supabase Storage, public bucket `grader-models/<version>/…`, plus `latest.json`. Supabase is already a dependency, and the files contain no user data.
- **When it downloads:**
  - On Wi-Fi, automatically after the learner's **first finished lesson**, if the setting "Download sentence checker automatically on Wi-Fi" is on (the default).
  - On cellular, the in-lesson banner asks first (§3.5).
  - Settings shows "Sentence checker (70MB) · Delete".
- **How:** `expo-file-system` download (check the SDK 57 API for resumable downloads) to Application Support, with `isExcludedFromBackup = true`. Then verify the `sha256`, call `loadModel`, and record `meta.grader_model_version`. Delete the old version only after the new one has loaded.
- **Update check:** fetch `latest.json` when the app opens a sentence screen, at most once a day.
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

**`graderAvailable()`** (TS) is `Platform.OS === 'ios' && KaeruGrader.isAvailable()`. When it's false, the sentence step and the point-screen section are **hidden**, not shown greyed out.

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
- `settings` (synced): `grader_auto_download` (default true).
- `meta` (device only): `grader_model_version`, `grader_model_path`, `grader_reports` (§10.4).

### 10.4 "I think this is right"
- Under a *Not quite* result, a small link stores `{pointId, sentence, p, errorType, modelVersion}` in `meta.grader_reports` (at most 200, local only). It does **not** award the ✓.
- Later (v1.1, opt-in), Settings could export these reports as a file through `expo-sharing`, so they can feed T6 and the next training round.

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
| `ml/sentence-grader/tests/` (pytest) | Parity gate, threshold calibration, split leakage |
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
src/app/grammar/[id].tsx, (tabs)/grammar.tsx, progress.tsx, settings.tsx
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
| **P0: UI with the dev grader** | Lesson step, point-screen section, map badge, migration 17, backup v6, all with prechecks only | Flow tests and backup tests pass; works in Expo Go in `__DEV__` |
| **P1: Content** | T1 for all levels, reviewed | Content tests pass (target_forms match every example) |
| **P2: Pilot** | §7.4 | Labeler chosen; the pilot model learns |
| **P3: Data and gold** | T2–T6 at full scale | Gold set finished |
| **P4: Model** | T7: 70m (and 130m) trained, calibrated, converted, parity-gated | Release gate §7.8 met on the converted model |
| **P5: Native and delivery** | `modules/kaeru-grader`, tokenizer golden test, download flow | On-device targets met; works offline |
| **P6: TestFlight** | Xcode Cloud build | Real learners write 200+ sentences; review the reports and false-rejects |

---

## 14. Risks and open questions
1. **False "not quite" on good sentences** is the worst failure for motivation. *Mitigations:* the `unsure` band, the accept target of 92% or more, and "I think this is right" reports. If the learner-written gold subset misses the target, widen the unsure band before release.
2. **Synthetic errors don't look like real learner errors.** *Mitigations:* ≥500 real learner sentences in the gold set, and opt-in reports feeding the next round.
3. **Kana-only sentences** (from romaji typing) are ambiguous. They're trained on explicitly and reported separately.
4. **Core ML conversion of ModernBERT** may give silently wrong outputs. The parity gate and the pinned toolchain cover this.
5. **Open: what the ✓ means.** This spec adds a *separate* sentence ✓ (on the point screen, plus a badge on the map) and leaves the map's learned ✓ alone. If the owner instead wants the station's ✓ to require a sentence, the current-station logic in `(tabs)/grammar.tsx` and the level progress counts need a separate design.
6. **Open: richer feedback later.** On iPhones with Apple Intelligence, Apple's on-device Foundation Models could add a free-text explanation on top of this grader. Out of scope for v1; check Apple's adapter and toolkit requirements first.
7. **Open:** choose the OmniRouter model for T4 at pilot time.
