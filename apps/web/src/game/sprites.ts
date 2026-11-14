import { ARMOR_MATERIALS, ARMOR_SLOTS, OUTFIT_CLASSES, BED_RED, COMPASS_FRAMES, DYE_NAMES, DYE_RGB, TILE_PX, TOOL_KINDS, TOOL_MATERIALS, type ArmorMaterial, type ArmorSlot, type OutfitClass, type ToolKind, type ToolMaterial } from '@solrift/shared';

/**
 * Procedural item sprites (16x16). Each sprite is rasterised once into an RGBA
 * grid, then given an automatic dark outline. All art is original.
 */

type RGB = [number, number, number];
type Cell = RGB | null;
export type SpritePixel = [number, number, number, number];

const N = TILE_PX;
const STICK: RGB = [140, 104, 58];
const OUTLINE: RGB = [24, 20, 28];

const MATERIAL_COLOR: Record<ToolMaterial, RGB> = {
  wood: [160, 120, 66],
  stone: [136, 136, 140],
  iron: [214, 218, 224],
  gold: [250, 214, 52],
  diamond: [70, 228, 214],
};

const shade = (c: RGB, d: number): RGB => [c[0] + d, c[1] + d, c[2] + d];

/**
 * 16x16 ASCII templates. h = head (material), s = handle, g = guard.
 * Short rows are padded with transparent pixels.
 */
const TOOL_ART: Record<ToolKind, string[]> = {
  pickaxe: [
    '',
    '',
    '.....hhhhh',
    '....hhhhhhhh',
    '...hhh....shh',
    '...hh....ss.hh',
    '..hh....ss...h',
    '..h....ss',
    '......ss',
    '.....ss',
    '....ss',
    '...ss',
    '..ss',
    '.ss',
  ],
  axe: [
    '',
    '.....hhh',
    '....hhhhh',
    '....hhhhhs',
    '....hhhhss',
    '.....hhss',
    '......ss',
    '.....ss',
    '....ss',
    '...ss',
    '..ss',
    '.ss',
    'ss',
  ],
  shovel: [
    '..........hhh',
    '.........hhhhh',
    '.........hhhhh',
    '.........hhhhh',
    '..........hhh',
    '.........ss',
    '........ss',
    '.......ss',
    '......ss',
    '.....ss',
    '....ss',
    '...ss',
    '..ss',
    '.ss',
  ],
  sword: [
    '..............hh',
    '.............hhh',
    '............hhh',
    '...........hhh',
    '..........hhh',
    '.........hhh',
    '........hhh',
    '.......hhh',
    '..g...hhh',
    '...g.hhh',
    '....ggg',
    '...ssgg',
    '..ss..g',
    '.ss',
    'ss',
  ],
  hoe: [
    '',
    '.........hhhh',
    '.......hhhhhhh',
    '......hh....hh',
    '.....ss.....h',
    '....ss',
    '...ss',
    '..ss',
    '.ss',
    'ss',
  ],
};

function blank(): Cell[] {
  return new Array<Cell>(N * N).fill(null);
}

function outline(grid: Cell[]): Cell[] {
  const out = grid.slice();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (grid[y * N + x]) continue;
      const nb = (dx: number, dy: number) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < N && ny < N && grid[ny * N + nx] !== null;
      };
      if (nb(1, 0) || nb(-1, 0) || nb(0, 1) || nb(0, -1)) out[y * N + x] = OUTLINE;
    }
  }
  return out;
}

/** Light on upper-left edges, dark on lower-right edges. */
function bevel(grid: Cell[]): Cell[] {
  const out = grid.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? null : grid[y * N + x]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = grid[y * N + x];
      if (!c) continue;
      if (!at(x - 1, y - 1) || !at(x, y - 1)) out[y * N + x] = shade(c, 28);
      else if (!at(x + 1, y + 1) || !at(x + 1, y)) out[y * N + x] = shade(c, -34);
    }
  }
  return out;
}

function toolGrid(kind: ToolKind, material: ToolMaterial): Cell[] {
  const grid = blank();
  const head = MATERIAL_COLOR[material];
  TOOL_ART[kind].forEach((row, y) => {
    for (let x = 0; x < N && x < row.length; x++) {
      const ch = row[x];
      if (ch === 'h') grid[y * N + x] = head;
      else if (ch === 's') grid[y * N + x] = STICK;
      else if (ch === 'g') grid[y * N + x] = shade(STICK, -18);
    }
  });
  return outline(bevel(grid));
}

function fillShape(grid: Cell[], inside: (x: number, y: number) => boolean, color: (x: number, y: number) => RGB): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inside(x, y)) grid[y * N + x] = color(x, y);
}

function hashPx(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function stickGrid(): Cell[] {
  const g = blank();
  for (let i = 0; i < 13; i++) {
    const x = 2 + i;
    const y = 13 - i;
    g[y * N + x] = STICK;
    g[y * N + x + 1] = shade(STICK, -22);
  }
  return outline(bevel(g));
}

function coalGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 8.5;
      return dx * dx + dy * dy <= 28 + Math.sin(x * 2.1 + y) * 4;
    },
    (x, y) => {
      const v = hashPx(x, y);
      const base = 44 + v * 18;
      return [base, base, base + 4];
    },
  );
  g[6 * N + 5] = [120, 120, 130];
  g[7 * N + 5] = [96, 96, 106];
  g[6 * N + 6] = [96, 96, 106];
  return outline(g);
}

function ingotGrid(color: RGB): Cell[] {
  const g = blank();
  // Slanted bar, wider at the front face.
  fillShape(
    g,
    (x, y) => y >= 5 && y <= 11 && x >= 2 + (11 - y) * 0.5 && x <= 12 + (11 - y) * 0.5 - 1,
    (x, y) => {
      if (y <= 6) return shade(color, 38);
      if (y >= 10) return shade(color, -40);
      return shade(color, hashPx(x, y) * 14 - 6);
    },
  );
  return outline(g);
}

/** A lump of ore: grey rock flecked with the metal's colour. */
function rawOreGrid(metal: RGB): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 8.5;
      return dx * dx + dy * dy <= 36 + Math.sin(x * 1.7 + y * 1.3) * 7;
    },
    (x, y) => {
      const v = hashPx(x, y);
      if (v > 0.52) return shade(metal, Math.floor(hashPx(x + 9, y + 4) * 40) - 24);
      const base = 118 + v * 40;
      return [base, base, base + 6];
    },
  );
  return outline(bevel(g));
}

function diamondGrid(): Cell[] {
  const g = blank();
  const c: RGB = [78, 228, 220];
  fillShape(
    g,
    (x, y) => {
      const dx = Math.abs(x - 7.5);
      const dy = y - 3;
      if (dy < 0 || dy > 10) return false;
      return dy <= 3 ? dx <= 2.5 + dy * 0.9 : dx <= 5.2 - (dy - 3) * 0.74;
    },
    (x, y) => {
      if (y <= 5 && x > 8) return shade(c, 30);
      if (y > 6 && x < 7) return shade(c, -34);
      if (y > 8) return shade(c, -52);
      return shade(c, hashPx(x, y) * 10 - 4);
    },
  );
  g[4 * N + 6] = [235, 255, 255];
  g[5 * N + 5] = [235, 255, 255];
  return outline(g);
}

function emeraldGrid(): Cell[] {
  const g = blank();
  const c: RGB = [32, 186, 84];
  // A cut stone, tall and eight-sided: pointed top and bottom, a lighter upper-left and a dark lower-right.
  fillShape(
    g,
    (x, y) => {
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      return dx <= 4.2 && dy <= 6 && dx + dy <= 9.2;
    },
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 7.5;
      if (Math.abs(dx) < 2.2 && Math.abs(dy) < 3.4) return shade(c, 34 - (dx + dy) * 3);
      if (dx + dy < -2) return shade(c, 22);
      if (dx + dy > 3) return shade(c, -46);
      return shade(c, hashPx(x, y) * 8 - 3);
    },
  );
  g[4 * N + 6] = [214, 255, 226];
  g[5 * N + 6] = [214, 255, 226];
  return outline(g);
}

function paperGrid(): Cell[] {
  const g = blank();
  // A sheet seen a little askew, with a few ruled lines and a curled corner.
  fillShape(
    g,
    (x, y) => x >= 3 && x <= 12 && y >= 2 && y <= 13 && !(x >= 11 && y <= 3),
    (x, y) => {
      if ((y === 5 || y === 7 || y === 9) && x >= 5 && x <= 10) return [150, 150, 160];
      if (x >= 10 && y <= 4 && x + (4 - y) >= 13) return [200, 200, 210];
      return shade([236, 236, 240], hashPx(x, y) * 8 - 6 - (x + y > 18 ? 12 : 0));
    },
  );
  return outline(g);
}

/** A map: a sheet of parchment with a brown border, a coast with blue water, green land, a trail and a red mark. */
function mapGrid(): Cell[] {
  const g = blank();
  const paper: RGB = [226, 206, 156];
  const border: RGB = [128, 86, 44];
  fillShape(
    g,
    (x, y) => x >= 1 && x <= 14 && y >= 1 && y <= 14,
    (x, y) => {
      if (x === 1 || x === 14 || y === 1 || y === 14) return shade(border, (x + y) % 2 ? -10 : 6);
      // A fold down the middle third and a shadow in the corner.
      if (x === 5 || x === 10) return shade(paper, -26);
      const coast = x + y * 0.6 < 9 + Math.sin(y * 0.9) * 1.4;
      if (coast) return shade([76, 124, 196], Math.floor(hashPx(x, y) * 14) - 7 + (x < 4 ? -10 : 0));
      const hill = ((x - 11) * (x - 11)) / 3 + ((y - 5) * (y - 5)) / 2 < 3;
      if (hill) return shade([84, 142, 70], Math.floor(hashPx(x, y) * 12) - 6);
      return shade(paper, Math.floor(hashPx(x, y) * 10) - 5 - (x + y > 24 ? 10 : 0));
    },
  );
  // A dotted trail to a red cross.
  for (const [x, y] of [[6, 12], [7, 12], [8, 11], [9, 11], [10, 10]] as const) g[y * N + x] = [120, 70, 40];
  for (const [x, y] of [[11, 8], [13, 8], [12, 9], [11, 10], [13, 10]] as const) g[y * N + x] = [196, 40, 36];
  return outline(g);
}

function bookGrid(cover: RGB, enchanted: boolean): Cell[] {
  const g = blank();
  // A closed book standing slightly tilted: a cover, a spine on the left and pages showing on the right edge.
  fillShape(
    g,
    (x, y) => x >= 3 && x <= 12 && y >= 1 && y <= 14,
    (x, y) => {
      if (x === 3 || x === 4) return shade(cover, -34);
      if (x >= 11) return [236, 226, 196];
      if (y === 1 || y === 14) return shade(cover, -24);
      if (enchanted && ((x === 7 && y >= 5 && y <= 9) || (y === 7 && x >= 5 && x <= 9))) return [236, 196, 255];
      if (!enchanted && x >= 6 && x <= 9 && y >= 4 && y <= 5) return [214, 178, 70];
      return shade(cover, hashPx(x, y) * 14 - 5 + (x + y < 12 ? 10 : 0));
    },
  );
  return outline(g);
}
/** The gold mark on a skill book's cover: a sword for the Warrior, a four-pointed star for the Mage, an arrow for the Ranger (6 x 8 pixels). */
const BOOK_EMBLEMS = {
  sword: ['..XX..', '..XX..', '..XX..', '..XX..', 'XXXXXX', '..XX..', '..XX..', '.XXXX.'],
  star: ['..XX..', '..XX..', '.XXXX.', 'XXXXXX', 'XXXXXX', '.XXXX.', '..XX..', '..XX..'],
  arrow: ['..XX..', '.XXXX.', 'XXXXXX', '..XX..', '..XX..', '..XX..', '.X..X.', 'X....X'],
} as const;

/** A skill book: a closed book in the class's colour, edged in gold, with the class's mark on the cover (so it is never taken for a plain or an enchanted book). */
function skillBookGrid(cover: RGB, emblem: keyof typeof BOOK_EMBLEMS): Cell[] {
  const g = blank();
  const gold: RGB = [240, 200, 78];
  fillShape(
    g,
    (x, y) => x >= 3 && x <= 12 && y >= 1 && y <= 14,
    (x, y) => {
      if (x === 3 || x === 4) return shade(cover, -34);
      if (x >= 11) return [236, 226, 196];
      if (y === 1 || y === 14) return shade(gold, y === 14 ? -44 : -14);
      return shade(cover, hashPx(x, y) * 14 - 5 + (x + y < 12 ? 10 : 0));
    },
  );
  // The mark sits in the middle of the cover (columns 5 to 10, rows 4 to 11), a little darker towards the bottom.
  BOOK_EMBLEMS[emblem].forEach((row, dy) => {
    [...row].forEach((c, dx) => {
      if (c === 'X') g[(4 + dy) * N + 5 + dx] = shade(gold, dy > 4 ? -18 : 0);
    });
  });
  return outline(g);
}

/** The cloth of each bag, smallest first: plain burlap, leather, then blue, green, purple and a dark violet for the rarest. */
const BAG_COLORS: readonly RGB[] = [
  [164, 134, 96],
  [140, 88, 46],
  [70, 112, 168],
  [64, 146, 80],
  [138, 66, 168],
  [52, 42, 92],
];

/**
 * A bag: a round sack tied at the neck with a gold band and a buckle. The bigger the bag the wider the sack, and from
 * the third on it has a pocket stitched on the front.
 */
function bagGrid(tier: number): Cell[] {
  const cover = BAG_COLORS[tier - 1];
  const gold: RGB = [240, 200, 78];
  const g = blank();
  const rx = 4.9 + tier * 0.18;
  fillShape(
    g,
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 9.4;
      return (dx * dx) / (rx * rx) + (dy * dy) / (5.2 * 5.2) <= 1;
    },
    (x, y) => shade(cover, Math.floor(hashPx(x, y) * 14) - 5 + (x + y < 14 ? 12 : 0) - (x >= 11 ? 16 : 0) - (y >= 13 ? 12 : 0)),
  );
  // The neck, gathered above the body, and the frill on top of it.
  fillShape(
    g,
    (x, y) => y >= 2 && y <= 5 && x >= 5 && x <= 10 && !(y === 2 && (x === 5 || x === 10)),
    (x, y) => shade(cover, y === 2 ? -26 : x >= 9 ? -22 : -6),
  );
  for (let x = 5; x <= 10; x++) g[5 * N + x] = shade(gold, x >= 9 ? -34 : 0);
  // The pocket, and the buckle on it.
  if (tier >= 3) {
    for (let x = 5; x <= 10; x++) {
      g[11 * N + x] = shade(cover, -34);
      g[12 * N + x] = shade(cover, x >= 9 ? -30 : -14);
    }
  }
  g[8 * N + 7] = gold;
  g[8 * N + 8] = shade(gold, -30);
  g[9 * N + 7] = shade(gold, -14);
  g[9 * N + 8] = shade(gold, -40);
  return outline(g);
}

/** The flame carved into the Emberstone (6 x 7 pixels): X is the ember, O its bright heart. */
const EMBER_FLAME = ['..XX..', '.XXX..', '.XXXX.', 'XXOOXX', 'XXOOXX', '.XOOX.', '..XX..'] as const;

/**
 * The Emberstone: a chunky hearth-stone, wider than tall, with a lumpy outline and chipped corners, a bevelled edge (light on the top left,
 * dark on the bottom right), a few cracks and a glowing flame in the middle.
 */
function emberstoneGrid(): Cell[] {
  const g = blank();
  const ember: RGB = [240, 124, 36];
  const heart: RGB = [255, 214, 92];
  const flame = new Set<string>();
  EMBER_FLAME.forEach((row, dy) => [...row].forEach((c, dx) => c !== '.' && flame.add(`${5 + dx},${4 + dy}`)));
  const CX = 7.5;
  const CY = 7.3;
  // How far out the edge is at each angle: a squarish oval whose outline wanders a little (never the same on two sides).
  const edge = (x: number, y: number): number => {
    const u = (x - CX) / 7.1;
    const v = (y - CY) / 5.7;
    const rho = (Math.abs(u) ** 3 + Math.abs(v) ** 3) ** (1 / 3);
    const a = Math.atan2(v, u);
    const wobble = 1 + 0.09 * Math.sin(3 * a + 1.1) + 0.06 * Math.sin(5 * a + 2.3) + 0.04 * Math.sin(9 * a);
    return rho / wobble;
  };
  // Pieces broken off two corners.
  const chipped = (x: number, y: number): boolean => (x >= 13 && y <= 3) || (x <= 2 && y >= 11) || (x >= 13 && y >= 11 && x + y >= 25);
  const cracks = new Set(['3,9', '4,10', '4,11', '11,10', '12,11', '10,3', '11,2', '11,4']);
  fillShape(
    g,
    (x, y) => edge(x, y) <= 1 && !chipped(x, y),
    (x, y) => {
      // The stone is lit from the top left; the rim is a bevel and the ember warms the pixels around the flame.
      const rim = edge(x, y) > 0.74;
      const lit = x - CX + (y - CY) < 0;
      let d = Math.floor(hashPx(x, y) * 18) - 8 + (x + y < 13 ? 10 : 0) - (x >= 11 ? 12 : 0) - (y >= 11 ? 12 : 0);
      if (rim) d += lit ? 26 : -30;
      if (cracks.has(`${x},${y}`)) d -= 44;
      let c = shade([112, 116, 128], d);
      let near = false;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) if (flame.has(`${x + ox},${y + oy}`)) near = true;
      if (near) c = [Math.min(255, c[0] + 54), c[1] + 6, Math.max(0, c[2] - 30)] as RGB;
      return c;
    },
  );
  EMBER_FLAME.forEach((row, dy) => {
    [...row].forEach((c, dx) => {
      if (c !== '.') g[(4 + dy) * N + 5 + dx] = c === 'O' ? heart : shade(ember, dy > 4 ? -22 : 0);
    });
  });
  return outline(g);
}

/**
 * The compass: a round brass case with a pale face and a ring on top to hang it by. One of `COMPASS_FRAMES` pictures: the
 * needle (red tip, dark tail) is turned `frame` steps clockwise from straight up, so a hand holding it shows which way the
 * linked block lies compared with where you look.
 */
function compassGrid(frame: number): Cell[] {
  const g = blank();
  const brass: RGB = [214, 170, 66];
  const face: RGB = [236, 230, 208];
  fillShape(
    g,
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 9;
      return dx * dx + dy * dy <= 6.4 * 6.4;
    },
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 9;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 5) return shade(brass, (x + y < 15 ? 16 : -22) + Math.floor(hashPx(x, y) * 8) - 4);
      return shade(face, Math.floor(hashPx(x, y) * 8) - 4 - (x + y > 18 ? 10 : 0));
    },
  );
  // The ring on top.
  for (const [x, y] of [[7, 1], [8, 1], [6, 2], [9, 2]]) g[y * N + x] = shade(brass, y === 1 ? 10 : -14);
  // A mark at the top of the rim: that is straight ahead of whoever holds it.
  g[4 * N + 7] = [74, 50, 24];
  g[4 * N + 8] = [74, 50, 24];
  // The needle, a long thin diamond around the pivot.
  const a = (frame / COMPASS_FRAMES) * Math.PI * 2;
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const TIP = 4.9;
  const TAIL = 3.6;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5;
      const dy = y - 9;
      const t = dx * ux + dy * uy;
      const w = Math.abs(-dx * uy + dy * ux);
      const half = t >= 0 ? 1.15 * (1 - t / TIP) + 0.2 : 1.05 * (1 + t / TAIL) + 0.2;
      if (t > TIP || t < -TAIL || w > half) continue;
      g[y * N + x] = t >= 0 ? (w < 0.5 && t > 1 ? [236, 70, 60] : [196, 36, 34]) : w < 0.5 && t < -1 ? [92, 88, 100] : [54, 50, 60];
    }
  }
  // The pivot.
  g[9 * N + 7] = [252, 244, 214];
  g[9 * N + 8] = [214, 196, 150];
  return outline(g);
}

/**
 * The three jewels: Dawn is a round golden brilliant, the Rift a violet kite-cut stone with a dark heart and a cold glow in
 * it, Bloom a rose-pink teardrop with a green leaf. All are lit from the top left, with a glint.
 */
function jewelGrid(kind: 'dawn' | 'rift' | 'bloom'): Cell[] {
  const g = blank();
  const base: RGB = kind === 'dawn' ? [252, 196, 52] : kind === 'rift' ? [132, 76, 224] : [238, 74, 136];
  fillShape(
    g,
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 8;
      if (kind === 'dawn') return dx * dx + dy * dy <= 31;
      if (kind === 'rift') return Math.abs(dx) / 5.2 + Math.abs(dy) / 7 <= 1;
      const top = y - 6.5;
      return dx * dx + top * top <= 21.2 || (top >= 0 && y <= 13.5 && Math.abs(dx) <= (4.6 * (13.5 - y)) / 7);
    },
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 8;
      if (dx * dx + dy * dy < 7) return shade(base, 38 - Math.round((dx + dy) * 3));
      if (dx + dy < -2) return shade(base, 30);
      if (dx + dy > 3) return shade(base, -46);
      return shade(base, Math.floor(hashPx(x, y) * 12) - 5);
    },
  );
  const glint: RGB = [255, 250, 232];
  g[5 * N + 5] = glint;
  g[5 * N + 6] = glint;
  g[6 * N + 5] = glint;
  if (kind === 'rift') {
    // A dark heart with a cold light round it.
    for (const [x, y] of [[7, 8], [8, 8], [7, 9], [8, 9]]) g[y * N + x] = [34, 16, 78];
    for (const [x, y] of [[6, 8], [9, 9], [7, 7], [8, 10]]) g[y * N + x] = [124, 232, 255];
  }
  if (kind === 'bloom') {
    for (const [x, y] of [[9, 1], [10, 1], [10, 2], [11, 2]]) g[y * N + x] = [74, 172, 62];
    g[2 * N + 9] = [50, 138, 48];
  }
  return outline(g);
}

function appleGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 9.2;
      return dx * dx + dy * dy <= 22 - (x === 7 || x === 8 ? 0 : 0);
    },
    (x, y) => {
      if (x >= 4 && x <= 6 && y >= 6 && y <= 8) return [244, 92, 84];
      if (x >= 9 && y >= 10) return [150, 22, 28];
      return [204, 36, 40];
    },
  );
  g[5 * N + 8] = STICK;
  g[4 * N + 8] = STICK;
  g[4 * N + 9] = [74, 170, 60];
  g[5 * N + 10] = [74, 170, 60];
  g[4 * N + 10] = [54, 140, 48];
  return outline(g);
}

function meatGrid(cooked: boolean): Cell[] {
  const g = blank();
  const base: RGB = cooked ? [150, 84, 46] : [226, 120, 128];
  const fat: RGB = cooked ? [196, 130, 82] : [248, 190, 192];
  fillShape(
    g,
    (x, y) => {
      const dx = (x - 7.5) / 6.4;
      const dy = (y - 8.5) / 4.8;
      return dx * dx + dy * dy <= 1;
    },
    (x, y) => {
      if ((x + y * 2) % 7 === 0) return fat;
      if (y >= 11) return shade(base, -30);
      return shade(base, hashPx(x, y) * 20 - 10);
    },
  );
  // Bone knob on the upper right.
  for (const [x, y] of [
    [12, 4],
    [13, 3],
    [13, 4],
    [12, 3],
  ]) {
    g[y * N + x] = [240, 236, 224];
  }
  g[5 * N + 11] = [230, 226, 214];
  return outline(g);
}

function dot(g: Cell[], x: number, y: number, c: RGB): void {
  if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = c;
}

/** Diagonal line from (x0,y0) to (x1,y1), `w` pixels thick. */
function line(g: Cell[], x0: number, y0: number, x1: number, y1: number, c: RGB, w = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let k = 0; k < w; k++) dot(g, x + k, y, c);
  }
}

function boneGrid(): Cell[] {
  const g = blank();
  const bone: RGB = [236, 232, 218];
  line(g, 4, 12, 11, 5, bone, 2);
  for (const [x, y] of [
    [2, 12],
    [3, 13],
    [3, 11],
    [4, 14],
    [11, 3],
    [12, 4],
    [12, 2],
    [13, 3],
  ]) {
    dot(g, x, y, bone);
  }
  dot(g, 3, 12, bone);
  dot(g, 12, 3, bone);
  return outline(bevel(g));
}

function arrowGrid(): Cell[] {
  const g = blank();
  line(g, 3, 12, 11, 4, STICK, 1);
  line(g, 4, 12, 11, 5, shade(STICK, -24), 1);
  // stone head
  for (const [x, y] of [
    [12, 3],
    [13, 2],
    [12, 2],
    [13, 3],
    [11, 3],
    [12, 4],
    [14, 1],
  ]) {
    dot(g, x, y, [170, 170, 176]);
  }
  // feathers
  for (const [x, y] of [
    [2, 11],
    [1, 12],
    [2, 13],
    [3, 14],
    [3, 10],
    [4, 11],
    [4, 13],
  ]) {
    dot(g, x, y, [236, 236, 240]);
  }
  return outline(g);
}

function powderGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => y >= 5 && y <= 12 && Math.abs(x - 7.5) <= 2 + (y - 5) * 0.75 + Math.sin(x * 3) * 0.6,
    (x, y) => {
      const v = hashPx(x, y);
      const base = 108 + v * 60;
      return v > 0.82 ? [60, 60, 66] : [base, base, base + 6];
    },
  );
  return outline(g);
}

function fleshGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => {
      const dx = (x - 7.5) / 6;
      const dy = (y - 8.5) / 4.6;
      return dx * dx + dy * dy <= 1 + Math.sin(x * 2 + y) * 0.12;
    },
    (x, y) => {
      const v = hashPx(x, y);
      if (v > 0.8) return [96, 128, 56];
      if (y >= 11) return [92, 66, 50];
      return [138 + v * 24, 96 + v * 20, 72];
    },
  );
  return outline(g);
}

// ---- plants and torches (world tiles: no outline) --------------------------

/** One grass-blade-like column rising from the bottom edge. */
function blade(g: Cell[], x: number, h: number, c: RGB, lean = 0): void {
  for (let i = 0; i < h; i++) {
    const t = i / Math.max(1, h - 1);
    dot(g, x + Math.round(lean * t), N - 1 - i, i > h - 3 ? shade(c, 18) : shade(c, -((h - i) % 3) * 6));
  }
}

function tallGrassGrid(): Cell[] {
  const g = blank();
  const green: RGB = [86, 156, 48];
  const spec: [number, number, number][] = [
    [2, 9, -1],
    [4, 12, 1],
    [6, 7, 0],
    [7, 13, -1],
    [9, 10, 1],
    [11, 14, 0],
    [12, 8, -1],
    [13, 11, 1],
  ];
  for (const [x, h, lean] of spec) blade(g, x, h, green, lean);
  return g;
}

function deadBushGrid(): Cell[] {
  const g = blank();
  const wood: RGB = [120, 88, 52];
  // A knot of dry twigs fanning up from one root.
  for (let y = 11; y < N; y++) dot(g, 7, y, shade(wood, y % 2 ? -10 : 0));
  line(g, 7, 11, 3, 5, wood, 1);
  line(g, 7, 11, 11, 4, shade(wood, -8), 1);
  line(g, 7, 12, 2, 9, shade(wood, 6), 1);
  line(g, 7, 12, 13, 9, wood, 1);
  line(g, 5, 8, 4, 4, shade(wood, -12), 1);
  line(g, 9, 8, 9, 3, shade(wood, 4), 1);
  return g;
}

function flowerGrid(petal: RGB, centre: RGB): Cell[] {
  const g = blank();
  const stem: RGB = [64, 128, 40];
  for (let y = 7; y < N; y++) dot(g, 7, y, shade(stem, y % 2 ? -10 : 0));
  dot(g, 6, 11, stem);
  dot(g, 5, 10, stem);
  dot(g, 9, 12, stem);
  dot(g, 10, 11, stem);
  for (const [x, y] of [
    [6, 3],
    [7, 3],
    [8, 3],
    [5, 4],
    [6, 4],
    [8, 4],
    [9, 4],
    [6, 5],
    [7, 5],
    [8, 5],
    [7, 2],
    [7, 6],
  ]) {
    dot(g, x, y, petal);
  }
  dot(g, 7, 4, centre);
  return g;
}

function torchGrid(tip: RGB = [255, 168, 40], top: RGB = [255, 236, 130], glow: RGB | null = [255, 150, 40]): Cell[] {
  const g = blank();
  // Stem lives in columns 7-8, rows 6-15: the in-world mesh samples exactly that window.
  for (let y = 8; y < N; y++) {
    dot(g, 7, y, y % 3 === 0 ? [112, 80, 44] : [140, 104, 58]);
    dot(g, 8, y, y % 3 === 0 ? [92, 64, 36] : [118, 86, 48]);
  }
  for (const x of [7, 8]) {
    dot(g, x, 6, top);
    dot(g, x, 7, tip);
  }
  // Glow, visible only in inventory icons.
  for (const [x, y] of [
    [6, 6],
    [9, 6],
    [6, 7],
    [9, 7],
    [7, 5],
    [8, 5],
  ]) {
    if (glow) g[y * N + x] = glow;
  }
  return g;
}

/** A pile of red dust. */
function redstoneGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => y >= 6 && y <= 13 && Math.abs(x - 7.5) <= 2.5 + (y - 6) * 0.65 + Math.sin(x * 3) * 0.6,
    (x, y) => {
      const v = hashPx(x, y);
      return v > 0.8 ? [120, 12, 8] : v > 0.35 ? [200 + v * 40, 24, 16] : [164, 14, 10];
    },
  );
  return outline(g);
}

function wheatGrid(stage: number): Cell[] {
  const g = blank();
  const heights = [3, 6, 10, 14];
  const h = heights[stage];
  const green: RGB = stage === 2 ? [150, 170, 54] : [88, 160, 52];
  const gold: RGB = [214, 176, 70];
  for (let x = 1; x < N; x += 3) {
    const hh = h - ((x * 5) % 3);
    blade(g, x, hh, stage === 3 ? [176, 150, 62] : green, x % 2 ? 0 : 1);
    if (stage === 3) {
      for (let k = 0; k < 4; k++) dot(g, x + (k % 2), N - 1 - hh - 1 + k, gold);
    }
  }
  return g;
}

function seedsGrid(): Cell[] {
  const g = blank();
  for (const [x, y] of [
    [5, 9],
    [6, 8],
    [8, 9],
    [9, 8],
    [7, 11],
    [10, 11],
    [4, 11],
    [8, 6],
  ]) {
    dot(g, x, y, [86, 140, 52]);
    dot(g, x + 1, y, [60, 106, 38]);
  }
  return outline(g);
}

function wheatItemGrid(): Cell[] {
  const g = blank();
  for (const x of [5, 8, 11]) {
    line(g, x - 2, 14, x + 1, 4, [190, 160, 70], 1);
    for (let k = 0; k < 4; k++) {
      dot(g, x + 1 + (k % 2), 3 + k, [226, 188, 76]);
      dot(g, x - (k % 2), 4 + k, [208, 170, 64]);
    }
  }
  line(g, 3, 12, 12, 11, [150, 110, 60], 1);
  return outline(g);
}

function breadGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => {
      const dx = (x - 7.5) / 6.5;
      const dy = (y - 9) / 3.6;
      return dx * dx + dy * dy <= 1;
    },
    (x, y) => {
      const v = hashPx(x, y);
      if (y <= 7) return [196 + v * 20, 140 + v * 14, 64];
      return [168 + v * 16, 112 + v * 12, 52];
    },
  );
  for (const x of [5, 8, 11]) dot(g, x, 8, [222, 176, 98]);
  return outline(g);
}

function saplingGrid(leaf: RGB = [60, 130, 40], stem: RGB = [96, 70, 40]): Cell[] {
  const g = blank();
  for (let y = 9; y < N; y++) dot(g, 7, y, shade(stem, y % 2 ? -8 : 0));
  const leaves: [number, number][] = [
    [7, 3], [6, 4], [7, 4], [8, 4], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [6, 6], [7, 6], [8, 6],
    [4, 7], [5, 7], [6, 7], [8, 7], [9, 7], [10, 7], [5, 8], [9, 8], [7, 8],
  ];
  for (const [x, y] of leaves) dot(g, x, y, shade(leaf, ((x * 3 + y * 5) % 4) * 8 - 8));
  return g;
}

// ---- the plants of the new biomes -------------------------------------------------------------------

/** A feathery frond: a stalk from (x0, y0) leaning by (dx, dy) per step, with a pair of leaflets on every other step. */
function frond(g: Cell[], x0: number, y0: number, dx: number, dy: number, steps: number, c: RGB, spread: number): void {
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + dx * i);
    const y = Math.round(y0 + dy * i);
    dot(g, x, y, shade(c, i % 2 ? -8 : 4));
    if (i >= 2 && i % 2 === 0) {
      const len = Math.max(1, Math.round(spread * (1 - i / (steps + 3))));
      for (let k = 1; k <= len; k++) {
        dot(g, x - k, y - (k > 1 ? 1 : 0), shade(c, k === len ? 14 : -4));
        dot(g, x + k, y - (k > 1 ? 1 : 0), shade(c, k === len ? 10 : -10));
      }
    }
  }
}

function fernGrid(): Cell[] {
  const g = blank();
  const green: RGB = [84, 150, 50];
  frond(g, 7, 15, 0, -1, 11, green, 3);
  frond(g, 7, 15, -0.45, -0.8, 9, shade(green, -6), 2);
  frond(g, 7, 15, 0.45, -0.8, 9, shade(green, -4), 2);
  return g;
}

function tulipGrid(petal: RGB): Cell[] {
  const g = blank();
  const stem: RGB = [64, 128, 40];
  for (let y = 8; y < N; y++) dot(g, 7, y, shade(stem, y % 2 ? -10 : 0));
  for (const [x, y] of [[6, 12], [5, 11], [4, 11], [8, 13], [9, 12], [10, 12]] as [number, number][]) dot(g, x, y, shade(stem, 6));
  // A closed cup with three points.
  for (const [x, y] of [[6, 3], [8, 3], [7, 4], [6, 4], [8, 4], [6, 5], [7, 5], [8, 5], [6, 6], [7, 6], [8, 6], [7, 7]] as [number, number][]) {
    dot(g, x, y, x === 6 ? shade(petal, 22) : x === 8 ? shade(petal, -26) : petal);
  }
  dot(g, 7, 3, shade(petal, 34));
  return g;
}

/** A flat-faced flower: a ring of petals round a centre, on a stem with two leaves. */
function ringFlowerGrid(petal: RGB, centre: RGB, reach: number): Cell[] {
  const g = blank();
  const stem: RGB = [64, 128, 40];
  for (let y = 7; y < N; y++) dot(g, 7, y, shade(stem, y % 2 ? -10 : 0));
  for (const [x, y] of [[6, 11], [5, 10], [9, 12], [10, 11]] as [number, number][]) dot(g, x, y, stem);
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const r = a % 2 === 0 ? reach : reach - 0.4;
    dot(g, Math.round(7 + Math.cos(ang) * r), Math.round(4 + Math.sin(ang) * r), a < 4 ? shade(petal, 6) : shade(petal, -16));
  }
  dot(g, 7, 4, centre);
  dot(g, 8, 4, shade(centre, -20));
  return g;
}

function alliumGrid(): Cell[] {
  const g = blank();
  const stem: RGB = [72, 132, 50];
  for (let y = 6; y < N; y++) dot(g, 7, y, shade(stem, y % 2 ? -10 : 0));
  for (const [x, y] of [[6, 13], [5, 12], [4, 11], [8, 14], [9, 13], [10, 12]] as [number, number][]) dot(g, x, y, shade(stem, 8));
  // A round head of tiny florets.
  for (let y = 0; y <= 6; y++) {
    for (let x = 3; x <= 11; x++) {
      const d = Math.hypot(x - 7, y - 3);
      if (d > 3.4) continue;
      const fl = hashPx(x, y);
      const base: RGB = fl > 0.66 ? [214, 150, 244] : fl > 0.33 ? [178, 100, 226] : [148, 76, 200];
      dot(g, x, y, d > 2.6 ? shade(base, -22) : x + y < 9 ? shade(base, 14) : base);
    }
  }
  return g;
}

function bluetGrid(): Cell[] {
  const g = blank();
  const stem: RGB = [68, 130, 46];
  for (const [x, top] of [[4, 9], [8, 7], [11, 10]] as [number, number][]) {
    for (let y = top; y < N; y++) dot(g, x, y, shade(stem, y % 2 ? -10 : 0));
    // Four pale petals round a gold eye.
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) dot(g, x + ox, top - 1 + oy, [226, 236, 252]);
    dot(g, x, top - 1, [250, 214, 70]);
  }
  for (const [x, y] of [[6, 13], [9, 14], [2, 13]] as [number, number][]) dot(g, x, y, shade(stem, 6));
  return g;
}

function mushroomGrid(cap: RGB, spots: RGB | null): Cell[] {
  const g = blank();
  const stalk: RGB = [214, 198, 170];
  const mush = (cx: number, top: number, w: number): void => {
    for (let y = top + 2; y < N; y++) for (let x = cx; x <= cx + 1; x++) dot(g, x, y, x === cx ? stalk : shade(stalk, -22));
    for (let row = 0; row < 3; row++) {
      const half = w - (row === 0 ? 2 : row === 2 ? 0 : 1);
      for (let x = cx - half + 1; x <= cx + half; x++) dot(g, x, top + row, row === 0 ? shade(cap, 16) : row === 2 ? shade(cap, -24) : cap);
    }
    if (spots) {
      dot(g, cx - 1, top + 1, spots);
      dot(g, cx + 1, top, spots);
      if (w > 3) dot(g, cx + 2, top + 1, spots);
    }
  };
  mush(6, 8, 4);
  mush(11, 11, 2);
  return g;
}

function sugarCaneGrid(): Cell[] {
  const g = blank();
  const base: RGB = [140, 198, 92];
  for (const x0 of [2, 7, 12]) {
    for (let y = 0; y < N; y++) {
      const node = y % 5 === 4;
      dot(g, x0, y, node ? [84, 140, 56] : shade(base, 10));
      dot(g, x0 + 1, y, node ? [66, 118, 46] : shade(base, -22));
    }
  }
  // Leaves slanting off the nodes.
  for (const [x, y, d] of [[3, 3, 1], [8, 8, 1], [13, 13, -1], [1, 8, -1], [6, 13, -1], [11, 3, -1]] as [number, number, number][]) {
    dot(g, x + d, y, [112, 176, 70]);
    dot(g, x + d * 2, y - 1, [124, 188, 80]);
  }
  return g;
}

/** A round pad seen from above, with a notch cut out of it. */
function lilyPadGrid(): Cell[] {
  const g = blank();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      if (d > 6.9 || (d > 1.2 && Math.abs(ang - 0.5) < 0.2)) continue;
      const vein = Math.abs(((ang + Math.PI) / (Math.PI * 2)) * 10 - Math.round(((ang + Math.PI) / (Math.PI * 2)) * 10)) < 0.08 && d > 1.5;
      const c: RGB = d > 6 ? [26, 92, 36] : vein ? [74, 156, 62] : [34 + hashPx(x, y) * 14, 116 + hashPx(y, x) * 14, 44];
      dot(g, x, y, c);
    }
  }
  return g;
}

/** A few petals scattered on the ground. */
function petalsGrid(): Cell[] {
  const g = blank();
  const spots: [number, number][] = [[3, 3], [10, 2], [5, 9], [11, 10], [8, 13]];
  spots.forEach(([x, y], i) => {
    const a: RGB = [248, 176, 214];
    const b: RGB = [232, 140, 192];
    dot(g, x, y, a);
    dot(g, x + 1, y, b);
    dot(g, x, y + 1, i % 2 ? a : b);
    dot(g, x + 1, y + 1, shade(a, -18));
    dot(g, x + (i % 2 ? -1 : 2), y + 1, [236, 200, 224]);
  });
  for (const [x, y] of [[6, 5], [9, 7], [4, 12]] as [number, number][]) dot(g, x, y, [76, 140, 56]);
  return g;
}
// ---- the plants and crystals of the caves ---------------------------------------------------------------

/** Vines hanging from the top edge, three strands that waver, each with pairs of leaves; the berry kind carries glowing fruit. */
function caveVinesGrid(berries: boolean): Cell[] {
  const g = blank();
  const leaf: RGB = [70, 120, 46];
  const strands: [number, number, number][] = [[3, 13, 1], [7, 16, -1], [12, 11, 1]];
  for (const [x0, len, sway] of strands) {
    for (let y = 0; y < len; y++) {
      const x = x0 + (Math.floor(y / 3) % 2 === 0 ? 0 : sway);
      dot(g, x, y, shade(leaf, y % 2 ? -12 : 4));
      if (y % 4 === 2) {
        dot(g, x - 1, y, shade(leaf, 14));
        dot(g, x + 1, y + 1, shade(leaf, 22));
      }
    }
    dot(g, x0, len, shade(leaf, 26));
  }
  if (berries) {
    const fruit: [number, number][] = [[3, 6], [7, 4], [7, 11], [12, 7], [3, 11]];
    for (const [bx, by] of fruit) {
      dot(g, bx, by, [250, 176, 44]);
      dot(g, bx + 1, by, [232, 132, 28]);
      dot(g, bx, by + 1, [226, 120, 24]);
      dot(g, bx + 1, by + 1, [200, 96, 20]);
      dot(g, bx, by, [255, 228, 120]);
    }
  }
  return g;
}

/** A small bush of dark leaves on a short trunk, studded with pink flowers. */
function azaleaGrid(): Cell[] {
  const g = blank();
  for (let y = 11; y < N; y++) dot(g, 7, y, shade([104, 78, 48], y % 2 ? -10 : 0));
  dot(g, 8, 13, [88, 64, 40]);
  for (let y = 1; y <= 12; y++) {
    for (let x = 1; x <= 14; x++) {
      const d = Math.hypot((x - 7.5) / 6.6, (y - 7) / 5.8);
      if (d > 1 || hashPx(x, y) < 0.08 + d * 0.22) continue;
      const base: RGB = hashPx(y, x) > 0.5 ? [58, 112, 44] : [74, 132, 52];
      dot(g, x, y, d > 0.8 ? shade(base, -22) : y < 5 ? shade(base, 12) : base);
    }
  }
  for (const [x, y] of [[4, 5], [9, 3], [11, 7], [6, 8], [8, 10], [3, 9], [10, 5]] as [number, number][]) {
    if (!g[y * N + x]) continue;
    dot(g, x, y, [240, 124, 176]);
    dot(g, x + 1, y, [252, 190, 214]);
  }
  return g;
}

/** A pink flower seen from below, hanging from a short green stalk with a few pale stamens. */
function sporeBlossomGrid(): Cell[] {
  const g = blank();
  for (let y = 0; y < 3; y++) dot(g, 7, y, [84, 138, 52]);
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    const r = a % 2 === 0 ? 3.6 : 2.8;
    dot(g, Math.round(7.5 + Math.cos(ang) * r), Math.round(5 + Math.sin(ang) * r * 0.8), a < 5 ? [244, 150, 198] : [222, 116, 172]);
  }
  for (const [x, y] of [[6, 4], [7, 4], [8, 4], [7, 5], [6, 5], [8, 5], [7, 6]] as [number, number][]) dot(g, x, y, [206, 70, 132]);
  for (const [x, y, len] of [[5, 7, 3], [7, 8, 4], [9, 7, 2]] as [number, number, number][]) {
    for (let k = 0; k < len; k++) dot(g, x, y + k, [236, 214, 226]);
    dot(g, x, y + len, [250, 244, 120]);
  }
  return g;
}

/**
 * One piece of dripstone: a cone with its point `up` (a stalagmite stands on the floor) or down (a stalactite hangs). A `tip` is
 * thin and ends in a point; a base is thick and cut off flat where it meets the next piece or the rock.
 */
function dripstoneGrid(tip: boolean, hanging: boolean): Cell[] {
  const g = blank();
  for (let row = 0; row < N; row++) {
    // `row` counts from the rock end: 0 = where it joins the floor or ceiling.
    const y = hanging ? row : N - 1 - row;
    const t = row / (N - 1); // 0 at the rock, 1 at the point
    const half = tip ? 3.4 - t * 2.9 : 5.6 - t * 1.8;
    if (tip && t > 0.9) continue;
    for (let x = 0; x < N; x++) {
      const d = x + 0.5 - 8;
      if (Math.abs(d) > half) continue;
      const strata = hashPx(0, row >> 1) * 14 - 7;
      const base: RGB = [142 + strata, 118 + strata, 100 + strata];
      const side = d < -half * 0.45 ? 16 : d > half * 0.45 ? -26 : 0;
      dot(g, x, y, Math.abs(d) > half - 1 ? shade(base, side - 16) : shade(base, side + (hashPx(x, row) - 0.5) * 8));
    }
  }
  return g;
}

/** Faint green-blue patches of lichen, scattered over the cell like a stain. */
function glowLichenGrid(): Cell[] {
  const g = blank();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = Math.sin(x * 0.9 + Math.sin(y * 0.7) * 1.7) + Math.cos(y * 0.8 - x * 0.35) * 1.2;
      if (n < 0.45 || hashPx(x, y) < 0.12) continue;
      const hi = n > 1.5 && hashPx(y, x) > 0.4;
      dot(g, x, y, hi ? [178, 244, 196] : n > 1 ? [106, 196, 150] : [66, 150, 118]);
    }
  }
  return g;
}

/** A cluster of crystals: a tall spire between two shorter ones, each lit on the left and shaded on the right. */
function amethystClusterGrid(): Cell[] {
  const g = blank();
  const crystal = (cx: number, top: number, bottom: number, half: number, lean: number): void => {
    for (let y = top; y <= bottom; y++) {
      const w = Math.min(half, Math.floor((y - top) / 2));
      const shift = Math.round((bottom - y) * lean);
      for (let x = -w; x <= w; x++) {
        const c: RGB = x < 0 ? [190, 142, 244] : x > 0 ? [112, 72, 168] : [152, 104, 214];
        dot(g, cx + x + shift, y, y === top ? [236, 204, 255] : y % 5 === 0 ? shade(c, 18) : c);
      }
    }
  };
  crystal(4, 6, 15, 1, -0.12);
  crystal(11, 5, 15, 1, 0.14);
  crystal(7, 1, 15, 2, 0);
  crystal(9, 9, 15, 1, 0.05);
  return g;
}

/** Shears: two iron blades crossing at a pivot, with a loop for each finger. */
function shearsGrid(): Cell[] {
  const g = blank();
  const iron: RGB = [196, 198, 206];
  const grip: RGB = [150, 60, 56];
  // Blades climb to the top right, crossing at the pivot (7, 8).
  for (let i = 0; i <= 7; i++) {
    dot(g, Math.floor(7 + i * 0.85), 8 - i, shade(iron, i % 2 ? -10 : 8));
    dot(g, Math.floor(8 + i * 0.55), 8 - i, shade(iron, -30));
  }
  // The two handles run to the bottom left and bottom, each ending in a ring.
  for (let i = 0; i <= 4; i++) {
    dot(g, 7 - i, Math.floor(9 + i * 0.7), shade(iron, -6));
    dot(g, Math.floor(6 + i * 0.3), 9 + i, shade(iron, -22));
  }
  for (const [cx, cy] of [[2, 13], [6, 14]]) {
    for (let a = 0; a < 8; a++) {
      const x = Math.round(cx + Math.cos((a / 8) * Math.PI * 2) * 1.6);
      const y = Math.round(cy + Math.sin((a / 8) * Math.PI * 2) * 1.6);
      dot(g, x, y, shade(grip, a < 4 ? 10 : -14));
    }
  }
  dot(g, 7, 8, [70, 70, 80]);
  return g;
}

/** A minecart: an open iron box seen from the side, on two wheels. */
function minecartGrid(): Cell[] {
  const g = blank();
  const iron: RGB = [160, 164, 172];
  // The box: a trapezoid, wider at the top, with a dark inside showing over the rim.
  fillShape(g, (x, y) => y >= 4 && y <= 11 && x >= 2 + (y < 7 ? 0 : 1) && x <= 13 - (y < 7 ? 0 : 1), (x, y) => shade(iron, (y === 4 ? 26 : y > 9 ? -30 : 0) + Math.floor(hashPx(x, y) * 10) - 5));
  fillShape(g, (x, y) => y === 5 && x >= 3 && x <= 12, () => [74, 78, 86]);
  // Rivets along the side.
  for (let x = 4; x <= 11; x += 3) dot(g, x, 8, shade(iron, -40));
  // Wheels.
  for (const cx of [4, 11]) fillShape(g, (x, y) => (x - cx) ** 2 + (y - 12.5) ** 2 <= 3.2, (x, y) => (x === cx && y === 12 ? [150, 152, 160] : [50, 52, 58]));
  return outline(g);
}

/** A boat: a plank hull seen from the side, bow to the right. */
function boatGrid(): Cell[] {
  const g = blank();
  const wood: RGB = [166, 128, 78];
  fillShape(g, (x, y) => y >= 7 && y <= 12 && x >= 1 + (y - 7) * 0.6 && x <= 14 - (12 - y) * 0.3, (x, y) => shade(wood, (y === 7 ? 24 : y === 12 ? -34 : y % 2 ? -8 : 6) + Math.floor(hashPx(x, y) * 8) - 4));
  fillShape(g, (x, y) => y >= 5 && y <= 6 && x >= 12 && x <= 14, () => shade(wood, -14));
  fillShape(g, (x, y) => y === 8 && x >= 4 && x <= 10, () => shade(wood, -50));
  return outline(g);
}

function flintSteelGrid(): Cell[] {
  const g = blank();
  const steel: RGB = [188, 192, 204];
  // The striker: a loop of steel bottom left.
  for (let x = 3; x <= 8; x++) {
    dot(g, x, 8, shade(steel, 14));
    dot(g, x, 13, shade(steel, -26));
  }
  for (let y = 9; y <= 12; y++) {
    dot(g, 2, y, shade(steel, 4));
    dot(g, 9, y, shade(steel, -14));
  }
  // The flint it strikes, with a pair of sparks between them.
  fillShape(
    g,
    (x, y) => {
      const dx = (x - 11.5) / 3.2;
      const dy = (y - 4.5) / 3;
      return dx * dx + dy * dy <= 1;
    },
    (x, y) => {
      const v = hashPx(x, y);
      return v > 0.7 ? [140, 140, 150] : [64 + v * 28, 64 + v * 28, 72 + v * 28];
    },
  );
  dot(g, 8, 6, [255, 214, 80]);
  dot(g, 9, 7, [255, 150, 40]);
  dot(g, 7, 7, [255, 240, 160]);
  return outline(g);
}

function lapisGrid(): Cell[] {
  const g = blank();
  const c: RGB = [38, 70, 176];
  // A rough lump of deep blue stone with pale flecks, lit from the upper left.
  fillShape(
    g,
    (x, y) => {
      const dx = (x - 7.5) / 5.6;
      const dy = (y - 8.2) / 5;
      return dx * dx + dy * dy <= 1 + (hashPx(x, y) - 0.5) * 0.35;
    },
    (x, y) => {
      const dx = x - 7.5;
      const dy = y - 8.2;
      const v = hashPx(x, y);
      if (v > 0.86) return [168, 190, 255];
      if (dx + dy < -3) return shade(c, 26);
      if (dx + dy > 3) return shade(c, -34);
      return shade(c, v * 14 - 5);
    },
  );
  return outline(g);
}

function experienceBottleGrid(): Cell[] {
  const g = blank();
  const glass: RGB = [196, 226, 232];
  const glow: RGB = [124, 252, 96];
  // A round flask with a short neck and a cork, full of glowing green.
  fillShape(
    g,
    (x, y) => {
      const dx = (x - 7.5) / 5;
      const dy = (y - 10) / 4.6;
      return (dx * dx + dy * dy <= 1) || (x >= 6 && x <= 9 && y >= 4 && y <= 6);
    },
    (x, y) => {
      if (y <= 6) return shade(glass, 6);
      const dx = x - 7.5;
      const dy = y - 10;
      const v = hashPx(x, y);
      if (dx + dy < -4.4) return [236, 255, 232];
      if (dx * dx + dy * dy > 18) return shade(glass, -22);
      return shade(glow, v * 24 - 14 - (dy > 1.5 ? 28 : 0));
    },
  );
  for (let x = 6; x <= 9; x++) {
    dot(g, x, 2, [150, 104, 54]);
    dot(g, x, 3, [122, 82, 42]);
  }
  dot(g, 5, 9, [255, 255, 255]);
  return outline(g);
}
function flintGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => {
      const dx = (x - 7.5) / 5.2;
      const dy = (y - 8.5) / 4.4;
      return dx * dx + dy * dy <= 1 && x + (15 - y) * 0.35 > 5;
    },
    (x, y) => {
      const v = hashPx(x, y);
      return v > 0.78 ? [128, 128, 138] : [60 + v * 30, 60 + v * 30, 68 + v * 30];
    },
  );
  return outline(g);
}

function stringGrid(): Cell[] {
  const g = blank();
  const c: RGB = [238, 238, 238];
  for (let i = 0; i < 12; i++) {
    dot(g, 3 + i, 12 - i + (i % 3 === 0 ? 1 : 0), i % 2 ? c : shade(c, -26));
    dot(g, 4 + i, 12 - i, shade(c, -12));
  }
  return outline(g);
}

/** A bed seen from the side: white pillow at the left, a blanket of the given colour, wooden legs. */
function bedGrid(red: RGB = [186, 38, 40]): Cell[] {
  const g = blank();
  const pillow: RGB = [238, 238, 244];
  const wood: RGB = [150, 108, 58];
  for (let x = 1; x <= 14; x++) {
    for (let y = 5; y <= 9; y++) {
      const isPillow = x <= 5 && y <= 8;
      if (isPillow) dot(g, x, y, y === 5 ? shade(pillow, 10) : y === 8 ? shade(pillow, -34) : shade(pillow, -((x + y) % 2) * 8));
      else if (y >= 6) dot(g, x, y, y === 6 ? shade(red, 26) : y === 9 ? shade(red, -40) : shade(red, ((x >> 1) + y) % 2 ? -10 : 0));
    }
  }
  for (let x = 1; x <= 14; x++) for (let y = 10; y <= 11; y++) dot(g, x, y, shade(wood, y === 11 ? -30 : -6 + ((x + y) % 3) * 4));
  for (const x of [1, 2, 13, 14]) for (let y = 12; y <= 13; y++) dot(g, x, y, shade(wood, -36));
  return outline(g);
}
/** A wooden door: two panels with a row of window panes and a knob. */
function doorGrid(): Cell[] {
  const g = blank();
  const wood: RGB = [160, 116, 62];
  for (let x = 4; x <= 11; x++) {
    for (let y = 1; y <= 14; y++) {
      const rim = x === 4 || x === 11 || y === 1 || y === 14;
      const pane = y >= 3 && y <= 4 && ((x >= 5 && x <= 6) || (x >= 9 && x <= 10));
      if (pane) dot(g, x, y, shade(wood, -64));
      else if (rim) dot(g, x, y, shade(wood, -38));
      else if (y === 8 || x === 7 || x === 8) dot(g, x, y, shade(wood, -22));
      else dot(g, x, y, shade(wood, ((x + y) % 3) * 5 - 4));
    }
  }
  dot(g, 10, 9, [214, 214, 220]);
  dot(g, 10, 10, [170, 172, 180]);
  return outline(g);
}
/** A fence: two posts joined by two rails. */
function fenceGrid(): Cell[] {
  const g = blank();
  const wood: RGB = [152, 110, 58];
  for (const px of [3, 11]) for (let x = px; x <= px + 1; x++) for (let y = 2; y <= 14; y++) dot(g, x, y, shade(wood, x === px ? 8 : -22));
  for (const ry of [5, 10]) for (let x = 5; x <= 10; x++) for (let y = ry; y <= ry + 1; y++) dot(g, x, y, shade(wood, y === ry ? 4 : -26));
  return outline(g);
}
/** A fence gate: two posts, rails in between and a middle bar. */
function gateGrid(): Cell[] {
  const g = blank();
  const wood: RGB = [152, 110, 58];
  for (const px of [1, 13]) for (let x = px; x <= px + 1; x++) for (let y = 3; y <= 14; y++) dot(g, x, y, shade(wood, x === px ? 8 : -22));
  for (const ry of [5, 10]) for (let x = 3; x <= 12; x++) for (let y = ry; y <= ry + 1; y++) dot(g, x, y, shade(wood, y === ry ? 4 : -26));
  for (let y = 7; y <= 9; y++) for (let x = 7; x <= 8; x++) dot(g, x, y, shade(wood, -10));
  return outline(g);
}
/** A heater shield: planks bound by an iron rim, with an iron boss in the middle. */
function shieldGrid(): Cell[] {
  const g = blank();
  const wood: RGB = [156, 114, 62];
  const iron: RGB = [196, 200, 208];
  const LEFT = [4, 5, 5, 6, 7];
  const inside = (x: number, y: number): boolean => {
    if (y < 2 || y > 14) return false;
    if (y <= 9) return x >= 3 && x <= 12;
    const l = LEFT[y - 10];
    return x >= l && x <= 15 - l;
  };
  fillShape(g, inside, (x, y) => {
    const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (rim) return shade(iron, x <= 7 ? 10 : -34 + Math.floor(hashPx(x, y) * 10));
    if ((x === 7 || x === 8) && (y === 6 || y === 7)) return shade(iron, x === 7 && y === 6 ? 26 : -8);
    if (x === 6 || x === 9) return shade(wood, -34);
    return shade(wood, Math.floor(hashPx(x, y) * 18) - 9);
  });
  return outline(g);
}
/** A bow; without the string it is the frame the first-person hand draws its own, moving string on. */
function bowGrid(withString = true): Cell[] {
  const g = blank();
  const wood: RGB = [150, 106, 54];
  const leather: RGB = [88, 56, 34];
  // A plain wooden bow: one arc from the bottom-left to the top-right, bulging to the upper-left, thick at the belly and thin
  // at the tips, with a leather-wrapped grip in the middle.
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const belly = Math.sin(t * Math.PI);
    const x = Math.round(2 + t * 11 - belly * 4.4);
    const y = Math.round(14 - t * 12 - belly * 4.4);
    const wide = belly > 0.82 ? 3 : belly > 0.5 ? 2 : 1;
    const grip = t > 0.4 && t < 0.6;
    const base = grip ? leather : wood;
    dot(g, x, y, shade(base, 0));
    if (wide >= 2) {
      dot(g, x + 1, y, shade(base, -26)); // the shaded inside of the limb
      dot(g, x, y + 1, shade(base, -26));
    }
    if (wide >= 3 || grip) {
      dot(g, x - 1, y, shade(base, 20)); // the lit outside
      dot(g, x, y - 1, shade(base, 20));
    }
  }
  dot(g, 2, 14, [230, 214, 170]); // the nocks at the tips
  dot(g, 13, 2, [230, 214, 170]);
  // String from tip to tip.
  if (withString) line(g, 2, 14, 13, 2, [226, 226, 226], 1);
  return outline(g);
}

// ---- class weapons -------------------------------------------------------------------------------

function greatswordGrid(): Cell[] {
  const g = blank();
  const steel: RGB = [212, 218, 228];
  const wood: RGB = [112, 78, 42];
  const gold: RGB = [232, 188, 60];
  // A broad blade from the hilt (lower left) to the tip (upper right), with a bright edge and a dark one.
  line(g, 5, 10, 14, 1, shade(steel, -26), 3);
  line(g, 5, 9, 14, 0, steel, 2);
  line(g, 6, 9, 13, 2, shade(steel, 22), 1);
  // Cross-guard, grip and pommel.
  line(g, 3, 8, 8, 13, gold, 1);
  line(g, 4, 8, 8, 12, shade(gold, -30), 1);
  line(g, 2, 14, 5, 11, wood, 2);
  dot(g, 1, 15, gold);
  return outline(g);
}

function daggerGrid(): Cell[] {
  const g = blank();
  const steel: RGB = [224, 228, 236];
  const wood: RGB = [96, 66, 40];
  const gold: RGB = [220, 176, 56];
  // A slim blade from the guard to the tip (upper right): wide at the base, a bright edge on one side, a dark one on the other, and a fuller down the middle.
  const widths = [4, 4, 3, 3, 3, 2, 2, 1, 1];
  widths.forEach((w, i) => {
    const x = 6 + i;
    const y = 10 - i;
    const x0 = x - Math.floor(w / 2);
    for (let k = 0; k < w; k++) {
      const edge = k === 0 ? shade(steel, 24) : k === w - 1 ? shade(steel, -46) : w >= 3 && k === 1 ? shade(steel, -14) : steel;
      dot(g, x0 + k, y, edge);
    }
  });
  // The cross-guard (gold, with a darker underside), the leather-bound grip and the pommel.
  for (let k = -2; k <= 2; k++) {
    dot(g, 5 + k, 11 + k, k < 0 ? shade(gold, 18) : gold);
    dot(g, 6 + k, 11 + k, shade(gold, -34));
  }
  line(g, 4, 12, 2, 14, wood, 1);
  dot(g, 3, 12, shade(wood, -22));
  dot(g, 2, 13, shade(wood, -22));
  dot(g, 4, 13, shade(wood, 14));
  dot(g, 1, 15, gold);
  dot(g, 2, 15, shade(gold, -30));
  return outline(g);
}

function staffGrid(): Cell[] {
  const g = blank();
  const wood: RGB = [136, 92, 52];
  const woodDark: RGB = [92, 60, 34];
  const gold: RGB = [240, 194, 66];
  const goldDark: RGB = [190, 140, 44];
  const crystal: RGB = [150, 92, 244];
  // Upright: a thin shaft of two woods with brass rings and a foot, and a decorated head: a gold cup and prongs round a violet orb, with a gold tip.
  // (The held staff is drawn stretched upwards, so the head is squat here and the shaft one pixel wide.)
  for (let y = 5; y <= 14; y++) dot(g, 7, y, y % 3 === 0 ? woodDark : wood);
  dot(g, 7, 15, gold);
  for (const y of [8, 12]) {
    dot(g, 6, y, gold);
    dot(g, 7, y, gold);
    dot(g, 8, y, goldDark);
  }
  // The head.
  dot(g, 7, 0, gold);
  for (let x = 5; x <= 9; x++) dot(g, x, 3, x < 7 ? gold : goldDark);
  for (const x of [6, 7, 8]) dot(g, x, 4, x < 7 ? gold : goldDark);
  for (const y of [1, 2]) {
    dot(g, 5, y, gold);
    dot(g, 9, y, goldDark);
  }
  dot(g, 5, 0, gold);
  dot(g, 9, 0, goldDark);
  for (const [x, y] of [
    [6, 1],
    [7, 1],
    [8, 1],
    [6, 2],
    [7, 2],
    [8, 2],
  ] as const) dot(g, x, y, shade(crystal, (7 - x + (1 - y)) * 30));
  dot(g, 6, 1, [250, 238, 255]);
  return outline(g);
}

function wandGrid(): Cell[] {
  const g = blank();
  const wood: RGB = [92, 62, 44];
  const star: RGB = [255, 214, 92];
  line(g, 3, 13, 11, 5, wood, 1);
  line(g, 4, 13, 11, 6, shade(wood, 26), 1);
  dot(g, 12, 4, star);
  dot(g, 13, 3, shade(star, 20));
  dot(g, 12, 2, [200, 140, 255]);
  dot(g, 14, 4, [200, 140, 255]);
  dot(g, 12, 6, [200, 140, 255]);
  dot(g, 11, 3, [200, 140, 255]);
  dot(g, 13, 5, [200, 140, 255]);
  return outline(g);
}

function spellbookGrid(): Cell[] {
  const g = blank();
  const cover: RGB = [98, 56, 152];
  const gold: RGB = [232, 188, 60];
  fillShape(
    g,
    (x, y) => x >= 3 && x <= 12 && y >= 2 && y <= 13,
    (x, y) => {
      if (x === 3) return shade(cover, -40); // the spine
      if (y === 13 || x === 12) return [236, 226, 196]; // the pages show on the edges
      return shade(cover, ((x * 3 + y * 5) % 4) * 6 - 6);
    },
  );
  // A gold rune and corner studs.
  for (const [x, y] of [
    [7, 5],
    [8, 5],
    [6, 6],
    [9, 6],
    [7, 7],
    [8, 7],
    [7, 8],
    [8, 8],
    [6, 9],
    [9, 9],
  ] as const) dot(g, x, y, gold);
  dot(g, 4, 3, gold);
  dot(g, 11, 3, gold);
  dot(g, 4, 12, gold);
  return outline(g);
}

/** The Mage's orb: a ball of glass with arcane light turning inside, resting on a little gold claw. */
function orbGrid(): Cell[] {
  const g = blank();
  const gold: RGB = [226, 178, 56];
  const cx = 7.5;
  const cy = 6.5;
  const R = 5.6;
  // The claw underneath, drawn first so the ball sits in front of it.
  line(g, 4, 13, 11, 13, shade(gold, -34), 1);
  line(g, 5, 12, 10, 12, gold, 1);
  dot(g, 4, 11, shade(gold, -20));
  dot(g, 11, 11, shade(gold, -50));
  fillShape(
    g,
    (x, y) => Math.hypot(x - cx, y - cy) <= R,
    (x, y) => {
      const d = Math.hypot(x - cx, y - cy) / R;
      // Light pours from the middle: pale in the heart, blue to violet toward the glass.
      const heart: RGB = [196, 232, 255];
      const mid: RGB = [86, 140, 236];
      const rim: RGB = [66, 52, 150];
      const t = Math.min(1, d * 1.15);
      const lerp = (a: RGB, b: RGB, k: number): RGB => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
      let c = t < 0.55 ? lerp(heart, mid, t / 0.55) : lerp(mid, rim, (t - 0.55) / 0.45);
      // A swirl of motes inside.
      if ((x * 5 + y * 3) % 7 === 0 && d < 0.8) c = shade(c, 38);
      return shade(c, Math.floor(hashPx(x, y) * 10) - 5);
    },
  );
  // The glint on the glass.
  dot(g, 5, 4, [255, 255, 255]);
  dot(g, 6, 3, [236, 246, 255]);
  dot(g, 5, 5, [214, 236, 255]);
  return outline(g);
}

/** A crossbow; without the string and the bolt it is the frame the first-person hand adds its own to. */
function crossbowGrid(withString = true): Cell[] {
  const g = blank();
  const wood: RGB = [132, 92, 50];
  const dark: RGB = [88, 58, 32];
  const iron: RGB = [176, 180, 190];
  // The prod: a bow laid across the stock, its limbs bent forward (toward the upper right), with iron on the tips.
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const bend = Math.sin(t * Math.PI) * 2.2;
    const x = Math.round(6.5 + t * 8 + bend * 0.707);
    const y = Math.round(3.5 + t * 8 - bend * 0.707);
    const tip = t < 0.12 || t > 0.88;
    dot(g, x, y, tip ? iron : shade(wood, 8));
    dot(g, x - 1, y, tip ? shade(iron, -30) : dark);
    if (!tip && t > 0.3 && t < 0.7) dot(g, x, y - 1, shade(wood, 22));
  }
  // The stock runs from the butt (lower left) up to the middle of the prod, with a stirrup of iron on the front and a lock behind the prod.
  for (let k = 0; k <= 8; k++) {
    const x = 3 + k;
    const y = 15 - k;
    dot(g, x, y, shade(wood, k % 2 ? 4 : -2));
    dot(g, x + 1, y, shade(wood, -18));
    dot(g, x - 1, y, shade(wood, 14));
  }
  dot(g, 2, 15, dark);
  dot(g, 3, 15, dark);
  dot(g, 2, 14, shade(wood, -26));
  line(g, 11, 6, 12, 5, iron, 1); // the stirrup
  dot(g, 12, 4, iron);
  dot(g, 8, 9, shade(iron, -30)); // the lock
  dot(g, 7, 10, [214, 168, 70]);
  // The string and the bolt in the groove.
  if (withString) {
    line(g, 6, 3, 14, 11, [226, 226, 226], 1);
    line(g, 4, 12, 9, 7, [226, 226, 226], 1);
    dot(g, 10, 6, [200, 70, 60]);
  }
  return outline(g);
}

// ---- armor ---------------------------------------------------------------------------------------

const ARMOR_COLOR: Record<ArmorMaterial, RGB> = {
  leather: [158, 98, 58],
  gold: [250, 212, 54],
  iron: [206, 210, 218],
  diamond: [74, 226, 212],
};

/** The silhouette of each piece, on the 16x16 grid. */
const ARMOR_SHAPE: Record<ArmorSlot, (x: number, y: number) => boolean> = {
  // A dome with cheek guards and an open face.
  helmet: (x, y) => {
    if (y < 3 || y > 12 || x < 2 || x > 13) return false;
    if (y === 3) return x >= 5 && x <= 10;
    if (y === 4) return x >= 3 && x <= 12;
    if (x >= 5 && x <= 10 && y >= 9) return false;
    return true;
  },
  // Shoulders, short sleeves and a body with a neck hole.
  chestplate: (x, y) => {
    if (y < 2 || y > 14) return false;
    if (x >= 6 && x <= 9 && y <= 3) return false;
    if (x >= 1 && x <= 3 && y <= 8) return x >= 1 + (y > 6 ? 1 : 0);
    if (x >= 12 && x <= 14 && y <= 8) return x <= 14 - (y > 6 ? 1 : 0);
    if (x >= 4 && x <= 11) return y <= 14 - (y > 12 && (x === 4 || x === 11) ? 1 : 0);
    return false;
  },
  // A waist band over two legs.
  leggings: (x, y) => {
    if (y < 2 || y > 14) return false;
    if (y <= 5) return x >= 3 && x <= 12;
    return (x >= 3 && x <= 6) || (x >= 9 && x <= 12);
  },
  // Two boots: a shaft and a longer foot.
  boots: (x, y) => {
    if (y < 4 || y > 13) return false;
    const shaft = y <= 9;
    const left = shaft ? x >= 2 && x <= 6 : x >= 1 && x <= 7;
    const right = shaft ? x >= 9 && x <= 13 : x >= 8 && x <= 14;
    return left || right;
  },
};

function armorGrid(slot: ArmorSlot, material: ArmorMaterial): Cell[] {
  const g = blank();
  const base = ARMOR_COLOR[material];
  const inside = ARMOR_SHAPE[slot];
  fillShape(g, inside, (x, y) => {
    let c = shade(base, Math.floor(hashPx(x, y) * 14) - 7);
    // Stitching and rivets differ by material.
    if (material === 'leather' && ((x + y) % 4 === 0 || (x === 7 || x === 8) && y % 2 === 0)) c = shade(base, -30);
    if (material === 'iron' && (x * 3 + y * 5) % 11 === 0) c = shade(base, -42);
    if (material === 'gold' && hashPx(x * 3, y * 7) > 0.88) c = shade(base, 26);
    if (material === 'diamond' && hashPx(x * 5, y * 3) > 0.9) c = [226, 255, 252];
    return c;
  });
  return outline(bevel(g));
}

function leatherGrid(): Cell[] {
  const g = blank();
  const base: RGB = [168, 108, 64];
  fillShape(
    g,
    (x, y) => {
      const dx = (x - 7.5) / 6;
      const dy = (y - 8) / 5.2;
      return dx * dx + dy * dy <= 1 + Math.sin(x * 1.7 + y * 1.3) * 0.18;
    },
    (x, y) => shade(base, Math.floor(hashPx(x, y) * 26) - 14),
  );
  // A fold across the middle.
  for (let x = 4; x <= 11; x++) g[(8 + (x % 2)) * N + x] = shade(base, -34);
  return outline(bevel(g));
}

/** An iron bucket, empty or holding a liquid. */
function bucketGrid(content: RGB | null): Cell[] {
  const g = blank();
  const iron: RGB = [196, 200, 208];
  fillShape(
    g,
    (x, y) => y >= 4 && y <= 13 && x >= 3 + Math.floor((y - 4) / 3) && x <= 12 - Math.floor((y - 4) / 3),
    (x, y) => {
      if (y === 4) return content ? content : [52, 54, 62];
      if (y === 5 && content && x > 4 && x < 11) return shade(content, -24);
      if (x <= 4) return shade(iron, 26);
      if (x >= 10 || y >= 12) return shade(iron, -44);
      return shade(iron, Math.floor(hashPx(x, y) * 12) - 6);
    },
  );
  // A bail over the rim.
  for (const [x, y] of [[4, 3], [3, 2], [4, 1], [5, 0], [10, 0], [11, 1], [12, 2], [11, 3]] as [number, number][]) dot(g, x, y, shade(iron, -30));
  for (let x = 6; x <= 9; x++) dot(g, x, 0, shade(iron, -30));
  return outline(g);
}

function featherGrid(): Cell[] {
  const g = blank();
  const vane: RGB = [236, 238, 242];
  for (let i = 0; i <= 10; i++) {
    const x = 3 + i;
    const y = 13 - i;
    const w = i < 2 ? 0 : i > 8 ? 1 : 2;
    for (let k = 1; k <= w; k++) {
      dot(g, x - k, y, shade(vane, -((i + k) % 3) * 12));
      dot(g, x, y - k, shade(vane, -((i + k) % 2) * 16));
    }
    dot(g, x, y, [170, 172, 180]);
  }
  dot(g, 2, 14, [170, 172, 180]);
  return outline(g);
}

/** A chop or a drumstick: a meaty blob with a bone stub. */
function meatCutGrid(raw: boolean, kind: 'chop' | 'leg' | 'small'): Cell[] {
  const g = blank();
  const base: RGB = raw ? (kind === 'leg' ? [236, 196, 170] : kind === 'small' ? [220, 140, 130] : [200, 80, 90]) : kind === 'leg' ? [196, 124, 56] : kind === 'small' ? [176, 112, 70] : [156, 92, 58];
  const fat: RGB = raw ? [250, 226, 214] : [212, 156, 96];
  const cx = kind === 'leg' ? 9.5 : 7.5;
  const cy = kind === 'leg' ? 6.5 : 8.5;
  const rx = kind === 'small' ? 4.2 : kind === 'leg' ? 4.6 : 5.6;
  const ry = kind === 'small' ? 3.4 : kind === 'leg' ? 4.2 : 4.4;
  fillShape(
    g,
    (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
    (x, y) => {
      if ((x * 2 + y * 3) % 7 === 0) return fat;
      if (y > cy + ry * 0.5) return shade(base, -26);
      if (y < cy - ry * 0.5 && x < cx) return shade(base, 22);
      return shade(base, Math.floor(hashPx(x, y) * 14) - 7);
    },
  );
  const bone: RGB = [238, 232, 216];
  if (kind === 'leg') {
    line(g, 7, 9, 3, 13, bone, 1);
    dot(g, 2, 12, bone);
    dot(g, 3, 14, bone);
    dot(g, 2, 13, shade(bone, -30));
  } else if (kind === 'chop') {
    line(g, 4, 11, 2, 13, bone, 1);
    dot(g, 2, 12, shade(bone, -30));
  } else {
    dot(g, 4, 11, bone);
    dot(g, 3, 12, bone);
  }
  return outline(g);
}

function inkSacGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => ((x - 7.5) / 5) ** 2 + ((y - 9) / 4.8) ** 2 <= 1 || (y >= 3 && y <= 5 && x >= 6 && x <= 9),
    (x, y) => {
      const v = hashPx(x, y);
      if ((x === 5 || x === 6) && (y === 7 || y === 8)) return [92, 104, 150];
      return [26 + v * 14, 30 + v * 14, 52 + v * 20];
    },
  );
  return outline(g);
}

function slimeballGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => ((x - 7.5) / 4.6) ** 2 + ((y - 8.5) / 4.6) ** 2 <= 1,
    (x, y) => {
      if (x >= 5 && x <= 6 && y >= 6 && y <= 7) return [214, 250, 200];
      if (y >= 10 || x >= 10) return [58, 140, 52];
      return [112 + hashPx(x, y) * 14, 200 + hashPx(y, x) * 14, 96];
    },
  );
  return outline(g);
}

function enderPearlGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => ((x - 7.5) / 5.2) ** 2 + ((y - 8) / 5.2) ** 2 <= 1,
    (x, y) => {
      const d = Math.hypot(x - 7.5, y - 8);
      const swirl = Math.sin(x * 0.9 + y * 0.6) + Math.sin(y * 1.1 - x * 0.4);
      if (x >= 5 && x <= 6 && y >= 5 && y <= 6) return [190, 250, 230];
      if (swirl > 1.1) return [40, 160, 130];
      return [16 + d * 3, 70 + d * 6 - hashPx(x, y) * 14, 66 + d * 5];
    },
  );
  return outline(g);
}

function spiderEyeGrid(): Cell[] {
  const g = blank();
  fillShape(
    g,
    (x, y) => ((x - 7.5) / 5.2) ** 2 + ((y - 8.5) / 3.8) ** 2 <= 1,
    (x, y) => {
      if (x >= 7 && x <= 9 && y >= 8 && y <= 9) return [28, 12, 20];
      if (y <= 6) return [190, 50, 66];
      return [132 + hashPx(x, y) * 20, 26, 42];
    },
  );
  for (const [x, y] of [[2, 11], [3, 12], [12, 5], [13, 4]] as [number, number][]) dot(g, x, y, [120, 40, 52]);
  return outline(g);
}

/** A small heap of coloured powder with a lighter top. */
function dyeGrid(c: RGB): Cell[] {
  const g = blank();
  const shade = (k: number): RGB => [Math.max(0, Math.min(255, c[0] + k)), Math.max(0, Math.min(255, c[1] + k)), Math.max(0, Math.min(255, c[2] + k))];
  const rows: [number, number, number][] = [
    [4, 6, 9],
    [5, 5, 10],
    [6, 4, 11],
    [7, 3, 12],
    [8, 3, 12],
    [9, 3, 12],
    [10, 4, 11],
    [11, 5, 10],
  ];
  for (const [y, x0, x1] of rows) {
    for (let x = x0; x <= x1; x++) {
      const light = y <= 6 || (y <= 8 && x <= x0 + 2);
      const dark = y >= 10 || x >= x1 - 1;
      dot(g, x, y, light ? shade(28) : dark ? shade(-26) : c);
    }
  }
  dot(g, 7, 6, shade(60));
  dot(g, 6, 7, shade(46));
  return outline(g);
}

/**
 * A horn that calls a mount: a curved war horn with a bell mouth, bound in two bands of trim. It comes in the colours of the
 * Fenrir it calls (its fur, the bone of its horns and the glow of its eyes at the mouth).
 */
function hornGrid(armor: RGB, trim: RGB, glow: RGB): Cell[] {
  const g = blank();
  const at = (t: number): [number, number] => [(1 - t) * (1 - t) * 13.4 + 2 * (1 - t) * t * 13.4 + t * t * 2.4, (1 - t) * (1 - t) * 1.8 + 2 * (1 - t) * t * 12.2 + t * t * 12.8];
  const STEPS = 60;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const [cx, cy] = at(t);
    const r = 0.6 + t * 2.7;
    const band = (t > 0.5 && t < 0.58) || t > 0.93;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        // Lit from the top left: the far side of the tube is darker.
        const side = (dx + dy) / Math.max(1, r);
        dot(g, x, y, band ? shade(trim, Math.round(side * -22)) : shade(armor, Math.round(side * -30) + (hashPx(x, y) < 0.15 ? -10 : 0)));
      }
    }
  }
  // The mouth: dark inside, with the glow of the eyes deep in it.
  const [mx, my] = at(1);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - (mx - 0.5);
      const dy = y - (my - 0.4);
      if (dx * dx + dy * dy <= 3.4) dot(g, x, y, shade(armor, -90));
      if (dx * dx + dy * dy <= 1.2) dot(g, x, y, glow);
    }
  }
  return outline(bevel(g));
}

// ---- the clothes of the classes ------------------------------------------------------------------

const OUTFIT_PALETTE: Record<OutfitClass, { main: RGB; dark: RGB; accent: RGB; trim: RGB }> = {
  warrior: { main: [190, 197, 210], dark: [104, 110, 126], accent: [190, 52, 46], trim: [240, 196, 70] },
  mage: { main: [112, 74, 192], dark: [58, 38, 118], accent: [196, 112, 44], trim: [238, 192, 72] },
  ranger: { main: [78, 132, 68], dark: [44, 84, 46], accent: [118, 76, 42], trim: [232, 220, 176] },
};

/** The silhouettes that are not armor's: the wizard's hat with its brim, the ranger's hood, the flare of a robe's skirt. */
const OUTFIT_SHAPE: Partial<Record<OutfitClass, Partial<Record<ArmorSlot, (x: number, y: number) => boolean>>>> = {
  mage: {
    helmet: (x, y) => {
      if (y >= 1 && y <= 9) return Math.abs(x - 7.5) <= 0.9 + (y - 1) * 0.5;
      if (y === 10) return x >= 1 && x <= 14;
      if (y === 11) return x >= 2 && x <= 13;
      return false;
    },
    leggings: (x, y) => {
      if (y < 2 || y > 14) return false;
      const half = 3.5 + Math.max(0, y - 4) * 0.4;
      return Math.abs(x - 7.5) <= half && !(y > 8 && x >= 7 && x <= 8 && y % 3 === 0);
    },
  },
  ranger: {
    helmet: (x, y) => {
      const dx = (x - 7.5) / 6;
      const dy = (y - 6.5) / 5.3;
      if (x >= 5 && x <= 10 && y >= 7 && y <= 11) return false;
      if (x >= 11 && x <= 13 && y >= 1 && y <= 3 && x - 11 <= 3 - y + 1) return true;
      return dx * dx + dy * dy <= 1;
    },
  },
};

function outfitGrid(cls: OutfitClass, slotIndex: number): Cell[] {
  const slot = ARMOR_SLOTS[slotIndex];
  const p = OUTFIT_PALETTE[cls];
  const g = blank();
  const inside = OUTFIT_SHAPE[cls]?.[slot] ?? ARMOR_SHAPE[slot];
  fillShape(g, inside, (x, y) => {
    // (Leather boots for the cloth and the hunter's classes.)
    let c = shade(slot === 'boots' && cls !== 'warrior' ? [112, 74, 44] : p.main, Math.floor(hashPx(x, y) * 14) - 7);
    // Cloth folds for the robe and the skirt, a stitched seam for leather and a brushed shine for steel.
    if (cls === 'mage' && slot !== 'boots' && x % 4 === 0) c = shade(c, -14);
    if (cls === 'warrior' && (x * 3 + y * 5) % 11 === 0) c = shade(c, -34);
    if (cls === 'ranger' && slot !== 'boots' && (x + y) % 4 === 0) c = shade(c, -18);
    return c;
  });
  const set = (x: number, y: number, c: RGB): void => {
    if (x >= 0 && y >= 0 && x < N && y < N && g[y * N + x]) g[y * N + x] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: RGB): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  if (slot === 'helmet') {
    if (cls === 'warrior') {
      rect(7, 1, 8, 4, p.accent); // the crest
      rect(7, 5, 8, 8, p.dark); // the nose guard
      set(7, 4, p.trim);
      for (let x = 3; x <= 12; x++) set(x, 5, p.dark); // the rim
    } else if (cls === 'mage') {
      rect(5, 8, 10, 9, p.accent); // the band
      set(7, 4, p.trim);
      set(8, 5, p.trim);
      for (let x = 2; x <= 13; x++) set(x, 11, p.dark);
    } else {
      rect(10, 3, 12, 4, [214, 60, 52]); // a feather
      rect(11, 5, 12, 6, p.trim);
      for (let x = 4; x <= 11; x++) set(x, 6, p.dark); // the edge at the brow
    }
  } else if (slot === 'chestplate') {
    if (cls === 'warrior') {
      rect(7, 4, 8, 11, p.trim); // a gold cross
      rect(5, 6, 10, 7, p.trim);
      rect(1, 3, 3, 6, p.accent); // crimson sleeves
      rect(12, 3, 14, 6, p.accent);
      rect(4, 12, 11, 12, p.dark); // the belt
    } else if (cls === 'mage') {
      rect(7, 3, 8, 12, p.trim); // a stripe down the front
      rect(4, 11, 11, 11, p.accent); // the belt
      set(6, 6, [150, 220, 255]);
      set(9, 6, [150, 220, 255]);
    } else {
      for (let i = 0; i < 7; i++) set(4 + i, 4 + i, p.accent); // the bandolier
      rect(7, 3, 8, 13, p.dark);
      for (let y = 5; y <= 11; y += 2) set(7, y, p.trim); // the lacing
      rect(4, 12, 11, 12, p.accent);
    }
  } else if (slot === 'leggings') {
    if (cls === 'warrior') {
      rect(3, 2, 12, 3, p.dark);
      rect(3, 4, 12, 4, p.trim);
      set(4, 9, p.trim);
      set(11, 9, p.trim);
    } else if (cls === 'mage') {
      rect(3, 2, 12, 3, p.accent);
      rect(2, 14, 13, 14, p.trim); // a gold hem
    } else {
      rect(3, 2, 12, 3, p.dark);
      rect(3, 5, 12, 5, p.accent);
    }
  } else {
    // Boots: a darker sole and a cuff.
    rect(1, 12, 14, 13, cls === 'warrior' ? p.dark : [58, 38, 22]);
    if (cls === 'warrior') rect(2, 4, 13, 5, p.trim);
    else if (cls === 'mage') {
      rect(2, 4, 13, 5, p.trim);
      for (let y = 6; y <= 11; y++) {
        set(3, y, p.dark);
        set(10, y, p.dark);
      }
    } else {
      rect(2, 4, 13, 5, [236, 228, 200]); // a fur top
    }
  }
  return outline(bevel(g));
}

// ---- lanterns and chains --------------------------------------------------------------------------------

interface LanternPalette {
  iron: RGB;
  hi: RGB;
  dark: RGB;
  glow: RGB;
  outer: RGB;
  mid: RGB;
  core: RGB;
}

const LANTERN_PAL: LanternPalette = {
  iron: [92, 94, 100],
  hi: [140, 142, 150],
  dark: [58, 60, 66],
  glow: [128, 64, 18],
  outer: [236, 128, 30],
  mid: [255, 190, 62],
  core: [255, 244, 176],
};
// A darker frame and a blue flame.
const SOUL_PAL: LanternPalette = {
  iron: [52, 56, 70],
  hi: [88, 96, 118],
  dark: [32, 34, 46],
  glow: [18, 54, 108],
  outer: [34, 122, 230],
  mid: [88, 206, 255],
  core: [210, 255, 255],
};
const palOf = (soul: boolean): LanternPalette => (soul ? SOUL_PAL : LANTERN_PAL);

/**
 * The lantern seen from the side, laid out the way the mesh cuts it (see shapes.ts lanternBoxes): the cage is
 * columns 5-10, 7 rows tall; the lid, the ring and (hanging) the hook above it. Row numbers count up from the floor.
 */
function lanternSideGrid(soul: boolean, hanging: boolean): Cell[] {
  const p = palOf(soul);
  const g = blank();
  const at = (col: number, yb: number, c: RGB): void => dot(g, col, N - 1 - yb, c);
  const up = hanging ? 2 : 0;
  for (let c = 5; c <= 10; c++) {
    at(c, up, p.dark);
    at(c, up + 6, p.hi);
  }
  for (let r = 1; r <= 5; r++) {
    at(5, up + r, p.hi);
    at(10, up + r, p.dark);
    for (let c = 6; c <= 9; c++) at(c, up + r, p.glow);
  }
  for (const c of [6, 9]) for (const r of [2, 3]) at(c, up + r, p.outer);
  for (const c of [7, 8]) {
    at(c, up + 1, p.mid);
    at(c, up + 2, p.core);
    at(c, up + 3, p.core);
    at(c, up + 4, p.mid);
    at(c, up + 5, p.outer);
  }
  for (let c = 6; c <= 9; c++) {
    at(c, up + 7, p.dark);
    at(c, up + 8, p.hi);
    at(c, up + 10, c === 6 ? p.hi : p.iron);
  }
  at(6, up + 9, p.iron);
  at(9, up + 9, p.dark);
  if (hanging) {
    for (const c of [7, 8]) for (let r = 13; r <= 15; r++) at(c, r, r % 2 ? p.iron : p.hi);
  }
  return g;
}

/** The lid and the base: plain metal with a darker rim round the cage. */
function lanternTopGrid(soul: boolean): Cell[] {
  const p = palOf(soul);
  const g = blank();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const rim = x === 5 || x === 10 || y === 5 || y === 10;
      g[y * N + x] = rim ? p.dark : x >= 6 && x <= 9 && y >= 6 && y <= 9 ? p.hi : p.iron;
    }
  }
  return g;
}

/** The inventory picture: a cage with a flame, a lid and a ring. */
function lanternItemGrid(soul: boolean): Cell[] {
  const p = palOf(soul);
  const g = blank();
  const rect = (x0: number, y0: number, x1: number, y1: number, c: RGB): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dot(g, x, y, c);
  };
  rect(6, 1, 9, 1, p.hi);
  dot(g, 5, 2, p.iron);
  dot(g, 10, 2, p.dark);
  rect(4, 3, 11, 3, p.hi);
  rect(4, 4, 11, 4, p.iron);
  rect(3, 5, 12, 5, p.hi);
  rect(3, 6, 12, 12, p.glow);
  rect(3, 6, 3, 12, p.hi);
  rect(12, 6, 12, 12, p.dark);
  rect(6, 8, 9, 11, p.outer);
  rect(7, 7, 8, 12, p.mid);
  rect(7, 9, 8, 11, p.core);
  rect(3, 13, 12, 13, p.dark);
  rect(4, 14, 11, 14, p.iron);
  return outline(g);
}

/** Links alternate between facing us (a ring) and edge-on (a bar). */
function chainGrid(): Cell[] {
  const g = blank();
  const iron: RGB = [86, 88, 96];
  const hi: RGB = [132, 134, 144];
  const dark: RGB = [52, 54, 62];
  // Cols 6-9 of every row: the mesh is two crossed plates, each showing this window.
  for (let yb = 0; yb < N; yb++) {
    const y = N - 1 - yb;
    switch (yb % 4) {
      case 0:
        dot(g, 7, y, hi);
        dot(g, 8, y, iron);
        break;
      case 1:
      case 2:
        dot(g, 6, y, yb % 4 === 1 ? hi : iron);
        dot(g, 9, y, dark);
        break;
      default:
        dot(g, 7, y, iron);
        dot(g, 8, y, dark);
    }
  }
  return g;
}

function chainItemGrid(): Cell[] {
  const g = blank();
  const iron: RGB = [86, 88, 96];
  const hi: RGB = [140, 142, 152];
  const dark: RGB = [52, 54, 62];
  const ring = (y0: number): void => {
    for (let x = 6; x <= 9; x++) {
      dot(g, x, y0, hi);
      dot(g, x, y0 + 5, dark);
    }
    for (let y = y0 + 1; y <= y0 + 4; y++) {
      dot(g, 6, y, hi);
      dot(g, 9, y, dark);
    }
  };
  const bar = (y0: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) {
      dot(g, 7, y, hi);
      dot(g, 8, y, iron);
    }
  };
  ring(0);
  bar(4, 9);
  ring(8);
  bar(12, 15);
  return outline(g);
}

const BUILDERS: Record<string, () => Cell[]> = {
  lantern: () => lanternSideGrid(false, false),
  lantern_hang: () => lanternSideGrid(false, true),
  soul_lantern: () => lanternSideGrid(true, false),
  soul_lantern_hang: () => lanternSideGrid(true, true),
  lantern_top: () => lanternTopGrid(false),
  soul_lantern_top: () => lanternTopGrid(true),
  lantern_item: () => lanternItemGrid(false),
  soul_lantern_item: () => lanternItemGrid(true),
  chain: chainGrid,
  chain_item: chainItemGrid,
  birch_sapling: () => saplingGrid([112, 168, 76], [212, 210, 200]),
  spruce_sapling: () => saplingGrid([40, 92, 56], [70, 50, 34]),
  bucket: () => bucketGrid(null),
  water_bucket: () => bucketGrid([46, 100, 220]),
  lava_bucket: () => bucketGrid([248, 120, 24]),
  feather: featherGrid,
  mutton: () => meatCutGrid(true, 'chop'),
  cooked_mutton: () => meatCutGrid(false, 'chop'),
  chicken: () => meatCutGrid(true, 'leg'),
  cooked_chicken: () => meatCutGrid(false, 'leg'),
  rabbit: () => meatCutGrid(true, 'small'),
  cooked_rabbit: () => meatCutGrid(false, 'small'),
  ink_sac: inkSacGrid,
  slimeball: slimeballGrid,
  ender_pearl: enderPearlGrid,
  spider_eye: spiderEyeGrid,
  leather: leatherGrid,
  sapling: saplingGrid,
  acacia_sapling: () => saplingGrid([100, 154, 52], [132, 122, 110]),
  jungle_sapling: () => saplingGrid([44, 140, 36], [88, 68, 36]),
  dark_oak_sapling: () => saplingGrid([36, 96, 40], [60, 42, 26]),
  cherry_sapling: () => saplingGrid([246, 176, 204], [94, 58, 66]),
  fern: fernGrid,
  tulip_red: () => tulipGrid([214, 36, 40]),
  tulip_orange: () => tulipGrid([240, 124, 28]),
  tulip_white: () => tulipGrid([240, 240, 236]),
  tulip_pink: () => tulipGrid([246, 148, 190]),
  oxeye_daisy: () => ringFlowerGrid([248, 248, 244], [250, 204, 40], 2.6),
  cornflower: () => ringFlowerGrid([84, 110, 226], [214, 226, 250], 2.2),
  blue_orchid: () => ringFlowerGrid([46, 176, 228], [224, 248, 255], 2.4),
  allium: alliumGrid,
  azure_bluet: bluetGrid,
  brown_mushroom: () => mushroomGrid([142, 102, 72], null),
  red_mushroom: () => mushroomGrid([208, 44, 44], [244, 236, 224]),
  sugar_cane: sugarCaneGrid,
  lily_pad: lilyPadGrid,
  pink_petals: petalsGrid,
  cave_vines: () => caveVinesGrid(false),
  cave_vines_berries: () => caveVinesGrid(true),
  flowering_azalea: azaleaGrid,
  spore_blossom: sporeBlossomGrid,
  stalagmite_base: () => dripstoneGrid(false, false),
  stalagmite_tip: () => dripstoneGrid(true, false),
  stalactite_base: () => dripstoneGrid(false, true),
  stalactite_tip: () => dripstoneGrid(true, true),
  glow_lichen: glowLichenGrid,
  amethyst_cluster: amethystClusterGrid,
  flint: flintGrid,
  flint_and_steel: flintSteelGrid,
  shears: shearsGrid,
  minecart: minecartGrid,
  boat: boatGrid,
  lapis_lazuli: lapisGrid,
  experience_bottle: experienceBottleGrid,
  string: stringGrid,
  bow: () => bowGrid(),
  bow_frame: () => bowGrid(false),
  greatsword: greatswordGrid,
  dagger: daggerGrid,
  staff: staffGrid,
  wand: wandGrid,
  spellbook: spellbookGrid,
  crossbow: () => crossbowGrid(),
  crossbow_frame: () => crossbowGrid(false),
  orb: orbGrid,
  shield: shieldGrid,
  bed: () => bedGrid(),
  door: doorGrid,
  fence: fenceGrid,
  fence_gate: gateGrid,
  tall_grass: tallGrassGrid,
  dead_bush: deadBushGrid,
  rose: () => flowerGrid([204, 28, 40], [250, 214, 60]),
  dandelion: () => flowerGrid([250, 214, 40], [214, 150, 20]),
  torch: () => torchGrid(),
  redstone_torch: () => torchGrid([230, 40, 28], [255, 110, 90], [220, 40, 30]),
  redstone_torch_off: () => torchGrid([92, 28, 24], [120, 52, 46], null),
  redstone: redstoneGrid,
  wheat_0: () => wheatGrid(0),
  wheat_1: () => wheatGrid(1),
  wheat_2: () => wheatGrid(2),
  wheat_3: () => wheatGrid(3),
  wheat_seeds: seedsGrid,
  wheat: wheatItemGrid,
  bread: breadGrid,
  bone: boneGrid,
  arrow: arrowGrid,
  gunpowder: powderGrid,
  rotten_flesh: fleshGrid,
  stick: stickGrid,
  coal: coalGrid,
  raw_iron: () => rawOreGrid([222, 170, 140]),
  raw_gold: () => rawOreGrid([250, 214, 56]),
  iron_ingot: () => ingotGrid([210, 214, 220]),
  gold_ingot: () => ingotGrid([248, 208, 46]),
  diamond: diamondGrid,
  emerald: emeraldGrid,
  paper: paperGrid,
  map: mapGrid,
  book: () => bookGrid([150, 98, 52], false),
  enchanted_book: () => bookGrid([112, 58, 168], true),
  skillbook_warrior: () => skillBookGrid([170, 52, 44], 'sword'),
  skillbook_mage: () => skillBookGrid([58, 92, 190], 'star'),
  skillbook_ranger: () => skillBookGrid([62, 140, 66], 'arrow'),
  bag_1: () => bagGrid(1),
  bag_2: () => bagGrid(2),
  bag_3: () => bagGrid(3),
  bag_4: () => bagGrid(4),
  bag_5: () => bagGrid(5),
  bag_6: () => bagGrid(6),
  emberstone: emberstoneGrid,
  horn_fenrir: () => hornGrid([172, 66, 38], [236, 222, 186], [214, 96, 255]),
  horn_fenrir_black: () => hornGrid([48, 46, 58], [214, 204, 190], [255, 70, 50]),
  horn_fenrir_blue: () => hornGrid([44, 100, 204], [196, 232, 255], [96, 236, 255]),
  horn_fenrir_gold: () => hornGrid([238, 186, 50], [255, 246, 176], [255, 255, 190]),
  compass: () => compassGrid(0),
  jewel_dawn: () => jewelGrid('dawn'),
  jewel_rift: () => jewelGrid('rift'),
  jewel_bloom: () => jewelGrid('bloom'),
  apple: appleGrid,
  raw_meat: () => meatGrid(false),
  cooked_meat: () => meatGrid(true),
};
for (let f = 1; f < COMPASS_FRAMES; f++) BUILDERS[`compass_${f}`] = () => compassGrid(f);
DYE_NAMES.forEach((n, i) => {
  if (i === BED_RED) return;
  const c = DYE_RGB[i];
  BUILDERS[`bed_${n}`] = () => bedGrid([c[0] * 0.9, c[1] * 0.9, c[2] * 0.9]);
});
DYE_NAMES.forEach((n, i) => (BUILDERS[`dye_${n}`] = () => dyeGrid(DYE_RGB[i] as unknown as RGB)));
for (const m of TOOL_MATERIALS) for (const k of TOOL_KINDS) BUILDERS[`${m}_${k}`] = () => toolGrid(k, m);
for (const m of ARMOR_MATERIALS) for (const s of ARMOR_SLOTS) BUILDERS[`${m}_${s}`] = () => armorGrid(s, m);
for (const c of OUTFIT_CLASSES) ARMOR_SLOTS.forEach((s, i) => (BUILDERS[`outfit_${c}_${s}`] = () => outfitGrid(c, i)));

/** Returns a 16x16 RGBA getter for a sprite name, or null if the name is not an item sprite. */
export function spritePainter(name: string): ((x: number, y: number) => SpritePixel) | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const grid = build();
  // Tall grass is tinted by the biome: alpha 250 marks the pixels the shader may tint.
  const alpha = name === 'tall_grass' || name === 'fern' ? 250 : 255;
  return (x, y) => {
    const c = grid[y * N + x];
    return c ? [c[0], c[1], c[2], alpha] : [0, 0, 0, 0];
  };
}
