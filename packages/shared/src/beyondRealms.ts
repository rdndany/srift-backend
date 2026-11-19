import { Simplex, hash2 } from './noise';
import { SIGNATURE } from './beyondBiomes';

/**
 * Where the ten signature realms are. The planet is cut into huge cells; a share of them hold one realm, whose centre,
 * size and kind come from the seed alone (and from what the land there is like: the Drowned Kingdom needs a deep sea, the
 * Ashen Kingdom a dry hot country, the Worldroot a green one). A realm is a disc with a ragged rim; `w` is how far into it a
 * column is (0 at the rim, 1 in the heart), so the land can change smoothly into the strange.
 */

export const REALM_CELL = 2800;
/** No realm reaches nearer to the world's centre than this: a first spawn is never inside one. */
export const REALM_SAFE_RADIUS = 1100;

export interface RealmSite {
  id: number;
  cx: number;
  cz: number;
  /** Radius of the disc, in blocks. */
  r: number;
  /** A number 0..1 for placing details inside the realm. */
  seed: number;
}

export interface RealmHit {
  site: RealmSite;
  /** 0 at the rim .. 1 in the heart. */
  w: number;
  /** Distance from the centre. */
  d: number;
}

/** What the land is like at a point (the realm's choice of kind depends on it). */
export interface RealmProbe {
  cont: number;
  t: number;
  h: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const LAND_REALMS = [
  SIGNATURE.SHATTERED_REALM,
  SIGNATURE.WORLDROOT,
  SIGNATURE.ASHEN_KINGDOM,
  SIGNATURE.ETERNAL_NIGHT,
  SIGNATURE.CRYSTAL_EXPANSE,
  SIGNATURE.SUNKEN_EARTH,
  SIGNATURE.SKY_ISLANDS,
  SIGNATURE.PALE_WASTES,
  SIGNATURE.EMERALD_HOLLOW,
] as const;

export class RealmMap {
  private readonly nEdge: Simplex;
  private readonly cells = new Map<string, RealmSite | null>();

  constructor(
    private readonly seed: number,
    private readonly probe: (x: number, z: number) => RealmProbe,
  ) {
    this.nEdge = new Simplex(seed * 5 + 777001);
  }

  /** The realm of a cell, if it holds one. */
  siteOfCell(ix: number, iz: number): RealmSite | null {
    const key = `${ix},${iz}`;
    let site = this.cells.get(key);
    if (site !== undefined) return site;
    site = this.makeSite(ix, iz);
    if (this.cells.size > 2000) this.cells.clear();
    this.cells.set(key, site);
    return site;
  }

  private makeSite(ix: number, iz: number): RealmSite | null {
    const s = this.seed + 90210;
    if (hash2(s, ix, iz) > 0.45) return null;
    const cx = Math.floor((ix + 0.22 + 0.56 * hash2(s + 1, ix, iz)) * REALM_CELL);
    const cz = Math.floor((iz + 0.22 + 0.56 * hash2(s + 2, ix, iz)) * REALM_CELL);
    if (Math.hypot(cx, cz) < REALM_SAFE_RADIUS) return null;
    const r = 460 + Math.floor(hash2(s + 3, ix, iz) * 360);
    const here = this.probe(cx, cz);
    let id: number;
    if (here.cont < -0.32) {
      // A deep sea: only the drowned city can lie in it.
      if (hash2(s + 4, ix, iz) > 0.55) return null;
      id = SIGNATURE.DROWNED_KINGDOM;
    } else if (here.cont < 0.12) {
      return null;
    } else {
      const weights = LAND_REALMS.map((k) => {
        switch (k) {
          case SIGNATURE.WORLDROOT:
            return here.t > 0.34 && here.t < 0.72 && here.h > 0.48 ? 1.6 : 0.15;
          case SIGNATURE.ASHEN_KINGDOM:
            return here.t > 0.55 && here.h < 0.6 ? 1.6 : 0.2;
          case SIGNATURE.ETERNAL_NIGHT:
            return here.t > 0.28 && here.t < 0.66 && here.h > 0.42 ? 1.4 : 0.2;
          case SIGNATURE.PALE_WASTES:
            return here.h < 0.45 ? 1.4 : 0.3;
          case SIGNATURE.SUNKEN_EARTH:
            return here.cont > 0.3 ? 1.2 : 0.4;
          default:
            return 1;
        }
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let pick = hash2(s + 5, ix, iz) * total;
      id = LAND_REALMS[0];
      for (let i = 0; i < LAND_REALMS.length; i++) {
        pick -= weights[i];
        if (pick < 0) {
          id = LAND_REALMS[i];
          break;
        }
      }
    }
    return { id, cx, cz, r, seed: hash2(s + 6, ix, iz) };
  }

  /** The realm with the strongest hold on a column, or null in ordinary country. */
  at(x: number, z: number): RealmHit | null {
    const ix = Math.floor(x / REALM_CELL);
    const iz = Math.floor(z / REALM_CELL);
    let best: RealmHit | null = null;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const site = this.siteOfCell(ix + dx, iz + dz);
        if (!site) continue;
        const d = Math.hypot(x - site.cx, z - site.cz);
        if (d > site.r * 1.2) continue;
        const ragged = this.nEdge.fbm2(x / 260 + site.seed * 40, z / 260, 3) * site.r * 0.16;
        const w = smooth(site.r, site.r * 0.55, d + ragged);
        if (w > 0 && (!best || w > best.w)) best = { site, w, d };
      }
    }
    return best;
  }

  /** Every realm whose cell lies within `rings` cells of a point, nearest first (tests, the debug hooks and the map). */
  nearby(x: number, z: number, rings: number): RealmSite[] {
    const ix = Math.floor(x / REALM_CELL);
    const iz = Math.floor(z / REALM_CELL);
    const out: RealmSite[] = [];
    for (let dz = -rings; dz <= rings; dz++) {
      for (let dx = -rings; dx <= rings; dx++) {
        const site = this.siteOfCell(ix + dx, iz + dz);
        if (site) out.push(site);
      }
    }
    return out.sort((a, b) => Math.hypot(a.cx - x, a.cz - z) - Math.hypot(b.cx - x, b.cz - z));
  }

  /** The nearest realm of one kind within `rings` cells, or null. */
  nearest(id: number, x: number, z: number, rings = 12): RealmSite | null {
    return this.nearby(x, z, rings).find((s) => s.id === id) ?? null;
  }
}
