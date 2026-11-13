import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Kaeru's own icon set, drawn on a 24×24 grid. Each icon has a line style (tab bar, quiet
 * spots) and a filled style (active tab, coloured tiles). Use this instead of Ionicons, except
 * for brand logos.
 */
export type IconName =
  | 'learn'
  | 'review'
  | 'cards'
  | 'timer'
  | 'grammar'
  | 'flame'
  | 'star'
  | 'check'
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronDown'
  | 'play'
  | 'stop'
  | 'plus'
  | 'minus'
  | 'close'
  | 'more'
  | 'search'
  | 'settings'
  | 'cloudUp'
  | 'cloudDown'
  | 'logout'
  | 'trash'
  | 'mail'
  | 'hint'
  | 'pencil'
  | 'copy'
  | 'person'
  | 'chart'
  | 'calendar'
  | 'kana'
  | 'download'
  | 'upload'
  | 'link'
  | 'bell'
  | 'info'
  | 'arrowRight'
  | 'undo'
  | 'volume'
  | 'eye';

type Props = {
  name: IconName;
  size?: number;
  color: string;
  /** Filled style (solid shapes) instead of lines. */
  filled?: boolean;
  /** Colour of details cut into a filled icon (usually the surface behind it). */
  cutout?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 24, color, filled = false, cutout = '#FFFFFF', strokeWidth = 2 }: Props) {
  const line = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const solid = { fill: color } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {draw(name, filled, line, solid, color, cutout, strokeWidth)}
    </Svg>
  );
}

type LineProps = { fill: 'none'; stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round' };

function draw(name: IconName, filled: boolean, line: LineProps, solid: { fill: string }, color: string, cutout: string, sw: number) {
  switch (name) {
    case 'learn':
      return filled ? (
        <>
          <Path d="M3 5.5C5.5 4.5 8.5 4.5 12 6.5c3.5-2 6.5-2 9-1v13c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z" {...solid} />
          <Path d="M12 6.5v13" stroke={cutout} strokeWidth={1.6} />
        </>
      ) : (
        <Path d="M3 5.5C5.5 4.5 8.5 4.5 12 6.5c3.5-2 6.5-2 9-1v13c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1zM12 6.5v13" {...line} />
      );
    case 'review':
      return <Path d="M19.5 10.5A7.5 7.5 0 0 0 6 6.5L4.5 8M4.5 3.5V8H9M4.5 13.5A7.5 7.5 0 0 0 18 17.5l1.5-1.5M19.5 20.5V16H15" {...line} strokeWidth={filled ? sw + 0.4 : sw} />;
    case 'cards':
      return filled ? (
        <>
          <Rect x={8} y={3} width={12} height={15} rx={2.5} {...solid} />
          <Path d="M4.5 7v10.5A3.5 3.5 0 0 0 8 21h7.5" {...line} />
          <Path d="M11 8h6M11 11h4" stroke={cutout} strokeWidth={1.6} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Rect x={8} y={3} width={12} height={15} rx={2.5} {...line} />
          <Path d="M4.5 7v10.5A3.5 3.5 0 0 0 8 21h7.5" {...line} />
        </>
      );
    case 'timer':
      return filled ? (
        <>
          <Circle cx={12} cy={13.5} r={7.5} {...solid} />
          <Path d="M12 13.5V8.5A5 5 0 0 1 16.3 11z" fill={cutout} />
          <Path d="M9.5 3h5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Circle cx={12} cy={13.5} r={7.5} {...line} />
          <Path d="M12 10v3.5l2.5 2M9.5 2.5h5" {...line} />
        </>
      );
    case 'grammar':
      return filled ? (
        <>
          <Rect x={5} y={3} width={14} height={13} rx={4} {...solid} />
          <Rect x={7.5} y={5.5} width={9} height={4} rx={1.2} fill={cutout} />
          <Circle cx={9} cy={13} r={1.1} fill={cutout} />
          <Circle cx={15} cy={13} r={1.1} fill={cutout} />
          <Path d="M8.5 16.5l-2 4M15.5 16.5l2 4" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Rect x={5} y={3} width={14} height={13} rx={4} {...line} />
          <Path d="M5 10h14M8.5 16l-2.5 5M15.5 16l2.5 5M7.5 19h9" {...line} />
        </>
      );
    case 'flame':
      return (
        <>
          <Path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9z" fill={color} />
          {filled && <Path d="M12 13c.6 1.6 2 2.2 2 4a2 2 0 0 1-4 0c0-.8.4-1.4.8-1.8 0 .8.4 1.2.8 1.2 0-1.2-.4-2.4.4-3.4z" fill={cutout} />}
        </>
      );
    case 'star':
      return <Path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 6L12 16.5 6.7 19.4l1.1-6L3.4 9.3l6-.8z" {...(filled ? solid : line)} strokeLinejoin="round" />;
    case 'check':
      return <Path d="M5 12.5l4.5 4.5L19 7.5" {...line} strokeWidth={filled ? sw + 1 : sw} />;
    case 'chevronRight':
      return <Path d="M9 5l7 7-7 7" {...line} />;
    case 'chevronLeft':
      return <Path d="M15 5l-7 7 7 7" {...line} />;
    case 'chevronDown':
      return <Path d="M5 9l7 7 7-7" {...line} />;
    case 'play':
      return <Path d="M7 4.5v15l12.5-7.5z" fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />;
    case 'stop':
      return <Rect x={5} y={5} width={14} height={14} rx={3} fill={color} />;
    case 'plus':
      return <Path d="M12 5v14M5 12h14" {...line} />;
    case 'minus':
      return <Path d="M5 12h14" {...line} />;
    case 'close':
      return <Path d="M6 6l12 12M18 6L6 18" {...line} />;
    case 'more':
      return (
        <>
          <Circle cx={5.5} cy={12} r={1.9} fill={color} />
          <Circle cx={12} cy={12} r={1.9} fill={color} />
          <Circle cx={18.5} cy={12} r={1.9} fill={color} />
        </>
      );
    case 'search':
      return <Path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20" {...line} />;
    case 'settings':
      return (
        <>
          <Circle cx={12} cy={12} r={3} {...line} />
          <Path
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
            {...line}
          />
        </>
      );
    case 'cloudUp':
      return <Path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5zM12 15v-5M9.5 12.5L12 10l2.5 2.5" {...line} />;
    case 'cloudDown':
      return <Path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5zM12 10v5M9.5 12.5L12 15l2.5-2.5" {...line} />;
    case 'logout':
      return <Path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" {...line} />;
    case 'trash':
      return <Path d="M4 7h16M10 7V4.5h4V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" {...line} />;
    case 'mail':
      return (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={3} {...line} />
          <Path d="M4 7l8 6 8-6" {...line} />
        </>
      );
    case 'hint':
      return <Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" {...line} />;
    case 'pencil':
      return <Path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3" {...line} />;
    case 'copy':
      return (
        <>
          <Rect x={8} y={8} width={12} height={12} rx={2.5} {...line} />
          <Path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" {...line} />
        </>
      );
    case 'person':
      return <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0" {...line} />;
    case 'chart':
      return <Path d="M5 20V12M10 20V6M15 20v-9M20 20V9M3 20h18" {...line} />;
    case 'calendar':
      return (
        <>
          <Rect x={3.5} y={5} width={17} height={15} rx={3} {...line} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...line} />
        </>
      );
    case 'kana':
      return <Path d="M6 6.5h9M10.5 3.5c-.5 6-2 11-5 14.5M14 10c3 0 5 1.8 5 4.5s-2.5 5-6.5 5c-2.5 0-4-1-4-2.6 0-1.6 1.8-2.9 4-2.9 2.6 0 4.5 1.5 5.5 4" {...line} />;
    case 'download':
      return <Path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" {...line} />;
    case 'upload':
      return <Path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14" {...line} />;
    case 'link':
      return <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...line} />;
    case 'bell':
      return <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4" {...line} />;
    case 'info':
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} {...line} />
          <Path d="M12 11v5" {...line} />
          <Circle cx={12} cy={7.8} r={1.2} fill={color} />
        </>
      );
    case 'arrowRight':
      return <Path d="M5 12h13M13 6l6 6-6 6" {...line} />;
    case 'undo':
      return <Path d="M9 7L4.5 11.5 9 16M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-3" {...line} />;
    case 'volume':
      return <Path d="M4 9.5v5h3.5L12 19V5L7.5 9.5zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" {...line} />;
    case 'eye':
      return (
        <>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...line} />
          <Circle cx={12} cy={12} r={3} {...line} />
        </>
      );
  }
}
