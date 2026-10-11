/**
 * Anki card template rendering (a practical subset of Anki's template language):
 * {{Field}}, {{#Field}}…{{/Field}}, {{^Field}}…{{/Field}}, {{FrontSide}}, {{Tags}}, {{Deck}},
 * {{Subdeck}}, {{Card}}, {{Type}}, and the filters text:, furigana:, kana:, kanji:,
 * hint:, cloze:, type: (shown as the answer on the back), tts (dropped).
 */

export interface RenderContext {
  fields: Record<string, string>;
  /** Card template ordinal: which cloze number (ord + 1) is active on cloze note types. */
  ord: number;
  isCloze: boolean;
  tags: string;
  deck: string;
  notetype: string;
  cardName: string;
}

type Node = { kind: 'text'; text: string } | { kind: 'tag'; name: string } | { kind: 'section'; name: string; negated: boolean; children: Node[] };

function parse(template: string): Node[] {
  const root: Node[] = [];
  const stack: { name: string; children: Node[] }[] = [{ name: '', children: root }];
  const re = /\{\{([\s\S]*?)\}\}/g;
  let last = 0;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.children.push({ kind: 'text', text: template.slice(last, m.index) });
    last = re.lastIndex;
    const inner = m[1].trim();
    if (inner.startsWith('#') || inner.startsWith('^')) {
      const section: Node = { kind: 'section', name: inner.slice(1).trim(), negated: inner[0] === '^', children: [] };
      top.children.push(section);
      stack.push({ name: section.name, children: section.children });
    } else if (inner.startsWith('/')) {
      const name = inner.slice(1).trim();
      // Close the matching section; tolerate stray closers like Anki does not, but don't crash.
      const idx = stack.map((s) => s.name).lastIndexOf(name);
      if (idx > 0) stack.length = idx;
    } else if (inner.startsWith('!')) {
      // comment
    } else {
      top.children.push({ kind: 'tag', name: inner });
    }
  }
  if (last < template.length) stack[stack.length - 1].children.push({ kind: 'text', text: template.slice(last) });
  return root;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Anki's furigana syntax: optional leading space, base text, [reading]. [sound:…] is not a reading.
const RUBY = / ?([^ >[\]]+?)\[([^\]]+?)\]/g;

export function furigana(s: string): string {
  return s.replace(RUBY, (whole, base: string, reading: string) =>
    reading.startsWith('sound:') ? whole : `<ruby><rb>${base}</rb><rt>${reading}</rt></ruby>`,
  );
}
export function kana(s: string): string {
  return s.replace(RUBY, (whole, _base: string, reading: string) => (reading.startsWith('sound:') ? whole : reading));
}
export function kanji(s: string): string {
  return s.replace(RUBY, (whole, base: string, reading: string) => (reading.startsWith('sound:') ? whole : base));
}

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** Render cloze deletions for cloze number `n` (1-based). */
export function cloze(text: string, n: number, side: 'front' | 'back'): string {
  return text.replace(CLOZE, (_w, num: string, answer: string, hint?: string) => {
    if (Number(num) !== n) return answer;
    if (side === 'front') return `<span class="cloze">[${hint ? escapeHtml(hint) : '...'}]</span>`;
    return `<span class="cloze">${answer}</span>`;
  });
}

/** The text hidden by cloze `n`, for {{type:cloze:…}} on the back. */
export function clozeAnswers(text: string, n: number): string {
  const out: string[] = [];
  text.replace(CLOZE, (_w, num: string, answer: string) => {
    if (Number(num) === n) out.push(stripHtml(answer));
    return '';
  });
  return out.join(', ');
}

/** Which cloze numbers a note uses (a cloze card exists for each). */
export function clozeNumbers(fields: string[]): number[] {
  const nums = new Set<number>();
  for (const f of fields) for (const m of f.matchAll(CLOZE)) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}

function hint(content: string): string {
  if (!content) return '';
  return `<a class="hint" href="#" onclick="this.style.display='none';this.nextElementSibling.style.display='inline';return false;">Show hint</a><span class="hint" style="display:none">${content}</span>`;
}

function fieldValue(ctx: RenderContext, name: string): string | undefined {
  if (name in ctx.fields) return ctx.fields[name];
  const lower = name.toLowerCase();
  const key = Object.keys(ctx.fields).find((k) => k.toLowerCase() === lower);
  return key === undefined ? undefined : ctx.fields[key];
}

function renderTag(tag: string, ctx: RenderContext, side: 'front' | 'back', frontSide: string): string {
  if (tag === 'FrontSide') return side === 'back' ? frontSide : '';
  if (tag === 'Tags') return escapeHtml(ctx.tags);
  if (tag === 'Deck') return escapeHtml(ctx.deck);
  if (tag === 'Subdeck') return escapeHtml(ctx.deck.split('::').pop() ?? '');
  if (tag === 'Card') return escapeHtml(ctx.cardName);
  if (tag === 'Type') return escapeHtml(ctx.notetype);
  if (tag === 'CardFlag' || tag === 'CardID') return '';

  const parts = tag.split(':');
  const fieldName = parts.pop()!.trim();
  const filters = parts.map((f) => f.trim());
  if (filters.some((f) => f.startsWith('tts'))) return '';
  let value = fieldValue(ctx, fieldName);
  if (value === undefined) return '';

  if (filters.includes('type')) {
    // No typing box: the front shows nothing, the back shows the expected answer.
    if (side === 'front') return '';
    const expected = filters.includes('cloze') ? clozeAnswers(value, ctx.ord + 1) : stripHtml(value);
    return `<div class="typed-answer"><code>${escapeHtml(expected)}</code></div>`;
  }

  // Filters apply innermost (rightmost) first.
  for (const f of [...filters].reverse()) {
    switch (f) {
      case 'text':
        value = stripHtml(value);
        break;
      case 'furigana':
        value = furigana(value);
        break;
      case 'kana':
        value = kana(value);
        break;
      case 'kanji':
        value = kanji(value);
        break;
      case 'hint':
        value = hint(value);
        break;
      case 'cloze':
        value = ctx.isCloze ? cloze(value, ctx.ord + 1, side) : value;
        break;
      default:
        break; // unknown filter: pass through like Anki's add-on filters do when missing
    }
  }
  return value;
}

function isNonEmpty(ctx: RenderContext, name: string): boolean {
  const v = fieldValue(ctx, name.includes(':') ? name.split(':').pop()!.trim() : name);
  if (v === undefined) return false;
  if (ctx.isCloze && /\{\{c\d+::/.test(v) && name.toLowerCase().startsWith('cloze:')) return true;
  return stripHtml(v).length > 0 || /<img|\[sound:/i.test(v);
}

function renderNodes(nodes: Node[], ctx: RenderContext, side: 'front' | 'back', frontSide: string): string {
  let out = '';
  for (const n of nodes) {
    if (n.kind === 'text') out += n.text;
    else if (n.kind === 'tag') out += renderTag(n.name, ctx, side, frontSide);
    else {
      const on = isNonEmpty(ctx, n.name);
      if (on !== n.negated) out += renderNodes(n.children, ctx, side, frontSide);
    }
  }
  return out;
}

export function renderTemplate(template: string, ctx: RenderContext, side: 'front' | 'back', frontSide = ''): string {
  return renderNodes(parse(template), ctx, side, frontSide);
}

export interface RenderedCard {
  question: string;
  answer: string;
}

/**
 * Render both sides. Sounds in the question part of the answer ({{FrontSide}}) are marked
 * so they don't autoplay again when the answer is revealed.
 */
export function renderCard(qfmt: string, afmt: string, ctx: RenderContext): RenderedCard {
  const question = renderTemplate(qfmt, ctx, 'front');
  const frontForBack = question.replace(/\[sound:/g, '[sound-noauto:');
  const answer = renderTemplate(afmt, ctx, 'back', frontForBack);
  return { question, answer };
}

/** True when a cloze card has nothing to show (e.g. its cloze number was removed). */
export function isBlankCard(card: RenderedCard): boolean {
  return stripHtml(card.question).length === 0 && !/<img|\[sound/i.test(card.question);
}

export interface CardDocOptions {
  body: string;
  css: string;
  ord: number;
  dark: boolean;
  /** Autoplay this side's sounds (never the question's sounds replayed via {{FrontSide}}). */
  autoplay: boolean;
}

/** One side of a card, ready to drop into the card shell. */
export interface CardContent {
  html: string;
  css: string;
  htmlClass: string;
  bodyClass: string;
  sounds: { src: string; auto: boolean }[];
}

/** Anki's card wrapper classes and night mode, with [sound:…] tags turned into replay buttons. */
export function cardContent({ body, css, ord, dark, autoplay }: CardDocOptions): CardContent {
  const sounds: { src: string; auto: boolean }[] = [];
  const html = body.replace(/\[sound(-noauto)?:([^\]]+)\]/g, (_w, noauto: string | undefined, file: string) => {
    const i = sounds.push({ src: file.trim(), auto: !noauto && autoplay }) - 1;
    return `<a class="replay-button soundLink" href="#" onclick="playSound(${i});return false;" aria-label="Play audio"><svg viewBox="0 0 64 64" width="36" height="36"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="3"/><path d="M26 20 L46 32 L26 44 Z" fill="currentColor"/></svg></a>`;
  });
  return {
    html,
    css,
    htmlClass: dark ? 'night-mode' : '',
    bodyClass: `card card${ord + 1}${dark ? ' nightMode night_mode' : ''}`,
    sounds,
  };
}

/**
 * The page the card view loads once per study session. Each card side is then swapped in with
 * kaeruShow(content) instead of loading a new page, so flipping and moving on are instant.
 * Like Anki, the card's own <script>s are run again after each swap.
 */
export function cardShell(): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
html, body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
body { padding: 16px; background: #FFFFFF; color: #1F2320; }
html.night-mode body { background: #141715; color: #E8EAE6; }
.card { font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; font-size: 22px; text-align: center; }
body.nightMode.card { background-color: #141715; color: #E8EAE6; }
.cloze { font-weight: bold; color: #3F6E5A; }
.nightMode .cloze { color: #79B094; }
img { max-width: 100%; height: auto; }
ruby rt { font-size: 0.55em; }
.replay-button { display: inline-block; vertical-align: middle; color: #3F6E5A; margin: 4px; }
.typed-answer code { font-size: 1.1em; }
hr#answer { margin: 16px 0; }
</style>
<style id="nt"></style>
</head>
<body class="card">
<div id="qa"></div>
<script>
var sounds = [];
var audio = null;
var shown = 0;
function playSound(i, then) {
  if (audio) { audio.pause(); }
  audio = new Audio(sounds[i].src);
  audio.onended = then || null;
  audio.play().catch(function () {});
}
window.kaeruShow = function (c) {
  var me = ++shown;
  if (audio) { audio.pause(); audio = null; }
  document.documentElement.className = c.htmlClass;
  document.body.className = c.bodyClass;
  var nt = document.getElementById('nt');
  if (nt.textContent !== c.css) nt.textContent = c.css;
  var qa = document.getElementById('qa');
  qa.innerHTML = c.html;
  Array.prototype.forEach.call(qa.querySelectorAll('script'), function (old) {
    var s = document.createElement('script');
    for (var i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
    s.text = old.text;
    old.parentNode.replaceChild(s, old);
  });
  window.scrollTo(0, 0);
  sounds = c.sounds;
  var queue = sounds.map(function (s, i) { return s.auto ? i : -1; }).filter(function (i) { return i >= 0; });
  function next() { if (me === shown && queue.length) playSound(queue.shift(), next); }
  next();
};
</script>
</body></html>`;
}

/** JavaScript that shows `content` in the card shell (for injecting into the WebView). */
export function showScript(content: CardContent): string {
  // U+2028/2029 are valid in JSON but not in older JS string literals.
  return `window.kaeruShow(${JSON.stringify(content).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')});true;`;
}

/** A standalone page for one card side: the shell with the content already shown. */
export function cardDocument(content: CardContent): string {
  return cardShell().replace('</body></html>', `<script>${showScript(content)}</script>\n</body></html>`);
}
