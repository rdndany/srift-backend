import { describe, expect, it } from 'vitest';
import {
  B,
  BED_DIRS,
  BED_HEIGHT,
  BLOCKS,
  GameSession,
  HeadlessWorld,
  I,
  NIGHT_END,
  NIGHT_START,
  SLEEP_SKIP_SECONDS,
  WorldGenerator,
  bedId,
  bedInfo,
  bedItemId,
  blockDrops,
  canStayAt,
  findRecipe,
  getItem,
  isBed,
  isInteractive,
  makeStack,
  mulberry32,
  parsePlayerSave,
  parseSessionMessage,
  type InputFrame,
  type SessionEvent,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;
const NIGHT = 0.75;
const NOON = 0.25;

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

/** A flat stone floor; the player stands at the middle looking toward -z (yaw 0). */
function make(seed = 7, mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed), mode });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

type Made = ReturnType<typeof make>;

/** Put a bed into the world directly: foot at (x, y, z), head one step along `dir`. */
function bedAt(world: Made['world'], x: number, y: number, z: number, dir: number): { head: [number, number, number] } {
  const [dx, dz] = BED_DIRS[dir];
  world.setBlock(x, y, z, bedId(false, dir));
  world.setBlock(x + dx, y, z + dz, bedId(true, dir));
  return { head: [x + dx, y, z + dz] };
}

const toasts = (events: SessionEvent[]): string[] => events.filter((e): e is Extract<SessionEvent, { t: 'toast' }> => e.t === 'toast').map((e) => e.text);

/** Click the bed (its foot or head) as a player in control. */
function useBedAt(s: GameSession, x: number, y: number, z: number): string[] {
  s.drainEvents();
  s.useBed({ x, y, z, id: s.world.getBlock(x, y, z), nx: 0, ny: 1, nz: 0, fx: 0.5, fy: 1, fz: 0.5 });
  return toasts(s.drainEvents());
}

describe('the bed blocks', () => {
  it('come in eight variants that know their half and direction', () => {
    for (let dir = 0; dir < 4; dir++) {
      const foot = bedInfo(bedId(false, dir))!;
      const head = bedInfo(bedId(true, dir))!;
      expect(foot).toMatchObject({ head: false, dir });
      expect(head).toMatchObject({ head: true, dir });
      expect([foot.dx, foot.dz]).toEqual([...BED_DIRS[dir]]);
    }
    expect(bedInfo(B.STONE)).toBeNull();
    expect(isBed(B.WOOL)).toBe(false);
    expect(isBed(B.BED_HEAD_NZ)).toBe(true);
  });

  it('are knee-high, see-through to light and open with the use button', () => {
    for (let dir = 0; dir < 4; dir++) {
      for (const head of [false, true]) {
        const def = BLOCKS[bedId(head, dir)];
        expect(def.shape).toBe('bed');
        expect(def.solid).toBe(true);
        expect(def.opaque).toBe(false);
        expect(isInteractive(def.id)).toBe(true);
      }
    }
    expect(BED_HEIGHT).toBeCloseTo(9 / 16);
  });

  it('are not items by themselves: the bed is one item', () => {
    expect(getItem(B.BED_FOOT_PX).name).toBe('unknown');
    expect(getItem(B.BED_HEAD_PX).name).toBe('unknown');
    expect(getItem(I.BED).name).toBe('bed');
    expect(getItem(I.BED).maxStack).toBe(1);
  });

  it('drop exactly one bed, from either half', () => {
    const foot = blockDrops(BLOCKS[B.BED_FOOT_NZ], null);
    const head = blockDrops(BLOCKS[B.BED_HEAD_NZ], null);
    expect(foot.length + head.length).toBe(1);
    expect([...foot, ...head][0]).toEqual({ id: I.BED, count: 1 });
  });
});

describe('crafting a bed', () => {
  it('takes three wool over three planks', () => {
    const W = makeStack(B.WOOL);
    const P = makeStack(B.PLANKS);
    expect(findRecipe([W, W, W, P, P, P, null, null, null], 3, 3)?.result).toMatchObject({ id: bedItemId(0), count: 1 }); // plain wool is white
    expect(findRecipe([W, W, W, P, P, null, null, null, null], 3, 3)).toBeNull();
    expect(findRecipe([P, P, P, W, W, W, null, null, null], 3, 3)).toBeNull();
  });
});

describe('placing a bed', () => {
  it('lays a foot where you click and a head the way you face', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(I.BED));
    s.selectSlot(0);
    expect(s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0)).toBe(true);
    // yaw 0 looks toward -z, so the head is on the -z side
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.BED_FOOT_NZ);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ - 1)).toBe(B.BED_HEAD_NZ);
    expect(s.inventory.get(0)).toBeNull();
  });

  it('points toward every side you look', () => {
    // yaw 0 faces -z, a quarter turn left (+) faces -x, back faces +z, a quarter turn right faces +x
    const cases: [number, number][] = [
      [0, 3],
      [Math.PI / 2, 1],
      [Math.PI, 2],
      [-Math.PI / 2, 0],
    ];
    for (const [yaw, dir] of cases) {
      const { s, world } = make();
      s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, yaw, 0);
      s.inventory.set(0, makeStack(I.BED));
      s.selectSlot(0);
      expect(s.useOn(CX, FLOOR, CZ + 5, 0, 1, 0)).toBe(true);
      expect(world.getBlock(CX, FLOOR + 1, CZ + 5)).toBe(bedId(false, dir));
      expect(world.getBlock(CX + BED_DIRS[dir][0], FLOOR + 1, CZ + 5 + BED_DIRS[dir][1])).toBe(bedId(true, dir));
    }
  });

  it('needs both blocks free, and room that nobody stands in', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(I.BED));
    s.selectSlot(0);
    world.setBlock(CX + 3, FLOOR + 1, CZ - 1, B.STONE); // where the head would go
    expect(s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0)).toBe(false);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(s.inventory.get(0)?.id).toBe(I.BED);
    // Not onto your own feet (the foot would be under you).
    expect(s.useOn(CX, FLOOR, CZ, 0, 1, 0)).toBe(false);
  });

  it('replaces tall grass, and keeps the bed in creative mode', () => {
    const { s, world } = make(7, 'creative');
    s.inventory.set(0, makeStack(I.BED));
    s.selectSlot(0);
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.TALL_GRASS);
    expect(s.useOn(CX + 3, FLOOR + 1, CZ, 0, 0, 0)).toBe(true);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.BED_FOOT_NZ);
    expect(s.inventory.get(0)?.id).toBe(I.BED);
  });
});

describe('breaking a bed', () => {
  it('drops exactly one bed whichever half you break, and the other half goes too', () => {
    for (const half of ['foot', 'head'] as const) {
      const { s, world } = make();
      const { head } = bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
      if (half === 'foot') s.breakBlock(CX + 2, FLOOR + 1, CZ);
      else s.breakBlock(head[0], head[1], head[2]);
      expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.AIR);
      expect(world.getBlock(head[0], head[1], head[2])).toBe(B.AIR);
      s.teleport(CX + 2.5, FLOOR + 1, CZ + 0.5);
      s.tickDrops(2);
      expect(s.inventory.countOf(I.BED)).toBe(1);
    }
  });

  it('pops off when one half is removed from outside (a partnerless half cannot stay)', () => {
    const { world } = make();
    bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    expect(canStayAt(B.BED_FOOT_NZ, world, CX + 2, FLOOR + 1, CZ)).toBe(true);
    world.setBlock(CX + 2, FLOOR + 1, CZ - 1, B.AIR);
    expect(canStayAt(B.BED_FOOT_NZ, world, CX + 2, FLOOR + 1, CZ)).toBe(false);
  });

  it('drops nothing in creative mode', () => {
    const { s, world } = make(7, 'creative');
    bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    s.tickDrops(2);
    expect(s.inventory.countOf(I.BED)).toBe(0);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ - 1)).toBe(B.AIR);
  });
});

describe('walking over a bed', () => {
  it('lets you walk up onto it, standing at its knee-high top', () => {
    const { s, world } = make();
    bedAt(world, CX + 2, FLOOR + 1, CZ, 0); // lies along x, from x+2 to x+3
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, -Math.PI / 2, 0); // face +x
    for (let i = 0; i < 40 && s.body.x < CX + 2.8; i++) s.tick(idle({ yaw: -Math.PI / 2, forward: 1 }));
    expect(s.body.x).toBeGreaterThan(CX + 2.2);
    expect(s.body.y).toBeCloseTo(FLOOR + 1 + BED_HEIGHT, 3);
    expect(s.body.onGround).toBe(true);
  });

  it('is still a wall when a full block stands behind it', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.STONE);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, -Math.PI / 2, 0);
    for (let i = 0; i < 24; i++) s.tick(idle({ yaw: -Math.PI / 2, forward: 1 }));
    expect(s.body.x).toBeLessThan(CX + 2);
    expect(s.body.y).toBeCloseTo(FLOOR + 1, 3);
  });

  it('catches a fall at the top of the mattress, not the full block', () => {
    const { s, world } = make();
    bedAt(world, CX + 2, FLOOR + 1, CZ, 0);
    s.teleport(CX + 2.5, FLOOR + 4, CZ + 0.5, 0, 0);
    for (let i = 0; i < 40; i++) s.tick(idle());
    expect(s.body.y).toBeCloseTo(FLOOR + 1 + BED_HEIGHT, 3);
  });

  it('does not stop a head that rises into the bed from below', () => {
    const { s, world } = make();
    bedAt(world, CX + 2, FLOOR + 3, CZ, 0); // a floating bed, two above the floor
    s.teleport(CX + 2.5, FLOOR + 1, CZ + 0.5, 0, 0);
    for (let i = 0; i < 10; i++) s.tick(idle({ jump: true }));
    expect(s.body.y + 1.8).toBeLessThanOrEqual(FLOOR + 3.0001);
  });
});

describe('using a bed by day', () => {
  it('sets your respawn point, explains why you cannot sleep, and does not repeat the news', () => {
    const { s, world } = make();
    const { head } = bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NOON;
    const first = useBedAt(s, CX + 2, FLOOR + 1, CZ);
    expect(first[0]).toMatch(/^Respawn point set/);
    expect(first[0]).toMatch(/only sleep at night/);
    expect(s.sleeping).toBeNull();
    expect(s.spawnPoint).toEqual({ x: head[0], y: head[1], z: head[2] });
    const again = useBedAt(s, CX + 2, FLOOR + 1, CZ);
    expect(again[0]).toBe('You can only sleep at night or during thunderstorms');
  });

  it('counts the head block as the bed whichever half you click', () => {
    const { s, world } = make();
    const { head } = bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NOON;
    useBedAt(s, head[0], head[1], head[2]);
    expect(s.spawnPoint).toEqual({ x: head[0], y: head[1], z: head[2] });
  });
});

describe('sleeping', () => {
  const night = (): Made & { head: [number, number, number] } => {
    const m = make();
    const { head } = bedAt(m.world, CX + 2, FLOOR + 1, CZ, 3);
    m.s.time = NIGHT;
    return { ...m, head };
  };

  it('works from dusk to just before dawn', () => {
    const { s } = make();
    s.time = NIGHT_START - 0.01;
    expect(s.realm.canSleep).toBe(false);
    s.time = NIGHT_START + 0.01;
    expect(s.realm.canSleep).toBe(true);
    s.time = NIGHT_END - 0.01;
    expect(s.realm.canSleep).toBe(true);
    s.time = NIGHT_END + 0.01;
    expect(s.realm.canSleep).toBe(false);
  });

  it('puts you in the bed, lying low, at the pillow end', () => {
    const { s, head } = night();
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    expect(s.sleeping).toMatchObject({ x: head[0], y: head[1], z: head[2], dir: 3 });
    expect(s.body.x).toBeCloseTo(head[0] + 0.5);
    expect(s.body.z).toBeCloseTo(head[2] + 0.5);
    expect(s.body.y).toBeCloseTo(FLOOR + 1 + BED_HEIGHT);
    expect(s.eye().y).toBeLessThan(s.body.y + 0.5);
    expect(s.spawnPoint).toEqual({ x: head[0], y: head[1], z: head[2] });
  });

  it('holds you still: no walking, mining, placing or opening menus', () => {
    const { s } = night();
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    const at = { x: s.body.x, y: s.body.y, z: s.body.z };
    for (let i = 0; i < 20; i++) s.tick(idle({ forward: 1, jump: true, left: true, right: true }));
    expect(s.body.x).toBeCloseTo(at.x);
    expect(s.body.y).toBeCloseTo(at.y);
    expect(s.body.z).toBeCloseTo(at.z);
    expect(s.sleeping).not.toBeNull();
    s.apply({ t: 'inventory' });
    expect(s.screen).toBe('none');
    s.apply({ t: 'select', slot: 4 });
    expect(s.selected).toBe(0);
  });

  it('ends with sneak, which stands you up beside the bed', () => {
    const { s, world, head } = night();
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    s.tick(idle({ sneak: true }));
    expect(s.sleeping).toBeNull();
    expect(Math.abs(s.body.x - (head[0] + 0.5)) + Math.abs(s.body.z - (head[2] + 0.5))).toBeLessThanOrEqual(1.5);
    expect(s.body.y).toBeCloseTo(FLOOR + 1);
    expect(world.getBlock(Math.floor(s.body.x), Math.floor(s.body.y), Math.floor(s.body.z))).toBe(B.AIR);
    // ...and you can walk again.
    const z0 = s.body.z;
    for (let i = 0; i < 6; i++) s.tick(idle({ forward: 1 }));
    expect(s.body.z).not.toBeCloseTo(z0);
  });

  it('ends with the wake command', () => {
    const { s } = night();
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    expect(parseSessionMessage({ t: 'wake' })).toEqual({ t: 'wake' });
    s.apply({ t: 'wake' });
    expect(s.sleeping).toBeNull();
  });

  it('ends when you are hurt', () => {
    const { s } = night();
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    s.tick(idle());
    expect(s.sleeping).not.toBeNull();
    s.vitals.damage(2, 'generic');
    s.tick(idle());
    expect(s.sleeping).toBeNull();
  });

  it('ends when the bed is broken under you', () => {
    const { s, world, head } = night();
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    world.setBlock(head[0], head[1], head[2], B.AIR);
    s.tick(idle());
    expect(s.sleeping).toBeNull();
  });

  it('is refused with a monster close by, but still sets the respawn point', () => {
    const { s, head } = night();
    s.spawnMob('zombie', head[0] + 5.5, FLOOR + 1, head[2] + 0.5);
    const msg = useBedAt(s, CX + 2, FLOOR + 1, CZ);
    expect(msg[0]).toMatch(/monsters nearby/);
    expect(s.sleeping).toBeNull();
    expect(s.spawnPoint).toEqual({ x: head[0], y: head[1], z: head[2] });
    // Out of range is fine.
    s.clearMobs();
    s.spawnMob('zombie', head[0] + 12.5, FLOOR + 1, head[2] + 0.5);
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    expect(s.sleeping).not.toBeNull();
  });

  it('skips the night after everyone has slept five seconds, and clears the weather', () => {
    const { s } = night();
    s.setWeather('rain');
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    const frames = Math.ceil(SLEEP_SKIP_SECONDS * 20);
    for (let i = 0; i < frames - 5; i++) s.tick(idle());
    expect(s.time).toBeGreaterThan(0.7); // not yet
    expect(s.sleeping).not.toBeNull();
    for (let i = 0; i < 20; i++) s.tick(idle());
    expect(s.time).toBeLessThan(0.05);
    expect(s.weather.kind).toBe('clear');
    expect(s.sleeping).toBeNull(); // morning wakes you
  });

  it('works in a thunderstorm by day, and wakes you into a clear morning', () => {
    const { s, world } = make();
    bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NOON;
    s.setWeather('thunder');
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    expect(s.sleeping).not.toBeNull();
    for (let i = 0; i < 130; i++) s.tick(idle());
    expect(s.weather.kind).toBe('clear');
    expect(s.sleeping).toBeNull();
  });

  it('wakes you at dawn on its own', () => {
    const { s } = night();
    s.time = NIGHT_END - 0.0005;
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    expect(s.sleeping).not.toBeNull();
    for (let i = 0; i < 200; i++) s.tick(idle());
    expect(s.sleeping).toBeNull();
  });

  it('does not keep the night skipped for someone who is awake: a lone waker resets nothing', () => {
    const { s } = night();
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    for (let i = 0; i < 40; i++) s.tick(idle());
    s.tick(idle({ sneak: true }));
    for (let i = 0; i < 200; i++) s.tick(idle());
    expect(s.time).toBeGreaterThan(0.7);
  });
});

describe('respawning at a bed', () => {
  const die = (s: GameSession) => {
    s.vitals.damage(1000, 'generic');
    s.tick(idle());
    expect(s.screen).toBe('dead');
  };

  it('puts you beside your bed', () => {
    const { s, world } = make();
    bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NOON;
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    s.teleport(CX + 9.5, FLOOR + 1, CZ + 9.5);
    die(s);
    s.drainEvents();
    s.apply({ t: 'respawn' });
    expect(s.screen).toBe('none');
    expect(Math.hypot(s.body.x - (CX + 2.5), s.body.z - (CZ - 0.5))).toBeLessThan(2.1);
    expect(s.body.y).toBeCloseTo(FLOOR + 1);
    expect(toasts(s.drainEvents())).not.toContain('Your home bed was missing or obstructed');
  });

  it('falls back to the world spawn, with a message, when the bed is gone', () => {
    const { s, world } = make();
    bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NOON;
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    s.teleport(CX + 9.5, FLOOR + 1, CZ + 9.5);
    die(s);
    s.drainEvents();
    s.apply({ t: 'respawn' });
    expect(toasts(s.drainEvents())).toContain('Your home bed was missing or obstructed');
    expect(s.spawnPoint).toBeNull();
    expect(s.screen).toBe('none');
  });

  it('falls back when the bed is boxed in', () => {
    const { s, world } = make();
    const { head } = bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NOON;
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    // seal every cell around the bed
    for (let x = CX; x <= CX + 4; x++)
      for (let z = CZ - 3; z <= CZ + 2; z++) {
        if (world.getBlock(x, FLOOR + 1, z) === B.AIR) world.setBlock(x, FLOOR + 1, z, B.STONE);
      }
    expect(world.getBlock(head[0], head[1], head[2])).toBe(B.BED_HEAD_NZ);
    s.teleport(CX + 9.5, FLOOR + 1, CZ + 9.5);
    die(s);
    s.drainEvents();
    s.apply({ t: 'respawn' });
    expect(toasts(s.drainEvents())).toContain('Your home bed was missing or obstructed');
  });
});

describe('saving beds', () => {
  it('remembers the respawn point', () => {
    const { s, world } = make();
    const { head } = bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NOON;
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    const saved = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(saved.spawn).toEqual({ x: head[0], y: head[1], z: head[2] });
    const { s: t } = make(9);
    t.loadPlayer(saved);
    expect(t.spawnPoint).toEqual({ x: head[0], y: head[1], z: head[2] });
  });

  it('has no spawn point in an old save, and ignores a malformed one', () => {
    const { s } = make();
    const raw = JSON.parse(JSON.stringify(s.savePlayer()));
    expect(parsePlayerSave(raw)!.spawn).toBeUndefined();
    expect(parsePlayerSave({ ...raw, spawn: { x: 'a', y: 1, z: 2 } })!.spawn).toBeUndefined();
    expect(parsePlayerSave({ ...raw, spawn: { x: 1.5, y: 1, z: 2 } })!.spawn).toBeUndefined();
    expect(parsePlayerSave({ ...raw, spawn: [1, 2, 3] })!.spawn).toBeUndefined();
    const { s: t } = make(9);
    t.spawnPoint = { x: 1, y: 2, z: 3 };
    t.loadPlayer(parsePlayerSave(raw)!);
    expect(t.spawnPoint).toBeNull();
  });

  it('saves a sleeper standing beside the bed, not inside it', () => {
    const { s, world } = make();
    bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NIGHT;
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    const saved = s.savePlayer();
    expect(saved.y).toBeCloseTo(FLOOR + 1);
    const inBed = Math.floor(saved.x) === CX + 2 && Math.floor(saved.z) === CZ - 1;
    expect(inBed).toBe(false);
    expect(s.sleeping).not.toBeNull(); // saving does not wake anyone
  });
});

describe('the Player.apply wake command in death', () => {
  it('a sleeper who dies is not left sleeping', () => {
    const { s, world } = make();
    bedAt(world, CX + 2, FLOOR + 1, CZ, 3);
    s.time = NIGHT;
    useBedAt(s, CX + 2, FLOOR + 1, CZ);
    s.vitals.damage(1000, 'generic');
    s.tick(idle());
    expect(s.sleeping).toBeNull();
    expect(s.screen).toBe('dead');
  });
});
