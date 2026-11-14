import { RECIPES, recipeIngredients, recipeLayout, type Recipe } from './crafting';
import { getItem } from './items';

/**
 * The recipe book. Like the original, a recipe shows up once you have held one of its ingredients, and
 * stays. The book only remembers which items have been seen, so it keeps working when recipes are added
 * or reordered. It is purely a client-side aid: crafting itself never depends on it.
 */

export type RecipeCategory = 'building' | 'tools' | 'armor' | 'food' | 'misc';

export const RECIPE_CATEGORIES: readonly { id: RecipeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'building', label: 'Building' },
  { id: 'tools', label: 'Tools' },
  { id: 'armor', label: 'Armor' },
  { id: 'food', label: 'Food' },
  { id: 'misc', label: 'Misc' },
];

/** Which tab a recipe lives under, from what it makes. */
export function recipeCategory(r: Recipe): RecipeCategory {
  const item = getItem(r.result.id);
  if (item.armor) return 'armor';
  if (item.tool || item.shield) return 'tools';
  if (item.food) return 'food';
  if (item.block != null && (item.id < 256 || item.id >= 1000)) return 'building';
  return 'misc';
}

/** Indices into `RECIPES` of the recipes that fit a grid of this size. */
export function recipesForGrid(size: number): number[] {
  const out: number[] = [];
  RECIPES.forEach((r, i) => {
    if (recipeLayout(r, size)) out.push(i);
  });
  return out;
}

export class RecipeBook {
  /** Item ids the player has held. */
  readonly seen = new Set<number>();

  /** Note the items that are held now. Returns true if that unlocked anything new. */
  observe(ids: Iterable<number>): boolean {
    let changed = false;
    for (const id of ids) {
      if (id > 0 && !this.seen.has(id)) {
        this.seen.add(id);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Like observe, but says which recipes (indices into RECIPES, whatever the grid size) this made
   * available for the first time. That is what the 'New Recipes Unlocked!' toast is about.
   */
  learn(ids: Iterable<number>): number[] {
    const fresh: number[] = [];
    for (const id of ids) if (id > 0 && !this.seen.has(id)) fresh.push(id);
    if (fresh.length === 0) return [];
    const before = RECIPES.map((r) => this.unlocked(r));
    this.observe(fresh);
    const out: number[] = [];
    RECIPES.forEach((r, i) => {
      if (!before[i] && this.unlocked(r)) out.push(i);
    });
    return out;
  }

  /** Has the player earned this recipe? (One ingredient is enough.) */
  unlocked(r: Recipe): boolean {
    return recipeIngredients(r).some((id) => this.seen.has(id));
  }

  /** The recipes to list for a grid size: all of them when `all`, otherwise the unlocked ones. */
  list(size: number, all: boolean): number[] {
    return recipesForGrid(size).filter((i) => all || this.unlocked(RECIPES[i]));
  }

  toJSON(): number[] {
    return [...this.seen].sort((a, b) => a - b);
  }

  loadJSON(data: unknown): void {
    if (!Array.isArray(data)) return;
    for (const v of data) if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 65536) this.seen.add(v);
  }
}
