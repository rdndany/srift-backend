/**
 * The coloured blocks: wool (knitted stitches), concrete (matte, fine-grained) and terracotta (fired clay with its kiln mottling),
 * in every dye. Fields: laid over the world with no seams, two pictures each, see heroTiles.ts.
 */
import { DRESS_TILE_RGB, DYE_NAMES, DYE_RGB } from '@solrift/shared';
import { cells, fbm, h2, mix, ramp, shade, vn, type RGB } from './heroKit';
import { lightOf, pair } from './heroStone';

const grain = (s: number, periods: number[] = [32, 16, 8, 4]) => (px: number, py: number): number => fbm(px, py, s, periods);
const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const rgb3 = (c: readonly number[]): RGB => [c[0], c[1], c[2]];

/** Wool: rows of knitted stitches (each a little pillow, lit on top), broad drifts of tone, a fuzz of loose fibres. */
const wool =
  (color: RGB, seed: number) =>
  (x: number, y: number, v: number): RGB => {
    const s = seed + v * 13;
    const row = y >> 2;
    const ry = y & 3;
    const off = (row & 1) * 4;
    const u = (x + off) & 7;
    const stitch = (x + off) >> 3;
    const bump = Math.sin(((u + 0.5) / 8) * Math.PI) * 0.6 + Math.sin(((ry + 0.5) / 4) * Math.PI) * 0.4;
    let k = 0.8 + 0.3 * bump;
    // Each stitch is a little lighter or darker than the next, and the yarn is thick and thin.
    k *= 1 + (h2(row, stitch, s + 1) - 0.5) * 0.1 + (fbm(x, y, s + 2, [32, 16, 8]) - 0.5) * 0.14;
    // The dip between rows.
    if (ry === 3) k *= 0.9;
    const f = h2(x, y, s + 3);
    if (f > 0.93) k *= 1.07;
    else if (f < 0.05) k *= 0.93;
    return [Math.min(255, color[0] * k), Math.min(255, color[1] * k), Math.min(255, color[2] * k)];
  };

/** Concrete: even and matte, a faint cloudiness, the finest grain and a few pits where the mix did not fill. */
const concrete =
  (color: RGB, seed: number) =>
  (x: number, y: number, v: number): RGB => {
    const s = seed + v * 17;
    const h = grain(s, [32, 16, 8]);
    let c = ramp([shade(color, 0.93), shade(color, 0.97), color, shade(color, 1.04)], (h(x, y) - 0.5) * 1.5 + 0.5);
    c = shade(c, 1 + lightOf(h, x, y) * 0.7 + (h2(x, y, s + 1) - 0.5) * 0.045);
    const pit = cells(x, y, 22, s + 2, 0.7);
    if (h2(pit.id, 2, s + 3) > 0.86) c = shade(c, 1 - 0.14 * smooth(1.7, 0.2, pit.d1));
    if (h2(x, y, s + 4) > 0.993) c = shade(c, 1.1);
    return [Math.min(255, c[0]), Math.min(255, c[1]), Math.min(255, c[2])];
  };

/** Terracotta: fired clay, a little lighter and darker in broad soft bands where the kiln heat differed, with fine pits. */
const terracotta =
  (color: RGB, seed: number) =>
  (x: number, y: number, v: number): RGB => {
    const s = seed + v * 19;
    const h = grain(s, [32, 16, 8, 4]);
    const yy = y + (vn(x, y, 32, s + 1) - 0.5) * 8;
    const band = vn(0, yy, 16, s + 2) * 0.5 + vn(0, yy, 8, s + 3) * 0.5;
    let c = ramp([shade(color, 0.86), shade(color, 0.94), color, shade(color, 1.07)], (h(x, y) - 0.5) * 1.3 + (band - 0.5) * 0.9 + 0.5);
    c = shade(c, 1 + lightOf(h, x, y) * 1.1 + (h2(x, y, s + 4) - 0.5) * 0.05);
    const pit = cells(x, y, 18, s + 5, 0.7);
    if (h2(pit.id, 5, s + 6) > 0.84) c = shade(c, 1 - 0.2 * smooth(1.9, 0.2, pit.d1));
    return [Math.min(255, c[0]), Math.min(255, c[1]), Math.min(255, c[2])];
  };

const TERRACOTTA_BASE: Record<string, RGB> = {
  terracotta: [152, 94, 68],
  terracotta_orange: [164, 84, 38],
  terracotta_yellow: [188, 134, 36],
  terracotta_red: [144, 62, 46],
  terracotta_white: [210, 178, 160],
  terracotta_brown: [84, 56, 40],
  terracotta_light_gray: [136, 108, 98],
};

const pics = [...pair('wool', wool([238, 238, 234], 6000))];
DYE_NAMES.forEach((n, i) => {
  if (i === 0) return;
  pics.push(...pair(`wool_${n}`, wool(rgb3(DYE_RGB[i]), 6100 + i * 31)));
});
let n = 0;
for (const [name, color] of Object.entries(DRESS_TILE_RGB)) {
  if (name.startsWith('concrete_')) pics.push(...pair(name, concrete(rgb3(color), 6700 + 37 * n++)));
}
for (const [name, color] of Object.entries(TERRACOTTA_BASE)) pics.push(...pair(name, terracotta(color, 6900 + 41 * n++)));
for (const [name, color] of Object.entries(DRESS_TILE_RGB)) {
  // (the ten that were missing: dyed clay is fired duller than the dye)
  if (name.startsWith('terracotta_') && !(name in TERRACOTTA_BASE)) pics.push(...pair(name, terracotta(mix(rgb3(color), [140, 96, 76], 0.38), 6900 + 41 * n++)));
}
export const COLOR_PICS = pics;
