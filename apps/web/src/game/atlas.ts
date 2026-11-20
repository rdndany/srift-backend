import * as THREE from 'three';
import { EMISSIVE_ORES } from './heroOre';
import { HERO_COLS, HERO_PX, HERO_ROWS, HERO_STRIP, HERO_TILES, ORE_TILES, heroDownsample, heroPixels } from './heroTiles';
import { PLANT_TILES } from './heroPlants';
import { ATLAS_COLS, ATLAS_ROWS, BED_RED, DRESS_TILE_RGB, DYE_NAMES, DYE_RGB, GROVE_TILE_RGB, JOINERY_TILE_RGB, MASONRY_TILE_RGB, TILE_NAMES, TILE_PX, bedTileName, type BedPart } from '@solrift/shared';
import { spritePainter } from './sprites';
import { beyondBeveledTiles, beyondEmissiveTiles, beyondPainters, beyondUngradedTiles } from './beyondTiles';

/**
 * Procedural texture atlas. Every tile is generated from code, so the game
 * ships with 100% original art and no external asset dependencies.
 */

type RGB = [number, number, number];
type Painter = (x: number, y: number, r: () => number) => RGB | [number, number, number, number];

function rngFor(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jitter = (base: RGB, amt: number, r: () => number): RGB => {
  const d = (r() - 0.5) * 2 * amt;
  return [base[0] + d, base[1] + d, base[2] + d];
};

/**
 * A sheet of glass: clear through the middle, a quiet rim, and two short glints.
 * Stained glass keeps the same drawing and lays its colour over it, a little less clear.
 */
function glassSheet(x: number, y: number, r: () => number, tone: RGB, stained = false): [number, number, number, number] {
  const glint = (x === 3 && y >= 2 && y <= 5) || (x === 4 && y >= 3 && y <= 4) || (x === 12 && y >= 10 && y <= 13);
  const rim = x === 0 || y === 0 || x === 15 || y === 15;
  const edge = x === 1 || y === 1 || x === 14 || y === 14;
  const j = (r() - 0.5) * 10;
  const lift = glint ? 48 : rim ? 16 : edge ? 8 : 0;
  const alpha = stained ? (glint ? 210 : rim ? 168 : edge ? 120 : 96) : glint ? 176 : rim ? 132 : edge ? 84 : 56;
  return [Math.min(255, tone[0] + lift + j), Math.min(255, tone[1] + lift + j), Math.min(255, tone[2] + lift + j * 0.4), alpha];
}

const DIRT: RGB = [134, 96, 67];
const STONE: RGB = [125, 125, 125];

const stoneBase: Painter = (_x, _y, r) => jitter(STONE, 14, r);

function ore(color: RGB): Painter {
  // Stable cluster mask, painted over stone.
  const mask = rngFor(color[0] * 31 + color[1] * 7 + color[2]);
  const spots: [number, number][] = [];
  for (let i = 0; i < 6; i++) spots.push([2 + Math.floor(mask() * 12), 2 + Math.floor(mask() * 12)]);
  return (x, y, r) => {
    for (const [sx, sy] of spots) {
      if (Math.abs(x - sx) + Math.abs(y - sy) <= 1 && !(Math.abs(x - sx) === 1 && Math.abs(y - sy) === 1)) {
        return jitter(color, 18, r);
      }
    }
    return jitter(STONE, 14, r);
  };
}

const PAINTERS: Record<string, Painter> = {
  stone: stoneBase,
  dirt: (_x, _y, r) => jitter(DIRT, 16, r),
  // Alpha 250 marks a pixel as biome-tintable (see chunkMaterial.ts); 255 stays as painted.
  grass_top: (_x, _y, r) => [...jitter([92, 158, 52], 16, r), 250],
  grass_side: (x, y, r) => {
    const edge = 3 + ((x * 7 + 3) % 3);
    return y < edge ? [...jitter([92, 158, 52], 16, r), 250] : jitter(DIRT, 16, r);
  },
  sand: (_x, _y, r) => jitter([219, 207, 163], 9, r),
  water: (_x, _y, r) => {
    const j = (r() - 0.5) * 16;
    return [40 + j, 90 + j, 205 + j, 175];
  },
  log_side: (x, _y, r) => {
    const streak = (x % 4 === 0 ? -14 : x % 4 === 2 ? 8 : 0) + (r() - 0.5) * 10;
    return [104 + streak, 80 + streak, 48 + streak];
  },
  log_top: (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const ring = Math.floor(d) % 2 === 0 ? 0 : -18;
    if (d > 6.5) return [92 + (r() - 0.5) * 8, 70, 42];
    return [176 + ring + (r() - 0.5) * 8, 142 + ring, 90 + ring];
  },
  leaves: (x, y, r) => {
    const v = r();
    if (v < 0.16) return [0, 0, 0, 0];
    const shade = (v - 0.5) * 40 + ((x + y) % 3) * 6;
    return [46 + shade * 0.5, 120 + shade, 36 + shade * 0.4, 250];
  },
  bedrock: (_x, _y, r) => jitter([62, 62, 62], 34, r),
  snow: (_x, _y, r) => jitter([244, 248, 250], 6, r),
  snow_side: (x, y, r) => {
    const edge = 4 + ((x * 5 + 1) % 3);
    return y < edge ? jitter([244, 248, 250], 6, r) : jitter(DIRT, 16, r);
  },
  planks: (x, y, r) => {
    const seam = y % 4 === 3 ? -22 : 0;
    const knot = (x + Math.floor(y / 4) * 5) % 9 === 0 ? -8 : 0;
    return [178 + seam + knot + (r() - 0.5) * 8, 144 + seam + knot, 88 + seam + knot];
  },
  cobble: (x, y, r) => {
    const cell = ((Math.floor(x / 5) + Math.floor(y / 4) * 2) * 37) % 29;
    const mortar = x % 5 === 0 || y % 4 === 0 ? -26 : 0;
    return jitter([112 + cell, 112 + cell, 112 + cell], 8, r).map((c) => c + mortar) as RGB;
  },
  coal_ore: ore([35, 35, 38]),
  iron_ore: ore([216, 175, 147]),
  gold_ore: ore([252, 238, 75]),
  diamond_ore: ore([92, 219, 213]),
  gravel: (x, y, r) => {
    const pebble = ((x * 13 + y * 7) % 5) * 10;
    return jitter([120 + pebble * 0.6, 116 + pebble * 0.6, 114 + pebble * 0.6], 18, r);
  },
  glowstone: (x, y, r) => {
    const cell = ((x >> 2) * 31 + (y >> 2) * 17) % 5;
    const v = 18 * cell + (r() - 0.5) * 22;
    return [226 + v * 0.35, 176 + v * 0.8, 84 + v * 0.5];
  },
  glass: (x, y, r) => glassSheet(x, y, r, [198, 222, 232]),
};

// ---- the underground ----
PAINTERS.lava = (x, y, r) => {
  // Slow blobs of bright and dark crust, so the surface reads as molten rather than noisy.
  const v = Math.sin(x * 0.9 + Math.sin(y * 0.6) * 2) + Math.sin(y * 0.8 + Math.cos(x * 0.5) * 2);
  const j = (r() - 0.5) * 22;
  if (v > 1.0) return [255 + j, 214 + j, 74 + j * 0.5];
  if (v > 0.2) return [244 + j, 128 + j, 24];
  if (v < -1.1) return [150 + j, 44, 8];
  return [224 + j, 82 + j * 0.6, 12];
};
PAINTERS.mossy_cobble = (x, y, r) => {
  const c = PAINTERS.cobble(x, y, r) as RGB;
  // Lush moss in soft clumps, brighter on the tips and darker where it pools.
  const m = vnoise(x, y, 4, 311) * 0.6 + vnoise(x, y, 2, 312) * 0.4;
  if (m > 0.6) return jitter(m > 0.74 ? [96, 164, 58] : m > 0.66 ? [78, 138, 48] : [62, 112, 40], 8, r);
  if (m > 0.55 && (x + y) % 2 === 0) return jitter([84, 146, 54], 8, r);
  return c;
};
PAINTERS.spawner = (x, y, r) => {
  const bar = x % 5 === 2 || y % 5 === 2 || edge(x, y);
  if (bar) return jitter([58, 66, 88], 10, r);
  const glow = Math.hypot(x - 7.5, y - 7.5) < 3.2;
  if (glow) return jitter([232, 120, 30], 30, r);
  return jitter([16, 20, 30], 8, r);
};
PAINTERS.cactus_top = (x, y, r) => {
  const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
  if (d > 6.5) return jitter([34, 92, 36], 6, r);
  if (d > 4.5) return jitter([58, 130, 52], 8, r);
  return jitter([84, 156, 66], 8, r);
};
PAINTERS.cactus_side = (x, y, r) => {
  if (x === 0 || x === 15) return jitter([34, 92, 36], 6, r);
  const ridge = x % 4 === 1 ? -16 : x % 4 === 3 ? 10 : 0;
  if (x % 4 === 2 && y % 4 === 1) return [226, 226, 190]; // a spine
  return jitter([62 + ridge, 134 + ridge, 56 + ridge], 8, r);
};
PAINTERS.sandstone_top = (_x, _y, r) => jitter([222, 208, 160], 8, r);
PAINTERS.sandstone_side = (x, y, r) => {
  if (y === 0 || y === 15) return jitter([204, 188, 140], 6, r);
  if (y === 4 || y === 5) return jitter([196, 176, 128], 6, r);
  if (y >= 9 && y <= 10 && (x + y) % 2 === 0) return jitter([208, 192, 146], 6, r);
  return jitter([224, 210, 162], 8, r);
};
PAINTERS.granite = (x, y, r) => {
  const speck = ((x * 7 + y * 13) % 9 === 0) || ((x * 3 + y * 5) % 11 === 0);
  return speck ? jitter([116, 72, 62], 12, r) : jitter([154, 106, 88], 12, r);
};
PAINTERS.diorite = (x, y, r) => {
  const speck = ((x * 5 + y * 11) % 8 === 0) || ((x * 9 + y * 3) % 13 === 0);
  return speck ? jitter([112, 112, 116], 12, r) : jitter([190, 190, 192], 10, r);
};
PAINTERS.andesite = (x, y, r) => {
  const blotch = ((x >> 1) * 7 + (y >> 1) * 11) % 5 === 0;
  return blotch ? jitter([118, 118, 120], 10, r) : jitter([138, 138, 140], 10, r);
};

// ---- the second tree, rails, webs, ice ----
PAINTERS.obsidian = (x, y, r) => {
  // Glassy black with violet veins and the odd bright glint.
  const vein = Math.abs(vnoise(x, y, 6, 301) - 0.5);
  if (vein < 0.035) return jitter([104, 56, 186], 10, r);
  if (vein < 0.07) return jitter([54, 28, 96], 8, r);
  if (r() < 0.025) return [160, 120, 240];
  return jitter([22, 13, 36], 7, r);
};
PAINTERS.cobweb = (x, y) => {
  const c = 7.5;
  const dx = x - c;
  const dy = y - c;
  const ring = Math.round(Math.max(Math.abs(dx), Math.abs(dy)));
  const onSpoke = x === y || x + y === 15 || x === 7 || x === 8 || y === 7 || y === 8;
  const onRing = (ring === 3 || ring === 6) && Math.abs(Math.abs(dx) - Math.abs(dy)) < 5;
  return onSpoke || onRing ? [232, 234, 238, 255] : [0, 0, 0, 0];
};
const railTile = (alongX: boolean): Painter => (x0, y0, r) => {
  const x = alongX ? x0 : y0; // work along x, then transpose
  const y = alongX ? y0 : x0;
  if (y === 3 || y === 12) return jitter([186, 190, 198], 10, r); // the two rails
  if (y === 4 || y === 13) return [112, 116, 124, 255];
  if (x % 4 === 1 && y > 3 && y < 12) return jitter([120, 88, 50], 12, r); // the ties
  return [0, 0, 0, 0];
};
PAINTERS.rail = railTile(true);
PAINTERS.rail_z = railTile(false);
/** A turn: two arcs round the bottom right corner joining the east and south edges (the mesher mirrors it for the other three). */
PAINTERS.rail_curve = (x, y, r) => {
  const dx = x + 0.5 - 16;
  const dy = y + 0.5 - 16;
  const d = Math.hypot(dx, dy);
  if (Math.abs(d - 3.5) < 0.75 || Math.abs(d - 12.5) < 0.75) return jitter([186, 190, 198], 10, r); // the two rails
  if (Math.abs(d - 3.5) < 1.5 || Math.abs(d - 12.5) < 1.5) return [112, 116, 124, 255];
  const ang = Math.atan2(-dy, -dx); // 0 along the south edge .. pi/2 along the east edge
  if (d > 4.2 && d < 11.8) {
    for (let i = 0; i < 4; i++) if (Math.abs(ang - (i + 0.5) * (Math.PI / 8)) < 0.1) return jitter([120, 88, 50], 12, r); // the ties
  }
  return [0, 0, 0, 0];
};
/** Gold rails: gold bars with ties between them and a red stud in the middle. */
const poweredTile = (alongX: boolean): Painter => (x0, y0, r) => {
  const x = alongX ? x0 : y0;
  const y = alongX ? y0 : x0;
  if (y === 3 || y === 12) return jitter([236, 196, 60], 10, r); // the two gold rails
  if (y === 4 || y === 13) return [170, 128, 36, 255];
  if (x % 4 === 1 && y > 3 && y < 12) return jitter([120, 88, 50], 12, r); // the ties
  if ((x === 6 || x === 7 || x === 8 || x === 9) && (y === 7 || y === 8)) return [210, 70, 56, 255]; // the stud in the middle
  return [0, 0, 0, 0];
};
PAINTERS.rail_powered = poweredTile(true);
PAINTERS.rail_powered_z = poweredTile(false);

/** One frame of flame: tongues rising from the bottom of the tile, white-yellow at the root, red at the tips. */
const fireFrame = (frame: number): Painter => (x, y, r) => {
  const up = 15 - y;
  const w = x - 7.5;
  const envelope = 1 - Math.abs(w) / 10;
  const wobble = Math.sin(x * 1.35 + frame * 1.7) * 2.3 + Math.sin(x * 0.6 + frame * 2.4 + 1) * 2.1;
  const height = 3.5 + envelope * 9.5 + wobble;
  if (up > height) return [0, 0, 0, 0];
  const t = up / height;
  // Gaps between the tongues, more of them towards the tips.
  if (t > 0.35 && (x * 5 + frame * 3 + Math.floor(up / 3)) % 7 === 0) return [0, 0, 0, 0];
  const j = (r() - 0.5) * 24;
  if (t < 0.22) return [255, 244 + j * 0.2, 170 + j, 255];
  if (t < 0.5) return [255, 196 + j, 48, 255];
  if (t < 0.78) return [250, 124 + j, 22, 255];
  return [214 + j * 0.5, 54 + j * 0.5, 12, 255];
};
for (let i = 0; i < 4; i++) PAINTERS[`fire_${i}`] = fireFrame(i);

function birchLogSide(x: number, y: number, r: () => number): RGB {
  const mark = (x * 5 + y * 3) % 7 === 0 && y % 3 !== 0;
  if (mark) return [38 + r() * 14, 36 + r() * 12, 34];
  const shade = (r() - 0.5) * 16 + (x % 5 === 0 ? -10 : 0);
  return [218 + shade, 214 + shade, 202 + shade];
}
PAINTERS.birch_log_side = birchLogSide;
PAINTERS.birch_log_top = (x, y, r) => {
  const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
  if (d > 6.5) return [206 + (r() - 0.5) * 8, 202, 190];
  const ring = Math.floor(d) % 2 === 0 ? 0 : -16;
  return [196 + ring + (r() - 0.5) * 8, 178 + ring, 120 + ring];
};
PAINTERS.birch_leaves = (x, y, r) => {
  const v = r();
  if (v < 0.16) return [0, 0, 0, 0];
  const shade = (v - 0.5) * 36 + ((x + y) % 3) * 6;
  return [104 + shade * 0.6, 156 + shade, 70 + shade * 0.4, 255];
};
PAINTERS.spruce_log_side = (x, _y, r) => {
  const streak = (x % 3 === 0 ? -16 : x % 3 === 1 ? 6 : 0) + (r() - 0.5) * 10;
  return [64 + streak, 46 + streak, 30 + streak];
};
PAINTERS.spruce_log_top = (x, y, r) => {
  const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
  if (d > 6.5) return [58 + (r() - 0.5) * 8, 42, 28];
  const ring = Math.floor(d) % 2 === 0 ? 0 : -14;
  return [136 + ring + (r() - 0.5) * 8, 104 + ring, 66 + ring];
};
PAINTERS.spruce_leaves = (x, y, r) => {
  const v = r();
  if (v < 0.14) return [0, 0, 0, 0];
  const shade = (v - 0.5) * 30 + ((x + y) % 3) * 5;
  return [32 + shade * 0.4, 84 + shade, 52 + shade * 0.5, 255];
};
PAINTERS.wool = (x, y, r) => jitter(((x >> 1) + (y >> 1)) % 2 === 0 ? [238, 238, 234] : [226, 226, 222], 5, r);
PAINTERS.lapis_ore = ore([38, 82, 190]);
PAINTERS.emerald_ore = ore([36, 196, 92]);
PAINTERS.redstone_ore = ore([210, 28, 20]);
PAINTERS.redstone_block = (x, y, r) => {
  const dust = ((x * 7 + y * 13) % 11) < 2 ? 26 : 0;
  const edge = x === 0 || y === 0 || x === TILE_PX - 1 || y === TILE_PX - 1 ? -34 : 0;
  return jitter([176 + dust + edge, 18 + dust * 0.4, 14], 12, r);
};
/** A lamp: a copper-brown frame round four glass panes of glowstone, dark when off, bright when on. */
const lampTile = (on: boolean): Painter => (x, y, r) => {
  const frame = x % 8 === 0 || x % 8 === 7 || y % 8 === 0 || y % 8 === 7;
  if (frame) return jitter(on ? [150, 104, 56] : [92, 62, 40], 8, r);
  const cell = ((x >> 3) + (y >> 3)) % 2;
  const v = (r() - 0.5) * 16;
  return on ? [250 + v * 0.3, 214 + v + cell * 8, 130 + v] : [118 + v, 88 + v * 0.8, 58 + cell * 6];
};
PAINTERS.redstone_lamp = lampTile(false);
PAINTERS.redstone_lamp_on = lampTile(true);
/** Dust: grainy red, the lit kind brighter. The mesher draws it as flat quads and shades them by strength. */
const dustTile = (on: boolean): Painter => (x, y, r) => {
  const v = r();
  const edge = x === 0 || x === TILE_PX - 1 || y === 0 || y === TILE_PX - 1;
  if (on) return v > 0.8 ? [255, 120, 90] : edge ? [190, 6, 4] : [236 + v * 20, 24 + v * 30, 16];
  return v > 0.8 ? [124, 34, 30] : edge ? [60, 4, 4] : [104 + v * 30, 10, 8];
};
PAINTERS.redstone_dot = dustTile(false);
PAINTERS.redstone_dot_on = dustTile(true);
PAINTERS.redstone_line = dustTile(false);
PAINTERS.redstone_line_on = dustTile(true);
/** The lever's wood and the stone it is fixed with. */
// A dungeon portal: a violet haze with bright curling bands running through it.
PAINTERS.portal = (x, y, r) => {
  const band = Math.abs(vnoise(x + y * 0.5, y, 5, 411) - 0.5);
  const swirl = Math.abs(vnoise(y - x * 0.4, x, 4, 417) - 0.5);
  if (band < 0.05 || swirl < 0.035) return [...jitter([196, 150, 255], 14, r), 230] as [number, number, number, number];
  if (r() < 0.04) return [236, 214, 255, 240];
  const [pr, pg, pb] = jitter([92 + band * 90, 38 + swirl * 60, 170 + band * 50], 10, r);
  return [pr, pg, pb, 175];
};
PAINTERS.lever = (x, y, r) => ((x + y) % 5 === 0 ? jitter([118, 84, 48], 10, r) : jitter([124, 96, 60], 12, r));
DYE_NAMES.forEach((n, i) => {
  if (i === 0) return;
  const [cr, cg, cb] = DYE_RGB[i];
  PAINTERS[`wool_${n}`] = (x, y, r) => jitter(((x >> 1) + (y >> 1)) % 2 === 0 ? [cr, cg, cb] : [cr * 0.93, cg * 0.93, cb * 0.93], 5, r);
});
PAINTERS.chiseled_sandstone = (x, y, r) => {
  if (edge(x, y)) return jitter([200, 184, 136], 6, r);
  const dx = Math.abs(x - 7.5);
  const dy = Math.abs(y - 7.5);
  if (dx + dy < 3.6 && dx + dy > 1.8) return jitter([176, 150, 100], 8, r); // a carved diamond
  if (dx < 1.2 || dy < 1.2) return jitter([196, 174, 124], 6, r);
  return jitter([224, 210, 162], 8, r);
};
PAINTERS.ice = (x, y, r) => {
  const crack = (x * 3 + y * 5) % 17 === 0 || (x + y * 2) % 19 === 0;
  const j = (r() - 0.5) * 14;
  return crack ? [214 + j, 238 + j, 252, 190] : [150 + j, 196 + j, 244, 170];
};

// ---- functional blocks ----
const plankAt = (x: number, y: number, r: () => number): RGB => PAINTERS.planks(x, y, r) as RGB;
const edge = (x: number, y: number): boolean => x === 0 || y === 0 || x === TILE_PX - 1 || y === TILE_PX - 1;
const darken = (c: RGB | [number, number, number, number], d: number): RGB => [c[0] - d, c[1] - d, c[2] - d];

PAINTERS.crafting_top = (x, y, r) => {
  const p = plankAt(x, y, r);
  if (edge(x, y) || x === 1 || y === 1 || x === 14 || y === 14) return darken(p, 46);
  if (x === 5 || x === 10 || y === 5 || y === 10) return darken(p, 30);
  return p;
};
PAINTERS.crafting_side = (x, y, r) => {
  const p = plankAt(x, y, r);
  if (y < 3) return darken(p, 40); // table lip
  if (x === 0 || x === 15) return darken(p, 30);
  // little saw + hammer silhouettes
  if (y >= 5 && y <= 11 && (x === 3 || x === 4)) return [200, 205, 212];
  if (y >= 5 && y <= 6 && x >= 9 && x <= 12) return [96, 96, 100];
  if (y >= 7 && y <= 12 && x === 10) return [120, 84, 44];
  return p;
};
PAINTERS.furnace_top = (x, y, r) => {
  if (edge(x, y)) return jitter([80, 80, 80], 8, r);
  if (x >= 5 && x <= 10 && y >= 5 && y <= 10) return jitter([30, 30, 32], 6, r);
  return PAINTERS.cobble(x, y, r) as RGB;
};
PAINTERS.furnace_side = (x, y, r) => {
  const c = PAINTERS.cobble(x, y, r) as RGB;
  if (x >= 4 && x <= 11 && y >= 7 && y <= 12) return jitter([26, 24, 26], 5, r); // fire box
  if (x >= 3 && x <= 12 && y >= 6 && y <= 13) return darken(c, 40); // frame
  if (x >= 5 && x <= 10 && y >= 2 && y <= 3) return jitter([20, 20, 22], 5, r); // vent
  return c;
};
PAINTERS.farmland_top = (x, _y, r) => {
  const furrow = x % 4 === 1 || x % 4 === 2;
  return jitter(furrow ? [74, 50, 34] : [98, 68, 46], 8, r);
};
PAINTERS.chest_top = (x, y, r) => {
  const p = plankAt(x, y, r);
  const base: RGB = [p[0] - 18, p[1] - 30, p[2] - 28];
  if (edge(x, y)) return darken(base, 38);
  return base;
};
PAINTERS.chest_side = (x, y, r) => {
  const p = plankAt(x, y, r);
  const base: RGB = [p[0] - 18, p[1] - 30, p[2] - 28];
  if (x === 0 || x === 15 || y === 15) return darken(base, 38);
  if (y === 0 || y === 5) return darken(base, 44); // lid seam
  if (x >= 7 && x <= 8 && y >= 4 && y <= 8) return [214, 190, 90]; // latch
  return base;
};

// ---- the bed ----
// Tile y runs from the head end (0) toward the foot end (15) on the top faces; side and end faces show
// the lower 9 rows (a bed is 9/16 high), with u growing toward the head.
const BED_PILLOW: RGB = [238, 238, 242];
const BED_PILLOW_DARK: RGB = [200, 202, 212];
const NONE: [number, number, number, number] = [0, 0, 0, 0];
/** Wooden frame and legs under the mattress: legs at the given tile columns, the frame rows 11-12. */
const bedFrame = (x: number, y: number, r: () => number, legs: readonly [number, number][]): RGB | [number, number, number, number] => {
  const wood = darken(plankAt(x, y, r), 26);
  if (y <= 12) return wood;
  return legs.some(([a, b]) => x >= a && x <= b) ? darken(wood, 14) : NONE;
};
const scaleRGB = (c: readonly number[], k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

/** The six bed tiles of one blanket colour: base, shadow, highlight and the second checker shade. */
function paintBed(color: number, RED: RGB, DARK: RGB, LIGHT: RGB, ALT: RGB): void {
  const name = (part: BedPart) => bedTileName(part, color);
  const blanket = (x: number, y: number, r: () => number): RGB => jitter(((x >> 1) + (y >> 1)) % 2 === 0 ? RED : ALT, 5, r);
  PAINTERS[name('top_foot')] = (x, y, r) => {
    if (x === 0 || x === 15 || y === 15) return jitter(DARK, 5, r);
    return blanket(x, y, r);
  };
  PAINTERS[name('top_head')] = (x, y, r) => {
    if (x === 0 || x === 15 || y === 0) return jitter(y === 0 && x > 0 && x < 15 ? BED_PILLOW_DARK : DARK, 4, r);
    if (y <= 6) return x === 1 || x === 14 || y === 6 ? jitter(BED_PILLOW_DARK, 4, r) : jitter(BED_PILLOW, 4, r);
    return y === 7 ? jitter(DARK, 5, r) : blanket(x, y, r);
  };
  const bedSide = (head: boolean) => (x: number, y: number, r: () => number): RGB | [number, number, number, number] => {
    if (y < 7) return blanket(x, y, r);
    if (y <= 10) {
      if (head && y <= 8 && x >= 9) return jitter(y === 7 ? BED_PILLOW : BED_PILLOW_DARK, 4, r);
      if (y === 7) return jitter(LIGHT, 5, r);
      return y === 10 ? jitter(DARK, 5, r) : blanket(x, y, r);
    }
    return bedFrame(x, y, r, head ? [[13, 15]] : [[0, 2]]);
  };
  PAINTERS[name('side_foot')] = bedSide(false);
  PAINTERS[name('side_head')] = bedSide(true);
  PAINTERS[name('end_foot')] = (x, y, r) => {
    if (y < 7) return blanket(x, y, r);
    if (y <= 10) return y === 7 ? jitter(LIGHT, 5, r) : y === 10 ? jitter(DARK, 5, r) : blanket(x, y, r);
    return bedFrame(x, y, r, [[0, 2], [13, 15]]);
  };
  PAINTERS[name('end_head')] = (x, y, r) => {
    if (y < 7) return jitter(BED_PILLOW, 4, r);
    if (y <= 8) return x === 0 || x === 15 ? jitter(DARK, 5, r) : jitter(y === 7 ? BED_PILLOW : BED_PILLOW_DARK, 4, r);
    if (y <= 12) return darken(plankAt(x, y, r), 26); // headboard
    return [[0, 2], [13, 15]].some(([a, b]) => x >= a && x <= b) ? darken(plankAt(x, y, r), 40) : NONE;
  };
}
DYE_NAMES.forEach((_, c) => {
  if (c === BED_RED) paintBed(c, [176, 34, 36], [132, 22, 28], [200, 54, 50], [168, 30, 32]);
  else {
    const base = scaleRGB(DYE_RGB[c], 0.92);
    paintBed(c, base, scaleRGB(base, 0.74), scaleRGB(base, 1.14), scaleRGB(base, 0.955));
  }
});

// ---- building blocks ----
// Wooden door: lower and upper halves (the knob is on the lower one, the windows on the upper).
const DOOR_WOOD: RGB = [150, 108, 60];
const doorWood = (x: number, y: number, r: () => number): RGB => {
  if (x === 0 || x === 15) return jitter(darken(DOOR_WOOD, 40), 5, r);
  if (x === 7 || x === 8) return jitter(darken(DOOR_WOOD, 20), 5, r);
  return jitter(DOOR_WOOD, 8, r);
};
PAINTERS.door_lower = (x, y, r) => {
  if (y === 15 || y === 0) return jitter(darken(DOOR_WOOD, 40), 5, r);
  if (y === 7 || y === 8) return jitter(darken(DOOR_WOOD, 22), 5, r);
  if ((x === 12 || x === 13) && (y === 2 || y === 3)) return y === 2 ? [226, 226, 232] : [168, 170, 178]; // knob
  return doorWood(x, y, r);
};
PAINTERS.door_upper = (x, y, r) => {
  if (y === 0) return jitter(darken(DOOR_WOOD, 40), 5, r);
  const inWindow = (x >= 2 && x <= 6 && y >= 3 && y <= 6) || (x >= 9 && x <= 13 && y >= 3 && y <= 6);
  if (inWindow) return jitter(darken(DOOR_WOOD, 72), 4, r);
  if (y === 15) return jitter(darken(DOOR_WOOD, 24), 5, r);
  return doorWood(x, y, r);
};
PAINTERS.trapdoor = (x, y, r) => {
  const base: RGB = [126, 90, 50];
  if (edge(x, y)) return jitter(darken(base, 44), 5, r);
  if (y % 4 === 3) return jitter(darken(base, 26), 5, r); // gaps between the slats
  if (x === 7 && y >= 6 && y <= 9) return [190, 192, 200]; // handle
  return jitter(base, 9, r);
};
PAINTERS.ladder = (x, y, r) => {
  const wood: RGB = [136, 98, 52];
  if (x <= 2 || x >= 13) return jitter(x === 2 || x === 13 ? darken(wood, 26) : wood, 6, r); // rails
  if (y % 4 === 1 || y % 4 === 2) return jitter(y % 4 === 1 ? wood : darken(wood, 22), 6, r); // rungs
  return NONE;
};
PAINTERS.stone_bricks = (x, y, r) => {
  const row = y >> 2;
  const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
  return mortar ? jitter([92, 92, 96], 6, r) : jitter([134, 134, 138], 9, r);
};

// ---- enchanting ----
PAINTERS.enchanting_table_top = (x, y, r) => {
  const ob = PAINTERS.obsidian(x, y, r) as RGB;
  if (edge(x, y)) return darken(ob, 6);
  // A crimson cloth with a gold border and a pale diamond in the middle.
  const inner = x >= 2 && x <= 13 && y >= 2 && y <= 13;
  if (!inner) return ob;
  if (x === 2 || x === 13 || y === 2 || y === 13) return jitter([214, 176, 62], 8, r);
  const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
  if (d < 3) return jitter([120, 226, 220], 14, r);
  return jitter([158, 30, 44], 12, r);
};
PAINTERS.enchanting_table_side = (x, y, r) => {
  const ob = PAINTERS.obsidian(x, y, r) as RGB;
  if (y < 2) return jitter([158, 30, 44], 12, r);
  if (y === 2) return jitter([214, 176, 62], 8, r);
  // Two little diamonds set in the black stone.
  if ((Math.abs(x - 3.5) + Math.abs(y - 9.5) <= 1.5) || (Math.abs(x - 11.5) + Math.abs(y - 9.5) <= 1.5)) return jitter([120, 226, 220], 12, r);
  return ob;
};
PAINTERS.enchanting_table_bottom = (x, y, r) => PAINTERS.obsidian(x, y, r);
PAINTERS.bookshelf = (x, y, r) => {
  const p = plankAt(x, y, r);
  if (y < 2 || y > 13 || (y >= 7 && y <= 8)) return darken(p, y === 0 || y === 15 ? 40 : 14);
  // Two rows of books, each a spine of its own colour with a lighter edge.
  const row = y < 7 ? 0 : 1;
  const colours: RGB[] = [[148, 48, 46], [52, 84, 150], [60, 124, 70], [166, 124, 48], [104, 62, 132], [122, 80, 46]];
  const slot = Math.floor((x + row * 2) / 3);
  const c = colours[(slot * 5 + row * 3) % colours.length];
  if ((x + row * 2) % 3 === 2) return darken(c, 52);
  const top = y === (row === 0 ? 2 : 9);
  return jitter(top ? [c[0] + 26, c[1] + 26, c[2] + 26] : c, 8, r);
};
PAINTERS.anvil_top = (x, y, r) => {
  if (edge(x, y)) return jitter([40, 40, 44], 5, r);
  return jitter([76, 76, 82], 7, r);
};
PAINTERS.anvil_side = (x, y, r) => {
  const band = y < 3 ? 14 : y < 10 ? 0 : -10;
  if (x === 0 || x === 15) return jitter([36, 36, 40], 5, r);
  return jitter([64 + band + (x < 8 ? 6 : 0), 64 + band + (x < 8 ? 6 : 0), 70 + band + (x < 8 ? 6 : 0)], 6, r);
};

/** Anvil sides that have taken some beating: dark cracks run down the iron (more of them when damaged). */
function wornAnvilSide(cracks: number): Painter {
  return (x, y, r) => {
    const base = PAINTERS.anvil_side(x, y, r);
    const lines = [
      (yy: number) => 5 + Math.floor(yy / 2) - (yy > 8 ? 1 : 0),
      (yy: number) => 11 - Math.floor(yy / 3),
      (yy: number) => 2 + Math.floor((15 - yy) / 4),
    ];
    for (let k = 0; k < cracks; k++) {
      if (x === lines[k](y) && y > 1 + k) return jitter([20, 20, 24], 4, r);
      // A chipped notch in the upper edge.
      if (y < 3 && x === 12 - k * 4) return [0, 0, 0, 0];
    }
    return base;
  };
}
PAINTERS.anvil_side_chipped = wornAnvilSide(1);
PAINTERS.anvil_side_damaged = wornAnvilSide(3);
PAINTERS.grindstone_top = (x, y, r) => {
  if (edge(x, y)) return jitter([86, 86, 92], 5, r);
  return jitter([128, 128, 134], 9, r);
};
PAINTERS.grindstone_side = (x, y, r) => {
  // A stone wheel with a wooden support on each side.
  if (x < 3 || x > 12) return plankAt(x, y, r);
  const band = y % 4 === 0 ? -14 : 0;
  return jitter([120 + band + (x < 8 ? 8 : 0), 120 + band + (x < 8 ? 8 : 0), 126 + band + (x < 8 ? 8 : 0)], 8, r);
};
/** TNT: red sticks bound by a pale band that carries the lettering. */
PAINTERS.tnt_side = (x, y, r) => {
  if (y >= 6 && y <= 9) {
    // T N T in three-wide letters on the pale band.
    const starts = [2, 6, 10];
    const letter = starts.findIndex((s) => x >= s && x <= s + 2);
    if (letter >= 0 && y <= 8) {
      const cx = x - starts[letter];
      const row = y - 6;
      const ink = letter === 1 ? cx === 0 || cx === 2 || (cx === 1 && row === 1) : row === 0 || cx === 1;
      if (ink) return jitter([40, 40, 44], 4, r);
    }
    return jitter([212, 208, 196], 6, r);
  }
  const stick = Math.floor(x / 3) % 2 === 0 ? 0 : 10;
  const seam = x % 3 === 2 ? -26 : 0;
  return jitter([176 + stick + seam, 38 + seam / 2, 34 + seam / 2], 8, r);
};
PAINTERS.tnt_top = (x, y, r) => {
  // The ends of the sticks round a little fuse.
  if (Math.hypot(x - 7.5, y - 7.5) < 1.6) return jitter([56, 50, 44], 4, r);
  const ring = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0 ? 0 : 12;
  return jitter([206 + ring, 70 + ring, 60 + ring], 7, r);
};
PAINTERS.tnt_bottom = (x, y, r) => PAINTERS.tnt_top(x, y, r);
PAINTERS.slime_block = (x, y, r) => {
  // A cube of green jelly: a darker rind round a lighter, clearer core.
  const core = x >= 4 && x <= 11 && y >= 4 && y <= 11;
  if (edge(x, y)) return [...jitter([84, 160, 62], 6, r), 235] as [number, number, number, number];
  if (core) return [...jitter([138, 214, 104], 8, r), 150] as [number, number, number, number];
  return [...jitter([112, 190, 84], 7, r), 190] as [number, number, number, number];
};
// ======================================================================================================
// Refined block art. Classic pixel-art technique: a handful of hand-picked tones per material, chosen by
// soft clustered noise (so patches read as texture, not static), with highlight / shadow pixels for depth.
// Everything wraps at the tile edge, so greedy-merged quads still tile seamlessly.
// ======================================================================================================

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((seed | 0) + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1 whose lattice (every `scale` pixels) wraps at the tile edge. */
function vnoise(x: number, y: number, scale: number, seed: number): number {
  const period = Math.max(1, Math.round(TILE_PX / scale));
  const fx = (x + 0.5) / scale;
  const fy = (y + 0.5) / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const w = (i: number): number => ((i % period) + period) % period;
  const a = hash2(w(x0), w(y0), seed);
  const b = hash2(w(x0 + 1), w(y0), seed);
  const c = hash2(w(x0), w(y0 + 1), seed);
  const d = hash2(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Layered noise: broad patches with a little fine grain. */
const patchy = (x: number, y: number, seed: number): number => vnoise(x, y, 8, seed) * 0.45 + vnoise(x, y, 4, seed + 1) * 0.35 + vnoise(x, y, 2, seed + 2) * 0.2;

const pickTone = <T>(tones: readonly T[], t: number): T => tones[Math.max(0, Math.min(tones.length - 1, Math.floor(t * tones.length)))];
const shade = (c: readonly number[], k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const add = (c: readonly number[], d: number): RGB => [c[0] + d, c[1] + d, c[2] + d];
const mixRGB = (a: readonly number[], b: readonly number[], t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface Cell {
  d1: number;
  d2: number;
  id: number;
  px: number;
  py: number;
}
const cellScratch: Cell = { d1: 0, d2: 0, id: 0, px: 0, py: 0 };
/** Wrapping Voronoi cells (`cells` per tile edge): distance to the nearest and second nearest seed, and the nearest one's identity. */
function voronoi(x: number, y: number, cells: number, seed: number): Cell {
  const size = TILE_PX / cells;
  const fx = x + 0.5;
  const fy = y + 0.5;
  const cx = Math.floor(fx / size);
  const cy = Math.floor(fy / size);
  let d1 = 1e9;
  let d2 = 1e9;
  const out = cellScratch;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const wx = ((gx % cells) + cells) % cells;
      const wy = ((gy % cells) + cells) % cells;
      const px = (gx + 0.18 + 0.64 * hash2(wx, wy, seed)) * size;
      const py = (gy + 0.18 + 0.64 * hash2(wx, wy, seed + 7)) * size;
      const d = Math.hypot(fx - px, fy - py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        out.id = hash2(wx, wy, seed + 13);
        out.px = px;
        out.py = py;
      } else if (d < d2) d2 = d;
    }
  }
  out.d1 = d1;
  out.d2 = d2;
  return out;
}

// ---- stone family ----
const STONE_TONES: RGB[] = [[152, 150, 150], [139, 138, 140], [126, 126, 131], [113, 113, 119]];
PAINTERS.stone = (x, y, r) => {
  const n = patchy(x, y, 11);
  let c = pickTone(STONE_TONES, n);
  // Patches drift between warm and cool grey, like mineral banding.
  const drift = vnoise(x, y, 8, 17) - 0.5;
  c = [c[0] + drift * 10, c[1] + drift * 2, c[2] - drift * 10];
  const vein = Math.abs(vnoise(x, y, 6, 15) - 0.5);
  if (vein < 0.03) return shade(c, 0.76); // a hairline crack
  if (vein < 0.048) return shade(c, 1.09); // its lit lip
  const p = r();
  if (p < 0.04) return shade(c, 1.15);
  if (p > 0.975) return shade(c, 0.85);
  return c;
};

/** Ore: stone with a few irregular clusters, each pixel lit from the top left. */
function oreTile(color: RGB, seed: number): Painter {
  const rnd = rngFor(seed);
  const blobs: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 6; i++) blobs.push({ x: 2 + rnd() * 12, y: 2 + rnd() * 12, r: 1.3 + rnd() * 1.1 });
  return (x, y, r) => {
    for (const b of blobs) {
      const dx = x + 0.5 - b.x;
      const dy = y + 0.5 - b.y;
      const wob = (hash2(x, y, seed) - 0.5) * 0.7;
      const d = Math.hypot(dx, dy) + wob;
      if (d < b.r) {
        const lit = dx + dy;
        if (d > b.r - 0.55) return shade(color, 0.7);
        // The top-left facet catches the light: a bright face and one near-white glint.
        if (lit < -1.5 && d < b.r - 0.9) return mixRGB(color, [255, 255, 255], 0.75);
        return lit < -0.7 ? mixRGB(color, [255, 255, 255], 0.28) : lit > 0.9 ? shade(color, 0.82) : jitter(color, 6, r);
      }
      // Stone hugging the vein sits in a little shadow.
      if (d < b.r + 0.85) return shade(PAINTERS.stone(x, y, r) as RGB, 0.82);
    }
    return PAINTERS.stone(x, y, r) as RGB;
  };
}
PAINTERS.coal_ore = oreTile([40, 40, 44], 101);
PAINTERS.iron_ore = oreTile([216, 172, 142], 102);
PAINTERS.gold_ore = oreTile([252, 224, 62], 103);
PAINTERS.diamond_ore = oreTile([84, 226, 220], 104);
PAINTERS.lapis_ore = oreTile([40, 84, 200], 105);
PAINTERS.emerald_ore = oreTile([38, 204, 96], 106);
PAINTERS.redstone_ore = oreTile([216, 30, 22], 107);

PAINTERS.cobble = (x, y, r) => {
  const c = voronoi(x, y, 4, 21);
  if (c.d2 - c.d1 < 0.85) return jitter([64, 64, 70], 5, r);
  // Each stone has its own hue: warm sandy, cool blue, neutral and pinkish greys.
  const base = pickTone<RGB>([[146, 140, 130], [128, 130, 136], [138, 138, 140], [152, 142, 134], [120, 122, 128]], c.id);
  const lit = x + 0.5 - c.px + (y + 0.5 - c.py);
  const k = lit < -1.6 ? 1.13 : lit > 1.8 ? 0.8 : 1;
  const pit = r() < 0.05 ? 0.86 : 1;
  return jitter(shade(base, k * pit), 4, r);
};
PAINTERS.gravel = (x, y, r) => {
  const c = voronoi(x, y, 5, 31);
  if (c.d2 - c.d1 < 0.7) return jitter([84, 80, 78], 4, r);
  const base = pickTone<RGB>([[140, 136, 132], [122, 118, 116], [150, 140, 128], [108, 112, 118], [132, 126, 120]], c.id);
  const lit = x + 0.5 - c.px + (y + 0.5 - c.py);
  return jitter(shade(base, lit < -1 ? 1.12 : lit > 1.2 ? 0.82 : 1), 5, r);
};
PAINTERS.stone_bricks = (x, y, r) => {
  const row = y >> 2;
  const bx = (x + (row % 2) * 4) % 8;
  const brick = Math.floor((x + (row % 2) * 4) / 8) + row * 3;
  const mortar = y % 4 === 3 || bx === 7;
  if (mortar) return jitter([72, 72, 80], 4, r);
  const base = pickTone<RGB>([[146, 142, 140], [132, 134, 142], [152, 152, 154], [126, 126, 134], [142, 136, 130]], hash2(brick, row, 41));
  const top = y % 4 === 0 ? 1.12 : y % 4 === 2 ? 0.92 : 1;
  const left = bx === 0 ? 1.08 : bx === 6 ? 0.9 : 1;
  const crack = hash2(brick, row, 43) > 0.88 && (x * 3 + y * 5) % 11 === 0;
  const chip = hash2(x, y, 44) > 0.965 ? 1.16 : 1;
  return jitter(shade(base, top * left * chip * (crack ? 0.76 : 1)), 4, r);
};
PAINTERS.bedrock = (x, y, r) => {
  const c = voronoi(x, y, 4, 51);
  const base = pickTone<RGB>([[30, 30, 32], [52, 52, 54], [74, 74, 76], [42, 42, 44]], c.id);
  return c.d2 - c.d1 < 0.8 ? jitter([20, 20, 22], 3, r) : jitter(shade(base, x + y < c.px + c.py - 1 ? 1.15 : 1), 6, r);
};
PAINTERS.glowstone = (x, y, r) => {
  const c = voronoi(x, y, 4, 61);
  if (c.d2 - c.d1 < 0.85) return jitter([176, 112, 40], 8, r);
  const heat = Math.max(0, 1 - c.d1 / 3.2);
  const base = mixRGB([238, 178, 84], [255, 240, 168], heat * (0.55 + c.id * 0.45));
  return jitter(base, 8, r);
};

// ---- earth ----
const DIRT_TONES: RGB[] = [[156, 108, 72], [142, 97, 64], [127, 86, 56], [110, 74, 48]];
/** A few fixed pebbles, two pixels wide with a lit top and a shaded underside. */
const PEBBLES: [number, number][] = [[4, 5], [11, 11]];
const dirtAt = (x: number, y: number, r: () => number): RGB => {
  let c = pickTone(DIRT_TONES, patchy(x, y, 71));
  for (const [px, py] of PEBBLES) {
    const dx = (((x - px) % 16) + 16) % 16;
    const dy = (((y - py) % 16) + 16) % 16;
    if (dx < 2 && dy === 0) return [160, 132, 106];
    if (dx < 2 && dy === 1) return [104, 76, 56];
  }
  const p = r();
  if (p < 0.03) c = [162, 128, 98];
  else if (p > 0.975) c = [92, 62, 42];
  return c;
};
PAINTERS.dirt = (x, y, r) => dirtAt(x, y, r);

const GRASS_TONES: RGB[] = [[112, 190, 58], [99, 172, 52], [88, 154, 47], [74, 132, 41]];
const grassAt = (x: number, y: number, r: () => number): [number, number, number, number] => {
  let c = pickTone(GRASS_TONES, patchy(x, y, 81));
  // Short vertical blades: a darker stroke with a bright tip above it.
  const blade = hash2(x, (y + x * 3) >> 2, 83);
  if (blade > 0.8) c = ((y + x * 3) & 3) === 0 ? shade(c, 1.22) : shade(c, 0.82);
  const p = r();
  if (p < 0.05) c = shade(c, 1.16);
  else if (p > 0.95) c = shade(c, 0.78);
  return [c[0], c[1], c[2], 250];
};
PAINTERS.grass_top = (x, y, r) => grassAt(x, y, r);
/** How deep the turf reaches down the side of the block in a column. */
const turfDepth = (x: number, seed: number): number => 3 + Math.floor(hash2(x, 0, seed) * 2.6) + (hash2(x, 1, seed) > 0.85 ? 2 : 0);
PAINTERS.grass_side = (x, y, r) => {
  const d = turfDepth(x, 91);
  if (y < d) {
    const g = grassAt(x, y, r);
    if (y === 0) return [g[0] * 1.12, g[1] * 1.12, g[2] * 1.12, 250];
    return y === d - 1 ? [g[0] * 0.78, g[1] * 0.78, g[2] * 0.78, 250] : g;
  }
  const c = dirtAt(x, y, r);
  return y === d ? shade(c, 0.78) : y === d + 1 ? shade(c, 0.9) : c;
};
PAINTERS.sand = (x, y, r) => {
  let c = pickTone<RGB>([[236, 222, 172], [226, 212, 162], [214, 198, 148], [202, 184, 136]], patchy(x, y, 101));
  // Wind ripples in the sand; they wrap at the tile edge like everything else.
  const wave = Math.sin(y * 0.785 + vnoise(x, y, 8, 102) * 4);
  if (wave > 0.82) c = shade(c, 0.92);
  else if (wave < -0.9) c = shade(c, 1.06);
  const p = r();
  if (p < 0.006) return [232, 204, 180]; // a bit of shell
  if (p > 0.95) c = add(c, -16);
  return c;
};
PAINTERS.snow = (x, y, r) => {
  const c = pickTone<RGB>([[252, 254, 255], [245, 249, 253], [236, 242, 250], [226, 234, 246]], patchy(x, y, 111) * 0.9);
  return r() < 0.04 ? add(c, -10) : c;
};
PAINTERS.snow_side = (x, y, r) => {
  const d = turfDepth(x, 121) + 1;
  if (y < d) return PAINTERS.snow(x, y, r) as RGB;
  const c = dirtAt(x, y, r);
  return y === d ? [200, 214, 232] : y === d + 1 ? shade(c, 0.88) : c;
};

// ---- wood ----
type Tones = readonly RGB[];
const barkSide = (tones: Tones, seed: number): Painter => (x, y, r) => {
  const col = hash2(x, 0, seed) * 0.55 + vnoise(x, y, 6, seed + 1) * 0.45;
  let c = pickTone(tones, col);
  if (x % 4 === 0) c = shade(c, 0.84);
  else if (x % 4 === 1) c = shade(c, 1.1); // the lit side of each ridge
  if (hash2(x, y >> 1, seed + 5) > 0.93) c = shade(c, 0.68); // a knot
  return jitter(c, 3, r);
};
const ringsTop = (bark: RGB, wood: Tones, seed: number): Painter => (x, y, r) => {
  const cheb = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
  if (cheb > 6.5) return jitter(shade(bark, 0.9 + hash2(x, y, seed) * 0.2), 3, r);
  if (cheb > 5.5) return jitter(shade(wood[wood.length - 1], 0.82), 3, r);
  const d = Math.hypot(x - 7.5, y - 7.5) + (vnoise(x, y, 4, seed) - 0.5) * 1.2;
  return jitter(wood[Math.floor(d * 0.85) % wood.length], 3, r);
};
const LOG_BARK: Tones = [[124, 98, 60], [110, 85, 52], [96, 74, 44], [80, 60, 36]];
PAINTERS.log_side = barkSide(LOG_BARK, 131);
PAINTERS.log_top = ringsTop([96, 74, 44], [[190, 154, 100], [172, 136, 84], [182, 146, 92], [162, 126, 76]], 132);
PAINTERS.spruce_log_side = barkSide([[82, 60, 38], [70, 51, 32], [60, 43, 27], [48, 34, 22]], 141);
PAINTERS.spruce_log_top = ringsTop([58, 42, 28], [[150, 116, 74], [136, 104, 66], [144, 110, 70], [124, 94, 58]], 142);
PAINTERS.birch_log_side = (x, y, r) => {
  const base = pickTone<RGB>([[232, 228, 214], [222, 218, 204], [212, 208, 194], [200, 196, 182]], hash2(x, y >> 2, 151) * 0.5 + vnoise(x, y, 6, 152) * 0.5);
  const mark = hash2(x >> 1, y, 153) > 0.86 && hash2(x, y >> 1, 154) > 0.45;
  if (mark) return jitter([42, 40, 38], 8, r);
  return jitter(shade(base, x % 5 === 0 ? 0.93 : 1), 3, r);
};
PAINTERS.birch_log_top = ringsTop([218, 214, 200], [[206, 188, 128], [190, 172, 112], [198, 180, 120], [180, 162, 102]], 155);

// Leaves are painted in their own darker greens (the shader tints them by biome through the alpha-250 mark).
const leafPainter = (tones: Tones, alpha: number, seed: number, holes = 0.15): Painter => {
  // Fluffy, dense foliage: a tile is covered in small overlapping leaves (tones are listed lightest first). Each leaf is a little
  // oval, lit along its top left rim and shaded along the bottom right, laid over the ones before it, which throw their shade on
  // the ones beneath: the surface looks feathery and deep, not flat. Everything wraps at the tile edge.
  const N = TILE_PX;
  const wrap = (v: number): number => ((v % N) + N) % N;
  const levels: RGB[] = [shade(tones[0], 1.12), tones[0], tones[1], tones[2], tones[3], shade(tones[3], 0.8)];
  let grid: (RGB | null)[] | null = null;
  const build = (): (RGB | null)[] => {
    const depth = new Array<number>(N * N).fill(-1);
    const level = new Array<number>(N * N).fill(4);
    for (let i = 0; i < 52; i++) {
      const cx = hash2(i, 0, seed) * N;
      const cy = hash2(i, 1, seed) * N;
      const len = 1.5 + hash2(i, 2, seed) * 1.0;
      const wid = 0.95 + hash2(i, 3, seed) * 0.55;
      const ang = hash2(i, 4, seed) * Math.PI;
      const base = 1 + Math.floor(hash2(i, 5, seed) * 3);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const px = Math.floor(cx) + dx;
          const py = Math.floor(cy) + dy;
          const rx = px + 0.5 - cx;
          const ry = py + 0.5 - cy;
          const u = (rx * ca + ry * sa) / len;
          const v = (-rx * sa + ry * ca) / wid;
          if (u * u + v * v > 1) continue;
          const light = -(rx + ry) / (len + wid);
          const lv = base + (light > 0.25 ? -1 : light < -0.35 ? 1 : 0);
          const idx = wrap(py) * N + wrap(px);
          depth[idx] = i;
          level[idx] = Math.max(0, Math.min(4, lv));
        }
      }
    }
    // Gaps in the foliage, in little groups of a few pixels (not lone dots), where the sky and the sun come through.
    const gapAt = (x: number, y: number): boolean => vnoise(x, y, 4, seed + 21) * 0.65 + hash2(wrap(x), wrap(y), seed + 22) * 0.35 < 0.2 + holes * 1.2;
    const out = new Array<RGB | null>(N * N).fill(null);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        if (gapAt(x, y)) continue;
        // Between the leaves it is shady.
        if (depth[idx] < 0) {
          out[idx] = levels[5];
          continue;
        }
        let lv = level[idx];
        // A leaf laid over this one, up and to the left, throws its shade here; so does the edge of a gap.
        if (depth[wrap(y - 1) * N + wrap(x - 1)] > depth[idx] || gapAt(x - 1, y - 1)) lv = Math.min(5, lv + 1);
        out[idx] = levels[lv];
      }
    }    return out;
  };
  return (x, y, r) => {
    grid ??= build();
    const c = grid[wrap(y) * N + wrap(x)];
    if (!c) return [0, 0, 0, 0];
    const g = (r() - 0.5) * 8;
    return [c[0] + g, c[1] + g, c[2] + g * 0.6, alpha];
  };
};
PAINTERS.leaves = leafPainter([[82, 168, 58], [66, 146, 46], [52, 124, 38], [36, 98, 28]], 250, 161, 0.1);
PAINTERS.birch_leaves = leafPainter([[142, 190, 96], [124, 172, 80], [106, 154, 66], [88, 132, 54]], 255, 162, 0.1);
PAINTERS.spruce_leaves = leafPainter([[58, 122, 76], [44, 102, 62], [34, 84, 52], [24, 66, 40]], 255, 163, 0.09);

PAINTERS.planks = (x, y, r) => {
  const b = y >> 2;
  const seamX = (b * 5 + 3) % 16;
  const tone = pickTone<RGB>([[190, 154, 96], [180, 144, 88], [170, 134, 80], [184, 148, 90]], hash2(b, 0, 171));
  if (y % 4 === 3) return jitter(shade(tone, 0.68), 3, r);
  if (x === seamX) return jitter(shade(tone, 0.74), 3, r);
  const grain = hash2(y, Math.floor((x + b * 7) / 7), 172);
  let k = 0.94 + grain * 0.12;
  if (y % 4 === 0) k += 0.06;
  if ((x === (seamX + 2) % 16 || x === (seamX + 14) % 16) && y % 4 === 1) k -= 0.2; // a nail
  return jitter(shade(tone, k), 3, r);
};
PAINTERS.cactus_side = (x, y, r) => {
  if (x === 0 || x === 15) return jitter([30, 82, 34], 4, r);
  const base = pickTone<RGB>([[78, 150, 62], [66, 136, 54], [58, 124, 48]], (x % 4) / 4 + hash2(x, y, 181) * 0.2);
  if (x % 4 === 2 && y % 4 === 1) return [236, 232, 196]; // a spine
  return jitter(base, 4, r);
};

// ======================================================================================================
// The new world: ground, rock, wood and fungi of the biomes (see worldgen.ts). Same recipe as above: tone tables picked by
// soft noise, a little grain, light from the top left, everything wrapping at the tile edge.
// ======================================================================================================

/** A turfed side: `top` colours over the first rows (ragged), dirt below. `alpha` marks tintable pixels. */
const turfSide = (top: (x: number, y: number, r: () => number) => RGB, seed: number): Painter => (x, y, r) => {
  const d = turfDepth(x, seed);
  if (y < d) {
    const g = top(x, y, r);
    return y === d - 1 ? shade(g, 0.8) : y === 0 ? shade(g, 1.1) : g;
  }
  const c = dirtAt(x, y, r);
  return y === d ? shade(c, 0.78) : y === d + 1 ? shade(c, 0.9) : c;
};

PAINTERS.coarse_dirt = (x, y, r) => {
  const c = voronoi(x, y, 5, 301);
  let base = pickTone<RGB>([[134, 94, 64], [120, 84, 56], [108, 76, 50], [146, 104, 72]], patchy(x, y, 302));
  // Pale pebbles pressed into the clay.
  if (c.d1 < 1.5 && c.id > 0.55) base = pickTone<RGB>([[158, 148, 138], [142, 134, 126], [172, 160, 148]], c.id * 3 - 1.6);
  else if (c.d2 - c.d1 < 0.6) base = shade(base, 0.82);
  return jitter(base, 4, r);
};
PAINTERS.podzol_top = (x, y, r) => {
  let c = pickTone<RGB>([[122, 84, 40], [106, 72, 34], [92, 60, 30], [78, 50, 26]], patchy(x, y, 311));
  // Needles and leaf litter: short lighter and darker strokes.
  const litter = hash2((x + (y >> 1)) >> 1, y, 312);
  if (litter > 0.86) c = [168, 122, 62];
  else if (litter < 0.08) c = [58, 38, 22];
  return jitter(c, 4, r);
};
PAINTERS.podzol_side = turfSide((x, y, r) => PAINTERS.podzol_top(x, y, r) as RGB, 313);
PAINTERS.mud = (x, y, r) => {
  const n = patchy(x, y, 321);
  let c = pickTone<RGB>([[84, 66, 50], [74, 58, 44], [64, 50, 38], [92, 74, 58]], n);
  // Wet sheen along the ripples.
  const sheen = Math.sin((x * 0.6 + y * 0.9) + vnoise(x, y, 6, 322) * 5);
  if (sheen > 0.93) c = [112, 94, 76];
  return jitter(c, 2, r);
};
PAINTERS.clay = (x, y, r) => {
  const c = pickTone<RGB>([[166, 172, 186], [156, 162, 178], [146, 152, 168], [172, 178, 192]], patchy(x, y, 331));
  const streak = hash2(x >> 2, y, 332) > 0.9 ? 0.92 : 1;
  return jitter(shade(c, streak), 2, r);
};
PAINTERS.red_sand = (x, y, r) => {
  let c = pickTone<RGB>([[206, 118, 58], [196, 106, 50], [184, 96, 44], [172, 88, 40]], patchy(x, y, 341));
  const wave = Math.sin(y * 0.785 + vnoise(x, y, 8, 342) * 4);
  if (wave > 0.82) c = shade(c, 0.92);
  else if (wave < -0.9) c = shade(c, 1.07);
  const p = r();
  if (p > 0.95) c = add(c, -14);
  else if (p < 0.03) c = add(c, 14);
  return c;
};
PAINTERS.red_sandstone_top = (x, y, r) => {
  const c = pickTone<RGB>([[190, 98, 46], [182, 92, 42], [174, 86, 40], [196, 104, 50]], patchy(x, y, 351));
  const rim = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 6.5 ? 0.9 : 1;
  return jitter(shade(c, rim), 3, r);
};
PAINTERS.red_sandstone_side = (x, y, r) => {
  const band = y % 8;
  const c = pickTone<RGB>([[194, 100, 48], [184, 92, 44], [176, 86, 40]], patchy(x, y, 361));
  if (y === 0) return jitter(shade(c, 1.12), 3, r);
  if (band === 7) return jitter(shade(c, 0.74), 3, r);
  if (band === 6) return jitter(shade(c, 0.9), 3, r);
  return jitter(c, 4, r);
};
PAINTERS.packed_ice = (x, y, r) => {
  let c = pickTone<RGB>([[150, 184, 240], [136, 172, 234], [122, 158, 226], [160, 194, 246]], patchy(x, y, 371));
  // Long pale streaks and a few dark fractures, slanting down to the right.
  const streak = (x * 2 + y * 3 + Math.floor(vnoise(x, y, 8, 372) * 6)) % 11;
  if (streak === 0) c = mixRGB(c, [226, 240, 255], 0.55);
  else if (streak === 1) c = mixRGB(c, [226, 240, 255], 0.2);
  if (hash2(x, y, 373) > 0.96) c = shade(c, 0.78);
  return jitter(c, 3, r);
};

// ---- the deep ----
PAINTERS.deepslate = (x, y, r) => {
  // Strata: each row has its own darkness, with broad patches across.
  const row = hash2(0, y, 381);
  let c = pickTone<RGB>([[84, 84, 92], [72, 72, 80], [62, 62, 70], [52, 52, 60]], patchy(x, y, 382) * 0.7 + row * 0.3);
  if (hash2(x >> 2, y, 383) > 0.93) c = shade(c, 1.2);
  if (row > 0.85) c = shade(c, 0.82);
  return jitter(c, 3, r);
};
PAINTERS.cobbled_deepslate = (x, y, r) => {
  const c = voronoi(x, y, 4, 391);
  if (c.d2 - c.d1 < 0.85) return jitter([38, 38, 46], 4, r);
  const base = pickTone<RGB>([[84, 84, 94], [70, 72, 82], [78, 78, 86], [62, 64, 74], [90, 90, 98]], c.id);
  const lit = x + 0.5 - c.px + (y + 0.5 - c.py);
  return jitter(shade(base, lit < -1.6 ? 1.15 : lit > 1.8 ? 0.8 : 1), 4, r);
};
PAINTERS.tuff = (x, y, r) => {
  let c = pickTone<RGB>([[116, 114, 102], [106, 104, 94], [96, 94, 86], [124, 122, 110]], patchy(x, y, 401));
  const mot = vnoise(x, y, 4, 402);
  if (mot > 0.7) c = mixRGB(c, [104, 112, 88], 0.55); // a greenish mottling
  else if (mot < 0.22) c = mixRGB(c, [140, 134, 120], 0.4);
  if (hash2(x, y, 403) > 0.97) c = shade(c, 0.78);
  return jitter(c, 3, r);
};

// ---- fungi ----
PAINTERS.mycelium_top = (x, y, r) => {
  let c = pickTone<RGB>([[124, 106, 130], [110, 94, 118], [98, 84, 106], [86, 72, 94]], patchy(x, y, 411));
  const spore = hash2(x, y, 412);
  if (spore > 0.9) c = [178, 156, 184];
  else if (spore < 0.06) c = [64, 52, 72];
  return jitter(c, 4, r);
};
PAINTERS.mycelium_side = turfSide((x, y, r) => PAINTERS.mycelium_top(x, y, r) as RGB, 413);
PAINTERS.mushroom_stem = (x, y, r) => {
  const c = pickTone<RGB>([[234, 228, 210], [222, 216, 198], [208, 202, 184]], hash2(x, 0, 421) * 0.6 + vnoise(x, y, 6, 422) * 0.4);
  return jitter(shade(c, x % 4 === 0 ? 0.9 : 1), 3, r);
};
PAINTERS.red_mushroom_block = (x, y, r) => {
  const c = voronoi(x, y, 3, 431);
  const base = pickTone<RGB>([[200, 44, 40], [188, 36, 36], [174, 30, 32]], patchy(x, y, 432));
  // Pale spots the size of a few pixels.
  if (c.d1 < 1.45 && c.id > 0.4) return jitter([236, 228, 214], 4, r);
  return jitter(base, 4, r);
};
PAINTERS.brown_mushroom_block = (x, y, r) => {
  const c = voronoi(x, y, 3, 441);
  const base = pickTone<RGB>([[160, 118, 90], [148, 106, 80], [136, 96, 72]], patchy(x, y, 442));
  if (c.d1 < 1.5 && c.id > 0.45) return jitter([206, 176, 146], 4, r);
  return jitter(base, 4, r);
};

// ---- baked clay ----
const clayPainter = (base: RGB, seed: number): Painter => (x, y, r) => {
  const n = patchy(x, y, seed);
  const c = shade(base, 0.93 + n * 0.14);
  return jitter(c, 2.5, r);
};
PAINTERS.terracotta = clayPainter([152, 94, 68], 451);
PAINTERS.terracotta_orange = clayPainter([164, 84, 38], 452);
PAINTERS.terracotta_yellow = clayPainter([188, 134, 36], 453);
PAINTERS.terracotta_red = clayPainter([144, 62, 46], 454);
PAINTERS.terracotta_white = clayPainter([210, 178, 160], 455);
PAINTERS.terracotta_brown = clayPainter([84, 56, 40], 456);
PAINTERS.terracotta_light_gray = clayPainter([136, 108, 98], 457);

// ---- the caves ----
PAINTERS.moss_block = (x, y, r) => {
  let c = pickTone<RGB>([[92, 118, 44], [82, 106, 38], [104, 130, 52], [72, 94, 34]], patchy(x, y, 461));
  // Soft tufts: short lighter strokes and a few dark hollows.
  const tuft = hash2(x, y >> 1, 462);
  if (tuft > 0.9) c = mixRGB(c, [150, 176, 84], 0.55);
  else if (tuft < 0.07) c = shade(c, 0.78);
  return jitter(c, 4, r);
};
PAINTERS.dripstone_block = (x, y, r) => {
  const row = hash2(0, y >> 1, 471);
  let c = pickTone<RGB>([[140, 116, 98], [130, 106, 90], [118, 96, 82], [150, 124, 104]], patchy(x, y, 472) * 0.6 + row * 0.4);
  // Dripping streaks: a pale line running down some columns.
  if (hash2(x, 0, 473) > 0.82 && y % 7 < 5) c = shade(c, 1.12);
  if (hash2(x, y, 474) > 0.96) c = shade(c, 0.8);
  return jitter(c, 3, r);
};
const AMETHYST_TONES: RGB[] = [[132, 92, 196], [150, 108, 214], [118, 78, 178], [168, 126, 228]];
PAINTERS.amethyst_block = (x, y, r) => {
  const c = voronoi(x, y, 5, 481);
  if (c.d2 - c.d1 < 0.7) return jitter([86, 54, 138], 4, r);
  const base = pickTone<RGB>(AMETHYST_TONES, c.id);
  // Each facet is lit on its upper left edge and shaded on its lower right edge.
  const lit = x + 0.5 - c.px + (y + 0.5 - c.py);
  return jitter(shade(base, lit < -1.4 ? 1.22 : lit > 1.6 ? 0.8 : 1), 4, r);
};
PAINTERS.budding_amethyst = (x, y, r) => {
  const base = PAINTERS.amethyst_block(x, y, r) as RGB;
  // The buds: small dark pits ringed with a bright crystal tip, the spot where clusters sprout.
  const b = voronoi(x, y, 8, 485);
  if (b.d1 < 0.9) return jitter([58, 34, 98], 3, r);
  if (b.d1 < 1.7 && b.id > 0.3) return shade(base, 1.28);
  return base;
};
PAINTERS.calcite = (x, y, r) => {
  let c = pickTone<RGB>([[232, 230, 220], [222, 220, 210], [212, 210, 200], [238, 236, 228]], patchy(x, y, 491));
  const crack = (x * 2 + y + Math.floor(vnoise(x, y, 6, 492) * 5)) % 13;
  if (crack === 0) c = shade(c, 0.86);
  return jitter(c, 3, r);
};
PAINTERS.smooth_basalt = (x, y, r) => {
  const row = hash2(0, y, 501);
  const c = pickTone<RGB>([[66, 64, 72], [58, 56, 64], [52, 50, 58], [72, 70, 78]], patchy(x, y, 502) * 0.7 + row * 0.3);
  return jitter(c, 2, r);
};
PAINTERS.sculk = (x, y, r) => {
  // A near-black base with tendrils of glowing teal wandering over it.
  const n = vnoise(x, y, 5, 511) + vnoise(x, y, 3, 512) * 0.6;
  const vein = Math.abs(n - 0.8);
  if (vein < 0.07) return jitter([46, 214, 196], 8, r);
  if (vein < 0.14) return jitter([24, 110, 112], 4, r);
  const base = pickTone<RGB>([[14, 24, 32], [18, 30, 40], [10, 18, 26], [22, 36, 46]], patchy(x, y, 513));
  if (hash2(x, y, 514) > 0.97) return [60, 226, 206];
  return jitter(base, 2, r);
};

// ---- gourds ----
PAINTERS.pumpkin_top = (x, y, r) => {
  const dx = x - 7.5;
  const dy = y - 7.5;
  if (Math.abs(dx) < 1.6 && Math.abs(dy) < 1.6) return jitter([88, 110, 40], 4, r); // the stalk
  const rib = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8);
  const c = pickTone<RGB>([[224, 136, 28], [212, 122, 24], [200, 112, 22]], (rib % 3) / 3);
  return jitter(Math.hypot(dx, dy) > 6.8 ? shade(c, 0.8) : c, 4, r);
};
PAINTERS.pumpkin_side = (x, y, r) => {
  const c = pickTone<RGB>([[226, 140, 30], [214, 126, 26], [196, 110, 22], [210, 122, 24]], [0, 1, 2, 3, 2, 1, 0, 1][x % 8] / 3.01);
  if (x % 8 === 0) return jitter(shade(c, 0.74), 3, r); // the groove between ribs
  return jitter(shade(c, y < 2 ? 0.86 : y > 13 ? 0.84 : 1), 4, r);
};
PAINTERS.melon_top = (x, y, r) => {
  const dx = x - 7.5;
  const dy = y - 7.5;
  if (Math.abs(dx) < 1.2 && Math.abs(dy) < 1.2) return jitter([96, 116, 44], 4, r);
  const stripe = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 10) % 2;
  return jitter(stripe ? [102, 150, 48] : [64, 116, 40], 4, r);
};
PAINTERS.melon_side = (x, y, r) => {
  const s = x % 6;
  const c: RGB = s < 2 ? [60, 112, 38] : s === 2 ? [96, 144, 46] : [110, 160, 52];
  return jitter(shade(c, y % 8 === 0 ? 0.88 : 1), 5, r);
};

// ---- the other trees ----
PAINTERS.acacia_log_side = barkSide([[132, 122, 112], [118, 108, 98], [104, 94, 86], [88, 78, 72]], 461);
PAINTERS.acacia_log_top = ringsTop([104, 94, 86], [[194, 110, 62], [180, 98, 54], [188, 104, 58], [168, 90, 50]], 462);
PAINTERS.acacia_leaves = leafPainter([[104, 170, 52], [88, 150, 42], [72, 128, 34], [52, 100, 26]], 250, 463, 0.1);
PAINTERS.jungle_log_side = barkSide([[104, 86, 46], [88, 72, 38], [74, 58, 30], [58, 46, 24]], 471);
PAINTERS.jungle_log_top = ringsTop([74, 58, 30], [[176, 134, 82], [162, 122, 72], [170, 128, 76], [150, 112, 64]], 472);
PAINTERS.jungle_leaves = leafPainter([[60, 164, 46], [46, 144, 36], [34, 120, 30], [22, 94, 22]], 250, 473, 0.12);
PAINTERS.dark_oak_log_side = barkSide([[70, 48, 28], [58, 40, 24], [48, 32, 20], [36, 24, 15]], 481);
PAINTERS.dark_oak_log_top = ringsTop([48, 32, 20], [[120, 86, 48], [106, 74, 40], [114, 80, 44], [98, 68, 36]], 482);
PAINTERS.dark_oak_leaves = leafPainter([[62, 140, 40], [48, 118, 32], [36, 96, 26], [24, 72, 18]], 250, 483, 0.07);
PAINTERS.cherry_log_side = barkSide([[104, 62, 72], [90, 52, 62], [76, 44, 52], [60, 34, 42]], 491);
PAINTERS.cherry_log_top = ringsTop([76, 44, 52], [[230, 178, 168], [218, 164, 156], [224, 170, 162], [206, 152, 146]], 492);
PAINTERS.cherry_leaves = leafPainter([[252, 196, 214], [244, 172, 198], [232, 148, 180], [214, 124, 158]], 255, 493, 0.14);

// ---- soft things ----
const woolPainter = (c: RGB): Painter => (x, y, r) => {
  const t = vnoise(x, y, 2, 191) * 0.6 + r() * 0.4;
  return shade(c, 0.9 + t * 0.2);
};
PAINTERS.wool = woolPainter([238, 238, 234]);
DYE_NAMES.forEach((n, i) => {
  if (i === 0) return;
  PAINTERS[`wool_${n}`] = woolPainter(DYE_RGB[i] as RGB);
});
PAINTERS.water = (x, y) => {
  const j = (vnoise(x, y, 4, 201) - 0.5) * 30 + (vnoise(x, y, 2, 202) - 0.5) * 14;
  return [40 + j * 0.5, 92 + j * 0.9, 206 + j * 0.7, 175];
};
PAINTERS.ice = (x, y, r) => {
  const streak = vnoise(x, y, 8, 211);
  const crack = Math.abs(vnoise(x, y, 6, 212) - 0.5) < 0.03;
  const j = (streak - 0.5) * 26 + (r() - 0.5) * 6;
  return crack ? [222, 242, 255, 200] : [158 + j, 204 + j, 248 + j * 0.4, 168];
};
PAINTERS.sandstone_top = (x, y, r) => PAINTERS.sand(x, y, r);
PAINTERS.sandstone_side = (x, y, r) => {
  const base = pickTone<RGB>([[228, 214, 166], [221, 207, 160], [214, 199, 152]], patchy(x, y, 221));
  if (y === 0 || y === 15) return jitter([196, 180, 132], 4, r);
  if (y === 1) return jitter(shade(base, 1.05), 3, r);
  if (y === 4 || y === 5) return jitter([190, 170, 122], 4, r);
  if (y >= 9 && y <= 10 && (x * 3 + y) % 4 !== 0) return jitter([204, 188, 142], 4, r);
  return jitter(base, 4, r);
};

// ---- the Dawnwatch waystone: dark slate cut with glowing golden runes ----
const WAY_SLATE: RGB[] = [[58, 62, 78], [50, 54, 70], [42, 46, 60], [66, 70, 88]];
const WAY_GOLD: RGB = [255, 214, 104];
const waySlate = (x: number, y: number, r: () => number): RGB => {
  const c = voronoi(x, y, 4, 311);
  if (c.d2 - c.d1 < 0.8) return jitter([26, 28, 38], 4, r);
  return jitter(shade(pickTone(WAY_SLATE, c.id), x + 0.5 - c.px + (y + 0.5 - c.py) < -1.4 ? 1.14 : 1), 4, r);
};
PAINTERS.waystone_side = (x, y, r) => {
  const edgeCol = x === 0 || x === 15;
  if (edgeCol) return jitter([30, 32, 44], 3, r);
  // A column of runes down the middle: short bars and ticks that glow, with a halo of warm stone round them.
  const glyph = [
    '.XX.', 'X..X', '.XX.', '....', 'XXXX', '.XX.', '....', 'X.XX', '.XX.', '....', 'XXXX', 'X..X', '....', '.XX.', 'X..X', '....',
  ][y];
  if (x >= 6 && x <= 9 && glyph[x - 6] === 'X') return jitter(WAY_GOLD, 8, r);
  if (x >= 5 && x <= 10 && y >= 0) {
    const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => {
      const gx = x + dx - 6;
      const gy = y + dy;
      return gx >= 0 && gx <= 3 && gy >= 0 && gy <= 15 && ['.XX.', 'X..X', '.XX.', '....', 'XXXX', '.XX.', '....', 'X.XX', '.XX.', '....', 'XXXX', 'X..X', '....', '.XX.', 'X..X', '....'][gy][gx] === 'X';
    }));
    if (near) return mixRGB(waySlate(x, y, r), [196, 150, 70], 0.42);
  }
  return waySlate(x, y, r);
};
PAINTERS.waystone_top = (x, y, r) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  if (d < 1.9) return jitter([255, 244, 190], 6, r);
  if (d > 4.6 && d < 5.9) return jitter(WAY_GOLD, 10, r);
  if (d >= 1.9 && d <= 4.6) return mixRGB(waySlate(x, y, r), [220, 170, 80], 0.5 - d * 0.07);
  return waySlate(x, y, r);
};

// ======================================================================================================

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// ---- crafted blocks: richer wood, metal and glow ----
const WOOD_TONES: RGB[] = [[176, 128, 70], [164, 116, 62], [152, 106, 56], [140, 96, 50]];
const IRON: RGB = [92, 94, 104];
const GOLD: RGB = [236, 192, 72];
/** Wood with long grain running along x (rows) or y (columns), a few darker streaks and the odd knot. */
const grainWood = (x: number, y: number, r: () => number, alongX: boolean, seed: number): RGB => {
  const u = alongX ? y : x;
  const v = alongX ? x : y;
  let c = pickTone(WOOD_TONES, hash2(u, 0, seed) * 0.6 + vnoise(x, y, alongX ? 8 : 4, seed + 1) * 0.4);
  if (hash2(u, v >> 2, seed + 2) > 0.82) c = shade(c, 0.88); // a streak
  if (hash2(x, y, seed + 3) > 0.985) c = shade(c, 0.7); // a knot
  return jitter(c, 3, r);
};
/** A rectangular inset: dark on its top-left rim, light on the bottom-right, so it reads as a sunk panel. */
const inset = (c: RGB, x: number, y: number, x0: number, y0: number, x1: number, y1: number): RGB | null => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return null;
  if (x === x0 || y === y0) return shade(c, 0.74);
  if (x === x1 || y === y1) return shade(c, 1.14);
  return shade(c, 0.97);
};

PAINTERS.crafting_top = (x, y, r) => {
  const wood = grainWood(x, y, r, true, 401);
  if (edge(x, y)) return shade(wood, 0.62);
  if (x === 1 || y === 1 || x === 14 || y === 14) return shade(wood, 0.8);
  // Four work squares with a cross of darker strips between them.
  if (x === 7 || x === 8 || y === 7 || y === 8) return shade(wood, 0.72);
  return inset(wood, x, y, 2, 2, 6, 6) ?? inset(wood, x, y, 9, 2, 13, 6) ?? inset(wood, x, y, 2, 9, 6, 13) ?? inset(wood, x, y, 9, 9, 13, 13) ?? wood;
};
PAINTERS.crafting_side = (x, y, r) => {
  const wood = grainWood(x, y, r, true, 402);
  if (y < 3) return y === 2 ? shade(wood, 0.6) : shade(wood, 0.82); // the table lip and its shadow
  if (x === 0 || x === 15) return shade(wood, 0.7);
  if (y >= 5 && y <= 12 && (x === 3 || x === 4)) return x === 3 ? [226, 230, 238] : [150, 156, 168]; // saw blade
  if (y === 13 && (x === 3 || x === 4)) return [110, 74, 40];
  if (y >= 5 && y <= 6 && x >= 9 && x <= 12) return y === 5 ? [150, 150, 158] : [84, 84, 92]; // hammer head
  if (y >= 7 && y <= 12 && x === 10) return [124, 86, 44];
  return wood;
};
PAINTERS.furnace_top = (x, y, r) => {
  const c = PAINTERS.cobble(x, y, r) as RGB;
  if (edge(x, y)) return shade(c, 0.7);
  if (x >= 4 && x <= 11 && y >= 4 && y <= 11) {
    if (x === 4 || y === 4) return [18, 18, 20];
    if (x === 11 || y === 11) return [74, 74, 80];
    return jitter([38, 36, 40], 4, r);
  }
  return c;
};
PAINTERS.furnace_side = (x, y, r) => {
  const c = PAINTERS.cobble(x, y, r) as RGB;
  if (x >= 4 && x <= 11 && y >= 7 && y <= 12) {
    // The fire box: a dark mouth with a dull ember glow at its foot and iron bars across.
    if (y === 12) return jitter([188, 78, 22], 12, r);
    if (y === 11 && hash2(x, y, 411) > 0.4) return jitter([120, 50, 20], 8, r);
    if (x === 7 || x === 8) return jitter([60, 60, 66], 4, r);
    return jitter([22, 20, 22], 4, r);
  }
  if (x >= 3 && x <= 12 && y >= 6 && y <= 13) {
    // Iron frame, lit top-left.
    return y === 6 || x === 3 ? shade(IRON, 1.15) : shade(IRON, 0.72);
  }
  if (x >= 5 && x <= 10 && y >= 2 && y <= 3) return y === 2 ? jitter([14, 14, 16], 3, r) : jitter([40, 40, 46], 4, r); // vent
  return c;
};
PAINTERS.chest_top = (x, y, r) => {
  const wood = grainWood(x, y, r, false, 421);
  if (edge(x, y)) return shade(wood, 0.58);
  if (x === 1 || y === 1 || x === 14 || y === 14) return shade(wood, 0.85);
  if (x === 5 || x === 10) return x === 5 ? shade(IRON, 1.1) : shade(IRON, 0.8); // lid bands
  return wood;
};
PAINTERS.chest_side = (x, y, r) => {
  const wood = grainWood(x, y, r, true, 422);
  if (x === 0 || x === 15 || y === 15) return shade(wood, 0.58);
  if (y === 14) return shade(wood, 0.82);
  if (y === 5 || y === 6) return y === 5 ? shade(wood, 0.5) : shade(wood, 0.85); // the lid seam and its lip
  // Iron straps down the sides, a gold latch with a bright top.
  if ((x === 2 || x === 3 || x === 12 || x === 13) && y > 0) return x === 2 || x === 12 ? shade(IRON, 1.15) : shade(IRON, 0.8);
  if (x >= 7 && x <= 8 && y >= 4 && y <= 8) return y === 4 ? shade(GOLD, 1.12) : y === 8 ? shade(GOLD, 0.7) : GOLD;
  return wood;
};
PAINTERS.bookshelf = (x, y, r) => {
  const wood = grainWood(x, y, r, true, 431);
  if (y < 2 || y > 13 || (y >= 7 && y <= 8)) return shade(wood, y === 0 || y === 15 || y === 7 ? 0.62 : 0.86);
  // Two rows of books, each with a spine of its own colour, a lit edge, a shaded edge and the odd gold title band.
  const row = y < 7 ? 0 : 1;
  const colours: RGB[] = [[158, 44, 44], [48, 86, 170], [56, 140, 72], [176, 128, 44], [112, 58, 148], [128, 76, 40], [36, 120, 130]];
  const slot = Math.floor((x + row * 2) / 3);
  const c = colours[(slot * 5 + row * 3) % colours.length];
  const edgeX = (x + row * 2) % 3;
  if (edgeX === 2) return shade(c, 0.4);
  const top = y === (row === 0 ? 2 : 9);
  if (top) return shade(c, 1.35);
  if (edgeX === 0 && hash2(slot, row, 432) > 0.5 && (y === 4 || y === 11)) return shade(GOLD, 1.0);
  return jitter(edgeX === 0 ? shade(c, 1.12) : c, 5, r);
};
const DOOR_TONES: RGB[] = [[170, 120, 64], [160, 112, 58], [150, 104, 54]];
const doorWood2 = (x: number, y: number, r: () => number, seed: number): RGB => {
  let c = pickTone(DOOR_TONES, hash2(x >> 2, 0, seed) * 0.7 + hash2(x, y >> 3, seed + 1) * 0.3);
  if (x % 4 === 3) c = shade(c, 0.74); // seam between boards
  else if (x % 4 === 0) c = shade(c, 1.08);
  return jitter(c, 3, r);
};
PAINTERS.door_lower = (x, y, r) => {
  const wood = doorWood2(x, y, r, 441);
  if (x === 0 || x === 15 || y === 15 || y === 0) return shade(wood, 0.62);
  if ((x === 12 || x === 13) && (y === 2 || y === 3)) return y === 2 ? shade(GOLD, 1.2) : shade(GOLD, 0.72); // brass knob
  return inset(wood, x, y, 2, 2, 13, 6) ?? inset(wood, x, y, 2, 9, 13, 13) ?? wood;
};
PAINTERS.door_upper = (x, y, r) => {
  const wood = doorWood2(x, y, r, 442);
  if (x === 0 || x === 15 || y === 0) return shade(wood, 0.62);
  if (y === 15) return shade(wood, 0.8);
  // Four small panes of dark glass set in the wood.
  const pane = (x0: number, x1: number): RGB | null => {
    if (x < x0 || x > x1 || y < 3 || y > 6) return null;
    if (x === x0 || y === 3) return [20, 14, 10];
    return (x + y) % 5 === 0 ? [92, 112, 126] : [44, 52, 62];
  };
  return pane(2, 6) ?? pane(9, 13) ?? inset(wood, x, y, 2, 9, 13, 14) ?? wood;
};
PAINTERS.trapdoor = (x, y, r) => {
  const wood = grainWood(x, y, r, true, 451);
  if (edge(x, y)) return shade(wood, 0.58);
  if (y % 4 === 3) return shade(wood, 0.68); // gaps between the slats
  if (y % 4 === 0) return shade(wood, 1.1);
  if ((x === 2 || x === 13) && y > 0) return shade(IRON, 1.0); // hinge straps
  if (x === 7 && y >= 6 && y <= 9) return y === 6 ? [230, 232, 238] : [150, 154, 164]; // handle
  return wood;
};
const GRADE_SAT = 1.18;
const GRADE_CONTRAST = 1.06;
/** Tiles whose colours are already tuned (or must stay neutral): glowing things, water and ice. */
const UNGRADED_TILES = new Set(['dripstone_block', 'waystone_top', 'waystone_side', 'lava', 'glowstone', 'water', 'ice', 'snow', 'packed_ice', 'wool', 'bedrock', 'redstone_lamp_on', 'fire_0', 'fire_1', 'fire_2', 'fire_3', 'torch_flame_0', 'torch_flame_1', 'torch_flame_2', 'torch_flame_3', 'glass']);
/** Plain cube tiles that get a one-pixel edge highlight and shadow. */
const BEVELED_TILES = new Set(['stone', 'cobble', 'mossy_cobble', 'dirt', 'sand', 'gravel', 'stone_bricks', 'planks', 'obsidian', 'granite', 'diorite', 'andesite', 'sandstone_top',
  'coarse_dirt', 'mud', 'clay', 'red_sand', 'red_sandstone_top', 'deepslate', 'cobbled_deepslate', 'tuff', 'terracotta', 'terracotta_orange', 'terracotta_yellow', 'terracotta_red', 'terracotta_white', 'terracotta_brown', 'terracotta_light_gray',
  'dripstone_block', 'amethyst_block', 'budding_amethyst', 'calcite', 'smooth_basalt',
  'crafting_top', 'furnace_top', 'chest_top', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'lapis_ore', 'emerald_ore', 'redstone_ore']);

for (const [name, rgb] of Object.entries(MASONRY_TILE_RGB)) {
  PAINTERS[name] = (x, y, r) => {
    const mortar = name.includes('brick') && (y % 4 === 3 || (Math.floor(y / 4) % 2 === 0 ? x % 8 === 7 : x % 8 === 3));
    if (mortar) return jitter([rgb[0] * 0.55, rgb[1] * 0.55, rgb[2] * 0.55], 6, r);
    return jitter(rgb, 8, r);
  };
  BEVELED_TILES.add(name);
}

for (const [name, rgb] of [...Object.entries(JOINERY_TILE_RGB), ...Object.entries(GROVE_TILE_RGB)]) {
  const tone: RGB = [rgb[0], rgb[1], rgb[2]];
  const scale = (k: number): RGB => [tone[0] * k, tone[1] * k, tone[2] * k];
  const clear: [number, number, number, number] = [0, 0, 0, 0];
  if (name === 'bamboo') {
    PAINTERS[name] = (x, y, r) => (x >= 6 && x <= 9 ? jitter(y % 5 === 4 ? scale(0.72) : tone, 5, r) : clear);
  } else if (name === 'hanging_roots' || name === 'pale_hanging_moss') {
    PAINTERS[name] = (x, y, r) => ((x % 4 === 1 || x % 4 === 2) && y > 1 ? jitter(tone, 6, r) : clear);
  } else if (name.endsWith('_leaves')) {
    PAINTERS[name] = (x, y, r) => {
      if (name.includes('flower') && (x + y) % 6 === 0) return [220, 140, 170];
      return jitter((x * 3 + y * 5) % 7 === 0 ? scale(0.72) : tone, 10, r);
    };
  } else if (name.endsWith('_sapling') || name === 'mangrove_propagule' || name === 'azalea') {
    PAINTERS[name] = () => clear;
  } else if (name.includes('mosaic')) {
    PAINTERS[name] = (x, y, r) => jitter((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? tone : scale(0.82), 5, r);
    BEVELED_TILES.add(name);
  } else if (name.endsWith('_door_lower') || name.endsWith('_door_upper')) {
    const upper = name.endsWith('_door_upper');
    const iron = name.startsWith('iron');
    PAINTERS[name] = (x, y, r) => {
      let c = tone;
      if (iron) {
        if (x % 5 === 4 || y % 5 === 4) c = scale(0.72);
      } else if (x % 4 === 3) c = scale(0.74);
      else if (x % 4 === 0) c = scale(1.08);
      if (x === 0 || x === 15 || y === 0 || y === 15) return jitter(scale(0.62), 4, r);
      if (!upper && !iron && (x === 12 || x === 13) && (y === 2 || y === 3)) return y === 2 ? [230, 190, 70] : [160, 120, 40];
      return jitter(c, 4, r);
    };
  } else if (name.endsWith('_trapdoor')) {
    const iron = name.startsWith('iron');
    PAINTERS[name] = (x, y, r) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return jitter(scale(0.58), 3, r);
      if (!iron && y % 4 === 3) return jitter(scale(0.68), 3, r);
      if (!iron && (x === 2 || x === 13)) return [150, 154, 164];
      if (iron && (x % 4 === 0 || y % 4 === 0)) return jitter(scale(0.7), 3, r);
      return jitter(tone, 4, r);
    };
  } else if (name.endsWith('_fence') || name.endsWith('_gate')) {
    const gate = name.endsWith('_gate');
    PAINTERS[name] = (x, y) => {
      const post = (x >= 2 && x <= 4) || (x >= 11 && x <= 13);
      const rail = !gate && (y === 5 || y === 6 || y === 10 || y === 11) && x >= 4 && x <= 11;
      const leaf = gate && y >= 4 && y <= 12 && x >= 5 && x <= 10 && x !== 7 && x !== 8;
      return post || rail || leaf ? tone : clear;
    };
  } else if (name.endsWith('_button')) {
    PAINTERS[name] = (x, y) => (x >= 4 && x <= 11 && y >= 5 && y <= 10 ? tone : clear);
  } else if (name.endsWith('_plate') && name !== 'heavy_plate' && name !== 'light_plate') {
    PAINTERS[name] = (x, y) => (y >= 11 && y <= 13 && x >= 1 && x <= 14 ? tone : clear);
  } else if (name.endsWith('_stem_side') || name.endsWith('_bark')) {
    PAINTERS[name] = (x, y, r) => jitter(x % 4 === 0 ? scale(0.75) : tone, 6, r);
    BEVELED_TILES.add(name);
  } else if (name.endsWith('_log_top') || name.endsWith('_stem_top')) {
    PAINTERS[name] = (x, y, r) => {
      const ring = Math.hypot(x - 7.5, y - 7.5);
      return jitter(Math.floor(ring) % 3 === 0 ? scale(0.82) : tone, 5, r);
    };
  } else {
    PAINTERS[name] = (_x, _y, r) => jitter(tone, 8, r);
    BEVELED_TILES.add(name);
  }
}

for (const [name, rgb] of Object.entries(DRESS_TILE_RGB)) {
  const tone: RGB = [rgb[0], rgb[1], rgb[2]];
  const scale = (k: number): RGB => [tone[0] * k, tone[1] * k, tone[2] * k];
  const clear: [number, number, number, number] = [0, 0, 0, 0];
  if (name === 'iron_bars') {
    PAINTERS[name] = (x, y) => {
      const bar = x === 2 || x === 3 || x === 7 || x === 8 || x === 12 || x === 13;
      const rail = (y === 3 || y === 4 || y === 11 || y === 12) && x > 1 && x < 14;
      if (bar && (y === 1 || y === 14)) return [150, 154, 162];
      return bar || rail ? [186, 190, 198] : clear;
    };
  } else if (name.startsWith('stained_')) {
    PAINTERS[name] = (x, y, r) => glassSheet(x, y, r, tone, true);
    UNGRADED_TILES.add(name);
  } else if (name.startsWith('candle') || name.startsWith('banner_')) {
    PAINTERS[name] = () => clear;
  } else if (name.startsWith('glazed_')) {
    PAINTERS[name] = (x, y, r) => {
      const ring = Math.abs(Math.hypot(x - 7.5, y - 7.5) - 4.5) < 1.15;
      const corner = (x < 3 && y < 3) || (x > 12 && y > 12);
      return jitter(ring || corner ? scale(1.28) : scale(0.78), 4, r);
    };
    BEVELED_TILES.add(name);
  } else if (name.startsWith('concrete_')) {
    PAINTERS[name] = (x, y, r) => jitter((x + y) % 5 === 0 ? scale(0.9) : tone, 5, r);
    BEVELED_TILES.add(name);
  } else if (name.startsWith('terracotta_')) {
    PAINTERS[name] = (x, y, r) => jitter((x * 3 + y * 5) % 7 === 0 ? scale(0.82) : tone, 8, r);
    BEVELED_TILES.add(name);
  } else if (name.endsWith('_sign')) {
    PAINTERS[name] = (x, y, r) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return jitter(scale(0.55), 3, r);
      if (y === 5 || y === 8 || y === 11) return jitter(scale(0.72), 3, r);
      return jitter(tone, 4, r);
    };
  } else if (name === 'cracked_stone_bricks' || name === 'chiseled_stone_bricks') {
    PAINTERS[name] = (x, y, r) => {
      const c = PAINTERS.stone_bricks(x, y, r) as RGB;
      const crack = name.startsWith('cracked_') && Math.abs(x - (3 + ((y * 3) % 9))) <= 0 && y > 1 && y < 14;
      const frame = name.startsWith('chiseled_') && (x < 2 || y < 2 || x > 13 || y > 13 || ((x === 5 || x === 10 || y === 5 || y === 10) && x > 4 && x < 11 && y > 4 && y < 11));
      return crack || frame ? [c[0] * 0.45, c[1] * 0.45, c[2] * 0.45] : c;
    };
    BEVELED_TILES.add(name);
  } else if (name === 'cracked_deepslate_bricks' || name === 'chiseled_deepslate') {
    PAINTERS[name] = (x, y, r) => {
      const c = PAINTERS.deepslate_bricks(x, y, r) as RGB;
      const crack = name.startsWith('cracked_') && Math.abs(x + y - 15) <= 1;
      const frame = name.startsWith('chiseled_') && (x < 2 || y < 2 || x > 13 || y > 13 || ((x === 5 || x === 10 || y === 5 || y === 10) && x > 4 && x < 11 && y > 4 && y < 11));
      return crack || frame ? [c[0] * 0.4, c[1] * 0.4, c[2] * 0.4] : c;
    };
    BEVELED_TILES.add(name);
  } else if (name === 'flower_pot') {
    PAINTERS[name] = (x, y, r) => jitter((x + y) % 4 === 0 ? scale(0.8) : tone, 6, r);
    BEVELED_TILES.add(name);
  } else {
    PAINTERS[name] = (_x, _y, r) => jitter(tone, 6, r);
    BEVELED_TILES.add(name);
  }
}

PAINTERS.nether_bricks = (x, y, r) => {
  const row = y >> 2;
  const bx = (x + (row % 2) * 4) % 8;
  const mortar = y % 4 === 3 || bx === 7;
  return mortar ? jitter([28, 10, 12], 4, r) : jitter([62, 24, 28], 8, r);
};
BEVELED_TILES.add('nether_bricks');
PAINTERS.quartz_block = (x, y, r) => {
  const edge = x === 0 || y === 0 || x === 15 || y === 15;
  return jitter(edge ? [210, 204, 196] : [236, 232, 226], 4, r);
};
BEVELED_TILES.add('quartz_block');
PAINTERS.quartz_pillar = (x, y, r) => jitter(x % 4 === 3 ? [198, 194, 186] : [234, 230, 222], 3, r);

// The World Beyond: stones, woods, crystals, corals and glowing plants drawn from their data (beyondTiles.ts).
Object.assign(PAINTERS, beyondPainters());
for (const name of beyondBeveledTiles()) BEVELED_TILES.add(name);
for (const name of beyondUngradedTiles()) UNGRADED_TILES.add(name);

// The hero tiles (grass and the earth under it, see heroTiles.ts) are drawn large for the terrain shader; the 16 x 16 atlas holds them boxed down.
for (const name of HERO_TILES) {
  // (the plants are drawn large for the world only: the hotbar, the particles and the plant in the hand keep their 16 x 16 pictures)
  if (PLANT_TILES.has(name)) continue;
  PAINTERS[name] = (x, y) => heroDownsample(name, x, y);
  UNGRADED_TILES.add(name);
}

export function paintTile(ctx: CanvasRenderingContext2D, name: string, index: number): void {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const img = ctx.createImageData(TILE_PX, TILE_PX);
  const rand = rngFor(index * 9973 + 17);
  const sprite = spritePainter(name);
  const painter = PAINTERS[name];
  if (!sprite && !painter) throw new Error(`no painter for tile ${name}`);
  const graded = !sprite && !UNGRADED_TILES.has(name);
  const beveled = BEVELED_TILES.has(name);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const p = sprite ? sprite(x, y) : painter(x, y, rand);
      let r = p[0];
      let g = p[1];
      let b = p[2];
      const a = p.length === 4 ? p[3] : 255;
      if (graded && a > 0) {
        // Colour grade: richer saturation and a touch more contrast, so blocks have punch and still read as pixel art.
        // Biome-tinted pixels (alpha 248..254) are already saturated and get tinted again in the shader: go easy there.
        const sat = a >= 248 && a < 255 ? 1.04 : GRADE_SAT;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = 128 + (l + (r - l) * sat - 128) * GRADE_CONTRAST;
        g = 128 + (l + (g - l) * sat - 128) * GRADE_CONTRAST;
        b = 128 + (l + (b - l) * sat - 128) * GRADE_CONTRAST;
      }
      if (beveled) {
        // A light top-left rim and shaded bottom-right rim give each block a crisp edge.
        const k = y === 0 || x === 0 ? 8 : y === TILE_PX - 1 || x === TILE_PX - 1 ? -12 : 0;
        r += k;
        g += k;
        b += k;
      }
      const o = (y * TILE_PX + x) * 4;
      img.data[o] = clamp(r);
      img.data[o + 1] = clamp(g);
      img.data[o + 2] = clamp(b);
      img.data[o + 3] = clamp(a);
    }
  }
  ctx.putImageData(img, col * TILE_PX, row * TILE_PX);
}

export interface Atlas {
  canvas: HTMLCanvasElement;
  /** The plain atlas (nearest filtering, no mip-maps): held items, icons and anything that wants hard pixels. */
  texture: THREE.CanvasTexture;
  /**
   * The terrain's copy: sharp up close but mip-mapped so distant ground does not shimmer, with the pixels of
   * fully transparent texels filled in so leaves do not darken when they are averaged.
   */
  chunkColor: THREE.DataTexture;
  /** Per-texel material data for the terrain shader: r = biome-tint amount, g = emissive (glows in the dark). */
  chunkAux: THREE.DataTexture;
  /** The hero tiles at full size, side by side in the order of HERO_STRIP (see heroTiles.ts), with their tint masks. */
  chunkHero: THREE.DataTexture;
  chunkHeroAux: THREE.DataTexture;
  dispose(): void;
}

/** Tiles that give off their own light: the shader draws them at full brightness whatever the sky says. */
const EMISSIVE_TILES = new Set(['waystone_top', 'waystone_side', 'lava', 'glowstone', 'redstone_lamp_on', 'fire_0', 'fire_1', 'fire_2', 'fire_3', 'torch_flame_0', 'torch_flame_1', 'torch_flame_2', 'torch_flame_3', 'glow_lichen', 'amethyst_cluster', 'cave_vines_berries', 'glow_berries']);
for (const name of beyondEmissiveTiles()) EMISSIVE_TILES.add(name);

function buildChunkTextures(canvas: HTMLCanvasElement): { color: THREE.DataTexture; aux: THREE.DataTexture } {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const color = new Uint8Array(w * h * 4);
  const aux = new Uint8Array(w * h * 4);
  TILE_NAMES.forEach((name, index) => {
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    const emissive = EMISSIVE_TILES.has(name) ? 255 : 0;
    // Transparent texels take the tile's average colour so mip-maps do not blend black into the leaves.
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const o = ((row * TILE_PX + y) * w + col * TILE_PX + x) * 4;
        if (src[o + 3] === 0) continue;
        sr += src[o];
        sg += src[o + 1];
        sb += src[o + 2];
        n++;
      }
    }
    const avg = n > 0 ? [sr / n, sg / n, sb / n] : [0, 0, 0];
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const o = ((row * TILE_PX + y) * w + col * TILE_PX + x) * 4;
        // WebGL's texture rows run bottom to top.
        const d = ((h - 1 - (row * TILE_PX + y)) * w + col * TILE_PX + x) * 4;
        const a = src[o + 3];
        const tinted = a >= 248 && a < 255;
        if (a === 0) {
          color[d] = avg[0];
          color[d + 1] = avg[1];
          color[d + 2] = avg[2];
          color[d + 3] = 0;
        } else {
          color[d] = src[o];
          color[d + 1] = src[o + 1];
          color[d + 2] = src[o + 2];
          color[d + 3] = tinted ? 255 : a;
        }
        aux[d] = tinted ? 255 : 0;
        aux[d + 1] = emissive;
        // Glass catches a reflection along the edge you look across. See the shader.
        aux[d + 2] = name === 'glass' || name.startsWith('stained_') ? 255 : 0;
        aux[d + 3] = 255;
      }
    }
  });
  const make = (data: Uint8Array<ArrayBuffer>, srgb: boolean): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { color: make(color, true), aux: make(aux, false) };
}

/** The hero tiles in a strip, for the terrain shader: colour, and the biome-tint mask (r) the same way the atlas has them. */
function buildHeroTextures(): { color: THREE.DataTexture; aux: THREE.DataTexture } {
  const w = HERO_PX * HERO_COLS;
  const h = HERO_PX * HERO_ROWS;
  const color = new Uint8Array(w * h * 4);
  const aux = new Uint8Array(w * h * 4);
  HERO_STRIP.forEach(({ key, tile }, i) => {
    const emissive = EMISSIVE_TILES.has(tile) || EMISSIVE_ORES.has(tile) ? 255 : 0;
    const ore = ORE_TILES.has(tile);
    const px = heroPixels(key);
    // Gaps in foliage (alpha 0) take the picture's average colour, so mip-maps do not blend black into the leaves.
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sn = 0;
    for (let s = 0; s < px.length; s += 4) {
      if (px[s + 3] === 0) continue;
      sr += px[s];
      sg += px[s + 1];
      sb += px[s + 2];
      sn++;
    }
    const gx = (i % HERO_COLS) * HERO_PX;
    const gy = Math.floor(i / HERO_COLS) * HERO_PX;
    for (let y = 0; y < HERO_PX; y++) {
      for (let x = 0; x < HERO_PX; x++) {
        const s = (y * HERO_PX + x) * 4;
        // WebGL's texture rows run bottom to top.
        const d = ((h - 1 - (gy + y)) * w + gx + x) * 4;
        const gap = !ore && px[s + 3] === 0;
        color[d] = gap ? sr / Math.max(1, sn) : px[s];
        color[d + 1] = gap ? sg / Math.max(1, sn) : px[s + 1];
        color[d + 2] = gap ? sb / Math.max(1, sn) : px[s + 2];
        color[d + 3] = gap ? 0 : 255;
        if (ore) {
          // An ore: alpha 255 is the ore (it glows if the ore does), less is the stone of the world showing through, with the shade it
          // is in as the fraction of 254; the shader reads that from aux.a, 255 for the ore and half the shade for the stone.
          const isOre = px[s + 3] === 255;
          aux[d] = 0;
          aux[d + 1] = isOre ? emissive : 0;
          aux[d + 3] = isOre ? 255 : Math.round((px[s + 3] / 254) * 127.5);
        } else {
          aux[d] = !gap && px[s + 3] < 255 ? 255 : 0;
          aux[d + 1] = emissive;
          aux[d + 3] = 255;
        }
      }
    }
  });
  const make = (data: Uint8Array<ArrayBuffer>, srgb: boolean): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { color: make(color, true), aux: make(aux, false) };
}

export function buildAtlas(): Atlas {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  TILE_NAMES.forEach((name, i) => paintTile(ctx, name, i));

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  const { color, aux } = buildChunkTextures(canvas);
  const hero = buildHeroTextures();
  return {
    canvas,
    texture,
    chunkColor: color,
    chunkAux: aux,
    chunkHero: hero.color,
    chunkHeroAux: hero.aux,
    dispose() {
      texture.dispose();
      color.dispose();
      aux.dispose();
      hero.color.dispose();
      hero.aux.dispose();
    },
  };
}
