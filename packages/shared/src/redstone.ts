import {
  B,
  IS_OPAQUE,
  IS_PARTIAL,
  IS_SOLID,
  buttonInfo,
  doorInfo,
  gateId,
  gateInfo,
  isLamp,
  leverInfo,
  mountSupport,
  mountedId,
  plateInfo,
  rtorchInfo,
  trapdoorId,
  trapdoorInfo,
  wireId,
  wirePower,
} from './blocks';

/**
 * Redstone: dust that carries a signal of strength 0..15 (losing one per block), and the things that
 * make, read and gate it. Everything lives in block ids, so a world save needs nothing extra but the
 * running timers of buttons and the plates being stood on.
 *
 * The model follows the original's. A *source* (lever, button, plate, lit torch, redstone block) powers
 * the components beside it, and *strongly* powers the one block it is fixed to, which then powers what
 * touches it. Dust carries power through connected dust and into the blocks it points at. Torches
 * invert the power of the block they hang on, one tick (0.1 s) late, which is what makes clocks and
 * memory possible. Lamps, doors, trapdoors, gates and TNT read the power around them.
 */

/** Horizontal directions as in `BED_DIRS`: +x, -x, +z, -z. */
export const WIRE_DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIRS6: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

type Get = (x: number, y: number, z: number) => number;

/** Does power pass through this block (a plain full block)? */
export function isConductor(id: number): boolean {
  return IS_OPAQUE[id] === 1 && IS_SOLID[id] === 1 && IS_PARTIAL[id] === 0 && id !== B.REDSTONE_BLOCK;
}

/** Things dust reaches out to touch on its side (so it draws an arm towards them). */
function connectsSideways(id: number): boolean {
  return id === B.REDSTONE_BLOCK || !!leverInfo(id) || !!buttonInfo(id) || !!plateInfo(id) || !!rtorchInfo(id);
}

/** Up-link: a wire on the block beside and above, reachable while nothing solid sits over this wire. */
export interface WireLink {
  x: number;
  y: number;
  z: number;
  /** Index into `WIRE_DIRS`. */
  dir: number;
  /** 0 = same height, 1 = climbs a block, -1 = drops a block. */
  dy: number;
}

/** The other dust a wire at (x, y, z) is joined to. */
export function wireLinks(get: Get, x: number, y: number, z: number): WireLink[] {
  const out: WireLink[] = [];
  const roofed = isConductor(get(x, y + 1, z));
  for (let i = 0; i < 4; i++) {
    const nx = x + WIRE_DIRS[i][0];
    const nz = z + WIRE_DIRS[i][1];
    const side = get(nx, y, nz);
    if (wirePower(side) >= 0) {
      out.push({ x: nx, y, z: nz, dir: i, dy: 0 });
      continue;
    }
    if (!roofed && wirePower(get(nx, y + 1, nz)) >= 0) out.push({ x: nx, y: y + 1, z: nz, dir: i, dy: 1 });
    if (!isConductor(side) && wirePower(get(nx, y - 1, nz)) >= 0) out.push({ x: nx, y: y - 1, z: nz, dir: i, dy: -1 });
  }
  return out;
}

/**
 * Which sides a wire draws an arm to: bit i for `WIRE_DIRS[i]`. Bits 4..7 mark the arms that climb the
 * block beside (drawn up its wall).
 */
export function wireArms(get: Get, x: number, y: number, z: number): number {
  let mask = 0;
  for (const l of wireLinks(get, x, y, z)) {
    mask |= 1 << l.dir;
    if (l.dy === 1) mask |= 16 << l.dir;
  }
  for (let i = 0; i < 4; i++) {
    if (!(mask & (1 << i)) && connectsSideways(get(x + WIRE_DIRS[i][0], y, z + WIRE_DIRS[i][1]))) mask |= 1 << i;
  }
  return mask;
}

/** Does dust with these arms feed the block on side `dir`? (Alone it feeds all four; in a line it feeds both ends.) */
function feeds(arms: number, dir: number): boolean {
  const n = (arms & 1) + ((arms >> 1) & 1) + ((arms >> 2) & 1) + ((arms >> 3) & 1);
  if (n === 0) return true;
  if (n === 1) return ((arms >> dir) & 1) === 1 || ((arms >> (dir ^ 1)) & 1) === 1;
  return ((arms >> dir) & 1) === 1;
}

/**
 * Power the block at (x, y, z) delivers to its neighbour in direction (dx, dy, dz). `strongOnly` keeps
 * just the kind that passes through a solid block; `noWire` leaves dust out (dust asks this of the blocks
 * around it, or it would feed itself).
 */
function emitted(get: Get, x: number, y: number, z: number, dx: number, dy: number, dz: number, strongOnly: boolean, noWire: boolean): number {
  const id = get(x, y, z);
  if (id === B.AIR) return 0;
  if (id === B.REDSTONE_BLOCK) return strongOnly ? 0 : 15;
  const sw = leverInfo(id) ?? buttonInfo(id);
  if (sw) {
    if (!sw.on) return 0;
    const s = mountSupport(sw.face);
    return s[0] === dx && s[1] === dy && s[2] === dz ? 15 : strongOnly ? 0 : 15;
  }
  const plate = plateInfo(id);
  if (plate) return plate.on ? (dy === -1 ? 15 : strongOnly ? 0 : 15) : 0;
  const torch = rtorchInfo(id);
  if (torch) {
    if (!torch.on) return 0;
    const s = mountSupport(torch.face);
    if (s[0] === dx && s[1] === dy && s[2] === dz) return 0;
    return dy === 1 ? 15 : strongOnly ? 0 : 15;
  }
  const p = wirePower(id);
  if (p > 0 && !noWire) {
    if (dy === -1) return p;
    if (dy === 1) return 0;
    const dir = dx === 1 ? 0 : dx === -1 ? 1 : dz === 1 ? 2 : 3;
    return feeds(wireArms(get, x, y, z), dir) ? p : 0;
  }
  return 0;
}

/** Strongest signal handed to the cell by anything beside it (`strongOnly`: just what a solid block passes on). */
function powerAt(get: Get, x: number, y: number, z: number, strongOnly: boolean, noWire: boolean): number {
  let best = 0;
  for (const [dx, dy, dz] of DIRS6) {
    const p = emitted(get, x + dx, y + dy, z + dz, -dx, -dy, -dz, strongOnly, noWire);
    if (p > best) best = p;
  }
  return best;
}

/** What the neighbour at offset d hands to the component at (x, y, z). */
function signalFrom(get: Get, x: number, y: number, z: number, dx: number, dy: number, dz: number, noWire: boolean): number {
  const nx = x + dx;
  const ny = y + dy;
  const nz = z + dz;
  const id = get(nx, ny, nz);
  if (isConductor(id)) return powerAt(get, nx, ny, nz, true, noWire);
  return emitted(get, nx, ny, nz, -dx, -dy, -dz, false, noWire);
}

/** Is a component at this cell (lamp, door, TNT...) being powered? */
export function isPowered(get: Get, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of DIRS6) if (signalFrom(get, x, y, z, dx, dy, dz, false) > 0) return true;
  return false;
}

/** The power a dust block would be handed from outside its own wire (sources, powered blocks). */
function wireInput(get: Get, x: number, y: number, z: number): number {
  let best = 0;
  for (const [dx, dy, dz] of DIRS6) {
    if (wirePower(get(x + dx, y + dy, z + dz)) >= 0) continue;
    const p = signalFrom(get, x, y, z, dx, dy, dz, true);
    if (p > best) best = p;
  }
  return best;
}

export interface RedstoneHost {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  /** Open or close the door whose lower half is here. */
  door(x: number, y: number, z: number, open: boolean): void;
  /** Light the fuse of the TNT here. */
  tnt(x: number, y: number, z: number): void;
  /** What presses a pressure plate right now: where it stands, and whether it is a dropped item (wooden plates feel those too). */
  entities(): Iterable<{ x: number; y: number; z: number; item: boolean }>;
  sound(x: number, y: number, z: number, kind: 'click' | 'fizz'): void;
}

/** Seconds per redstone tick. */
export const REDSTONE_TICK = 0.1;
/** A stone button stays in this long. */
export const BUTTON_SECONDS = 1;
/** A plate stays down this long after the last foot leaves. */
export const PLATE_SECONDS = 1;
const MAX_WIRES = 3000;
const MAX_TICKS_PER_UPDATE = 4;
/** A torch that flips this many times within `BURNOUT_WINDOW` burns out for a while. */
const BURNOUT_FLIPS = 8;
const BURNOUT_WINDOW = 6;
const BURNOUT_TIME = 2;

const keyOf = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export interface RedstoneState {
  buttons: [number, number, number, number][];
  plates: [number, number, number][];
}

export class RedstoneSim {
  private dirty = new Set<string>();
  private clock = 0;
  private acc = 0;
  private buttons: { x: number; y: number; z: number; t: number }[] = [];
  /** Plates that are down, and when something last stood on them. */
  private pressed = new Map<string, { x: number; y: number; z: number; seen: number }>();
  /** Doors, trapdoors, gates and TNT that the last look found powered (they only react when this changes). */
  private poweredNow = new Set<string>();
  private flips = new Map<string, number[]>();
  private burnt = new Map<string, number>();

  constructor(private readonly host: RedstoneHost) {}

  private get = (x: number, y: number, z: number): number => this.host.getBlock(x, y, z);

  /** Something changed here: look at everything it could affect on the next tick. */
  notify(x: number, y: number, z: number): void {
    if (this.dirty.size < 20000) this.dirty.add(keyOf(x, y, z));
  }

  /** Anything waiting to be worked out (tests). */
  get pending(): number {
    return this.dirty.size;
  }

  // ---- inputs the player uses ------------------------------------------------

  /** Flip the lever at a cell. */
  toggleLever(x: number, y: number, z: number): boolean {
    const lever = leverInfo(this.get(x, y, z));
    if (!lever) return false;
    this.host.setBlock(x, y, z, mountedId(B.LEVER_BASE, lever.face, !lever.on));
    this.host.sound(x, y, z, 'click');
    this.notify(x, y, z);
    return true;
  }

  /** Push the button at a cell (it springs back after a second). */
  pressButton(x: number, y: number, z: number): boolean {
    const btn = buttonInfo(this.get(x, y, z));
    if (!btn) return false;
    if (btn.on) return true;
    this.host.setBlock(x, y, z, mountedId(B.BUTTON_BASE, btn.face, true));
    this.buttons.push({ x, y, z, t: BUTTON_SECONDS });
    this.host.sound(x, y, z, 'click');
    this.notify(x, y, z);
    return true;
  }

  // ---- time ---------------------------------------------------------------------

  update(dt: number): void {
    this.acc += dt;
    let n = 0;
    while (this.acc >= REDSTONE_TICK && n++ < MAX_TICKS_PER_UPDATE) {
      this.acc -= REDSTONE_TICK;
      this.tick();
    }
    if (this.acc > REDSTONE_TICK * 2) this.acc = 0;
  }

  /** One redstone tick (0.1 s). Public for tests. */
  tick(): void {
    this.clock += REDSTONE_TICK;
    this.releaseButtons();
    this.pressPlates();
    if (this.dirty.size === 0) return;
    const seeds = this.dirty;
    this.dirty = new Set();
    const region = new Map<string, [number, number, number]>();
    for (const k of seeds) this.addRegion(region, k);

    const changed = this.updateWires(region);
    // Torches react to what changed before this tick; whatever the wires did now reaches them next tick.
    for (const k of changed) this.dirty.add(k);
    const consumers = new Map(region);
    for (const k of changed) this.addRegion(consumers, k);
    for (const [, [x, y, z]] of consumers) this.consume(x, y, z, region.has(keyOf(x, y, z)));
  }

  private addRegion(into: Map<string, [number, number, number]>, k: string): void {
    const [x, y, z] = k.split(',').map(Number);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) continue;
          const cx = x + dx;
          const cy = y + dy;
          const cz = z + dz;
          into.set(keyOf(cx, cy, cz), [cx, cy, cz]);
        }
      }
    }
  }

  // ---- dust ------------------------------------------------------------------------

  /** Recompute every dust network that touches the region; returns the cells that changed. */
  private updateWires(region: Map<string, [number, number, number]>): string[] {
    const changed: string[] = [];
    const seen = new Set<string>();
    for (const [k, [sx, sy, sz]] of region) {
      if (seen.has(k) || wirePower(this.get(sx, sy, sz)) < 0) continue;
      // Gather the whole network.
      const xs: number[] = [sx];
      const ys: number[] = [sy];
      const zs: number[] = [sz];
      const adj: number[][] = [];
      const index = new Map<string, number>([[k, 0]]);
      seen.add(k);
      for (let i = 0; i < xs.length; i++) {
        const links: number[] = [];
        for (const l of wireLinks(this.get, xs[i], ys[i], zs[i])) {
          const lk = keyOf(l.x, l.y, l.z);
          let j = index.get(lk);
          if (j === undefined) {
            if (xs.length >= MAX_WIRES) continue;
            j = xs.length;
            index.set(lk, j);
            seen.add(lk);
            xs.push(l.x);
            ys.push(l.y);
            zs.push(l.z);
          }
          links.push(j);
        }
        adj.push(links);
      }
      const n = xs.length;
      const level = new Int8Array(n);
      const buckets: number[][] = Array.from({ length: 16 }, () => []);
      for (let i = 0; i < n; i++) {
        level[i] = wireInput(this.get, xs[i], ys[i], zs[i]);
        if (level[i] > 0) buckets[level[i]].push(i);
      }
      for (let lv = 15; lv >= 2; lv--) {
        for (let b = 0; b < buckets[lv].length; b++) {
          const i = buckets[lv][b];
          if (level[i] !== lv) continue;
          for (const j of adj[i]) {
            if (level[j] < lv - 1) {
              level[j] = lv - 1;
              buckets[lv - 1].push(j);
            }
          }
        }
      }
      for (let i = 0; i < n; i++) {
        if (wirePower(this.get(xs[i], ys[i], zs[i])) === level[i]) continue;
        this.host.setBlock(xs[i], ys[i], zs[i], wireId(level[i]));
        changed.push(keyOf(xs[i], ys[i], zs[i]));
      }
    }
    return changed;
  }

  // ---- what reads the power ----------------------------------------------------------

  private consume(x: number, y: number, z: number, fresh: boolean): void {
    const id = this.get(x, y, z);
    if (id === B.AIR) return;
    if (isLamp(id)) {
      const on = isPowered(this.get, x, y, z);
      if (on !== (id === B.LAMP_ON)) this.host.setBlock(x, y, z, on ? B.LAMP_ON : B.LAMP);
      return;
    }
    const torch = rtorchInfo(id);
    if (torch) {
      if (fresh) this.updateTorch(x, y, z, torch.face, torch.on);
      return;
    }
    const door = doorInfo(id);
    if (door) {
      const lowY = door.upper ? y - 1 : y;
      if (door.upper && !doorInfo(this.get(x, lowY, z))) return;
      const k = keyOf(x, lowY, z);
      const powered = isPowered(this.get, x, lowY, z) || isPowered(this.get, x, lowY + 1, z);
      if (powered === this.poweredNow.has(k)) return;
      if (powered) this.poweredNow.add(k);
      else this.poweredNow.delete(k);
      this.host.door(x, lowY, z, powered);
      return;
    }
    const trap = trapdoorInfo(id);
    const gate = gateInfo(id);
    if (trap || gate) {
      const k = keyOf(x, y, z);
      const powered = isPowered(this.get, x, y, z);
      if (powered === this.poweredNow.has(k)) return;
      if (powered) this.poweredNow.add(k);
      else this.poweredNow.delete(k);
      this.host.setBlock(x, y, z, trap ? trapdoorId(trap.top, powered, trap.facing) : gateId(powered, gate!.facing));
      this.host.sound(x, y, z, 'click');
      return;
    }
    if (id === B.TNT) {
      const k = keyOf(x, y, z);
      const powered = isPowered(this.get, x, y, z);
      if (powered && !this.poweredNow.has(k)) {
        this.poweredNow.add(k);
        this.host.tnt(x, y, z);
      } else if (!powered) this.poweredNow.delete(k);
    }
  }

  /** A torch is lit unless the block it hangs on is strongly powered, and follows with a tick of delay. */
  private updateTorch(x: number, y: number, z: number, face: number, lit: boolean): void {
    const k = keyOf(x, y, z);
    const [dx, dy, dz] = mountSupport(face);
    const supported = powerAt(this.get, x + dx, y + dy, z + dz, true, false) > 0;
    const burntUntil = this.burnt.get(k);
    if (burntUntil !== undefined && burntUntil <= this.clock) this.burnt.delete(k);
    const burning = this.burnt.has(k);
    const want = !supported && !burning;
    if (want === lit) return;
    if (want) {
      this.host.setBlock(x, y, z, mountedId(B.RTORCH_BASE, face, true));
    } else {
      this.host.setBlock(x, y, z, mountedId(B.RTORCH_BASE, face, false));
    }
    // Count the flips: a clock that races burns the torch out.
    const recent = (this.flips.get(k) ?? []).filter((t) => this.clock - t < BURNOUT_WINDOW);
    recent.push(this.clock);
    this.flips.set(k, recent);
    if (recent.length >= BURNOUT_FLIPS && !burning) {
      this.burnt.set(k, this.clock + BURNOUT_TIME);
      this.flips.delete(k);
      this.host.setBlock(x, y, z, mountedId(B.RTORCH_BASE, face, false));
      this.host.sound(x, y, z, 'fizz');
      this.timers.push({ x, y, z, due: this.clock + BURNOUT_TIME });
    }
    this.notify(x, y, z);
  }

  /** Re-checks to run later (a burnt-out torch lighting up again). */
  private timers: { x: number; y: number; z: number; due: number }[] = [];

  // ---- buttons and plates --------------------------------------------------------------

  private releaseButtons(): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if (t.due > this.clock) continue;
      this.timers.splice(i, 1);
      this.notify(t.x, t.y, t.z);
    }
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      b.t -= REDSTONE_TICK;
      if (b.t > 1e-9) continue;
      this.buttons.splice(i, 1);
      const btn = buttonInfo(this.get(b.x, b.y, b.z));
      if (!btn || !btn.on) continue;
      this.host.setBlock(b.x, b.y, b.z, mountedId(B.BUTTON_BASE, btn.face, false));
      this.host.sound(b.x, b.y, b.z, 'click');
      this.notify(b.x, b.y, b.z);
    }
  }

  private pressPlates(): void {
    for (const e of this.host.entities()) {
      const x = Math.floor(e.x);
      const y = Math.floor(e.y + 0.05);
      const z = Math.floor(e.z);
      const id = this.get(x, y, z);
      const plate = plateInfo(id);
      if (!plate || (e.item && !plate.wood)) continue;
      const k = keyOf(x, y, z);
      if (!plate.on) {
        this.host.setBlock(x, y, z, plate.wood ? B.PLATE_WOOD_ON : B.PLATE_STONE_ON);
        this.host.sound(x, y, z, 'click');
        this.notify(x, y, z);
      }
      this.pressed.set(k, { x, y, z, seen: this.clock });
    }
    for (const [k, p] of this.pressed) {
      if (this.clock - p.seen < PLATE_SECONDS) continue;
      this.pressed.delete(k);
      const plate = plateInfo(this.get(p.x, p.y, p.z));
      if (!plate || !plate.on) continue;
      this.host.setBlock(p.x, p.y, p.z, plate.wood ? B.PLATE_WOOD : B.PLATE_STONE);
      this.host.sound(p.x, p.y, p.z, 'click');
      this.notify(p.x, p.y, p.z);
    }
  }

  // ---- saving ------------------------------------------------------------------------------

  toJSON(): RedstoneState {
    return {
      buttons: this.buttons.map((b) => [b.x, b.y, b.z, b.t]),
      plates: [...this.pressed.values()].map((p) => [p.x, p.y, p.z]),
    };
  }

  load(raw: unknown): void {
    this.buttons = [];
    this.pressed.clear();
    if (!raw || typeof raw !== 'object') return;
    const s = raw as Partial<RedstoneState>;
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (Array.isArray(s.buttons)) {
      for (const b of s.buttons) if (Array.isArray(b) && b.length === 4 && b.every(num)) this.buttons.push({ x: b[0], y: b[1], z: b[2], t: b[3] });
    }
    if (Array.isArray(s.plates)) {
      for (const p of s.plates) if (Array.isArray(p) && p.length === 3 && p.every(num)) this.pressed.set(keyOf(p[0], p[1], p[2]), { x: p[0], y: p[1], z: p[2], seen: this.clock });
    }
  }
}
