import { describe, expect, it, vi } from 'vitest';
import {
  ADVENTURE_SEED,
  B,
  DUNGEON_MIN_LEVEL,
  DUNGEON_X,
  DUNGEON_Z,
  GameSession,
  HeadlessWorld,
  I,
  INSTANCE_SLOTS,
  INSTANCE_STRIDE,
  Player,
  Realm,
  makeGenerator,
  makeStack,
  mulberry32,
  totalForLevel,
  type AdventureWorldGenerator,
  type InputFrame,
  type SessionEvent,
} from './index';

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

function make(seed = 9) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: true, rand: mulberry32(seed) });
  s.finishLoading();
  s.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
  return { s, world, realm: s.realm };
}

const run = (s: GameSession, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};

/** A second player in the same realm (a body that only stands where it is put). */
function guest(realm: Realm, name: string, level = DUNGEON_MIN_LEVEL, mode: 'survival' | 'creative' = 'survival'): Player {
  const p = new Player(realm, { mode, name });
  p.finishLoading();
  if (level > 0) p.xp.add(totalForLevel(level));
  return p;
}

const toasts = (events: SessionEvent[]): string[] => events.flatMap((e) => (e.t === 'toast' ? [e.text] : []));

describe('entering the dungeon', () => {
  it('sends a player who walks into the chapel portal to a copy of their own, and out again through the portal inside', () => {
    const { s, realm } = make();
    s.teleport(DUNGEON_X - 3.5, generator.ruinY + 1, DUNGEON_Z + 0.5, -Math.PI / 2, 0);
    run(s, 0.3);
    expect(realm.copyAt(s)).toBe(-1);
    // Walk east into it.
    for (let i = 0; i < 60 && realm.copyAt(s) < 0; i++) s.tick(idle({ forward: 1, yaw: -Math.PI / 2 }));
    expect(realm.copyAt(s)).toBe(0);
    const e = generator.instanceEntry(0)!;
    expect(Math.hypot(s.body.x - e.x, s.body.z - e.z)).toBeLessThan(1);
    expect(s.body.y).toBeCloseTo(e.y, 0);
    expect(realm.copyOwner(0)).toBe(s.instanceKey());
    expect(realm.copiesInUse).toBe(1);

    // Standing at the arrival spot does not send you straight back; walking into the way out does.
    run(s, 4);
    expect(realm.copyAt(s)).toBe(0);
    for (let i = 0; i < 80 && realm.copyAt(s) >= 0; i++) s.tick(idle({ forward: 1, yaw: Math.PI / 2 }));
    expect(realm.copyAt(s)).toBe(-1);
    const out = generator.instanceExit();
    expect(Math.hypot(s.body.x - out.x, s.body.z - out.z)).toBeLessThan(1);
    // Out of the portal and standing in the open: it does not take you in again by itself.
    run(s, 4);
    expect(realm.copyAt(s)).toBe(-1);
  });

  it('gives each player a copy of their own, side by side but apart, and the same one back to the same player', () => {
    const { s, realm } = make();
    const g = guest(realm, 'Ada');
    s.realm.usePortal(s);
    realm.usePortal(g);
    expect(realm.copyAt(s)).toBe(0);
    expect(realm.copyAt(g)).toBe(1);
    expect(g.body.z - s.body.z).toBeCloseTo(INSTANCE_STRIDE, 5);
    expect(g.body.x).toBeCloseTo(s.body.x, 5);
    expect(realm.copyOwner(1)).toBe(g.instanceKey());

    // Leave and come back: the same copy.
    s.teleport(DUNGEON_X - 3.5, generator.ruinY + 1, DUNGEON_Z + 0.5);
    run(s, 2);
    expect(realm.copyAt(s)).toBe(-1);
    realm.usePortal(s);
    expect(realm.copyAt(s)).toBe(0);
    expect(realm.copiesInUse).toBe(2);
  });

  it('puts the cages to work, in your copy only', () => {
    const { s, realm } = make();
    const g = guest(realm, 'Ada');
    realm.usePortal(s);
    realm.usePortal(g);
    g.teleport(generator.roomX + 60, generator.cellarY + 1, generator.roomZ + INSTANCE_STRIDE + 0.5); // out of the cage's reach, in the other copy
    run(s, 25);
    const mine = realm.mobs.mobs.filter((m) => m.kind === 'zombie' || m.kind === 'skeleton');
    expect(mine.length).toBeGreaterThan(0);
    for (const m of mine) expect(generator.instanceAt(m.body.x, m.body.z), `${m.kind} at ${m.body.x},${m.body.z}`).toBe(0);
    // The monsters come from the cage, in the kind that cage makes, and nothing else turns up.
    for (const m of mine) expect(['zombie', 'skeleton']).toContain(m.kind);
    expect(realm.mobs.mobs.filter((m) => m.kind !== 'zombie' && m.kind !== 'skeleton' && m.kind !== 'npc').length).toBe(0);
  });

  it('says so when every dungeon is taken, and leaves the player where they are', () => {
    const { s, realm } = make();
    for (let i = 0; i < INSTANCE_SLOTS; i++) realm.usePortal(guest(realm, `g${i}`));
    expect(realm.copiesInUse).toBe(INSTANCE_SLOTS);
    s.drainEvents();
    s.teleport(DUNGEON_X + 0.5, generator.ruinY + 1, DUNGEON_Z + 0.5);
    run(s, 0.3);
    expect(realm.copyAt(s)).toBe(-1);
    expect(toasts(s.drainEvents()).join(' ')).toMatch(/every dungeon is in use/);
  });

  it('puts out somebody who turns up in a copy that is not theirs', () => {
    const { s, realm } = make();
    const g = guest(realm, 'Ada');
    realm.usePortal(g);
    s.teleport(generator.roomX + 6.5, generator.cellarY + 1, generator.roomZ + 0.5); // copy 0, which is Ada's... no: nobody has it yet
    s.teleport(generator.roomX + 6.5, generator.cellarY + 1, generator.roomZ + INSTANCE_STRIDE * 5 + 0.5); // an empty copy
    run(s, 1.5);
    expect(realm.copyAt(s)).toBe(-1);
    expect(Math.abs(s.body.x - generator.instanceExit().x)).toBeLessThan(2);
    // Ada keeps hers.
    expect(realm.copyAt(g)).toBe(0);
  });
});

describe('leaving a dungeon behind', () => {
  it('keeps the copy for a while, then wipes it: monsters, cages, loot and all', () => {
    const { s, world, realm } = make();
    const g = guest(realm, 'Ada');
    realm.usePortal(g);
    const slot = realm.copyAt(g);
    const cages = generator.instanceCages(slot);
    const chest = { x: generator.roomX + 9, y: generator.cellarY + 1, z: generator.roomZ + slot * INSTANCE_STRIDE - 3 };

    // Ada breaks a cage, takes the loot from a chest, and a monster is left behind.
    g.breakBlock(cages[0].x, cages[0].y, cages[0].z);
    expect(world.getBlock(cages[0].x, cages[0].y, cages[0].z)).toBe(B.AIR);
    const loot = realm.blockEntities.chest(chest.x, chest.y, chest.z);
    expect(loot.isEmpty()).toBe(false);
    for (let i = 0; i < loot.size; i++) loot.set(i, null);
    realm.mobs.spawn('zombie', cages[1].x + 0.5, cages[1].y, cages[1].z + 0.5);
    realm.drops.spawnAtBlock(makeStack(I.COOKED_MEAT, 3), chest.x, chest.y, chest.z);

    // She leaves for the village; a minute later it is still hers.
    g.teleport(0.5, generator.hubY + 1, 20.5);
    run(s, 60);
    expect(realm.copyOwner(slot)).toBe(g.instanceKey());
    expect(world.getBlock(cages[0].x, cages[0].y, cages[0].z)).toBe(B.AIR);

    // Long enough: it goes back to how it was generated, and is free again.
    run(s, 40);
    expect(realm.copyOwner(slot)).toBeNull();
    expect(realm.copiesInUse).toBe(0);
    expect(world.getBlock(cages[0].x, cages[0].y, cages[0].z)).toBe(B.SPAWNER);
    expect(realm.mobs.mobs.filter((m) => generator.instanceAt(m.body.x, m.body.z) >= 0).length).toBe(0);
    expect(realm.drops.drops.filter((d) => generator.instanceAt(d.x, d.z) >= 0).length).toBe(0);
    expect(realm.blockEntities.chest(chest.x, chest.y, chest.z).isEmpty()).toBe(false); // the chest is full again
    // The next one in is given that copy, whole.
    const h = guest(realm, 'Bob');
    realm.usePortal(h);
    expect(realm.copyAt(h)).toBe(slot);
  });

  it('wipes a copy whose player has left the server', () => {
    const { s, world, realm } = make();
    const g = guest(realm, 'Ada');
    realm.usePortal(g);
    const c = generator.instanceCages(0)[2];
    g.breakBlock(c.x, c.y, c.z);
    g.leave();
    run(s, 100);
    expect(realm.copiesInUse).toBe(0);
    expect(world.getBlock(c.x, c.y, c.z)).toBe(B.SPAWNER);
  });

  it('never saves a copy: edits made in one are not in the world that is written down', () => {
    const { s, world, realm } = make();
    realm.usePortal(s);
    const c = generator.instanceCages(0)[0];
    s.breakBlock(c.x, c.y, c.z);
    expect(world.editedChunks().length).toBe(0);
    // ... and the chests of an earlier run are forgotten on loading.
    realm.blockEntities.chest(generator.roomX + 9, generator.cellarY + 1, generator.roomZ - 3).set(0, makeStack(I.DIAMOND, 1));
    const state = realm.saveState();
    const next = make().realm;
    next.loadState(state);
    expect(next.blockEntities.toJSON()).toEqual({ chests: {}, furnaces: {} });
  });
});

describe('who may go in', () => {
  it('turns back a player who is too low a level, with a word about it, and lets them in at the level', () => {
    const { realm } = make();
    const rookie = guest(realm, 'Rook', DUNGEON_MIN_LEVEL - 1);
    rookie.drainEvents?.();
    rookie.teleport(DUNGEON_X, generator.ruinY + 1, DUNGEON_Z + 0.5, 0, 0);
    realm.usePortal(rookie);
    expect(realm.copyAt(rookie)).toBe(-1);
    expect(realm.copiesInUse).toBe(0);
    const out = generator.instanceExit();
    expect(Math.hypot(rookie.body.x - out.x, rookie.body.z - out.z)).toBeLessThan(1);
    expect(toasts(rookie.drainEvents()).join(' ')).toMatch(new RegExp(`level ${DUNGEON_MIN_LEVEL} and up. You are level ${DUNGEON_MIN_LEVEL - 1}`));
    rookie.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    rookie.portalCooldown = 0;
    realm.usePortal(rookie);
    expect(realm.copyAt(rookie)).toBe(0);
  });

  it('does not ask anything of a creative player', () => {
    const { realm } = make();
    const op = guest(realm, 'Op', 0, 'creative');
    realm.usePortal(op);
    expect(realm.copyAt(op)).toBe(0);
  });

  it('can ask for a key as well: carried to go in, used up when a copy opens, and not needed again to come back to it', () => {
    const { realm } = make();
    const spy = vi.spyOn(generator, 'instanceRequirement').mockReturnValue({ name: 'The Test Vault', item: I.DIAMOND, consume: true });
    try {
      const p = guest(realm, 'Key');
      realm.usePortal(p);
      expect(realm.copyAt(p)).toBe(-1);
      expect(toasts(p.drainEvents()).join(' ')).toMatch(/needs Diamond/i);

      p.inventory.add(makeStack(I.DIAMOND, 2));
      p.portalCooldown = 0;
      realm.usePortal(p);
      expect(realm.copyAt(p)).toBe(0);
      expect(p.inventory.countOf(I.DIAMOND)).toBe(1);

      // Out and in again while the copy is kept: no second key.
      realm.usePortal(p);
      expect(realm.copyAt(p)).toBe(-1);
      p.portalCooldown = 0;
      realm.usePortal(p);
      expect(realm.copyAt(p)).toBe(0);
      expect(p.inventory.countOf(I.DIAMOND)).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});