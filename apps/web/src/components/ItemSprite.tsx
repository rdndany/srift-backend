'use client';

import { useEffect, useRef } from 'react';
import { TILE_NAMES, getItem } from '@solrift/shared';
import { spritePainter } from '../game/sprites';

/**
 * The picture of an item (its 16x16 sprite), drawn straight from the sprite painter, so it needs neither the
 * game's texture atlas nor a running game: the class-selection screen and the class sheet use it.
 */
export function ItemSprite({ id, size = 32, title }: { id: number; size?: number; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const paint = spritePainter(TILE_NAMES[getItem(id).tile] ?? '');
    ctx.clearRect(0, 0, 16, 16);
    if (!paint) return;
    const img = ctx.createImageData(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const [r, g, b, a] = paint(x, y);
        const o = (y * 16 + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [id]);
  return <canvas ref={ref} width={16} height={16} className="item-sprite" title={title} aria-hidden style={{ width: size, height: size, imageRendering: 'pixelated' }} />;
}
