export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  correct: string;
  correctSoft: string;
  wrong: string;
  wrongSoft: string;
  notice: string;
  noticeSoft: string;
  chartBar: string;
}

// Calm, low-saturation palette: a muted green accent on warm neutrals.
export const light: Palette = {
  background: '#F6F5F1',
  surface: '#FFFFFF',
  surfaceAlt: '#EEEDE7',
  border: '#DEDCD3',
  text: '#1F2320',
  textMuted: '#6B706A',
  accent: '#3F6E5A',
  accentText: '#FFFFFF',
  accentSoft: '#DCE8E1',
  correct: '#2F7A4F',
  correctSoft: '#DDF0E3',
  wrong: '#B3443B',
  wrongSoft: '#F6E0DD',
  notice: '#8A6414',
  noticeSoft: '#F5EBD2',
  chartBar: '#7FA592',
};

export const dark: Palette = {
  background: '#141715',
  surface: '#1D211F',
  surfaceAlt: '#262B28',
  border: '#343A36',
  text: '#E8EAE6',
  textMuted: '#9AA19B',
  accent: '#79B094',
  accentText: '#0F1411',
  accentSoft: '#243A2F',
  correct: '#6CC48F',
  correctSoft: '#1E3527',
  wrong: '#E07F76',
  wrongSoft: '#3D2320',
  notice: '#E0B45C',
  noticeSoft: '#3A301A',
  chartBar: '#5E8C75',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;
/** Minimum comfortable tap target. */
export const TAP = 52;
