import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  CHUNK_BYTES,
  CLOUD_LIMITS,
  LEASE_MS,
  SaveError,
  decodeChunk,
  decodeWorldFile,
  encodeWorldFile,
  isValidWorldId,
  parsePlayerSave,
  parseWorldState,
  type CloudBackupInfo,
  type CloudWorldInfo,
  type WorldFile,
} from '@solrift/shared';
import { AuthError, SESSION_COOKIE, readBody, readCookie, json, type AuthService } from './auth';
import type { CloudRepo, CloudWorld, StoredChunk } from './cloudRepo';
import type { Account } from './db';

export class CloudError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type CloudLimits = { -readonly [K in keyof typeof CLOUD_LIMITS]: number };

export interface CloudServiceOptions {
  now?: () => number;
  limits?: Partial<CloudLimits>;
}

const MAX_COORD = 2_000_000;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const HOLDER = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_CHUNK_B64 = Math.ceil(((CHUNK_BYTES * 3 + 1) * 4) / 3) + 4;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

export interface ParsedPush {
  holder: string;
  base: number | null;
  seed: number;
  force: boolean;
  takeover: boolean;
  replace: boolean;
  /** undefined: leave as is. null: clear. string: new JSON text. */
  player: string | null | undefined;
  world: string | null | undefined;
  chunks: StoredChunk[];
}

const parseHolder = (x: unknown): string => {
  if (typeof x !== 'string' || !HOLDER.test(x)) throw new CloudError(400, 'bad holder id');
  return x;
};

/** Validate an untrusted push body completely before anything is written. */
export function parsePush(raw: unknown, worldId: string, limits: CloudLimits): ParsedPush {
  if (!isObject(raw)) throw new CloudError(400, 'expected an object');
  const holder = parseHolder(raw.holder);
  const base = raw.base;
  if (base !== null && !(isInt(base) && base >= 0)) throw new CloudError(400, 'bad base revision');
  if (!isInt(raw.seed) || String(raw.seed) !== worldId) throw new CloudError(400, 'seed does not match the world id');
  if (!Array.isArray(raw.chunks) || raw.chunks.length > limits.chunksPerPush) throw new CloudError(400, `at most ${limits.chunksPerPush} chunks per push`);

  const chunks: StoredChunk[] = [];
  const seen = new Set<string>();
  for (const c of raw.chunks) {
    if (!isObject(c) || !isInt(c.cx) || !isInt(c.cz) || Math.abs(c.cx) > MAX_COORD || Math.abs(c.cz) > MAX_COORD) throw new CloudError(400, 'bad chunk coordinates');
    if (typeof c.data !== 'string' || c.data.length > MAX_CHUNK_B64 || !B64.test(c.data)) throw new CloudError(400, 'bad chunk data');
    const key = `${c.cx},${c.cz}`;
    if (seen.has(key)) throw new CloudError(400, 'duplicate chunk in one push');
    seen.add(key);
    const data = new Uint8Array(Buffer.from(c.data, 'base64'));
    try {
      decodeChunk(data); // proves it is exactly one valid chunk; the result is dropped
    } catch {
      throw new CloudError(422, `chunk ${key} is not valid`);
    }
    chunks.push({ cx: c.cx, cz: c.cz, data });
  }

  const meta = (value: unknown, parse: (v: unknown) => unknown, cap: number, what: string): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    let normalized: unknown;
    try {
      normalized = parse(value);
    } catch (err) {
      if (err instanceof SaveError) throw new CloudError(422, `${what}: ${err.message}`);
      throw new CloudError(422, `${what} is not valid`);
    }
    if (normalized === null) throw new CloudError(422, `${what} is not valid`);
    const text = JSON.stringify(normalized);
    if (Buffer.byteLength(text) > cap) throw new CloudError(413, `${what} is too large`);
    return text;
  };

  return {
    holder,
    base: base as number | null,
    seed: raw.seed,
    force: raw.force === true,
    takeover: raw.takeover === true,
    replace: raw.replace === true,
    player: meta(raw.player, parsePlayerSave, limits.playerJsonBytes, 'player state'),
    world: meta(raw.world, parseWorldState, limits.worldJsonBytes, 'world state'),
    chunks,
  };
}

/** Cloud saves: one world per (account, seed) with revisions, a write lease and rolling backups. */
export class CloudService {
  private readonly now: () => number;
  readonly limits: CloudLimits;

  constructor(
    private readonly cloud: CloudRepo,
    opts: CloudServiceOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.limits = { ...CLOUD_LIMITS, ...opts.limits };
  }

  private info(w: CloudWorld, holder?: string): CloudWorldInfo {
    const leased = !!w.leaseHolder && w.leaseUntil > this.now();
    return {
      worldId: w.worldId,
      seed: w.seed,
      revision: w.revision,
      updatedAt: w.updatedAt,
      bytes: w.chunkBytes + w.metaBytes,
      chunks: w.chunkCount,
      leased,
      mine: leased && !!holder && w.leaseHolder === holder,
      leaseUntil: leased ? w.leaseUntil : 0,
    };
  }

  private checkId(worldId: string): void {
    if (!isValidWorldId(worldId)) throw new CloudError(400, 'bad world id');
  }

  /** Throws 423 when another holder has an unexpired lease and the caller did not ask to take over. */
  private checkLease(w: CloudWorld, holder: string, takeover: boolean): void {
    if (w.leaseHolder && w.leaseHolder !== holder && w.leaseUntil > this.now() && !takeover) {
      throw new CloudError(423, 'this world is open on another device or tab', { leaseUntil: w.leaseUntil });
    }
  }

  list(account: Account, holder?: string): CloudWorldInfo[] {
    return this.cloud.listWorlds(account.id).map((w) => this.info(w, holder));
  }

  get(account: Account, worldId: string, holder?: string): CloudWorldInfo | null {
    this.checkId(worldId);
    const w = this.cloud.getWorld(account.id, worldId);
    return w ? this.info(w, holder) : null;
  }

  /** Assemble the whole world as a `.solrift` file. */
  private snapshot(w: CloudWorld): Uint8Array {
    const file: WorldFile = {
      seed: w.seed,
      created: w.createdAt,
      player: w.player ? parsePlayerSave(JSON.parse(w.player)) : null,
      world: w.world ? parseWorldState(JSON.parse(w.world)) : null,
      chunks: this.cloud.getChunks(w.accountId, w.worldId).map((c) => ({ cx: c.cx, cz: c.cz, encoded: c.data })),
    };
    return encodeWorldFile(file);
  }

  file(account: Account, worldId: string): { bytes: Uint8Array; revision: number } {
    this.checkId(worldId);
    const w = this.cloud.getWorld(account.id, worldId);
    if (!w) throw new CloudError(404, 'no such cloud world');
    return { bytes: this.snapshot(w), revision: w.revision };
  }

  /** Back the current state up unless this exact revision is already backed up. */
  private backup(w: CloudWorld, kind: string): void {
    if (w.revision === 0) return;
    const existing = this.cloud.listBackups(w.accountId, w.worldId);
    if (existing[0]?.revision === w.revision) return;
    this.cloud.addBackup(w.accountId, w.worldId, { revision: w.revision, createdAt: this.now(), kind, data: this.snapshot(w) });
    this.cloud.pruneBackups(w.accountId, w.worldId, this.limits.backupsPerWorld);
  }

  push(account: Account, worldId: string, raw: unknown): { revision: number; updatedAt: number; leaseUntil: number } {
    this.checkId(worldId);
    const req = parsePush(raw, worldId, this.limits);
    return this.cloud.transaction(() => {
      const now = this.now();
      let w = this.cloud.getWorld(account.id, worldId);
      if (w) {
        this.checkLease(w, req.holder, req.takeover);
        if (req.base !== w.revision && !req.force) throw new CloudError(409, 'the cloud copy changed since this device last synced', { revision: w.revision, updatedAt: w.updatedAt });
        const last = this.cloud.listBackups(account.id, worldId)[0];
        if (req.force || req.replace) this.backup(w, 'overwrite');
        else if (!last || now - last.createdAt >= this.limits.backupEveryMs) this.backup(w, 'auto');
      } else {
        if (req.base !== null) throw new CloudError(409, 'the cloud copy no longer exists', { revision: 0, updatedAt: 0 });
        if (this.cloud.listWorlds(account.id).length >= this.limits.worldsPerAccount) throw new CloudError(403, 'too many cloud worlds');
        this.cloud.insertWorld({ accountId: account.id, worldId, seed: req.seed, now, leaseHolder: req.holder, leaseUntil: now + LEASE_MS });
        w = this.cloud.getWorld(account.id, worldId)!;
      }

      if (req.replace) this.cloud.deleteChunks(account.id, worldId);
      this.cloud.putChunks(account.id, worldId, req.chunks);
      const player = req.player === undefined ? w.player : req.player;
      const world = req.world === undefined ? w.world : req.world;
      const revision = w.revision + 1;
      this.cloud.updateWorld(account.id, worldId, {
        revision,
        updatedAt: now,
        ...(req.player !== undefined ? { player } : {}),
        ...(req.world !== undefined ? { world } : {}),
        metaBytes: Buffer.byteLength(player ?? '') + Buffer.byteLength(world ?? ''),
        leaseHolder: req.holder,
        leaseUntil: now + LEASE_MS,
      });
      // Exact quota check: throwing here rolls the whole push back.
      if (this.cloud.accountBytes(account.id) > this.limits.accountBytes) throw new CloudError(413, 'cloud storage limit reached');
      return { revision, updatedAt: now, leaseUntil: now + LEASE_MS };
    });
  }

  /** Renew (or take) the write lease without changing the world. */
  heartbeat(account: Account, worldId: string, holder: unknown, takeover: boolean): CloudWorldInfo {
    this.checkId(worldId);
    const id = parseHolder(holder);
    return this.cloud.transaction(() => {
      const w = this.cloud.getWorld(account.id, worldId);
      if (!w) throw new CloudError(404, 'no such cloud world');
      this.checkLease(w, id, takeover);
      this.cloud.updateWorld(account.id, worldId, { revision: w.revision, updatedAt: w.updatedAt, leaseHolder: id, leaseUntil: this.now() + LEASE_MS });
      return this.info(this.cloud.getWorld(account.id, worldId)!, id);
    });
  }

  release(account: Account, worldId: string, holder: unknown): void {
    this.checkId(worldId);
    const id = parseHolder(holder);
    this.cloud.transaction(() => {
      const w = this.cloud.getWorld(account.id, worldId);
      if (w && w.leaseHolder === id) this.cloud.updateWorld(account.id, worldId, { revision: w.revision, updatedAt: w.updatedAt, leaseHolder: null, leaseUntil: 0 });
    });
  }

  backups(account: Account, worldId: string): CloudBackupInfo[] {
    this.checkId(worldId);
    return this.cloud.listBackups(account.id, worldId).map((b) => ({ id: b.id, revision: b.revision, createdAt: b.createdAt, bytes: b.bytes, kind: b.kind }));
  }

  /** Make a backup the current world. The state it replaces is backed up first, so a restore can be undone. */
  restore(account: Account, worldId: string, raw: unknown): { revision: number } {
    this.checkId(worldId);
    if (!isObject(raw) || !isInt(raw.backupId)) throw new CloudError(400, 'backupId required');
    const holder = parseHolder(raw.holder);
    const backupId = raw.backupId;
    return this.cloud.transaction(() => {
      const w = this.cloud.getWorld(account.id, worldId);
      if (!w) throw new CloudError(404, 'no such cloud world');
      this.checkLease(w, holder, raw.takeover === true);
      const b = this.cloud.getBackup(account.id, worldId, backupId);
      if (!b) throw new CloudError(404, 'no such backup');
      let file: WorldFile;
      try {
        file = decodeWorldFile(b.data);
      } catch {
        throw new CloudError(500, 'the backup is damaged');
      }
      this.backup(w, 'restore');
      this.cloud.deleteChunks(account.id, worldId);
      this.cloud.putChunks(account.id, worldId, file.chunks.map((c) => ({ cx: c.cx, cz: c.cz, data: c.encoded })));
      const player = file.player ? JSON.stringify(file.player) : null;
      const world = file.world ? JSON.stringify(file.world) : null;
      const revision = w.revision + 1;
      const now = this.now();
      this.cloud.updateWorld(account.id, worldId, {
        revision,
        updatedAt: now,
        player,
        world,
        metaBytes: Buffer.byteLength(player ?? '') + Buffer.byteLength(world ?? ''),
        leaseHolder: holder,
        leaseUntil: now + LEASE_MS,
      });
      return { revision };
    });
  }

  remove(account: Account, worldId: string, holder: unknown, takeover: boolean): void {
    this.checkId(worldId);
    const id = parseHolder(holder);
    this.cloud.transaction(() => {
      const w = this.cloud.getWorld(account.id, worldId);
      if (!w) return;
      this.checkLease(w, id, takeover);
      this.cloud.deleteWorld(account.id, worldId);
    });
  }
}

// ---- HTTP ---------------------------------------------------------------------------------------

class Window {
  private readonly hits = new Map<string, { count: number; reset: number }>();
  constructor(private readonly perMinute: () => number) {}
  /** True when `key` is over its limit. */
  over(key: string): boolean {
    const t = Date.now();
    const h = this.hits.get(key);
    if (!h || h.reset <= t) {
      if (this.hits.size > 5000) this.hits.clear();
      this.hits.set(key, { count: 1, reset: t + 60_000 });
      return false;
    }
    return ++h.count > this.perMinute();
  }
}

/** Serves `/cloud/*`. Returns false for other URLs. Every route needs a signed-in session. */
export function createCloudRouter(auth: AuthService, cloud: CloudService) {
  const pushes = new Window(() => cloud.limits.pushesPerMinute);
  const light = new Window(() => cloud.limits.pushesPerMinute * 4);

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/cloud/')) return false;
    try {
      const account = auth.resolve(readCookie(req.headers.cookie, SESSION_COOKIE));
      if (!account) throw new CloudError(401, 'sign in to use cloud saves');
      // A tab that was playing one character must not write into another's saves after the player switched in a second tab.
      const playing = req.headers['x-character'];
      if (typeof playing === 'string' && playing !== account.id) throw new CloudError(409, 'The character changed in another tab. Reload to continue.');
      const method = req.method ?? 'GET';
      if (method !== 'GET') {
        // Same CSRF rule as /auth: a known Origin is required for anything that changes data.
        if (!auth.isAllowedOrigin(req.headers.origin)) throw new CloudError(403, 'origin not allowed');
        if ((method === 'PUT' || method === 'POST') && !String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new CloudError(415, 'expected application/json');
      }

      const parts = url.pathname.split('/').filter(Boolean); // ['cloud', 'worlds', id?, action?]
      if (parts[1] !== 'worlds' || parts.length > 4) throw new CloudError(404, 'not found');
      const id = parts[2];
      const action = parts[3];
      const holder = url.searchParams.get('holder') ?? undefined;

      if (!id) {
        if (method !== 'GET') throw new CloudError(405, 'method not allowed');
        json(res, 200, { worlds: cloud.list(account, holder) });
        return true;
      }
      if (!action) {
        if (method === 'GET') {
          json(res, 200, { world: cloud.get(account, id, holder) });
          return true;
        }
        if (method === 'PUT') {
          if (pushes.over(account.id)) throw new CloudError(429, 'too many saves, slow down');
          const body = await readBody(req, cloud.limits.bodyBytes);
          json(res, 200, cloud.push(account, id, body));
          return true;
        }
        if (method === 'DELETE') {
          if (pushes.over(account.id)) throw new CloudError(429, 'too many requests');
          cloud.remove(account, id, holder, url.searchParams.get('takeover') === '1');
          json(res, 200, { ok: true });
          return true;
        }
        throw new CloudError(405, 'method not allowed');
      }

      if (action === 'file' && method === 'GET') {
        const { bytes, revision } = cloud.file(account, id);
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length, 'cache-control': 'no-store', 'x-sc-revision': String(revision) });
        res.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        return true;
      }
      if (action === 'backups' && method === 'GET') {
        json(res, 200, { backups: cloud.backups(account, id) });
        return true;
      }
      if (method !== 'POST') throw new CloudError(405, 'method not allowed');
      if (action === 'restore') {
        if (pushes.over(account.id)) throw new CloudError(429, 'too many requests');
        json(res, 200, cloud.restore(account, id, await readBody(req, 8 * 1024)));
        return true;
      }
      if (action === 'lease' || action === 'release') {
        if (light.over(account.id)) throw new CloudError(429, 'too many requests');
        const body = (await readBody(req, 8 * 1024)) as Record<string, unknown>;
        if (action === 'lease') json(res, 200, { world: cloud.heartbeat(account, id, body?.holder, body?.takeover === true) });
        else {
          cloud.release(account, id, body?.holder);
          json(res, 200, { ok: true });
        }
        return true;
      }
      throw new CloudError(404, 'not found');
    } catch (err) {
      if (err instanceof CloudError) json(res, err.status, { error: err.message, ...err.extra });
      else if (err instanceof AuthError) json(res, err.status, { error: err.message });
      else {
        console.error('[cloud] unexpected error', err);
        json(res, 500, { error: 'internal error' });
      }
      return true;
    }
  };
}
