import { HeadlessWorld } from './headlessWorld';
import { landConfigWith, type LandConfigOverride } from './landConfig';
import { LandService, type Econ, type LandOptions, type LandStore } from './landService';
import { MemoryLandStore } from './landMemoryStore';
import { makeGenerator } from './squareWorld';
import type { WorldKind } from './squareWorld';

/**
 * What the land tests (and the server's) stand on: a headless world, a land service on it with a store in memory, a clock the test moves,
 * and players that are just points. Not part of the game.
 */
export interface Kit {
  world: HeadlessWorld;
  land: LandService;
  store: MemoryLandStore;
  clock: { now: number };
  players: { x: number; y: number; z: number }[];
  /** A buyer with this many Auren; `saved` is what its save said when it was last written with a purchase. */
  buyer(coins: number): Econ & { coins: number; saved: unknown };
  /** Start a second service on the same store and world, as a restart would. */
  restart(over?: Partial<LandOptions>): LandService;
  /** What a purchase needs, with the corners of a rectangle. */
  rect(x0: number, z0: number, x1: number, z1: number): [number, number][];
  /** A break or a place as a player does it: the world changes and the land is told. */
  edit(account: string | null, x: number, y: number, z: number, id: number): boolean;
}

export const T0 = 1_700_000_000_000;

export function landKit(over: LandConfigOverride = {}, kind: WorldKind = 'overworld', seed = 7, withStore?: LandStore): Kit {
  const generator = makeGenerator(seed, kind);
  const world = new HeadlessWorld(generator);
  // Tests that look inside the store (`store.claims`, `store.kv`) use the memory one; a real store is judged by what the service says.
  const store = (withStore ?? new MemoryLandStore()) as MemoryLandStore;
  const clock = { now: T0 };
  const players: { x: number; y: number; z: number }[] = [];
  // The land tests count what the ledger holds; the fence a purchase builds is tested on its own (enceOnBuy: true).
  const cfg = landConfigWith({ fenceOnBuy: false, ...over });
  const options = (extra: Partial<LandOptions> = {}): LandOptions => ({
    world: 'test',
    cfg,
    store,
    generator,
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    setBlock: (x, y, z, id) => world.setBlock(x, y, z, id),
    now: () => clock.now,
    rand: (() => {
      let s = 12345;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })(),
    players: () => players,
    ...extra,
  });
  const land = new LandService(options());
  land.load();
  const kit: Kit = {
    world,
    land,
    store,
    clock,
    players,
    buyer(coins) {
      const b = {
        coins,
        saved: null as unknown,
        balance: () => b.coins,
        charge: (n: number) => {
          if (n > b.coins) return false;
          b.coins -= n;
          return true;
        },
        refund: (n: number) => {
          b.coins += n;
        },
        save: (): [string, unknown] => {
          b.saved = { coins: b.coins };
          return ['player:test', b.saved];
        },
      };
      return b;
    },
    restart(extra = {}) {
      land.flush();
      const next = new LandService(options(extra));
      next.load();
      kit.land = next;
      return next;
    },
    rect: (x0, z0, x1, z1) => [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ],
    edit(account, x, y, z, id) {
      const d = kit.land.checkBuild(account, x, y, z, id === 0 ? 'break' : 'place', id);
      if (!d.ok) return false;
      return kit.land.withActor(account, () => world.setBlock(x, y, z, id));
    },
  };
  // The room's own wiring: every change of the world reaches the land, with the hand that made it (none: the wild).
  world.onChange = (x, y, z, id) => kit.land.onBlockChange(x, y, z, id, kit.land.actor, kit.land.actor === null);
  return kit;
}