import { create } from 'zustand';
import { QuestLog, type BossView, type DungeonView, type AttrKey, type AuctionCommand, type AuctionView, type StashCommand, type StashView, type ClassView, type Container, type CreativeAmount, type GearRoll, type GearSpec, type ClassId, type MountView, type InspectView, type SocialAction, type SocialView, type TradeAct, type TradeView, type Menu, type MenuKind, type PartyAction, type PartyMemberView, type QuestLogJSON, type RecipeBook } from '@solrift/shared';
import type { ItemIcons } from '../game/icons';
import type { MapData } from '../game/mapData';

export type Screen = 'none' | MenuKind | 'dead' | 'dialog';
export type GameMode = 'survival' | 'creative';

/** What the React UI can ask the engine to do. Implemented in game/main.ts. */
export interface UiApi {
  inventory: Container;
  /** The bags worn (the room of each is in inventory, after the backpack). */
  bags: Container;
  /** The off-hand slot (a shield). */
  offhand: Container;
  mountSlot: Container;
  icons: ItemIcons;
  menu(): Menu | null;
  click(slot: number, button: 0 | 1): void;
  shift(slot: number): void;
  /** The Organize button: merge and sort the backpack and each worn bag. */
  organize(): void;
  /** Let go of the stack on the cursor outside the screen: it drops to the ground (all of it, or one). */
  dropCursor(all: boolean): void;
  /** The trash of the open screen: destroy the stack on the cursor (all of it, or one). */
  destroyCursor(all: boolean): void;
  /** What this player has held, which decides the recipes the book lists. */
  recipeBook: RecipeBook;
  /** Creative players see every recipe. */
  recipesAll(): boolean;
  /** Recipe book click: lay recipe `index` out in the crafting grid (all = as many crafts as fit). */
  fillRecipe(index: number, all: boolean): void;
  /** Crafting grid: start the forge (a piece at +9 or more with its Rift and Dawn jewels in it). */
  forge(all: boolean): void;
  /** Creative inventory: how many a palette click hands out, empty everything, make a piece in the gear forge. */
  creativeAmount(n: CreativeAmount): void;
  creativeClear(): void;
  creativeGear(spec: GearSpec): void;
  /** Trade screen: choose offer index of the villager's list. */
  trade(index: number): void;
  /** Enchanting table: choose offer index (0..2). */
  enchant(index: number): void;
  /** Anvil: the name typed in the box (null puts the item's own name back). */
  anvilName(name: string | null): void;
  close(): void;
  /** Quests: take one up or hand one in at the NPC being talked to, or give one up from the log. */
  questAction(action: 'accept' | 'complete' | 'abandon', id: string): void;
  /** At a merchant: buy `n` times the ware at stock index `i`, or sell `n` of the item in inventory slot `i`. */
  shop(action: 'buy' | 'sell', i: number, n: number): void;
  /** At the Auctioneer: search the house, post, bid, buy out, cancel, collect mail. The house answers with its view (`auction` in the state). */
  auction(cmd: AuctionCommand): void;
  /** At the Stashkeeper: put an inventory slot's items into the wallet's stash, or take some out. The stash answers with its view (stash in the state). */
  stash(cmd: StashCommand): void;
  /** Open or close the quest log (key L). */
  toggleQuestLog(open?: boolean): void;
  /** The party: invite, accept or decline an invitation, leave, remove a member, hand over the lead. */
  partyAction(action: PartyAction, name?: string): void;
  /** Open or close the party window (key P). */
  togglePartyWindow(open?: boolean): void;
  /** The social window (key O): ask for its lists, add or drop a friend, ignore or hear somebody, look at a player. */
  toggleSocialWindow(open?: boolean): void;
  toggleCodex(open?: boolean): void;
  socialRefresh(): void;
  socialAct(action: SocialAction, name: string): void;
  inspect(name: string): void;
  /** A guild action as the words of /guild (create Name TAG, kick ann, accept). */
  guild(line: string): void;
  /** Begin a whisper to somebody (opens the chat with `/w name `). */
  whisper(name: string): void;
  /** A step of a trade between players: ask, answer, put things on the table, accept, cancel. */
  tradeAct(act: TradeAct): void;
  /** Open the menu of a player (whisper, trade, invite...) at a place on screen, or close it. */
  openPlayerMenu(name: string, x: number, y: number): void;
  /** Close it; `relock` (the default) goes back to the game when no other window holds the mouse. */
  closePlayerMenu(relock?: boolean): void;
  /** Use the ability on a button of the ability bar (0..3); the server decides whether it goes off. */
  ability(slot: number): void;
  /** Spend `n` stat points on Strength, Agility, Vitality or Energy, or take them all back. The server counts them. */
  spendStat(stat: AttrKey, n: number): void;
  resetStats(): void;
  /** Open the spellbook, a tab of the inventory window (key K). */
  openSpellbook(): void;
  respawn(): void;
  /** Get out of the bed you are sleeping in. */
  wake(): void;
  deathMessage(): string;
  /** Leave this world and go back to the title screen. */
  quitToTitle(): void;
  /** Save, then go to the character lobby (where the character, and the way to play, is chosen again). */
  quitToCharacters(): void;
  /** Delete this world from the device and go back to the title screen. */
  deleteWorld(): Promise<void>;
  /** Furnace progress for the open furnace menu (0..1), or null. */
  furnaceState(): { burn: number; cook: number } | null;
}

/** One line of the pickup feed. */
export interface PickupNote {
  key: number;
  id: number;
  /** How many were picked up (grows while the same thing keeps being picked up). */
  count: number;
  /** How many of it the bag holds. */
  total: number;
  name?: string;
  ench?: [number, number][];
  gear?: GearRoll;
  /** Goes up each time the line is added to, to replay its bump and restart its fade. */
  stamp: number;
}

/** What the Codex shows: the biome the traveller is in, and what they have found (see `DiscoveryLog`). */
export interface CodexView {
  here: number;
  biomes: number[];
  structures: string[];
  caves: string[];
  achievements: string[];
}

export interface UiState {
  screen: Screen;
  /** Bumped whenever inventory/menu contents change so components re-read them. */
  version: number;
  selected: number;
  mode: GameMode;
  health: number;
  hunger: number;
  air: number;
  /** Experience level and bar fill (0..1). */
  level: number;
  xpProgress: number;
  /** The coins carried. */
  coins: number;
  /** Defense points of the worn armor (0..20); the HUD shows them as armor icons. */
  armor: number;
  /** Seconds of the Poison status effect left, rounded up. 0 hides the icon. */
  poison: number;
  /** Seconds of the Hunger sickness status effect left, rounded up. 0 hides the icon. */
  foodSick: number;
  /** Hardcore world: the hearts look different and death is final. */
  hardcore: boolean;
  /** Hardcore, after dying: no hotbar or vitals, only looking around. */
  spectating: boolean;
  /** Lying in a bed, and how far the screen has faded to black (0..1). */
  sleeping: boolean;
  sleep: number;
  /** On fire: flames lick up the bottom of the screen. */
  burning: boolean;
  /** The 'New Recipes Unlocked!' toast: the result items to cycle through; `stamp` restarts its timer. */
  recipeToast: { icons: number[]; stamp: number } | null;
  /** Adventure mode: the quest log (a copy of the one the session keeps), a counter for re-reads, and what is on screen. */
  adventure: boolean;
  quests: QuestLog;
  questsVersion: number;
  dialogNpc: string | null;
  /** The merchant's wares are shown in place of the talk. */
  shopOpen: boolean;
  /** The Auction House as the Auctioneer last showed it (null: the window is not open). */
  auction: AuctionView | null;
  /** The wallet's stash as the Stashkeeper last showed it (null: the window is not open). */
  stash: StashView | null;
  questLogOpen: boolean;
  /** The achievements: the counts of the deeds and the ids won (as the session last sent them). */
  ach: { stats: Record<string, number>; done: string[] };
  /** Your party (the leader first; empty when alone), who is inviting you, and whether the party window (P) is open. */
  party: PartyMemberView[];
  partyInvite: string | null;
  partyOpen: boolean;
  /** The social window (O): its lists as the server last sent them, whether it is open, and the player being looked at. */
  social: SocialView | null;
  socialOpen: boolean;
  inspect: { name: string; view: InspectView | null } | null;
  /** The player the crosshair rests on (it stays a few seconds after you look away), for the target frame. */
  target: { name: string; cls?: ClassId; level?: number; guild?: string } | null;
  /** The menu of a player, and where it is drawn. */
  playerMenu: { name: string; x: number; y: number } | null;
  /** The trade you are in (the table), and who is asking you to trade. */
  trade: TradeView | null;
  tradeAsk: string | null;
  /** The character's class state (null for a character without a class), and whether the class sheet (K) is open. */
  cls: ClassView | null;
  /** The boss being fought (its health bar, phase and the spell it gathers), and the last thing it said or the raid was warned of. */
  boss: BossView | null;
  /** How far the player is in the dungeon they are in (the tracker under the quests); null outside one. */
  dungeon: DungeonView | null;
  bossLine: { text: string; kind: 'yell' | 'warn'; stamp: number } | null;
  /** The tab of the inventory window (E): the bags, the crafting grid, or the spellbook (K opens it there). */
  invTab: 'inventory' | 'crafting' | 'spells';
  /** A window drawn for the loading screen only, so that its first real opening paints nothing new (see warmWindows in main.ts). */
  warmMenu: Menu | null;
  /** Your mount: the one ridden, the one in the mount slot (H summons it), and the cooldowns of its two skills. */
  mount: MountView;
  /** What a jewel just did to the piece in this slot of the window (shown floating above it; `n` restarts it). */
  jewelFx: { n: number; slot: number; ok: boolean; kind: 'dawn' | 'rift' | 'bloom'; label: string; detail: string } | null;
  /** The last named place entered (the banner shows it for a few seconds; `stamp` restarts it). */
  zone: { id: string; stamp: number } | null;
  /** The name of the place the player is in (the minimap shows it): a village, a cave, a biome. Empty before the world is ready. */
  place: string;
  /** What was just picked up off the ground (the feed in the corner; see `pushPickup`). */
  pickups: PickupNote[];
  /** What the quests just did, shown under the tracker for a few seconds. */
  questNotes: { key: number; what: 'accept' | 'step' | 'ready' | 'done'; text: string }[];
  /** The map: what the minimap in the corner and the map held up in front of you draw from (null before the world is ready). */
  map: MapData | null;
  /** The minimap in the corner is shown (key J), and the map item is held up (right-click while holding it) at this zoom (pixels per block). */
  minimap: boolean;
  /** The character owns a map (the Adventure world hands it out at the end of the first quest; without it there is no minimap). */
  hasMap: boolean;
  /** Which picture of the compass the needle is at now (0..COMPASS_FRAMES - 1, clockwise from straight up); the bar and the bags draw their compasses with it. */
  compassFrame: number;
  mapUp: boolean;
  mapZoom: number;
  /** The Codex of the World Beyond (key B): whether it is open, and what has been found (null outside that world). */
  codexOpen: boolean;
  codex: CodexView | null;
  /** Notifications of a find or an achievement, shown a few seconds (the game removes them). */
  beyondNotes: { key: number; kind: 'discovery' | 'achievement'; title: string; text: string }[];
  api: UiApi | null;
}

export const useUi = create<UiState>()(() => ({
  screen: 'none',
  version: 0,
  selected: 0,
  mode: 'survival',
  health: 20,
  hunger: 20,
  air: 15,
  level: 0,
  xpProgress: 0,
  coins: 0,
  shopOpen: false,
  auction: null,
  stash: null,
  armor: 0,
  poison: 0,
  foodSick: 0,
  hardcore: false,
  spectating: false,
  sleeping: false,
  sleep: 0,
  burning: false,
  recipeToast: null,
  adventure: false,
  quests: new QuestLog(),
  questsVersion: 0,
  dialogNpc: null,
  questLogOpen: false,
  ach: { stats: {}, done: [] },
  party: [],
  partyInvite: null,
  partyOpen: false,
  social: null,
  socialOpen: false,
  inspect: null,
  target: null,
  playerMenu: null,
  trade: null,
  tradeAsk: null,
  cls: null,
  boss: null,
  dungeon: null,
  bossLine: null,
  invTab: 'inventory',
  warmMenu: null,
  mount: { mount: 0, pick: 0, cd: [0, 0] },
  jewelFx: null,
  zone: null,
  place: '',
  questNotes: [],
  pickups: [],
  map: null,
  minimap: true,
  hasMap: true,
  compassFrame: 0,
  mapUp: false,
  mapZoom: 2,
  codexOpen: false,
  codex: null,
  beyondNotes: [],
  api: null,
}));

/** The session sent the whole quest log. */
export const setQuests = (log: QuestLogJSON): void =>
  useUi.setState((s) => {
    s.quests.loadJSON(log);
    return { questsVersion: s.questsVersion + 1 };
  });

/** The session sent the party (or none) and who is inviting. */
export const setParty = (members: PartyMemberView[], invite: string | null): void => useUi.setState({ party: members, partyInvite: invite });

export const showBossLine = (text: string, kind: 'yell' | 'warn'): void => useUi.setState((s) => ({ bossLine: { text, kind, stamp: (s.bossLine?.stamp ?? 0) + 1 } }));

export const showZone = (id: string): void => useUi.setState((s) => ({ zone: { id, stamp: (s.zone?.stamp ?? 0) + 1 } }));

let noteKey = 0;
export const pushQuestNote = (what: 'accept' | 'step' | 'ready' | 'done', text: string): void => {
  const key = ++noteKey;
  useUi.setState((s) => ({ questNotes: [...s.questNotes.slice(-3), { key, what, text }] }));
  setTimeout(() => useUi.setState((s) => ({ questNotes: s.questNotes.filter((n) => n.key !== key) })), 5000);
};

/**
 * The pickup feed: what was just picked up off the ground, newest last. The same thing picked up again within a few
 * seconds adds to its line instead of making a new one (`stamp` restarts the line's fade and bump).
 */
const PICKUP_SHOW_MS = 3200;
const PICKUP_MERGE_MS = 2500;
const PICKUP_MAX = 6;
let pickupKey = 0;
const pickupAt = new Map<number, number>();
const pickupTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const pushPickup = (p: { id: number; count: number; total: number; name?: string; ench?: [number, number][]; gear?: GearRoll }): void => {
  const now = Date.now();
  const same = (n: PickupNote): boolean => n.id === p.id && n.name === p.name && JSON.stringify(n.ench) === JSON.stringify(p.ench) && JSON.stringify(n.gear) === JSON.stringify(p.gear) && now - (pickupAt.get(n.key) ?? 0) < PICKUP_MERGE_MS;
  const prev = [...useUi.getState().pickups].reverse().find(same);
  const key = prev?.key ?? ++pickupKey;
  pickupAt.set(key, now);
  clearTimeout(pickupTimers.get(key));
  pickupTimers.set(
    key,
    setTimeout(() => {
      pickupAt.delete(key);
      pickupTimers.delete(key);
      useUi.setState((s) => ({ pickups: s.pickups.filter((n) => n.key !== key) }));
    }, PICKUP_SHOW_MS),
  );
  useUi.setState((s) => {
    if (prev) return { pickups: s.pickups.map((n) => (n.key === key ? { ...n, count: n.count + p.count, total: p.total, stamp: n.stamp + 1 } : n)) };
    const next: PickupNote = { key, id: p.id, count: p.count, total: p.total, stamp: 0, ...(p.name ? { name: p.name } : {}), ...(p.ench ? { ench: p.ench } : {}), ...(p.gear ? { gear: p.gear } : {}) };
    return { pickups: [...s.pickups, next].slice(-PICKUP_MAX) };
  });
};

export const clearPickups = (): void => {
  for (const t of pickupTimers.values()) clearTimeout(t);
  pickupTimers.clear();
  pickupAt.clear();
  useUi.setState({ pickups: [] });
};

export const bumpUi = (): void => useUi.setState((s) => ({ version: s.version + 1 }));

/** Announce newly learned recipes. Ones that arrive while the toast is up join it, as in the original. */
export const pushRecipeToast = (icons: number[]): void =>
  useUi.setState((s) => ({
    recipeToast: {
      icons: [...new Set([...(s.recipeToast?.icons ?? []), ...icons])],
      stamp: (s.recipeToast?.stamp ?? 0) + 1,
    },
  }));

export const clearRecipeToast = (): void => useUi.setState({ recipeToast: null });
