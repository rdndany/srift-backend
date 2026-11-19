import * as THREE from 'three';
import { ATTACK_ANIM, DYE_RGB, MOBS, NPCS, getItem, variantLevel, variantProfession, type MobKind, type Profession } from '@solrift/shared';
import type { ArrowLike, MobLike } from './clientSession';
import type { EntityLight } from './entityLight';
import { ArcaneBoltView, FireballView, type FireParticles, type SpellView } from './fireFx';
import type { SpellKit } from './spellFx';
import { FireballBoltView } from './fireballFx';
import { StaffBoltView } from './staffFx';
import { WandBoltView } from './wandFx';

type RGB = [number, number, number];
type Painter = (x: number, y: number) => RGB;

function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const jit = (c: RGB, amt: number, x: number, y: number, s: number): RGB => {
  const d = (hash(x, y, s) - 0.5) * 2 * amt;
  return [c[0] + d, c[1] + d, c[2] + d];
};

const rect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// ---- skins ---------------------------------------------------------------------
const SKINS: Record<string, Painter> = {
  pig_body: (x, y) => jit([232, 150, 154], 12, x, y, 1),
  pig_face: (x, y) => {
    if (rect(x, y, 3, 5, 4, 6) || rect(x, y, 11, 5, 12, 6)) return [28, 22, 30];
    if (rect(x, y, 5, 8, 10, 12)) return rect(x, y, 6, 10, 6, 10) || rect(x, y, 9, 10, 9, 10) ? [120, 60, 70] : jit([214, 118, 128], 8, x, y, 2);
    return jit([232, 150, 154], 12, x, y, 1);
  },
  cow_body: (x, y) => (hash(x >> 2, y >> 2, 5) > 0.62 ? jit([236, 236, 232], 8, x, y, 3) : jit([88, 58, 40], 12, x, y, 3)),
  cow_face: (x, y) => {
    if (rect(x, y, 3, 5, 4, 6) || rect(x, y, 11, 5, 12, 6)) return [20, 16, 16];
    if (rect(x, y, 4, 9, 11, 14)) return rect(x, y, 6, 11, 6, 11) || rect(x, y, 9, 11, 9, 11) ? [90, 60, 60] : jit([210, 170, 160], 8, x, y, 4);
    return jit([88, 58, 40], 12, x, y, 3);
  },
  cow_horn: (x, y) => jit([226, 222, 200], 8, x, y, 6),
  zombie_skin: (x, y) => jit([94, 142, 90], 12, x, y, 7),
  zombie_face: (x, y) => {
    if (rect(x, y, 3, 6, 5, 7) || rect(x, y, 10, 6, 12, 7)) return [18, 36, 44];
    if (rect(x, y, 5, 11, 10, 12)) return [60, 90, 56];
    return jit([94, 142, 90], 12, x, y, 7);
  },
  zombie_shirt: (x, y) => jit([52, 140, 172], 12, x, y, 8),
  zombie_pants: (x, y) => jit([52, 52, 150], 10, x, y, 9),
  skeleton_bone: (x, y) => jit([214, 214, 204], 10, x, y, 10),
  skeleton_face: (x, y) => {
    if (rect(x, y, 3, 5, 5, 7) || rect(x, y, 10, 5, 12, 7)) return [26, 26, 28];
    if (rect(x, y, 5, 11, 10, 11) || rect(x, y, 6, 12, 6, 12) || rect(x, y, 9, 12, 9, 12)) return [70, 70, 70];
    return jit([214, 214, 204], 10, x, y, 10);
  },
  skeleton_ribs: (x, y) => (y % 4 === 2 ? [96, 96, 92] : jit([214, 214, 204], 10, x, y, 11)),
  creeper_skin: (x, y) => (hash(x >> 1, y >> 1, 12) > 0.6 ? jit([40, 120, 44], 10, x, y, 12) : jit([78, 176, 66], 12, x, y, 12)),
  creeper_face: (x, y) => {
    if (rect(x, y, 3, 4, 5, 6) || rect(x, y, 10, 4, 12, 6)) return [14, 20, 14];
    if (rect(x, y, 6, 8, 9, 10) || rect(x, y, 5, 10, 6, 13) || rect(x, y, 9, 10, 10, 13)) return [14, 20, 14];
    return hash(x >> 1, y >> 1, 12) > 0.6 ? jit([40, 120, 44], 10, x, y, 12) : jit([78, 176, 66], 12, x, y, 12);
  },
};

type Feature = [number, number, number, number, RGB];
const plain = (c: RGB, amt: number, s: number): Painter => (x, y) => jit(c, amt, x, y, s);
const withFeatures = (base: Painter, feats: Feature[]): Painter => (x, y) => {
  for (const [a, b, c, d, col] of feats) if (rect(x, y, a, b, c, d)) return col;
  return base(x, y);
};
const eyes = (y0: number, y1: number, col: RGB, x0 = 3, x1 = 5): Feature[] => [
  [x0, y0, x1, y1, col],
  [15 - x1, y0, 15 - x0, y1, col],
];

const rabbitSkin = (name: string, base: RGB, s: number) => ({
  [`rabbit_${name}`]: plain(base, 10, s),
  [`rabbit_${name}_face`]: withFeatures(plain(base, 10, s), [...eyes(6, 7, [20, 16, 16], 3, 4), [7, 9, 8, 10, [230, 150, 160]]]),
});

const EXTRA_SKINS: Record<string, Painter> = {
  sheep_shorn: (x, y) => jit(hash(x >> 1, y >> 1, 22) > 0.5 ? [232, 190, 170] : [222, 178, 158], 6, x, y, 22),
  sheep_wool: (x, y) => jit(hash(x >> 1, y >> 1, 21) > 0.5 ? [238, 238, 232] : [224, 224, 218], 6, x, y, 21),
  sheep_skin: plain([196, 170, 150], 10, 22),
  sheep_face: withFeatures(plain([196, 170, 150], 10, 22), [...eyes(6, 7, [30, 24, 24]), [6, 10, 9, 12, [170, 130, 120]]]),
  chicken_body: plain([240, 240, 236], 8, 23),
  chicken_face: withFeatures(plain([240, 240, 236], 8, 23), eyes(5, 6, [20, 16, 16], 3, 4)),
  chicken_beak: plain([236, 170, 50], 8, 24),
  chicken_wattle: plain([200, 40, 40], 8, 25),
  chicken_leg: plain([226, 190, 60], 8, 26),
  ...rabbitSkin('brown', [150, 112, 74], 27),
  ...rabbitSkin('white', [238, 238, 240], 28),
  ...rabbitSkin('sandy', [206, 180, 124], 29),
  rabbit_tail: plain([245, 245, 245], 6, 30),
  squid_body: plain([62, 86, 126], 10, 31),
  squid_face: withFeatures(plain([62, 86, 126], 10, 31), [...eyes(6, 9, [220, 230, 240], 2, 5), ...eyes(7, 8, [10, 10, 20], 3, 4)]),
  squid_tent: plain([52, 74, 112], 10, 32),
  bat_body: plain([84, 62, 44], 10, 33),
  bat_face: withFeatures(plain([84, 62, 44], 10, 33), [...eyes(5, 6, [230, 200, 80], 3, 4), [7, 9, 8, 10, [30, 20, 16]]]),
  bat_wing: plain([60, 44, 32], 8, 34),
  spider_body: (x, y) => jit(hash(x >> 1, y >> 1, 35) > 0.7 ? [74, 56, 44] : [44, 36, 34], 8, x, y, 35),
  spider_face: withFeatures(plain([44, 36, 34], 8, 35), [[2, 4, 5, 6, [190, 20, 20]], [10, 4, 13, 6, [190, 20, 20]], [4, 8, 11, 10, [120, 30, 30]], [6, 7, 9, 7, [18, 14, 14]]]),
  spider_leg: plain([34, 28, 28], 6, 36),
  cave_spider_body: plain([22, 78, 86], 10, 37),
  cave_spider_face: withFeatures(plain([22, 78, 86], 10, 37), [[2, 4, 5, 6, [220, 30, 30]], [10, 4, 13, 6, [220, 30, 30]], [4, 8, 11, 10, [30, 50, 56]]]),
  cave_spider_leg: plain([16, 58, 66], 6, 38),
  slime_core: plain([70, 150, 64], 14, 39),
  slime_face: withFeatures(plain([70, 150, 64], 14, 39), [[3, 5, 5, 8, [20, 50, 24]], [10, 5, 12, 8, [20, 50, 24]], [7, 11, 8, 12, [20, 50, 24]]]),
  slime_outer: plain([110, 200, 100], 12, 40),
  enderman_skin: plain([22, 18, 28], 5, 41),
  enderman_face: withFeatures(plain([22, 18, 28], 5, 41), [[2, 7, 5, 8, [200, 80, 240]], [10, 7, 13, 8, [200, 80, 240]]]),
  husk_skin: plain([168, 150, 104], 12, 42),
  husk_face: withFeatures(plain([168, 150, 104], 12, 42), [...eyes(6, 7, [40, 32, 20], 3, 5), [5, 11, 10, 12, [110, 92, 60]]]),
  husk_shirt: plain([150, 120, 84], 12, 43),
  husk_pants: plain([120, 100, 70], 10, 44),
  stray_bone: plain([186, 212, 222], 10, 45),
  stray_face: withFeatures(plain([186, 212, 222], 10, 45), [...eyes(5, 7, [26, 40, 60]), [5, 11, 10, 11, [70, 90, 110]]]),
  stray_ribs: (x, y) => (y % 4 === 2 ? [90, 120, 140] : jit([186, 212, 222], 10, x, y, 46)),
  drowned_skin: plain([96, 156, 150], 12, 47),
  drowned_face: withFeatures(plain([96, 156, 150], 12, 47), [...eyes(6, 7, [20, 50, 60], 3, 5), [5, 11, 10, 12, [60, 100, 100]]]),
  drowned_shirt: plain([54, 116, 128], 12, 48),
  drowned_pants: plain([46, 70, 112], 10, 49),
};
// A sheep's wool in every dye colour (sheep_wool is white).
DYE_RGB.forEach((c, i) => {
  if (i === 0) return;
  const lo: [number, number, number] = [c[0] * 0.93, c[1] * 0.93, c[2] * 0.93];
  EXTRA_SKINS[`sheep_wool_${i}`] = (x, y) => jit(hash(x >> 1, y >> 1, 21) > 0.5 ? [c[0], c[1], c[2]] : lo, 6, x, y, 21);
});
Object.assign(SKINS, EXTRA_SKINS);

// Villagers: a robe in the colour of the trade, a pale-green-brown face with a long nose, and a belt that shows the level.
const ROBES: Record<Profession, RGB> = {
  unemployed: [124, 96, 68],
  nitwit: [78, 130, 66],
  farmer: [140, 106, 62],
  cleric: [122, 70, 150],
  armorer: [88, 92, 100],
  weaponsmith: [70, 70, 78],
  toolsmith: [104, 90, 80],
  butcher: [206, 200, 190],
  shepherd: [176, 158, 122],
  fletcher: [124, 142, 88],
  mason: [158, 156, 150],
};
const BELTS: RGB[] = [[132, 132, 132], [210, 210, 214], [236, 190, 52], [60, 190, 100], [90, 224, 224]];
const VILLAGER_SKIN: RGB = [204, 152, 120];
const VILLAGER_SKINS: Record<string, Painter> = {
  villager_skin: plain(VILLAGER_SKIN, 8, 61),
  villager_face: withFeatures(plain(VILLAGER_SKIN, 8, 61), [
    [2, 4, 6, 4, [60, 40, 30]],
    [9, 4, 13, 4, [60, 40, 30]],
    [3, 6, 5, 7, [240, 240, 236]],
    [10, 6, 12, 7, [240, 240, 236]],
    [4, 6, 4, 7, [70, 130, 70]],
    [11, 6, 11, 7, [70, 130, 70]],
    [5, 12, 10, 12, [150, 104, 84]],
  ]),
  villager_nose: plain([188, 134, 104], 8, 62),
  villager_hat: plain([214, 188, 110], 10, 63),
};
(Object.keys(ROBES) as Profession[]).forEach((p, i) => {
  const c = ROBES[p];
  VILLAGER_SKINS[`villager_robe_${p}`] = (x, y) => (x % 5 === 0 && y > 2 ? jit([c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], 4, x, y, 64) : jit(c, 8, x, y, 64 + i));
});
BELTS.forEach((c, i) => (VILLAGER_SKINS[`villager_belt_${i}`] = plain(c, 8, 80 + i)));
Object.assign(SKINS, VILLAGER_SKINS);

// The quest givers of the Adventure mode: each has a robe, a trim, hair and a skin tone of their own (see NPCS).
const NPC_TONES: RGB[] = [[222, 178, 142], [196, 144, 110], [232, 192, 158], [172, 122, 92]];
const darker = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
NPCS.forEach((n, i) => {
  const tone = NPC_TONES[i % NPC_TONES.length];
  SKINS[`npc_robe_${i}`] = (x, y) => (x % 5 === 0 && y > 2 ? jit(darker(n.look.robe, 0.85), 4, x, y, 90 + i) : jit(n.look.robe, 8, x, y, 90 + i));
  SKINS[`npc_trim_${i}`] = plain(n.look.trim, 8, 100 + i);
  SKINS[`npc_hair_${i}`] = plain(n.look.hair, 10, 110 + i);
  SKINS[`npc_skin_${i}`] = plain(tone, 8, 120 + i);
  SKINS[`npc_face_${i}`] = withFeatures(plain(tone, 8, 120 + i), [
    [3, 5, 5, 5, darker(n.look.hair, 0.8)],
    [10, 5, 12, 5, darker(n.look.hair, 0.8)],
    [3, 6, 5, 7, [240, 240, 236]],
    [10, 6, 12, 7, [240, 240, 236]],
    [4, 6, 4, 7, [50, 80, 120]],
    [11, 6, 11, 7, [50, 80, 120]],
    [6, 12, 9, 12, n.look.beard ? darker(n.look.hair, 0.6) : [150, 104, 84]],
    ...(n.look.beard ? ([[2, 9, 13, 15, n.look.hair]] as Feature[]) : []),
  ]);
});
SKINS.npc_iron = plain([172, 176, 188], 8, 130);
const texCache = new Map<string, THREE.CanvasTexture>();
function skin(name: string): THREE.CanvasTexture {
  let t = texCache.get(name);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(16, 16);
  const paint = SKINS[name];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const p = paint(x, y);
      const o = (y * 16 + x) * 4;
      img.data[o] = Math.max(0, Math.min(255, p[0]));
      img.data[o + 1] = Math.max(0, Math.min(255, p[1]));
      img.data[o + 2] = Math.max(0, Math.min(255, p[2]));
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(name, t);
  return t;
}

// ---- rigs ----------------------------------------------------------------------

interface Part {
  /** Box size (w, h, d). */
  size: [number, number, number];
  /** Joint position in model space; the box hangs from here by `hang` (down) or is centered when hang is false. */
  at: [number, number, number];
  skin: string;
  /** Face texture for the -Z side (the front). */
  front?: string;
  /** The box pivots at its top (limbs) instead of its centre. */
  hang?: boolean;
  /** Walk-cycle swing: amplitude sign (+1 / -1), or 0 for none. */
  swing?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  isHead?: boolean;
  /** Wing flap: rotation about Z swings by this much (radians) around rotZ. */
  flap?: number;
  /** Walk swing applied about Y instead of X (spider legs). */
  swingY?: number;
  /** Translucent shell opacity. */
  alpha?: number;
  /** An arm that comes down in the mob's melee swing (this much of the swing; see `strikeArm`). */
  strike?: number;
}

/**
 * How far an arm is turned (radians, + is forward) at a point `k` (0..1) through a melee swing: it is drawn back, comes
 * down hard, and returns. Zero outside the swing.
 */
const strikeArm = (k: number): number => {
  if (k <= 0 || k >= 1) return 0;
  if (k < 0.3) return 0.55 * (k / 0.3);
  if (k < 0.55) return 0.55 - 1.65 * ((k - 0.3) / 0.25);
  return -1.1 * (1 - (k - 0.55) / 0.45);
};

const humanoid = (shirt: string, pants: string, skinName: string, face: string, armRot: number, ribs?: string): Part[] => [
  { size: [0.5, 0.5, 0.5], at: [0, 1.55, 0], skin: skinName, front: face, isHead: true },
  { size: [0.5, 0.75, 0.25], at: [0, 1.15, 0], skin: ribs ?? shirt },
  { size: [0.25, 0.75, 0.25], at: [-0.125, 0.75, 0], skin: pants, hang: true, swing: 1 },
  { size: [0.25, 0.75, 0.25], at: [0.125, 0.75, 0], skin: pants, hang: true, swing: -1 },
  { size: [0.25, 0.75, 0.25], at: [-0.375, 1.5, 0], skin: skinName, hang: true, swing: -0.5, rotX: armRot, strike: 1 },
  { size: [0.25, 0.75, 0.25], at: [0.375, 1.5, 0], skin: skinName, hang: true, swing: 0.5, rotX: armRot, strike: 1 },
];

const scaleRig = (parts: Part[], s: number): Part[] =>
  parts.map((p) => ({ ...p, size: p.size.map((v) => v * s) as [number, number, number], at: p.at.map((v) => v * s) as [number, number, number] }));

const spiderRig = (body: string, face: string, leg: string): Part[] => {
  const parts: Part[] = [
    { size: [0.45, 0.4, 0.45], at: [0, 0.5, -0.55], skin: body, front: face, isHead: true },
    { size: [0.4, 0.35, 0.4], at: [0, 0.5, -0.15], skin: body },
    { size: [0.65, 0.5, 0.75], at: [0, 0.5, 0.4], skin: body },
  ];
  const fan = [0.7, 0.25, -0.25, -0.7];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      parts.push({
        size: [0.85, 0.07, 0.07],
        at: [side * 0.55, 0.42, -0.3 + i * 0.22],
        skin: leg,
        rotZ: -side * 0.55,
        rotY: side * fan[i] * 0.55,
        swingY: (i % 2 === 0 ? 1 : -1) * side * 0.35,
      });
    }
  }
  return parts;
};

const rabbitRig = (coat: string): Part[] => [
  { size: [0.25, 0.25, 0.25], at: [0, 0.42, -0.28], skin: `rabbit_${coat}`, front: `rabbit_${coat}_face`, isHead: true },
  { size: [0.06, 0.25, 0.06], at: [-0.07, 0.68, -0.25], skin: `rabbit_${coat}` },
  { size: [0.06, 0.25, 0.06], at: [0.07, 0.68, -0.25], skin: `rabbit_${coat}` },
  { size: [0.3, 0.3, 0.5], at: [0, 0.28, 0.05], skin: `rabbit_${coat}` },
  { size: [0.1, 0.2, 0.08], at: [-0.1, 0.2, -0.12], skin: `rabbit_${coat}`, hang: true, swing: 1 },
  { size: [0.1, 0.2, 0.08], at: [0.1, 0.2, -0.12], skin: `rabbit_${coat}`, hang: true, swing: -1 },
  { size: [0.1, 0.2, 0.2], at: [-0.12, 0.2, 0.28], skin: `rabbit_${coat}`, hang: true, swing: -1 },
  { size: [0.1, 0.2, 0.2], at: [0.12, 0.2, 0.28], skin: `rabbit_${coat}`, hang: true, swing: 1 },
  { size: [0.1, 0.1, 0.08], at: [0, 0.35, 0.34], skin: 'rabbit_tail' },
];

const squidRig = (body = 'squid_body', face = 'squid_face', tent = 'squid_tent'): Part[] => {
  const parts: Part[] = [{ size: [0.6, 0.75, 0.6], at: [0, 0.5, 0], skin: body, front: face, isHead: true }];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push({ size: [0.1, 0.5, 0.1], at: [Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.22], skin: tent, hang: true, swing: i % 2 === 0 ? 0.6 : -0.6 });
  }
  return parts;
};

const villagerRig = (profession: Profession, level: number): Part[] => {
  const robe = `villager_robe_${profession}`;
  const parts: Part[] = [
    { size: [0.46, 0.55, 0.46], at: [0, 1.68, 0], skin: 'villager_skin', front: 'villager_face', isHead: true },
    { size: [0.12, 0.22, 0.12], at: [0, 1.6, -0.29], skin: 'villager_nose' },
    { size: [0.5, 0.95, 0.32], at: [0, 0.95, 0], skin: robe },
    { size: [0.52, 0.1, 0.34], at: [0, 1.0, 0], skin: `villager_belt_${Math.max(0, Math.min(4, level - 1))}` },
    { size: [0.22, 0.5, 0.22], at: [-0.12, 0.5, 0], skin: robe, hang: true, swing: 1 },
    { size: [0.22, 0.5, 0.22], at: [0.12, 0.5, 0], skin: robe, hang: true, swing: -1 },
    // Arms folded across the front.
    { size: [0.62, 0.2, 0.2], at: [0, 1.17, -0.22], skin: robe },
    { size: [0.2, 0.2, 0.2], at: [0.14, 1.17, -0.36], skin: 'villager_skin' },
  ];
  if (profession === 'farmer') parts.push({ size: [0.78, 0.05, 0.78], at: [0, 1.97, 0], skin: 'villager_hat' }, { size: [0.5, 0.12, 0.5], at: [0, 2.03, 0], skin: 'villager_hat' });
  return parts;
};
/** A quest giver: a villager's build, in their own colours, with hair, a beard, a hat or a helm as their definition says. */
const npcRig = (index: number): Part[] => {
  const look = NPCS[index]?.look;
  const robe = `npc_robe_${index}`;
  const trim = `npc_trim_${index}`;
  const hair = `npc_hair_${index}`;
  const parts: Part[] = [
    { size: [0.46, 0.55, 0.46], at: [0, 1.68, 0], skin: `npc_skin_${index}`, front: `npc_face_${index}`, isHead: true },
    { size: [0.12, 0.2, 0.12], at: [0, 1.6, -0.29], skin: `npc_skin_${index}` },
    { size: [0.5, 0.95, 0.32], at: [0, 0.95, 0], skin: robe },
    { size: [0.52, 0.1, 0.34], at: [0, 1.0, 0], skin: trim },
    { size: [0.54, 0.07, 0.36], at: [0, 0.5, 0], skin: trim },
    { size: [0.22, 0.5, 0.22], at: [-0.12, 0.5, 0], skin: robe, hang: true, swing: 1 },
    { size: [0.22, 0.5, 0.22], at: [0.12, 0.5, 0], skin: robe, hang: true, swing: -1 },
    { size: [0.62, 0.2, 0.2], at: [0, 1.17, -0.22], skin: robe },
    { size: [0.2, 0.2, 0.2], at: [0.14, 1.17, -0.36], skin: `npc_skin_${index}` },
  ];
  if (!look) return parts;
  const hat = look.hat;
  if (hat === 'none' || hat === 'cap') parts.push({ size: [0.5, 0.14, 0.5], at: [0, 1.98, 0], skin: hair }, { size: [0.5, 0.5, 0.12], at: [0, 1.72, 0.2], skin: hair });
  if (hat === 'cap') parts.push({ size: [0.52, 0.1, 0.52], at: [0, 2.06, 0], skin: trim }, { size: [0.4, 0.05, 0.18], at: [0, 2.0, -0.32], skin: trim });
  if (hat === 'hood') {
    parts.push(
      { size: [0.58, 0.12, 0.58], at: [0, 2.02, 0], skin: robe },
      { size: [0.58, 0.62, 0.1], at: [0, 1.72, 0.24], skin: robe },
      { size: [0.1, 0.62, 0.5], at: [-0.24, 1.72, 0.02], skin: robe },
      { size: [0.1, 0.62, 0.5], at: [0.24, 1.72, 0.02], skin: robe },
      { size: [0.5, 0.1, 0.1], at: [0, 1.98, -0.27], skin: trim },
    );
  }
  if (hat === 'helm') parts.push({ size: [0.55, 0.3, 0.55], at: [0, 1.96, 0], skin: 'npc_iron' }, { size: [0.06, 0.32, 0.05], at: [0, 1.72, -0.29], skin: 'npc_iron' }, { size: [0.1, 0.22, 0.1], at: [0, 2.2, 0], skin: trim });
  if (hat === 'wide') parts.push({ size: [0.9, 0.05, 0.9], at: [0, 1.97, 0], skin: trim }, { size: [0.5, 0.14, 0.5], at: [0, 2.05, 0], skin: trim });
  return parts;
};

// A training dummy: a plank base, a post, a straw body with a target painted on it, a burlap head and a crossbar for arms.
SKINS.dummy_wood = (x, y) => (y % 4 === 0 ? jit([104, 72, 40], 6, x, y, 140) : jit([142, 100, 58], 10, x, y, 141));
SKINS.dummy_hay = (x, y) => (hash(x, y >> 1, 142) > 0.7 ? jit([176, 146, 70], 10, x, y, 143) : jit([220, 190, 100], 14, x, y, 143));
SKINS.dummy_target = (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  if (d < 1.8) return [196, 36, 32];
  if (d < 3.6) return [238, 232, 214];
  if (d < 5.4) return [196, 36, 32];
  if (d < 7.2) return [238, 232, 214];
  return jit([220, 190, 100], 14, x, y, 143);
};
SKINS.dummy_burlap = plain([192, 160, 110], 12, 144);
SKINS.dummy_face = withFeatures(plain([192, 160, 110], 12, 144), [
  [3, 5, 5, 7, [48, 34, 22]],
  [10, 5, 12, 7, [48, 34, 22]],
  [4, 6, 4, 6, [192, 160, 110]],
  [11, 6, 11, 6, [192, 160, 110]],
  [5, 12, 5, 12, [48, 34, 22]],
  [7, 12, 7, 12, [48, 34, 22]],
  [9, 12, 9, 12, [48, 34, 22]],
  [11, 12, 11, 12, [48, 34, 22]],
]);

SKINS.stand_wood = (x, y) => (y % 4 === 0 ? jit([104, 72, 40], 6, x, y, 200) : jit([148, 106, 62], 10, x, y, 201));
SKINS.stand_leather = plain([140, 88, 52], 10, 202);
SKINS.stand_iron = plain([188, 188, 196], 8, 203);
SKINS.stand_gold = plain([232, 196, 72], 8, 204);
SKINS.stand_diamond = plain([92, 214, 196], 8, 205);
SKINS.stand_held = plain([168, 92, 48], 8, 206);

/** Which painted shell a piece on an armor stand uses. A class outfit uses that class's colour; anything that is not armor is the thing in its hand. */
function standShell(id: number): string {
  if (!id) return '';
  const worn = getItem(id).armor;
  if (!worn) return 'stand_held';
  if (worn.outfit === 'warrior') return 'stand_iron';
  if (worn.outfit === 'mage') return 'stand_diamond';
  if (worn.outfit === 'ranger' || worn.material === 'leather') return 'stand_leather';
  if (worn.material === 'gold') return 'stand_gold';
  if (worn.material === 'diamond') return 'stand_diamond';
  return 'stand_iron';
}

/** A wooden figure. `pose` is 0..3 (sneak and right-click). Armor is a shell a little larger than the wood, in the colour of its material. */
function standRig(pose: number, gear: readonly number[] = []): Part[] {
  const arm = [0.25, 0.7, -1.35, -0.4][pose] ?? 0.25;
  const armL = [0.25, 0.2, 0.45, -0.15][pose] ?? 0.25;
  const leg = [0, 0.35, 0.12, -0.2][pose] ?? 0;
  const parts: Part[] = [
    { size: [0.62, 0.08, 0.62], at: [0, 0.04, 0], skin: 'stand_wood' },
    { size: [0.1, 0.7, 0.1], at: [0, 0.44, 0], skin: 'stand_wood' },
    { size: [0.72, 0.08, 0.1], at: [0, 1.22, 0], skin: 'stand_wood' },
    { size: [0.26, 0.4, 0.14], at: [0, 1.02, 0], skin: 'stand_wood' },
    { size: [0.28, 0.28, 0.28], at: [0, 1.5, 0], skin: 'stand_wood' },
    { size: [0.08, 0.64, 0.08], at: [-0.34, 1.18, 0], skin: 'stand_wood', hang: true, rotX: armL },
    { size: [0.08, 0.64, 0.08], at: [0.34, 1.18, 0], skin: 'stand_wood', hang: true, rotX: arm },
    { size: [0.08, 0.46, 0.08], at: [-0.1, 0.5, 0], skin: 'stand_wood', hang: true, rotX: -leg },
    { size: [0.08, 0.46, 0.08], at: [0.1, 0.5, 0], skin: 'stand_wood', hang: true, rotX: leg },
  ];
  const shell = (slot: number): string => standShell(gear[slot] ?? 0);
  const helm = shell(0);
  const chest = shell(1);
  const legs = shell(2);
  const boots = shell(3);
  const hand = shell(4);
  if (helm) parts.push({ size: [0.36, 0.18, 0.36], at: [0, 1.6, 0], skin: helm });
  if (chest) parts.push({ size: [0.36, 0.46, 0.22], at: [0, 1.02, 0], skin: chest });
  if (legs) {
    parts.push({ size: [0.14, 0.42, 0.14], at: [-0.1, 0.5, 0], skin: legs, hang: true, rotX: -leg });
    parts.push({ size: [0.14, 0.42, 0.14], at: [0.1, 0.5, 0], skin: legs, hang: true, rotX: leg });
  }
  if (boots) {
    const foot = (side: number, rx: number): Part => ({
      size: [0.14, 0.1, 0.16],
      at: [side * 0.1, 0.5 - 0.46 * Math.cos(rx), -0.46 * Math.sin(rx)],
      skin: boots,
    });
    parts.push(foot(-1, -leg), foot(1, leg));
  }
  if (hand) {
    const L = 0.68;
    parts.push({ size: [0.16, 0.16, 0.16], at: [0.34, 1.18 - L * Math.cos(arm), -L * Math.sin(arm)], skin: hand });
  }
  return parts;
}

const dummyRig = (): Part[] => [
  { size: [0.9, 0.12, 0.9], at: [0, 0.06, 0], skin: 'dummy_wood' },
  { size: [0.2, 1.2, 0.2], at: [0, 0.7, 0], skin: 'dummy_wood' },
  { size: [0.6, 0.6, 0.3], at: [0, 1.1, 0], skin: 'dummy_hay', front: 'dummy_target' },
  { size: [1.2, 0.12, 0.14], at: [0, 1.28, 0.02], skin: 'dummy_wood' },
  // The straw hands hang below the bar, not inside it (boxes that share a face flicker).
  { size: [0.16, 0.26, 0.2], at: [-0.51, 1.09, 0.02], skin: 'dummy_hay' },
  { size: [0.16, 0.26, 0.2], at: [0.51, 1.09, 0.02], skin: 'dummy_hay' },
  { size: [0.16, 0.12, 0.16], at: [0, 1.43, 0], skin: 'dummy_wood' },
  { size: [0.4, 0.4, 0.4], at: [0, 1.65, 0], skin: 'dummy_burlap', front: 'dummy_face' },
  { size: [0.5, 0.08, 0.5], at: [0, 1.88, 0], skin: 'dummy_wood' },
  { size: [0.3, 0.1, 0.3], at: [0, 1.96, 0], skin: 'dummy_wood' },
];

function paintBeast(name: string, body: RGB, seed: number, extras: Feature[] = [], eye: RGB = [24, 18, 16]): void {
  SKINS[name] = plain(body, 10, seed);
  SKINS[`${name}_face`] = withFeatures(plain(body, 10, seed), [...eyes(5, 7, eye, 3, 4), ...extras]);
}
const muzzle = (c: RGB): Feature[] => [[5, 9, 10, 12, c]];
paintBeast('wolf', [142, 144, 150], 150, muzzle([224, 224, 220]));
paintBeast('fox', [214, 118, 52], 151, muzzle([240, 220, 196]));
paintBeast('fox_white', [236, 236, 232], 152, muzzle([250, 220, 210]));
paintBeast('cat', [120, 120, 128], 153, muzzle([210, 170, 150]));
paintBeast('cat_black', [36, 36, 40], 154, muzzle([70, 60, 60]), [220, 190, 40]);
paintBeast('cat_white', [236, 236, 238], 155, muzzle([250, 210, 200]), [40, 140, 80]);
paintBeast('ocelot', [214, 168, 72], 156, [[4, 4, 6, 8, [60, 40, 20]], [9, 4, 11, 8, [60, 40, 20]], ...muzzle([236, 200, 140])]);
paintBeast('horse', [120, 78, 48], 157, muzzle([196, 150, 120]));
paintBeast('horse_dark', [54, 40, 32], 158, muzzle([90, 70, 60]));
paintBeast('horse_white', [230, 228, 220], 159, muzzle([210, 180, 170]));
paintBeast('donkey', [150, 140, 130], 160, muzzle([120, 100, 90]));
paintBeast('mule', [110, 78, 52], 161, muzzle([160, 120, 90]));
paintBeast('llama', [214, 186, 140], 162, muzzle([180, 140, 110]));
paintBeast('llama_brown', [140, 96, 64], 163, muzzle([110, 78, 56]));
paintBeast('llama_gray', [170, 170, 166], 164, muzzle([120, 110, 100]));
paintBeast('trader_llama', [214, 186, 140], 165, muzzle([180, 140, 110]));
paintBeast('camel', [196, 156, 96], 166, muzzle([160, 110, 70]));
paintBeast('goat', [228, 226, 220], 167, muzzle([200, 180, 170]));
paintBeast('polar_bear', [236, 240, 244], 168, muzzle([40, 40, 44]), [20, 20, 24]);
paintBeast('sniffer', [72, 140, 72], 169, muzzle([48, 90, 48]));
paintBeast('turtle', [62, 130, 72], 170, muzzle([210, 190, 80]));
paintBeast('frog', [70, 150, 64], 171, [[6, 10, 9, 13, [240, 120, 150]]], [20, 20, 20]);
paintBeast('parrot_red', [196, 48, 48], 172, muzzle([240, 200, 60]), [20, 20, 20]);
paintBeast('parrot_blue', [48, 96, 196], 173, muzzle([240, 200, 60]), [20, 20, 20]);
paintBeast('parrot_green', [48, 160, 72], 174, muzzle([240, 200, 60]), [20, 20, 20]);
paintBeast('allay', [120, 196, 230], 175, [], [40, 80, 160]);
paintBeast('axolotl', [236, 150, 176], 176, muzzle([250, 200, 210]));
paintBeast('dolphin', [120, 140, 160], 177, muzzle([200, 210, 220]), [20, 30, 50]);
paintBeast('cod', [170, 160, 130], 178, [], [20, 20, 20]);
paintBeast('salmon', [196, 110, 90], 179, [], [20, 20, 20]);
paintBeast('pufferfish', [220, 180, 60], 180, [[3, 3, 4, 4, [40, 30, 20]], [11, 3, 12, 4, [40, 30, 20]], [7, 12, 8, 13, [40, 30, 20]]]);
paintBeast('tropical', [240, 120, 40], 181, [[2, 4, 4, 12, [240, 220, 60]], [11, 4, 13, 12, [240, 220, 60]]]);
paintBeast('tropical_yellow', [240, 210, 60], 182, [[2, 4, 4, 12, [40, 80, 180]]]);
paintBeast('tropical_blue', [60, 140, 210], 183, [[2, 4, 4, 12, [240, 80, 80]]]);
paintBeast('tadpole', [40, 48, 36], 184, [], [20, 20, 16]);
SKINS.bee = (x, y) => (Math.floor((x + y) / 4) % 2 === 0 ? jit([36, 32, 28], 6, x, y, 185) : jit([240, 196, 40], 8, x, y, 185));
SKINS.bee_face = withFeatures(SKINS.bee, [...eyes(5, 7, [20, 16, 16], 3, 4)]);
SKINS.bee_wing = plain([214, 228, 214], 4, 186);
SKINS.panda = (x, y) => (x < 3 || x > 12 || (y > 8 && x > 5 && x < 10) ? [28, 28, 30] : jit([236, 236, 232], 6, x, y, 187));
SKINS.panda_face = withFeatures(SKINS.panda, [...eyes(5, 7, [20, 20, 24], 2, 5), [6, 10, 9, 12, [28, 28, 30]]]);
SKINS.armadillo = (x, y) => (x % 4 === 0 ? jit([96, 64, 40], 6, x, y, 188) : jit([168, 116, 72], 8, x, y, 188));
SKINS.armadillo_face = withFeatures(SKINS.armadillo, [...eyes(5, 7, [20, 16, 12], 3, 4)]);
SKINS.mooshroom = (x, y) => (hash(x >> 2, y >> 2, 9) > 0.72 ? [236, 228, 220] : jit([168, 42, 42], 10, x, y, 189));
SKINS.mooshroom_face = withFeatures(SKINS.mooshroom, [...eyes(5, 7, [20, 16, 16], 3, 4), [5, 10, 10, 13, [210, 170, 160]]]);
SKINS.goat_horn = plain([230, 224, 200], 6, 190);
SKINS.trader_rug = plain([48, 86, 176], 8, 191);
SKINS.axolotl_gill = plain([214, 84, 120], 8, 192);
SKINS.parrot_beak = plain([236, 176, 48], 6, 193);
SKINS.glow_squid_body = plain([40, 180, 210], 12, 194);
SKINS.glow_squid_face = withFeatures(plain([40, 180, 210], 12, 194), [...eyes(6, 9, [230, 255, 255], 2, 5)]);
SKINS.glow_tent = plain([30, 140, 180], 8, 195);

const quad = (skin: string, s = 1): Part[] => scaleRig([
  { size: [0.5, 0.5, 0.5], at: [0, 0.68, -0.55], skin, front: `${skin}_face`, isHead: true },
  { size: [0.62, 0.48, 0.9], at: [0, 0.58, 0.05], skin },
  { size: [0.18, 0.36, 0.18], at: [-0.18, 0.36, -0.28], skin, hang: true, swing: 1 },
  { size: [0.18, 0.36, 0.18], at: [0.18, 0.36, -0.28], skin, hang: true, swing: -1 },
  { size: [0.18, 0.36, 0.18], at: [-0.18, 0.36, 0.36], skin, hang: true, swing: -1 },
  { size: [0.18, 0.36, 0.18], at: [0.18, 0.36, 0.36], skin, hang: true, swing: 1 },
], s);
const tall = (skin: string, s = 1): Part[] => scaleRig([
  { size: [0.42, 0.5, 0.55], at: [0, 1.25, -0.75], skin, front: `${skin}_face`, isHead: true },
  { size: [0.62, 0.58, 1.2], at: [0, 1.0, 0.05], skin },
  { size: [0.18, 0.72, 0.18], at: [-0.18, 0.72, -0.4], skin, hang: true, swing: 1 },
  { size: [0.18, 0.72, 0.18], at: [0.18, 0.72, -0.4], skin, hang: true, swing: -1 },
  { size: [0.18, 0.72, 0.18], at: [-0.18, 0.72, 0.48], skin, hang: true, swing: -1 },
  { size: [0.18, 0.72, 0.18], at: [0.18, 0.72, 0.48], skin, hang: true, swing: 1 },
], s);
const fishRig = (skin: string, s = 1): Part[] => scaleRig([
  { size: [0.2, 0.28, 0.55], at: [0, 0.24, 0], skin, front: `${skin}_face`, isHead: true },
  { size: [0.04, 0.24, 0.16], at: [0, 0.28, 0.34], skin },
  { size: [0.28, 0.04, 0.18], at: [0, 0.2, -0.02], skin },
], s);
const bird = (skin: string): Part[] => [
  { size: [0.22, 0.26, 0.22], at: [0, 0.72, -0.26], skin, front: `${skin}_face`, isHead: true },
  { size: [0.1, 0.08, 0.1], at: [0, 0.68, -0.4], skin: 'parrot_beak' },
  { size: [0.32, 0.3, 0.4], at: [0, 0.48, 0.02], skin },
  { size: [0.05, 0.26, 0.34], at: [-0.2, 0.52, 0.02], skin, flap: 0.45 },
  { size: [0.05, 0.26, 0.34], at: [0.2, 0.52, 0.02], skin, flap: -0.45 },
  { size: [0.06, 0.2, 0.06], at: [-0.08, 0.24, 0], skin: 'parrot_beak', hang: true, swing: 1 },
  { size: [0.06, 0.2, 0.06], at: [0.08, 0.24, 0], skin: 'parrot_beak', hang: true, swing: -1 },
];

const RIGS: Record<MobKind, Part[]> = {
  dummy: dummyRig(),
  armor_stand: standRig(0),
  npc: [], // built by npcRig(variant)
  villager: villagerRig('unemployed', 1),
  sheep: [
    { size: [0.4, 0.4, 0.4], at: [0, 1.0, -0.6], skin: 'sheep_skin', front: 'sheep_face', isHead: true },
    { size: [0.46, 0.18, 0.46], at: [0, 1.22, -0.55], skin: 'sheep_wool' },
    { size: [0.7, 0.65, 1.0], at: [0, 0.88, 0.05], skin: 'sheep_wool' },
    { size: [0.2, 0.55, 0.2], at: [-0.2, 0.58, -0.35], skin: 'sheep_skin', hang: true, swing: 1 },
    { size: [0.2, 0.55, 0.2], at: [0.2, 0.58, -0.35], skin: 'sheep_skin', hang: true, swing: -1 },
    { size: [0.2, 0.55, 0.2], at: [-0.2, 0.58, 0.45], skin: 'sheep_skin', hang: true, swing: -1 },
    { size: [0.2, 0.55, 0.2], at: [0.2, 0.58, 0.45], skin: 'sheep_skin', hang: true, swing: 1 },
  ],
  chicken: [
    { size: [0.2, 0.3, 0.2], at: [0, 0.7, -0.28], skin: 'chicken_body', front: 'chicken_face', isHead: true },
    { size: [0.2, 0.08, 0.1], at: [0, 0.68, -0.43], skin: 'chicken_beak' },
    { size: [0.06, 0.1, 0.06], at: [0, 0.58, -0.4], skin: 'chicken_wattle' },
    { size: [0.35, 0.35, 0.5], at: [0, 0.45, 0.02], skin: 'chicken_body' },
    { size: [0.06, 0.3, 0.4], at: [-0.22, 0.5, 0.05], skin: 'chicken_body', flap: 0.25 },
    { size: [0.06, 0.3, 0.4], at: [0.22, 0.5, 0.05], skin: 'chicken_body', flap: -0.25 },
    { size: [0.06, 0.25, 0.06], at: [-0.1, 0.27, 0], skin: 'chicken_leg', hang: true, swing: 1 },
    { size: [0.06, 0.25, 0.06], at: [0.1, 0.27, 0], skin: 'chicken_leg', hang: true, swing: -1 },
  ],
  rabbit: rabbitRig('brown'),
  squid: squidRig(),
  bat: [
    { size: [0.25, 0.25, 0.25], at: [0, 0.7, 0], skin: 'bat_body', front: 'bat_face', isHead: true },
    { size: [0.08, 0.12, 0.04], at: [-0.08, 0.89, 0], skin: 'bat_body' },
    { size: [0.08, 0.12, 0.04], at: [0.08, 0.89, 0], skin: 'bat_body' },
    { size: [0.25, 0.4, 0.2], at: [0, 0.42, 0.02], skin: 'bat_body' },
    { size: [0.5, 0.4, 0.04], at: [-0.37, 0.5, 0.05], skin: 'bat_wing', flap: 0.9 },
    { size: [0.5, 0.4, 0.04], at: [0.37, 0.5, 0.05], skin: 'bat_wing', flap: -0.9 },
  ],
  spider: spiderRig('spider_body', 'spider_face', 'spider_leg'),
  cave_spider: scaleRig(spiderRig('cave_spider_body', 'cave_spider_face', 'cave_spider_leg'), 0.6),
  slime: [
    { size: [0.3, 0.3, 0.3], at: [0, 0.2, 0], skin: 'slime_core', front: 'slime_face', isHead: true },
    { size: [0.5, 0.5, 0.5], at: [0, 0.25, 0], skin: 'slime_outer', alpha: 0.55 },
  ],
  enderman: [
    { size: [0.5, 0.5, 0.5], at: [0, 2.65, 0], skin: 'enderman_skin', front: 'enderman_face', isHead: true },
    { size: [0.5, 0.9, 0.25], at: [0, 1.9, 0], skin: 'enderman_skin' },
    { size: [0.18, 1.45, 0.18], at: [-0.12, 1.45, 0], skin: 'enderman_skin', hang: true, swing: 1 },
    { size: [0.18, 1.45, 0.18], at: [0.12, 1.45, 0], skin: 'enderman_skin', hang: true, swing: -1 },
    { size: [0.14, 1.3, 0.14], at: [-0.34, 2.3, 0], skin: 'enderman_skin', hang: true, swing: -0.5, strike: 1 },
    { size: [0.14, 1.3, 0.14], at: [0.34, 2.3, 0], skin: 'enderman_skin', hang: true, swing: 0.5, strike: 1 },
  ],
  husk: humanoid('husk_shirt', 'husk_pants', 'husk_skin', 'husk_face', Math.PI / 2.1),
  stray: humanoid('stray_bone', 'stray_bone', 'stray_bone', 'stray_face', Math.PI / 4, 'stray_ribs'),
  drowned: humanoid('drowned_shirt', 'drowned_pants', 'drowned_skin', 'drowned_face', Math.PI / 2.1),
  zombie: humanoid('zombie_shirt', 'zombie_pants', 'zombie_skin', 'zombie_face', Math.PI / 2.1),
  skeleton: humanoid('skeleton_bone', 'skeleton_bone', 'skeleton_bone', 'skeleton_face', Math.PI / 4, 'skeleton_ribs'),
  creeper: [
    { size: [0.5, 0.5, 0.5], at: [0, 1.45, 0], skin: 'creeper_skin', front: 'creeper_face', isHead: true },
    { size: [0.5, 0.75, 0.25], at: [0, 0.82, 0], skin: 'creeper_skin' },
    { size: [0.25, 0.45, 0.25], at: [-0.13, 0.45, -0.2], skin: 'creeper_skin', hang: true, swing: 1 },
    { size: [0.25, 0.45, 0.25], at: [0.13, 0.45, -0.2], skin: 'creeper_skin', hang: true, swing: -1 },
    { size: [0.25, 0.45, 0.25], at: [-0.13, 0.45, 0.2], skin: 'creeper_skin', hang: true, swing: -1 },
    { size: [0.25, 0.45, 0.25], at: [0.13, 0.45, 0.2], skin: 'creeper_skin', hang: true, swing: 1 },
  ],
  pig: [
    { size: [0.5, 0.5, 0.5], at: [0, 0.68, -0.6], skin: 'pig_body', front: 'pig_face', isHead: true },
    { size: [0.62, 0.5, 0.95], at: [0, 0.6, 0.05], skin: 'pig_body' },
    { size: [0.22, 0.38, 0.22], at: [-0.2, 0.38, -0.3], skin: 'pig_body', hang: true, swing: 1 },
    { size: [0.22, 0.38, 0.22], at: [0.2, 0.38, -0.3], skin: 'pig_body', hang: true, swing: -1 },
    { size: [0.22, 0.38, 0.22], at: [-0.2, 0.38, 0.4], skin: 'pig_body', hang: true, swing: -1 },
    { size: [0.22, 0.38, 0.22], at: [0.2, 0.38, 0.4], skin: 'pig_body', hang: true, swing: 1 },
  ],
  cow: [
    { size: [0.5, 0.5, 0.45], at: [0, 1.15, -0.72], skin: 'cow_body', front: 'cow_face', isHead: true },
    { size: [0.1, 0.18, 0.1], at: [-0.28, 1.46, -0.7], skin: 'cow_horn' },
    { size: [0.1, 0.18, 0.1], at: [0.28, 1.46, -0.7], skin: 'cow_horn' },
    { size: [0.7, 0.62, 1.15], at: [0, 0.98, 0.05], skin: 'cow_body' },
    { size: [0.24, 0.66, 0.24], at: [-0.22, 0.66, -0.4], skin: 'cow_body', hang: true, swing: 1 },
    { size: [0.24, 0.66, 0.24], at: [0.22, 0.66, -0.4], skin: 'cow_body', hang: true, swing: -1 },
    { size: [0.24, 0.66, 0.24], at: [-0.22, 0.66, 0.5], skin: 'cow_body', hang: true, swing: -1 },
    { size: [0.24, 0.66, 0.24], at: [0.22, 0.66, 0.5], skin: 'cow_body', hang: true, swing: 1 },
  ],
  wolf: quad('wolf', 0.9),
  fox: quad('fox', 0.75),
  cat: quad('cat', 0.7),
  ocelot: quad('ocelot', 0.75),
  horse: tall('horse', 1.15),
  donkey: tall('donkey', 1),
  mule: tall('mule', 1.05),
  llama: tall('llama', 1.05),
  trader_llama: [...tall('trader_llama', 1.05), { size: [0.55, 0.14, 0.7], at: [0, 1.2, 0.05], skin: 'trader_rug' }],
  camel: [...tall('camel', 1.2), { size: [0.35, 0.22, 0.4], at: [0, 1.55, -0.15], skin: 'camel' }],
  goat: [...tall('goat', 0.85), { size: [0.06, 0.22, 0.06], at: [-0.12, 1.2, -0.7], skin: 'goat_horn' }, { size: [0.06, 0.22, 0.06], at: [0.12, 1.2, -0.7], skin: 'goat_horn' }],
  panda: quad('panda', 1.35),
  polar_bear: quad('polar_bear', 1.45),
  mooshroom: tall('mooshroom', 0.95),
  armadillo: quad('armadillo', 0.8),
  sniffer: tall('sniffer', 1.35),
  turtle: [
    { size: [0.28, 0.2, 0.28], at: [0, 0.26, -0.42], skin: 'turtle', front: 'turtle_face', isHead: true },
    { size: [0.72, 0.26, 0.85], at: [0, 0.3, 0.05], skin: 'turtle' },
    { size: [0.16, 0.08, 0.18], at: [-0.28, 0.08, -0.18], skin: 'turtle', swing: 1 },
    { size: [0.16, 0.08, 0.18], at: [0.28, 0.08, -0.18], skin: 'turtle', swing: -1 },
    { size: [0.16, 0.08, 0.18], at: [-0.28, 0.08, 0.28], skin: 'turtle', swing: -1 },
    { size: [0.16, 0.08, 0.18], at: [0.28, 0.08, 0.28], skin: 'turtle', swing: 1 },
  ],
  frog: [
    { size: [0.32, 0.2, 0.3], at: [0, 0.34, -0.2], skin: 'frog', front: 'frog_face', isHead: true },
    { size: [0.06, 0.12, 0.06], at: [-0.1, 0.5, -0.18], skin: 'frog' },
    { size: [0.06, 0.12, 0.06], at: [0.1, 0.5, -0.18], skin: 'frog' },
    { size: [0.4, 0.2, 0.38], at: [0, 0.22, 0.08], skin: 'frog' },
    { size: [0.12, 0.14, 0.16], at: [-0.14, 0.14, -0.02], skin: 'frog', hang: true, swing: 1 },
    { size: [0.12, 0.14, 0.16], at: [0.14, 0.14, -0.02], skin: 'frog', hang: true, swing: -1 },
    { size: [0.14, 0.16, 0.2], at: [-0.12, 0.16, 0.22], skin: 'frog', hang: true, swing: -1 },
    { size: [0.14, 0.16, 0.2], at: [0.12, 0.16, 0.22], skin: 'frog', hang: true, swing: 1 },
  ],
  parrot: bird('parrot_red'),
  bee: [
    { size: [0.26, 0.26, 0.26], at: [0, 0.4, -0.16], skin: 'bee', front: 'bee_face', isHead: true },
    { size: [0.34, 0.3, 0.46], at: [0, 0.34, 0.08], skin: 'bee' },
    { size: [0.26, 0.16, 0.06], at: [-0.22, 0.48, 0.04], skin: 'bee_wing', flap: 0.9 },
    { size: [0.26, 0.16, 0.06], at: [0.22, 0.48, 0.04], skin: 'bee_wing', flap: -0.9 },
  ],
  allay: [
    { size: [0.28, 0.28, 0.28], at: [0, 0.62, 0], skin: 'allay', front: 'allay_face', isHead: true },
    { size: [0.26, 0.3, 0.16], at: [0, 0.34, 0], skin: 'allay' },
    { size: [0.3, 0.18, 0.05], at: [-0.26, 0.46, 0], skin: 'allay', flap: 0.8 },
    { size: [0.3, 0.18, 0.05], at: [0.26, 0.46, 0], skin: 'allay', flap: -0.8 },
  ],
  axolotl: [...fishRig('axolotl', 1.35), { size: [0.06, 0.16, 0.1], at: [-0.16, 0.36, -0.12], skin: 'axolotl_gill' }, { size: [0.06, 0.16, 0.1], at: [0.16, 0.36, -0.12], skin: 'axolotl_gill' }],
  dolphin: fishRig('dolphin', 1.7),
  glow_squid: squidRig('glow_squid_body', 'glow_squid_face', 'glow_tent'),
  cod: fishRig('cod', 0.9),
  salmon: fishRig('salmon', 1.15),
  pufferfish: fishRig('pufferfish', 1),
  tropical_fish: fishRig('tropical', 0.95),
  tadpole: fishRig('tadpole', 0.55),
};

const geoCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(size: [number, number, number], hang: boolean): THREE.BoxGeometry {
  const key = `${size.join(',')}:${hang}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    if (hang) g.translate(0, -size[1] / 2, 0);
    geoCache.set(key, g);
  }
  return g;
}

const heartGeo = new THREE.OctahedronGeometry(0.13);
const heartMat = new THREE.MeshBasicMaterial({ color: 0xff5d9e });

/** The mark over a quest giver's head: a quest to give (!), one to hand in (?), one still being done (grey ?). */
export type QuestMark = 'offer' | 'ready' | 'waiting';
const MARKS: readonly QuestMark[] = ['offer', 'ready', 'waiting'];

interface View {
  variant: number;
  /** What an armor stand is wearing, so a new piece rebuilds the figure. */
  gearKey?: string;
  /** Floats over an animal that is in love. */
  heart: THREE.Mesh;
  group: THREE.Group;
  parts: { mesh: THREE.Mesh; def: Part; mats: THREE.MeshBasicMaterial[] }[];
  /** A quest giver's name plate and quest marks (a mob that is not one has neither). */
  plate?: THREE.Sprite;
  marks?: Record<QuestMark, THREE.Sprite>;
}

const spriteTex = (draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const markTex = new Map<QuestMark, THREE.CanvasTexture>();
const markMat = new Map<QuestMark, THREE.SpriteMaterial>();
const plateTex = new Map<number, THREE.CanvasTexture>();

function markMaterial(mark: QuestMark): THREE.SpriteMaterial {
  let mat = markMat.get(mark);
  if (mat) return mat;
  const glyph = mark === 'offer' ? '!' : '?';
  const fill = mark === 'waiting' ? '#9aa3ad' : '#ffd24a';
  const tex = spriteTex((ctx, w, h) => {
    ctx.font = 'bold 56px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#2a1a00';
    ctx.lineJoin = 'round';
    ctx.strokeText(glyph, w / 2, h / 2 + 3);
    ctx.fillStyle = fill;
    ctx.fillText(glyph, w / 2, h / 2 + 3);
  }, 64, 64);
  markTex.set(mark, tex);
  mat = new THREE.SpriteMaterial({ map: tex, transparent: true, toneMapped: false, fog: false });
  markMat.set(mark, mat);
  return mat;
}

function plateTexture(index: number): THREE.CanvasTexture {
  let tex = plateTex.get(index);
  if (tex) return tex;
  const n = NPCS[index];
  tex = spriteTex((ctx, w, h) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(n?.name ?? '', w / 2, 24);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(n?.name ?? '', w / 2, 24);
    ctx.font = '20px Georgia, serif';
    ctx.lineWidth = 5;
    ctx.strokeText(`<${n?.title ?? ''}>`, w / 2, 52);
    ctx.fillStyle = '#d6dde4';
    ctx.fillText(`<${n?.title ?? ''}>`, w / 2, 52);
  }, 320, 72);
  plateTex.set(index, tex);
  return tex;
}

const RABBIT_COATS = ['brown', 'white', 'sandy'];
/** Extra coats. The rig is painted in the first; the others replace that skin. */
const COAT: Partial<Record<MobKind, readonly string[]>> = {
  fox: ['fox', 'fox_white'],
  cat: ['cat', 'cat_black', 'cat_white'],
  horse: ['horse', 'horse_dark', 'horse_white'],
  llama: ['llama', 'llama_brown', 'llama_gray'],
  parrot: ['parrot_red', 'parrot_blue', 'parrot_green'],
  tropical_fish: ['tropical', 'tropical_yellow', 'tropical_blue'],
};
function tintRig(parts: Part[], from: string, to: string): Part[] {
  return parts.map((p) => ({ ...p, skin: p.skin === from ? to : p.skin, front: p.front === `${from}_face` ? `${to}_face` : p.front }));
}

/** A sheep that has been shorn is drawn with the key `variant + SHORN`. */
const SHORN = 1000;

function buildView(kind: MobKind, key: number, gear: readonly number[] = []): View {
  const shorn = kind === 'sheep' && key >= SHORN;
  const variant = key % SHORN;
  const group = new THREE.Group();
  const parts: View['parts'] = [];
  const coats = COAT[kind];
  const coat = coats?.[variant] ?? coats?.[0];
  const base = kind === 'armor_stand' ? standRig(variant, gear) : kind === 'rabbit' ? rabbitRig(RABBIT_COATS[variant] ?? 'brown') : kind === 'villager' ? villagerRig(variantProfession(variant), variantLevel(variant)) : kind === 'npc' ? npcRig(variant) : RIGS[kind];
  const rig = coat && coats && coat !== coats[0] ? tintRig(base, coats[0], coat) : base;
  for (const def of rig) {
    const base = skin(kind === 'sheep' && def.skin === 'sheep_wool' ? (shorn ? 'sheep_shorn' : variant > 0 ? `sheep_wool_${variant}` : def.skin) : def.skin);
    const mk = (map: THREE.Texture) => (def.alpha ? new THREE.MeshBasicMaterial({ map, transparent: true, opacity: def.alpha, depthWrite: false }) : new THREE.MeshBasicMaterial({ map }));
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The mob faces -Z, so the face goes on index 5.
    const mats = [0, 1, 2, 3, 4, 5].map((i) => mk(i === 5 && def.front ? skin(def.front) : base));
    const mesh = new THREE.Mesh(boxGeo(def.size, !!def.hang), mats);
    mesh.position.set(...def.at);
    mesh.rotation.x = def.rotX ?? 0;
    mesh.rotation.y = def.rotY ?? 0;
    mesh.rotation.z = def.rotZ ?? 0;
    group.add(mesh);
    parts.push({ mesh, def, mats });
  }
  const heart = new THREE.Mesh(heartGeo, heartMat);
  heart.position.set(0, MOBS[kind].height + 0.45, 0);
  heart.visible = false;
  group.add(heart);
  const view: View = { variant: key, gearKey: kind === 'armor_stand' ? gear.join(',') : '', heart, group, parts };
  if (kind === 'npc') {
    const plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: plateTexture(variant), transparent: true, toneMapped: false, fog: false }));
    plate.scale.set(1.6, 0.36, 1);
    plate.position.set(0, MOBS.npc.height + 0.3, 0);
    group.add(plate);
    const marks = {} as Record<QuestMark, THREE.Sprite>;
    for (const m of MARKS) {
      const s = new THREE.Sprite(markMaterial(m));
      s.scale.set(0.7, 0.7, 1);
      s.position.set(0, MOBS.npc.height + 0.95, 0);
      s.visible = false;
      group.add(s);
      marks[m] = s;
    }
    view.plate = plate;
    view.marks = marks;
  }
  return view;
}

/** Frees what one mob's view owns (the shared skins and quest marks stay). */
function disposeView(v: View): void {
  for (const p of v.parts) for (const mat of p.mats) mat.dispose();
  v.plate?.material.dispose();
}

/**
 * A small box with each face its own shade of `rgb`, so a pile of them reads as a solid thing
 * under a flat material. Face order is BoxGeometry's: +x, -x, +y, -y, +z, -z.
 */
function shadedBox(w: number, h: number, d: number, rgb: RGB): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const colors = new Float32Array(geo.getAttribute('position').count * 3);
  const shade = [0.72, 0.52, 1.18, 0.4, 0.9, 0.62];
  for (let face = 0; face < 6; face++) {
    const k = shade[face]!;
    for (let v = 0; v < 4; v++) {
      const i = (face * 4 + v) * 3;
      colors[i] = Math.min(1, (rgb[0] * k) / 255);
      colors[i + 1] = Math.min(1, (rgb[1] * k) / 255);
      colors[i + 2] = Math.min(1, (rgb[2] * k) / 255);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Renders mobs as procedural box-model rigs, plus arrows in flight. */
export class MobRenderer {
  readonly group = new THREE.Group();
  private views = new Map<number, View>();
  private arrowMeshes = new Map<ArrowLike, THREE.Object3D>();
  /** Spells in flight (3 a fireball, 4 an arcane bolt, 5 a wand's and 6 a staff's bolt) draw themselves (see fireFx.ts, fireballFx.ts, wandFx.ts, staffFx.ts); they are listed here to be updated and freed. */
  private spells = new Map<ArrowLike, { kind: number; view: SpellView }>();
  // An arrow: a wooden shaft, a steel head and red fletching (see makeArrow), pointing along +z, its middle at the origin.
  private arrowShaftGeo = new THREE.BoxGeometry(0.035, 0.035, 0.8);
  private arrowHeadGeo = new THREE.ConeGeometry(0.075, 0.22, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  private arrowFletchGeo = new THREE.PlaneGeometry(0.2, 0.15).rotateY(Math.PI / 2).translate(0, 0, -0.3);
  private arrowTrailGeo = new THREE.BoxGeometry(0.03, 0.03, 1).translate(0, 0, -0.5);
  private arrowMat = new THREE.MeshBasicMaterial({ color: 0x9a6a36 });
  private arrowHeadMat = new THREE.MeshBasicMaterial({ color: 0xc9d1de });
  private arrowFletchMat = new THREE.MeshBasicMaterial({ color: 0xd8483a, side: THREE.DoubleSide });
  private arrowTrailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
  /** Cork, neck, shoulder, body and base of a thrown bottle, built once and shared. */
  private bottleGeos: THREE.BoxGeometry[] = [];
  private bottleMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private pearlGeo = new THREE.SphereGeometry(0.14, 8, 6);
  private pearlMat = new THREE.MeshBasicMaterial({ color: 0x1f8f78 });
  private fireballMat = new THREE.MeshBasicMaterial({ color: 0xff8a1f });
  private boltMat = new THREE.MeshBasicMaterial({ color: 0x9ab8ff });
  private spellGeo = new THREE.SphereGeometry(0.22, 10, 8);
  /** The cubes of every fireball, wand and staff bolt in flight (made on the first one; each cube has its own colour). */
  private cubeMat: THREE.MeshBasicMaterial | null = null;
  private time = 0;
  private env: EntityLight | null = null;
  private readonly tint = new THREE.Color();
  private readonly faceF = new Float32Array(6);
  private readonly faceRGB = new Float32Array(18);

  /** What to show over a quest giver (an id of `NPCS`): set by the game from the player's quest log. */
  markerFor: ((npc: string) => QuestMark | null) | null = null;

  /** `fire` draws the Mage's fireballs and arcane bolts; without it they are plain glowing balls. `kit` has the cubes' shape for the wand's bolts. */
  constructor(
    private readonly fire: FireParticles | null = null,
    private readonly kit: SpellKit | null = null,
  ) {}

  private cubeMaterial(): THREE.MeshBasicMaterial {
    return (this.cubeMat ??= new THREE.MeshBasicMaterial({ vertexColors: true }));
  }

  /** A thrown bottle: a solid flask (cork, glass neck, green body) that tumbles in the air. */
  private makeBottle(): THREE.Group {
    if (this.bottleGeos.length === 0) {
      const part = (w: number, h: number, d: number, y: number, rgb: RGB): void => {
        const geo = shadedBox(w, h, d, rgb);
        geo.translate(0, y, 0);
        this.bottleGeos.push(geo);
      };
      part(0.1, 0.055, 0.1, 0.2, [150, 104, 54]);
      part(0.07, 0.09, 0.07, 0.125, [210, 236, 242]);
      part(0.15, 0.05, 0.15, 0.055, [168, 214, 196]);
      part(0.22, 0.15, 0.22, -0.045, [110, 236, 86]);
      part(0.17, 0.055, 0.17, -0.145, [72, 176, 58]);
    }
    const g = new THREE.Group();
    for (const geo of this.bottleGeos) g.add(new THREE.Mesh(geo, this.bottleMat));
    return g;
  }

  /** One arrow in flight: shaft, steel head, two crossed fletching vanes and a faint streak behind it. */
  private makeArrow(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.arrowShaftGeo, this.arrowMat), new THREE.Mesh(this.arrowHeadGeo, this.arrowHeadMat));
    const v1 = new THREE.Mesh(this.arrowFletchGeo, this.arrowFletchMat);
    const v2 = new THREE.Mesh(this.arrowFletchGeo, this.arrowFletchMat);
    v2.rotation.z = Math.PI / 2;
    g.add(v1, v2);
    const trail = new THREE.Mesh(this.arrowTrailGeo, this.arrowTrailMat);
    trail.position.z = -0.4;
    g.add(trail);
    g.userData.trail = trail;
    g.scale.setScalar(0.8);
    return g;
  }

  /** Light the mobs from the world (sky colour, caves, torches, the sun on each face) instead of one brightness. */
  setEnvironment(env: EntityLight | null): void {
    this.env = env;
  }

  sync(mobs: readonly MobLike[], arrows: readonly ArrowLike[], dt: number, brightness: number): void {
    this.time += dt;
    const seen = new Set<number>();
    const light = 0.55 + 0.45 * brightness;

    for (const m of mobs) {
      seen.add(m.id);
      let v = this.views.get(m.id);
      const key = m.variant + (m.sheared ? SHORN : 0);
      const worn = m.kind === 'armor_stand' ? (m.gear ?? []) : [];
      const gearKey = worn.join(',');
      if (v && (v.variant !== key || (v.gearKey ?? '') !== gearKey)) {
        // Dyed, a new pose, or a new piece on an armor stand: rebuild, keeping the heading.
        const yaw = v.group.rotation.y;
        this.group.remove(v.group);
        disposeView(v);
        v = undefined;
        const nv = buildView(m.kind, key, worn);
        nv.group.rotation.y = yaw;
        this.views.set(m.id, nv);
        this.group.add(nv.group);
        v = nv;
      }
      if (!v) {
        v = buildView(m.kind, key, worn);
        v.group.rotation.y = m.yaw;
        this.views.set(m.id, v);
        this.group.add(v.group);
      }
      const g = v.group;
      g.position.set(m.body.x, m.body.y, m.body.z);

      // Smoothly turn toward the facing the AI chose.
      let diff = m.yaw - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * Math.min(1, dt * 12);

      // A melee swing (it plays whether or not the blow lands: a raised shield stops the damage, not the attack):
      // the body lunges the way it faces and the arms come down.
      const swingK = !m.dead && m.attackTime !== undefined && m.attackTime >= 0 && m.attackTime < ATTACK_ANIM ? m.attackTime / ATTACK_ANIM : -1;
      if (swingK >= 0) {
        const lunge = 0.38 * Math.sin(Math.PI * Math.min(1, swingK * 1.25)) * (m.kind === 'slime' ? 1.3 : 1);
        g.position.x -= Math.sin(g.rotation.y) * lunge;
        g.position.z -= Math.cos(g.rotation.y) * lunge;
      }
      const armTurn = swingK >= 0 ? strikeArm(swingK) : 0;

      // Death: tip over. Creeper: swell while the fuse burns.
      g.rotation.z = m.dead ? (Math.PI / 2) * Math.min(1, m.deathTime / 0.35) : 0;
      const swell = 1 + m.fuseFraction * 0.3;
      const big = (m.kind === 'slime' ? m.size : 1) * (m.baby ? 0.5 : 1);
      g.scale.set(swell * big, (1 + m.fuseFraction * 0.12) * big, swell * big);

      v.heart.visible = !m.dead && (m.love ?? 0) > 0;
      if (v.heart.visible) {
        v.heart.rotation.y = this.time * 3;
        v.heart.position.y = MOBS[m.kind].height + 0.45 + Math.sin(this.time * 4) * 0.06;
      }

      if (v.marks) {
        const mark = this.markerFor?.(NPCS[m.variant]?.id ?? '') ?? null;
        for (const k of MARKS) v.marks[k].visible = k === mark;
        if (mark) v.marks[mark].position.y = MOBS.npc.height + 0.95 + Math.sin(this.time * 3 + m.id) * 0.06;
      }

      const moving = Math.min(1, m.speedNow / 1.2);
      const swing = Math.sin(m.walkPhase) * 0.85 * moving;
      const bob = m.dead ? 0 : Math.sin(this.time * 1.7 + m.id) * 0.03;

      // Light: the world's (sky colour, caves, torches, the sun on each face) when there is one, else a plain level.
      const faceR = this.faceRGB;
      if (this.env) {
        this.env.at(m.body.x, m.body.y, m.body.z, this.tint);
        this.env.faces(g.rotation.y, this.faceF);
        for (let i = 0; i < 6; i++) {
          faceR[i * 3] = this.tint.r * this.faceF[i];
          faceR[i * 3 + 1] = this.tint.g * this.faceF[i];
          faceR[i * 3 + 2] = this.tint.b * this.faceF[i];
        }
      } else faceR.fill(light);

      // Tint: hurt flash (red), burning (orange), fuse flash (white).
      let kr = 1;
      let kg = 1;
      let kb = 1;
      if (m.dead || m.hurtTime < 0.35) {
        kr = 1.25;
        kg = 0.45;
        kb = 0.45;
      } else if (m.burning) {
        kr = 1.2;
        kg = 0.75;
        kb = 0.45;
      }
      const fuseFlash = m.fuse >= 0 && Math.floor(m.fuse * 8) % 2 === 0;

      for (const p of v.parts) {
        const d = p.def;
        if (d.swing) p.mesh.rotation.x = (d.rotX ?? 0) + swing * d.swing + (d.strike ? armTurn * d.strike : 0);
        if (d.swingY) p.mesh.rotation.y = (d.rotY ?? 0) + swing * d.swingY;
        if (d.flap) p.mesh.rotation.z = (d.rotZ ?? 0) + Math.sin(this.time * (m.kind === 'bat' ? 22 : 14) + m.id) * d.flap * (m.kind === 'bat' ? 1 : 0.3 + moving);
        if (d.isHead) p.mesh.rotation.y = Math.sin(this.time * 0.9 + m.id * 3) * 0.12 * (1 - moving);
        p.mesh.position.y = d.at[1] + (d.isHead ? bob : 0);
        for (let i = 0; i < 6; i++) {
          if (fuseFlash) p.mats[i].color.setRGB(1.7, 1.7, 1.7);
          else p.mats[i].color.setRGB(faceR[i * 3] * kr, faceR[i * 3 + 1] * kg, faceR[i * 3 + 2] * kb);
        }
      }
    }

    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.group.remove(v.group);
      disposeView(v);
      this.views.delete(id);
    }

    // arrows
    const liveArrows = new Set(arrows);
    for (const a of arrows) {
      // 0 = arrow, 1 = bottle o' enchanting, 2 = ender pearl, 3 = fireball, 4 = arcane bolt, 5 = a wand's bolt (of cubes), 6 = a staff's.
      const spell = a.spell ?? a.s ?? 0;
      const kind = a.bottle || a.b ? 1 : a.pearl || a.p ? 2 : spell === 1 ? 3 : spell === 3 && this.kit ? 5 : spell === 4 && this.kit ? 6 : spell > 1 ? 4 : 0;
      // Fireballs and arcane bolts draw themselves (see fireFx.ts).
      if (kind >= 3 && this.fire) {
        const old = this.spells.get(a);
        let sv = old;
        if (old && old.kind !== kind) {
          this.group.remove(old.view.group);
          old.view.dispose?.();
          sv = undefined;
        }
        if (!sv) {
          sv = { kind, view: kind === 3 ? (this.kit ? new FireballBoltView(this.kit, this.cubeMaterial(), a) : new FireballView(this.fire, a)) : kind === 5 ? new WandBoltView(this.kit!, this.cubeMaterial(), a) : kind === 6 ? new StaffBoltView(this.kit!, this.cubeMaterial(), a) : new ArcaneBoltView(this.fire, a) };
          this.spells.set(a, sv);
          this.group.add(sv.view.group);
        }
        sv.view.update(a, this.time, dt);
        const plain = this.arrowMeshes.get(a);
        if (plain) {
          this.group.remove(plain);
          this.arrowMeshes.delete(a);
        }
        continue;
      }
      // A slot that carried a spell and now carries something else (a server reuses them by position).
      const stale = this.spells.get(a);
      if (stale) {
        this.group.remove(stale.view.group);
        stale.view.dispose?.();
        this.spells.delete(a);
      }
      let mesh = this.arrowMeshes.get(a);
      if (mesh && mesh.userData.kind !== kind) {
        this.group.remove(mesh);
        mesh = undefined;
      }
      if (!mesh) {
        mesh =
          kind === 0
            ? this.makeArrow()
            : kind === 1
              ? this.makeBottle()
              : new THREE.Mesh(kind === 2 ? this.pearlGeo : this.spellGeo, kind === 2 ? this.pearlMat : kind === 3 ? this.fireballMat : this.boltMat);
        mesh.userData.kind = kind;
        this.arrowMeshes.set(a, mesh);
        this.group.add(mesh);
      }
      mesh.position.set(a.x, a.y, a.z);
      if (kind >= 3) mesh.scale.setScalar(0.9 + 0.2 * Math.sin(this.time * 24));
      if (kind === 1) {
        mesh.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
        mesh.rotateX(this.time * 8);
      } else if (kind === 0) {
        // It points along the way it is going, so it tips over as it falls; a streak behind it shows the speed.
        mesh.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
        const trail = mesh.userData.trail as THREE.Object3D | undefined;
        if (trail) trail.scale.z = Math.min(2.2, Math.hypot(a.vx, a.vy, a.vz) * 0.05);
      }
    }
    for (const [a, mesh] of this.arrowMeshes) {
      if (liveArrows.has(a)) continue;
      this.group.remove(mesh);
      this.arrowMeshes.delete(a);
    }
    for (const [a, sv] of this.spells) {
      if (liveArrows.has(a)) continue;
      this.group.remove(sv.view.group);
      sv.view.dispose?.();
      this.spells.delete(a);
    }
  }

  /**
   * One of every kind of mob (a few of their looks too), and an arrow and the other things thrown, side by side, for the warm-up
   * (see `FigureWarm`): the graphics card builds a shader when something that needs it is first drawn, and a mob of a kind not seen
   * before (a bat, a drowned) would stop the game for it. `free` lets go of them.
   */
  warm(): { group: THREE.Group; free: () => void } {
    const group = new THREE.Group();
    const views: View[] = [];
    let x = 0;
    const place = (o: THREE.Object3D): void => {
      o.position.x = x;
      x += 3;
      group.add(o);
    };
    for (const kind of Object.keys(MOBS) as MobKind[]) {
      const keys = kind === 'sheep' ? [0, 1, SHORN] : kind === 'rabbit' ? [0, 1, 2] : COAT[kind] ? COAT[kind].map((_, i) => i) : [0];
      for (const key of keys) {
        const v = buildView(kind, key);
        views.push(v);
        v.heart.visible = true;
        place(v.group);
      }
    }
    const arrow = this.makeArrow();
    place(arrow);
    place(this.makeBottle());
    for (const [geo, mat] of [[this.pearlGeo, this.pearlMat], [this.spellGeo, this.fireballMat], [this.spellGeo, this.boltMat]] as const) place(new THREE.Mesh(geo, mat));
    return { group, free: () => views.forEach(disposeView) };
  }

  clear(): void {
    this.sync([], [], 0, 1);
  }

  dispose(): void {
    this.clear();
    for (const g of [this.arrowShaftGeo, this.arrowHeadGeo, this.arrowFletchGeo, this.arrowTrailGeo]) g.dispose();
    for (const m of [this.arrowMat, this.arrowHeadMat, this.arrowFletchMat, this.arrowTrailMat]) m.dispose();
    for (const geo of this.bottleGeos) geo.dispose();
    this.bottleMat.dispose();
    this.pearlGeo.dispose();
    this.pearlMat.dispose();
    this.fireballMat.dispose();
    this.boltMat.dispose();
    this.spellGeo.dispose();
    this.cubeMat?.dispose();
  }
}

/** Releases the shared skin textures and geometries (call once at shutdown). */
export function disposeMobAssets(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  for (const t of [...markTex.values(), ...plateTex.values()]) t.dispose();
  for (const m of markMat.values()) m.dispose();
  markTex.clear();
  markMat.clear();
  plateTex.clear();
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}
