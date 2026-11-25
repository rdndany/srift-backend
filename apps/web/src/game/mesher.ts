import {
  B,
  BB,
  BED_HEIGHT,
  BED_RED,
  BLOCKS,
  CHUNK_SIZE,
  CORAL_FAN_RED,
  CORAL_FAN_YELLOW,
  BUBBLE_BLOOM,
  DYE_NAMES,
  FLUID_KIND,
  FLUID_WATER,
  IS_LEAVES,
  IS_OPAQUE,
  IS_TINTED_LEAVES,
  IS_TINTED_PLANT,
  WATER_DEPTH_FLAG,
  WORLD_HEIGHT,
  bedInfo,
  bedTileName,
  bannerInfo,
  candleInfo,
  campfireInfo,
  computeLight,
  fluidSurface,
  grassTint,
  doorHinge,
  chestInfo,
  BED_DIRS,
  CHEST_CCW,
  CHEST_CW,
  ladderInfo,
  meshBoxes,
  isCarpet,
  isSeatCube,
  MAX_SEAT_PILE,
  supportTop,
  stairFaceCovered,
  railInfo,
  rtorchInfo,
  wireArms,
  wirePower,
  ATLAS_TILES,
  tileIndex,
  torchSupport,
  TINT_WATER_BASE,
  packWaterDepth,
  waterDepthClass,
  waterTint,
} from '@solrift/shared';

/**
 * Chunk mesher (runs in a worker).
 *
 * Input is a 3x3-chunk "region" of blocks (48 x H x 48) centred on the chunk to
 * mesh. The region is used to (a) compute sky + block light with a flood fill and
 * (b) look up neighbours for face culling and ambient occlusion.
 *
 * Output uses *greedy meshing*: coplanar faces with identical texture, AO and
 * light are merged into larger quads. Textures repeat inside a quad via
 * local UVs + a per-vertex tile index resolved in the fragment shader.
 *
 * Vertex attributes:
 *   position  float3
 *   uv        float2   local tile coordinates (0..w, 0..h), wrapped in the shader
 *   tile      uint16   atlas tile index
 *   light     uint8x4  r = shade * ambient-occlusion, g = sky light, b = block light,
 *                      a = biome tint palette index (0 = untinted)
 */

export const REGION = CHUNK_SIZE * 3;
const OFF = CHUNK_SIZE;

/** Index into a region from chunk-local coordinates (x/z may be -16..31). */
export function regionIndex(x: number, y: number, z: number): number {
  return (y * REGION + (z + OFF)) * REGION + (x + OFF);
}

/**
 * Copies the 3x3 chunks around (cx, cz) into one region buffer. `get` must
 * return block data for every chunk in the neighbourhood.
 */
export function assembleRegion(get: (cx: number, cz: number) => Uint16Array, cx: number, cz: number): Uint16Array {
  const region = new Uint16Array(REGION * WORLD_HEIGHT * REGION);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const src = get(cx + dx, cz + dz);
      // Nothing above the highest block of a chunk needs copying (the region starts out as air): skip the empty rows at the top.
      let rows = WORLD_HEIGHT;
      while (rows > 0) {
        const base = (rows - 1) * CHUNK_SIZE * CHUNK_SIZE;
        let any = false;
        for (let i = base, e = base + CHUNK_SIZE * CHUNK_SIZE; i < e; i++) {
          if (src[i] !== 0) {
            any = true;
            break;
          }
        }
        if (any) break;
        rows--;
      }
      const x0 = (dx + 1) * CHUNK_SIZE;
      for (let y = 0; y < rows; y++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          let so = (y * CHUNK_SIZE + lz) * CHUNK_SIZE;
          let d = (y * REGION + (dz + 1) * CHUNK_SIZE + lz) * REGION + x0;
          for (let k = 0; k < CHUNK_SIZE; k++) region[d++] = src[so++];
        }
      }
    }
  }
  return region;
}

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  tiles: Uint16Array;
  light: Uint8Array;
  indices: Uint32Array;
}

export interface MeshResult {
  opaque: MeshData | null;
  translucent: MeshData | null;
}

/** A growable typed array: the vertices are written straight into numbers of the right size, not boxed into a list. */
class Buf<A extends Float32Array | Uint8Array | Uint16Array | Uint32Array> {
  n = 0;
  constructor(
    public a: A,
    private readonly make: (len: number) => A,
  ) {}

  private room(extra: number): void {
    if (this.n + extra <= this.a.length) return;
    const next = this.make(Math.max(this.a.length * 2, this.n + extra));
    next.set(this.a.subarray(0, this.n));
    this.a = next;
  }

  push1(a: number): void {
    this.room(1);
    this.a[this.n++] = a;
  }

  push2(a: number, b: number): void {
    this.room(2);
    const d = this.a;
    d[this.n++] = a;
    d[this.n++] = b;
  }

  push3(a: number, b: number, c: number): void {
    this.room(3);
    const d = this.a;
    d[this.n++] = a;
    d[this.n++] = b;
    d[this.n++] = c;
  }

  push4(a: number, b: number, c: number, e: number): void {
    this.room(4);
    const d = this.a;
    d[this.n++] = a;
    d[this.n++] = b;
    d[this.n++] = c;
    d[this.n++] = e;
  }

  push6(a: number, b: number, c: number, e: number, f: number, g: number): void {
    this.room(6);
    const d = this.a;
    d[this.n++] = a;
    d[this.n++] = b;
    d[this.n++] = c;
    d[this.n++] = e;
    d[this.n++] = f;
    d[this.n++] = g;
  }

  /** A right-sized copy of what was written (the buffer itself is reused for the next chunk). */
  done(): A {
    return this.a.slice(0, this.n) as A;
  }
}

class Builder {
  positions = new Buf(new Float32Array(3 * 8192), (n) => new Float32Array(n));
  uvs = new Buf(new Float32Array(2 * 8192), (n) => new Float32Array(n));
  tiles = new Buf(new Uint16Array(8192), (n) => new Uint16Array(n));
  light = new Buf(new Uint8Array(4 * 8192), (n) => new Uint8Array(n));
  indices = new Buf(new Uint32Array(6 * 8192), (n) => new Uint32Array(n));
  vertexCount = 0;

  reset(): this {
    this.positions.n = this.uvs.n = this.tiles.n = this.light.n = this.indices.n = 0;
    this.vertexCount = 0;
    return this;
  }

  finish(): MeshData | null {
    if (this.vertexCount === 0) return null;
    return {
      positions: this.positions.done(),
      uvs: this.uvs.done(),
      tiles: this.tiles.done(),
      light: this.light.done(),
      indices: this.indices.done(),
    };
  }
}

// The two builders are reused from chunk to chunk (a worker meshes one at a time).
const sharedOpaque = new Builder();
const sharedTranslucent = new Builder();

interface FaceDef {
  nAxis: number;
  nSign: 1 | -1;
  sAxis: number;
  sSign: 1 | -1;
  tAxis: number;
  tSign: 1 | -1;
  shade: number;
  kind: 'top' | 'bottom' | 'side';
  /** Corner offsets inside the unit cell, ordered BL, BR, TR, TL (CCW from outside). */
  corners: [number, number, number][];
}

const FACES: FaceDef[] = [
  { nAxis: 0, nSign: 1, sAxis: 2, sSign: -1, tAxis: 1, tSign: 1, shade: 0.8, kind: 'side', corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { nAxis: 0, nSign: -1, sAxis: 2, sSign: 1, tAxis: 1, tSign: 1, shade: 0.8, kind: 'side', corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { nAxis: 1, nSign: 1, sAxis: 0, sSign: 1, tAxis: 2, tSign: -1, shade: 1.0, kind: 'top', corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { nAxis: 1, nSign: -1, sAxis: 0, sSign: 1, tAxis: 2, tSign: 1, shade: 0.5, kind: 'bottom', corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { nAxis: 2, nSign: 1, sAxis: 0, sSign: 1, tAxis: 1, tSign: 1, shade: 0.9, kind: 'side', corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { nAxis: 2, nSign: -1, sAxis: 0, sSign: -1, tAxis: 1, tSign: 1, shade: 0.9, kind: 'side', corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const AO_LEVELS = [0.5, 0.66, 0.83, 1.0];

// Scratch buffers (single-threaded per worker).
/**
 * A greedy-face key keeps the tile in the low bits (the atlas size is a power of two).
 * Above that: 1 bit translucent, 4 bits of fluid drop, 2 of ambient occlusion, 6 of sky light, 6 of block light.
 */
const TILE_MASK = ATLAS_TILES - 1;
const TILE_SHIFT = 32 - Math.clz32(TILE_MASK);

const mask = new Int32Array(WORLD_HEIGHT * CHUNK_SIZE);
/** The tint byte of a face, and above it (times 256) its water flags: see TILE_EXTRA. */
const tmask = new Uint16Array(WORLD_HEIGHT * CHUNK_SIZE);
/** The four horizontal neighbours a water surface looks at to know where its shore is (bit order of the shore mask). */
const SHORE_DX = [-1, 1, 0, 0] as const;
const SHORE_DZ = [0, 0, -1, 1] as const;
/** The tile of a vertex carries a number in the thousands: 1024 marks leaf fuzz, and every 4096 above it is a water flag (decoded in chunkMaterial.ts). */
export const TILE_EXTRA = 4096;
const aoV = [0, 0, 0, 0];
const skyV = [0, 0, 0, 0];
const blkV = [0, 0, 0, 0];
const cell = [0, 0, 0];
const origin = [0, 0, 0];
const pos = [0, 0, 0];
const dirVec = [0, 0, 0];

/** Height of a fluid cell's surface in sixteenths: full when the same fluid sits on top of it. */
function surfaceOf(region: Uint16Array, x: number, y: number, z: number, id: number): number {
  const seeThroughCube = (b: number): boolean => b !== 0 && FLUID_KIND[b] === 0 && IS_OPAQUE[b] === 0 && BLOCKS[b].shape === 'cube' && BLOCKS[b].render === 'translucent';
  if (y + 1 < WORLD_HEIGHT) {
    const above = region[regionIndex(x, y + 1, z)];
    if (FLUID_KIND[above] === FLUID_KIND[id]) return 16;
    // Water under ice or glass fills its cell to the top, like water under more water: no step between it and the water next to it.
    if (FLUID_KIND[id] === FLUID_WATER && seeThroughCube(above)) return 16;
  }
  if (FLUID_KIND[id] === FLUID_WATER) {
    // A pool in a sheet of ice (ice on three sides or more) lies flush with the ice instead of sunk into it like a square basin.
    let ring = 0;
    for (let d = 0; d < 4; d++) if (seeThroughCube(region[regionIndex(x + SHORE_DX[d], y, z + SHORE_DZ[d])])) ring++;
    if (ring >= 3) return 16;
  }
  return fluidSurface(id);
}

/**
 * The faces of the water come first in the translucent mesh. The mesh writes depth, so whatever is drawn after the surface of the sea and
 * lies under it (a crystal, ice, glass) is hidden by it, and whatever stands above it is drawn over it, in any order the faces were made.
 * A quad is water when its tint byte (the alpha of the light) carries the water flag.
 */
function waterFirst(m: MeshData | null): MeshData | null {
  if (!m) return m;
  const idx = m.indices;
  const quadsN = idx.length / 6;
  const isWater = (q: number): boolean => m.light[idx[q * 6]! * 4 + 3]! >= WATER_DEPTH_FLAG;
  let water = 0;
  for (let q = 0; q < quadsN; q++) if (isWater(q)) water++;
  if (water === 0 || water === quadsN) return m;
  const out = new Uint32Array(idx.length);
  let w = 0;
  let o = water * 6;
  for (let q = 0; q < quadsN; q++) {
    const at = isWater(q) ? (w += 6) - 6 : (o += 6) - 6;
    out.set(idx.subarray(q * 6, q * 6 + 6), at);
  }
  m.indices = out;
  return m;
}

/** The plants that grow in the sea (kelp, seagrass, coral fans). The Beyond ids are not fixed, so they are looked up by name. */
const SEA_PLANTS: ReadonlySet<number> = new Set([
  ...['kelp', 'seagrass', 'coral_fan_pink', 'coral_fan_blue'].map((k) => BB[k]).filter((id) => id !== undefined),
  CORAL_FAN_YELLOW,
  CORAL_FAN_RED,
  BUBBLE_BLOOM,
]);
const isSeaPlant = (id: number): boolean => id !== 0 && FLUID_KIND[id] === 0 && IS_OPAQUE[id] === 0 && BLOCKS[id].shape !== 'cube';

/**
 * The region as the water sees it: every plant standing in the sea (a stalk of kelp, seagrass, a coral fan) counts as water, so the
 * surface runs on over it and no wall or square of water shows round it. A plant is in the sea when the water is over the top of its
 * stalk, or when it is a plant of the sea standing in the top layer with water (or more such plants) on at least three of its four sides. The plant itself is still drawn from the
 * region (this copy is only for the water). The region is copied only when there is such a plant.
 */
function plantsInWater(region: Uint16Array, yCount: number): Uint16Array {
  let out = region;
  const reach = Math.min(WORLD_HEIGHT - 1, yCount + 1);
  for (let z = -1; z <= CHUNK_SIZE; z++) {
    for (let x = -1; x <= CHUNK_SIZE; x++) {
      for (let y = 1; y < yCount; y++) {
        if (!isSeaPlant(region[regionIndex(x, y, z)])) continue;
        let t = y + 1;
        while (t < reach && isSeaPlant(region[regionIndex(x, t, z)])) t++;
        const above = region[regionIndex(x, t, z)];
        let wet = FLUID_KIND[above] === FLUID_WATER;
        // (Only the plants of the sea itself, with water round them: a meadow of grass and flowers must never be taken for water.)
        if (!wet && above === 0 && SEA_PLANTS.has(region[regionIndex(x, t - 1, z)])) {
          let sides = 0;
          for (let d = 0; d < 4; d++) {
            const nb = region[regionIndex(x + SHORE_DX[d], t - 1, z + SHORE_DZ[d])];
            if (FLUID_KIND[nb] === FLUID_WATER || SEA_PLANTS.has(nb)) sides++;
          }
          wet = sides >= 3;
        }
        if (!wet) continue;
        if (out === region) out = region.slice();
        out[regionIndex(x, y, z)] = B.WATER;
      }
    }
  }
  return out;
}

/**
 * `tint` is the centre chunk's climate grid (WorldGenerator.tintGrid): one packed temperature/humidity
 * byte per column. Without it nothing is tinted.
 */
export function meshChunk(region: Uint16Array, tint?: Uint8Array): MeshResult {
  // Light is only worked out up to just above the tallest block in the region; everything higher is open sky.
  const rowCells = REGION * REGION;
  let top = WORLD_HEIGHT - 1;
  while (top > 0) {
    let any = false;
    for (let i = top * rowCells, e = i + rowCells; i < e; i++) {
      if (region[i] !== 0) {
        any = true;
        break;
      }
    }
    if (any) break;
    top--;
  }
  const litHeight = Math.min(WORLD_HEIGHT, top + 2);
  const light = computeLight(region.subarray(0, rowCells * litHeight), REGION, litHeight, REGION);
  const opaqueB = sharedOpaque.reset();
  const translucentB = sharedTranslucent.reset();

  // Highest non-air layer inside the centre chunk.
  let maxY = -1;
  for (let y = WORLD_HEIGHT - 1; y >= 0 && maxY < 0; y--) {
    for (let z = 0; z < CHUNK_SIZE && maxY < 0; z++) {
      const base = regionIndex(0, y, z);
      for (let x = 0; x < CHUNK_SIZE; x++) {
        if (region[base + x] !== 0) {
          maxY = y;
          break;
        }
      }
    }
  }
  if (maxY < 0) return { opaque: null, translucent: null };
  const yCount = maxY + 1;

  // What the faces see: the region itself until the seats are worked out, then the same with the plants that stand in the sea turned into
  // water (see plantsInWater), so the water goes on around and over a stalk of kelp or a coral fan instead of being cut out of by it.
  let seen = region;
  const blockAt = (x: number, y: number, z: number): number => (y >= WORLD_HEIGHT ? 0 : seen[regionIndex(x, y, z)]);
  const isOpaque = (x: number, y: number, z: number): boolean => (y < 0 ? true : IS_OPAQUE[blockAt(x, y, z)] === 1);
  /** A full block of another kind beside a tilled bed (see the farmland shading below). */
  const isBedWall = (b: number): boolean => b !== B.FARMLAND && IS_OPAQUE[b] === 1 && BLOCKS[b].shape === 'cube';
  // Ice and glass lie in the water without cutting it: the water faces that would touch them are not drawn.
  const coversWater = (nid: number): boolean => nid !== 0 && FLUID_KIND[nid] === 0 && IS_OPAQUE[nid] === 0 && BLOCKS[nid].shape === 'cube' && BLOCKS[nid].render === 'translucent';
  const watery = (x: number, y: number, z: number): boolean => y >= 0 && FLUID_KIND[blockAt(x, y, z)] === FLUID_WATER;
  /** Water in this column under the cell, with only air between. A side above that water is inside the pool. */
  const waterUnder = (x: number, y: number, z: number): boolean => {
    for (let yy = y - 1; yy >= 0 && y - yy <= 32; yy--) {
      const id = blockAt(x, yy, z);
      if (FLUID_KIND[id] === FLUID_WATER) return true;
      if (id !== 0 && (IS_OPAQUE[id] === 1 || BLOCKS[id].solid)) return false;
    }
    return false;
  };
  const lightAt = (x: number, y: number, z: number): number => {
    if (y >= litHeight) return 0xf0;
    if (y < 0) return 0;
    return light[regionIndex(x, y, z)];
  };

  const sizeOf = (axis: number): number => (axis === 1 ? yCount : CHUNK_SIZE);

  // Cubes that rest on a short block are drawn lower, by however much that block falls short of a full cell.
  // Built once per column so a solid hill does not walk to bedrock for every face.
  const SPAN = CHUNK_SIZE + 2;
  const seatMask = new Float32Array(SPAN * yCount * SPAN);
  for (let z = -1; z <= CHUNK_SIZE; z++) {
    for (let x = -1; x <= CHUNK_SIZE; x++) {
      let carry = 0;
      let pile = 0;
      for (let y = 0; y < yCount; y++) {
        const id = blockAt(x, y, z);
        const cube = isSeatCube(id);
        // Only a short pile sits on the block under it (the same limit `seatDrop` uses for collisions).
        if (cube && carry > 0 && ++pile <= MAX_SEAT_PILE) seatMask[(y * SPAN + (z + 1)) * SPAN + (x + 1)] = carry;
        const top = supportTop(id);
        if (top !== null) {
          carry = 1 - top;
          pile = 0;
        } else if (!cube) {
          carry = 0;
          pile = 0;
        }
      }
    }
  }
  seen = plantsInWater(region, yCount);
  const seatDropOf = (x: number, y: number, z: number): number =>
    y >= 0 && y < yCount && x >= -1 && x <= CHUNK_SIZE && z >= -1 && z <= CHUNK_SIZE ? seatMask[(y * SPAN + (z + 1)) * SPAN + (x + 1)] : 0;
  const seatOf = (x: number, y: number, z: number): boolean => seatDropOf(x, y, z) > 0;

  for (const face of FACES) {
    const { nAxis, sAxis, tAxis, nSign, sSign, tSign } = face;
    const N = sizeOf(nAxis);
    const S = sizeOf(sAxis);
    const T = sizeOf(tAxis);
    dirVec[0] = dirVec[1] = dirVec[2] = 0;
    dirVec[nAxis] = nSign;
    // The two axes tangent to the face normal.
    const taxA: number = nAxis === 0 ? 1 : 0;
    const taxB: number = nAxis === 2 ? 1 : 2;

    for (let n = 0; n < N; n++) {
      mask.fill(-1, 0, S * T);

      for (let j = 0; j < T; j++) {
        for (let i = 0; i < S; i++) {
          cell[nAxis] = n;
          cell[sAxis] = sSign > 0 ? i : S - 1 - i;
          cell[tAxis] = tSign > 0 ? j : T - 1 - j;
          const x = cell[0];
          const y = cell[1];
          const z = cell[2];

          const id = seen[regionIndex(x, y, z)];
        if (id === 0) continue;
        const def = BLOCKS[id];
          if (def.shape !== 'cube') continue;
          // How far this cube is drawn below its cell, so it meets the short block under it.
          const seat = seatDropOf(x, y, z);
          const fluid = FLUID_KIND[id];

          const nx = x + dirVec[0];
          const ny = y + dirVec[1];
          const nz = z + dirVec[2];
          if (ny < 0) continue;
          const nid = blockAt(nx, ny, nz);
          // A lowered cube does not sit on the cell face, so the neighbour's cell does not cover it.
          if (IS_OPAQUE[nid] && seat === 0 && !seatOf(nx, ny, nz)) continue;
          let drop = 0;
          // A side between two heights of the same water starts where the lower one ends, so the shared part is one body.
          let lift = 0;
          if (fluid !== 0) {
            // The underside of water is never a face: from below, and from inside the pool, there is no sheet.
            if (fluid === FLUID_WATER && face.kind === 'bottom') continue;
            const surf = surfaceOf(seen, x, y, z, id);
            if (FLUID_KIND[nid] === fluid) {
              // Water is one body: the wall where a taller block meets a shorter one is inside the pool, so it is not a face.
              // Lava still shows that step.
              if (fluid === FLUID_WATER || face.kind !== 'side') continue;
              const nSurf = surfaceOf(seen, nx, ny, nz, nid);
              if (nSurf >= surf) continue;
              drop = 16 - surf;
              lift = nSurf;
            } else if (fluid === FLUID_WATER && coversWater(nid)) continue;
            // The side of a higher pool faces the air above shorter water, however many blocks of air
            // are in between. That sheet is inside the water, so it is not drawn.
            else if (fluid === FLUID_WATER && face.kind === 'side' && waterUnder(nx, ny, nz)) continue;
            else drop = 16 - surf;
          } else if (nid === id && def.cullSame && seat === 0 && !seatOf(nx, ny, nz)) continue;
          // Ice meets the water with no side of its own. A side that faces the air is the edge of the sheet, and stays.
          else if ((id === B.ICE || id === B.PACKED_ICE) && face.kind === 'side' && FLUID_KIND[nid] === FLUID_WATER) continue;
          if (face.kind === 'side' && lift + drop >= 16) continue;

          const translucent = def.render === 'translucent';
          const isWater = def.liquid;
          // Water flags: the top of a surface knows which of its four sides is shore (so the shader can draw foam and shallows along
          // it); an opaque face under the water knows how deep the water over it is (so the shader can throw caustics on it).
          let extra = 0;
          if (fluid === FLUID_WATER) {
            if (face.kind === 'top') {
              for (let d = 0; d < 4; d++) {
                const sx = x + SHORE_DX[d];
                const sz = z + SHORE_DZ[d];
                // Ice and glass are no shore: the water goes on under them.
                if (!watery(sx, y, sz) && !coversWater(blockAt(sx, y, sz))) extra |= 1 << d;
              }
            }
          } else if (fluid === 0 && !translucent && watery(nx, ny, nz)) {
            let up = 1;
            while (up < 8 && watery(nx, ny + up, nz)) up++;
            extra = 1 + waterDepthClass(up);
          }
          const tile = def.axis !== undefined ? (face.nAxis === def.axis ? def.tiles.top : def.tiles.side) : def.tiles[face.kind];
          let tintIdx = 0;
          // Water is always drawn as water (a plain temperate sea where there is no climate to ask), so the whole game shares one look.
          if (fluid === FLUID_WATER) {
            let below = 1;
            while (below < 8 && y - below >= 0 && watery(x, y - below, z)) below++;
            tintIdx = packWaterDepth(tint ? waterTint(tint[z * CHUNK_SIZE + x]) : TINT_WATER_BASE + 4, waterDepthClass(below));
          } else if (tint && (IS_TINTED_LEAVES[id] === 1 || (id === B.GRASS && face.kind !== 'bottom'))) tintIdx = grassTint(tint[z * CHUNK_SIZE + x]);

          // Per-corner ambient occlusion and smooth light (sky + block).
          const centerL = lightAt(nx, ny, nz);
          const cSky = centerL >> 4;
          const cBlk = centerL & 0xf;
          for (let c = 0; c < 4; c++) {
            const cc = face.corners[c];
            const offA = cc[taxA] * 2 - 1;
            const offB = cc[taxB] * 2 - 1;

            const ax = taxA === 0 ? offA : 0;
            const ay = taxA === 1 ? offA : 0;
            const az = taxA === 2 ? offA : 0;
            const bx = taxB === 0 ? offB : 0;
            const by = taxB === 1 ? offB : 0;
            const bz = taxB === 2 ? offB : 0;

            const s1x = nx + ax;
            const s1y = ny + ay;
            const s1z = nz + az;
            const s2x = nx + bx;
            const s2y = ny + by;
            const s2z = nz + bz;
            const cx = nx + ax + bx;
            const cy = ny + ay + by;
            const cz = nz + az + bz;

            const o1 = isOpaque(s1x, s1y, s1z);
            const o2 = isOpaque(s2x, s2y, s2z);
            const oc = isOpaque(cx, cy, cz);

            if (isWater) {
              aoV[c] = 3;
            } else {
              aoV[c] = o1 && o2 ? 0 : 3 - ((o1 ? 1 : 0) + (o2 ? 1 : 0) + (oc ? 1 : 0));
              // A tilled bed sits in its surroundings: where a full block (grass, stone ...) stands beside it, the soil shades off
              // towards that edge, so the bed does not end in a razor line against it. (A farmland neighbour is the same bed: no shade.)
              if (id === B.FARMLAND && face.kind === 'top') {
                const w1 = isBedWall(blockAt(x + ax, y, z + az));
                const w2 = isBedWall(blockAt(x + bx, y, z + bz));
                const wc = !w1 && !w2 && isBedWall(blockAt(x + ax + bx, y, z + az + bz));
                aoV[c] = Math.max(0, aoV[c] - Math.min(3, (w1 ? 2 : 0) + (w2 ? 2 : 0) + (wc ? 1 : 0)));
              }
            }

            const l1 = o1 ? centerL : lightAt(s1x, s1y, s1z);
            const l2 = o2 ? centerL : lightAt(s2x, s2y, s2z);
            const lc = oc || (o1 && o2) ? centerL : lightAt(cx, cy, cz);
            skyV[c] = cSky + (l1 >> 4) + (l2 >> 4) + (lc >> 4);
            blkV[c] = cBlk + (l1 & 0xf) + (l2 & 0xf) + (lc & 0xf);
          }

          const flat =
            aoV[0] === aoV[1] &&
            aoV[1] === aoV[2] &&
            aoV[2] === aoV[3] &&
            skyV[0] === skyV[1] &&
            skyV[1] === skyV[2] &&
            skyV[2] === skyV[3] &&
            blkV[0] === blkV[1] &&
            blkV[1] === blkV[2] &&
            blkV[2] === blkV[3];

          const builder = translucent ? translucentB : opaqueB;
          // A lowered cube cannot merge with the cubes around it: their faces do not share a plane.
          if (flat && seat === 0) {
            mask[j * S + i] =
              tile |
              ((translucent ? 1 : 0) << TILE_SHIFT) |
              (drop << (TILE_SHIFT + 1)) |
              (aoV[0] << (TILE_SHIFT + 5)) |
              (skyV[0] << (TILE_SHIFT + 7)) |
              (blkV[0] << (TILE_SHIFT + 13));
            // The high nibble is how far a side is lifted, so two edges merge only when they sit at the same height.
            tmask[j * S + i] = tintIdx + extra * 256 + lift * 4096;
          } else {
            emitQuad(builder, face, n, i, j, 1, 1, S, T, tile + extra * TILE_EXTRA, drop, aoV, skyV, blkV, tintIdx, -seat, lift);
          }
        }
      }

      // Greedy merge of the flat faces in this slice.
      for (let j = 0; j < T; j++) {
        for (let i = 0; i < S; ) {
          const key = mask[j * S + i];
          if (key < 0) {
            i++;
            continue;
          }
          let w = 1;
          const tk = tmask[j * S + i];
          while (i + w < S && mask[j * S + i + w] === key && tmask[j * S + i + w] === tk) w++;
          let h = 1;
          outer: while (j + h < T) {
            for (let k = 0; k < w; k++) if (mask[(j + h) * S + i + k] !== key || tmask[(j + h) * S + i + k] !== tk) break outer;
            h++;
          }
          for (let dj = 0; dj < h; dj++) for (let di = 0; di < w; di++) mask[(j + dj) * S + i + di] = -1;

          const tile = key & TILE_MASK;
          const translucent = ((key >> TILE_SHIFT) & 1) === 1;
          const drop = (key >> (TILE_SHIFT + 1)) & 15;
          const ao = (key >> (TILE_SHIFT + 5)) & 3;
          const sky = (key >> (TILE_SHIFT + 7)) & 63;
          const blk = (key >> (TILE_SHIFT + 13)) & 63;
          aoV[0] = aoV[1] = aoV[2] = aoV[3] = ao;
          skyV[0] = skyV[1] = skyV[2] = skyV[3] = sky;
          blkV[0] = blkV[1] = blkV[2] = blkV[3] = blk;
          emitQuad(translucent ? translucentB : opaqueB, face, n, i, j, w, h, S, T, tile + ((tk >> 8) & 15) * TILE_EXTRA, drop, aoV, skyV, blkV, tk & 255, 0, tk >> 12);
          i += w;
        }
      }
    }
  }

  /**
   * The edge of a crown is feathery: wherever a block of leaves faces the open air, a second skin of leaves lies just off its
   * face (the shader leaves only scattered little groups of them, see the fuzz in chunkMaterial.ts). The skin runs a little past
   * the block's edges where the next block is open too, so at the rim of a crown leaves poke out beyond the straight cube edge.
   */
  const FUZZ = 0.08;
  const openAt = (x: number, y: number, z: number): boolean => {
    if (y < 0) return false;
    const id = blockAt(x, y, z);
    return id === 0 || (IS_OPAQUE[id] === 0 && IS_LEAVES[id] === 0);
  };
  const emitLeafFuzz = (id: number, x: number, y: number, z: number): void => {
    const def = BLOCKS[id];
    const tt = tint && IS_TINTED_LEAVES[id] === 1 ? grassTint(tint[z * CHUNK_SIZE + x]) : 0;
    for (const face of FACES) {
      const { nAxis, nSign } = face;
      cell[0] = x;
      cell[1] = y;
      cell[2] = z;
      cell[nAxis] += nSign;
      if (!openAt(cell[0], cell[1], cell[2])) continue;
      const l = lightAt(cell[0], cell[1], cell[2]);
      const taxA = nAxis === 0 ? 1 : 0;
      const taxB = nAxis === 2 ? 1 : 2;
      const corners: [number, number, number, number, number][] = [];
      face.corners.forEach((cc, k) => {
        const p = [x + cc[0], y + cc[1], z + cc[2]];
        p[nAxis] += nSign * FUZZ;
        for (const ax of [taxA, taxB]) {
          const dir = cc[ax] === 1 ? 1 : -1;
          const q = [x, y, z];
          q[ax] += dir;
          if (openAt(q[0], q[1], q[2])) p[ax] += dir * FUZZ;
        }
        corners.push([p[0], p[1], p[2], k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0]);
      });
      pushQuad(opaqueB, corners, def.tiles[face.kind] + 1024, face.shade, (l >> 4) * 4, (l & 15) * 4, tt);
    }
  };
  // Non-cube shapes: flowers, crops and torches.
  for (let y = 0; y < yCount; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const base = regionIndex(0, y, z);
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = region[base + x];
        if (id === 0) continue;
        const def = BLOCKS[id];
        const l = lightAt(x, y, z);
        const sky = (l >> 4) * 4;
        // Torches glow: always fully lit.
        const unlit = rtorchInfo(id)?.on === false;
        const blk = (def.shape === 'torch' || def.shape === 'lantern' || def.shape === 'candle') && !unlit ? 60 : (l & 15) * 4;
        if (def.shape === 'cube') {
          if (IS_LEAVES[id] === 1) emitLeafFuzz(id, x, y, z);
          continue;
        }
        const tile = def.tiles.side;
        if (wirePower(id) >= 0) {
          const arms = wireArms((ax, ay, az) => (ay < 0 ? 0 : blockAt(ax, ay, az)), x, y, z);
          emitWire(opaqueB, wirePower(id), x, y, z, arms, def.tiles.top, def.tiles.side, sky, blk);
        } else if (isCarpet(id) || id === B.LILY_PAD) {
          // One pixel thick, so a block placed on top meets the carpet instead of hovering a cell above it.
          emitBoxes(opaqueB, [[0, 0, 0, 1, 1 / 16, 1]], x, y, z, def.tiles, sky, blk, (dx, dy, dz) => isOpaque(x + dx, y + dy, z + dz));
        } else if (def.shape === 'flat') {
          // Rails and the like: a thin sheet on the floor of the cell.
          const fy = y + 0.04;
          const rail = railInfo(id);
          // Curves are one tile mirrored to suit; slopes rise towards their high end.
          const flipU = !!rail?.curve && (rail.dirA === 1 || rail.dirB === 1);
          const flipV = !!rail?.curve && (rail.dirA === 3 || rail.dirB === 3);
          const rise = (cx: number, cz: number): number => {
            if (!rail?.slope) return 0;
            switch (rail.dirB) {
              case 0:
                return cx;
              case 1:
                return 1 - cx;
              case 2:
                return cz;
              default:
                return 1 - cz;
            }
          };
          const u = (v: number): number => (flipU ? 1 - v : v);
          const w = (v: number): number => (flipV ? 1 - v : v);
          pushQuad(opaqueB, [[x, fy + rise(0, 1), z + 1, u(0), w(0)], [x + 1, fy + rise(1, 1), z + 1, u(1), w(0)], [x + 1, fy + rise(1, 0), z, u(1), w(1)], [x, fy + rise(0, 0), z, u(0), w(1)]], tile, 0.95, sky, blk);
        } else if (def.shape === 'cross') {
          const tt = tint && IS_TINTED_PLANT[id] === 1 ? grassTint(tint[z * CHUNK_SIZE + x]) : 0;
          emitCluster(opaqueB, x, y, z, tile, sky, blk, tt);
        } else if (def.shape === 'crop') {
          emitPlane(opaqueB, x + 0.25, y, z, x + 0.25, y, z + 1, 1, tile, sky, blk);
          emitPlane(opaqueB, x + 0.75, y, z, x + 0.75, y, z + 1, 1, tile, sky, blk);
          emitPlane(opaqueB, x, y, z + 0.25, x + 1, y, z + 0.25, 1, tile, sky, blk);
          emitPlane(opaqueB, x, y, z + 0.75, x + 1, y, z + 0.75, 1, tile, sky, blk);
        } else if (def.shape === 'bed') {
          emitBed(opaqueB, id, x, y, z, sky, blk, blockAt);
        } else if (def.shape === 'campfire') {
          emitCampfire(opaqueB, id, x, y, z, sky, blk, (dx, dy, dz) => isOpaque(x + dx, y + dy, z + dz));
        } else if (def.shape === 'candle') {
          const count = candleInfo(id)?.count ?? 1;
          const spots: readonly (readonly [number, number])[] =
            count === 1 ? [[0.5, 0.5]] : count === 2 ? [[0.35, 0.5], [0.65, 0.5]] : count === 3 ? [[0.5, 0.34], [0.32, 0.66], [0.68, 0.66]] : [[0.32, 0.32], [0.68, 0.32], [0.32, 0.68], [0.68, 0.68]];
          for (const [cx, cz] of spots) {
            emitPlane(opaqueB, x + cx - 0.2, y, z + cz - 0.2, x + cx + 0.2, y, z + cz + 0.2, 1, tile, sky, blk);
            emitPlane(opaqueB, x + cx - 0.2, y, z + cz + 0.2, x + cx + 0.2, y, z + cz - 0.2, 1, tile, sky, blk);
          }
        } else if (def.shape === 'banner') {
          const info = bannerInfo(id);
          const facing = info?.facing ?? 0;
          const alongX = facing >= 2;
          const edge = info?.wall ? (facing % 2 === 0 ? 0.92 : 0.08) : 0.5;
          if (alongX) emitPlane(opaqueB, x, y, z + edge, x + 1, y, z + edge, 1, tile, sky, blk);
          else emitPlane(opaqueB, x + edge, y, z, x + edge, y, z + 1, 1, tile, sky, blk);
        } else if (def.shape === 'pot') {
          const boxes = meshBoxes(id, (dx, dz) => blockAt(x + dx, y, z + dz));
          emitBoxes(opaqueB, boxes, x, y, z, { top: tile, bottom: tile, side: tile }, sky, blk, (dx, dy, dz) => isOpaque(x + dx, y + dy, z + dz));
          if (def.tiles.top !== tile) {
            emitPlane(opaqueB, x + 0.25, y, z + 0.25, x + 0.75, y, z + 0.75, 1, def.tiles.top, sky, blk);
            emitPlane(opaqueB, x + 0.25, y, z + 0.75, x + 0.75, y, z + 0.25, 1, def.tiles.top, sky, blk);
          }
        } else if (BOXED.has(def.shape)) {
          // Slabs, stairs, doors, fences...: a handful of boxes. Faces on the cell boundary are dropped when the block next to them is solid.
          const plain = def.shape !== 'slab' && def.shape !== 'stair' && def.shape !== 'wall' && def.shape !== 'table' && def.shape !== 'lantern' && def.shape !== 'cake' && def.shape !== 'chest';
          const tiles = plain ? { top: tile, bottom: tile, side: tile } : def.tiles;
          const ladder = ladderInfo(id);
          const onlyAxis = ladder ? (ladder.facing < 2 ? 0 : 2) : -1;
          const boxes = meshBoxes(
            id,
            (dx, dz) => blockAt(x + dx, y, z + dz),
            (dx, dy, dz) => blockAt(x + dx, y + dy, z + dz),
          );
          const chest = def.shape === 'chest' ? chestInfo(id) : null;
          const hides =
            chest && chest.half !== 0
              ? (nx: number, ny: number, nz: number): boolean => {
                  const d = chest.half === 1 ? CHEST_CCW[chest.dir] : CHEST_CW[chest.dir];
                  const [dx, dz] = BED_DIRS[d];
                  return ny === 0 && nx === dx && nz === dz;
                }
              : def.shape === 'stair'
              ? (nx: number, ny: number, nz: number, fx0: number, fy0: number, fz0: number, fx1: number, fy1: number, fz1: number): boolean => {
                  if (ny !== 0) return false;
                  const side = nx > 0 ? 0 : nx < 0 ? 1 : nz > 0 ? 2 : 3;
                  const onEdge = side === 0 ? fx1 === 1 : side === 1 ? fx0 === 0 : side === 2 ? fz1 === 1 : fz0 === 0;
                  if (!onEdge) return false;
                  const a0 = side < 2 ? fz0 : fx0;
                  const a1 = side < 2 ? fz1 : fx1;
                  return stairFaceCovered(blockAt(x + nx, y, z + nz), side, fy0, fy1, a0, a1, (dx, dz) => blockAt(x + dx, y, z + dz));
                }
              : undefined;
          const sheet = def.render === 'translucent' ? translucentB : opaqueB;
          emitBoxes(sheet, boxes, x, y, z, tiles, sky, blk, (dx, dy, dz) => isOpaque(x + dx, y + dy, z + dz), onlyAxis, doorHinge(id), hides);
        } else {
          emitTorch(opaqueB, id, x, y, z, tile, sky, blk);
        }
      }
    }
  }

  return { opaque: opaqueB.finish(), translucent: waterFirst(translucentB.finish()) };
}

/** A vertical double-sided quad from (x0,z0) to (x1,z1), `h` tall, with the full tile mapped on it. */
/**
 * A plant on the ground: four planes crossing in a star, each block turned and nudged differently, so it has a body to walk round
 * and look down on (two crossed planes are a pair of thin lines from above), and a meadow is a tangle and not a grid. The turn
 * depends on where the block is in its column only (not its height), so a stack of sugar cane stays one stalk.
 */
function emitCluster(b: Builder, x: number, y: number, z: number, tile: number, sky: number, blk: number, tint: number): void {
  let h = Math.imul(x * 73856093 ^ z * 19349663, 0x2545f491);
  h ^= h >>> 15;
  h = Math.imul(h, 0x9e3779b1);
  h ^= h >>> 13;
  const turn = ((h & 255) / 255) * (Math.PI / 4);
  const cx = x + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.1;
  const cz = z + 0.5 + (((h >>> 16) & 255) / 255 - 0.5) * 0.1;
  const half = 0.42;
  for (let k = 0; k < 4; k++) {
    const a = turn + (k * Math.PI) / 4;
    const dx = Math.cos(a) * half;
    const dz = Math.sin(a) * half;
    emitPlane(b, cx - dx, y, cz - dz, cx + dx, y, cz + dz, 1, tile, sky, blk, tint);
  }
}
function emitPlane(
  b: Builder,
  x0: number,
  y: number,
  z0: number,
  x1: number,
  _y1: number,
  z1: number,
  h: number,
  tile: number,
  sky: number,
  blk: number,
  tint = 0,
): void {
  const corners: [number, number, number, number, number][] = [
    [x0, y, z0, 0, 0],
    [x1, y, z1, 1, 0],
    [x1, y + h, z1, 1, 1],
    [x0, y + h, z0, 0, 1],
  ];
  pushQuad(b, corners, tile, 0.95, sky, blk, tint);
  pushQuad(b, [corners[1], corners[0], corners[3], corners[2]], tile, 0.95, sky, blk, tint);
}

function pushQuad(
  b: Builder,
  c: [number, number, number, number, number][],
  tile: number,
  shade: number,
  sky: number,
  blk: number,
  tint = 0,
): void {
  for (const [px, py, pz, u, v] of c) {
    b.positions.push3(px, py, pz);
    b.uvs.push2(u, v);
    b.tiles.push1(tile);
    b.light.push4(Math.round(shade * 255), Math.round((sky / 60) * 255), Math.round((blk / 60) * 255), tint);
  }
  const v = b.vertexCount;
  b.indices.push6(v, v + 1, v + 2, v, v + 2, v + 3);
  b.vertexCount += 4;
}

/** Redstone dust: a dot in the middle and an arm to every side it connects to (short stubs when alone), brighter when stronger. */
function emitWire(b: Builder, power: number, x: number, y: number, z: number, arms: number, dot: number, line: number, sky: number, blk: number): void {
  const shade = 0.45 + (0.55 * power) / 15;
  const fy = y + 0.03;
  const flat = (x0: number, z0: number, x1: number, z1: number, tile: number): void =>
    pushQuad(b, [[x0, fy, z1, 0, 0], [x1, fy, z1, 1, 0], [x1, fy, z0, 1, 1], [x0, fy, z0, 0, 1]], tile, shade, sky, blk);
  flat(x + 5 / 16, z + 5 / 16, x + 11 / 16, z + 11 / 16, dot);
  const none = (arms & 15) === 0;
  const far = none ? 15 / 16 : 1;
  const near = 1 - far;
  if (none || arms & 1) flat(x + 11 / 16, z + 5 / 16, x + far, z + 11 / 16, line);
  if (none || arms & 2) flat(x + near, z + 5 / 16, x + 5 / 16, z + 11 / 16, line);
  if (none || arms & 4) flat(x + 5 / 16, z + 11 / 16, x + 11 / 16, z + far, line);
  if (none || arms & 8) flat(x + 5 / 16, z + near, x + 11 / 16, z + 5 / 16, line);
  // An arm that climbs the block beside also runs up its wall.
  const y1 = y + 1.03;
  const wall = (px: number, z0: number, z1: number, x0 = px): void => {
    const q: [number, number, number, number, number][] = [[x0, fy, z0, 0, 0], [px, fy, z1, 1, 0], [px, y1, z1, 1, 1], [x0, y1, z0, 0, 1]];
    pushQuad(b, q, line, shade, sky, blk);
    pushQuad(b, [q[1], q[0], q[3], q[2]], line, shade, sky, blk);
  };
  const tall = (arms >> 4) & 15;
  if (tall & 1) wall(x + 0.98, z + 5 / 16, z + 11 / 16);
  if (tall & 2) wall(x + 0.02, z + 5 / 16, z + 11 / 16);
  const side = (pz: number, x0: number, x1: number): void => {
    const q: [number, number, number, number, number][] = [[x0, fy, pz, 0, 0], [x1, fy, pz, 1, 0], [x1, y1, pz, 1, 1], [x0, y1, pz, 0, 1]];
    pushQuad(b, q, line, shade, sky, blk);
    pushQuad(b, [q[1], q[0], q[3], q[2]], line, shade, sky, blk);
  };
  if (tall & 4) side(z + 0.98, x + 5 / 16, x + 11 / 16);
  if (tall & 8) side(z + 0.02, x + 5 / 16, x + 11 / 16);
}

const BOXED = new Set(['slab', 'stair', 'door', 'trapdoor', 'ladder', 'fence', 'gate', 'pane', 'table', 'lever', 'button', 'plate', 'lantern', 'chain', 'cocoa', 'cake', 'wall', 'sign', 'chest']);

const CAMPFIRE_LOG = { top: tileIndex('log_top'), bottom: tileIndex('log_top'), side: tileIndex('log_side') };
const CAMPFIRE_FIRE = tileIndex('fire_0');

/** Turn a box 90 degrees around the middle of the cell, `turns` times, counter-clockwise looking down. */
function turnBox(box: readonly number[], turns: number): [number, number, number, number, number, number] {
  let [x0, y0, z0, x1, y1, z1] = box;
  for (let i = 0; i < turns; i++) {
    const nx0 = z0;
    const nz0 = 1 - x1;
    const nx1 = z1;
    const nz1 = 1 - x0;
    x0 = Math.min(nx0, nx1);
    x1 = Math.max(nx0, nx1);
    z0 = Math.min(nz0, nz1);
    z1 = Math.max(nz0, nz1);
  }
  return [x0, y0, z0, x1, y1, z1];
}

/**
 * Four logs in a square, and a flame in the middle when it is lit. The top pair of logs points the way the campfire faces.
 * Facing +z is the unrotated arrangement; the others are that arrangement turned to match BED_DIRS.
 */
function emitCampfire(b: Builder, id: number, x: number, y: number, z: number, sky: number, blk: number, solidAt: (dx: number, dy: number, dz: number) => boolean): void {
  const info = campfireInfo(id);
  const turns = [1, 3, 0, 2][info?.facing ?? 2]!;
  const logs: [number, number, number, number, number, number][] = [
    [0, 0, 1 / 16, 1, 4 / 16, 5 / 16],
    [0, 0, 11 / 16, 1, 4 / 16, 15 / 16],
    [1 / 16, 3 / 16, 0, 5 / 16, 7 / 16, 1],
    [11 / 16, 3 / 16, 0, 15 / 16, 7 / 16, 1],
  ];
  emitBoxes(b, logs.map((box) => turnBox(box, turns)), x, y, z, CAMPFIRE_LOG, sky, blk, solidAt);
  if (!info?.lit) return;
  const w = 3 / 16;
  const h = 12 / 16;
  const yb = y + 2 / 16;
  const px = x + 0.5;
  const pz = z + 0.5;
  emitPlane(b, px - w, yb, pz - w, px + w, yb, pz + w, h, CAMPFIRE_FIRE, sky, 60);
  emitPlane(b, px - w, yb, pz + w, px + w, yb, pz - w, h, CAMPFIRE_FIRE, sky, 60);
}

/**
 * Draw boxes given in cell units. Texture coordinates follow the world position, so a half-height slab shows
 * the lower half of its tile and the faces of a stair line up. `onlyAxis` (0 = x, 2 = z) draws just the two
 * broad faces of a flat thing such as a ladder.
 */
function emitBoxes(
  b: Builder,
  boxes: readonly (readonly number[])[],
  x: number,
  y: number,
  z: number,
  tiles: { top: number; bottom: number; side: number },
  sky: number,
  blk: number,
  solidAt: (dx: number, dy: number, dz: number) => boolean,
  onlyAxis = -1,
  /** Doors: the handle goes on the end away from the hinge, on both faces, and the thin edges show plain wood. */
  door: { alongZ: boolean; hingeAtOne: boolean } | null = null,
  /** A stair face already filled by the block it sits against is left out, so a corner has one surface. */
  hides?: (nx: number, ny: number, nz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => boolean,
): void {
  for (const q of boxes) {
    const [x0, y0, z0, x1, y1, z1] = q;
    const fullX = x0 === 0 && x1 === 1;
    const fullY = y0 === 0 && y1 === 1;
    const fullZ = z0 === 0 && z1 === 1;
    const wantY = onlyAxis < 0;
    // Horizontal texture coordinate on faces facing x (a function of z) and z (a function of x).
    const free = (c: number) => (door && door.hingeAtOne ? 1 - c : c);
    const uOfZ = (c: number) => (door ? (door.alongZ ? free(c) : c - z0) : null);
    const uOfX = (c: number) => (door ? (door.alongZ ? c - x0 : free(c)) : null);
    if (wantY && !(y1 === 1 && fullX && fullZ && solidAt(0, 1, 0))) {
      const [u0, u1, v0, v1] = door ? [0, x1 - x0, 0, z1 - z0] : [x0, x1, z0, z1];
      pushFacing(b, [[x + x0, y + y1, z + z0, u0, v0], [x + x0, y + y1, z + z1, u0, v1], [x + x1, y + y1, z + z1, u1, v1], [x + x1, y + y1, z + z0, u1, v0]], 0, 1, 0, tiles.top, 1, sky, blk);
    }
    if (wantY && !(y0 === 0 && fullX && fullZ && solidAt(0, -1, 0))) {
      const [u0, u1, v0, v1] = door ? [0, x1 - x0, 0, z1 - z0] : [x0, x1, z0, z1];
      pushFacing(b, [[x + x0, y + y0, z + z0, u0, v0], [x + x0, y + y0, z + z1, u0, v1], [x + x1, y + y0, z + z1, u1, v1], [x + x1, y + y0, z + z0, u1, v0]], 0, -1, 0, tiles.bottom, 0.5, sky, blk);
    }
    if (onlyAxis !== 2) {
      // Without a door these keep world-aligned coordinates (+x is seen from the other side, so z runs backwards).
      const pz0 = uOfZ(z0) ?? 1 - z0;
      const pz1 = uOfZ(z1) ?? 1 - z1;
      const nz0 = uOfZ(z0) ?? z0;
      const nz1 = uOfZ(z1) ?? z1;
      if (!(x1 === 1 && fullY && fullZ && solidAt(1, 0, 0)) && !hides?.(1, 0, 0, x1, y0, z0, x1, y1, z1)) {
        pushFacing(b, [[x + x1, y + y0, z + z0, pz0, y0], [x + x1, y + y0, z + z1, pz1, y0], [x + x1, y + y1, z + z1, pz1, y1], [x + x1, y + y1, z + z0, pz0, y1]], 1, 0, 0, tiles.side, 0.8, sky, blk);
      }
      if (!(x0 === 0 && fullY && fullZ && solidAt(-1, 0, 0)) && !hides?.(-1, 0, 0, x0, y0, z0, x0, y1, z1)) {
        pushFacing(b, [[x + x0, y + y0, z + z0, nz0, y0], [x + x0, y + y0, z + z1, nz1, y0], [x + x0, y + y1, z + z1, nz1, y1], [x + x0, y + y1, z + z0, nz0, y1]], -1, 0, 0, tiles.side, 0.8, sky, blk);
      }
    }
    if (onlyAxis !== 0) {
      const px0 = uOfX(x0) ?? x0;
      const px1 = uOfX(x1) ?? x1;
      const mx0 = uOfX(x0) ?? 1 - x0;
      const mx1 = uOfX(x1) ?? 1 - x1;
      if (!(z1 === 1 && fullX && fullY && solidAt(0, 0, 1)) && !hides?.(0, 0, 1, x0, y0, z1, x1, y1, z1)) {
        pushFacing(b, [[x + x0, y + y0, z + z1, px0, y0], [x + x1, y + y0, z + z1, px1, y0], [x + x1, y + y1, z + z1, px1, y1], [x + x0, y + y1, z + z1, px0, y1]], 0, 0, 1, tiles.side, 0.9, sky, blk);
      }
      if (!(z0 === 0 && fullX && fullY && solidAt(0, 0, -1)) && !hides?.(0, 0, -1, x0, y0, z0, x1, y1, z0)) {
        pushFacing(b, [[x + x0, y + y0, z + z0, mx0, y0], [x + x1, y + y0, z + z0, mx1, y0], [x + x1, y + y1, z + z0, mx1, y1], [x + x0, y + y1, z + z0, mx0, y1]], 0, 0, -1, tiles.side, 0.9, sky, blk);
      }
    }
  }
}

const BED_PLANKS = tileIndex('planks');
/** The six tile indices of every bed colour. */
const BED_TILES = DYE_NAMES.map((_, c) => ({
  topFoot: tileIndex(bedTileName('top_foot', c)),
  topHead: tileIndex(bedTileName('top_head', c)),
  sideFoot: tileIndex(bedTileName('side_foot', c)),
  sideHead: tileIndex(bedTileName('side_head', c)),
  endFoot: tileIndex(bedTileName('end_foot', c)),
  endHead: tileIndex(bedTileName('end_head', c)),
}));

type Corner = [number, number, number, number, number];

/** Push a quad whose winding is fixed up so that it faces along (nx, ny, nz). */
function pushFacing(b: Builder, c: Corner[], nx: number, ny: number, nz: number, tile: number, shade: number, sky: number, blk: number): void {
  const ux = c[1][0] - c[0][0];
  const uy = c[1][1] - c[0][1];
  const uz = c[1][2] - c[0][2];
  const vx = c[2][0] - c[0][0];
  const vy = c[2][1] - c[0][1];
  const vz = c[2][2] - c[0][2];
  const dot = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
  pushQuad(b, dot >= 0 ? c : [c[0], c[3], c[2], c[1]], tile, shade, sky, blk);
}

/**
 * A bed half: a 9/16-high slab that is one cell wide and one long. `a` runs along the bed toward the head,
 * `t` across it. Top faces put the head end at the top of the tile; side and end faces use the lower
 * nine rows. The face against the other half is left out.
 */
function emitBed(b: Builder, id: number, x: number, y: number, z: number, sky: number, blk: number, blockAt: (x: number, y: number, z: number) => number): void {
  const info = bedInfo(id);
  if (!info) return;
  const { dx, dz, head } = info;
  // Only the foot half knows the colour; the head looks at the foot beside it (red if that is not loaded).
  let color = info.color;
  if (head) {
    const foot = bedInfo(blockAt(x - dx, y, z - dz));
    color = foot && !foot.head ? foot.color : BED_RED;
  }
  const T = BED_TILES[color];
  const px = -dz;
  const pz = dx;
  const H = BED_HEIGHT;
  const at = (a: number, t: number, h: number, u: number, v: number): Corner => [x + 0.5 + dx * (a - 0.5) + px * (t - 0.5), y + h, z + 0.5 + dz * (a - 0.5) + pz * (t - 0.5), u, v];
  const sideShade = (nx: number) => (nx !== 0 ? 0.8 : 0.9);

  // top
  pushFacing(b, [at(0, 0, H, 0, 0), at(0, 1, H, 1, 0), at(1, 1, H, 1, 1), at(1, 0, H, 0, 1)], 0, 1, 0, head ? T.topHead : T.topFoot, 1, sky, blk);
  // bottom, a hair above the floor so it never fights with it
  pushFacing(b, [at(0, 0, 0.002, 0, 0), at(0, 1, 0.002, 1, 0), at(1, 1, 0.002, 1, 1), at(1, 0, 0.002, 0, 1)], 0, -1, 0, BED_PLANKS, 0.5, sky, blk);
  // the two long sides
  const sideTile = head ? T.sideHead : T.sideFoot;
  for (const t of [0, 1]) {
    const s = t === 1 ? 1 : -1;
    pushFacing(b, [at(0, t, 0, 0, 0), at(1, t, 0, 1, 0), at(1, t, H, 1, H), at(0, t, H, 0, H)], px * s, 0, pz * s, sideTile, sideShade(px * s), sky, blk);
  }
  // the outer end: the pillow end of the head half, the foot end of the foot half
  const a = head ? 1 : 0;
  const s = head ? 1 : -1;
  pushFacing(b, [at(a, 0, 0, 0, 0), at(a, 1, 0, 1, 0), at(a, 1, H, 1, H), at(a, 0, H, 0, H)], dx * s, 0, dz * s, head ? T.endHead : T.endFoot, sideShade(dx * s), sky, blk);
}
const TORCH_HALF = 1 / 16;
const TORCH_HEIGHT = 10 / 16;

/** A thin 2x2x10 pixel post; wall torches sit against their support, a little raised. */
function emitTorch(b: Builder, id: number, x: number, y: number, z: number, tile: number, sky: number, blk: number): void {
  let cx = 0.5;
  let cz = 0.5;
  let lift = 0;
  if (id !== B.TORCH) {
    const [sx, , sz] = torchSupport(id);
    cx += sx * 0.34;
    cz += sz * 0.34;
    lift = 0.2;
  }
  const x0 = x + cx - TORCH_HALF;
  const x1 = x + cx + TORCH_HALF;
  const z0 = z + cz - TORCH_HALF;
  const z1 = z + cz + TORCH_HALF;
  const y0 = y + lift;
  const y1 = y + lift + TORCH_HEIGHT;
  // Texture columns 7..8 of the tile; the top face samples the flame row.
  const u0 = 7 / 16;
  const u1 = 9 / 16;
  for (let fi = 0; fi < FACES.length; fi++) {
    const f = FACES[fi];
    if (f.kind === 'bottom') continue;
    const top = f.kind === 'top';
    const v0 = top ? TORCH_HEIGHT - 1 / 16 : 0;
    const v1 = TORCH_HEIGHT;
    const pts = f.corners.map((cc, ci): [number, number, number, number, number] => {
      const uu = ci === 1 || ci === 2 ? u1 : u0;
      const vv = ci >= 2 ? v1 : v0;
      return [cc[0] ? x1 : x0, cc[1] ? y1 : y0, cc[2] ? z1 : z0, uu, vv];
    });
    pushQuad(b, pts, tile, f.shade, sky, blk);
  }
  // A redstone torch is a red tip on a stick. A normal torch carries a flame above the wood.
  if (rtorchInfo(id)) return;
  const flame = tileIndex('torch_flame_0');
  const yb = y + lift + 8 / 16;
  const w = 4 / 16;
  const h = 7 / 16;
  const px = x + cx;
  const pz = z + cz;
  emitPlane(b, px - w, yb, pz - w, px + w, yb, pz + w, h, flame, sky, blk);
  emitPlane(b, px - w, yb, pz + w, px + w, yb, pz - w, h, flame, sky, blk);
}

function emitQuad(
  b: Builder,
  f: FaceDef,
  n: number,
  i0: number,
  j0: number,
  w: number,
  h: number,
  S: number,
  T: number,
  tile: number,
  drop: number,
  ao: number[],
  sky: number[],
  blk: number[],
  tint = 0,
  yBias = 0,
  lift = 0,
): void {
  origin[f.nAxis] = n + (f.nSign > 0 ? 1 : 0);
  origin[f.sAxis] = f.sSign > 0 ? i0 : S - i0;
  origin[f.tAxis] = f.tSign > 0 ? j0 : T - j0;

  for (let c = 0; c < 4; c++) {
    const ds = c === 1 || c === 2 ? w : 0;
    const dt = c === 2 || c === 3 ? h : 0;
    pos[0] = origin[0];
    pos[1] = origin[1];
    pos[2] = origin[2];
    pos[f.sAxis] += f.sSign * ds;
    pos[f.tAxis] += f.tSign * dt;

    let py = pos[1];
    if (drop > 0) {
      // Fluid surfaces sit below the block top: all top-face vertices, and the upper two of side faces.
      if (f.kind === 'top' || (f.kind === 'side' && c >= 2)) py -= drop / 16;
    }
    // The lower two corners of a side rise, so the face is only the edge above the water and not the wall under it.
    if (lift > 0 && f.kind === 'side' && c < 2) py += lift / 16;
    b.positions.push3(pos[0], py + yBias, pos[2]);
    b.uvs.push2(ds, dt);
    b.tiles.push1(tile);
    b.light.push4(
      Math.round(f.shade * AO_LEVELS[ao[c]] * 255),
      Math.round((sky[c] / 60) * 255),
      Math.round((blk[c] / 60) * 255),
      tint,
    );
  }

  const v = b.vertexCount;
  if (ao[0] + ao[2] > ao[1] + ao[3]) {
    b.indices.push6(v, v + 1, v + 2, v, v + 2, v + 3);
  } else {
    b.indices.push6(v + 1, v + 2, v + 3, v + 1, v + 3, v);
  }
  b.vertexCount += 4;
}
