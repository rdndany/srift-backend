import { BEYOND_BIOMES, BEYOND_BIOME_COUNT, SIGNATURE, legacyBiomeOf, type BeyondBiome, type SculptKind } from './beyondBiomes';
import { RealmMap, type RealmHit } from './beyondRealms';
import { SEA_LEVEL, WORLD_HEIGHT } from './chunk';
import { Simplex, hash2 } from './noise';
import { Terrain, heatBand, newColumnData, wetBand, type ColumnData } from './terrain';

/**
 * The land of The World Beyond. The overworld's `Terrain` supplies the continents, hills, mountains, rivers and the first
 * climate; this class reads that climate the way a geographer would and hangs the 110 biomes on it:
 *
 *  - temperature falls with height (a lapse rate), so snow caps every high range;
 *  - humidity rises on the sea side of a range and drains away in its lee (a rain shadow), so dry country lies behind mountains;
 *  - every biome has a niche (temperature, humidity, height, a variant axis); a column takes the biome whose niche fits it best,
 *    and the rarer tiers only compete inside patches of their own luck, so uncommon places are scattered, rare ones far apart;
 *  - a biome bends the ground in its own way (dunes, mesas, canyons, spires...), fading to nothing wherever two biomes meet, so
 *    no border is a cliff;
 *  - the signature realms (beyondRealms.ts) take over their discs with their own landscapes.
 *
 * Everything is a pure function of the seed and the column, so the client, the server and the tests agree.
 */

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The wind blows towards (+x, +z): windward slopes are wet, leeward ones dry. */
const WIND_X = 0.8;
const WIND_Z = 0.6;

/** Tier gates: the noise must exceed this for the tier to be allowed at all. */
export const TIER_GATE = [0, 0.66, 0.84, 0.93] as const;
/** The worst fit (sum of squared reaches) a rarer tier still accepts. */
export const TIER_LIMIT = [Infinity, 2.4, 1.5, 1.5] as const;

/** Lava lies in the Ashen Kingdom wherever the ground is no higher than this. */
export const ASHEN_LAVA_TOP = SEA_LEVEL + 4;

interface Niche {
  biome: BeyondBiome;
  sculpt: SculptKind;
  tc: number;
  ts: number;
  hc: number;
  hs: number;
  lo: number;
  hi: number;
  ws: number;
  wl: number;
  vc: number;
  vs: number;
}

function niche(biome: BeyondBiome): Niche {
  const span = biome.alt[1] - biome.alt[0];
  return {
    biome,
    sculpt: biome.shape,
    tc: biome.t[0],
    ts: biome.t[1],
    hc: biome.h[0],
    hs: biome.h[1],
    lo: biome.alt[0],
    hi: biome.alt[1],
    ws: Math.max(9, 8 + span * 0.22),
    wl: Math.max(7, biome.alt[0] * 0.3),
    vc: biome.v ? biome.v[0] : 0,
    vs: biome.v ? biome.v[1] : 0,
  };
}

const LAND: Niche[][] = [[], [], [], []];
for (let id = 1; id <= BEYOND_BIOME_COUNT; id++) {
  const b = BEYOND_BIOMES[id];
  if (b.kind === 'land') LAND[b.tier].push(niche(b));
}

/** The result of picking a land biome. */
export interface Pick {
  id: number;
  /** 0..1: how much of the biome's own shape the ground takes here (0 on every border). */
  calm: number;
}

export class BeyondTerrain extends Terrain {
  private readonly bSeed: number;
  private readonly nV1: Simplex;
  private readonly nG1: Simplex;
  private readonly nG2: Simplex;
  private readonly nG3: Simplex;
  private readonly nS1: Simplex;
  private readonly nS2: Simplex;
  private readonly nS3: Simplex;
  private readonly nS4: Simplex;
  private readonly nFis: Simplex;
  readonly realms: RealmMap;
  private readonly probeData = newColumnData();
  private readonly mountainCache = new Map<number, number>();
  private readonly scores = new Float32Array(BEYOND_BIOME_COUNT + 1);

  constructor(seed: number) {
    super(seed);
    this.bSeed = seed;
    const s = (k: number): Simplex => new Simplex(seed * 11 + 31000 + k * 197);
    this.nV1 = s(1);
    this.nG1 = s(3);
    this.nG2 = s(4);
    this.nG3 = s(5);
    this.nS1 = s(6);
    this.nS2 = s(7);
    this.nS3 = s(8);
    this.nS4 = s(9);
    this.nFis = s(11);
    this.realms = new RealmMap(seed, (x, z) => this.probeAt(x, z));
  }

  /** What the land is like at a point, for the realm map: continentalness and the base climate. */
  private probeAt(x: number, z: number): { cont: number; t: number; h: number } {
    const o = this.probeData;
    super.sample(x, z, o);
    return { cont: o.cont, t: o.t, h: o.h };
  }

  /** The weight of a mountain range at a point, remembered on a coarse grid (it only changes over hundreds of blocks). */
  private mountainAt(x: number, z: number): number {
    const gx = Math.round(x / 48);
    const gz = Math.round(z / 48);
    const key = (gx + 8192) * 16384 + (gz + 8192);
    let v = this.mountainCache.get(key);
    if (v === undefined) {
      const o = this.probeData;
      super.sample(gx * 48, gz * 48, o);
      v = o.mm;
      if (this.mountainCache.size > 60000) this.mountainCache.clear();
      this.mountainCache.set(key, v);
    }
    return v;
  }

  /** Temperature and humidity of a column after height and mountains have had their say. */
  private weather(wx: number, wz: number, o: ColumnData): void {
    const alt = Math.max(0, o.raw - SEA_LEVEL);
    // Colder with height: the full 0.42 is reached at about 250 blocks above the foothills.
    const lapse = clamp((alt - 6) / 240, 0, 1) * 0.42;
    o.t = clamp(o.t - lapse, 0, 1);
    // Rain: the sea side of a range is wetter, its lee is dry. Two samples up the wind decide the shadow.
    const up1 = this.mountainAt(wx - WIND_X * 150, wz - WIND_Z * 150);
    const up2 = this.mountainAt(wx - WIND_X * 330, wz - WIND_Z * 330);
    const shadow = Math.max(up1, up2 * 0.85) * (1 - o.mm * 0.6);
    const ocean = 1 - smooth(-0.1, 0.55, o.cont);
    o.h = clamp(o.h + ocean * 0.16 + o.mm * 0.18 - shadow * 0.34, 0, 1);
  }

  /** Smooth bumps on the ground that fade where biomes meet: the shapes of the land. */
  private sculpt(kind: SculptKind, x: number, z: number, h: number, amp: number): number {
    switch (kind) {
      case 'rolling':
        return h + this.nS1.fbm2(x / 52, z / 52, 2) * amp * 0.9;
      case 'dunes': {
        const a = this.nS2.fbm2(x / 110, z / 110, 2);
        const phase = (x * WIND_X + z * WIND_Z) / 8.5 + a * 7;
        return h + amp * (0.5 + 0.5 * Math.sin(phase)) * (0.7 + 0.5 * this.nS3.fbm2(x / 60, z / 60, 2));
      }
      case 'mesa': {
        const m = clamp(this.nS2.fbm2(x / 150, z / 150, 3) * 1.5 + 0.5, 0, 0.999);
        const steps = m * 4;
        const k = Math.floor(steps);
        const f = steps - k;
        return h + amp * ((k + smooth(0.5, 0.9, f)) / 4 - 0.35);
      }
      case 'canyon': {
        const r = Math.abs(this.nS2.fbm2(x / 230, z / 230, 3));
        const floor = smooth(0.14, 0.05, r);
        return h - amp * floor + this.nS3.fbm2(x / 20, z / 20, 2) * 1.5 * floor;
      }
      case 'spires': {
        const n = this.nS2.fbm2(x / 17, z / 17, 3) * 1.5 - 0.1;
        return h + (n > 0 ? amp * Math.pow(n, 1.5) * 2.2 : 0);
      }
      case 'plateau': {
        const n = this.nS2.fbm2(x / 320, z / 320, 2);
        const top = smooth(-0.02, 0.2, n);
        return h + amp * top + this.nS3.fbm2(x / 40, z / 40, 2) * 2 * top;
      }
      case 'flat':
        return lerp(h, SEA_LEVEL + 1.4, 0.88) + this.nS1.fbm2(x / 70, z / 70, 2) * 0.6;
      case 'hummocks':
        return h + this.nS1.fbm2(x / 10, z / 10, 2) * amp;
      case 'crevasse': {
        const r = Math.abs(this.nS2.fbm2(x / 75, z / 75, 3));
        return h - amp * smooth(0.07, 0.01, r) + this.nS3.fbm2(x / 14, z / 14, 2) * 1.8;
      }
      case 'tors': {
        const n = this.nS2.fbm2(x / 34, z / 34, 3);
        return h + amp * smooth(0.22, 0.55, n) + this.nS1.fbm2(x / 50, z / 50, 2) * amp * 0.25;
      }
      case 'karst': {
        const n = this.nS2.fbm2(x / 46, z / 46, 3);
        return n > 0.35 ? h - amp * smooth(0.35, 0.55, n) : h + amp * 0.3 * smooth(0, 0.3, n);
      }
      case 'terraces': {
        const step = 5;
        const q = Math.floor(h / step) * step;
        const f = (h - q) / step;
        return lerp(h, q + smooth(0.55, 1, f) * step, 0.7) + this.nS1.fbm2(x / 40, z / 40, 2) * amp * 0.2;
      }
      case 'hoodoos': {
        const n = this.nS2.fbm2(x / 15, z / 15, 3);
        return h + amp * smooth(0.3, 0.52, n) * (1.2 + this.nS3.fbm2(x / 40, z / 40, 2));
      }
      case 'wetland': {
        // Pools only where the ground is already low; a high oasis keeps its dry rim.
        const n = this.nS1.fbm2(x / 18, z / 18, 2);
        const pool = smooth(0.25, 0.5, n) * smooth(SEA_LEVEL + 14, SEA_LEVEL + 4, h);
        return lerp(h, SEA_LEVEL - 1.6 - amp * 0.4, pool * 0.9);
      }
      case 'crater': {
        // Cones on a loose grid: a steep outside, a bowl in the middle.
        const cell = 190;
        const ix = Math.floor(x / cell);
        const iz = Math.floor(z / cell);
        let out = h;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const jx = ix + dx;
            const jz = iz + dz;
            if (hash2(this.bSeed + 4410, jx, jz) > 0.5) continue;
            const cx = (jx + 0.2 + 0.6 * hash2(this.bSeed + 4411, jx, jz)) * cell;
            const cz = (jz + 0.2 + 0.6 * hash2(this.bSeed + 4412, jx, jz)) * cell;
            const R = 34 + hash2(this.bSeed + 4413, jx, jz) * 40;
            const d = Math.hypot(x - cx, z - cz);
            if (d > R) continue;
            const peak = amp * (1.1 + hash2(this.bSeed + 4414, jx, jz));
            const cone = peak * Math.pow(1 - d / R, 1.25);
            const bowl = d < R * 0.22 ? -peak * 0.55 * (1 - d / (R * 0.22)) : 0;
            out = Math.max(out, h + cone + bowl);
          }
        }
        return out;
      }
      case 'ridges': {
        const n = Math.max(0, 1 - Math.abs(this.nS2.fbm2(x / 70, z / 70, 3)) * 2);
        return h + amp * n * n * 0.9;
      }
      default:
        return h;
    }
  }

  /** The luck of a tier at a place, 0..1 and evenly spread: a tier is allowed where it exceeds TIER_GATE[tier], i.e. in a fixed share of the planet. */
  gate(tier: number, x: number, z: number): number {
    const n = tier === 1 ? this.nG1 : tier === 2 ? this.nG2 : this.nG3;
    const scale = tier === 1 ? 900 : tier === 2 ? 640 : 520;
    return 0.5 + 0.5 * Math.tanh((0.8 * n.fbm2(x / scale, z / scale, 2)) / 0.33);
  }

  /** 0..1: how firmly the sunken archipelago holds a sea column. */
  private archipelagoWeight(x: number, z: number, t: number, depth: number): number {
    return smooth(TIER_GATE[2], TIER_GATE[2] + 0.04, this.gate(2, x, z)) * smooth(0.36, 0.42, t) * smooth(24, 18, depth);
  }

  /**
   * The land biome that fits a column best. Tiers are tried from the rarest down; a tier takes the column only inside the
   * patches of its gate and only when some biome of it fits well enough. `calm` falls to nothing at every boundary
   * (between biomes of different shape, between tiers, at a gate's edge), which keeps the shaped ground free of cliffs.
   */
  pickLand(x: number, z: number, t: number, h: number, alt: number): Pick {
    const v = 0.5 + 0.5 * Math.tanh((0.8 * this.nV1.fbm2(x / 760, z / 760, 2)) / 0.33);
    let calm = 1;
    // Every tier gate is a boundary somewhere nearby, whichever tier ends up winning.
    for (let tier = 1; tier <= 3; tier++) calm = Math.min(calm, smooth(0, 0.07, Math.abs(this.gate(tier, x, z) - TIER_GATE[tier])));
    const scores = this.scores;
    for (let tier = 3; tier >= 0; tier--) {
      if (tier > 0 && this.gate(tier, x, z) <= TIER_GATE[tier]) continue;
      const list = LAND[tier];
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        const dt = (t - n.tc) / n.ts;
        const dh = (h - n.hc) / n.hs;
        const da = alt < n.lo ? (n.lo - alt) / n.wl : alt > n.hi ? (alt - n.hi) / n.ws : 0;
        let s = dt * dt + dh * dh + da * da;
        if (n.vs > 0) {
          const dv = (v - n.vc) / n.vs;
          s += dv * dv;
        }
        scores[i] = s;
        if (s < bestScore) {
          bestScore = s;
          best = i;
        }
      }
      if (best < 0) continue;
      if (tier > 0) {
        calm = Math.min(calm, smooth(0, 0.3, Math.abs(bestScore - TIER_LIMIT[tier]) / TIER_LIMIT[tier]));
        if (bestScore > TIER_LIMIT[tier]) continue;
      }
      const kind = list[best].sculpt;
      let other = Infinity;
      for (let i = 0; i < list.length; i++) if (list[i].sculpt !== kind && scores[i] < other) other = scores[i];
      calm = Math.min(calm, smooth(0, 0.5, other - bestScore));
      return { id: list[best].biome.id, calm };
    }
    return { id: 1, calm: 0 };
  }

  private riverBiome(t: number, h: number, alt: number, mm: number): number {
    if (t < 0.2) return 84;
    if ((alt > 14 || mm > 0.25) && t < 0.62) return 81;
    if (t > 0.68 && h > 0.5) return 83;
    return 82;
  }

  /** The sea biome for a column of ocean of this depth and warmth. */
  private oceanBiome(x: number, z: number, t: number, depth: number): number {
    if (t < 0.17) return 70;
    const g3 = this.gate(3, x, z);
    if (g3 > TIER_GATE[3] && depth >= 6 && depth <= 50) return 75;
    if (this.archipelagoWeight(x, z, t, depth) > 0.5) return 80;
    const g2 = this.gate(2, x, z);
    if (g2 > TIER_GATE[2] && depth >= 14 && depth <= 60 && t > 0.62) return 74;
    const g1 = this.gate(1, x, z);
    if (g1 > TIER_GATE[1]) {
      if (t > 0.68 && depth >= 3 && depth <= 22) return 71;
      if (t > 0.34 && t < 0.66 && depth >= 8 && depth <= 34) return 72;
    }
    if (depth >= 38) return 73;
    if (depth >= 24) return 68;
    return t > 0.55 ? 67 : 69;
  }

  /** The coast biome of a shore column. */
  private coastBiome(x: number, z: number, t: number, h: number, ero: number): number {
    if (t < 0.17) return 55;
    const g1 = this.gate(1, x, z);
    if (g1 > TIER_GATE[1]) {
      if (t > 0.64 && h > 0.6) return 79;
      if (t > 0.28 && t < 0.58 && h > 0.52) return 76;
    }
    if (ero < -0.05) return 77;
    return t > 0.3 ? 78 : 77;
  }

  private lakeBiome(x: number, z: number, t: number, h: number, alt: number, mm: number): number {
    if (this.gate(3, x, z) > TIER_GATE[3]) return 90;
    if (this.gate(2, x, z) > TIER_GATE[2] && t > 0.7 && h < 0.4) return 89;
    if (h > 0.74 && alt < 8) return 88;
    return (alt > 16 || mm > 0.12) && t < 0.6 ? 87 : 86;
  }

  /** The shape of the sea floor: seamounts, trenches and the islands of the archipelago. Continuous in depth, so it never cliffs. */
  private seaFloor(x: number, z: number, t: number, base: number): number {
    const depth = SEA_LEVEL - base;
    let h = base;
    const mound = this.nS2.fbm2(x / 90, z / 90, 3);
    h += 14 * smooth(0.25, 0.65, mound) * smooth(20, 30, depth);
    const trench = 0.5 + 0.5 * this.nS3.fbm2(x / 140, z / 140, 2);
    h -= 18 * trench * smooth(34, 44, depth);
    const arch = this.archipelagoWeight(x, z, t, depth);
    if (arch > 0) {
      const n = this.nS4.fbm2(x / 52, z / 52, 3);
      const isle = smooth(0.08, 0.34, n);
      h = lerp(h, Math.max(h, SEA_LEVEL - 9 + isle * (11 + (n - 0.08) * 22)), arch);
    }
    return Math.min(h, Math.max(base, SEA_LEVEL + 5));
  }

  /**
   * Fill `o` with everything about the column (wx, wz): height, biome (the overworld's, so that mobs, villages and the old map
   * keep working), the detailed Beyond biome in `sub`, and a water level when the water is not the sea.
   */
  override sample(wx: number, wz: number, o: ColumnData): void {
    super.sample(wx, wz, o);
    const raw = o.raw;
    const baseHeight = o.height;
    const river = o.river;
    const cont = o.cont;
    this.weather(wx, wz, o);
    const t = o.t;
    const hum = o.h;
    const alt = Math.max(0, raw - SEA_LEVEL);

    let sub: number;
    let height = baseHeight;
    if (baseHeight < SEA_LEVEL) {
      if (river > 0.4 && cont > -0.1) {
        sub = this.riverBiome(t, hum, alt, o.mm);
      } else if (cont > -0.06) {
        sub = this.lakeBiome(wx, wz, t, hum, alt, o.mm);
      } else {
        sub = this.oceanBiome(wx, wz, t, SEA_LEVEL - baseHeight);
        height = this.seaFloor(wx, wz, t, baseHeight);
      }
    } else if (baseHeight <= SEA_LEVEL + 3 && cont < 0.06 && river < 0.4) {
      sub = this.coastBiome(wx, wz, t, hum, o.ero);
    } else {
      const pick = this.pickLand(wx, wz, t, hum, alt);
      sub = pick.id;
      const b = BEYOND_BIOMES[sub];
      if (b.shape !== 'none' && b.amp > 0 && pick.calm > 0.001) {
        height = lerp(baseHeight, this.sculpt(b.shape, wx, wz, baseHeight, b.amp), pick.calm);
      }
    }

    // The signature realms: a disc where the land turns strange.
    const realm = this.realms.at(wx, wz);
    if (realm) {
      height = this.realmGround(realm, wx, wz, height);
      if (realm.w > 0.5) sub = realm.site.id;
    }

    height = Math.floor(clamp(height, 4, WORLD_HEIGHT - 8));
    o.height = height;
    o.sub = sub;
    o.water = 0;
    o.biome = legacyBiomeOf(sub) as typeof o.biome;
    o.heat = heatBand(t);
    o.wet = wetBand(hum);
  }

  /** How a signature realm bends the ground of a column. `shaped` is the ordinary land (or sea floor) there. */
  private realmGround(hit: RealmHit, x: number, z: number, shaped: number): number {
    const { site, d } = hit;
    const core = smooth(0.2, 0.8, hit.w);
    switch (site.id) {
      case SIGNATURE.SHATTERED_REALM: {
        // Broken ground: deep fissures between raised slabs.
        const f = Math.abs(this.nFis.fbm2(x / 150, z / 150, 3));
        const fissure = smooth(0.11, 0.02, f);
        const slab = this.nS4.fbm2(x / 90, z / 90, 2);
        return lerp(shaped, Math.max(shaped, SEA_LEVEL + 16) + slab * 12 - fissure * 46 + 14, core);
      }
      case SIGNATURE.WORLDROOT:
        // The great tree stands on a swell of earth.
        return shaped + 10 * smooth(120, 0, d) * core;
      case SIGNATURE.ASHEN_KINGDOM: {
        const ridge = Math.max(0, 1 - Math.abs(this.nS2.fbm2(x / 130, z / 130, 3)) * 2);
        const mount = ridge * 62 + this.nS3.fbm2(x / 32, z / 32, 3) * 8;
        let height = lerp(shaped, Math.max(shaped, SEA_LEVEL + 6) + mount, core);
        // Rivers of lava fill the troughs.
        const lava = Math.abs(this.nFis.fbm2(x / 190 + 40, z / 190, 3));
        const channel = smooth(0.05, 0.015, lava) * core;
        if (channel > 0) height = lerp(height, ASHEN_LAVA_TOP - 2, smooth(0, 0.6, channel));
        return height;
      }
      case SIGNATURE.DROWNED_KINGDOM:
        // A wide shelf of drowned ground under thirty blocks of water.
        return lerp(shaped, SEA_LEVEL - 30 + this.nS1.fbm2(x / 90, z / 90, 2) * 3, core);
      case SIGNATURE.ETERNAL_NIGHT:
        return shaped + this.nS1.fbm2(x / 40, z / 40, 2) * 3 * core;
      case SIGNATURE.CRYSTAL_EXPANSE: {
        const n = this.nS2.fbm2(x / 19, z / 19, 3) * 1.5 - 0.05;
        const spire = n > 0 ? 50 * Math.pow(n, 1.4) : 0;
        const basin = smooth(0.35, 0.6, this.nS3.fbm2(x / 160, z / 160, 2));
        const up = lerp(shaped, Math.max(shaped, SEA_LEVEL + 8) + spire * (1 - basin), core);
        return lerp(up, SEA_LEVEL - 3, basin * core);
      }
      case SIGNATURE.SUNKEN_EARTH: {
        // A caldera: a level floor far below sheer rims.
        const R = site.r * 0.55;
        const floor = SEA_LEVEL + 3 + this.nS1.fbm2(x / 90, z / 90, 2) * 4;
        const inside = smooth(R - 4, R - 30, d);
        const rim = smooth(R + 40, R + 6, d) * smooth(R - 30, R - 4, d);
        const rimHeight = Math.max(shaped, floor + 38) + this.nS3.fbm2(x / 30, z / 30, 2) * 4;
        return lerp(lerp(shaped, rimHeight, rim), floor, inside);
      }
      case SIGNATURE.PALE_WASTES: {
        const n = this.nS2.fbm2(x / 14, z / 14, 3);
        const flat = lerp(shaped, SEA_LEVEL + 4 + this.nS1.fbm2(x / 120, z / 120, 2) * 5, 0.6 * core);
        return flat + 16 * smooth(0.34, 0.54, n) * core;
      }
      case SIGNATURE.SKY_ISLANDS:
        // The ground below the islands is calm, high highlands.
        return lerp(shaped, Math.max(shaped, SEA_LEVEL + 28) + this.nS1.fbm2(x / 80, z / 80, 2) * 6, core * 0.8);
      default:
        return shaped;
    }
  }
}
