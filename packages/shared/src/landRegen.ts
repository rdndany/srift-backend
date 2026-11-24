import { B, IS_LIQUID } from './blocks';
import { LAND_DAY_MS, HOUR_MS, MINUTE_MS, type LandConfig } from './landConfig';
import { coversY, type LandClaim } from './landClaims';
import { holdsItems, modKey, unKey, type ModEntry, type ModLedger, type Region } from './landLedger';

/**
 * Putting the wilderness back. A step takes what is due from the ledger and restores it in small batches, so the world is never frozen by a
 * big region. Everything that decides whether a change may be undone is here, and every doubt means "later", never "destroy":
 *
 *   - a change that is inside a claim by now is made persistent instead
 *   - a change in a protected place is forgotten, never undone
 *   - a block that is not what the ledger thinks it is has been changed by somebody else: it is taken as a new change, and waits again
 *   - a player near the region holds it back (so nobody is buried, or has the floor given back under their feet)
 *   - a chest or furnace with things in it holds it back; after the grace the things go to a recovery box, they are never deleted
 *
 * It needs no loaded chunk: the world makes the chunk when it is asked to set a block.
 */

export interface RegenEnv {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  claimAt(x: number, z: number): LandClaim | null;
  isProtected(x: number, y: number, z: number): boolean;
  /** Is any player inside this box (inclusive)? */
  playerWithin(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean;
  /** How many items the container at this block holds (0: none, or no container). */
  itemsIn(x: number, y: number, z: number): number;
  /** Move what the container holds into a recovery box (for the character who built it, when known). The container is left empty. */
  recover(e: ModEntry): void;
}

export interface RegenStats {
  restored: number;
  ores: number;
  converted: number;
  dropped: number;
  resynced: number;
  postponed: number;
  held: number;
  regions: number;
}

export const emptyStats = (): RegenStats => ({ restored: 0, ores: 0, converted: 0, dropped: 0, resynced: 0, postponed: 0, held: 0, regions: 0 });

/**
 * One step: handle what is due until the budget of blocks (or the time) is spent. Safe to call as often as you like, it does nothing when
 * nothing is due.
 */
export function regenStep(ledger: ModLedger, env: RegenEnv, cfg: LandConfig, now: number, spent: () => boolean = () => false): RegenStats {
  const st = emptyStats();
  if (!cfg.regen.enabled) return st;
  let budget = cfg.regen.batchBlocks;
  while (budget > 0 && !spent()) {
    const due = ledger.popDue(now);
    if (!due) break;
    if ('ore' in due) {
      budget -= oreBack(ledger, env, cfg, now, due.ore, st) ? 1 : 0.25;
    } else {
      budget -= runRegion(ledger, env, cfg, now, due.region, budget, st);
    }
  }
  return st;
}

/** An ore comes back, alone, where it was mined: only into the empty hole, only when nobody is close, never inside a claim. */
function oreBack(ledger: ModLedger, env: RegenEnv, cfg: LandConfig, now: number, k: number, st: RegenStats): boolean {
  const e = ledger.entries.get(k);
  if (!e) return false;
  if (settle(ledger, env, e, k, st)) return false;
  const actual = env.getBlock(e.x, e.y, e.z);
  if (actual !== e.cur) {
    // Filled in by somebody (a change that was not recorded): a new change, with a clock of its own.
    ledger.record(e.x, e.y, e.z, e.base, actual, { claim: null, by: null, now });
    st.resynced++;
    return false;
  }
  const c = cfg.regen.oreClearance;
  if (env.playerWithin(e.x - c, e.y - c, e.z - c, e.x + c, e.y + c, e.z + c)) {
    ledger.deferOre(k, now + cfg.regen.retryMinutes * MINUTE_MS);
    st.postponed++;
    return false;
  }
  if (!env.setBlock(e.x, e.y, e.z, e.base)) {
    ledger.deferOre(k, now + cfg.regen.retryMinutes * MINUTE_MS);
    st.postponed++;
    return false;
  }
  ledger.remove(k, e);
  st.ores++;
  return true;
}

/** The two cases that end a change's story without a restoration. True when the entry is gone from the queue. */
function settle(ledger: ModLedger, env: RegenEnv, e: ModEntry, k: number, st: RegenStats): boolean {
  const claim = env.claimAt(e.x, e.z);
  if (claim && coversY(claim, e.x, e.y, e.z)) {
    ledger.convert(k, e, claim);
    st.converted++;
    return true;
  }
  if (env.isProtected(e.x, e.y, e.z)) {
    ledger.remove(k, e);
    st.dropped++;
    return true;
  }
  return false;
}

/** Put a region back as far as the budget goes. Returns what it spent. */
function runRegion(ledger: ModLedger, env: RegenEnv, cfg: LandConfig, now: number, r: Region, budget: number, st: RegenStats): number {
  const rc = cfg.regen;
  st.regions++;
  const retry = now + rc.retryMinutes * MINUTE_MS;
  const c = rc.playerClearance;
  if (env.playerWithin(r.x0 - c, r.y0 - c, r.z0 - c, r.x1 + c, r.y1 + c, r.z1 + c)) {
    postpone(ledger, r, retry, rc.maxPostpones, now);
    st.postponed++;
    return 0.5;
  }
  const keys = [...r.keys];
  const list: { k: number; e: ModEntry }[] = [];
  for (const k of keys) {
    const e = ledger.entries.get(k);
    if (e && e.cls === 'wild') list.push({ k, e });
  }
  // Things inside a chest or a furnace.
  for (const { e } of list) {
    if (!holdsItems(e.cur) || env.itemsIn(e.x, e.y, e.z) === 0) continue;
    if (now - e.first >= rc.containerGraceDays * LAND_DAY_MS) {
      env.recover(e);
    } else {
      postpone(ledger, r, now + Math.min(LAND_DAY_MS, rc.containerGraceDays * LAND_DAY_MS), rc.maxPostpones, now);
      st.held++;
      return 0.5;
    }
  }
  // Take away what was built first, from the top; fill what was dug after it, from the bottom.
  list.sort((a, b) => {
    const ra = a.e.cur !== B.AIR && IS_LIQUID[a.e.cur] === 0 ? 0 : 1;
    const rb = b.e.cur !== B.AIR && IS_LIQUID[b.e.cur] === 0 ? 0 : 1;
    return ra !== rb ? ra - rb : ra === 0 ? b.e.y - a.e.y : a.e.y - b.e.y;
  });
  let spent = 0;
  for (const { k, e } of list) {
    if (spent >= budget) break;
    if (!ledger.entries.has(k)) continue;
    if (settle(ledger, env, e, k, st)) continue;
    const actual = env.getBlock(e.x, e.y, e.z);
    if (actual !== e.cur) {
      ledger.record(e.x, e.y, e.z, e.base, actual, { claim: null, by: null, now });
      st.resynced++;
      continue;
    }
    if (!env.setBlock(e.x, e.y, e.z, e.base)) continue;
    ledger.remove(k, e);
    st.restored++;
    spent++;
  }
  if (ledger.regions.get(r.id) === r) {
    ledger.refresh(r);
    // Something is left: the rest in the next step (or, if somebody touched the region meanwhile, after it has been quiet again).
    ledger.schedule(r, Math.max(ledger.readyAt(r), now + 1));
  }
  return Math.max(spent, 0.5);
}

/** Put a region off. After too many tries it waits a week instead: it is never given up on, and never forced. */
function postpone(ledger: ModLedger, r: Region, at: number, maxPostpones: number, now: number): void {
  if (r.postpones + 1 >= maxPostpones) {
    r.postpones = 0;
    ledger.schedule(r, now + 7 * LAND_DAY_MS);
    return;
  }
  ledger.deferRegion(r, at);
}

/** Every key of a region, as coordinates (for the admin tools). */
export const regionCells = (r: Region): [number, number, number][] => [...r.keys].map(unKey);

export { HOUR_MS, modKey };
