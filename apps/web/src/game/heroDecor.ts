/**
 * Things made of wood and wool, drawn by hand at 64 x 64: the glazed terracotta in its sixteen colours, beds, and what is cut from
 * planks (doors, trapdoors, fences, gates, plates, buttons, signs), each in the very planks of its tree, so a door is of the same
 * oak or birch as the floor beside it.
 */
import { DYE_NAMES, DYE_RGB } from '@solrift/shared';
import { COLOR_PICS } from './heroColor';
import { fbm, h2, mix, ramp, shade, vn, type HeroPainter, type HeroPixel, type RGB } from './heroKit';
import { WOOD_PICS } from './heroWood';

const N = 64;
const clampc = (c: RGB): RGB => [Math.min(255, Math.max(0, c[0])), Math.min(255, Math.max(0, c[1])), Math.min(255, Math.max(0, c[2]))];
const out: { key: string; tile: string; paint: HeroPainter }[] = [];
const add = (tile: string, paint: (x: number, y: number) => RGB): void => {
  out.push({ key: tile, tile, paint: (x, y): HeroPixel => {
    const c = clampc(paint(x, y));
    return [c[0], c[1], c[2], 255];
  } });
};
const rgbOf = (p: HeroPixel): RGB => [p[0], p[1], p[2]];
const edgeDist = (x: number, y: number): number => Math.min(x, y, N - 1 - x, N - 1 - y);
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean => x >= x0 && x < x1 && y >= y0 && y < y1;

// ============================ glazed terracotta ============================
/**
 * A pinwheel: four squares of 32 pixels, each the same fold of light and shade turned a quarter further than the one before, so
 * the colours circle the middle. The pattern is drawn without a line round a square, and repeats every block, so a floor of it
 * runs on without a join.
 */
function glazed(c: RGB, seed: number): (x: number, y: number) => RGB {
  const light = mix(c, [255, 255, 255], 0.34);
  const dark = shade(c, 0.58);
  return (x, y) => {
    const q = (x >= 32 ? 1 : 0) + (y >= 32 ? 2 : 0);
    let u = x % 32;
    let v = y % 32;
    for (let i = 0; i < q; i++) [u, v] = [v, 31 - u];
    const diag = u - v;
    let col: RGB;
    if (Math.abs(diag) <= 1) col = dark;
    else if (diag > 1) col = mix(light, c, Math.min(1, (diag - 1) / 26));
    else col = shade(c, 0.9 + (v / 31) * 0.14);
    // A little diamond in the middle of each square, ringed.
    const dd = Math.abs(u - 15.5) + Math.abs(v - 15.5);
    if (dd < 4) col = mix(light, [255, 255, 255], 0.3);
    else if (dd < 6.5) col = dark;
    // The glaze: a smooth sheen across, and fine crazing in it.
    const gloss = 0.5 + 0.5 * Math.sin(((x + y) / 64) * Math.PI * 2 + (vn(x, y, 32, seed) - 0.5) * 1.4);
    col = shade(col, 0.96 + gloss * 0.08 + (h2(x, y, seed + 1) - 0.5) * 0.04 + (fbm(x, y, seed + 2, [16, 8]) - 0.5) * 0.06);
    return col;
  };
}
DYE_NAMES.forEach((name, i) => add(`glazed_${name}`, glazed(DYE_RGB[i] as RGB, 21000 + i * 7)));

// ============================ beds ============================
const woolOf = (name: string): HeroPainter => {
  const key = name === 'white' ? 'wool_0' : `wool_${name}_0`;
  const e = COLOR_PICS.find((p) => p.key === key);
  if (!e) throw new Error(`no ${key}`);
  return e.paint;
};
const pickPlanks = (tile: string): HeroPainter => {
  const e = WOOD_PICS.find((p) => p.key === `${tile}_0`);
  if (!e) throw new Error(`no ${tile}`);
  return e.paint;
};

function bedPics(suffix: string, dye: string): void {
  const wool = woolOf(dye);
  const frame = pickPlanks('spruce_planks');
  const blanket = (x: number, y: number): RGB => {
    const p = rgbOf(wool(x, y));
    return p;
  };
  const pillow = (x: number, y: number): RGB => {
    const w = woolOf('white')(x, y);
    return [w[0], w[1], w[2]];
  };
  // The top of the foot: the blanket, with a fold across its upper end, a seam at the sides.
  add(`bed_top_foot${suffix}`, (x, y) => {
    let c = blanket(x, y);
    const d = edgeDist(x, y);
    if (d < 3) c = shade(c, 0.78 + d * 0.07);
    if (y > 8 && y < 12) c = shade(c, y === 9 ? 1.12 : 0.88);
    return c;
  });
  // The top of the head: a pillow in the upper half, blanket below it.
  add(`bed_top_head${suffix}`, (x, y) => {
    const dx = (x - 32) / 27;
    const dy = (y - 19) / 16;
    const dome = Math.max(0, 1 - Math.pow(Math.abs(dx), 2.6) - Math.pow(Math.abs(dy), 2.6));
    if (dome > 0.03) {
      // The pillow: a soft dome, lit on its upper left, with a darker rim where it sinks into the blanket.
      let c = pillow(x, y);
      c = shade(c, 0.8 + 0.3 * Math.sqrt(dome) + (dx + dy < 0 ? 0.05 : -0.03));
      if (dome < 0.1) c = shade(c, 0.78);
      return c;
    }
    let c = blanket(x, y);
    const d = edgeDist(x, y);
    if (d < 3) c = shade(c, 0.78 + d * 0.07);
    if (y >= 34 && y < 36) c = shade(c, 0.78);
    return c;
  });
  // The sides: the blanket hanging over the mattress above, the wooden frame and the foot of it below.
  const side = (head: boolean) => (x: number, y: number): RGB => {
    if (y < 34) {
      let c = blanket(x, y);
      if (y > 28) c = shade(c, 1 - (y - 28) * 0.04);
      if (y < 2) c = shade(c, 1.1);
      // Where the pillow sits the side of it shows a little white.
      if (head && y < 10 && x > 4 && x < 60) c = mix(c, rgbOf(woolOf('white')(x, y)), 0.5);
      return c;
    }
    if (y < 38) return shade(rgbOf(frame(x, y)), 0.55);
    let c = rgbOf(frame(x, y));
    if (y >= 52 && (x < 8 || x >= 56)) c = shade(c, 0.7);
    if (y >= 60) c = shade(c, 0.6);
    return c;
  };
  add(`bed_side_foot${suffix}`, side(false));
  add(`bed_side_head${suffix}`, side(true));
  // The ends: the foot shows the blanket's edge above its board; the head, the headboard of planks.
  add(`bed_end_foot${suffix}`, (x, y) => side(false)(x, y));
  add(`bed_end_head${suffix}`, (x, y) => {
    if (y < 14) return mix(rgbOf(woolOf('white')(x, y)), blanket(x, y), 0.2);
    let c = rgbOf(frame(x, y));
    if (y < 18) c = shade(c, 0.6);
    return c;
  });
}
bedPics('', 'red');
// (The red bed is the plain one, with no colour in its tile names.)
DYE_NAMES.forEach((name) => {
  if (name !== 'red') bedPics(`_${name}`, name);
});

// ============================ cut from planks ============================
/** The planks of each tree, by the name of its tiles. */
const WOODS: { prefix: string; planks: string }[] = [
  { prefix: 'birch', planks: 'birch_planks' },
  { prefix: 'spruce', planks: 'spruce_planks' },
  { prefix: 'jungle', planks: 'jungle_planks' },
  { prefix: 'acacia', planks: 'acacia_planks' },
  { prefix: 'dark_oak', planks: 'dark_oak_planks' },
  { prefix: 'cherry', planks: 'cherry_planks' },
  { prefix: 'poplar', planks: 'poplar_planks' },
  { prefix: 'mangrove', planks: 'mangrove_planks' },
  { prefix: 'pale_oak', planks: 'pale_oak_planks' },
  { prefix: 'bamboo', planks: 'bamboo_planks' },
];
const bevel = (c: RGB, x: number, y: number, x0 = 0, y0 = 0, x1 = N, y1 = N): RGB => {
  if (x === x0 || y === y0) return shade(c, 1.14);
  if (x === x1 - 1 || y === y1 - 1) return shade(c, 0.6);
  if (x === x0 + 1 || y === y0 + 1) return shade(c, 1.05);
  if (x === x1 - 2 || y === y1 - 2) return shade(c, 0.82);
  return c;
};
const IRON: RGB[] = [[58, 60, 66], [82, 84, 92], [112, 114, 122], [150, 152, 160]];

function woodPics(prefix: string, planks: HeroPainter): void {
  const p = (x: number, y: number): RGB => rgbOf(planks(x, y));
  // Along the grain: the same planks turned a quarter (posts, doors and slats run up and down).
  const q = (x: number, y: number): RGB => rgbOf(planks(y, x));
  const name = (s: string): string => (prefix === '' ? s : `${prefix}_${s}`);
  const pre = prefix === '' ? '' : `${prefix}_`;
  void pre;
  add(name('button'), (x, y) => bevel(shade(p(x, y), 1.02), x, y, 4, 4, 60, 60));
  add(name('plate'), (x, y) => bevel(shade(p(x, y), 1.08), x, y, 2, 2, 62, 62));
  add(name('fence'), (x, y) => bevel(q(x, y), x, y, 0, 0, N, N));
  add(name('gate'), (x, y) => {
    let c = q(x, y);
    // Slats: dark gaps between them, so a gate is not a solid board.
    if (x % 16 === 15) c = shade(c, 0.5);
    return bevel(c, x, y, 0, 0, N, N);
  });
  add(name('sign'), (x, y) => {
    let c = shade(p(x, y), 1.1);
    if (edgeDist(x, y) < 3) c = shade(c, 0.78);
    return bevel(c, x, y);
  });
  add(name('trapdoor'), (x, y) => {
    let c = p(x, y);
    // A frame, a cross-brace, the hinge plates at the sides.
    const d = edgeDist(x, y);
    if (d < 6) c = shade(c, d === 5 ? 0.55 : 0.84);
    if (Math.abs(x - 32) < 2 || Math.abs(y - 32) < 2) c = shade(c, 0.78);
    if (inRect(x, y, 0, 8, 6, 20) || inRect(x, y, 0, 44, 6, 56)) c = IRON[2];
    return c;
  });
  const door = (upper: boolean) => (x: number, y: number): RGB => {
    let c = q(x, y);
    const d = edgeDist(x, y);
    if (d < 4) c = shade(c, d === 3 ? 0.6 : 0.86);
    // Two recessed panels, and the handle on the lower door's upper right.
    const panel = inRect(x, y, 10, 6, 54, 28) || inRect(x, y, 10, 36, 54, 58);
    if (panel) {
      c = shade(c, 0.9);
      if (x === 10 || y === 6 || y === 36) c = shade(c, 0.6);
      if (x === 53 || y === 27 || y === 57) c = shade(c, 1.15);
    }
    if (upper && inRect(x, y, 16, 12, 48, 24)) c = shade(c, 0.5);
    if (!upper && inRect(x, y, 46, 4, 52, 12)) c = IRON[3];
    return c;
  };
  add(name('door_lower'), door(false));
  add(name('door_upper'), door(true));
}
for (const w of WOODS) woodPics(w.prefix, pickPlanks(w.planks));
/** The oak pieces, given the planks of the oak (which are drawn in heroTiles). */
export function oakDecor(oak: HeroPainter): { key: string; tile: string; paint: HeroPainter }[] {
  oakOut.length = 0;
  woodPicsOak(oak);
  return [...oakOut];
}
const oakOut: { key: string; tile: string; paint: HeroPainter }[] = [];
const addOak = (tile: string, paint: (x: number, y: number) => RGB): void => {
  oakOut.push({ key: tile, tile, paint: (x, y): HeroPixel => {
    const c = clampc(paint(x, y));
    return [c[0], c[1], c[2], 255];
  } });
};function woodPicsOak(oak: HeroPainter): void {
  const q = (x: number, y: number): RGB => rgbOf(oak(y, x));
  const p = (x: number, y: number): RGB => rgbOf(oak(x, y));
  addOak('oak_button', (x, y) => bevel(shade(p(x, y), 1.02), x, y, 4, 4, 60, 60));
  addOak('oak_sign', (x, y) => {
    let c = shade(p(x, y), 1.1);
    if (edgeDist(x, y) < 3) c = shade(c, 0.78);
    return bevel(c, x, y);
  });
  const door = (upper: boolean) => (x: number, y: number): RGB => {
    let c = q(x, y);
    const d = edgeDist(x, y);
    if (d < 4) c = shade(c, d === 3 ? 0.6 : 0.86);
    const panel = inRect(x, y, 10, 6, 54, 28) || inRect(x, y, 10, 36, 54, 58);
    if (panel) {
      c = shade(c, 0.9);
      if (x === 10 || y === 6 || y === 36) c = shade(c, 0.6);
      if (x === 53 || y === 27 || y === 57) c = shade(c, 1.15);
    }
    if (upper && inRect(x, y, 16, 12, 48, 24)) c = shade(c, 0.5);
    if (!upper && inRect(x, y, 46, 4, 52, 12)) c = IRON[3];
    return c;
  };
  addOak('door_lower', door(false));
  addOak('door_upper', door(true));
  addOak('trapdoor', (x, y) => {
    let c = p(x, y);
    const d = edgeDist(x, y);
    if (d < 6) c = shade(c, d === 5 ? 0.55 : 0.84);
    if (Math.abs(x - 32) < 2 || Math.abs(y - 32) < 2) c = shade(c, 0.78);
    if (inRect(x, y, 0, 8, 6, 20) || inRect(x, y, 0, 44, 6, 56)) c = IRON[2];
    return c;
  });
}

// Iron: a door of plate, a trapdoor, and the two weighted plates.
function plate(x: number, y: number, seed: number, dark: number): RGB {
  const brush = vn(x * 0.3, y, 64, seed) * 0.4 + vn(x, y, 8, seed + 1) * 0.3 + (h2(0, y, seed + 2) - 0.5) * 0.15;
  return shade(ramp(IRON, 0.2 + brush), dark * (1 + (h2(x, y, seed + 3) - 0.5) * 0.05));
}
const rivets = (c: RGB, x: number, y: number): RGB => ((x % 12 === 6 && (y % 12 === 6)) ? shade(c, 1.3) : (x % 12 === 7 && y % 12 === 7) ? shade(c, 0.6) : c);
const ironDoor = (upper: boolean) => (x: number, y: number): RGB => {
  let c = rivets(plate(x, y, 21500, 0.95), x, y);
  const d = edgeDist(x, y);
  if (d < 3) c = bevel(c, x, y, 0, 0, N, N);
  if (y === 31 || y === 32) c = shade(c, 0.7);
  if (upper && inRect(x, y, 22, 14, 42, 26)) c = shade(c, 0.5);
  if (!upper && inRect(x, y, 46, 4, 52, 12)) c = [200, 204, 212];
  return c;
};
add('iron_door_lower', ironDoor(false));
add('iron_door_upper', ironDoor(true));
add('iron_trapdoor', (x, y) => {
  let c = rivets(plate(x, y, 21510, 0.95), x, y);
  const d = edgeDist(x, y);
  if (d < 5) c = shade(c, d === 4 ? 0.6 : 0.85);
  if (inRect(x, y, 20, 20, 44, 44) && ((x - 20) % 6 < 3) && ((y - 20) % 6 < 3)) c = shade(c, 0.4);
  return c;
});
add('heavy_plate', (x, y) => bevel(rivets(plate(x, y, 21520, 1.05), x, y), x, y, 2, 2, 62, 62));
add('light_plate', (x, y) => bevel(shade(mix(plate(x, y, 21530, 1.12), [230, 200, 80], 0.35), 1), x, y, 2, 2, 62, 62));

export const DECOR_PICS = out;
