import type { MobKind } from './mobs';

/**
 * The made places of the Adventure world besides Dawnwatch and the Hollow Cellar: six outposts (Ashbrook, the small village where the story begins, and five more), three vaults under the ground and a clearing in
 * the woods. Where they are is measured from the middle of Dawnwatch, which is the origin of the world (the land under it is slid, see
 * `ADVENTURE_OFFSET_X`), and is fixed: the quest givers stand in them, and the story walks from one to the next.
 */

export type OutpostId = 'ashbrook' | 'reedhollow' | 'sandmere' | 'frostgate' | 'highmarket' | 'greykeep';

export interface OutpostDef {
  id: OutpostId;
  name: string;
  /** The middle of its plaza. */
  x: number;
  z: number;
  /** The levelled square is from -half up to half - 1 round the middle. */
  half: number;
  style: 'oak' | 'spruce' | 'desert';
  /** What the ground is paved with outside the roads. */
  ground: 'peat' | 'sand' | 'snow' | 'grass';
}

export const OUTPOSTS: readonly OutpostDef[] = [
  { id: 'ashbrook', name: 'Ashbrook', x: -150, z: 64, half: 30, style: 'oak', ground: 'grass' },
  { id: 'reedhollow', name: 'Reedhollow', x: 184, z: 49, half: 22, style: 'oak', ground: 'peat' },
  { id: 'sandmere', name: 'Sandmere', x: -219, z: 219, half: 22, style: 'desert', ground: 'sand' },
  { id: 'frostgate', name: 'Frostgate', x: 191, z: -191, half: 22, style: 'spruce', ground: 'snow' },
  { id: 'highmarket', name: 'Highmarket', x: 0, z: 190, half: 40, style: 'oak', ground: 'grass' },
  { id: 'greykeep', name: 'Greykeep', x: 247, z: 247, half: 48, style: 'oak', ground: 'grass' },
];

export const outpostById = (id: string): OutpostDef | null => OUTPOSTS.find((o) => o.id === id) ?? null;

/** Greykeep is built north of its plaza (its front faces south): the castle is drawn this far shifted from where it was designed. */
export const GREYKEEP_SHIFT_Z = 41;

/**
 * A vault is a chamber cut under a levelled square: a ramp goes down into it from the north edge of the square, and two cages in it
 * (monster spawners) keep it supplied with monsters. Its middle is where the ramp meets the chamber.
 */
export interface VaultDef {
  id: 'reed_grotto' | 'sand_crypt' | 'frost_vault';
  x: number;
  z: number;
  theme: 'flooded' | 'crypt' | 'frozen';
  mobs: readonly [MobKind, MobKind];
}

export const VAULT_HALF = 12;
export const VAULTS: readonly VaultDef[] = [
  { id: 'reed_grotto', x: 246, z: 49, theme: 'flooded', mobs: ['zombie', 'drowned'] },
  { id: 'sand_crypt', x: -281, z: 219, theme: 'crypt', mobs: ['husk', 'skeleton'] },
  { id: 'frost_vault', x: 191, z: -253, theme: 'frozen', mobs: ['stray', 'skeleton'] },
];

/**
 * Ashbrook is where every new character wakes. Under its eastern half lies the Undercroft (a cave and a stair); the points of that are
 * drawn from here. The cellar house that the stair climbs to stands in the village's south-west corner.
 */
export const UNDERCROFT_ORIGIN = { x: -138, z: 64 } as const;

/** The village green of Ashbrook, where somebody who dies or arrives without a story wakes: a square from (x0, z0) measured from the plaza's middle. */
export const ASHBROOK_GREEN = { x0: -6, z0: 5, size: 12 } as const;

/** The gravel road from Ashbrook to Dawnwatch: it runs east along the village's road, north along x = ROAD_TURN_X, and east again to the west gate. */
export const ASHBROOK_ROAD_TURN_X = -44;

/**
 * The workshop of a village or town: a row of eight benches under a roof (crafting tables and furnaces, so that nobody has to carry their
 * own, and a crowd has room), on a cobblestone pad. The bench runs from `x0` along x at `zb`, measured from the middle of the plaza (of Dawnwatch,
 * for it); the roof and the pad reach two blocks from it towards `dir` (+1: south, -1: north), the side the people stand on. The Stashkeeper of the
 * place stands at the end of the pad (see `NPCS`).
 */
export interface WorkshopSpot {
  x0: number;
  zb: number;
  dir: 1 | -1;
}
export const WORKSHOPS: Readonly<Record<'dawnwatch' | OutpostId, WorkshopSpot>> = {
  dawnwatch: { x0: -10, zb: 13, dir: -1 },
  ashbrook: { x0: 14, zb: -16, dir: 1 },
  reedhollow: { x0: 4, zb: 14, dir: -1 },
  sandmere: { x0: 4, zb: 14, dir: -1 },
  frostgate: { x0: 4, zb: 14, dir: -1 },
  highmarket: { x0: 8, zb: -16, dir: 1 },
  greykeep: { x0: 4, zb: 14, dir: -1 },
};
/** What the eight blocks of a bench are, from the west: four crafting tables and four furnaces, in pairs. */
export const WORKSHOP_BENCH = ['table', 'furnace', 'furnace', 'table', 'table', 'furnace', 'furnace', 'table'] as const;

/** The clearing in the woods where the village hunters found you (see the quest "Find the Clearing"). */
export const CLEARING = { x: -76, z: -60, r: 9 } as const;
