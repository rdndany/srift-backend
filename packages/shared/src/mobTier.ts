import type { MobDef, MobKind } from './mobs';

/**
 * How strong a kind of creature is, in the same four steps as an item's rarity (and the same colours): common, uncommon, rare, epic.
 * A tier says what sort of creature it is; its level says how strong this one is. Both are shown on the target frame, and the tier
 * also tilts what a kill gives (see `MOB_TIER_INFO`). A boss is an epic with a "Boss" tag; a strong one of a dungeon (`elite`) is shown a step higher.
 */
export type MobTier = 'common' | 'uncommon' | 'rare' | 'epic';

export const MOB_TIERS: readonly MobTier[] = ['common', 'uncommon', 'rare', 'epic'];

export interface MobTierInfo {
  name: string;
  /** The colour of its name on the target frame (the item rarities' colours). */
  color: string;
  /** What a kill's experience is multiplied by. */
  xp: number;
  /** What the chance of a piece of gear from it is multiplied by. */
  loot: number;
}

export const MOB_TIER_INFO: Record<MobTier, MobTierInfo> = {
  common: { name: 'Common', color: '#c9c4b4', xp: 1, loot: 1 },
  uncommon: { name: 'Uncommon', color: '#6bff8a', xp: 1, loot: 1 },
  rare: { name: 'Rare', color: '#5aa8ff', xp: 1.25, loot: 1.25 },
  epic: { name: 'Epic', color: '#c77dff', xp: 1.5, loot: 1.5 },
};

/** The tier and the level of every kind (a slime's level also grows with its size, see `mobLevel`). */
const RANK: Record<MobKind, readonly [MobTier, number]> = {
  pig: ['common', 1],
  cow: ['common', 1],
  sheep: ['common', 1],
  chicken: ['common', 1],
  rabbit: ['common', 1],
  squid: ['common', 1],
  bat: ['common', 1],
  wolf: ['uncommon', 4],
  fox: ['common', 2],
  cat: ['common', 1],
  ocelot: ['common', 2],
  horse: ['common', 2],
  donkey: ['common', 2],
  mule: ['common', 2],
  llama: ['common', 2],
  trader_llama: ['common', 2],
  camel: ['common', 3],
  goat: ['uncommon', 3],
  panda: ['common', 3],
  polar_bear: ['uncommon', 6],
  mooshroom: ['common', 2],
  armadillo: ['common', 1],
  sniffer: ['common', 3],
  turtle: ['common', 1],
  frog: ['common', 1],
  parrot: ['common', 1],
  bee: ['common', 2],
  allay: ['common', 1],
  axolotl: ['common', 2],
  dolphin: ['common', 3],
  glow_squid: ['common', 1],
  cod: ['common', 1],
  salmon: ['common', 1],
  pufferfish: ['common', 2],
  tropical_fish: ['common', 1],
  tadpole: ['common', 1],
  zombie: ['uncommon', 3],
  skeleton: ['uncommon', 4],
  creeper: ['rare', 6],
  spider: ['uncommon', 3],
  cave_spider: ['uncommon', 4],
  slime: ['uncommon', 2],
  enderman: ['rare', 10],
  husk: ['uncommon', 5],
  stray: ['uncommon', 5],
  drowned: ['uncommon', 4],
  villager: ['common', 1],
  hollow_king: ['epic', 15],
  moss_lurker: ['rare', 7],
  spore_puff: ['uncommon', 5],
  ember_wraith: ['rare', 9],
  ashen_knight: ['epic', 11],
  hollow_priest: ['epic', 12],
  shade: ['rare', 10],
  gilt_imp: ['uncommon', 8],
  gilt_hound: ['uncommon', 9],
  gilt_drake: ['rare', 11],
  gilt_colossus: ['epic', 13],
  aurelion: ['epic', 16],
  npc: ['common', 1],
  dummy: ['common', 1],
  armor_stand: ['common', 1],
};

export const mobTier = (kind: MobKind): MobTier => RANK[kind]?.[0] ?? 'common';

/** The level of a creature: its kind's, and a slime's grows with its size (1: level 2, 2: level 4, 4: level 6). */
export function mobLevel(kind: MobKind, size = 1): number {
  const base = RANK[kind]?.[1] ?? 1;
  return kind === 'slime' ? base + Math.round(Math.log2(Math.max(1, size))) * 2 : base;
}

/** The tier to show: a strong one of a dungeon (`elite`) is a step above its kind. */
export function shownTier(kind: MobKind, elite = false): MobTier {
  const i = MOB_TIERS.indexOf(mobTier(kind));
  return MOB_TIERS[Math.min(MOB_TIERS.length - 1, i + (elite ? 1 : 0))];
}

/** What a creature is to the player, for the tag on its frame. */
export type MobRole = 'boss' | 'hostile' | 'neutral' | 'passive' | 'npc' | 'trader' | 'dummy' | 'stand';

export const MOB_ROLE_LABEL: Record<MobRole, string> = {
  boss: 'Boss',
  hostile: 'Hostile',
  neutral: 'Neutral',
  passive: 'Passive',
  npc: 'Quest giver',
  trader: 'Trader',
  dummy: 'Training dummy',
  stand: 'Armor stand',
};

export function mobRole(def: Pick<MobDef, 'kind' | 'hostile' | 'boss' | 'melee' | 'provoke'>): MobRole {
  if (def.kind === 'npc') return 'npc';
  if (def.kind === 'villager') return 'trader';
  if (def.kind === 'dummy') return 'dummy';
  if (def.kind === 'armor_stand') return 'stand';
  if (def.boss) return 'boss';
  if (def.hostile) return def.provoke === 'stare' ? 'neutral' : 'hostile';
  return def.melee ? 'neutral' : 'passive';
}
