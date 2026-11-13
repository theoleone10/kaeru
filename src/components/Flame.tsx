import { Icon } from './Icon';

/** The streak flame: the filled flame icon with a warm core (pass `core` to change it, e.g. when the flame is greyed out). */
export function Flame({ size = 20, color, core = '#FFD27A' }: { size?: number; color: string; core?: string }) {
  return <Icon name="flame" size={size} color={color} filled cutout={core} />;
}
