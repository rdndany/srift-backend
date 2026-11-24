import { create } from 'zustand';
import { QuestLog, type MobKind, type BountyView, type BossView, type RiftView, type DungeonView, type AttrKey, type AuctionCommand, type AuctionView, type StashCommand, type StashView, type ClassView, type Container, type CreativeAmount, type GearRoll, type GearSpec, type ClassId, type StatusView, type MountView, type InspectView, type SocialAction, type SocialView, type DuelAct, type TradeAct, type TradeView, type Menu, type MenuKind, type PartyAction, type PartyMemberView, type QuestLogJSON, type RecipeBook } from '@solrift/shared';
import type { LandClaimView, LandDetail, LandPreview, LandPublicConfig, Perms } from '@solrift/shared';
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
  /** The outfit slot (a glowing set). */
  outfitSlot: Container;
  /** The companion slot (a companion). */
  companionSlot: Container;
  /** The wing slot (a pair of wings). */
  wingSlot: Container;
  /** The rings and the necklace (ring, ring, necklace). */
  accessories: Container;
  icons: ItemIcons;
  menu(): Menu | null;
  click(slot: number, button: 0 | 1): void;
  shift(slot: number): void;
  /** The Organize button: merge and sort the backpack and each worn bag. */
  organize(): void;
  /** A chest's Organize (merge and sort it) or Deposit (move matching items from the bags into it). */
  chestAct(action: 'organize' | 'deposit'): void;
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
  /** Runic Altar: inscribe the glyph `id` (one rank), or with `erase` take it off the piece. */
  enchant(id: number, erase?: boolean): void;
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
  /** Ask somebody to duel, or answer them. */
  duelAct(act: DuelAct): void;
  /** Open the menu of a player (whisper, trade, invite...) at a place on screen, or close it. */
  openPlayerMenu(name: string, x: number, y: number): void;
  /** Close it; `relock` (the default) goes back to the game when no other window holds the mouse. */
  closePlayerMenu(relock?: boolean): void;
  /** Turn your microphone on or off. People near you hear you only while it is on. With no argument it switches. `quiet` skips the chat line (a held key would write one every press). */
  toggleVoice(on?: boolean, quiet?: boolean): void;
  /** Whether you have silenced this player. */
  voiceMuted(name: string): boolean;
  /** Stop hearing this player, or hear them again. */
  muteVoice(name: string): void;
  /** Finish writing a sign: its lines are sent to the server, or null leaves it as it was. Either way the editor closes. */
  signDone(lines: string[] | null): void;
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

/** What the Land Surveyor and the land windows show (see game/landClient.ts, which owns it). */
export interface LandUi {
  /** The server's rules for land (null: this world has none, and nothing of it is shown). */
  cfg: LandPublicConfig | null;
  /** The claims round the player (the server sends the ones within sight). */
  nearby: LandClaimView[];
  /** The player's own claims, and the ones they may build in. */
  mine: LandClaimView[];
  /** The Surveyor is in the hand. */
  holding: boolean;
  /** Corners marked, whether the shape is closed, and what is wrong with it that can be seen at once. */
  corners: number;
  closed: boolean;
  fault: string | null;
  /** How straight the shape is, in words, and whether it is a perfect rectangle or square (see game/landMarkers.ts). */
  straightText: string | null;
  perfect: boolean;
  /** What the server last said of the shape (its price and whether it can be bought). */
  preview: LandPreview | null;
  /** The claim being grown (the shape is the new outline of it), or null. */
  expanding: string | null;
  /** What the crosshair is on while the Surveyor is held. */
  look: LandLook | null;
  /** The confirmation of a purchase, the window of the player's lands, and the answer of the last thing asked. */
  confirm: boolean;
  manage: boolean;
  busy: boolean;
  result: { what: string; ok: boolean; text: string; stamp: number } | null;
  /** The claim the window has open, as the server described it. */
  detail: LandDetail | null;
  /** The tutorial card (first times the Surveyor is held). */
  tutorial: boolean;
  /** Where the player stands (x, z), a couple of times a second, for 'how far is my land'. */
  at: [number, number];
  /** A line of context near the crosshair ("Available Land"), and when it was said (so it fades). */
  hint: { text: string; tone: 'good' | 'warn' | 'bad' | 'info'; stamp: number } | null;
}

/** What the crosshair is on, with the Surveyor in the hand. Never carries an account, only names. */
export interface LandLook {
  kind: 'mine' | 'guild' | 'shared' | 'other' | 'wild' | 'protected';
  name: string;
  owner: string;
  /** A line of its own (the server's territory says what it is). */
  note?: string;
  /** Others have rights here besides the owner. */
  shared: boolean;
  canBuild: boolean;
  /** What the player may do here. */
  can: Perms | null;
  area: number;
}

/** What the land windows ask of the game. Implemented in game/landClient.ts. */
export interface LandApi {
  confirmOpen(): void;
  confirmClose(): void;
  buy(name: string): void;
  /** Throw away the marked corners. */
  cancel(): void;
  openManage(): void;
  closeManage(): void;
  refresh(): void;
  select(id: string | null): void;
  rename(id: string, name: string): void;
  grant(id: string, kind: 'player' | 'guild', who: string, role: string): void;
  revoke(id: string, kind: 'player' | 'guild', who: string): void;
  setPublic(id: string, perms: Partial<Perms>, guildRole?: 'builder' | 'visitor'): void;
  release(id: string): void;
  unrelease(id: string): void;
  /** Put the claim's outline in the Surveyor, to be changed and bought as an expansion. */
  expand(id: string): void;
  recover(): void;
  dismissTutorial(): void;
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


/** What the frame needs to draw a creature: the store keeps one of these (or null). */
export interface MobTargetView {
  id: number;
  kind: MobKind;
  /** Its coat or person: an NPC's is which person it is. */
  variant: number;
  level: number;
  /** Its health now and its most; the bar is hidden for a creature that cannot be hurt. */
  hp: number;
  max: number;
  /** Shown a step above its kind (a strong one of a dungeon). */
  elite: boolean;
  /** It is in a fight. False when it is at rest. */
  aggro: boolean;
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
  /** Today's daily bounties as the session last sent them (null before the first), and when (ms) that was, for counting down to the next day. */
  bounties: BountyView | null;
  bountiesAt: number;
  /** Your party (the leader first; empty when alone), who is inviting you, and whether the party window (P) is open. */
  party: PartyMemberView[];
  partyInvite: string | null;
  partyOpen: boolean;
  /** The social window (O): its lists as the server last sent them, whether it is open, and the player being looked at. */
  social: SocialView | null;
  socialOpen: boolean;
  inspect: { name: string; view: InspectView | null } | null;
  /** The player the crosshair rests on (it stays a few seconds after you look away), for the target frame. `look` is their face. */
  target: { name: string; cls?: ClassId; level?: number; guild?: string; look?: number; hp?: number; hm?: number; se?: StatusView[] } | null;
  /** The animal, monster or person the crosshair rests on (it stays a few seconds after you look away), for the target frame. */
  mobTarget: MobTargetView | null;
  /** The menu of a player, and where it is drawn. */
  playerMenu: { name: string; x: number; y: number } | null;
  /** Online, and the microphone can be turned on. `voiceOn` is whether yours is sending. `voiceMuted` is who you will not hear (names in lower case). */
  voiceLive: boolean;
  voiceOn: boolean;
  voiceMuted: string[];
  /** The board of a sign being written (its block and the four lines it says now), or null. */
  signEdit: { x: number; y: number; z: number; lines: string[] } | null;
  /** The trade you are in (the table), and who is asking you to trade. */
  trade: TradeView | null;
  tradeAsk: string | null;
  /** Who is asking you to duel, the count in the middle of the screen, and whether the fight has started. */
  duelAsk: string | null;
  duelCount: number | 'start' | null;
  dueling: boolean;
  /** The character's class state (null for a character without a class), and whether the class sheet (K) is open. */
  cls: ClassView | null;
  /** The boss being fought (its health bar, phase and the spell it gathers), and the last thing it said or the raid was warned of. */
  boss: BossView | null;
  /** How far the player is in the dungeon they are in (the tracker under the quests); null outside one. */
  dungeon: DungeonView | null;
  /** The rift open near the player (its tracker); null when none is within sight. */
  rift: RiftHud | null;
  bossLine: { text: string; kind: 'yell' | 'warn'; stamp: number; color?: string } | null;
  /** The tab of the inventory window (E): the bags, the crafting grid, or the spellbook (K opens it there). */
  invTab: 'inventory' | 'attributes' | 'crafting' | 'spells';
  /** A window drawn for the loading screen only, so that its first real opening paints nothing new (see warmWindows in main.ts). */
  warmMenu: Menu | null;
  /**
   * The parts of the screen that only come up in a fight or a rift (the boss's frame and what it says, the rift and dungeon
   * trackers) drawn for the loading screen only, nearly clear: the browser builds the painting of each the first time it is on
   * the screen and stands still while it does (see warmWindows in main.ts).
   */
  warmHud: boolean;
  /** Your mount: the one ridden, the one in the mount slot (H summons it), and the cooldowns of its two skills. */
  mount: MountView;
  /** What a jewel just did to the piece in this slot of the window (shown floating above it; `n` restarts it). */
  jewelFx: { n: number; slot: number; ok: boolean; kind: 'dawn' | 'rift' | 'bloom'; label: string; detail: string } | null;
  /** The slot a Codex of Aurelion just filled (`slot` is the bag index; `n` restarts the glow). */
  gearGlow: { n: number; slot: number } | null;
  /** The Runic Altar's last inscription that failed (the window flashes and says so; `n` counts them). */
  altarFail: { n: number } | null;
  /** The last named place entered (the banner shows it for a few seconds; `stamp` restarts it). */
  zone: { id: string; stamp: number } | null;
  /** The name of the place the player is in : a village, a cave, a biome. Empty before the world is ready. */
  place: string;
  /** What was just picked up off the ground (the feed in the corner; see `pushPickup`). */
  pickups: PickupNote[];
  /** What the quests just did, shown under the tracker for a few seconds. */
  questNotes: { key: number; what: 'accept' | 'step' | 'ready' | 'done'; text: string }[];
  /** The map: what the map held up in front of you draws from (null before the world is ready). */
  map: MapData | null;
  /** The character owns a map (the Adventure world hands it out at the end of the first quest; without it the compass is all there is). */
  hasMap: boolean;
  /** Which picture of the compass the needle is at now (0..COMPASS_FRAMES - 1, clockwise from straight up); the bar and the bags draw their compasses with it. */
  compassFrame: number;
  /** The map item is held up (right-click while holding it) at this zoom (pixels per block). */
  mapUp: boolean;
  mapZoom: number;
  /** The Codex of the World Beyond (key B): whether it is open, and what has been found (null outside that world). */
  codexOpen: boolean;
  codex: CodexView | null;
  /** The land: the Surveyor, its shape and price, the confirmation and the window of the player's lands. */
  land: LandUi;
  landApi: LandApi | null;
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
  bounties: null,
  bountiesAt: 0,
  party: [],
  partyInvite: null,
  partyOpen: false,
  social: null,
  socialOpen: false,
  inspect: null,
  target: null,
  mobTarget: null,
  playerMenu: null,
  voiceLive: false,
  voiceOn: false,
  voiceMuted: [],
  signEdit: null,
  trade: null,
  tradeAsk: null,
  duelAsk: null,
  duelCount: null,
  dueling: false,
  cls: null,
  boss: null,
  dungeon: null,
  rift: null,
  bossLine: null,
  invTab: 'inventory',
  warmMenu: null,
  warmHud: false,
  mount: { mount: 0, pick: 0, cd: [0, 0] },
  jewelFx: null,
  gearGlow: null,
  altarFail: null,
  zone: null,
  place: '',
  questNotes: [],
  pickups: [],
  map: null,
  hasMap: true,
  compassFrame: 0,
  mapUp: false,
  mapZoom: 2,
  codexOpen: false,
  codex: null,
  land: freshLand(),
  landApi: null,
  beyondNotes: [],
  api: null,
}));

/** The land state of a game that has not met any land yet. */
export function freshLand(): LandUi {
  return { cfg: null, nearby: [], mine: [], holding: false, corners: 0, closed: false, fault: null, straightText: null, perfect: false, preview: null, expanding: null, look: null, confirm: false, manage: false, busy: false, result: null, detail: null, tutorial: false, at: [0, 0], hint: null };
}

export const setLand = (patch: Partial<LandUi>): void => useUi.setState((s) => ({ land: { ...s.land, ...patch } }));

/** The session sent the whole quest log. */
export const setQuests = (log: QuestLogJSON): void =>
  useUi.setState((s) => {
    s.quests.loadJSON(log);
    return { questsVersion: s.questsVersion + 1 };
  });

/** The session sent the party (or none) and who is inviting. */
export const setParty = (members: PartyMemberView[], invite: string | null): void => useUi.setState({ party: members, partyInvite: invite });

/** The rift near the player as the tracker shows it: its state, and how far and which way it lies. */
export type RiftHud = RiftView & { dist: number; dir: string };

export const showBossLine = (text: string, kind: 'yell' | 'warn', color?: string): void => useUi.setState((s) => ({ bossLine: { text, kind, stamp: (s.bossLine?.stamp ?? 0) + 1, ...(color ? { color } : {}) } }));

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
