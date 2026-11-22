import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { base58Encode, lookCode, type ServerMessage } from '@solrift/shared';
import { AuthError, AuthService, SESSION_COOKIE } from './auth';
import { SqliteRepo } from './db';
import { createGameServer, type GameServer } from './server';

const ORIGIN = 'http://localhost:3000';

interface Wallet {
  address: string;
  sign(message: string): string; // base64 signature
}

function newWallet(): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = (publicKey as KeyObject).export({ format: 'der', type: 'spki' }).subarray(-32);
  return {
    address: base58Encode(new Uint8Array(raw)),
    sign: (m) => sign(null, Buffer.from(m, 'utf8'), privateKey).toString('base64'),
  };
}

describe('AuthService (clock-controlled)', () => {
  const make = () => {
    let t = 1_700_000_000_000;
    const repo = new SqliteRepo(':memory:');
    const auth = new AuthService(repo, { origins: [ORIGIN], now: () => t });
    return { auth, repo, advance: (ms: number) => (t += ms) };
  };
  const bytes = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));

  it('signs in, resolves the session and logs out', () => {
    const { auth } = make();
    const w = newWallet();
    const { message } = auth.challenge(w.address, ORIGIN);
    const { account, token } = auth.verify(message, bytes(w.sign(message)), ORIGIN);
    expect(account.wallet).toBe(w.address);
    expect(auth.resolve(token)?.id).toBe(account.id);
    auth.logout(token);
    expect(auth.resolve(token)).toBeNull();
  });

  it('challenges expire after five minutes', () => {
    const { auth, advance } = make();
    const w = newWallet();
    const { message } = auth.challenge(w.address, ORIGIN);
    advance(5 * 60 * 1000 + 1);
    expect(() => auth.verify(message, bytes(w.sign(message)), ORIGIN)).toThrow(AuthError);
  });

  it('a challenge works once, even after a failed attempt', () => {
    const { auth } = make();
    const w = newWallet();
    const { message } = auth.challenge(w.address, ORIGIN);
    const other = newWallet();
    expect(() => auth.verify(message, bytes(other.sign(message)), ORIGIN)).toThrow(/bad signature/);
    expect(() => auth.verify(message, bytes(w.sign(message)), ORIGIN)).toThrow(/expired or unknown/);
  });

  it('rejects a replayed signature', () => {
    const { auth } = make();
    const w = newWallet();
    const { message } = auth.challenge(w.address, ORIGIN);
    const sig = bytes(w.sign(message));
    auth.verify(message, sig, ORIGIN);
    expect(() => auth.verify(message, sig, ORIGIN)).toThrow(AuthError);
  });

  it('rejects messages that differ from what the server issued', () => {
    const { auth } = make();
    const w = newWallet();
    const { message } = auth.challenge(w.address, ORIGIN);
    const edited = message.replace('does not cost anything', 'costs everything');
    expect(() => auth.verify(edited, bytes(w.sign(edited)), ORIGIN)).toThrow(AuthError);
    // A message the server never issued, even if well-formed and correctly signed.
    const forged = message.replace(/Nonce: \w+/, 'Nonce: AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(() => auth.verify(forged, bytes(w.sign(forged)), ORIGIN)).toThrow(AuthError);
  });

  it('is bound to the origin that asked for the challenge', () => {
    const repo = new SqliteRepo(':memory:');
    const auth = new AuthService(repo, { origins: [ORIGIN, 'http://localhost:3100'] });
    const w = newWallet();
    const { message } = auth.challenge(w.address, ORIGIN);
    expect(() => auth.verify(message, bytes(w.sign(message)), 'http://localhost:3100')).toThrow(AuthError);
    expect(() => auth.challenge(w.address, 'https://evil.example')).toThrow(/origin/);
  });

  it('does not accept short, truncated or all-zero signatures', () => {
    const { auth } = make();
    const w = newWallet();
    for (const sig of [new Uint8Array(0), new Uint8Array(63), new Uint8Array(64), new Uint8Array(65).fill(1)]) {
      const { message } = auth.challenge(w.address, ORIGIN);
      expect(() => auth.verify(message, sig, ORIGIN)).toThrow(AuthError);
    }
  });

  it('sessions expire after 30 days and slide forward when used', () => {
    const { auth, advance } = make();
    const w = newWallet();
    const { message } = auth.challenge(w.address, ORIGIN);
    const { token } = auth.verify(message, bytes(w.sign(message)), ORIGIN);
    const day = 24 * 60 * 60 * 1000;
    advance(20 * day);
    expect(auth.resolve(token)).not.toBeNull(); // refreshed here: now expires on day 50
    advance(20 * day);
    expect(auth.resolve(token)).not.toBeNull();
    advance(31 * day);
    expect(auth.resolve(token)).toBeNull();
    expect(auth.purgeExpired()).toBe(1);
  });

  it('ignores junk tokens', () => {
    const { auth } = make();
    for (const t of [undefined, '', 'x', 'a'.repeat(500), "'; DROP TABLE sessions;--"]) expect(auth.resolve(t)).toBeNull();
  });
});

describe('SqliteRepo', () => {
  it('keeps one account per wallet and a public name that does not contain it', () => {
    const repo = new SqliteRepo(':memory:');
    const a = repo.upsertAccount('WalletAddress111111111111111111111111111', 1000);
    const b = repo.upsertAccount('WalletAddress111111111111111111111111111', 2000);
    expect(b.id).toBe(a.id);
    expect(b.displayName).toBe(a.displayName);
    expect(b.lastLoginAt).toBe(2000);
    expect(b.createdAt).toBe(1000);
    expect(a.displayName).toMatch(/^Player[0-9a-f]{6}$/);
    expect(repo.getAccount(a.id)?.wallet).toBe(a.wallet);
    expect(repo.getAccount('nope')).toBeNull();
  });

  it('upgrades a database from when a wallet had one account only', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'solrift-'));
    const file = path.join(dir, 'old.sqlite');
    try {
      const old = new DatabaseSync(file);
      old.exec(`
        CREATE TABLE accounts (id TEXT PRIMARY KEY, wallet TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, created_at INTEGER NOT NULL, last_login_at INTEGER NOT NULL, look INTEGER);
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL);
        INSERT INTO accounts VALUES ('acc1', 'WalletOld', 'Veteran', 1, 1, 42);
        INSERT INTO sessions VALUES ('tok', 'acc1', 1, 1, 99999);
      `);
      old.close();
      const repo = new SqliteRepo(file);
      expect(repo.getSession('tok', 5)?.account).toMatchObject({ id: 'acc1', displayName: 'Veteran', look: 42 }); // nothing was lost
      expect(repo.upsertAccount('WalletOld', 6).id).toBe('acc1');
      const second = repo.createCharacter('acc1', { displayName: 'Second', look: 7, class: 'mage' }, 7);
      expect(second?.wallet).toBe('WalletOld');
      expect(repo.listCharacters('WalletOld').map((c) => c.displayName)).toEqual(['Veteran', 'Second']);
      repo.close();
      const again = new SqliteRepo(file); // the upgrade runs once, a second start leaves it alone
      expect(again.listCharacters('WalletOld')).toHaveLength(2);
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('survives a restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'solrift-'));
    const file = path.join(dir, 'nested', 'db.sqlite');
    try {
      const one = new SqliteRepo(file);
      const acc = one.upsertAccount('W'.repeat(40), 5);
      one.createSession(acc.id, 'hash', 5, 5000);
      one.close();
      const two = new SqliteRepo(file);
      expect(two.upsertAccount('W'.repeat(40), 9).id).toBe(acc.id);
      expect(two.getSession('hash', 10)?.account.id).toBe(acc.id);
      expect(two.getSession('hash', 6000)).toBeNull(); // expired
      two.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('auth over HTTP and WebSocket', () => {
  let server: GameServer;
  let repo: SqliteRepo;
  let base: string;
  let port: number;

  beforeAll(async () => {
    repo = new SqliteRepo(':memory:');
    server = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000, repo });
    port = await server.listen(0);
    base = `http://127.0.0.1:${port}`;
  });
  afterAll(() => server.close());

  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  async function login(w = newWallet()) {
    const ch = await (await post('/auth/challenge', { address: w.address })).json();
    const res = await post('/auth/verify', { message: ch.message, signature: w.sign(ch.message) });
    return { res, wallet: w, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
  }

  it('full login flow with a hardened cookie', async () => {
    const { res, wallet, cookie } = await login();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account.wallet).toBe(wallet.address);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const me = await (await fetch(base + '/auth/me', { headers: { cookie } })).json();
    expect(me.account.id).toBe(body.account.id);
    expect((await (await fetch(base + '/auth/me')).json()).account).toBeNull();

    const out = await post('/auth/logout', {}, { cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await (await fetch(base + '/auth/me', { headers: { cookie } })).json()).account).toBeNull();
  });

  it('shares the cookie with sibling subdomains when it is given a cookie domain (and not otherwise)', async () => {
    const other = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000, repo: new SqliteRepo(':memory:'), cookieDomain: 'example.com', secureCookies: true });
    const p = await other.listen(0);
    try {
      const w = newWallet();
      const url = `http://127.0.0.1:${p}`;
      const headers = { origin: ORIGIN, 'content-type': 'application/json' };
      const ch = await (await fetch(url + '/auth/challenge', { method: 'POST', headers, body: JSON.stringify({ address: w.address }) })).json();
      const res = await fetch(url + '/auth/verify', { method: 'POST', headers, body: JSON.stringify({ message: ch.message, signature: w.sign(ch.message) }) });
      const setCookie = res.headers.get('set-cookie')!;
      expect(setCookie).toContain('Domain=example.com');
      expect(setCookie).toContain('Secure');
      const out = await fetch(url + '/auth/logout', { method: 'POST', headers: { ...headers, cookie: setCookie.split(';')[0] }, body: '{}' });
      expect(out.headers.get('set-cookie')).toContain('Domain=example.com'); // the cookie is cleared where it was set
    } finally {
      await other.close();
    }
    const { res } = await login();
    expect(res.headers.get('set-cookie')).not.toContain('Domain=');
  });

  it('the same wallet always lands in the same account', async () => {
    const w = newWallet();
    const a = await (await login(w)).res.json();
    const b = await (await login(w)).res.json();
    expect(b.account.id).toBe(a.account.id);
    expect(b.account.displayName).not.toContain(w.address.slice(0, 6));
  });

  it('creates the character once: it can be neither edited nor renamed', async () => {
    const { cookie, res } = await login();
    expect((await res.json()).account.look).toBeNull();
    const code = lookCode({ skin: 6, hair: 4, style: 2, eyes: 5, shirt: 7, pants: 3 });

    // Not signed in, bad names, bad looks.
    expect((await post('/auth/character', { displayName: 'Brightpath', class: 'warrior', look: code })).status).toBe(401);
    expect((await post('/auth/character', { displayName: 'x', class: 'warrior', look: code }, { cookie })).status).toBe(400);
    expect((await post('/auth/character', { displayName: '<script>', class: 'warrior', look: code }, { cookie })).status).toBe(400);
    expect((await post('/auth/character', { displayName: 7, class: 'warrior', look: code }, { cookie })).status).toBe(400);
    expect((await post('/auth/character', { class: 'warrior', look: code }, { cookie })).status).toBe(400);
    expect((await post('/auth/character', { displayName: 'Brightpath' }, { cookie })).status).toBe(400);
    expect((await post('/auth/character', { displayName: 'Brightpath', class: 'warrior', look: -3 }, { cookie })).status).toBe(400);
    expect((await post('/auth/character', { displayName: 'Brightpath', class: 'warrior', look: 1.5 }, { cookie })).status).toBe(400);
    expect((await post('/auth/character', { displayName: 'Brightpath', class: 'warrior', look: 5 }, { cookie, origin: 'https://evil.example' })).status).toBe(403);

    const ok = await post('/auth/character', { displayName: 'Brightpath', class: 'warrior', look: code }, { cookie });
    expect(ok.status).toBe(200);
    expect((await ok.json()).account).toMatchObject({ displayName: 'Brightpath', look: code });
    expect((await (await fetch(base + '/auth/me', { headers: { cookie } })).json()).account).toMatchObject({ displayName: 'Brightpath', look: code });

    // It is permanent: there is no way to edit or rename it (the old edit endpoint is gone).
    expect((await post('/auth/profile', { displayName: 'Other' }, { cookie })).status).toBe(404);
    // Asking for the same name again is a clash with its own character, not a rename.
    expect((await post('/auth/character', { displayName: 'brightpath', class: 'warrior', look: 0 }, { cookie })).status).toBe(409);
    const me = (await (await fetch(base + '/auth/me', { headers: { cookie } })).json()).account;
    expect(me).toMatchObject({ displayName: 'Brightpath', look: code, class: 'warrior' });
    expect(me.characters).toEqual([{ id: me.id, displayName: 'Brightpath', look: code, outfit: null, class: 'warrior' }]);
    expect(me.maxCharacters).toBe(3);
  });

  it('serves the lobby its character sheet, the wallet stash and a brief of each character', async () => {
    expect((await fetch(base + '/auth/sheet')).status).toBe(401);
    const { cookie } = await login();
    const made = await post('/auth/character', { displayName: 'Sheeted', class: 'mage', look: lookCode({ skin: 1, hair: 1, style: 1, eyes: 1, shirt: 1, pants: 1 }) }, { cookie });
    expect(made.status).toBe(200);
    const body = await (await fetch(base + '/auth/sheet', { headers: { cookie } })).json();
    // never played in the realm: no sheet, no brief; the stash is the wallet's, and empty
    expect(body.sheet).toBeNull();
    expect(body.briefs).toEqual([]);
    expect(body.stash.slots).toHaveLength(54);
    expect(body.stash.slots.every((s: unknown) => s === null)).toBe(true);
  });

  it('a wallet can have up to three characters, each with its own progress', async () => {
    const w = newWallet();
    const { cookie, res } = await login(w);
    const first = (await res.json()).account;
    const make = async (displayName: string, look: number) => post('/auth/character', { displayName, look, class: 'warrior' }, { cookie });
    const meOf = async () => (await (await fetch(base + '/auth/me', { headers: { cookie } })).json()).account;

    const a = (await (await make('Triple A', 11)).json()).account;
    expect(a.id).toBe(first.id); // the first one fills the wallet's empty account
    const b = (await (await make('Triple B', 22)).json()).account;
    expect(b.id).not.toBe(a.id); // the next ones are accounts of their own
    expect(b).toMatchObject({ displayName: 'Triple B', look: 22, wallet: w.address });
    expect((await meOf()).id).toBe(b.id); // and the session now plays the new one
    const c = (await (await make('Triple C', 33)).json()).account;
    expect(c.characters.map((x: { displayName: string }) => x.displayName)).toEqual(['Triple A', 'Triple B', 'Triple C']);

    // A fourth is refused, and so is a name that is taken.
    const fourth = await make('Triple D', 44);
    expect(fourth.status).toBe(409);
    expect((await fourth.json()).error).toMatch(/3 characters/);
    expect((await post('/auth/character', { displayName: 'triple a', class: 'warrior', look: 1 }, { cookie: (await login()).cookie })).status).toBe(409);

    // Each character has its own progress: a room save and a cloud world per account.
    for (const x of [a, b, c]) {
      repo.room.setJson(`player:${x.id}`, { version: 1, marker: x.displayName });
      repo.cloud.insertWorld({ accountId: x.id, worldId: '1', seed: 1, now: 1, leaseHolder: null, leaseUntil: 0 });
    }

    // Choosing one makes it the one in play; a stranger's character (or a made-up id) cannot be chosen.
    const pick = (id: unknown, ck = cookie) => post('/auth/character/select', { id }, { cookie: ck });
    const chosen = await pick(a.id);
    expect(chosen.status).toBe(200);
    expect((await chosen.json()).account).toMatchObject({ id: a.id, displayName: 'Triple A', look: 11 });
    expect((await meOf()).id).toBe(a.id);
    const stranger = await login();
    const strangerChar = (await (await post('/auth/character', { displayName: 'Outsider', class: 'warrior', look: 2 }, { cookie: stranger.cookie })).json()).account;
    expect((await pick(strangerChar.id)).status).toBe(404);
    expect((await pick('nope')).status).toBe(404);
    expect((await pick(undefined)).status).toBe(404);
    expect((await post('/auth/character/select', { id: a.id })).status).toBe(401);
    expect((await meOf()).id).toBe(a.id);
    // Signing in again lands on the one played last.
    expect((await (await login(w)).res.json()).account.id).toBe(a.id);

    // Deleting one wipes only that character; the session moves to another, and the freed slot allows a new one.
    await pick(b.id);
    const del = await post('/auth/character/delete', { confirm: 'Triple B' }, { cookie });
    expect(del.status).toBe(200);
    const after = (await del.json()).account;
    expect(after.id).not.toBe(b.id);
    expect(['Triple A', 'Triple C']).toContain(after.displayName);
    expect(after.characters.map((x: { displayName: string }) => x.displayName)).toEqual(['Triple A', 'Triple C']);
    expect(repo.getAccount(b.id)).toBeNull();
    expect(repo.room.getJson(`player:${b.id}`)).toBeNull();
    expect(repo.cloud.listWorlds(b.id)).toHaveLength(0);
    expect(repo.room.getJson(`player:${a.id}`)).not.toBeNull(); // the others keep theirs
    expect(repo.cloud.listWorlds(c.id)).toHaveLength(1);
    expect((await meOf()).id).toBe(after.id); // still signed in
    expect((await make('Triple D', 44)).status).toBe(200);

    // The very last one leaves the wallet with an empty account again.
    for (const name of ['Triple D', 'Triple A', 'Triple C']) {
      const r = await post('/auth/character/delete', { confirm: name }, { cookie });
      expect(r.status).toBe(200);
      const next = (await r.json()).account;
      if (name !== 'Triple C') await pick(next.characters[0].id);
    }
    const empty = await meOf();
    expect(empty.look).toBeNull();
    expect(empty.characters).toEqual([]);
    expect(empty.displayName).toMatch(/^Player[0-9a-f]{6}$/);
  });
  it('keeps names unique, whatever the case', async () => {
    const a = await login();
    const b = await login();
    expect((await post('/auth/character', { displayName: 'Unique Hero', class: 'warrior', look: 1 }, { cookie: a.cookie })).status).toBe(200);
    const clash = await post('/auth/character', { displayName: 'unique hero', class: 'warrior', look: 2 }, { cookie: b.cookie });
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toMatch(/taken/);
    // The failed attempt left no character behind.
    expect((await (await fetch(base + '/auth/me', { headers: { cookie: b.cookie } })).json()).account.look).toBeNull();
  });

  it('deletes the character with its progress, and then a new one can be made', async () => {
    const { cookie, res } = await login();
    const acc = (await res.json()).account;
    expect((await post('/auth/character/delete', { confirm: 'x' }, { cookie })).status).toBe(409); // nothing to delete yet
    await post('/auth/character', { displayName: 'Doomed Hero', class: 'warrior', look: 77 }, { cookie });
    // Progress that belongs to the account: the multiplayer player save and a cloud world.
    repo.room.setJson(`player:${acc.id}`, { version: 1, marker: 'progress' });
    repo.cloud.insertWorld({ accountId: acc.id, worldId: '1', seed: 1, now: 1, leaseHolder: null, leaseUntil: 0 });
    expect(repo.cloud.listWorlds(acc.id)).toHaveLength(1);

    // Needs the name typed, and the session.
    expect((await post('/auth/character/delete', {}, { cookie })).status).toBe(400);
    expect((await post('/auth/character/delete', { confirm: 'someone else' }, { cookie })).status).toBe(400);
    expect((await post('/auth/character/delete', { confirm: 'Doomed Hero' })).status).toBe(401);
    expect((await post('/auth/character/delete', { confirm: 'Doomed Hero' }, { cookie, origin: 'https://evil.example' })).status).toBe(403);
    expect(repo.room.getJson(`player:${acc.id}`)).not.toBeNull();

    const del = await post('/auth/character/delete', { confirm: 'doomed hero' }, { cookie });
    expect(del.status).toBe(200);
    const fresh = (await del.json()).account;
    expect(fresh.look).toBeNull();
    expect(fresh.displayName).toMatch(/^Player[0-9a-f]{6}$/);
    expect(fresh.id).toBe(acc.id);
    expect(repo.room.getJson(`player:${acc.id}`)).toBeNull();
    expect(repo.cloud.listWorlds(acc.id)).toHaveLength(0);

    // The name is free again, and a new character can be made.
    const other = await login();
    expect((await post('/auth/character', { displayName: 'Doomed Hero', class: 'warrior', look: 5 }, { cookie: other.cookie })).status).toBe(200);
    expect((await post('/auth/character', { displayName: 'Phoenix', class: 'warrior', look: 9 }, { cookie })).status).toBe(200);
  });

  it('refuses to delete a character that is in the game', async () => {
    const { cookie } = await login();
    await post('/auth/character', { displayName: 'Busy Hero', class: 'warrior', look: 3 }, { cookie });
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie, origin: ORIGIN } });
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'ignored' })));
      ws.on('message', (d) => JSON.parse(d.toString()).t === 'joined' && resolve());
      ws.on('error', reject);
    });
    const r = await post('/auth/character/delete', { confirm: 'Busy Hero' }, { cookie });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/Leave the game/);
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      ws.close();
    });
    await new Promise((r2) => setTimeout(r2, 100));
    expect((await post('/auth/character/delete', { confirm: 'Busy Hero' }, { cookie })).status).toBe(200);
  });
  it('refuses requests from unknown or missing origins (CSRF)', async () => {
    const w = newWallet();
    expect((await post('/auth/challenge', { address: w.address }, { origin: 'https://evil.example' })).status).toBe(403);
    const noOrigin = await fetch(base + '/auth/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: w.address }) });
    expect(noOrigin.status).toBe(403);
    expect((await post('/auth/logout', {}, { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('validates content type, JSON, size and fields', async () => {
    const w = newWallet();
    expect((await post('/auth/challenge', 'x', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post('/auth/challenge', '{not json')).status).toBe(400);
    expect((await post('/auth/challenge', { address: 5 })).status).toBe(400);
    expect((await post('/auth/challenge', { address: 'short' })).status).toBe(400);
    expect((await post('/auth/verify', { message: 1 })).status).toBe(400);
    expect((await post('/auth/verify', { message: 'garbage', signature: 'AAAA' })).status).toBe(400);
    const big = await post('/auth/challenge', { address: w.address, pad: 'x'.repeat(20_000) }).catch(() => null);
    if (big) expect(big.status).toBe(413);
    expect((await post('/auth/nothing', {})).status).toBe(404);
    expect((await fetch(base + '/auth/challenge')).status).toBe(405);
  });

  it('rejects a wrong signature and then the replay', async () => {
    const w = newWallet();
    const ch = await (await post('/auth/challenge', { address: w.address })).json();
    const forged = await post('/auth/verify', { message: ch.message, signature: newWallet().sign(ch.message) });
    expect(forged.status).toBe(401);
    expect(forged.headers.get('set-cookie')).toBeNull();
    const late = await post('/auth/verify', { message: ch.message, signature: w.sign(ch.message) });
    expect(late.status).toBe(401);
  });

  it('rate limits the sign-in endpoints per client', async () => {
    const limited = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 3 });
    const p = await limited.listen(0);
    try {
      const w = newWallet();
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await fetch(`http://127.0.0.1:${p}/auth/challenge`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ address: w.address }) });
        codes.push(r.status);
      }
      expect(codes).toEqual([200, 200, 200, 429, 429]);
    } finally {
      await limited.close();
    }
  });

  const welcome = (headers: Record<string, string>) =>
    new Promise<ServerMessage>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
      ws.on('message', (d) => {
        resolve(JSON.parse(d.toString()));
        ws.close();
      });
      ws.on('error', reject);
    });

  it('the WebSocket welcome names signed-in players only', async () => {
    const { cookie, res } = await login();
    const name = (await res.json()).account.displayName;
    expect(await welcome({ cookie, origin: ORIGIN })).toMatchObject({ t: 'welcome', user: name });
    expect(await welcome({ origin: ORIGIN })).toMatchObject({ user: null });
    // A cookie sent by a page on another origin does not count.
    expect(await welcome({ cookie, origin: 'https://evil.example' })).toMatchObject({ user: null });
    expect(await welcome({ cookie: `${SESSION_COOKIE}=forged` })).toMatchObject({ user: null });
  });
});
