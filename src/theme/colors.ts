export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  /** The darker edge under cards and outline buttons (the "3D" lip). */
  borderStrong: string;
  text: string;
  textMuted: string;
  /** Indigo (aizome): primary actions, current state, brand. */
  accent: string;
  accentShadow: string;
  accentText: string;
  accentSoft: string;
  /** Green: correct, done, study. */
  correct: string;
  correctShadow: string;
  correctText: string;
  correctSoft: string;
  wrong: string;
  wrongShadow: string;
  wrongSoft: string;
  notice: string;
  noticeSoft: string;
  /** Gold: mastered, XP, daily goal. */
  gold: string;
  goldShadow: string;
  goldSoft: string;
  /** Blue: immersion, timer, reviews-due info. */
  blue: string;
  blueShadow: string;
  blueSoft: string;
  blueText: string;
  chartBar: string;
}

// Aizome: cool paper ground, Japanese-indigo primary, chunky colour-blocked accents (the green frog pops on it).
export const light: Palette = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#ECEEF5',
  border: '#E2E5EF',
  borderStrong: '#D3D7E5',
  text: '#1B1F33',
  textMuted: '#5E6480',
  accent: '#3D4FA8',
  accentShadow: '#2B3A85',
  accentText: '#FFFFFF',
  accentSoft: '#E4E8F7',
  correct: '#3FA34D',
  correctShadow: '#2E7D39',
  correctText: '#25702F',
  correctSoft: '#D9F0DC',
  wrong: '#DD4B3E',
  wrongShadow: '#AE3226',
  wrongSoft: '#FBE3E0',
  notice: '#8A5A0B',
  noticeSoft: '#FDF1D6',
  gold: '#F2B33D',
  goldShadow: '#C98E1E',
  goldSoft: '#FDF1D6',
  blue: '#2F7FC1',
  blueShadow: '#1F5F95',
  blueSoft: '#EAF3FB',
  blueText: '#1F5F95',
  chartBar: '#2F7FC1',
};

export const dark: Palette = {
  background: '#12141C',
  surface: '#1C1F2B',
  surfaceAlt: '#252938',
  border: '#2F3446',
  borderStrong: '#0A0B10',
  text: '#ECEEF6',
  textMuted: '#A3A9C2',
  accent: '#5366CC',
  accentShadow: '#2E3B85',
  accentText: '#FFFFFF',
  accentSoft: '#262C4A',
  correct: '#4CB85A',
  correctShadow: '#2B7236',
  correctText: '#86D891',
  correctSoft: '#1F3323',
  wrong: '#F07366',
  wrongShadow: '#A7362B',
  wrongSoft: '#3D2220',
  notice: '#F2C66B',
  noticeSoft: '#3A301A',
  gold: '#F2B33D',
  goldShadow: '#A8741A',
  goldSoft: '#3A301A',
  blue: '#5AA3E0',
  blueShadow: '#1F5F95',
  blueSoft: '#1D2C3A',
  blueText: '#9CCBF2',
  chartBar: '#5AA3E0',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22 } as const;
/** Minimum comfortable tap target. */
export const TAP = 52;
/** Height of the 3D lip under chunky buttons and cards. */
export const LIP = 4;

export interface LineColors {
  line: string;
  /** Text on `soft` or on the surface. */
  ink: string;
  soft: string;
}

/** JLPT line colours for the grammar train map (like Tokyo's line colours). Read them from `useApp().lines` so dark mode gets `LEVEL_COLORS_DARK`. */
export const LEVEL_COLORS: Record<string, LineColors> = {
  N5: { line: '#3FA34D', ink: '#25702F', soft: '#E3F3E6' },
  N4: { line: '#2A9D8F', ink: '#1F6F66', soft: '#DDF1EE' },
  N3: { line: '#2F7FC1', ink: '#1F5F95', soft: '#E3EFFA' },
  N2: { line: '#8E5BB5', ink: '#6B3FA0', soft: '#F1E8FB' },
  N1: { line: '#D9663D', ink: '#A3431F', soft: '#FCE6DA' },
};

/** Same lines on dark surfaces: deep tinted chips with light text. */
export const LEVEL_COLORS_DARK: Record<string, LineColors> = {
  N5: { line: '#3FA34D', ink: '#86D891', soft: '#1F3323' },
  N4: { line: '#2A9D8F', ink: '#7FD1C6', soft: '#17302D' },
  N3: { line: '#2F7FC1', ink: '#9CCBF2', soft: '#1D2C3A' },
  N2: { line: '#8E5BB5', ink: '#C9A8EA', soft: '#2C2238' },
  N1: { line: '#D9663D', ink: '#F2A07F', soft: '#3E2A20' },
};

export const FONTS = {
  regular: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extra: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
  jp: 'ZenMaruGothic_500Medium',
  jpBold: 'ZenMaruGothic_700Bold',
  jpBlack: 'ZenMaruGothic_700Bold', // only 500 + 700 ship (each Japanese weight is ~3.7 MB)
} as const;

/** Pick the loaded font file for a weight (custom fonts on native need one family per weight). */
export function fontFor(weight: string | number | undefined, jp = false): string {
  const w = Number(weight ?? 600) || 600;
  if (jp) return w >= 850 ? FONTS.jpBlack : w >= 650 ? FONTS.jpBold : FONTS.jp;
  if (w >= 850) return FONTS.black;
  if (w >= 750) return FONTS.extra;
  if (w >= 650) return FONTS.bold;
  return FONTS.regular;
}
