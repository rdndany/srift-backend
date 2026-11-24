import { SIGNATURE } from './beyondBiomes';
import type { RealmMap, RealmSite } from './beyondRealms';
import { B, BB } from './blocks';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import { hash2, Simplex } from './noise';

/**
 * The great features of the signature realms: things so large that no biome table could hold them. Every one is a pure
 * function of the world position (seed, realm and cell), computed column by column, so the chunks that share a feature
 * agree on it exactly, however they are generated and in whatever order.
 *
 *  - Sky Islands: islands of grass and skystone adrift at 120..170, their undersides tapering to a point.
 *  - Shattered Realm: shards of stone and crystal hanging over the fissures.
 *  - Worldroot: the Great Tree, with buttress roots and a canopy a hundred blocks up.
 *  - Ashen Kingdom: a volcano with a lava crater.
 *  - Eternal Night: obsidian obelisks tipped with a cold light.
 *  - Crystal Expanse: crystal spires of every colour.
 */

export interface RealmFeatureHost {
  seed: number;
  realms: Pick<RealmMap, 'at' | 'nearby'>;
  /** The height of a column's ground (after terrain, before dressing). */
  heightAt(wx: number, wz: number): number;
}

type Put = (y: number, id: number) => void;

const CRYSTALS = [BB.azure_crystal, BB.rose_crystal, BB.verdant_crystal, BB.amber_crystal];

export class BeyondRealmFeatures {
  private readonly warp: Simplex;

  constructor(private readonly host: RealmFeatureHost) {
    this.warp = new Simplex(host.seed + 8800);
  }

  /** Draw what the realms put in a chunk. */
  apply(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const sites = this.host.realms.nearby(ox + 8, oz + 8, 1).filter((s) => Math.hypot(s.cx - (ox + 8), s.cz - (oz + 8)) < s.r + 40);
    if (sites.length === 0) return;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const hit = this.host.realms.at(wx, wz);
        if (!hit) continue;
        const put: Put = (y, id) => {
          if (y > 0 && y < WORLD_HEIGHT) blocks[blockIndex(lx, y, lz)] = id;
        };
        const get = (y: number): number => (y > 0 && y < WORLD_HEIGHT ? blocks[blockIndex(lx, y, lz)] : 0);
        const ground = this.host.heightAt(wx, wz);
        switch (hit.site.id) {
          case SIGNATURE.SKY_ISLANDS:
            this.islands(put, wx, wz, hit.w, { spacing: 74, alt: [118, 172], size: [13, 28], chance: 0.62, sky: true }, ground);
            break;
          case SIGNATURE.SHATTERED_REALM:
            this.islands(put, wx, wz, hit.w, { spacing: 46, alt: [ground + 22, ground + 62], size: [4, 11], chance: 0.55, sky: false }, ground);
            break;
          case SIGNATURE.WORLDROOT:
            this.worldroot(put, get, hit.site, wx, wz, ground);
            break;
          case SIGNATURE.ASHEN_KINGDOM:
            this.volcano(put, hit.site, wx, wz, ground);
            break;
          case SIGNATURE.ETERNAL_NIGHT:
            this.spires(put, wx, wz, hit.w, { spacing: 64, height: [22, 52], radius: 3, chance: 0.5, crystal: false }, ground);
            break;
          case SIGNATURE.CRYSTAL_EXPANSE:
            this.spires(put, wx, wz, hit.w, { spacing: 38, height: [14, 40], radius: 3.4, chance: 0.6, crystal: true }, ground);
            break;
          default:
            break;
        }
      }
    }
  }

  /** The cell's island (or spire) centre, or null when the cell is empty. */
  private cellSite(salt: number, ix: number, iz: number, spacing: number, chance: number): { x: number; z: number; r: number; k: number } | null {
    const s = this.host.seed + salt;
    if (hash2(s, ix, iz) >= chance) return null;
    return {
      x: (ix + 0.15 + 0.7 * hash2(s + 1, ix, iz)) * spacing,
      z: (iz + 0.15 + 0.7 * hash2(s + 2, ix, iz)) * spacing,
      r: hash2(s + 3, ix, iz),
      k: hash2(s + 4, ix, iz),
    };
  }

  private islands(
    put: Put,
    wx: number,
    wz: number,
    w: number,
    o: { spacing: number; alt: [number, number]; size: [number, number]; chance: number; sky: boolean },
    ground: number,
  ): void {
    if (w < 0.1) return;
    const ix0 = Math.floor(wx / o.spacing);
    const iz0 = Math.floor(wz / o.spacing);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.cellSite(o.sky ? 8810 : 8820, ix0 + dx, iz0 + dz, o.spacing, o.chance);
        if (!c) continue;
        const R = (o.size[0] + c.r * (o.size[1] - o.size[0])) * (0.5 + 0.5 * Math.min(1, w * 2));
        const d = Math.hypot(wx - c.x, wz - c.z);
        const Re = R * (1 + 0.28 * this.warp.noise2(wx * 0.07, wz * 0.07));
        if (d >= Re) continue;
        const t = d / Re;
        // The ground of the island must clear the land beneath it: never a hill poking through.
        const alt = o.sky ? Math.max(o.alt[0] + c.k * (o.alt[1] - o.alt[0]), ground + 26) : o.alt[0] + c.k * (o.alt[1] - o.alt[0]);
        const top = Math.round(alt + 3 * (1 - t * t));
        const bottom = Math.round(alt - 2 - R * 0.9 * Math.pow(1 - t, 1.25));
        for (let y = bottom; y <= top; y++) {
          const depth = top - y;
          let id: number;
          if (o.sky) {
            id = depth === 0 ? B.GRASS : depth <= 2 ? B.DIRT : y < bottom + 3 && hash2(this.host.seed + 8830, wx * 7 + y, wz) < 0.18 ? BB.azure_crystal : BB.skystone;
          } else {
            id = depth === 0 ? BB.basalt : hash2(this.host.seed + 8831, wx * 5 + y, wz) < 0.05 ? CRYSTALS[Math.floor(c.k * 4) % 4] : y < bottom + 3 ? BB.stormstone : BB.volcanic_rock;
          }
          put(y, id);
        }
        // A little cover on the lawn.
        if (o.sky && d < Re * 0.8 && hash2(this.host.seed + 8832, wx, wz) < 0.06) put(top + 1, B.TALL_GRASS);
      }
    }
  }

  private spires(
    put: Put,
    wx: number,
    wz: number,
    w: number,
    o: { spacing: number; height: [number, number]; radius: number; chance: number; crystal: boolean },
    ground: number,
  ): void {
    if (w < 0.12 || ground <= SEA_LEVEL) return;
    const ix0 = Math.floor(wx / o.spacing);
    const iz0 = Math.floor(wz / o.spacing);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.cellSite(o.crystal ? 8840 : 8850, ix0 + dx, iz0 + dz, o.spacing, o.chance);
        if (!c) continue;
        const d = Math.hypot(wx - c.x, wz - c.z);
        if (d > o.radius + 1) continue;
        const base = this.host.heightAt(Math.floor(c.x), Math.floor(c.z));
        if (base <= SEA_LEVEL) continue;
        const H = Math.round(o.height[0] + c.r * (o.height[1] - o.height[0]));
        const crystal = CRYSTALS[Math.floor(c.k * 4) % 4];
        for (let y = Math.min(ground, base) - 1; y <= base + H; y++) {
          const t = Math.max(0, y - base) / H;
          // Wide at the foot, a needle at the tip; the obelisk stays squarer than the crystal.
          const rad = o.radius * (1 - t) * (o.crystal ? 1 : 0.7) + (t < 1 ? 0.3 : 0);
          if (d > rad) continue;
          const rim = d > rad - 0.9;
          let id: number;
          if (o.crystal) id = t > 0.1 && (rim || hash2(this.host.seed + 8841, wx + y, wz) < 0.7) ? crystal : BB.crystal_sand;
          else id = t > 0.93 ? BB.azure_crystal : rim && Math.floor(y / 5) % 4 === 3 ? BB.weathered_obsidian : BB.obsidian_bricks;
          put(y, id);
        }
      }
    }
  }

  /** The Great Tree: its centre is the realm's. */
  private worldroot(put: Put, get: (y: number) => number, site: RealmSite, wx: number, wz: number, ground: number): void {
    const dx = wx - site.cx;
    const dz = wz - site.cz;
    const d = Math.hypot(dx, dz);
    if (d > 70) return;
    const base = this.host.heightAt(site.cx, site.cz);
    const H = 150;
    const topY = base + H;
    // Trunk: a fluted column, wide at the foot.
    const ang = Math.atan2(dz, dx);
    const flute = 1 + 0.12 * Math.sin(ang * 7 + d * 0.05);
    for (let y = Math.min(ground, base) - 3; y <= topY; y++) {
      const t = Math.max(0, y - base) / H;
      const rad = (7.5 + 9 * Math.pow(1 - Math.min(1, t * 4), 2) + 3 * (1 - t)) * flute;
      if (d < rad) put(y, d < 2.5 && y < topY - 8 ? BB.luminous_moss : BB.worldroot_log);
    }
    // Buttress roots: six arms that dive into the ground.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + site.seed * 6;
      let da = Math.abs(ang - a) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      const across = da * d;
      const along = d * Math.cos(da);
      if (along < 6 || along > 60 || across > 3.6 - along * 0.035) continue;
      const lift = Math.max(0, Math.round(9 - along * 0.17));
      for (let y = ground - 3; y <= ground + lift; y++) put(y, BB.worldroot_log);
    }
    // Canopy: three drifting tiers of leaves with luminous blossoms.
    for (let tier = 0; tier < 3; tier++) {
      const cy = topY - 8 - tier * 16;
      const R = 62 - tier * 10;
      const ry = 11 - tier * 1.5;
      const rr = d / R;
      if (rr >= 1) continue;
      const span = ry * Math.sqrt(1 - rr * rr);
      for (let y = Math.floor(cy - span); y <= Math.ceil(cy + span * 0.7); y++) {
        if (d < 6 || get(y) === BB.worldroot_log) continue;
        const n = hash2(this.host.seed + 8860 + tier, wx * 3 + y, wz);
        if (n < 0.14 + rr * 0.3) continue;
        put(y, n > 0.97 ? B.GLOWSTONE : n > 0.8 ? BB.luminous_leaves : BB.worldroot_leaves);
      }
    }
  }

  /** The volcano: a cone with a lava lake in the crater. */
  private volcano(put: Put, site: RealmSite, wx: number, wz: number, ground: number): void {
    const dx = wx - site.cx;
    const dz = wz - site.cz;
    const d = Math.hypot(dx, dz);
    const R = 120;
    if (d > R) return;
    const base = Math.max(SEA_LEVEL + 8, this.host.heightAt(site.cx, site.cz) - 4);
    const e = 1 - d / R;
    const bumpy = 1 + 0.08 * this.warp.noise2(wx * 0.05, wz * 0.05);
    let top = Math.round(base + 100 * Math.pow(e, 1.35) * bumpy);
    const crater = 19;
    const lavaY = base + 62;
    if (d < crater) top = lavaY;
    else if (d < crater + 7) top = Math.min(top, lavaY + 4 + Math.round((d - crater) * 0.4));
    if (top <= ground) return;
    for (let y = ground; y <= top; y++) {
      const depth = top - y;
      let id = depth === 0 ? BB.ash_block : depth < 3 ? BB.volcanic_rock : BB.basalt;
      if (depth > 1 && hash2(this.host.seed + 8870, wx * 3 + y, wz) < 0.03) id = BB.charred_stone;
      if (d < crater) id = y === top ? B.LAVA : y > top - 3 ? B.LAVA : BB.basalt;
      put(y, id);
    }
    // Streaks of obsidian where the lava once ran down the flanks.
    if (d > crater + 7 && d < R * 0.8) {
      const a = Math.atan2(dz, dx);
      for (let k = 0; k < 4; k++) {
        const ga = (k / 4) * Math.PI * 2 + site.seed * 5 + 0.4 * this.warp.noise2(d * 0.03, k * 9);
        let da = Math.abs(a - ga) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da * d < 1.8) put(top, B.OBSIDIAN);
      }
    }
  }
}
