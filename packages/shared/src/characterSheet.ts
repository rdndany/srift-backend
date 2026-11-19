import { abilitiesOf, parseClassSave } from './abilities';
import { BAG_SLOTS, bagInventory, bagOf } from './bags';
import { CLASSES, CLASS_LEVELS, computeStats, isClassId, type ClassId } from './classes';
import { Experience, xpToNext } from './experience';
import { ARMOR_SLOTS } from './armor';
import { Container, HOTBAR_SLOTS, PLAYER_SLOTS, makeStack, type ItemStack } from './inventory';
import { I, outfitItems } from './items';
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
  backpack: (ItemStack | null)[];
  /** The bags worn (4 slots) and what each carries (only the slots a bag really has). */
  bags: { bag: ItemStack | null; items: (ItemStack | null)[] }[];
  /** Helmet, chestplate, leggings, boots. */
  armor: (ItemStack | null)[];
  offhand: ItemStack | null;
  mount: ItemStack | null;
  /** Items carried in all (a stack of 20 counts 20). */
  itemCount: number;
  quests: { done: number; total: number; active: { id: string; name: string; progress: number[] }[] };
}

const clone = (s: ItemStack | null): ItemStack | null => (s ? { ...s } : null);

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

  const stats = id && cs ? computeStats(id, cs.lvl) : null;
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
  for (const c of [inv, armor, offhand, mount, bagsC]) itemCount += c.totalItems();

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
    backpack: slots(HOTBAR_SLOTS, PLAYER_SLOTS),
    bags,
    armor: armor.slots.map(clone),
    offhand: clone(offhand.get(0)),
    mount: clone(mount.get(0)),
    itemCount,
    quests: { done, total: QUESTS.length, active },
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
  for (const s of [...sheet.armor, sheet.offhand, sheet.mount, ...sheet.hotbar, ...sheet.backpack]) add(s);
  for (const b of sheet.bags) {
    add(b.bag);
    for (const s of b.items) add(s);
  }
  return { id, level: sheet.level, coins: sheet.coins, savedAt: sheet.savedAt, holds: [...total] };
}
