import { isWaterBlock, collides, type Body, type BlockReader } from './physics';
import { nextRail, railInfo, OPPOSITE_DIR, type RailInfo } from './rails';
import { IS_SOLID } from './blocks';
import { I } from './items';

/**
 * Vehicles: things a player can climb into that carry them along. A minecart follows rails; a boat floats on water.
 * They share everything but how they move: a rider seat, getting in and out, hitting one to pick it up again, and how
 * they are listed for the network. The `Realm` owns the list and steps it every tick.
 */

export type VehicleKind = 'minecart' | 'boat';

/** Whoever sits in a vehicle: a player's body, and what the player is pressing. */
export interface Rider {
  body: Body;
  /** Forward key, -1..1, and the way the player is looking on the ground plane (a unit vector). */
  input: { forward: number; fx: number; fz: number };
}

/** The item that sets each kind down, and that breaking one gives back. */
export const VEHICLE_ITEM: Record<VehicleKind, number> = { minecart: I.MINECART, boat: I.BOAT };

export interface VehicleSpec {
  /** Hit box: width (and depth) and height. */
  width: number;
  height: number;
  /** Where the rider's feet are, above the vehicle's bottom. */
  seat: number;
  /** Seconds-based top speed. */
  maxSpeed: number;
}

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  minecart: { width: 0.98, height: 0.7, seat: -0.3, maxSpeed: 8 },
  boat: { width: 1.4, height: 0.5, seat: -0.1, maxSpeed: 8 },
};

/** How high the rail's metal is above the cell floor. */
export const RAIL_LIFT = 0.1;
const CART_NUDGE = 6;
const SLOPE_PULL = 5;
const POWERED_BOOST = 20;
/** Forward key under a rider moves a cart that is slower than this (blocks per second). */
const NUDGE_LIMIT = 3;
const CART_DRAG_EMPTY = 0.8;
const CART_DRAG_RIDDEN = 0.06;

export class Vehicle {
  readonly id: number;
  readonly kind: VehicleKind;
  /** Bottom centre. */
  x: number;
  y: number;
  z: number;
  vx = 0;
  vy = 0;
  vz = 0;
  /** Which way it points (radians; the same convention as player yaw: 0 looks down -z). */
  yaw: number;
  rider: Rider | null = null;
  /** Minecart: the rail cell it runs on, distance along that rail from its first end, and signed speed along the rail. */
  rail: { x: number; y: number; z: number } | null = null;
  p = 0;
  s = 0;
  /** Seconds since it last took a knock (it shakes for a moment). */
  hurt = 99;
  /** Set when the vehicle should be removed (the world drops its item). */
  gone = false;

  constructor(id: number, kind: VehicleKind, x: number, y: number, z: number, yaw: number) {
    this.id = id;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
  }

  get spec(): VehicleSpec {
    return VEHICLE_SPECS[this.kind];
  }

  /** Current speed over the ground (blocks per second). */
  get speed(): number {
    return this.kind === 'minecart' ? Math.abs(this.s) : Math.hypot(this.vx, this.vz);
  }
}

export interface VehicleHit {
  vehicle: Vehicle;
  dist: number;
}

/** Slab method ray-vs-box; returns the entry distance or null. */
function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, min: [number, number, number], max: [number, number, number], maxDist: number): number | null {
  let t0 = 0;
  let t1 = maxDist;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    let a = (min[i] - o[i]) / d[i];
    let b = (max[i] - o[i]) / d[i];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

export class VehicleWorld {
  readonly list: Vehicle[] = [];
  private nextId = 1;

  constructor(private readonly world: BlockReader) {}

  /** Put a vehicle down. A minecart is only set on a rail (null when the cell is no rail). */
  spawn(kind: VehicleKind, x: number, y: number, z: number, yaw = 0): Vehicle | null {
    const v = new Vehicle(this.nextId++, kind, x, y, z, yaw);
    if (kind === 'minecart') {
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      const cy = Math.floor(y);
      const info = railInfo(this.world.getBlock(cx, cy, cz));
      if (!info) return null;
      v.rail = { x: cx, y: cy, z: cz };
      v.p = info.length / 2;
      this.place(v);
    }
    this.list.push(v);
    return v;
  }

  remove(v: Vehicle): void {
    v.gone = true;
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
  }

  get(id: number): Vehicle | undefined {
    return this.list.find((v) => v.id === id);
  }

  /** The vehicle a ray hits first within `maxDist` (not counting blocks in the way: the caller checks those). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, except?: Vehicle): VehicleHit | null {
    let best: VehicleHit | null = null;
    for (const v of this.list) {
      if (v === except) continue;
      const hw = v.spec.width / 2;
      const t = rayBox(ox, oy, oz, dx, dy, dz, [v.x - hw, v.y, v.z - hw], [v.x + hw, v.y + v.spec.height, v.z + hw], maxDist);
      if (t !== null && (!best || t < best.dist)) best = { vehicle: v, dist: t };
    }
    return best;
  }

  /** Advance every vehicle by `dt` seconds. `bodies` are the players on foot (they shove carts). */
  update(dt: number, bodies: readonly Body[]): void {
    for (const v of [...this.list]) {
      // Lost over the edge of the world.
      if (v.y < -40) {
        this.remove(v);
        continue;
      }
      v.hurt += dt;
      if (v.kind === 'minecart') this.stepCart(v, dt, bodies);
      else this.stepBoat(v, dt);
      this.seat(v);
    }
  }

  /** Move the rider's body to the seat. */
  private seat(v: Vehicle): void {
    const r = v.rider;
    if (!r) return;
    r.body.x = v.x;
    r.body.y = v.y + v.spec.seat;
    r.body.z = v.z;
    r.body.vx = 0;
    r.body.vy = 0;
    r.body.vz = 0;
    r.body.onGround = true;
  }

  // ---- minecart -------------------------------------------------------------

  /** World position of a point `p` along the cart's rail. */
  private place(v: Vehicle): void {
    const c = v.rail;
    const info = c && railInfo(this.world.getBlock(c.x, c.y, c.z));
    if (!c || !info) return;
    v.x = c.x + info.a[0] + info.dx * v.p;
    v.y = c.y + info.a[1] + info.dy * v.p + RAIL_LIFT;
    v.z = c.z + info.a[2] + info.dz * v.p;
    // Point along the line it runs (a cart has no front or back).
    v.yaw = Math.atan2(-info.dx, -info.dz);
  }

  private stepCart(v: Vehicle, dt: number, bodies: readonly Body[]): void {
    if (!v.rail) {
      this.fallCart(v, dt);
      return;
    }
    const c = v.rail;
    let info: RailInfo | null = railInfo(this.world.getBlock(c.x, c.y, c.z));
    if (!info) {
      // The rail under it was broken: it carries on as a free body.
      v.vx = v.s * (railLast(v).dx);
      v.vz = v.s * (railLast(v).dz);
      v.vy = 0;
      v.rail = null;
      v.s = 0;
      return;
    }
    remember(v, info);
    let s = v.s;
    // Slopes pull the cart downhill.
    s -= SLOPE_PULL * info.dy * dt;
    // Gold rails push it on the way it is already going.
    if (info.powered && Math.abs(s) > 0.05) s += Math.sign(s) * POWERED_BOOST * dt;
    // A rider leaning on the forward key gets a slow cart moving.
    const r = v.rider;
    if (r && r.input.forward > 0 && Math.abs(s) < NUDGE_LIMIT) {
      const along = r.input.fx * info.dx + r.input.fz * info.dz;
      s += along * CART_NUDGE * dt * (Math.abs(along) > 0.2 ? 1 : 0);
    }
    // Somebody walking into it shoves it along.
    if (!r) {
      for (const b of bodies) {
        if (Math.abs(b.y - v.y) > 1.4 || Math.hypot(b.x - v.x, b.z - v.z) > 0.9) continue;
        const along = b.vx * info.dx + b.vz * info.dz;
        if (Math.abs(along) > 0.5 && Math.abs(along) > Math.abs(s) && Math.sign(along) === Math.sign(s || along)) s += (along - s) * Math.min(1, 6 * dt);
      }
    }
    s *= Math.exp(-(r ? CART_DRAG_RIDDEN : CART_DRAG_EMPTY) * dt);
    if (Math.abs(s) < 0.02 && !(info.powered && r)) s = 0;
    s = Math.max(-VEHICLE_SPECS.minecart.maxSpeed, Math.min(VEHICLE_SPECS.minecart.maxSpeed, s));

    let p = v.p + s * dt;
    // Run off an end of this rail onto the next one (or stop at the end of the line).
    for (let guard = 0; guard < 4 && (p > info.length || p < 0); guard++) {
      const forward = p > info.length;
      const carry = forward ? p - info.length : -p;
      const dir = forward ? info.dirB : info.dirA;
      const h = forward ? info.hB : info.hA;
      const n = nextRail(this.world, c.x, c.y, c.z, dir, h);
      if (!n) {
        p = forward ? info.length : 0;
        s = 0;
        break;
      }
      const back = OPPOSITE_DIR[dir];
      const arrive = c.y + h;
      const speed = Math.abs(s);
      const viaA = n.info.dirA === back && n.y + n.info.hA === arrive;
      c.x = n.x;
      c.y = n.y;
      c.z = n.z;
      info = n.info;
      remember(v, info);
      if (viaA) {
        p = carry;
        s = speed;
      } else {
        p = info.length - carry;
        s = -speed;
      }
    }
    v.p = p;
    v.s = s;
    this.place(v);
  }

  /** A cart off the rails: falls, slides to a stop, and hops back on if it lands on a rail. */
  private fallCart(v: Vehicle, dt: number): void {
    const spec = v.spec;
    v.vy -= 24 * dt;
    let ny = v.y + v.vy * dt;
    if (collides(this.world, v.x, ny, v.z, spec.width, spec.height)) {
      if (v.vy < 0) v.y = Math.floor(ny) + 1;
      v.vy = 0;
      ny = v.y;
    }
    v.y = ny;
    const nx = v.x + v.vx * dt;
    if (collides(this.world, nx, v.y, v.z, spec.width, spec.height)) v.vx = 0;
    else v.x = nx;
    const nz = v.z + v.vz * dt;
    if (collides(this.world, v.x, v.y, nz, spec.width, spec.height)) v.vz = 0;
    else v.z = nz;
    const drag = Math.exp(-2.5 * dt);
    v.vx *= drag;
    v.vz *= drag;
    // Landing on a rail (the cell its bottom is in, when the bottom is in the lower half of it).
    const cx = Math.floor(v.x);
    const cz = Math.floor(v.z);
    for (const cy of [Math.floor(v.y), Math.floor(v.y) - 1]) {
      const info = railInfo(this.world.getBlock(cx, cy, cz));
      if (!info) continue;
      if (v.y - cy > 0.6 && !info.slope) continue;
      const relX = v.x - cx - info.a[0];
      const relZ = v.z - cz - info.a[2];
      const flat = info.dx * info.dx + info.dz * info.dz;
      const p = (relX * info.dx + relZ * info.dz) / flat;
      v.rail = { x: cx, y: cy, z: cz };
      v.p = Math.max(0, Math.min(info.length, p));
      v.s = v.vx * info.dx + v.vz * info.dz;
      this.place(v);
      return;
    }
  }

  // ---- boat -----------------------------------------------------------------

  private stepBoat(v: Vehicle, dt: number): void {
    const spec = v.spec;
    const r = v.rider;
    const fx = Math.floor(v.x);
    const fz = Math.floor(v.z);
    // Where the water's surface is under it: the top of the topmost water block in this column near the boat.
    let surface: number | null = null;
    const base = Math.floor(v.y + 0.3);
    for (let cy = base + 1; cy >= base - 2; cy--) {
      if (isWaterBlock(this.world.getBlock(fx, cy, fz))) {
        // Count upwards to the first non-water cell.
        let top = cy;
        while (isWaterBlock(this.world.getBlock(fx, top + 1, fz))) top++;
        surface = top + 1 - 0.1;
        break;
      }
    }
    const afloat = surface !== null;

    // Steering: the boat turns towards where the rider looks (A and D do not turn it separately).
    if (r) {
      const want = Math.atan2(-r.input.fx, -r.input.fz);
      let diff = want - v.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = 2.2 * dt;
      v.yaw += Math.max(-turn, Math.min(turn, diff));
    }
    const hx = -Math.sin(v.yaw);
    const hz = -Math.cos(v.yaw);
    if (r && r.input.forward > 0 && afloat) {
      v.vx += hx * 7 * dt;
      v.vz += hz * 7 * dt;
    } else if (r && r.input.forward < 0 && afloat) {
      v.vx -= hx * 2.5 * dt;
      v.vz -= hz * 2.5 * dt;
    }
    const drag = Math.exp(-(afloat ? (r && r.input.forward > 0 ? 0.35 : 1.1) : 5) * dt);
    v.vx *= drag;
    v.vz *= drag;
    const sp = Math.hypot(v.vx, v.vz);
    if (sp > spec.maxSpeed) {
      v.vx *= spec.maxSpeed / sp;
      v.vz *= spec.maxSpeed / sp;
    }
    // Float: ride at the surface (sitting 0.35 down in it), or fall.
    if (afloat) {
      const target = surface! - 0.35;
      v.vy = Math.max(-3, Math.min(3, (target - v.y) * 8));
    } else {
      v.vy -= 24 * dt;
    }
    // Move one axis at a time against solid blocks (shores, banks).
    const ny = v.y + v.vy * dt;
    if (collides(this.world, v.x, ny, v.z, spec.width, spec.height)) {
      if (v.vy < 0) v.y = Math.floor(ny) + 1;
      v.vy = 0;
    } else v.y = ny;
    const nx = v.x + v.vx * dt;
    if (collides(this.world, nx, v.y, v.z, spec.width, spec.height)) v.vx = 0;
    else v.x = nx;
    const nz = v.z + v.vz * dt;
    if (collides(this.world, v.x, v.y, nz, spec.width, spec.height)) v.vz = 0;
    else v.z = nz;
  }

  // ---- riders ---------------------------------------------------------------

  /** A spot beside the vehicle where a body fits, for the rider getting out (null: stay put and use the vehicle's own place). */
  exitSpot(v: Vehicle, body: Body): { x: number; y: number; z: number } {
    const w = body.width ?? 0.6;
    const h = body.height ?? 1.8;
    const offsets: [number, number][] = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]];
    const y0 = Math.floor(v.y + 0.01);
    // Prefer the sides: a spot ahead of or behind a moving vehicle is where it is about to be.
    let hx = v.vx;
    let hz = v.vz;
    if (v.kind === 'minecart') {
      const last = railLast(v);
      hx = last.dx * v.s;
      hz = last.dz * v.s;
    }
    const hl = Math.hypot(hx, hz) || 1;
    offsets.sort((a, b) => Math.abs(a[0] * hx + a[1] * hz) / (hl * Math.hypot(a[0], a[1])) - Math.abs(b[0] * hx + b[1] * hz) / (hl * Math.hypot(b[0], b[1])));
    for (const [ox, oz] of offsets) {
      for (const dy of [0, 1, -1]) {
        const x = v.x + ox;
        const z = v.z + oz;
        const y = y0 + dy;
        if (collides(this.world, x, y, z, w, h)) continue;
        // Something to stand on.
        if (!IS_SOLID[this.world.getBlock(Math.floor(x), y - 1, Math.floor(z))]) continue;
        return { x, y, z };
      }
    }
    return { x: v.x, y: v.y + v.spec.height + 0.1, z: v.z };
  }
}

// What the cart last stood on, so a broken rail can still tell it which way it was going.
const LAST = new WeakMap<Vehicle, RailInfo>();
function remember(v: Vehicle, info: RailInfo): void {
  LAST.set(v, info);
}
function railLast(v: Vehicle): { dx: number; dz: number } {
  return LAST.get(v) ?? { dx: 0, dz: 0 };
}
