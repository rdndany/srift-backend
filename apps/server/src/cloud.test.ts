import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHUNK_BYTES, LEASE_MS, base58Encode, decodeChunk, decodeWorldFile, encodeChunk } from '@solrift/shared';
import { CloudError, CloudService } from './cloud';
import { SqliteRepo, type Account } from './db';
import { createGameServer, type GameServer } from './server';

const ORIGIN = 'http://localhost:3000';
const A = 'holderAAAA'; // lease holders are random tab ids
const B = 'holderBBBB';

const chunkBytes = (fill: number) => encodeChunk(new Uint16Array(CHUNK_BYTES).fill(fill));
const b64 = (fill: number) => Buffer.from(chunkBytes(fill)).toString('base64');
const player = (x = 1) => ({ v: 1, x, y: 70, z: 3, yaw: 0, pitch: 0, mode: 'survival', selected: 0, inv: { slots: [] }, vitals: null, mobs: null });
const world = (time = 0.4) => ({ v: 1, time, weather: null, blockEntities: null });

function make(limits = {}) {
  let t = 1_700_000_000_000;
  const repo = new SqliteRepo(':memory:');
  const cloud = new CloudService(repo.cloud, { now: () => t, limits });
  const acct = (n: string): Account => repo.upsertAccount(`Wallet${n}`.padEnd(40, 'x'), t);
  return { repo, cloud, acct, advance: (ms: number) => (t += ms) };
}

const push = (cloud: CloudService, acc: Account, body: Record<string, unknown>, id = '1337') =>
  cloud.push(acc, id, { holder: A, base: null, seed: Number(id), chunks: [], ...body });

const fails = (fn: () => unknown, status: number) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(CloudError);
    expect((err as CloudError).status).toBe(status);
    return err as CloudError;
  }
  throw new Error(`expected a ${status} failure`);
};

describe('CloudService', () => {
  it('creates a world on the first push and serves it back as a .solrift file', () => {
    const { cloud, acct } = make();
    const me = acct('1');
    expect(cloud.get(me, '1337')).toBeNull();
    const res = push(cloud, me, { player: player(5), world: world(), chunks: [{ cx: 0, cz: 0, data: b64(1) }, { cx: -3, cz: 7, data: b64(2) }] });
    expect(res.revision).toBe(1);

    const info = cloud.get(me, '1337', A)!;
    expect(info).toMatchObject({ revision: 1, chunks: 2, leased: true, mine: true, seed: 1337 });
    expect(cloud.get(me, '1337', B)!.mine).toBe(false);

    const { bytes, revision } = cloud.file(me, '1337');
    expect(revision).toBe(1);
    const file = decodeWorldFile(bytes);
    expect(file.seed).toBe(1337);
    expect(file.player?.x).toBe(5);
    expect(file.world?.time).toBeCloseTo(0.4);
    expect(file.chunks.map((c) => `${c.cx},${c.cz}`).sort()).toEqual(['-3,7', '0,0']);
    expect(decodeChunk(file.chunks.find((c) => c.cx === -3)!.encoded)[0]).toBe(2);
  });

  it('later pushes are deltas: only the sent chunks change', () => {
    const { cloud, acct } = make();
    const me = acct('1');
    push(cloud, me, { chunks: [{ cx: 0, cz: 0, data: b64(1) }, { cx: 1, cz: 0, data: b64(2) }], player: player(1) });
    const r = push(cloud, me, { base: 1, chunks: [{ cx: 1, cz: 0, data: b64(9) }] });
    expect(r.revision).toBe(2);
    const file = decodeWorldFile(cloud.file(me, '1337').bytes);
    expect(file.chunks).toHaveLength(2);
    expect(decodeChunk(file.chunks.find((c) => c.cx === 0)!.encoded)[0]).toBe(1);
    expect(decodeChunk(file.chunks.find((c) => c.cx === 1)!.encoded)[0]).toBe(9);
    expect(file.player?.x).toBe(1); // omitted player state is left alone
  });

  it('replace drops chunks that are not in the push', () => {
    const { cloud, acct } = make();
    const me = acct('1');
    push(cloud, me, { chunks: [{ cx: 0, cz: 0, data: b64(1) }, { cx: 5, cz: 5, data: b64(2) }], player: player() });
    push(cloud, me, { base: 1, replace: true, force: true, chunks: [{ cx: 0, cz: 0, data: b64(3) }], player: null });
    const file = decodeWorldFile(cloud.file(me, '1337').bytes);
    expect(file.chunks.map((c) => `${c.cx},${c.cz}`)).toEqual(['0,0']);
    expect(file.player).toBeNull();
  });

  it('rejects a stale base with the current revision, and force overwrites after taking a backup', () => {
    const { cloud, acct } = make();
    const me = acct('1');
    push(cloud, me, { chunks: [{ cx: 0, cz: 0, data: b64(1) }], player: player(1) });
    push(cloud, me, { base: 1, chunks: [{ cx: 0, cz: 0, data: b64(2) }] });
    const err = fails(() => push(cloud, me, { base: 1, chunks: [{ cx: 0, cz: 0, data: b64(7) }] }), 409);
    expect(err.extra.revision).toBe(2);
    expect(cloud.get(me, '1337')!.revision).toBe(2); // nothing was written

    expect(push(cloud, me, { base: 1, force: true, chunks: [{ cx: 0, cz: 0, data: b64(7) }] }).revision).toBe(3);
    const backups = cloud.backups(me, '1337');
    expect(backups[0]).toMatchObject({ kind: 'overwrite', revision: 2 });
    // The overwritten state is recoverable.
    cloud.restore(me, '1337', { holder: A, backupId: backups[0].id });
    expect(decodeChunk(decodeWorldFile(cloud.file(me, '1337').bytes).chunks[0].encoded)[0]).toBe(2);
  });

  it('a push for a world that was deleted is a conflict, not a silent re-create', () => {
    const { cloud, acct } = make();
    const me = acct('1');
    fails(() => push(cloud, me, { base: 4, chunks: [] }), 409);
    expect(cloud.get(me, '1337')).toBeNull();
  });

  it('only one holder writes at a time: leases, expiry, takeover, heartbeat, release', () => {
    const { cloud, acct, advance } = make();
    const me = acct('1');
    push(cloud, me, { player: player() });
    const err = fails(() => push(cloud, me, { holder: B, base: 1 }), 423);
    expect(err.extra.leaseUntil).toBeGreaterThan(0);
    expect(push(cloud, me, { holder: A, base: 1 }).revision).toBe(2); // the holder keeps writing

    advance(LEASE_MS - 1000);
    cloud.heartbeat(me, '1337', A, false);
    advance(LEASE_MS - 1000);
    fails(() => push(cloud, me, { holder: B, base: 2 }), 423); // the heartbeat kept it alive

    advance(2000); // now expired
    expect(push(cloud, me, { holder: B, base: 2 }).revision).toBe(3);
    fails(() => cloud.heartbeat(me, '1337', A, false), 423);
    expect(cloud.heartbeat(me, '1337', A, true).mine).toBe(true); // explicit takeover
    cloud.release(me, '1337', B); // not the holder: no effect
    expect(cloud.get(me, '1337', A)!.leased).toBe(true);
    cloud.release(me, '1337', A);
    expect(cloud.get(me, '1337', A)!.leased).toBe(false);
    expect(push(cloud, me, { holder: B, base: 3 }).revision).toBe(4);
  });

  it('keeps accounts apart', () => {
    const { cloud, acct } = make();
    const a = acct('1');
    const b = acct('2');
    push(cloud, a, { player: player(11), chunks: [{ cx: 0, cz: 0, data: b64(1) }] });
    expect(cloud.get(b, '1337')).toBeNull();
    expect(cloud.list(b)).toEqual([]);
    fails(() => cloud.file(b, '1337'), 404);
    fails(() => cloud.heartbeat(b, '1337', A, true), 404);
    fails(() => cloud.restore(b, '1337', { holder: A, backupId: 1 }), 404);
    cloud.remove(b, '1337', A, true); // nothing to delete
    expect(cloud.get(a, '1337')).not.toBeNull();
    // B's own world with the same id is independent.
    push(cloud, b, { player: player(22) });
    expect(decodeWorldFile(cloud.file(a, '1337').bytes).player?.x).toBe(11);
    expect(decodeWorldFile(cloud.file(b, '1337').bytes).player?.x).toBe(22);
  });

  it('validates everything it is sent', () => {
    const { cloud, acct } = make({ chunksPerPush: 3 });
    const me = acct('1');
    const bad = (body: Record<string, unknown>, status = 400) => fails(() => push(cloud, me, body), status);
    bad({ holder: 'x' });
    bad({ holder: '../../etc/passwd' });
    bad({ base: -1 });
    bad({ base: 1.5 });
    bad({ base: '1' });
    bad({ seed: 5 }); // does not match the id
    bad({ chunks: 'nope' });
    bad({ chunks: [1, 2] });
    bad({ chunks: [{ cx: 0.5, cz: 0, data: b64(1) }] });
    bad({ chunks: [{ cx: 3_000_000, cz: 0, data: b64(1) }] });
    bad({ chunks: [{ cx: 0, cz: 0, data: '***' }] });
    bad({ chunks: [{ cx: 0, cz: 0, data: 'A'.repeat(300_000) }] });
    bad({ chunks: [{ cx: 0, cz: 0, data: b64(1) }, { cx: 0, cz: 0, data: b64(2) }] });
    bad({ chunks: [0, 1, 2, 3].map((i) => ({ cx: i, cz: 0, data: b64(1) })) });
    bad({ chunks: [{ cx: 0, cz: 0, data: Buffer.from([1, 2, 3, 4]).toString('base64') }] }, 422);
    bad({ player: { v: 99, x: 1, y: 1, z: 1 } }, 422); // from a newer game version
    bad({ player: { nonsense: true } }, 422);
    bad({ world: { v: 99 } }, 422);
    bad({ player: { ...player(), inv: 'x'.repeat(300_000) } }, 413);
    fails(() => cloud.push(me, 'abc', { holder: A, base: null, seed: 1, chunks: [] }), 400);
    fails(() => cloud.push(me, '1337', 'a string'), 400);
    fails(() => cloud.push(me, '1337', null), 400);
    expect(cloud.get(me, '1337')).toBeNull(); // no failed attempt left anything behind
  });

  it('takes an automatic backup at most once an hour and keeps only the newest few', () => {
    const { cloud, acct, advance } = make({ backupsPerWorld: 3 });
    const me = acct('1');
    push(cloud, me, { player: player(1), chunks: [{ cx: 0, cz: 0, data: b64(1) }] });
    let base = 1;
    for (let i = 0; i < 4; i++) base = push(cloud, me, { base, player: player(1) }).revision; // within the hour
    expect(cloud.backups(me, '1337')).toHaveLength(1); // the first update backs up the first version, then nothing for an hour

    for (let i = 0; i < 6; i++) {
      advance(61 * 60 * 1000);
      base = push(cloud, me, { base, player: player(100 + i) }).revision;
    }
    const list = cloud.backups(me, '1337');
    expect(list).toHaveLength(3);
    expect(list.every((b) => b.kind === 'auto')).toBe(true);
    expect(list[0].revision).toBeGreaterThan(list[2].revision);
  });

  it('restores a backup, backing up what it replaces so the restore can be undone', () => {
    const { cloud, acct, advance } = make();
    const me = acct('1');
    push(cloud, me, { player: player(1), chunks: [{ cx: 0, cz: 0, data: b64(1) }] });
    advance(2 * 60 * 60 * 1000);
    push(cloud, me, { base: 1, player: player(2), chunks: [{ cx: 0, cz: 0, data: b64(2) }, { cx: 1, cz: 1, data: b64(3) }] });
    const [auto] = cloud.backups(me, '1337');
    expect(auto.revision).toBe(1);
    fails(() => cloud.restore(me, '1337', { holder: B, backupId: auto.id }), 423);
    fails(() => cloud.restore(me, '1337', { holder: A, backupId: 9999 }), 404);
    fails(() => cloud.restore(me, '1337', { holder: A }), 400);

    const { revision } = cloud.restore(me, '1337', { holder: A, backupId: auto.id });
    expect(revision).toBe(3);
    const file = decodeWorldFile(cloud.file(me, '1337').bytes);
    expect(file.player?.x).toBe(1);
    expect(file.chunks.map((c) => `${c.cx},${c.cz}`)).toEqual(['0,0']);
    expect(decodeChunk(file.chunks[0].encoded)[0]).toBe(1);

    const after = cloud.backups(me, '1337');
    const undo = after.find((b) => b.kind === 'restore')!;
    expect(undo.revision).toBe(2);
    cloud.restore(me, '1337', { holder: A, backupId: undo.id });
    expect(decodeWorldFile(cloud.file(me, '1337').bytes).player?.x).toBe(2);
  });

  it('enforces the storage quota exactly and rolls the push back', () => {
    const { cloud, acct } = make({ accountBytes: 30_000 });
    const me = acct('1');
    // A uniform chunk encodes to a few bytes; make noisy ones so they are big.
    const noisy = (seed: number) => {
      const d = new Uint16Array(CHUNK_BYTES);
      for (let i = 0; i < d.length; i++) d[i] = (i * 31 + seed * 7 + (i >> 3)) & 0xff;
      return Buffer.from(encodeChunk(d)).toString('base64');
    };
    expect(push(cloud, me, { chunks: [{ cx: 0, cz: 0, data: b64(1) }] }).revision).toBe(1);
    fails(() => push(cloud, me, { base: 1, chunks: [{ cx: 1, cz: 0, data: noisy(1) }, { cx: 2, cz: 0, data: noisy(2) }] }), 413);
    expect(cloud.get(me, '1337')).toMatchObject({ revision: 1, chunks: 1 });
    // Overwriting the same chunk repeatedly does not count twice.
    for (let i = 0; i < 5; i++) expect(push(cloud, me, { base: 1 + i, chunks: [{ cx: 0, cz: 0, data: b64(i) }] }).revision).toBe(2 + i);
  });

  it('limits how many worlds an account can have', () => {
    const { cloud, acct } = make({ worldsPerAccount: 2 });
    const me = acct('1');
    push(cloud, me, {}, '1');
    push(cloud, me, {}, '2');
    fails(() => push(cloud, me, {}, '3'), 403);
  });

  it('deleting a world removes its chunks and backups', () => {
    const { cloud, acct, repo } = make();
    const me = acct('1');
    push(cloud, me, { chunks: [{ cx: 0, cz: 0, data: b64(1) }], player: player() });
    push(cloud, me, { base: 1, force: true, chunks: [{ cx: 0, cz: 0, data: b64(2) }] });
    expect(cloud.backups(me, '1337').length).toBeGreaterThan(0);
    fails(() => cloud.remove(me, '1337', B, false), 423);
    cloud.remove(me, '1337', A, false);
    expect(cloud.get(me, '1337')).toBeNull();
    expect(repo.cloud.getChunks(me.id, '1337')).toEqual([]);
    expect(repo.cloud.listBackups(me.id, '1337')).toEqual([]);
    expect(repo.cloud.accountBytes(me.id)).toBe(0);
  });
});

describe('cloud saves over HTTP', () => {
  let server: GameServer;
  let base: string;

  beforeAll(async () => {
    server = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000, cloud: { limits: { pushesPerMinute: 6 } } });
    base = `http://127.0.0.1:${await server.listen(0)}`;
  });
  afterAll(() => server.close());

  const headers = (cookie: string, extra: Record<string, string> = {}) => ({ origin: ORIGIN, 'content-type': 'application/json', cookie, ...extra });

  async function login() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const address = base58Encode(new Uint8Array((publicKey as KeyObject).export({ format: 'der', type: 'spki' }).subarray(-32)));
    const post = (url: string, body: unknown) => fetch(base + url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ch = await (await post('/auth/challenge', { address })).json();
    const res = await post('/auth/verify', { message: ch.message, signature: sign(null, Buffer.from(ch.message), privateKey).toString('base64') });
    return (res.headers.get('set-cookie') ?? '').split(';')[0];
  }

  const put = (cookie: string, body: unknown, id = '1337') => fetch(`${base}/cloud/worlds/${id}`, { method: 'PUT', headers: headers(cookie), body: JSON.stringify(body) });
  const body = (extra: Record<string, unknown> = {}) => ({ holder: A, base: null, seed: 1337, chunks: [{ cx: 0, cz: 0, data: b64(4) }], player: player(8), world: world(), ...extra });

  it('needs a session', async () => {
    expect((await fetch(`${base}/cloud/worlds`)).status).toBe(401);
    expect((await fetch(`${base}/cloud/worlds/1337/file`)).status).toBe(401);
    expect((await fetch(`${base}/cloud/worlds/1337`, { method: 'PUT', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
  });

  it('uploads, lists, downloads, and refuses bad requests', async () => {
    const cookie = await login();
    const res = await put(cookie, body());
    expect(res.status).toBe(200);
    expect((await res.json()).revision).toBe(1);

    const list = await (await fetch(`${base}/cloud/worlds?holder=${A}`, { headers: { cookie } })).json();
    expect(list.worlds).toHaveLength(1);
    expect(list.worlds[0]).toMatchObject({ worldId: '1337', revision: 1, mine: true });
    expect((await (await fetch(`${base}/cloud/worlds/42`, { headers: { cookie } })).json()).world).toBeNull();

    const file = await fetch(`${base}/cloud/worlds/1337/file`, { headers: { cookie } });
    expect(file.headers.get('content-type')).toBe('application/octet-stream');
    expect(file.headers.get('x-sc-revision')).toBe('1');
    const decoded = decodeWorldFile(new Uint8Array(await file.arrayBuffer()));
    expect(decoded.player?.x).toBe(8);
    expect(decoded.chunks).toHaveLength(1);

    const stale = await put(cookie, body({ base: 0 }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).revision).toBe(1);
    const locked = await put(cookie, body({ holder: B, base: 1 }));
    expect(locked.status).toBe(423);

    expect((await fetch(`${base}/cloud/worlds/1337`, { method: 'PUT', headers: headers(cookie, { 'content-type': 'text/plain' }), body: '{}' })).status).toBe(415);
    expect((await fetch(`${base}/cloud/worlds/1337`, { method: 'PUT', headers: headers(cookie), body: '{nope' })).status).toBe(400);
    expect((await fetch(`${base}/cloud/worlds/not-a-seed`, { headers: { cookie } })).status).toBe(400);
    expect((await fetch(`${base}/cloud/other`, { headers: { cookie } })).status).toBe(404);
  });

  it('refuses writes from other origins (CSRF) and other users cannot see the world', async () => {
    const owner = await login();
    expect((await put(owner, body())).status).toBe(200);
    const evil = await fetch(`${base}/cloud/worlds/1337`, { method: 'PUT', headers: headers(owner, { origin: 'https://evil.example' }), body: JSON.stringify(body({ base: 1 })) });
    expect(evil.status).toBe(403);
    const noOrigin = await fetch(`${base}/cloud/worlds/1337`, { method: 'DELETE', headers: { cookie: owner } });
    expect(noOrigin.status).toBe(403);

    const other = await login();
    expect((await (await fetch(`${base}/cloud/worlds/1337`, { headers: { cookie: other } })).json()).world).toBeNull();
    expect((await fetch(`${base}/cloud/worlds/1337/file`, { headers: { cookie: other } })).status).toBe(404);
    const del = await fetch(`${base}/cloud/worlds/1337?holder=${A}&takeover=1`, { method: 'DELETE', headers: { origin: ORIGIN, cookie: other } });
    expect(del.status).toBe(200); // deletes the other user's own (empty) namespace: nothing
    expect((await (await fetch(`${base}/cloud/worlds/1337`, { headers: { cookie: owner } })).json()).world).not.toBeNull();
  });

  it('rate-limits writes per account', async () => {
    const cookie = await login();
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) statuses.push((await put(cookie, body({ base: i === 0 ? null : i }))).status);
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(6).every((s) => s === 429)).toBe(true);
  });

  it('leases can be renewed and released over HTTP', async () => {
    const cookie = await login();
    await put(cookie, body());
    const post = (action: string, b: unknown) => fetch(`${base}/cloud/worlds/1337/${action}`, { method: 'POST', headers: headers(cookie), body: JSON.stringify(b) });
    expect((await post('lease', { holder: B })).status).toBe(423);
    expect((await post('lease', { holder: B, takeover: true })).status).toBe(200);
    expect((await post('release', { holder: B })).status).toBe(200);
    expect((await post('lease', { holder: A })).status).toBe(200);
    const backups = await (await fetch(`${base}/cloud/worlds/1337/backups`, { headers: { cookie } })).json();
    expect(backups.backups).toEqual([]);
  });
});
