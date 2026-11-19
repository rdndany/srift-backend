'use client';

import { useEffect, useRef } from 'react';
import { ATLAS_COLS, ATLAS_ROWS, BLOCKS, TILE_NAMES, TILE_PX } from '@solrift/shared';
import { paintTile } from '../game/atlas';

/** How much of the light each face of a block catches (top, the side facing left, the side facing right). */
const SHADE = { top: 1, left: 0.8, right: 0.6 } as const;
/** Grass is painted grey-green and tinted by the biome in the game; here it gets a fixed meadow green. */
const TINT: readonly [number, number, number] = [0.55, 0.85, 0.34];

let sheet: HTMLCanvasElement | null = null;
const faces = new Map<string, HTMLCanvasElement>();

/** One block face: the game's own tile, painted by the game's own painter, shaded and (for biome-tinted pixels) tinted. */
function face(tile: number, shade: number): HTMLCanvasElement {
  const key = `${tile}:${shade}`;
  const hit = faces.get(key);
  if (hit) return hit;
  if (!sheet) {
    sheet = document.createElement('canvas');
    sheet.width = ATLAS_COLS * TILE_PX;
    sheet.height = ATLAS_ROWS * TILE_PX;
  }
  const sctx = sheet.getContext('2d', { willReadFrequently: true })!;
  paintTile(sctx, TILE_NAMES[tile], tile);
  const sx = (tile % ATLAS_COLS) * TILE_PX;
  const sy = Math.floor(tile / ATLAS_COLS) * TILE_PX;
  const img = sctx.getImageData(sx, sy, TILE_PX, TILE_PX);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    const tinted = a >= 248 && a < 255;
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, d[i + c] * shade * (tinted ? TINT[c] * 1.35 : 1));
    if (tinted) d[i + 3] = 255;
  }
  const out = document.createElement('canvas');
  out.width = out.height = TILE_PX;
  out.getContext('2d')!.putImageData(img, 0, 0);
  faces.set(key, out);
  return out;
}

/**
 * A block of the game drawn as an isometric cube: its top and two sides come from the game's tile painters, so it
 * looks exactly like it does in the world. Pass the block's id (`B.GRASS`) and a size in pixels.
 */
export function BlockCube({ id, size = 56, className = '' }: { id: number; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const S = Math.round(size * dpr);
    cv.width = S;
    cv.height = S;
    const def = BLOCKS[id];
    const a = S / 2; // half the width
    const b = S / 4; // half the height of the top diamond
    const v = S / 2; // the height of a side
    ctx.clearRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = false;
    const k = 1 / TILE_PX;
    ctx.save();
    ctx.setTransform(a * k, b * k, -a * k, b * k, S / 2, 0);
    ctx.drawImage(face(def.tiles.top, SHADE.top), 0, 0);
    ctx.restore();
    ctx.save();
    ctx.setTransform(a * k, b * k, 0, v * k, 0, b);
    ctx.drawImage(face(def.tiles.side, SHADE.left), 0, 0);
    ctx.restore();
    ctx.save();
    ctx.setTransform(a * k, -b * k, 0, v * k, S / 2, 2 * b);
    ctx.drawImage(face(def.tiles.side, SHADE.right), 0, 0);
    ctx.restore();
  }, [id, size]);
  return <canvas ref={ref} className={`fx-block ${className}`} width={size} height={size} aria-hidden="true" style={{ width: size, height: size }} />;
}

/** A little cluster of blocks for the corner of a title (still: they do not move). */
export function Blocks({ ids, size = 64 }: { ids: readonly number[]; size?: number }) {
  return (
    <div className="fp-blocks" aria-hidden="true">
      {ids.map((id, i) => (
        <span key={`${id}-${i}`} style={{ marginTop: i % 2 ? size * 0.28 : 0 }}>
          <BlockCube id={id} size={size} />
        </span>
      ))}
    </div>
  );
}
