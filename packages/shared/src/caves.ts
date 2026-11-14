import { CHUNK_SIZE, WORLD_HEIGHT } from './chunk';
import { hash2, mulberry32 } from './noise';

/**
 * Worm carvers: the winding tunnels, rooms and ravines that make up most of the original's caves.
 *
 * A carver is planned from the chunk it starts in and may wander about 64 blocks, so a chunk being
 * generated asks every chunk within `REACH` for its plan and cuts whatever part of it is inside. The
 * plans depend only on the seed and the start chunk, which is why neighbouring chunks agree on where
 * a tunnel goes without ever talking to each other.
 */
export interface CaveSphere {
  x: number;
  y: number;
  z: number;
  /** Horizontal and vertical half-sizes of the ellipsoid that gets cut out. */
  rh: number;
  rv: number;
}

/**
 * A wall of ore-studded rubble across a tunnel: the tunnel goes on behind it, so whoever digs through finds the cave
 * continuing (and, usually, a cache). It is a slab perpendicular to the tunnel's heading, `half` blocks either side of
 * its centre, and wide enough to close the whole passage.
 */
export interface CaveSeal {
  x: number;
  y: number;
  z: number;
  /** Unit heading of the tunnel at the wall. */
  dx: number;
  dy: number;
  dz: number;
  /** Radius of the slab and half its thickness. */
  r: number;
  half: number;
  /** Spots a few steps further on along the tunnel, where a chest may stand (the first is closest to the wall). */
  caches: { x: number; y: number; z: number }[];
}

interface CavePlan {
  spheres: CaveSphere[];
  seals: CaveSeal[];
}

/** Chunks to look at in every direction. A tunnel is at most 64 blocks long plus its radius. */
export const CAVE_REACH = 5;
const MAX_LEN = 64;
const CACHE_LIMIT = 4096;

/** Chance that a chunk starts a cave system, and that it starts a ravine. */
const CAVE_CHANCE = 0.2;
const RAVINE_CHANCE = 0.018;
/** The chance that a tunnel has a wall of rubble across it, and the heights it may stand at. */
const SEAL_CHANCE = 0.5;
const SEAL_MIN_Y = 24;
const SEAL_MAX_Y = 54;

export class CaveCarver {
  private plans = new Map<string, CavePlan>();
  /** While a plan is built: where its walls go and the dice that decide them (kept apart so that tunnels do not change shape). */
  private sealSink: CaveSeal[] | null = null;
  private sealRand: (() => number) | null = null;

  constructor(private readonly seed: number) {}

  /** Every sphere of every nearby plan that touches chunk (cx, cz). */
  spheresFor(cx: number, cz: number): CaveSphere[] {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const out: CaveSphere[] = [];
    for (let sz = cz - CAVE_REACH; sz <= cz + CAVE_REACH; sz++) {
      for (let sx = cx - CAVE_REACH; sx <= cx + CAVE_REACH; sx++) {
        for (const s of this.plan(sx, sz)) {
          if (s.x + s.rh < x0 || s.x - s.rh > x0 + CHUNK_SIZE) continue;
          if (s.z + s.rh < z0 || s.z - s.rh > z0 + CHUNK_SIZE) continue;
          out.push(s);
        }
      }
    }
    return out;
  }

  /** Every wall of rubble of every nearby plan that touches chunk (cx, cz). */
  sealsFor(cx: number, cz: number): CaveSeal[] {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const out: CaveSeal[] = [];
    for (let sz = cz - CAVE_REACH; sz <= cz + CAVE_REACH; sz++) {
      for (let sx = cx - CAVE_REACH; sx <= cx + CAVE_REACH; sx++) {
        for (const s of this.planFull(sx, sz).seals) {
          const reach = s.r + s.half + 1;
          if (s.x + reach < x0 || s.x - reach > x0 + CHUNK_SIZE) continue;
          if (s.z + reach < z0 || s.z - reach > z0 + CHUNK_SIZE) continue;
          out.push(s);
        }
      }
    }
    return out;
  }

  /** The wall (if any) whose cache stands in column (x, z) within a few blocks of height y. */
  cacheAt(x: number, y: number, z: number): CaveSeal | null {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for (let sz = cz - CAVE_REACH; sz <= cz + CAVE_REACH; sz++) {
      for (let sx = cx - CAVE_REACH; sx <= cx + CAVE_REACH; sx++) {
        for (const s of this.planFull(sx, sz).seals) {
          if (s.caches.some((c) => Math.floor(c.x) === x && Math.floor(c.z) === z && Math.abs(c.y - y) <= 7)) return s;
        }
      }
    }
    return null;
  }

  /** Where the carvers that start in a chunk are (for tests and the debug hooks). */
  plan(sx: number, sz: number): CaveSphere[] {
    return this.planFull(sx, sz).spheres;
  }

  /** The walls of rubble of the carvers that start in a chunk (for tests and the debug hooks). */
  seals(sx: number, sz: number): CaveSeal[] {
    return this.planFull(sx, sz).seals;
  }

  private planFull(sx: number, sz: number): CavePlan {
    const key = `${sx},${sz}`;
    let p = this.plans.get(key);
    if (!p) {
      p = this.build(sx, sz);
      if (this.plans.size >= CACHE_LIMIT) this.plans.delete(this.plans.keys().next().value as string);
      this.plans.set(key, p);
    }
    return p;
  }

  private build(sx: number, sz: number): CavePlan {
    const rand = mulberry32(Math.floor(hash2(this.seed + 700, sx, sz) * 2147483647));
    const out: CaveSphere[] = [];
    const seals: CaveSeal[] = [];
    this.sealSink = seals;
    this.sealRand = mulberry32(Math.floor(hash2(this.seed + 780, sx, sz) * 2147483647));
    const plan = this.buildSpheres(rand, out, sx, sz);
    this.sealSink = null;
    this.sealRand = null;
    return { spheres: plan, seals };
  }

  private buildSpheres(rand: () => number, out: CaveSphere[], sx: number, sz: number): CaveSphere[] {
    if (rand() < CAVE_CHANCE) {
      const systems = 1 + Math.floor(rand() * rand() * 4);
      for (let i = 0; i < systems; i++) {
        const x = sx * CHUNK_SIZE + rand() * CHUNK_SIZE;
        const z = sz * CHUNK_SIZE + rand() * CHUNK_SIZE;
        // Biased towards the bottom, like the original, but reaching the surface now and then.
        const y = 5 + Math.floor(rand() * (Math.floor(rand() * 124) + 8));
        let tunnels = 1;
        if (rand() < 0.25) {
          this.room(out, rand, x, y, z);
          tunnels += Math.floor(rand() * 4);
        }
        for (let t = 0; t < tunnels; t++) {
          const yaw = rand() * Math.PI * 2;
          const pitch = (rand() - 0.5) * 0.25;
          let thick = rand() * 2 + rand();
          if (rand() < 0.1) thick *= rand() * rand() * 3 + 1;
          this.tunnel(out, rand, x, y, z, thick, yaw, pitch, 0, 0, 1);
        }
      }
    }

    if (rand() < RAVINE_CHANCE) {
      const x = sx * CHUNK_SIZE + rand() * CHUNK_SIZE;
      const z = sz * CHUNK_SIZE + rand() * CHUNK_SIZE;
      const y = 20 + Math.floor(rand() * (Math.floor(rand() * 28) + 8));
      this.ravine(out, rand, x, y, z);
    }
    return out;
  }

  /** A big squashed chamber, lumpy because it is a few overlapping spheres. */
  private room(out: CaveSphere[], rand: () => number, x: number, y: number, z: number): void {
    const r = 1.5 + 1 + rand() * 6;
    for (let i = 0; i < 4; i++) {
      out.push({
        x: x + (rand() - 0.5) * r,
        y: y + (rand() - 0.5) * r * 0.3,
        z: z + (rand() - 0.5) * r,
        rh: r * (0.6 + rand() * 0.4),
        rv: r * (0.6 + rand() * 0.4) * 0.5,
      });
    }
  }

  private tunnel(
    out: CaveSphere[],
    rand: () => number,
    x: number,
    y: number,
    z: number,
    thick: number,
    yaw0: number,
    pitch0: number,
    step0: number,
    len0: number,
    yscale: number,
  ): void {
    let yaw = yaw0;
    let pitch = pitch0;
    const len = len0 > 0 ? len0 : MAX_LEN - Math.floor(rand() * (MAX_LEN / 4));
    const split = Math.floor(rand() * (len / 2)) + Math.floor(len / 4);
    const steep = rand() < 1 / 6;
    let pitchChange = 0;
    let yawChange = 0;
    // Some tunnels are walled up part of the way along; the dice are not the tunnel's own, so its shape is not touched.
    const sealAt = this.sealRand && this.sealRand() < SEAL_CHANCE ? step0 + Math.floor((len - step0) * (0.3 + this.sealRand() * 0.3)) : -1;
    let pending: CaveSeal | null = null;
    let sealStep = -1;
    for (let step = step0; step < len; step++) {
      const rh = 1.5 + Math.sin((step * Math.PI) / len) * thick;
      const rv = rh * yscale;
      const cp = Math.cos(pitch);
      const hx = Math.cos(yaw) * cp;
      const hy = Math.sin(pitch);
      const hz = Math.sin(yaw) * cp;
      x += hx;
      z += hz;
      y += hy;
      if (step === sealAt && this.sealSink && y >= SEAL_MIN_Y && y <= SEAL_MAX_Y && rh <= 3.6 && len - step >= 12) {
        pending = { x, y, z, dx: hx, dy: hy, dz: hz, r: rh + 1.7, half: 1.5, caches: [] };
        this.sealSink.push(pending);
        sealStep = step;
      }
      if (pending && (step === sealStep + 6 || step === sealStep + 11)) pending.caches.push({ x, y, z });
      pitch *= steep ? 0.92 : 0.7;
      pitch += pitchChange * 0.1;
      yaw += yawChange * 0.1;
      pitchChange *= 0.9;
      yawChange *= 0.75;
      pitchChange += (rand() - rand()) * rand() * 2;
      yawChange += (rand() - rand()) * rand() * 4;

      if (step === split && thick > 1 && len0 === 0) {
        // Fork into two thinner tunnels that carry on from here.
        this.tunnel(out, rand, x, y, z, rand() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, step, len, 1);
        this.tunnel(out, rand, x, y, z, rand() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, step, len, 1);
        return;
      }
      if (rand() < 0.25) continue; // gaps are closed by the neighbouring spheres' overlap
      if (y < 2 || y > WORLD_HEIGHT) return;
      out.push({ x, y, z, rh, rv });
    }
  }

  /** A long, narrow, very tall crack; it usually opens onto the surface. */
  private ravine(out: CaveSphere[], rand: () => number, x: number, y: number, z: number): void {
    let yaw = rand() * Math.PI * 2;
    let pitch = (rand() - 0.5) * 0.25;
    const thick = (rand() * 2 + rand()) * 2;
    const len = MAX_LEN - Math.floor(rand() * 16);
    let pitchChange = 0;
    let yawChange = 0;
    let width = 1;
    for (let step = 0; step < len; step++) {
      // The crack is not a clean slot: its width wobbles along the way.
      if (step % 3 === 0) width = 0.7 + rand() * rand() * 0.9;
      const rh = (1.5 + Math.sin((step * Math.PI) / len) * thick) * width;
      const rv = rh * 3.2;
      const cp = Math.cos(pitch);
      x += Math.cos(yaw) * cp;
      z += Math.sin(yaw) * cp;
      y += Math.sin(pitch);
      pitch *= 0.92;
      pitch += pitchChange * 0.05;
      yaw += yawChange * 0.1;
      pitchChange *= 0.8;
      yawChange *= 0.5;
      pitchChange += (rand() - rand()) * rand() * 2;
      yawChange += (rand() - rand()) * rand() * 4;
      if (y < 8 || y > WORLD_HEIGHT - 20) return;
      out.push({ x, y, z, rh, rv });
    }
  }
}
