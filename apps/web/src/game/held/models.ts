import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, B, BLOCKS, TILE_PX, getItem, lanternId, lanternInfo, meshBoxes, tileIndex } from '@solrift/shared';

/**
 * The little solid models of items, built from the atlas: a block is a real cube with its own faces, anything else its picture built up
 * in pixels (one block per opaque pixel, a layer more front and back wherever a pixel has neighbours all round it), and a lantern is the
 * block's own boxes. The hand, the figures and the things lying on the ground are all made of these.
 */

export const FACE_SHADE = [0.8, 0.8, 1, 0.5, 0.9, 0.9]; // +x -x +y -y +z -z (BoxGeometry order)
export const SLAB = 1.6 / TILE_PX;
/** One pixel of an item's picture, in the sprite's units: the layers of its voxel model are this thick. */
const LAYER = 1 / TILE_PX;

/**
 * What a sprite model is made of, quad by quad, for the effects that colour a picture's pixels afterwards (see held/heat.ts): the pixel each
 * quad belongs to (x, y in the picture's grid), its colour before the shading (linear) and its shading.
 */
export interface SpriteData {
  pix: Int16Array;
  base: Float32Array;
  shade: Float32Array;
}
/** The data of every sprite geometry made (not kept alive by it). A clone of a geometry is not in here: the one who clones it keeps the data. */
export const spriteData = new WeakMap<THREE.BufferGeometry, SpriteData>();

export class ItemModels {
  /** The light on the hand: every material made here is kept in this colour. */
  readonly tint = new THREE.Color(1, 1, 1);
  private readonly pixels: Uint8ClampedArray;
  private materials: THREE.MeshBasicMaterial[] = [];

  constructor(
    atlasCanvas: HTMLCanvasElement,
    readonly atlasTexture: THREE.Texture,
  ) {
    this.pixels = atlasCanvas.getContext('2d')!.getImageData(0, 0, atlasCanvas.width, atlasCanvas.height).data;
  }

  /** Keep a material lit like the hand (and dispose of it with the rest). */
  track(m: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
    this.materials.push(m);
    return m;
  }

  /** A material for plain coloured boxes (the colours are in the corners), lit like the hand. */
  flat(): THREE.MeshBasicMaterial {
    const m = this.track(new THREE.MeshBasicMaterial({ vertexColors: true }));
    m.color.copy(this.tint);
    return m;
  }

  /** The light on the hand, as a colour: gold at dusk, blue at night, orange next to a torch. */
  setLight(c: THREE.Color): void {
    const f = (v: number) => Math.min(1, Math.max(0.3, v));
    this.tint.setRGB(f(c.r), f(c.g), f(c.b));
    for (const m of this.materials) m.color.copy(this.tint);
  }

  /** A box with one flat colour (sRGB hex) and the same face shading as the extruded sprites. */
  colorBox(w: number, h: number, d: number, hex: number, ox = 0): THREE.BufferGeometry {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(ox, 0, 0);
    const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
    const colors = new Float32Array(24 * 3);
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) colors.set([c.r * FACE_SHADE[f], c.g * FACE_SHADE[f], c.b * FACE_SHADE[f]], (f * 4 + k) * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }

  /** A textured cube using each face's atlas tile. */
  cube(def: (typeof BLOCKS)[number]): THREE.Mesh {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const tiles = [def.tiles.side, def.tiles.side, def.tiles.top, def.tiles.bottom, def.tiles.side, def.tiles.side];
    const colors = new Float32Array(24 * 3);
    for (let f = 0; f < 6; f++) {
      const col = tiles[f] % ATLAS_COLS;
      const row = Math.floor(tiles[f] / ATLAS_COLS);
      const u0 = col / ATLAS_COLS;
      const u1 = (col + 1) / ATLAS_COLS;
      const v0 = 1 - (row + 1) / ATLAS_ROWS;
      const v1 = 1 - row / ATLAS_ROWS;
      const o = f * 4;
      uv.setXY(o, u0, v1);
      uv.setXY(o + 1, u1, v1);
      uv.setXY(o + 2, u0, v0);
      uv.setXY(o + 3, u1, v0);
      for (let k = 0; k < 4; k++) colors.set([FACE_SHADE[f], FACE_SHADE[f], FACE_SHADE[f]], (o + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = this.track(new THREE.MeshBasicMaterial({ map: this.atlasTexture, vertexColors: true, alphaTest: 0.5, transparent: false }));
    mat.color.copy(this.tint);
    return new THREE.Mesh(geo, mat);
  }

  /**
   * A lantern as it is carried: a real little 3D lantern (the block's own boxes and pictures, in the same colours), the ring in the
   * hand and the cage hanging below it. The origin is the grip.
   */
  lanternMesh(blockId: number): THREE.Mesh {
    const info = lanternInfo(blockId)!;
    const standing = lanternId(info.soul, false);
    const name = info.soul ? 'soul_lantern' : 'lantern';
    const sideTile = tileIndex(name);
    const topTile = tileIndex(`${name}_top`);
    const pos: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const idx: number[] = [];
    let n = 0;
    const tileUv = (tile: number, u: number, v: number): [number, number] => [(tile % ATLAS_COLS + u) / ATLAS_COLS, 1 - (Math.floor(tile / ATLAS_COLS) + 1 - v) / ATLAS_ROWS];
    const face = (c: number[][], nx: number, ny: number, nz: number, tile: number, shade: number): void => {
      // c: [x, y, z, u, v] corners; wound so the face looks along (nx, ny, nz).
      const ux = c[1][0] - c[0][0];
      const uy = c[1][1] - c[0][1];
      const uz = c[1][2] - c[0][2];
      const vx = c[2][0] - c[0][0];
      const vy = c[2][1] - c[0][1];
      const vz = c[2][2] - c[0][2];
      const dot = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
      const q = dot >= 0 ? c : [c[0], c[3], c[2], c[1]];
      for (const p of q) {
        pos.push(p[0] - 0.5, p[1] - 10 / TILE_PX, p[2] - 0.5);
        uvs.push(...tileUv(tile, p[3], p[4]));
        colors.push(shade, shade, shade);
      }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    };
    for (const [x0, y0, z0, x1, y1, z1] of meshBoxes(standing, () => B.AIR)) {
      face([[x0, y1, z0, x0, z0], [x0, y1, z1, x0, z1], [x1, y1, z1, x1, z1], [x1, y1, z0, x1, z0]], 0, 1, 0, topTile, 1);
      face([[x0, y0, z0, x0, z0], [x0, y0, z1, x0, z1], [x1, y0, z1, x1, z1], [x1, y0, z0, x1, z0]], 0, -1, 0, topTile, 0.5);
      face([[x1, y0, z0, 1 - z0, y0], [x1, y0, z1, 1 - z1, y0], [x1, y1, z1, 1 - z1, y1], [x1, y1, z0, 1 - z0, y1]], 1, 0, 0, sideTile, 0.8);
      face([[x0, y0, z0, z0, y0], [x0, y0, z1, z1, y0], [x0, y1, z1, z1, y1], [x0, y1, z0, z0, y1]], -1, 0, 0, sideTile, 0.8);
      face([[x0, y0, z1, x0, y0], [x1, y0, z1, x1, y0], [x1, y1, z1, x1, y1], [x0, y1, z1, x0, y1]], 0, 0, 1, sideTile, 0.9);
      face([[x0, y0, z0, 1 - x0, y0], [x1, y0, z0, 1 - x1, y0], [x1, y1, z0, 1 - x1, y1], [x0, y1, z0, 1 - x0, y1]], 0, 0, -1, sideTile, 0.9);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    const mat = this.track(new THREE.MeshBasicMaterial({ map: this.atlasTexture, vertexColors: true, alphaTest: 0.5, transparent: false }));
    mat.color.copy(this.tint);
    return new THREE.Mesh(geo, mat);
  }

  /** The colours (0xRRGGBB) of the opaque pixels of an item's picture, up to `max` of them picked from across it: crumbs of it look like it. */
  crumbColors(id: number, max = 12): number[] {
    const tile = getItem(id).tile;
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    const stride = ATLAS_COLS * TILE_PX * 4;
    const all: number[] = [];
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const o = (row * TILE_PX + y) * stride + (col * TILE_PX + x) * 4;
        if (this.pixels[o + 3] < 128) continue;
        all.push((this.pixels[o] << 16) | (this.pixels[o + 1] << 8) | this.pixels[o + 2]);
      }
    }
    if (all.length <= max) return all;
    const out: number[] = [];
    for (let i = 0; i < max; i++) out.push(all[Math.floor(((i + 0.5) * all.length) / max)]);
    return out;
  }

  /**
   * A 16x16 atlas tile as a little voxel model.
   * `stretch` makes a blade longer: every pixel from the middle of the blade to the tip moves `stretch` pixels along the diagonal
   * (up and right) and the gap is filled by repeating the blade's own last two diagonal rows, so it stays pixel art, not a squashed picture.
   * The grid grows by `stretch` on the right and the top.
   */
  sprite(tile: number, stretch = 0): THREE.Mesh {
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    const stride = ATLAS_COLS * TILE_PX * 4;
    const grid = TILE_PX + stretch;
    const MID = 2;
    const px = (gx: number, gy: number): [number, number, number, number] | null => {
      let x = gx;
      let y = gy - stretch;
      if (stretch > 0) {
        const u = x - y;
        if (u >= MID) {
          const j = Math.min(stretch, Math.ceil((u - MID + 1) / 2));
          x -= j;
          y += j;
        }
      }
      if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) return null;
      const o = (row * TILE_PX + y) * stride + (col * TILE_PX + x) * 4;
      const a = this.pixels[o + 3];
      return a < 128 ? null : [this.pixels[o] / 255, this.pixels[o + 1] / 255, this.pixels[o + 2] / 255, a];
    };

    const pos: number[] = [];
    const colors: number[] = [];
    const idx: number[] = [];
    let n = 0;
    // which pixel the quads being made belong to (for `spriteData`)
    let cx = 0;
    let cy = 0;
    const qpix: number[] = [];
    const qbase: number[] = [];
    const qshade: number[] = [];
    const quad = (v: number[][], c: [number, number, number], shade: number): void => {
      qpix.push(cx, cy);
      qbase.push(c[0], c[1], c[2]);
      qshade.push(shade);
      for (const p of v) {
        pos.push(p[0], p[1], p[2]);
        colors.push(c[0] * shade, c[1] * shade, c[2] * shade);
      }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    };

    // A real little voxel model: the picture is one pixel thick all over, and wherever a pixel has neighbours on all four sides it is
    // built up by one more pixel front and back. A blade gets a ridge down the middle, a head a boss, and the outline stays a
    // thin rim round them: stepped like blocks, never smooth.
    const h = LAYER / 2;
    const rise = LAYER;
    const solid = (x: number, y: number): boolean => px(x, y) !== null;
    const raised = (x: number, y: number): boolean => solid(x, y) && solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1);
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        const c = px(x, y);
        if (!c) continue;
        cx = x;
        cy = y;
        let base: [number, number, number] = [c[0], c[1], c[2]];
        if (base[0] < 0.16 && base[1] < 0.16 && base[2] < 0.18) {
          // The icon outline is near-black; in hand it should be a dark shade of the material instead.
          let r = 0;
          let g = 0;
          let b = 0;
          let k = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const q = px(x + dx, y + dy);
              if (!q || (q[0] < 0.16 && q[1] < 0.16 && q[2] < 0.18)) continue;
              r += q[0];
              g += q[1];
              b += q[2];
              k++;
            }
          }
          if (k > 0) base = [(r / k) * 0.42, (g / k) * 0.42, (b / k) * 0.42];
        }
        // Vertex colours are linear; the atlas pixels are sRGB.
        const lin = new THREE.Color().setRGB(base[0], base[1], base[2], THREE.SRGBColorSpace);
        const rgb: [number, number, number] = [lin.r, lin.g, lin.b];
        const x0 = x / TILE_PX - 0.5;
        const x1 = (x + 1) / TILE_PX - 0.5;
        const y1 = 0.5 - (y - stretch) / TILE_PX;
        const y0 = 0.5 - (y - stretch + 1) / TILE_PX;
        const up = raised(x, y);
        // Front and back of this pixel's column: at the top of the boss where there is one, on the base where there is not.
        const zf = up ? h + rise : h;
        quad([[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf]], rgb, up ? 1 : 0.86); // front
        quad([[x1, y0, -zf], [x0, y0, -zf], [x0, y1, -zf], [x1, y1, -zf]], rgb, up ? 0.85 : 0.72); // back
        // Sides: where the neighbour is empty the whole depth of the column shows; where it is a lower (unraised) pixel only the
        // part that stands above it does, at the front and at the back.
        const walls = (nx: number, ny: number, wall: (lo: number, hi: number) => void): void => {
          if (!solid(nx, ny)) wall(-zf, zf);
          else if (up && !raised(nx, ny)) {
            wall(h, zf);
            wall(-zf, -h);
          }
        };
        walls(x + 1, y, (lo, hi) => quad([[x1, y0, hi], [x1, y0, lo], [x1, y1, lo], [x1, y1, hi]], rgb, 0.8));
        walls(x - 1, y, (lo, hi) => quad([[x0, y0, lo], [x0, y0, hi], [x0, y1, hi], [x0, y1, lo]], rgb, 0.8));
        walls(x, y - 1, (lo, hi) => quad([[x0, y1, hi], [x1, y1, hi], [x1, y1, lo], [x0, y1, lo]], rgb, 0.95));
        walls(x, y + 1, (lo, hi) => quad([[x0, y0, lo], [x1, y0, lo], [x1, y0, hi], [x0, y0, hi]], rgb, 0.6));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    spriteData.set(geo, { pix: Int16Array.from(qpix), base: Float32Array.from(qbase), shade: Float32Array.from(qshade) });
    return new THREE.Mesh(geo, this.flat());
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}
