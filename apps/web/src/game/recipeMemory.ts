import { RecipeBook } from '@solrift/shared';
import { bumpUi } from '../ui/store';
import type { ClientSession } from './clientSession';

/**
 * The recipe book's memory: which items this player has held (per world, on this device). The book lists every recipe whether or not it has been found,
 * so nothing is announced as unlocked; what is remembered only says which recipes the player has met.
 */
export class RecipeMemory {
  readonly book = new RecipeBook();

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

  /** Learns what is carried now. */
  observe(): void {
    const ids: number[] = [];
    for (const s of this.session.inventory.slots) if (s) ids.push(s.id);
    for (const s of this.session.armor.slots) if (s) ids.push(s.id);
    const known = this.book.seen.size;
    this.book.observe(ids);
    if (this.book.seen.size === known) return;
    try {
      if (this.kept) localStorage.setItem(this.key, JSON.stringify(this.book.toJSON()));
    } catch {
      /* storage may be full or blocked; the book then forgets on reload */
    }
    bumpUi();
  }
}
