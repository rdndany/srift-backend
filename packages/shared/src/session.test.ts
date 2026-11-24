import { describe, expect, it } from 'vitest';
import {
  B,
  GameSession,
  HeadlessWorld,
  I,
  LoopbackLink,
  SessionHost,
  WorldGenerator,
  makeStack,
  mulberry32,
  parseSessionMessage,
  toolId,
  type InputFrame,
  type SessionEvent,
  type SessionOptions,
} from './index';
import { settleOrbs } from './xpOrbs.testutil';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
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
  ...over,
});

/** A session standing on a clean stone platform (top surface y = 101) with open air around it. */
function make(opts: Partial<SessionOptions> = {}): { s: GameSession; world: HeadlessWorld; events: SessionEvent[] } {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(7), ...opts });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  const events: SessionEvent[] = [];
  return { s, world, events };
}

/** Run `seconds` of identical frames, collecting events. */
function run(s: GameSession, seconds: number, over: Partial<InputFrame> = {}, events: SessionEvent[] = []): SessionEvent[] {
  const dt = 1 / 20;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    s.tick(idle({ ...over, dt }));
    events.push(...s.drainEvents());
  }
  return events;
}

describe('message validation', () => {
  it('accepts well-formed frames and clamps them', () => {
    const m = parseSessionMessage({ ...idle(), dt: 5, forward: 9, strafe: -9, pitch: 100, yaw: -1 });
    expect(m).not.toBeNull();
    if (m?.t !== 'frame') throw new Error('expected a frame');
    expect(m.dt).toBeLessThanOrEqual(0.1);
    expect(m.forward).toBe(1);
    expect(m.strafe).toBe(-1);
    expect(Math.abs(m.pitch)).toBeLessThanOrEqual(Math.PI / 2);
    expect(m.yaw).toBeGreaterThanOrEqual(0);
    expect(m.yaw).toBeLessThan(Math.PI * 2);
  });

  it('rejects hostile frames', () => {
    const base = idle();
    const bad: unknown[] = [
      null,
      undefined,
      42,
      'frame',
      [],
      {},
      { t: 'nope' },
      { ...base, dt: NaN },
      { ...base, dt: Infinity },
      { ...base, yaw: 'x' },
      { ...base, forward: null },
      { ...base, jump: 1 },
      { ...base, locked: 'true' },
      { ...base, left: undefined },
    ];
    for (const b of bad) expect(parseSessionMessage(b)).toBeNull();
  });

  it('rejects hostile commands', () => {
    const bad: unknown[] = [
      { t: 'select', slot: 9 },
      { t: 'select', slot: -1 },
      { t: 'select', slot: 1.5 },
      { t: 'select', slot: '1' },
      { t: 'scroll', delta: 1e9 },
      { t: 'scroll', delta: NaN },
      { t: 'mode', mode: 'god' },
      { t: 'drop' },
      { t: 'click', slot: 1, button: 2 },
      { t: 'click', slot: 100000, button: 0 },
      { t: 'shift', slot: NaN },
      { t: '__proto__' },
      { t: 'constructor' },
    ];
    for (const b of bad) expect(parseSessionMessage(b)).toBeNull();
    expect(parseSessionMessage({ t: 'select', slot: 3 })).toEqual({ t: 'select', slot: 3 });
    expect(parseSessionMessage({ t: 'respawn', extra: 'ignored' })).toEqual({ t: 'respawn' });
  });

  it('the host drops garbage and keeps the session alive', () => {
    const { s } = make();
    const host = new SessionHost(s);
    for (const text of ['', 'not json', '{', '[]', 'null', '{"t":"frame"}', '{"t":"select","slot":99}', '{"t":"zzz"}']) {
      expect(host.receive(text)).toBeNull();
    }
    expect(host.rejected).toBe(8);
    expect(host.receive(JSON.stringify(idle()))).toBeNull(); // valid, no events
    expect(host.rejected).toBe(8);
  });
});

describe('movement and physics', () => {
  it('walks forward (yaw 0 faces -z)', () => {
    const { s } = make();
    const z0 = s.body.z;
    run(s, 1, { forward: 1 });
    expect(s.body.z).toBeLessThan(z0 - 2);
    expect(s.body.onGround).toBe(true);
  });

  it('idles when the pointer is not locked, with a slow clock', () => {
    const { s } = make();
    const z0 = s.body.z;
    const t0 = s.time;
    run(s, 1, { forward: 1, locked: false });
    expect(s.body.z).toBe(z0);
    const idleAdvance = s.time - t0;
    run(s, 1, { locked: true });
    expect(s.time - t0 - idleAdvance).toBeGreaterThan(idleAdvance * 4.9);
  });

  it('takes fall damage in survival but not creative', () => {
    const a = make();
    a.s.teleport(CX + 0.5, FLOOR + 12, CZ + 0.5);
    run(a.s, 2);
    expect(a.s.body.onGround).toBe(true);
    expect(a.s.vitals.health).toBeLessThan(20);

    const b = make({ mode: 'creative' });
    b.s.teleport(CX + 0.5, FLOOR + 12, CZ + 0.5);
    run(b.s, 2);
    expect(b.s.vitals.health).toBe(20);
  });

  it('flying is creative-only', () => {
    const a = make();
    a.s.apply({ t: 'fly' });
    expect(a.s.flying).toBe(false);
    const b = make({ mode: 'creative' });
    b.s.apply({ t: 'fly' });
    expect(b.s.flying).toBe(true);
    b.s.apply({ t: 'mode', mode: 'survival' });
    expect(b.s.flying).toBe(false);
  });
});

describe('mining and building', () => {
  it('mines a block by holding the attack button and drops it', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 2, CZ - 3, B.DIRT);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    // Eye is at ~y 102.6; look down a little so the ray crosses the block at y 102.
    s.pitch = -0.02;
    const events = run(s, 3, { left: true, pitch: -0.02 });
    expect(world.getBlock(CX, FLOOR + 2, CZ - 3)).toBe(B.AIR);
    expect(events.some((e) => e.t === 'burst')).toBe(true);
    expect(events.some((e) => e.t === 'sound' && e.action === 'hit')).toBe(true);
    s.teleport(CX + 0.5, FLOOR + 1, CZ - 2.5);
    s.tickDrops(3);
    expect(s.inventory.countOf(B.DIRT)).toBe(1);
  });

  it('survival block breaking needs the right tool for drops', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.STONE);
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    s.tickDrops(2);
    expect(s.inventory.countOf(B.COBBLE)).toBe(0);

    world.setBlock(CX + 2, FLOOR + 1, CZ, B.STONE);
    s.inventory.set(0, makeStack(toolId('pickaxe', 'wood')));
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    s.tickDrops(5);
    // (It lies where the block was: items are picked up by walking onto them, not drawn in.)
    expect(s.inventory.countOf(B.COBBLE) + s.drops.drops.filter((d) => d.stack.id === B.COBBLE).length).toBe(1);
  });

  it('creative mode breaks instantly and keeps nothing', () => {
    const { s, world } = make({ mode: 'creative' });
    world.setBlock(CX, FLOOR + 2, CZ - 3, B.STONE);
    run(s, 0.5, { left: true, pitch: -0.02 });
    expect(world.getBlock(CX, FLOOR + 2, CZ - 3)).toBe(B.AIR);
    expect(s.drops.count).toBe(0);
  });

  it('places the held block against a face and uses up the stack', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 2, CZ - 3, B.STONE);
    s.inventory.set(0, makeStack(B.PLANKS, 2));
    run(s, 0.1, { right: true, pitch: -0.02 });
    expect(world.getBlock(CX, FLOOR + 2, CZ - 2)).toBe(B.PLANKS);
    expect(s.inventory.countOf(B.PLANKS)).toBe(1);
  });

  it('will not place a block inside the player', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(B.PLANKS, 5));
    expect(s.useOn(CX, FLOOR, CZ, 0, 1, 0)).toBe(false);
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.AIR);
  });

  it('pops off a torch when the block under it is mined', () => {
    const { s, world } = make({ mode: 'creative' });
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.DIRT);
    world.setBlock(CX + 3, FLOOR + 2, CZ, B.TORCH);
    s.breakBlock(CX + 3, FLOOR + 1, CZ);
    expect(world.getBlock(CX + 3, FLOOR + 2, CZ)).toBe(B.AIR);
  });
});

describe('survival', () => {
  it('eating takes time, then restores hunger and uses one item', () => {
    const { s } = make();
    s.vitals.hunger = 8;
    s.inventory.set(0, makeStack(I.BREAD, 2));
    run(s, 0.8, { right: true });
    expect(s.vitals.hunger).toBe(8);
    expect(s.hudProgress).toBeGreaterThan(0);
    const events = run(s, 1, { right: true });
    expect(s.vitals.hunger).toBeGreaterThan(8);
    expect(s.inventory.countOf(I.BREAD)).toBe(1);
    expect(events.some((e) => e.t === 'eat')).toBe(true);
  });

  it('shows how far into a meal it is, and stops showing it when the button is let go', () => {
    const { s } = make();
    s.vitals.hunger = 8;
    s.inventory.set(0, makeStack(I.BREAD, 2));
    expect(s.eatProgress).toBe(0);
    run(s, 0.7, { right: true });
    expect(s.eatProgress).toBeGreaterThan(0.3);
    expect(s.eatProgress).toBeLessThan(0.8);
    run(s, 0.1, {});
    expect(s.eatProgress).toBe(0);
  });

  it('shows no meal when full, or with something that is not food', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(I.BREAD, 2));
    run(s, 0.5, { right: true });
    expect(s.eatProgress).toBe(0);
  });

  it('does not eat when full', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(I.BREAD, 2));
    run(s, 2, { right: true });
    expect(s.inventory.countOf(I.BREAD)).toBe(2);
  });

  it('fires an arrow on release and spends one', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(I.BOW));
    s.inventory.set(1, makeStack(I.ARROW, 4));
    run(s, 1.1, { right: true });
    expect(s.bowDraw).toBeGreaterThan(0.9);
    const events = run(s, 0.1, { right: false });
    expect(s.mobs.arrows.length).toBe(1);
    expect(s.inventory.countOf(I.ARROW)).toBe(3);
    expect(events.some((e) => e.t === 'mob' && e.sound === 'shoot')).toBe(true);
    expect(s.bowDraw).toBe(0);
  });

  it('an arrow lands where the crosshair is, though it falls as it flies', () => {
    for (const draw of [0.4, 0.7, 1.1]) {
      const { s, world } = make();
      for (let x = CX - 4; x <= CX + 4; x++) for (let y = FLOOR + 1; y < FLOOR + 14; y++) for (let z = CZ - 11; z < CZ - 7; z++) world.setBlock(x, y, z, B.STONE);
      s.inventory.set(0, makeStack(I.BOW));
      s.inventory.set(1, makeStack(I.ARROW, 4));
      run(s, draw, { right: true });
      s.tick(idle({ right: false }));
      expect(s.mobs.arrows.length).toBe(1);
      const arrow = s.mobs.arrows[0];
      let last = { x: arrow.x, y: arrow.y, z: arrow.z };
      for (let i = 0; i < 200 && s.mobs.arrows.includes(arrow); i++) {
        last = { x: arrow.x, y: arrow.y, z: arrow.z };
        s.tick(idle({ right: false }));
      }
      expect(s.mobs.arrows.includes(arrow)).toBe(false);
      // It hit the wall (z = CZ - 7) at the height of the eye, not below it.
      expect(last.z).toBeLessThan(CZ - 3); // (the last step before the wall)
      expect(Math.abs(last.y - s.eye().y)).toBeLessThan(0.5);
    }
  });

  it('a bow without arrows does nothing', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(I.BOW));
    run(s, 1.1, { right: true });
    run(s, 0.1, { right: false });
    expect(s.mobs.arrows.length).toBe(0);
  });

  it('death keeps the inventory (nothing is dropped); respawn restores the player', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(B.PLANKS, 5));
    s.vitals.damage(100, 'generic');
    const events = run(s, 0.2);
    expect(s.screen).toBe('dead');
    expect(events.some((e) => e.t === 'died')).toBe(true);
    expect(s.inventory.countOf(B.PLANKS)).toBe(5);
    expect(s.drops.count).toBe(0);
    // Dead players cannot play on.
    s.apply({ t: 'select', slot: 3 });
    expect(s.selected).toBe(0);
    s.apply({ t: 'respawn' });
    expect(s.screen).toBe('none');
    expect(s.vitals.health).toBe(20);
    expect(s.vitals.dead).toBe(false);
    expect(s.drainEvents().some((e) => e.t === 'respawned')).toBe(true);
  });

  it('creative players do not die from void damage but respawn', () => {
    const { s } = make({ mode: 'creative' });
    s.teleport(CX + 0.5, -40, CZ + 0.5);
    run(s, 0.2);
    expect(s.body.y).toBeGreaterThan(-30);
    expect(s.vitals.dead).toBe(false);
  });

  it('natural spawning can be switched off', () => {
    const { s } = make();
    run(s, 30);
    expect(s.mobs.mobs.length).toBe(0);
  });

  it('a creeper explosion blows a hole and hurts the player', () => {
    const { s, world } = make();
    const id = s.spawnMob('creeper', CX + 0.5, FLOOR + 1, CZ + 2.5);
    expect(id).toBeGreaterThan(0);
    const events = run(s, 6);
    expect(events.some((e) => e.t === 'explode')).toBe(true);
    expect(world.getBlock(CX, FLOOR, CZ + 2)).toBe(B.AIR);
    expect(s.vitals.health).toBeLessThan(20);
  });
});

describe('menus and commands', () => {
  it('opens, edits and closes the inventory; cursor stacks go back to the player', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(B.PLANKS, 5));
    s.apply({ t: 'inventory' });
    expect(s.screen).toBe('inventory');
    s.apply({ t: 'click', slot: 0, button: 0 });
    expect(s.menu?.cursor?.count).toBe(5);
    s.apply({ t: 'closeMenu' });
    expect(s.screen).toBe('none');
    expect(s.menu).toBeNull();
    expect(s.inventory.countOf(B.PLANKS)).toBe(5);
  });

  it('ignores gameplay commands while a menu is open', () => {
    const { s } = make();
    s.apply({ t: 'inventory' });
    s.apply({ t: 'select', slot: 4 });
    s.apply({ t: 'scroll', delta: 1 });
    expect(s.selected).toBe(0);
    s.apply({ t: 'closeMenu' });
    s.apply({ t: 'select', slot: 4 });
    expect(s.selected).toBe(4);
    s.apply({ t: 'scroll', delta: -5 });
    expect(s.selected).toBe(8);
  });

  it('drops one item or the whole stack', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(B.PLANKS, 5));
    s.apply({ t: 'drop', all: false });
    expect(s.inventory.countOf(B.PLANKS)).toBe(4);
    s.apply({ t: 'drop', all: true });
    expect(s.inventory.countOf(B.PLANKS)).toBe(0);
    expect(s.drops.count).toBe(2);
  });

  it('opens a crafting table by right-clicking it, but not while sneaking', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 2, CZ - 3, B.CRAFTING_TABLE);
    run(s, 0.2, { right: true, sneak: true, pitch: -0.02 });
    expect(s.screen).toBe('none');
    run(s, 0.1, { right: false });
    run(s, 0.1, { right: true, pitch: -0.02 });
    expect(s.screen).toBe('crafting');
  });

  it('emits an inv event when the inventory changes', () => {
    const { s } = make();
    s.giveItem(B.DIRT, 3);
    expect(s.drainEvents().some((e) => e.t === 'inv')).toBe(true);
  });
});

describe('persistence', () => {
  it('round-trips the player and world state through JSON', () => {
    const a = make();
    a.s.inventory.set(2, makeStack(B.PLANKS, 17));
    a.s.apply({ t: 'select', slot: 2 });
    a.s.vitals.hunger = 11;
    a.s.teleport(CX + 3.5, FLOOR + 1, CZ + 1.5, 1.2, -0.3);
    a.s.blockEntities.chest(1, 2, 3).set(0, makeStack(B.DIRT, 9));
    a.s.setWeather('rain');
    run(a.s, 2);

    const player = JSON.parse(JSON.stringify(a.s.savePlayer()));
    const state = JSON.parse(JSON.stringify(a.s.saveWorldState()));

    const b = make();
    b.s.loadPlayer(player);
    b.s.loadWorldState(state);
    b.s.finishLoading();
    expect(b.s.body.x).toBeCloseTo(a.s.body.x);
    expect(b.s.body.y).toBeCloseTo(a.s.body.y);
    expect(b.s.inventory.countOf(B.PLANKS)).toBe(17);
    expect(b.s.selected).toBe(2);
    expect(b.s.vitals.hunger).toBeCloseTo(a.s.vitals.hunger);
    expect(b.s.blockEntities.chest(1, 2, 3).get(0)?.count).toBe(9);
    expect(b.s.weather.kind).toBe('rain');
    expect(b.s.time).toBeCloseTo(a.s.time);
    expect(b.s.savePlayer().yaw).toBeCloseTo(a.s.savePlayer().yaw);
  });

  it('a mode forced by the caller beats the saved mode', () => {
    const a = make();
    const save = a.s.savePlayer();
    const b = make({ mode: 'creative' });
    b.s.loadPlayer(save, true);
    expect(b.s.mode).toBe('creative');
    const c = make({ mode: 'creative' });
    c.s.loadPlayer(save);
    expect(c.s.mode).toBe('survival');
  });

  it('is deterministic: same seed and same input give the same game', () => {
    const play = () => {
      const { s } = make({ rand: mulberry32(99) });
      run(s, 2, { forward: 1, jump: true });
      run(s, 2, { forward: 1, yaw: 2 });
      s.spawnMob('zombie', CX + 4.5, FLOOR + 1, CZ + 0.5);
      run(s, 5);
      return JSON.stringify([s.savePlayer(), s.saveWorldState()]);
    };
    expect(play()).toBe(play());
  });
});

describe('loopback transport', () => {
  it('delivers events as JSON and applies commands immediately', () => {
    const { s } = make();
    const host = new SessionHost(s);
    const seen: SessionEvent[] = [];
    const link = new LoopbackLink(host, (e) => seen.push(...e));
    s.inventory.set(0, makeStack(B.PLANKS, 5));
    link.send({ t: 'inventory' });
    expect(s.screen).toBe('inventory');
    expect(seen.some((e) => e.t === 'inv')).toBe(true);
    link.send({ t: 'closeMenu' });
    link.send({ t: 'drop', all: false });
    expect(s.inventory.countOf(B.PLANKS)).toBe(4);
    const z0 = s.body.z;
    for (let i = 0; i < 20; i++) link.send(idle({ forward: 1 }));
    expect(s.body.z).toBeLessThan(z0 - 1);
    expect(host.rejected).toBe(0);
  });

  it('a swing in the air starts the arm the others see, and a bow does not', () => {
    const { s } = make();
    run(s, 1);
    expect(s.swingAge).toBeGreaterThan(0.9);
    s.inventory.set(0, makeStack(toolId('sword', 'iron')));
    s.tick(idle({ left: true }));
    expect(s.swingAge).toBe(0);
    run(s, 0.2);
    expect(s.swingAge).toBeGreaterThan(0.1);
    expect(s.swingAge).toBeLessThan(0.3);
    s.inventory.set(0, makeStack(I.BOW));
    run(s, 0.5, { left: true });
    expect(s.swingAge).toBeGreaterThan(0.4);
  });

  it('a drawn bow and an off-hand stab are what the others see, and a monster close by squares the stance', () => {
    const { s } = make();
    run(s, 0.5);
    s.inventory.set(0, makeStack(I.BOW));
    s.inventory.set(1, makeStack(I.ARROW, 16));
    s.offhand.set(0, makeStack(I.DAGGER));
    s.tick(idle({ left: true }));
    expect(s.showStab).toBe(0);
    expect(s.swingAge).toBeGreaterThan(0.4);
    run(s, 0.15, { left: true });
    expect(s.showStab).toBeGreaterThan(0.05);
    expect(s.showStab).toBeLessThan(0.3);
    run(s, 0.5, { right: true });
    expect(s.bowDraw).toBeGreaterThan(0.2);
    const drawn = s.showStab;
    s.tick(idle({ left: true, right: true }));
    expect(s.showStab).toBeGreaterThan(drawn);
    s.offhand.set(0, null);
    run(s, 0.5, { left: true });
    expect(s.showStab).toBeGreaterThan(0.4);

    expect(s.nearHostile()).toBe(false);
    s.mobs.spawn('sheep', s.body.x + 2, s.body.y, s.body.z);
    s.mobs.spawn('zombie', s.body.x + 20, s.body.y, s.body.z);
    expect(s.nearHostile()).toBe(false);
    const close = s.mobs.spawn('zombie', s.body.x + 3, s.body.y, s.body.z);
    expect(s.nearHostile()).toBe(true);
    close.dead = true;
    expect(s.nearHostile()).toBe(false);
  });

  it('keeps the idle a player is drawing, and drops one that is not a sit, a stretch or a look', () => {
    const base = { t: 'frame', dt: 0.05, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false };
    expect(parseSessionMessage({ ...base, il: 1, ic: 2.5 })).toMatchObject({ il: 1, ic: 2.5 });
    expect(parseSessionMessage({ ...base, il: 4, ic: 1 })).not.toHaveProperty('il');
    expect(parseSessionMessage(base)).not.toHaveProperty('il');
  });

  it('flush hands over events from outside the protocol', () => {
    const { s } = make();
    const seen: SessionEvent[] = [];
    const link = new LoopbackLink(new SessionHost(s), (e) => seen.push(...e));
    s.giveItem(B.DIRT);
    link.flush();
    expect(seen.length).toBeGreaterThan(0);
    link.flush();
    expect(seen.length).toBe(1);
  });
});
