import { describe, expect, it } from 'vitest';
import {
  B,
  Experience,
  FURNACE_FUEL,
  FURNACE_INPUT,
  FurnaceMenu,
  GameSession,
  HeadlessWorld,
  I,
  MAX_LEVEL,
  WorldGenerator,
  makeStack,
  mulberry32,
  parsePlayerSave,
  toolId,
  totalForLevel,
  xpToNext,
  type InputFrame,
  type SessionEvent,
} from './index';
import { settleOrbs } from './xpOrbs.testutil';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: 0,
  pitch: 0,
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
});

function make(seed = 7) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed) });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

function run(s: GameSession, seconds: number): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 20) {
    s.tick(idle());
    out.push(...s.drainEvents());
  }
  return out;
}

describe('the level curve', () => {
  it('matches the original at the known points', () => {
    expect(xpToNext(0)).toBe(7);
    expect(xpToNext(1)).toBe(9);
    expect(xpToNext(15)).toBe(37);
    expect(xpToNext(16)).toBe(42);
    expect(xpToNext(30)).toBe(112);
    expect(xpToNext(31)).toBe(121);
    expect(totalForLevel(0)).toBe(0);
    expect(totalForLevel(15)).toBe(315);
    expect(totalForLevel(30)).toBe(1395);
    expect(totalForLevel(31)).toBe(1507);
  });

  it('the total to reach a level is the sum of the steps before it', () => {
    let sum = 0;
    for (let l = 0; l < 200; l++) {
      expect(totalForLevel(l)).toBe(sum);
      sum += xpToNext(l);
    }
  });
});

describe('Experience', () => {
  it('fills the bar, then rolls over into levels', () => {
    const x = new Experience();
    expect(x.add(3)).toBe(0);
    expect(x.level).toBe(0);
    expect(x.progress).toBeCloseTo(3 / 7);
    expect(x.add(4)).toBe(1);
    expect(x.level).toBe(1);
    expect(x.points).toBe(0);
    expect(x.add(7 + 9)).toBe(1); // 7 more completes nothing at level 1 (needs 9), 16 gives one level with 7 left
    expect(x.level).toBe(2);
    expect(x.total).toBe(totalForLevel(2) + x.points);
  });

  it('a big award can gain many levels at once', () => {
    const x = new Experience();
    expect(x.add(totalForLevel(30))).toBe(30);
    expect(x.level).toBe(30);
    expect(x.points).toBe(0);
  });

  it('ignores nonsense and caps absurd amounts', () => {
    const x = new Experience();
    for (const bad of [NaN, -5, 0, Infinity, -Infinity]) expect(x.add(bad)).toBe(0);
    expect(x.total).toBe(0);
    x.add(1e18);
    expect(Number.isFinite(x.total)).toBe(true);
    expect(x.level).toBeLessThanOrEqual(MAX_LEVEL);
  });

  it('spends whole levels only', () => {
    const x = new Experience();
    x.add(totalForLevel(10) + 5);
    expect(x.spend(11)).toBe(false);
    expect(x.spend(-1)).toBe(false);
    expect(x.spend(1.5)).toBe(false);
    expect(x.level).toBe(10);
    expect(x.spend(3)).toBe(true);
    expect(x.level).toBe(7);
  });

  it('loses a share of all its points, which can cost levels, and never more than it has', () => {
    const x = new Experience();
    expect(x.lose(0.25)).toBe(0);
    x.add(totalForLevel(20) + 10);
    const before = x.total;
    const lost = x.lose(0.25);
    expect(lost).toBe(before - x.total);
    expect(x.total).toBe(Math.floor(before * 0.75));
    expect(x.level).toBeLessThan(20);
    expect(x.level).toBeGreaterThan(14);
    x.lose(1);
    expect(x.total).toBe(0);
    x.add(5);
    expect(x.lose(0)).toBe(0);
    expect(x.total).toBe(5);
  });
  it('round-trips through JSON and survives hostile data', () => {
    const x = new Experience();
    x.add(totalForLevel(12) + 4);
    const y = new Experience();
    y.loadJSON(JSON.parse(JSON.stringify(x)));
    expect(y.level).toBe(12);
    expect(y.points).toBe(4);
    for (const bad of [null, undefined, 5, 'x', [], { l: 'a', p: {} }, { l: -4, p: -9 }, { l: 1e99, p: 1e99 }, { l: NaN, p: NaN }, { l: 3, p: 1e9 }]) {
      const z = new Experience();
      z.loadJSON(bad);
      expect(Number.isInteger(z.level)).toBe(true);
      expect(z.level).toBeGreaterThanOrEqual(0);
      expect(z.level).toBeLessThanOrEqual(MAX_LEVEL);
      expect(z.points).toBeGreaterThanOrEqual(0);
      expect(z.points).toBeLessThan(xpToNext(z.level));
    }
  });
});

describe('earning experience in a session', () => {
  it('killing a mob lets out orbs, which pay you experience when they reach you', () => {
    const { s } = make();
    const id = s.spawnMob('zombie', CX + 3.5, FLOOR + 1, CZ + 0.5);
    s.damageMob(id, 100);
    run(s, 0.2);
    expect(s.xp.total).toBe(0); // not at once: the orbs have to come to you
    expect(s.xpOrbs.count).toBeGreaterThan(0);
    const events = run(s, 3);
    expect(s.xpOrbs.count).toBe(0);
    expect(s.xp.total).toBe(5);
    expect(s.xp.level).toBe(0);
    expect(events.some((e) => e.t === 'xp')).toBe(true);
  });

  it('an orb near enough is drawn to you, and one that is too far away is left lying', () => {
    const { s } = make();
    s.realm.awardXp(3, CX + 200, FLOOR + 1, CZ);
    s.realm.awardXp(4, CX + 3, FLOOR + 1, CZ);
    settleOrbs(s);
    expect(s.xp.total).toBe(4);
    expect(s.xpOrbs.count).toBe(1);
  });

  it('a mob that died on its own is worth nothing', () => {
    const { s } = make();
    const id = s.spawnMob('cow', CX + 3.5, FLOOR + 1, CZ + 0.5);
    const mob = s.mobs.mobs.find((m) => m.id === id)!;
    s.mobs.damage(mob, 100, 0, 0, s.realm.mobEvents); // not by a player
  });

  it('a creeper that blew itself up pays nothing', () => {
    const { s } = make();
    const id = s.spawnMob('creeper', CX + 3.5, FLOOR + 1, CZ + 0.5);
    const mob = s.mobs.mobs.find((m) => m.id === id)!;
    mob.noDrops = true;
    s.mobs.damage(mob, 100, 0, 0, s.realm.mobEvents, false);
  });

  it('mining ore with the right tool gives experience; the wrong tool or plain stone does not', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(toolId('pickaxe', 'iron')));
    s.selectSlot(0);
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.DIAMOND_ORE);
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    settleOrbs(s);
    expect(s.xp.total).toBeGreaterThanOrEqual(3);
    expect(s.xp.total).toBeLessThanOrEqual(7);

    let before = s.xp.total;
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.COAL_ORE);
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    settleOrbs(s);
    expect(s.xp.total - before).toBeLessThanOrEqual(2);

    before = s.xp.total;
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.STONE);
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    settleOrbs(s);
    expect(s.xp.total).toBe(before);

    // A wooden pickaxe cannot harvest diamond, so it earns nothing.
    s.inventory.set(0, makeStack(toolId('pickaxe', 'wood')));
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.DIAMOND_ORE);
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    settleOrbs(s);
    expect(s.xp.total).toBe(before);
  });

  it('smelting stores experience that is paid out when you take the output', () => {
    const { s } = make();
    s.openScreen('furnace');
    const menu = s.menu as FurnaceMenu;
    menu.furnace.container.set(FURNACE_INPUT, makeStack(B.IRON_ORE, 10));
    menu.furnace.container.set(FURNACE_FUEL, makeStack(I.COAL, 3));
    s.tickFurnaces(130);
    expect(menu.furnace.xpStored).toBeCloseTo(7);
    expect(s.xp.total).toBe(0); // nothing until you take the iron
    menu.click(menu.outputSlot, 0);
    expect(menu.furnace.xpStored).toBe(0);
    settleOrbs(s);
    expect(s.xp.total).toBe(7);
    // Taking again pays nothing more.
    menu.click(menu.outputSlot, 0);
  });

  it('fractions of smelting experience are paid out by chance but never lose or invent whole points', () => {
    const { s } = make();
    s.openScreen('furnace');
    const menu = s.menu as FurnaceMenu;
    menu.furnace.xpStored = 0.35;
    let paid = 0;
    const n = 4000;
    const r = mulberry32(11);
    for (let i = 0; i < n; i++) {
      menu.furnace.xpStored = 0.35;
      paid += menu.furnace.takeXp(r);
    }
    expect(paid / n).toBeGreaterThan(0.3);
    expect(paid / n).toBeLessThan(0.4);
  });

  it('gaining a level announces it', () => {
    const { s } = make();
    s.drainEvents();
    s.addXp(7);
    const e = s.drainEvents();
    expect(e).toContainEqual({ t: 'levelup', level: 1 });
    expect(e.some((x) => x.t === 'xp')).toBe(true);
    s.addXp(2);
    expect(s.drainEvents().some((x) => x.t === 'levelup')).toBe(false);
  });

  it('a level gained shows everyone nearby a column of light, and an ordinary gain does not', () => {
    const { s } = make();
    const marks = () => s.realm.effects.fx.filter((f) => f.k === 'level_up');
    s.addXp(2);
    expect(marks()).toHaveLength(0);
    s.addXp(7);
    expect(marks()).toHaveLength(1);
    expect(marks()[0].by).toBe(s.name);
  });
});

describe('dying and saving', () => {
  it('death costs a quarter of the experience, and drops nothing', () => {
    const { s } = make();
    s.addXp(totalForLevel(10) + 3);
    const before = s.xp.total;
    s.vitals.damage(100, 'generic');
    s.tick(idle());
    expect(s.screen).toBe('dead');
    expect(s.xp.total).toBe(Math.floor(before * 0.75));
    expect(s.xp.level).toBeLessThan(10);
    expect(s.xp.level).toBeGreaterThan(6);
    expect(s.drops.count).toBe(0);
  });

  it('death with no experience costs none, and the dead earn none', () => {
    const { s } = make();
    s.vitals.damage(100, 'generic');
    s.tick(idle());
    expect(s.xp.total).toBe(0);
    s.realm.awardXp(50, s.body.x, s.body.y, s.body.z);
    expect(s.xp.total).toBe(0);
    s.apply({ t: 'respawn' });
  });

  it('says what a death cost', () => {
    const { s } = make();
    s.addXp(totalForLevel(10));
    s.drainEvents();
    s.vitals.damage(100, 'generic');
    s.tick(idle());
    const toast = s.drainEvents().find((e) => e.t === 'toast');
    expect(toast && toast.t === 'toast' && /experience/.test(toast.text)).toBe(true);
  });

  it('level and bar survive a save and a load', () => {
    const { s } = make();
    s.addXp(totalForLevel(23) + 11);
    const saved = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    const { s: t } = make();
    t.loadPlayer(saved);
    expect(t.xp.level).toBe(23);
    expect(t.xp.points).toBe(11);
  });

  it('an old save without experience loads as level zero', () => {
    const saved = parsePlayerSave({ v: 1, x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mode: 'survival', selected: 0, inv: null, vitals: null, mobs: null })!;
    const { s } = make();
    s.addXp(50);
    s.loadPlayer(saved);
    expect(s.xp.level).toBe(0);
    expect(s.xp.points).toBe(0);
  });

  it('a hostile save cannot break the bar', () => {
    const saved = parsePlayerSave({ v: 1, x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mode: 'survival', selected: 0, inv: null, vitals: null, mobs: null, xp: { l: 'lots', p: -3 } })!;
    const { s } = make();
    s.loadPlayer(saved);
    expect(s.xp.level).toBe(0);
    expect(s.xp.points).toBe(0);
  });
});
