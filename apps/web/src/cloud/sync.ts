'use client';

import { create } from 'zustand';
import { CLOUD_LIMITS, type CloudBackupInfo, type CloudWorldInfo } from '@solrift/shared';
import { saveBridge } from '../game/saveBridge';
import { META, LocalSaveStore, type SyncRecord } from '../game/storage';
import { currentSeed, decodeWorldBytes } from '../game/worldIO';

/**
 * Cloud sync for the world open in this tab. The local copy (IndexedDB) is always the working copy:
 * the game never waits for the network. While signed in with sync turned on, changes are uploaded in
 * the background as deltas (only chunks edited since the last upload), and each upload names the
 * cloud revision it is based on, so a stale device gets a conflict instead of overwriting newer
 * progress. Nothing is ever merged silently: whenever the two copies differ the player decides.
 */

export type Phase =
  | 'off' // signed out
  | 'checking'
  | 'choose' // first time on this device: upload, use the cloud copy, or not now
  | 'disabled' // the player turned sync off for this world on this device
  | 'idle' // on, waiting for the next upload
  | 'syncing'
  | 'synced'
  | 'conflict' // the cloud copy changed on another device
  | 'locked' // another device or tab is writing this world
  | 'missing' // the cloud copy was deleted elsewhere
  | 'offline'
  | 'error';

interface CloudState {
  phase: Phase;
  /** Human-readable detail for `error` and progress. */
  message: string;
  cloud: CloudWorldInfo | null;
  /** The device already holds a local world (relevant while choosing). */
  hasLocal: boolean;
  lastSync: number | null;
  revision: number | null;
  backups: CloudBackupInfo[];
  busy: boolean;
}

export const useCloud = create<CloudState>()(() => ({
  phase: 'off',
  message: '',
  cloud: null,
  hasLocal: false,
  lastSync: null,
  revision: null,
  backups: [],
  busy: false,
}));

const set = (p: Partial<CloudState>): void => useCloud.setState(p);

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Identifies this tab as the lease holder. It survives reloads (so a reload is not "another device"). */
function holderId(): string {
  try {
    const have = sessionStorage.getItem('solrift.holder');
    if (have && /^[A-Za-z0-9_-]{8,64}$/.test(have)) return have;
    const fresh = crypto.randomUUID().replace(/-/g, '');
    sessionStorage.setItem('solrift.holder', fresh);
    return fresh;
  } catch {
    return crypto.randomUUID().replace(/-/g, '');
  }
}

const HOLDER = typeof window === 'undefined' ? 'server-render' : holderId();
const BATCH_BYTES = 3 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

interface Session {
  accountId: string;
  store: LocalSaveStore;
  seed: number;
  worldId: string;
}

let session: Session | null = null;
let generation = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let initialized = false;
let queue: Promise<unknown> = Promise.resolve();
let hiddenListener: (() => void) | null = null;

/** Run operations one at a time: a manual click must not interleave with the background upload. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function api<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<{ body: T; res: Response }> {
  if (!session) throw new HttpError(0, 'not signed in');
  let res: Response;
  try {
    res = await fetch(`/api/cloud/worlds/${session.worldId}${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { 'x-character': session.accountId, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new HttpError(0, 'could not reach the server');
  }
  const body = res.headers.get('content-type')?.includes('json') ? ((await res.json().catch(() => ({}))) as T) : ({} as T);
  if (!res.ok) throw new HttpError(res.status, String((body as Record<string, unknown>).error ?? `request failed (${res.status})`), body as Record<string, unknown>);
  return { body, res };
}

const fetchInfo = async (): Promise<CloudWorldInfo | null> => (await api<{ world: CloudWorldInfo | null }>(`?holder=${HOLDER}`)).body.world;

/** Syncing needs the running game (to flush it and to stop it overwriting a download). */
async function waitForGame(): Promise<boolean> {
  for (let i = 0; i < 600; i++) {
    if (saveBridge.freeze && saveBridge.flush) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function fail(err: unknown): void {
  if (err instanceof HttpError) {
    if (err.status === 0) set({ phase: 'offline', message: 'Cannot reach the server. Your world is safe on this device.', busy: false });
    else if (err.status === 401) set({ phase: 'error', message: 'Your session expired. Sign in again.', busy: false });
    else if (err.status === 423) set({ phase: 'locked', message: '', busy: false });
    else set({ phase: 'error', message: err.message, busy: false });
  } else set({ phase: 'error', message: err instanceof Error ? err.message : String(err), busy: false });
}

const fresh = (accountId: string, enabled: boolean, extra: Partial<SyncRecord> = {}): SyncRecord => ({ accountId, enabled, revision: null, seq: 0, dirty: {}, full: false, ...extra });

// ---- download -----------------------------------------------------------------------------------

/** Replace the local world with the cloud copy and reload into it. */
async function pullCloud(): Promise<void> {
  if (!session) return;
  const s = session;
  set({ phase: 'syncing', message: 'Downloading your cloud world...', busy: true });
  const { res } = await api('/file');
  const revision = Number(res.headers.get('x-sc-revision'));
  const world = await decodeWorldBytes(new Uint8Array(await res.arrayBuffer()));
  if (world.seed !== s.seed || !Number.isInteger(revision)) throw new Error('the cloud copy does not match this world');
  if (!(await waitForGame())) throw new Error('the game is not running');
  // From here nothing the running game does may write: the page is about to reload into the download.
  saveBridge.freeze?.();
  await s.store.replaceWorld(world, fresh(s.accountId, true, { revision }));
  location.reload();
  await new Promise(() => undefined); // never settle: the page is going away
}

// ---- upload -------------------------------------------------------------------------------------

interface PushOptions {
  force?: boolean;
  takeover?: boolean;
}

/** Upload what changed since the last sync (or just renew the lease when nothing did). */
async function pushNow(opts: PushOptions = {}): Promise<void> {
  if (!session) return;
  const s = session;
  await saveBridge.flush?.(); // pending edits into IndexedDB first
  let rec = await s.store.getSync();
  if (!rec || !rec.enabled || rec.accountId !== s.accountId) return;
  if (rec.full) rec = (await s.store.markAllDirty()) ?? rec;

  const keys = Object.keys(rec.dirty);
  if (keys.length === 0 && !opts.force) {
    if (rec.revision === null) return; // nothing to upload and nothing in the cloud to keep leased
    const { body } = await api<{ world: CloudWorldInfo }>('/lease', { method: 'POST', body: JSON.stringify({ holder: HOLDER, takeover: opts.takeover === true }) });
    set({ phase: 'synced', cloud: body.world, revision: rec.revision, lastSync: Date.now(), message: '', busy: false });
    return;
  }

  set({ phase: 'syncing', message: '', busy: true });
  const snapshotSeq = rec.seq;
  const metaDirty = META in rec.dirty || rec.full || opts.force === true;
  const chunks = await s.store.readEncoded(keys.filter((k) => k !== META));

  // Group the chunks into requests of at most BATCH_BYTES and the server's chunk limit.
  const batches: { cx: number; cz: number; data: string }[][] = [[]];
  let size = 0;
  for (const c of chunks) {
    const data = toBase64(c.encoded);
    const cur = batches[batches.length - 1];
    if (cur.length > 0 && (size + data.length > BATCH_BYTES || cur.length >= CLOUD_LIMITS.chunksPerPush)) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push({ cx: c.cx, cz: c.cz, data });
    size += data.length;
  }

  let base = rec.revision;
  let last: { revision: number } = { revision: base ?? 0 };
  for (let i = 0; i < batches.length; i++) {
    const isFirst = i === 0;
    const isLast = i === batches.length - 1;
    const body: Record<string, unknown> = {
      holder: HOLDER,
      base,
      seed: s.seed,
      takeover: opts.takeover === true,
      force: isFirst && (rec.full || opts.force === true),
      replace: isFirst && rec.full,
      chunks: batches[i],
    };
    if (isLast && metaDirty) {
      body.player = await s.store.loadPlayer();
      body.world = await s.store.loadWorldState();
    }
    const out = await api<{ revision: number }>('', { method: 'PUT', body: JSON.stringify(body) });
    last = out.body;
    base = out.body.revision;
    const sent = batches[i].map((c) => `${c.cx},${c.cz}`);
    if (isLast && metaDirty) sent.push(META);
    await s.store.commitSync(out.body.revision, sent, snapshotSeq, isFirst && rec.full);
  }
  const info = await fetchInfo().catch(() => null);
  set({ phase: 'synced', cloud: info, revision: last.revision, lastSync: Date.now(), message: '', busy: false });
}

/** Turn an upload/lease failure into the matching state. Returns true when it was one the player can resolve. */
function handlePushError(err: unknown): void {
  if (err instanceof HttpError && err.status === 409) {
    const revision = Number(err.body.revision ?? 0);
    set({ busy: false, message: '', cloud: { ...(useCloud.getState().cloud ?? ({} as CloudWorldInfo)), revision, updatedAt: Number(err.body.updatedAt ?? 0) } });
    set({ phase: revision === 0 ? 'missing' : 'conflict' });
    return;
  }
  fail(err);
}

// ---- start / stop -------------------------------------------------------------------------------

async function initialize(myGen: number): Promise<void> {
  const s = session;
  if (!s) return;
  let cloud: CloudWorldInfo | null;
  let rec: SyncRecord | null;
  let hasLocal = false;
  try {
    cloud = await fetchInfo();
    rec = await s.store.getSync();
    if (rec && rec.accountId !== s.accountId) rec = null; // another account used this device: ask again
    if (!rec) hasLocal = await s.store.hasData();
  } catch (err) {
    if (generation === myGen) fail(err);
    return;
  }
  if (generation !== myGen) return;
  set({ cloud, hasLocal, revision: rec?.revision ?? null, message: '', busy: false });

  try {
    if (!rec) {
      if (!cloud && !hasLocal) {
        await s.store.putSync(fresh(s.accountId, true));
        initialized = true;
        set({ phase: 'idle' });
      } else if (cloud && !hasLocal) {
        initialized = true;
        await pullCloud(); // a new device: just bring the world over
      } else {
        initialized = true;
        set({ phase: 'choose' });
      }
      return;
    }
    initialized = true;
    if (!rec.enabled) {
      set({ phase: 'disabled' });
      return;
    }
    if (!cloud) {
      if (rec.revision === null) set({ phase: 'idle' });
      else set({ phase: 'missing' });
      return;
    }
    if (rec.revision === cloud.revision) {
      set({ phase: 'idle' });
      return;
    }
    const dirty = Object.keys(rec.dirty).length > 0 || rec.full;
    if (rec.revision === null || dirty) set({ phase: 'conflict' });
    else await pullCloud(); // the cloud copy is newer and this device changed nothing since
  } catch (err) {
    initialized = false;
    if (generation === myGen) fail(err);
  }
}

function tickMs(): number {
  const p = new URLSearchParams(location.search);
  const n = Number(p.get('syncms'));
  return p.has('debug') && Number.isFinite(n) && n >= 250 ? n : 60_000;
}

const BACKGROUND: Phase[] = ['idle', 'synced', 'syncing', 'locked', 'offline', 'error'];

async function tick(myGen: number): Promise<void> {
  if (generation !== myGen || !session) return;
  if (!initialized) {
    await initialize(myGen);
    return;
  }
  if (!BACKGROUND.includes(useCloud.getState().phase)) return; // waiting for the player's decision
  try {
    await pushNow();
  } catch (err) {
    handlePushError(err);
  }
}

export const cloud = {
  /** Begin syncing for a signed-in account (safe to call again; restarts cleanly). */
  start(accountId: string): void {
    this.stop();
    const myGen = ++generation;
    const seed = currentSeed();
    session = { accountId, store: new LocalSaveStore(String(seed)), seed, worldId: String(seed) };
    initialized = false;
    set({ phase: 'checking', message: '', cloud: null, lastSync: null, backups: [], busy: false });
    void exclusive(async () => {
      if (generation !== myGen) return;
      await initialize(myGen);
    });
    timer = setInterval(() => void exclusive(() => tick(myGen)), tickMs());
    hiddenListener = () => {
      if (document.hidden) void exclusive(() => tick(myGen));
    };
    document.addEventListener('visibilitychange', hiddenListener);
    window.addEventListener('pagehide', releaseLease);
  },

  /** Sign-out: give the lease back first (the session cookie is still valid), then stop. */
  async leave(): Promise<void> {
    const s = session;
    if (s) {
      await fetch(`/api/cloud/worlds/${s.worldId}/release`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-character': s.accountId },
        body: JSON.stringify({ holder: HOLDER }),
      }).catch(() => undefined);
    }
    this.stop();
  },

  /** Stop uploading (signed out or the page is going away) and give the lease back if we still can. */
  stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    if (hiddenListener) document.removeEventListener('visibilitychange', hiddenListener);
    hiddenListener = null;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', releaseLease);
    if (session) releaseLease();
    session = null;
    initialized = false;
    generation++;
    set({ phase: 'off', message: '', cloud: null, backups: [], busy: false });
  },

  /** Upload now (the "Sync now" button). */
  syncNow(): Promise<void> {
    const myGen = generation;
    return exclusive(async () => {
      if (generation !== myGen || !session) return;
      if (!initialized) return initialize(myGen);
      if (!BACKGROUND.includes(useCloud.getState().phase)) return;
      try {
        await pushNow();
      } catch (err) {
        handlePushError(err);
      }
    });
  },

  /** First-time choice on this device. */
  choose(action: 'upload' | 'cloud' | 'later'): Promise<void> {
    return exclusive(async () => {
      if (!session) return;
      const s = session;
      try {
        if (action === 'later') {
          await s.store.putSync(fresh(s.accountId, false));
          set({ phase: 'disabled' });
        } else if (action === 'cloud') {
          await pullCloud();
        } else {
          await s.store.putSync(fresh(s.accountId, true, { full: true }));
          await pushNow({ force: true });
        }
      } catch (err) {
        handlePushError(err);
      }
    });
  },

  /** The cloud copy changed elsewhere: keep this device's world or take the cloud one. */
  resolveConflict(action: 'mine' | 'cloud'): Promise<void> {
    return exclusive(async () => {
      if (!session) return;
      const s = session;
      try {
        if (action === 'cloud') {
          await pullCloud();
          return;
        }
        const rec = (await s.store.getSync()) ?? fresh(s.accountId, true);
        await s.store.putSync({ ...rec, enabled: true, accountId: s.accountId, full: true, revision: useCloud.getState().cloud?.revision ?? rec.revision });
        // The player chose this device's world, so it also takes the write lease from the other device.
        await pushNow({ force: true, takeover: true });
      } catch (err) {
        handlePushError(err);
      }
    });
  },

  /** The cloud copy was deleted elsewhere. */
  resolveMissing(action: 'upload' | 'off'): Promise<void> {
    return exclusive(async () => {
      if (!session) return;
      const s = session;
      try {
        if (action === 'off') {
          await s.store.putSync(fresh(s.accountId, false));
          set({ phase: 'disabled' });
          return;
        }
        await s.store.putSync(fresh(s.accountId, true, { full: true }));
        await pushNow({ force: true });
      } catch (err) {
        handlePushError(err);
      }
    });
  },

  /** Another device or tab holds the lease; write anyway. */
  takeover(): Promise<void> {
    return exclusive(async () => {
      if (!session) return;
      try {
        await pushNow({ takeover: true });
      } catch (err) {
        handlePushError(err);
      }
    });
  },

  /** Turn sync back on for this world (shows the choice again). */
  async enable(): Promise<void> {
    if (!session) return;
    const s = session;
    // Forget the old choice and re-run the first-time check, so an existing cloud copy is never overwritten unasked.
    await s.store.clearSyncRecord();
    initialized = false;
    const myGen = generation;
    await exclusive(() => initialize(myGen));
  },

  async disable(): Promise<void> {
    if (!session) return;
    const s = session;
    await exclusive(async () => {
      const rec = (await s.store.getSync()) ?? fresh(s.accountId, false);
      await s.store.putSync({ ...rec, enabled: false });
      releaseLease();
      set({ phase: 'disabled', message: '' });
    });
  },

  /** Delete the cloud copy (the local world stays). */
  deleteCloud(): Promise<void> {
    return exclusive(async () => {
      if (!session) return;
      const s = session;
      set({ busy: true });
      try {
        await api(`?holder=${HOLDER}`, { method: 'DELETE' });
        const rec = (await s.store.getSync()) ?? fresh(s.accountId, true);
        await s.store.putSync({ ...rec, revision: null, full: true });
        set({ phase: 'idle', cloud: null, backups: [], revision: null, busy: false, message: 'Cloud copy deleted. The next sync uploads this world again.' });
      } catch (err) {
        handlePushError(err);
      }
    });
  },

  async loadBackups(): Promise<void> {
    try {
      const { body } = await api<{ backups: CloudBackupInfo[] }>('/backups');
      set({ backups: body.backups });
    } catch (err) {
      fail(err);
    }
  },

  /** Make a cloud backup the current cloud world, then download it. */
  restoreBackup(id: number): Promise<void> {
    return exclusive(async () => {
      if (!session) return;
      set({ busy: true });
      try {
        await api('/restore', { method: 'POST', body: JSON.stringify({ holder: HOLDER, backupId: id }) });
        await pullCloud();
      } catch (err) {
        handlePushError(err);
      }
    });
  },
};

/** Give the write lease back so another device does not have to wait for it to expire. */
function releaseLease(): void {
  const s = session;
  if (!s) return;
  try {
    void fetch(`/api/cloud/worlds/${s.worldId}/release`, {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-character': s.accountId },
      body: JSON.stringify({ holder: HOLDER }),
    }).catch(() => undefined);
  } catch {
    /* best effort */
  }
}
