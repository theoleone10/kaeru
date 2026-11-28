# Grammar Spotter (on-device AI) — spec

Status: draft · Platform: iOS only · Owner: Kaeru

## 1. Summary

The Grammar Spotter takes Japanese text the learner found in the wild and highlights every JLPT grammar point it contains. The text can be pasted, shared from another app, or read from a photo. Each highlight links to that point on the train map and shows the learner's status for it (known, due, learning, not learned yet).

It runs entirely on the phone and is free to use. It has two stages:

1. **Rules find candidates.** Hand-written patterns for all 427 points, in TypeScript, tuned to catch everything (high recall).
2. **A small model confirms them.** A fine-tuned `sbintuitions/modernbert-ja-30m` (Core ML, about 75MB, downloaded on first use) decides whether each candidate really is that grammar point in context (high precision).

Nothing is generated on the device, so the feature can't invent Japanese or invent grammar points. It can only confirm or reject candidates from the app's own curriculum.

### Goals
- Make immersion time count: connect the Immerse step and Timer to the Grammar map.
- Precision of at least 95%: a highlight the learner sees should almost always be right.
- Recall of at least 90% on real text across N5–N1.
- Fast: 1,000 characters analysed in under 1 second on the oldest supported iPhone.
- Private: the text never leaves the phone.

### Non-goals (v1)
- Android, web and Expo Go. The feature is hidden there, except for a developer-only rules preview (§5.6).
- Explaining sentences, translation or chat. There is no generative model.
- Changing FSRS scheduling. Sightings are informational and do not count as reviews.
- Vocabulary or kanji spotting.

---

## 2. Facts this spec relies on (checked 2026-11-28)

| Fact | Source / how checked |
|---|---|
| The project uses Expo SDK 57 (`expo ~57.0.25`) with RN 0.86.3 | `package.json` |
| `expo-modules-core@57.0.19` sets the iOS platform to **16.4**, so the effective minimum is iOS 16.4 | its podspec (`s.platforms`) |
| There are 427 grammar points and 2,106 example sentences | `content/n5–n1.json` (N5 96/487, N4 98/486, N3 83/413, N2 79/395, N1 65/325) |
| The backup format is **v5** (CLAUDE.md says v3, which is out of date) | `src/backup/format.ts` |
| There are 16 schema migrations, so the spotter's migration is the 17th | `src/db/migrations.ts` |
| ModernBERT-Ja is MIT licensed | SB Intuitions JLR2025 slides; the 130m card says `license: mit`. **Confirm the 30m/70m card fields before release.** |
| ModernBERT-Ja uses a SentencePiece unigram tokenizer (from sarashina2) with byte fallback, a 102,400-piece vocabulary, and no MeCab | model cards |
| 30m: 37M parameters (10M excluding embeddings), hidden size 256, 10 layers. 70m: 70M parameters (31M excluding embeddings), hidden size 384, 13 layers | model cards |
| The authors did **not** evaluate token classification (NER) because of the tokenizer | SB Intuitions slides, so we frame the task as sentence classification |
| ModernBERT converts to Core ML, but one public conversion gives wrong outputs with no error. The known-good toolchain is torch 2.7.0, transformers 4.48.3 and coremltools 9.0; transformers 5.x emits an op coremltools can't convert; int8 halved the size but doubled latency in one test | `znaat/modernbert-coreml`; Ruri v3 (built on ModernBERT-Ja) has a Core ML build for iOS 18 (`takahashim/ruri-v3-130m-coreml`) |
| `expo-share-intent@8.x` peers `expo ^57` (v9 is for SDK 58) | `npm view` |
| docs.expo.dev was **unreachable** from the authoring environment | Re-check every Expo API in this spec against `https://docs.expo.dev/versions/v57.0.0/` before writing code (AGENTS.md rule) |

---

## 3. User experience

### 3.1 Entry points
1. **Today → Immerse step.** A secondary button, "Spot grammar in what you're reading".
2. **Timer tab ⋯ menu → "Spot grammar".** While a timer runs, the result screen shows a small "counting toward Immersion" chip. That chip is cosmetic: time tracking is unchanged.
3. **Share sheet** from Safari, Kindle, X and similar apps, by sharing text to Kaeru. This uses `expo-share-intent@8`, which adds an iOS share extension through its config plugin.
4. **Photo.** Pick an image or take one, for example a manga panel, sign or screenshot. Apple Vision reads the text on the phone (§6.3).
5. **Grammar point screen** (`grammar/[id]`). A line reading "Seen in the wild: 12 times". Tapping it shows the saved sentences.

### 3.2 Screens (Expo Router)
| Route | Purpose |
|---|---|
| `src/app/spot/index.tsx` | Input: a large text box (paste), plus "Paste", "Photo" and "Camera" buttons. Shows the model status (ready / needs download / downloading 43%). |
| `src/app/spot/result.tsx` | The analysed text with highlights, a summary bar, and a sheet that opens when a highlight is tapped. |
| `src/app/spot/download.tsx` (modal) | The one-time model download: size, Wi-Fi recommendation, progress, cancel. |
| `src/app/spot/saved.tsx` | Saved sentences, filterable by point and level. |

Register them in `src/app/_layout.tsx` in the same way as the existing `track/*` screens.

### 3.3 Result screen
- **Highlights** are underlines in the app's theme colours, keyed by status:
  - *Mastered* (`isMastered(card)`): soft green. Only shown when "Show mastered" is on (off by default, to reduce noise).
  - *Learning* (has a card, not mastered): blue.
  - *Due now* (`card.due <= now`, not suspended): orange, with a dot.
  - *Not learned, current level or below*: purple. These are "next up".
  - *Not learned, higher level*: grey. Shown only when "Show all levels" is on.
- **Overlaps:** when highlights nest, the inner one is drawn as a second underline and tapping opens a picker. The rules in §5.4 keep this rare.
- **Summary bar:** for example "9 grammar points · 2 due · 3 new at your level", with chips per level.
- **Tap sheet:** the point title and meaning (from content), the matched sentence with the span marked, and actions:
  - "Open point" goes to `/grammar/[id]`.
  - "Save sentence" stores it (§7).
  - "Learn this next" moves the point to the front of the new-points queue. Use the existing lessons ordering hook if there is one; otherwise drop this action from v1.
  - "Not right?" saves a local false-positive report (§9.4).
- **Confidence:** model scores are never shown as numbers. Candidates between the low and high thresholds can appear as dotted underlines if "Show maybes" is on (off by default).

### 3.4 Empty and error states
- No Japanese found: "No Japanese text found."
- No grammar found: "No grammar points found. Try a longer passage."
- Model not downloaded: show rules-only results with an "Improve accuracy: download the 75MB model" banner. Rules-only results are recall-tuned, so they must be filtered to the high-precision subset (`rule.precision === 'high'`, §5.3) before they're shown. That keeps false positives low even without the model.
- Device not supported (iOS < 16.4 can't happen; the Core ML load failing can): fall back to rules-only, record it, and don't nag.

### 3.5 Limits
- At most 5,000 characters per analysis (above that, analyse the first 5,000 and say so).
- Photo OCR: one image at a time.

---

## 4. Architecture

```
input text ──► normalize ──► split sentences ──► rule matcher ──► candidates
                                                     (TS, all platforms)
                                                         │
                         SentencePiece tokenizer (TS) ◄──┘
                                   │ ids + masks (batches of 8 × 128)
                                   ▼
                     KaeruSpotter native module (Swift, Core ML)
                                   │ logits
                                   ▼
                calibrate (per-point thresholds) ─► resolve overlaps ─► join learner status ─► UI
```

Design rules:
- **Everything except the matrix maths is TypeScript.** It runs in Jest, in every time zone, on CI with no device. The native module only turns token ids into logits.
- **The rules and the model share one pattern file**, so the training data and the app can never disagree about what counts as a candidate.
- **Character offsets are UTF-16 indices into the original input**, because that's what RN `Text` uses. Normalization keeps a map back to the original (§5.1).

---

## 5. Pipeline in detail (TypeScript, `src/spotter/`)

### 5.1 `normalize.ts`
- Convert full-width ASCII to half-width and half-width katakana to full-width. Remove zero-width characters and collapse whitespace runs.
- **Do not** apply NFKC to the whole string. It changes 〜 / ～ and some punctuation that patterns depend on.
- Return `{ text, toOriginal: Int32Array }`, where `toOriginal[i]` is the original UTF-16 offset of normalized index `i`.
- Tests: every transform round-trips its offsets. Emoji (surrogate pairs) keep their position.

### 5.2 `sentences.ts`
- Split on `。！？!?` and newlines. Don't split inside 「」『』（）. A run of closing quotes after 。 stays with the sentence.
- Sentences longer than 120 characters are split again at 、 near the middle, for the model window only. Candidates keep their full-sentence context for display.

### 5.3 Patterns: `content/spotter/patterns.json` + `content/spotter/patterns.schema.json`

One entry per grammar point id. **Every id in `content/n*.json` must have an entry** (a test enforces this).

```jsonc
{
  "n3-tte": {
    "rules": [
      { "id": "quote-end", "re": "{PLAIN}って(?=[。、！？」]|$|よ|ね|さ)", "precision": "high" },
      { "id": "topic",     "re": "{NOUNISH}って[、]?",                     "precision": "low"  }
    ],
    "excludes": ["{V-TE-STEM}って"],          // 待って, 行って (て-forms are not this point)
    "lookalikes": ["n4-te-form", "n4-to-iu"], // used for hard negatives in training
    "span": "match"                           // or a named group: "(?<g>…)"
  }
}
```

- **Macros** (`macros.ts`) expand to regex fragments. They approximate word classes without a morphological analyser. Examples:
  - `{V-TE}`: て/で forms, including irregulars (して, 来て, 行って).
  - `{V-MASU-STEM}`, `{V-PLAIN}`, `{V-NAI}`, `{V-TA}`, `{V-VOLITIONAL}`, `{V-POTENTIAL}`.
  - `{I-ADJ}`, `{NA-ADJ}`, `{NOUNISH}` (kanji/katakana runs, or hiragana nouns from a short list).
  - `{PLAIN}`: any plain-form predicate ending.

  Macros may be loose, because the model handles precision. Each macro has its own unit tests.
- `precision: "high"` marks rules that are safe to show without the model (rules-only mode, §3.4).
- **Compile once** at module load into `RegExp` objects with the `u` and `y` flags. Matching scans each sentence once per rule. There are about 1,500 rules, so the budget is under 50ms for 5,000 characters in Hermes; benchmark this in a Jest perf test with a generous bound.
- **Generated, then reviewed:** patterns are drafted by a model (§8, task T1) and reviewed by a human. The file is content, edited like `n*.json`.

### 5.4 `matcher.ts` and `resolve.ts`
- Each candidate is `{ pointId, ruleId, start, end, sentenceIndex, rulePrecision }`.
- Resolution happens after scoring:
  1. Drop candidates below their point's threshold `t_low`.
  2. If the same span (or a subset of it) has several points, keep the highest-scoring one. Keep a second point only if it's in the other's `lookalikes` list **and** both pass `t_high`. Those are shown with the picker.
  3. Specific beats general: if candidate A's span strictly contains B's and A ≥ `t_high`, drop B when B is listed in A's `subsumes` field (optional in the pattern file, e.g. `n2-ni-kagitte` subsumes `n5-ni`).
  4. Cap at 3 highlights per character.
- Output: `Spot[]` with the original offsets, sorted.

### 5.5 `tokenizer.ts`: SentencePiece unigram in TypeScript
- Load `tokenizer.json` (the Hugging Face format exported from the model repo; about 2–3MB, shipped with the model download, not in the bundle).
- Implement the unigram Viterbi segmentation with byte fallback (`<0xXX>` pieces) and the model's normalizer settings, exactly as the reference does.
- **Golden test:** `tests/fixtures/spotter/tokenizer-golden.json` holds 2,000 sentences tokenized by the Python `transformers` tokenizer, pinned to 4.48.3. The TS output must match exactly, ids included. The fixture uses a trimmed vocabulary covering only those sentences, to keep the repo small.
- We tokenize in TS rather than Swift because it's testable in Jest, adds no Swift package dependency, and keeps the native module tiny.

### 5.6 `verifier.ts`
- **Model input** (one candidate):
  `"{point.title}：{point.meaning}" [SEP] "{left context}⟦{span}⟧{right context}"`
  - Example: `〜って：casual quote / casual topic [SEP] 彼、会社を辞めるんだ⟦って⟧。`
  - ⟦ ⟧ are U+27E6/U+27E7. Check they tokenize to stable pieces; if not, add two special tokens during fine-tuning.
  - Conditioning on the point's text, rather than one output per point, lets a single binary head cover all 427 points. It also generalises to rare points.
- Pad or truncate to **128 tokens**, keeping the marked span centred. Group into **batches of 8**. These fixed shapes are what the Core ML model is compiled for (§8, T9).
- Score: `p = sigmoid(logit)`. Thresholds come from `manifest.thresholds[pointId] ?? manifest.thresholds._default`, as `{ low, high }`.
- **Availability:** `Platform.OS === 'ios' && KaeruSpotter.isAvailable() && modelStore.ready`. Otherwise the result is `mode: 'rules'`.
- **Developer rules preview:** in `__DEV__` on any platform, show rules-only results with a "rules preview" banner, so UI work can happen in Expo Go or on Android.

### 5.7 `status.ts`
- Join spots with `getAllCards(db)`: no card means *not learned*; `isMastered` means *mastered*; `due <= now && !suspended` means *due*; anything else is *learning*.
- "Current level" is the highest level with at least one learned card, or the placement result if there is none.

---

## 6. Native: local Expo module `modules/kaeru-spotter/`

Before writing it, confirm the exact module APIs against the SDK 57 docs (the "Modules API" and "local Expo module" pages). It must be a **local Expo module**, not hand-edited `ios/` files (CNG rule). Create it with `npx create-expo-module@latest --local`; the SDK 57 tag on npm is `create-expo-module@57.x`.

### 6.1 Layout
```
modules/kaeru-spotter/
  expo-module.config.json      // { "platforms": ["apple"], "apple": { "modules": ["KaeruSpotterModule"] } }
  index.ts                     // typed JS wrapper; on non-iOS, returns isAvailable() === false
  ios/KaeruSpotter.podspec     // links CoreML.framework, Vision.framework
  ios/KaeruSpotterModule.swift
  ios/Verifier.swift           // Core ML wrapper
  ios/TextRecognizer.swift     // Vision OCR
```

### 6.2 Module API (JS side)
```ts
isAvailable(): boolean                                           // true on iOS
loadModel(compiledOrPackagePath: string): Promise<{ computeUnits: string }>
unloadModel(): Promise<void>
score(inputIds: number[][], attentionMask: number[][]): Promise<number[]>  // 8×128 in, 8 logits out
recognizeText(imageUri: string): Promise<{ text: string; lines: { text: string; box: [number, number, number, number] }[] }>
```
- `loadModel`: if it's given a `.mlpackage`, call `MLModel.compileModel(at:)` once and keep the compiled `.mlmodelc` under Application Support (`spotter/<version>/`). Load with `MLModelConfiguration.computeUnits = .all`. Use `.cpuAndNeuralEngine` only if benchmarking shows it's faster.
- `score`: build `MLMultiArray` inputs (`Int32`, shape `[8,128]`), run `prediction(from:)` off the main thread, and return logits as `[Double]`. Reject with a typed error on a shape mismatch.
- Keep one model instance and unload it on a memory warning (`UIApplication.didReceiveMemoryWarningNotification`).
- The model files live in Application Support with `isExcludedFromBackup = true`, so iCloud doesn't back up 75MB.

### 6.3 OCR: `recognizeText`
- `VNRecognizeTextRequest`, `recognitionLevel = .accurate`, `recognitionLanguages = ["ja-JP"]`, `usesLanguageCorrection = true`. Confirm that `supportedRecognitionLanguages()` includes `ja-JP` at iOS 16.4; Japanese was added in revision 3.
- Vertical text (manga): Vision returns columns as separate lines. Join lines in reading order (right-to-left columns when the boxes are tall and narrow). Unit-test the ordering helper in TS with fixture boxes.
- Image picking: `expo-image-picker`, SDK 57 version (`npx expo install expo-image-picker`). It needs `NSPhotoLibraryUsageDescription` and `NSCameraUsageDescription` set through its config plugin in `app.json`.

### 6.4 Config changes (`app.json`)
- `expo-share-intent` plugin (v8) for the share extension. Text only (`NSExtensionActivationSupportsText`, web URLs off for v1).
- `expo-image-picker` plugin with the permission strings.
- No changes to `plugins/scene-lifecycle` or `plugins/app-intents`. Check that the share extension target builds under Xcode Cloud (see `docs/incidents/2026-11-15-xcode-cloud-release.md`).

---

## 7. Data, backup and sync

### 7.1 Migration 17
```sql
CREATE TABLE spotter_sightings (           -- one row per point per day, no text
  grammar_id TEXT NOT NULL,
  day TEXT NOT NULL,                      -- dayKey (local time)
  count INTEGER NOT NULL,
  PRIMARY KEY (grammar_id, day)
);
CREATE TABLE spotter_saved (               -- only sentences the learner chose to save
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grammar_id TEXT NOT NULL,
  sentence TEXT NOT NULL,
  span_start INTEGER NOT NULL,
  span_end INTEGER NOT NULL,
  source TEXT NOT NULL,                   -- 'paste' | 'share' | 'photo'
  saved_at INTEGER NOT NULL
);
${bumpTriggers(['spotter_sightings', 'spotter_saved'])}
```
- **Privacy default:** analysed text is never stored. Only per-day counts and explicitly saved sentences are.
- Sightings are counted once per point per analysis (not per occurrence), when the result screen renders with model mode on. Rules-preview mode doesn't count.

### 7.2 Backup v6 (`src/backup/format.ts`)
- `BACKUP_FORMAT_VERSION = 6`. Add `spotter?: { sightings: Row[]; saved: Row[] }` with a validator (`validateSpotter`).
- `readAllForBackup` / `replaceAllFromBackup`: include both tables. **A v1–v5 file has no `spotter` section, and restoring it keeps the phone's own spotter rows** (same pattern as `anki` / `kana`).
- `backupCounts`: add `savedSentences` and include it in `isEmptyProgress` and `describeCounts` ("4 saved sentences"), so `reconcileAction` never silently replaces them. Sightings are not counted (minor stats).
- Update the CLAUDE.md note "currently v3" to "currently v6".
- Model files and the downloaded tokenizer are **not** backed up.

### 7.3 Settings and meta
- `settings` (synced): `spotter_show_mastered`, `spotter_show_all_levels`, `spotter_show_maybes`.
- `meta` (device only): `spotter_model_version`, `spotter_model_path`, `spotter_fp_reports` (JSON, capped at 200).

---

## 8. Building the model: tasks and who does each

The offline pipeline lives in `ml/spotter/` (Python). It is **not** part of the app bundle: exclude it in `metro.config.js` and `tsconfig.json`, and add it to `.easignore` if one exists. Pin it in `ml/spotter/requirements.txt`: `torch==2.7.0`, `transformers==4.48.3`, `coremltools==9.0`, plus `datasets`, `anthropic`, `openai` (only for the router client), `scikit-learn`.

### 8.1 Who does what

| # | Task | Done by | Why this choice | Rough cost |
|---|---|---|---|---|
| T1 | Draft `patterns.json` (rules, excludes, lookalikes, subsumes) for 427 points | **Claude Opus 5.5** in a Claude Code session, level by level; **human review** of each level's PR | Needs grammar judgment and regex skill; output is reviewed content, not training data | Interactive (subscription) |
| T2 | Collect the raw corpus | Scripts (no model) | See §8.2 for sources | $0 |
| T3 | Generate synthetic sentences: positives across registers (casual, manga, news, polite, written) and **hard negatives** (lookalike strings that are *not* the point) | **Claude Opus 5.5**, Message Batches API, structured outputs | Quality of hard negatives decides precision; batch is 50% off | ~427 points × 2 requests × ~2k output tokens ≈ 1.7M out → **≈$20–40** |
| T4 | Extract candidates from corpus and synthetic data | `ml/spotter/extract.ts`, the **app's own matcher** run under Node | Guarantees training candidates match what the app produces | $0 |
| T5 | Silver labels: is this candidate really point X? (`yes` / `no` / `unsure`, plus the correct point id if another one fits, and a one-line reason) | **Claude Opus 5.5**, Batches API, structured outputs, effort `medium` | Main label source; ~150k candidates | ≈150M in / 22M out tokens ≈ **$500** at batch rates. *Option:* **Claude Sonnet 5.5** at about half the cost, **only if** a 2,000-item pilot agrees with Opus ≥97% |
| T6 | Second opinion on a 20% stratified sample plus every T5 `unsure` | **A non-Anthropic model through OmniRouter** (OpenAI-compatible endpoint) | Catches mistakes the primary labeler makes consistently. Use whichever strong Japanese-capable model the router offers, set by config (`ROUTER_MODEL`), not hard-coded | ≈$50–150, depending on the model |
| T7 | Adjudicate disagreements between T5 and T6 | **Claude Opus 5.5**, effort `high`, given both labels and reasons; anything still unsure goes to the **human queue** | Higher effort only where it matters | ≈$20 |
| T8 | **Gold set** (3,000 stratified candidates plus 50 real pages end to end) | **A human**, ideally a native speaker; Opus 5.5 pre-annotates, the human confirms | Gold must not be model-only, or we only measure agreement with the labeler | Human time (~15–20h) |
| T9 | Fine-tune the student, calibrate and convert | `ml/spotter/train.py` on **one rented GPU** (L4/A10, ~2–4h per run) or an Apple Silicon Mac (MPS, slower) | Base model **`sbintuitions/modernbert-ja-30m`**; train **70m** as the challenger | ≈$5–20 per run |
| T10 | Run on the device | **Core ML**, 30m, fp16, ~75MB | No generative model on device | Free for users |
| T11 | OCR | **Apple Vision** (built in) | Already on the phone, good Japanese | Free |
| T12 | App code (TS, Swift module, UI, tests) | **Claude Code** sessions, reviewed PRs | Normal dev workflow | — |

**Routing rule:** call Claude models directly through the Anthropic SDK (`@anthropic-ai/sdk` / `anthropic`), not through OmniRouter. The Batches API discount and native structured outputs need the first-party API. OmniRouter is only for non-Claude models (T6), through its OpenAI-compatible base URL (`ROUTER_BASE_URL`, `ROUTER_API_KEY` from the environment, never committed).

Costs are estimates at the Batches API's 50% discount, assuming about 1,000 input tokens and 150 output tokens per labeling request. Run the pilot (§8.4) and re-estimate before the full run. Prompt caching of the shared system prompt lowers input costs further.

### 8.2 Corpus (T2): licence-checked sources only
| Source | Licence | Use |
|---|---|---|
| Kaeru's own `content/n*.json` examples (2,106) | ours | Positives; also a test that each point's rules match its own examples |
| Tatoeba Japanese sentences | CC BY 2.0 FR | Everyday sentences; credit in the about/legal page if any text ships (none does) |
| Japanese Wikipedia (sampled sentences) | CC BY-SA 4.0 | Written/formal register; used only for training |
| Aozora Bunko (post-1950 works only, to avoid archaic grammar) | public domain | Literary register |
| Synthetic (T3) | ours | Casual, manga, chat registers; hard negatives |
| **Excluded:** JParaCrawl and other non-commercial corpora | — | Not allowed in a commercial app |

Target: ~150k candidates in total, at least 150 per point (oversample rare N1 points with T3), and **at least 40% negatives**, mostly hard negatives from lookalikes.

### 8.3 Prompts and output schemas (T3, T5)
- **System prompt (cached):** labeling instructions plus the definition card for the point being checked and its lookalikes, built from `content/n*.json` (title, meaning, structure, explanation, nuances, common_mistakes, comparisons, two examples).
- **T5 output** (`output_config.format`, JSON schema, `additionalProperties: false`):
  ```json
  { "label": "yes|no|unsure", "other_point_id": "string|null", "reason": "string (≤20 words)" }
  ```
- **T3 output:** `{ "sentences": [{ "text": "...", "register": "...", "is_point": true|false, "span": "..." }] }`. Each sentence is then checked: the span must occur in the text, and the matcher must produce a candidate for it (otherwise it goes to a "rule gap" report that feeds back into T1).
- **Batch handling:**
  - Results come back in any order, so key them by `custom_id = "<pointId>:<candidateHash>"`.
  - Retry `errored` and `expired` items once.
  - Server-side refusal fallbacks are **not available in Batches**, so items with `stop_reason: "refusal"` are re-sent individually, outside the batch.
  - Record all of these in `ml/spotter/data/labels.jsonl`.
- Use Opus 5.5's default adaptive thinking. Set `effort` explicitly (`medium` for T3 and T5, `high` for T7).

### 8.4 Pilot before the full run
1. T1 for N5 and N4 only, T3 for those points, and T5 on 2,000 candidates with **both** Opus 5.5 and Sonnet 5.5.
2. The human labels 300 of those 2,000.
3. Report agreement (Opus vs human, Sonnet vs human, Opus vs Sonnet). Choose the T5 model for the full run on that data. **Choosing Sonnet is the owner's call**, since it trades quality for cost.

### 8.5 Training (T9)
- **Task:** binary cross-encoder (input format in §5.6), `AutoModelForSequenceClassification` with `num_labels=1` and BCE loss.
- **Data:** silver labels, with `unsure` items dropped. Weight hard negatives ×1.5.
- **Split by grammar point family**, not by random row, for validation: hold out 10% of sentences per point, and make sure synthetic paraphrases of one seed never straddle the split.
- **Hyperparameters to start with:** learning rate 5e-5, 3 epochs, batch size 64, max length 128, warmup 6%, weight decay 0.01, bf16. Seeds {1, 2, 3}; report the mean.
- **Calibration:**
  - Temperature-scale on validation.
  - For each point, `high` is the lowest threshold that reaches precision ≥0.95 on validation, and `low` is the one that reaches precision ≥0.80.
  - Points with fewer than 30 validation items use `_default`.
- **Pick 30m vs 70m:** ship 30m unless 70m beats it by ≥2 points of F1 on the gold set **and** stays under 40ms per batch on the oldest test device.

### 8.6 Conversion and parity (T9, critical)
- `coremltools.convert` from a traced model with fixed input shapes `[8,128]` (`input_ids`, `attention_mask`, both int32), `compute_precision=FLOAT16`, `minimum_deployment_target=iOS16`.
- **Parity gate:** on 1,000 held-out inputs, the maximum absolute difference in logits between PyTorch and Core ML (run on a Mac) must be ≤0.02, and the yes/no decision must agree ≥99.9% of the time. The build fails otherwise. This guards against the silently wrong conversions others have seen.
- Try int8 weight quantization (`coremltools.optimize`). Ship it only if it passes the parity gate *and* isn't slower on the device (§8.7).
- **Output:** `KaeruSpotter.mlpackage`, `tokenizer.json`, and `manifest.json`:
  ```json
  { "version": "2027.01.1", "base": "modernbert-ja-30m", "seq": 128, "batch": 8,
    "files": { "model": {"url": "...", "sha256": "...", "bytes": 0},
               "tokenizer": {"url": "...", "sha256": "...", "bytes": 0} },
    "thresholds": { "_default": {"low": 0.5, "high": 0.85}, "n3-tte": {"low": 0.42, "high": 0.81} },
    "minAppVersion": "1.3.0", "patternsHash": "sha256 of patterns.json used in training" }
  ```

### 8.7 On-device benchmark
- Use the oldest iPhone available. iOS 16.4 still runs on iPhone 8/X (A11), but treat the **A12+ Neural Engine** as the performance target.
- Measure load time, the time for one batch of 8, and memory.
- Targets: load in under 1.5s, under 40ms per batch, under 150MB extra memory.
- If the A11 misses the targets, still allow the feature but limit text to 2,000 characters on devices without A12+.

---

## 9. Model delivery and updates

### 9.1 Hosting
- Supabase Storage, public bucket `spotter-models`, path `<version>/…`, plus `latest.json`, which points to the current manifest. Supabase is already a dependency. The files are public and contain no user data.
- The app fetches `latest.json` only when the learner opens the spotter (at most once a day). There are no background requests.

### 9.2 Download (`src/spotter/modelStore.ts`)
- Download with `expo-file-system` (check the SDK 57 API for resumable or background downloads).
- Show the size before downloading, and recommend Wi-Fi but don't enforce it.
- Verify the `sha256` of each file, then call `loadModel`, write `meta.spotter_model_version`, and delete the previous version only after the new one has loaded.
- Settings → "Grammar Spotter model (75MB) · Delete" frees the space.

### 9.3 Compatibility
- If `manifest.minAppVersion` is greater than the app version, keep the old model.
- If `manifest.patternsHash` differs from the bundled `patterns.json` hash, still use the model, but log a mismatch in dev builds. A new pattern file should ship together with a retrained model.

### 9.4 Feedback loop (local only)
- "Not right?" stores `{pointId, ruleId, sentence, score, modelVersion}` in `meta.spotter_fp_reports`. Nothing is uploaded in v1.
- Later (v1.1, opt-in only), a "Send reports" button in Settings could share them as a file through `expo-sharing`, so the owner can feed them back into T8.

---

## 10. Privacy and legal
- All analysis runs on the device. Text, photos and OCR results are never uploaded or stored, except sentences the learner explicitly saves (which follow normal backup and sync if signed in).
- Update `src/legal/privacy.tsx`: describe the spotter, the model download from Kaeru's storage (an IP address is visible to the host, the same as any download), and saved sentences syncing.
- Licences:
  - Add the ModernBERT-Ja MIT notice to an "Open-source licences" section.
  - Training-data licences don't require shipping attribution because no corpus text ships. Record them in `ml/spotter/DATA_LICENSES.md` anyway.

---

## 11. Testing

Everything must pass `npm run test:zones`, and dates use local-time constructors.

| Test | What it checks |
|---|---|
| `tests/spotter/patterns.test.ts` | Every grammar id has an entry; every regex compiles; every `lookalikes`/`subsumes` id exists; **each point's rules match its own `cloze_target` in ≥95% of its content examples** (a free recall check over 2,106 sentences) |
| `tests/spotter/macros.test.ts` | Each macro matches its conjugation table and rejects listed non-matches |
| `tests/spotter/normalize.test.ts` | Offset maps, surrogate pairs, full-width/half-width conversion |
| `tests/spotter/sentences.test.ts` | Quotes, brackets, long-sentence splitting |
| `tests/spotter/tokenizer.test.ts` | Golden parity with the Python tokenizer (§5.5) |
| `tests/spotter/resolve.test.ts` | Thresholds, overlaps, subsumption, caps |
| `tests/spotter/status.test.ts` | Status mapping, including suspended and due cards, across time zones |
| `tests/spotter/ocrOrder.test.ts` | Vertical/horizontal line ordering from fixture boxes |
| `tests/backup*.test.ts` (extend) | v6 round-trip; v5 file keeps the phone's spotter rows; `backupCounts` includes saved sentences |
| `tests/spotter/perf.test.ts` | Matcher on 5,000 characters stays under a generous time bound |
| `ml/spotter/tests/` (pytest) | Parity gate, threshold calibration, split leakage check |
| Manual on device | 50-page gold set end to end; share extension from Safari; photo of a manga panel; airplane mode after download |

**Release gate (gold set):**
- Precision ≥0.95, recall ≥0.90 overall.
- No level below precision 0.90.
- Rules-only `high` subset precision ≥0.95.

---

## 12. Files to add or change

```
content/spotter/patterns.json              (new, content)
content/spotter/patterns.schema.json       (new)
src/spotter/normalize.ts sentences.ts macros.ts matcher.ts resolve.ts
src/spotter/tokenizer.ts verifier.ts status.ts modelStore.ts repo.ts index.ts
src/app/spot/index.tsx result.tsx download.tsx saved.tsx
src/app/_layout.tsx                        (register routes)
src/components/SpotText.tsx SpotSheet.tsx  (highlighted text, tap sheet)
src/app/(tabs)/index.tsx, (tabs)/timer.tsx, grammar/[id].tsx   (entry points)
src/db/migrations.ts                       (migration 17)
src/db/repo.ts, src/backup/format.ts       (backup v6)
src/legal/privacy.tsx, src/app/settings.tsx
modules/kaeru-spotter/**                   (local Expo module)
app.json                                   (expo-share-intent, expo-image-picker plugins)
ml/spotter/**                              (offline pipeline; excluded from bundle)
tests/spotter/**, tests/fixtures/spotter/**
CLAUDE.md                                  (backup version note → v6; spotter notes)
```

---

## 13. Milestones

| Phase | Deliverable | Exit criterion |
|---|---|---|
| **P0: Rules preview** | `normalize`, `sentences`, `macros`, `matcher`, `resolve`, `patterns.json` for N5–N4, result UI in rules-preview mode | Content-example recall test passes for N5–N4; UI usable in Expo Go |
| **P1: Patterns complete** | T1 for N3–N1, reviewed | Recall test ≥95% for all 427 points |
| **P2: Data** | Pilot (§8.4), then T2–T8 | Gold set done; labeler choice recorded |
| **P3: Model** | T9: 30m and 70m trained, calibrated, converted, parity-gated | Gold precision/recall gate met in Python and in Core ML on a Mac |
| **P4: Native and delivery** | `modules/kaeru-spotter`, tokenizer golden test, model download, OCR, share extension | On-device benchmark targets met; dev build works offline |
| **P5: Progress data** | Migration 17, backup v6, sync triggers, saved sentences, "seen in the wild" | Backup and sync tests pass in four time zones |
| **P6: TestFlight** | Xcode Cloud build | 50-page manual gold pass; no crashes at launch (scene life cycle intact) |

---

## 14. Risks and open questions
1. **Regex macros without a morphological analyser** may miss unusual conjugations. *Mitigation:* T3 rule-gap reports feed back into T1, and recall is measured against the gold set. *Fallback:* add a tiny dictionary of verb stems (under 1MB) if recall is short.
2. **⟦ ⟧ marker tokenization** may be unstable. *Mitigation:* add special tokens at fine-tune time; the tokenizer golden test covers them.
3. **Core ML conversion of ModernBERT** may give silently wrong outputs. *Mitigation:* the parity gate (§8.6) and pinned toolchain.
4. **Labeler bias:** the student learns Claude's mistakes. *Mitigation:* the T6 second opinion and a human gold set.
5. **The share extension and Xcode Cloud:** a new app extension target needs its own signing and bundle id (`com.theoleone.kaeru.share`). Confirm Xcode Cloud handles it before P4.
6. **App size:** the model is downloaded, so the bundle grows only by the patterns file (~200KB) and code.
7. **Open:** should a sighting nudge FSRS (e.g. count as an "easy" exposure)? Not in v1. Revisit after real usage data.
8. **Open:** pick the OmniRouter model for T6 when the pilot starts, based on its Japanese quality and price at that time.
