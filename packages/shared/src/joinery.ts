/**
 * The rest of each wood: the all-bark wood block, stripped logs and wood, and (where oak does not
 * already have them) the door, trapdoor, fence, fence gate, button and pressure plate.
 * Oak keeps its original door, trapdoor, fence, gate and plate. Iron doors, the two weighted plates,
 * and the crimson and warped stems sit after the woods. Ids start where the masonry ends.
 */

export type JoineryRGB = readonly [number, number, number];

export interface WoodSpec {
  name: string;
  /** Existing log block, or null when this wood has no tree (poplar). */
  log: string | null;
  /** Planks the door, fence and the rest are crafted from. */
  planks: string;
  planksTile: string;
  /** Bark on every face of the wood block. An existing log side, or a new tile. */
  barkTile: string;
  /** Rings on the end of a log. */
  topTile: string;
  rgb: JoineryRGB;
  stripped: JoineryRGB;
  /** Oak already has a door, trapdoor, fence, gate and plate. */
  full: boolean;
  /** Craft a log from this block plus white dye, when there is no tree. */
  logFrom: string | null;
}

export const WOOD_SPECS: readonly WoodSpec[] = [
  { name: 'oak', log: 'log', planks: 'planks', planksTile: 'planks', barkTile: 'log_side', topTile: 'log_top', rgb: [186, 150, 96], stripped: [214, 178, 122], full: false, logFrom: null },
  { name: 'birch', log: 'birch_log', planks: 'birch_planks', planksTile: 'birch_planks', barkTile: 'birch_log_side', topTile: 'birch_log_top', rgb: [196, 179, 123], stripped: [220, 210, 168], full: true, logFrom: null },
  { name: 'spruce', log: 'spruce_log', planks: 'spruce_planks', planksTile: 'spruce_planks', barkTile: 'spruce_log_side', topTile: 'spruce_log_top', rgb: [114, 84, 48], stripped: [158, 124, 78], full: true, logFrom: null },
  { name: 'jungle', log: 'jungle_log', planks: 'jungle_planks', planksTile: 'jungle_planks', barkTile: 'jungle_log_side', topTile: 'jungle_log_top', rgb: [160, 115, 80], stripped: [186, 140, 96], full: true, logFrom: null },
  { name: 'acacia', log: 'acacia_log', planks: 'acacia_planks', planksTile: 'acacia_planks', barkTile: 'acacia_log_side', topTile: 'acacia_log_top', rgb: [168, 90, 50], stripped: [196, 122, 78], full: true, logFrom: null },
  { name: 'dark_oak', log: 'dark_oak_log', planks: 'dark_oak_planks', planksTile: 'dark_oak_planks', barkTile: 'dark_oak_log_side', topTile: 'dark_oak_log_top', rgb: [66, 43, 20], stripped: [110, 82, 48], full: true, logFrom: null },
  { name: 'cherry', log: 'cherry_log', planks: 'cherry_planks', planksTile: 'cherry_planks', barkTile: 'cherry_log_side', topTile: 'cherry_log_top', rgb: [226, 178, 172], stripped: [232, 196, 186], full: true, logFrom: null },
  { name: 'poplar', log: null, planks: 'poplar_planks', planksTile: 'poplar_planks', barkTile: 'poplar_bark', topTile: 'poplar_log_top', rgb: [214, 206, 175], stripped: [230, 224, 200], full: true, logFrom: 'birch_log' },
];

/** One wood's states. Door, trapdoor, fence, gate and plate are 0 when this wood already had them. */
export interface WoodRow {
  spec: WoodSpec;
  /** 1-based. Kind 0 is the original oak door, trapdoor and gate. */
  kind: number;
  wood: number;
  strippedLog: number;
  strippedWood: number;
  door: number;
  trapdoor: number;
  fence: number;
  gate: number;
  button: number;
  plate: number;
}

export interface NetherRow {
  name: 'crimson' | 'warped';
  stem: number;
  hyphae: number;
  strippedStem: number;
  strippedHyphae: number;
  /** Shapeless partner for an oak log: a block name, or the lapis item. */
  with: 'red_mushroom_block' | 'lapis_lazuli';
}

/** Iron doors and trapdoors use this kind. They open with redstone, not by hand. */
export const IRON_KIND = 9;

/** Wood, stripped log, stripped wood, then the pieces a full wood adds. Oak leaves the door slots empty. */
const STRIDE = 52;
const OFF = { wood: 0, strippedLog: 1, strippedWood: 2, door: 3, trapdoor: 19, fence: 35, gate: 36, button: 40, plate: 50 } as const;

export interface JoineryLayout {
  next: number;
  woods: WoodRow[];
  /** A log for the wood that has no tree, so it can be stripped. */
  poplarLog: number;
  ironDoor: number;
  ironTrapdoor: number;
  /** Off state. The next id is the pressed plate. */
  heavyPlate: number;
  lightPlate: number;
  nether: NetherRow[];
}

export function layoutJoinery(start: number): JoineryLayout {
  let id = start;
  const poplarLog = id++;
  const nether: NetherRow[] = [
    { name: 'crimson', stem: id++, hyphae: id++, strippedStem: id++, strippedHyphae: id++, with: 'red_mushroom_block' },
    { name: 'warped', stem: id++, hyphae: id++, strippedStem: id++, strippedHyphae: id++, with: 'lapis_lazuli' },
  ];
  const woods: WoodRow[] = WOOD_SPECS.map((spec, i) => {
    const base = id;
    id += STRIDE;
    const full = spec.full;
    return {
      spec,
      kind: i + 1,
      wood: base + OFF.wood,
      strippedLog: base + OFF.strippedLog,
      strippedWood: base + OFF.strippedWood,
      door: full ? base + OFF.door : 0,
      trapdoor: full ? base + OFF.trapdoor : 0,
      fence: full ? base + OFF.fence : 0,
      gate: full ? base + OFF.gate : 0,
      button: base + OFF.button,
      plate: full ? base + OFF.plate : 0,
    };
  });
  const ironDoor = id;
  id += 16;
  const ironTrapdoor = id;
  id += 16;
  const heavyPlate = id;
  id += 2;
  const lightPlate = id;
  id += 2;
  return { next: id, woods, poplarLog, ironDoor, ironTrapdoor, heavyPlate, lightPlate, nether };
}

function woodTiles(s: WoodSpec, tiles: Record<string, JoineryRGB>): void {
  tiles[`${s.name}_stripped`] = s.stripped;
  tiles[`${s.name}_button`] = s.rgb;
  if (!s.full) return;
  tiles[`${s.name}_door_lower`] = s.rgb;
  tiles[`${s.name}_door_upper`] = s.rgb;
  tiles[`${s.name}_trapdoor`] = s.rgb;
  tiles[`${s.name}_fence`] = s.rgb;
  tiles[`${s.name}_gate`] = s.rgb;
  tiles[`${s.name}_plate`] = s.rgb;
}

const tiles: Record<string, JoineryRGB> = {};
for (const s of WOOD_SPECS) woodTiles(s, tiles);
Object.assign(tiles, {
  poplar_bark: [176, 172, 150],
  poplar_log_top: [200, 190, 160],
  crimson_stem_side: [120, 30, 40],
  crimson_stem_top: [92, 18, 22],
  warped_stem_side: [22, 96, 90],
  warped_stem_top: [16, 70, 68],
  stripped_crimson: [168, 72, 78],
  stripped_warped: [58, 150, 140],
  iron_door_lower: [188, 188, 192],
  iron_door_upper: [188, 188, 192],
  iron_trapdoor: [188, 188, 192],
  heavy_plate: [188, 188, 192],
  light_plate: [220, 180, 50],
});

/** New tiles, appended after the masonry so earlier tile indexes stay put. */
export const JOINERY_TILE_RGB: Readonly<Record<string, JoineryRGB>> = tiles;
