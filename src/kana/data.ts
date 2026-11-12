/*
 * The kana course: hiragana, then katakana, a row (or a few) per lesson, in the order
 * Japanese teaches them. Romaji is Hepburn, as on signs and in dictionaries. Each lesson's
 * example words use only kana taught up to and including that lesson (tests check this).
 */

export type Script = 'hiragana' | 'katakana';

export interface Kana {
  kana: string;
  romaji: string;
}

export interface KanaWord {
  word: string;
  romaji: string;
  meaning: string;
}

export interface KanaLesson {
  /** Stable id, stored with progress: "h1" … "k15". */
  id: string;
  script: Script;
  title: string;
  kana: Kana[];
  /** One or two things worth knowing about this row. */
  tip: string;
  words: KanaWord[];
}

/** Split "あa いi うu" style lists. */
function row(pairs: string): Kana[] {
  return pairs
    .trim()
    .split(/\s+/)
    .map((p) => {
      const m = /^([^a-z]+)([a-z]+)$/.exec(p);
      if (!m) throw new Error(`Bad kana pair: ${p}`);
      return { kana: m[1], romaji: m[2] };
    });
}

const w = (word: string, romaji: string, meaning: string): KanaWord => ({ word, romaji, meaning });

export const HIRAGANA: KanaLesson[] = [
  {
    id: 'h1',
    script: 'hiragana',
    title: 'Vowels',
    kana: row('あa いi うu えe おo'),
    tip: 'Every sound in Japanese is built on these five vowels. They are always short and clear: a as in "father", i as in "machine", u as in "food" (without rounding the lips), e as in "pet", o as in "port".',
    words: [w('あい', 'ai', 'love'), w('いえ', 'ie', 'house'), w('うえ', 'ue', 'above'), w('あおい', 'aoi', 'blue')],
  },
  {
    id: 'h2',
    script: 'hiragana',
    title: 'K row',
    kana: row('かka きki くku けke こko'),
    tip: 'K plus each vowel. か and が look alike; the two small marks come later and make the sound voiced.',
    words: [w('かお', 'kao', 'face'), w('いけ', 'ike', 'pond'), w('ここ', 'koko', 'here'), w('あき', 'aki', 'autumn')],
  },
  {
    id: 'h3',
    script: 'hiragana',
    title: 'S row',
    kana: row('さsa しshi すsu せse そso'),
    tip: 'し is "shi", not "si". さ and ち are mirror images of each other, so watch the direction of the curve.',
    words: [w('すし', 'sushi', 'sushi'), w('かさ', 'kasa', 'umbrella'), w('あさ', 'asa', 'morning'), w('せかい', 'sekai', 'world')],
  },
  {
    id: 'h4',
    script: 'hiragana',
    title: 'T row',
    kana: row('たta ちchi つtsu てte とto'),
    tip: 'ち is "chi" and つ is "tsu": Japanese has no "ti" or "tu" here. Say "tsu" like the end of "cats".',
    words: [w('くつ', 'kutsu', 'shoes'), w('ちかてつ', 'chikatetsu', 'subway'), w('そと', 'soto', 'outside'), w('たかい', 'takai', 'expensive')],
  },
  {
    id: 'h5',
    script: 'hiragana',
    title: 'N row',
    kana: row('なna にni ぬnu ねne のno'),
    tip: 'ぬ and め differ by the little loop at the end: ぬ has it, め doesn\'t. ね and れ and わ share a left stroke.',
    words: [w('いぬ', 'inu', 'dog'), w('ねこ', 'neko', 'cat'), w('なつ', 'natsu', 'summer'), w('おかね', 'okane', 'money')],
  },
  {
    id: 'h6',
    script: 'hiragana',
    title: 'H row',
    kana: row('はha ひhi ふfu へhe ほho'),
    tip: 'ふ is "fu", a soft f made with both lips. As a particle は is read "wa" and へ is read "e".',
    words: [w('はな', 'hana', 'flower'), w('ひと', 'hito', 'person'), w('ふね', 'fune', 'boat'), w('ほし', 'hoshi', 'star')],
  },
  {
    id: 'h7',
    script: 'hiragana',
    title: 'M row',
    kana: row('まma みmi むmu めme もmo'),
    tip: 'め looks like ぬ without the loop. も has two crossbars on a hook.',
    words: [w('あめ', 'ame', 'rain'), w('みみ', 'mimi', 'ear'), w('むし', 'mushi', 'insect'), w('もの', 'mono', 'thing')],
  },
  {
    id: 'h8',
    script: 'hiragana',
    title: 'Y and R rows',
    kana: row('やya ゆyu よyo らra りri るru れre ろro'),
    tip: 'Only three Y sounds: ya, yu, yo. The Japanese r is a quick tap of the tongue, halfway between r, l and d. る has a loop at the bottom, ろ doesn\'t.',
    words: [w('やま', 'yama', 'mountain'), w('ゆき', 'yuki', 'snow'), w('よる', 'yoru', 'night'), w('さくら', 'sakura', 'cherry blossom')],
  },
  {
    id: 'h9',
    script: 'hiragana',
    title: 'W and N',
    kana: row('わwa をwo んn'),
    tip: 'を is only used as the object particle and sounds just like お. ん is the only kana that is a consonant on its own.',
    words: [w('わたし', 'watashi', 'I, me'), w('ほん', 'hon', 'book'), w('にほん', 'nihon', 'Japan'), w('みかん', 'mikan', 'mandarin orange')],
  },
  {
    id: 'h10',
    script: 'hiragana',
    title: 'G and Z (voiced)',
    kana: row('がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo'),
    tip: 'Two small marks (゛, dakuten) voice a sound: k becomes g, s becomes z. じ is "ji".',
    words: [w('かぎ', 'kagi', 'key'), w('ごはん', 'gohan', 'rice, meal'), w('かぜ', 'kaze', 'wind; a cold'), w('みず', 'mizu', 'water')],
  },
  {
    id: 'h11',
    script: 'hiragana',
    title: 'D and B (voiced)',
    kana: row('だda ぢji づzu でde どdo ばba びbi ぶbu べbe ぼbo'),
    tip: 'ぢ and づ sound the same as じ and ず and are rare. With the dakuten, h becomes b.',
    words: [w('まど', 'mado', 'window'), w('でんわ', 'denwa', 'telephone'), w('かばん', 'kaban', 'bag'), w('ともだち', 'tomodachi', 'friend')],
  },
  {
    id: 'h12',
    script: 'hiragana',
    title: 'P (half-voiced)',
    kana: row('ぱpa ぴpi ぷpu ぺpe ぽpo'),
    tip: 'A small circle (゜, handakuten) on the H row makes a P.',
    words: [w('さんぽ', 'sanpo', 'a walk'), w('ぺらぺら', 'perapera', 'fluent'), w('てんぷら', 'tenpura', 'tempura'), w('ぽかぽか', 'pokapoka', 'nice and warm')],
  },
  {
    id: 'h13',
    script: 'hiragana',
    title: 'Combinations 1',
    kana: row('きゃkya きゅkyu きょkyo しゃsha しゅshu しょsho ちゃcha ちゅchu ちょcho にゃnya にゅnyu にょnyo'),
    tip: 'A small ゃ, ゅ or ょ after an i-sound kana blends them into one beat: き + ゃ = きゃ (kya). A small っ doubles the next consonant: きって (kitte), stamp.',
    words: [w('きょう', 'kyō', 'today'), w('おちゃ', 'ocha', 'tea'), w('しゃしん', 'shashin', 'photograph'), w('きって', 'kitte', 'postage stamp')],
  },
  {
    id: 'h14',
    script: 'hiragana',
    title: 'Combinations 2',
    kana: row('ひゃhya ひゅhyu ひょhyo みゃmya みゅmyu みょmyo りゃrya りゅryu りょryo ぎゃgya ぎゅgyu ぎょgyo じゃja じゅju じょjo びゃbya びゅbyu びょbyo ぴゃpya ぴゅpyu ぴょpyo'),
    tip: 'The same small ゃ ゅ ょ work with every i-sound kana. A vowel written twice, or う after o, makes it long: とうきょう is Tōkyō.',
    words: [w('りょこう', 'ryokō', 'trip'), w('ぎゅうにゅう', 'gyūnyū', 'milk'), w('じゅぎょう', 'jugyō', 'class, lesson'), w('ひゃく', 'hyaku', 'hundred')],
  },
];

export const KATAKANA: KanaLesson[] = [
  {
    id: 'k1',
    script: 'katakana',
    title: 'Vowels',
    kana: row('アa イi ウu エe オo'),
    tip: 'Katakana are the same sounds as hiragana in a sharper, straighter style. They write foreign words, names and sound effects. A dash ー makes a vowel long.',
    words: [w('エア', 'ea', 'air'), w('アイ', 'ai', 'eye (as in アイマスク, eye mask)')],
  },
  {
    id: 'k2',
    script: 'katakana',
    title: 'K row',
    kana: row('カka キki クku ケke コko'),
    tip: 'カ looks like the hiragana か without its little stroke. ク and ケ are easy to mix up: ケ has a long crossbar.',
    words: [w('ケーキ', 'kēki', 'cake'), w('ココア', 'kokoa', 'cocoa'), w('カカオ', 'kakao', 'cacao'), w('コーク', 'kōku', 'Coke')],
  },
  {
    id: 'k3',
    script: 'katakana',
    title: 'S row',
    kana: row('サsa シshi スsu セse ソso'),
    tip: 'シ (shi) and ツ (tsu) are the classic pair to confuse: シ\'s strokes come up from the bottom-left, ツ\'s come down from the top. ソ and ン work the same way.',
    words: [w('アイス', 'aisu', 'ice cream'), w('スキー', 'sukī', 'skiing'), w('ソース', 'sōsu', 'sauce'), w('スイス', 'suisu', 'Switzerland')],
  },
  {
    id: 'k4',
    script: 'katakana',
    title: 'T row',
    kana: row('タta チchi ツtsu テte トto'),
    tip: 'ツ strokes fall from the top, unlike シ. タ looks like ク with an extra stroke inside.',
    words: [w('テスト', 'tesuto', 'test'), w('スーツ', 'sūtsu', 'suit'), w('テキスト', 'tekisuto', 'textbook'), w('トースト', 'tōsuto', 'toast')],
  },
  {
    id: 'k5',
    script: 'katakana',
    title: 'N row',
    kana: row('ナna ニni ヌnu ネne ノno'),
    tip: 'ニ is the same as the kanji for two. ヌ and ス differ by one small stroke.',
    words: [w('テニス', 'tenisu', 'tennis'), w('ネクタイ', 'nekutai', 'necktie'), w('カヌー', 'kanū', 'canoe'), w('ノート', 'nōto', 'notebook')],
  },
  {
    id: 'k6',
    script: 'katakana',
    title: 'H row',
    kana: row('ハha ヒhi フfu ヘhe ホho'),
    tip: 'ヘ is almost the same in hiragana and katakana. フ also writes "f" sounds in loanwords.',
    words: [w('ホース', 'hōsu', 'hose'), w('コーヒー', 'kōhī', 'coffee'), w('ハート', 'hāto', 'heart'), w('ヘア', 'hea', 'hair')],
  },
  {
    id: 'k7',
    script: 'katakana',
    title: 'M row',
    kana: row('マma ミmi ムmu メme モmo'),
    tip: 'ミ is three slanted strokes. ム and マ both have a closed corner; マ\'s hangs down to the right.',
    words: [w('メモ', 'memo', 'memo'), w('ハム', 'hamu', 'ham'), w('マスク', 'masuku', 'mask'), w('トマト', 'tomato', 'tomato')],
  },
  {
    id: 'k8',
    script: 'katakana',
    title: 'Y and R rows',
    kana: row('ヤya ユyu ヨyo ラra リri ルru レre ロro'),
    tip: 'Loanwords use the R row for both r and l: ホテル is "hotel". ロ is a square box, like the kanji for mouth (口).',
    words: [w('タオル', 'taoru', 'towel'), w('ユーロ', 'yūro', 'euro'), w('ヨーヨー', 'yōyō', 'yo-yo'), w('カレー', 'karē', 'curry')],
  },
  {
    id: 'k9',
    script: 'katakana',
    title: 'W and N',
    kana: row('ワwa ヲwo ンn'),
    tip: 'ヲ is almost never used. ン (n) and ソ (so) are another pair: ン\'s long stroke goes up from the bottom, ソ\'s comes down.',
    words: [w('ワイン', 'wain', 'wine'), w('ライオン', 'raion', 'lion'), w('レモン', 'remon', 'lemon'), w('ミシン', 'mishin', 'sewing machine')],
  },
  {
    id: 'k10',
    script: 'katakana',
    title: 'G and Z (voiced)',
    kana: row('ガga ギgi グgu ゲge ゴgo ザza ジji ズzu ゼze ゾzo'),
    tip: 'The same ゛ marks as in hiragana.',
    words: [w('ゲーム', 'gēmu', 'game'), w('チーズ', 'chīzu', 'cheese'), w('ギター', 'gitā', 'guitar'), w('ガス', 'gasu', 'gas')],
  },
  {
    id: 'k11',
    script: 'katakana',
    title: 'D and B (voiced)',
    kana: row('ダda ヂji ヅzu デde ドdo バba ビbi ブbu ベbe ボbo'),
    tip: 'ヂ and ヅ are very rare. バ is also how loanwords write v sounds, as in バイオリン (violin).',
    words: [w('ベルト', 'beruto', 'belt'), w('バス', 'basu', 'bus'), w('テレビ', 'terebi', 'TV'), w('ドア', 'doa', 'door')],
  },
  {
    id: 'k12',
    script: 'katakana',
    title: 'P (half-voiced)',
    kana: row('パpa ピpi プpu ペpe ポpo'),
    tip: 'The small circle again. Keep an eye on ペ: it\'s the same in hiragana.',
    words: [w('パン', 'pan', 'bread'), w('ピアノ', 'piano', 'piano'), w('スプーン', 'supūn', 'spoon'), w('ポスト', 'posuto', 'mailbox')],
  },
  {
    id: 'k13',
    script: 'katakana',
    title: 'Combinations 1',
    kana: row('キャkya キュkyu キョkyo シャsha シュshu ショsho チャcha チュchu チョcho ニャnya ニュnyu ニョnyo'),
    tip: 'Small ャ ュ ョ blend just like in hiragana, and a small ッ doubles the next consonant: ベッド (beddo).',
    words: [w('シャツ', 'shatsu', 'shirt'), w('ニュース', 'nyūsu', 'news'), w('チョコ', 'choko', 'chocolate'), w('キャンプ', 'kyanpu', 'camping')],
  },
  {
    id: 'k14',
    script: 'katakana',
    title: 'Combinations 2',
    kana: row('ヒャhya ヒュhyu ヒョhyo ミャmya ミュmyu ミョmyo リャrya リュryu リョryo ギャgya ギュgyu ギョgyo ジャja ジュju ジョjo ビャbya ビュbyu ビョbyo ピャpya ピュpyu ピョpyo'),
    tip: 'The rest of the combinations. In katakana, long vowels are written with ー: コンピューター (computer).',
    words: [w('ジュース', 'jūsu', 'juice'), w('ミュージック', 'myūjikku', 'music'), w('コンピューター', 'konpyūtā', 'computer'), w('ジャム', 'jamu', 'jam')],
  },
  {
    id: 'k15',
    script: 'katakana',
    title: 'Sounds for loanwords',
    kana: row('ファfa フィfi フェfe フォfo ティti ディdi ウィwi ウェwe ウォwo シェshe ジェje チェche'),
    tip: 'Small vowels let katakana write sounds Japanese doesn\'t have: フ + ァ = ファ (fa), テ + ィ = ティ (ti).',
    words: [w('フォーク', 'fōku', 'fork'), w('パーティー', 'pātī', 'party'), w('カフェ', 'kafe', 'café'), w('ウェブ', 'webu', 'web')],
  },
];

export const KANA_LESSONS: KanaLesson[] = [...HIRAGANA, ...KATAKANA];

export function getLesson(id: string): KanaLesson | undefined {
  return KANA_LESSONS.find((l) => l.id === id);
}

/** Every kana in the course, in course order. */
export const ALL_KANA: (Kana & { lesson: string; script: Script })[] = KANA_LESSONS.flatMap((l) => l.kana.map((k) => ({ ...k, lesson: l.id, script: l.script })));

/**
 * Look-alikes, preferred as wrong answers so practice trains the differences that matter.
 * Each group is kana people commonly mix up.
 */
export const CONFUSABLE: readonly string[][] = [
  ['さ', 'ち', 'き'],
  ['ぬ', 'め', 'あ', 'お'],
  ['ね', 'れ', 'わ'],
  ['は', 'ほ', 'け'],
  ['る', 'ろ'],
  ['い', 'り', 'こ'],
  ['シ', 'ツ', 'ン', 'ソ', 'ノ'],
  ['ク', 'ケ', 'タ', 'ワ', 'ウ', 'フ', 'ヌ', 'ス'],
  ['コ', 'ユ', 'ロ'],
  ['チ', 'テ'],
  ['マ', 'ム', 'ア'],
  ['ナ', 'メ'],
  ['セ', 'ヒ', 'せ'],
  ['カ', 'か'],
];
