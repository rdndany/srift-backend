import { B } from './blocks';
import { Container, type ItemStack } from './inventory';
import { Furnace } from './smelting';

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Per-block state for chests and furnaces, keyed by position. */
export class BlockEntities {
  private chests = new Map<string, Container>();
  private furnaces = new Map<string, Furnace>();
  /**
   * Chests that generated with loot and were already rolled (opened or broken). Remembered so that
   * emptying one, or breaking it and placing another, never makes it fill up again.
   */
  private rolled = new Set<string>();

  /**
   * Supplies the contents of a chest that came with the world (a dungeon's, a village's), or null
   * for an ordinary chest. Set by the realm from the world generator.
   */
  loot: ((x: number, y: number, z: number) => (ItemStack | null)[] | null) | null = null;

  /** Roll a generated chest's loot the first time it is needed. */
  private roll(k: string, x: number, y: number, z: number): Container | null {
    if (this.rolled.has(k) || !this.loot) return null;
    const slots = this.loot(x, y, z);
    if (!slots) return null;
    this.rolled.add(k);
    const c = new Container(27);
    slots.forEach((s, i) => c.set(i, s));
    return c;
  }

  chest(x: number, y: number, z: number): Container {
    const k = key(x, y, z);
    let c = this.chests.get(k);
    if (!c) this.chests.set(k, (c = this.roll(k, x, y, z) ?? new Container(27)));
    return c;
  }

  furnace(x: number, y: number, z: number): Furnace {
    const k = key(x, y, z);
    let f = this.furnaces.get(k);
    if (!f) this.furnaces.set(k, (f = new Furnace()));
    return f;
  }

  /** Called when a block is broken: returns every stack that must be dropped. */
  remove(id: number, x: number, y: number, z: number): ItemStack[] {
    const k = key(x, y, z);
    if (id === B.CHEST) {
      const c = this.chests.get(k) ?? this.roll(k, x, y, z);
      this.chests.delete(k);
      return c ? c.drain() : [];
    }
    if (id === B.FURNACE) {
      const f = this.furnaces.get(k);
      this.furnaces.delete(k);
      return f ? f.container.drain() : [];
    }
    return [];
  }

  /** Forget every chest and furnace (and the memory of their loot) at the positions the test says yes to. */
  clearWhere(test: (x: number, y: number, z: number) => boolean): void {
    const gone = (k: string): boolean => {
      const [x, y, z] = k.split(',').map(Number);
      return test(x, y, z);
    };
    for (const m of [this.chests, this.furnaces]) for (const k of [...m.keys()]) if (gone(k)) m.delete(k);
    for (const k of [...this.rolled]) if (gone(k)) this.rolled.delete(k);
  }

  tick(dt: number): void {
    for (const f of this.furnaces.values()) f.tick(dt);
  }

  toJSON(): unknown {
    const chests: Record<string, unknown> = {};
    // A rolled chest is kept even when empty: its entry is what stops the loot from regenerating.
    for (const [k, c] of this.chests) if (!c.isEmpty() || this.rolled.has(k)) chests[k] = c.toJSON();
    const furnaces: Record<string, unknown> = {};
    for (const [k, f] of this.furnaces) if (!f.container.isEmpty()) furnaces[k] = f.toJSON();
    return this.rolled.size > 0 ? { chests, furnaces, rolled: [...this.rolled] } : { chests, furnaces };
  }

  loadJSON(data: unknown): void {
    const d = data as { chests?: Record<string, unknown>; furnaces?: Record<string, unknown>; rolled?: string[] } | null;
    if (!d || typeof d !== 'object') return;
    for (const k of Array.isArray(d.rolled) ? d.rolled : []) if (typeof k === 'string') this.rolled.add(k);
    for (const [k, v] of Object.entries(d.chests ?? {})) {
      const c = new Container(27);
      c.loadJSON(v);
      this.chests.set(k, c);
    }
    for (const [k, v] of Object.entries(d.furnaces ?? {})) {
      const f = new Furnace();
      f.loadJSON(v as never);
      this.furnaces.set(k, f);
    }
  }
}
