import type { PlayerSave } from '@solrift/shared';

/** The three ways to play, as the title screen shows them. */
export type HomeMode = 'survival' | 'creative' | 'hardcore';

export interface ModeInfo {
  id: HomeMode;
  name: string;
  tagline: string;
  blurb: string;
  can: string[];
  mechanics: string[];
  bestFor: string;
}

/**
 * Everything listed here exists in the game. Features that do not (the Nether, the End, villagers,
 * commands) are deliberately left out rather than promised.
 */
export const MODES: ModeInfo[] = [
  {
    id: 'survival',
    name: 'Survival',
    tagline: 'The classic experience',
    blurb: 'You start with practically nothing and must collect resources, craft items, build shelter and survive.',
    can: [
      'Mine blocks and collect resources',
      'Craft tools, weapons and armor',
      'Build houses, farms and other structures',
      'Fight hostile mobs: zombies, skeletons and creepers',
      'Explore caves and villages',
      'Eat food to keep your hunger bar filled',
    ],
    mechanics: [
      'Health and hunger bars',
      'You can take damage and die',
      'You can respawn after dying',
      'You generally need the correct tool',
    ],
    bestFor: 'Exploration, progression, crafting and survival challenges.',
  },
  {
    id: 'creative',
    name: 'Creative',
    tagline: 'Unlimited building',
    blurb: 'Build whatever you can imagine with every block and item at your fingertips.',
    can: [
      'Open an inventory with every block and item',
      'Fly around the world',
      'Break most blocks instantly',
      'Build enormous structures without gathering anything',
      'Experiment freely, with nothing to lose',
    ],
    mechanics: [
      'You cannot normally take damage',
      'No food is needed',
      'No resource collecting',
      'Fly by double-tapping jump',
    ],
    bestFor: 'Builders, architects, map creators and experimenters.',
  },
  {
    id: 'hardcore',
    name: 'Hardcore',
    tagline: 'Extreme difficulty',
    blurb: 'Survival with permanent death. You get exactly one life.',
    can: ['Everything in Survival', 'Only one life to do it in'],
    mechanics: [
      'Difficulty is locked to Hard: mobs hit harder and hunger can kill',
      'One life only',
      'When you die you cannot respawn normally',
      'After death you can only spectate your world',
    ],
    bestFor: 'Experienced players who want a serious survival challenge.',
  },
];

export const modeInfo = (id: HomeMode): ModeInfo => MODES.find((m) => m.id === id)!;

/** What a stored player record says about how its world is played. */
export function modeOfSave(save: Pick<PlayerSave, 'mode' | 'hardcore'>): HomeMode {
  return save.hardcore ? 'hardcore' : save.mode;
}

/** What `startGame` needs for a home-screen mode. */
export function startOptionsFor(mode: HomeMode): { mode: 'survival' | 'creative'; hardcore: boolean } {
  return mode === 'hardcore' ? { mode: 'survival', hardcore: true } : { mode, hardcore: false };
}

const MAX_SEED = 2 ** 31 - 1;

/** A fresh world: any seed from 1 up to the largest the generator hashes cleanly. */
export function randomSeed(rand: () => number = Math.random): number {
  return 1 + Math.floor(rand() * (MAX_SEED - 1));
}

/**
 * The seed a text box means. Empty is random, a whole number is itself, and anything else (as in
 * most sandbox games) is hashed to a number, so the same words always give the same world.
 */
export function parseSeed(text: string, rand: () => number = Math.random): number {
  const t = text.trim();
  if (t === '') return randomSeed(rand);
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n) && Math.abs(n) <= MAX_SEED) return n === 0 ? 1 : n;
  }
  let h = 1125899906842597; // any odd start
  for (let i = 0; i < t.length; i++) h = (Math.imul(h | 0, 31) + t.charCodeAt(i)) | 0;
  const n = Math.abs(h) % MAX_SEED;
  return n === 0 ? 1 : n;
}

/** "just now", "5 minutes ago", "3 days ago". */
export function timeAgo(then: number | null, now = Date.now()): string {
  if (then === null) return 'a while ago';
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return 'just now';
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, name] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}
