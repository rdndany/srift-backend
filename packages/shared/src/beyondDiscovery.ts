import {
  BEYOND_BIOMES,
  BEYOND_BIOME_COUNT,
  BIOME_RARITY_NAMES,
  FAMILY_NAMES,
  SIGNATURE,
  beyondBiome,
  biomesOfFamily,
  type BiomeFamily,
  type BiomeRarity,
  type StructureKey,
} from './beyondBiomes';
import { STRUCTURES } from './beyondStructures';
import { CAVE_ECO_NAMES, type CaveEco } from './beyondUnderground';

/**
 * The Codex: what a traveller has found of the World Beyond. It is a pure record (no browser, no clock), so the client keeps
 * it in local storage, the tests drive it directly, and a server could one day keep it on an account without a rewrite.
 * Finding something for the first time returns its entry, for a notification; achievements unlock from the counts.
 */

export type DiscoveryKind = 'biome' | 'structure' | 'cave';

export interface Discovery {
  kind: DiscoveryKind;
  /** biome id, structure key or cave ecosystem name. */
  id: string;
  name: string;
  desc: string;
  rarity: BiomeRarity;
  /** The family it belongs to, for the book's chapters. */
  family: string;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
}

export interface DiscoveryCounts {
  biomes: number;
  structures: number;
  caves: number;
  signature: number;
  legendary: number;
}

const FAMILIES = Object.keys(FAMILY_NAMES) as BiomeFamily[];
const STRUCTURE_COUNT = Object.keys(STRUCTURES).length;
const CAVE_ECOS = (Object.keys(CAVE_ECO_NAMES) as CaveEco[]).filter((k) => k !== 'none');
const SIGNATURE_IDS: readonly number[] = Object.values(SIGNATURE);

interface AchievementDef extends Achievement {
  test(c: DiscoveryCounts, log: DiscoveryLog): boolean;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_steps', name: 'First Steps', desc: 'Set foot in the World Beyond.', test: (c) => c.biomes >= 1 },
  { id: 'wanderer', name: 'Wanderer', desc: 'Discover 10 biomes.', test: (c) => c.biomes >= 10 },
  { id: 'cartographer', name: 'Cartographer', desc: 'Discover 25 biomes.', test: (c) => c.biomes >= 25 },
  { id: 'explorer', name: 'Explorer', desc: 'Discover 50 biomes.', test: (c) => c.biomes >= 50 },
  { id: 'naturalist', name: 'Naturalist', desc: `Discover all ${BEYOND_BIOME_COUNT} biomes.`, test: (c) => c.biomes >= BEYOND_BIOME_COUNT },
  ...FAMILIES.filter((f) => f !== 'signature').map<AchievementDef>((f) => ({
    id: `family_${f}`,
    name: `${FAMILY_NAMES[f].split(' and ')[0]} Master`,
    desc: `Discover every biome of ${FAMILY_NAMES[f]}.`,
    test: (_c, log) => biomesOfFamily(f).every((b) => log.hasBiome(b.id)),
  })),
  { id: 'realm_walker', name: 'Realm Walker', desc: 'Enter a signature realm.', test: (c) => c.signature >= 1 },
  { id: 'realm_breaker', name: 'Realmbreaker', desc: 'Enter all ten signature realms.', test: (c) => c.signature >= SIGNATURE_IDS.length },
  { id: 'legend', name: 'Legend of the Beyond', desc: 'Find a legendary biome.', test: (c) => c.legendary >= 1 },
  { id: 'ruin_delver', name: 'Ruin Delver', desc: 'Find 5 ancient places.', test: (c) => c.structures >= 5 },
  { id: 'antiquarian', name: 'Antiquarian', desc: 'Find 15 ancient places.', test: (c) => c.structures >= 15 },
  { id: 'archaeologist', name: 'Archaeologist', desc: `Find all ${STRUCTURE_COUNT} ancient places.`, test: (c) => c.structures >= STRUCTURE_COUNT },
  { id: 'spelunker', name: 'Spelunker', desc: 'Find 3 kinds of cavern.', test: (c) => c.caves >= 3 },
  { id: 'deep_delver', name: 'Deep Delver', desc: 'Find every kind of cavern.', test: (c) => c.caves >= CAVE_ECOS.length },
];

export const BEYOND_ACHIEVEMENTS: readonly Achievement[] = ACHIEVEMENTS.map(({ id, name, desc }) => ({ id, name, desc }));

export function biomeDiscovery(id: number): Discovery | null {
  const b = beyondBiome(id);
  if (!b) return null;
  return { kind: 'biome', id: String(b.id), name: b.name, desc: b.desc, rarity: b.rarity, family: FAMILY_NAMES[b.family] };
}

export function structureDiscovery(key: StructureKey): Discovery {
  const s = STRUCTURES[key];
  return { kind: 'structure', id: key, name: s.name, desc: `${s.name}: ${ARCHETYPE_TEXT[s.arche]}`, rarity: s.rarity, family: 'Ancient places' };
}

export function caveDiscovery(eco: CaveEco): Discovery | null {
  if (eco === 'none') return null;
  return { kind: 'cave', id: eco, name: CAVE_ECO_NAMES[eco], desc: CAVE_TEXT[eco], rarity: eco === 'glow' || eco === 'flooded' ? 'uncommon' : 'rare', family: 'Underground' };
}

const ARCHETYPE_TEXT: Record<string, string> = {
  stones: 'a ring of old stones that hums at dusk.',
  monolith: 'a lone obelisk older than any map.',
  shrine: 'a small altar where travellers left offerings.',
  tower: 'a watchtower whose watch ended long ago.',
  lighthouse: 'a lamp on the coast, still waiting for ships.',
  camp: 'a camp, cold and recently abandoned.',
  hut: 'a hut with something strange in the pot.',
  village: 'a settlement of small houses and a few lost things.',
  crypt: 'a stairway down to the dead.',
  graves: 'rows of stone markers in the grass.',
  temple: 'a sacred hall holding what its builders feared to lose.',
  fortress: 'walls and towers raised against an old war.',
  library: 'shelves of a thousand-year-old learning.',
  monastery: 'cloisters open to the sky.',
  battlefield: 'broken weapons where armies met.',
  bridge: 'an old bridge, still standing.',
  harbor: 'piers and boats on a quiet shore.',
  skeleton: 'enormous bones half buried in the earth.',
  wreck: 'a ship that never reached the shore.',
  treasure: 'something buried, with a mark on the ground.',
  reef: 'a living reef built upon old stone.',
  sunken: 'streets under the waves.',
  statue: 'a giant of stone looking out over the water.',
  cairn: 'a heap of stones, a message for later travellers.',
  nest: 'a nest of something very large.',
};

const CAVE_TEXT: Record<CaveEco, string> = {
  none: '',
  glow: 'Mushrooms lighting the dark in blue and green.',
  crystal: 'Crystal in the walls, singing when light touches it.',
  ancient: 'Worked stone far under the earth: someone built here.',
  bone: 'A bed of old bones and fossil rock.',
  flooded: 'A cavern drowned in black water.',
};

/** Everything a traveller has found. */
export class DiscoveryLog {
  private readonly biomes = new Set<number>();
  private readonly structures = new Set<string>();
  private readonly caves = new Set<string>();
  private readonly unlocked = new Set<string>();
  private pending: string[] = [];

  hasBiome(id: number): boolean {
    return this.biomes.has(id);
  }
  hasStructure(key: string): boolean {
    return this.structures.has(key);
  }
  hasCave(key: string): boolean {
    return this.caves.has(key);
  }
  hasAchievement(id: string): boolean {
    return this.unlocked.has(id);
  }

  /** Record a biome; the entry when it is new. */
  findBiome(id: number): Discovery | null {
    if (this.biomes.has(id) || !beyondBiome(id)) return null;
    this.biomes.add(id);
    this.check();
    return biomeDiscovery(id);
  }

  findStructure(key: StructureKey): Discovery | null {
    if (this.structures.has(key) || !STRUCTURES[key]) return null;
    this.structures.add(key);
    this.check();
    return structureDiscovery(key);
  }

  findCave(eco: CaveEco): Discovery | null {
    if (eco === 'none' || this.caves.has(eco)) return null;
    this.caves.add(eco);
    this.check();
    return caveDiscovery(eco);
  }

  counts(): DiscoveryCounts {
    let signature = 0;
    let legendary = 0;
    for (const id of this.biomes) {
      if (SIGNATURE_IDS.includes(id)) signature++;
      if (BEYOND_BIOMES[id]?.rarity === 'legendary') legendary++;
    }
    return { biomes: this.biomes.size, structures: this.structures.size, caves: this.caves.size, signature, legendary };
  }

  /** The achievements that unlocked since the last call. */
  takeUnlocked(): Achievement[] {
    const out = this.pending.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!);
    this.pending = [];
    return out.map(({ id, name, desc }) => ({ id, name, desc }));
  }

  private check(): void {
    const counts = this.counts();
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id) || !a.test(counts, this)) continue;
      this.unlocked.add(a.id);
      this.pending.push(a.id);
    }
  }

  toJSON(): { b: number[]; s: string[]; c: string[]; a: string[] } {
    return { b: [...this.biomes], s: [...this.structures], c: [...this.caves], a: [...this.unlocked] };
  }

  /** Read a saved log, ignoring anything that is not (or no longer) in the catalogue. */
  static from(data: unknown): DiscoveryLog {
    const log = new DiscoveryLog();
    if (!data || typeof data !== 'object') return log;
    const d = data as Record<string, unknown>;
    for (const id of Array.isArray(d.b) ? d.b : []) if (typeof id === 'number' && beyondBiome(id)) log.biomes.add(id);
    for (const k of Array.isArray(d.s) ? d.s : []) if (typeof k === 'string' && k in STRUCTURES) log.structures.add(k);
    for (const k of Array.isArray(d.c) ? d.c : []) if (typeof k === 'string' && (CAVE_ECOS as string[]).includes(k)) log.caves.add(k);
    for (const a of Array.isArray(d.a) ? d.a : []) if (typeof a === 'string' && ACHIEVEMENTS.some((x) => x.id === a)) log.unlocked.add(a);
    return log;
  }
}

/** The Codex page of a biome: what the entry shows once it is found. */
export function codexPage(id: number): { biome: Discovery; atmosphere: string; wildlife: readonly string[]; lore: readonly string[]; structures: readonly string[]; rarity: string } | null {
  const b = beyondBiome(id);
  const d = biomeDiscovery(id);
  if (!b || !d) return null;
  return {
    biome: d,
    atmosphere: b.atmosphere,
    wildlife: b.wildlife,
    lore: b.lore,
    structures: b.structures.map((k) => STRUCTURES[k].name),
    rarity: BIOME_RARITY_NAMES[b.rarity],
  };
}
