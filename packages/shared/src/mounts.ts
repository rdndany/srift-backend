import { IS_LEAVES, IS_SOLID } from './blocks';
import { PLAYER_EYE } from './physics';

/**
 * Mounts, as in World of Warcraft. A mount is learned for good from its horn (right-click it in the bags, and the
 * horn is used up), and summoned with the mount key: a short cast that stands still, is lost if you move or are hurt,
 * and cannot be done indoors or under water. Mounted you run much faster, the mount carries you without costing any
 * hunger, and the two mouse buttons become the mount's own skills (MOUNT_BITE and MOUNT_HOWL): nothing else is done from the saddle.
 *
 * The mounts are the Fenrir of MU Online: a wolf in armour. Pure data and rules, so the server, the client, the tooltip
 * and the tests agree.
 */

export type MountId = 'fenrir' | 'fenrir_black' | 'fenrir_blue' | 'fenrir_gold';

export interface MountDef {
  id: MountId;
  /** What it is called ("Black Fenrir"). */
  name: string;
  /** The horn that teaches it ("Horn of the Black Fenrir"). */
  horn: string;
  /** Movement speed compared with walking (1.6: 60% faster). */
  speed: number;
  /** How hard its two skills hit, compared with the crimson one's (1). */
  power: number;
  /** The level (class level, else the experience level) needed to learn it. */
  level: number;
  /** What the stablemaster asks for the horn, in Auren. */
  price: number;
  /** A line about it for the tooltip and the Mounts window. */
  blurb: string;
}

/** The order is the item id (`mountItemId`), so new mounts go on the end. */
export const MOUNTS: readonly MountDef[] = [
  {
    id: 'fenrir',
    name: 'Fenrir',
    horn: 'Horn of Fenrir',
    speed: 1.6,
    power: 1,
    level: 8,
    price: 600,
    blurb: 'A great wolf in crimson armour. It runs down the road faster than anything on two legs.',
  },
  {
    id: 'fenrir_black',
    name: 'Black Fenrir',
    horn: 'Horn of the Black Fenrir',
    speed: 1.8,
    power: 1.25,
    level: 14,
    price: 1800,
    blurb: 'Fenrir in black plate, the fur of its legs gone dark. Faster than the crimson one, and meaner to look at.',
  },
  {
    id: 'fenrir_blue',
    name: 'Blue Fenrir',
    horn: 'Horn of the Blue Fenrir',
    speed: 1.8,
    power: 1.25,
    level: 14,
    price: 1800,
    blurb: 'Fenrir in cold blue steel. The Rift is said to have forged the plate that never rusts.',
  },
  {
    id: 'fenrir_gold',
    name: 'Gold Fenrir',
    horn: 'Horn of the Golden Fenrir',
    speed: 2,
    power: 1.6,
    level: 20,
    price: 5000,
    blurb: 'Fenrir in gold, with a mane of light. Twice as fast as walking: the best mount there is.',
  },
];

export const mountDef = (id: string | null | undefined): MountDef | null => MOUNTS.find((m) => m.id === id) ?? null;
export const mountIndex = (id: string | null | undefined): number => MOUNTS.findIndex((m) => m.id === id);
export const isMountId = (id: unknown): id is MountId => typeof id === 'string' && MOUNTS.some((m) => m.id === id);

/**
 * What the interface needs of the mounts, as the session says it: the one ridden and the one in the mount slot, which the key
 * summons (1 + their place in MOUNTS, 0: none), and the seconds until each skill is ready (left button, right button).
 */
export interface MountView {
  mount: number;
  pick: number;
  cd: readonly [number, number];
}

/** Seconds the summoning takes: standing still, not hurt. */
export const MOUNT_CAST = 1.5;
/** How far (in blocks) a player may be moved while casting before the cast is lost. */
export const MOUNT_MOVE_LIMIT = 0.5;
/** The highest step a mount walks up without a jump: a whole block (a fence, at one and a half, still stops it). */
export const MOUNT_STEP_HEIGHT = 1.05;
/**
 * The eyes of a rider are this much higher than those of a person on foot. It sits a little above the head of the figure on
 * the saddle (see mountRig.test.ts), so the beast's head and horns fall lower in the view. Nobody should add it to `PLAYER_EYE`
 * by hand: `MOUNTED_EYE` is the one value for where a rider looks from.
 */
export const MOUNT_EYE_LIFT = 1.79;
/**
 * Where a rider's eyes are above the mount's feet: the camera in first person, the origin of the aim and of the hit tests, and the
 * eye the other players see. The server, the client's own prediction, the remote players and the render script all read this one.
 */
export const MOUNTED_EYE = PLAYER_EYE + MOUNT_EYE_LIFT;

/**
 * The shape of the Fenrir that the rules depend on, in the model's own units (before `scale`): the model is built from these
 * (apps/web/src/game/fenrir.ts) and the rules read where its mouth is from them, so a head that is moved moves the mouth with it
 * (mounts.test.ts and fenrir.test.ts hold the two together). The model faces -z and stands on y = 0.
 */
const NECK_TILT = -1.74;
/** The head's own pitch in the body's frame (it is a little nose-down); the head turns against the neck by the difference. */
const HEAD_LEVEL = -0.12;
export const MOUNT_MODEL = {
  /** The model is built at this size and shown this much bigger. */
  scale: 1.6,
  /** The legs are this much longer than they once were, and the body rides this much higher on them. */
  legLift: 0.18,
  /** The pivot of the neck on the body, how long the neck is, and how far it is laid forward (radians, positive: up). */
  neckAt: [0, 0.78, -0.6],
  neckLen: 0.8,
  neckTilt: NECK_TILT,
  /** The head sits on the end of the neck, turned back against it by this much. */
  headAt: [0, 0.8, -0.02],
  headTilt: HEAD_LEVEL - NECK_TILT,
  /** The head is drawn this much stretched along each axis. */
  headScale: [1.08, 1.15, 1.3],
  /** The tip of the nose, in the head's own units (before `headScale`). */
  nose: [0, -0.025, -0.715],
} as const;

/** How high the body is carried above where it once was, in blocks. */
export const MOUNT_BODY_LIFT = MOUNT_MODEL.legLift * MOUNT_MODEL.scale;

/**
 * Where the nose is, standing still: how far ahead of the rider (along the way they face) and how high above the mount's feet,
 * worked out from the model above. `neck` and `head` turn the neck and the head from their resting pose (radians, positive: up).
 */
export function mountMouthAt(neck = 0, head = 0): { ahead: number; up: number } {
  const m = MOUNT_MODEL;
  const turn = (y: number, z: number, a: number): [number, number] => [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  // the nose, in the head's frame, stretched and turned onto the neck, then the neck laid forward onto the body
  const [hy, hz] = turn(m.nose[1] * m.headScale[1], m.nose[2] * m.headScale[2], m.headTilt + head);
  const [ny, nz] = turn(m.headAt[1] + hy, m.headAt[2] + hz, m.neckTilt + neck);
  return { ahead: -(m.neckAt[2] + nz) * m.scale, up: (m.neckAt[1] + ny) * m.scale + MOUNT_BODY_LIFT };
}

/**
 * The two skills of a mount, on the mouse buttons while mounted (as in MU Online, where the Fenrir fights as much as it
 * carries). The left button is a bite: a sweep in front of the mount that hurts everything in reach. The right button is
 * the Thunder Howl: the Fenrir throws up its head and howls, and lightning comes down on the ground the rider aims at, a few
 * strikes one after another. Both hurt hostile creatures only; a mount's power scales the damage, and the class of the rider
 * scales it again (melee or spell).
 */
export const MOUNT_BITE = {
  name: 'Rending Bite',
  button: 'left',
  blurb: 'The Fenrir lunges and rends everything in front of it.',
  damage: 9,
  cooldown: 0.7,
  /** How far ahead, in blocks, it reaches (the mount is long) and how wide the sweep is (radians). */
  range: 6,
  arc: 2,
  knock: 1.4,
} as const;
export const MOUNT_HOWL = {
  name: 'Thunder Howl',
  button: 'right',
  blurb: 'The Fenrir howls and the storm answers: lightning strikes the ground you aim at, three times over.',
  /** The damage of each strike. */
  damage: 7,
  cooldown: 3.5,
  /** How far away the rider can call it down, in blocks, and how far from the middle each strike tears at things. */
  reach: 28,
  radius: 4,
  /** Seconds from the howl to the first strike (the ground shows where it will land), the strikes, and the gap between them. */
  delay: 0.8,
  strikes: 3,
  interval: 0.35,
  knock: 0.5,
} as const;

/**
 * Where the nose is when the mount stands: this far ahead of the rider along the way they face, and this high above the ground. It is
 * read from the model (`MOUNT_MODEL`), not typed in.
 */
export const MOUNT_MOUTH = mountMouthAt();

/** What the rider's two buttons do (in order: left, right), for the tooltip and the bar. */
export const MOUNT_SKILLS = [MOUNT_BITE, MOUNT_HOWL] as const;

/** A roof within this many blocks above the head means you are indoors. */
export const MOUNT_ROOF = 9;

/** Why a mount cannot be summoned here and now, or null when it can. */
export type MountBlock = 'indoors' | 'water';

/**
 * Can a player standing at x, y, z (the feet) summon a mount? Not in the water, and not indoors: a house, a cellar or a
 * cave with a low roof (leaves do not count: a forest is open country).
 */
export function mountBlocker(world: { getBlock(x: number, y: number, z: number): number }, x: number, y: number, z: number, inWater: boolean): MountBlock | null {
  if (inWater) return 'water';
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const top = Math.floor(y + 1.8);
  for (let dy = 0; dy < MOUNT_ROOF; dy++) {
    const id = world.getBlock(bx, top + dy, bz);
    if (IS_SOLID[id] === 1 && IS_LEAVES[id] !== 1) return 'indoors';
  }
  return null;
}

/**
 * Riding is held to a gentler rule than summoning: a gate, a bridge or a tree trunk over the road is no reason to be put off. A rider is
 * `enclosed` when they stand under a ceiling that is within `RIDE_ROOF` blocks of the feet AND most of the open floor around them (a ring of
 * points `RIDE_RING` blocks out) has a ceiling too: the inside of a house, a cellar or a cave. Walls are not ceilings (the points inside them
 * are left out), so riding past a building, or through the arch of a gate with the road open at both ends, is not enclosed. The game puts the
 * rider off only after they have been enclosed for `RIDE_GRACE` seconds in a row, checked every `RIDE_CHECK` seconds.
 */
export const RIDE_ROOF = 6;
export const RIDE_RING = 1.5;
export const RIDE_GRACE = 1.2;
export const RIDE_CHECK = 0.25;
/** The share of the open floor around the rider that must have a ceiling over it for the rider to count as enclosed. */
const RIDE_COVER = 0.6;

export function rideEnclosed(world: { getBlock(x: number, y: number, z: number): number }, x: number, y: number, z: number): boolean {
  const fy = Math.floor(y + 0.1);
  const solid = (bx: number, by: number, bz: number): boolean => {
    const id = world.getBlock(bx, by, bz);
    return IS_SOLID[id] === 1 && IS_LEAVES[id] !== 1;
  };
  /** 0: a wall, a hill or a floor in the way (the point is not open floor), 1: open floor with open sky above, 2: open floor under a ceiling. */
  const probe = (bx: number, bz: number): 0 | 1 | 2 => {
    if (solid(bx, fy, bz) || solid(bx, fy + 1, bz)) return 0;
    for (let dy = 2; dy <= RIDE_ROOF; dy++) if (solid(bx, fy + dy, bz)) return 2;
    return 1;
  };
  const here = probe(Math.floor(x), Math.floor(z));
  if (here !== 2) return false;
  let open = 1;
  let roofed = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = probe(Math.floor(x + Math.cos(a) * RIDE_RING), Math.floor(z + Math.sin(a) * RIDE_RING));
    if (p === 0) continue;
    open++;
    if (p === 2) roofed++;
  }
  return roofed / open >= RIDE_COVER;
}

/** The sentence for a refused summons. */
export const MOUNT_BLOCK_TEXT: Record<MountBlock, string> = {
  indoors: "You can't mount here: there is a roof over you.",
  water: "You can't mount in the water.",
};

/** "+60% speed" for the tooltip and the window. */
export const mountSpeedText = (m: MountDef): string => `+${Math.round((m.speed - 1) * 100)}% movement speed`;
