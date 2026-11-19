import { Container, cloneStack, type ItemStack } from './inventory';
import { isUndroppable } from './items';

/**
 * The Stash of Dawnwatch: a chest in the town that belongs to a wallet, not to one character. Whatever one of its characters puts
 * in can be taken out by any other character of the same wallet (a mage leaves a wand, the warrior picks it up). It is never
 * shared with other players: it is found by the wallet alone, and only a signed-in character can open it.
 *
 * Pure data and rules, no world: the server holds one vault for the whole realm and writes an owner's stash down when it changes.
 */

/** The id of the Stashkeeper (an NPC, see `NPCS`): his window is the stash. */
export const STASHKEEPER = 'stashkeeper';

/** How many slots a stash has (six rows of nine). */
export const STASH_SLOTS = 54;

/** What the stash window shows: the slots, in order (null is empty). */
export interface StashView {
  slots: (ItemStack | null)[];
}

/** What a player can ask of the stash: move `count` of an inventory slot in, or `count` of a stash slot out. */
export type StashCommand = { a: 'put'; slot: number; count: number } | { a: 'take'; slot: number; count: number };

/** Why a stack cannot be put in (null: it can). */
export function stashBlocker(stack: ItemStack | null): string | null {
  if (!stack) return 'There is nothing there.';
  if (isUndroppable(stack.id)) return 'That cannot be stored.';
  return null;
}

/** A saved stash read as the window shows it, without a vault (what the lobby shows of a wallet whose characters are all away). */
export function stashViewOf(raw: unknown): StashView {
  const c = new Container(STASH_SLOTS);
  c.loadJSON(raw);
  return { slots: c.slots.map((s) => (s ? cloneStack(s) : null)) };
}

/** Every stash the realm knows, by owner (a wallet address). */
export class StashVault {
  private readonly stashes = new Map<string, Container>();
  /** Owners whose stash changed since it was last written down. */
  readonly dirty = new Set<string>();

  has(owner: string): boolean {
    return this.stashes.has(owner);
  }

  /** Read an owner's stash from what was saved (once: a stash that is already here is the newer one). */
  load(owner: string, raw: unknown): void {
    if (this.stashes.has(owner)) return;
    const c = new Container(STASH_SLOTS);
    c.loadJSON(raw);
    this.stashes.set(owner, c);
  }

  /** An owner's stash (an empty one when nothing was ever stored). */
  of(owner: string): Container {
    let c = this.stashes.get(owner);
    if (!c) {
      c = new Container(STASH_SLOTS);
      this.stashes.set(owner, c);
    }
    return c;
  }

  view(owner: string): StashView {
    return { slots: this.of(owner).slots.map((s) => (s ? cloneStack(s) : null)) };
  }

  toJSON(owner: string): unknown {
    return this.of(owner).toJSON();
  }

  /**
   * Move up to `count` of `stack` into the owner's stash. Returns how many went in (0: the stash is full of other things); the
   * caller takes that many away from where the stack came from.
   */
  put(owner: string, stack: ItemStack, count: number): number {
    const stash = this.of(owner);
    const part = { ...cloneStack(stack), count: Math.max(1, Math.min(count, stack.count)) };
    const before = part.count;
    const left = stash.add(part);
    const moved = before - (left ? left.count : 0);
    if (moved > 0) this.dirty.add(owner);
    return moved;
  }

  /** The stack in a stash slot, or null. */
  peek(owner: string, slot: number): ItemStack | null {
    return slot >= 0 && slot < STASH_SLOTS ? this.of(owner).get(slot) : null;
  }

  /** Remove `count` (at most what is there) from a stash slot: what a withdrawal took away once it was handed over. */
  remove(owner: string, slot: number, count: number): void {
    const s = this.peek(owner, slot);
    if (!s) return;
    s.count -= Math.max(0, Math.min(count, s.count));
    this.of(owner).set(slot, s.count > 0 ? s : null);
    this.dirty.add(owner);
  }
}