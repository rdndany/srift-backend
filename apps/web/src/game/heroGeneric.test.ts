import { describe, expect, it } from 'vitest';
import { ATLAS_COLS, ATLAS_ROWS, TILE_NAMES } from '@solrift/shared';
import { GENERIC_PX, HERO_GENERIC, isFieldTile, upscaleTile } from './heroGeneric';
import { HERO_COLS, HERO_COUNT, HERO_ROWS, HERO_STRIP, heroSlot } from './heroTiles';

/** A 16 x 16 tile of noise that does NOT wrap: its right edge is bright and its left edge is dark. */
function ramp16(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = 40 + x * 12 + ((x * 31 + y * 17) % 9);
      px.set([v, v, v, 255], (y * 16 + x) * 4);
    }
  }
  return px;
}

describe('the generic hero tiles', () => {
  it('are real tiles, each once, none of them hand-painted already', () => {
    expect(new Set(HERO_GENERIC).size).toBe(HERO_GENERIC.length);
    const painted = new Set(HERO_STRIP.map((e) => e.tile));
    for (const name of HERO_GENERIC) {
      expect(TILE_NAMES).toContain(name);
      expect(painted.has(name)).toBe(false);
    }
  });

  it('all fit the grid of pictures, and the map of tile numbers fits a texture row', () => {
    expect(HERO_COUNT).toBe(HERO_STRIP.length + HERO_GENERIC.length);
    expect(HERO_COLS * HERO_ROWS).toBeGreaterThanOrEqual(HERO_COUNT);
    expect(HERO_COLS * GENERIC_PX).toBeLessThanOrEqual(4096);
    expect(HERO_ROWS * GENERIC_PX).toBeLessThanOrEqual(4096);
    expect(ATLAS_COLS * ATLAS_ROWS).toBeLessThanOrEqual(4096);
    expect(heroSlot('stone').first).toBeGreaterThanOrEqual(HERO_STRIP.length);
    expect(heroSlot('stone').count).toBe(1);
  });

  it('upscale to 64 x 64 and keep the colours roughly', () => {
    const out = upscaleTile(ramp16(), 3, false);
    expect(out.length).toBe(64 * 64 * 4);
    expect(out[3]).toBe(255);
    // dark on the left, bright on the right, as in the source
    expect(out[(32 * 64 + 60) * 4]).toBeGreaterThan(out[(32 * 64 + 3) * 4]);
  });

  it('a field of noise is made to wrap: its edges are as alike as any two neighbours', () => {
    expect(isFieldTile('stone')).toBe(true);
    expect(isFieldTile('stone_bricks')).toBe(false);
    const out = upscaleTile(ramp16(), 5, true);
    const lum = (x: number, y: number): number => out[(y * 64 + x) * 4];
    let edge = 0;
    let inner = 0;
    for (let y = 0; y < 64; y++) {
      edge += Math.abs(lum(63, y) - lum(0, y));
      inner += Math.abs(lum(31, y) - lum(32, y));
    }
    expect(edge / 64).toBeLessThan(inner / 64 + 25);
    // while a plain upscale of the same tile keeps its jump at the edge
    const plain = upscaleTile(ramp16(), 5, false);
    let jump = 0;
    for (let y = 0; y < 64; y++) jump += Math.abs(plain[(y * 64 + 63) * 4] - plain[(y * 64) * 4]);
    expect(jump / 64).toBeGreaterThan(40);
  });

  it('keep the biome-tint mark of a pixel', () => {
    const px = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 256; i++) px.set([60, 140, 40, i % 2 ? 250 : 255], i * 4);
    const out = upscaleTile(px, 1, false);
    const alphas = new Set<number>();
    for (let i = 3; i < out.length; i += 4) alphas.add(out[i]);
    expect([...alphas].sort()).toEqual([250, 255]);
  });
});
