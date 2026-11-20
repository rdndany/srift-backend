import { describe, expect, it } from 'vitest';
import { TILE_NAMES } from '@solrift/shared';
import { BRICK_PICS } from './heroBrick';
import { ORE_PICS } from './heroOre';
import { WOOD_PICS } from './heroWood';
import { HERO_PX, HERO_STRIP, heroDownsample, heroPixels, heroSlot } from './heroTiles';

/** The pixels within `band` of the tile's edge, as one list. */
function rim(key: string, band: number): number[] {
  const px = heroPixels(key);
  const out: number[] = [];
  for (let y = 0; y < HERO_PX; y++) {
    for (let x = 0; x < HERO_PX; x++) {
      if (x < band || y < band || x >= HERO_PX - band || y >= HERO_PX - band) out.push(...px.subarray((y * HERO_PX + x) * 4, (y * HERO_PX + x) * 4 + 4));
    }
  }
  return out;
}

describe('the hero tiles', () => {
  it('are all tiles the game knows (an unknown name stops the game from starting)', () => {
    const known = new Set<string>(TILE_NAMES);
    const unknown = [...new Set(HERO_STRIP.map((e) => e.tile))].filter((t) => !known.has(t));
    expect(unknown).toEqual([]);
  });

  it('have a picture for every key, all of them the size of a tile', () => {
    for (const e of HERO_STRIP) expect(heroPixels(e.key).length).toBe(HERO_PX * HERO_PX * 4);
  });

  it('the pictures of one tile differ inside but meet the next block the same way along every edge', () => {
    for (const tile of ['cobble', 'mossy_cobble', 'cobbled_deepslate']) {
      const { first, count } = heroSlot(tile);
      expect(count).toBeGreaterThan(1);
      const keys = HERO_STRIP.slice(first, first + count).map((e) => e.key);
      const base = rim(keys[0], 2);
      for (const k of keys.slice(1)) {
        expect(rim(k, 2)).toEqual(base);
        expect(Buffer.from(heroPixels(k)).equals(Buffer.from(heroPixels(keys[0])))).toBe(false);
      }
    }
  });

  it('the plank pictures meet along their sides in the same boards, and differ inside', () => {
    const { first, count } = heroSlot('planks');
    expect(count).toBeGreaterThan(1);
    const keys = HERO_STRIP.slice(first, first + count).map((e) => e.key);
    // (boards run left to right: the left and right edges must agree; above and below are only the gaps between boards)
    const sides = (key: string): number[] => {
      const px = heroPixels(key);
      const out: number[] = [];
      for (let y = 0; y < HERO_PX; y++) for (const x of [0, 1, HERO_PX - 2, HERO_PX - 1]) out.push(...px.subarray((y * HERO_PX + x) * 4, (y * HERO_PX + x) * 4 + 4));
      return out;
    };
    for (const k of keys.slice(1)) {
      expect(sides(k)).toEqual(sides(keys[0]));
      expect(Buffer.from(heroPixels(k)).equals(Buffer.from(heroPixels(keys[0])))).toBe(false);
    }
  });

  it('foliage is dense with a few gaps for the sky, and keeps its biome-tint mark', () => {
    for (const tile of ['leaves', 'birch_leaves', 'spruce_leaves', 'acacia_leaves', 'jungle_leaves', 'dark_oak_leaves', 'cherry_leaves']) {
      const px = heroPixels(tile);
      let gaps = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] === 0) gaps++;
      const share = gaps / (HERO_PX * HERO_PX);
      expect(share).toBeGreaterThan(0.005);
      expect(share).toBeLessThan(0.2);
      expect(heroDownsample(tile, 3, 3)[3]).toBeGreaterThanOrEqual(0);
    }
    expect(heroPixels('leaves').some((v, i) => i % 4 === 3 && v === 250)).toBe(true);
    expect(heroPixels('birch_leaves').some((v, i) => i % 4 === 3 && v === 250)).toBe(false);
  });

  it('wrap: the grass lawns share their edges too', () => {
    const { first, count } = heroSlot('grass_top');
    const keys = HERO_STRIP.slice(first, first + count).map((e) => e.key);
    // (flowers and berries sit away from the edge)
    const base = rim(keys[0], 2);
    for (const k of keys.slice(1)) expect(rim(k, 2)).toEqual(base);
  });

  it('wood: every picture of a tile meets the next block like the others, and runs on from block to block', () => {
    const groups = new Map<string, string[]>();
    for (const e of HERO_STRIP) if (WOOD_PICS.some((w) => w.key === e.key)) groups.set(e.tile, [...(groups.get(e.tile) ?? []), e.key]);
    expect(groups.size).toBeGreaterThan(40);
    for (const [tile, keys] of groups) {
      if (keys.length < 2) continue;
      for (const k of keys.slice(1)) {
        if (tile.endsWith('_planks') && tile !== 'bamboo_planks') {
          // (boards run left to right: only the left and right edges must agree)
          const sides = (key: string): number[] => {
            const px = heroPixels(key);
            const out: number[] = [];
            for (let y = 0; y < HERO_PX; y++) for (const x of [0, 1, HERO_PX - 2, HERO_PX - 1]) out.push(...px.subarray((y * HERO_PX + x) * 4, (y * HERO_PX + x) * 4 + 4));
            return out;
          };
          expect(sides(k), tile).toEqual(sides(keys[0]));
        } else if (!tile.endsWith('_top') && !tile.endsWith('_mosaic')) {
          expect(rim(k, 2), tile).toEqual(rim(keys[0], 2));
        } else if (tile.endsWith('_top')) {
          expect(rim(k, 2), tile).toEqual(rim(keys[0], 2));
        }
        expect(Buffer.from(heroPixels(k)).equals(Buffer.from(heroPixels(keys[0]))), `${k} differs`).toBe(false);
      }
    }
  });

  it('wood: a log side has no seam where it runs on to the block above or beside it', () => {
    const step = (px: ArrayLike<number>, a: number, b: number): number => Math.abs(px[a] - px[b]) + Math.abs(px[a + 1] - px[b + 1]) + Math.abs(px[a + 2] - px[b + 2]);
    const tiles = [...new Set(HERO_STRIP.filter((e) => WOOD_PICS.some((w) => w.key === e.key)).map((e) => e.tile))].filter((t) => /(_log_side|_bark|_stem_side|_stripped|stripped_)/.test(t) || t === 'log_side');
    expect(tiles.length).toBeGreaterThan(20);
    for (const tile of tiles) {
      const px = heroPixels(HERO_STRIP.find((e) => e.tile === tile)!.key);
      const rows: number[] = [];
      const cols: number[] = [];
      for (let j = 0; j < HERO_PX; j++) {
        const j2 = (j + 1) % HERO_PX;
        let r = 0;
        let c = 0;
        for (let i = 0; i < HERO_PX; i++) {
          r += step(px, (j * HERO_PX + i) * 4, (j2 * HERO_PX + i) * 4);
          c += step(px, (i * HERO_PX + j) * 4, (i * HERO_PX + j2) * 4);
        }
        rows.push(r / HERO_PX);
        cols.push(c / HERO_PX);
      }
      // (the step over the seam, down and across, is no bigger than the biggest step anywhere else in the picture)
      expect(rows[HERO_PX - 1], `${tile} down`).toBeLessThanOrEqual(Math.max(...rows.slice(0, HERO_PX - 1)) * 1.1);
      expect(cols[HERO_PX - 1], `${tile} across`).toBeLessThanOrEqual(Math.max(...cols.slice(0, HERO_PX - 1)) * 1.1);
    }
  });

  it('bricks: every picture of a wall meets the next block in the same joints and bricks, and differs inside', () => {
    const groups = new Map<string, string[]>();
    for (const e of HERO_STRIP) if (BRICK_PICS.some((w) => w.key === e.key)) groups.set(e.tile, [...(groups.get(e.tile) ?? []), e.key]);
    expect(groups.size).toBeGreaterThanOrEqual(19);
    for (const [tile, keys] of groups) {
      expect(keys.length, tile).toBe(4);
      for (const k of keys.slice(1)) {
        expect(rim(k, 2), tile).toEqual(rim(keys[0], 2));
        expect(Buffer.from(heroPixels(k)).equals(Buffer.from(heroPixels(keys[0]))), `${k} differs`).toBe(false);
      }
    }
  });

  it('ores: only the ore is drawn (the stone is the world�s), clear of the edge, four pictures that place it differently', () => {
    const groups = new Map<string, string[]>();
    for (const e of HERO_STRIP) if (ORE_PICS.some((w) => w.key === e.key)) groups.set(e.tile, [...(groups.get(e.tile) ?? []), e.key]);
    expect(groups.size).toBe(10);
    for (const [tile, keys] of groups) {
      expect(keys.length, tile).toBe(4);
      for (const k of keys) {
        const px = heroPixels(k);
        let ore = 0;
        for (let y = 0; y < HERO_PX; y++) {
          for (let x = 0; x < HERO_PX; x++) {
            const a = px[(y * HERO_PX + x) * 4 + 3];
            if (a === 255) {
              ore++;
              // (no nugget within four pixels of the edge, so an ore block meets its neighbours as plain stone does)
              expect(Math.min(x, y, HERO_PX - 1 - x, HERO_PX - 1 - y), `${k} ore at ${x},${y}`).toBeGreaterThanOrEqual(4);
            } else expect(a, `${k} stone alpha`).toBeGreaterThan(100);
          }
        }
        const share = ore / (HERO_PX * HERO_PX);
        expect(share, k).toBeGreaterThan(0.04);
        expect(share, k).toBeLessThan(0.4);
      }
      expect(Buffer.from(heroPixels(keys[1])).equals(Buffer.from(heroPixels(keys[0]))), tile).toBe(false);
    }
  });});
