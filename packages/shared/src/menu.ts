import { ARMOR_SLOTS } from './armor';
import { BAG_MAX, BAG_MENU_SLOTS, BAG_SLOTS, bagFits, bagRoom } from './bags';
import { RECIPES, findRecipe, recipeLayout } from './crafting';
import {
  Container,
  HOTBAR_SLOTS,
  PLAYER_SLOTS,
  canMerge,
  cloneStack,
  makeStack,
  maxStackOf,
  type ItemStack,
} from './inventory';
import {
  ANVIL_MAX_COST,
  anvilResult,
  grindResult,
  canInscribe,
  erased,
  glyphOptions,
  inscribed,
  failedPrice,
  type AnvilResult,
  type GrindResult,
  type GlyphOption,
} from './enchant';
import type { ClassId } from './classes';
import type { CreativeAmount } from './creative';
import { canRollGear } from './gear';
import { ACCESSORY_SLOT_COUNT, NECKLACE_SLOT, accessorySlotsOf } from './accessories';
import { I, accessoryOfItem, allItems, bagSlotsOf, companionOfItem, getItem, holdsInOffhand, mountOfItem, outfitSetFits, outfitSetOfItem, prefersOffhand, wingOfItem } from './items';
import { FORGE_CHANCE, FORGE_TIME, canForge, forgeCost, forgeLayout, forgeOutcome, forgePiece, forgeTarget, jewelKind, useJewel, type ForgeOutcome } from './jewels';
import { FURNACE_FUEL, FURNACE_INPUT, FURNACE_OUTPUT, SMELTING, isFuel, type Furnace } from './smelting';
import { addVillagerXp, canTradeOffer, type Offer, type TradeBook } from './trading';

/**
 * Inventory "menus" (GUI screens) with the original game's click semantics.
 * Pure logic: no DOM. Slots 0..35 are always the player's inventory
 * (0-8 hotbar, 9-35 main); screen-specific slots follow.
 */

export type SlotKind = 'normal' | 'result' | 'output' | 'fuel' | 'input' | 'palette';
export type MenuKind = 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative' | 'trade' | 'enchant' | 'anvil' | 'grindstone';

export interface Slot {
  container: Container;
  index: number;
  kind: SlotKind;
  accepts?: (s: ItemStack) => boolean;
  /** When this says no the stack in the slot cannot be picked up (a bag that still holds items). */
  canTake?: () => boolean;
}

export abstract class Menu {
  abstract readonly kind: MenuKind;
  readonly slots: Slot[] = [];
  cursor: ItemStack | null = null;

  constructor(readonly player: Container) {
    for (let i = 0; i < PLAYER_SLOTS; i++) this.slots.push({ container: player, index: i, kind: 'normal' });
  }

  /** Where the bag slots begin in `slots` (the four bag slots, then the room of each bag), or -1 before `attachBags`. */
  bagStart = -1;

  /**
   * Add the bags to the end of the slots, whatever the screen: the four slots the bags are worn in, then the slots of
   * every bag's room (`BAG_MAX` each; the ones of a bag that is not worn are shut). They come last so that the slots
   * each screen has of its own keep their places, and `BAG_MENU_SLOTS` is all that a client needs to know about them.
   * `inventory` is the player's inventory (where the room of the bags is) and `bags` what the bags are worn in.
   */
  attachBags(inventory: Container, bags: Container): void {
    if (this.bagStart >= 0) return;
    this.bagStart = this.slots.length;
    for (let b = 0; b < BAG_SLOTS; b++) {
      this.slots.push({
        container: bags,
        index: b,
        kind: 'normal',
        accepts: (s) => bagSlotsOf(s.id) > 0 && bagFits(inventory, b, bagSlotsOf(s.id)),
        canTake: () => bagFits(inventory, b, 0),
      });
    }
    for (let b = 0; b < BAG_SLOTS; b++) {
      for (let k = 0; k < BAG_MAX; k++) {
        const index = bagRoom(b) + k;
        this.slots.push({ container: inventory, index, kind: 'normal', accepts: () => inventory.isUsable(index) });
      }
    }
  }

  /** Is slot `i` of the screen in the room of a bag? */
  isBagRoom(i: number): boolean {
    return this.bagStart >= 0 && i >= this.bagStart + BAG_SLOTS && i < this.bagStart + BAG_MENU_SLOTS;
  }

  /** Is slot `i` one of the four slots the bags are worn in? */
  isBagSlot(i: number): boolean {
    return this.bagStart >= 0 && i >= this.bagStart && i < this.bagStart + BAG_SLOTS;
  }

  stackAt(i: number): ItemStack | null {
    const s = this.slots[i];
    return s ? s.container.get(s.index) : null;
  }

  /** What the player carries or wears on this screen: the places a jewel works on (the bags, and the armor and off hand). */
  protected jewelContainers(): Container[] {
    return [this.player];
  }

  /** The piece of equipment in slot `i` that a jewel can be used on, if there is one. */
  jewelTarget(i: number): ItemStack | null {
    const slot = this.slots[i];
    if (!slot || slot.kind !== 'normal' || !this.jewelContainers().includes(slot.container)) return null;
    const stack = slot.container.get(slot.index);
    return stack && canRollGear(stack.id) ? stack : null;
  }

  /** Would the jewel in the hand do something to the piece in slot `i`? (Not when it would be refused.) */
  jewelFits(i: number): boolean {
    const kind = this.cursor ? jewelKind(this.cursor.id) : null;
    const target = kind ? this.jewelTarget(i) : null;
    return !!kind && !!target && useJewel(kind, target, () => 0.5).used;
  }

  /** Hook: called after any change so subclasses can recompute derived slots. */
  protected changed(): void {}

  /** Told what came out of a result or output slot (a crafted or smelted stack), for the player's quests. */
  taken?: (stack: ItemStack, kind: MenuKind) => void;

  /** Hook: a result/output slot was taken. */
  protected onTake(_slot: Slot): void {}

  click(i: number, button: 0 | 1): void {
    const slot = this.slots[i];
    if (!slot) return;
    if (slot.kind === 'result' || slot.kind === 'output') return this.clickTakeOnly(slot);
    if (slot.kind === 'palette') return this.clickPalette(slot, button);

    const s = slot.container.get(slot.index);
    const c = this.cursor;
    if (c && slot.accepts && !slot.accepts(c)) return;

    if (!c) {
      if (!s) return;
      if (slot.canTake && !slot.canTake()) return;
      if (button === 0) {
        this.cursor = s;
        slot.container.set(slot.index, null);
      } else {
        const take = Math.ceil(s.count / 2);
        this.cursor = { ...s, count: take };
        s.count -= take;
        if (s.count <= 0) slot.container.set(slot.index, null);
      }
    } else if (!s) {
      const n = Math.min(button === 0 ? c.count : 1, maxStackOf(c));
      slot.container.set(slot.index, { ...c, count: n });
      c.count -= n;
      if (c.count <= 0) this.cursor = null;
    } else if (canMerge(s, c)) {
      const room = maxStackOf(s) - s.count;
      const n = Math.min(room, button === 0 ? c.count : 1);
      s.count += n;
      c.count -= n;
      if (c.count <= 0) this.cursor = null;
    } else if (button === 0) {
      slot.container.set(slot.index, c);
      this.cursor = s;
    }
    this.changed();
  }

  private clickTakeOnly(slot: Slot): void {
    const s = slot.container.get(slot.index);
    if (!s) return;
    const c = this.cursor;
    if (c) {
      if (!canMerge(c, s) || c.count + s.count > maxStackOf(c)) return;
      c.count += s.count;
    } else {
      this.cursor = cloneStack(s);
    }
    slot.container.set(slot.index, null);
    this.taken?.(cloneStack(s), this.kind);
    this.onTake(slot);
    this.changed();
  }

  protected clickPalette(_slot: Slot, _button: 0 | 1): void {}

  /** Candidate target slots for a shift-click from slot `from` (in priority order). */
  protected quickTargets(from: number, _stack: ItemStack): number[] {
    const range = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k);
    if (from < PLAYER_SLOTS) {
      return from < HOTBAR_SLOTS ? range(HOTBAR_SLOTS, PLAYER_SLOTS) : range(0, HOTBAR_SLOTS);
    }
    return range(0, PLAYER_SLOTS);
  }

  /** Insert into the listed slots (merge first, then empties). Returns what was left over. */
  protected insertInto(targets: number[], stack: ItemStack): ItemStack | null {
    const max = maxStackOf(stack);
    for (const t of targets) {
      const slot = this.slots[t];
      if (slot.kind !== 'normal' && slot.kind !== 'input' && slot.kind !== 'fuel') continue;
      if (slot.accepts && !slot.accepts(stack)) continue;
      const s = slot.container.get(slot.index);
      if (s && canMerge(s, stack) && s.count < max) {
        const n = Math.min(max - s.count, stack.count);
        s.count += n;
        stack.count -= n;
        if (stack.count <= 0) return null;
      }
    }
    for (const t of targets) {
      const slot = this.slots[t];
      if (slot.kind !== 'normal' && slot.kind !== 'input' && slot.kind !== 'fuel') continue;
      if (slot.accepts && !slot.accepts(stack)) continue;
      if (!slot.container.get(slot.index)) {
        const n = Math.min(max, stack.count);
        slot.container.set(slot.index, { ...stack, count: n });
        stack.count -= n;
        if (stack.count <= 0) return null;
      }
    }
    return stack.count > 0 ? stack : null;
  }

  shiftClick(i: number): void {
    const slot = this.slots[i];
    if (!slot) return;

    if (slot.kind === 'result') {
      // Craft repeatedly straight into the inventory while it fits.
      for (let guard = 0; guard < 576; guard++) {
        const r = slot.container.get(slot.index);
        if (!r || !this.player.canFit(r)) break;
        this.player.add(cloneStack(r));
        slot.container.set(slot.index, null);
        this.taken?.(cloneStack(r), this.kind);
        this.onTake(slot);
      }
      this.changed();
      return;
    }
    if (slot.kind === 'output') {
      const s = slot.container.get(slot.index);
      if (s && this.player.canFit(s)) {
        this.player.add(cloneStack(s));
        slot.container.set(slot.index, null);
        this.taken?.(cloneStack(s), this.kind);
        this.onTake(slot);
      }
      this.changed();
      return;
    }
    if (slot.kind === 'palette') {
      const s = slot.container.get(slot.index);
      if (s) this.player.add(makeStack(s.id, maxStackOf(s)));
      this.changed();
      return;
    }

    const stack = slot.container.get(slot.index);
    if (!stack) return;
    if (slot.canTake && !slot.canTake()) return;

    // A bag goes into a free bag slot (on the inventory screen, where they are shown).
    if (this.kind === 'inventory' && this.bagStart >= 0 && !this.isBagSlot(i) && bagSlotsOf(stack.id) > 0) {
      const free = this.insertInto(Array.from({ length: BAG_SLOTS }, (_, b) => this.bagStart + b), stack);
      if (!free) {
        slot.container.set(slot.index, null);
        this.changed();
        return;
      }
    }

    // What sits in the room of a bag moves as if it lay in the backpack.
    const targets = this.quickTargets(this.isBagRoom(i) ? HOTBAR_SLOTS : i, stack);
    const wentToPlayer = targets.some((t) => t < PLAYER_SLOTS);
    let left = this.insertInto(targets, stack);
    // Then into the bags, when the backpack could not take it all (never into the very bag it is leaving).
    if (left && wentToPlayer && this.bagStart >= 0 && !this.isBagSlot(i)) {
      left = this.insertInto(
        Array.from({ length: BAG_SLOTS * BAG_MAX }, (_, k) => this.bagStart + BAG_SLOTS + k).filter((t) => t !== i),
        left,
      );
    }
    slot.container.set(slot.index, left);
    this.changed();
  }

  /**
   * Called when the screen closes. Returns stacks that don't belong to any
   * persistent container (cursor, crafting grid) so the caller can return or drop them.
   */
  close(): ItemStack[] {
    const out: ItemStack[] = [];
    if (this.cursor) out.push(this.cursor);
    this.cursor = null;
    return out;
  }

  /** Total number of items currently held anywhere in this menu (for conservation checks). */
  abstract totalItems(): number;
}

// ---------------------------------------------------------------------------

/** Player inventory (2x2 grid) or crafting table (3x3 grid). */
/** How long a recipe takes to craft with the button, in seconds (the forge past +9 takes longer, see `FORGE_TIME`). */
export const CRAFT_TIME = 0.9;

export class CraftingMenu extends Menu {
  readonly kind: MenuKind;
  readonly grid: Container;
  readonly result = new Container(1);
  readonly gridStart = PLAYER_SLOTS;
  readonly resultSlot: number;
  /** First of the four armor slots (helmet, chestplate, leggings, boots), or -1 on a crafting table. */
  readonly armorStart: number;
  /** The off-hand slot (it takes a shield), right after the armor slots; -1 when there is none. */
  readonly offhandSlot: number;
  /** The mount slot (it takes a mount horn), right after the off-hand slot; -1 when there is none. */
  readonly mountSlot: number;
  /** The outfit slot (it takes a glowing set of the hero's class), right after the mount slot; -1 when there is none. */
  readonly outfitSlot: number;
  /** The companion slot (it takes a companion), right after the outfit slot; -1 when there is none. */
  readonly companionSlot: number;
  /** The wing slot (it takes a pair of wings), right after the companion slot; -1 when there is none. */
  readonly wingSlot: number;
  /** The first of the three jewelry slots (ring, ring, necklace), right after the wing slot; -1 when there is none. */
  readonly accessoryStart: number;

  constructor(
    player: Container,
    readonly size: 2 | 3,
    /** What the player wears. Only the inventory screen (2x2) shows it. */
    readonly armor: Container | null = null,
    /** The off hand, shown beside the armor on the inventory screen. */
    readonly offhand: Container | null = null,
    /** The mount, shown beside the off hand on the inventory screen. */
    readonly mount: Container | null = null,
    /** The outfit, shown beside the mount on the inventory screen. */
    readonly outfit: Container | null = null,
    /** The class of the hero (the slot takes only the sets of its class; null: any). */
    readonly outfitClass: () => ClassId | null = () => null,
    /** The companion, shown beside the outfit on the inventory screen. */
    readonly companion: Container | null = null,
    /** The wings, shown beside the companion on the inventory screen. */
    readonly wings: Container | null = null,
    /** The rings and the necklace (slots 0, 1 and 2), shown beside the wings on the inventory screen. */
    readonly accessories: Container | null = null,
  ) {
    super(player);
    this.kind = size === 2 ? 'inventory' : 'crafting';
    this.grid = new Container(size * size);
    for (let i = 0; i < size * size; i++) this.slots.push({ container: this.grid, index: i, kind: 'normal' });
    this.resultSlot = this.slots.length;
    this.slots.push({ container: this.result, index: 0, kind: 'result' });
    this.armorStart = size === 2 && armor ? this.slots.length : -1;
    if (this.armorStart >= 0) {
      ARMOR_SLOTS.forEach((_, slotIndex) => {
        // Each armor slot takes only its own kind of piece.
        this.slots.push({ container: armor!, index: slotIndex, kind: 'normal', accepts: (s) => getItem(s.id).armor?.slotIndex === slotIndex });
      });
    }
    this.offhandSlot = this.armorStart >= 0 && offhand ? this.slots.length : -1;
    if (this.offhandSlot >= 0) this.slots.push({ container: offhand!, index: 0, kind: 'normal', accepts: (s) => holdsInOffhand(s.id) });
    this.mountSlot = this.offhandSlot >= 0 && mount ? this.slots.length : -1;
    if (this.mountSlot >= 0) this.slots.push({ container: mount!, index: 0, kind: 'normal', accepts: (s) => mountOfItem(s.id) !== null });
    this.outfitSlot = this.mountSlot >= 0 && outfit ? this.slots.length : -1;
    if (this.outfitSlot >= 0) this.slots.push({ container: outfit!, index: 0, kind: 'normal', accepts: (s) => outfitSetFits(s.id, this.outfitClass()) });
    this.companionSlot = this.outfitSlot >= 0 && companion ? this.slots.length : -1;
    if (this.companionSlot >= 0) this.slots.push({ container: companion!, index: 0, kind: 'normal', accepts: (s) => companionOfItem(s.id) !== null });
    this.wingSlot = this.companionSlot >= 0 && wings ? this.slots.length : -1;
    if (this.wingSlot >= 0) this.slots.push({ container: wings!, index: 0, kind: 'normal', accepts: (s) => wingOfItem(s.id) !== null });
    this.accessoryStart = this.wingSlot >= 0 && accessories ? this.slots.length : -1;
    if (this.accessoryStart >= 0) {
      // Two ring slots and a necklace slot: each takes only its own kind.
      for (let i = 0; i < ACCESSORY_SLOT_COUNT; i++) {
        const kind = i === NECKLACE_SLOT ? 'necklace' : 'ring';
        this.slots.push({ container: accessories!, index: i, kind: 'normal', accepts: (s) => accessoryOfItem(s.id)?.kind === kind });
      }
    }
  }

  protected override jewelContainers(): Container[] {
    return [this.player, ...(this.armor ? [this.armor] : []), ...(this.offhand ? [this.offhand] : []), ...(this.mount ? [this.mount] : []), ...(this.outfit ? [this.outfit] : []), ...(this.companion ? [this.companion] : []), ...(this.wings ? [this.wings] : []), ...(this.accessories ? [this.accessories] : [])];
  }

  /** Shift-click puts armor on (into an empty slot of its kind) instead of moving it around the inventory. */
  protected override quickTargets(from: number, stack: ItemStack): number[] {
    const def = getItem(stack.id).armor;
    if (def && this.armorStart >= 0 && from < PLAYER_SLOTS && !this.armor!.get(def.slotIndex)) return [this.armorStart + def.slotIndex];
    if (prefersOffhand(stack.id) && this.offhandSlot >= 0 && from < PLAYER_SLOTS && !this.offhand!.get(0)) return [this.offhandSlot];
    if (mountOfItem(stack.id) !== null && this.mountSlot >= 0 && from < PLAYER_SLOTS && !this.mount!.get(0)) return [this.mountSlot];
    if (outfitSetOfItem(stack.id) && this.outfitSlot >= 0 && from < PLAYER_SLOTS && !this.outfit!.get(0) && outfitSetFits(stack.id, this.outfitClass())) return [this.outfitSlot];
    if (companionOfItem(stack.id) && this.companionSlot >= 0 && from < PLAYER_SLOTS && !this.companion!.get(0)) return [this.companionSlot];
    if (wingOfItem(stack.id) && this.wingSlot >= 0 && from < PLAYER_SLOTS && !this.wings!.get(0)) return [this.wingSlot];
    const jewelry = accessoryOfItem(stack.id);
    if (jewelry && this.accessoryStart >= 0 && from < PLAYER_SLOTS) {
      const free = accessorySlotsOf(jewelry.kind).find((i) => !this.accessories!.get(i));
      if (free !== undefined) return [this.accessoryStart + free];
    }
    return super.quickTargets(from, stack);
  }

  protected override changed(): void {
    this.recalc();
  }

  /**
   * The crafting at work (see `startForge`): what is made, how long it has been and how long it takes, and how it comes out
   * (decided when it started). `sets` is how many crafts of a recipe it is (0 for the forge past +9).
   */
  forging: { elapsed: number; duration: number; sets: number; outcome: ForgeOutcome | null } | null = null;
  /** What was made, waiting in the result slot to be taken. */
  private forged: ItemStack | null = null;

  /** Is there something in the result slot that was made (and not just the preview of a recipe)? */
  get hasMade(): boolean {
    return this.forged !== null;
  }

  /** For a client that mirrors the server's menu: take over whether the crafting is at work and whether what was made waits in the result slot. */
  adoptCraft(craft: { forging: { duration: number; sets: number } | null; made: boolean } | null): void {
    this.forging = craft?.forging ? { elapsed: 0, duration: craft.forging.duration, sets: craft.forging.sets, outcome: null } : null;
    this.forged = craft?.made ? this.result.get(0) : null;
  }

  /** The grid holds a piece and the jewels for the next step past +9, and the forge can be started: the level it is at, and the chance. */
  forgeReady(): { plus: number; chance: number } | null {
    if (this.forging || this.forged) return null;
    const f = forgePiece(this.grid.slots);
    return f ? { plus: f.plus, chance: FORGE_CHANCE } : null;
  }

  /** The grid makes a recipe and it can be crafted with the button: what it makes. (The result slot shows it as a preview.) */
  craftReady(): ItemStack | null {
    if (this.forging || this.forged || forgePiece(this.grid.slots)) return null;
    return this.result.get(0);
  }

  /**
   * Start crafting what is in the grid, with the button: a piece with its jewels is forged (it can fail, see `forgeOutcome`), and
   * a recipe is crafted (with `all`, as many times as the grid has the items for). The dice are rolled now, the grid is locked
   * while it works, the items stay where they are, and `stepForge` brings the outcome after `FORGE_TIME` seconds for the
   * forge and `CRAFT_TIME` for a recipe: then the items are used up and what was made is in the result slot.
   */
  startForge(rand: () => number, all = false): boolean {
    if (this.forging || this.forged) return false;
    const up = forgeOutcome(this.grid.slots, rand);
    if (up) {
      this.forging = { elapsed: 0, duration: FORGE_TIME, sets: 0, outcome: up };
      this.recalc();
      return true;
    }
    const r = findRecipe(this.grid.slots, this.size, this.size);
    if (!r) return false;
    let sets = 1;
    if (all) {
      const have = this.grid.slots.filter((s): s is ItemStack => !!s).map((s) => s.count);
      sets = Math.max(1, Math.min(...have, Math.floor(getItem(r.result.id).maxStack / r.result.count)));
    }
    const stack = makeStack(r.result.id, r.result.count * sets);
    this.forging = { elapsed: 0, duration: CRAFT_TIME, sets, outcome: { ok: true, stack, text: '', label: '', detail: '' } };
    this.recalc();
    return true;
  }

  /** Let `dt` seconds pass for the crafting. Returns the outcome when it is done (what was made is then in the result slot). */
  stepForge(dt: number): (ForgeOutcome & { sets: number }) | null {
    if (!this.forging) return null;
    this.forging.elapsed += dt;
    return this.forging.elapsed >= this.forging.duration ? this.finishForge() : null;
  }

  private finishForge(): (ForgeOutcome & { sets: number }) | null {
    const f = this.forging;
    if (!f) return null;
    this.forging = null;
    if (f.sets === 0) {
      this.grid.drain(); // the jewels are used up, and the piece comes out as the outcome
    } else {
      // A recipe uses up `sets` of every item in the grid.
      for (let i = 0; i < this.grid.size; i++) {
        const s = this.grid.get(i);
        if (!s) continue;
        s.count -= f.sets;
        if (s.count <= 0) this.grid.set(i, null);
      }
    }
    if (!f.outcome) return null;
    this.forged = f.outcome.stack;
    this.recalc();
    return { ...f.outcome, sets: f.sets };
  }
  /** While the forge works the grid is locked. */
  override click(i: number, button: 0 | 1): void {
    if (this.forging && this.slots[i]?.container === this.grid) return;
    super.click(i, button);
  }

  override shiftClick(i: number): void {
    if (this.forging && this.slots[i]?.container === this.grid) return;
    super.shiftClick(i);
  }

  recalc(): void {
    // What the forge made stays in the result slot until it is taken; while it works there is nothing to take.
    if (this.forged) {
      this.result.set(0, this.forged);
      return;
    }
    if (this.forging || forgePiece(this.grid.slots)) {
      this.result.set(0, null);
      return;
    }
    const r = findRecipe(this.grid.slots, this.size, this.size);
    this.result.set(0, r ? makeStack(r.result.id, r.result.count) : null);
  }

  /**
   * The recipe book's click on a step past +9: a piece at +(target-1) from the bags goes into the first cell of the grid, with the
   * Jewels of the Rift and of Dawn it takes after it (see `forgeLayout`). What was in the grid goes back to the bags first.
   * Does nothing, and changes nothing, when the bags lack the piece or the jewels or the grid is too small.
   */
  fillForge(target: number): boolean {
    if (this.forging) return false;
    const cost = forgeCost(target - 1);
    // The piece and a stack of each jewel take three cells, so even the 2x2 grid of the inventory has room.
    if (cost === null || this.grid.size < 3 || !canForge(target, [this.player, this.grid])) return false;
    const playerBefore = this.player.toJSON();
    const gridBefore = this.grid.toJSON();
    const undo = (): false => {
      this.player.loadJSON(playerBefore);
      this.grid.loadJSON(gridBefore);
      return false;
    };
    for (const stack of this.grid.drain()) {
      if (this.player.add(stack)) return undo();
    }
    const at = this.player.slots.findIndex((s) => !!s && canRollGear(s.id) && s.count === 1 && (s.gear?.u ?? 0) === target - 1);
    const piece = at >= 0 ? this.player.get(at) : null;
    if (!piece || !this.player.remove(I.JEWEL_RIFT, cost) || !this.player.remove(I.JEWEL_DAWN, cost)) return undo();
    this.player.set(at, null);
    this.grid.set(0, piece);
    const layout = forgeLayout(target, this.grid.size);
    if (layout) {
      // One jewel to a cell where they fit (the recipe book shows it as ghosts) ...
      layout.forEach((id, i) => {
        if (id !== 0) this.grid.set(i, makeStack(id, 1));
      });
    } else {
      // ... otherwise a stack of each.
      this.grid.set(1, makeStack(I.JEWEL_RIFT, cost));
      this.grid.set(2, makeStack(I.JEWEL_DAWN, cost));
    }
    this.recalc();
    return true;
  }

  /**
   * The recipe book's click: put the ingredients of recipe `index` into the grid from the inventory.
   * What was in the grid goes back to the inventory first, as in the original. With `all` it fills as
   * many crafts as the inventory allows (up to a stack per cell). Does nothing, and changes nothing, when
   * the inventory cannot make the recipe once, or the recipe does not fit this grid.
   */
  fillRecipe(index: number, all: boolean): boolean {
    if (this.forging) return false;
    // The steps past +9 are listed in the book after the recipes.
    const step = forgeTarget(index);
    if (step !== null) return this.fillForge(step);
    const r = RECIPES[index];
    const layout = r ? recipeLayout(r, this.size) : null;
    if (!layout) return false;

    const cellsFor = new Map<number, number>();
    for (const id of layout) if (id !== 0) cellsFor.set(id, (cellsFor.get(id) ?? 0) + 1);
    let sets = Infinity;
    for (const [id, cells] of cellsFor) {
      const have = this.player.countOf(id) + this.grid.countOf(id);
      sets = Math.min(sets, Math.floor(have / cells), all ? getItem(id).maxStack : 1);
    }
    if (!(sets >= 1)) return false;

    const playerBefore = this.player.toJSON();
    const gridBefore = this.grid.toJSON();
    for (const stack of this.grid.drain()) {
      if (this.player.add(stack)) {
        this.player.loadJSON(playerBefore);
        this.grid.loadJSON(gridBefore);
        return false;
      }
    }
    layout.forEach((id, i) => {
      if (id === 0) return;
      this.player.remove(id, sets);
      this.grid.set(i, makeStack(id, sets));
    });
    this.recalc();
    return true;
  }
  protected override onTake(slot: Slot): void {
    if (slot.kind !== 'result') return;
    if (this.forged) {
      this.forged = null;
      this.recalc();
      return;
    }
    // Using up the ingredients: one of each occupied cell.
    for (let i = 0; i < this.grid.size; i++) {
      const s = this.grid.get(i);
      if (s) {
        s.count -= 1;
        if (s.count <= 0) this.grid.set(i, null);
      }
    }
    this.recalc();
  }

  override close(): ItemStack[] {
    const out = super.close();
    // A forge that is still at work comes to its end (it was rolled when it started).
    this.finishForge();
    out.push(...this.grid.drain());
    if (this.forged) out.push(this.forged);
    this.forged = null;
    this.result.set(0, null);
    return out;
  }

  totalItems(): number {
    return (this.forged?.count ?? 0) + this.player.totalItems() + this.grid.totalItems() + (this.armor?.totalItems() ?? 0) + (this.offhand?.totalItems() ?? 0) + (this.mount?.totalItems() ?? 0) + (this.outfit?.totalItems() ?? 0) + (this.cursor?.count ?? 0);
  }
}

export class FurnaceMenu extends Menu {
  readonly kind = 'furnace' as const;
  readonly inputSlot: number;
  readonly fuelSlot: number;
  readonly outputSlot: number;

  constructor(
    player: Container,
    readonly furnace: Furnace,
    /** Called with the experience that comes out of the furnace when its output is taken. */
    private readonly onXp?: (amount: number) => void,
  ) {
    super(player);
    this.inputSlot = this.slots.length;
    this.slots.push({ container: furnace.container, index: FURNACE_INPUT, kind: 'input' });
    this.fuelSlot = this.slots.length;
    this.slots.push({ container: furnace.container, index: FURNACE_FUEL, kind: 'fuel', accepts: (s) => isFuel(s.id) });
    this.outputSlot = this.slots.length;
    this.slots.push({ container: furnace.container, index: FURNACE_OUTPUT, kind: 'output' });
  }

  protected override onTake(slot: Slot): void {
    if (slot.kind !== 'output') return;
    const xp = this.furnace.takeXp();
    if (xp > 0) this.onXp?.(xp);
  }

  protected override quickTargets(from: number, stack: ItemStack): number[] {
    if (from < PLAYER_SLOTS) {
      if (SMELTING.has(stack.id)) return [this.inputSlot];
      if (isFuel(stack.id)) return [this.fuelSlot];
    }
    return super.quickTargets(from, stack);
  }

  totalItems(): number {
    return this.player.totalItems() + this.furnace.container.totalItems() + (this.cursor?.count ?? 0);
  }
}

export class ChestMenu extends Menu {
  readonly kind = 'chest' as const;
  readonly chestStart = PLAYER_SLOTS;

  constructor(
    player: Container,
    readonly chest: Container,
  ) {
    super(player);
    for (let i = 0; i < chest.size; i++) this.slots.push({ container: chest, index: i, kind: 'normal' });
  }

  protected override quickTargets(from: number, stack: ItemStack): number[] {
    if (from < PLAYER_SLOTS) {
      return Array.from({ length: this.chest.size }, (_, k) => PLAYER_SLOTS + k);
    }
    return super.quickTargets(from, stack);
  }

  totalItems(): number {
    return this.player.totalItems() + this.chest.totalItems() + (this.cursor?.count ?? 0);
  }
}

/** What a trade screen tells the world about: a trade happened, and the villager's level. */
export interface TradeHooks {
  /** A trade was made (the player earns experience for it). */
  onTrade?(offer: Offer): void;
  /** The villager reached a new level. */
  onLevelUp?(level: number): void;
}

/**
 * Trading with a villager: pick one of its offers, the payment is moved from your inventory into the two
 * payment slots, and the result slot shows what you get. Taking the result uses up the payment, counts a
 * use of the offer and earns the villager experience; the payment is refilled from your inventory so you
 * can go on (shift-click trades as long as you can).
 */
export class TradeMenu extends Menu {
  readonly kind = 'trade' as const;
  readonly payment = new Container(2);
  readonly result = new Container(1);
  readonly paymentStart = PLAYER_SLOTS;
  readonly resultSlot = PLAYER_SLOTS + 2;
  /** The chosen offer (an index into `villager.offers`), or -1. */
  selected = -1;

  constructor(
    player: Container,
    readonly villager: TradeBook,
    private readonly hooks: TradeHooks = {},
  ) {
    super(player);
    for (let i = 0; i < 2; i++) this.slots.push({ container: this.payment, index: i, kind: 'normal', accepts: (s) => this.wants(s) });
    this.slots.push({ container: this.result, index: 0, kind: 'result' });
  }

  get offer(): Offer | null {
    return this.villager.offers[this.selected] ?? null;
  }

  /** Is this item one the chosen offer asks for? */
  private wants(s: ItemStack): boolean {
    const o = this.offer;
    return !!o && (s.id === o.a[0] || s.id === o.b?.[0]);
  }

  /** Choose an offer: the payment goes back to the inventory, then the new payment is taken from it. */
  select(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.villager.offers.length) return;
    this.returnPayment();
    this.selected = index;
    this.fill();
    this.recalc();
  }

  private returnPayment(): void {
    for (let i = 0; i < 2; i++) {
      const s = this.payment.get(i);
      if (!s) continue;
      const left = this.player.add(s);
      this.payment.set(i, left);
    }
  }

  /** Fill empty payment slots from the inventory, as far as the offer needs. */
  private fill(): void {
    const o = this.offer;
    if (!o || !canTradeOffer(o)) return;
    const want = [o.a, o.b];
    for (let i = 0; i < 2; i++) {
      const w = want[i];
      if (!w || this.payment.get(i)) continue;
      if (this.player.countOf(w[0]) >= w[1]) {
        this.player.remove(w[0], w[1]);
        this.payment.set(i, makeStack(w[0], w[1]));
      }
    }
  }

  /** The payment slots that pay for the offer: [a's slot, b's slot (or -1)], or null when it is not paid. */
  private paid(o: Offer): [number, number] | null {
    const find = (spec: [number, number], not: number): number => {
      for (let i = 0; i < 2; i++) {
        const s = this.payment.get(i);
        if (i !== not && s && s.id === spec[0] && s.count >= spec[1]) return i;
      }
      return -1;
    };
    const ia = find(o.a, -1);
    if (ia < 0) return null;
    if (!o.b) return [ia, -1];
    const ib = find(o.b, ia);
    return ib < 0 ? null : [ia, ib];
  }

  private recalc(): void {
    const o = this.offer;
    this.result.set(0, o && canTradeOffer(o) && this.paid(o) ? makeStack(o.r[0], o.r[1]) : null);
  }

  protected override changed(): void {
    this.recalc();
  }

  protected override onTake(slot: Slot): void {
    if (slot.kind !== 'result') return;
    const o = this.offer;
    const paid = o ? this.paid(o) : null;
    if (!o || !paid) return;
    const take = (i: number, n: number) => {
      const s = this.payment.get(i)!;
      s.count -= n;
      if (s.count <= 0) this.payment.set(i, null);
    };
    take(paid[0], o.a[1]);
    if (o.b && paid[1] >= 0) take(paid[1], o.b[1]);
    o.uses++;
    this.hooks.onTrade?.(o);
    if (addVillagerXp(this.villager, o.xp)) this.hooks.onLevelUp?.(this.villager.level);
    this.fill();
    this.recalc();
  }

  protected override quickTargets(from: number, stack: ItemStack): number[] {
    if (from < PLAYER_SLOTS && this.wants(stack)) return [this.paymentStart, this.paymentStart + 1];
    return super.quickTargets(from, stack);
  }

  /** The villager's list changed under the screen (the client mirrors the server's): adopt it. */
  adopt(book: TradeBook, selected: number): void {
    this.villager.profession = book.profession;
    this.villager.level = book.level;
    this.villager.xp = book.xp;
    this.villager.offers = book.offers;
    this.selected = selected;
  }

  override close(): ItemStack[] {
    const out = super.close();
    out.push(...this.payment.drain());
    this.result.set(0, null);
    return out;
  }

  totalItems(): number {
    return this.player.totalItems() + this.payment.totalItems() + (this.cursor?.count ?? 0);
  }
}

/** What a Runic Altar needs from the player that opens it (see `Player.openForBlock`). */
export interface EnchantHooks {
  /** Shelves of books around the altar: the lore a high rank asks for. */
  shelves: number;
  creative(): boolean;
  /** The Auren the player has, and a payment of it. */
  coins(): number;
  spend(auren: number): void;
  /** Something was inscribed or erased: which glyph, the rank it has now (0 once erased), whether it was erased and whether an inscription failed (`fail`: the price was paid and nothing was written). */
  done(what: { glyph: number; rank: number; erase: boolean; fail?: boolean }): void;
  /** A number from 0 up to (not including) 1 for the roll of an inscription; without it every inscription takes. */
  rand?(): number;
}

/** What a Runic Altar takes besides coins. */
export const LAPIS = I.LAPIS_LAZULI;

/**
 * The Runic Altar's screen: one piece goes in, and the glyphs that fit it are listed with their price (see `glyphOptions`). Inscribing one
 * takes its lapis (from anywhere in the bags) and its Auren and puts the glyph on the piece (or raises it a rank); erasing one frees its
 * socket. There is nothing to roll: the screen shows exactly what a click will do. A plain book becomes a Glyph Tome.
 */
export class EnchantMenu extends Menu {
  readonly kind = 'enchant' as const;
  readonly input = new Container(1);
  readonly itemSlot = PLAYER_SLOTS;
  shelves: number;

  constructor(
    player: Container,
    private readonly hooks: EnchantHooks,
  ) {
    super(player);
    this.shelves = hooks.shelves;
    this.slots.push({ container: this.input, index: 0, kind: 'normal', accepts: (s) => canInscribe(s.id) });
  }

  get item(): ItemStack | null {
    return this.input.get(0);
  }

  /** Lapis lazuli in the bags. */
  get lapis(): number {
    return this.player.countOf(LAPIS);
  }

  /** What the altar offers for the piece in the slot now (the server's own read of it, with the player's purse). */
  options(): GlyphOption[] {
    return glyphOptions(this.item, { shelves: this.shelves, lapis: this.lapis, auren: this.hooks.coins(), creative: this.hooks.creative() });
  }

  /** Only one item goes into the altar's slot, whatever the click would have moved. */
  override click(i: number, button: 0 | 1): void {
    if (i === this.itemSlot && this.cursor && this.cursor.count > 1) {
      if (!this.item && canInscribe(this.cursor.id)) super.click(i, 1);
      return;
    }
    super.click(i, button);
  }

  override shiftClick(i: number): void {
    const s = i < PLAYER_SLOTS ? this.stackAt(i) : null;
    if (s && canInscribe(s.id) && !this.item) {
      this.input.set(0, cloneStack({ ...s, count: 1 }));
      s.count -= 1;
      if (s.count <= 0) this.slots[i].container.set(this.slots[i].index, null);
      this.changed();
      return;
    }
    super.shiftClick(i);
  }

  /** Inscribe glyph `id` on the piece (or raise it one rank). Returns whether it was done: the price is paid here. */
  inscribe(id: number): boolean {
    const it = this.item;
    if (!it || !Number.isInteger(id)) return false;
    const o = this.options().find((x) => x.def.id === id);
    if (!o || o.state !== 'ok') return false;
    const next = inscribed(it, id);
    if (!next) return false;
    // The roll first: a failure costs all the lapis and half the Auren, and leaves the piece as it was.
    const fail = o.chance < 100 && (this.hooks.rand?.() ?? 0) * 100 >= o.chance;
    if (!this.hooks.creative()) {
      const pay = fail ? failedPrice(o.price) : o.price;
      if (!this.player.remove(LAPIS, pay.lapis)) return false;
      this.hooks.spend(pay.auren);
    }
    if (fail) {
      this.hooks.done({ glyph: id, rank: o.have, erase: false, fail: true });
      return true;
    }
    this.input.set(0, next);
    this.hooks.done({ glyph: id, rank: o.rank, erase: false });
    return true;
  }

  /** Take glyph `id` off the piece (free: what it cost is gone). Returns whether it was on it. */
  erase(id: number): boolean {
    const it = this.item;
    const next = it && Number.isInteger(id) ? erased(it, id) : null;
    if (!next) return false;
    this.input.set(0, next);
    this.hooks.done({ glyph: id, rank: 0, erase: true });
    return true;
  }

  /** A client's copy: the server says how many shelves there are (everything else follows from the item and the purse). */
  adopt(shelves: number): void {
    this.shelves = shelves;
  }

  override close(): ItemStack[] {
    const out = super.close();
    out.push(...this.input.drain());
    return out;
  }

  totalItems(): number {
    return this.player.totalItems() + this.input.totalItems() + (this.cursor?.count ?? 0);
  }
}

export interface AnvilHooks {
  level(): number;
  creative(): boolean;
  spend(levels: number): void;
  done(): void;
}

/** The anvil's screen: two items in, the result out, for a price in levels. */
export class AnvilMenu extends Menu {
  readonly kind = 'anvil' as const;
  readonly input = new Container(2);
  readonly result = new Container(1);
  readonly leftSlot = PLAYER_SLOTS;
  readonly rightSlot = PLAYER_SLOTS + 1;
  readonly resultSlot = PLAYER_SLOTS + 2;
  /** Levels the current job costs (0 = nothing to do) and whether it is beyond what an anvil will do. */
  cost = 0;
  tooExpensive = false;
  /** The name typed in the box: null until the player edits it (the item's own name shows then). */
  name: string | null = null;
  private plan: AnvilResult | null = null;
  private lastLeft = '';

  constructor(
    player: Container,
    private readonly hooks: AnvilHooks,
  ) {
    super(player);
    this.slots.push({ container: this.input, index: 0, kind: 'normal' });
    this.slots.push({ container: this.input, index: 1, kind: 'normal' });
    this.slots.push({ container: this.result, index: 0, kind: 'result' });
  }

  /** Can the result be taken now: there is one, it is not too dear and the player has the levels? */
  canTake(): boolean {
    const p = this.plan;
    return !!p && !this.tooExpensive && (this.hooks.creative() || this.hooks.level() >= p.cost);
  }

  override click(i: number, button: 0 | 1): void {
    if (i === this.resultSlot && !this.canTake()) return;
    super.click(i, button);
  }

  override shiftClick(i: number): void {
    if (i !== this.resultSlot) return super.shiftClick(i);
    const r = this.result.get(0);
    if (!r || !this.canTake() || !this.player.canFit(r)) return;
    this.player.add(cloneStack(r));
    this.result.set(0, null);
    this.onTake(this.slots[i]);
    this.changed();
  }

  protected override quickTargets(from: number, stack: ItemStack): number[] {
    if (from < PLAYER_SLOTS) return [this.leftSlot, this.rightSlot];
    return super.quickTargets(from, stack);
  }

  protected override changed(): void {
    this.recalc();
  }

  /** Type a new name for the item in the left slot (null puts the item's own name back). */
  setName(name: string | null): void {
    this.name = name === null ? null : name.slice(0, 64);
    this.recalc();
  }

  recalc(): void {
    // A different item in the left slot starts over with its own name.
    const left = this.input.get(0);
    const key = left ? `${left.id}:${left.name ?? ''}` : '';
    if (key !== this.lastLeft) {
      this.lastLeft = key;
      this.name = null;
    }
    const plan = anvilResult(left, this.input.get(1), this.name);
    this.plan = plan;
    this.cost = plan?.cost ?? 0;
    this.tooExpensive = !!plan && !this.hooks.creative() && plan.cost > ANVIL_MAX_COST;
    this.result.set(0, plan && !this.tooExpensive ? plan.result : null);
  }

  protected override onTake(slot: Slot): void {
    if (slot.kind !== 'result' || !this.plan) return;
    const plan = this.plan;
    this.input.set(0, null);
    const right = this.input.get(1);
    if (right) {
      right.count -= plan.useRight;
      if (right.count <= 0) this.input.set(1, null);
    }
    if (!this.hooks.creative()) this.hooks.spend(plan.cost);
    this.hooks.done();
    this.plan = null;
    this.cost = 0;
  }

  /** A client's copy: the cost the server worked out. */
  adopt(cost: number, tooExpensive: boolean, name: string | null = null): void {
    this.cost = cost;
    this.tooExpensive = tooExpensive;
    this.name = name;
  }

  override close(): ItemStack[] {
    const out = super.close();
    out.push(...this.input.drain());
    this.result.set(0, null);
    return out;
  }

  totalItems(): number {
    return this.player.totalItems() + this.input.totalItems() + (this.cursor?.count ?? 0);
  }
}
export interface GrindstoneHooks {
  creative(): boolean;
  /** Experience handed out when the result is taken (the menu rolls it between the stack's minimum and maximum). */
  xp(points: number): void;
  rand(): number;
  done(): void;
}

/** The grindstone's screen: one or two items in, the plain result out, and experience for the enchantments taken off. */
export class GrindstoneMenu extends Menu {
  readonly kind = 'grindstone' as const;
  readonly input = new Container(2);
  readonly result = new Container(1);
  readonly topSlot = PLAYER_SLOTS;
  readonly bottomSlot = PLAYER_SLOTS + 1;
  readonly resultSlot = PLAYER_SLOTS + 2;
  /** The most experience taking the result would give (what the screen shows). */
  xp = 0;
  private plan: GrindResult | null = null;

  constructor(
    player: Container,
    private readonly hooks: GrindstoneHooks,
  ) {
    super(player);
    this.slots.push({ container: this.input, index: 0, kind: 'normal', accepts: (s) => grindable(s) });
    this.slots.push({ container: this.input, index: 1, kind: 'normal', accepts: (s) => grindable(s) });
    this.slots.push({ container: this.result, index: 0, kind: 'result' });
  }

  override shiftClick(i: number): void {
    if (i !== this.resultSlot) return super.shiftClick(i);
    const r = this.result.get(0);
    if (!r || !this.player.canFit(r)) return;
    this.player.add(cloneStack(r));
    this.result.set(0, null);
    this.onTake(this.slots[i]);
    this.changed();
  }

  protected override quickTargets(from: number, stack: ItemStack): number[] {
    if (from < PLAYER_SLOTS) return [this.topSlot, this.bottomSlot];
    return super.quickTargets(from, stack);
  }

  protected override changed(): void {
    this.recalc();
  }

  recalc(): void {
    this.plan = grindResult(this.input.get(0), this.input.get(1));
    this.xp = this.plan?.xpMax ?? 0;
    this.result.set(0, this.plan ? cloneStack(this.plan.result) : null);
  }

  protected override onTake(slot: Slot): void {
    if (slot.kind !== 'result' || !this.plan) return;
    const { xpMin, xpMax } = this.plan;
    this.input.set(0, null);
    this.input.set(1, null);
    this.plan = null;
    this.xp = 0;
    const points = xpMin + Math.floor(this.hooks.rand() * (xpMax - xpMin + 1));
    if (points > 0) this.hooks.xp(points);
    this.hooks.done();
  }

  /** A client's copy: the experience the server worked out. */
  adopt(xp: number): void {
    this.xp = xp;
  }

  override close(): ItemStack[] {
    const out = super.close();
    out.push(...this.input.drain());
    this.result.set(0, null);
    return out;
  }

  totalItems(): number {
    return this.player.totalItems() + this.input.totalItems() + (this.cursor?.count ?? 0);
  }
}

/** Anything a grindstone can take enchantments off or repair: tools, armor, the bow and books. */
function grindable(s: ItemStack): boolean {
  return getItem(s.id).durability > 0 || getItem(s.id).storesEnchants || !!s.ench;
}
/** Creative inventory: an infinite palette of every item above the player's inventory. */
export class CreativeMenu extends Menu {
  readonly kind = 'creative' as const;
  readonly palette: Container;
  readonly paletteStart = PLAYER_SLOTS;

  constructor(player: Container) {
    super(player);
    const items = allItems();
    this.palette = new Container(items.length);
    items.forEach((it, i) => {
      this.palette.set(i, makeStack(it.id, Math.min(this.amount, it.maxStack)));
      this.slots.push({ container: this.palette, index: i, kind: 'palette' });
    });
  }

  /** How many a click on the palette hands out (what does not stack that far gives a full stack). The palette shows it. */
  amount: CreativeAmount = 64;

  setAmount(n: CreativeAmount): void {
    this.amount = n;
    for (let i = 0; i < this.palette.size; i++) {
      const s = this.palette.get(i);
      if (s) this.palette.set(i, makeStack(s.id, Math.min(n, getItem(s.id).maxStack)));
    }
  }

  /** Put a made piece on the cursor (in the bag when something is already held). Returns what is left over. */
  give(stack: ItemStack): ItemStack | null {
    if (!this.cursor) {
      this.cursor = stack;
      return null;
    }
    return this.player.add(stack);
  }

  /** Empty the whole inventory. */
  clearAll(): void {
    for (let i = 0; i < this.player.size; i++) this.player.set(i, null);
    this.cursor = null;
  }

  protected override clickPalette(slot: Slot, button: 0 | 1): void {
    if (this.cursor) {
      this.cursor = null; // dropping onto the palette deletes the held stack
      return;
    }
    const s = slot.container.get(slot.index);
    if (!s) return;
    this.cursor = makeStack(s.id, button === 0 ? Math.min(this.amount, getItem(s.id).maxStack) : 1);
  }

  totalItems(): number {
    return this.player.totalItems() + (this.cursor?.count ?? 0);
  }
}
