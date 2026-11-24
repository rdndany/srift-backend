import type { LandConfig } from './landConfig';
import { polygonHas, polygonNear, type Polygon, type Pt } from './landGeometry';

/**
 * The claims themselves: what one is, who may do what in it, and the index that finds the claim at a block in constant time
 * (a block edit asks it every time, so it must never walk the list of claims).
 */

export type Role = 'owner' | 'co_owner' | 'builder' | 'visitor' | 'public';
export const GRANTABLE_ROLES: readonly Role[] = ['co_owner', 'builder', 'visitor'];

/** What a role may do. Building and using are separate: a visitor may sit at a crafting table without being able to break it. */
export interface Perms {
  /** Place and break blocks, dig, use buckets and fire. */
  build: boolean;
  /** Open chests and other containers. */
  containers: boolean;
  /** Use workstations: crafting table, furnace, anvil, enchanting table, grindstone. */
  stations: boolean;
  /** Doors, gates, trapdoors, levers and buttons. */
  doors: boolean;
  /** Name the claim, and change who may do what. */
  manage: boolean;
  /** Release or expand the claim, and hand it over. */
  release: boolean;
}

export const NO_PERMS: Perms = { build: false, containers: false, stations: false, doors: false, manage: false, release: false };

export const ROLE_PERMS: Readonly<Record<Role, Perms>> = {
  owner: { build: true, containers: true, stations: true, doors: true, manage: true, release: true },
  co_owner: { build: true, containers: true, stations: true, doors: true, manage: true, release: false },
  builder: { build: true, containers: true, stations: true, doors: true, manage: false, release: false },
  visitor: { build: false, containers: false, stations: true, doors: true, manage: false, release: false },
  public: NO_PERMS,
};

export const ROLE_NAMES: Readonly<Record<Role, string>> = { owner: 'Owner', co_owner: 'Co-owner', builder: 'Builder', visitor: 'Visitor', public: 'Public' };

export interface Grant {
  kind: 'player' | 'guild';
  /** The character's account key, or the guild's id. */
  id: string;
  /** What to call them on screen. */
  name: string;
  role: Exclude<Role, 'owner' | 'public'>;
  /** Single rights changed from the role's own. */
  overrides?: Partial<Perms>;
}

export type ClaimStatus = 'active' | 'releasing' | 'released' | 'revoked';

export interface LandClaim {
  id: string;
  world: string;
  ownerType: 'player' | 'guild';
  /** The owner's account key, or the guild's id. Never shown to others. */
  ownerId: string;
  ownerName: string;
  name: string;
  polygon: Polygon;
  /** The ground of every block of the box as the world made it when the claim was bought (-1 off the claim): the claim's depth is measured from it, never from what was dug since. */
  ground: Int16Array;
  /** Blocks under the original ground, and above it, that the claim holds. */
  depth: number;
  height: number;
  price: number;
  /** Auren put into it in all (the price of the first purchase and of every expansion). */
  paid: number;
  createdAt: number;
  updatedAt: number;
  status: ClaimStatus;
  /** When a releasing claim lets go (ms). */
  releaseAt: number | null;
  rev: number;
  grants: Grant[];
  publicPerms: Perms;
  /** What the members of a guild-owned claim are (the leader is an owner, officers co-owners). */
  guildRole: Exclude<Role, 'owner' | 'public' | 'co_owner'>;
  /** When the owner was last seen at it, for the abandoned-property policy (ms). */
  lastActive: number;
}

export interface Actor {
  /** The account key (null: a guest, who owns nothing and is treated as the public). */
  key: string | null;
  guildId: string | null;
  /** 0 leader, 1 officer, 2 member. */
  guildRank: number | null;
}

export const PUBLIC_ACTOR: Actor = { key: null, guildId: null, guildRank: null };

const ROLE_ORDER: Role[] = ['public', 'visitor', 'builder', 'co_owner', 'owner'];

/** The role an actor has in a claim. */
export function roleIn(c: LandClaim, a: Actor): Role {
  let best: Role = 'public';
  const bump = (r: Role): void => {
    if (ROLE_ORDER.indexOf(r) > ROLE_ORDER.indexOf(best)) best = r;
  };
  if (c.ownerType === 'player') {
    if (a.key !== null && a.key === c.ownerId) return 'owner';
  } else if (a.guildId !== null && a.guildId === c.ownerId) {
    bump(a.guildRank === 0 ? 'owner' : a.guildRank === 1 ? 'co_owner' : c.guildRole);
  }
  for (const g of c.grants) {
    if (g.kind === 'player' ? a.key !== null && g.id === a.key : a.guildId !== null && g.id === a.guildId) bump(g.role);
  }
  return best;
}

/** The rights everybody has in a claim: the owner's choice for the public. Management and release can never be public. */
export const publicRights = (c: LandClaim): Perms => ({ ...c.publicPerms, manage: false, release: false });

/** What an actor may do in a claim: the role's rights plus what the public may do, with the grant's own changes on top. */
export function permsIn(c: LandClaim, a: Actor): Perms {
  const role = roleIn(c, a);
  if (role === 'owner') return ROLE_PERMS.owner;
  const pub = publicRights(c);
  if (role === 'public') return pub;
  const base = ROLE_PERMS[role];
  let perms: Perms = {
    build: base.build || pub.build,
    containers: base.containers || pub.containers,
    stations: base.stations || pub.stations,
    doors: base.doors || pub.doors,
    manage: base.manage,
    release: base.release,
  };
  for (const g of c.grants) {
    if (g.overrides && (g.kind === 'player' ? a.key !== null && g.id === a.key : a.guildId !== null && g.id === a.guildId)) perms = { ...perms, ...g.overrides };
  }
  return perms;
}

/** Is `y` inside the claim's protected height at (x, z)? */
export function coversY(c: LandClaim, x: number, y: number, z: number): boolean {
  const g = groundAt(c, x, z);
  return g >= 0 && y >= g - c.depth && y <= g + c.height;
}

/** The original ground of a block of the claim (-1: not in the claim). */
export function groundAt(c: LandClaim, x: number, z: number): number {
  const b = c.polygon.box;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return -1;
  return c.ground[(z - b.z0) * c.polygon.w + (x - b.x0)];
}

const OFF = 65536;
const bucketKey = (cx: number, cz: number): number => (cx + OFF) * 131072 + (cz + OFF);

/**
 * Finds claims by place. Each claim is listed under every chunk its box touches (grown by the edge band), so a lookup goes to one chunk's
 * short list and then answers from the claim's mask. Claims never overlap, so a column has at most one.
 */
export class ClaimIndex {
  private readonly byId = new Map<string, LandClaim>();
  private readonly buckets = new Map<number, LandClaim[]>();

  constructor(private readonly buffer: number) {}

  get size(): number {
    return this.byId.size;
  }

  get(id: string): LandClaim | null {
    return this.byId.get(id) ?? null;
  }

  all(): IterableIterator<LandClaim> {
    return this.byId.values();
  }

  private chunksOf(c: LandClaim, f: (key: number) => void): void {
    const b = c.polygon.box;
    const x0 = (b.x0 - this.buffer) >> 4;
    const x1 = (b.x1 + this.buffer) >> 4;
    const z0 = (b.z0 - this.buffer) >> 4;
    const z1 = (b.z1 + this.buffer) >> 4;
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) f(bucketKey(cx, cz));
  }

  add(c: LandClaim): void {
    this.remove(c.id);
    this.byId.set(c.id, c);
    this.chunksOf(c, (k) => {
      const list = this.buckets.get(k);
      if (list) list.push(c);
      else this.buckets.set(k, [c]);
    });
  }

  remove(id: string): void {
    const c = this.byId.get(id);
    if (!c) return;
    this.byId.delete(id);
    this.chunksOf(c, (k) => {
      const list = this.buckets.get(k);
      if (!list) return;
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) this.buckets.delete(k);
    });
  }

  /** The claim that owns the column (x, z), whatever the height. Released and revoked claims have left the index. */
  claimAt(x: number, z: number): LandClaim | null {
    const list = this.buckets.get(bucketKey(x >> 4, z >> 4));
    if (!list) return null;
    for (const c of list) if (polygonHas(c.polygon, x, z)) return c;
    return null;
  }

  /** The claim whose protected volume holds the block. */
  volumeAt(x: number, y: number, z: number): LandClaim | null {
    const c = this.claimAt(x, z);
    return c && coversY(c, x, y, z) ? c : null;
  }

  /** A claim whose edge band the column is in (a column that belongs to no claim, within `edgeBuffer` of one), at this height. */
  bandAt(x: number, y: number, z: number): LandClaim | null {
    if (this.buffer <= 0) return null;
    const list = this.buckets.get(bucketKey(x >> 4, z >> 4));
    if (!list) return null;
    for (const c of list) {
      if (!polygonNear(c.polygon, x, z, this.buffer) || polygonHas(c.polygon, x, z)) continue;
      // The band is as tall as the claim is at its nearest block.
      const gy = nearestGround(c, x, z, this.buffer);
      if (gy >= 0 && y >= gy - c.depth && y <= gy + c.height) return c;
    }
    return null;
  }

  /** Every claim whose box (grown by `pad`) touches the given box. */
  inBox(x0: number, z0: number, x1: number, z1: number, pad = 0): LandClaim[] {
    const out: LandClaim[] = [];
    for (const c of this.byId.values()) {
      const b = c.polygon.box;
      if (b.x1 + pad >= x0 && b.x0 - pad <= x1 && b.z1 + pad >= z0 && b.z0 - pad <= z1) out.push(c);
    }
    return out;
  }
}

function nearestGround(c: LandClaim, x: number, z: number, r: number): number {
  const b = c.polygon.box;
  let best = -1;
  let bd = Infinity;
  for (let zz = Math.max(b.z0, z - r); zz <= Math.min(b.z1, z + r); zz++) {
    for (let xx = Math.max(b.x0, x - r); xx <= Math.min(b.x1, x + r); xx++) {
      const g = c.ground[(zz - b.z0) * c.polygon.w + (xx - b.x0)];
      if (g < 0) continue;
      const d = Math.max(Math.abs(xx - x), Math.abs(zz - z));
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
  }
  return best;
}

/** Corners as plain pairs, for the wire and the database. */
export const cornersJson = (c: LandClaim): [number, number][] => c.polygon.pts.map((p): [number, number] => [p[0], p[1]]);



