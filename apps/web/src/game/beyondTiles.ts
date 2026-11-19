import { BEYOND_CUBES, BEYOND_PLANTS, beyondTiles, type BeyondRGB, type BeyondTile } from '@solrift/shared';

/**
 * Painters for the tiles of The World Beyond. Every tile is drawn from a kind (stone, bricks, crystal, leaves...) and one or
 * two colours out of `beyondBlocks.ts`, so a new mineral or wood is one line of data and the art stays original and
 * procedural like the rest of the atlas.
 */

type RGB = [number, number, number];
type RGBA = [number, number, number, number];
export type BeyondPainter = (x: number, y: number, r: () => number) => RGB | RGBA;

const DIRT: RGB = [134, 96, 67];
const CLEAR: RGBA = [0, 0, 0, 0];

/** A stable pseudo-random number for a pixel (the tile's own generator is order-dependent; patterns want the same answer anywhere). */
function pix(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 31 * salt, 374761393) ^ Math.imul(y + 17 * salt, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const rgb = (c: BeyondRGB): RGB => [c[0], c[1], c[2]];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const jit = (c: RGB, amt: number, r: () => number): RGB => {
  const d = (r() - 0.5) * 2 * amt;
  return [c[0] + d, c[1] + d, c[2] + d];
};

function painterFor(tile: BeyondTile, name: string): BeyondPainter {
  const base = rgb(tile.rgb);
  const acc = rgb(tile.accent ?? tile.rgb);
  const salt = name.length * 7 + name.charCodeAt(0);
  switch (tile.kind) {
    case 'stone':
      return (x, y, r) => (pix(x, y, salt) < 0.1 ? jit(scale(base, 0.82), 6, r) : pix(x, y, salt + 1) < 0.06 ? jit(scale(base, 1.12), 6, r) : jit(base, 9, r));
    case 'strata':
      return (x, y, r) => {
        const band = (y + Math.floor(x / 5)) % 4;
        return jit(band === 0 ? acc : band === 2 ? scale(base, 1.1) : base, 5, r);
      };
    case 'veined':
      return (x, y, r) => {
        const d = Math.abs((((x - 2 * y + Math.round(3 * Math.sin(y / 2.6 + salt))) % 11) + 11) % 11 - 5);
        const d2 = Math.abs((((x + y * 3 + 4) % 13) + 13) % 13 - 6);
        if (d === 0) return jit(mix(base, acc, 0.85), 4, r);
        if (d2 === 0 && pix(x, y, salt) < 0.7) return jit(mix(base, acc, 0.4), 4, r);
        return jit(base, 4, r);
      };
    case 'bricks':
      return (x, y, r) => {
        const row = y >> 2;
        const bx = (x + (row % 2) * 4) % 8;
        if (y % 4 === 3 || bx === 7) return jit(acc, 5, r);
        const wear = pix(x, y, salt) < 0.08 ? 0.86 : 1;
        return jit(scale(base, wear), 7, r);
      };
    case 'carved':
      return (x, y, r) => {
        const edge = Math.min(x, y, 15 - x, 15 - y);
        if (edge < 1) return jit(acc, 4, r);
        const inner = Math.abs(x - 7.5) + Math.abs(y - 7.5);
        if (edge >= 3 && inner > 4.2 && inner < 6) return jit(acc, 4, r);
        if (edge >= 3 && inner < 1.8) return jit(acc, 4, r);
        return jit(base, 4, r);
      };
    case 'mossy':
      return (x, y, r) => {
        const patch = pix(x >> 1, y >> 1, salt) + pix(x, y, salt + 3) * 0.25;
        return patch > 0.72 ? jit(acc, 10, r) : patch > 0.6 ? jit(mix(base, acc, 0.5), 8, r) : jit(base, 9, r);
      };
    case 'salt':
      return (x, y, r) => {
        const v = pix(x, y, salt);
        if (v < 0.07) return jit(acc, 4, r);
        if (v > 0.95) return [255, 255, 255];
        return jit(base, 4, r);
      };
    case 'frost':
      return (x, y, r) => {
        const rime = pix(x, y, salt) < 0.28 || (y < 2 && pix(x, y, salt + 1) < 0.7);
        return rime ? jit(acc, 6, r) : jit(base, 8, r);
      };
    case 'ember':
      return (x, y, r) => {
        const crack = Math.abs(((x * 3 + y * 5 + Math.round(2 * Math.sin(x / 2 + salt))) % 13) - 6) === 0 && pix(x, y, salt) < 0.55;
        if (crack) return jit(acc, 14, r);
        return jit(pix(x, y, salt + 2) < 0.12 ? scale(base, 0.7) : base, 7, r);
      };
    case 'soft':
      return (x, y, r) => jit(pix(x, y, salt) < 0.15 ? scale(base, 1.2) : base, 6, r);
    case 'sand':
      return (x, y, r) => jit(pix(x, y, salt) < 0.14 ? scale(base, 0.88) : base, 5, r);
    case 'peat':
      return (x, y, r) => jit(pix(x >> 2, y, salt) < 0.4 ? acc : base, 6, r);
    case 'ore': {
      const spots: [number, number][] = [];
      for (let i = 0; i < 7; i++) spots.push([2 + Math.floor(pix(i, 3, salt) * 12), 2 + Math.floor(pix(i, 9, salt) * 12)]);
      return (x, y, r) => {
        for (const [sx, sy] of spots) {
          const d = Math.abs(x - sx) + Math.abs(y - sy);
          if (d === 0) return jit(acc, 10, r);
          if (d === 1 && !(Math.abs(x - sx) === 1 && Math.abs(y - sy) === 1)) return jit(base, 14, r);
        }
        return jit([122, 122, 126], 12, r);
      };
    }
    case 'mineral':
      return (x, y, r) => {
        const blot = pix(x >> 1, y >> 1, salt);
        if (blot < 0.18) return jit(scale(base, 0.72), 6, r);
        if (pix(x, y, salt + 1) < 0.08) return jit(acc, 6, r);
        return jit(base, 9, r);
      };
    case 'crystal':
      return (x, y, r): RGBA => {
        const facet = (x + y) % 8 === 0 || (x - y + 16) % 8 === 0;
        const rim = x === 0 || y === 0 || x === 15 || y === 15;
        const c = facet || rim ? mix(base, acc, 0.65) : mix(base, acc, pix(x, y, salt) * 0.25);
        return [c[0] + (r() - 0.5) * 8, c[1] + (r() - 0.5) * 8, c[2] + (r() - 0.5) * 8, rim ? 230 : facet ? 215 : 170];
      };
    case 'coral':
      return (x, y, r) => {
        const cx = (x % 5) - 2;
        const cy = (y % 5) - 2;
        const pore = cx * cx + cy * cy <= 1 && pix(x >> 2, y >> 2, salt) < 0.7;
        if (pore) return jit(scale(base, 0.62), 4, r);
        return jit(pix(x, y, salt) < 0.2 ? acc : base, 7, r);
      };
    case 'bark':
      return (x, y, r) => jit(x % 4 === 0 ? acc : x % 4 === 2 && pix(x, y >> 2, salt) < 0.5 ? scale(base, 0.82) : base, 5, r);
    case 'rings':
      return (x, y, r) => {
        const ring = Math.hypot(x - 7.5, y - 7.5);
        const edge = Math.min(x, y, 15 - x, 15 - y) < 1;
        return jit(edge ? scale(base, 0.7) : Math.floor(ring) % 3 === 0 ? scale(base, 0.84) : base, 4, r);
      };
    case 'planks': {
      return (x, y, r) => {
        const row = y >> 2;
        const joint = (x + row * 5) % 12 === 0 && y % 4 !== 3;
        if (y % 4 === 3 || joint) return jit(acc, 4, r);
        return jit(scale(base, 0.96 + pix(0, row, salt) * 0.1), 5, r);
      };
    }
    case 'leaves':
      return (x, y, r) => {
        const v = pix(x, y, salt);
        if (v < 0.07) return CLEAR;
        const dark = (x * 3 + y * 5) % 7 === 0 || pix(x, y, salt + 4) < 0.18;
        const light = pix(x, y, salt + 5) > 0.93;
        return jit(dark ? acc : light ? mix(base, [255, 255, 255], 0.18) : base, 9, r);
      };
    case 'fronds':
      return (x, y, r) => {
        const rib = Math.abs(x - 7.5) < 0.9;
        const blade = Math.abs(((x + y) % 4) - 2) <= 1 || Math.abs(((x - y + 16) % 4) - 2) <= 1;
        if (rib) return jit(acc, 6, r);
        if (!blade || pix(x, y, salt) < 0.14) return CLEAR;
        return jit(pix(x, y, salt + 1) < 0.3 ? acc : base, 9, r);
      };
    case 'turf_top':
      return (x, y, r) => jit(pix(x, y, salt) < 0.18 ? scale(base, 0.82) : pix(x, y, salt + 2) < 0.1 ? scale(base, 1.15) : base, 8, r);
    case 'grass_side':
      return (x, y, r) => {
        const fringe = 3 + Math.floor(pix(x, 0, salt) * 3);
        if (y < fringe) return jit(pix(x, y, salt) < 0.2 ? scale(base, 0.82) : base, 8, r);
        return jit(DIRT, 14, r);
      };
    case 'cluster':
      return (x, y, r) => {
        const shard = (cx: number, top: number, w: number): boolean => y >= top && Math.abs(x - cx) <= Math.max(0, w - Math.floor((y - top) / 4) * 0 - (y < top + 3 ? 1 : 0));
        const hit = shard(8, 3, 1) || shard(5, 7, 1) || shard(11, 8, 1) || (y >= 12 && Math.abs(x - 8) <= 4);
        if (!hit) return CLEAR;
        const light = x === 8 || x === 5 || x === 11;
        return jit(light ? acc : base, 10, r);
      };
    case 'plant':
      return (x, y, r) => {
        const blade = (cx: number, lean: number, top: number): boolean => y >= top && Math.abs(x - (cx + Math.round(lean * (15 - y) / 6))) === 0;
        const hit = blade(4, -1, 5) || blade(7, 0, 2) || blade(9, 0, 4) || blade(12, 1, 6) || blade(6, 1, 8);
        if (!hit) return CLEAR;
        if ((y === 2 || y === 3) && x >= 6 && x <= 8 && tile.accent) return jit(acc, 8, r);
        if (y === 5 && tile.accent && (x === 3 || x === 4)) return jit(acc, 8, r);
        return jit(y < 6 ? scale(base, 1.15) : base, 8, r);
      };
    case 'glow_plant':
      return (x, y, r) => {
        const stem = Math.abs(x - 7.5) < 1 && y > 6;
        const frond = y > 2 && y < 12 && Math.abs(x - 7.5) <= (y - 2) * 0.55 && Math.abs(x - 7.5) > 0.9 && (x + y) % 2 === 0;
        const bud = Math.hypot(x - 7.5, y - 3.5) < 2.4;
        if (bud) return jit(acc, 8, r);
        if (stem || frond) return jit(pix(x, y, salt) < 0.3 ? acc : base, 10, r);
        return CLEAR;
      };
    case 'tall_grass':
      return (x, y, r) => {
        const col = x % 3 === 1 || x === 7;
        const top = 1 + Math.floor(pix(x, 1, salt) * 7);
        if (!col || y < top) return CLEAR;
        return jit(y < top + 3 ? scale(base, 1.18) : pix(x, y, salt) < 0.25 ? scale(base, 0.8) : base, 8, r);
      };
    case 'kelp':
      return (x, y, r) => {
        const sway = Math.round(2 * Math.sin(y / 2.3));
        const stalk = x === 7 + sway || x === 8 + sway;
        const blade = (y % 6 === 2 || y % 6 === 3) && Math.abs(x - (7.5 + sway)) <= 3 && Math.abs(x - (7.5 + sway)) >= 1.5 && (y % 12 < 6 ? x > 7 + sway : x < 8 + sway);
        if (!stalk && !blade) return CLEAR;
        return jit(blade ? acc : base, 8, r);
      };
    case 'weed':
      return (x, y, r) => {
        const col = x % 3 === 0 || x === 7 || x === 8;
        const top = 3 + Math.floor(pix(x, 2, salt) * 7);
        if (!col || y < top) return CLEAR;
        const sway = Math.round(Math.sin((y + x) / 2.2));
        if (sway > 0 && pix(x, y, salt) < 0.2) return CLEAR;
        return jit(y < top + 2 ? scale(base, 1.2) : base, 8, r);
      };
    case 'vines':
      return (x, y, r) => {
        const strand = x % 5 === 1 || x % 5 === 3;
        const len = 5 + Math.floor(pix(x, 3, salt) * 11);
        if (!strand || y > len) return CLEAR;
        return jit(pix(x, y, salt) < 0.25 ? scale(base, 1.25) : base, 8, r);
      };
    case 'cap':
      return (x, y, r) => {
        const spot = Math.hypot((x % 6) - 2.5, (y % 6) - 2.5) < 1.4 && pix(x >> 2, y >> 2, salt) < 0.7;
        return jit(spot ? acc : pix(x, y, salt) < 0.15 ? scale(base, 0.82) : base, 7, r);
      };
    case 'stem':
      return (x, y, r) => jit(x % 4 === 0 ? acc : x % 4 === 3 ? scale(base, 1.06) : base, 4, r);
    case 'bone':
      return (x, y, r) => {
        const rib = Math.abs(((x + 4 * Math.round(Math.sin(y / 3 + salt))) % 6) - 3) === 0 && y % 8 < 6;
        const knob = Math.hypot((x % 8) - 3.5, (y % 8) - 3.5) < 1.7;
        if (rib || (knob && pix(x >> 3, y >> 3, salt) < 0.5)) return jit(acc, 5, r);
        return jit(base, 7, r);
      };
    case 'glassy':
      return (x, y, r) => {
        const streak = (x + y * 2) % 9 === 0 || pix(x, y, salt) > 0.93;
        return jit(streak ? acc : base, 7, r);
      };
    case 'spark':
      return (x, y, r) => {
        const bolt = Math.abs(((x * 2 + y * 3 + Math.round(3 * Math.sin(y / 1.8 + salt))) % 15) - 7) === 0 && pix(x, y, salt) < 0.5;
        if (bolt) return jit(acc, 14, r);
        return jit(pix(x, y, salt + 2) < 0.1 ? scale(base, 0.76) : base, 8, r);
      };
    case 'ice':
      return (x, y, r) => {
        const crack = Math.abs(((x - y + 16) % 11) - 5) === 0 && pix(x, y, salt) < 0.6;
        return jit(crack ? acc : mix(base, acc, pix(x >> 1, y >> 1, salt) * 0.25), 6, r);
      };
    case 'moss':
      return (x, y, r) => {
        const glow = pix(x, y, salt) > 0.9;
        return jit(glow ? acc : pix(x >> 1, y >> 1, salt + 1) < 0.3 ? scale(base, 0.8) : base, 9, r);
      };
    default:
      return (_x, _y, r) => jit(base, 8, r);
  }
}

/** Tile painters for every block of The World Beyond, by tile name. */
export function beyondPainters(): Record<string, BeyondPainter> {
  const out: Record<string, BeyondPainter> = {};
  for (const [name, tile] of Object.entries(beyondTiles())) out[name] = painterFor(tile, name);
  return out;
}

/** Tiles of The World Beyond that are drawn as full-bright: crystals, glowing growth and charged stone. */
export function beyondEmissiveTiles(): string[] {
  const names: string[] = [];
  const glowing = new Set(['glowshroom_cap', 'luminous_moss', 'stormstone', 'crystal_ore', 'spore_cap']);
  for (const cube of BEYOND_CUBES) if (cube.translucent || glowing.has(cube.key)) names.push(cube.key);
  for (const plant of BEYOND_PLANTS) if ((plant.light ?? 0) >= 6) names.push(plant.key);
  return names;
}

/** Tiles that take the one-pixel edge highlight of a plain cube (everything with a flat, full face). */
export function beyondBeveledTiles(): string[] {
  const names: string[] = [];
  for (const [name, tile] of Object.entries(beyondTiles())) {
    if (['leaves', 'fronds', 'cluster', 'plant', 'glow_plant', 'tall_grass', 'kelp', 'weed', 'vines', 'crystal'].includes(tile.kind)) continue;
    names.push(name);
  }
  return names;
}

/** Tiles that keep their own colours exactly (no saturation grade): glass, ice and glowing things. */
export function beyondUngradedTiles(): string[] {
  const names: string[] = [];
  for (const [name, tile] of Object.entries(beyondTiles())) if (['crystal', 'ice', 'glassy', 'glow_plant', 'cluster'].includes(tile.kind)) names.push(name);
  return names;
}
