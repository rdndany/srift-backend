import { describe, expect, it } from 'vitest';
import {
  B,
  Container,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  SHIELD_DURABILITY,
  PARRY_WINDOW,
  SHIELD_RAISE,
  WorldGenerator,
  armorId,
  findRecipe,
  getItem,
  makeStack,
  mulberry32,
  parsePlayerSave,
  parseSessionMessage,
  recipeCategory,
  toolId,
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

/** A flat stone floor; the player stands at the middle looking toward -z (yaw 0). */
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

/** Hold the shield up long enough for it to work and for the parry window to be over (a plain block). */
const raise = (s: GameSession, frames = Math.ceil((SHIELD_RAISE + PARRY_WINDOW) * 20) + 1) => {
  for (let i = 0; i < frames; i++) s.tick(idle({ right: true }));
};

// An attacker stands at -z (in front), so a melee hit pushes the player toward +z.
const FRONT = [0, 1] as const;
const BEHIND = [0, -1] as const;

describe('the shield item', () => {
  it('is a single non-stacking item with 336 durability', () => {
    const item = getItem(I.SHIELD);
    expect(item.name).toBe('shield');
    expect(item.shield).toBe(true);
    expect(item.maxStack).toBe(1);
    expect(item.durability).toBe(SHIELD_DURABILITY);
    expect(SHIELD_DURABILITY).toBe(336);
    expect(getItem(toolId('sword', 'iron')).shield).toBe(false);
  });

  it('is made of six planks and an iron ingot', () => {
    const P = makeStack(B.PLANKS);
    const N = makeStack(I.IRON_INGOT);
    const recipe = findRecipe([P, N, P, P, P, P, null, P, null], 3, 3);
    expect(recipe?.result.id).toBe(I.SHIELD);
    expect(findRecipe([P, P, P, P, P, P, null, P, null], 3, 3)).toBeNull();
    expect(recipeCategory(recipe!)).toBe('tools');
  });
});

describe('blocking', () => {
  it('stops a hit from the front once the shield is up, and the shield takes wear', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    expect(s.blocking).toBe(true);
    const events: SessionEvent[] = [];
    s.drainEvents();
    s.hurtByMob(4, ...FRONT, 'zombie');
    events.push(...s.drainEvents());
    expect(s.vitals.health).toBe(20);
    expect(events.some((e) => e.t === 'shield')).toBe(true);
    // A hit of 4 costs 1 + 4 durability.
    expect(s.offhand.get(0)!.damage).toBe(5);
  });

  it('says "block" to its owner for a plain block, and the others hear the plain sound', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    s.drainEvents();
    s.hurtByMob(4, ...FRONT, 'zombie');
    const events = s.drainEvents();
    expect(events).toContainEqual({ t: 'guard', what: 'block' });
    const sound = events.find((e) => e.t === 'shield');
    expect(sound).toBeDefined();
    expect(sound && 'parry' in sound).toBe(false);
  });

  it('parries a hit that lands just as the guard comes up: nothing gets through and the shield takes no wear', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s, Math.ceil(SHIELD_RAISE * 20) + 1); // 0.3 s: just past the delay
    expect(s.blocking).toBe(true);
    s.drainEvents();
    s.hurtByMob(6, ...FRONT, 'zombie');
    const events = s.drainEvents();
    expect(s.vitals.health).toBe(20);
    expect(s.offhand.get(0)!.damage).toBe(0);
    expect(events).toContainEqual({ t: 'guard', what: 'parry' });
    expect(events).toContainEqual({ t: 'shield', vol: 1, parry: true });
  });

  it('parries only a fresh guard: holding it up past the window turns the same hit into a block that wears the shield', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s, Math.ceil(SHIELD_RAISE * 20) + 1);
    s.hurtByMob(4, ...FRONT, 'zombie'); // the parry
    expect(s.offhand.get(0)!.damage).toBe(0);
    raise(s, Math.ceil(PARRY_WINDOW * 20) + 1); // keeps holding it
    s.drainEvents();
    s.hurtByMob(4, ...FRONT, 'zombie');
    expect(s.drainEvents()).toContainEqual({ t: 'guard', what: 'block' });
    expect(s.offhand.get(0)!.damage).toBe(5);
    // lowering it and raising it again makes a new parry possible
    s.tick(idle());
    raise(s, Math.ceil(SHIELD_RAISE * 20) + 1);
    s.drainEvents();
    s.hurtByMob(4, ...FRONT, 'zombie');
    expect(s.drainEvents()).toContainEqual({ t: 'guard', what: 'parry' });
    expect(s.offhand.get(0)!.damage).toBe(5);
  });

  it('says nothing when the hit is not stopped', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    s.drainEvents();
    s.hurtByMob(4, ...BEHIND, 'zombie');
    expect(s.drainEvents().some((e) => e.t === 'guard')).toBe(false);
  });

  it('does not stop a hit from behind or from the side', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    s.hurtByMob(4, ...BEHIND, 'zombie');
    expect(s.vitals.health).toBe(16);
    expect(s.offhand.get(0)!.damage).toBe(0);
    const { s: t } = make(8);
    t.offhand.set(0, makeStack(I.SHIELD));
    raise(t);
    t.hurtByMob(4, 1, 0, 'zombie'); // from the side: exactly at the edge of the 180 degrees
    expect(t.vitals.health).toBe(16);
  });

  it('only works after the short raise delay', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    s.tick(idle({ right: true })); // 0.05 s: up, but not yet effective
    expect(s.blocking).toBe(true);
    s.hurtByMob(4, ...FRONT, 'zombie');
    expect(s.vitals.health).toBe(16);
  });

  it('is lowered when the button is released', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    s.tick(idle());
    expect(s.blocking).toBe(false);
    s.hurtByMob(4, ...FRONT, 'zombie');
    expect(s.vitals.health).toBe(16);
  });

  it('works from the main hand too, and the hand shield wins over the off hand', () => {
    const { s } = make();
    s.inventory.set(s.selected, makeStack(I.SHIELD));
    raise(s);
    expect(s.blocking).toBe(true);
    s.hurtByMob(5, ...FRONT, 'skeleton');
    expect(s.vitals.health).toBe(20);
    expect(s.inventory.get(s.selected)!.damage).toBe(6);
    expect(s.offhand.get(0)).toBeNull();
  });

  it('does not wear for a small hit (under 3), like the original', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    s.hurtByMob(2, ...FRONT, 'skeleton');
    expect(s.vitals.health).toBe(20);
    expect(s.offhand.get(0)!.damage).toBe(0);
  });

  it('stops arrows from the front', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    // An arrow flying toward +z comes from the front.
    s.hurtByMob(3, 0, 1, 'arrow');
    expect(s.vitals.health).toBe(20);
    s.hurtByMob(3, 0, -1, 'arrow');
    expect(s.vitals.health).toBe(17);
  });

  it('stops an explosion in front of you but not one behind, and the blast still pushes', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    const b = s.body;
    s.hurtByExplosion(b.x, b.y + 0.9, b.z - 2, 3, 'creeper'); // two blocks ahead
    expect(s.vitals.health).toBe(20);
    expect(b.vz).toBeGreaterThan(0); // pushed back
    expect(s.offhand.get(0)!.damage).toBeGreaterThan(0);
    b.vx = b.vy = b.vz = 0;
    s.hurtByExplosion(b.x, b.y + 0.9, b.z + 2, 3, 'creeper'); // behind
    expect(s.vitals.health).toBeLessThan(20);
  });

  it('gives no knockback for a blocked melee hit', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    s.body.vx = s.body.vz = 0;
    s.hurtByMob(4, ...FRONT, 'zombie');
    expect(s.body.vz).toBe(0);
  });

  it('breaks when it wears out, with an event, and the player is hurt by the next hit', () => {
    const { s } = make();
    s.offhand.set(0, { id: I.SHIELD, count: 1, damage: SHIELD_DURABILITY - 3 });
    raise(s);
    s.drainEvents();
    s.hurtByMob(5, ...FRONT, 'zombie');
    const ev = s.drainEvents();
    expect(s.offhand.get(0)).toBeNull();
    expect(s.blocking).toBe(false);
    expect(ev.find((e) => e.t === 'shield')).toMatchObject({ broke: true });
    s.hurtByMob(5, ...FRONT, 'zombie');
    expect(s.vitals.health).toBe(15);
  });

  it('keeps armor out of it: a blocked hit leaves the armor unworn', () => {
    const { s } = make();
    s.armor.set(1, makeStack(armorId(1, 'iron')));
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    s.hurtByMob(6, ...FRONT, 'zombie');
    expect(s.armor.get(1)!.damage).toBe(0);
  });

  it('is multiplied up in hardcore, so the shield takes more', () => {
    const { s } = make();
    s.hardcore = true;
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    s.hurtByMob(4, ...FRONT, 'zombie'); // 6 on hard
    expect(s.vitals.health).toBe(20);
    expect(s.offhand.get(0)!.damage).toBe(7);
  });

  it('does not let you sprint while it is up', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    const run = (right: boolean) => {
      s.teleport(CX + 0.5, FLOOR + 1, CZ + 5.5, 0, 0);
      for (let i = 0; i < 20; i++) s.tick(idle({ forward: 1, sprint: true, right }));
      return CZ + 5.5 - s.body.z;
    };
    const blocked = run(true);
    const free = run(false);
    expect(free).toBeGreaterThan(blocked + 0.5);
  });

  it('lets the main hand do its own job first: eating, placing and the bow come before the shield', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    s.inventory.set(s.selected, makeStack(I.BOW));
    s.inventory.set(8, makeStack(I.ARROW, 4));
    s.tick(idle({ right: true }));
    expect(s.blocking).toBe(false);
    // With no arrows the bow has nothing to do, so the shield goes up.
    s.inventory.set(8, null);
    s.tick(idle({ right: true }));
    expect(s.blocking).toBe(true);
    // A block with something to place on: placing wins.
    s.inventory.set(s.selected, makeStack(B.PLANKS));
    s.tick(idle({ right: false }));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, -1.4); // looking down at the floor
    s.tick(idle({ right: true, pitch: -1.4 }));
    expect(s.blocking).toBe(false);
  });

  it('cannot be raised while a menu is open, and opening one lowers it', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    raise(s);
    expect(s.blocking).toBe(true);
    s.openScreen('inventory');
    expect(s.blocking).toBe(false);
  });
});

describe('the off hand', () => {
  it('swaps with the hand, and only takes a shield', () => {
    const { s } = make();
    s.inventory.set(s.selected, makeStack(I.SHIELD));
    s.apply({ t: 'swap' });
    expect(s.offhand.get(0)?.id).toBe(I.SHIELD);
    expect(s.inventory.get(s.selected)).toBeNull();
    s.apply({ t: 'swap' });
    expect(s.offhand.get(0)).toBeNull();
    expect(s.inventory.get(s.selected)?.id).toBe(I.SHIELD);
    // A sword stays in the hand.
    s.apply({ t: 'swap' });
    s.inventory.set(s.selected, makeStack(toolId('sword', 'iron')));
    s.apply({ t: 'swap' });
    expect(s.inventory.get(s.selected)?.id).toBe(toolId('sword', 'iron'));
    expect(s.offhand.get(0)?.id).toBe(I.SHIELD);
  });

  it('keeps the shield worn by wear when swapping', () => {
    const { s } = make();
    s.inventory.set(s.selected, { id: I.SHIELD, count: 1, damage: 100 });
    s.apply({ t: 'swap' });
    expect(s.offhand.get(0)?.damage).toBe(100);
  });

  it('is a slot on the inventory screen that takes only a shield, with shift-click to fill it', () => {
    const inv = new Container(36);
    const armor = new Container(4);
    const off = new Container(1);
    const menu = new CraftingMenu(inv, 2, armor, off);
    expect(menu.offhandSlot).toBe(menu.armorStart + 4);
    expect(menu.slots.length).toBe(36 + 4 + 1 + 4 + 1);
    menu.cursor = makeStack(toolId('sword', 'iron'));
    menu.click(menu.offhandSlot, 0);
    expect(off.get(0)).toBeNull();
    menu.cursor = null;
    inv.set(3, makeStack(I.SHIELD));
    menu.shiftClick(3);
    expect(off.get(0)?.id).toBe(I.SHIELD);
    expect(inv.get(3)).toBeNull();
    expect(new CraftingMenu(inv, 3).offhandSlot).toBe(-1);
  });

  it('stays in your hand when you die, a little worn', () => {
    const { s } = make();
    s.offhand.set(0, makeStack(I.SHIELD));
    s.vitals.damage(100, 'generic');
    s.tick(idle());
    expect(s.screen).toBe('dead');
    expect(s.offhand.get(0)?.id).toBe(I.SHIELD);
    expect(s.offhand.get(0)!.damage).toBeGreaterThan(0);
    expect(s.drops.drops.some((d) => d.stack.id === I.SHIELD)).toBe(false);
  });

  it('is saved and loaded, and a hostile save cannot put anything but a shield in it', () => {
    const { s } = make();
    s.offhand.set(0, { id: I.SHIELD, count: 1, damage: 12 });
    const saved = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    const { s: t } = make(9);
    t.loadPlayer(saved);
    expect(t.offhand.get(0)).toMatchObject({ id: I.SHIELD, damage: 12 });

    const bad = { ...JSON.parse(JSON.stringify(s.savePlayer())), offhand: [[I.DIAMOND, 5, 0]] };
    const { s: u } = make(11);
    u.loadPlayer(parsePlayerSave(bad)!);
    expect(u.offhand.get(0)).toBeNull();

    // Older saves have no off hand at all.
    const old = JSON.parse(JSON.stringify(s.savePlayer()));
    delete old.offhand;
    const { s: v } = make(13);
    v.offhand.set(0, makeStack(I.SHIELD));
    v.loadPlayer(parsePlayerSave(old)!);
    expect(v.offhand.get(0)).toBeNull();
  });
});

describe('the swap command', () => {
  it('parses with no arguments', () => {
    expect(parseSessionMessage({ t: 'swap' })).toEqual({ t: 'swap' });
  });
});

describe('against real mobs', () => {
  const fight = (zStart: number, shield: boolean, kind: 'zombie' | 'skeleton' = 'zombie') => {
    const { s } = make();
    if (shield) s.offhand.set(0, makeStack(I.SHIELD));
    s.vitals.hunger = 20;
    if (shield) raise(s); // up before the mob arrives
    s.spawnMob(kind, CX + 0.5, FLOOR + 1, zStart);
    let hits = 0;
    let last = s.vitals.health;
    for (let i = 0; i < 200; i++) {
      s.tick(idle({ right: shield }));
      if (s.vitals.health < last) hits++;
      last = s.vitals.health;
      if (s.vitals.dead) break;
    }
    return { s, hits };
  };

  it('a zombie in front cannot hurt you, and the shield pays for it', () => {
    const { s, hits } = fight(CZ + 0.5 - 1.6, true);
    expect(hits).toBe(0);
    expect(s.vitals.health).toBe(20);
    expect(s.offhand.get(0)!.damage).toBeGreaterThan(0);
  });

  it('the same zombie hurts without a shield, and one behind you hurts with it', () => {
    expect(fight(CZ + 0.5 - 1.6, false).hits).toBeGreaterThan(0);
    expect(fight(CZ + 0.5 + 1.6, true).hits).toBeGreaterThan(0);
  });
});
