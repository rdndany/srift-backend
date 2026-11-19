import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, I, NPCS, STASHKEEPER, STASH_SLOTS, makeGenerator, makeStack, mulberry32, parseNetClientMessage, toolId, type AdventureWorldGenerator, type Command, type NetServerMessage, type StashView } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string | null, wallet: string | null): void {
    const id = this.room.join(this.conn, name, account, null, 'mage', wallet);
    if (id === null) throw new Error('join refused');
    this.id = id;
  }
  events() {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events : []));
  }
  view(): StashView | null {
    const e = this.events().filter((x) => x.t === 'stash').pop();
    return e && e.t === 'stash' ? e.view : null;
  }
  toasts(): string[] {
    return this.events().flatMap((e) => (e.t === 'toast' ? [e.text] : []));
  }
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};

/** Stand at the Stashkeeper's counter and speak to him. */
function visit(room: GameRoom, c: Client): void {
  const p = room.player(c.id)!;
  const n = NPCS.find((x) => x.id === STASHKEEPER)!;
  p.teleport(n.x, generator.hubY + 1, n.z - 2, 0, 0);
  ticks(room, 6);
  const mob = room.realm.mobs.mobs.find((m) => m.kind === 'npc' && NPCS[m.variant].id === STASHKEEPER)!;
  expect(p.talkNpc(mob)).toBe(true);
  ticks(room, 1);
}

function send(room: GameRoom, c: Client, cmd: Command): void {
  const msg = parseNetClientMessage({ t: 'cmd', c: cmd });
  expect(msg, JSON.stringify(cmd)).not.toBeNull();
  room.receive(c.id, msg!);
  ticks(room, 2);
}

const open = (store: MemoryRoomStore) => new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(3), store });
const WALLET = 'wallet-one';

describe('the Stash on a server', () => {
  it('has a Stashkeeper in the village, standing on open ground', () => {
    const n = NPCS.find((x) => x.id === STASHKEEPER)!;
    expect(n).toBeTruthy();
    expect(Math.abs(n.x - 19.5) + Math.abs(n.z - 12.5)).toBeLessThan(0.01);
  });

  it('keeps what one character puts in for the other characters of the wallet, and writes it down at once', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    const mage = new Client(room);
    mage.join('mage', 'char-mage', WALLET);
    const pm = room.player(mage.id)!;
    pm.clearInventory();
    pm.giveItem(I.DIAMOND, 5);
    visit(room, mage);
    expect(mage.view()?.slots).toHaveLength(STASH_SLOTS);

    send(room, mage, { t: 'stash', a: 'put', slot: 0, count: 3 });
    expect(pm.inventory.countOf(I.DIAMOND)).toBe(2);
    expect(mage.view()!.slots[0]).toMatchObject({ id: I.DIAMOND, count: 3 });
    // the player and the stash were written together
    expect((store.getJson(`stash:${WALLET}`) as unknown[])[0]).toEqual([I.DIAMOND, 3, 0]);
    expect(store.getJson('player:char-mage')).toBeTruthy();

    // the mage leaves; the warrior of the same wallet comes in and takes them
    room.leave(mage.id);
    const warrior = new Client(room);
    warrior.join('warrior', 'char-warrior', WALLET);
    const pw = room.player(warrior.id)!;
    pw.clearInventory();
    visit(room, warrior);
    expect(warrior.view()!.slots[0]).toMatchObject({ id: I.DIAMOND, count: 3 });
    send(room, warrior, { t: 'stash', a: 'take', slot: 0, count: 64 });
    expect(pw.inventory.countOf(I.DIAMOND)).toBe(3);
    expect(warrior.view()!.slots[0]).toBeNull();
    expect((store.getJson(`stash:${WALLET}`) as unknown[])[0]).toBeNull();
  });

  it('survives a restart of the server, and is never shown to another wallet', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    const a = new Client(room);
    a.join('ann', 'char-ann', WALLET);
    room.player(a.id)!.clearInventory();
    room.player(a.id)!.giveItem(I.IRON_INGOT, 7);
    visit(room, a);
    send(room, a, { t: 'stash', a: 'put', slot: 0, count: 7 });
    room.leave(a.id);

    const again = open(store);
    // the lobby reads it with nobody in the game (from the store), and another wallet's reads nothing of it
    expect(again.stashOf(WALLET).slots[0]).toMatchObject({ id: I.IRON_INGOT, count: 7 });
    expect(again.stashOf(WALLET).slots).toHaveLength(STASH_SLOTS);
    expect(again.stashOf('wallet-two').slots.every((s) => s === null)).toBe(true);
    const a2 = new Client(again);
    a2.join('ann', 'char-ann-2', WALLET);
    visit(again, a2);
    expect(a2.view()!.slots[0]).toMatchObject({ id: I.IRON_INGOT, count: 7 });
    // and with the stash open in the game, the lobby sees what the game sees
    send(again, a2, { t: 'stash', a: 'take', slot: 0, count: 2 });
    expect(again.stashOf(WALLET).slots[0]).toMatchObject({ id: I.IRON_INGOT, count: 5 });

    const other = new Client(again);
    other.join('eve', 'char-eve', 'wallet-two');
    visit(again, other);
    expect(other.view()!.slots.every((s) => s === null)).toBe(true);
    send(again, other, { t: 'stash', a: 'take', slot: 0, count: 64 });
    expect(again.player(other.id)!.inventory.countOf(I.IRON_INGOT)).toBe(0);
  });

  it('is for signed-in wallets only, and only at the Stashkeeper', () => {
    const room = open(new MemoryRoomStore());
    const guest = new Client(room);
    guest.join('guest', null, null);
    const pg = room.player(guest.id)!;
    pg.clearInventory();
    pg.giveItem(I.DIAMOND, 2);
    visit(room, guest);
    send(room, guest, { t: 'stash', a: 'put', slot: 0, count: 2 });
    expect(pg.inventory.countOf(I.DIAMOND)).toBe(2);
    expect(guest.toasts().some((t) => t.includes('wallet'))).toBe(true);

    const c = new Client(room);
    c.join('far', 'char-far', WALLET);
    const pc = room.player(c.id)!;
    pc.clearInventory();
    pc.giveItem(I.DIAMOND, 2);
    // not talking to him: nothing happens
    send(room, c, { t: 'stash', a: 'put', slot: 0, count: 2 });
    expect(pc.inventory.countOf(I.DIAMOND)).toBe(2);
  });

  it('never moves more than fits: a full stash and full bags leave the item where it was', () => {
    const room = open(new MemoryRoomStore());
    const c = new Client(room);
    c.join('ann', 'char-ann', WALLET);
    const p = room.player(c.id)!;
    p.clearInventory();
    // fill the stash with different single items, then try one more
    for (let i = 0; i < STASH_SLOTS; i++) room.realm.stashes.of(WALLET).set(i, makeStack(toolId('sword', 'diamond'), 1, i + 1));
    p.giveItem(I.DIAMOND, 1);
    visit(room, c);
    send(room, c, { t: 'stash', a: 'put', slot: 0, count: 1 });
    expect(p.inventory.countOf(I.DIAMOND)).toBe(1);
    expect(c.toasts().some((t) => t.includes('full'))).toBe(true);
    // fill the bags, then try to take
    for (let i = 0; i < p.inventory.size; i++) if (p.inventory.isUsable(i)) p.inventory.set(i, makeStack(toolId('pickaxe', 'diamond'), 1, i + 1));
    send(room, c, { t: 'stash', a: 'take', slot: 0, count: 1 });
    expect(room.realm.stashes.peek(WALLET, 0)).not.toBeNull();
    expect(c.toasts().some((t) => t.includes('bags'))).toBe(true);
  });
});