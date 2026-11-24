import type { LandConfig } from './landConfig';
import type { Perms } from './landClaims';
import type { LandClaimView, LandDetail, LandPreview, LandResult, ProtectedZone } from './landService';

/**
 * What a client says about land, and what the server tells it. Everything a client says is untrusted: `parseLandCommand` turns the raw
 * message into a command or null, and the server judges it again (the price, the ownership and the rights are never taken from the client).
 */

export type LandCommand =
  /** Price a shape (the live panel asks while the player moves corners). `expand`: the id of the claim it would grow. */
  | { a: 'preview'; v: [number, number][]; expand?: string; guild?: boolean }
  /** Buy it. `idem` is made by the client for this one purchase: the same one sent again is the same purchase, never a second charge. */
  | { a: 'buy'; v: [number, number][]; name: string; idem: string; guild?: boolean }
  | { a: 'expand'; id: string; v: [number, number][]; idem: string }
  /**
   * "Tell me about the land again": the rules and the claims round me. A client asks when it has not heard (what the server said while the
   * world was still loading is not kept), so a Surveyor in the hand never waits for something that will not come.
   */
  | { a: 'hello' }
  /** The player's claims, and those about them. */
  | { a: 'list' }
  | { a: 'detail'; id: string }
  | { a: 'rename'; id: string; name: string }
  /** Invite a player (by the name they have in the game, who must be here) or the owner's guild. */
  | { a: 'grant'; id: string; kind: 'player' | 'guild'; who: string; role: string }
  | { a: 'revoke'; id: string; kind: 'player' | 'guild'; who: string }
  | { a: 'public'; id: string; perms: Partial<Perms>; guildRole?: 'builder' | 'visitor' }
  | { a: 'release'; id: string }
  | { a: 'unrelease'; id: string }
  /** Take what the wilderness took out of containers (see the recovery box). */
  | { a: 'recover' };

/** The rules a client needs to draw its panel (never to decide anything). */
export interface LandPublicConfig {
  pricePerBlock: number;
  minCorners: number;
  maxCorners: number;
  minEdge: number;
  minArea: number;
  maxArea: number;
  maxSpan: number;
  maxClaims: number;
  maxTotalArea: number;
  depth: number;
  height: number;
  edgeBuffer: number;
  releaseGraceHours: number;
  refundPercent: number;
  /** Hours until what is changed in the wild comes back (the lowest of the timers) and the highest. */
  restoreHoursMin: number;
  restoreHoursMax: number;
  regenEnabled: boolean;
}

export const publicLandConfig = (c: LandConfig): LandPublicConfig => ({
  pricePerBlock: c.pricePerBlock,
  minCorners: c.minCorners,
  maxCorners: c.maxCorners,
  minEdge: c.minEdge,
  minArea: c.minArea,
  maxArea: c.maxArea,
  maxSpan: c.maxSpan,
  maxClaims: c.maxClaimsPerPlayer,
  maxTotalArea: c.maxTotalArea,
  depth: c.depth,
  height: c.height,
  edgeBuffer: c.edgeBuffer,
  releaseGraceHours: c.releaseGraceHours,
  refundPercent: c.refundPercent,
  restoreHoursMin: Math.min(c.regen.excavationHours, c.regen.placedHours, c.regen.fenceHours),
  restoreHoursMax: Math.max(c.regen.excavationHours, c.regen.placedHours, c.regen.fenceHours),
  regenEnabled: c.regen.enabled,
});

export type LandEvent =
  | { k: 'cfg'; cfg: LandPublicConfig }
  | { k: 'preview'; preview: LandPreview }
  /** What came of an action (`what` is the command's `a`). */
  | { k: 'result'; what: string; result: LandResult }
  | { k: 'mine'; claims: LandClaimView[] }
  /** The claims round the player changed: these are new or have changed, those are out of reach now. */
  | { k: 'sync'; add: LandClaimView[]; remove: string[] }
  | { k: 'detail'; detail: LandDetail | null }
  /** The server's own territory round the player (towns, vaults, landmarks, reserved ground): the whole list, each time it changes. */
  | { k: 'zones'; zones: ProtectedZone[] }
  | { k: 'recovered'; stacks: number };

// ---- parsing ---------------------------------------------------------------------------------------------------------

const PERM_KEYS: readonly (keyof Perms)[] = ['build', 'containers', 'stations', 'doors', 'manage', 'release'];
const ID = /^[A-Za-z0-9_-]{3,48}$/;
const MAX_VERTICES = 16;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function vertices(raw: unknown): [number, number][] | null {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_VERTICES) return null;
  const out: [number, number][] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, z] = p;
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) || Math.abs(x as number) > 50_000_000 || Math.abs(z as number) > 50_000_000) return null;
    out.push([x as number, z as number]);
  }
  return out;
}

const text = (raw: unknown, max: number): string | null => {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return s.length === 0 || s.length > max ? null : s;
};

export function parseLandCommand(raw: unknown): LandCommand | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : null;
  switch (raw.a) {
    case 'preview': {
      const v = vertices(raw.v);
      if (!v) return null;
      const expand = typeof raw.expand === 'string' && ID.test(raw.expand) ? raw.expand : undefined;
      return { a: 'preview', v, ...(expand ? { expand } : {}), ...(raw.guild === true ? { guild: true } : {}) };
    }
    case 'buy': {
      const v = vertices(raw.v);
      const idem = typeof raw.idem === 'string' && ID.test(raw.idem) && raw.idem.length >= 8 ? raw.idem : null;
      const name = raw.name === undefined ? 'My Land' : text(raw.name, 32);
      if (!v || !idem || !name) return null;
      return { a: 'buy', v, name, idem, ...(raw.guild === true ? { guild: true } : {}) };
    }
    case 'expand': {
      const v = vertices(raw.v);
      const idem = typeof raw.idem === 'string' && ID.test(raw.idem) && raw.idem.length >= 8 ? raw.idem : null;
      return id && v && idem ? { a: 'expand', id, v, idem } : null;
    }
    case 'hello':
      return { a: 'hello' };
    case 'list':
      return { a: 'list' };
    case 'detail':
      return id ? { a: 'detail', id } : null;
    case 'rename': {
      const name = text(raw.name, 32);
      return id && name ? { a: 'rename', id, name } : null;
    }
    case 'grant': {
      const who = text(raw.who, 48);
      const role = typeof raw.role === 'string' && ['co_owner', 'builder', 'visitor'].includes(raw.role) ? raw.role : null;
      const kind = raw.kind === 'player' || raw.kind === 'guild' ? raw.kind : null;
      return id && who && role && kind ? { a: 'grant', id, kind, who, role } : null;
    }
    case 'revoke': {
      const who = text(raw.who, 48);
      const kind = raw.kind === 'player' || raw.kind === 'guild' ? raw.kind : null;
      return id && who && kind ? { a: 'revoke', id, kind, who } : null;
    }
    case 'public': {
      if (!id || !isObj(raw.perms)) return null;
      const perms: Partial<Perms> = {};
      for (const k of PERM_KEYS) {
        const v = (raw.perms as Record<string, unknown>)[k];
        if (v === undefined) continue;
        if (typeof v !== 'boolean') return null;
        perms[k] = v;
      }
      const guildRole = raw.guildRole === 'builder' || raw.guildRole === 'visitor' ? raw.guildRole : undefined;
      return { a: 'public', id, perms, ...(guildRole ? { guildRole } : {}) };
    }
    case 'release':
      return id ? { a: 'release', id } : null;
    case 'unrelease':
      return id ? { a: 'unrelease', id } : null;
    case 'recover':
      return { a: 'recover' };
    default:
      return null;
  }
}
