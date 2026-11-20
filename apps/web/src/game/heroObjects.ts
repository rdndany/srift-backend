/**
 * Things that are one block and look it, drawn by hand at 64 x 64: pumpkin and melon, cactus, the bookshelf, the crafting table,
 * the furnace, the chest, TNT, the enchanting table, the anvil, the grindstone, the spawner and the waystone.
 *
 * Each runs round its own sides so it meets a neighbour of its own kind (the ribs of a pumpkin, the rows of a bookshelf) and has a
 * rim of its own where it meets anything else: nothing here is a field, and none pretends to be stone.
 */
import { cells, fbm, h2, mix, ramp, shade, vn, wrap, type HeroPainter, type HeroPixel, type RGB } from './heroKit';
import { lightOf } from './heroStone';

const N = 64;
const TAU = Math.PI * 2;
const clampc = (c: RGB): RGB => [Math.min(255, Math.max(0, c[0])), Math.min(255, Math.max(0, c[1])), Math.min(255, Math.max(0, c[2]))];
const out: { key: string; tile: string; paint: HeroPainter }[] = [];
const add = (tile: string, paint: (x: number, y: number) => RGB): void => {
  out.push({ key: tile, tile, paint: (x, y): HeroPixel => {
    const c = clampc(paint(x, y));
    return [c[0], c[1], c[2], 255];
  } });
};
const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const edgeDist = (x: number, y: number): number => Math.min(x, y, N - 1 - x, N - 1 - y);
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean => x >= x0 && x < x1 && y >= y0 && y < y1;

// ============================ boards (for the tables and the chest) ============================
function boards(x: number, y: number, seed: number, tones: RGB[], rows = 4): RGB {
  const B = N / rows;
  const r = Math.floor(y / B);
  const ry = y % B;
  const c0 = tones[Math.floor(h2(r, 0, seed + 1) * tones.length)];
  let k = 1 + (h2(x >> 3, y, seed + 2) - 0.5) * 0.14 + (vn(x, y, 16, seed + 3) - 0.5) * 0.12;
  if (h2(x >> 4, y, seed + 4) > 0.84) k *= 0.92;
  if (ry === 0) k *= 1.12;
  else if (ry === B - 1) k *= 0.55;
  else if (ry === B - 2) k *= 0.86;
  const j = 8 + Math.floor(h2(r, 5, seed + 5) * 40);
  if (x === j) k *= 0.55;
  else if (x === j + 1) k *= 1.08;
  return shade(c0, k * (1 + (h2(x, y, seed + 6) - 0.5) * 0.05));
}
const OAK: RGB[] = [[176, 134, 82], [166, 124, 74], [186, 144, 90], [158, 118, 70]];
const DARKWOOD: RGB[] = [[96, 68, 40], [88, 62, 36], [104, 76, 46], [82, 58, 34]];

// ============================ pumpkin and melon ============================
const PUMPKIN: RGB[] = [[170, 74, 12], [208, 104, 20], [238, 136, 32], [255, 176, 66]];
function ribbed(x: number, y: number, ribs: number, tones: RGB[], seed: number, groove: number): RGB {
  const warp = (vn(x, y, 32, seed + 1) - 0.5) * 2.6 + (vn(x, y, 16, seed + 2) - 0.5) * 1.2;
  const u = ((x + warp) / N) * ribs;
  const f = u - Math.floor(u);
  const dome = Math.sin(Math.PI * f);
  let c = ramp(tones, 0.1 + 0.78 * Math.pow(dome, 0.8) - (f - 0.5) * 0.16 + (fbm(x, y, seed + 3, [16, 8]) - 0.5) * 0.2);
  if (f < 0.07 || f > 0.93) c = shade(c, groove);
  c = shade(c, 1 + lightOf((qx, qy) => fbm(qx, qy, seed + 4, [8, 4]), x, y) * 0.5 + (h2(x, y, seed + 5) - 0.5) * 0.05);
  return c;
}
add('pumpkin_side', (x, y) => {
  let c = ribbed(x, y, 6, PUMPKIN, 19000, 0.56);
  // A blemish or two where the rind is scarred, and the pale lines of its weathering.
  if (vn(x, y, 8, 19010) > 0.8 && h2(x >> 1, y >> 1, 19011) > 0.4) c = shade(c, 0.86);
  return c;
});
add('pumpkin_top', (x, y) => {
  const dx = x + 0.5 - 32;
  const dy = y + 0.5 - 32;
  const r = Math.hypot(dx, dy);
  const th = Math.atan2(dy, dx);
  const u = ((th + Math.PI) / TAU) * 8;
  const f = u - Math.floor(u);
  let c = ramp(PUMPKIN, 0.2 + 0.7 * Math.pow(Math.sin(Math.PI * f), 0.8) + (fbm(x, y, 19100, [16, 8]) - 0.5) * 0.25 - r / 90);
  if ((f < 0.07 || f > 0.93) && r > 7) c = shade(c, 0.58);
  // The stem: a thick green-brown knob with a rim and a split in its top.
  if (r < 8) {
    const lit = 0.5 - (dx + dy) / 22;
    c = ramp([[70, 52, 24], [104, 82, 36], [128, 112, 52], [150, 142, 70]], 0.2 + 0.7 * lit + (h2(x, y, 19101) - 0.5) * 0.15);
    if (r > 6.2) c = shade(c, 0.6);
    if (Math.abs(dx) < 1 && dy < 3 && dy > -4) c = shade(c, 0.5);
  } else if (r < 10) c = shade(c, 0.7);
  if (edgeDist(x, y) < 2) c = shade(c, 0.78);
  return c;
});
const MELON: RGB[] = [[62, 124, 40], [88, 156, 54], [116, 184, 72], [150, 208, 104]];
function melonStripes(x: number, y: number, u: number, seed: number): RGB {
  const stripe = Math.pow(0.5 + 0.5 * Math.sin(u + (fbm(x, y, seed + 1, [32, 16]) - 0.5) * 3.6), 1.6);
  let c = ramp(MELON, 0.25 + (1 - stripe) * 0.6 + (fbm(x, y, seed + 2, [16, 8]) - 0.5) * 0.28);
  if (stripe > 0.82) c = mix(c, [34, 82, 30], 0.7);
  c = shade(c, 1 + lightOf((qx, qy) => fbm(qx, qy, seed + 3, [8, 4]), x, y) * 0.5);
  if (h2(x, y, seed + 4) > 0.985) c = shade(c, 1.2);
  return c;
}
add('melon_side', (x, y) => melonStripes(x, y, (x / N) * TAU * 6, 19200));
add('melon_top', (x, y) => {
  const dx = x + 0.5 - 32;
  const dy = y + 0.5 - 32;
  const r = Math.hypot(dx, dy);
  let c = melonStripes(x, y, ((Math.atan2(dy, dx) + Math.PI) / TAU) * TAU * 6 + r * 0.04, 19300);
  if (r < 5) {
    c = ramp([[78, 74, 30], [112, 106, 44], [146, 140, 62]], 0.2 + (0.5 - (dx + dy) / 14) * 0.7);
    if (r > 3.8) c = shade(c, 0.6);
  }
  if (edgeDist(x, y) < 2) c = shade(c, 0.8);
  return c;
});

// ============================ cactus ============================
const CACTUS: RGB[] = [[34, 92, 40], [48, 118, 52], [68, 142, 64], [96, 168, 86]];
add('cactus_side', (x, y) => {
  let c = ribbed(x, y, 4, CACTUS, 19400, 0.5);
  // Spines in clusters down the middle of each rib: five little pale points, a shadow beside each.
  const rib = x % 16;
  const row = (y + (Math.floor(x / 16) % 2) * 8) % 16;
  const spine = (dx: number, dy: number): boolean => rib === 8 + dx && row === 8 + dy;
  const pts: [number, number][] = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  if (pts.some(([dx, dy]) => spine(dx, dy))) c = [240, 232, 176];
  else if (pts.some(([dx, dy]) => spine(dx + 1, dy + 1))) c = shade(c, 0.7);
  return c;
});
add('cactus_top', (x, y) => {
  const d = edgeDist(x, y);
  const dx = x + 0.5 - 32;
  const dy = y + 0.5 - 32;
  let c = ramp(CACTUS, 0.35 + 0.35 * smooth(2, 12, d) + (fbm(x, y, 19500, [16, 8]) - 0.5) * 0.3);
  // Ribs seen end-on: four lit lobes round the middle.
  const th = Math.atan2(dy, dx);
  c = shade(c, 1 + 0.12 * Math.cos(th * 4));
  if (d < 3) c = shade(c, 0.6);
  else if (d < 5) c = shade(c, 0.82);
  if (Math.hypot(dx, dy) < 2.4) c = [236, 226, 150];
  return c;
});

// ============================ bookshelf ============================
const BOOKS: RGB[] = [[150, 36, 34], [44, 86, 150], [52, 120, 66], [172, 120, 40], [96, 54, 130], [140, 96, 60], [34, 104, 112], [170, 60, 90], [110, 110, 120], [204, 190, 150]];
add('bookshelf', (x, y) => {
  const edge = (a: number): boolean => a < 0;
  void edge;
  // Top and bottom boards, and a board across the middle.
  const plank = (yy: number, y0: number, y1: number): RGB => {
    let c = boards(x, yy, 19600, OAK, 2);
    const t = (yy - y0) / (y1 - y0);
    if (t < 0.15) c = shade(c, 1.12);
    else if (t > 0.85) c = shade(c, 0.6);
    return c;
  };
  if (y < 6) return plank(y, 0, 6);
  if (y >= 58) return plank(y, 58, 64);
  if (y >= 29 && y < 35) return plank(y, 29, 35);
  // The books of a row: different widths, heights and colours, leaning against each other.
  const rowIdx = y < 29 ? 0 : 1;
  const top = rowIdx === 0 ? 6 : 35;
  const bottom = rowIdx === 0 ? 29 : 58;
  let at = 0;
  let k = 0;
  let w = 0;
  let b = 0;
  // (the books run all the way round, so the first one starts at 0 and the last ends at 64)
  while (at <= x) {
    const wi = 4 + Math.floor(h2(k, rowIdx, 19610) * 5);
    w = at + wi > N - 3 ? N - at : wi;
    b = at;
    at += w;
    k++;
  }
  const id = k + rowIdx * 20;
  const height = 17 + Math.floor(h2(id, 1, 19611) * 6);
  const bookTop = bottom - Math.min(bottom - top - 1, height);
  const bx = x - b;
  if (y < bookTop) {
    // Dark inside of the shelf above the book, with the shade of the board over it.
    const dark = 0.34 + 0.12 * h2(x >> 2, y, 19612);
    return shade(DARKWOOD[1], dark + (y - top < 3 ? -0.06 : 0));
  }
  let c = BOOKS[Math.floor(h2(id, 2, 19613) * BOOKS.length)];
  const t = bx / Math.max(1, w - 1);
  c = shade(c, 0.78 + 0.34 * Math.sin(Math.PI * t) + (h2(x, y, 19614) - 0.5) * 0.06);
  if (bx === 0) c = shade(c, 0.5);
  if (y === bookTop) c = shade(c, 1.2);
  // Two pale bands and a label on the spine.
  const yy = y - bookTop;
  if ((yy === 3 || yy === 4 || yy === height - 5 || yy === height - 6) && bx > 0 && bx < w - 1) c = mix(c, [226, 206, 140], 0.7);
  if (yy > 8 && yy < 13 && bx > 1 && bx < w - 2 && h2(id, 3, 19615) > 0.4) c = mix(c, [232, 224, 196], 0.65);
  if (y >= bottom - 2) c = shade(c, 0.7);
  return c;
});

// ============================ the crafting table ============================
add('crafting_top', (x, y) => {
  const d = edgeDist(x, y);
  let c = boards(x, y, 19700, OAK, 4);
  // A frame round the edge, darker, and the inlaid grid of nine squares in the middle.
  if (d < 6) {
    c = shade(boards(x, y, 19701, DARKWOOD, 4), 0.95);
    if (d === 5) c = shade(c, 0.6);
    else if (d === 0) c = shade(c, 1.12);
  } else {
    const gx = (x - 14) / 12;
    const gy = (y - 14) / 12;
    if (gx >= 0 && gx < 3 && gy >= 0 && gy < 3) {
      const fx = gx - Math.floor(gx);
      const fy = gy - Math.floor(gy);
      c = shade(boards(x, y, 19702, [[192, 154, 100], [184, 146, 94]], 8), 1.0);
      if (fx * 12 < 1 || fy * 12 < 1) c = shade(c, 0.5);
      else if (fx * 12 < 2 || fy * 12 < 2) c = shade(c, 0.82);
      else if (fx * 12 > 11 || fy * 12 > 11) c = shade(c, 1.1);
    } else if (inRect(x, y, 12, 12, 52, 52)) c = shade(c, 0.45);
  }
  return c;
});
add('crafting_side', (x, y) => {
  // A table: the top board overhangs, the front is planked, a pegboard hangs a saw and a hammer.
  if (y < 8) {
    let c = boards(x, y, 19710, OAK, 8);
    if (y < 2) c = shade(c, 1.15);
    if (y === 7) c = shade(c, 0.55);
    return c;
  }
  let c = boards(x, y, 19711, DARKWOOD, 2);
  if (y < 12) c = shade(c, 0.72 + 0.28 * ((y - 8) / 4));
  // The pegboard.
  if (inRect(x, y, 8, 16, 56, 54)) {
    c = shade(boards(x, y, 19712, [[150, 112, 66], [142, 106, 62]], 8), 1);
    if (x === 8 || y === 16) c = shade(c, 1.1);
    if (x === 55 || y === 53) c = shade(c, 0.55);
    // The saw: a blade with teeth, a handle.
    const sx = x - 14;
    const sy = y - 24;
    if (sx >= 0 && sx < 24 && sy >= 0 && sy < 8) {
      const tooth = sy > 5 - ((sx % 4) < 2 ? 0 : 1);
      if (!tooth) c = mix([170, 176, 184], [230, 234, 240], 1 - sy / 6);
      else if (sy < 8) c = [96, 100, 106];
    }
    if (inRect(x, y, 10, 22, 15, 33)) c = [112, 70, 36];
    // The hammer: a long handle on a slant and a heavy head.
    const hx = x - 36;
    const hy = y - 30;
    if (hy >= 0 && hy < 20 && Math.abs(hx - hy * 0.18) < 2) c = hy % 5 === 0 ? [96, 60, 30] : [128, 84, 44];
    if (inRect(x, y, 32, 24, 46, 32)) c = x < 36 ? [196, 200, 208] : y > 29 ? [96, 100, 108] : [150, 154, 162];
  }
  return c;
});

// ============================ the furnace ============================
function furnaceStone(x: number, y: number, seed: number): RGB {
  const cell = cells(x, y, 6, seed, 0.7);
  let c = ramp([[88, 88, 92], [110, 110, 114], [132, 132, 134], [152, 152, 152]], 0.3 + h2(cell.id, 1, seed + 1) * 0.4 + (fbm(x, y, seed + 2, [16, 8]) - 0.5) * 0.4);
  const gap = cell.d2 - cell.d1;
  if (gap < 1.1) c = shade(c, 0.66);
  else if (gap < 2.2 && cell.dx + cell.dy < 0) c = shade(c, 1.1);
  return c;
}
add('furnace_side', (x, y) => {
  let c = furnaceStone(x, y, 19800);
  // The mouth: an arch of darkness with a grate across it and the glow of the fire at its foot.
  const cx = 32;
  const inside = y > 22 && y < 54 && Math.abs(x - cx) < 15 && (y > 32 || Math.hypot(x - cx, y - 32) < 15);
  const rim = y > 20 && y < 56 && Math.abs(x - cx) < 18 && (y > 32 || Math.hypot(x - cx, y - 32) < 18);
  if (rim && !inside) c = shade(c, 0.58);
  if (inside) {
    const glow = smooth(40, 54, y);
    c = mix([18, 14, 14], [255, 128, 28], glow * (0.55 + 0.45 * fbm(x, y, 19801, [8, 4])));
    // The bars of the grate.
    if ((x - cx + 15) % 6 === 0 && y < 50) c = shade([120, 120, 126], 0.9 + 0.2 * (x < cx ? 1 : 0));
    if (y === 40 && x % 2 === 0) c = [110, 110, 116];
  }
  return c;
});
add('furnace_top', (x, y) => {
  let c = furnaceStone(x, y, 19810);
  const r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
  if (r < 11) c = r < 8 ? mix([20, 16, 16], [90, 40, 20], smooth(8, 0, r) * 0.5) : shade(c, 0.6);
  if (edgeDist(x, y) < 2) c = shade(c, 0.8);
  return c;
});

// ============================ the chest ============================
const IRON: RGB[] = [[58, 60, 66], [82, 84, 92], [112, 114, 122], [150, 152, 160]];
add('chest_side', (x, y) => {
  let c = boards(x, y, 19900, OAK, 4);
  const iron = (x >= 4 && x < 10) || (x >= 54 && x < 60);
  if (iron) {
    const t = ((x < 30 ? x - 4 : x - 54) / 5);
    c = ramp(IRON, 0.25 + 0.5 * Math.sin(Math.PI * t) + (h2(x, y, 19901) - 0.5) * 0.1);
    if (y % 12 === 3 && (x === 6 || x === 7 || x === 56 || x === 57)) c = [190, 192, 198];
  }
  // The lid: its seam, and the latch of gold with its keyhole.
  if (y === 22) c = shade(c, 0.45);
  else if (y === 23) c = shade(c, 1.1);
  if (inRect(x, y, 27, 17, 37, 31)) {
    const lit = 0.5 - ((x - 27) + (y - 17)) / 30;
    c = ramp([[150, 106, 20], [206, 156, 36], [244, 204, 70], [255, 236, 140]], 0.15 + lit * 0.8);
    if (x === 27 || y === 17) c = [255, 240, 160];
    if (x === 36 || y === 30) c = [120, 80, 14];
    if (inRect(x, y, 31, 22, 33, 27)) c = [28, 20, 12];
  }
  if (edgeDist(x, y) < 1) c = shade(c, 0.7);
  return c;
});
add('chest_top', (x, y) => {
  const d = edgeDist(x, y);
  let c = boards(x, y, 19910, OAK, 4);
  if (d < 6) {
    c = ramp(IRON, 0.3 + 0.4 * smooth(0, 5, d) + (h2(x, y, 19911) - 0.5) * 0.1);
    c = shade(c, d === 5 ? 0.65 : d === 0 ? 1.1 : 1);
  }
  return c;
});

// ============================ TNT ============================
const GLYPHS: Record<string, string[]> = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
};
const TNT_RED: RGB[] = [[132, 20, 18], [176, 32, 28], [212, 52, 40], [236, 84, 62]];
add('tnt_side', (x, y) => {
  // Red sticks of dynamite standing side by side, with a white band round them and the letters on it.
  const stick = Math.floor(x / 8);
  const sx = x % 8;
  const dome = Math.sin(Math.PI * ((sx + 0.5) / 8));
  let c = ramp(TNT_RED, 0.15 + 0.7 * dome + (h2(stick, 0, 20000) - 0.5) * 0.25 + (vn(x, y, 16, 20001) - 0.5) * 0.2);
  if (sx === 0 || sx === 7) c = shade(c, 0.62);
  if (y >= 20 && y < 44) {
    c = ramp([[190, 186, 176], [214, 210, 200], [234, 230, 222], [246, 244, 238]], 0.25 + 0.6 * dome + (vn(x, y, 8, 20002) - 0.5) * 0.2);
    if (sx === 0 || sx === 7) c = shade(c, 0.8);
    if (y === 20 || y === 43) c = shade(c, 0.7);
    const word = 'TNT';
    for (let i = 0; i < word.length; i++) {
      const g = GLYPHS[word[i]];
      const gx = Math.floor((x - (13 + i * 14)) / 2);
      const gy = Math.floor((y - 25) / 2);
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && g[gy][gx] === '1') c = (x - (13 + i * 14)) % 2 === 1 || (y - 25) % 2 === 1 ? [74, 28, 24] : [40, 14, 12];
    }
  }
  if (y < 2) c = shade(c, 1.1);
  return c;
});
add('tnt_top', (x, y) => {
  const d = edgeDist(x, y);
  let c = ramp([[174, 162, 138], [196, 184, 158], [214, 204, 178]], 0.3 + (fbm(x, y, 20010, [16, 8]) - 0.5) * 0.6 + 0.3);
  if (d < 5) c = shade(ramp(TNT_RED, 0.3 + 0.5 * smooth(0, 4, d) + (h2(x >> 1, y >> 1, 20011) - 0.5) * 0.2), d === 0 ? 1.1 : 1);
  const r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
  if (r < 7) c = r < 4.5 ? [30, 22, 18] : shade(c, 0.5);
  // The fuse: a twisted rope coming out of the hole, its tip glowing.
  if (r < 9 && x > 32 && y < 32 && Math.abs((32 - y) - (x - 32) * 0.9) < 2.2) c = h2(x, y, 20012) > 0.5 ? [150, 118, 60] : [96, 72, 34];
  if (Math.hypot(x - 41, y - 23) < 2) c = [255, 190, 60];
  return c;
});
add('tnt_bottom', (x, y) => {
  const d = edgeDist(x, y);
  const c = ramp(TNT_RED, 0.18 + (fbm(x, y, 20020, [16, 8]) - 0.5) * 0.5 + 0.25);
  return shade(c, d < 3 ? 0.75 : 0.9);
});

// ============================ the enchanting table ============================
const OBSIDIAN: RGB[] = [[16, 10, 28], [26, 16, 44], [38, 24, 62], [54, 36, 86]];
add('enchanting_table_top', (x, y) => {
  const d = edgeDist(x, y);
  let c = ramp(OBSIDIAN, 0.3 + (fbm(x, y, 20100, [16, 8]) - 0.5) * 0.8 + 0.2);
  if (d >= 5 && d < 8) c = ramp([[150, 110, 20], [214, 170, 44], [252, 218, 100]], d === 5 ? 0.9 : 0.5 + (h2(x, y, 20101) - 0.5) * 0.2);
  else if (d >= 8) {
    // The red cloth, with runes glowing in it.
    c = ramp([[110, 14, 26], [150, 24, 38], [186, 38, 52], [208, 58, 72]], 0.3 + (fbm(x, y, 20102, [16, 8]) - 0.5) * 0.7 + 0.2);
    const cell = cells(x, y, 4, 20103, 0.5);
    if (cell.d1 < 3.4 && h2(cell.id, 1, 20104) > 0.3) {
      const a = Math.floor(h2(cell.id, 2, 20105) * 3);
      const dx = Math.round(cell.dx);
      const dy = Math.round(cell.dy);
      const on = a === 0 ? Math.abs(dx) <= 1 && dy === 0 : a === 1 ? Math.abs(dx - dy) <= 0 && Math.abs(dx) <= 2 : Math.abs(dy) <= 2 && dx === 0;
      if (on) c = [150, 230, 255];
    }
  }
  return c;
});
add('enchanting_table_side', (x, y) => {
  let c = ramp(OBSIDIAN, 0.3 + (fbm(x, y, 20110, [16, 8]) - 0.5) * 0.8 + 0.2);
  c = shade(c, 1 + lightOf((qx, qy) => fbm(qx, qy, 20111, [8, 4]), x, y) * 0.6);
  if (y < 14) c = ramp([[110, 14, 26], [150, 24, 38], [186, 38, 52]], 0.3 + (y / 14) * 0.2 + (vn(x, y, 8, 20112) - 0.5) * 0.3);
  if (y >= 14 && y < 18) c = ramp([[150, 110, 20], [214, 170, 44], [252, 218, 100]], y === 14 ? 0.95 : y === 17 ? 0.15 : 0.55);
  return c;
});
add('enchanting_table_bottom', (x, y) => shade(ramp(OBSIDIAN, 0.25 + (fbm(x, y, 20120, [16, 8]) - 0.5) * 0.8 + 0.2), edgeDist(x, y) < 3 ? 0.7 : 1));

// ============================ the anvil ============================
function metal(x: number, y: number, seed: number, dark: number): RGB {
  const brush = vn(x * 0.25, y, 64, seed) * 0.4 + vn(x, y, 8, seed + 1) * 0.3 + (h2(0, y, seed + 2) - 0.5) * 0.2;
  let c = ramp(IRON.map((v) => shade(v, dark)), 0.2 + brush);
  c = shade(c, 1 + (h2(x, y, seed + 3) - 0.5) * 0.06);
  return c;
}
function anvilSide(wear: number): (x: number, y: number) => RGB {
  return (x, y) => {
    let c = metal(x, y, 20200, 0.9);
    // The face of the anvil: a lit top edge, a shaded waist, a heavy foot.
    if (y < 3) c = shade(c, 1.3);
    else if (y < 5) c = shade(c, 1.1);
    const waist = 14 + 8 * Math.sin((y / 64) * Math.PI);
    if (y > 18 && y < 44 && (x < waist || x >= N - waist)) c = shade(c, 0.45);
    if (y >= 52) c = shade(c, y === 52 ? 1.2 : 0.85);
    // Chips knocked out of the face (more on the damaged one), and hairline cracks.
    const n = vn(x, y, 8, 20210);
    if (wear > 0 && n > 0.9 - wear * 0.05 && h2(x >> 1, y >> 1, 20211) > 0.55) c = shade(c, 0.6);
    if (wear > 1 && Math.abs(vn(x, y, 16, 20212) - 0.5) < 0.02) c = shade(c, 0.4);
    return c;
  };
}
add('anvil_side', anvilSide(0));
add('anvil_side_chipped', anvilSide(1));
add('anvil_side_damaged', anvilSide(2));
add('anvil_top', (x, y) => {
  let c = metal(x, y, 20220, 0.85);
  const d = edgeDist(x, y);
  if (d < 3) c = shade(c, 1.2);
  // A groove down the middle where the hammer lands.
  if (Math.abs(x - 32) < 9 && y > 6 && y < 58) c = shade(c, Math.abs(x - 32) > 7 ? 0.55 : 0.78);
  return c;
});

// ============================ the grindstone ============================
add('grindstone_side', (x, y) => {
  // A grey stone wheel between two wooden posts.
  if (x < 9 || x >= 55) {
    let c = boards(y, x, 20300, DARKWOOD, 2);
    if (x === 8 || x === 54) c = shade(c, 0.5);
    return shade(c, 1.05);
  }
  const dy = (y + 0.5 - 32) / 28;
  if (Math.abs(dy) > 1) return shade(boards(x, y, 20301, DARKWOOD, 2), 0.7);
  const bulge = Math.sqrt(1 - dy * dy);
  let c = ramp([[96, 96, 98], [124, 124, 126], [150, 150, 150], [172, 172, 170]], 0.3 + bulge * 0.35 + (fbm(x, y, 20302, [16, 8]) - 0.5) * 0.4);
  c = shade(c, 0.74 + 0.4 * bulge);
  if (h2(x, y, 20303) > 0.97) c = shade(c, 0.7);
  return c;
});
add('grindstone_top', (x, y) => {
  if (x < 9 || x >= 55) return shade(boards(y, x, 20310, DARKWOOD, 2), 1);
  let c = ramp([[104, 104, 106], [134, 134, 134], [160, 160, 158]], 0.4 + (fbm(x, y, 20311, [16, 8]) - 0.5) * 0.6);
  if (Math.abs(x - 32) < 1.5) c = shade(c, 0.6);
  return c;
});

// ============================ the spawner ============================
add('spawner', (x, y) => {
  // A cage of iron bars round a dark cell where something flickers.
  const bx = x % 16;
  const by = y % 16;
  const bar = bx < 3 || by < 3;
  if (bar) {
    const t = bx < 3 ? bx / 2 : by / 2;
    let c = ramp(IRON, 0.2 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 0.5 + 0.25)) + (h2(x, y, 20400) - 0.5) * 0.1);
    if ((bx < 3 && by < 3)) c = shade(c, 1.1);
    return c;
  }
  const cell = cells(x, y, 5, 20401, 0.9);
  const fire = Math.max(0, 1 - cell.d1 / 5) * (0.5 + 0.5 * fbm(x, y, 20402, [8, 4]));
  let c = mix([8, 6, 14], [30, 14, 40], vn(x, y, 8, 20403));
  c = mix(c, [220, 90, 40], fire * 0.9);
  if (bx === 3 || by === 3) c = shade(c, 0.5);
  return c;
});

// ============================ the waystone ============================
const WAYSTONE: RGB[] = [[56, 70, 96], [74, 92, 124], [98, 118, 152], [128, 148, 184]];
function waystone(x: number, y: number, top: boolean): RGB {
  let c = ramp(WAYSTONE, 0.3 + (fbm(x, y, 20500, [16, 8]) - 0.5) * 0.8 + 0.2);
  c = shade(c, 1 + lightOf((qx, qy) => fbm(qx, qy, 20501, [8, 4]), x, y) * 0.7);
  const dx = x + 0.5 - 32;
  const dy = y + 0.5 - 32;
  const r = Math.hypot(dx, dy);
  if (top) {
    // A ring of light with four spokes.
    if (Math.abs(r - 20) < 1.8 || (Math.abs(r - 8) < 1.4)) c = mix(c, [150, 240, 255], 0.9);
    else if (Math.abs(r - 20) < 3.6) c = mix(c, [110, 200, 240], 0.3);
    if ((Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2) && r > 8 && r < 20) c = mix(c, [150, 240, 255], 0.8);
  } else {
    // A rune cut into the face and glowing.
    const u = Math.abs(dx);
    const rune = (Math.abs(dy) < 14 && u < 1.4) || (Math.abs(dx) < 10 && Math.abs(dy + 4) < 1.4) || (Math.abs(dy - 8 - Math.abs(dx) * 0.5) < 1.3 && u < 11);
    if (rune) c = mix(c, [150, 240, 255], 0.9);
    else if ((Math.abs(dy) < 16 && u < 3) || Math.abs(dy + 4) < 3 && u < 11) c = mix(c, [110, 200, 240], 0.2);
  }
  if (edgeDist(x, y) < 2) c = shade(c, 0.7);
  return c;
}
add('waystone_top', (x, y) => waystone(x, y, true));
add('waystone_side', (x, y) => waystone(x, y, false));
void wrap;

export const OBJECT_PICS = out;
