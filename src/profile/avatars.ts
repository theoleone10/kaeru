import type { Palette } from '../theme/colors';

/** Icons to pick from on the profile: animals, food and things from Japan. */
export const AVATARS = [
  '🐸', '🐱', '🐶', '🦊', '🐼', '🐰', '🐻', '🐨', '🐯', '🦉', '🐧', '🐢',
  '🐙', '🦄', '🐲', '🐳', '🌸', '🍣', '🍙', '🍡', '🍵', '🗻', '⛩️', '🎏',
] as const;

/** Background colours, as palette keys so they work in light and dark mode. */
export const AVATAR_COLORS = {
  green: 'correctSoft',
  indigo: 'accentSoft',
  blue: 'blueSoft',
  gold: 'goldSoft',
  rose: 'wrongSoft',
  orange: 'noticeSoft',
} as const satisfies Record<string, keyof Palette>;

export type AvatarColor = keyof typeof AVATAR_COLORS;

export const isAvatar = (v: unknown): v is string => typeof v === 'string' && (AVATARS as readonly string[]).includes(v);
export const isAvatarColor = (v: unknown): v is AvatarColor => typeof v === 'string' && v in AVATAR_COLORS;
