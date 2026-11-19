import { BIOME_NAMES } from './biomes';
import { zoneDef } from './quests';
import { VILLAGE_EXTENT } from './village';

/** What the place names need from a world generator (the real one has all of it). */
export interface PlaceSource {
  columnAt(x: number, z: number): { height: number; biome: number };
  nearestVillage(x: number, z: number): { x: number; z: number } | null;
  caveKindAt(x: number, y: number, z: number): CaveKind;
  zoneAt(x: number, y: number, z: number): string | null;
  /** The World Beyond names its 110 biomes and its cave ecosystems; the other worlds leave these out. */
  biomeNameAt?(x: number, z: number): string | null;
  caveNameAt?(x: number, y: number, z: number): string | null;
}

export type CaveKind = 'plain' | 'lush' | 'dripstone' | 'deep_dark';

/** How far under the natural ground (blocks) a spot must be to count as being in a cave: a room or a roof on the ground is not one. */
const CAVE_DEPTH = 4;

/** The Adventure world's made places (the village and its cellars around the spawn, the far dungeons) have names of their own, not a cave's. */
const madePlaceAt = (x: number, z: number, adventure: boolean): boolean => adventure && ((Math.abs(x) < 60 && Math.abs(z) < 60) || x > 3000);

/**
 * The kind of cave a spot is in. Measured against the land as the world made it, not against what stands on it: a house or a
 * roof on the ground does not make the spot underground, however tall the room is.
 */
export function caveKindHere(gen: PlaceSource, x: number, y: number, z: number, adventure = false): CaveKind {
  const px = Math.floor(x);
  const pz = Math.floor(z);
  if (madePlaceAt(px, pz, adventure)) return 'plain';
  if (y >= gen.columnAt(px, pz).height - CAVE_DEPTH) return 'plain';
  return gen.caveKindAt(px, Math.floor(y), pz);
}

const CAVE_NAMES: Record<Exclude<CaveKind, 'plain'>, string> = { lush: 'Lush Cave', dripstone: 'Dripstone Cave', deep_dark: 'The Deep Dark' };

/**
 * What to call the place a player stands in (the minimap says it): the made place of an Adventure world (Dawnwatch, the Undercroft),
 * the kind of cave under the ground, a village, or else the biome.
 */
export function placeNameAt(gen: PlaceSource, x: number, y: number, z: number, adventure = false): string {
  const zone = gen.zoneAt(x, y, z);
  const named = zone ? zoneDef(zone) : null;
  if (named) return named.name;
  const kind = caveKindHere(gen, x, y, z, adventure);
  if (kind !== 'plain') return CAVE_NAMES[kind];
  const col = gen.columnAt(Math.floor(x), Math.floor(z));
  if (y < col.height - CAVE_DEPTH - 8) return gen.caveNameAt?.(x, y, z) ?? 'Caves';
  const village = gen.nearestVillage(x, z);
  if (village && Math.hypot(village.x - x, village.z - z) <= VILLAGE_EXTENT + 6) return 'Village';
  return gen.biomeNameAt?.(x, z) ?? BIOME_NAMES[col.biome] ?? 'Wilderness';
}
