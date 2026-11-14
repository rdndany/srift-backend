import type { Mob } from './mobs';
import { PROFESSIONS, newBook, parseOffers, parseProfession, type Profession, type VillagerState } from './trading';
import type { VillageHome } from './village';

/**
 * The villagers of every village, as plain records. A village's people exist as records from the
 * moment a player first comes near it; the realm turns them into mobs while a player is close and back
 * into records when everybody has left, so a villager's trades, level and where it lives survive going
 * away and saving the world. A dead villager stays dead.
 */
export interface VillagerRecord extends VillagerState {
  /** Which of the village's homes it came from. */
  slot: number;
  /** Where it was last seen. */
  x: number;
  y: number;
  z: number;
  alive: boolean;
  /** The restock it last had (see `Realm.restockEpoch`). */
  epoch: number;
  /** The mob it is while a player is near (never saved). */
  mob?: Mob | null;
}

/** A mob's `variant` for a villager: the profession in the low four bits, level - 1 above them. */
export function villagerVariant(v: VillagerState): number {
  return PROFESSIONS.indexOf(v.profession) | ((v.level - 1) << 4);
}

export function variantProfession(variant: number): Profession {
  return PROFESSIONS[variant & 15] ?? 'unemployed';
}

export function variantLevel(variant: number): number {
  return Math.max(1, Math.min(5, (variant >> 4) + 1));
}

/** Who lives where: farmers on the farms, smiths at the smithy, shopkeepers at the stalls, and anyone in the houses. */
export function professionFor(kind: VillageHome['kind'], r: number): Profession {
  const pick = <T,>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];
  switch (kind) {
    case 'farm':
      return 'farmer';
    case 'smithy':
      return pick(['armorer', 'weaponsmith', 'toolsmith'] as const);
    case 'stall':
      return pick(['shepherd', 'butcher', 'fletcher', 'cleric'] as const);
    case 'tower':
      return pick(['weaponsmith', 'fletcher', 'mason'] as const);
    default:
      return pick(['farmer', 'butcher', 'shepherd', 'fletcher', 'cleric', 'mason', 'toolsmith', 'nitwit', 'unemployed', 'nitwit'] as const);
  }
}

export function makeRecord(slot: number, home: VillageHome, profession: Profession, epoch: number): VillagerRecord {
  const x = home.x + 0.5;
  const z = home.z + 0.5;
  return { ...newBook(profession), homeX: x, homeY: home.y, homeZ: z, slot, x, y: home.y, z, alive: true, epoch, mob: null };
}

const num = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

export interface FolkSave {
  epoch: number;
  folk: Record<string, unknown[]>;
}

export function folkToJSON(epoch: number, folk: ReadonlyMap<string, readonly VillagerRecord[]>): FolkSave {
  const out: Record<string, unknown[]> = {};
  for (const [key, list] of folk) {
    out[key] = list.map((v) => ({
      s: v.slot,
      p: v.profession,
      l: v.level,
      xp: v.xp,
      o: v.offers,
      x: v.x,
      y: v.y,
      z: v.z,
      h: [v.homeX, v.homeY, v.homeZ],
      a: v.alive ? 1 : 0,
      e: v.epoch,
    }));
  }
  return { epoch, folk: out };
}

/** Read saved villagers; whatever is malformed is dropped. */
export function folkFromJSON(raw: unknown): { epoch: number; folk: Map<string, VillagerRecord[]> } {
  const folk = new Map<string, VillagerRecord[]>();
  if (typeof raw !== 'object' || raw === null) return { epoch: 0, folk };
  const r = raw as { epoch?: unknown; folk?: unknown };
  if (typeof r.folk === 'object' && r.folk !== null) {
    for (const [key, list] of Object.entries(r.folk as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const out: VillagerRecord[] = [];
      for (const e of list.slice(0, 64) as Record<string, unknown>[]) {
        if (!e || typeof e !== 'object' || !Array.isArray(e.h) || e.h.length !== 3) continue;
        const [hx, hy, hz] = e.h.map((n) => num(n, NaN));
        const x = num(e.x, NaN);
        const y = num(e.y, NaN);
        const z = num(e.z, NaN);
        if (![hx, hy, hz, x, y, z].every(Number.isFinite)) continue;
        const profession = parseProfession(e.p);
        const book = newBook(profession);
        const offers = parseOffers(e.o);
        const level = Math.max(1, Math.min(5, Math.floor(num(e.l, 1))));
        out.push({
          profession,
          level,
          xp: Math.max(0, Math.floor(num(e.xp, 0))),
          offers: offers.length > 0 ? offers : book.offers,
          homeX: hx,
          homeY: hy,
          homeZ: hz,
          slot: Math.max(0, Math.floor(num(e.s, out.length))),
          x,
          y,
          z,
          alive: e.a !== 0,
          epoch: Math.floor(num(e.e, 0)),
          mob: null,
        });
      }
      if (out.length > 0) folk.set(key, out);
    }
  }
  return { epoch: Math.max(0, Math.floor(num(r.epoch, 0))), folk };
}
