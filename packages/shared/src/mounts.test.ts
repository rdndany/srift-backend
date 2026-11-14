import { describe, expect, it } from 'vitest';
import {
  B,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  MOUNTS,
  MOUNT_CAST,
  MOUNT_BITE,
  MOUNT_EYE_LIFT,
  MOUNT_HOWL,
  MOUNT_MOUTH,
  MOUNTED_EYE,
  MOUNT_ROOF,
  mountMouthAt,
  PLAYER_EYE,
  WorldGenerator,
  getItem,
  makeStack,
  mountBlocker,
  mountDef,
  mountItemId,
  mountOfItem,
  mulberry32,
  parsePlayerSave,
  parseSessionMessage,
  shopOf,
  tooltipLines,
  type InputFrame,
  type SessionEvent,
} from './index';

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

/** A flat stone floor under open sky, with the player in the middle of it. */
function make(mode: 'survival' | 'creative' = 'survival', classId: 'warrior' | null = null) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 40; x <= CX + 40; x++)
    for (let z = CZ - 40; z <= CZ + 40; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 20; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode, classId });
  s.finishLoading();
  // A character without a class is held to its experience level for a mount: make it a high one.
  if (!classId) s.xp.level = 30;
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  s.drainEvents();
  return { s, world };
}

const seconds = (s: GameSession, n: number, over: Partial<InputFrame> = {}): void => {
  for (let i = 0; i < Math.round(n * 20); i++) s.tick(idle(over));
};
const toasts = (s: GameSession): string[] => s.drainEvents().flatMap((e: SessionEvent) => (e.t === 'toast' ? [e.text] : []));
const mountEvents = (list: SessionEvent[]): string[] => list.flatMap((e) => (e.t === 'mount' ? [`${e.what}:${e.id}`] : []));

/** Put a mount's horn in the mount slot, as a player does with a right-click on it in the hotbar. */
function equip(s: GameSession, id: (typeof MOUNTS)[number]['id'] = 'fenrir'): void {
  s.inventory.set(0, makeStack(mountItemId(id), 1));
  s.apply({ t: 'select', slot: 0 });
  s.tick(idle({ right: true }));
  s.tick(idle());
}
describe('the mounts', () => {
  it('are four Fenrir, each with a horn item of its own', () => {
    expect(MOUNTS.map((m) => m.id)).toEqual(['fenrir', 'fenrir_black', 'fenrir_blue', 'fenrir_gold']);
    const ids = new Set(MOUNTS.map((m) => mountItemId(m.id)));
    expect(ids.size).toBe(MOUNTS.length);
    for (const m of MOUNTS) {
      const id = mountItemId(m.id);
      expect(mountOfItem(id)).toBe(m.id);
      expect(getItem(id).maxStack).toBe(1);
      expect(getItem(id).name).not.toBe('unknown');
    }
    expect(mountOfItem(I.BREAD)).toBeNull();
    expect(mountOfItem(I.MOUNT_BASE + MOUNTS.length)).toBeNull();
  });

  it('get faster and dearer as they get rarer', () => {
    for (let i = 1; i < MOUNTS.length; i++) {
      expect(MOUNTS[i].speed).toBeGreaterThanOrEqual(MOUNTS[i - 1].speed);
      expect(MOUNTS[i].price).toBeGreaterThanOrEqual(MOUNTS[i - 1].price);
      expect(MOUNTS[i].level).toBeGreaterThanOrEqual(MOUNTS[i - 1].level);
    }
    expect(MOUNTS[0].speed).toBe(1.6);
  });

  it('have horns that the ranger quartermaster sells at their price', () => {
    const stock = shopOf('fenna')!.stock;
    for (const m of MOUNTS) expect(stock.find((w) => w.id === mountItemId(m.id))?.price).toBe(m.price);
  });

  it('have horns with a tooltip that says what they do, in red when the level is too low', () => {
    const lines = tooltipLines(makeStack(mountItemId('fenrir_gold'), 1), 'warrior', 5);
    const text = lines.map((l) => l.text).join('\n');
    expect(lines[0].text).toBe('Horn of the Golden Fenrir');
    expect(lines[1].text).toBe('Mount');
    expect(text).toContain('+100% movement speed');
    expect(text).toContain('Right-click to put it in the mount slot');
    expect(lines.find((l) => l.text === 'Requires level 20')?.color).toBe('warn');
    expect(tooltipLines(makeStack(mountItemId('fenrir'), 1), 'warrior', 9).find((l) => l.text === 'Requires level 8')?.color).toBe('stat');
  });
});

describe('where a mount can be summoned', () => {
  const open = { getBlock: (_x: number, _y: number, _z: number) => 0 };

  it('is open country: not in the water and not under a roof', () => {
    expect(mountBlocker(open, 0, 64, 0, false)).toBeNull();
    expect(mountBlocker(open, 0, 64, 0, true)).toBe('water');
    const roofAt = (dy: number) => ({ getBlock: (_x: number, y: number, _z: number) => (y === 64 + dy ? B.STONE : 0) });
    expect(mountBlocker(roofAt(2), 0.5, 64, 0.5, false)).toBe('indoors');
    expect(mountBlocker(roofAt(MOUNT_ROOF), 0.5, 64, 0.5, false)).toBe('indoors');
    expect(mountBlocker(roofAt(MOUNT_ROOF + 4), 0.5, 64, 0.5, false)).toBeNull();
  });

  it('is not shut in by the leaves of a tree', () => {
    const canopy = { getBlock: (_x: number, y: number, _z: number) => (y === 68 ? B.LEAVES : 0) };
    expect(mountBlocker(canopy, 0, 64, 0, false)).toBeNull();
  });
});

describe('the mount slot', () => {
  it('takes the horn from the hotbar with a right-click, and the key summons that mount', () => {
    const { s } = make();
    expect(s.slotMount).toBeNull();
    s.inventory.set(0, makeStack(mountItemId('fenrir'), 1));
    s.apply({ t: 'select', slot: 0 });
    s.drainEvents();
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.slotMount).toBe('fenrir');
    expect(s.mountSlot.get(0)?.id).toBe(mountItemId('fenrir'));
    expect(s.inventory.get(0)).toBeNull();
    expect(toasts(s).join(' ')).toContain('mount slot');
  });

  it('takes the horn from the bags with a right-click, and gives back the horn that was there', () => {
    const { s } = make();
    equip(s, 'fenrir');
    s.inventory.set(15, makeStack(mountItemId('fenrir_black'), 1));
    s.apply({ t: 'inventory' });
    const at = s.menu!.slots.findIndex((x) => x.container === s.inventory && x.index === 15 && x.kind === 'normal');
    s.apply({ t: 'click', slot: at, button: 1 });
    expect(s.slotMount).toBe('fenrir_black');
    expect(s.inventory.get(15)?.id).toBe(mountItemId('fenrir'));
    expect(s.menu!.cursor).toBeNull();
  });

  it('is a slot of the inventory window that takes mount horns and nothing else', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(mountItemId('fenrir_gold'), 1));
    s.inventory.set(1, makeStack(I.BREAD, 1));
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    expect(menu.mountSlot).toBe(menu.offhandSlot + 1);
    const at = (i: number) => menu.slots.findIndex((x) => x.container === s.inventory && x.index === i && x.kind === 'normal');
    s.apply({ t: 'click', slot: at(1), button: 0 });
    s.apply({ t: 'click', slot: menu.mountSlot, button: 0 });
    expect(s.mountSlot.get(0)).toBeNull();
    s.apply({ t: 'click', slot: at(1), button: 0 });
    s.apply({ t: 'click', slot: at(0), button: 0 });
    s.apply({ t: 'click', slot: menu.mountSlot, button: 0 });
    expect(s.slotMount).toBe('fenrir_gold');
  });

  it('is filled by a shift-click on a horn', () => {
    const { s } = make();
    s.inventory.set(20, makeStack(mountItemId('fenrir_blue'), 1));
    s.apply({ t: 'inventory' });
    const at = s.menu!.slots.findIndex((x) => x.container === s.inventory && x.index === 20 && x.kind === 'normal');
    s.apply({ t: 'shift', slot: at });
    expect(s.slotMount).toBe('fenrir_blue');
  });

  it('cannot be changed from the saddle', () => {
    const { s } = make();
    equip(s, 'fenrir');
    s.apply({ t: 'mount' });
    seconds(s, MOUNT_CAST + 0.3);
    expect(s.mountId).toBe('fenrir');
    s.inventory.set(0, makeStack(mountItemId('fenrir_gold'), 1));
    s.apply({ t: 'select', slot: 0 });
    seconds(s, 0.3, { right: true });
    expect(s.slotMount).toBe('fenrir');
  });

  it('keeps its horn when the horn is used: the horn stays yours, in the slot', () => {
    const { s } = make('creative');
    equip(s);
    expect(s.slotMount).toBe('fenrir');
    expect(s.mountSlot.get(0)?.count).toBe(1);
  });
});
describe('summoning a mount', () => {
  it('needs a mount to summon, and says where to get one', () => {
    const { s } = make();
    s.apply({ t: 'mount' });
    expect(toasts(s).join(' ')).toContain('Fenna Longbow');
    expect(s.mountId).toBeNull();
  });

  it('is a cast: the bar fills for the cast time, then you are on the mount, and everyone near sees both', () => {
    const { s } = make();
    equip(s);
    s.drainEvents();
    s.apply({ t: 'mount' });
    expect(s.mountId).toBeNull();
    seconds(s, MOUNT_CAST / 2);
    expect(s.mountId).toBeNull();
    expect(s.hudProgress).toBeGreaterThan(0.3);
    expect(s.hudProgress).toBeLessThan(0.8);
    seconds(s, MOUNT_CAST / 2 + 0.2);
    expect(s.mountId).toBe('fenrir');
    expect(s.hudProgress).toBe(0);
    const ev = mountEvents(s.drainEvents());
    expect(ev).toEqual(['start:fenrir', 'on:fenrir']);
  });

  it('is lost when you move', () => {
    const { s } = make();
    equip(s);
    s.apply({ t: 'mount' });
    seconds(s, 0.5);
    seconds(s, 1, { forward: 1 });
    expect(s.mountId).toBeNull();
    seconds(s, 2);
    expect(s.mountId).toBeNull();
    expect(toasts(s).join(' ')).toContain('you moved');
  });

  it('is refused while you move or jump, and works once you stand still', () => {
    const { s } = make();
    equip(s);
    seconds(s, 0.5, { forward: 1 });
    s.drainEvents();
    s.apply({ t: 'mount' });
    expect(toasts(s).join(' ')).toContain('stand still');
    seconds(s, 2);
    expect(s.mountId).toBeNull();
    // in the air
    s.tick(idle({ jump: true }));
    s.tick(idle({ jump: true }));
    expect(s.body.onGround).toBe(false);
    s.drainEvents();
    s.apply({ t: 'mount' });
    expect(toasts(s).join(' ')).toContain('stand still');
    // standing again
    seconds(s, 1.5);
    s.apply({ t: 'mount' });
    seconds(s, MOUNT_CAST + 0.3);
    expect(s.mountId).toBe('fenrir');
  });

  it('is lost when you jump', () => {
    const { s } = make();
    equip(s);
    s.apply({ t: 'mount' });
    seconds(s, 0.5);
    s.tick(idle({ jump: true }));
    seconds(s, 2);
    expect(s.mountId).toBeNull();
  });

  it('is lost when you are hurt', () => {
    const { s } = make();
    equip(s);
    s.apply({ t: 'mount' });
    seconds(s, 0.5);
    s.vitals.damage(2, 'generic');
    seconds(s, 0.2);
    seconds(s, 2);
    expect(s.mountId).toBeNull();
    expect(mountEvents(s.drainEvents())).toContain('stop:fenrir');
  });

  it('is cancelled by pressing the key again', () => {
    const { s } = make();
    equip(s);
    s.apply({ t: 'mount' });
    seconds(s, 0.5);
    s.apply({ t: 'mount' });
    seconds(s, 2);
    expect(s.mountId).toBeNull();
  });

  it('is refused indoors, and in the water', () => {
    const { s, world } = make();
    equip(s);
    world.setBlock(CX, FLOOR + 4, CZ, B.STONE);
    s.drainEvents();
    s.apply({ t: 'mount' });
    expect(toasts(s).join(' ')).toContain('roof');
    seconds(s, 2);
    expect(s.mountId).toBeNull();
    world.setBlock(CX, FLOOR + 4, CZ, B.AIR);
    world.setBlock(CX, FLOOR + 1, CZ, B.WATER);
    seconds(s, 0.3);
    s.drainEvents();
    s.apply({ t: 'mount' });
    expect(toasts(s).join(' ')).toContain('water');
  });

  it('is refused with the slot empty, and says where to get a horn', () => {
    const { s } = make();
    equip(s, 'fenrir');
    s.mountSlot.set(0, null);
    s.drainEvents();
    s.apply({ t: 'mount' });
    expect(toasts(s).join(' ')).toContain('slot is empty');
    expect(s.mountId).toBeNull();
  });

  it('is refused for a horn the level is too low for', () => {
    const { s } = make('survival', 'warrior');
    equip(s, 'fenrir_gold');
    s.drainEvents();
    s.apply({ t: 'mount' });
    expect(toasts(s).join(' ')).toContain('needs level 20');
    seconds(s, 2);
    expect(s.mountId).toBeNull();
  });

  it('summons the mount of the horn in the slot, whichever it is', () => {
    const { s } = make('creative');
    equip(s, 'fenrir');
    equip(s, 'fenrir_gold');
    s.apply({ t: 'mount' });
    seconds(s, MOUNT_CAST + 0.3);
    expect(s.mountId).toBe('fenrir_gold');
  });
  it('is not something the dead can do', () => {
    const { s } = make();
    equip(s);
    s.vitals.dead = true;
    s.apply({ t: 'mount' });
    expect(s.mountId).toBeNull();
  });
});

describe('riding', () => {
  function mounted(id: (typeof MOUNTS)[number]['id'] = 'fenrir') {
    const g = make();
    equip(g.s, id);
    g.s.apply({ t: 'mount' });
    seconds(g.s, MOUNT_CAST + 0.3);
    expect(g.s.mountId).toBe(id);
    g.s.drainEvents();
    return g;
  }

  /** How far a player runs on the flat in `n` seconds with these keys down. */
  function distance(s: GameSession, n: number, over: Partial<InputFrame>): number {
    const x0 = s.body.x;
    const z0 = s.body.z;
    seconds(s, 0.5, over); // up to speed
    const x1 = s.body.x;
    const z1 = s.body.z;
    seconds(s, n, over);
    return Math.hypot(s.body.x - x1, s.body.z - z1) + 0 * (x0 + z0);
  }

  it('is as fast as the mount says, faster than walking, and faster than sprinting', () => {
    const foot = make();
    const walk = distance(foot.s, 2, { forward: 1 });
    const sprint = distance(foot.s, 2, { forward: 1, sprint: true });
    for (const m of MOUNTS) {
      const g = mounted(m.id);
      g.s.teleport(CX + 0.5, FLOOR + 1, CZ + 20.5, 0, 0);
      const ride = distance(g.s, 2, { forward: 1 });
      expect(ride / walk).toBeGreaterThan(m.speed - 0.05);
      expect(ride / walk).toBeLessThan(m.speed + 0.05);
      expect(ride).toBeGreaterThan(sprint);
    }
  });

  it('does not tire the rider: sprinting is not a thing on a mount, and running costs no hunger', () => {
    const { s } = mounted();
    s.vitals.hunger = 20;
    const walk = distance(s, 2, { forward: 1 });
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 20.5, 0, 0);
    s.vitals.hunger = 20;
    s.vitals.saturation = 0;
    const withSprint = distance(s, 2, { forward: 1, sprint: true });
    expect(withSprint).toBeCloseTo(walk, 0);
    expect(s.vitals.hunger).toBe(20);
  });

  it('keeps the rider from sneaking, and lifts the eyes', () => {
    const { s } = mounted();
    seconds(s, 0.3, { sneak: true });
    expect(s.eye().y - s.body.y).toBeCloseTo(MOUNTED_EYE, 5);
    expect(MOUNTED_EYE).toBeCloseTo(PLAYER_EYE + MOUNT_EYE_LIFT, 10);
  });

  it('shows in the player view', () => {
    const { s } = mounted('fenrir_blue');
    expect(s.mountView()).toEqual({ mount: 3, pick: 3, cd: [0, 0] });
    s.leaveMount();
    expect(s.mountView().mount).toBe(0);
  });

  it('ends with the key, and the others see the mount go', () => {
    const { s } = mounted();
    s.apply({ t: 'mount' });
    expect(s.mountId).toBeNull();
    expect(mountEvents(s.drainEvents())).toEqual(['off:fenrir']);
    s.apply({ t: 'mount' });
    seconds(s, MOUNT_CAST + 0.3);
    expect(s.mountId).toBe('fenrir');
  });

  it('ends when you attack something: a swing at a mob puts you on your feet', () => {
    const { s } = mounted();
    const id = s.spawnMob('pig', CX + 0.5, FLOOR + 1, CZ - 2.5);
    const pig = s.mobs.mobs.find((m) => m.id === id)!;
    s.attackMob(pig);
    expect(s.mountId).toBeNull();
  });

  it('ends in deep water', () => {
    const { s, world } = mounted();
    for (let y = FLOOR + 1; y <= FLOOR + 3; y++) world.setBlock(CX, y, CZ, B.WATER);
    seconds(s, 1);
    expect(s.mountId).toBeNull();
    expect(toasts(s).join(' ')).toContain('water is too deep');
  });

  /** A tunnel along -z from just ahead of the player: walls on both sides, a roof over it, `len` blocks long (the player stands at x = CX, z = CZ). */
  function tunnel(world: { setBlock(x: number, y: number, z: number, id: number): void }, len: number): void {
    for (let z = CZ - 1; z >= CZ - len; z--) {
      for (let y = 1; y <= 4; y++) {
        world.setBlock(CX - 1, FLOOR + y, z, B.STONE);
        world.setBlock(CX + 1, FLOOR + y, z, B.STONE);
      }
      for (let x = CX - 1; x <= CX + 1; x++) world.setBlock(x, FLOOR + 5, z, B.STONE);
    }
  }

  it('ends when you are inside: a roof over the whole room, as in a house, a cellar or a cave', () => {
    const { s, world } = mounted();
    seconds(s, 0.5);
    expect(s.mountId).toBe('fenrir');
    for (let x = CX - 4; x <= CX + 4; x++) for (let z = CZ - 4; z <= CZ + 4; z++) world.setBlock(x, FLOOR + 4, z, B.STONE);
    seconds(s, 0.5);
    expect(s.mountId).toBe('fenrir'); // not at once: a moment of grace
    seconds(s, 1.5);
    expect(s.mountId).toBeNull();
    expect(toasts(s).join(' ')).toContain('indoors');
  });

  it('is not ended by a roof that is only over the one spot: a bridge, a ledge, a trunk, the eaves of a house', () => {
    const { s, world } = mounted();
    world.setBlock(CX, FLOOR + 4, CZ, B.STONE);
    seconds(s, 3);
    expect(s.mountId).toBe('fenrir');
  });

  it('rides through a gate: a short roofed passage with the road open at both ends does not put you off', () => {
    const { s, world } = mounted();
    tunnel(world, 3);
    for (let i = 0; i < 80; i++) s.tick(idle({ forward: 1 }));
    expect(s.body.z).toBeLessThan(CZ - 4); // through it and out the other side
    expect(s.mountId).toBe('fenrir');
  });

  it('ends in a long tunnel: a cave, riding on under the roof for more than a moment', () => {
    const { s, world } = mounted();
    tunnel(world, 30);
    for (let i = 0; i < 100; i++) s.tick(idle({ forward: 1 }));
    expect(s.mountId).toBeNull();
    expect(toasts(s).join(' ')).toContain('indoors');
  });

  /** A wall across the way, ahead of the player (who faces -z), `high` blocks tall. */
  function wall(world: { setBlock(x: number, y: number, z: number, id: number): void }, high: number, id: number = B.STONE): void {
    for (let x = CX - 3; x <= CX + 3; x++) for (let y = 1; y <= high; y++) world.setBlock(x, FLOOR + y, CZ - 3, id);
  }

  it('walks up a block without a jump, where a person on foot is stopped', () => {
    const foot = make();
    wall(foot.world, 1);
    seconds(foot.s, 3, { forward: 1 });
    expect(foot.s.body.z).toBeGreaterThan(CZ - 2);
    const { s, world } = mounted();
    wall(world, 1);
    let top = 0;
    for (let i = 0; i < 60; i++) {
      s.tick(idle({ forward: 1 }));
      top = Math.max(top, s.body.y);
    }
    expect(s.mountId).toBe('fenrir');
    expect(s.body.z).toBeLessThan(CZ - 4); // over it and on
    expect(top).toBeCloseTo(FLOOR + 2, 1); // up on the block, in a step
    expect(top - (FLOOR + 1)).toBeLessThan(1.1); // never a leap
  });

  it('is still stopped by a wall two blocks high, and by a fence', () => {
    const tall = mounted();
    wall(tall.world, 2);
    seconds(tall.s, 3, { forward: 1 });
    expect(tall.s.body.z).toBeGreaterThan(CZ - 2);
    const fence = mounted();
    wall(fence.world, 1, B.FENCE);
    seconds(fence.s, 3, { forward: 1 });
    expect(fence.s.body.z).toBeGreaterThan(CZ - 3); // the posts are thin: it stops at them
  });

  it('ends at death', () => {
    const { s } = mounted();
    s.vitals.damage(100, 'generic');
    seconds(s, 0.5);
    expect(s.mountId).toBeNull();
  });

  it('ends when a creative player takes off, and cannot be summoned in the air', () => {
    const { s } = make('creative');
    equip(s);
    s.apply({ t: 'mount' });
    seconds(s, MOUNT_CAST + 0.3);
    expect(s.mountId).toBe('fenrir');
    s.apply({ t: 'fly' });
    seconds(s, 0.2);
    expect(s.mountId).toBeNull();
    s.drainEvents();
    s.apply({ t: 'mount' });
    expect(toasts(s).join(' ')).toContain('while flying');
  });
});

describe('remembering the mount slot', () => {
  it('saves the horn in it, and never saves you on the mount', () => {
    const { s } = make('creative');
    equip(s, 'fenrir_gold');
    s.apply({ t: 'mount' });
    seconds(s, MOUNT_CAST + 0.3);
    expect(s.mountId).toBe('fenrir_gold');
    const saved = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(saved.mountSlot).toBeDefined();
    const again = make('creative').s;
    again.loadPlayer(saved);
    expect(again.slotMount).toBe('fenrir_gold');
    expect(again.mountId).toBeNull();
  });

  it('leaves the save as it was for a character that has none', () => {
    const { s } = make();
    expect('mountSlot' in s.savePlayer()).toBe(false);
  });

  it('drops anything in the slot of a save that is not a horn', () => {
    const { s } = make();
    const raw = { ...JSON.parse(JSON.stringify(s.savePlayer())), mountSlot: [{ id: I.BREAD, count: 5, damage: 0 }] };
    const again = make().s;
    again.loadPlayer(parsePlayerSave(raw)!);
    expect(again.slotMount).toBeNull();
    expect(again.mountSlot.get(0)).toBeNull();
  });
});
describe('the mount command', () => {
  it('is just the key: it carries nothing, so nothing can choose the mount through it', () => {
    expect(parseSessionMessage({ t: 'mount' })).toEqual({ t: 'mount' });
    expect(parseSessionMessage({ t: 'mount', id: 'fenrir_gold' })).toEqual({ t: 'mount' });
    expect(parseSessionMessage({ t: 'mountPick', id: 'fenrir_gold' })).toBeNull();
  });
  it('knows its mounts by name', () => {
    expect(mountDef('fenrir_black')?.name).toBe('Black Fenrir');
    expect(mountDef('nope')).toBeNull();
    expect(mountDef(null)).toBeNull();
  });
});

describe('the skills of a mount', () => {
  function mounted(id: (typeof MOUNTS)[number]['id'] = 'fenrir') {
    const g = make();
    equip(g.s, id);
    g.s.apply({ t: 'mount' });
    seconds(g.s, MOUNT_CAST + 0.3);
    expect(g.s.mountId).toBe(id);
    g.s.drainEvents();
    return g;
  }
  const mobAt = (s: GameSession, kind: 'pig' | 'cow', dx: number, dz: number) => {
    const id = s.spawnMob(kind, CX + 0.5 + dx, FLOOR + 1, CZ + 0.5 + dz);
    return s.mobs.mobs.find((m) => m.id === id)!;
  };

  it('are the left button, a bite that hurts what is in front of the mount and nothing behind it', () => {
    const { s } = mounted();
    const front = mobAt(s, 'cow', 0, -3);
    const behind = mobAt(s, 'cow', 0, 3);
    const far = mobAt(s, 'cow', 0, -MOUNT_BITE.range - 4);
    const hp = front.health;
    s.tick(idle({ left: true }));
    expect(front.health).toBeLessThan(hp);
    expect(behind.health).toBe(behind.maxHealth);
    expect(far.health).toBe(far.maxHealth);
    expect(mountEvents(s.drainEvents())).toContain('bite:fenrir');
  });

  it('wait for their cooldown, and a held button bites again as soon as it is over', () => {
    const { s } = mounted();
    const cow = mobAt(s, 'cow', 0, -3);
    s.tick(idle({ left: true }));
    const once = cow.health;
    seconds(s, MOUNT_BITE.cooldown * 0.5, { left: true });
    expect(cow.health).toBe(once);
    expect(s.mountView().cd[0]).toBeGreaterThan(0);
    seconds(s, MOUNT_BITE.cooldown, { left: true });
    expect(cow.health).toBeLessThan(once);
  });

  it('hurt more from a better mount', () => {
    const dealt = (id: (typeof MOUNTS)[number]['id']): number => {
      const { s } = mounted(id);
      const cow = mobAt(s, 'cow', 0, -3);
      const hp = cow.health;
      s.tick(idle({ left: true }));
      return hp - cow.health;
    };
    expect(dealt('fenrir_gold')).toBeGreaterThan(dealt('fenrir'));
    expect(dealt('fenrir_blue')).toBeGreaterThan(dealt('fenrir'));
  });

  it('howl up a storm with the right button: the ground the crosshair is on is marked, then struck again and again', () => {
    const { s } = mounted();
    const cow = mobAt(s, 'cow', 0, -12);
    const next = mobAt(s, 'cow', 2, -12);
    const away = mobAt(s, 'cow', 0, -12 - MOUNT_HOWL.radius - 4);
    seconds(s, 0.1, { right: true, pitch: -0.3 });
    expect(mountEvents(s.drainEvents())).toContain('howl:fenrir');
    // The ground is marked at once and nothing is hurt yet.
    const warn = s.fx.find((f) => f.k === 'thunder_warn');
    expect(warn?.mount).toBe('fenrir');
    expect(warn?.r).toBe(MOUNT_HOWL.radius);
    expect(cow.health).toBe(cow.maxHealth);
    // The first strike lands after the delay; the others follow at their interval, each leaving its own mark.
    const strikes = new Set<number>();
    const hurt: number[] = [];
    for (let i = 0; i < Math.round((MOUNT_HOWL.delay + MOUNT_HOWL.interval * MOUNT_HOWL.strikes + 0.3) * 20); i++) {
      s.tick(idle({ pitch: -0.3 }));
      for (const f of s.fx) if (f.k === 'thunder_hit' && f.mount === 'fenrir') strikes.add(f.id);
      hurt.push(cow.health);
    }
    expect(strikes.size).toBe(MOUNT_HOWL.strikes);
    expect(cow.health).toBeLessThan(cow.maxHealth);
    expect(next.health).toBeLessThan(next.maxHealth);
    // ... it was hurt more than once (the health fell at more than one moment), and what was out of reach was not touched.
    expect(new Set(hurt).size).toBeGreaterThan(2);
    expect(away.health).toBe(away.maxHealth);
    expect(s.mountView().cd[1]).toBeGreaterThan(0);
    expect(MOUNT_HOWL.cooldown).toBeGreaterThan(MOUNT_BITE.cooldown);
  });

  it('call the storm a few blocks ahead when the crosshair is at its own feet, never on the saddle', () => {
    const { s } = mounted();
    seconds(s, 0.1, { right: true, pitch: -1.4 });
    const warn = s.fx.find((f) => f.k === 'thunder_warn')!;
    expect(Math.hypot(warn.x - s.body.x, warn.z - s.body.z)).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('leave the mark of the bite: a line the length of its reach, in the mount’s colour', () => {
    const { s } = mounted('fenrir_gold');
    s.tick(idle({ left: true }));
    const fang = s.fx.find((f) => f.k === 'fang')!;
    expect(fang.mount).toBe('fenrir_gold');
    expect(Math.hypot((fang.x2 ?? 0) - fang.x, (fang.z2 ?? 0) - fang.z)).toBeCloseTo(MOUNT_BITE.range, 4);
  });

  it('are fired from the model’s own mouth: where the nose is comes from the neck and the head of the Fenrir', () => {
    // Raise the head and the mouth goes up and pulls back; the lowered one is nearer the ground. (fenrir.test.ts checks it against the built model.)
    const rest = mountMouthAt();
    const raised = mountMouthAt(0.4, 0.45);
    expect(raised.up).toBeGreaterThan(rest.up);
    expect(raised.ahead).toBeLessThan(rest.ahead);
    expect(MOUNT_MOUTH).toEqual(rest);
    // It is below the rider's eyes (the beast's head is in front of and under them).
    expect(rest.up).toBeLessThan(MOUNTED_EYE);
  });

  it('are all there is: no mining, placing or abilities from the saddle', () => {
    const { s, world } = mounted();
    world.setBlock(CX, FLOOR + 1, CZ - 2, B.DIRT);
    s.inventory.set(0, makeStack(B.STONE, 5));
    s.apply({ t: 'select', slot: 0 });
    s.tick(idle({ pitch: -0.35 }));
    const before = world.getBlock(CX, FLOOR + 1, CZ - 2);
    seconds(s, 3, { left: true, pitch: -0.35 });
    expect(world.getBlock(CX, FLOOR + 1, CZ - 2)).toBe(before);
    seconds(s, 1, { right: true, pitch: -0.35 });
    expect(s.inventory.get(0)?.count).toBe(5);
    expect(s.mountId).toBe('fenrir');
  });

  it('are not the rider’s class abilities: those are refused, and the rider stays on the mount', () => {
    const g = make('survival', 'warrior');
    g.s.cls!.level = 12;
    equip(g.s);
    g.s.apply({ t: 'mount' });
    seconds(g.s, MOUNT_CAST + 0.3);
    g.s.drainEvents();
    g.s.apply({ t: 'ability', slot: 0 });
    expect(g.s.mountId).toBe('fenrir');
    expect(toasts(g.s).join(' ')).toContain('skills');
  });
});
