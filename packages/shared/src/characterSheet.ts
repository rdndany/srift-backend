import { abilitiesOf, parseClassSave } from './abilities';
import { AchievementBook, type AchievementView } from './achievements';
import { BAG_SLOTS, bagInventory, bagOf } from './bags';
import { CLASSES, CLASS_LEVELS, computeStats, offhandModifier, isClassId, type ClassId, type ClassStats, type StatModifier } from './classes';
import { Experience, xpToNext } from './experience';
import { ARMOR_SLOTS } from './armor';
import { ACCESSORY_SLOT_COUNT, NECKLACE_SLOT } from './accessories';
import { accessoryModifiers, gearModifiers, glyphModifiers } from './gear';
import { NO_POINTS, pointModifier, type AttrSpend } from './statPoints';
import { Container, HOTBAR_SLOTS, PLAYER_SLOTS, makeStack, type ItemStack } from './inventory';
import { I, getItem, outfitItems } from './items';
import { QUESTS } from './quests';
import type { PlayerSave } from './save';
import { MAX_HEALTH, MAX_HUNGER } from './survival';

/**
 * What the lobby shows of a character before it is played: the numbers and the things carried, read out of its saved
 * record (a `PlayerSave`) without a world or a running game. Plain JSON, so the server can send it as it is.
 */
export interface CharacterSheet {
  /** The level shown beside the name: the class level when the character has a class, the experience level otherwise. */
  level: number;
  /** Experience level (the bar the enchanting table and anvil spend) with the points towards the next one. */
  xp: { level: number; points: number; next: number };
  /** The class's own level (null: no class). `next` is 0 at the top level. */
  cls: { id: ClassId; level: number; max: number; xp: number; next: number; abilities: number; abilitiesTotal: number } | null;
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  coins: number;
  mode: PlayerSave['mode'];
  hardcore: boolean;
  gameOver: boolean;
  /** Where it stands in the world (block coordinates). */
  position: { x: number; y: number; z: number };
  savedAt: number | null;
  /** Hotbar (9 slots), then the backpack (27), as in the game: null is an empty slot. */
  hotbar: (ItemStack | null)[];
  /** Which hotbar slot is in the main hand (0 to 8). */
  selected: number;
  /**
   * Points spent on Strength, Agility, Vitality and Energy. Left out by a server that does not send them yet:
   * the health on the sheet then already includes them, and the gear does not.
   */
  pts?: AttrSpend;
  backpack: (ItemStack | null)[];
  /** The bags worn (4 slots) and what each carries (only the slots a bag really has). */
  bags: { bag: ItemStack | null; items: (ItemStack | null)[] }[];
  /** Helmet, chestplate, leggings, boots. */
  armor: (ItemStack | null)[];
  offhand: ItemStack | null;
  mount: ItemStack | null;
  /** The glowing set it wears (the outfit slot). */
  outfit: ItemStack | null;
  /** The companion that follows it (the companion slot). */
  companion: ItemStack | null;
  /** The wings it wears (the wing slot). */
  wings: ItemStack | null;
  /** The two rings it wears (null for an empty finger). */
  rings: (ItemStack | null)[];
  /** The necklace it wears. */
  necklace: ItemStack | null;
  /** Items carried in all (a stack of 20 counts 20). */
  itemCount: number;
  quests: { done: number; total: number; active: { id: string; name: string; progress: number[] }[] };
  /** The deeds counted and the achievements won (what the game's own list shows, read from the same save). */
  ach: AchievementView;
}

const clone = (s: ItemStack | null): ItemStack | null => (s ? { ...s } : null);

/**
 * The stats of a class with what it wears and holds, in the same order the game applies them: the gear, then the off hand, then the points.
 */
export function wearStats(id: ClassId, level: number, pts: AttrSpend, held: ItemStack | null, offhand: ItemStack | null, armor: readonly (ItemStack | null)[], jewelry: readonly (ItemStack | null)[]): ClassStats {
  const who = { id, level };
  const worn = [held, offhand, ...armor];
  const gear: StatModifier[] = [...gearModifiers(worn, who), ...accessoryModifiers(jewelry, who), ...glyphModifiers(worn, who), ...glyphModifiers(jewelry, who)];
  const off = offhandModifier(offhand?.id ?? 0);
  const spent = pointModifier(pts);
  return computeStats(id, level, [...gear, ...(off ? [off] : []), ...(spent ? [spent] : [])]);
}

/** Defense points of the armor worn (0 to 20), the same sum the game uses. */
export function wornDefense(armor: readonly (ItemStack | null)[]): number {
  let n = 0;
  for (const s of armor) if (s) n += getItem(s.id).armor?.defense ?? 0;
  return n;
}

/**
 * The numbers the lobby shows for a saved character. A sheet that does not carry `pts` already folded the points into
 * `maxHealth` and left the gear out, so the gear's health is added on top of that.
 */
export function lobbyStats(sheet: CharacterSheet): ClassStats | null {
  const cls = sheet.cls;
  if (!cls) return null;
  const held = sheet.hotbar[Math.max(0, Math.min(sheet.hotbar.length - 1, sheet.selected ?? 0))] ?? null;
  const jewelry = [...sheet.rings, sheet.necklace];
  const stats = wearStats(cls.id, cls.level, sheet.pts ?? NO_POINTS, held, sheet.offhand, sheet.armor, jewelry);
  if (sheet.pts) return stats;
  const plain = computeStats(cls.id, cls.level);
  const gearHp = wearStats(cls.id, cls.level, NO_POINTS, held, sheet.offhand, sheet.armor, jewelry).maxHealth - plain.maxHealth;
  return { ...stats, maxHealth: Math.max(1, Math.min(200, Math.round((sheet.maxHealth + gearHp) * 100) / 100)) };
}

/** Read a saved character into a sheet. `classId` is the class the account knows (the save's own record is the fallback). */
export function sheetOfSave(save: PlayerSave, classId: ClassId | null = null): CharacterSheet {
  const xp = new Experience();
  xp.loadJSON(save.xp);

  const rawCls = (save.cls ?? null) as { id?: unknown } | null;
  const id: ClassId | null = classId ?? (rawCls && isClassId(rawCls.id) ? rawCls.id : null);
  const cs = id ? parseClassSave(save.cls, id) : null;

  const bagsC = new Container(BAG_SLOTS);
  bagsC.loadJSON(save.bags);
  const inv = bagInventory(bagsC);
  inv.loadJSON(save.inv);
  const armor = new Container(ARMOR_SLOTS.length);
  armor.loadJSON(save.armor);
  const offhand = new Container(1);
  offhand.loadJSON(save.offhand);
  const mount = new Container(1);
  mount.loadJSON(save.mountSlot);
  const outfit = new Container(1);
  outfit.loadJSON(save.outfitSlot);
  const companion = new Container(1);
  companion.loadJSON(save.companionSlot);
  const wings = new Container(1);
  wings.loadJSON(save.wingSlot);
  const jewelry = new Container(ACCESSORY_SLOT_COUNT);
  jewelry.loadJSON(save.accessories);

  const slots = (from: number, to: number): (ItemStack | null)[] => Array.from({ length: to - from }, (_, i) => (inv.isUsable(from + i) ? clone(inv.get(from + i)) : null));
  const bags = Array.from({ length: BAG_SLOTS }, (_, b) => {
    const bag = clone(bagsC.get(b));
    const items: (ItemStack | null)[] = [];
    for (let i = PLAYER_SLOTS; i < inv.size; i++) {
      const at = bagOf(i);
      if (at && at.bag === b && inv.isUsable(i)) items.push(clone(inv.get(i)));
    }
    return { bag, items };
  });

  const pts = cs?.pts ?? NO_POINTS;
  const heldAt = Math.max(0, Math.min(HOTBAR_SLOTS - 1, Math.floor(save.selected)));
  const held = inv.isUsable(heldAt) ? inv.get(heldAt) : null;
  const wornJewelry = [jewelry.get(0), jewelry.get(1), jewelry.get(NECKLACE_SLOT)];
  const stats = id && cs ? wearStats(id, cs.lvl, pts, held, offhand.get(0), armor.slots, wornJewelry) : null;
  const vit = (save.vitals ?? {}) as { h?: unknown; f?: unknown };
  const maxHealth = stats ? Math.round(stats.maxHealth) : MAX_HEALTH;
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

  const log = (save.quests ?? null) as { d?: unknown; a?: unknown } | null;
  const done = Array.isArray(log?.d) ? (log!.d as unknown[]).filter((q): q is string => typeof q === 'string' && QUESTS.some((d) => d.id === q)).length : 0;
  const active = Array.isArray(log?.a)
    ? (log!.a as unknown[]).flatMap((e) => {
        if (!Array.isArray(e) || typeof e[0] !== 'string') return [];
        const def = QUESTS.find((d) => d.id === e[0]);
        return def ? [{ id: def.id, name: def.name, progress: Array.isArray(e[1]) ? (e[1] as unknown[]).map((n) => num(n, 0)) : [] }] : [];
      })
    : [];

  let itemCount = 0;
  for (const c of [inv, armor, offhand, mount, outfit, companion, wings, jewelry, bagsC]) itemCount += c.totalItems();

  const book = new AchievementBook();
  book.loadJSON(save.ach);

  return {
    level: cs ? cs.lvl : xp.level,
    xp: { level: xp.level, points: xp.points, next: xpToNext(xp.level) },
    cls: id && cs ? { id, level: cs.lvl, max: CLASS_LEVELS.max, xp: cs.xp, next: cs.lvl >= CLASS_LEVELS.max ? 0 : CLASS_LEVELS.toNext(cs.lvl), abilities: cs.unlocked.length, abilitiesTotal: abilitiesOf(id).length } : null,
    health: Math.max(0, Math.min(maxHealth, Math.round(num(vit.h, maxHealth)))),
    maxHealth,
    hunger: Math.max(0, Math.min(MAX_HUNGER, Math.round(num(vit.f, MAX_HUNGER)))),
    maxHunger: MAX_HUNGER,
    coins: typeof save.coins === 'number' && Number.isFinite(save.coins) ? Math.max(0, Math.floor(save.coins)) : 0,
    mode: save.mode,
    hardcore: save.hardcore === true,
    gameOver: save.gameOver === true,
    position: { x: Math.floor(save.x), y: Math.floor(save.y), z: Math.floor(save.z) },
    savedAt: typeof save.savedAt === 'number' ? save.savedAt : null,
    hotbar: slots(0, HOTBAR_SLOTS),
    selected: Math.max(0, Math.min(HOTBAR_SLOTS - 1, Math.floor(save.selected))),
    pts: id && cs ? pts : undefined,
    backpack: slots(HOTBAR_SLOTS, PLAYER_SLOTS),
    bags,
    armor: armor.slots.map(clone),
    offhand: clone(offhand.get(0)),
    mount: clone(mount.get(0)),
    outfit: clone(outfit.get(0)),
    companion: clone(companion.get(0)),
    wings: clone(wings.get(0)),
    rings: [clone(jewelry.get(0)), clone(jewelry.get(1))],
    necklace: clone(jewelry.get(NECKLACE_SLOT)),
    itemCount,
    quests: { done, total: QUESTS.length, active },
    ach: book.view(),
  };
}
/**
 * The sheet of a character that has not been played yet: what a new survival character of the class starts a world with
 * (the Emberstone and the map in the second and third slots, the class's weapon and shield, orb or dagger, and its clothes).
 * It is what `GameSession` would save for a fresh character, so the lobby can show the bags before the first Play.
 */
export function newCharacterSheet(classId: ClassId): CharacterSheet {
  const def = CLASSES[classId];
  const inv = new Container(PLAYER_SLOTS);
  const offhand = new Container(1);
  const armor = new Container(ARMOR_SLOTS.length);
  for (const [slot, id] of [[1, I.EMBERSTONE], [2, I.MAP]] as const) inv.set(slot, makeStack(id, 1));
  for (const it of def.startingKit) {
    if (it.id === def.startingOffhand && !offhand.get(0)) offhand.set(0, makeStack(it.id, 1));
    else inv.add(makeStack(it.id, it.count));
  }
  outfitItems(classId).forEach((id, slot) => armor.set(slot, makeStack(id, 1)));
  return sheetOfSave({ v: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mode: 'survival', selected: 0, inv: inv.toJSON(), vitals: null, mobs: [], armor: armor.toJSON(), offhand: offhand.toJSON(), cls: { v: 1, id: classId, lvl: 1, xp: 0, unlocked: [] }, of: true }, classId);
}
/**
 * What the lobby shows of a character on its slot, and what it needs to answer "which of my characters has this?": the level,
 * the coins, when it was saved and how many of each item it carries (worn, pack and bags together; the Stash is not counted).
 */
export interface CharacterBrief {
  id: string;
  level: number;
  coins: number;
  savedAt: number | null;
  /** [item id, how many] pairs. */
  holds: [number, number][];
}

/** The brief of a character, from its sheet. */
export function briefOfSheet(id: string, sheet: CharacterSheet): CharacterBrief {
  const total = new Map<number, number>();
  const add = (s: ItemStack | null): void => {
    if (s) total.set(s.id, (total.get(s.id) ?? 0) + s.count);
  };
  for (const s of [...sheet.armor, sheet.offhand, sheet.mount, sheet.outfit, sheet.companion, sheet.wings, ...sheet.rings, sheet.necklace, ...sheet.hotbar, ...sheet.backpack]) add(s);
  for (const b of sheet.bags) {
    add(b.bag);
    for (const s of b.items) add(s);
  }
  return { id, level: sheet.level, coins: sheet.coins, savedAt: sheet.savedAt, holds: [...total] };
}
