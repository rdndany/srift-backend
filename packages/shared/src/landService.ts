import { B, BLOCKS, IS_LIQUID, isAnvil, isChest, isSwitchable, leverInfo, buttonInfo } from './blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from './chunk';
import { LAND_DAY_MS, HOUR_MS, type LandConfig } from './landConfig';
import {
  ClaimIndex,
  GRANTABLE_ROLES,
  NO_PERMS,
  ROLE_PERMS,
  coversY,
  permsIn,
  roleIn,
  type Actor,
  type ClaimStatus,
  type Grant,
  type LandClaim,
  type Perms,
  type Role,
} from './landClaims';
import { POLYGON_FAULT_TEXT, analyzePolygon, eachCell, polygonContains, polygonHas, polygonNear, rasterize, type Polygon, type PolygonFault, type Pt } from './landGeometry';
import { buildFence, ownerSignLines, planFence, removeFence, type FenceResult, type FenceWorld } from './landFence';
import { ModLedger, holdsItems, modKey, type LedgerDrain, type ModEntry } from './landLedger';
import { emptyStats, regenStep, type RegenEnv, type RegenStats } from './landRegen';
import type { WorldGenerator } from './worldgen';

/**
 * The land: claims, who may change what, and the memory of what was changed. One `LandService` per world, owned by the server's room, so
 * every question about land has one authoritative answer. Nothing here knows about sockets or screens; the room asks, and tells the
 * clients what the answers were.
 *
 * Auren is never touched here directly: a purchase is handed an `Econ` that says what the buyer has and takes it, and the whole
 * purchase (the Auren, the claim and the record of the transaction) is written by the store in one transaction, so a crash leaves
 * either all of it or none of it.
 */

// ---- storage records ----------------------------------------------------------------------------------------------

export interface ClaimRecord {
  id: string;
  world: string;
  ownerType: 'player' | 'guild';
  ownerId: string;
  ownerName: string;
  name: string;
  vertices: [number, number][];
  depth: number;
  height: number;
  /** The original ground of every block of the claim's box, as base64 of 16-bit numbers. */
  ground: string;
  price: number;
  paid: number;
  createdAt: number;
  updatedAt: number;
  status: ClaimStatus;
  releaseAt: number | null;
  rev: number;
  grants: Grant[];
  publicPerms: Perms;
  guildRole: 'builder' | 'visitor';
  lastActive: number;
}

export type TxnState = 'pending' | 'committed' | 'failed' | 'aborted';
export interface TxnRecord {
  id: string;
  world: string;
  playerKey: string;
  claimId: string | null;
  kind: 'purchase' | 'expand' | 'refund' | 'adopt';
  amount: number;
  idem: string;
  state: TxnState;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecoveryRecord {
  id: string;
  world: string;
  ownerKey: string;
  x: number;
  y: number;
  z: number;
  /** The stacks (`Container.toJSON`). */
  items: unknown;
  createdAt: number;
}

export interface AdminLogRecord {
  at: number;
  world: string;
  admin: string;
  action: string;
  detail: string;
}

export interface LandStore {
  loadClaims(world: string): ClaimRecord[];
  saveClaim(rec: ClaimRecord): void;
  loadMods(world: string): ModEntry[];
  /** Write the drained changes of the ledger as one transaction. */
  writeMods(world: string, d: LedgerDrain): void;
  /** Forget every temporary change (the generator changed: the baseline they were measured against is gone). */
  clearWild(world: string): void;
  txnByIdem(world: string, playerKey: string, idem: string): TxnRecord | null;
  txnById(world: string, id: string): TxnRecord | null;
  beginTxn(t: TxnRecord): void;
  /** One transaction: the purchase is committed, the claim is written, the buyer's save (Auren) is written. All or nothing. */
  commitTxn(c: { txn: TxnRecord; claim: ClaimRecord; player: [key: string, value: unknown] | null }): void;
  endTxn(world: string, id: string, state: 'failed' | 'aborted' | 'committed', note: string, at: number): void;
  pendingTxns(world: string): TxnRecord[];
  recentTxns(world: string, limit: number, playerKey?: string): TxnRecord[];
  addRecovery(r: RecoveryRecord): void;
  recoveryOf(world: string, ownerKey: string): RecoveryRecord[];
  deleteRecovery(world: string, id: string): void;
  getMeta(world: string, key: string): unknown | null;
  setMeta(world: string, key: string, value: unknown): void;
  log(r: AdminLogRecord): void;
  adminLog(world: string, limit: number): AdminLogRecord[];
}

// ---- what a client is told ------------------------------------------------------------------------------------------

export type LandStatus = 'available' | 'invalid' | 'protected' | 'overlap' | 'limit' | 'funds' | 'guest' | 'far' | 'nosurveyor';

export interface LandPreview {
  ok: boolean;
  status: LandStatus;
  text: string;
  corners: number;
  area: number;
  pricePerBlock: number;
  price: number;
  balance: number;
  depth: number;
  maxArea: number;
  /** What the player may still claim: claims and blocks. */
  claimsLeft: number;
  areaLeft: number;
  /** Extra cost of growing a claim (a preview made for an expansion). */
  expanding?: string;
  /** Where the trouble is: the index of the corner for a fault of shape, or a block in the way. */
  at?: number;
}

export interface LandClaimView {
  id: string;
  name: string;
  /** What the owner is called. */
  owner: string;
  /** 'mine': yours. 'guild': your guild's. 'shared': somebody else's where you may build. 'other': somebody else's. */
  kind: 'mine' | 'guild' | 'shared' | 'other';
  role: Role;
  vertices: [number, number][];
  area: number;
  /** The box, for finding it on the map. */
  box: [number, number, number, number];
  status: ClaimStatus;
  releaseAt: number | null;
  depth: number;
  rev: number;
  /** What you may do here. */
  can: Perms;
  /** Whether others besides the owner have rights here. */
  shared: boolean;
  price: number;
  paid: number;
  createdAt: number;
}

export interface LandDetail extends LandClaimView {
  grants: Grant[];
  publicPerms: Perms;
  guildRole: 'builder' | 'visitor';
  /** What it would cost to release (the refund) and the changes held in it. */
  refund: number;
  changes: number;
}

export interface LandResult {
  ok: boolean;
  code: string;
  text: string;
  claim?: LandClaimView;
  /** Auren taken. */
  charged?: number;
  replay?: boolean;
}

export interface Econ {
  balance(): number;
  /** Take the Auren from the buyer (in memory). False when it cannot. */
  charge(n: number): boolean;
  /** Give back what `charge` took (in memory) after a write failed. */
  refund(n: number): void;
  /** The buyer's save as it is now, to be written with the purchase. Null for a buyer that has no stored save. */
  save(): [key: string, value: unknown] | null;
}

export interface LandOptions {
  world: string;
  cfg: LandConfig;
  store: LandStore;
  generator: WorldGenerator;
  /** Read and write the world. */
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  now(): number;
  rand?: () => number;
  /** Where the players are (feet). */
  players(): Iterable<{ x: number; y: number; z: number }>;
  /** How many items the container at a block holds. */
  itemsIn?(x: number, y: number, z: number): number;
  /** Take the contents out of a container into stacks (JSON), leaving it empty. */
  emptyContainer?(x: number, y: number, z: number): unknown | null;
  /** The guild a character is in, and its rank. */
  guildOf?(account: string): { id: string; name: string; rank: number } | null;
  guildName?(id: string): string | null;
  /** What a character may claim beyond the defaults (the game's own progression, if it has one). */
  limitsFor?(account: string): { maxClaims?: number; maxArea?: number; maxTotalArea?: number } | null;
  /** Pay a refund to a character who may be offline (the room knows how). Return false if it could not. */
  payOut?(account: string, amount: number): boolean;
  /** Write the text of a sign the land has put up (the room keeps sign text as a block entity). */
  setSign?(x: number, y: number, z: number, lines: string[]): void;
  /** Forget the text of a sign the land has taken down. */
  forgetSign?(x: number, y: number, z: number): void;
}

// ---- helpers ----------------------------------------------------------------------------------------------------------

const toBase64 = (a: Int16Array): string => {
  const bytes = new Uint8Array(a.length * 2);
  for (let i = 0; i < a.length; i++) {
    bytes[i * 2] = a[i] & 255;
    bytes[i * 2 + 1] = (a[i] >> 8) & 255;
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};

const fromBase64 = (text: string, n: number): Int16Array | null => {
  let s: string;
  try {
    s = atob(text);
  } catch {
    return null;
  }
  if (s.length !== n * 2) return null;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = ((s.charCodeAt(i * 2 + 1) << 8) | s.charCodeAt(i * 2)) << 16 >> 16;
  return out;
};

const cleanName = (raw: unknown, fallback: string): string => {
  if (typeof raw !== 'string') return fallback;
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return s.length >= 2 ? s : fallback;
};

/** The baseline: the blocks the generator makes, remembered for a few chunks at a time. */
export class Baseline {
  private readonly cache = new Map<number, Uint16Array>();
  constructor(
    private readonly gen: WorldGenerator,
    private readonly keep = 64,
  ) {}
  at(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_HEIGHT) return B.AIR;
    const cx = x >> 4;
    const cz = z >> 4;
    const k = (cx + 65536) * 131072 + (cz + 65536);
    let c = this.cache.get(k);
    if (c) {
      this.cache.delete(k);
      this.cache.set(k, c);
    } else {
      c = this.gen.generateChunk(cx, cz);
      this.cache.set(k, c);
      if (this.cache.size > this.keep) this.cache.delete(this.cache.keys().next().value as number);
    }
    return c[blockIndex(x & 15, y, z & 15)];
  }
  clear(): void {
    this.cache.clear();
  }
}

/** A rectangle an administrator keeps free of claims. */
export interface Reserved {
  id: string;
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Kept free for an old build that has no owner yet (see `scanLegacy`): only `adopt` may claim it. */
  legacy?: boolean;
}

/** A piece of the server's own territory, for a client to draw: nobody can buy or change it. */
export interface ProtectedZone {
  id: string;
  name: string;
  /** 'town': a made place (a town, a vault). 'landmark': ground kept free round one. 'reserved': set aside by an administrator. */
  kind: 'town' | 'landmark' | 'reserved';
  box: [number, number, number, number];
  vertices: [number, number][];
}

/** An old build: changes to the world from before there was land, which belong to nobody (and which nothing ever regenerates). */
export interface LegacySite {
  id: number;
  box: { x0: number; z0: number; x1: number; z1: number };
  blocks: number;
}

/** What a right-click on a block is, for the permission it needs. */
export type UseKind = 'container' | 'station' | 'door' | 'other';
export function useKind(id: number): UseKind {
  if (isChest(id) || id === B.FURNACE) return 'container';
  if (id === B.CRAFTING_TABLE || id === B.ENCHANTING_TABLE || id === B.GRINDSTONE || isAnvil(id)) return 'station';
  if (isSwitchable(id) || leverInfo(id) !== null || buttonInfo(id) !== null) return 'door';
  return 'other';
}

/** Placed things that are dangerous at the edge of somebody's land. */
const GRIEF_BLOCKS: ReadonlySet<number> = new Set<number>([B.TNT, B.LAVA, B.FIRE]);

export type BuildAct = 'break' | 'place';

export interface Decision {
  ok: boolean;
  /** 'claim': inside somebody's land. 'band': in the strip at its edge. */
  why?: 'claim' | 'band';
  owner?: string;
  claimId?: string;
}

const OK: Decision = { ok: true };

export const MESSAGES = {
  protectedProperty: 'Protected Property — You do not have permission to modify this land.',
  band: 'This ground borders somebody\u2019s land: you cannot dig here.',
  wilderness: 'Unclaimed wilderness: changes made here may regenerate.',
  claimed: 'Land Claimed! Your property is now protected.',
  funds: 'Not enough Auren.',
  tooBig: 'Selected area exceeds your current land limit.',
  overlap: 'This land already belongs to another owner.',
  cannotClaim: 'This territory cannot be claimed.',
  available: 'Available Land',
} as const;

export class LandService {
  readonly cfg: LandConfig;
  readonly index: ClaimIndex;
  readonly ledger: ModLedger;
  readonly baseline: Baseline;
  private readonly o: LandOptions;
  private readonly rand: () => number;
  private paused = false;
  private lastRegen = 0;
  private lastSweep = 0;
  private readonly inflight = new Set<string>();
  private readonly dirtyClaims = new Set<string>();
  /** Claims that changed since the room last told the clients. */
  readonly changed = new Set<string>();
  lastStep: RegenStats = emptyStats();
  totals: RegenStats = emptyStats();

  constructor(opts: LandOptions) {
    this.o = opts;
    this.cfg = opts.cfg;
    this.rand = opts.rand ?? Math.random;
    this.index = new ClaimIndex(opts.cfg.edgeBuffer);
    this.ledger = new ModLedger(opts.cfg);
    this.baseline = new Baseline(opts.generator);
  }

  get world(): string {
    return this.o.world;
  }

  /**
   * Whose hand is changing a block right now (an account), set around a player's edit by `GuardedWorld` so the room's `onChange` can
   * attribute it. Null outside one: the change is nobody's (water, fire, a creeper, growth).
   */
  actor: string | null = null;
  withActor<T>(account: string | null, fn: () => T): T {
    const was = this.actor;
    this.actor = account;
    try {
      return fn();
    } finally {
      this.actor = was;
    }
  }

  // ---- loading and saving -------------------------------------------------------------------------------------------

  /** Read claims and changes, and make good what a crash could have left half done. */
  load(): void {
    const { store, world } = this.o;
    for (const rec of store.loadClaims(world)) {
      const c = this.fromRecord(rec);
      if (c && (c.status === 'active' || c.status === 'releasing')) this.index.add(c);
    }
    this.ledger.load(store.loadMods(world));
    // A purchase that stopped half way never charged anybody (the charge is written with the claim): it is simply closed.
    for (const t of store.pendingTxns(world)) {
      const claim = t.claimId ? this.index.get(t.claimId) : null;
      store.endTxn(world, t.id, claim && claim.paid > 0 ? 'committed' : 'aborted', claim ? 'found the claim after a restart' : 'interrupted before it was written', this.o.now());
    }
    // A change that was inside a claim when the server stopped but was written before the claim reached it.
    for (const c of this.index.all()) this.ledger.adopt(c);
    this.paused = store.getMeta(world, 'paused') === true;
    const exp = store.getMeta(world, 'expiring');
    if (Array.isArray(exp)) for (const id of exp) if (typeof id === 'string') this.expiring.add(id);
    const reserved = store.getMeta(world, 'reserved');
    if (Array.isArray(reserved)) {
      for (const r of reserved as Reserved[]) {
        if (r && typeof r.id === 'string' && [r.x0, r.z0, r.x1, r.z1].every(Number.isFinite)) this.reservedList.push({ id: r.id, name: String(r.name ?? '').slice(0, 40), x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, ...(r.legacy === true ? { legacy: true } : {}) });
      }
    }
  }

  // ---- places an administrator keeps free of claims ------------------------------------------------------------------

  private readonly reservedList: Reserved[] = [];
  /** Claims whose release is the policy's (the owner stayed away), not the owner's choice: coming back undoes only these. Kept in the store. */
  private readonly expiring = new Set<string>();
  private saveExpiring(): void {
    this.o.store.setMeta(this.o.world, 'expiring', [...this.expiring]);
  }

  /** Keep a rectangle free of claims (a market square, a road, an event ground). The land under it stays the wilderness's. */
  reserve(admin: string, name: string, box: { x0: number; z0: number; x1: number; z1: number }, legacy = false): LandResult {
    if (![box.x0, box.z0, box.x1, box.z1].every(Number.isFinite) || this.reservedList.length >= 200) return { ok: false, code: 'invalid', text: 'That is not a region.' };
    const r: Reserved = { id: `rs_${this.newId().slice(3)}`, name: name.slice(0, 40) || 'Reserved', x0: Math.min(box.x0, box.x1), z0: Math.min(box.z0, box.z1), x1: Math.max(box.x0, box.x1), z1: Math.max(box.z0, box.z1), ...(legacy ? { legacy: true } : {}) };
    this.reservedList.push(r);
    this.o.store.setMeta(this.o.world, 'reserved', this.reservedList);
    this.o.store.log({ at: this.o.now(), world: this.o.world, admin, action: 'reserve', detail: `${r.id} ${r.name} ${r.x0},${r.z0}..${r.x1},${r.z1}` });
    return { ok: true, code: 'ok', text: `Reserved ${r.name} (${r.id}).` };
  }

  unreserve(admin: string, id: string): LandResult {
    const i = this.reservedList.findIndex((r) => r.id === id);
    if (i < 0) return { ok: false, code: 'unknown', text: 'No such region.' };
    const [r] = this.reservedList.splice(i, 1);
    this.o.store.setMeta(this.o.world, 'reserved', this.reservedList);
    this.o.store.log({ at: this.o.now(), world: this.o.world, admin, action: 'unreserve', detail: `${r.id} ${r.name}` });
    return { ok: true, code: 'ok', text: `Released ${r.name}.` };
  }

  reserved(): readonly Reserved[] {
    return this.reservedList;
  }

  // ---- builds from before there was land ----------------------------------------------------------------------------

  private sites: LegacySite[] = [];

  /** The sites found by the last `scanLegacy`. */
  legacySites(): readonly LegacySite[] {
    return this.sites;
  }

  /**
   * Find the old builds: blocks that were put into the world before land was kept (nobody's: the ledger never saw them, no claim has them).
   * `diff` is every block that differs from the generated terrain, as [x, y, z, id, ...] (`HeadlessWorld.diffAgainstTerrain`). Nothing
   * regenerates these, ever, but until somebody owns them anybody could buy the ground under them, so they are listed, and can be kept
   * free (`reserveLegacy`) until an administrator hands each to the one who built it (`adopt`). Neighbouring chunks make one site; a site
   * needs `minBlocks` placed blocks (a few stray ones are not a house).
   */
  scanLegacy(diff: readonly number[], minBlocks = 40): LegacySite[] {
    const g = this.o.generator;
    const cells = new Map<number, { cx: number; cz: number; n: number; x0: number; z0: number; x1: number; z1: number }>();
    for (let i = 0; i + 3 < diff.length; i += 4) {
      const x = diff[i];
      const y = diff[i + 1];
      const z = diff[i + 2];
      const id = diff[i + 3];
      if (id === B.AIR || IS_LIQUID[id]) continue; // digging and water are not a build
      if (this.index.claimAt(x, z) || this.ledger.at(x, y, z)) continue; // owned, or the wilderness's (it regenerates)
      if (g.instanceAt(x, z) >= 0 || g.zoneAt(x, y, z) !== null) continue; // the world's own places
      const cx = x >> 4;
      const cz = z >> 4;
      const k = (cx + 65536) * 131072 + (cz + 65536);
      const c = cells.get(k);
      if (c) {
        c.n++;
        c.x0 = Math.min(c.x0, x);
        c.z0 = Math.min(c.z0, z);
        c.x1 = Math.max(c.x1, x);
        c.z1 = Math.max(c.z1, z);
      } else cells.set(k, { cx, cz, n: 1, x0: x, z0: z, x1: x, z1: z });
    }
    const out: LegacySite[] = [];
    const done = new Set<number>();
    for (const [k, start] of cells) {
      if (done.has(k)) continue;
      done.add(k);
      const stack = [start];
      const site: LegacySite = { id: 0, box: { x0: start.x0, z0: start.z0, x1: start.x1, z1: start.z1 }, blocks: 0 };
      while (stack.length) {
        const c = stack.pop()!;
        site.blocks += c.n;
        site.box.x0 = Math.min(site.box.x0, c.x0);
        site.box.z0 = Math.min(site.box.z0, c.z0);
        site.box.x1 = Math.max(site.box.x1, c.x1);
        site.box.z1 = Math.max(site.box.z1, c.z1);
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nk = (c.cx + dx + 65536) * 131072 + (c.cz + dz + 65536);
            const n = cells.get(nk);
            if (n && !done.has(nk)) {
              done.add(nk);
              stack.push(n);
            }
          }
        }
      }
      if (site.blocks >= minBlocks) out.push(site);
    }
    out.sort((a, b) => b.blocks - a.blocks);
    out.forEach((s, i) => (s.id = i + 1));
    this.sites = out;
    return out;
  }

  /** The rectangle to claim for a site: its builds and a margin (the garden, the fence). */
  siteBox(site: LegacySite, margin = 3): { x0: number; z0: number; x1: number; z1: number } {
    const b = site.box;
    return { x0: b.x0 - margin, z0: b.z0 - margin, x1: b.x1 + margin, z1: b.z1 + margin };
  }

  /** Keep every site found by the last scan free of claims until it is adopted. Sites already kept free are left alone. */
  reserveLegacy(admin: string): number {
    let n = 0;
    for (const s of this.sites) {
      const b = this.siteBox(s);
      if (this.reservedList.some((r) => r.legacy && r.x0 === b.x0 && r.z0 === b.z0 && r.x1 === b.x1 && r.z1 === b.z1)) continue;
      if (this.reserve(admin, `Old build #${s.id}`, b, true).ok) n++;
    }
    return n;
  }

  /**
   * Hand an old build to the one who built it, for nothing: a claim like any other (the Auren paid is 0, so letting it go gives nothing
   * back). The corners are checked as a purchase's are, except that the count and the total area do not count and that the places kept
   * free for old builds are open to it. The blocks are not touched. A copy of every claim is kept first (see `backups`).
   */
  adopt(admin: string, req: { account: string; ownerName: string; name: string; vertices: unknown }): LandResult {
    const r = this.assess(req.account, req.vertices, Number.MAX_SAFE_INTEGER, { carries: true, adopting: true });
    if (!r.polygon || !r.ground || !r.preview.ok) return { ok: false, code: r.preview.status, text: r.preview.text };
    const now = this.o.now();
    const { store, world } = this.o;
    this.backup(`before adopting for ${req.ownerName}`);
    const id = this.newId();
    const claim: LandClaim = {
      id,
      world,
      ownerType: 'player',
      ownerId: req.account,
      ownerName: req.ownerName,
      name: cleanName(req.name, `${req.ownerName}\u2019s Land`),
      polygon: r.polygon,
      ground: r.ground,
      depth: this.cfg.depth,
      height: this.cfg.height,
      price: 0,
      paid: 0,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      releaseAt: null,
      rev: 1,
      grants: [],
      publicPerms: { ...NO_PERMS },
      guildRole: 'builder',
      lastActive: now,
    };
    const txn: TxnRecord = { id: `tx_${this.newId()}`, world, playerKey: req.account, claimId: id, kind: 'adopt', amount: 0, idem: `adopt:${id}`, state: 'committed', note: `by ${admin}`, createdAt: now, updatedAt: now };
    try {
      store.commitTxn({ txn, claim: this.toRecord(claim), player: null });
    } catch (err) {
      console.error('[solrift] writing an adopted claim failed', err);
      return { ok: false, code: 'error', text: 'The land office could not write the deed.' };
    }
    this.index.add(claim);
    const kept = this.ledger.adopt(claim);
    // What was kept free for old builds under this claim is free no more.
    const b = r.polygon.box;
    const freed = this.reservedList.filter((x) => x.legacy && x.x0 <= b.x1 && x.x1 >= b.x0 && x.z0 <= b.z1 && x.z1 >= b.z0);
    if (freed.length > 0) {
      for (const x of freed) this.reservedList.splice(this.reservedList.indexOf(x), 1);
      store.setMeta(world, 'reserved', this.reservedList);
    }
    this.sites = this.sites.filter((s) => !(s.box.x0 >= b.x0 && s.box.x1 <= b.x1 && s.box.z0 >= b.z0 && s.box.z1 <= b.z1));
    this.changed.add(id);
    store.log({ at: now, world, admin, action: 'adopt', detail: `${admin} gave ${id} (${claim.polygon.area} blocks) to ${req.account} (${req.ownerName}); ${kept} changes kept` });
    return { ok: true, code: 'ok', text: `Gave ${claim.name} (${id}, ${claim.polygon.area} blocks) to ${req.ownerName}.`, claim: this.viewOf(claim, this.actorOf(req.account)) };
  }

  /** Keep a copy of every claim (owner, corners, status, what was paid) in the store: the last few, before an administrator changes land in bulk. */
  backup(why: string): void {
    const list = (this.o.store.getMeta(this.o.world, 'backups') as { at: number; why: string; claims: unknown[] }[] | undefined) ?? [];
    const claims = [...this.index.all()].map((c) => ({ id: c.id, owner: c.ownerId, ownerName: c.ownerName, name: c.name, vertices: c.polygon.pts.map((p) => [p[0], p[1]]), status: c.status, paid: c.paid, releaseAt: c.releaseAt }));
    list.push({ at: this.o.now(), why, claims });
    while (list.length > 5) list.shift();
    this.o.store.setMeta(this.o.world, 'backups', list);
  }

  backups(): { at: number; why: string; claims: number }[] {
    const list = (this.o.store.getMeta(this.o.world, 'backups') as { at: number; why: string; claims: unknown[] }[] | undefined) ?? [];
    return Array.isArray(list) ? list.map((b) => ({ at: b.at, why: b.why, claims: Array.isArray(b.claims) ? b.claims.length : 0 })) : [];
  }

  /** Write everything that changed. Each part on its own: one failure does not stop the rest, and is retried at the next save. */
  flush(): void {
    const { store, world } = this.o;
    const d = this.ledger.drain();
    if (d.upserts.length > 0 || d.deletes.length > 0) {
      try {
        store.writeMods(world, d);
      } catch (err) {
        this.ledger.requeue(d);
        console.error('[solrift] writing the land ledger failed (it will be retried)', err);
      }
    }
    for (const id of [...this.dirtyClaims]) {
      const c = this.index.get(id) ?? this.gone.get(id);
      if (!c) {
        this.dirtyClaims.delete(id);
        continue;
      }
      try {
        store.saveClaim(this.toRecord(c));
        this.dirtyClaims.delete(id);
      } catch (err) {
        console.error('[solrift] writing a claim failed (it will be retried)', err);
      }
    }
  }

  /** Claims that left the index (released, revoked) and still have to be written once. */
  private readonly gone = new Map<string, LandClaim>();

  private toRecord(c: LandClaim): ClaimRecord {
    return {
      id: c.id,
      world: c.world,
      ownerType: c.ownerType,
      ownerId: c.ownerId,
      ownerName: c.ownerName,
      name: c.name,
      vertices: c.polygon.pts.map((p): [number, number] => [p[0], p[1]]),
      depth: c.depth,
      height: c.height,
      ground: toBase64(c.ground),
      price: c.price,
      paid: c.paid,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      status: c.status,
      releaseAt: c.releaseAt,
      rev: c.rev,
      grants: c.grants.map((g) => ({ ...g })),
      publicPerms: { ...c.publicPerms },
      guildRole: c.guildRole,
      lastActive: c.lastActive,
    };
  }

  private fromRecord(r: ClaimRecord): LandClaim | null {
    const res = analyzePolygon(r.vertices, { ...this.cfg, maxArea: 1e9, maxSpan: 1e6, minArea: 1, minEdge: 1, solidFraction: 0, minCorners: 3 }, 1e9);
    if (!res.ok) {
      console.error(`[solrift] claim ${r.id} has an unreadable boundary (${res.fault}); it is left out`);
      return null;
    }
    const ground = fromBase64(r.ground, res.polygon.w * res.polygon.h);
    if (!ground) {
      console.error(`[solrift] claim ${r.id} has an unreadable ground; it is left out`);
      return null;
    }
    return {
      id: r.id,
      world: r.world,
      ownerType: r.ownerType,
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      name: r.name,
      polygon: res.polygon,
      ground,
      depth: r.depth,
      height: r.height,
      price: r.price,
      paid: r.paid,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      status: r.status,
      releaseAt: r.releaseAt,
      rev: r.rev,
      grants: r.grants ?? [],
      publicPerms: { ...NO_PERMS, ...(r.publicPerms ?? {}) },
      guildRole: r.guildRole === 'visitor' ? 'visitor' : 'builder',
      lastActive: r.lastActive ?? r.updatedAt,
    };
  }

  private touchClaim(c: LandClaim): void {
    c.rev++;
    c.updatedAt = this.o.now();
    this.dirtyClaims.add(c.id);
    this.changed.add(c.id);
  }

  // ---- who is asking --------------------------------------------------------------------------------------------------

  actorOf(account: string | null): Actor {
    if (!account || account === 'local') return { key: null, guildId: null, guildRank: null };
    const g = this.o.guildOf?.(account) ?? null;
    return { key: account, guildId: g?.id ?? null, guildRank: g?.rank ?? null };
  }

  // ---- the answers the world needs: may this block be changed? ------------------------------------------------------

  /** May this character place or break the block at (x, y, z)? A guest (null) has the rights of the public. */
  checkBuild(account: string | null, x: number, y: number, z: number, act: BuildAct, placing = 0): Decision {
    const claim = this.index.volumeAt(x, y, z);
    if (claim) {
      if (permsIn(claim, this.actorOf(account)).build) return OK;
      return { ok: false, why: 'claim', owner: claim.ownerName, claimId: claim.id };
    }
    if (this.cfg.edgeBuffer > 0 && (act === 'break' || GRIEF_BLOCKS.has(placing))) {
      const band = this.index.bandAt(x, y, z);
      if (band && !permsIn(band, this.actorOf(account)).build) return { ok: false, why: 'band', owner: band.ownerName, claimId: band.id };
    }
    return OK;
  }

  /** May this character use the block (open it, sit at it, flip it)? Breaking and building are `checkBuild`. */
  checkUse(account: string | null, x: number, y: number, z: number, id: number): Decision {
    const kind = useKind(id);
    if (kind === 'other') return OK;
    const claim = this.index.volumeAt(x, y, z);
    if (!claim) return OK;
    const p = permsIn(claim, this.actorOf(account));
    const ok = kind === 'container' ? p.containers : kind === 'station' ? p.stations : p.doors;
    return ok ? OK : { ok: false, why: 'claim', owner: claim.ownerName, claimId: claim.id };
  }

  /** Things that are nobody's hand (explosions, fire, burning) must leave claimed blocks alone. */
  blocksEnvironment(x: number, y: number, z: number): boolean {
    return this.index.volumeAt(x, y, z) !== null;
  }

  /** What a guild is called on a claim (its name, or a placeholder when the room does not know it). */
  guildLabel(id: string): string {
    return this.o.guildName?.(id) ?? 'Guild';
  }

  /** Water and lava do not run from outside a claim into it (nor from one claim into another): only what its owner set flows inside. */
  fluidBlocked(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): boolean {
    const to = this.index.volumeAt(tx, ty, tz);
    if (!to) return false;
    return this.index.volumeAt(fx, fy, fz) !== to;
  }

  // ---- recording what changed ---------------------------------------------------------------------------------------

  /**
   * A block changed. `by` is the account of the one who did it (null: nobody's hand). Changes of nobody's hand are recorded only where the
   * ledger already knows the block, so growing crops and running water do not fill it.
   */
  onBlockChange(x: number, y: number, z: number, id: number, by: string | null, passive = false): void {
    if (this.quiet > 0) return;
    const g = this.o.generator;
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const known = this.ledger.at(x, y, z);
    if (!known && passive) return;
    if (g.instanceAt(x, z) >= 0 || g.isProtected(x, y, z)) return;
    const claim = this.index.volumeAt(x, y, z);
    const base = known ? known.base : this.baseline.at(x, y, z);
    this.ledger.record(x, y, z, base, id, { claim, by, now: this.o.now(), passive });
  }

  /** Writes the service makes itself (putting the wilderness back, a rollback) are its own bookkeeping: the world's change hook must not record them again. */
  private quiet = 0;
  private put(x: number, y: number, z: number, id: number): boolean {
    this.quiet++;
    try {
      return this.o.setBlock(x, y, z, id);
    } finally {
      this.quiet--;
    }
  }

  /** Is this block, as the world has it now, not what the generator made? */
  isChanged(x: number, y: number, z: number): boolean {
    return this.ledger.at(x, y, z) !== undefined;
  }

  // ---- looking at land ---------------------------------------------------------------------------------------------

  viewOf(c: LandClaim, a: Actor): LandClaimView {
    const role = roleIn(c, a);
    const can = permsIn(c, a);
    const mine = role === 'owner';
    const guild = c.ownerType === 'guild' && a.guildId === c.ownerId;
    const b = c.polygon.box;
    return {
      id: c.id,
      name: c.name,
      owner: c.ownerName,
      kind: mine ? 'mine' : guild ? 'guild' : can.build ? 'shared' : 'other',
      role,
      vertices: c.polygon.pts.map((p): [number, number] => [p[0], p[1]]),
      area: c.polygon.area,
      box: [b.x0, b.z0, b.x1, b.z1],
      status: c.status,
      releaseAt: c.releaseAt,
      depth: c.depth,
      rev: c.rev,
      can,
      shared: c.grants.length > 0 || c.ownerType === 'guild' || Object.values(publicOnly(c)).some(Boolean),
      price: c.price,
      paid: c.paid,
      createdAt: c.createdAt,
    };
  }

  /** The claims near a point, for the client to draw and to answer "whose land is this". */
  claimsNear(account: string | null, x: number, z: number, radius: number): LandClaimView[] {
    const a = this.actorOf(account);
    return this.index.inBox(x - radius, z - radius, x + radius, z + radius).map((c) => this.viewOf(c, a));
  }

  /**
   * The server's own territory near a point, to be drawn: the made places players may not change (a town, a vault), the landmarks the
   * land keeps free (round ones come as a polygon of 24 corners), and the places an administrator reserved. Nobody can buy or change any of it.
   */
  protectedNear(x: number, z: number, radius: number): ProtectedZone[] {
    const g = this.o.generator;
    const x0 = Math.floor(x - radius);
    const z0 = Math.floor(z - radius);
    const x1 = Math.floor(x + radius);
    const z1 = Math.floor(z + radius);
    const out: ProtectedZone[] = [];
    const rect = (id: string, name: string, kind: ProtectedZone['kind'], a0: number, b0: number, a1: number, b1: number): ProtectedZone => ({
      id,
      name,
      kind,
      box: [a0, b0, a1, b1],
      vertices: [[a0, b0], [a1, b0], [a1, b1], [a0, b1]],
    });
    const named = g.protectedAreas(x0, z0, x1, z1);
    for (const a of named) out.push(rect(`t:${a.x0},${a.z0}`, a.name, 'town', a.x0, a.z0, a.x1, a.z1));
    for (const lm of g.landmarksIn(x0, z0, x1, z1)) {
      if (named.some((a) => lm.x >= a.x0 && lm.x <= a.x1 && lm.z >= a.z0 && lm.z <= a.z1)) continue; // (already drawn as the place it is)
      const vertices: [number, number][] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        vertices.push([Math.round(lm.x + Math.cos(a) * lm.r), Math.round(lm.z + Math.sin(a) * lm.r)]);
      }
      out.push({ id: `l:${Math.round(lm.x)},${Math.round(lm.z)}`, name: 'Protected landmark', kind: 'landmark', box: [Math.floor(lm.x - lm.r), Math.floor(lm.z - lm.r), Math.ceil(lm.x + lm.r), Math.ceil(lm.z + lm.r)], vertices });
    }
    for (const r of this.reservedList) {
      if (r.legacy) continue; // (old builds are kept free for their builders, not the server's)
      if (r.x1 >= x0 && r.x0 <= x1 && r.z1 >= z0 && r.z0 <= z1) out.push(rect(`r:${r.id}`, r.name, 'reserved', r.x0, r.z0, r.x1, r.z1));
    }
    return out.slice(0, 24);
  }

  claimsOf(account: string): LandClaim[] {
    const a = this.actorOf(account);
    const out: LandClaim[] = [];
    for (const c of this.index.all()) {
      if (c.ownerType === 'player' ? c.ownerId === account : a.guildId !== null && c.ownerId === a.guildId) out.push(c);
    }
    return out.sort((p, q) => p.createdAt - q.createdAt);
  }

  detail(account: string | null, id: string): LandDetail | null {
    const c = this.index.get(id);
    if (!c) return null;
    const a = this.actorOf(account);
    const p = permsIn(c, a);
    if (!p.manage && !p.release) return null;
    return { ...this.viewOf(c, a), grants: c.grants.map((g) => ({ ...g, id: g.kind === 'guild' ? g.id : '' })), publicPerms: { ...c.publicPerms }, guildRole: c.guildRole, refund: Math.floor((c.paid * this.cfg.refundPercent) / 100), changes: this.ledger.ofClaim(c.id).length };
  }

  // ---- assessing a selection ------------------------------------------------------------------------------------------

  private limits(account: string | null, asGuild: boolean): { maxClaims: number; maxArea: number; maxTotal: number; claims: number; total: number } {
    const lim = (account ? this.o.limitsFor?.(account) : null) ?? {};
    const a = this.actorOf(account);
    let claims = 0;
    let total = 0;
    for (const c of this.index.all()) {
      if (asGuild ? c.ownerType === 'guild' && c.ownerId === a.guildId : c.ownerType === 'player' && c.ownerId === account) {
        claims++;
        total += c.polygon.area;
      }
    }
    return asGuild
      ? { maxClaims: this.cfg.guildMaxClaims, maxArea: lim.maxArea ?? this.cfg.maxArea, maxTotal: this.cfg.guildMaxArea, claims, total }
      : { maxClaims: lim.maxClaims ?? this.cfg.maxClaimsPerPlayer, maxArea: lim.maxArea ?? this.cfg.maxArea, maxTotal: lim.maxTotalArea ?? this.cfg.maxTotalArea, claims, total };
  }

  /** The original ground over a polygon's box (-1 off the claim). */
  private groundOver(poly: Polygon, old?: LandClaim): Int16Array {
    const out = new Int16Array(poly.w * poly.h).fill(-1);
    for (let z = 0; z < poly.h; z++) {
      for (let x = 0; x < poly.w; x++) {
        if (poly.mask[z * poly.w + x] !== 1) continue;
        const wx = poly.box.x0 + x;
        const wz = poly.box.z0 + z;
        // A block that was in the claim keeps the ground it was given: the claim never re-measures what was already measured.
        const was = old ? groundOf(old, wx, wz) : -1;
        out[z * poly.w + x] = was >= 0 ? was : Math.max(0, Math.min(WORLD_HEIGHT - 1, this.o.generator.columnAt(wx, wz).height));
      }
    }
    return out;
  }

  /** What is in the way of land at these blocks: the places and landmarks the world keeps, and other claims. */
  private obstruction(poly: Polygon, ground: Int16Array, ignore: string | null, allowLegacy = false): { kind: 'protected' | 'overlap'; x: number; z: number } | null {
    const g = this.o.generator;
    const cfg = this.cfg;
    // Another claim has a block in it.
    let hit: { kind: 'overlap'; x: number; z: number } | null = null;
    eachCell(poly, (x, z) => {
      if (hit) return;
      const c = this.index.claimAt(x, z);
      if (c && c.id !== ignore) hit = { kind: 'overlap', x, z };
    });
    if (hit) return hit;
    if (cfg.claimGap > 0) {
      for (const c of this.index.inBox(poly.box.x0, poly.box.z0, poly.box.x1, poly.box.z1, cfg.claimGap)) {
        if (c.id === ignore) continue;
        let near: { kind: 'overlap'; x: number; z: number } | null = null;
        eachCell(poly, (x, z) => {
          if (!near && polygonNear(c.polygon, x, z, cfg.claimGap)) near = { kind: 'overlap', x, z };
        });
        if (near) return near;
      }
    }
    // The places that belong to the world: protected ground (from the surface to the bottom of the claim and the top of it), dungeon copies, named places.
    let bad: { kind: 'protected'; x: number; z: number } | null = null;
    const blocked = (x: number, z: number, gy: number): boolean => {
      if (g.instanceAt(x, z) >= 0 || g.zoneAt(x, gy + 1, z) !== null) return true;
      for (const y of [Math.max(1, gy - cfg.depth), gy, gy + 4, gy + cfg.height]) if (g.isProtected(x, y, z)) return true;
      return false;
    };
    eachCell(poly, (x, z) => {
      if (bad) return;
      const gy = ground[(z - poly.box.z0) * poly.w + (x - poly.box.x0)];
      if (blocked(x, z, gy)) bad = { kind: 'protected', x, z };
    });
    if (bad) return bad;
    // Their neighbourhood: a claim keeps its distance (checked on every second block of the ring: a claim cannot reach round the corner of a village).
    const s = cfg.protectedSpacing;
    if (s > 0) {
      for (let z = poly.box.z0 - s; z <= poly.box.z1 + s; z += 2) {
        for (let x = poly.box.x0 - s; x <= poly.box.x1 + s; x += 2) {
          if (!polygonNear(poly, x, z, s)) continue;
          const gy = Math.max(0, Math.min(WORLD_HEIGHT - 1, g.columnAt(x, z).height));
          if (blocked(x, z, gy)) return { kind: 'protected', x, z };
        }
      }
    }
    // The places an administrator has kept free (see `reserve`).
    for (const r of this.reservedList) {
      if (allowLegacy && r.legacy) continue;
      if (poly.box.x1 < r.x0 - s || poly.box.x0 > r.x1 + s || poly.box.z1 < r.z0 - s || poly.box.z0 > r.z1 + s) continue;
      let inside: { kind: 'protected'; x: number; z: number } | null = null;
      eachCell(poly, (x, z) => {
        if (!inside && x >= r.x0 - s && x <= r.x1 + s && z >= r.z0 - s && z <= r.z1 + s) inside = { kind: 'protected', x, z };
      });
      if (inside) return inside;
    }
    // The landmarks (ruins, temples, castles, ...): the world lists the circles it keeps.
    for (const lm of g.landmarksIn(poly.box.x0 - s - 64, poly.box.z0 - s - 64, poly.box.x1 + s + 64, poly.box.z1 + s + 64)) {
      if (polygonNear(poly, lm.x, lm.z, lm.r + s)) return { kind: 'protected', x: lm.x, z: lm.z };
    }
    return null;
  }

  /**
   * Everything the server needs to know about a selection, and what a preview shows. Free and side-effect free. `ignore` is the claim being
   * expanded (its own land is not in the way).
   */
  assess(account: string | null, raw: unknown, balance: number, opts: { asGuild?: boolean; ignore?: LandClaim; carries?: boolean; adopting?: boolean } = {}): { preview: LandPreview; polygon: Polygon | null; ground: Int16Array | null; extra: number } {
    const cfg = this.cfg;
    const asGuild = !!opts.asGuild;
    const lim = this.limits(account, asGuild);
    const corners = Array.isArray(raw) ? raw.length : 0;
    const old = opts.ignore ?? null;
    const base: LandPreview = {
      ok: false,
      status: 'invalid',
      text: '',
      corners,
      area: 0,
      pricePerBlock: cfg.pricePerBlock,
      price: 0,
      balance,
      depth: cfg.depth,
      maxArea: lim.maxArea,
      claimsLeft: Math.max(0, lim.maxClaims - lim.claims),
      areaLeft: Math.max(0, lim.maxTotal - lim.total),
    };
    const fail = (status: LandStatus, text: string, extra: Partial<LandPreview> = {}): { preview: LandPreview; polygon: Polygon | null; ground: Int16Array | null; extra: number } => ({
      preview: { ...base, ...extra, status, text },
      polygon: null,
      ground: null,
      extra: 0,
    });
    if (!account || account === 'local') return fail('guest', 'Sign in to claim land.');
    if (opts.carries === false) return fail('nosurveyor', 'You need an Auren Land Surveyor.');
    if (asGuild && !(this.actorOf(account).guildId && (this.actorOf(account).guildRank ?? 9) <= 1)) return fail('invalid', 'Only a guild leader or officer can claim for the guild.');
    const res = analyzePolygon(raw, cfg, lim.maxArea);
    if (!res.ok) {
      const tooBig = res.fault === 'too_large';
      return fail(tooBig ? 'limit' : 'invalid', tooBig ? MESSAGES.tooBig : POLYGON_FAULT_TEXT[res.fault], { at: res.at });
    }
    const poly = res.polygon;
    const ground = this.groundOver(poly, old ?? undefined);
    if (old && !polygonContains(poly, old.polygon)) return fail('invalid', 'An expanded claim has to include all of the old one.', { area: poly.area });
    const hit = this.obstruction(poly, ground, old?.id ?? null, !!opts.adopting);
    if (hit) return fail(hit.kind === 'overlap' ? 'overlap' : 'protected', hit.kind === 'overlap' ? MESSAGES.overlap : MESSAGES.cannotClaim, { area: poly.area, price: poly.area * cfg.pricePerBlock });
    const price = poly.area * cfg.pricePerBlock;
    const extra = old ? (poly.area - old.polygon.area) * cfg.pricePerBlock : price;
    const withArea = { area: poly.area, price: old ? extra : price };
    if (old && poly.area === old.polygon.area) return fail('invalid', 'That is the same land.', withArea);
    const stillClaims = old ? 0 : 1;
    // An old build handed to its builder by an administrator is not held to what a purchase is (the count and the total area).
    if (opts.adopting) return { preview: { ...base, ...withArea, ok: true, status: 'available', text: MESSAGES.available }, polygon: poly, ground, extra: 0 };
    if (lim.claims + stillClaims > lim.maxClaims) return fail('limit', 'You already own as many claims as you may.', withArea);
    const grow = old ? poly.area - old.polygon.area : poly.area;
    if (lim.total + grow > lim.maxTotal) return fail('limit', MESSAGES.tooBig, withArea);
    if (extra > balance) return { preview: { ...base, ...withArea, ok: false, status: 'funds', text: MESSAGES.funds }, polygon: poly, ground, extra };
    return { preview: { ...base, ...withArea, ok: true, status: 'available', text: MESSAGES.available }, polygon: poly, ground, extra };
  }

  preview(account: string | null, raw: unknown, econ: Econ, opts: { asGuild?: boolean; expand?: string; carries?: boolean } = {}): LandPreview {
    const old = opts.expand ? this.index.get(opts.expand) : null;
    if (opts.expand && (!old || !permsIn(old, this.actorOf(account)).release)) return { ...this.assess(null, raw, 0).preview, status: 'invalid', text: 'You cannot expand that claim.' };
    const r = this.assess(account, raw, econ.balance(), { ...opts, ignore: old ?? undefined });
    return old ? { ...r.preview, expanding: old.id } : r.preview;
  }

  // ---- buying and growing ---------------------------------------------------------------------------------------------

  private newId(): string {
    for (;;) {
      const id = `lc_${this.o.now().toString(36)}_${Math.floor(this.rand() * 36 ** 6).toString(36).padStart(6, '0')}`;
      if (!this.index.get(id) && !this.gone.has(id)) return id;
    }
  }

  /**
   * Buy land. Everything is decided here, from the corners alone: the area, the price, the limits and what is in the way. The price the
   * client showed counts for nothing. `idem` makes asking twice safe: the same key never charges twice, it just says what happened.
   */
  purchase(req: { account: string | null; ownerName: string; name: string; vertices: unknown; idem: string; asGuild?: boolean; carries: boolean; reach?: { x: number; z: number } }, econ: Econ): LandResult {
    const { account } = req;
    const now = this.o.now();
    if (!account || account === 'local') return { ok: false, code: 'guest', text: 'Sign in to claim land.' };
    if (typeof req.idem !== 'string' || req.idem.length < 8 || req.idem.length > 64) return { ok: false, code: 'bad_request', text: 'That request cannot be used.' };
    const { store, world } = this.o;
    const prior = store.txnByIdem(world, account, req.idem);
    if (prior) return this.replayOf(account, prior);
    if (this.inflight.has(account)) return { ok: false, code: 'busy', text: 'Your last request is still being handled.' };
    this.inflight.add(account);
    try {
      const a = this.actorOf(account);
      const asGuild = !!req.asGuild;
      const r = this.assess(account, req.vertices, econ.balance(), { asGuild, carries: req.carries });
      if (req.reach && r.polygon) {
        const b = r.polygon.box;
        const dx = Math.max(b.x0 - req.reach.x, 0, req.reach.x - b.x1);
        const dz = Math.max(b.z0 - req.reach.z, 0, req.reach.z - b.z1);
        if (Math.hypot(dx, dz) > this.cfg.maxReach) return { ok: false, code: 'far', text: 'That land is too far from where you stand.' };
      }
      if (!r.polygon || !r.ground) return { ok: false, code: r.preview.status, text: r.preview.text };
      if (!r.preview.ok) return { ok: false, code: r.preview.status, text: r.preview.text };
      const price = r.extra;
      const txn: TxnRecord = { id: `tx_${this.newId()}`, world, playerKey: account, claimId: null, kind: 'purchase', amount: price, idem: req.idem, state: 'pending', note: '', createdAt: now, updatedAt: now };
      const owner = asGuild ? { type: 'guild' as const, id: a.guildId!, name: this.o.guildName?.(a.guildId!) ?? req.ownerName } : { type: 'player' as const, id: account, name: req.ownerName };
      const id = this.newId();
      txn.claimId = id;
      const claim: LandClaim = {
        id,
        world,
        ownerType: owner.type,
        ownerId: owner.id,
        ownerName: owner.name,
        name: cleanName(req.name, `${owner.name}\u2019s Land`),
        polygon: r.polygon,
        ground: r.ground,
        depth: this.cfg.depth,
        height: this.cfg.height,
        price,
        paid: price,
        createdAt: now,
        updatedAt: now,
        status: 'active',
        releaseAt: null,
        rev: 1,
        grants: [],
        publicPerms: { ...NO_PERMS },
        guildRole: 'builder',
        lastActive: now,
      };
      try {
        store.beginTxn(txn);
      } catch (err) {
        console.error('[solrift] could not open a land transaction', err);
        return { ok: false, code: 'error', text: 'The land office could not take your request. Nothing was charged.' };
      }
      if (!econ.charge(price)) {
        store.endTxn(world, txn.id, 'failed', 'balance', now);
        return { ok: false, code: 'funds', text: MESSAGES.funds };
      }
      try {
        store.commitTxn({ txn: { ...txn, state: 'committed', updatedAt: now }, claim: this.toRecord(claim), player: econ.save() });
      } catch (err) {
        econ.refund(price);
        try {
          store.endTxn(world, txn.id, 'failed', 'write failed', now);
        } catch {
          /* the transaction stays pending; it is closed at the next start */
        }
        console.error('[solrift] writing a land purchase failed; the buyer was not charged', err);
        return { ok: false, code: 'error', text: 'The land office could not write your deed. Nothing was charged.' };
      }
      this.index.add(claim);
      const adopted = this.ledger.adopt(claim);
      this.changed.add(claim.id);
      const fenced = this.raiseFence(claim, account, req.reach, null);
      this.o.store.log({ at: now, world, admin: '', action: 'purchase', detail: `${account} bought ${claim.id} (${claim.polygon.area} blocks, ${price} Auren, ${adopted} changes kept${fenced ? `, ${fenced.fences} fence blocks` : ''})` });
      return { ok: true, code: 'ok', text: MESSAGES.claimed, claim: this.viewOf(claim, a), charged: price };
    } finally {
      this.inflight.delete(account);
    }
  }

  /**
   * Fence the boundary of a claim the buyer has just paid for: a fence all round, a gate near where the buyer stands and the owner's sign
   * beside it. The deed is already written, so a fault here is reported and costs the buyer nothing. `old` is the claim as it was before an
   * expansion: its fence is taken down first (only the blocks still being the fence, gate or sign the land put there).
   */
  private raiseFence(claim: LandClaim, account: string, reach: { x: number; z: number } | undefined, old: LandClaim | null): FenceResult | null {
    if (!this.cfg.fenceOnBuy) return null;
    try {
      const groundOf = (c: LandClaim) => (x: number, z: number): number => {
        const b = c.polygon.box;
        const g = c.ground[(z - b.z0) * c.polygon.w + (x - b.x0)];
        return g === undefined ? 0 : g;
      };
      const world = (c: LandClaim): FenceWorld => ({ getBlock: this.o.getBlock, setBlock: this.o.setBlock, groundAt: groundOf(c) });
      return this.withActor(account, () => {
        if (old) removeFence(world(old), old.polygon, (x, y, z) => this.o.forgetSign?.(x, y, z));
        const lines = ownerSignLines(claim.ownerName, claim.name, `${claim.ownerName}\u2019s Land`);
        return buildFence(world(claim), planFence(claim.polygon, reach), lines, (x, y, z, l) => this.o.setSign?.(x, y, z, l));
      });
    } catch (err) {
      console.error('[solrift] fencing a claim failed; the claim itself is not affected', err);
      return null;
    }
  }

  /** What an earlier request with the same key came to: the same answer, and no second charge. */
  private replayOf(account: string, t: TxnRecord): LandResult {
    if (t.state === 'committed') {
      const c = t.claimId ? this.index.get(t.claimId) : null;
      return { ok: true, code: 'ok', text: MESSAGES.claimed, ...(c ? { claim: this.viewOf(c, this.actorOf(account)) } : {}), charged: 0, replay: true };
    }
    if (t.state === 'pending') return { ok: false, code: 'busy', text: 'Your last request is still being handled.' };
    return { ok: false, code: 'failed', text: t.note === 'balance' ? MESSAGES.funds : 'That purchase did not go through. Nothing was charged.' };
  }

  /** Grow a claim: a new, larger boundary that holds the old one. Only the new land is paid for. */
  expand(req: { account: string | null; id: string; vertices: unknown; idem: string; carries: boolean; reach?: { x: number; z: number } }, econ: Econ): LandResult {
    const { account } = req;
    const now = this.o.now();
    if (!account || account === 'local') return { ok: false, code: 'guest', text: 'Sign in to claim land.' };
    const c = this.index.get(req.id);
    const a = this.actorOf(account);
    if (!c || c.status !== 'active' || !permsIn(c, a).release) return { ok: false, code: 'denied', text: 'You cannot expand that claim.' };
    if (typeof req.idem !== 'string' || req.idem.length < 8 || req.idem.length > 64) return { ok: false, code: 'bad_request', text: 'That request cannot be used.' };
    const { store, world } = this.o;
    const prior = store.txnByIdem(world, account, req.idem);
    if (prior) return this.replayOf(account, prior);
    if (this.inflight.has(account)) return { ok: false, code: 'busy', text: 'Your last request is still being handled.' };
    this.inflight.add(account);
    try {
      const r = this.assess(account, req.vertices, econ.balance(), { asGuild: c.ownerType === 'guild', ignore: c, carries: req.carries });
      if (!r.polygon || !r.ground || !r.preview.ok) return { ok: false, code: r.preview.status, text: r.preview.text };
      if (req.reach) {
        const b = r.polygon.box;
        const dx = Math.max(b.x0 - req.reach.x, 0, req.reach.x - b.x1);
        const dz = Math.max(b.z0 - req.reach.z, 0, req.reach.z - b.z1);
        if (Math.hypot(dx, dz) > this.cfg.maxReach) return { ok: false, code: 'far', text: 'That land is too far from where you stand.' };
      }
      const price = r.extra;
      const txn: TxnRecord = { id: `tx_${this.newId()}`, world, playerKey: account, claimId: c.id, kind: 'expand', amount: price, idem: req.idem, state: 'pending', note: '', createdAt: now, updatedAt: now };
      store.beginTxn(txn);
      if (!econ.charge(price)) {
        store.endTxn(world, txn.id, 'failed', 'balance', now);
        return { ok: false, code: 'funds', text: MESSAGES.funds };
      }
      const next: LandClaim = { ...c, polygon: r.polygon, ground: r.ground, price: c.price + price, paid: c.paid + price, rev: c.rev + 1, updatedAt: now };
      try {
        store.commitTxn({ txn: { ...txn, state: 'committed', updatedAt: now }, claim: this.toRecord(next), player: econ.save() });
      } catch (err) {
        econ.refund(price);
        try {
          store.endTxn(world, txn.id, 'failed', 'write failed', now);
        } catch {
          /* closed at the next start */
        }
        console.error('[solrift] writing a land expansion failed; the buyer was not charged', err);
        return { ok: false, code: 'error', text: 'The land office could not write your deed. Nothing was charged.' };
      }
      this.index.add(next);
      const adopted = this.ledger.adopt(next);
      this.changed.add(next.id);
      this.raiseFence(next, account, req.reach, c);
      this.o.store.log({ at: now, world, admin: '', action: 'expand', detail: `${account} grew ${next.id} to ${next.polygon.area} blocks for ${price} Auren (${adopted} changes kept)` });
      return { ok: true, code: 'ok', text: 'Your land has grown.', claim: this.viewOf(next, a), charged: price };
    } finally {
      this.inflight.delete(account);
    }
  }

  // ---- managing a claim ------------------------------------------------------------------------------------------------

  private editable(account: string | null, id: string, need: 'manage' | 'release'): LandClaim | string {
    const c = this.index.get(id);
    if (!c) return 'That land is not there any more.';
    if (!permsIn(c, this.actorOf(account))[need]) return 'You are not allowed to do that here.';
    return c;
  }

  rename(account: string | null, id: string, name: string): LandResult {
    const c = this.editable(account, id, 'manage');
    if (typeof c === 'string') return { ok: false, code: 'denied', text: c };
    c.name = cleanName(name, c.name);
    this.touchClaim(c);
    return { ok: true, code: 'ok', text: 'Renamed.', claim: this.viewOf(c, this.actorOf(account)) };
  }

  /** Let somebody in (or change their role). `who` is looked up by the room: the account key and the name to show. */
  grant(account: string | null, id: string, g: { kind: 'player' | 'guild'; id: string; name: string; role: string; overrides?: Partial<Perms> }): LandResult {
    const c = this.editable(account, id, 'manage');
    if (typeof c === 'string') return { ok: false, code: 'denied', text: c };
    const role = g.role as Grant['role'];
    if (!GRANTABLE_ROLES.includes(role)) return { ok: false, code: 'bad_request', text: 'That is not a role.' };
    // A co-owner cannot make another co-owner: only the owner (or a guild leader) hands out management.
    const me = roleIn(c, this.actorOf(account));
    if (role === 'co_owner' && me !== 'owner') return { ok: false, code: 'denied', text: 'Only the owner can name a co-owner.' };
    if (g.kind === 'player' && g.id === c.ownerId) return { ok: false, code: 'bad_request', text: 'That is the owner.' };
    const existing = c.grants.find((x) => x.kind === g.kind && x.id === g.id);
    if (existing && existing.role === 'co_owner' && me !== 'owner') return { ok: false, code: 'denied', text: 'Only the owner can change a co-owner.' };
    if (!existing && c.grants.length >= 40) return { ok: false, code: 'limit', text: 'That many people is too many.' };
    const overrides = sanitizeOverrides(g.overrides, me === 'owner');
    const entry: Grant = { kind: g.kind, id: g.id, name: String(g.name).slice(0, 32), role, ...(overrides ? { overrides } : {}) };
    if (existing) Object.assign(existing, entry, overrides ? {} : { overrides: undefined });
    else c.grants.push(entry);
    this.touchClaim(c);
    return { ok: true, code: 'ok', text: `${entry.name} is now a ${role.replace('_', '-')}.`, claim: this.viewOf(c, this.actorOf(account)) };
  }

  revokeGrant(account: string | null, id: string, kind: 'player' | 'guild', who: string): LandResult {
    const c = this.editable(account, id, 'manage');
    if (typeof c === 'string') return { ok: false, code: 'denied', text: c };
    // (A player is named by what they are called: a client never learns the key behind it.)
    const i = c.grants.findIndex((g) => g.kind === kind && (g.id === who || (kind === 'player' && g.name.toLowerCase() === who.toLowerCase())));
    if (i < 0) return { ok: false, code: 'bad_request', text: 'They are not on the list.' };
    if (c.grants[i].role === 'co_owner' && roleIn(c, this.actorOf(account)) !== 'owner') return { ok: false, code: 'denied', text: 'Only the owner can remove a co-owner.' };
    c.grants.splice(i, 1);
    this.touchClaim(c);
    return { ok: true, code: 'ok', text: 'Removed.', claim: this.viewOf(c, this.actorOf(account)) };
  }

  setPublic(account: string | null, id: string, perms: Partial<Perms>, guildRole?: string): LandResult {
    const c = this.editable(account, id, 'manage');
    if (typeof c === 'string') return { ok: false, code: 'denied', text: c };
    const clean = sanitizeOverrides(perms, false) ?? {};
    c.publicPerms = { ...c.publicPerms, ...clean };
    if (guildRole === 'builder' || guildRole === 'visitor') c.guildRole = guildRole;
    this.touchClaim(c);
    return { ok: true, code: 'ok', text: 'Saved.', claim: this.viewOf(c, this.actorOf(account)) };
  }

  // ---- releasing ---------------------------------------------------------------------------------------------------------

  /** Begin letting go of a claim. It stays whole, and protected, for the grace period, and can be taken back until it ends. */
  release(account: string | null, id: string): LandResult {
    const c = this.editable(account, id, 'release');
    if (typeof c === 'string') return { ok: false, code: 'denied', text: c };
    if (c.status === 'releasing') return { ok: false, code: 'bad_request', text: 'It is already being released.' };
    c.status = 'releasing';
    c.releaseAt = this.o.now() + this.cfg.releaseGraceHours * HOUR_MS;
    this.touchClaim(c);
    this.o.store.log({ at: this.o.now(), world: this.o.world, admin: '', action: 'release', detail: `${account} began to release ${c.id}` });
    return { ok: true, code: 'ok', text: `The land will be let go in ${this.cfg.releaseGraceHours} hours. Until then it is still yours.`, claim: this.viewOf(c, this.actorOf(account)) };
  }

  cancelRelease(account: string | null, id: string): LandResult {
    const c = this.editable(account, id, 'release');
    if (typeof c === 'string') return { ok: false, code: 'denied', text: c };
    if (c.status !== 'releasing') return { ok: false, code: 'bad_request', text: 'It is not being released.' };
    c.status = 'active';
    c.releaseAt = null;
    // Taking it back is being there: the policy must not start the clock again at once.
    c.lastActive = this.o.now();
    if (this.expiring.delete(c.id)) this.saveExpiring();
    this.touchClaim(c);
    return { ok: true, code: 'ok', text: 'The land is yours again.', claim: this.viewOf(c, this.actorOf(account)) };
  }

  /** A claim's end: it leaves the index, and what was built on it goes back to the wilderness rules (and is put back by them, slowly, safely). */
  private finish(c: LandClaim, status: 'released' | 'revoked', delayHours: number): number {
    const now = this.o.now();
    if (this.expiring.delete(c.id)) this.saveExpiring();
    this.index.remove(c.id);
    c.status = status;
    c.releaseAt = null;
    c.rev++;
    c.updatedAt = now;
    this.gone.set(c.id, c);
    this.dirtyClaims.add(c.id);
    this.changed.add(c.id);
    return this.ledger.abandon(c.id, now, now + delayHours * HOUR_MS);
  }

  // ---- the clock ------------------------------------------------------------------------------------------------------------

  /**
   * Called every tick: it does its work every few seconds. Releases that are due, the abandoned-property policy, and one step of the
   * restoration (a bounded one).
   */
  tick(): void {
    const now = this.o.now();
    if (now - this.lastSweep >= 60_000) {
      this.lastSweep = now;
      this.sweep(now);
    }
    if (this.paused || !this.cfg.regen.enabled) return;
    if (now - this.lastRegen < this.cfg.regen.stepSeconds * 1000) return;
    this.lastRegen = now;
    const next = this.ledger.nextDue();
    if (next === null || next > now) return;
    this.step(now);
  }

  /** One restoration step (also used directly by tests and admin tools). */
  step(now: number = this.o.now()): RegenStats {
    const t0 = Date.now();
    const st = regenStep(this.ledger, this.env(), this.cfg, now, () => Date.now() - t0 > this.cfg.regen.stepMs);
    this.lastStep = st;
    for (const k of Object.keys(st) as (keyof RegenStats)[]) this.totals[k] += st[k];
    return st;
  }

  private env(): RegenEnv {
    const o = this.o;
    return {
      getBlock: (x, y, z) => o.getBlock(x, y, z),
      setBlock: (x, y, z, id) => this.put(x, y, z, id) || o.getBlock(x, y, z) === id,
      claimAt: (x, z) => this.index.claimAt(x, z),
      isProtected: (x, y, z) => o.generator.isProtected(x, y, z) || o.generator.instanceAt(x, z) >= 0,
      playerWithin: (x0, y0, z0, x1, y1, z1) => {
        for (const p of o.players()) if (p.x >= x0 && p.x <= x1 + 1 && p.y >= y0 - 2 && p.y <= y1 + 3 && p.z >= z0 && p.z <= z1 + 1) return true;
        return false;
      },
      itemsIn: (x, y, z) => o.itemsIn?.(x, y, z) ?? 0,
      recover: (e) => this.recoverFrom(e),
    };
  }

  /** The things in a container that is about to be taken away go to a recovery box for whoever built it. Never lost. */
  private recoverFrom(e: ModEntry): void {
    const items = this.o.emptyContainer?.(e.x, e.y, e.z) ?? null;
    if (!items || (Array.isArray(items) && items.length === 0)) return;
    this.o.store.addRecovery({ id: this.newId(), world: this.o.world, ownerKey: e.by ?? '', x: e.x, y: e.y, z: e.z, items, createdAt: this.o.now() });
  }

  private sweep(now: number): void {
    for (const c of [...this.index.all()]) {
      if (c.status === 'releasing' && c.releaseAt !== null && c.releaseAt <= now) {
        const refund = Math.floor((c.paid * this.cfg.refundPercent) / 100);
        this.finish(c, 'released', this.cfg.regen.placedHours);
        if (refund > 0 && c.ownerType === 'player') this.refund(c, refund);
        this.o.store.log({ at: now, world: this.o.world, admin: '', action: 'released', detail: `${c.id} let go of its land (${refund} Auren back)` });
      } else if (c.status === 'active' && this.cfg.abandon === 'inactivity' && c.ownerType === 'player' && now - c.lastActive > this.cfg.inactivityDays * LAND_DAY_MS) {
        // The long way out: a warning period first, and then the ordinary release.
        c.status = 'releasing';
        c.releaseAt = now + this.cfg.expiryWarningDays * LAND_DAY_MS;
        this.expiring.add(c.id);
        this.saveExpiring();
        this.touchClaim(c);
      }
    }
  }

  private refund(c: LandClaim, amount: number): void {
    const { store, world } = this.o;
    const id = `refund:${c.id}`;
    if (store.txnById(world, id)) return;
    const now = this.o.now();
    const ok = this.o.payOut?.(c.ownerId, amount) ?? false;
    store.beginTxn({ id, world, playerKey: c.ownerId, claimId: c.id, kind: 'refund', amount, idem: id, state: ok ? 'committed' : 'failed', note: ok ? '' : 'could not pay out', createdAt: now, updatedAt: now });
  }

  /** The owner was seen on their land (for the policy of abandoned property). */
  touchOwner(account: string): void {
    const now = this.o.now();
    for (const c of this.claimsOf(account)) {
      if (now - c.lastActive > HOUR_MS) {
        c.lastActive = now;
        this.dirtyClaims.add(c.id);
        if (c.status === 'releasing' && this.expiring.has(c.id)) {
          this.expiring.delete(c.id);
          this.saveExpiring();
          c.status = 'active';
          c.releaseAt = null;
          this.changed.add(c.id);
        }
      }
    }
  }

  // ---- recovery boxes --------------------------------------------------------------------------------------------------------

  recoveryOf(account: string): RecoveryRecord[] {
    return this.o.store.recoveryOf(this.o.world, account);
  }
  takeRecovery(id: string): void {
    this.o.store.deleteRecovery(this.o.world, id);
  }

  // ---- when the generator changes -----------------------------------------------------------------------------------------

  /**
   * The land was generated again (a new `GENERATOR_VERSION`). Temporary changes are meaningless against a new baseline and are dropped.
   * Everything inside a claim is kept: the ledger's record of it is put into the new land, and measured against the new baseline from now on.
   * Returns the chunks that were touched.
   */
  onGeneratorChanged(): { cx: number; cz: number }[] {
    this.baseline.clear();
    const chunks = new Map<string, { cx: number; cz: number }>();
    for (const [k, e] of [...this.ledger.entries]) {
      if (e.cls === 'wild') {
        this.ledger.remove(k, e);
        continue;
      }
      e.base = this.baseline.at(e.x, e.y, e.z);
      this.ledger.touch(k);
      if (this.put(e.x, e.y, e.z, e.cur)) chunks.set(`${e.x >> 4},${e.z >> 4}`, { cx: e.x >> 4, cz: e.z >> 4 });
    }
    this.o.store.clearWild(this.o.world);
    return [...chunks.values()];
  }

  // ---- administration --------------------------------------------------------------------------------------------------------

  get isPaused(): boolean {
    return this.paused;
  }
  setPaused(on: boolean, admin: string): void {
    this.paused = on;
    this.o.store.setMeta(this.o.world, 'paused', on);
    this.o.store.log({ at: this.o.now(), world: this.o.world, admin, action: on ? 'pause' : 'resume', detail: 'regeneration' });
  }

  /** Take a claim away (an administrator's decision): what stands on it is held for `revokeGraceHours`, then goes back to the wilderness. */
  revoke(id: string, admin: string, refund: boolean): LandResult {
    const c = this.index.get(id);
    if (!c) return { ok: false, code: 'missing', text: 'No such claim.' };
    const paid = c.paid;
    const changes = this.finish(c, 'revoked', this.cfg.revokeGraceHours);
    if (refund && c.ownerType === 'player' && paid > 0) this.refund(c, paid);
    this.o.store.log({ at: this.o.now(), world: this.o.world, admin, action: 'revoke', detail: `${id} of ${c.ownerName} (${paid} Auren${refund ? ' refunded' : ''}, ${changes} changes released)` });
    return { ok: true, code: 'ok', text: `Revoked ${c.name}.` };
  }

  /** Claims that no longer fit the world's rules: for the administrator's review. */
  findInvalid(): { id: string; why: string }[] {
    const out: { id: string; why: string }[] = [];
    for (const c of this.index.all()) {
      const hit = this.obstruction(c.polygon, c.ground, c.id);
      if (hit) out.push({ id: c.id, why: hit.kind === 'overlap' ? `overlaps another claim at ${hit.x},${hit.z}` : `touches protected ground at ${hit.x},${hit.z}` });
    }
    return out;
  }

  /**
   * Put changes back at once (an administrator's tool), whatever class they are: a box, optionally only what one character did or only
   * what is newer than `since`. Returns how many blocks were put back.
   */
  rollback(admin: string, box: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }, opts: { by?: string; since?: number; wildOnly?: boolean } = {}): number {
    let n = 0;
    for (const e of [...this.ledger.inBox(box.x0, box.z0, box.x1, box.z1)]) {
      if (e.y < box.y0 || e.y > box.y1) continue;
      if (opts.by !== undefined && e.by !== opts.by) continue;
      if (opts.since !== undefined && e.t < opts.since) continue;
      if (opts.wildOnly && e.cls !== 'wild') continue;
      if (holdsItems(e.cur) && this.o.itemsIn && this.o.itemsIn(e.x, e.y, e.z) > 0) this.recoverFrom(e);
      if (this.put(e.x, e.y, e.z, e.base)) n++;
      this.ledger.remove(modKey(e.x, e.y, e.z), e);
    }
    this.o.store.log({ at: this.o.now(), world: this.o.world, admin, action: 'rollback', detail: `${n} blocks in ${box.x0},${box.y0},${box.z0}..${box.x1},${box.y1},${box.z1}${opts.by ? ` by ${opts.by}` : ''}` });
    return n;
  }

  /** The latest purchases, expansions and refunds (of one character, or of everybody): the administrator's audit. */
  recentTxns(limit: number, playerKey?: string): TxnRecord[] {
    return this.o.store.recentTxns(this.o.world, limit, playerKey);
  }

  adminLog(limit: number): AdminLogRecord[] {
    return this.o.store.adminLog(this.o.world, limit);
  }

  /** Every claim, for the administrator. */
  allClaims(): LandClaim[] {
    return [...this.index.all()];
  }

  stats(): { claims: number; area: number; paused: boolean; ledger: ReturnType<ModLedger['stats']>; last: RegenStats; totals: RegenStats } {
    let area = 0;
    for (const c of this.index.all()) area += c.polygon.area;
    return { claims: this.index.size, area, paused: this.paused, ledger: this.ledger.stats(), last: this.lastStep, totals: this.totals };
  }

  /** The claim holding a block (the administrator's "who owns this"). */
  inspect(x: number, y: number, z: number): { claim: LandClaim | null; entry: ModEntry | undefined } {
    return { claim: this.index.claimAt(x, z), entry: this.ledger.at(x, y, z) };
  }
}

const publicOnly = (c: LandClaim): Perms => ({ ...c.publicPerms, manage: false, release: false });

function groundOf(c: LandClaim, x: number, z: number): number {
  const b = c.polygon.box;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return -1;
  return c.ground[(z - b.z0) * c.polygon.w + (x - b.x0)];
}

/** Only the rights a player may be given; nothing that is not a yes or a no. `manage` and `release` only ever come from the owner. */
function sanitizeOverrides(raw: Partial<Perms> | undefined, byOwner: boolean): Partial<Perms> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Partial<Perms> = {};
  for (const k of ['build', 'containers', 'stations', 'doors'] as const) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  if (byOwner) for (const k of ['manage', 'release'] as const) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  return Object.keys(out).length > 0 ? out : null;
}

