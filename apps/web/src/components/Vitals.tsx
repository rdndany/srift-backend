'use client';

import { MAX_AIR } from '@solrift/shared';
import { useUi } from '../ui/store';

const BUBBLE = ['...xxx...', '.xhhxxxx.', '.hxxxxxs.', 'xhxxxxxxs', 'xxxxxxxxs', 'xxxxxxxxs', '.xxxxxxs.', '.xxxxxxs.', '...xss...'];

/** Lighten (amount > 0) or darken (< 0) a #rrggbb colour. */
function tone(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

/** One air bubble in pixel art: x = the body, h = a highlight, s = a shade. */
function Bubble({ lit }: { lit: boolean }) {
  const color = lit ? '#8fd2ff' : '#1a2b3b';
  const shades = { x: color, h: tone(color, lit ? 0.5 : 0.35), s: tone(color, -0.3) };
  const cells: { x: number; y: number; c: 'x' | 'h' | 's' }[] = [];
  BUBBLE.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '.') cells.push({ x, y, c: c as 'x' | 'h' | 's' });
    }),
  );
  return (
    <svg className="pix" viewBox="-1 -1 11 11" shapeRendering="crispEdges">
      {cells.map(({ x, y }) =>
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].map(([dx, dy]) => <rect key={`o${x},${y},${dx},${dy}`} x={x + dx} y={y + dy} width={1} height={1} fill="#111" />),
      )}
      {cells.map(({ x, y, c }) => (
        <rect key={`f${x},${y}`} x={x} y={y} width={1} height={1} fill={shades[c]} />
      ))}
    </svg>
  );
}

/**
 * The air left while under water, a row of bubbles above the experience bar (health, food and armor are in the
 * character frame in the top left corner, see PlayerFrame).
 */
export function AirBubbles() {
  const mode = useUi((s) => s.mode);
  const air = useUi((s) => s.air);
  if (mode === 'creative') return null;
  const bubbles = air < MAX_AIR - 0.01 ? Math.ceil((air / MAX_AIR) * 10) : 0;
  if (bubbles <= 0) return null;
  return (
    <div id="air-row" className="vrow">
      {Array.from({ length: 10 }, (_, i) => (
        <Bubble key={i} lit={i < bubbles} />
      ))}
    </div>
  );
}