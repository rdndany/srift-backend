import { BEYOND_BIOMES, type BeyondBiome } from './beyondBiomes';
import { BeyondFlora, type Claim } from './beyondFlora';
import { BeyondRealmFeatures } from './beyondRealmFeatures';
import { BeyondStructures } from './beyondStructures';
import { BeyondUnderground, CAVE_ECO_NAMES, type CaveEco } from './beyondUnderground';
import type { LootTableName } from './loot';
import type { MobKind } from './mobs';
import { beyondGroundOf, GroundNoise } from './beyondSurface';
import { ASHEN_LAVA_TOP, BeyondTerrain } from './beyondTerrain';
import type { Column } from './biomes';
import { B } from './blocks';
import { SEA_LEVEL, blockIndex } from './chunk';
import { hash2 } from './noise';
import { CASTLE_REGION } from './structures';
import { dropHovering } from './support';
import { VILLAGE_EXTENT } from './village';
import type { Ground } from './surface';
import type { WorldKind } from './squareWorld';
import type { RealmMap } from './beyondRealms';
import { WorldGenerator } from './worldgen';
import { SIGNATURE } from './beyondBiomes';

/** The biggest piece left hanging in a chunk that is still taken out. */
const HOVER_LIMIT = 600;

/** Sea biomes whose water wears a sheet of ice. */
const ICED: ReadonlySet<number> = new Set<number>([70, 84]);

/**
 * The World Beyond: a very large, believable planet. The land (`BeyondTerrain`) puts 110 biomes where a climate says they
 * belong; this class dresses it: the ground each biome is made of, what grows, the creatures' homes (the structures), the
 * underground in several layers, and the signature realms. It is the same `WorldGenerator` as the overworld underneath,
 * so caves, ores, ponds, villages and everything that saves, syncs and simulates the world work without change.
 */
export class BeyondWorldGenerator extends WorldGenerator {
  override readonly kind: WorldKind = 'beyond';
  private readonly gnoise: GroundNoise;
  private readonly flora: BeyondFlora;
  private readonly caves: BeyondUnderground;
  /** The places: camps, ruins, temples, fortresses, statues, wrecks and reefs. */
  readonly places: BeyondStructures;
  private readonly realmFeatures: BeyondRealmFeatures;

  constructor(seed: number) {
    super(seed);
    this.gnoise = new GroundNoise(seed);
    this.structures.vetoCastle = (x, z) => {
      const v = this.nearestVillage(x, z);
      return v !== null && Math.max(Math.abs(v.x - x), Math.abs(v.z - z)) < VILLAGE_EXTENT + 6 + 40;
    };
    this.places = new BeyondStructures({ seed, columnAt: (x, z) => this.columnAt(x, z), nearestVillage: (x, z) => this.nearestVillage(x, z), castlesNear: (x, z, reach) => this.castlesNear(x, z, reach) });
    this.realmFeatures = new BeyondRealmFeatures({ seed, realms: this.realmHost(), heightAt: (x, z) => this.columnAt(x, z).height });
    this.caves = new BeyondUnderground({ seed, columnAt: (x, z) => this.columnAt(x, z) });
    this.flora = new BeyondFlora({
      seed,
      columnAt: (x, z) => this.columnAt(x, z),
      groundTop: (x, z, col) => this.groundTop(x, z, col),
      inLake: (x, z, pad) => this.inLake(x, z, pad),
      claims: (ox, oz, size, pad) => this.claims(ox, oz, size, pad),
    });
  }

  protected override createTerrain(seed: number): BeyondTerrain {
    return new BeyondTerrain(seed);
  }

  /** The realm map the realm features ask (a world that slides the land under it slides this too). */
  protected realmHost(): Pick<RealmMap, 'at' | 'nearby'> {
    return this.land.realms;
  }

  /** The land, with the realm map and the biome gates. */
  get land(): BeyondTerrain {
    return this.terrain as BeyondTerrain;
  }

  /** The detailed biome of a column. */
  biomeAt(wx: number, wz: number): BeyondBiome {
    return BEYOND_BIOMES[this.columnAt(wx, wz).sub || 1];
  }

  /** The ground the castles take near a point: a centre and a half side. */
  private castlesNear(x: number, z: number, reach: number): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    for (let rz = Math.floor((z - reach) / CASTLE_REGION) - 1; rz <= Math.floor((z + reach) / CASTLE_REGION); rz++) {
      for (let rx = Math.floor((x - reach) / CASTLE_REGION) - 1; rx <= Math.floor((x + reach) / CASTLE_REGION); rx++) {
        const c = this.structures.castleInRegion(rx, rz);
        if (c) out.push({ x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2, r: Math.max(c.maxX - c.minX, c.maxZ - c.minZ) / 2 + 2 });
      }
    }
    return out;
  }

  /** The ground that buildings (the places and the villages) take, near a square: no tree is rooted there. */
  private claims(ox: number, oz: number, size: number, pad: number): Claim[] {
    const out: Claim[] = this.places.claims(ox, oz, size, pad);
    for (const c of this.castlesNear(ox + size / 2, oz + size / 2, size / 2 + pad + 4)) {
      if (c.x + c.r + pad >= ox && c.x - c.r - pad < ox + size && c.z + c.r + pad >= oz && c.z - c.r - pad < oz + size) out.push({ x: c.x, z: c.z, r: c.r + pad });
    }
    const v = this.nearestVillage(ox + size / 2, oz + size / 2);
    if (v) {
      const r = VILLAGE_EXTENT + 6 + pad;
      if (v.x + r >= ox && v.x - r < ox + size && v.z + r >= oz && v.z - r < oz + size) out.push({ x: v.x, z: v.z, r });
    }
    return out;
  }

  override landmarksIn(x0: number, z0: number, x1: number, z1: number): readonly { x: number; z: number; r: number }[] {
    return this.claims(x0, z0, Math.max(x1 - x0 + 1, z1 - z0 + 1), 0);
  }

  /** The top block of a column's ground, worked out the way chunk generation does. */
  groundTop(wx: number, wz: number, col: Column): number {
    const h = col.height;
    const hn = this.columnAt(wx, wz - 1).height;
    const hs = this.columnAt(wx, wz + 1).height;
    const he = this.columnAt(wx + 1, wz).height;
    const hw = this.columnAt(wx - 1, wz).height;
    const slope = Math.max(Math.abs(h - hn), Math.abs(h - hs), Math.abs(h - he), Math.abs(h - hw));
    const shore = h <= SEA_LEVEL + 1 && (hn < SEA_LEVEL || hs < SEA_LEVEL || he < SEA_LEVEL || hw < SEA_LEVEL);
    return this.groundFor(col, wx, wz, h, slope, shore).top;
  }

  protected override groundFor(col: Column, wx: number, wz: number, h: number, slope: number, shore: boolean): Ground {
    const b = col.sub ? BEYOND_BIOMES[col.sub] : null;
    if (!b) return super.groundFor(col, wx, wz, h, slope, shore);
    return beyondGroundOf(b.ground, this.gnoise.ctx(wx, wz, h, slope, shore, col.t ?? 0.5));
  }

  protected override fillSea(blocks: Uint16Array, lx: number, lz: number, wx: number, wz: number, h: number, col: Column): void {
    if (col.sub === SIGNATURE.ASHEN_KINGDOM && h <= ASHEN_LAVA_TOP) {
      for (let y = h + 1; y <= ASHEN_LAVA_TOP + 1; y++) blocks[blockIndex(lx, y, lz)] = B.LAVA;
      return;
    }
    for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[blockIndex(lx, y, lz)] = B.WATER;
    if (h < SEA_LEVEL && ICED.has(col.sub ?? 0)) {
      const floe = hash2(this.seed + 312, wx >> 2, wz >> 2) < 0.1;
      if (hash2(this.seed + 313, wx, wz) < 0.96) blocks[blockIndex(lx, SEA_LEVEL, lz)] = floe ? B.PACKED_ICE : B.ICE;
    }
  }

  protected override underground(blocks: Uint16Array, heights: Int16Array, cx: number, cz: number): void {
    this.caves.apply(blocks, heights, cx, cz);
  }

  override lootAt(x: number, y: number, z: number): LootTableName | null {
    return this.places.lootAt(x, y, z) ?? super.lootAt(x, y, z);
  }

  override wildlifeAt(wx: number, wz: number): readonly MobKind[] | null {
    const w = this.biomeAt(Math.floor(wx), Math.floor(wz)).wildlife;
    return w.length > 0 ? w : null;
  }

  biomeNameAt(wx: number, wz: number): string {
    return this.biomeAt(Math.floor(wx), Math.floor(wz)).name;
  }

  caveNameAt(wx: number, y: number, wz: number): string {
    return CAVE_ECO_NAMES[this.caves.ecoAt(Math.floor(wx), Math.floor(y), Math.floor(wz))];
  }

  /** The cave ecosystem of a cell underground (debug hooks, discovery and tests). */
  caveEcoAt(wx: number, y: number, wz: number): CaveEco {
    return this.caves.ecoAt(wx, y, wz);
  }

  protected override dress(blocks: Uint16Array, cx: number, cz: number): void {
    this.flora.placeTrees(blocks, cx, cz);
    this.flora.placeFeatures(blocks, cx, cz);
    this.flora.placeCover(blocks, cx, cz);
    this.places.apply(blocks, cx, cz);
    this.villages.apply(blocks, cx, cz);
    this.structures.applyCastles(blocks, cx, cz);
    // Whatever a cave, a ravine or a building left hanging in the air goes; then the realms add their drifting islands, which
    // are meant to float.
    dropHovering(blocks, HOVER_LIMIT);
    this.realmFeatures.apply(blocks, cx, cz);
  }
}
