import { describe, expect, it } from 'vitest';
import { B, BONE_MEAL, GameSession, HeadlessWorld, I, WorldGenerator, allItems, getItem, mulberry32, type InputFrame, type ItemUse } from './index';

/**
 * The use button, pressed with each kind of item in the hand. What an item does is written in the item table (`ItemDef.use`)
 * and the player asks the table; this holds the button down in a small stone room and looks at what came of it.
 */

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;
const R = 6;
/** Poured water runs farther than the room: this much around it is put back before every press. */
const SPILL = R + 8;

const frame = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

interface Scene {
  /** Where the player looks: yaw 0 faces -z (where `build` puts things), a negative pitch is down. */
  pitch: number;
  build?: (w: HeadlessWorld) => void;
  /** Carried besides the item in the hand. */
  with?: [id: number, count: number][];
  /** A shield in the off hand. */
  shield?: boolean;
  classId?: 'warrior' | 'mage' | 'ranger';
  /** The room is a protected place (a village, a castle), where nothing may be changed. */
  locked?: boolean;
  /** How long the button is held, in twentieths of a second (a second and a half when not said). */
  hold?: number;
}

/** What came of holding the use button and letting it go. */
interface Outcome {
  s: GameSession;
  count: (id: number) => number;
  events: Set<string>;
  /** The farthest the bow was drawn, and the fullest the bar by the crosshair got. */
  bow: number;
  hud: number;
  /** The shield went up at some point. */
  blocked: boolean;
  /** The blocks of the room that are not what they were. */
  changed: { x: number; y: number; z: number; id: number }[];
}

// One world for the whole file (making one takes a third of a second); the room is put back for every press and the player is new.
const generator = new WorldGenerator(SEED);
const world = new HeadlessWorld(generator);

function each(r: number, fn: (x: number, y: number, z: number) => void): void {
  for (let x = CX - r; x <= CX + r; x++) for (let z = CZ - r; z <= CZ + r; z++) for (let y = FLOOR; y < FLOOR + 8; y++) fn(x, y, z);
}

function press(id: number, scene: Scene): Outcome {
  each(SPILL, (x, y, z) => world.setBlock(x, y, z, y === FLOOR ? B.STONE : B.AIR));
  scene.build?.(world);
  const before: number[] = [];
  each(R, (x, y, z) => before.push(world.getBlock(x, y, z)));
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), classId: scene.classId ?? null });
  s.finishLoading();
  if (scene.locked) s.realm.isProtected = () => true;
  s.clearInventory();
  s.offhand.set(0, scene.shield ? { id: I.SHIELD, count: 1, damage: 0 } : null);
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, scene.pitch);
  s.giveItem(id, getItem(id).maxStack > 1 ? 3 : 1);
  for (const [extra, n] of scene.with ?? []) s.giveItem(extra, n);
  s.selectSlot(0);
  s.drainEvents();
  const out: Outcome = { s, count: (i) => s.inventory.countOf(i), events: new Set(), bow: 0, hud: 0, blocked: false, changed: [] };
  const step = (right: boolean) => {
    s.tick(frame({ pitch: scene.pitch, right }));
    for (const e of s.drainEvents()) out.events.add(e.t);
    out.bow = Math.max(out.bow, s.bowDraw);
    out.hud = Math.max(out.hud, s.hudProgress);
    out.blocked ||= s.blocking;
  };
  step(false);
  for (let i = 0; i < (scene.hold ?? 30); i++) step(true);
  for (let i = 0; i < 4; i++) step(false);
  let n = 0;
  each(R, (x, y, z) => {
    const now = world.getBlock(x, y, z);
    if (now !== before[n++]) out.changed.push({ x, y, z, id: now });
  });
  return out;
}

/** A block two steps in front of the player, standing on the floor (or on `under`). */
const ahead = (id: number, under?: number) => (w: HeadlessWorld) => {
  if (under !== undefined) w.setBlock(CX, FLOOR, CZ - 2, under);
  w.setBlock(CX, FLOOR + 1, CZ - 2, id);
};
const UP: Scene = { pitch: 0.6 };
const AT_FLOOR: Scene = { pitch: -0.9 };
const AT_BLOCK = (id: number, under?: number): Scene => ({ pitch: -0.45, build: ahead(id, under) });
const first = (use: ItemUse): number => allItems().find((i) => i.use === use)!.id;
const named = (name: string): number => allItems().find((i) => i.name === name)!.id;

describe('the use button, by what the item table says the item does', () => {
  it('a bucket scoops water up and pours it out', () => {
    const scooped = press(I.BUCKET, AT_BLOCK(B.WATER));
    expect(scooped.count(I.WATER_BUCKET)).toBe(1);
    expect(scooped.count(I.BUCKET)).toBe(2);
    expect(scooped.changed).toContainEqual({ x: CX, y: FLOOR + 1, z: CZ - 2, id: B.AIR });
    const poured = press(I.WATER_BUCKET, AT_FLOOR);
    expect(poured.count(I.WATER_BUCKET)).toBe(0);
    expect(poured.count(I.BUCKET)).toBe(1);
    expect(poured.changed.length).toBeGreaterThan(0);
  });

  it('a pearl and a bottle of experience are thrown, one for each press', () => {
    expect(press(I.ENDER_PEARL, UP).count(I.ENDER_PEARL)).toBe(2);
    expect(press(I.EXPERIENCE_BOTTLE, UP).count(I.EXPERIENCE_BOTTLE)).toBe(2);
  });

  it('a boat goes on the water and a minecart on a rail, and nowhere else', () => {
    const boat = press(I.BOAT, AT_BLOCK(B.WATER));
    expect(boat.count(I.BOAT)).toBe(0);
    expect(boat.s.realm.vehicles.list.length).toBe(1);
    const cart = press(I.MINECART, AT_BLOCK(B.RAIL_Z));
    expect(cart.count(I.MINECART)).toBe(0);
    expect(cart.s.realm.vehicles.list.length).toBe(1);
    expect(press(I.MINECART, AT_FLOOR).count(I.MINECART)).toBe(1);
  });

  it('the emberstone begins to take you home while the button is held', () => {
    const o = press(I.EMBERSTONE, UP);
    expect(o.events.has('ember')).toBe(true);
    expect(o.hud).toBeGreaterThan(0);
    expect(o.count(I.EMBERSTONE)).toBe(1);
  });

  it('a bow and a crossbow are drawn, and let an arrow go', () => {
    for (const id of [I.BOW, I.CROSSBOW]) {
      const o = press(id, { ...UP, with: [[I.ARROW, 8]] });
      expect(o.bow, getItem(id).name).toBe(1);
      expect(o.count(I.ARROW), getItem(id).name).toBe(7);
    }
    expect(press(I.BOW, UP).bow).toBe(0);
  });

  it('a bow shoots from a short pull too, a crossbow only once it is wound all the way', () => {
    const tap: Scene = { ...UP, with: [[I.ARROW, 8]], hold: 6 };
    const bow = press(I.BOW, tap);
    expect(bow.bow).toBeGreaterThan(0.15);
    expect(bow.bow).toBeLessThan(1);
    expect(bow.count(I.ARROW)).toBe(7);
    const crossbow = press(I.CROSSBOW, tap);
    expect(crossbow.bow).toBeGreaterThan(0);
    expect(crossbow.bow).toBeLessThan(1);
    expect(crossbow.count(I.ARROW)).toBe(8);
  });

  it('a skill book teaches the class it is written for, and stays in the hand of another', () => {
    const book = named('skill_book_fireball');
    const mage = press(book, { ...UP, classId: 'mage' });
    expect(mage.events.has('learned')).toBe(true);
    expect(mage.count(book)).toBe(0);
    const warrior = press(book, { ...UP, classId: 'warrior' });
    expect(warrior.events.has('learned')).toBe(false);
    expect(warrior.count(book)).toBe(1);
  });

  it('a horn goes in the mount slot', () => {
    const horn = first('horn');
    const o = press(horn, UP);
    expect(o.count(horn)).toBe(0);
    expect(o.s.mountSlot.get(0)?.id).toBe(horn);
  });

  it('flint and steel lights a fire, bone meal grows a sapling, and a bed and a door are put down', () => {
    const fire = press(I.FLINT_AND_STEEL, AT_FLOOR);
    expect(fire.changed.map((c) => c.id)).toEqual([B.FIRE]);
    expect(fire.events.has('fire')).toBe(true);

    const grown = press(BONE_MEAL, AT_BLOCK(B.SAPLING, B.DIRT));
    expect(grown.count(BONE_MEAL)).toBeLessThan(3);
    expect(grown.changed.length).toBeGreaterThan(0);
    expect(press(BONE_MEAL, AT_FLOOR).count(BONE_MEAL)).toBe(3);

    const bed = press(first('bed'), AT_FLOOR);
    expect(bed.count(first('bed'))).toBe(0);
    expect(bed.changed.length).toBe(2);

    const door = press(I.DOOR, AT_FLOOR);
    expect(door.count(I.DOOR)).toBe(2);
    expect(door.changed.length).toBe(2);
  });

  it('a block is placed and a hoe tills, on the block the crosshair is on', () => {
    const stone = press(B.STONE, AT_FLOOR);
    expect(stone.count(B.STONE)).toBe(2);
    expect(stone.changed.map((c) => c.id)).toEqual([B.STONE]);
    expect(press(B.STONE, UP).count(B.STONE)).toBe(3);
    const tilled = press(named('wood_hoe'), { pitch: -0.9, build: (w) => w.setBlock(CX, FLOOR, CZ - 1, B.GRASS) });
    expect(tilled.changed.map((c) => c.id)).toContain(B.FARMLAND);
  });

  it('in a protected place nothing is put down or lit, but bone meal still works on what grows there', () => {
    for (const id of [B.STONE, I.DOOR, I.FLINT_AND_STEEL, first('bed')]) {
      const o = press(id, { ...AT_FLOOR, locked: true });
      expect(o.changed, getItem(id).name).toEqual([]);
      expect(o.events.has('toast'), getItem(id).name).toBe(true);
    }
    const grown = press(BONE_MEAL, { ...AT_BLOCK(B.SAPLING, B.DIRT), locked: true });
    expect(grown.count(BONE_MEAL)).toBeLessThan(3);
    expect(grown.events.has('toast')).toBe(false);
  });

  it('an item that has no use of its own does nothing', () => {
    for (const scene of [UP, AT_FLOOR]) {
      const o = press(I.STICK, scene);
      expect(o.count(I.STICK)).toBe(3);
      expect(o.changed).toEqual([]);
      expect([...o.events]).toEqual([]);
    }
  });

  describe('with a shield in the other hand', () => {
    const raised = (id: number, scene: Scene, extra: [number, number][] = []) => press(id, { ...scene, shield: true, with: extra }).blocked;

    it('the button raises the shield when the hand holds nothing that wants it', () => {
      expect(raised(I.STICK, UP)).toBe(true);
      expect(raised(I.STICK, AT_FLOOR)).toBe(true);
      // Nothing under the crosshair to use these on.
      expect(raised(B.STONE, UP)).toBe(true);
      expect(raised(I.BOAT, UP)).toBe(true);
      // A bow with nothing to shoot.
      expect(raised(I.BOW, UP)).toBe(true);
    });

    it('and the item in the hand keeps the button when it has a use for it', () => {
      for (const id of [I.BUCKET, I.ENDER_PEARL, I.EXPERIENCE_BOTTLE, I.EMBERSTONE, first('skill_book')]) expect(raised(id, UP), getItem(id).name).toBe(false);
      expect(raised(I.BOW, UP, [[I.ARROW, 8]])).toBe(false);
      for (const id of [B.STONE, I.DOOR, I.FLINT_AND_STEEL, BONE_MEAL]) expect(raised(id, AT_FLOOR), getItem(id).name).toBe(false);
    });

    it('a crossbow is drawn and the shield comes up with it (as it always has)', () => {
      const o = press(I.CROSSBOW, { ...UP, shield: true, with: [[I.ARROW, 8]] });
      expect(o.bow).toBe(1);
      expect(o.blocked).toBe(true);
    });
  });
});
