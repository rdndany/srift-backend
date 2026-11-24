import { B, BLOCKS, IS_LIQUID, gateInfo, isChest, isFence, wallInfo } from './blocks';
import { HOUR_MS, MINUTE_MS, LAND_DAY_MS, type LandConfig } from './landConfig';
import { coversY, type LandClaim } from './landClaims';

/**
 * The modification ledger: the memory of what players changed, which is what makes the two halves of the system possible.
 *
 *   - Inside a claim a change is persistent (layer B). The ledger keeps the block it replaced (the baseline), so a claim that is released,
 *     revoked or hit by a change of the generator can always be dealt with, block by block.
 *   - Outside every claim a change is temporary (layer C): it gets a deadline, and the regeneration runner (landRegen.ts) puts the baseline
 *     block back when it comes, once it has checked that nobody is standing in the way.
 *
 * Changes that touch each other belong to one region, and a region is put back as a whole, so a tunnel is not left with half its walls.
 * An ore that was mined is the exception: it has a clock of its own and comes back alone (see `oreHours`).
 *
 * The ledger never reads the world itself. It is told what changed, and it is handed to a runner that knows how to look.
 */

export type ModClass = 'claimed' | 'wild';
export type ModCategory = 'excavation' | 'placed' | 'fence' | 'ore';

export interface ModEntry {
  x: number;
  y: number;
  z: number;
  /** The block the generator made here (layer A). */
  base: number;
  /** The block that is here now, as far as the ledger knows. */
  cur: number;
  cls: ModClass;
  claimId: string | null;
  region: number;
  /** The character that did it (account key), when it is known. */
  by: string | null;
  first: number;
  /** When it was last changed (ms). */
  t: number;
  /** When it may be put back (ms; 0 for claimed changes). */
  due: number;
  cat: ModCategory;
  rev: number;
}

// ---- what a block is, for the ledger --------------------------------------------------------------------------

/** Ores come back on their own clocks: the rarer, the longer. Hours; names not listed use `regen.oreHoursDefault`. */
const ORE_HOURS: Readonly<Record<string, number>> = {
  coal_ore: 12,
  iron_ore: 18,
  copper_ore: 18,
  redstone_ore: 24,
  lapis_ore: 30,
  gold_ore: 36,
  sulfur_ore: 24,
  cinnabar_ore: 30,
  crystal_ore: 48,
  emerald_ore: 60,
  diamond_ore: 72,
  ancient_debris: 96,
};

export const isOreBlock = (id: number): boolean => {
  const n = BLOCKS[id]?.name;
  return !!n && (n.endsWith('_ore') || n === 'ancient_debris');
};

export function oreHours(id: number, cfg: LandConfig): number {
  return ORE_HOURS[BLOCKS[id]?.name ?? ''] ?? cfg.regen.oreHoursDefault;
}

/** Fences, walls and gates: the things people put round a field, and then forget. */
export const isFenceLike = (id: number): boolean => isFence(id) || wallInfo(id) !== null || gateInfo(id) !== null;

/** A block that keeps things in it (the contents are what a region must never destroy). */
export const holdsItems = (id: number): boolean => id === B.FURNACE || isChest(id);

/** What kind of change this is, and with it which clock it runs on. */
export function modCategoryOf(base: number, cur: number): ModCategory {
  if (cur === B.AIR || IS_LIQUID[cur] === 1) return isOreBlock(base) ? 'ore' : 'excavation';
  return isFenceLike(cur) ? 'fence' : 'placed';
}

/** The deadline of a change made at `t`. */
export function dueFor(cat: ModCategory, base: number, t: number, cfg: LandConfig): number {
  const r = cfg.regen;
  switch (cat) {
    case 'excavation':
      return t + r.excavationHours * HOUR_MS;
    case 'placed':
      return t + r.placedHours * HOUR_MS;
    case 'fence':
      return t + r.fenceHours * HOUR_MS;
    case 'ore':
      return t + oreHours(base, cfg) * HOUR_MS;
  }
}

// ---- keys ----------------------------------------------------------------------------------------------------

const OFF = 1 << 20;
/** One number per block (21 + 21 + 8 bits fit in a double exactly), so the maps stay light. */
export const modKey = (x: number, y: number, z: number): number => ((x + OFF) * 2097152 + (z + OFF)) * 256 + y;
export function unKey(k: number): [number, number, number] {
  const y = k % 256;
  const r = (k - y) / 256;
  const z = (r % 2097152) - OFF;
  const x = (r - (r % 2097152)) / 2097152 - OFF;
  return [x, y, z];
}
const chunkOf = (x: number, z: number): number => ((x >> 4) + 65536) * 131072 + ((z >> 4) + 65536);

// ---- the regions and the clock -------------------------------------------------------------------------------

export interface Region {
  id: number;
  keys: Set<number>;
  /** The box round its changes. */
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** The latest change and the latest deadline of the changes that are not ores (they only grow; the true values are worked out when the region comes up). */
  lastT: number;
  maxDue: number;
  /** When it is next due to be looked at (the one live item of the clock), and how many times it was put off. */
  sched: number;
  postpones: number;
}

type Item = { at: number; region: number; ore: number };

/** A binary heap of what is due, soonest first. */
class Clock {
  private readonly a: Item[] = [];
  get size(): number {
    return this.a.length;
  }
  peek(): Item | undefined {
    return this.a[0];
  }
  push(it: Item): void {
    const a = this.a;
    a.push(it);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].at <= a[i].at) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Item | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].at < a[m].at) m = l;
        if (r < a.length && a[r].at < a[m].at) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export interface RecordCtx {
  claim: LandClaim | null;
  by: string | null;
  now: number;
  /** Nobody's hand (water, growth, a burning block): the entry's cur is brought up to date, its clock is left alone. */
  passive?: boolean;
}

export interface LedgerDrain {
  upserts: ModEntry[];
  deletes: number[];
}

export class ModLedger {
  readonly entries = new Map<number, ModEntry>();
  readonly regions = new Map<number, Region>();
  private readonly byChunk = new Map<number, Set<number>>();
  private readonly clock = new Clock();
  private dirty = new Set<number>();
  private gone = new Set<number>();
  private nextRegion = 1;
  /** A region id of 0 marks an ore: it belongs to no region's clock. */
  private wild = 0;
  private claimed = 0;

  constructor(private readonly cfg: LandConfig) {}

  get size(): number {
    return this.entries.size;
  }
  get wildCount(): number {
    return this.wild;
  }
  get claimedCount(): number {
    return this.claimed;
  }
  get queued(): number {
    return this.clock.size;
  }

  at(x: number, y: number, z: number): ModEntry | undefined {
    return this.entries.get(modKey(x, y, z));
  }

  /** The earliest time anything is due, or null. */
  nextDue(): number | null {
    return this.clock.peek()?.at ?? null;
  }

  private count(e: ModEntry, d: number): void {
    if (e.cls === 'wild') this.wild += d;
    else this.claimed += d;
  }

  private index(k: number, e: ModEntry): void {
    const ck = chunkOf(e.x, e.z);
    let s = this.byChunk.get(ck);
    if (!s) this.byChunk.set(ck, (s = new Set()));
    s.add(k);
  }

  private unindex(k: number, e: ModEntry): void {
    const ck = chunkOf(e.x, e.z);
    const s = this.byChunk.get(ck);
    if (!s) return;
    s.delete(k);
    if (s.size === 0) this.byChunk.delete(ck);
  }

  /** The changes in a column range (chunks), for converting and listing. */
  *inBox(x0: number, z0: number, x1: number, z1: number): IterableIterator<ModEntry> {
    for (let cz = z0 >> 4; cz <= z1 >> 4; cz++) {
      for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) {
        const s = this.byChunk.get((cx + 65536) * 131072 + (cz + 65536));
        if (!s) continue;
        for (const k of s) {
          const e = this.entries.get(k);
          if (e && e.x >= x0 && e.x <= x1 && e.z >= z0 && e.z <= z1) yield e;
        }
      }
    }
  }

  // ---- regions ----

  private join(e: ModEntry, k: number): void {
    // Every change next to this one (26 neighbours) that is wild and not an ore of its own clock shares its region.
    let found: Region | null = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const n = this.entries.get(modKey(e.x + dx, e.y + dy, e.z + dz));
          if (!n || n.cls !== 'wild' || n.region === 0) continue;
          const r = this.regions.get(n.region);
          if (!r) continue;
          found = found ? this.merge(found, r) : r;
        }
      }
    }
    if (!found) {
      found = { id: this.nextRegion++, keys: new Set(), x0: e.x, y0: e.y, z0: e.z, x1: e.x, y1: e.y, z1: e.z, lastT: e.t, maxDue: e.due, sched: 0, postpones: 0 };
      this.regions.set(found.id, found);
    }
    e.region = found.id;
    found.keys.add(k);
    found.x0 = Math.min(found.x0, e.x);
    found.y0 = Math.min(found.y0, e.y);
    found.z0 = Math.min(found.z0, e.z);
    found.x1 = Math.max(found.x1, e.x);
    found.y1 = Math.max(found.y1, e.y);
    found.z1 = Math.max(found.z1, e.z);
    found.lastT = Math.max(found.lastT, e.t);
    found.maxDue = Math.max(found.maxDue, e.due);
    if (found.sched === 0) this.schedule(found, this.readyAt(found));
  }

  private merge(a: Region, b: Region): Region {
    if (a === b) return a;
    const [big, small] = a.keys.size >= b.keys.size ? [a, b] : [b, a];
    for (const k of small.keys) {
      big.keys.add(k);
      const e = this.entries.get(k);
      if (e) e.region = big.id;
    }
    big.x0 = Math.min(big.x0, small.x0);
    big.y0 = Math.min(big.y0, small.y0);
    big.z0 = Math.min(big.z0, small.z0);
    big.x1 = Math.max(big.x1, small.x1);
    big.y1 = Math.max(big.y1, small.y1);
    big.z1 = Math.max(big.z1, small.z1);
    big.lastT = Math.max(big.lastT, small.lastT);
    big.maxDue = Math.max(big.maxDue, small.maxDue);
    big.postpones = Math.max(big.postpones, small.postpones);
    this.regions.delete(small.id);
    // The one live item of the merged region is the sooner of the two.
    if (small.sched !== 0 && (big.sched === 0 || small.sched < big.sched)) this.schedule(big, small.sched);
    return big;
  }

  private leave(e: ModEntry, k: number): void {
    const r = this.regions.get(e.region);
    if (!r) return;
    r.keys.delete(k);
    if (r.keys.size === 0) this.regions.delete(r.id);
  }

  /** When a region may be put back: after its slowest change's deadline, and after nothing has touched it for `quietHours`. */
  readyAt(r: Region): number {
    return Math.max(r.maxDue, r.lastT + this.cfg.regen.quietHours * HOUR_MS);
  }

  schedule(r: Region, at: number): void {
    r.sched = at;
    this.clock.push({ at, region: r.id, ore: 0 });
  }

  /** Work out a region's true timing from what is left in it (the aggregates only ever grow). */
  refresh(r: Region): void {
    let lastT = 0;
    let maxDue = 0;
    for (const k of r.keys) {
      const e = this.entries.get(k);
      if (!e) continue;
      lastT = Math.max(lastT, e.t);
      maxDue = Math.max(maxDue, e.due);
    }
    r.lastT = lastT;
    r.maxDue = maxDue;
  }

  // ---- recording ----

  /**
   * A block changed from whatever it was to `cur`. `base` is what the generator makes there. Inside a claim the change is persistent,
   * elsewhere it is temporary. Putting the baseline block back by hand ends the record. Returns the entry, or null when there is none now.
   */
  record(x: number, y: number, z: number, base: number, cur: number, ctx: RecordCtx): ModEntry | null {
    const k = modKey(x, y, z);
    const old = this.entries.get(k);
    if (cur === (old ? old.base : base)) {
      if (old) this.remove(k, old);
      return null;
    }
    if (old) {
      const at = ctx.passive ? old.t : ctx.now;
      old.cur = cur;
      old.t = at;
      old.rev++;
      if (ctx.by && !ctx.passive) old.by = ctx.by;
      if (ctx.claim) {
        if (old.cls === 'wild') this.convert(k, old, ctx.claim);
      } else if (old.cls === 'wild') {
        this.retime(k, old, at);
      }
      this.dirty.add(k);
      this.gone.delete(k);
      return old;
    }
    const e: ModEntry = { x, y, z, base, cur, cls: ctx.claim ? 'claimed' : 'wild', claimId: ctx.claim?.id ?? null, region: 0, by: ctx.by, first: ctx.now, t: ctx.now, due: 0, cat: modCategoryOf(base, cur), rev: 1 };
    this.entries.set(k, e);
    this.index(k, e);
    this.count(e, 1);
    if (e.cls === 'wild') this.timed(k, e, ctx.now);
    this.dirty.add(k);
    this.gone.delete(k);
    return e;
  }

  /** Give a wild change its deadline, and put it in its region (or, for an ore, on its own clock). */
  private timed(k: number, e: ModEntry, now: number): void {
    e.cat = modCategoryOf(e.base, e.cur);
    e.due = dueFor(e.cat, e.base, now, this.cfg);
    if (e.cat === 'ore') {
      e.region = 0;
      this.clock.push({ at: e.due, region: 0, ore: k });
    } else {
      this.join(e, k);
    }
  }

  /** A wild change was changed again: new category (an ore that was filled is no ore any more), new deadline. */
  private retime(k: number, e: ModEntry, now: number): void {
    const was = e.cat;
    const cat = modCategoryOf(e.base, e.cur);
    if (was !== 'ore' && cat !== 'ore') {
      e.cat = cat;
      e.due = dueFor(cat, e.base, now, this.cfg);
      const r = this.regions.get(e.region);
      if (r) {
        r.lastT = Math.max(r.lastT, now);
        r.maxDue = Math.max(r.maxDue, e.due);
      }
      return;
    }
    if (e.region !== 0) this.leave(e, k);
    e.region = 0;
    this.timed(k, e, now);
  }

  /** Forget a change (the block is back to its baseline, or the change became nobody's concern). */
  remove(k: number, e: ModEntry): void {
    if (e.cls === 'wild') this.leave(e, k);
    this.count(e, -1);
    this.entries.delete(k);
    this.unindex(k, e);
    this.dirty.delete(k);
    this.gone.add(k);
  }

  /** Make a wild change a claimed one: it stays for good, and its pending restoration is cancelled. */
  convert(k: number, e: ModEntry, claim: LandClaim): void {
    if (e.cls === 'claimed') {
      e.claimId = claim.id;
      this.dirty.add(k);
      return;
    }
    this.leave(e, k);
    this.count(e, -1);
    e.cls = 'claimed';
    this.count(e, 1);
    e.claimId = claim.id;
    e.region = 0;
    e.due = 0;
    e.rev++;
    this.dirty.add(k);
  }

  /**
   * A claim was made (or grown): every temporary change inside its volume becomes persistent. Returns how many.
   * (Items waiting in the queue for them are simply ignored when they come up: the entry is no longer wild.)
   */
  adopt(claim: LandClaim): number {
    const b = claim.polygon.box;
    let n = 0;
    for (const e of [...this.inBox(b.x0, b.z0, b.x1, b.z1)]) {
      if (e.cls !== 'wild' || !coversY(claim, e.x, e.y, e.z)) continue;
      this.convert(modKey(e.x, e.y, e.z), e, claim);
      n++;
    }
    return n;
  }

  /** The claim is gone: its changes go back to the wilderness rules, and come due at `due`. Returns how many. */
  abandon(claimId: string, now: number, due: number): number {
    let n = 0;
    for (const [k, e] of this.entries) {
      if (e.cls !== 'claimed' || e.claimId !== claimId) continue;
      this.count(e, -1);
      e.cls = 'wild';
      e.claimId = null;
      e.cat = modCategoryOf(e.base, e.cur);
      e.t = now;
      e.rev++;
      this.count(e, 1);
      if (e.cat === 'ore') {
        e.region = 0;
        e.due = Math.max(due, dueFor('ore', e.base, now, this.cfg));
        this.clock.push({ at: e.due, region: 0, ore: k });
      } else {
        e.due = due;
        this.join(e, k);
      }
      this.dirty.add(k);
      n++;
    }
    return n;
  }

  /** Changes inside a claim, as a list. */
  ofClaim(claimId: string): ModEntry[] {
    const out: ModEntry[] = [];
    for (const e of this.entries.values()) if (e.cls === 'claimed' && e.claimId === claimId) out.push(e);
    return out;
  }

  /** What has to be written down: the changed entries, and the keys of those that went. Clears both. */
  drain(): LedgerDrain {
    const upserts: ModEntry[] = [];
    for (const k of this.dirty) {
      const e = this.entries.get(k);
      if (e) upserts.push(e);
    }
    const deletes = [...this.gone];
    this.dirty = new Set();
    this.gone = new Set();
    return { upserts, deletes };
  }

  /** Put drained changes back (a write failed): they are written again with the next. */
  requeue(d: LedgerDrain): void {
    for (const e of d.upserts) if (this.entries.has(modKey(e.x, e.y, e.z))) this.dirty.add(modKey(e.x, e.y, e.z));
    for (const k of d.deletes) if (!this.entries.has(k)) this.gone.add(k);
  }

  get pendingWrites(): number {
    return this.dirty.size + this.gone.size;
  }

  /** Fill from saved rows. */
  load(rows: Iterable<ModEntry>): void {
    for (const r of rows) {
      const k = modKey(r.x, r.y, r.z);
      const e: ModEntry = { ...r, region: 0 };
      this.entries.set(k, e);
      this.index(k, e);
      this.count(e, 1);
    }
    // Regions are made again from the neighbours: they are only a way of keeping connected changes together.
    for (const [k, e] of this.entries) {
      if (e.cls !== 'wild') continue;
      if (e.cat === 'ore') this.clock.push({ at: e.due, region: 0, ore: k });
      else this.join(e, k);
    }
  }

  /**
   * The next thing that is due at `now`: an ore (with its key) or a region, with nothing left to look at when this returns null.
   * Items that are out of date (the change is gone, claimed, or its region was rescheduled) are dropped on the way.
   */
  popDue(now: number): { ore: number } | { region: Region } | null {
    for (;;) {
      const top = this.clock.peek();
      if (!top || top.at > now) return null;
      this.clock.pop();
      if (top.ore !== 0) {
        const e = this.entries.get(top.ore);
        if (!e || e.cls !== 'wild' || e.cat !== 'ore' || e.due !== top.at) continue;
        return { ore: top.ore };
      }
      const r = this.regions.get(top.region);
      if (!r || r.sched !== top.at) continue;
      this.refresh(r);
      const ready = this.readyAt(r);
      if (ready > now) {
        this.schedule(r, ready);
        continue;
      }
      r.sched = 0;
      return { region: r };
    }
  }

  /** Put an ore's clock back (it could not come back yet). */
  deferOre(k: number, at: number): void {
    const e = this.entries.get(k);
    if (!e) return;
    e.due = at;
    this.clock.push({ at, region: 0, ore: k });
    this.dirty.add(k);
  }

  /** Put a region off until `at`. */
  deferRegion(r: Region, at: number): void {
    r.postpones++;
    this.schedule(r, at);
  }

  /** A change of the ledger's own that must reach the database (the runner changed an entry). */
  touch(k: number): void {
    if (this.entries.has(k)) this.dirty.add(k);
  }

  stats(): { total: number; wild: number; claimed: number; regions: number; queued: number } {
    return { total: this.entries.size, wild: this.wild, claimed: this.claimed, regions: this.regions.size, queued: this.clock.size };
  }
}

export { HOUR_MS, MINUTE_MS, LAND_DAY_MS };
