import { describe, expect, it } from 'vitest';
import { B, CHUNK_BYTES, I, mulberry32, type Command, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore, SqliteRoomStore, type RoomStore } from './roomStore';
import { DatabaseSync } from 'node:sqlite';

/** Crash and duplication tests: items must never be created or destroyed by networking, menus or saves. */

const FLOOR = 100;
const WATCHED = [I.DIAMOND, B.DIRT];

const conn = () => {
  const msgs: NetServerMessage[] = [];
  return { msgs, conn: { send: (m: NetServerMessage) => msgs.push(m), close: () => undefined } };
};

function flatRoom(opts: Partial<ConstructorParameters<typeof GameRoom>[0]> = {}): GameRoom {
  const room = new GameRoom({ seed: 1337, naturalSpawning: false, rand: mulberry32(9), ...opts });
  for (let x = -24; x <= 24; x++)
    for (let z = -24; z <= 24; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) room.world.setBlock(x, y, z, B.AIR);
      room.world.setBlock(x, FLOOR, z, B.STONE);
    }
  return room;
}

function addPlayer(room: GameRoom, name: string, x: number, account: string | null = null) {
  const c = conn();
  const id = room.join(c.conn, name, account);
  if (id === null) throw new Error('refused');
  const p = room.player(id)!;
  p.teleport(x + 0.5, FLOOR + 1, 0.5, 0, 0);
  return { id, p, ...c };
}

/** Every watched item in inventories, the shared chest, and lying in the world. */
function census(room: GameRoom): Record<number, number> {
  const total: Record<number, number> = {};
  for (const id of WATCHED) total[id] = 0;
  const add = (s: { id: number; count: number } | null) => {
    if (s && s.id in total) total[s.id] += s.count;
  };
  for (const m of room.members.values()) {
    const menu = m.player.menu;
    add(menu?.cursor ?? null);
    for (let i = 0; i < m.player.inventory.size; i++) add(m.player.inventory.get(i));
    // Crafting grids and the like hold items while a menu is open; count every non-player slot once (the shared chest is counted below).
    if (menu && menu.kind !== 'chest') for (let i = 36; i < menu.slots.length; i++) if (menu.slots[i].container !== m.player.inventory) add(menu.stackAt(i));
  }
  const chest = room.members.size ? [...room.members.values()][0].player.blockEntities.chest(0, 0, 0) : null;
  if (chest) for (let i = 0; i < 27; i++) add(chest.get(i));
  for (const d of room.realm.drops.drops) add(d.stack);
  return total;
}

describe('item conservation', () => {
  it('survives thousands of random menu, drop and pickup operations by two players', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rand = mulberry32(seed * 7919);
      const room = flatRoom();
      const a = addPlayer(room, 'alice', 0);
      const b = addPlayer(room, 'bob', 1);
      for (const x of [a, b]) {
        x.p.giveItem(I.DIAMOND, 20);
        x.p.giveItem(B.DIRT, 64);
      }
      const before = census(room);
      expect(before[I.DIAMOND]).toBe(40);
      expect(before[B.DIRT]).toBe(128);

      const players = [a, b];
      const pick = (n: number) => Math.floor(rand() * n);
      for (let step = 0; step < 1500; step++) {
        for (const pl of players) {
          let c: Command;
          switch (pick(9)) {
            case 0:
              c = { t: 'click', slot: pick(60), button: pick(2) as 0 | 1 };
              break;
            case 1:
              c = { t: 'shift', slot: pick(60) };
              break;
            case 2:
              c = { t: 'drop', all: rand() < 0.5 };
              break;
            case 3:
              c = { t: 'select', slot: pick(9) };
              break;
            case 4:
              c = { t: 'inventory' };
              break;
            case 5:
              c = { t: 'closeMenu' };
              break;
            case 6:
              c = { t: 'scroll', delta: rand() < 0.5 ? -1 : 1 };
              break;
            case 7:
              c = { t: 'click', slot: pick(46), button: 0 };
              break;
            default:
              c = { t: 'click', slot: pick(46), button: 1 };
          }
          room.receive(pl.id, { t: 'cmd', c });
          // Sometimes open the shared chest the way a right click on it does.
          if (rand() < 0.01 && !pl.p.menu) pl.p.openScreen('chest');
        }
        room.tick(); // one tick per step: a command rate a real player could reach
        // The invariant holds at every moment, not only at the end.
        if (step % 100 === 0) expect(census(room)).toEqual(before);
      }
      for (let i = 0; i < 200; i++) room.tick(); // let drops settle and get picked up
      expect(census(room)).toEqual(before);
      expect(room.members.size).toBe(2); // nobody was kicked on the way
    }
  }, 120_000); // six seeds of 1500 steps: about 25 s alone, so the default 30 s is too tight on a busy machine

  it('recipe-book fills mixed with menu clicks never kick anyone or leave items in the grid', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const rand = mulberry32(seed * 104729);
      const room = flatRoom();
      const a = addPlayer(room, 'alice', 0);
      a.p.giveItem(B.PLANKS, 40);
      a.p.giveItem(I.STICK, 20);
      a.p.giveItem(B.COBBLE, 30);
      a.p.giveItem(B.LOG, 10);
      const pick = (n: number) => Math.floor(rand() * n);
      for (let step = 0; step < 1000; step++) {
        let c: Command;
        switch (pick(6)) {
          case 0:
            c = { t: 'recipe', index: pick(80), all: rand() < 0.5 };
            break;
          case 1:
            c = { t: 'shift', slot: pick(46) };
            break;
          case 2:
            c = { t: 'click', slot: pick(46), button: pick(2) as 0 | 1 };
            break;
          case 3:
            c = { t: 'inventory' };
            break;
          case 4:
            c = { t: 'recipe', index: pick(1 << 20) - 5, all: true }; // hostile indexes
            break;
          default:
            c = { t: 'closeMenu' };
        }
        room.receive(a.id, { t: 'cmd', c });
        room.tick();
      }
      room.receive(a.id, { t: 'cmd', c: { t: 'closeMenu' } });
      room.tick();
      expect(room.members.size).toBe(1);
      expect(a.p.menu).toBeFalsy();
    }
  });

  it('gives back cursor items when a player disconnects mid-menu', () => {
    const room = flatRoom();
    const a = addPlayer(room, 'alice', 0, null);
    a.p.giveItem(I.DIAMOND, 10);
    const other = addPlayer(room, 'witness', 5);
    room.receive(a.id, { t: 'cmd', c: { t: 'inventory' } });
    room.tick();
    // Pick the whole diamond stack up onto the cursor, then vanish.
    const slot = a.p.menu!.slots.findIndex((_, i) => a.p.menu!.stackAt(i)?.id === I.DIAMOND);
    room.receive(a.id, { t: 'cmd', c: { t: 'click', slot, button: 0 } });
    room.tick();
    expect(a.p.menu!.cursor?.count).toBe(10);
    expect(other.p.inventory.countOf(I.DIAMOND)).toBe(0);
    const store = new MemoryRoomStore();
    // Same thing, with persistence on, for a signed-in account.
    const room2 = flatRoom({ store });
    const s = addPlayer(room2, 'signed', 0, 'acct-9');
    s.p.giveItem(I.DIAMOND, 10);
    room2.receive(s.id, { t: 'cmd', c: { t: 'inventory' } });
    room2.tick();
    const slot2 = s.p.menu!.slots.findIndex((_, i) => s.p.menu!.stackAt(i)?.id === I.DIAMOND);
    room2.receive(s.id, { t: 'cmd', c: { t: 'click', slot: slot2, button: 0 } });
    room2.tick();
    room2.leave(s.id);
    const back = addPlayer(flatRoom({ store }), 'signed', 0, 'acct-9');
    expect(back.p.inventory.countOf(I.DIAMOND)).toBe(10);
  });
});

describe('crashes and failing storage', () => {
  it('a restart never has more items than before it', () => {
    const store = new MemoryRoomStore();
    const one = flatRoom({ store });
    const p = addPlayer(one, 'ann', 0, 'acct-1');
    p.p.giveItem(I.DIAMOND, 10);
    one.save(); // the last good save: 10 in the inventory
    one.receive(p.id, { t: 'cmd', c: { t: 'drop', all: true } });
    one.tick();
    expect(census(one)[I.DIAMOND]).toBe(10); // still 10: some on the ground, some in the hand
    // The server dies here, without saving. Dropped items on the ground were never stored.
    const two = flatRoom({ store });
    const again = addPlayer(two, 'ann', 0, 'acct-1');
    expect(again.p.inventory.countOf(I.DIAMOND)).toBeLessThanOrEqual(10);
    expect(census(two)[I.DIAMOND]).toBeLessThanOrEqual(10);
  });

  it('saving after a drop keeps only what the player holds (no copy stays on disk)', () => {
    const store = new MemoryRoomStore();
    const one = flatRoom({ store });
    const p = addPlayer(one, 'ann', 0, 'acct-1');
    p.p.giveItem(I.DIAMOND, 10);
    let slot = 0;
    for (let i = 0; i < 9; i++) if (p.p.inventory.get(i)?.id === I.DIAMOND) slot = i;
    p.p.apply({ t: 'select', slot });
    one.receive(p.id, { t: 'cmd', c: { t: 'drop', all: true } });
    one.tick();
    expect(p.p.inventory.countOf(I.DIAMOND)).toBe(0);
    one.stop(); // saves
    const two = flatRoom({ store });
    const again = addPlayer(two, 'ann', 0, 'acct-1');
    expect(again.p.inventory.countOf(I.DIAMOND)).toBe(0);
  });

  it('forgets the saved edits of a world whose generator changed, and keeps them otherwise', () => {
    const store = new MemoryRoomStore();
    const one = flatRoom({ store });
    one.world.setBlock(40, FLOOR + 5, 40, B.PLANKS);
    one.stop(); // saves
    expect(flatRoom({ store }).world.getBlock(40, FLOOR + 5, 40)).toBe(B.PLANKS);
    store.setJson('terrain:1337', 1); // saved on an older land
    expect(flatRoom({ store }).world.getBlock(40, FLOOR + 5, 40)).not.toBe(B.PLANKS);
  });

  it('a failing chunk write does not stop players from being saved, and is retried', () => {
    const inner = new MemoryRoomStore();
    let failChunks = true;
    const store: RoomStore = {
      loadChunks: (s) => inner.loadChunks(s),
      saveChunks: (s, c) => {
        if (failChunks) throw new Error('disk full');
        inner.saveChunks(s, c);
      },
      clearChunks: (s) => inner.clearChunks(s),
      getJson: (k) => inner.getJson(k),
      setJson: (k, v) => inner.setJson(k, v),
      deleteJson: (k) => inner.deleteJson(k),
    };
    const quiet = console.error;
    console.error = () => undefined;
    try {
      const room = flatRoom({ store });
      const p = addPlayer(room, 'ann', 0, 'acct-1');
      p.p.giveItem(I.DIAMOND, 3);
      room.world.setBlock(2, FLOOR + 5, 2, B.PLANKS);
      room.save();
      expect(inner.getJson('player:acct-1')).not.toBeNull();
      expect(inner.loadChunks(1337)).toHaveLength(0);
      failChunks = false;
      room.save(); // the chunk is still marked dirty, so it goes out now
      const edited = inner.loadChunks(1337);
      expect(edited.length).toBeGreaterThan(0);
    } finally {
      console.error = quiet;
    }
  });

  it('SQLite chunk writes are all-or-nothing', () => {
    const db = new DatabaseSync(':memory:');
    const store = new SqliteRoomStore(db);
    const good = new Uint16Array(CHUNK_BYTES).fill(1);
    store.saveChunks(7, [{ cx: 0, cz: 0, data: good }]);
    const bad = new Uint16Array(10); // wrong size: encoding throws midway through the batch
    expect(() =>
      store.saveChunks(7, [
        { cx: 1, cz: 0, data: good },
        { cx: 2, cz: 0, data: bad },
      ]),
    ).toThrow();
    const rows = store.loadChunks(7);
    expect(rows.map((r) => `${r.cx},${r.cz}`)).toEqual(['0,0']);
    // And the store is still usable afterwards.
    store.saveChunks(7, [{ cx: 3, cz: 3, data: good }]);
    expect(store.loadChunks(7)).toHaveLength(2);
  });

  it('an unreadable stored player starts fresh instead of crashing the join', () => {
    const store = new MemoryRoomStore();
    store.setJson('player:acct-1', { v: 1, inv: 'garbage', pos: [1, 2] });
    const room = flatRoom({ store });
    const p = addPlayer(room, 'ann', 0, 'acct-1');
    expect(p.p.inventory.countOf(I.DIAMOND)).toBe(0);
    expect(room.members.size).toBe(1);
  });

  it('a signed-in account cannot be in two places at once, even across a reconnect race', () => {
    const store = new MemoryRoomStore();
    const room = flatRoom({ store });
    const first = addPlayer(room, 'ann', 0, 'acct-1');
    first.p.giveItem(I.DIAMOND, 5);
    // Signing in again before the first connection is known to be gone (a reload, a second tab) takes the account over: the first is saved and
    // put out before the second is loaded, so the items are carried once, and the first connection is told.
    const second = conn();
    const secondId = room.join(second.conn, 'ann', 'acct-1');
    expect(secondId).not.toBeNull();
    expect(second.msgs.some((m) => m.t === 'kicked')).toBe(false);
    expect(room.members.size).toBe(1);
    expect(room.members.has(first.id)).toBe(false);
    expect(room.members.get(secondId!)!.player.inventory.countOf(I.DIAMOND)).toBe(5);
    // The old connection closing later (its socket finally noticed) changes nothing.
    room.leave(first.id);
    expect(room.members.size).toBe(1);
  });
});
