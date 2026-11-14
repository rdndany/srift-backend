import { RECIPES, RecipeBook } from '@solrift/shared';
import { bumpUi, pushRecipeToast } from '../ui/store';
import type { ClientSession } from './clientSession';

/** The recipe book: remembers which items this player has held (per world, on this device). */
export class RecipeMemory {
  readonly book = new RecipeBook();
  /** What you already carry when the world opens is learned quietly; only later finds make an announcement. */
  private primed = false;

  /** `key` is where the browser keeps it; a guest's (`kept` false) is neither read nor written. */
  constructor(
    private readonly session: ClientSession,
    private readonly key: string,
    private readonly kept: boolean,
  ) {
    try {
      if (kept) this.book.loadJSON(JSON.parse(localStorage.getItem(key) ?? '[]'));
    } catch {
      /* a damaged note is as good as none */
    }
  }

  /** Learns what is carried now, and says so when that opens new recipes. */
  observe(): void {
    const ids: number[] = [];
    for (const s of this.session.inventory.slots) if (s) ids.push(s.id);
    for (const s of this.session.armor.slots) if (s) ids.push(s.id);
    const known = this.book.seen.size;
    const fresh = this.book.learn(ids);
    const quiet = !this.primed;
    this.primed = true;
    if (this.book.seen.size === known) return;
    if (!quiet && fresh.length > 0) pushRecipeToast([...new Set(fresh.map((i) => RECIPES[i].result.id))]);
    try {
      if (this.kept) localStorage.setItem(this.key, JSON.stringify(this.book.toJSON()));
    } catch {
      /* storage may be full or blocked; the book then forgets on reload */
    }
    bumpUi();
  }
}
