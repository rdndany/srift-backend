import { B, BLOCK_COUNT, GROVE, IS_LIQUID, IS_SOLID } from './blocks';
import type { CaveCarver } from './caves';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from './chunk';
import { Simplex, hash2, mulberry32 } from './noise';

/**
 * What makes one cave different from the next, as in the original's 1.18 caves:
 *
 *  - three kinds of cave country, each a patch of the map a few hundred blocks across: lush caves (moss, clay, hanging
 *    glow-berry vines, azaleas), dripstone caves (stalactites, stalagmites, columns), and the deep dark (sculk) at the bottom;
 *  - amethyst geodes buried in the rock: a hollow of crystal in a shell of calcite and smooth basalt;
 *  - ore showing in the floors and ceilings, so a walk through any cave glints;
 *  - walls of ore-studded rubble across some tunnels, with the tunnel going on behind and a cache of loot in it.
 *
 * Everything is a pure function of the seed and the position. The walls and the geodes are planned from the chunk they
 * start in (like the worm carvers), so a chunk that is generated alone agrees with its neighbours about them.
 */

/** The kinds of cave country. */
export const CaveZone = { PLAIN: 0, LUSH: 1, DRIPSTONE: 2 } as const;
export type CaveZoneId = (typeof CaveZone)[keyof typeof CaveZone];

/** Rock that moss, dripstone and sculk may take over. */
const ROCKY = new Uint8Array(BLOCK_COUNT);
for (const id of [B.STONE, B.DEEPSLATE, B.TUFF, B.ANDESITE, B.DIORITE, B.GRANITE, B.DIRT]) ROCKY[id] = 1;

/** Lush caves lie above this height, dripstone caves above that, the deep dark below this. */
const LUSH_MIN_Y = 24;
const DRIP_MIN_Y = 12;
const DEEP_MAX_Y = 22;

/** Share of chunks that hold a geode, and how high up one may lie. */
const GEODE_CHANCE = 0.07;

interface Geode {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** The layers of a geode, as shares of its radius: hollow, amethyst, calcite, smooth basalt. */
const GEODE_AIR = 0.4;
const GEODE_AMETHYST = 0.55;
const GEODE_CALCITE = 0.7;
const GEODE_BASALT = 0.82;

export class CaveDecor {
  private readonly nLush: Simplex;
  private readonly nDrip: Simplex;
  private readonly nDeep: Simplex;
  private readonly nPatchA: Simplex;
  private readonly nPatchB: Simplex;
  private geodes = new Map<string, Geode | null>();

  constructor(
    private readonly seed: number,
    private readonly carver: CaveCarver,
    /** The height of the ground at a column (geodes keep well under it). */
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.nLush = new Simplex(seed + 21);
    this.nDrip = new Simplex(seed + 22);
    this.nDeep = new Simplex(seed + 23);
    this.nPatchA = new Simplex(seed + 24);
    this.nPatchB = new Simplex(seed + 25);
  }

  /** The cave country of a column (lush, dripstone or plain). The deep dark is a matter of height as well: see `deepAt`. */
  zoneAt(wx: number, wz: number): CaveZoneId {
    if (this.nLush.noise2(wx / 120, wz / 120) > 0.2) return CaveZone.LUSH;
    if (this.nDrip.noise2(wx / 120 + 500, wz / 120 - 300) > 0.2) return CaveZone.DRIPSTONE;
    return CaveZone.PLAIN;
  }

  /** Is this column over the deep dark (it only shows in caves below `DEEP_MAX_Y`)? */
  deepAt(wx: number, wz: number): boolean {
    return this.nDeep.noise2(wx / 90 - 200, wz / 90 + 700) > 0.1;
  }

  /** The kind of cave a cell is in, for the debug hooks and the tests. */
  kindAt(wx: number, y: number, wz: number): 'plain' | 'lush' | 'dripstone' | 'deep_dark' {
    if (y <= DEEP_MAX_Y && this.deepAt(wx, wz)) return 'deep_dark';
    const z = this.zoneAt(wx, wz);
    if (z === CaveZone.LUSH && y >= LUSH_MIN_Y) return 'lush';
    if (z === CaveZone.DRIPSTONE && y >= DRIP_MIN_Y) return 'dripstone';
    return 'plain';
  }

  // ---- walls of rubble ---------------------------------------------------------------------------------

  /** What a wall of rubble is made of: bright ore (gold most of all) in rock and broken stone, so it glints in torchlight. */
  private sealBlock(wx: number, y: number, wz: number): number {
    const u = hash2(this.seed + 790 + y * 7, wx, wz);
    if (u < 0.15) return B.GOLD_ORE;
    if (u < 0.24) return B.IRON_ORE;
    if (u < 0.3) return B.COAL_ORE;
    if (u < 0.35) return y < 42 ? B.LAPIS_ORE : B.IRON_ORE;
    if (u < 0.4) return y < 30 ? B.REDSTONE_ORE : B.COAL_ORE;
    if (u < 0.42) return y < 28 ? B.DIAMOND_ORE : B.GOLD_ORE;
    if (u < 0.43) return B.EMERALD_ORE;
    return u < 0.75 ? (y < 24 ? B.DEEPSLATE : B.STONE) : u < 0.9 ? B.COBBLE : B.ANDESITE;
  }

  /** Close the tunnels that have a wall: every air cell of the slab becomes rock or ore. */
  seal(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    for (const s of this.carver.sealsFor(cx, cz)) {
      const reach = Math.ceil(s.r + s.half + 1);
      const x0 = Math.max(0, Math.floor(s.x) - reach - ox);
      const x1 = Math.min(CHUNK_SIZE - 1, Math.floor(s.x) + reach - ox);
      const z0 = Math.max(0, Math.floor(s.z) - reach - oz);
      const z1 = Math.min(CHUNK_SIZE - 1, Math.floor(s.z) + reach - oz);
      const y0 = Math.max(5, Math.floor(s.y) - reach);
      const y1 = Math.min(WORLD_HEIGHT - 2, Math.floor(s.y) + reach);
      for (let lz = z0; lz <= z1; lz++) {
        const pz = oz + lz + 0.5 - s.z;
        for (let lx = x0; lx <= x1; lx++) {
          const px = ox + lx + 0.5 - s.x;
          for (let y = y0; y <= y1; y++) {
            const py = y + 0.5 - s.y;
            const t = px * s.dx + py * s.dy + pz * s.dz;
            if (Math.abs(t) > s.half) continue;
            if (px * px + py * py + pz * pz - t * t > s.r * s.r) continue;
            const i = blockIndex(lx, y, lz);
            if (blocks[i] !== B.AIR) continue;
            blocks[i] = this.sealBlock(ox + lx, y, oz + lz);
          }
        }
      }
    }
  }

  /** The cache behind a wall: a chest on the tunnel floor a few steps beyond it (see `CaveCarver.cacheAt`). */
  caches(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    for (const s of this.carver.sealsFor(cx, cz)) {
      for (const c of s.caches) {
        const lx = Math.floor(c.x) - ox;
        const lz = Math.floor(c.z) - oz;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
        for (let y = Math.floor(c.y) + 1; y > Math.floor(c.y) - 7 && y > 6; y--) {
          const here = blocks[blockIndex(lx, y, lz)];
          const below = blocks[blockIndex(lx, y - 1, lz)];
          const above = blocks[blockIndex(lx, y + 1, lz)];
          if (IS_SOLID[here] || IS_LIQUID[here] || IS_LIQUID[above] || IS_SOLID[above] || !IS_SOLID[below] || IS_LIQUID[below]) continue;
          blocks[blockIndex(lx, y, lz)] = B.CHEST;
          break;
        }
      }
    }
  }

  // ---- geodes ---------------------------------------------------------------------------------------------

  /** The geode that starts in a chunk, if it has one. It depends only on the seed and the ground height at its middle. */
  geodeIn(gx: number, gz: number): Geode | null {
    const key = `${gx},${gz}`;
    let g = this.geodes.get(key);
    if (g !== undefined) return g;
    g = this.buildGeode(gx, gz);
    if (this.geodes.size > 4000) this.geodes.clear();
    this.geodes.set(key, g);
    return g;
  }

  private buildGeode(gx: number, gz: number): Geode | null {
    const rand = mulberry32(Math.floor(hash2(this.seed + 800, gx, gz) * 2147483647));
    if (rand() >= GEODE_CHANCE) return null;
    const x = gx * CHUNK_SIZE + rand() * CHUNK_SIZE;
    const z = gz * CHUNK_SIZE + rand() * CHUNK_SIZE;
    const y = 9 + Math.floor(rand() * 34);
    const r = 4.6 + rand() * 1.9;
    if (this.heightAt(Math.floor(x), Math.floor(z)) < y + r + 6) return null;
    return { x, y, z, r };
  }

  /** Write the parts of the geodes of this chunk and its neighbours that lie inside it. */
  placeGeodes(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        const g = this.geodeIn(gx, gz);
        if (!g) continue;
        const reach = Math.ceil(g.r * GEODE_BASALT) + 1;
        const x0 = Math.max(0, Math.floor(g.x) - reach - ox);
        const x1 = Math.min(CHUNK_SIZE - 1, Math.floor(g.x) + reach - ox);
        const z0 = Math.max(0, Math.floor(g.z) - reach - oz);
        const z1 = Math.min(CHUNK_SIZE - 1, Math.floor(g.z) + reach - oz);
        if (x0 > x1 || z0 > z1) continue;
        const y0 = Math.max(2, Math.floor(g.y) - reach);
        const y1 = Math.min(WORLD_HEIGHT - 2, Math.floor(g.y) + reach);
        const dist = (px: number, py: number, pz: number): number => Math.hypot(px - g.x, py - g.y, pz - g.z) / g.r;
        for (let lz = z0; lz <= z1; lz++) {
          for (let lx = x0; lx <= x1; lx++) {
            const wx = ox + lx;
            const wz = oz + lz;
            for (let y = y0; y <= y1; y++) {
              const d = dist(wx + 0.5, y + 0.5, wz + 0.5);
              if (d >= GEODE_BASALT) continue;
              const i = blockIndex(lx, y, lz);
              const cur = blocks[i];
              if (cur === B.BEDROCK) continue;
              if (d < GEODE_AIR) {
                if (cur === B.WATER || cur === B.LAVA) continue;
                // Crystals sprout from the amethyst underfoot.
                const below = dist(wx + 0.5, y - 0.5, wz + 0.5);
                const sprout = below >= GEODE_AIR && below < GEODE_AMETHYST && IS_SOLID[blocks[i - CHUNK_SIZE * CHUNK_SIZE]] === 1 && hash2(this.seed + 810 + y, wx, wz) < 0.3;
                blocks[i] = sprout ? B.AMETHYST_CLUSTER : B.AIR;
                continue;
              }
              if (!IS_SOLID[cur]) continue;
              if (d < GEODE_AMETHYST) blocks[i] = hash2(this.seed + 820 + y, wx, wz) < 0.08 ? B.BUDDING_AMETHYST : B.AMETHYST_BLOCK;
              else if (d < GEODE_CALCITE) blocks[i] = B.CALCITE;
              else blocks[i] = B.SMOOTH_BASALT;
            }
          }
        }
      }
    }
  }

  // ---- the dressing of the caves ---------------------------------------------------------------------------

  /** An ore for a spot in a cave wall: coal and iron anywhere, the rest where they belong. */
  private oreFor(y: number, wx: number, wz: number): number {
    const w: [number, number][] = [[B.COAL_ORE, 30], [B.IRON_ORE, 26]];
    if (y < 34) w.push([B.GOLD_ORE, 9]);
    if (y < 30) w.push([B.LAPIS_ORE, 6]);
    if (y < 18) w.push([B.REDSTONE_ORE, 8]);
    if (y < 16) w.push([B.DIAMOND_ORE, 2.5]);
    if (y < 46) w.push([B.EMERALD_ORE, 1]);
    let total = 0;
    for (const [, n] of w) total += n;
    let pick = hash2(this.seed + 650 + y, wx + 17, wz - 9) * total;
    for (const [id, n] of w) {
      pick -= n;
      if (pick < 0) return id;
    }
    return B.COAL_ORE;
  }

  /**
   * Dress every open span of rock-bound air in a chunk: the floor and ceiling of each cave take the look of the country
   * they lie in. `heights` is the chunk's ground heights with a one-block ring (18 by 18), as the generator makes it.
   */
  decorate(blocks: Uint16Array, heights: Int16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const PAD = CHUNK_SIZE + 2;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        // Keep clear of the surface: nothing within three blocks of the ground is touched.
        const top = Math.min(heights[(lz + 1) * PAD + lx + 1] - 4, 150);
        if (top < 8) continue;
        const zone = this.zoneAt(wx, wz);
        const deep = this.deepAt(wx, wz);
        let runStart = -1;
        for (let y = 5; y <= top + 1; y++) {
          const id = blocks[blockIndex(lx, y, lz)];
          if (id === B.AIR && y <= top) {
            if (runStart < 0) runStart = y;
            continue;
          }
          if (runStart >= 0 && id !== B.AIR && runStart > 5) this.dress(blocks, lx, lz, wx, wz, runStart, y - 1, zone, deep);
          runStart = -1;
        }
      }
    }
  }

  /** One span of air from y0 to y1 with rock under and over it: dress its floor and its ceiling. */
  private dress(blocks: Uint16Array, lx: number, lz: number, wx: number, wz: number, y0: number, y1: number, zone: CaveZoneId, deep: boolean): void {
    const gap = y1 - y0 + 1;
    const fi = blockIndex(lx, y0 - 1, lz);
    const ci = blockIndex(lx, y1 + 1, lz);
    const floorOk = ROCKY[blocks[fi]] === 1;
    const ceilOk = ROCKY[blocks[ci]] === 1;
    if (!floorOk && !ceilOk) return;
    const seed = this.seed;
    const patchA = this.nPatchA.noise2(wx / 6 + 40, wz / 6 - 17);
    const patchB = this.nPatchB.noise2(wx / 5 - 90, wz / 5 + 33);
    const r1 = hash2(seed + 610 + y0, wx, wz);
    const r2 = hash2(seed + 620 + y1, wx, wz);
    const r3 = hash2(seed + 630 + y0 * 3, wx + 5, wz + 11);
    const r4 = hash2(seed + 640 + y1 * 3, wx - 7, wz + 3);
    const at = (y: number): number => blockIndex(lx, y, lz);

    if (deep && y1 <= DEEP_MAX_Y) {
      if (floorOk && patchA > -0.1) blocks[fi] = B.SCULK;
      if (ceilOk && patchB > 0.25) blocks[ci] = B.SCULK;
      return;
    }

    if (zone === CaveZone.LUSH && y0 >= LUSH_MIN_Y) {
      if (floorOk) {
        if (patchB > 0.6) {
          blocks[fi] = B.CLAY;
        } else if (patchA > -0.25) {
          const paleFloor = r3 < 0.18;
          blocks[fi] = paleFloor ? GROVE.paleMoss : B.MOSS_BLOCK;
          const cover = r1 < 0.22 ? B.TALL_GRASS : r1 < 0.29 ? B.FERN : r1 < 0.32 ? B.FLOWERING_AZALEA : r1 < 0.35 ? GROVE.azalea : r1 < 0.39 ? B.GLOW_LICHEN : r1 < 0.48 ? (paleFloor ? GROVE.paleMossCarpet : GROVE.mossCarpet) : 0;
          if (cover) blocks[at(y0)] = cover;
        }
      }
      if (ceilOk && patchB > -0.4) {
        blocks[ci] = r4 < 0.18 ? GROVE.paleMoss : B.MOSS_BLOCK;
        if (r2 < 0.03) {
          blocks[at(y1)] = B.SPORE_BLOSSOM;
        } else if (r2 < 0.08) {
          blocks[at(y1)] = r3 < 0.5 ? GROVE.hangingRoots : GROVE.paleHangingMoss;
        } else if (r2 < 0.45 && gap >= 2) {
          // A vine hangs from the roof, ending short of the floor; its tip (and now and then another leaf) carries glowing berries.
          const len = 1 + Math.floor(Math.pow(r3, 1.4) * Math.min(gap - 1, 7));
          for (let k = 0; k < len; k++) {
            const berry = k === len - 1 ? r4 < 0.6 : hash2(seed + 660 + k, wx, wz) < 0.12;
            blocks[at(y1 - k)] = berry ? B.CAVE_VINES_BERRIES : B.CAVE_VINES;
          }
        }
      }
      return;
    }

    if (zone === CaveZone.DRIPSTONE && y0 >= DRIP_MIN_Y) {
      const onFloor = patchA > -0.05;
      const onCeiling = patchB > -0.1;
      if (floorOk && onFloor) blocks[fi] = B.DRIPSTONE_BLOCK;
      if (ceilOk && onCeiling) blocks[ci] = B.DRIPSTONE_BLOCK;
      const up = floorOk && r1 < (onFloor ? 0.17 : 0.03) ? 1 + Math.floor(Math.pow(r3, 1.6) * Math.min(4, gap - 1)) : 0;
      const down = ceilOk && r2 < (onCeiling ? 0.21 : 0.035) ? 1 + Math.floor(Math.pow(r4, 1.3) * Math.min(7, gap - 1)) : 0;
      if (up > 0 && down > 0 && up + down >= gap) {
        // The two meet: a column from floor to roof.
        for (let y = y0; y <= y1; y++) blocks[at(y)] = B.DRIPSTONE_BLOCK;
        return;
      }
      for (let k = 0; k < up; k++) blocks[at(y0 + k)] = k === up - 1 ? B.STALAGMITE_TIP : B.STALAGMITE_BASE;
      for (let k = 0; k < down; k++) blocks[at(y1 - k)] = k === down - 1 ? B.STALACTITE_TIP : B.STALACTITE_BASE;
    } else if (ceilOk && gap >= 3 && r2 < 0.004) {
      blocks[at(y1)] = B.COBWEB;
    }

    // Ore showing in the floor and the roof, so a walk through any cave glints now and then.
    if (floorOk && r1 > 0.989 && (blocks[fi] === B.STONE || blocks[fi] === B.DEEPSLATE)) blocks[fi] = this.oreFor(y0, wx, wz);
    if (ceilOk && r2 > 0.989 && (blocks[ci] === B.STONE || blocks[ci] === B.DEEPSLATE)) blocks[ci] = this.oreFor(y1, wx + 1, wz);
  }
}
