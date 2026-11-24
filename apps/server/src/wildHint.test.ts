import { describe, expect, it } from 'vitest';
import { B, mulberry32, parseNetClientMessage, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

const HINT = 'Unclaimed wilderness: changes made here may regenerate.';

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string): this {
    const id = this.room.join(this.conn, name, account, null, 'warrior', `wallet-${account}`);
    if (id === null) throw new Error('join refused');
    this.id = id;
    return this;
  }
  get p() {
    return this.room.player(this.id)!;
  }
  toasts(text: string): number {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events.filter((e) => e.t === 'toast' && e.text === text) : [])).length;
  }
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};

function setup() {
  const room = new GameRoom({ seed: 7, kind: 'overworld', naturalSpawning: false, rand: mulberry32(3), store: new MemoryRoomStore() });
  const c = new Client(room).join('anna', 'char-anna');
  c.p.clearInventory();
  c.p.giveItem(B.PLANKS, 60);
  c.p.selected = 0;
  c.p.coins = 10_000;
  return { room, c };
}
function stand(room: GameRoom, c: Client, x: number, z: number): number {
  const y = room.world.surfaceY(x, z);
  c.p.teleport(x + 0.5, y + 1, z + 0.5, 0, 0);
  ticks(room, 2);
  return y;
}
const put = (c: Client, x: number, y: number, z: number): boolean => c.p.useHeldOn({ x, y, z, id: B.GRASS, nx: 0, ny: 1, nz: 0 });

describe('the wilderness hint', () => {
  it('is said once when building in the open, not on every block, and again only after a long while', () => {
    const { room, c } = setup();
    const y = stand(room, c, 500, 500);
    expect(c.toasts(HINT)).toBe(0);
    for (let i = 0; i < 5; i++) {
      expect(put(c, 500 + i, y, 503)).toBe(true);
      ticks(room, 2);
    }
    expect(c.toasts(HINT)).toBe(1);
    // Ten minutes later it is said again, and no more than three times in all.
    for (let k = 0; k < 4; k++) {
      c.p.updateInteraction(605, { left: false, right: false } as never);
      put(c, 500 + k, y, 505);
      ticks(room, 2);
    }
    expect(c.toasts(HINT)).toBe(3);
  });

  it('is not said on your own land, nor for breaking a block', () => {
    const { room, c } = setup();
    c.p.giveItem(620, 1);
    const y = stand(room, c, 700, 700);
    const v: [number, number][] = [[700, 700], [709, 700], [709, 709], [700, 709]];
    room.receive(c.id, parseNetClientMessage({ t: 'cmd', c: { t: 'land', a: 'buy', v, name: 'Home', idem: 'idem-hint-0001' } })!);
    ticks(room, 3);
    expect(room.land.index.size).toBe(1);
    expect(put(c, 702, y, 702)).toBe(true);
    ticks(room, 2);
    expect(c.toasts(HINT)).toBe(0);
    // Out in the open, taking a block away says nothing.
    const yo = stand(room, c, 800, 800);
    c.p.breakBlock(800, yo, 800);
    ticks(room, 2);
    expect(c.toasts(HINT)).toBe(0);
  });
});
