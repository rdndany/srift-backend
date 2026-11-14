import { B, BLOCKS, CHUNK_SIZE, IS_LIQUID, IS_SOLID, TILE_PX, ATLAS_COLS, WORLD_HEIGHT } from '@solrift/shared';

/**
 * The map: a top-down picture of the ground, painted chunk by chunk from the blocks the game has loaded
 * and remembered after they are gone, so it shows where you have been. The minimap in the corner and the
 * big map you hold up with the map item both draw from it. Nothing here needs the renderer; the painting
 * works on plain arrays and the tests run it on a small made-up world.
 */

export type RGB = [number, number, number];

/** Where the map reads blocks from. */
export interface MapSource {
  /** The blocks of a chunk (index = (y * 16 + z) * 16 + x), or null when it is not loaded. */
  chunk(cx: number, cz: number): Uint16Array | null;
}

/** Walk-through things (plants, torches, rails) are not ground. */
const isGround = (id: number): boolean => id !== B.AIR && (IS_SOLID[id] === 1 || IS_LIQUID[id] === 1);

export interface Column {
  /** The block seen from above, its height and (for liquids) how deep it is; y = -1 when nothing is there or the chunk is missing. */
  id: number;
  y: number;
  depth: number;
}

const NONE: Column = { id: B.AIR, y: -1, depth: 0 };

/**
 * What is on top of the column (x, z), looking down from `yTop`. Caves and rooms are seen by passing the
 * height of the player's head instead of the top of the world.
 */
export function columnAt(src: MapSource, x: number, z: number, yTop = WORLD_HEIGHT - 1): Column {
  const data = src.chunk(x >> 4, z >> 4);
  if (!data) return NONE;
  const lx = x & 15;
  const lz = z & 15;
  for (let y = Math.min(WORLD_HEIGHT - 1, yTop); y >= 0; y--) {
    const id = data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
    if (!isGround(id)) continue;
    let depth = 0;
    if (IS_LIQUID[id]) {
      for (let d = y - 1; d >= 0 && depth < 12; d--) {
        if (!IS_LIQUID[data[(d * CHUNK_SIZE + lz) * CHUNK_SIZE + lx]]) break;
        depth++;
      }
      depth++;
    }
    return { id, y, depth };
  }
  return NONE;
}

const WATER: RGB = [50, 98, 196];
const LAVA: RGB = [226, 96, 24];

/** The colour of a block seen from above, for the height difference to its north-west neighbour. */
export function shadeColumn(c: Column, colorOf: (id: number) => RGB, northWestY: number): RGB {
  if (c.y < 0) return [0, 0, 0];
  if (IS_LIQUID[c.id]) {
    const base = c.id === B.LAVA ? LAVA : WATER;
    const f = c.id === B.LAVA ? 1 : 1.12 - Math.min(c.depth, 12) * 0.05;
    return [base[0] * f, base[1] * f, base[2] * f].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
  }
  const rgb = colorOf(c.id);
  const d = northWestY < 0 ? 0 : Math.max(-4, Math.min(4, c.y - northWestY));
  const f = 1 + d * 0.07;
  return [Math.min(255, Math.round(rgb[0] * f)), Math.min(255, Math.round(rgb[1] * f)), Math.min(255, Math.round(rgb[2] * f))];
}

/** RGBA pixels (w x h, one per block) of the area whose north-west corner is (x0, z0); unloaded ground stays transparent. */
export function paintArea(src: MapSource, x0: number, z0: number, w: number, h: number, colorOf: (id: number) => RGB, yTop = WORLD_HEIGHT - 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  // One row of heights above the area and the one to the left are needed for the shading: keep the last row.
  let above = new Array<number>(w + 1).fill(-2);
  for (let j = 0; j < h; j++) {
    const row = new Array<number>(w + 1).fill(-2);
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const z = z0 + j;
      const c = columnAt(src, x, z, yTop);
      row[i + 1] = c.y;
      if (c.y < 0) continue;
      // Neighbour to the north-west: inside the area it is known; on the edge look it up.
      const nw = i > 0 && j > 0 ? above[i] : columnAt(src, x - 1, z - 1, yTop).y;
      const [r, g, b] = shadeColumn(c, colorOf, nw);
      const o = (j * w + i) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
    above = row;
  }
  return out;
}

/** What a block looks like from above: the average of its top texture, with fixed greens for the tinted ones. */
export function blockColors(atlas: HTMLCanvasElement): (id: number) => RGB {
  const g = atlas.getContext('2d', { willReadFrequently: true })!;
  const cache = new Map<number, RGB>();
  const fixed: Record<number, RGB> = {
    [B.GRASS]: [102, 158, 60],
    [B.LEAVES]: [52, 122, 42],
    [B.BIRCH_LEAVES]: [104, 146, 70],
    [B.SPRUCE_LEAVES]: [38, 88, 54],
    [B.ACACIA_LEAVES]: [86, 134, 40],
    [B.JUNGLE_LEAVES]: [38, 136, 36],
    [B.DARK_OAK_LEAVES]: [40, 100, 30],
    [B.CHERRY_LEAVES]: [238, 160, 190],
    [B.TALL_GRASS]: [102, 158, 60],
    [B.FERN]: [84, 140, 52],
  };
  return (id) => {
    const hit = cache.get(id);
    if (hit) return hit;
    let rgb = fixed[id];
    if (!rgb) {
      const tile = BLOCKS[id].tiles.top;
      const data = g.getImageData((tile % ATLAS_COLS) * TILE_PX, Math.floor(tile / ATLAS_COLS) * TILE_PX, TILE_PX, TILE_PX).data;
      let r = 0;
      let gr = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        r += data[i];
        gr += data[i + 1];
        b += data[i + 2];
        n++;
      }
      rgb = n ? [Math.round(r / n), Math.round(gr / n), Math.round(b / n)] : [128, 128, 128];
    }
    cache.set(id, rgb);
    return rgb;
  };
}

export interface MapMarker {
  name: string;
  x: number;
  z: number;
}

/** What a pin on the map is: a quest to take (`offer`), to hand in (`ready`) or still being done (`waiting`), a party member. */
export type PinKind = 'offer' | 'ready' | 'waiting' | 'party';

export interface MapPin {
  kind: PinKind;
  name: string;
  x: number;
  z: number;
}

interface Tile {
  canvas: HTMLCanvasElement;
  rev: number;
  at: number;
}

const tileKey = (cx: number, cz: number): string => `${cx},${cz}`;

/** How far (in chunks) from the player the map looks for ground to paint, and how many chunks it paints per call. */
const PAINT_RADIUS = 9;
const PAINT_PER_CALL = 2;
/** A chunk that changed is painted again after at least this long. */
const REPAINT_AFTER_MS = 1200;

/** The picture of the world, and what the HUD needs to know about the player to draw on it. */
export class MapData {
  private readonly tiles = new Map<string, Tile>();
  /** The player, for the arrow in the middle. `yaw` 0 looks north (-z). */
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  /** Other players. */
  others: MapMarker[] = [];
  /** Quest givers and party members. */
  pins: MapPin[] = [];
  /** True while the player is under a roof or ground: the minimap then shows the level they are on, not the surface. */
  underground = false;
  /** Set while the player is in a dungeon copy: the map then shows only that place (its level, cut at head height), nothing around it. */
  inside: { x0: number; z0: number; x1: number; z1: number } | null = null;

  private slice: { px: number; py: number; pz: number; at: number; w: number; image: ImageData } | null = null;

  constructor(
    private readonly src: MapSource,
    private readonly colorOf: (id: number) => RGB,
    private readonly revOf: (cx: number, cz: number) => number,
  ) {}

  get painted(): number {
    return this.tiles.size;
  }

  /** Remember where the player is, and paint a few of the chunks around that are new or changed. */
  update(x: number, y: number, z: number, yaw: number, now = performance.now()): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    let painted = 0;
    for (const o of offsets()) {
      if (painted >= PAINT_PER_CALL) break;
      const cx = pcx + o.dx;
      const cz = pcz + o.dz;
      const rev = this.revOf(cx, cz);
      if (rev < 0) continue;
      const have = this.tiles.get(tileKey(cx, cz));
      if (have && (have.rev === rev || now - have.at < REPAINT_AFTER_MS)) continue;
      this.paintChunk(cx, cz, rev, now);
      painted++;
    }
  }

  private paintChunk(cx: number, cz: number, rev: number, now: number): void {
    const pixels = paintArea(this.src, cx * CHUNK_SIZE, cz * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, this.colorOf);
    let tile = this.tiles.get(tileKey(cx, cz));
    if (!tile) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = CHUNK_SIZE;
      tile = { canvas, rev, at: now };
      this.tiles.set(tileKey(cx, cz), tile);
    }
    tile.rev = rev;
    tile.at = now;
    tile.canvas.getContext('2d')!.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, CHUNK_SIZE, CHUNK_SIZE), 0, 0);
  }

  /**
   * Draw the ground around (cx, cz), the world position at the middle of the picture, with `scale` pixels
   * to a block, on a canvas of w x h pixels. Land that has not been seen is left as it was.
   */
  draw(g: CanvasRenderingContext2D, cx: number, cz: number, scale: number, w: number, h: number): void {
    g.imageSmoothingEnabled = false;
    const left = cx - w / 2 / scale;
    const top = cz - h / 2 / scale;
    const c0 = Math.floor(left / CHUNK_SIZE);
    const c1 = Math.floor((left + w / scale) / CHUNK_SIZE);
    const r0 = Math.floor(top / CHUNK_SIZE);
    const r1 = Math.floor((top + h / scale) / CHUNK_SIZE);
    const size = CHUNK_SIZE * scale;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.tiles.get(tileKey(c, r));
        if (!t) continue;
        const sx = Math.round((c * CHUNK_SIZE - left) * scale);
        const sy = Math.round((r * CHUNK_SIZE - top) * scale);
        g.drawImage(t.canvas, sx, sy, size, size);
      }
    }
  }

  /**
   * The level the player is on (cut at head height), `w` x `w` blocks around them: what a minimap shows
   * underground. Repainted when the player moves a block or a quarter of a second has passed.
   */
  levelSlice(w: number, now = performance.now()): ImageData {
    const px = Math.floor(this.x);
    const py = Math.floor(this.y + 1);
    const pz = Math.floor(this.z);
    const s = this.slice;
    if (s && s.w === w && s.px === px && s.py === py && s.pz === pz && now - s.at < 250) return s.image;
    const half = Math.floor(w / 2);
    const pixels = paintArea(this.src, px - half, pz - half, w, w, this.colorOf, py + 1);
    const box = this.inside;
    if (box) {
      // Anything beyond the walls of the dungeon is not part of its map.
      for (let j = 0; j < w; j++) {
        for (let i = 0; i < w; i++) {
          const x = px - half + i;
          const z = pz - half + j;
          if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) pixels[(j * w + i) * 4 + 3] = 0;
        }
      }
    }
    const image = new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, w, w);
    this.slice = { px, py, pz, at: now, w, image };
    return image;
  }

  dispose(): void {
    this.tiles.clear();
    this.slice = null;
  }
}

let offsetList: { dx: number; dz: number }[] | null = null;
/** Chunk offsets around the player, nearest first. */
function offsets(): { dx: number; dz: number }[] {
  if (!offsetList) {
    const list: { dx: number; dz: number; d: number }[] = [];
    for (let dx = -PAINT_RADIUS; dx <= PAINT_RADIUS; dx++) for (let dz = -PAINT_RADIUS; dz <= PAINT_RADIUS; dz++) list.push({ dx, dz, d: dx * dx + dz * dz });
    list.sort((a, b) => a.d - b.d);
    offsetList = list;
  }
  return offsetList;
}
