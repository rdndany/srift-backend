/**
 * The Land Claim system's rules, every number in one place. Nothing about land is hard-coded anywhere else: a server may hand
 * `GameRoom` a partial `LandConfig` (see `landConfigWith`) and the rules, the prices and the timers follow it.
 *
 * The three layers of the world, as the system keeps them (see landLedger.ts):
 *   A  the baseline: what the generator makes (seed + `GENERATOR_VERSION`), plus the made places that `isProtected` guards
 *   B  persistent modifications: everything built or dug inside an active claim
 *   C  temporary modifications: what players change in the open wilderness, which is put back after a while
 */

/** What an abandoned claim does in the long run (see `LandService.sweepAbandoned`). Only 'permanent' is on by default: it is a game-design choice, not ours. */
export type AbandonPolicy = 'permanent' | 'inactivity' | 'upkeep';

export interface LandConfig {
  // ---- prices and limits ----------------------------------------------------------------------------------
  /** Auren per square block of the claim's area. */
  pricePerBlock: number;
  /** Whole-number percent of the price that comes back when a claim is released (0: nothing, so buying and releasing is never a source of Auren). */
  refundPercent: number;
  minCorners: number;
  maxCorners: number;
  /** The shortest edge of the polygon, in blocks. */
  minEdge: number;
  /** Smallest area (blocks²) of a claim. */
  minArea: number;
  /** Largest area of one claim. */
  maxArea: number;
  /** Longest side of the box round a claim. */
  maxSpan: number;
  /**
   * The narrowest the land may be: a claim has to be made of 2r+1 wide squares (r = `minHalfWidth`), at least `solidFraction` of it. A strip
   * thinner than that (the kind that walls off a road) cannot be claimed.
   */
  minHalfWidth: number;
  solidFraction: number;
  maxClaimsPerPlayer: number;
  /** Everything one player may own, in blocks². */
  maxTotalArea: number;
  /** Guilds: how many claims, and how much land in all. */
  guildMaxClaims: number;
  guildMaxArea: number;
  /** Coordinates beyond this are refused (a hostile client cannot send a claim at the far end of the number line). */
  coordLimit: number;
  /** A claim must be near the one who buys it (blocks from the player to the nearest corner). */
  maxReach: number;
  /** After a purchase the boundary is fenced, with a gate where the buyer stands and a sign with the owner's name. */
  fenceOnBuy: boolean;

  // ---- the volume -------------------------------------------------------------------------------------------
  /** Blocks under the world's original ground that a claim protects (measured on the ground as it was made, never on what has been dug since). */
  depth: number;
  /** Blocks above the original ground that a claim protects. Not the whole sky. */
  height: number;
  /** Horizontal width of the anti-griefing band round a claim: nobody who is not a member may dig there (it stays public land, nobody gets to build on it). */
  edgeBuffer: number;
  /** Claims keep this far from protected places and from the landmarks of the world. */
  protectedSpacing: number;
  /** Claims keep this far from each other (0: they may touch). */
  claimGap: number;

  // ---- releasing and expanding ------------------------------------------------------------------------------
  /** Hours a released claim lingers (and can be taken back) before it lets go of the land. */
  releaseGraceHours: number;
  /** How long a claim that was revoked by an administrator keeps its builds before the land is handed to the wilderness rules. */
  revokeGraceHours: number;
  abandon: AbandonPolicy;
  /** Days without the owner (policy 'inactivity') before a claim starts to expire. */
  inactivityDays: number;
  /** Days of warning once expiry has begun. */
  expiryWarningDays: number;

  // ---- the wilderness: what is put back, and when -----------------------------------------------------------
  regen: RegenConfig;
}

export interface RegenConfig {
  enabled: boolean;
  /** Hours until a hole, tunnel or any other removed block is filled again. */
  excavationHours: number;
  /** Hours until a block placed in the wilderness is taken away again. */
  placedHours: number;
  /** The same for fences, walls and gates, the things that are meant to stay (blocks in `FENCE_LIKE`). */
  fenceHours: number;
  /** Hours until a mined ore comes back (by ore: see `oreHours`). It comes back alone, in the hole that is left. */
  oreHoursDefault: number;
  /** A region is put back only when nobody has changed it for this many hours (the other timers count from the last change as well). */
  quietHours: number;
  /** Players this close (blocks, all three axes, from the box round a region) hold it back. */
  playerClearance: number;
  /** Ore comes back only when no player is closer than this (it never pops up in front of anybody). */
  oreClearance: number;
  /** Minutes before a postponed job is looked at again. */
  retryMinutes: number;
  /** A region that has been postponed this many times is dropped from the queue and kept as it is (it is never destroyed over a disagreement). */
  maxPostpones: number;
  /** Blocks put back in one go, and the time one step may take (ms). */
  batchBlocks: number;
  stepMs: number;
  /** Seconds between two steps. */
  stepSeconds: number;
  /** Days a chest with things in it holds a region back before the things are moved to a recovery box. */
  containerGraceDays: number;
}

export const DEFAULT_LAND_CONFIG: LandConfig = {
  pricePerBlock: 5,
  refundPercent: 0,
  minCorners: 3,
  maxCorners: 12,
  minEdge: 3,
  minArea: 36,
  maxArea: 2500,
  maxSpan: 96,
  minHalfWidth: 2,
  solidFraction: 0.85,
  maxClaimsPerPlayer: 3,
  maxTotalArea: 6000,
  guildMaxClaims: 6,
  guildMaxArea: 12000,
  coordLimit: 1_000_000,
  maxReach: 160,
  fenceOnBuy: true,
  depth: 16,
  height: 64,
  edgeBuffer: 2,
  protectedSpacing: 6,
  claimGap: 0,
  releaseGraceHours: 72,
  revokeGraceHours: 72,
  abandon: 'permanent',
  inactivityDays: 180,
  expiryWarningDays: 30,
  regen: {
    enabled: true,
    excavationHours: 60,
    placedHours: 60,
    fenceHours: 72,
    oreHoursDefault: 24,
    quietHours: 6,
    playerClearance: 10,
    oreClearance: 24,
    retryMinutes: 30,
    maxPostpones: 48,
    batchBlocks: 256,
    stepMs: 4,
    stepSeconds: 5,
    containerGraceDays: 7,
  },
};

/** The defaults with some of them replaced (a nested `regen` is merged, not replaced). */
export function landConfigWith(over: LandConfigOverride = {}): LandConfig {
  return { ...DEFAULT_LAND_CONFIG, ...over, regen: { ...DEFAULT_LAND_CONFIG.regen, ...(over.regen ?? {}) } };
}

export type LandConfigOverride = Partial<Omit<LandConfig, 'regen'>> & { regen?: Partial<RegenConfig> };

export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;
export const LAND_DAY_MS = 24 * HOUR_MS;
