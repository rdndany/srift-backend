import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base58Encode, lookCode } from '@solrift/shared';
import { SqliteRepo } from './db';
import { levelBoard } from './leaderboard';
import { createGameServer, type GameServer } from './server';

const ORIGIN = 'http://localhost:3000';
const LOOK = lookCode({ skin: 1, hair: 1, style: 1, eyes: 1, shirt: 1, pants: 1 });

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = (publicKey as KeyObject).export({ format: 'der', type: 'spki' }).subarray(-32);
  return {
    address: base58Encode(new Uint8Array(raw)),
    sign: (m: string) => sign(null, Buffer.from(m, 'utf8'), privateKey).toString('base64'),
  };
}

describe('leaderboard ranks', () => {
  it('ranks realm characters by class level and keeps the best island day', () => {
    const repo = new SqliteRepo(':memory:');
    const ada = repo.createCharacter(repo.upsertAccount('w1', 1).id, { displayName: 'Ada', look: 1, class: 'mage' }, 2)!;
    const borin = repo.createCharacter(repo.upsertAccount('w2', 1).id, { displayName: 'Borin', look: 2, class: 'warrior' }, 3)!;
    const save = (id: string, lvl: number) => repo.room.setJson(`player:${id}`, { v: 1, x: 0, y: 64, z: 0, cls: { id: id === ada.id ? 'mage' : 'warrior', lvl } });
    save(ada.id, 12);
    save(borin.id, 4);

    const levels = levelBoard(repo.room, (id) => repo.getAccount(id));
    expect(levels.map((r) => [r.rank, r.name, r.level, r.class])).toEqual([
      [1, 'Ada', 12, 'Mage'],
      [2, 'Borin', 4, 'Warrior'],
    ]);

    expect(repo.noteIsleDays(ada.id, 3, 10)).toBe(3);
    expect(repo.noteIsleDays(ada.id, 2, 11)).toBe(3);
    expect(repo.noteIsleDays(borin.id, 9, 12)).toBe(9);
    expect(repo.noteIsleDays(ada.id, 9, 20)).toBe(9);
    expect(repo.isleBoard(50).map((r) => r.name)).toEqual(['Borin', 'Ada']);
    expect(repo.noteIsleDays(ada.id, 99_999, 21)).toBe(9);
    repo.close();
  });
});

describe('leaderboard over HTTP', () => {
  let server: GameServer;
  let base: string;

  beforeAll(async () => {
    server = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000 });
    const port = await server.listen(0);
    base = `http://127.0.0.1:${port}`;
  });
  afterAll(() => server.close());

  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  async function signIn(name: string, cls: 'mage' | 'warrior') {
    const w = wallet();
    const ch = await (await post('/auth/challenge', { address: w.address })).json();
    const res = await post('/auth/verify', { message: ch.message, signature: w.sign(ch.message) });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    const made = await post('/auth/character', { displayName: name, class: cls, look: LOOK }, { cookie });
    expect(made.status).toBe(200);
    return cookie;
  }

  it('is public to read, and a signed-in character can only raise their island day', async () => {
    const empty = await (await fetch(base + '/leaderboard')).json();
    expect(empty.isle).toEqual([]);
    expect(empty.levels).toEqual([]);
    expect(empty.you).toBeNull();

    const refused = await post('/leaderboard/isle', { days: 4 });
    expect(refused.status).toBe(401);

    const ada = await signIn('Ada', 'mage');
    const raised = await (await post('/leaderboard/isle', { days: 4 }, { cookie: ada })).json();
    expect(raised).toEqual({ ok: true, days: 4 });
    const held = await (await post('/leaderboard/isle', { days: 2 }, { cookie: ada })).json();
    expect(held.days).toBe(4);

    const borin = await signIn('Borin', 'warrior');
    await post('/leaderboard/isle', { days: 11 }, { cookie: borin });

    const board = await (await fetch(base + '/leaderboard', { headers: { cookie: ada } })).json();
    expect(board.you).toBe('Ada');
    expect(board.isle.map((r: { rank: number; name: string; days: number }) => [r.rank, r.name, r.days])).toEqual([
      [1, 'Borin', 11],
      [2, 'Ada', 4],
    ]);
  });
});
