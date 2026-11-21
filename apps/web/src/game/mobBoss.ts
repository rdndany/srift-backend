import { hash, jit, mix, mul, plain, type Brick, type Painter, type Part, type RGB } from './mobPaint';

/**
 * The Hollow King: a magma colossus. He is a hunched, heavy-shouldered golem heaped from well over a thousand small maroon-violet
 * cubes (rubble sticking out of him on every side) with lava showing in the seams between them, a core of white fire in his chest,
 * a small angular head with burning eyes under a ring of jagged cube spikes, and fists the size of boulders. Flames (the very fire
 * of a flint and steel, see `Part.flame`) burn on his crown, shoulders, back, fists and feet.
 *
 * Every limb is ONE mesh: its cubes are listed in `Part.bricks` and merged by the renderer (mobRenderer.ts), over a box of lava
 * (`glow`) a little smaller than the limb, which is what shines through the gaps. The cubes are lit from within (`selfLit`) so he
 * can be seen in a pitch-black cave. The arms rise when he gathers a spell (`raise`, driven by the server's `cast` flag).
 */

const LAVA: RGB = [255, 128, 26];
const HOT: RGB = [255, 176, 52];

/** The cracks of one cube face: a jagged line of lava from one edge, with a branch and a dim halo. */
function cracks(seed: number, lines = 2): Map<number, number> {
  const out = new Map<number, number>();
  const mark = (x: number, y: number, v: number): void => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const k = y * 16 + x;
    out.set(k, Math.max(out.get(k) ?? 0, v));
  };
  for (let l = 0; l < lines; l++) {
    let x = 2 + Math.floor(hash(l, 1, seed) * 12);
    let y = hash(l, 2, seed) < 0.5 ? 0 : 15;
    const dir = y === 0 ? 1 : -1;
    const len = 7 + Math.floor(hash(l, 3, seed) * 6);
    for (let i = 0; i < len; i++) {
      mark(x, y, 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) mark(x + dx, y + dy, 1);
      if (hash(l, i + 10, seed) < 0.18) {
        let bx = x;
        const bd = hash(l, i + 30, seed) < 0.5 ? -1 : 1;
        for (let k = 0; k < 4; k++) {
          bx += bd;
          mark(bx, y + (k % 2 === 0 ? 0 : dir), 2);
          mark(bx, y - 1, 1);
          mark(bx, y + 1, 1);
        }
      }
      y += dir * (hash(l, i + 50, seed) < 0.8 ? 1 : 0);
      x += Math.floor(hash(l, i + 70, seed) * 3) - 1;
      if (y < 0 || y > 15) break;
    }
  }
  return out;
}

/** Which edges of a cube's face glow (top, bottom, left, right). */
type Rim = [boolean, boolean, boolean, boolean];

/**
 * A cube of cooled lava stone: maroon-violet, chipped, warm near the edges, with a thin rim of lava along some of them (the
 * seams of the heap), and now and then a crack.
 */
function rock(seed: number, base: RGB, rim: Rim, lines = 0): Painter {
  const c = cracks(seed, lines);
  return (x, y) => {
    const crack = c.get(y * 16 + x) ?? 0;
    if (crack === 2) return jit(mix(LAVA, [255, 214, 90], hash(x, y, seed + 3) * 0.7), 10, x, y, seed + 4);
    if (crack === 1) return jit(mix(base, [210, 84, 30], 0.6), 8, x, y, seed + 5);
    const dTop = y;
    const dBottom = 15 - y;
    const dLeft = x;
    const dRight = 15 - x;
    // The rim: a bright line on the edge, a glow of heat inside it.
    const near = Math.min(rim[0] ? dTop : 9, rim[1] ? dBottom : 9, rim[2] ? dLeft : 9, rim[3] ? dRight : 9);
    if (near === 0) return jit(mix(HOT, [255, 226, 110], hash(x, y, seed + 7) * 0.6), 10, x, y, seed + 8);
    if (near === 1) return jit(mix(base, [255, 150, 40], 0.85), 8, x, y, seed + 9);
    if (near === 2) return jit(mix(base, [220, 92, 30], 0.45), 8, x, y, seed + 10);
    // Heat in every cube's corners, a lit top-left and a shaded bottom-right, so that each reads as a cube.
    const edge = Math.min(dTop, dBottom, dLeft, dRight);
    const warm = edge <= 1 ? 0.2 : 0;
    const bevel = x === 0 || y === 0 ? 1.2 : x === 15 || y === 15 ? 0.7 : 1;
    const patch = 0.8 + hash(x >> 2, y >> 2, seed) * 0.42;
    const c0 = mix(mul(base, bevel * patch), [200, 80, 36], warm);
    // Flecks of violet and chips of darker stone.
    if (hash(x, y, seed + 1) > 0.9) return jit(mix(c0, [140, 66, 120], 0.5), 6, x, y, seed + 2);
    if (hash(x >> 1, y >> 1, seed + 11) > 0.86) return jit(mul(c0, 0.62), 6, x, y, seed + 12);
    return jit(c0, 9, x, y, seed + 6);
  };
}

/** Lava: a bright orange with hot yellow patches and a few dark crusts. */
const lava: Painter = (x, y) => {
  const n = hash(x >> 1, y >> 1, 61) * 0.6 + hash(x, y, 62) * 0.4;
  if (n > 0.72) return jit([255, 224, 100], 10, x, y, 63);
  if (n < 0.2) return jit([220, 84, 16], 10, x, y, 64);
  return jit(LAVA, 14, x, y, 65);
};

/** A cube that is mostly lava: a dark crust broken by wide hot cracks. */
const ember: Painter = (x, y) => {
  const n = hash(x >> 2, y >> 2, 91) * 0.5 + hash(x >> 1, y >> 1, 92) * 0.35 + hash(x, y, 93) * 0.15;
  if (n > 0.42) return jit(mix(LAVA, [255, 226, 110], hash(x, y, 94)), 12, x, y, 95);
  if (n > 0.34) return jit([214, 84, 24], 10, x, y, 96);
  return jit([92, 40, 52], 8, x, y, 97);
};

/** The heart: a white-hot cross in a ring of fire, an orange glow around it. */
const coreTile: Painter = (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  const ax = Math.abs(x - 7.5);
  const ay = Math.abs(y - 7.5);
  if ((ax < 1.6 || ay < 1.6) && d < 7.4) return jit([255, 248, 206], 6, x, y, 66);
  if (d > 5.6 && d < 7.2) return jit([255, 210, 90], 8, x, y, 67);
  const t = Math.max(0, 1 - d / 8);
  return jit(mix([255, 112, 22], [255, 226, 150], t * t), 8, x, y, 68);
};

/** The eyes: a yellow-white slit-like glare with an orange rim. */
const eye: Painter = (x, y) => {
  const edge = Math.min(x, y, 15 - x, 15 - y);
  if (edge <= 1) return jit([255, 150, 34], 8, x, y, 69);
  return jit([255, 238, 150], 10, x, y, 70);
};

/** The skins the cubes of a cluster are painted with (indices for `Brick`). */
const ROCK_SKINS = ['gol_rock_a', 'gol_rock_b', 'gol_rock_c', 'gol_rock_d', 'gol_rock_e', 'gol_rock_f', 'gol_ember'];

export const BOSS_SKINS: Record<string, Painter> = {
  gol_rock_a: rock(11, [100, 48, 64], [false, true, false, true]),
  gol_rock_b: rock(23, [86, 44, 66], [true, false, true, false]),
  gol_rock_c: rock(37, [112, 52, 62], [true, true, false, false], 1),
  gol_rock_d: rock(53, [72, 40, 60], [true, true, true, true]),
  gol_rock_e: rock(67, [94, 48, 72], [false, false, true, true], 2),
  gol_rock_f: rock(79, [120, 56, 64], [false, false, false, false], 1),
  gol_ember: ember,
  gol_lava: lava,
  gol_core: coreTile,
  gol_eye: eye,
  gol_mouth: plain([255, 170, 40], 14, 71),
};

// ---------------------------------------------------------------------------------------------------------------------------------

/** A small deterministic random generator (0..1), so that every Hollow King is built the same. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A box of space: its centre and its size. */
interface Vol {
  c: [number, number, number];
  s: [number, number, number];
}
const vol = (c: [number, number, number], s: [number, number, number]): Vol => ({ c, s });
const inside = (v: Vol, x: number, y: number, z: number): boolean => Math.abs(x - v.c[0]) <= v.s[0] / 2 && Math.abs(y - v.c[1]) <= v.s[1] / 2 && Math.abs(z - v.c[2]) <= v.s[2] / 2;

interface PackOptions {
  /** The size of one cube (the volumes are cut into cells about this big). */
  cell: number;
  /** How far the cubes stick out of the surface (in cells). */
  rough?: number;
  /** Extra small cubes lying on the surface (a share of the surface cells). */
  rubble?: number;
  /** Space the cubes keep out of (an eye, the heart). */
  holes?: Vol[];
  /** Share of cubes that are of the glowing sort. */
  hot?: number;
  /** Brightness of the whole lot. */
  tone?: number;
}

/**
 * Fills the surface of some boxes of space with small cubes: sizes, offsets, shades and faces all vary, some cubes stick out like
 * rubble and some are small chips lying on the others. What is inside is left empty (a box of lava is put there).
 */
function pack(seed: number, vols: Vol[], o: PackOptions): Brick[] {
  const r = rng(seed);
  const out: Brick[] = [];
  const rough = o.rough ?? 0.16;
  const rubble = o.rubble ?? 0.06;
  const tone = o.tone ?? 1;
  const holes = o.holes ?? [];
  const skin = (): number => (r() < (o.hot ?? 0.12) ? 6 : Math.floor(r() * 6));
  for (const v of vols) {
    const nx = Math.max(1, Math.round(v.s[0] / o.cell));
    const ny = Math.max(1, Math.round(v.s[1] / o.cell));
    const nz = Math.max(1, Math.round(v.s[2] / o.cell));
    const cx = v.s[0] / nx;
    const cy = v.s[1] / ny;
    const cz = v.s[2] / nz;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        for (let k = 0; k < nz; k++) {
          const ex = i === 0 ? -1 : i === nx - 1 ? 1 : 0;
          const ey = j === 0 ? -1 : j === ny - 1 ? 1 : 0;
          const ez = k === 0 ? -1 : k === nz - 1 ? 1 : 0;
          if (!ex && !ey && !ez) continue;
          const x = v.c[0] - v.s[0] / 2 + (i + 0.5) * cx;
          const y = v.c[1] - v.s[1] / 2 + (j + 0.5) * cy;
          const z = v.c[2] - v.s[2] / 2 + (k + 0.5) * cz;
          if (holes.some((h) => inside(h, x, y, z))) continue;
          // A cell is a cube a little smaller or bigger than itself, shoved out of the surface and sideways.
          const gap = 0.82 + r() * 0.2;
          let w = cx * (gap + (r() - 0.5) * 0.18);
          let h = cy * (gap + (r() - 0.5) * 0.18);
          let d = cz * (gap + (r() - 0.5) * 0.18);
          let px = x + (r() - 0.5) * cx * 0.12 + ex * r() * rough * cx;
          let py = y + (r() - 0.5) * cy * 0.12 + ey * r() * rough * cy;
          let pz = z + (r() - 0.5) * cz * 0.12 + ez * r() * rough * cz;
          // A few cells hold a thinner cube, and a few a long slab.
          const q = r();
          if (q < 0.12) {
            const ax = Math.floor(r() * 3);
            if (ax === 0) w *= 0.55;
            else if (ax === 1) h *= 0.55;
            else d *= 0.55;
          } else if (q < 0.2) {
            if (ey === 0) h *= 1.18;
            else w *= 1.15;
          }
          const shade = (0.72 + r() * 0.5) * tone * (ey > 0 ? 1.06 : ey < 0 ? 0.86 : 1);
          out.push([px, py, pz, w, h, d, shade, skin()]);
          // Rubble: a small cube sitting on the surface.
          if (r() < rubble) {
            const s2 = Math.min(cx, cy, cz) * (0.32 + r() * 0.3);
            px = x + ex * (cx * 0.55 + s2 * 0.3) + (r() - 0.5) * cx * 0.6;
            py = y + ey * (cy * 0.55 + s2 * 0.3) + (r() - 0.5) * cy * 0.6;
            pz = z + ez * (cz * 0.55 + s2 * 0.3) + (r() - 0.5) * cz * 0.6;
            out.push([px, py, pz, s2 * (0.9 + r() * 0.3), s2, s2 * (0.9 + r() * 0.3), (0.8 + r() * 0.45) * tone, skin()]);
          }
        }
  }
  return out;
}

/** A jagged pillar of stacked cubes, thinning towards the top (a spike of the crown, a horn on a shoulder). */
function spike(seed: number, x: number, y: number, z: number, height: number, width: number, lean: [number, number] = [0, 0]): Brick[] {
  const r = rng(seed);
  const out: Brick[] = [];
  const n = Math.max(2, Math.round(height / (width * 0.8)));
  let yy = y;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const s = width * (1 - t * 0.7) * (0.85 + r() * 0.3);
    out.push([x + lean[0] * t * height + (r() - 0.5) * width * 0.35, yy + s / 2, z + lean[1] * t * height + (r() - 0.5) * width * 0.35, s, s * (0.9 + r() * 0.3), s, 0.8 + r() * 0.45, r() < 0.12 ? 6 : Math.floor(r() * 6)]);
    yy += s * 0.82;
  }
  return out;
}

/**
 * The king, built at his full size (about nine blocks to the tip of his crown, flames above that): see `RIGS.hollow_king`.
 * Tall and narrow in the legs, hunched and very broad in the shoulders, with long arms whose fists hang at knee level, a little
 * forward and well outside the legs, so that legs, arms and fists each read on their own.
 */
export function hollowKingRig(): Part[] {
  const rig: Part[] = [];
  const add = (part: Part): number => rig.push(part) - 1;
  const cluster = (bricks: Brick[], at: [number, number, number], extra: Partial<Part> = {}): number =>
    add({ size: [0.1, 0.1, 0.1], at, skin: 'gol_rock_a', bricks, brickSkins: ROCK_SKINS, selfLit: 0.8, flat: true, ...extra });
  /** The box of lava inside a limb, a little smaller than the limb: it shines through the gaps between the cubes. */
  const core = (size: [number, number, number], at: [number, number, number], extra: Partial<Part> = {}): number => add({ size, at, skin: 'gol_lava', flat: true, glow: true, pulse: 0.12, ...extra });
  let seed = 100;
  const fire = (of: number, at: [number, number, number], w: number, h: number): void => {
    add({ size: [w, h, w], at, skin: 'gol_lava', flat: true, of, flame: rig.length * 0.37 });
  };

  // --- the legs: two thick stepped columns (a thigh, a knee that folds, a shin and a great foot with toes) with a gap between them.
  for (const s of [-1, 1]) {
    const thigh = cluster(
      [
        ...pack(seed++, [vol([0, -1.0, 0], [1.5, 2.0, 1.6])], { cell: 0.42, rubble: 0.12, hot: 0.16 }),
        // The knee cap and a step on the outer thigh.
        ...pack(seed++, [vol([0, -1.8, -0.7], [1.0, 0.5, 0.5]), vol([s * 0.82, -0.6, 0.1], [0.4, 0.8, 0.8])], { cell: 0.3, rough: 0.4, hot: 0.16 }),
      ],
      [s * 1.2, 4.2, 0.05],
      { hang: true, swing: s },
    );
    core([1.15, 2.0, 1.25], [0, -1.0, 0], { of: thigh });
    const shin = cluster(
      [
        ...pack(seed++, [vol([0, -0.8, 0], [1.4, 1.6, 1.5])], { cell: 0.4, rubble: 0.12, hot: 0.16 }),
        ...pack(seed++, [vol([0, -0.3, 0.7], [0.9, 0.7, 0.4]), vol([0, -0.35, -0.75], [0.8, 0.5, 0.3])], { cell: 0.28, rough: 0.4 }),
      ],
      [0, -2.0, 0],
      { hang: true, of: thigh, bend: 0.9 },
    );
    core([1.05, 1.6, 1.1], [0, -0.8, 0], { of: shin });
    const foot = cluster(
      [
        ...pack(seed++, [vol([0, -0.05, -0.1], [1.9, 0.56, 2.4]), vol([0, 0.5, 0.3], [1.5, 0.62, 1.4])], { cell: 0.4, rubble: 0.16, hot: 0.14 }),
        ...pack(seed++, [vol([-0.55, -0.1, -1.35], [0.55, 0.5, 0.55]), vol([0, -0.1, -1.45], [0.58, 0.5, 0.58]), vol([0.55, -0.1, -1.35], [0.55, 0.5, 0.55])], { cell: 0.28, rough: 0.3 }),
      ],
      [0, -1.85, -0.3],
      { of: shin },
    );
    core([1.6, 0.45, 1.9], [0, 0.05, -0.1], { of: foot });
    fire(foot, [-0.5, 0.45, -0.8], 1.0, 1.35);
    fire(foot, [0.45, 0.45, -0.3], 0.9, 1.15);
    fire(foot, [0, 0.9, 0.6], 0.8, 1.05);
    fire(shin, [0, 0.1, -0.85], 0.8, 1.0);
  }

  // --- the hips, with a belt of fire showing between the cubes.
  cluster(pack(seed++, [vol([0, 0, 0], [2.9, 1.0, 1.8])], { cell: 0.42, rubble: 0.12, hot: 0.2 }), [0, 4.3, 0.05]);
  core([2.5, 0.8, 1.5], [0, 4.3, 0.05]);

  // --- the torso: leaning well forward, a belly, a vast chest, and a hump on the back, with the heart in a hollow in the chest.
  const heart = vol([0, 0.4, -1.0], [1.3, 1.3, 0.62]);
  const torso = cluster(
    [
      ...pack(seed++, [vol([0, -0.95, 0.05], [2.3, 1.2, 1.7]), vol([0, 0.35, -0.1], [3.3, 1.9, 2.2]), vol([0, 1.0, 0.95], [2.7, 1.6, 1.4])], { cell: 0.45, rubble: 0.14, holes: [heart], hot: 0.2 }),
      // The frame of the hollow where the heart burns.
      ...pack(seed++, [vol([0, 0.4, -1.15], [1.75, 1.75, 0.3])], { cell: 0.3, rough: 0.6, holes: [vol([0, 0.4, -1.15], [1.2, 1.2, 0.5])], hot: 0.3 }),
    ],
    [0, 6.2, 0],
    { rotX: -0.3 },
  );
  core([2.8, 3.0, 1.8], [0, 0, 0], { of: torso });
  add({ size: [1.15, 1.15, 0.1], at: [0, 0.4, -0.94], skin: 'gol_core', flat: true, glow: true, pulse: 0.22, of: torso });
  // The back: flames along the spine.
  fire(torso, [0, 1.6, 1.0], 1.5, 1.9);
  fire(torso, [-0.95, 1.6, 0.75], 1.2, 1.4);
  fire(torso, [0.95, 1.6, 0.75], 1.2, 1.4);
  fire(torso, [0, 0.4, 1.5], 1.3, 1.5);
  // Round the chest.
  fire(torso, [-1.5, -0.9, -0.35], 1.0, 1.25);
  fire(torso, [1.5, -0.9, -0.35], 1.0, 1.25);
  fire(torso, [-0.8, -1.45, -0.75], 0.9, 1.05);
  fire(torso, [0.8, -1.45, -0.75], 0.9, 1.05);

  // --- the head: small, angular, brow-ridged, with burning eyes, on a neck above the shoulders, under a ring of jagged spikes.
  const eyeHoles = [vol([-0.34, 0.1, -0.6], [0.5, 0.3, 0.4]), vol([0.34, 0.1, -0.6], [0.5, 0.3, 0.4]), vol([0, -0.3, -0.62], [0.8, 0.2, 0.36])];
  const crown: Brick[] = [];
  const spikes: [number, number, number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * 0.56;
    const z = Math.sin(a) * 0.5;
    const h = 0.55 + hash(i, 5, 77) * 0.6 + (z < -0.1 ? 0.1 : 0);
    crown.push(...spike(300 + i, x, 0.5, z, h, 0.3, [x * 0.35, z * 0.35]));
    spikes.push([x, z, h, a]);
  }
  const head = cluster(
    [
      ...pack(seed++, [vol([0, 0, 0], [1.4, 1.1, 1.25]), vol([0, 0.4, -0.55], [1.5, 0.3, 0.4]), vol([0, -0.55, -0.1], [1.0, 0.35, 0.9])], { cell: 0.32, rubble: 0.1, rough: 0.2, holes: eyeHoles, hot: 0.1 }),
      ...pack(seed++, [vol([-0.85, 0.15, 0.1], [0.4, 0.5, 0.5]), vol([0.85, 0.15, 0.1], [0.4, 0.5, 0.5])], { cell: 0.26, rough: 0.4 }),
      // The neck.
      ...pack(seed++, [vol([0, -0.95, 0.35], [1.0, 0.7, 0.9])], { cell: 0.3, rough: 0.2, hot: 0.2 }),
      ...crown,
    ],
    [0, 2.3, -1.25],
    { of: torso, isHead: true },
  );
  core([1.0, 0.9, 0.9], [0, 0, 0], { of: head });
  for (const s of [-1, 1]) add({ size: [0.46, 0.24, 0.06], at: [s * 0.34, 0.1, -0.62], skin: 'gol_eye', flat: true, glow: true, pulse: 0.15, of: head });
  add({ size: [0.7, 0.1, 0.06], at: [0, -0.3, -0.64], skin: 'gol_mouth', flat: true, glow: true, of: head });
  for (const [x, z, h] of spikes.filter((_, i) => i % 3 === 0)) fire(head, [x, 0.5 + h * 0.85, z], 0.8 + h * 0.3, 0.95 + h * 0.7);

  // --- the arms: a mountain of a shoulder, a long thick upper arm, an elbow, a forearm and a fist much bigger than his head,
  // hanging at knee level a little forward and out beyond the legs.
  for (const s of [-1, 1]) {
    const pauldron = cluster(
      [
        ...pack(seed++, [vol([0, 0, 0], [2.4, 1.6, 2.4])], { cell: 0.42, rubble: 0.22, rough: 0.3, hot: 0.14 }),
        ...spike(400 + s, s * 0.3, 0.7, 0.2, 0.7, 0.34, [s * 0.3, 0]),
        ...spike(410 + s, s * 0.8, 0.6, -0.5, 0.55, 0.3, [s * 0.3, 0]),
        ...spike(420 + s, s * 0.7, 0.6, 0.6, 0.5, 0.3, [s * 0.3, 0.2]),
      ],
      [s * 2.45, 0.6, 0.05],
      { of: torso },
    );
    core([1.9, 1.2, 1.9], [0, 0, 0], { of: pauldron });
    fire(pauldron, [s * 0.3, 0.9, 0.1], 1.2, 1.5);
    fire(pauldron, [s * 0.85, 0.8, -0.55], 0.9, 1.2);
    const upper = cluster(
      [
        ...pack(seed++, [vol([0, -1.15, 0], [1.6, 2.3, 1.6])], { cell: 0.42, rubble: 0.14, hot: 0.16 }),
        ...pack(seed++, [vol([s * 0.85, -0.6, -0.1], [0.45, 0.8, 0.7])], { cell: 0.28, rough: 0.4 }),
      ],
      [s * 2.65, 0.3, 0.05],
      { hang: true, of: torso, swing: s * 0.45, rotX: 0.42, rotZ: s * 0.27, strike: 1, raise: 1.9 },
    );
    core([1.2, 2.3, 1.2], [0, -1.15, 0], { of: upper });
    const fore = cluster(
      [
        ...pack(seed++, [vol([0, -0.95, 0], [1.4, 1.9, 1.4])], { cell: 0.4, rubble: 0.14, hot: 0.2 }),
        ...pack(seed++, [vol([s * 0.8, -0.5, -0.2], [0.5, 0.6, 0.7]), vol([0, -0.1, 0.8], [0.8, 0.5, 0.35])], { cell: 0.28, rough: 0.4, hot: 0.2 }),
      ],
      [0, -2.3, 0],
      { hang: true, of: upper, rotX: 0.55, rotZ: -s * 0.05 },
    );
    core([1.05, 1.9, 1.05], [0, -0.95, 0], { of: fore });
    // The fist: a boulder of cubes with four knuckles in front, a thumb on the inside and fire between the fingers.
    const fist = cluster(
      [
        ...pack(seed++, [vol([0, 0, 0], [2.5, 2.2, 2.4])], { cell: 0.55, rubble: 0.2, rough: 0.3, hot: 0.14 }),
        ...pack(seed++, [vol([-0.85, -0.6, -1.3], [0.55, 0.7, 0.6]), vol([-0.28, -0.6, -1.4], [0.58, 0.74, 0.6]), vol([0.28, -0.6, -1.4], [0.58, 0.74, 0.6]), vol([0.85, -0.6, -1.3], [0.55, 0.7, 0.6])], { cell: 0.3, rough: 0.2, hot: 0.12 }),
        ...pack(seed++, [vol([-s * 1.25, 0.1, -0.55], [0.55, 0.6, 1.1])], { cell: 0.3, rough: 0.3 }),
        ...pack(seed++, [vol([0, 1.0, -0.1], [2.1, 0.5, 2.1]), vol([s * 0.9, 0.3, 1.1], [0.7, 0.6, 0.5])], { cell: 0.38, rough: 0.45, rubble: 0.28, hot: 0.2 }),
      ],
      [0, -2.7, -0.1],
      { of: fore },
    );
    core([2.1, 1.9, 2.0], [0, 0, 0], { of: fist });
    fire(fist, [s * 0.5, 1.1, 0.1], 1.4, 1.8);
    fire(fist, [-s * 0.5, 1.05, -0.5], 1.05, 1.4);
    fire(fist, [0, 0.9, 0.9], 1.0, 1.2);
  }
  return rig;
}
