import { B, GROVE, IS_LEAVES, IS_LIQUID, IS_SOLID, LIGHT_EMIT, campfireInfo, doorInfo, woolId } from './blocks';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from './chunk';
import { coinsForKill } from './economy';
import { isLavaId } from './fluids';
import { makeStack, type ItemStack } from './inventory';
import { I, ITEMS, type Drop } from './items';
import { findPath, type PathNode } from './pathfinding';
import { createBody, stepPlayer, type BlockReader, type Body, type MoveInput } from './physics';
import { raycast } from './raycast';
import type { VillagerState } from './trading';
import { TUNING } from './tuning';

export type MobKind =
  | 'pig'
  | 'cow'
  | 'sheep'
  | 'chicken'
  | 'rabbit'
  | 'squid'
  | 'bat'
  | 'wolf'
  | 'fox'
  | 'cat'
  | 'ocelot'
  | 'horse'
  | 'donkey'
  | 'mule'
  | 'llama'
  | 'trader_llama'
  | 'camel'
  | 'goat'
  | 'panda'
  | 'polar_bear'
  | 'mooshroom'
  | 'armadillo'
  | 'sniffer'
  | 'turtle'
  | 'frog'
  | 'parrot'
  | 'bee'
  | 'allay'
  | 'axolotl'
  | 'dolphin'
  | 'glow_squid'
  | 'cod'
  | 'salmon'
  | 'pufferfish'
  | 'tropical_fish'
  | 'tadpole'
  | 'zombie'
  | 'skeleton'
  | 'creeper'
  | 'spider'
  | 'cave_spider'
  | 'slime'
  | 'enderman'
  | 'husk'
  | 'stray'
  | 'drowned'
  | 'villager'
  /** A quest giver of the Adventure mode: it stands where it was put, cannot be hurt, and its variant says which person it is (see `NPCS`). */
  | 'npc'
  /** A training dummy: stands where it was put, takes any hit without dying, and mends itself. Never saved. */
  | 'dummy'
  /** A placed stand. It wears armor, holds one item, and stays where it was put. */
  | 'armor_stand';

/** A mob's extra bits that a client needs to draw it: slime size, rabbit coat. */
export interface MobTraits {
  size: number;
  variant: number;
  /** Seconds until a young animal is grown up (0 or missing: it is an adult). */
  baby?: number;
  /** A sheep that has been shorn. */
  sheared?: boolean;
}

export interface MobDef {
  kind: MobKind;
  name: string;
  width: number;
  height: number;
  health: number;
  /** Wander speed (blocks/s). */
  speed: number;
  /** Chase / flee speed. */
  runSpeed: number;
  hostile: boolean;
  burnsInDaylight: boolean;
  /** How far away it notices the player. */
  detect: number;
  melee: { damage: number; cooldown: number; reach: number; effect?: 'poison' } | null;
  drops(rand: () => number, mob?: MobTraits): Drop[];
  /** Experience orbs' worth when a player kills it. */
  xp(rand: () => number, mob?: MobTraits): number;
  /** Ambient creatures (squid, bats) do not count against the farm animal cap. */
  ambient?: boolean;
  /** Never despawns by distance (the realm keeps these, e.g. villagers, and saves them itself). */
  persistent?: boolean;
  /** Cannot be hurt, by anything. */
  invulnerable?: boolean;
  /** Lives in water: swims freely, never leaves it. */
  aquatic?: boolean;
  /** Flies. */
  flying?: boolean;
  /** Climbs any wall it walks into. */
  climbs?: boolean;
  /** Moves in hops, standing still in between. */
  hopper?: boolean;
  /** Falls slowly. */
  glides?: boolean;
  /** Initial jump speed (default 8). */
  jumpSpeed?: number;
  /** What it takes for it to start hunting: 'daylight' = only in the dark or once hurt; 'stare' = when looked at or hurt. */
  provoke?: 'daylight' | 'stare';
  /** Set for the zombie and skeleton variants, so they borrow the original's behaviour. */
  behaves?: 'zombie' | 'skeleton' | 'spider';
}

const between = (rand: () => number, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/** A passive animal. Extra fields (drops, aquatic, hopper) override the defaults. */
function beast(
  kind: MobKind,
  name: string,
  width: number,
  height: number,
  health: number,
  speed: number,
  runSpeed: number,
  extra: Partial<MobDef> = {},
): MobDef {
  return {
    kind,
    name,
    width,
    height,
    health,
    speed,
    runSpeed,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    drops: () => [],
    xp: (r) => between(r, 1, 3),
    ...extra,
  };
}

const leatherDrop = (r: () => number): Drop[] => {
  const n = between(r, 0, 2);
  return n > 0 ? [{ id: I.LEATHER, count: n }] : [];
};
/** A fish gives itself, and now and then a bone. */
const fishDrop = (r: () => number, fish: number): Drop[] => (r() < 0.25 ? [{ id: fish, count: 1 }, { id: I.BONE, count: 1 }] : [{ id: fish, count: 1 }]);
const beefDrop = (r: () => number): Drop[] => {
  const out: Drop[] = [{ id: I.RAW_MEAT, count: between(r, 1, 3) }];
  const hide = between(r, 0, 2);
  if (hide > 0) out.push({ id: I.LEATHER, count: hide });
  return out;
};

export const MOBS: Record<MobKind, MobDef> = {
  pig: {
    kind: 'pig',
    name: 'pig',
    width: 0.9,
    height: 0.9,
    health: 10,
    speed: 1.5,
    runSpeed: 3.4,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    drops: (r) => [{ id: I.RAW_MEAT, count: between(r, 1, 3) }],
    xp: (r) => between(r, 1, 3),
  },
  cow: {
    kind: 'cow',
    name: 'cow',
    width: 0.9,
    height: 1.4,
    health: 10,
    speed: 1.3,
    runSpeed: 3.0,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    drops: (r) => {
      const out: Drop[] = [{ id: I.RAW_MEAT, count: between(r, 1, 3) }];
      const leather = between(r, 0, 2);
      if (leather > 0) out.push({ id: I.LEATHER, count: leather });
      return out;
    },
    xp: (r) => between(r, 1, 3),
  },
  zombie: {
    kind: 'zombie',
    name: 'zombie',
    width: 0.6,
    height: 1.8,
    health: 20,
    speed: 1.4,
    runSpeed: 3.2,
    hostile: true,
    burnsInDaylight: true,
    detect: 22,
    melee: { damage: 3, cooldown: 1.0, reach: 1.15 },
    drops: (r) => {
      const out: Drop[] = [];
      const n = between(r, 0, 2);
      if (n > 0) out.push({ id: I.ROTTEN_FLESH, count: n });
      // Spiders are the real source of string; zombies still give a little.
      if (r() < 0.15) out.push({ id: I.STRING, count: 1 });
      // The same rare potato or carrot a zombie sometimes drops in Minecraft.
      if (r() < 0.025) out.push({ id: I.POTATO, count: 1 });
      if (r() < 0.025) out.push({ id: I.CARROT, count: 1 });
      return out;
    },
    xp: () => 5,
  },
  skeleton: {
    kind: 'skeleton',
    name: 'skeleton',
    width: 0.6,
    height: 1.8,
    health: 20,
    speed: 1.4,
    runSpeed: 2.8,
    hostile: true,
    burnsInDaylight: true,
    detect: 20,
    melee: null,
    drops: (r) => {
      const out: Drop[] = [];
      const bones = between(r, 0, 2);
      const arrows = between(r, 0, 2);
      if (bones) out.push({ id: I.BONE, count: bones });
      if (arrows) out.push({ id: I.ARROW, count: arrows });
      return out;
    },
    xp: () => 5,
  },
  creeper: {
    kind: 'creeper',
    name: 'creeper',
    width: 0.6,
    height: 1.7,
    health: 20,
    speed: 1.4,
    runSpeed: 3.0,
    hostile: true,
    burnsInDaylight: false,
    detect: 16,
    melee: null,
    drops: (r) => {
      const n = between(r, 0, 2);
      return n > 0 ? [{ id: I.GUNPOWDER, count: n }] : [];
    },
    xp: () => 5,
  },
  sheep: {
    kind: 'sheep',
    name: 'sheep',
    width: 0.9,
    height: 1.3,
    health: 8,
    speed: 1.3,
    runSpeed: 3.0,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    drops: (r, t) => [
      ...(t?.sheared ? [] : [{ id: woolId(t?.variant ?? 0), count: 1 }]),
      { id: I.MUTTON, count: between(r, 1, 2) },
    ],
    xp: (r) => between(r, 1, 3),
  },
  chicken: {
    kind: 'chicken',
    name: 'chicken',
    width: 0.4,
    height: 0.7,
    health: 4,
    speed: 1.2,
    runSpeed: 2.8,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    glides: true,
    jumpSpeed: 7,
    drops: (r) => {
      const out: Drop[] = [{ id: I.CHICKEN, count: 1 }];
      const feathers = between(r, 0, 2);
      if (feathers > 0) out.push({ id: I.FEATHER, count: feathers });
      return out;
    },
    xp: (r) => between(r, 1, 3),
  },
  rabbit: {
    kind: 'rabbit',
    name: 'rabbit',
    width: 0.4,
    height: 0.5,
    health: 3,
    speed: 2.2,
    runSpeed: 5.0,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    hopper: true,
    jumpSpeed: 6.4,
    drops: (r) => (r() < 0.6 ? [{ id: I.RABBIT, count: 1 }] : []),
    xp: (r) => between(r, 1, 3),
  },
  squid: {
    kind: 'squid',
    name: 'squid',
    width: 0.8,
    height: 0.8,
    health: 10,
    speed: 1.0,
    runSpeed: 3.6,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    ambient: true,
    aquatic: true,
    drops: (r) => [{ id: I.INK_SAC, count: between(r, 1, 3) }],
    xp: (r) => between(r, 1, 3),
  },
  bat: {
    kind: 'bat',
    name: 'bat',
    width: 0.5,
    height: 0.7,
    health: 6,
    speed: 2.6,
    runSpeed: 4.2,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    ambient: true,
    flying: true,
    drops: () => [],
    xp: () => 0,
  },
  spider: {
    kind: 'spider',
    name: 'spider',
    width: 1.3,
    height: 0.9,
    health: 16,
    speed: 2.2,
    runSpeed: 3.8,
    hostile: true,
    burnsInDaylight: false,
    detect: 16,
    melee: { damage: 2, cooldown: 1.0, reach: 1.3 },
    climbs: true,
    provoke: 'daylight',
    behaves: 'spider',
    drops: (r) => {
      const out: Drop[] = [];
      const string = between(r, 0, 2);
      if (string > 0) out.push({ id: I.STRING, count: string });
      if (r() < 0.33) out.push({ id: I.SPIDER_EYE, count: 1 });
      return out;
    },
    xp: () => 5,
  },
  cave_spider: {
    kind: 'cave_spider',
    name: 'cave spider',
    width: 0.7,
    height: 0.5,
    health: 12,
    speed: 2.4,
    runSpeed: 4.0,
    hostile: true,
    burnsInDaylight: false,
    detect: 14,
    melee: { damage: 2, cooldown: 0.9, reach: 0.9, effect: 'poison' },
    climbs: true,
    behaves: 'spider',
    drops: (r) => {
      const out: Drop[] = [];
      const string = between(r, 0, 2);
      if (string > 0) out.push({ id: I.STRING, count: string });
      if (r() < 0.33) out.push({ id: I.SPIDER_EYE, count: 1 });
      return out;
    },
    xp: () => 5,
  },
  slime: {
    kind: 'slime',
    name: 'slime',
    width: 0.51,
    height: 0.51,
    health: 1,
    speed: 1.6,
    runSpeed: 3.0,
    hostile: true,
    burnsInDaylight: false,
    detect: 16,
    melee: { damage: 1, cooldown: 0.8, reach: 0.9 },
    hopper: true,
    jumpSpeed: 7,
    drops: (r, t) => ((t?.size ?? 1) === 1 ? [{ id: I.SLIMEBALL, count: between(r, 0, 2) }].filter((d) => d.count > 0) : []),
    xp: (_r, t) => t?.size ?? 1,
  },
  enderman: {
    kind: 'enderman',
    name: 'enderman',
    width: 0.6,
    height: 2.9,
    health: 40,
    speed: 1.6,
    runSpeed: 5.4,
    hostile: true,
    burnsInDaylight: false,
    detect: 40,
    melee: { damage: 7, cooldown: 0.9, reach: 1.6 },
    provoke: 'stare',
    behaves: 'zombie',
    drops: (r) => (r() < 0.5 ? [{ id: I.ENDER_PEARL, count: 1 }] : []),
    xp: () => 5,
  },
  husk: {
    kind: 'husk',
    name: 'husk',
    width: 0.6,
    height: 1.8,
    health: 20,
    speed: 1.4,
    runSpeed: 3.0,
    hostile: true,
    burnsInDaylight: false,
    detect: 22,
    melee: { damage: 3, cooldown: 1.0, reach: 1.15 },
    behaves: 'zombie',
    drops: (r) => {
      const n = between(r, 0, 2);
      return n > 0 ? [{ id: I.ROTTEN_FLESH, count: n }] : [];
    },
    xp: () => 5,
  },
  stray: {
    kind: 'stray',
    name: 'stray',
    width: 0.6,
    height: 1.8,
    health: 20,
    speed: 1.4,
    runSpeed: 2.8,
    hostile: true,
    burnsInDaylight: false,
    detect: 20,
    melee: null,
    behaves: 'skeleton',
    drops: (r) => {
      const out: Drop[] = [];
      const bones = between(r, 0, 2);
      const arrows = between(r, 0, 2);
      if (bones) out.push({ id: I.BONE, count: bones });
      if (arrows) out.push({ id: I.ARROW, count: arrows });
      return out;
    },
    xp: () => 5,
  },
  drowned: {
    kind: 'drowned',
    name: 'drowned',
    width: 0.6,
    height: 1.8,
    health: 20,
    speed: 1.6,
    runSpeed: 3.0,
    hostile: true,
    burnsInDaylight: false,
    detect: 20,
    melee: { damage: 3, cooldown: 1.0, reach: 1.15 },
    behaves: 'zombie',
    drops: (r) => {
      const n = between(r, 0, 2);
      const out: Drop[] = n > 0 ? [{ id: I.ROTTEN_FLESH, count: n }] : [];
      if (r() < 0.06) out.push({ id: I.GOLD_INGOT, count: 1 });
      return out;
    },
    xp: () => 5,
  },
  villager: {
    kind: 'villager',
    name: 'villager',
    width: 0.6,
    height: 1.95,
    health: 20,
    speed: 1.3,
    runSpeed: 3.3,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    ambient: true,
    persistent: true,
    drops: () => [],
    xp: () => 0,
  },
  npc: {
    kind: 'npc',
    name: 'villager',
    width: 0.6,
    height: 1.95,
    health: 20,
    speed: 0,
    runSpeed: 0,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    ambient: true,
    persistent: true,
    invulnerable: true,
    drops: () => [],
    xp: () => 0,
  },
  dummy: {
    kind: 'dummy',
    name: 'training dummy',
    width: 0.7,
    height: 1.9,
    health: 1000,
    speed: 0,
    runSpeed: 0,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    persistent: true,
    drops: () => [],
    xp: () => 0,
  },
  armor_stand: {
    kind: 'armor_stand',
    name: 'armor stand',
    width: 0.5,
    height: 1.975,
    health: 2,
    speed: 0,
    runSpeed: 0,
    hostile: false,
    burnsInDaylight: false,
    detect: 0,
    melee: null,
    ambient: true,
    persistent: true,
    drops: () => [],
    xp: () => 0,
  },
  wolf: beast('wolf', 'wolf', 0.6, 0.85, 8, 1.7, 4.2),
  fox: beast('fox', 'fox', 0.6, 0.7, 10, 1.8, 4.6),
  cat: beast('cat', 'cat', 0.6, 0.7, 10, 1.4, 3.4, { drops: (r) => (r() < 0.3 ? [{ id: I.STRING, count: 1 }] : []) }),
  ocelot: beast('ocelot', 'ocelot', 0.6, 0.7, 10, 1.6, 4.0),
  horse: beast('horse', 'horse', 1.4, 1.6, 15, 1.7, 4.6, { drops: leatherDrop }),
  donkey: beast('donkey', 'donkey', 1.2, 1.4, 15, 1.4, 3.6, { drops: leatherDrop }),
  mule: beast('mule', 'mule', 1.3, 1.5, 15, 1.4, 3.4, { drops: leatherDrop }),
  llama: beast('llama', 'llama', 0.9, 1.87, 15, 1.3, 3.2, { drops: leatherDrop }),
  trader_llama: beast('trader_llama', 'trader llama', 0.9, 1.87, 15, 1.3, 3.2, { drops: leatherDrop }),
  camel: beast('camel', 'camel', 1.4, 2.1, 32, 1.5, 3.6),
  goat: beast('goat', 'goat', 0.9, 1.3, 10, 1.5, 3.8, { jumpSpeed: 10 }),
  panda: beast('panda', 'panda', 1.3, 1.25, 20, 1.0, 2.4, { drops: (r) => (r() < 0.15 ? [{ id: GROVE.bamboo, count: 1 }] : []) }),
  polar_bear: beast('polar_bear', 'polar bear', 1.4, 1.4, 30, 1.2, 3.6),
  mooshroom: beast('mooshroom', 'mooshroom', 0.9, 1.4, 10, 1.3, 3.0, { drops: beefDrop }),
  armadillo: beast('armadillo', 'armadillo', 0.7, 0.65, 12, 1.2, 2.8),
  sniffer: beast('sniffer', 'sniffer', 1.6, 1.5, 14, 0.8, 2.2),
  turtle: beast('turtle', 'turtle', 1.2, 0.4, 30, 0.6, 1.6),
  frog: beast('frog', 'frog', 0.5, 0.5, 10, 1.6, 3.4, { hopper: true, jumpSpeed: 7.2 }),
  parrot: beast('parrot', 'parrot', 0.5, 0.9, 6, 1.3, 3.2, { glides: true, drops: (r) => [{ id: I.FEATHER, count: between(r, 1, 2) }] }),
  bee: beast('bee', 'bee', 0.5, 0.5, 10, 1.4, 3.0, { glides: true, ambient: true }),
  allay: beast('allay', 'allay', 0.4, 0.6, 10, 1.5, 3.2, { glides: true, ambient: true, xp: () => 0 }),
  axolotl: beast('axolotl', 'axolotl', 0.75, 0.42, 14, 1.1, 2.4, { ambient: true, aquatic: true }),
  dolphin: beast('dolphin', 'dolphin', 0.9, 0.6, 10, 1.8, 4.0, { ambient: true, aquatic: true }),
  glow_squid: beast('glow_squid', 'glow squid', 0.8, 0.8, 10, 1.0, 3.4, { ambient: true, aquatic: true, drops: (r) => [{ id: I.INK_SAC, count: between(r, 1, 3) }] }),
  cod: beast('cod', 'cod', 0.5, 0.3, 3, 1.2, 2.6, { ambient: true, aquatic: true, drops: (r) => fishDrop(r, I.RAW_COD) }),
  salmon: beast('salmon', 'salmon', 0.7, 0.4, 3, 1.3, 2.8, { ambient: true, aquatic: true, drops: (r) => fishDrop(r, I.RAW_SALMON) }),
  pufferfish: beast('pufferfish', 'pufferfish', 0.5, 0.5, 3, 0.8, 1.8, { ambient: true, aquatic: true, drops: (r) => fishDrop(r, I.PUFFERFISH) }),
  tropical_fish: beast('tropical_fish', 'tropical fish', 0.5, 0.4, 3, 1.2, 2.4, { ambient: true, aquatic: true, drops: () => [{ id: I.TROPICAL_FISH, count: 1 }] }),
  tadpole: beast('tadpole', 'tadpole', 0.4, 0.3, 3, 1.0, 2.0, { ambient: true, aquatic: true }),
};

/** Slime sizes, as in the original: tiny, small and big. */
export const SLIME_SIZES = [1, 2, 4] as const;

// ---------------------------------------------------------------------------
// Tunables

export const CREEPER_FUSE = 1.5;
/** How long a mob's melee swing lasts on screen (the lunge, the arms coming down), in seconds. */
export const ATTACK_ANIM = 0.4;
export const CREEPER_TRIGGER = 3;
export const CREEPER_ABORT = 7;
export const EXPLOSION_RADIUS = 3;
const ARROW_SPEED = 22;
export const ARROW_GRAVITY = 20;
/** How fast a player's arrow leaves the bow (blocks/s) for a draw of 0 (a tap) .. 1 (full): slow enough to be seen arcing. */
export const arrowSpeed = (power: number): number => 12 + 26 * power;
const ARROW_DAMAGE = 3;
const DEATH_ANIM = 0.7;
/** A mob that dies within this many seconds of a player's hit counts as that player's kill. */
/** What raw meat becomes when its animal burns to death. */
const COOKED: Record<number, number> = { [I.RAW_MEAT]: I.COOKED_MEAT, [I.MUTTON]: I.COOKED_MUTTON, [I.CHICKEN]: I.COOKED_CHICKEN, [I.RABBIT]: I.COOKED_RABBIT, [I.RAW_COD]: I.COOKED_COD, [I.RAW_SALMON]: I.COOKED_SALMON };

const PLAYER_KILL_WINDOW = 5;
const MAX_STEP = 0.05;
/** A hunting enderman blinks to a player only when they are farther than this (never while fighting). */
const ENDERMAN_TELEPORT_RANGE = 16;
/** By day a villager stays within this many blocks of home. */
const VILLAGER_LEASH = 14;
/** A quest giver turns to look at a player this close. */
const NPC_NOTICE = 7;

// ---------------------------------------------------------------------------
// World helpers

const solidAt = (w: BlockReader, x: number, y: number, z: number) => IS_SOLID[w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;

/** Is there open sky straight above this point (leaves, water and any solid block shade it)? */
export function isExposedToSky(world: BlockReader, x: number, y: number, z: number): boolean {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let yy = Math.floor(y) + 1; yy < WORLD_HEIGHT; yy++) {
    const id = world.getBlock(bx, yy, bz);
    if (IS_SOLID[id] || IS_LIQUID[id]) return false;
  }
  return true;
}

/**
 * Does the sky's light reach this point? Unlike `isExposedToSky`, leaves only dim it (one level each, and
 * the dark begins at about eight layers), so the floor of a forest is still daylight; stone, water and
 * every other solid block shut it out.
 */
export function isOpenToSky(world: BlockReader, x: number, y: number, z: number): boolean {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  let leaves = 0;
  for (let yy = Math.floor(y) + 1; yy < WORLD_HEIGHT; yy++) {
    const id = world.getBlock(bx, yy, bz);
    if (IS_LEAVES[id]) {
      if (++leaves >= 8) return false;
    } else if (IS_SOLID[id] || IS_LIQUID[id]) return false;
  }
  return true;
}

/** Any light-emitting block within `r` blocks (used so torches/glowstone keep monsters from spawning). */
export function nearLight(world: BlockReader, x: number, y: number, z: number, r = 5): boolean {
  const bx = Math.floor(x);
  const by = Math.floor(y);
  const bz = Math.floor(z);
  for (let dy = -r; dy <= r; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (LIGHT_EMIT[world.getBlock(bx + dx, by + dy, bz + dz)] > 0) return true;
  return false;
}

/**
 * What a blow can land on, for the animals whose model is longer than it is wide or sticks out (a cow's head is half a block
 * in front of its body): boxes in the model's own frame, as the renderer's rigs lay them out (x right, y up, the front at -z),
 * each [centre x, centre y, centre z, size x, size y, size z]. They turn with the mob. A kind without an entry is hit as the
 * plain box of its width and height.
 */
/** An arrow or a bolt hits a little outside what is drawn too: it is fast, and so is what it is fired at. */
const ARROW_MARGIN = 0.1;
export type HitBox = [number, number, number, number, number, number];
const SPIDER_BOXES: HitBox[] = [
  [0, 0.5, -0.5, 0.5, 0.5, 0.55],
  [0, 0.48, 0.2, 0.7, 0.55, 1.1],
  [0, 0.3, -0.1, 1.5, 0.45, 0.95],
];
const scaled = (boxes: HitBox[], s: number): HitBox[] => boxes.map((b) => b.map((v) => v * s) as HitBox);
export const HIT_BOXES: Partial<Record<MobKind, HitBox[]>> = {
  cow: [
    [0, 1.2, -0.72, 0.6, 0.62, 0.48], // head and horns
    [0, 0.65, 0.05, 0.72, 1.3, 1.17], // body and legs
  ],
  sheep: [
    [0, 1.08, -0.6, 0.5, 0.5, 0.45],
    [0, 0.6, 0.05, 0.72, 1.2, 1.05],
  ],
  pig: [
    [0, 0.68, -0.6, 0.52, 0.52, 0.52],
    [0, 0.43, 0.05, 0.64, 0.86, 1.05],
  ],
  chicken: [
    [0, 0.7, -0.34, 0.26, 0.36, 0.34],
    [0, 0.37, 0.04, 0.52, 0.74, 0.54],
  ],
  rabbit: [
    [0, 0.55, -0.27, 0.27, 0.52, 0.27],
    [0, 0.22, 0.1, 0.34, 0.46, 0.66],
  ],
  spider: SPIDER_BOXES,
  cave_spider: scaled(SPIDER_BOXES, 0.6),
  dummy: [
    [0, 0.5, 0, 0.9, 1, 0.9], // base and post
    [0, 1.1, 0.01, 0.62, 0.62, 0.34], // the straw body
    [0, 1.25, 0.02, 1.24, 0.3, 0.2], // the crossbar and its hands
    [0, 1.72, 0, 0.5, 0.64, 0.5], // the head and its hat
  ],
  armor_stand: [
    [0, 0.15, 0, 0.7, 0.2, 0.7], // the stone base
    [0, 1.05, 0, 0.55, 1.7, 0.4], // the post, the arms and the head
  ],
};

/** Ray vs axis-aligned box (slab method). Returns the entry distance or null. */
export function rayAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  min: [number, number, number],
  max: [number, number, number],
  maxDist: number,
): number | null {
  let t0 = 0;
  let t1 = maxDist;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      let a = (min[i] - o[i]) / d[i];
      let b = (max[i] - o[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

// ---------------------------------------------------------------------------
// Entities

export interface MobPlayer {
  x: number;
  y: number;
  z: number;
  alive: boolean;
  /** Creative players are ignored by monsters. */
  invulnerable: boolean;
  /** Where the player looks (radians); endermen watch for being stared at. */
  yaw?: number;
  pitch?: number;
  /** Opaque handle for the owner (the realm maps it back to a player). */
  ref?: unknown;
}

export interface MobEvents {
  /** Damage the player; (kx,kz) is a unit knockback direction pointing away from the attacker. */
  hurtPlayer(amount: number, kx: number, kz: number, source: MobKind | 'arrow', target?: MobPlayer, effect?: 'poison'): void;
  explode(x: number, y: number, z: number, radius: number, source: Mob): void;
  sound(kind: 'say' | 'hurt' | 'death' | 'hiss' | 'shoot' | 'teleport' | 'yes' | 'no', mob: Mob): void;
  /** A villager opens or closes a door (the lower half is at y). Returns false when it could not (somebody is in the way). */
  door?(x: number, y: number, z: number, open: boolean): boolean;
  drop(drop: Drop, x: number, y: number, z: number): void;
  /** A mob died soon after a player hurt it (quests count it; the realm credits the players near). */
  killed?(mob: Mob): void;
  /** A mob that a player killed (recently hurt by one) is worth experience. */
  xp?(amount: number, x: number, y: number, z: number): void;
  /** ...and pays coins too. */
  coins?(amount: number, x: number, y: number, z: number): void;
  /** ...and may leave something only a player's kill earns (a skill book): the realm knows who the killer is and what they still need. */
  loot?(mob: Mob, x: number, y: number, z: number): void;
  /** A thrown bottle o' enchanting burst here. */
  shatter?(x: number, y: number, z: number): void;
  /** A thrown ender pearl landed here: whoever threw it (`owner`) is carried over. */
  pearl?(x: number, y: number, z: number, owner: unknown): void;
}

export interface MobEnv {
  world: BlockReader;
  player: MobPlayer;
  /** Every player in range. Each mob reacts to the nearest living one; defaults to just player. */
  players?: readonly MobPlayer[];
  /** 0 (night) .. 1 (full day). */
  daylight: number;
  rand: () => number;
  /** A place monsters keep out of (a village): a hostile mob found there is sent away. */
  safe?: (x: number, z: number) => boolean;
  /** A ward (a soul lantern) around this spot: where it hangs, or null. A monster inside one walks away from it and will not go for a player inside one. */
  ward?: (x: number, y: number, z: number) => { x: number; z: number } | null;
}

export class Arrow {
  age = 0;
  /** Pulled down by this much (blocks/s squared); a spell flies straight. */
  gravity = ARROW_GRAVITY;
  /** What is drawn: 0 an arrow, 1 a fireball, 2 an arcane bolt. */
  spell = 0;
  /** A spell's ending: called where it stopped, with the mob it struck (null: it hit the ground or a wall). The projectile is gone after. */
  impact: ((x: number, y: number, z: number, mob: Mob | null) => void) | null = null;
  /**
   * An arrow's ending, for the archer who shot it: it hit a mob (`dealt`: what it did, `head`: a headshot, which hits half as hard again) or
   * stuck in the ground or a wall (`mob` null; `x, y, z` is then where it entered, and `vx, vy, vz` still the way it was flying). The
   * arrow is gone after. Only a player's arrow has one.
   */
  onHit: ((a: Arrow, mob: Mob | null, dealt: number, head: boolean) => void) | null = null;
  constructor(
    public x: number,
    public y: number,
    public z: number,
    public vx: number,
    public vy: number,
    public vz: number,
    public damage = ARROW_DAMAGE,
    /** Fired by the player: hurts mobs instead of the player. */
    public friendly = false,
    /** Enchantments of the bow: how hard it pushes (Punch) and whether it sets the target alight (Flame). */
    public punch = 0,
    public fire = false,
    /** A thrown bottle o' enchanting rather than an arrow: it bursts into experience where it lands. */
    public bottle = false,
    /** A thrown ender pearl: whoever threw it (an opaque handle) is teleported to where it lands. */
    public pearl: unknown = null,
  ) {}
}

/** What a hit carries beyond its damage: enchantments of the weapon. */
export interface HitOpts {
  /** Multiplier on the knockback (1 = plain). */
  knock?: number;
  /** Speed (blocks a second) the target is thrown up with: it is flung through the air, not just shoved, and stays pushed for longer. */
  lift?: number;
  /** Seconds the target is set alight for. */
  fire?: number;
  /** Looting level: extra drops when this hit kills. */
  looting?: number;
}

export interface MobSave {
  kind: MobKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  size?: number;
  variant?: number;
  /** Seconds left as a young animal. */
  baby?: number;
  sheared?: boolean;
  /** An armor stand's worn pieces and the item in its hand. `i` is 0..3 for the armor slots and 4 for the hand. */
  gear?: { i: number; id: number; d?: number; e?: [number, number][]; n?: string }[];
}

/** What each farm animal is bred with (a right-click with it puts the animal in love). */
export const BREED_FOOD: Partial<Record<MobKind, number>> = {
  cow: I.WHEAT,
  sheep: I.WHEAT,
  pig: I.CARROT,
  chicken: I.WHEAT_SEEDS,
  rabbit: I.CARROT,
  wolf: I.BONE,
  fox: I.SWEET_BERRIES,
  cat: I.RAW_MEAT,
  ocelot: I.RAW_MEAT,
  horse: I.WHEAT,
  donkey: I.WHEAT,
  mule: I.WHEAT,
  llama: I.WHEAT,
  trader_llama: I.WHEAT,
  camel: B.CACTUS,
  goat: I.WHEAT,
  panda: GROVE.bamboo,
  mooshroom: I.WHEAT,
  armadillo: I.SPIDER_EYE,
  sniffer: I.WHEAT_SEEDS,
  frog: I.SLIMEBALL,
  parrot: I.WHEAT_SEEDS,
};
/** Seconds an animal stays in love, how long it rests before breeding again, and how long a baby takes to grow up. */
export const LOVE_SECONDS = 30;
export const BREED_COOLDOWN = 300;
export const BABY_SECONDS = 1200;
/** Seconds until a shorn sheep has its wool back. */
export const WOOL_REGROW = 180;
/** How long a grown chicken waits between eggs, in seconds. */
export const EGG_LAY_MIN = 300;
export const EGG_LAY_MAX = 600;
/** Mates this close to each other have a baby. */
const MATE_REACH = 1.6;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** A natural sheep's wool colour, with the original's odds: white 81.8%, black, gray and light gray 5% each, brown 3%, pink 0.2%. */
export function sheepColor(r: () => number): number {
  const v = r();
  if (v < 0.05) return 15; // black
  if (v < 0.1) return 7; // gray
  if (v < 0.15) return 8; // light gray
  if (v < 0.18) return 12; // brown
  if (v < 0.1816) return 6; // pink
  return 0;
}

/** A variant read from a save: a sheep's colour is 0..15, a rabbit's coat 0..2; anything else is 0. */
function savedVariant(kind: MobKind, v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return 0;
  if (kind === 'sheep') return v >= 0 && v < 16 ? v : 0;
  if (kind === 'villager') return v >= 0 && v < 256 ? v : 0;
  if (kind === 'armor_stand') return v >= 0 && v <= 3 ? v : 0;
  return v === 1 || v === 2 ? v : 0;
}

/** How many ways an armor stand can stand. Sneak and right-click steps through them. */
export const ARMOR_STAND_POSES = 4;

/** The pieces on an armor stand, read back from a save. Empty slots stay empty; unknown items are dropped. */
function savedGear(raw: unknown): (ItemStack | null)[] {
  const slots: (ItemStack | null)[] = [null, null, null, null, null];
  if (!Array.isArray(raw)) return slots;
  for (const piece of raw) {
    if (!piece || typeof piece !== 'object') continue;
    const p = piece as { i?: unknown; id?: unknown; d?: unknown; e?: unknown; n?: unknown };
    if (typeof p.i !== 'number' || p.i < 0 || p.i > 4 || typeof p.id !== 'number' || !ITEMS.has(p.id)) continue;
    const stack = makeStack(p.id, 1, typeof p.d === 'number' && p.d > 0 ? p.d : 0);
    if (Array.isArray(p.e)) {
      const ench = p.e.filter((pair): pair is [number, number] => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'number' && typeof pair[1] === 'number');
      if (ench.length > 0) stack.ench = ench;
    }
    if (typeof p.n === 'string' && p.n) stack.name = p.n;
    slots[p.i] = stack;
  }
  return slots;
}

/** An armor stand's filled slots, for a save. */
function packedGear(slots: readonly (ItemStack | null)[]): NonNullable<MobSave['gear']> {
  const out: NonNullable<MobSave['gear']> = [];
  slots.forEach((s, i) => {
    if (!s) return;
    out.push({ i, id: s.id, ...(s.damage > 0 ? { d: s.damage } : {}), ...(s.ench && s.ench.length > 0 ? { e: s.ench.map((pair) => [pair[0], pair[1]] as [number, number]) } : {}), ...(s.name ? { n: s.name } : {}) });
  });
  return out;
}

export class Mob {
  readonly def: MobDef;
  readonly body: Body;
  health: number;
  maxHealth: number;
  /** Slime size (1, 2 or 4); 1 for everything else. */
  size = 1;
  /** Rabbit coat 0..2, fox 1 is white, and a few coats for horse, cat, llama, parrot and tropical fish. A sheep's is its wool colour. */
  variant = 0;
  /** An armor stand's four armor slots and the item in its hand. Null for every other mob. */
  standGear: (ItemStack | null)[] | null = null;
  width: number;
  height: number;
  /** Hunting because it was hurt, or (enderman) looked at. */
  aggro = false;
  hopTimer = 0;
  leapCooldown = 2;
  teleportTimer = 4;
  pendingTeleport = false;
  /** Wander heading in the air or water: pitch and speed. */
  floatPitch = 0;
  floatSpeed = 0;
  floatTimer = 0;
  yaw: number;
  dead = false;
  deathTime = 0;
  /** Seconds since last hit (for the red flash). */
  hurtTime = 99;
  /** Seconds since it last swung at something (for the lunge and the swing of its arms); `ATTACK_ANIM` and more means not attacking. */
  attackTime = 99;
  burning = false;
  /** Seconds left alight from Fire Aspect or Flame (water puts it out). */
  onFire = 0;
  /** Class abilities: seconds left stunned (no thinking, no moving), slowed to `slowMul` of its speed, or rooted in place. */
  stunTime = 0;
  slowTime = 0;
  slowMul = 1;
  rootTime = 0;
  /** Creeper: seconds on the fuse, or -1 when not lit. */
  fuse = -1;
  /** Walk-cycle phase for animation. */
  walkPhase = 0;
  /** Horizontal speed for animation. */
  speedNow = 0;
  age = 0;

  // AI state
  wanderTimer = 0;
  wandering = false;
  wanderYaw = 0;
  fleeTimer = 0;
  fleeX = 0;
  fleeZ = 0;
  attackCooldown = 0;
  /** Set for one step after an enderman blinks (the realm plays the sound). */
  teleported = false;
  shootCooldown = 1;
  strafeDir = 1;
  strafeTimer = 0;
  sayTimer = 4;
  path: PathNode[] | null = null;
  pathIndex = 0;
  repathTimer = 0;
  stuckTimer = 0;
  lastX = 0;
  lastZ = 0;
  exposed = false;
  /** Like `exposed`, but a thin canopy of leaves does not count as cover (daylight still reaches the ground). */
  openSky = false;
  exposedTimer = 0;
  fireTimer = 0;
  lavaTimer = 0;
  /** Seconds since a lit campfire last hurt this mob. */
  campfireTimer = 0.5;
  knockTime = 0;
  kbx = 0;
  kbz = 0;
  /** Set when killed by its own explosion so it drops nothing. */
  noDrops = false;
  /** A villager's profession, level, trades and home (shared with the realm's record of it). */
  villager: VillagerState | null = null;
  /** Which way an NPC faces when nobody is near to look at. */
  homeYaw = 0;
  /** Whoever has the trade screen open with this villager: it stands still and looks at them. */
  customer: { body: { x: number; z: number } } | null = null;
  /** Doors this villager opened and has yet to close. */
  openDoors: { x: number; y: number; z: number; t: number }[] = [];
  /** Seconds since a player last hurt it. Only a kill soon after a player hit earns experience. */
  sincePlayerHit = Infinity;
  /** Sheep: wool taken with shears, and seconds until it grows back. */
  sheared = false;
  woolTimer = 0;
  /** Chicken: seconds until the next egg. */
  eggTimer = 0;
  /** Seconds left as a young animal (0 = grown up). A baby is half size and drops nothing. */
  growTimer = 0;
  /** Seconds left in love (looking for a mate), and the rest before it may breed again. */
  love = 0;
  breedCooldown = 0;
  readonly cmd: MoveInput = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, fly: false, flyDown: false, yaw: 0 };

  constructor(
    readonly id: number,
    kind: MobKind,
    x: number,
    y: number,
    z: number,
    rand: () => number = Math.random,
    traits: Partial<MobTraits> = {},
  ) {
    this.def = MOBS[kind];
    if (kind === 'armor_stand') this.standGear = [null, null, null, null, null];
    this.size = kind === 'slime' ? traits.size ?? 1 : 1;
    this.variant = traits.variant ?? 0;
    this.sheared = traits.sheared === true && kind === 'sheep';
    if (this.sheared) this.woolTimer = WOOL_REGROW;
    this.growTimer = traits.baby && traits.baby > 0 ? traits.baby : 0;
    // Slimes scale from their one-block-wide model; everything else is what its definition says.
    const scale = (kind === 'slime' ? this.size : 1) * (this.growTimer > 0 ? 0.5 : 1);
    this.width = this.def.width * scale;
    this.height = this.def.height * scale;
    // (Training dummies and armor stands are not made tougher: see tuning.ts.)
    this.maxHealth = (kind === 'slime' ? this.size * this.size : this.def.health) * TUNING.damageScale * (kind === 'dummy' || kind === 'armor_stand' ? 1 : TUNING.mobToughness);
    this.body = createBody(x, y, z);
    this.body.width = this.width;
    this.body.height = this.height;
    this.health = this.maxHealth;
    this.yaw = rand() * Math.PI * 2;
    if (kind === 'armor_stand') this.homeYaw = this.yaw;
    this.wanderYaw = this.yaw;
    this.lastX = x;
    this.lastZ = z;
    this.sayTimer = 3 + rand() * 8;
    if (kind === 'chicken') this.eggTimer = EGG_LAY_MIN + rand() * (EGG_LAY_MAX - EGG_LAY_MIN);
    this.shootCooldown = 1 + rand();
    this.wanderTimer = rand() * 3;
  }

  get kind(): MobKind {
    return this.def.kind;
  }

  /** Item ids on an armor stand (helmet, chest, legs, boots, hand), for the client to draw. */
  get gear(): readonly number[] | undefined {
    if (!this.standGear) return undefined;
    return this.standGear.map((s) => s?.id ?? 0);
  }

  get eyeY(): number {
    return this.body.y + this.height * 0.9;
  }

  aabb(): { min: [number, number, number]; max: [number, number, number] } {
    const hw = this.width / 2;
    const b = this.body;
    return { min: [b.x - hw, b.y, b.z - hw], max: [b.x + hw, b.y + this.height, b.z + hw] };
  }

  /**
   * How far along a ray (from `ox, oy, oz`, direction `dx, dy, dz` of length 1) this mob is hit, or null. The mob is what
   * it looks like (its head, its body, turned the way it faces), grown by `margin` blocks all round, which is the
   * allowance for a blow that is aimed at what the screen showed a moment ago (lag, in seconds, adds more for a mob that is moving).
   */
  hitDistance(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, margin = 0, lag = 0): number | null {
    const boxes = HIT_BOXES[this.def.kind];
    const b = this.body;
    // A blow lands where the screen showed the mob, which is lag seconds behind where it is: the faster it moves, the more.
    if (lag > 0) margin += Math.min(0.5, Math.hypot(b.vx + this.kbx, b.vz + this.kbz) * lag);
    if (!boxes) {
      const { min, max } = this.aabb();
      return rayAabb(ox, oy, oz, dx, dy, dz, [min[0] - margin, min[1] - margin, min[2] - margin], [max[0] + margin, max[1] + margin, max[2] + margin], maxDist);
    }
    // Into the mob's own frame (it faces (-sin yaw, -cos yaw)); a rigid turn keeps the distances along the ray.
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const rx = ox - b.x;
    const rz = oz - b.z;
    const lox = rx * c - rz * s;
    const loz = rx * s + rz * c;
    const ldx = dx * c - dz * s;
    const ldz = dx * s + dz * c;
    const k = this.def.height > 0 ? this.height / this.def.height : 1;
    let best: number | null = null;
    for (const [cx, cy, cz, sx, sy, sz] of boxes) {
      const hx = (sx * k) / 2 + margin;
      const hy = (sy * k) / 2 + margin;
      const hz = (sz * k) / 2 + margin;
      const t = rayAabb(lox, oy - b.y, loz, ldx, dy, ldz, [cx * k - hx, cy * k - hy, cz * k - hz], [cx * k + hx, cy * k + hy, cz * k + hz], maxDist);
      if (t !== null && (best === null || t < best)) best = t;
    }
    return best;
  }

  get traits(): MobTraits {
    return { size: this.size, variant: this.variant, baby: this.growTimer, sheared: this.sheared };
  }

  get baby(): boolean {
    return this.growTimer > 0;
  }

  /** Full grown: back to the species' size. */
  grownUp(): void {
    this.growTimer = 0;
    this.width = this.def.width;
    this.height = this.def.height;
    this.body.width = this.width;
    this.body.height = this.height;
  }

  /** 0..1 how far the creeper's fuse has burned (drives the swelling animation). */
  get fuseFraction(): number {
    return this.fuse < 0 ? 0 : Math.min(1, this.fuse / CREEPER_FUSE);
  }
}

// ---------------------------------------------------------------------------
// Manager

/** The closest living player (or simply the closest when everyone is dead). */
function nearestPlayer(players: readonly MobPlayer[], x: number, z: number): MobPlayer {
  let best = players[0];
  let bestD = Infinity;
  for (const p of players) {
    const d = Math.hypot(p.x - x, p.z - z) + (p.alive ? 0 : 1000);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export class MobManager {
  readonly mobs: Mob[] = [];
  readonly arrows: Arrow[] = [];
  private nextId = 1;

  constructor(private readonly rand: () => number = Math.random) {}

  spawn(kind: MobKind, x: number, y: number, z: number, traits: Partial<MobTraits> = {}): Mob {
    const m = new Mob(this.nextId++, kind, x, y, z, this.rand, traits);
    this.mobs.push(m);
    return m;
  }

  /** Snapshot living mobs near a point (for saves). Hostiles that are about to despawn are skipped. */
  toJSON(cx: number, cz: number, radius: number, limit = 48): MobSave[] {
    const out: MobSave[] = [];
    for (const m of this.mobs) {
      // Villagers are kept by the realm, with their trades, in the world's state.
      if (m.dead || out.length >= limit || m.kind === 'villager' || m.kind === 'npc' || m.kind === 'dummy') continue;
      if (Math.hypot(m.body.x - cx, m.body.z - cz) > radius) continue;
      out.push({
        kind: m.kind,
        x: round2(m.body.x),
        y: round2(m.body.y),
        z: round2(m.body.z),
        yaw: round2(m.yaw),
        health: m.health,
        ...(m.size !== 1 ? { size: m.size } : {}),
        ...(m.variant !== 0 ? { variant: m.variant } : {}),
        ...(m.growTimer > 0 ? { baby: round2(m.growTimer) } : {}),
        ...(m.sheared ? { sheared: true } : {}),
        ...(m.standGear ? { gear: packedGear(m.standGear) } : {}),
      });
    }
    return out;
  }

  /** Restore a snapshot. Unknown kinds and malformed entries are ignored. Returns how many were added. */
  loadJSON(list: unknown): number {
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (const e of list as Partial<MobSave>[]) {
      if (!e || !(e.kind! in MOBS) || e.kind === 'villager' || e.kind === 'npc' || e.kind === 'dummy' || ![e.x, e.y, e.z].every((v) => Number.isFinite(v))) continue;
      const size = SLIME_SIZES.includes(e.size as 1 | 2 | 4) ? e.size : 1;
      const m = this.spawn(e.kind as MobKind, e.x!, e.y!, e.z!, {
        size,
        variant: savedVariant(e.kind as MobKind, e.variant),
        baby: typeof e.baby === 'number' && e.baby > 0 && e.baby <= BABY_SECONDS && e.kind! in BREED_FOOD ? e.baby : 0,
        sheared: e.sheared === true,
      });
      if (Number.isFinite(e.yaw)) m.yaw = e.yaw!;
      if (m.kind === 'armor_stand') {
        m.homeYaw = m.yaw;
        m.standGear = savedGear(e.gear);
      }
      if (Number.isFinite(e.health)) m.health = Math.max(1, Math.min(m.maxHealth, e.health!));
      n++;
    }
    return n;
  }

  /** Launch a player arrow. `power` is 0..1 (bow draw); it sets speed and damage. */
  shootArrow(x: number, y: number, z: number, dx: number, dy: number, dz: number, power: number, bow?: { power?: number; punch?: number; flame?: boolean }): Arrow {
    const len = Math.hypot(dx, dy, dz) || 1;
    const speed = arrowSpeed(power);
    const a = new Arrow(x, y, z, (dx / len) * speed, (dy / len) * speed, (dz / len) * speed, (2 + 7 * power) * (1 + 0.25 * (bow?.power ? bow.power + 1 : 0)), true, bow?.punch ?? 0, !!bow?.flame);
    this.arrows.push(a);
    return a;
  }

  /** Cast a spell projectile: it flies straight and calls `impact` where it ends (see `Arrow.impact`). */
  castBolt(x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, spell: number, impact: NonNullable<Arrow['impact']>): Arrow {
    const len = Math.hypot(dx, dy, dz) || 1;
    const a = new Arrow(x, y, z, (dx / len) * speed, (dy / len) * speed, (dz / len) * speed, 0, true);
    a.gravity = 0;
    a.spell = spell;
    a.impact = impact;
    this.arrows.push(a);
    return a;
  }

  /** Throw a bottle o' enchanting: it flies like a slow arrow and bursts into experience where it lands or hits. */
  throwBottle(x: number, y: number, z: number, dx: number, dy: number, dz: number): Arrow {
    const len = Math.hypot(dx, dy, dz) || 1;
    const speed = 13;
    const a = new Arrow(x, y, z, (dx / len) * speed, (dy / len) * speed + 2, (dz / len) * speed, 0, true, 0, false, true);
    this.arrows.push(a);
    return a;
  }

  /** Throw an ender pearl: a fast arrow that carries `owner` to where it lands, without hurting anything. */
  throwPearl(x: number, y: number, z: number, dx: number, dy: number, dz: number, owner: unknown): Arrow {
    const len = Math.hypot(dx, dy, dz) || 1;
    const speed = 22;
    const a = new Arrow(x, y, z, (dx / len) * speed, (dy / len) * speed + 1, (dz / len) * speed, 0, true, 0, false, false, owner);
    this.arrows.push(a);
    return a;
  }

  /** Mobs of one kind close to a point. */
  countKind(kind: MobKind, x: number, z: number, radius: number): number {
    let n = 0;
    for (const m of this.mobs) if (!m.dead && m.kind === kind && Math.hypot(m.body.x - x, m.body.z - z) <= radius) n++;
    return n;
  }

  countNear(x: number, z: number, radius: number, hostile: boolean): number {
    let n = 0;
    for (const m of this.mobs) {
      if (m.dead || m.def.hostile !== hostile || m.def.ambient || m.kind === 'dummy') continue;
      if (Math.hypot(m.body.x - x, m.body.z - z) <= radius) n++;
    }
    return n;
  }

  /** Nearest mob hit by a ray, within maxDist (margin: how far beside what is drawn still counts as a hit). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, margin = 0, lag = 0): { mob: Mob; dist: number } | null {
    let best: { mob: Mob; dist: number } | null = null;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const t = m.hitDistance(ox, oy, oz, dx, dy, dz, maxDist, margin, lag);
      if (t !== null && (!best || t < best.dist)) best = { mob: m, dist: t };
    }
    return best;
  }

  /** Hurt a mob. (kx,kz) is the knockback direction (away from the attacker). Returns true if it died. */
  damage(mob: Mob, amount: number, kx: number, kz: number, events: MobEvents, dropLoot = true, knock = true, byPlayer = false, hit?: HitOpts): boolean {
    if (mob.dead || amount <= 0 || mob.def.invulnerable) return false;
    if (byPlayer) {
      mob.sincePlayerHit = 0;
      mob.aggro = true;
    }
    mob.health -= amount * TUNING.damageScale;
    // A training dummy takes anything and starts over once it has taken all it has.
    if (mob.kind === 'dummy' && mob.health <= 0) mob.health = mob.maxHealth;
    mob.hurtTime = 0;
    // A hit enderman turns on whoever hit it and stands its ground. (It only blinks away from damage that
    // has no one to fight: water, and arrows, which are dodged in `stepArrow`.)
    if (mob.kind === 'enderman') mob.aggro = true;
    // An armor stand stays where it was set. A hit does not send it sliding off its block.
    if (knock && mob.kind !== 'armor_stand') {
      const len = Math.hypot(kx, kz) || 1;
      const k = 5.5 * (hit?.knock ?? 1);
      mob.kbx = (kx / len) * k;
      mob.kbz = (kz / len) * k;
      const lift = hit?.lift ?? 0;
      // A thrown mob keeps flying for as long as it is in the air.
      mob.knockTime = lift > 0 ? 0.35 + Math.min(0.5, lift / 28) : 0.22;
      if (lift > 0) mob.body.vy = lift;
      else if (mob.body.onGround) mob.body.vy = 4.2;
    }
    if (!mob.def.hostile && mob.kind !== 'dummy' && mob.kind !== 'armor_stand') {
      mob.fleeTimer = 5;
      mob.fleeX = mob.body.x - kx;
      mob.fleeZ = mob.body.z - kz;
    }
    if (hit?.fire && hit.fire > 0 && !mob.body.inWater) mob.onFire = Math.max(mob.onFire, hit.fire);
    if (mob.health <= 0) {
      this.kill(mob, events, dropLoot, hit?.looting ?? 0);
      return true;
    }
    events.sound('hurt', mob);
    return false;
  }

  private kill(mob: Mob, events: MobEvents, dropLoot: boolean, looting = 0): void {
    mob.dead = true;
    mob.deathTime = 0;
    mob.health = 0;
    events.sound('death', mob);
    if (mob.sincePlayerHit < PLAYER_KILL_WINDOW) events.killed?.(mob);
    if (dropLoot && !mob.noDrops && mob.growTimer <= 0) {
      // Meat comes cooked from a mob that dies in flames.
      const cooks = mob.onFire > 0 || mob.body.inLava === true;
      for (const drop of mob.def.drops(this.rand, mob.traits)) {
        const d = cooks && COOKED[drop.id] ? { ...drop, id: COOKED[drop.id] } : drop;
        // Looting adds up to its level in extra items to each kind of drop.
        const more = looting > 0 ? Math.floor(this.rand() * (looting + 1)) : 0;
        events.drop(more > 0 ? { ...d, count: d.count + more } : d, mob.body.x, mob.body.y + 0.3, mob.body.z);
      }
      if (mob.standGear) {
        events.drop({ id: I.ARMOR_STAND, count: 1 }, mob.body.x, mob.body.y + 0.3, mob.body.z);
        for (const piece of mob.standGear) if (piece) events.drop(piece, mob.body.x, mob.body.y + 0.5, mob.body.z);
      }
      if (mob.sincePlayerHit < PLAYER_KILL_WINDOW) {
        events.xp?.(mob.def.xp(this.rand, mob.traits), mob.body.x, mob.body.y + 0.3, mob.body.z);
        const coins = coinsForKill(mob.kind, mob.size, this.rand);
        if (coins > 0) events.coins?.(coins, mob.body.x, mob.body.y + 0.3, mob.body.z);
        events.loot?.(mob, mob.body.x, mob.body.y + 0.3, mob.body.z);
      }
    }
    // A slime bursts into two to four smaller ones.
    if (mob.kind === 'slime' && mob.size > 1 && !mob.noDrops) {
      const n = 2 + Math.floor(this.rand() * 3);
      for (let i = 0; i < n; i++) {
        const a = this.rand() * Math.PI * 2;
        const child = this.spawn('slime', mob.body.x + Math.cos(a) * 0.4, mob.body.y + 0.1, mob.body.z + Math.sin(a) * 0.4, { size: mob.size / 2 });
        child.body.vx = Math.cos(a) * 2;
        child.body.vz = Math.sin(a) * 2;
        child.body.vy = 4;
        child.aggro = mob.aggro;
      }
    }
  }

  update(dt: number, env: MobEnv, events: MobEvents): void {
    let left = Math.min(dt, 0.25);
    while (left > 1e-6) {
      const step = Math.min(MAX_STEP, left);
      left -= step;
      this.step(step, env, events);
    }
  }

  private step(dt: number, baseEnv: MobEnv, events: MobEvents): void {
    const players = baseEnv.players && baseEnv.players.length > 0 ? baseEnv.players : [baseEnv.player];
    const env: MobEnv = { ...baseEnv };
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.age += dt;
      m.hurtTime += dt;
      m.attackTime += dt;
      m.sincePlayerHit += dt;
      if (m.stunTime > 0) m.stunTime = Math.max(0, m.stunTime - dt);
      if (m.rootTime > 0) m.rootTime = Math.max(0, m.rootTime - dt);
      if (m.slowTime > 0 && (m.slowTime -= dt) <= 0) {
        m.slowTime = 0;
        m.slowMul = 1;
      }
      if (m.dead) {
        m.deathTime += dt;
        this.physics(m, env, dt, false);
        if (m.deathTime >= DEATH_ANIM) this.mobs.splice(i, 1);
        continue;
      }

      // A village is safe: a monster that finds itself in one is gone (it never reaches anybody inside).
      if (m.def.hostile && env.safe?.(m.body.x, m.body.z)) {
        this.mobs.splice(i, 1);
        continue;
      }

      env.player = nearestPlayer(players, m.body.x, m.body.z);
      const dist = Math.hypot(m.body.x - env.player.x, m.body.z - env.player.z);
      // Despawn far away mobs.
      if ((dist > 110 && !m.def.persistent) || (m.def.hostile && dist > 64 && env.rand() < dt * 0.15)) {
        this.mobs.splice(i, 1);
        continue;
      }
      // An enderman that never found shade by day wanders off once the player is not close.
      if (m.kind === 'enderman' && !m.aggro && env.daylight > 0.75 && m.openSky && dist > 24 && env.rand() < dt * 0.3) {
        this.mobs.splice(i, 1);
        continue;
      }

      // A stunned mob does nothing at all (it still falls and is pushed around).
      if (m.stunTime > 0) {
        this.physics(m, env, dt, false);
        continue;
      }
      this.think(m, env, events, dt, dist);
      this.growAndRest(m, dt);
      // A grown chicken lays an egg every few minutes. A chick does not.
      if (m.kind === 'chicken' && m.growTimer <= 0) {
        m.eggTimer -= dt;
        if (m.eggTimer <= 0) {
          m.eggTimer = EGG_LAY_MIN + env.rand() * (EGG_LAY_MAX - EGG_LAY_MIN);
          events.drop({ id: I.EGG, count: 1 }, m.body.x, m.body.y + 0.2, m.body.z);
        }
      }
      if (m.def.hopper) this.hop(m, dt, env.rand);
      this.physics(m, env, dt, true);
      if (m.teleported) {
        m.teleported = false;
        events.sound('teleport', m);
      }
      this.environment(m, env, events, dt);
    }

    this.breed(events, baseEnv.rand);

    for (let i = this.arrows.length - 1; i >= 0; i--) {
      if (this.stepArrow(this.arrows[i], baseEnv, players, events, dt)) this.arrows.splice(i, 1);
    }
  }

  /** Growing up, resting after a baby, wanting a mate and wool growing back. */
  private growAndRest(m: Mob, dt: number): void {
    if (m.love > 0) m.love = Math.max(0, m.love - dt);
    if (m.breedCooldown > 0) m.breedCooldown = Math.max(0, m.breedCooldown - dt);
    if (m.growTimer > 0) {
      m.growTimer -= dt;
      if (m.growTimer <= 0) m.grownUp();
    }
    if (m.sheared && (m.woolTimer -= dt) <= 0) m.sheared = false;
  }

  /** Two grown animals of a kind that are in love and close together have a baby between them. */
  private breed(events: MobEvents, rand: () => number): void {
    for (let i = 0; i < this.mobs.length; i++) {
      const a = this.mobs[i];
      if (a.love <= 0 || a.dead || a.baby) continue;
      for (let j = i + 1; j < this.mobs.length; j++) {
        const b = this.mobs[j];
        if (b.kind !== a.kind || b.love <= 0 || b.dead || b.baby) continue;
        if (Math.hypot(a.body.x - b.body.x, a.body.z - b.body.z) > MATE_REACH || Math.abs(a.body.y - b.body.y) > 1.5) continue;
        a.love = b.love = 0;
        a.breedCooldown = b.breedCooldown = BREED_COOLDOWN;
        const x = (a.body.x + b.body.x) / 2;
        const z = (a.body.z + b.body.z) / 2;
        const y = Math.max(a.body.y, b.body.y);
        this.spawn(a.kind, x, y, z, { baby: BABY_SECONDS, variant: a.kind === 'sheep' ? (rand() < 0.5 ? a.variant : b.variant) : a.variant });
        events.xp?.(1 + Math.floor(rand() * 7), x, y + 0.3, z);
        events.sound('yes', a);
        break;
      }
    }
  }

  /** Feed an animal its food: it falls in love (or, if young, grows up a little faster). Returns whether the food was taken. */
  feed(mob: Mob, itemId: number, events: MobEvents): boolean {
    if (mob.dead || BREED_FOOD[mob.kind] !== itemId) return false;
    if (mob.baby) {
      mob.growTimer = Math.max(0.01, mob.growTimer - BABY_SECONDS * 0.1);
    } else if (mob.love <= 0 && mob.breedCooldown <= 0) {
      mob.love = LOVE_SECONDS;
    } else {
      return false;
    }
    events.sound('yes', mob);
    return true;
  }

  // ---- physics -----------------------------------------------------------

  private physics(m: Mob, env: MobEnv, dt: number, control: boolean): void {
    const b = m.body;
    const cmd = m.cmd;
    if (!control) {
      cmd.forward = 0;
      cmd.strafe = 0;
      cmd.jump = false;
    }
    cmd.yaw = m.yaw;
    cmd.jumpVelocity = m.def.jumpSpeed ?? 8.0;
    // Class abilities: a rooted or stunned mob stays where it is, a slowed one is slower on its feet.
    cmd.speedMul = m.slowTime > 0 ? m.slowMul : 1;
    if (m.rootTime > 0 || m.stunTime > 0) {
      cmd.forward = 0;
      cmd.strafe = 0;
      cmd.jump = false;
      if (control && (m.def.flying || m.def.aquatic)) {
        m.body.vx = 0;
        m.body.vy = 0;
        m.body.vz = 0;
        return;
      }
    }

    if (control && (m.def.flying || (m.def.aquatic && this.inLiquid(env, b)))) {
      this.floatPhysics(m, env, dt);
      return;
    }
    // Spiders go up whatever wall they walk into.
    if (control && m.def.climbs && cmd.forward > 0 && this.wallAhead(m, env)) b.vy = Math.max(b.vy, 3.4);

    if (m.knockTime > 0) {
      m.knockTime -= dt;
      b.vx = m.kbx;
      b.vz = m.kbz;
      m.kbx *= 0.92;
      m.kbz *= 0.92;
      cmd.accel = 0.3;
    } else {
      cmd.accel = undefined;
    }

    const px = b.x;
    const pz = b.z;
    stepPlayer(env.world, b, cmd, dt);
    // Chickens flap and drift down.
    if (m.def.glides && !b.onGround && b.vy < -1.6) b.vy = -1.6;
    const moved = Math.hypot(b.x - px, b.z - pz);
    m.speedNow = moved / dt;
    m.walkPhase += moved * 3.2;
  }

  private inLiquid(env: MobEnv, b: Body): boolean {
    return IS_LIQUID[env.world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.2), Math.floor(b.z))] === 1;
  }

  /** A solid wall right in front of the mob (a spider's cue to climb it). */
  private wallAhead(m: Mob, env: MobEnv): boolean {
    const b = m.body;
    const reach = m.width / 2 + 0.25;
    const ax = b.x - Math.sin(m.yaw) * reach;
    const az = b.z - Math.cos(m.yaw) * reach;
    // Two heights, so a spider keeps climbing right up to the lip of the wall and pulls itself over.
    return solidAt(env.world, ax, b.y + 0.3, az) || solidAt(env.world, ax, b.y + 0.05, az);
  }

  /**
   * Free movement for things that swim or fly: velocity eases toward a heading that is re-picked
   * every second or two, and a step into a cell they cannot be in turns them around.
   */
  private floatPhysics(m: Mob, env: MobEnv, dt: number): void {
    const b = m.body;
    const swims = !!m.def.aquatic;
    const allowed = (x: number, y: number, z: number): boolean => {
      const id = env.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      return swims ? IS_LIQUID[id] === 1 && !isLavaId(id) : !IS_SOLID[id] && !IS_LIQUID[id];
    };
    m.floatTimer -= dt;
    const fleeing = m.fleeTimer > 0;
    if (m.floatTimer <= 0) {
      m.floatTimer = (swims ? 1.5 : 0.5) + env.rand() * (swims ? 3 : 1.2);
      m.yaw = env.rand() * Math.PI * 2;
      m.floatPitch = (env.rand() - 0.5) * (swims ? 0.7 : 1.4);
      m.floatSpeed = swims && env.rand() < 0.35 ? 0 : m.def.speed * (0.6 + env.rand() * 0.6);
    }
    if (fleeing) {
      m.yaw = Math.atan2(-(b.x - m.fleeX), -(b.z - m.fleeZ));
      m.floatSpeed = m.def.runSpeed;
    }
    // Squids rise no higher than the surface; bats keep clear of the floor and of the open sky.
    const above = allowed(b.x, b.y + m.height + 0.6, b.z);
    if (!above && m.floatPitch > 0) m.floatPitch = -0.2;
    const cp = Math.cos(m.floatPitch);
    const tx = -Math.sin(m.yaw) * cp * m.floatSpeed;
    const ty = Math.sin(m.floatPitch) * m.floatSpeed;
    const tz = -Math.cos(m.yaw) * cp * m.floatSpeed;
    const k = Math.min(1, 3 * dt);
    b.vx += (tx - b.vx) * k;
    b.vy += (ty - b.vy) * k;
    b.vz += (tz - b.vz) * k;

    const hw = m.width / 2;
    const px = b.x;
    const pz = b.z;
    const tryMove = (nx: number, ny: number, nz: number): boolean =>
      allowed(nx, ny + 0.1, nz) && allowed(nx, ny + m.height - 0.1, nz) && allowed(nx + Math.sign(b.vx) * hw, ny + m.height / 2, nz + Math.sign(b.vz) * hw);
    if (tryMove(b.x + b.vx * dt, b.y, b.z)) b.x += b.vx * dt;
    else {
      b.vx = 0;
      m.floatTimer = 0;
    }
    if (tryMove(b.x, b.y, b.z + b.vz * dt)) b.z += b.vz * dt;
    else {
      b.vz = 0;
      m.floatTimer = 0;
    }
    if (tryMove(b.x, b.y + b.vy * dt, b.z)) b.y += b.vy * dt;
    else {
      b.vy = 0;
      m.floatTimer = 0;
    }
    b.onGround = false;
    b.inWater = swims;
    b.inLava = false;
    const moved = Math.hypot(b.x - px, b.z - pz);
    m.speedNow = Math.hypot(b.vx, b.vy, b.vz);
    m.walkPhase += (moved + Math.abs(b.vy) * dt) * (swims ? 3.2 : 9) + dt * (swims ? 2 : 14);
  }

  // ---- fire, idle sounds ------------------------------------------------------

  private environment(m: Mob, env: MobEnv, events: MobEvents, dt: number): void {
    m.exposedTimer -= dt;
    if (m.exposedTimer <= 0) {
      m.exposedTimer = 0.5;
      m.exposed = isExposedToSky(env.world, m.body.x, m.body.y + m.height, m.body.z);
      m.openSky = isOpenToSky(env.world, m.body.x, m.body.y + m.height, m.body.z);
    }
    // Fish out of water and endermen in it come to harm.
    const wet = IS_LIQUID[env.world.getBlock(Math.floor(m.body.x), Math.floor(m.body.y + 0.3), Math.floor(m.body.z))] === 1;
    if ((m.def.aquatic && !wet) || (m.kind === 'enderman' && wet)) {
      m.lavaTimer += dt;
      if (m.lavaTimer >= 0.6) {
        m.lavaTimer = 0;
        this.damage(m, 1, 0, 0, events, true, false);
        if (m.kind === 'enderman') m.pendingTeleport = true;
        if (m.dead) return;
      }
    }
    if (m.body.inLava) {
      m.lavaTimer += dt;
      if (m.lavaTimer >= 0.5) {
        m.lavaTimer = 0;
        this.damage(m, 4, 0, 0, events, true, false);
        if (m.dead) return;
      }
    }
    // Walking into flames sets a mob alight.
    if (!m.body.inWater) {
      const fx = Math.floor(m.body.x);
      const fz = Math.floor(m.body.z);
      if (env.world.getBlock(fx, Math.floor(m.body.y + 0.2), fz) === B.FIRE || env.world.getBlock(fx, Math.floor(m.body.y + m.height * 0.6), fz) === B.FIRE) m.onFire = Math.max(m.onFire, 8);
    }
    const feet = env.world.getBlock(Math.floor(m.body.x), Math.floor(m.body.y + 0.2), Math.floor(m.body.z));
    if (campfireInfo(feet)?.lit) {
      m.campfireTimer += dt;
      if (m.campfireTimer >= 0.5) {
        m.campfireTimer = 0;
        this.damage(m, 1, 0, 0, events, true, false);
        if (m.dead) return;
      }
    }
    if (m.body.inWater) m.onFire = 0;
    else if (m.onFire > 0) m.onFire = Math.max(0, m.onFire - dt);
    m.burning = (m.def.burnsInDaylight && env.daylight > 0.75 && m.exposed && !m.body.inWater) || m.body.inLava === true || m.onFire > 0;
    if (m.burning) {
      m.fireTimer += dt;
      if (m.fireTimer >= 1) {
        m.fireTimer = 0;
        this.damage(m, 1, 0, 0, events, true, false);
      }
    } else {
      m.fireTimer = 0;
    }

    m.sayTimer -= dt;
    if (m.sayTimer <= 0 && !m.dead && m.kind !== 'armor_stand') {
      m.sayTimer = 6 + env.rand() * 10;
      const near = Math.hypot(m.body.x - env.player.x, m.body.z - env.player.z) < 24;
      if (near) events.sound('say', m);
    }
  }

  // ---- AI ----------------------------------------------------------------------

  private think(m: Mob, env: MobEnv, events: MobEvents, dt: number, dist: number): void {
    const cmd = m.cmd;
    cmd.forward = 0;
    cmd.strafe = 0;
    cmd.jump = false;
    cmd.speed = m.def.speed;
    m.attackCooldown -= dt;
    m.shootCooldown -= dt;

    const p = env.player;
    let canTarget = m.def.hostile && p.alive && !p.invulnerable && dist <= m.def.detect;
    // Nobody is hunted inside a soul lantern's ward.
    if (canTarget && env.ward?.(p.x, p.y, p.z)) canTarget = false;
    if (canTarget && m.def.provoke === 'daylight') canTarget = m.aggro || !m.exposed || env.daylight < 0.5;
    if (canTarget && m.def.provoke === 'stare') {
      if (!m.aggro && this.isStaredAt(m, env, dist)) m.aggro = true;
      canTarget = m.aggro;
    }

    if (m.kind === 'enderman') this.thinkTeleport(m, env, dt, dist, canTarget);

    if (m.kind === 'npc') {
      this.thinkNpc(m, env);
      return;
    }
    if (m.kind === 'dummy') {
      this.thinkDummy(m, dt);
      return;
    }
    if (m.kind === 'armor_stand') {
      m.yaw = m.homeYaw;
      return;
    }

    if (m.def.flying || m.def.aquatic) {
      // Handled by floatPhysics; just keep the timers running.
      if (m.fleeTimer > 0) m.fleeTimer -= dt;
      if (m.def.aquatic && !this.inLiquid(env, m.body)) this.wander(m, env, dt);
      return;
    }

    // A monster inside the ward of a soul lantern turns and walks out of it.
    if (m.def.hostile && env.ward) {
      const w = env.ward(m.body.x, m.body.y, m.body.z);
      if (w) {
        m.fleeX = w.x;
        m.fleeZ = w.z;
        m.path = null;
        m.fuse = -1;
        this.flee(m, env, dt);
        return;
      }
    }

    if (m.fleeTimer > 0) {
      m.fleeTimer -= dt;
      this.flee(m, env, dt);
      return;
    }

    if (m.kind === 'villager') {
      this.thinkVillager(m, env, events, dt);
      return;
    }

    // Zombies go for villagers too, whichever is closer.
    const realPlayer = env.player;
    let targetDist = dist;
    if ((m.def.behaves ?? m.kind) === 'zombie') {
      const victim = this.nearestVillager(m, 14);
      if (victim) {
        const vd = Math.hypot(victim.body.x - m.body.x, victim.body.z - m.body.z);
        if (!canTarget || vd < dist) {
          env.player = { x: victim.body.x, y: victim.body.y, z: victim.body.z, alive: true, invulnerable: false, ref: victim };
          targetDist = vd;
          canTarget = true;
        }
      }
    }

    if (!canTarget) {
      if (m.fuse >= 0) m.fuse = -1;
      if (m.love > 0 && this.seekMate(m, env)) return;
      m.path = null;
      this.wander(m, env, dt);
      return;
    }

    switch (m.def.behaves ?? m.kind) {
      case 'zombie':
        this.thinkZombie(m, env, events, dt, targetDist);
        env.player = realPlayer;
        break;
      case 'skeleton':
        this.thinkSkeleton(m, env, events, dt, dist);
        break;
      case 'spider':
        this.thinkSpider(m, env, events, dt, dist);
        break;
      case 'creeper':
        this.thinkCreeper(m, env, events, dt, dist);
        break;
      case 'slime':
        this.thinkSlime(m, env, events, dt, dist);
        break;
      default:
        this.wander(m, env, dt);
    }
  }

  /** An animal in love walks to the closest mate of its kind. Returns whether it is on its way. */
  private seekMate(m: Mob, env: MobEnv): boolean {
    let best: Mob | null = null;
    let bestD = 14;
    for (const o of this.mobs) {
      if (o === m || o.kind !== m.kind || o.love <= 0 || o.dead || o.baby) continue;
      const d = Math.hypot(o.body.x - m.body.x, o.body.z - m.body.z);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    if (!best) return false;
    this.walkTo(m, env, best.body.x, best.body.z, best.body.y, m.def.runSpeed * 0.7);
    return true;
  }

  /** Between hops a rabbit or slime stands still; a push to move becomes a jump. */
  private hop(m: Mob, dt: number, rand: () => number): void {
    const cmd = m.cmd;
    m.hopTimer -= dt;
    if (!m.body.onGround) return;
    if (cmd.forward === 0 && !cmd.jump) return;
    if (m.hopTimer > 0) {
      cmd.forward = 0;
      cmd.jump = false;
      return;
    }
    cmd.jump = true;
    m.hopTimer = (m.kind === 'slime' ? 0.55 : 0.32) + rand() * 0.3;
  }

  /** Has the player's crosshair been on this mob (an enderman's trigger)? */
  private isStaredAt(m: Mob, env: MobEnv, dist: number): boolean {
    const p = env.player;
    if (p.yaw === undefined || p.pitch === undefined || dist > 48) return false;
    const ex = m.body.x - p.x;
    const ey = m.body.y + m.height * 0.85 - (p.y + 1.62);
    const ez = m.body.z - p.z;
    const len = Math.hypot(ex, ey, ez) || 1;
    const cp = Math.cos(p.pitch);
    const dot = (ex * -Math.sin(p.yaw) * cp + ey * Math.sin(p.pitch) + ez * -Math.cos(p.yaw) * cp) / len;
    if (dot < 1 - 0.025 / Math.max(1, len * 0.06)) return false;
    const hit = raycast(env.world, p.x, p.y + 1.62, p.z, ex / len, ey / len, ez / len, len);
    return !hit;
  }

  /**
   * Endermen blink: to a player they are hunting once that player is far off (never while fighting up close),
   * away from water or an arrow, and, when caught out in the open by day, off to somewhere covered.
   */
  private thinkTeleport(m: Mob, env: MobEnv, dt: number, dist: number, hunting: boolean): void {
    m.teleportTimer -= dt;
    const sunburnt = env.daylight > 0.6 && m.openSky && !m.aggro;
    if (sunburnt && m.teleportTimer <= 0) m.pendingTeleport = true;
    const far = hunting && dist > ENDERMAN_TELEPORT_RANGE;
    if (!m.pendingTeleport && (m.teleportTimer > 0 || !far)) return;
    if (m.teleportTimer <= 0) m.teleportTimer = 3 + env.rand() * 5;
    const toward = far && !m.pendingTeleport;
    const shade = sunburnt && !toward;
    m.pendingTeleport = false;
    const p = env.player;
    for (let i = 0; i < (shade ? 30 : 12); i++) {
      const a = env.rand() * Math.PI * 2;
      const r = toward ? 4 + env.rand() * 3 : 8 + env.rand() * 10;
      const x = Math.floor((toward ? p.x : m.body.x) + Math.cos(a) * r);
      const z = Math.floor((toward ? p.z : m.body.z) + Math.sin(a) * r);
      const y0 = Math.floor((toward ? p.y : m.body.y) + 4);
      for (let y = y0; y > y0 - 12 && y > 1; y--) {
        if (!IS_SOLID[env.world.getBlock(x, y - 1, z)] || IS_LIQUID[env.world.getBlock(x, y - 1, z)]) continue;
        let clear = true;
        for (let k = 0; k < 3 && clear; k++) {
          const id = env.world.getBlock(x, y + k, z);
          if (IS_SOLID[id] || IS_LIQUID[id]) clear = false;
        }
        if (!clear) break;
        if (shade && isOpenToSky(env.world, x + 0.5, y, z + 0.5)) break;
        m.body.x = x + 0.5;
        m.body.y = y;
        m.body.z = z + 0.5;
        m.body.vx = m.body.vz = m.body.vy = 0;
        m.path = null;
        m.teleported = true;
        return;
      }
    }
  }

  /** Does the mob need to jump to keep walking along (dx,dz)? */
  private blockedAhead(m: Mob, env: MobEnv, dx: number, dz: number): boolean {
    const b = m.body;
    const len = Math.hypot(dx, dz) || 1;
    const reach = m.width / 2 + 0.3;
    const ax = b.x + (dx / len) * reach;
    const az = b.z + (dz / len) * reach;
    return solidAt(env.world, ax, b.y + 0.1, az) && !solidAt(env.world, ax, b.y + 1.1, az) && !solidAt(env.world, ax, b.y + 2.1, az);
  }

  /** Walk toward a point. `speed` is in blocks/s. */
  private walkTo(m: Mob, env: MobEnv, tx: number, tz: number, ty: number, speed: number): boolean {
    const b = m.body;
    const dx = tx - b.x;
    const dz = tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) return true;
    m.yaw = Math.atan2(-dx, -dz);
    m.cmd.forward = 1;
    m.cmd.speed = speed;
    const wantsUp = ty > b.y + 0.6;
    if (b.onGround && (wantsUp || this.blockedAhead(m, env, dx, dz))) m.cmd.jump = true;
    if (b.inWater) m.cmd.jump = true;
    return false;
  }

  /** True when there is no ground (within 2 blocks) in front of the mob. */
  private cliffAhead(m: Mob, env: MobEnv, yaw: number): boolean {
    const b = m.body;
    const ax = b.x - Math.sin(yaw) * (m.width / 2 + 0.7);
    const az = b.z - Math.cos(yaw) * (m.width / 2 + 0.7);
    for (let d = 0; d <= 2; d++) if (solidAt(env.world, ax, b.y - 0.5 - d, az)) return false;
    return true;
  }

  private wander(m: Mob, env: MobEnv, dt: number): void {
    m.wanderTimer -= dt;
    if (m.wanderTimer <= 0) {
      m.wandering = env.rand() < 0.55;
      m.wanderTimer = m.wandering ? 2 + env.rand() * 3 : 2 + env.rand() * 4;
      m.wanderYaw = env.rand() * Math.PI * 2;
    }
    if (!m.wandering) return;
    if (this.cliffAhead(m, env, m.wanderYaw)) {
      m.wanderYaw += Math.PI * (0.6 + env.rand() * 0.8);
      return;
    }
    m.yaw = m.wanderYaw;
    m.cmd.forward = 1;
    m.cmd.speed = m.def.speed;
    const dx = -Math.sin(m.yaw);
    const dz = -Math.cos(m.yaw);
    if (m.body.onGround && this.blockedAhead(m, env, dx, dz)) m.cmd.jump = true;
    if (m.body.inWater) m.cmd.jump = true;

    // Walked into something it can't climb: choose a new heading.
    m.stuckTimer += dt;
    if (m.stuckTimer > 0.6) {
      const moved = Math.hypot(m.body.x - m.lastX, m.body.z - m.lastZ);
      if (moved < 0.15) m.wanderYaw = env.rand() * Math.PI * 2;
      m.lastX = m.body.x;
      m.lastZ = m.body.z;
      m.stuckTimer = 0;
    }
  }

  private flee(m: Mob, env: MobEnv, dt: number): void {
    const dx = m.body.x - m.fleeX;
    const dz = m.body.z - m.fleeZ;
    let yaw = Math.atan2(-dx, -dz);
    if (this.cliffAhead(m, env, yaw)) yaw += Math.PI / 2;
    m.yaw = yaw;
    m.cmd.forward = 1;
    m.cmd.speed = m.def.runSpeed;
    if (m.body.onGround && this.blockedAhead(m, env, -Math.sin(yaw), -Math.cos(yaw))) m.cmd.jump = true;
    if (m.body.inWater) m.cmd.jump = true;
    void dt;
  }

  /** Follow (and periodically refresh) an A* path toward the player. */
  private chase(m: Mob, env: MobEnv, dt: number, goalDist: number, speed: number): void {
    const b = m.body;
    const p = env.player;
    m.repathTimer -= dt;
    if (m.repathTimer <= 0 || !m.path) {
      m.repathTimer = 0.6 + env.rand() * 0.3;
      m.path = findPath(env.world, b.x, b.y + 0.1, b.z, p.x, p.y + 0.1, p.z, { goalDist, maxNodes: 380, maxDrop: 3 });
      m.pathIndex = 0;
    }
    const flatDist = Math.hypot(p.x - b.x, p.z - b.z);
    const path = m.path;

    // Close and roughly level with a clear line: go straight.
    if (flatDist < 2.5 && Math.abs(p.y - b.y) < 1.2) {
      // Arrived: stand in front of the player and face them, instead of walking into their body.
      if (goalDist < 2 && flatDist < goalDist) {
        this.face(m, p.x, p.z);
        m.cmd.forward = 0;
        m.cmd.speed = 0;
        return;
      }
      this.walkTo(m, env, p.x, p.z, p.y, speed);
      return;
    }
    if (!path || path.length === 0) {
      // No route: shuffle toward the player anyway so the mob doesn't freeze.
      this.walkTo(m, env, p.x, p.z, b.y, speed * 0.6);
      return;
    }
    // A climber ignores a route that only gets part of the way: walls are no obstacle to it.
    if (m.def.climbs) {
      const end = path[path.length - 1];
      if (Math.hypot(end.x + 0.5 - p.x, end.z + 0.5 - p.z) > goalDist + 2.5) {
        this.walkTo(m, env, p.x, p.z, p.y, speed);
        return;
      }
    }
    while (m.pathIndex < path.length) {
      const n = path[m.pathIndex];
      if (Math.hypot(n.x + 0.5 - b.x, n.z + 0.5 - b.z) < 0.4 && Math.abs(n.y - b.y) < 1.2) m.pathIndex++;
      else break;
    }
    const n = path[Math.min(m.pathIndex, path.length - 1)];
    this.walkTo(m, env, n.x + 0.5, n.z + 0.5, n.y, speed);

    m.stuckTimer += dt;
    if (m.stuckTimer > 0.8) {
      const moved = Math.hypot(b.x - m.lastX, b.z - m.lastZ);
      if (moved < 0.1) m.repathTimer = 0;
      m.lastX = b.x;
      m.lastZ = b.z;
      m.stuckTimer = 0;
    }
  }

  private face(m: Mob, tx: number, tz: number): void {
    m.yaw = Math.atan2(-(tx - m.body.x), -(tz - m.body.z));
  }

  private thinkZombie(m: Mob, env: MobEnv, events: MobEvents, dt: number, dist: number): void {
    const p = env.player;
    const melee = m.def.melee!;
    this.chase(m, env, dt, 0.9, m.def.runSpeed);
    const dy = p.y - m.body.y;
    if (dist < melee.reach + 0.3 && dy > -1.2 && dy < 1.7 && m.attackCooldown <= 0) {
      m.attackCooldown = melee.cooldown;
      m.attackTime = 0; // the swing is shown whatever happens to the blow (a raised shield stops it, the mob still swings)
      this.face(m, p.x, p.z);
      const len = dist || 1;
      const kx = (p.x - m.body.x) / len;
      const kz = (p.z - m.body.z) / len;
      if (p.ref instanceof Mob) this.damage(p.ref, melee.damage, kx, kz, events);
      else events.hurtPlayer(melee.damage, kx, kz, m.kind, p);
    }
  }

  /** The closest living villager within `r` blocks (and a few up or down). */
  private nearestVillager(m: Mob, r: number): Mob | null {
    let best: Mob | null = null;
    let bestD = r * r;
    for (const v of this.mobs) {
      if (v.kind !== 'villager' || v.dead || Math.abs(v.body.y - m.body.y) > 5) continue;
      const d = (v.body.x - m.body.x) ** 2 + (v.body.z - m.body.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  /** The nearest zombie (or husk, or drowned) within `r` blocks: what a villager runs from. */
  private nearestZombie(m: Mob, r: number): Mob | null {
    let best: Mob | null = null;
    let bestD = r * r;
    for (const z of this.mobs) {
      if (z.dead || !z.def.hostile || (z.def.behaves ?? z.kind) !== 'zombie' || Math.abs(z.body.y - m.body.y) > 5) continue;
      const d = (z.body.x - m.body.x) ** 2 + (z.body.z - m.body.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return best;
  }

  // ---- quest givers ----------------------------------------------------------

  /** A quest giver stays put and turns to whoever comes near, then back to where it faced. */
  /** A training dummy stands and faces the way it was put, and mends itself a moment after the last hit. */
  private thinkDummy(m: Mob, dt: number): void {
    m.yaw = m.homeYaw;
    if (m.sincePlayerHit > 4 && m.health < m.maxHealth) m.health = Math.min(m.maxHealth, m.health + m.maxHealth * 0.5 * dt);
  }

  private thinkNpc(m: Mob, env: MobEnv): void {
    const p = env.player;
    const near = p.alive && Math.hypot(p.x - m.body.x, p.z - m.body.z) <= NPC_NOTICE && Math.abs(p.y - m.body.y) < 4;
    if (near) this.face(m, p.x, p.z);
    else m.yaw = m.homeYaw;
  }

  // ---- villagers -------------------------------------------------------------

  private thinkVillager(m: Mob, env: MobEnv, events: MobEvents, dt: number): void {
    this.tickDoors(m, events, dt);
    // Talking to someone: stand still and look at them.
    if (m.customer) {
      this.face(m, m.customer.body.x, m.customer.body.z);
      return;
    }
    // A zombie close by: run.
    const threat = this.nearestZombie(m, 9);
    if (threat) {
      m.fleeX = threat.body.x;
      m.fleeZ = threat.body.z;
      this.flee(m, env, dt);
      this.openDoorAhead(m, env, events);
      return;
    }
    const v = m.villager;
    const b = m.body;
    const night = env.daylight < 0.3;
    if (v) {
      const dHome = Math.hypot(b.x - v.homeX, b.z - v.homeZ);
      // At night everyone is indoors; by day nobody strays far from home.
      if (night ? dHome > 1.4 || Math.abs(b.y - v.homeY) > 1.5 : dHome > VILLAGER_LEASH) {
        this.goTo(m, env, v.homeX, v.homeY, v.homeZ, dt, night ? m.def.speed * 1.5 : m.def.speed);
        this.openDoorAhead(m, env, events);
        return;
      }
      m.path = null;
      if (night) return;
    }
    this.wander(m, env, dt);
    this.openDoorAhead(m, env, events);
  }

  /** Walk to a place along a path that goes through doors (opening them as it goes). */
  private goTo(m: Mob, env: MobEnv, tx: number, ty: number, tz: number, dt: number, speed: number): void {
    const b = m.body;
    m.repathTimer -= dt;
    if (m.repathTimer <= 0 || !m.path) {
      m.repathTimer = 1 + env.rand() * 0.5;
      m.path = findPath(env.world, b.x, b.y + 0.1, b.z, tx, ty, tz, { goalDist: 0.7, maxNodes: 1200, maxDrop: 3, doors: true });
      m.pathIndex = 0;
    }
    const path = m.path;
    if (!path || path.length === 0) {
      this.walkTo(m, env, tx, tz, ty, speed * 0.7);
      return;
    }
    while (m.pathIndex < path.length) {
      const n = path[m.pathIndex];
      if (Math.hypot(n.x + 0.5 - b.x, n.z + 0.5 - b.z) < 0.4 && Math.abs(n.y - b.y) < 1.2) m.pathIndex++;
      else break;
    }
    const n = path[Math.min(m.pathIndex, path.length - 1)];
    this.walkTo(m, env, n.x + 0.5, n.z + 0.5, n.y, speed);
    m.stuckTimer += dt;
    if (m.stuckTimer > 0.8) {
      if (Math.hypot(b.x - m.lastX, b.z - m.lastZ) < 0.1) m.repathTimer = 0;
      m.lastX = b.x;
      m.lastZ = b.z;
      m.stuckTimer = 0;
    }
  }

  /** If the villager is walking into a closed door, open it. */
  private openDoorAhead(m: Mob, env: MobEnv, events: MobEvents): void {
    if (!events.door || m.cmd.forward <= 0) return;
    const b = m.body;
    const reach = m.width / 2 + 0.5;
    const x = Math.floor(b.x - Math.sin(m.yaw) * reach);
    const z = Math.floor(b.z - Math.cos(m.yaw) * reach);
    const y = Math.floor(b.y + 0.1);
    const d = doorInfo(env.world.getBlock(x, y, z));
    if (!d || d.open) return;
    const lower = d.upper ? y - 1 : y;
    if (events.door(x, lower, z, true) && !m.openDoors.some((o) => o.x === x && o.y === lower && o.z === z)) m.openDoors.push({ x, y: lower, z, t: 0 });
  }

  /** Close the doors it opened once it is past them. */
  private tickDoors(m: Mob, events: MobEvents, dt: number): void {
    if (m.openDoors.length === 0 || !events.door) return;
    for (let i = m.openDoors.length - 1; i >= 0; i--) {
      const d = m.openDoors[i];
      d.t += dt;
      if (d.t < 1.2 || Math.hypot(m.body.x - (d.x + 0.5), m.body.z - (d.z + 0.5)) < 1.6) continue;
      if (events.door(d.x, d.y, d.z, false)) m.openDoors.splice(i, 1);
      else d.t = 0;
    }
  }



  /** Spiders run at the player and pounce from a few blocks away. */
  private thinkSpider(m: Mob, env: MobEnv, events: MobEvents, dt: number, dist: number): void {
    const p = env.player;
    const melee = m.def.melee!;
    m.leapCooldown -= dt;
    this.chase(m, env, dt, 0.9, m.def.runSpeed);
    const dy = p.y - m.body.y;
    if (m.def.kind === 'spider' && m.body.onGround && dist > 2.2 && dist < 5.5 && m.leapCooldown <= 0 && Math.abs(dy) < 1.5 && this.hasLineOfSight(m, env)) {
      m.leapCooldown = 2.2 + env.rand();
      const len = dist || 1;
      m.body.vx = ((p.x - m.body.x) / len) * 7;
      m.body.vz = ((p.z - m.body.z) / len) * 7;
      m.body.vy = 5.5;
      this.face(m, p.x, p.z);
    }
    if (dist < melee.reach + 0.4 && dy > -1.2 && dy < 1.5 && m.attackCooldown <= 0) {
      m.attackCooldown = melee.cooldown;
      m.attackTime = 0;
      this.face(m, p.x, p.z);
      const len = dist || 1;
      events.hurtPlayer(melee.damage, (p.x - m.body.x) / len, (p.z - m.body.z) / len, m.kind, p, melee.effect);
    }
  }

  /** Slimes hop after the player and bump into them (the tiny ones are harmless). */
  private thinkSlime(m: Mob, env: MobEnv, events: MobEvents, dt: number, dist: number): void {
    const p = env.player;
    this.chase(m, env, dt, 0.7 + m.width * 0.5, m.def.runSpeed);
    const melee = m.def.melee!;
    const dy = p.y - m.body.y;
    if (m.size > 1 && dist < m.width / 2 + 0.7 && dy > -1.2 && dy < m.height + 0.9 && m.attackCooldown <= 0) {
      m.attackCooldown = melee.cooldown;
      m.attackTime = 0;
      const len = dist || 1;
      events.hurtPlayer(m.size === 2 ? 2 : 4, (p.x - m.body.x) / len, (p.z - m.body.z) / len, 'slime', p);
    }
  }

  private hasLineOfSight(m: Mob, env: MobEnv): boolean {
    const p = env.player;
    const ox = m.body.x;
    const oy = m.eyeY;
    const oz = m.body.z;
    const tx = p.x;
    const ty = p.y + 1.0;
    const tz = p.z;
    const dx = tx - ox;
    const dy = ty - oy;
    const dz = tz - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    const hit = raycast(env.world, ox, oy, oz, dx / len, dy / len, dz / len, len);
    return !hit;
  }

  private thinkSkeleton(m: Mob, env: MobEnv, events: MobEvents, dt: number, dist: number): void {
    const p = env.player;
    const los = this.hasLineOfSight(m, env);
    this.face(m, p.x, p.z);

    m.strafeTimer -= dt;
    if (m.strafeTimer <= 0) {
      m.strafeTimer = 1.5 + env.rand() * 2;
      m.strafeDir = env.rand() < 0.5 ? -1 : 1;
    }

    if (!los || dist > 13) {
      this.chase(m, env, dt, 8, m.def.runSpeed);
    } else if (dist < 5) {
      // Back away while keeping the player in view.
      m.cmd.forward = -1;
      m.cmd.strafe = m.strafeDir * 0.4;
      m.cmd.speed = m.def.runSpeed;
      if (this.cliffAhead(m, env, m.yaw + Math.PI)) m.cmd.forward = 0;
    } else {
      m.cmd.strafe = m.strafeDir * 0.6;
      m.cmd.speed = m.def.speed;
    }

    if (los && dist < 16 && m.shootCooldown <= 0) {
      m.shootCooldown = 1.8 + env.rand() * 0.8;
      m.attackTime = 0; // the string hand springs loose (shown on the bow)
      const ox = m.body.x;
      const oy = m.eyeY - 0.1;
      const oz = m.body.z;
      // Lead the shot upward to compensate for gravity over the flight time.
      const flight = dist / ARROW_SPEED;
      const tx = p.x + (env.rand() - 0.5) * 0.5;
      const ty = p.y + 1.0 + 0.5 * ARROW_GRAVITY * flight * flight;
      const tz = p.z + (env.rand() - 0.5) * 0.5;
      const dx = tx - ox;
      const dy = ty - oy;
      const dz = tz - oz;
      const len = Math.hypot(dx, dy, dz) || 1;
      this.arrows.push(new Arrow(ox, oy, oz, (dx / len) * ARROW_SPEED, (dy / len) * ARROW_SPEED, (dz / len) * ARROW_SPEED));
      events.sound('shoot', m);
    }
  }

  private thinkCreeper(m: Mob, env: MobEnv, events: MobEvents, dt: number, dist: number): void {
    const p = env.player;
    if (m.fuse >= 0) {
      if (dist > CREEPER_ABORT) {
        m.fuse = -1; // player escaped
      } else {
        m.fuse += dt;
        this.face(m, p.x, p.z);
        if (m.fuse >= CREEPER_FUSE) {
          m.noDrops = true;
          m.fuse = -1;
          events.explode(m.body.x, m.body.y + 0.6, m.body.z, EXPLOSION_RADIUS, m);
          this.kill(m, events, false);
        }
        return; // stand still while hissing
      }
    }
    if (dist < CREEPER_TRIGGER && Math.abs(p.y - m.body.y) < 2.5) {
      m.fuse = 0;
      events.sound('hiss', m);
      return;
    }
    this.chase(m, env, dt, 1.5, m.def.runSpeed);
  }

  // ---- arrows ---------------------------------------------------------------------

  /** Returns true when the arrow should be removed. */
  private stepArrow(a: Arrow, env: MobEnv, players: readonly MobPlayer[], events: MobEvents, dt: number): boolean {
    a.age += dt;
    if (a.age > 8) return true;
    a.vy -= a.gravity * dt;
    const nx = a.x + a.vx * dt;
    const ny = a.y + a.vy * dt;
    const nz = a.z + a.vz * dt;

    // The step is walked in short pieces: an arrow at full draw covers several blocks a tick and would fly through a thin wall otherwise.
    // `entry` is how far along the step it is when it goes into a block (1: it does not), found to a fine fraction of a block.
    const dist = Math.hypot(nx - a.x, ny - a.y, nz - a.z);
    const pieces = Math.max(1, Math.ceil(dist / 0.4));
    const at = (f: number): boolean => solidAt(env.world, a.x + (nx - a.x) * f, a.y + (ny - a.y) * f, a.z + (nz - a.z) * f);
    let entry = 1;
    for (let k = 1; k <= pieces; k++) {
      if (!at(k / pieces)) continue;
      let lo = (k - 1) / pieces;
      let hi = k / pieces;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid)) hi = mid;
        else lo = mid;
      }
      entry = lo;
      break;
    }
    const wall = entry < 1;
    // where it flies to (the end of the step, or the face of the block it hits)
    const ex = a.x + (nx - a.x) * entry;
    const ey = a.y + (ny - a.y) * entry;
    const ez = a.z + (nz - a.z) * entry;

    if (a.friendly) {
      // Sweep the step against every living mob (up to the wall, when the arrow meets one).
      const sx = ex - a.x;
      const sy = ey - a.y;
      const sz = ez - a.z;
      const len = Math.hypot(sx, sy, sz) || 1;
      let best: { mob: Mob; t: number } | null = null;
      if (len > 1e-6) {
        for (const m of this.mobs) {
          if (m.dead) continue;
          const t = m.hitDistance(a.x, a.y, a.z, sx / len, sy / len, sz / len, len, ARROW_MARGIN);
          if (t !== null && (!best || t < best.t)) best = { mob: m, t };
        }
      }
      if (best && a.impact) {
        a.impact(ex, ey, ez, best.mob);
        return true;
      }
      if (best && a.bottle) {
        events.shatter?.(a.x, a.y, a.z);
        return true;
      }
      if (best && a.pearl) {
        events.pearl?.(a.x, a.y, a.z, a.pearl);
        return true;
      }
      if (best) {
        // Endermen blink out of the way of nearly every arrow, taking nothing, and then come for the archer.
        if (best.mob.kind === 'enderman' && env.rand() < 0.9) {
          best.mob.aggro = true;
          best.mob.pendingTeleport = true;
          return true;
        }
        const hlen = Math.hypot(a.vx, a.vz) || 1;
        // A player's arrow that strikes the upper fifth of something tall (a head) hits half as hard again.
        const m = best.mob;
        const head = !!a.onHit && m.height >= 1.2 && a.y + (sy / len) * best.t >= m.body.y + m.height * 0.8;
        const dealt = head ? a.damage * 1.5 : a.damage;
        this.damage(m, dealt, a.vx / hlen, a.vz / hlen, events, true, true, true, { knock: 1 + a.punch, fire: a.fire ? 5 : 0 });
        a.onHit?.(a, m, dealt, head);
        return true;
      }
    }

    if (wall) {
      // It stopped in the wall or the ground: `a` is left where it went in (and still points the way it flew).
      a.x = ex;
      a.y = ey;
      a.z = ez;
      if (a.impact) a.impact(a.x, a.y, a.z, null);
      a.onHit?.(a, null, 0, false);
      if (a.bottle) events.shatter?.(a.x, a.y, a.z);
      if (a.pearl) events.pearl?.(a.x, a.y, a.z, a.pearl);
      return true;
    }
    if (a.friendly) {
      a.x = nx;
      a.y = ny;
      a.z = nz;
      return false;
    }
    for (const p of players) {
      if (!p.alive || p.invulnerable) continue;
      const hw = 0.3;
      if (nx > p.x - hw && nx < p.x + hw && nz > p.z - hw && nz < p.z + hw && ny > p.y && ny < p.y + 1.8) {
        const len = Math.hypot(a.vx, a.vz) || 1;
        events.hurtPlayer(a.damage, a.vx / len, a.vz / len, 'arrow', p);
        return true;
      }
    }
    a.x = nx;
    a.y = ny;
    a.z = nz;
    return false;
  }

  /** Class abilities: stun, slow or root a mob (the longer effect of each kind wins). Bosses and quest givers are not affected. */
  applyStatus(mob: Mob, s: { stun?: number; slow?: { mult: number; seconds: number }; root?: number }): void {
    if (mob.dead || mob.def.invulnerable) return;
    if (s.stun) mob.stunTime = Math.max(mob.stunTime, s.stun);
    if (s.root) mob.rootTime = Math.max(mob.rootTime, s.root);
    if (s.slow) {
      mob.slowMul = mob.slowTime > 0 ? Math.min(mob.slowMul, s.slow.mult) : s.slow.mult;
      mob.slowTime = Math.max(mob.slowTime, s.slow.seconds);
    }
  }

  /** Apply an explosion to mobs near it (the world/player parts are handled by the caller). */
  explosionDamage(x: number, y: number, z: number, radius: number, events: MobEvents, except?: Mob): void {
    for (const m of this.mobs) {
      if (m === except || m.dead) continue;
      const d = Math.hypot(m.body.x - x, m.body.y + m.height / 2 - y, m.body.z - z);
      if (d < radius * 2) this.damage(m, (1 - d / (radius * 2)) * 20, m.body.x - x, m.body.z - z, events, true);
    }
  }
}

// ---------------------------------------------------------------------------
// Spawning

export interface SpawnEnv {
  world: BlockReader;
  player: { x: number; y: number; z: number };
  /** Spawn around each of these instead when given (multiplayer). */
  players?: readonly { x: number; y: number; z: number }[];
  daylight: number;
  rand: () => number;
  /** Is this chunk one of the few where slimes breed underground? */
  slimeChunk?: (cx: number, cz: number) => boolean;
  /** Nothing is spawned around a player here (a dungeon makes its own monsters). */
  quiet?: (player: { x: number; y: number; z: number }) => boolean;
  /** No monster is born at this spot (a village and the ground around it). */
  noMonsters?: (x: number, z: number, y?: number) => boolean;
  /** The animals of the land here, most common first (the World Beyond's biomes each have their own); null leaves it to the ground. */
  wildlife?: (x: number, z: number) => readonly MobKind[] | null;
}

export const PASSIVE_CAP = 10;
export const HOSTILE_CAP = 16;
const SQUID_CAP = 5;
const WATER_CAP = 8;
const BAT_CAP = 4;
const DROWNED_CAP = 3;

type Pool = readonly (readonly [MobKind, number])[];

function draw(rand: () => number, pool: Pool): MobKind {
  const total = pool.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [kind, w] of pool) {
    r -= w;
    if (r < 0) return kind;
  }
  return pool[0][0];
}

/** What spawns where: the ground under a mob says which biome it is in. */
const PASSIVE_GRASS: Pool = [
  ['pig', 2], ['cow', 2], ['sheep', 3], ['chicken', 2], ['rabbit', 1.4],
  ['horse', 0.55], ['donkey', 0.3], ['llama', 0.3], ['trader_llama', 0.1],
  ['wolf', 0.3], ['fox', 0.4], ['cat', 0.25], ['ocelot', 0.18],
  ['parrot', 0.22], ['panda', 0.12], ['frog', 0.28],
  ['bee', 0.35], ['allay', 0.1],
  ['turtle', 0.12], ['sniffer', 0.06], ['armadillo', 0.12],
];
const PASSIVE_SNOW: Pool = [['rabbit', 5], ['fox', 2], ['goat', 2], ['polar_bear', 0.6]];
const PASSIVE_SAND: Pool = [['rabbit', 4], ['camel', 1.5], ['armadillo', 2]];
const WATER_SURFACE: Pool = [['squid', 3], ['glow_squid', 1], ['cod', 3], ['salmon', 2], ['tropical_fish', 1], ['pufferfish', 1], ['dolphin', 1], ['tadpole', 1]];
const WATER_CAVE: Pool = [['axolotl', 3], ['glow_squid', 2], ['cod', 1]];
const WATER_KINDS: readonly MobKind[] = ['squid', 'glow_squid', 'cod', 'salmon', 'tropical_fish', 'pufferfish', 'dolphin', 'tadpole', 'axolotl'];
const HOSTILE_CAVE: Pool = [['zombie', 3], ['skeleton', 3], ['creeper', 2], ['spider', 3], ['enderman', 0.4]];
const HOSTILE_DESERT: Pool = [['husk', 4], ['skeleton', 1], ['creeper', 2], ['spider', 2], ['enderman', 0.5]];
const HOSTILE_SNOW: Pool = [['stray', 4], ['zombie', 1], ['creeper', 2], ['spider', 2], ['enderman', 0.5]];
const HOSTILE_LAND: Pool = [['zombie', 3], ['skeleton', 2], ['creeper', 2], ['spider', 2], ['enderman', 0.6]];

/** Can a mob of this height stand with its feet in cell (x,y,z)? Returns the block under it or 0. */
function standingOn(world: BlockReader, x: number, y: number, z: number): number {
  const below = world.getBlock(x, y - 1, z);
  if (!IS_SOLID[below] || IS_LIQUID[below] || IS_LEAVES[below]) return 0;
  for (const dy of [0, 1]) {
    const id = world.getBlock(x, y + dy, z);
    if (IS_SOLID[id] || IS_LIQUID[id]) return 0;
  }
  return below;
}

const isSnowGround = (id: number): boolean => id === B.SNOW || id === B.SNOW_BLOCK || id === B.ICE || id === B.PACKED_ICE;
const isSandGround = (id: number): boolean =>
  id === B.SAND || id === B.SANDSTONE || id === B.RED_SAND || id === B.RED_SANDSTONE || (id >= B.TERRACOTTA && id <= B.TERRACOTTA_LIGHT_GRAY);
/** Soil that grows a grass biome's animals: plain grass, and the forest floor of the taiga. */
const isGrassGround = (id: number): boolean => id === B.GRASS || id === B.PODZOL || id === B.COARSE_DIRT;

export class MobSpawner {
  private timer = 0;
  /** Attempt interval (seconds). */
  interval = 0.6;

  /** Returns the mobs spawned this call. */
  update(dt: number, manager: MobManager, env: SpawnEnv): Mob[] {
    this.timer += dt;
    if (this.timer < this.interval) return [];
    this.timer = 0;
    const out: Mob[] = [];
    const { rand } = env;
    const list = env.players && env.players.length > 0 ? env.players : [env.player];
    for (const player of list) {
      if (env.quiet?.(player)) continue;
      const penv: SpawnEnv = { ...env, player };
      if (env.daylight > 0.55 && manager.countNear(player.x, player.z, 64, false) < PASSIVE_CAP) {
        out.push(...this.trySpawn(manager, penv, false));
      }
      if (manager.countNear(player.x, player.z, 64, true) < HOSTILE_CAP && rand() < 0.8) {
        out.push(...this.trySpawn(manager, penv, true));
      }
      if (rand() < 0.4) out.push(...this.trySpawnWater(manager, penv));
      if (rand() < 0.25) out.push(...this.trySpawnBat(manager, penv));
    }
    return out;
  }

  private trySpawn(manager: MobManager, env: SpawnEnv, hostile: boolean): Mob[] {
    const { world, player, rand } = env;
    const ang = rand() * Math.PI * 2;
    const r = (hostile ? 20 : 16) + rand() * (hostile ? 16 : 24);
    const x = Math.floor(player.x + Math.cos(ang) * r);
    const z = Math.floor(player.z + Math.sin(ang) * r);

    // Scan down from a random height around the player: finds surface spots and cave floors.
    let y = Math.floor(player.y) + Math.floor(rand() * 18) - 12;
    let found = -1;
    for (let i = 0; i < 18; i++, y--) {
      if (y < 1) break;
      if (standingOn(world, x, y, z)) {
        found = y;
        break;
      }
    }
    if (found < 0) return [];
    const below = world.getBlock(x, found - 1, z);
    // Light, not shade: a forest floor under thin leaves is still in daylight.
    const exposed = isOpenToSky(world, x, found, z);

    if (hostile) {
      if (env.noMonsters?.(x, z, found)) return [];
      if (nearLight(world, x, found, z, 5)) return [];
      if (exposed && env.daylight > 0.4) return [];
      // Deep in the rock of a slime chunk, the odd slime.
      if (!exposed && found < 42 && env.slimeChunk?.(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)) && rand() < 0.5) {
        const size = SLIME_SIZES[Math.floor(rand() * SLIME_SIZES.length)];
        return [manager.spawn('slime', x + 0.5, found, z + 0.5, { size })];
      }
      // No monsters are born on a mushroom field, above ground.
      if (exposed && below === B.MYCELIUM) return [];
      const pool = !exposed ? HOSTILE_CAVE : isSandGround(below) ? HOSTILE_DESERT : isSnowGround(below) ? HOSTILE_SNOW : HOSTILE_LAND;
      const kind = draw(rand, pool);
      if (kind === 'enderman' && manager.countKind('enderman', player.x, player.z, 64) >= 2) return [];
      return [manager.spawn(kind, x + 0.5, found, z + 0.5)];
    }

    if (!exposed) return [];
    let kind: MobKind;
    const snow = isSnowGround(below);
    const sand = isSandGround(below);
    const local = env.wildlife?.(x, z) ?? null;
    if (local) {
      // A biome with its own animals: none on a beach of mud or under water, and fewer where it is bare.
      const land = local.filter((k) => !WATER_KINDS.includes(k));
      if (land.length === 0 || rand() > 0.6) return [];
      kind = draw(rand, land.map((k, i) => [k, land.length - i + 1] as const));
    } else if (below === B.MYCELIUM) {
      kind = 'mooshroom';
    } else if (isGrassGround(below)) {
      kind = draw(rand, PASSIVE_GRASS);
    } else if (snow) {
      kind = draw(rand, PASSIVE_SNOW);
    } else if (sand && rand() < 0.45) {
      kind = draw(rand, PASSIVE_SAND);
    } else {
      return [];
    }
    const variant =
      kind === 'rabbit' ? (snow ? 1 : sand ? 2 : 0)
      : kind === 'fox' && snow ? 1
      : kind === 'parrot' || kind === 'cat' || kind === 'horse' || kind === 'llama' ? Math.floor(rand() * 3)
      : 0;
    const room = PASSIVE_CAP - manager.countNear(player.x, player.z, 64, false);
    const alone = kind === 'sniffer' || kind === 'polar_bear' || kind === 'camel' || kind === 'panda' || kind === 'mooshroom';
    const group = Math.min(room, kind === 'rabbit' ? 1 + Math.floor(rand() * 2) : alone ? 1 : 1 + Math.floor(rand() * 3));
    const out: Mob[] = [];
    for (let i = 0; i < group; i++) {
      const gx = x + Math.floor(rand() * 5) - 2;
      const gz = z + Math.floor(rand() * 5) - 2;
      for (const dy of [0, 1, -1]) {
        const ground = standingOn(world, gx, found + dy, gz);
        if (ground && (ground === below || isGrassGround(ground))) {
          out.push(manager.spawn(kind, gx + 0.5, found + dy, gz + 0.5, { variant: kind === 'sheep' ? sheepColor(rand) : variant }));
          break;
        }
      }
    }
    return out;
  }

  /** The surface of a body of water above or below a point, with its depth, or null. */
  private findWater(world: BlockReader, x: number, z: number, aroundY: number): { surface: number; depth: number } | null {
    for (let y = Math.floor(aroundY) + 14; y > Math.max(2, Math.floor(aroundY) - 26); y--) {
      const id = world.getBlock(x, y, z);
      if (IS_LIQUID[id] !== 1 || isLavaId(id)) continue;
      if (IS_LIQUID[world.getBlock(x, y + 1, z)] === 1) continue; // not the top of it
      let depth = 0;
      while (depth < 12 && IS_LIQUID[world.getBlock(x, y - depth, z)] === 1 && !isLavaId(world.getBlock(x, y - depth, z))) depth++;
      return { surface: y, depth };
    }
    return null;
  }

  /** Squid, fish and dolphins in deep water, drowned in it after dark. Axolotls prefer a cave pool. */
  private trySpawnWater(manager: MobManager, env: SpawnEnv): Mob[] {
    const { world, player, rand } = env;
    const ang = rand() * Math.PI * 2;
    const r = 12 + rand() * 24;
    const x = Math.floor(player.x + Math.cos(ang) * r);
    const z = Math.floor(player.z + Math.sin(ang) * r);
    const water = this.findWater(world, x, z, player.y);
    if (!water || water.depth < 3) return [];
    const exposed = isExposedToSky(world, x + 0.5, water.surface, z + 0.5);
    if (exposed && rand() < 0.65 && env.daylight < 0.45 && manager.countKind('drowned', player.x, player.z, 64) < DROWNED_CAP) {
      if (nearLight(world, x, water.surface, z, 4) || env.noMonsters?.(x, z)) return [];
      return [manager.spawn('drowned', x + 0.5, water.surface - 1, z + 0.5)];
    }
    const swimming = WATER_KINDS.reduce((n, k) => n + manager.countKind(k, player.x, player.z, 64), 0);
    if (swimming >= WATER_CAP) return [];
    const local = exposed ? (env.wildlife?.(x, z) ?? null)?.filter((k) => WATER_KINDS.includes(k)) : undefined;
    let kind = local && local.length > 0 ? draw(rand, local.map((k, i) => [k, local.length - i + 1] as const)) : draw(rand, exposed ? WATER_SURFACE : WATER_CAVE);
    if (kind === 'squid' && manager.countKind('squid', player.x, player.z, 64) >= SQUID_CAP) kind = 'cod';
    const variant = kind === 'tropical_fish' ? Math.floor(rand() * 3) : 0;
    const out: Mob[] = [];
    const n = kind === 'dolphin' || kind === 'squid' || kind === 'glow_squid' || kind === 'axolotl' ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const sy = water.surface - 1 - Math.floor(rand() * Math.min(water.depth - 2, 5));
      if (IS_LIQUID[world.getBlock(x, sy, z)] === 1 && IS_LIQUID[world.getBlock(x, sy + 1, z)] === 1) out.push(manager.spawn(kind, x + 0.5, sy - 0.2, z + 0.5, { variant }));
    }
    return out;
  }

  /** Bats flutter in dark, enclosed air: caves and mineshafts. */
  private trySpawnBat(manager: MobManager, env: SpawnEnv): Mob[] {
    const { world, player, rand } = env;
    if (manager.countKind('bat', player.x, player.z, 48) >= BAT_CAP) return [];
    const ang = rand() * Math.PI * 2;
    const r = 6 + rand() * 14;
    const x = Math.floor(player.x + Math.cos(ang) * r);
    const z = Math.floor(player.z + Math.sin(ang) * r);
    const y = Math.floor(player.y) + Math.floor(rand() * 14) - 7;
    if (y < 3 || y > SEA_LEVEL + 20) return [];
    for (let k = 0; k < 3; k++) {
      const id = world.getBlock(x, y + k, z);
      if (IS_SOLID[id] || IS_LIQUID[id]) return [];
    }
    if (isExposedToSky(world, x, y, z) || nearLight(world, x, y, z, 4)) return [];
    return [manager.spawn('bat', x + 0.5, y + 0.5, z + 0.5)];
  }
}
