/**
 * The blocks a finished place is dressed with: coloured glass, carpets, concrete, glazed clay,
 * candles, banners, flower pots, iron bars, cracked and chiselled stone, and signs.
 * Ids start at GROVE_NEXT. A sign is a wooden board; it does not store writing.
 */

export type DressRGB = [number, number, number];

export const DYE_ORDER = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;

/** Terracotta colours that were not already in the world. */
export const EXTRA_TERRACOTTA = ['magenta', 'light_blue', 'lime', 'pink', 'gray', 'cyan', 'purple', 'blue', 'green', 'black'] as const;

export const SIGN_WOODS: readonly { name: string; plank: string; rgb: DressRGB }[] = [
  { name: 'oak', plank: 'planks', rgb: [178, 144, 88] },
  { name: 'birch', plank: 'birch_planks', rgb: [196, 179, 123] },
  { name: 'spruce', plank: 'spruce_planks', rgb: [114, 84, 48] },
  { name: 'jungle', plank: 'jungle_planks', rgb: [160, 115, 80] },
  { name: 'acacia', plank: 'acacia_planks', rgb: [168, 90, 50] },
  { name: 'dark_oak', plank: 'dark_oak_planks', rgb: [66, 43, 20] },
  { name: 'cherry', plank: 'cherry_planks', rgb: [226, 178, 172] },
  { name: 'mangrove', plank: 'mangrove_planks', rgb: [116, 54, 48] },
  { name: 'pale_oak', plank: 'pale_oak_planks', rgb: [230, 224, 208] },
  { name: 'bamboo', plank: 'bamboo_planks', rgb: [196, 176, 80] },
  { name: 'poplar', plank: 'poplar_planks', rgb: [214, 206, 175] },
];

/** How many plants can sit in a flower pot. The registry fills them in this order. */
export const POT_COUNT = 26;

const DYE_RGB: readonly DressRGB[] = [
  [236, 240, 240],
  [240, 122, 28],
  [192, 76, 182],
  [60, 172, 214],
  [250, 210, 56],
  [124, 190, 30],
  [238, 134, 166],
  [68, 76, 80],
  [154, 154, 148],
  [22, 150, 150],
  [132, 50, 178],
  [58, 66, 164],
  [128, 82, 50],
  [92, 120, 24],
  [172, 46, 38],
  [30, 30, 36],
];

export const DRESS_TILE_RGB: Record<string, DressRGB> = {
  cracked_stone_bricks: [140, 140, 140],
  chiseled_stone_bricks: [148, 148, 148],
  cracked_deepslate_bricks: [54, 54, 58],
  chiseled_deepslate: [64, 64, 70],
  iron_bars: [176, 180, 188],
  flower_pot: [158, 98, 78],
};

for (let i = 0; i < DYE_ORDER.length; i++) {
  const n = DYE_ORDER[i];
  const rgb = DYE_RGB[i];
  DRESS_TILE_RGB[`stained_${n}`] = rgb;
  DRESS_TILE_RGB[`concrete_${n}`] = rgb;
  DRESS_TILE_RGB[`glazed_${n}`] = rgb;
  DRESS_TILE_RGB[`candle_${n}`] = rgb;
  DRESS_TILE_RGB[`banner_${n}`] = rgb;
}
DRESS_TILE_RGB.candle = [236, 224, 196];
for (const n of EXTRA_TERRACOTTA) DRESS_TILE_RGB[`terracotta_${n}`] = DYE_RGB[DYE_ORDER.indexOf(n)];
for (const w of SIGN_WOODS) DRESS_TILE_RGB[`${w.name}_sign`] = w.rgb;

export interface DressSign {
  name: string;
  plank: string;
  /** First of four floor facings. This id is the item. */
  standing: number;
  /** First of four wall facings. */
  wall: number;
}

export interface DressingLayout {
  crackedStone: number;
  crackedStoneSlab: number;
  crackedStoneStair: number;
  crackedStoneWall: number;
  chiseledStone: number;
  crackedDeepslate: number;
  crackedDeepslateSlab: number;
  crackedDeepslateStair: number;
  crackedDeepslateWall: number;
  chiseledDeepslate: number;
  ironBars: number;
  /** Stained glass, dye order. */
  glass: number;
  /** Stained glass panes, dye order. */
  pane: number;
  /** Carpets, dye order. */
  carpet: number;
  /** Concrete, dye order. */
  concrete: number;
  /** The ten terracotta colours that were missing, in EXTRA_TERRACOTTA order. */
  terracotta: number;
  /** Glazed terracotta, dye order. */
  glazed: number;
  /** Plain candle. Four ids: one candle, then two, three and four. */
  plainCandle: number;
  /** Coloured candles. Sixteen colours, four counts each. */
  dyeCandle: number;
  /** Floor banners. Sixteen colours, four facings each. The first of each colour is the item. */
  bannerFloor: number;
  /** Wall banners. Sixteen colours, four facings each. */
  bannerWall: number;
  signs: DressSign[];
  pot: number;
  /** First potted plant. The next POT_COUNT ids are spoken for. */
  potted: number;
  next: number;
}

export function layoutDressing(base: number): DressingLayout {
  let n = base;
  const take = (count = 1): number => {
    const id = n;
    n += count;
    return id;
  };
  const crackedStone = take();
  const crackedStoneSlab = take(2);
  const crackedStoneStair = take(8);
  const crackedStoneWall = take();
  const chiseledStone = take();
  const crackedDeepslate = take();
  const crackedDeepslateSlab = take(2);
  const crackedDeepslateStair = take(8);
  const crackedDeepslateWall = take();
  const chiseledDeepslate = take();
  const ironBars = take();
  const glass = take(16);
  const pane = take(16);
  const carpet = take(16);
  const concrete = take(16);
  const terracotta = take(EXTRA_TERRACOTTA.length);
  const glazed = take(16);
  const plainCandle = take(4);
  const dyeCandle = take(16 * 4);
  const bannerFloor = take(16 * 4);
  const bannerWall = take(16 * 4);
  const signs = SIGN_WOODS.map((w) => ({ name: w.name, plank: w.plank, standing: take(4), wall: take(4) }));
  const pot = take();
  const potted = take(POT_COUNT);
  return {
    crackedStone,
    crackedStoneSlab,
    crackedStoneStair,
    crackedStoneWall,
    chiseledStone,
    crackedDeepslate,
    crackedDeepslateSlab,
    crackedDeepslateStair,
    crackedDeepslateWall,
    chiseledDeepslate,
    ironBars,
    glass,
    pane,
    carpet,
    concrete,
    terracotta,
    glazed,
    plainCandle,
    dyeCandle,
    bannerFloor,
    bannerWall,
    signs,
    pot,
    potted,
    next: n,
  };
}
