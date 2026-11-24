import { B, campfireInfo, isChest, signInfo } from './blocks';
import { cleanSignLines, isBlankSign } from './signText';
import { Campfire, type CampfireFoodView } from './campfire';
import { Container, cloneStack, makeStack, type ItemStack } from './inventory';
import { Furnace } from './smelting';

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Per-block state for chests and furnaces, keyed by position. */
export class BlockEntities {
  private chests = new Map<string, Container>();
  /** The other half of a double chest, both ways. Both keys share one 54-slot container. */
  private pair = new Map<string, string>();
  private furnaces = new Map<string, Furnace>();
  private campfires = new Map<string, Campfire>();
  /** What is written on the signs (four lines each), by position. A sign with nothing written has no entry. */
  private signs = new Map<string, string[]>();
  /** Goes up every time any sign's text changes (a sign written, wiped or broken): a connection that has seen this number has seen every sign. */
  signRev = 0;
  /**
   * Chests that generated with loot and were already rolled (opened or broken). Remembered so that
   * emptying one, or breaking it and placing another, never makes it fill up again.
   */
  private rolled = new Set<string>();

  /**
   * Supplies the contents of a chest that came with the world (a dungeon's, a village's), or null
   * for an ordinary chest. Set by the realm from the world generator.
   */
  loot: ((x: number, y: number, z: number) => (ItemStack | null)[] | null) | null = null;

  /** Roll a generated chest's loot the first time it is needed. */
  private roll(k: string, x: number, y: number, z: number): Container | null {
    if (this.rolled.has(k) || !this.loot) return null;
    const slots = this.loot(x, y, z);
    if (!slots) return null;
    this.rolled.add(k);
    const c = new Container(27);
    slots.forEach((s, i) => c.set(i, s));
    return c;
  }

  chest(x: number, y: number, z: number): Container {
    const k = key(x, y, z);
    let c = this.chests.get(k);
    if (!c) this.chests.set(k, (c = this.roll(k, x, y, z) ?? new Container(27)));
    return c;
  }

  /**
   * Two single chests become one double chest. The right half keeps slots 0–26 and the left half slots 27–53,
   * and both positions return that same container. The old containers are emptied so nothing is left in them.
   */
  joinChests(rx: number, ry: number, rz: number, lx: number, ly: number, lz: number): void {
    const rk = key(rx, ry, rz);
    const lk = key(lx, ly, lz);
    const right = this.chest(rx, ry, rz);
    const left = this.chest(lx, ly, lz);
    if (right === left) return;
    const big = new Container(54);
    for (let i = 0; i < 27; i++) {
      const a = right.get(i);
      const b = left.get(i);
      if (a) big.set(i, cloneStack(a));
      if (b) big.set(27 + i, cloneStack(b));
      right.set(i, null);
      left.set(i, null);
    }
    this.chests.set(rk, big);
    this.chests.set(lk, big);
    this.pair.set(rk, lk);
    this.pair.set(lk, rk);
    if (this.rolled.has(rk) || this.rolled.has(lk)) {
      this.rolled.add(rk);
      this.rolled.add(lk);
    }
  }

  furnace(x: number, y: number, z: number): Furnace {
    const k = key(x, y, z);
    let f = this.furnaces.get(k);
    if (!f) this.furnaces.set(k, (f = new Furnace()));
    return f;
  }

  campfire(x: number, y: number, z: number): Campfire {
    const k = key(x, y, z);
    let c = this.campfires.get(k);
    if (!c) this.campfires.set(k, (c = new Campfire()));
    return c;
  }

  /** The four lines written on the sign at a block (blank ones when there is nothing written). */
  signAt(x: number, y: number, z: number): string[] {
    return this.signs.get(key(x, y, z))?.slice() ?? ['', '', '', ''];
  }

  /** Write on a sign: the lines are cleaned first (see signText.ts), and a sign left blank keeps nothing. Returns what was kept. */
  setSign(x: number, y: number, z: number, raw: unknown): string[] {
    const lines = cleanSignLines(raw) ?? ['', '', '', ''];
    const k = key(x, y, z);
    const had = this.signs.get(k);
    if (isBlankSign(lines)) {
      if (had) {
        this.signs.delete(k);
        this.signRev++;
      }
      return lines;
    }
    if (!had || had.some((l, i) => l !== lines[i])) {
      this.signs.set(k, lines);
      this.signRev++;
    }
    return lines;
  }

  /** The signs with writing on them within  blocks of (x, z). */
  signsNear(x: number, z: number, r: number): { x: number; y: number; z: number; lines: string[] }[] {
    const out: { x: number; y: number; z: number; lines: string[] }[] = [];
    for (const [k, lines] of this.signs) {
      const [sx, sy, sz] = k.split(',').map(Number);
      if (Math.abs(sx + 0.5 - x) <= r && Math.abs(sz + 0.5 - z) <= r) out.push({ x: sx, y: sy, z: sz, lines: lines.slice() });
    }
    return out;
  }

  /** Take a sign's writing away (its block is gone). */
  forgetSign(x: number, y: number, z: number): void {
    if (this.signs.delete(key(x, y, z))) this.signRev++;
  }

  /** Every sign with writing on it (to be checked against the world). */
  signPositions(): [number, number, number][] {
    return [...this.signs.keys()].map((k) => k.split(',').map(Number) as [number, number, number]);
  }

  /** Campfires that have food on them. Does not create an empty one. */
  foods(): CampfireFoodView[] {
    const out: CampfireFoodView[] = [];
    for (const [k, c] of this.campfires) {
      if (!c.busy) continue;
      const [x, y, z] = k.split(',').map(Number);
      out.push({ x, y, z, slots: c.cooking().map((id) => id ?? 0) });
    }
    return out;
  }

  /** How many items the chest or furnace at a block holds (nothing is made for one that has never been opened). */
  itemsAt(id: number, x: number, y: number, z: number): number {
    const k = key(x, y, z);
    if (isChest(id)) return this.chests.get(k)?.totalItems() ?? 0;
    if (id === B.FURNACE) return this.furnaces.get(k)?.container.totalItems() ?? 0;
    return 0;
  }

  /** Called when a block is broken: returns every stack that must be dropped. */
  remove(id: number, x: number, y: number, z: number): ItemStack[] {
    const k = key(x, y, z);
    if (isChest(id)) {
      const c = this.chests.get(k) ?? this.roll(k, x, y, z);
      const partner = this.pair.get(k);
      this.chests.delete(k);
      this.pair.delete(k);
      this.rolled.add(k);
      if (partner && c && this.chests.get(partner) === c) {
        // One shared inventory: it is dropped once, and the half that remains is an empty single chest.
        this.chests.set(partner, new Container(27));
        this.pair.delete(partner);
        this.rolled.add(partner);
      }
      return c ? c.drain() : [];
    }
    if (id === B.FURNACE) {
      const f = this.furnaces.get(k);
      this.furnaces.delete(k);
      return f ? f.container.drain() : [];
    }
    if (signInfo(id)) {
      this.forgetSign(x, y, z);
      return [];
    }
    if (campfireInfo(id)) {
      const c = this.campfires.get(k);
      this.campfires.delete(k);
      return c ? c.drain() : [];
    }
    return [];
  }

  /** Forget every chest and furnace (and the memory of their loot) at the positions the test says yes to. */
  clearWhere(test: (x: number, y: number, z: number) => boolean): void {
    const gone = (k: string): boolean => {
      const [x, y, z] = k.split(',').map(Number);
      return test(x, y, z);
    };
    for (const m of [this.chests, this.furnaces, this.campfires]) for (const k of [...m.keys()]) if (gone(k)) m.delete(k);
    for (const k of [...this.pair.keys()]) if (gone(k)) this.pair.delete(k);
    for (const k of [...this.rolled]) if (gone(k)) this.rolled.delete(k);
    for (const k of [...this.signs.keys()]) {
      if (!gone(k)) continue;
      this.signs.delete(k);
      this.signRev++;
    }
  }

  tick(dt: number): void {
    for (const f of this.furnaces.values()) f.tick(dt);
  }

  /**
   * Cook what is on each campfire. A finished item is handed to `pop` so it can fall into the world.
   * A campfire whose block is gone drops whatever was still raw.
   */
  tickCampfires(dt: number, blockAt: (x: number, y: number, z: number) => number, pop: (stack: ItemStack, x: number, y: number, z: number) => void): void {
    for (const [k, c] of [...this.campfires]) {
      const [x, y, z] = k.split(',').map(Number);
      const info = campfireInfo(blockAt(x, y, z));
      if (!info) {
        for (const s of c.drain()) pop(s, x, y, z);
        this.campfires.delete(k);
        continue;
      }
      for (const id of c.tick(dt, info.lit)) pop(makeStack(id, 1), x, y, z);
      if (!c.busy) this.campfires.delete(k);
    }
  }

  toJSON(): unknown {
    const chests: Record<string, unknown> = {};
    const chestPairs: Record<string, string> = {};
    // A rolled chest is kept even when empty: its entry is what stops the loot from regenerating.
    // A double chest is stored once, on the earlier key, and the other half points at it.
    for (const [k, c] of this.chests) {
      const partner = this.pair.get(k);
      if (partner && c.size === 54) {
        if (k < partner) {
          chests[k] = c.toJSON();
          chestPairs[k] = partner;
        }
        continue;
      }
      if (!c.isEmpty() || this.rolled.has(k)) chests[k] = c.toJSON();
    }
    const furnaces: Record<string, unknown> = {};
    for (const [k, f] of this.furnaces) if (!f.container.isEmpty()) furnaces[k] = f.toJSON();
    const campfires: Record<string, unknown> = {};
    for (const [k, c] of this.campfires) if (c.busy) campfires[k] = c.toJSON();
    const out: { chests: Record<string, unknown>; furnaces: Record<string, unknown>; rolled?: string[]; campfires?: Record<string, unknown>; chestPairs?: Record<string, string>; signs?: Record<string, string[]> } = { chests, furnaces };
    if (Object.keys(chestPairs).length > 0) out.chestPairs = chestPairs;
    if (this.rolled.size > 0) out.rolled = [...this.rolled];
    if (Object.keys(campfires).length > 0) out.campfires = campfires;
    if (this.signs.size > 0) out.signs = Object.fromEntries(this.signs);
    return out;
  }

  loadJSON(data: unknown): void {
    const d = data as { chests?: Record<string, unknown>; furnaces?: Record<string, unknown>; rolled?: string[]; campfires?: Record<string, unknown>; chestPairs?: Record<string, string>; signs?: Record<string, unknown> } | null;
    if (!d || typeof d !== 'object') return;
    for (const k of Array.isArray(d.rolled) ? d.rolled : []) if (typeof k === 'string') this.rolled.add(k);
    const linked = new Set<string>();
    for (const [k, partner] of Object.entries(d.chestPairs ?? {})) {
      if (typeof partner !== 'string') continue;
      const c = new Container(54);
      c.loadJSON(d.chests?.[k]);
      this.chests.set(k, c);
      this.chests.set(partner, c);
      this.pair.set(k, partner);
      this.pair.set(partner, k);
      linked.add(k);
      linked.add(partner);
    }
    for (const [k, v] of Object.entries(d.chests ?? {})) {
      if (linked.has(k)) continue;
      const c = new Container(Array.isArray(v) && v.length > 27 ? 54 : 27);
      c.loadJSON(v);
      this.chests.set(k, c);
    }
    for (const [k, v] of Object.entries(d.furnaces ?? {})) {
      const f = new Furnace();
      f.loadJSON(v as never);
      this.furnaces.set(k, f);
    }
    for (const [k, v] of Object.entries(d.signs ?? {})) {
      if (!/^-?\d+,-?\d+,-?\d+$/.test(k)) continue;
      const lines = cleanSignLines(v);
      if (lines && !isBlankSign(lines)) this.signs.set(k, lines);
    }
    for (const [k, v] of Object.entries(d.campfires ?? {})) {
      const c = new Campfire();
      c.loadJSON(v);
      if (c.busy) this.campfires.set(k, c);
    }
  }
}
