import { describe, expect, it } from 'vitest';
import { B, I, mulberry32, parseNetClientMessage, type LandEvent, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

const OWNER_WALLET = 'OwnerWallet1111111111111111111111111111111';

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string, wallet: string | null = `wallet-${account}`): this {
    const id = this.room.join(this.conn, name, account, null, 'warrior', wallet);
    if (id === null) throw new Error('join refused');
    this.id = id;
    return this;
  }
  get p() {
    return this.room.player(this.id)!;
  }
  say(text: string): void {
    for (let i = 0; i < 40; i++) this.room.tick();
    const msg = parseNetClientMessage({ t: 'chat', text });
    if (!msg) throw new Error('bad chat');
    this.room.receive(this.id, msg);
  }
  last(): string {
    const n = this.messages.filter((m): m is Extract<NetServerMessage, { t: 'notice' }> => m.t === 'notice');
    return n.at(-1)?.text ?? '';
  }
  result(what: string) {
    const l = this.messages.flatMap((m) => (m.t === 'events' ? m.events.flatMap((e) => (e.t === 'land' ? [e.e as LandEvent] : [])) : []));
    const r = l.filter((e) => e.k === 'result' && e.what === what).pop();
    return r && r.k === 'result' ? r.result : null;
  }
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};
const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
function stand(room: GameRoom, c: Client, x: number, z: number): void {
  const y = room.world.surfaceY(x, z);
  c.p.teleport(x + 0.5, y + 1, z + 0.5, 0, 0);
  ticks(room, 2);
}
function buy(room: GameRoom, c: Client, v: [number, number][], idem: string): void {
  room.receive(c.id, parseNetClientMessage({ t: 'cmd', c: { t: 'land', a: 'buy', v, name: 'Home', idem } })!);
  ticks(room, 3);
}

function setup() {
  const room = new GameRoom({ seed: 7, kind: 'overworld', naturalSpawning: false, rand: mulberry32(3), store: new MemoryRoomStore(), admins: { wallets: [OWNER_WALLET] } });
  const admin = new Client(room).join('boss', 'acct-boss', OWNER_WALLET);
  const anna = new Client(room).join('anna', 'char-anna');
  anna.p.clearInventory();
  anna.p.giveItem(I.LAND_SURVEYOR, 1);
  anna.p.coins = 10_000;
  return { room, admin, anna };
}

describe('/land for administrators', () => {
  it('does not exist for a player, or for an administrator whose mode is off', () => {
    const { room, admin, anna } = setup();
    anna.say('/land list');
    expect(anna.last()).toBe('Unknown command: /land');
    admin.say('/land list');
    expect(admin.last()).toBe('Admin mode is off. Type /admin on.');
    expect(room.land.adminLog(10)).toHaveLength(0);
  });

  it('lists, inspects and audits claims and their purchases', () => {
    const { room, admin, anna } = setup();
    stand(room, anna, 500, 500);
    buy(room, anna, rect(500, 500, 509, 509), 'idem-admin-0001');
    expect(anna.result('buy')?.ok).toBe(true);
    admin.say('/admin on');
    admin.say('/land list anna');
    expect(admin.last()).toContain('1 claims');
    expect(admin.last()).toContain('anna');
    admin.say('/land list nobody');
    expect(admin.last()).toContain('0 claims');
    admin.say('/land audit');
    expect(admin.last()).toContain('purchase 500 Auren committed');
    admin.say('/land invalid');
    expect(admin.last()).toBe('Every claim fits the rules.');
    admin.say('/land stats');
    expect(admin.last()).toContain('Claims 1');
  });

  it('revokes a claim with a refund, and writes it in the log', () => {
    const { room, admin, anna } = setup();
    stand(room, anna, 500, 500);
    buy(room, anna, rect(500, 500, 509, 509), 'idem-admin-0002');
    expect(anna.p.coins).toBe(9500);
    const id = room.land.allClaims()[0].id;
    admin.say('/admin on');
    admin.say(`/land revoke ${id} refund`);
    expect(room.land.allClaims()).toHaveLength(0);
    expect(room.land.adminLog(10).some((r) => r.action.includes('revoke'))).toBe(true);
    admin.say('/land revoke nonexistent');
    expect(admin.last().length).toBeGreaterThan(0);
  });

  it('keeps a region free of claims until it is released', () => {
    const { room, admin, anna } = setup();
    admin.say('/admin on');
    stand(room, admin, 800, 800);
    admin.say('/land reserve Market 10');
    expect(admin.last()).toContain('Reserved Market');
    stand(room, anna, 800, 800);
    buy(room, anna, rect(795, 795, 804, 804), 'idem-admin-0003');
    expect(anna.result('buy')?.ok).toBe(false);
    expect(anna.p.coins).toBe(10_000);
    const id = room.land.reserved()[0].id;
    admin.say('/land reserved');
    expect(admin.last()).toContain(id);
    admin.say(`/land unreserve ${id}`);
    buy(room, anna, rect(795, 795, 804, 804), 'idem-admin-0004');
    expect(anna.result('buy')?.ok).toBe(true);
  });

  it('finds the old builds, keeps them free, and gives each to the one who built it', () => {
    const { room, admin, anna } = setup();
    const bob = new Client(room).join('bob', 'char-bob');
    bob.p.clearInventory();
    bob.p.giveItem(I.LAND_SURVEYOR, 1);
    bob.p.coins = 10_000;
    // A house put into the world before there was land: nobody told the land.
    const y = room.world.surfaceY(600, 600) + 1;
    for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 7; dz++) room.world.setBlock(600 + dx, y, 600 + dz, B.PLANKS);
    for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 7; dz++) if (dx === 0 || dz === 0 || dx === 6 || dz === 6) room.world.setBlock(600 + dx, y + 1, 600 + dz, B.PLANKS);
    anna.say('/land legacy scan');
    expect(anna.last()).toBe('Unknown command: /land');
    admin.say('/admin on');
    admin.say('/land legacy scan');
    expect(admin.last()).toContain('1 old builds');
    // (a few blocks the world itself changed, a tree falling apart say, may widen the box a little)
    const box = room.land.legacySites()[0].box;
    expect(box.x0).toBeLessThanOrEqual(600);
    expect(box.z0).toBeLessThanOrEqual(600);
    expect(box.x1).toBeGreaterThanOrEqual(606);
    expect(box.z1).toBeGreaterThanOrEqual(606);
    expect(room.land.legacySites()[0].blocks).toBeGreaterThanOrEqual(73);
    admin.say('/land legacy reserve');
    expect(admin.last()).toContain('1 old builds are now kept free');
    // Bob cannot take the ground under it.
    stand(room, bob, 600, 595);
    buy(room, bob, rect(595, 595, 614, 614), 'idem-legacy-0101');
    expect(bob.result('buy')?.ok).toBe(false);
    expect(bob.p.coins).toBe(10_000);
    // It goes to anna.
    admin.say('/land legacy adopt nobody #1');
    expect(admin.last()).toContain('No signed-in player called "nobody"');
    admin.say('/land legacy adopt anna #7');
    expect(admin.last()).toContain('Usage');
    admin.say('/land legacy adopt anna #1 Anna\u2019s old house');
    expect(admin.last()).toContain('Gave');
    const c = room.land.index.claimAt(603, 603)!;
    expect(c.ownerId).toBe('char-anna');
    expect(c.paid).toBe(0);
    expect(room.world.getBlock(603, y, 603)).toBe(B.PLANKS);
    expect(anna.p.coins).toBe(10_000);
    expect(anna.last()).toContain('given you the land');
    // The log and the copy of the claims say what was done.
    expect(room.land.adminLog(10).some((r) => r.action === 'adopt')).toBe(true);
    admin.say('/land backups');
    expect(admin.last()).toContain('before adopting for anna');
    admin.say('/land legacy scan');
    expect(admin.last()).toBe('No old builds without an owner.');
  });

  it('pauses and resumes wilderness restoration', () => {
    const { room, admin } = setup();
    admin.say('/admin on');
    admin.say('/land pause');
    expect(room.land.stats().paused).toBe(true);
    admin.say('/land resume');
    expect(room.land.stats().paused).toBe(false);
  });
});
