import { B, DYE_NAMES, DRESS, GROVE, idByName, MASONRY, terracottaOf } from './blocks';
import { Container, makeStack, maxStackOf } from './inventory';
import { I, dyeId, getItem } from './items';

const GREEN = dyeId(DYE_NAMES.indexOf('green'));

/** input item id -> output item id */
export const SMELTING = new Map<number, number>([
  [I.RAW_IRON, I.IRON_INGOT],
  [I.RAW_GOLD, I.GOLD_INGOT],
  // The ore blocks themselves (from creative mode or older saves) still smelt.
  [B.IRON_ORE, I.IRON_INGOT],
  [B.GOLD_ORE, I.GOLD_INGOT],
  [B.SAND, B.GLASS],
  [B.COBBLE, B.STONE],
  [I.RAW_MEAT, I.COOKED_MEAT],
  [I.MUTTON, I.COOKED_MUTTON],
  [I.CHICKEN, I.COOKED_CHICKEN],
  [I.RABBIT, I.COOKED_RABBIT],
  [I.RAW_COD, I.COOKED_COD],
  [I.RAW_SALMON, I.COOKED_SALMON],
  [I.POTATO, I.BAKED_POTATO],
  // Cactus cooks into green dye.
  [B.CACTUS, GREEN],
]);

/** Experience one smelted item is worth (fractions collect in the furnace and are paid out with the output). */
export const SMELT_XP = new Map<number, number>([
  [I.RAW_IRON, 0.7],
  [I.RAW_GOLD, 1],
  [B.IRON_ORE, 0.7],
  [B.GOLD_ORE, 1],
  [B.SAND, 0.1],
  [B.COBBLE, 0.1],
  [I.RAW_MEAT, 0.35],
  [I.MUTTON, 0.35],
  [I.CHICKEN, 0.35],
  [I.RABBIT, 0.35],
  [I.RAW_COD, 0.35],
  [I.RAW_SALMON, 0.35],
  [I.POTATO, 0.35],
  [B.CACTUS, 0.2],
]);

for (const row of MASONRY) {
  if (row.spec.smelt && row.cubeId) {
    const from = idByName(row.spec.smelt);
    if (!from) throw new Error(`masonry smelt ${row.spec.smelt} is not a block`);
    SMELTING.set(from, row.cubeId);
    SMELT_XP.set(from, 0.1);
  }
  if (row.spec.smeltSlab && row.slabBase >= 0) {
    const from = idByName(row.spec.smeltSlab);
    if (!from) throw new Error(`masonry smelt ${row.spec.smeltSlab} is not a block`);
    SMELTING.set(from, row.slabBase);
    SMELT_XP.set(from, 0.1);
  }
}
SMELTING.set(GROVE.packedMud, GROVE.mudBricks);
SMELT_XP.set(GROVE.packedMud, 0.1);
SMELTING.set(B.STONE_BRICKS, DRESS.crackedStone);
SMELT_XP.set(B.STONE_BRICKS, 0.1);
const deepslateBricks = idByName('deepslate_bricks');
if (deepslateBricks) {
  SMELTING.set(deepslateBricks, DRESS.crackedDeepslate);
  SMELT_XP.set(deepslateBricks, 0.1);
}
for (let c = 0; c < DYE_NAMES.length; c++) {
  const clay = terracottaOf(c);
  if (!clay) continue;
  SMELTING.set(clay, DRESS.glazed + c);
  SMELT_XP.set(clay, 0.1);
}

export const COOK_SECONDS = 10;

export const FURNACE_INPUT = 0;
export const FURNACE_FUEL = 1;
export const FURNACE_OUTPUT = 2;

export function isFuel(id: number): boolean {
  return getItem(id).fuel > 0;
}

/** Furnace block entity: three slots plus burn/cook timers. */
export class Furnace {
  readonly container = new Container(3);
  /** Seconds of fuel left in the current burn. */
  burnLeft = 0;
  /** Total seconds of the current fuel item (for the flame gauge). */
  burnTotal = 0;
  /** Seconds the current input has been cooking. */
  cook = 0;
  /** Experience earned by smelting that nobody has collected yet. */
  xpStored = 0;

  get lit(): boolean {
    return this.burnLeft > 0;
  }

  private canSmelt(): number | null {
    const input = this.container.get(FURNACE_INPUT);
    if (!input) return null;
    const out = SMELTING.get(input.id);
    if (out === undefined) return null;
    const dest = this.container.get(FURNACE_OUTPUT);
    if (!dest) return out;
    if (dest.id === out && dest.count < maxStackOf(dest)) return out;
    return null;
  }

  tick(dt: number): void {
    const target = this.canSmelt();

    if (this.burnLeft <= 0 && target !== null) {
      const fuel = this.container.get(FURNACE_FUEL);
      if (fuel && isFuel(fuel.id)) {
        this.burnTotal = this.burnLeft = getItem(fuel.id).fuel;
        fuel.count -= 1;
        if (fuel.count <= 0) this.container.set(FURNACE_FUEL, null);
      }
    }

    if (this.burnLeft > 0) {
      this.burnLeft = Math.max(0, this.burnLeft - dt);
      if (target !== null) {
        this.cook += dt;
        if (this.cook >= COOK_SECONDS) {
          this.cook = 0;
          const input = this.container.get(FURNACE_INPUT)!;
          this.xpStored += SMELT_XP.get(input.id) ?? 0;
          input.count -= 1;
          if (input.count <= 0) this.container.set(FURNACE_INPUT, null);
          const dest = this.container.get(FURNACE_OUTPUT);
          if (dest) dest.count += 1;
          else this.container.set(FURNACE_OUTPUT, makeStack(target, 1));
        }
      } else {
        this.cook = Math.max(0, this.cook - dt * 2);
      }
    } else if (this.cook > 0) {
      this.cook = Math.max(0, this.cook - dt * 2);
    }
  }

  /** Pay out the stored experience: the whole part, plus one more with the chance of the fraction (like the original). */
  takeXp(rand: () => number = Math.random): number {
    // Round away float dust (ten 0.7s are 7, not 6.9999...).
    const stored = Math.round(this.xpStored * 1e6) / 1e6;
    const whole = Math.floor(stored);
    const extra = rand() < stored - whole ? 1 : 0;
    this.xpStored = 0;
    return whole + extra;
  }

  toJSON() {
    return { c: this.container.toJSON(), burnLeft: this.burnLeft, burnTotal: this.burnTotal, cook: this.cook, xp: this.xpStored };
  }

  loadJSON(d: { c?: unknown; burnLeft?: number; burnTotal?: number; cook?: number; xp?: number }): void {
    this.container.loadJSON(d.c);
    this.burnLeft = Number(d.burnLeft) || 0;
    this.burnTotal = Number(d.burnTotal) || 0;
    this.cook = Number(d.cook) || 0;
    this.xpStored = Math.max(0, Math.min(10_000, Number(d.xp) || 0));
  }
}