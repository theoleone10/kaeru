import type { Palette } from '../theme/colors';

/** The characters to pick from on the profile, drawn in `components/Avatar.tsx`. */
export const AVATARS = ['frog', 'cat', 'fox', 'panda', 'owl', 'rabbit', 'tanuki', 'riceball'] as const;
export type AvatarId = (typeof AVATARS)[number];

export const AVATAR_NAMES: Record<AvatarId, string> = {
  frog: 'Frog',
  cat: 'Cat',
  fox: 'Fox',
  panda: 'Panda',
  owl: 'Owl',
  rabbit: 'Rabbit',
  tanuki: 'Tanuki',
  riceball: 'Rice ball',
};

/** Emoji icons from before the drawn set, mapped to the nearest character (anything else becomes the frog). */
const LEGACY: Record<string, AvatarId> = {
  '🐸': 'frog',
  '🐱': 'cat',
  '🦊': 'fox',
  '🐼': 'panda',
  '🦉': 'owl',
  '🐰': 'rabbit',
  '🐻': 'tanuki',
  '🐨': 'panda',
  '🐯': 'cat',
  '🍙': 'riceball',
  '🍣': 'riceball',
  '🍡': 'riceball',
};

/** Background colours, as palette keys so they work in light and dark mode. */
export const AVATAR_COLORS = {
  green: 'correctSoft',
  indigo: 'accentSoft',
  blue: 'blueSoft',
  gold: 'goldSoft',
  rose: 'wrongSoft',
  orange: 'peachSoft',
} as const satisfies Record<string, keyof Palette>;

export type AvatarColor = keyof typeof AVATAR_COLORS;

export const isAvatar = (v: unknown): v is AvatarId => typeof v === 'string' && (AVATARS as readonly string[]).includes(v);
export const isAvatarColor = (v: unknown): v is AvatarColor => typeof v === 'string' && v in AVATAR_COLORS;

/** A stored avatar (a character id, or an emoji from an older version) as a character id. */
export function toAvatar(v: unknown): AvatarId | null {
  if (isAvatar(v)) return v;
  if (typeof v === 'string' && v.length <= 8 && /\p{Extended_Pictographic}/u.test(v)) return LEGACY[v] ?? 'frog';
  return null;
}
