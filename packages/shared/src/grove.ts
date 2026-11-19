/**
 * Bamboo, mangrove and pale oak, and the plants that grow with them: azalea, moss carpets,
 * hanging roots, rooted dirt, mud bricks. Signs, boats and shelves are not in this set.
 * Ids start where the earlier wood set ends.
 */

export type GroveRGB = readonly [number, number, number];

export interface GroveWood {
  name: string;
  /** Door, trapdoor and gate kind. 0 is oak, 1–8 are the older woods, 9 is iron. */
  kind: number;
  log: number;
  /** All-bark wood block. 0 for bamboo, which has no wood block. */
  wood: number;
  strippedLog: number;
  strippedWood: number;
  planks: number;
  slab: number;
  stair: number;
  door: number;
  trapdoor: number;
  fence: number;
  gate: number;
  button: number;
  plate: number;
  leaves: number;
  sapling: number;
}

export interface GroveLayout {
  next: number;
  mangrove: GroveWood;
  paleOak: GroveWood;
  bambooWood: GroveWood;
  /** The stalk you plant. It grows upward like a reed. */
  bamboo: number;
  mosaic: number;
  mosaicSlab: number;
  mosaicStair: number;
  azalea: number;
  azaleaLeaves: number;
  floweringAzaleaLeaves: number;
  hangingRoots: number;
  mossCarpet: number;
  rootedDirt: number;
  packedMud: number;
  mudBricks: number;
  mudBrickSlab: number;
  mudBrickStair: number;
  mudBrickWall: number;
  mangroveRoots: number;
  muddyMangroveRoots: number;
  paleMoss: number;
  paleMossCarpet: number;
  paleHangingMoss: number;
}

function takeWood(id: { n: number }, name: string, kind: number, withLogWood: boolean): GroveWood {
  const next = () => id.n++;
  const span = (count: number) => {
    const at = id.n;
    id.n += count;
    return at;
  };
  return {
    name,
    kind,
    log: next(),
    wood: withLogWood ? next() : 0,
    strippedLog: next(),
    strippedWood: withLogWood ? next() : 0,
    planks: next(),
    slab: span(2),
    stair: span(8),
    door: span(16),
    trapdoor: span(16),
    fence: next(),
    gate: span(4),
    button: span(10),
    plate: span(2),
    leaves: withLogWood ? next() : 0,
    sapling: withLogWood ? next() : 0,
  };
}

export function layoutGrove(start: number): GroveLayout {
  const id = { n: start };
  const next = () => id.n++;
  const span = (count: number) => {
    const at = id.n;
    id.n += count;
    return at;
  };
  const plants = {
    azalea: next(),
    azaleaLeaves: next(),
    floweringAzaleaLeaves: next(),
    hangingRoots: next(),
    mossCarpet: next(),
    rootedDirt: next(),
    packedMud: next(),
    mudBricks: next(),
    mudBrickSlab: span(2),
    mudBrickStair: span(8),
    mudBrickWall: next(),
    mangroveRoots: next(),
    muddyMangroveRoots: next(),
    paleMoss: next(),
    paleMossCarpet: next(),
    paleHangingMoss: next(),
  };
  const mangrove = takeWood(id, 'mangrove', 10, true);
  const paleOak = takeWood(id, 'pale_oak', 11, true);
  const bamboo = next();
  const bambooWood = takeWood(id, 'bamboo', 12, false);
  const mosaic = next();
  const mosaicSlab = span(2);
  const mosaicStair = span(8);
  return { next: id.n, mangrove, paleOak, bambooWood, bamboo, mosaic, mosaicSlab, mosaicStair, ...plants };
}

interface WoodPaint {
  planks: GroveRGB;
  stripped: GroveRGB;
  bark: GroveRGB;
  top: GroveRGB;
  leaf: GroveRGB;
}

const WOOD_PAINT: Record<string, WoodPaint> = {
  mangrove: { planks: [116, 54, 48], stripped: [168, 112, 92], bark: [86, 52, 40], top: [108, 70, 52], leaf: [62, 122, 72] },
  pale_oak: { planks: [230, 224, 208], stripped: [236, 232, 220], bark: [206, 202, 190], top: [220, 214, 196], leaf: [186, 198, 180] },
  bamboo: { planks: [196, 176, 80], stripped: [222, 206, 122], bark: [198, 186, 72], top: [186, 170, 70], leaf: [110, 160, 50] },
};

function paintWood(name: string, full: boolean, tiles: Record<string, GroveRGB>): void {
  const c = WOOD_PAINT[name]!;
  tiles[`${name}_planks`] = c.planks;
  tiles[`${name}_stripped`] = c.stripped;
  tiles[`${name}_door_lower`] = c.planks;
  tiles[`${name}_door_upper`] = c.planks;
  tiles[`${name}_trapdoor`] = c.planks;
  tiles[`${name}_fence`] = c.planks;
  tiles[`${name}_gate`] = c.planks;
  tiles[`${name}_button`] = c.planks;
  tiles[`${name}_plate`] = c.planks;
  if (!full) return;
  tiles[`${name}_bark`] = c.bark;
  tiles[`${name}_log_top`] = c.top;
  tiles[`${name}_leaves`] = c.leaf;
}

const tiles: Record<string, GroveRGB> = {};
paintWood('mangrove', true, tiles);
paintWood('pale_oak', true, tiles);
paintWood('bamboo', false, tiles);
Object.assign(tiles, {
  bamboo: WOOD_PAINT.bamboo.leaf,
  bamboo_block: WOOD_PAINT.bamboo.bark,
  bamboo_mosaic: [176, 150, 64],
  azalea: [58, 120, 62],
  azalea_leaves: [64, 128, 66],
  flowering_azalea_leaves: [78, 132, 78],
  hanging_roots: [128, 96, 64],
  moss_carpet: [72, 128, 58],
  rooted_dirt: [130, 96, 64],
  packed_mud: [138, 104, 78],
  mud_bricks: [150, 116, 90],
  mangrove_roots: [96, 72, 52],
  muddy_mangrove_roots: [84, 72, 56],
  pale_moss_block: [176, 186, 168],
  pale_moss_carpet: [186, 196, 178],
  pale_hanging_moss: [170, 182, 164],
  pale_oak_sapling: [186, 198, 180],
  mangrove_propagule: [62, 122, 72],
});

/** New tiles, appended after the earlier wood set so older indexes stay put. */
export const GROVE_TILE_RGB: Readonly<Record<string, GroveRGB>> = tiles;
