/**
 * Wings, as in MU Online. Wings are worn in a slot of their own and do four things there: they hit harder, they soften the blows that land,
 * they make you quicker on your feet, and they let you fly. In MU the first wings give 12% more damage and take 12% off what you suffer, the second
 * wings 32% and 25%, and a character with wings floats over the ground instead of walking on it, faster than any run.
 *
 * Here wings are ITEMS (`wingItemId`): crafted (see crafting.ts: the frame and the storm feather first, then the first wings, then the second
 * wings from a first pair), carried, stashed and traded like any item. Worn in the wing slot of the inventory screen they give the bonuses below, and
 * a double tap of the jump key takes off: hold jump to climb, sneak to sink, and the flight ends when the feet touch the ground. Flying is not free:
 * it burns hunger as running does, and with nothing left in the belly the wings fold.
 *
 * Plain data with nothing imported, so the items table can have an item for each.
 */

export type WingId = 'cinderwings' | 'skywings' | 'gladewings' | 'ruinwings' | 'radiantwings' | 'stormwings';

/** The shape of the pair: a bat's skin on bone, the long feathers of a bird, or the glassy blades of an insect. */
export type WingShape = 'bat' | 'feather' | 'blade';

export interface WingDef {
  id: WingId;
  name: string;
  /** 1: the first wings (a frame, a jewel and the parts of the kind); 2: the second wings (a first pair, a storm feather and a stronger jewel). */
  tier: 1 | 2;
  shape: WingShape;
  /** A line about it for the tooltip. */
  blurb: string;
  /** A share more damage dealt, and a share less damage taken (0.12 is a share of twelve in a hundred). */
  might: number;
  ward: number;
  /** How much quicker on foot the wearer is (1.08: 8% faster). */
  walk: number;
  /** In the air: how many times the walking speed the wearer flies at, and how fast it climbs and sinks (blocks per second). */
  fly: number;
  rise: number;
  /** The colours it is drawn in (CSS): the main surface, the bones or edge, and the light at its tips. */
  body: string;
  trim: string;
  glow: string;
}

/** The order is the item id (`wingItemId`), so new wings go on the end. */
export const WINGS: readonly WingDef[] = [
  {
    id: 'cinderwings',
    name: 'Cinderwings',
    tier: 1,
    shape: 'bat',
    blurb: 'Skin of leather over a frame of horn and iron, still warm from the forge. They beat with a sound like a sail in a gale.',
    might: 0.12,
    ward: 0.12,
    walk: 1.06,
    fly: 1.7,
    rise: 6,
    body: '#8e2417',
    trim: '#2a1410',
    glow: '#ff8a3a',
  },
  {
    id: 'skywings',
    name: 'Skywings',
    tier: 1,
    shape: 'feather',
    blurb: 'Long white feathers on a frame of iron. The wearer weighs about as much as a rumour.',
    might: 0.12,
    ward: 0.12,
    walk: 1.06,
    fly: 1.7,
    rise: 6,
    body: '#f1f3f8',
    trim: '#9db4d8',
    glow: '#cfe4ff',
  },
  {
    id: 'gladewings',
    name: 'Gladewings',
    tier: 1,
    shape: 'blade',
    blurb: 'Blades of green glass, veined like a leaf, that hum when they beat. A light, quick pair.',
    might: 0.12,
    ward: 0.12,
    walk: 1.06,
    fly: 1.7,
    rise: 6,
    body: '#6fcf6a',
    trim: '#23602a',
    glow: '#c8ff9a',
  },
  {
    id: 'ruinwings',
    name: 'Wings of Ruin',
    tier: 2,
    shape: 'bat',
    blurb: 'Cinderwings that drank a storm: wider, darker, with claws at every joint and embers running along the bones.',
    might: 0.32,
    ward: 0.25,
    walk: 1.14,
    fly: 2.1,
    rise: 7.5,
    body: '#6e1a1c',
    trim: '#12090a',
    glow: '#ff4a2a',
  },
  {
    id: 'radiantwings',
    name: 'Wings of Radiance',
    tier: 2,
    shape: 'feather',
    blurb: 'Skywings in three layers, edged in gold, that leave a little light behind them wherever they go.',
    might: 0.32,
    ward: 0.25,
    walk: 1.14,
    fly: 2.1,
    rise: 7.5,
    body: '#fff6d8',
    trim: '#e0a93a',
    glow: '#ffe28a',
  },
  {
    id: 'stormwings',
    name: 'Wings of the Storm',
    tier: 2,
    shape: 'blade',
    blurb: 'Gladewings grown to twice the size, in two pairs, the colour of the sky before it breaks.',
    might: 0.32,
    ward: 0.25,
    walk: 1.14,
    fly: 2.1,
    rise: 7.5,
    body: '#58c8e8',
    trim: '#2a3f8a',
    glow: '#b6f0ff',
  },
];

export const wingById = (id: string | null | undefined): WingDef | null => WINGS.find((w) => w.id === id) ?? null;
export const wingIndex = (id: string | null | undefined): number => WINGS.findIndex((w) => w.id === id);

/** The wings a number from the wire names (1 + the place in WINGS, 0: none). */
export const wingByNumber = (n: number | null | undefined): WingDef | null => (n && Number.isInteger(n) && n >= 1 && n <= WINGS.length ? WINGS[n - 1] : null);

/** Hunger burned for every block flown (running burns 0.1 a block: the wings are a little kinder). */
export const WING_EXHAUSTION_PER_BLOCK = 0.06;
/** Below this much hunger the wings fold: the wearer is too weak to keep them beating. */
export const WING_MIN_HUNGER = 3;
/** The push (blocks per second) a takeoff from the ground gives, so the wearer rises clear of the grass. */
export const WING_TAKEOFF = 5.5;

/** The text of what they give, for the tooltip: "+12% damage dealt, -12% damage taken, +6% speed". */
export function wingBonusText(def: WingDef): string {
  const parts: string[] = [];
  if (def.might > 0) parts.push(`+${Math.round(def.might * 100)}% damage dealt`);
  if (def.ward > 0) parts.push(`-${Math.round(def.ward * 100)}% damage taken`);
  parts.push(`+${Math.round((def.walk - 1) * 100)}% speed`);
  return parts.join(', ');
}
