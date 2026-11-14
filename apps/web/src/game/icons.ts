import { ATLAS_COLS, BLOCKS, TILE_PX, compassTileName, getItem, tileIndex } from '@solrift/shared';

/** Isometric block icon (or flat sprite for items), cached per item id. */
export class ItemIcons {
  private canvases = new Map<number, HTMLCanvasElement>();
  private urls = new Map<number, string>();

  constructor(private readonly atlas: HTMLCanvasElement) {}

  private tile(index: number): HTMLCanvasElement {
    const t = document.createElement('canvas');
    t.width = TILE_PX;
    t.height = TILE_PX;
    t.getContext('2d')!.drawImage(
      this.atlas,
      (index % ATLAS_COLS) * TILE_PX,
      Math.floor(index / ATLAS_COLS) * TILE_PX,
      TILE_PX,
      TILE_PX,
      0,
      0,
      TILE_PX,
      TILE_PX,
    );
    return t;
  }

  canvas(id: number, size = 48): HTMLCanvasElement {
    const hit = this.canvases.get(id);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const item = getItem(id);

    const shape = item.block !== null ? BLOCKS[item.block].shape : null;
    if (item.block !== null && (shape === 'cube' || shape === 'table' || shape === 'slab' || shape === 'stair')) {
      const def = BLOCKS[item.block];
      const s = size / 48;
      // `crop` is a [x, y, w, h] part of the tile, drawn at its own place in the tile's frame.
      const face = (img: HTMLCanvasElement, m: [number, number, number, number, number, number], shade: number, crop = [0, 0, TILE_PX, TILE_PX]) => {
        const [cx, cy, cw, ch] = crop;
        ctx.save();
        ctx.setTransform(m[0] * s, m[1] * s, m[2] * s, m[3] * s, m[4] * s, m[5] * s);
        ctx.drawImage(img, cx, cy, cw, ch, cx, cy, cw, ch);
        ctx.fillStyle = `rgba(0,0,0,${shade})`;
        ctx.fillRect(cx, cy, cw, ch);
        ctx.restore();
      };
      const k = 20 / TILE_PX;
      const top = this.tile(def.tiles.top);
      const side = this.tile(def.tiles.side);
      if (shape === 'cube' || shape === 'table') {
        face(top, [k, k / 2, -k, k / 2, 24, 4], 0);
        face(side, [k, k / 2, 0, k, 4, 14], 0.22);
        face(side, [k, -k / 2, 0, k, 24, 24], 0.42);
      } else {
        // The lower half of the block (a slab; a stair adds a raised half toward the back).
        const lower = [0, TILE_PX / 2, TILE_PX, TILE_PX / 2];
        face(top, [k, k / 2, -k, k / 2, 24, 14], 0);
        face(side, [k, k / 2, 0, k, 4, 14], 0.22, lower);
        face(side, [k, -k / 2, 0, k, 24, 24], 0.42, lower);
        if (shape === 'stair') {
          const upper = [0, 0, TILE_PX, TILE_PX / 2];
          face(top, [k, k / 2, -k, k / 2, 24, 4], 0, upper);
          face(side, [k, k / 2, 0, k, 14, 9], 0.22, upper);
          face(side, [k, -k / 2, 0, k, 24, 24], 0.42, [TILE_PX / 2, 0, TILE_PX / 2, TILE_PX / 2]);
        }
      }
    } else {
      ctx.drawImage(this.tile(item.tile), 0, 0, size, size);
    }
    this.canvases.set(id, c);
    return c;
  }

  private compassUrls = new Map<number, string>();

  /** The compass with its needle at one of its pictures (see `compassTileName`). */
  compassUrl(frame: number): string {
    let u = this.compassUrls.get(frame);
    if (!u) {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 48;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.tile(tileIndex(compassTileName(frame))), 0, 0, 48, 48);
      u = c.toDataURL();
      this.compassUrls.set(frame, u);
    }
    return u;
  }

  url(id: number): string {
    let u = this.urls.get(id);
    if (!u) {
      u = this.canvas(id).toDataURL();
      this.urls.set(id, u);
    }
    return u;
  }
}
