import {
  ATTACK_ANIM,
  BOSS_ANIM,
  BASH_ANIM,
  HeadlessWorld,
  Player,
  Realm,
  STEP,
  AnvilMenu,
  GrindstoneMenu,
  CraftingMenu,
  EnchantMenu,
  glowCode,
  TradeMenu,
  ADVENTURE_LAYOUT,
  GENERATOR_VERSION,
  ADVENTURE_SEED,
  CHUNK_VOLUME,
  lookCode,
  parseWornCode,
  plainCodeOf,
  wornCode,
  outfitSetFits,
  outfitSetOfItem,
  makeStack,
  Container,
  lookFromName,
  makeGenerator,
  parsePlayerSave,
  parseNetClientMessage,
  type PlayerSave,
  type StashView,
  stashViewOf,
  parseWorldState,
  type ArrowView,
  type ClassId,
  type VehicleView,
  type Command,
  type DropView,
  type XpOrbView,
  type BobberView,
  type SignView,
  bobberMode,
  totalForLevel,
  MAX_LEVEL,
  MAX_AWARD,
  type InputFrame,
  type InventoryView,
  type ItemStack,
  type ItemView,
  type MenuView,
  type MobView,
  type NetClientMessage,
  type NetInput,
  type NetServerMessage,
  type PlayerView,
  type SaveMode,
  type SelfView,
  type SessionEvent,
  type Snapshot,
  type WorldKind,
  SocialBook,
  parseSocialBook,
  GUILD_COST,
  GUILD_INVITE_SECONDS,
  MAX_GUILD_MEMBERS,
  cleanGuildName,
  cleanGuildTag,
  cleanMotd,
  disbandError,
  doLeader,
  doRank,
  findGuildMember,
  guildNameError,
  inviteError,
  kickError,
  leaderError,
  leaveError,
  memberOf,
  motdError,
  rankError,
  type GuildCard,
  type GuildData,
  type SocialAction,
  Trade,
  TRADE_ASK_SECONDS,
  tradeBlocker,
  type TradeAct,
  type TradeSide,
  type TradeSideView,
  type TradeView,
  MOBS,
  type MobKind,
  LandService,
  MemoryLandStore,
  landConfigWith,
  MAX_COINS,
  type LandConfigOverride,
  type LandStore,
} from '@solrift/shared';

import { cleanQuery, type AuctionQuery, type AuctionView, type TokenMove } from '@solrift/shared';
import type { RoomStore } from './roomStore';
import { BANS_KEY, findItem, isAdminIdentity, itemMatches, norm, parseBans, type AdminEvent, type AdminOptions, type Bans } from './admin';
import { entryOf, findMember, inspectView, socialView, splitTarget } from './social';
import { GuildRegistry } from './guilds';

/** What a Camp action says for itself: done (with a line for the player) or refused (with the reason). */
export type DeskResult = { ok: true; message: string } | { ok: false; error: string };

/** The room's view of one connection. */
export interface RoomConnection {
  /** Says 'skipped' when the connection can tell a snapshot was not sent (it is skipped while the client is behind; see sendWithBackpressure). */
  send(msg: NetServerMessage): unknown;
  /**
   * Optional fast path for snapshots on a crowded server. `snap.players` is empty; `playersJson` is the JSON
   * array of the players in view, already serialised once for everybody (each player is written to JSON once
   * per tick instead of once per recipient). The connection must send what `JSON.stringify` would for the full snapshot.
   */
  sendSnapshot?(snap: Snapshot, playersJson: string): unknown;
  close(reason: string): void;
}

/** One player as the others see them this tick, written to JSON at most once. */
interface PlayerFrame {
  x: number;
  z: number;
  id: number;
  view: PlayerView;
  json: string | null;
}

export interface RoomOptions {
  seed: number;
  /** The kind of world: the generated overworld (default) or the Adventure world, which has a seed of its own. */
  kind?: WorldKind;
  /** Server ticks per second. */
  tickHz?: number;
  maxPlayers?: number;
  /** Game mode new players start in. */
  mode?: SaveMode;
  naturalSpawning?: boolean;
  /** Rifts (timed co-op world events): on whenever natural spawning is, unless said. */
  rifts?: boolean;
  /** The Gilded Tide (an invasion every half hour on the wall clock): off unless said. */
  invasions?: boolean;
  /** The wall clock the Gilded Tide keeps (default: the real one). A test sets its own. */
  clock?: () => number;
  /** Allow cheat commands in chat (/time, /weather, /gamemode, /tp). Off on shared servers. */
  cheats?: boolean;
  /** Who may switch on admin mode with `/admin on` (see `admin.ts`). Nobody, when absent. */
  admins?: AdminOptions;
  /** Called for every admin act (and every refused try at `/admin`), for the log. */
  onAdmin?: (e: AdminEvent) => void;
  /**
   * An achievement was won by a signed-in wallet in honest play (never in creative, in admin mode, or on a cheats server).
   * Returns the whole $SOLRIFT it paid into the wallet's balance, which the player is told about (0: nothing).
   */
  onAchievement?: (e: { wallet: string; account: string | null; id: string }) => number;
  /**
   * A dungeon was cleared by a signed-in wallet that fought in it in the last minute (same rules as `onAchievement`: honest play only).
   * Returns the whole $SOLRIFT it paid into the wallet's balance (0: nothing).
   */
  onClear?: (e: { wallet: string; account: string | null; id: string }) => number;
  /**
   * A daily bounty was finished by a signed-in wallet in honest play (same rules as `onAchievement`). `day` is the UTC day it was posted for.
   * Returns the whole $SOLRIFT it paid into the wallet's balance (0: nothing).
   */
  onBounty?: (e: { wallet: string; account: string | null; id: string; day: number }) => number;
  /**
   * Lets a player into a dungeon with a Hollow Key bought with $SOLRIFT (absent: the dungeon's own item only). `count` is how many the wallet holds,
   * `take` uses one up and returns how many are left (-1: none).
   */
  keys?: { count(wallet: string): number; take(wallet: string): number };
  /** How many extra stash tabs a wallet has bought (absent: none, the plain stash). */
  stashTabs?: (wallet: string) => number;
  /** The wall clock in ms (default `Date.now`): what the day's bounties are cut by. Tests set their own. */
  now?: () => number;
  /**
   * Lets players trade in $SOLRIFT at the Auction House (absent: Auren only). `balance` is a wallet's spendable balance; `commit` writes the
   * house's token moves to the ledger and calls `save` (which writes the house), all in one transaction, and throws if it cannot.
   */
  tokens?: {
    balance(wallet: string): number;
    commit(scope: string, moves: readonly TokenMove[], save: () => void): void;
  };
  rand?: () => number;

  /** Where the world and signed-in players' progress are kept. Without it nothing survives a restart. */
  store?: RoomStore;
  /** Where claims, the record of what was changed and the receipts of purchases are kept (in memory when left out: nothing survives a restart, like the rest of such a room). */
  land?: LandStore;
  /** The land rules to change from the defaults in landConfig.ts (prices, limits, timers). */
  landConfig?: LandConfigOverride;
  /** Seconds between automatic saves. */
  autosaveSeconds?: number;
  /** Suspicion score at which a player is kicked (see `strike`). Default 50. */
  kickScore?: number;
  /** Called for every strike and kick (logging, metrics). */
  onViolation?: (info: { id: number; name: string; reason: string; points: number; score: number; kicked: boolean }) => void;
}

/** What a misbehaving client costs, in suspicion points. The score decays by 1 per second. */
export const STRIKES = {
  invalidMessage: 5,
  droppedInput: 0.1,
  staleInput: 1,
  commandFlood: 0.5,
  chatSpam: 2,
  socialSpam: 0.5,
  forbidden: 3,
} as const;

export interface RoomStats {
  players: number;
  ticks: number;
  /** Smoothed milliseconds a tick takes. */
  tickMsAvg: number;
  /** Slowest tick since the last `stats(true)`. */
  tickMsMax: number;
  /** Ticks that took longer than their budget (1000 / tickHz ms). */
  overruns: number;
  strikes: number;
  kicks: number;
}

/** What a member looks like to everyone: the look it chose and, over it, the glowing set in its outfit slot (read live, so putting one on shows at once). */
function lookOf(m: { look: number; player: Player }): number {
  return wornCode(plainCodeOf(m.look), m.player.wornOutfit);
}

type QueueItem = { k: 'input'; f: NetInput } | { k: 'cmd'; c: Command };

interface Member {
  id: number;
  name: string;
  /** What they look like (a `lookCode`). */
  look: number;
  /** Account the progress belongs to (guests have none, so nothing of theirs is stored). */
  key: string | null;
  /** True when this character is on the server's admin list. Decided once, at join, from the signed-in wallet and character: never from anything the client sends. */
  admin: boolean;
  /** The wallet that signed in (null for a guest). */
  wallet: string | null;
  /** The tick at which this player last landed a hit on a mob (-Infinity: never). A dungeon clear only pays those who were fighting. */
  fightTick: number;
  /** Admin mode is on (`/admin on`). Always off at join, and only ever turned on for an `admin`. */
  adminOn: boolean;
  /** The tick until which they may not chat (`/mute`). */
  mutedUntil: number;
  player: Player;
  conn: RoomConnection;
  queue: QueueItem[];
  /** Seconds of input the player may still spend: stops clients from running faster than real time. */
  budget: number;
  /** Highest input seq applied; echoed to the client. */
  ack: number;
  /** Highest input seq received (older and duplicate inputs are dropped). */
  lastSeq: number;
  invDirty: boolean;
  chatTokens: number;
  /** Looks at the social window and at other players that may still be made (token bucket). */
  socialTokens: number;
  /** Friends and the people they ignore (kept with the account). */
  book: SocialBook;
  /** Who whispered them last, for /r. */
  replyTo: number | null;
  /** A guild that has asked them to join, and the tick it stops asking. */
  guildInvite: { guildId: string; from: string; until: number } | null;
  /** The trade they are in, and who with. */
  trade: { trade: Trade; peer: Member } | null;
  /** Somebody who asked to trade with them, and the tick the request lapses. */
  tradeAsk: { from: number; until: number } | null;
  /** Clicks at the trade table they may still make (token bucket). */
  tradeTokens: number;
  /** Commands the player may still send (token bucket), so inventory clicks cannot be flooded. */
  cmdTokens: number;
  /** Suspicion score: rises with misbehaviour, decays over time, kicks at `kickScore`. */
  score: number;
  warned: boolean;
  messages: number;
  /** The ability effects this player has been sent in full, and where (a client keeps what it was told: later snapshots only name them, see `snapshot`). */
  fxSent: Map<number, string>;
  /** The signs this player has been sent: the sign revision and the 8-block square they were near (a snapshot carries the list again when either changes), and how many there were. */
  signRev: number;
  signCell: string;
  signCount: number;
}

/** The commands of admin mode (`/admin` itself is handled with them). Anyone else who types one is told it does not exist. */
const ADMIN_COMMANDS = new Set(['players', 'kick', 'ban', 'unban', 'bans', 'mute', 'unmute', 'tpto', 'bring', 'give', 'announce', 'spawn', 'mobs', 'land']);
/** What a muted player may not say. */
const CHAT_COMMANDS = new Set(['w', 'whisper', 'tell', 'r', 'reply', 'g', 'p', 'me', 'emote']);

/** Most input a player may bank while the network stalls, in seconds. */
/** A dungeon clear pays a player who landed a hit on a mob within this many seconds of the kill. */
const CLEAR_ENGAGED_SECONDS = 60;
const MAX_BUDGET = 0.25;
const MAX_QUEUE = 240;
/** Commands per second a player may send (a burst of CMD_BURST is allowed). */
const CMD_RATE = 40;
const CMD_BURST = 60;
/** The social window polls every couple of seconds; a burst covers opening it and a few clicks. */
const SOCIAL_RATE = 1.5;
const SOCIAL_BURST = 8;
/** Clicks at a trade table: filling it takes a few quick ones. */
const TRADE_RATE = 6;
const TRADE_BURST = 20;
const MAX_STEPS_PER_TICK = 15;
const EDITS_PER_MESSAGE = 6000;

/**
 * Players one room takes unless `MAX_PLAYERS` says otherwise. The load test (`npm run loadtest`) holds 100
 * players standing in one spot at about half the tick budget; 120 keeps some headroom for that worst case.
 */
export const DEFAULT_MAX_PLAYERS = 120;

const VIEW_PLAYERS = 160;
const VIEW_MOBS = 96;
const VIEW_DROPS = 64;
/** How far from a player the writing on signs is sent (blocks): a little beyond where the client draws it. */
const VIEW_SIGNS = 48;
/**
 * In a crowd a client is sent the players nearest to it every snapshot (the ones the game draws as figures: `LOD.maxFull` in the client is
 * 20) and each of the others one snapshot in `FAR_PLAYER_EVERY`, the ids of the rest in `Snapshot.keep` so that the client does not drop them.
 * A far player is a block on the horizon, and the client smooths its way between snapshots.
 */
const NEAR_PLAYERS = 24;
const FAR_PLAYER_EVERY = 4;
/** Ability effects further away than this are not sent, and a client is sent at most `MAX_FX` of them (the nearest): more are not readable anyway. */
const VIEW_FX = 64;
const MAX_FX = 48;

const round = (v: number, p = 100): number => Math.round(v * p) / p;

/** The mount fields of a player's own view: left out until there is a mount to show. */
function mountFields(p: Player): { mount?: number; mountCd?: [number, number] } {
  const v = p.mountView();
  return v.mount === 0 ? {} : { mount: v.mount, mountCd: [v.cd[0], v.cd[1]] as [number, number] };
}
const itemView = (s: ItemStack | null): ItemView | null => {
  if (!s) return null;
  const v: ItemView = { id: s.id, count: s.count, damage: s.damage };
  if (s.ench) v.e = s.ench;
  if (s.name) v.n = s.name;
  if (s.rc) v.r = s.rc;
  if (s.gear) v.g = s.gear;
  return v;
};

/**
 * One shared world with many players. Each tick it runs the players' queued inputs (one physics step
 * per input, within a time budget), advances the shared simulation, and sends every player a
 * snapshot of what they can see. Clients never touch state directly.
 */
export class GameRoom {
  readonly seed: number;
  readonly kind: WorldKind;
  readonly tickHz: number;
  readonly world: HeadlessWorld;
  readonly realm: Realm;
  readonly members = new Map<number, Member>();
  tickCount = 0;

  private nextId = 1;
  /** Every guild of the realm. */
  readonly guilds: GuildRegistry;
  /** Claims and the memory of what was changed (see landService.ts). */
  readonly land: LandService;
  /** The generator was changed since the world was saved: the saved terrain edits were dropped, and the land re-applies the claimed ones. */
  private generatorChanged = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingBlocks: number[] = [];
  private readonly dirtyChunks = new Set<string>();
  private readonly stat = { tickMsAvg: 0, tickMsMax: 0, overruns: 0, strikes: 0, kicks: 0 };

  constructor(readonly opts: RoomOptions) {
    this.kind = opts.kind ?? 'overworld';
    this.seed = this.kind === 'adventure' ? ADVENTURE_SEED : opts.seed;
    this.tickHz = opts.tickHz ?? 20;
    const generator = makeGenerator(this.seed, this.kind);
    this.world = new HeadlessWorld(generator);
    this.realm = new Realm({ seed: this.seed, world: this.world, generator, naturalSpawning: opts.naturalSpawning ?? true, rifts: opts.rifts ?? opts.naturalSpawning ?? true, invasions: opts.invasions ?? false, clock: opts.clock, rand: opts.rand, sleeping: false, auctionStock: false });
    if (opts.now) this.realm.clock = opts.now;
    if (opts.store) this.loadWorld(opts.store);
    if (opts.store) this.realm.auctions.load(opts.store.getJson(this.auctionKey));
    if (opts.stashTabs) this.realm.stashes.tabsOf = opts.stashTabs;
    const keys = opts.keys;
    if (keys) {
      const wallet = (p: Player): string | null => this.walletOf(p);
      this.realm.keyDesk = {
        allowed: (p) => this.honestTrader(p),
        has: (p) => this.honestTrader(p) && keys.count(wallet(p)!) > 0,
        take: (p) => (this.honestTrader(p) ? keys.take(wallet(p)!) : -1),
      };
    }
    const tokens = opts.tokens;
    if (tokens) {
      this.realm.tokenDesk = {
        allowed: (p) => this.honestTrader(p),
        balance: (wallet) => tokens.balance(wallet) + this.realm.auctions.pendingTokens(wallet),
        flush: () => this.commitAuctionMoves(),
      };
    }
    this.guilds = new GuildRegistry(opts.store ?? null);
    this.land = this.makeLand(opts.land ?? new MemoryLandStore());
    this.realm.land = this.land;
    this.realm.landSave = (p) => {
      for (const m of this.members.values()) if (m.player === p) return m.key ? [`player:${m.key}`, p.savePlayer()] : null;
      return null;
    };
    this.land.load();
    if (this.generatorChanged) {
      this.land.onGeneratorChanged();
      this.generatorChanged = false;
    }
    this.world.onChange = (x, y, z, id) => {
      this.pendingBlocks.push(x, y, z, id);
      this.dirtyChunks.add(`${x >> 4},${z >> 4}`);
      // The land is told every change, with the hand that made it (a player's edit goes through the guarded world: nobody's hand is the wild).
      this.land.onBlockChange(x, y, z, id, this.land.actor, this.land.actor === null);
    };
  }

  /** The land of this room: claims, its memory of what was changed, and what it needs from the room (players, containers, guilds, Auren). */
  private makeLand(store: LandStore): LandService {
    const members = this.members;
    return new LandService({
      world: this.kind === 'adventure' ? 'adventure' : `${this.kind}:${this.seed}`,
      cfg: landConfigWith(this.opts.landConfig),
      store,
      generator: this.world.generator,
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => this.world.setBlock(x, y, z, id),
      now: this.opts.clock ?? Date.now,
      rand: this.opts.rand,
      players: () => {
        const out: { x: number; y: number; z: number }[] = [];
        for (const m of members.values()) out.push(m.player.body);
        return out;
      },
      itemsIn: (x, y, z) => this.realm.blockEntities.itemsAt(this.world.getBlock(x, y, z), x, y, z),
      emptyContainer: (x, y, z) => {
        const stacks = this.realm.takeBlock(x, y, z, this.world.getBlock(x, y, z));
        return stacks.length > 0 ? stacks : null;
      },
      guildOf: (account) => {
        const g = this.guilds.of(account);
        const mm = g?.members.find((x) => x.key === account);
        return g && mm ? { id: g.id, name: g.name, rank: mm.rank } : null;
      },
      guildName: (id) => this.guilds.get(id)?.name ?? null,
      payOut: (account, amount) => this.payOut(account, amount),
      setSign: (x, y, z, lines) => this.realm.blockEntities.setSign(x, y, z, lines),
      forgetSign: (x, y, z) => this.realm.blockEntities.forgetSign(x, y, z),
    });
  }

  /** Auren to a character who may be away: into their purse if they are here, else into their saved record. False when there is nothing to pay into. */
  private payOut(account: string, amount: number): boolean {
    for (const m of this.members.values()) {
      if (m.key !== account) continue;
      m.player.addCoins(amount);
      try {
        this.savePlayer(m);
      } catch (err) {
        console.error(`[solrift] saving player ${m.name} failed`, err);
      }
      return true;
    }
    const store = this.opts.store;
    const save = store?.getJson(`player:${account}`) as { coins?: number } | null | undefined;
    if (!store || !save || typeof save !== 'object') return false;
    store.setJson(`player:${account}`, { ...save, coins: Math.min(MAX_COINS, (typeof save.coins === 'number' ? save.coins : 0) + Math.floor(amount)) });
    return true;
  }

  get playerCount(): number {
    return this.members.size;
  }

  /** The saved record of a signed-in character (what it carries and has done), fresh if it is in the room right now. Null: it never played here. */
  characterSave(accountId: string): PlayerSave | null {
    for (const m of this.members.values()) if (m.key === accountId) return m.player.savePlayer();
    return this.opts.store ? parsePlayerSave(this.opts.store.getJson(`player:${accountId}`)) : null;
  }

  /** What a wallet's Stash holds right now (the live one when a character has it open, else the saved one), for the lobby. */
  /** The stash tabs a wallet has (0 when it cannot be told). */
  private safeTabs(wallet: string): number {
    try {
      return this.opts.stashTabs?.(wallet) ?? 0;
    } catch {
      return 0;
    }
  }

  /** A wallet's stash as the realm holds it, read in from the store first when none of its heroes has been in the world since the server started. */
  private stashFor(wallet: string): Container {
    this.realm.stashes.load(wallet, this.opts.store?.getJson(`stash:${wallet}`) ?? null);
    return this.realm.stashes.of(wallet);
  }

  /** How many slots of a wallet's stash are empty. */
  stashFree(wallet: string): number {
    const c = this.stashFor(wallet);
    let n = 0;
    for (let i = 0; i < c.size; i++) if (!c.get(i) && c.isUsable(i)) n++;
    return n;
  }

  /** How many of an item a wallet's stash holds. */
  stashCount(wallet: string, itemId: number): number {
    return this.stashFor(wallet).countOf(itemId);
  }

  /** Put one of an item in a wallet's stash, and write it down at once (it is something the wallet paid for). False when it does not fit: nothing is put in. */
  stashGive(wallet: string, itemId: number): boolean {
    const stack = makeStack(itemId, 1);
    if (!this.stashFor(wallet).canFit(stack)) return false;
    if (this.realm.stashes.put(wallet, stack, 1) < 1) return false;
    if (this.opts.store) {
      this.opts.store.setJson(`stash:${wallet}`, this.realm.stashes.toJSON(wallet));
      this.realm.stashes.dirty.delete(wallet);
    }
    return true;
  }

  /** The id of the glowing set a character of this class has on in its saved record (null: none, or not one of its class). */
  wornOutfitOf(accountId: string, cls: ClassId | null): string | null {
    const save = this.characterSave(accountId);
    if (!save) return null;
    const slot = new Container(1);
    slot.loadJSON(save.outfitSlot);
    const s = slot.get(0);
    const def = s ? outfitSetOfItem(s.id) : null;
    return def && outfitSetFits(s!.id, cls) ? def.id : null;
  }

  stashOf(wallet: string): StashView {
    if (this.realm.stashes.has(wallet)) return this.realm.stashes.view(wallet);
    return stashViewOf(this.opts.store?.getJson(`stash:${wallet}`) ?? null, this.safeTabs(wallet));
  }

  /**
   * The Auction House as the website shows it: the same list the Auctioneer's window gives (search, shelf, sort, page), without
   * having to stand at his counter. Anyone may look; an account also gets its own auctions, bids and mail (to read: everything is
   * still done at the Auctioneer, where the coins and the bags are).
   */
  market(raw: Partial<AuctionQuery>, accountId: string | null): AuctionView {
    const house = this.realm.auctions;
    house.update();
    // (an account counts only where the room keeps accounts: the same rule as for a player joining)
    const viewer = accountId && this.opts.store ? accountId : null;
    return house.view(cleanQuery(raw), viewer);
  }

  /** Is this account's character in the room right now? */
  hasAccount(accountId: string): boolean {
    for (const m of this.members.values()) if (m.key === accountId) return true;
    return false;
  }

  /** Is any character of this wallet in the room right now (its Stash is open to them, so nobody else may change it)? */
  hasWallet(wallet: string): boolean {
    for (const m of this.members.values()) if (m.wallet === wallet) return true;
    return false;
  }

  /** The names of the people in the room, for the website's chat. */
  onlineNames(): string[] {
    return [...this.members.values()].map((m) => m.name).sort((a, b) => a.localeCompare(b));
  }

  // ---- the website's Camp (see desk.ts) -------------------------------------------------------------------------------

  /** The guild of an account, for the Camp page: the roster with who is in the room now (leaders first), or null. */
  guildCard(accountId: string): GuildCard | null {
    const g = this.guilds.of(accountId);
    if (!g) return null;
    const here = new Set<string>();
    for (const m of this.members.values()) if (m.key) here.add(m.key);
    const me = g.members.find((x) => x.key === accountId);
    return {
      name: g.name,
      tag: g.tag,
      motd: g.motd,
      you: me ? me.rank : 2,
      members: [...g.members].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).map((x) => ({ name: x.name, rank: x.rank, online: here.has(x.key) })),
    };
  }

  /** The last lines of public chat, newest last, each with a number that only grows (a page asks for what came after the last it has). */
  private readonly chatLog: { n: number; at: number; from: string; text: string }[] = [];
  private chatSeq = 0;
  private readonly webChatAt = new Map<string, number>();

  private logChat(from: string, text: string): void {
    this.chatLog.push({ n: ++this.chatSeq, at: Date.now(), from, text });
    if (this.chatLog.length > 100) this.chatLog.shift();
  }

  /** Chat lines after number `since` (`from` is empty for a notice such as "Ann joined"). */
  chatSince(since: number): { n: number; at: number; from: string; text: string }[] {
    return this.chatLog.filter((l) => l.n > since).slice(-60);
  }

  /** The number of the last chat line (0: none yet). */
  get chatHead(): number {
    return this.chatSeq;
  }

  /**
   * A line of chat from the website, as if the hero had said it in the game (only the public channel: commands, whispers and guild talk
   * stay in the game). Returns why it was not sent, or null. A signed-in hero only, one line every two seconds, and a muted or banned one is not heard.
   */
  webSay(accountId: string, wallet: string, name: string, raw: string): string | null {
    const msg = parseNetClientMessage({ t: 'chat', text: raw });
    if (!msg || msg.t !== 'chat') return 'Write something first.';
    const text = msg.text;
    if (text.startsWith('/')) return 'Commands only work in the game.';
    const now = Date.now();
    if (now - (this.webChatAt.get(accountId) ?? 0) < 2000) return 'Slow down a little.';
    const bans = this.bans();
    if (bans[accountId] || bans[wallet]) return 'You cannot talk here.';
    for (const m of this.members.values()) if (m.key === accountId && this.muted(m)) return 'You are muted.';
    this.webChatAt.set(accountId, now);
    if (this.webChatAt.size > 2000) this.webChatAt.clear();
    this.broadcast({ t: 'chat', from: name, text, ch: 'say' });
    this.logChat(name, text);
    return null;
  }

  /**
   * Do something to a hero that is saved but not in the game (what the Camp page does from a phone). The saved hero is read into a Player
   * with no body in the world, `fn` asks it things (it may stand at a counter), and only what changed in the bags, the worn slots and the purse
   * is written back, together with the Stash and the Auction House when they were touched. A hero that is in the game, and its wallet's Stash
   * while another hero of the wallet is, are left alone: the game holds the live copy.
   */
  withSavedHero(hero: { id: string; wallet: string; name: string; cls: ClassId | null }, fn: (p: Player) => DeskResult): DeskResult {
    const store = this.opts.store;
    if (!store) return { ok: false, error: 'This server does not keep heroes.' };
    if (this.hasAccount(hero.id) || this.hasWallet(hero.wallet)) return { ok: false, error: 'A hero of yours is in the game right now. Leave the game first.' };
    const save = parsePlayerSave(store.getJson(`player:${hero.id}`));
    if (!save) return { ok: false, error: 'Play this hero once in the game first.' };
    if (save.mode === 'creative') return { ok: false, error: 'Heroes in creative mode cannot check in or farm from here.' };
    const p = new Player(this.realm, { mode: 'survival', name: hero.name, classId: hero.cls, account: hero.id, wallet: hero.wallet });
    try {
      this.realm.stashes.load(hero.wallet, store.getJson(`stash:${hero.wallet}`));
      p.loadPlayer(save);
      p.finishLoading();
      p.drainEvents();
      const res = fn(p);
      if (!res.ok) return res;
      const out = p.savePlayer();
      const next: PlayerSave = { ...save, inv: out.inv, armor: out.armor, offhand: out.offhand, mountSlot: out.mountSlot, outfitSlot: out.outfitSlot, companionSlot: out.companionSlot, wingSlot: out.wingSlot, accessories: out.accessories };
      if (out.bags) next.bags = out.bags;
      else delete next.bags;
      if (out.coins) next.coins = out.coins;
      else delete next.coins;
      store.setJson(`player:${hero.id}`, next);
      if (this.realm.stashes.dirty.has(hero.wallet)) {
        store.setJson(`stash:${hero.wallet}`, this.realm.stashes.toJSON(hero.wallet));
        this.realm.stashes.dirty.delete(hero.wallet);
      }
      if (p.auctionTouched) {
        this.commitAuctionMoves();
        this.saveAuctions();
      }
      return res;
    } finally {
      p.leave();
    }
  }

  /** How many players the room takes (`MAX_PLAYERS`). */
  get capacity(): number {
    return this.opts.maxPlayers ?? DEFAULT_MAX_PLAYERS;
  }

  start(): void {
    if (this.timer) return;
    // Timers are coarse (about 15 ms on Windows), so a plain setInterval would run slow and the game with it.
    // Wake up often, and run as many ticks as real time has earned (never more than a short catch-up).
    const period = 1000 / this.tickHz;
    let next = performance.now() + period;
    this.timer = setInterval(() => {
      const now = performance.now();
      let ran = 0;
      while (now >= next && ran < 4) {
        this.tick();
        next += period;
        ran++;
      }
      if (now >= next) next = now + period; // too far behind: drop the backlog instead of spiralling
    }, Math.max(1, Math.floor(period / 4)));
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.save();
  }

  // ---- persistence ---------------------------------------------------------------

  /** What the world is stored under: the Adventure world and the World Beyond are kept apart from an overworld that happens to share their seed. */
  private get storeSeed(): number {
    return this.kind === 'adventure' ? -this.seed : this.kind === 'beyond' ? -2_000_000_000 - this.seed : this.seed;
  }

  /** Where the Auction House is kept (one per world, like the world itself). */
  private get auctionKey(): string {
    return `auction:${this.storeSeed}`;
  }

  /** The wallet a player signed in with (null for a guest). */
  private walletOf(player: object): string | null {
    for (const m of this.members.values()) if (m.player === player) return m.wallet;
    return null;
  }

  /** May this player trade in $SOLRIFT: a signed-in wallet in honest play (never creative, admin mode, or a cheats server). */
  private honestTrader(player: object): boolean {
    for (const m of this.members.values()) {
      if (m.player === player) return !!m.wallet && !m.adminOn && !this.opts.cheats && m.player.mode !== 'creative';
    }
    return false;
  }

  /**
   * Hand the house's waiting $SOLRIFT moves to the ledger, and write the house with them in the same transaction. The moves stay in the
   * house (and in what is saved) until the ledger has them, so a failure here, or a crash, is made good by sending them again.
   */
  private commitAuctionMoves(): void {
    const tokens = this.opts.tokens;
    const house = this.realm.auctions;
    if (!tokens || house.moves.length === 0) return;
    const batch = [...house.moves];
    try {
      tokens.commit(this.auctionKey, batch, () => {
        const store = this.opts.store;
        if (store) store.setJson(this.auctionKey, house.toJSON());
      });
      house.ackMoves(batch);
    } catch (err) {
      console.error('[solrift] writing the auction house token moves failed (they will be retried)', err);
    }
  }

  /** Write the Auction House down now (what a player did there is money and items: it is not left for the next autosave). */
  private saveAuctions(): void {
    const store = this.opts.store;
    if (!store) return;
    try {
      store.setJson(this.auctionKey, this.realm.auctions.toJSON());
      this.realm.auctions.dirty = false;
    } catch (err) {
      console.error('[solrift] saving the auction house failed', err);
    }
  }

  private loadWorld(store: RoomStore): void {
    // The land is made by the generator: when it changes, the saved chunks (edits made on the old land) no longer fit it,
    // and would show as seams and floating builds. They are dropped, once, before anything else is read.
    const terrainKey = `terrain:${this.storeSeed}`;
    if (store.getJson(terrainKey) !== GENERATOR_VERSION) {
      this.generatorChanged = store.getJson(terrainKey) !== null;
      store.clearChunks(this.storeSeed);
      store.setJson(terrainKey, GENERATOR_VERSION);
    }
    const chunks = store.loadChunks(this.storeSeed);
    // The made places were rebuilt since this world was saved: mend them in the saved chunks (and save the mended chunks).
    const layoutKey = `layout:${this.storeSeed}`;
    if (this.kind === 'adventure' && store.getJson(layoutKey) !== ADVENTURE_LAYOUT) {
      const mended = chunks.filter((c) => c.data.length === CHUNK_VOLUME && this.world.generator.mendProtected(c.cx, c.cz, c.data));
      // Save them now, before the version is written: a server that is stopped (or restarted by its watcher) before its
      // first autosave would otherwise remember the new version but keep the old chunks.
      if (mended.length > 0) store.saveChunks(this.storeSeed, mended);
      store.setJson(layoutKey, ADVENTURE_LAYOUT);
    }
    this.world.loadEdited(chunks);
    const state = parseWorldState(store.getJson(`world:${this.storeSeed}`));
    if (state) this.realm.loadState(state);
  }

  /** Write the changed chunks, the clock and weather, and every signed-in player. */
  save(): void {
    const store = this.opts.store;
    if (!store) return;
    // Each part on its own: one failing write must not stop the others from being saved.
    const attempt = (what: string, fn: () => void): void => {
      try {
        fn();
      } catch (err) {
        console.error(`[solrift] saving ${what} failed`, err);
      }
    };
    // The land's record goes first: a restart that finds a change in the world and none in the ledger would keep it for ever; the other way round it is looked at again.
    attempt('land', () => this.land.flush());
    attempt('chunks', () => {
      if (this.dirtyChunks.size === 0) return;
      const dirty = this.world.editedChunks().filter((c) => this.dirtyChunks.has(`${c.cx},${c.cz}`));
      store.saveChunks(this.storeSeed, dirty);
      this.dirtyChunks.clear();
    });
    attempt('world state', () => store.setJson(`world:${this.storeSeed}`, this.realm.saveState()));
    attempt('auction house', () => {
      if (this.realm.auctions.dirty) this.saveAuctions();
    });
    attempt('stashes', () => {
      for (const owner of [...this.realm.stashes.dirty]) {
        store.setJson(`stash:${owner}`, this.realm.stashes.toJSON(owner));
        this.realm.stashes.dirty.delete(owner);
      }
    });
    for (const m of this.members.values()) attempt(`player ${m.name}`, () => this.savePlayer(m));
  }

  private savePlayer(m: Member): void {
    if (m.key && this.opts.store) this.opts.store.setJson(`player:${m.key}`, m.player.savePlayer());
  }

  // ---- joining and leaving ---------------------------------------------------

  /** Add a player. Returns null (after telling the connection why) when the room is full. */
  join(conn: RoomConnection, wantedName: string, accountId: string | null = null, wantedLook: number | null = null, classId: ClassId | null = null, wallet: string | null = null): number | null {
    const key = accountId && this.opts.store ? accountId : null;
    const admin = isAdminIdentity(this.opts.admins, accountId, wallet);
    // A banned wallet or character does not get in (an admin cannot be banned: the list is the owner's word).
    if (!admin && this.opts.store && (accountId || wallet)) {
      const bans = this.bans();
      const ban = (wallet ? bans[wallet] : undefined) ?? (accountId ? bans[accountId] : undefined);
      if (ban) {
        conn.send({ t: 'kicked', reason: ban.reason ? `banned: ${ban.reason}` : 'banned' });
        return null;
      }
    }
    // The Stash belongs to the wallet, so every character of it opens the same one (and nobody else's: a guest has none).
    const stashOwner = key ? wallet : null;
    // One body per account, or the same items could be carried by two players. Signing in again (a reload before the old connection has been
    // noticed to be gone, a second tab) takes the account over: the earlier session is saved and put out first, so the items exist once.
    const earlier = key ? [...this.members.values()].find((o) => o.key === key) : undefined;
    if (earlier) {
      earlier.conn.send({ t: 'kicked', reason: 'signed in from another place' });
      this.leave(earlier.id);
      earlier.conn.close('signed in from another place');
    }
    if (this.members.size >= this.capacity) {
      conn.send({ t: 'kicked', reason: 'server full' });
      return null;
    }
    const name = this.uniqueName(wantedName);
    // (a guest has no account: it can look at the Auction House, not use it)
    const player = new Player(this.realm, { mode: this.opts.mode ?? 'survival', name, classId, account: key, wallet: stashOwner });
    if (stashOwner) this.realm.stashes.load(stashOwner, this.opts.store!.getJson(`stash:${stashOwner}`));
    const saved = key ? parsePlayerSave(this.opts.store!.getJson(`player:${key}`)) : null;
    if (saved) player.loadPlayer(saved);
    // Creative mode is a cheat: a character saved in it (an admin who logged out with admin mode on) comes back in the server's own mode.
    const startMode = this.opts.mode ?? 'survival';
    if (!this.opts.cheats && player.mode !== startMode) player.setMode(startMode);
    player.finishLoading();
    const id = this.nextId++;
    // A look nobody chose (an old client, a bot) is made from the name, so players still tell apart.
    // (The server alone passes an outfit: a guest's look came through `parseNetClientMessage`, which takes a plain look only.)
    const look = parseWornCode(wantedLook) !== null ? (wantedLook as number) : lookCode(lookFromName(name));
    const m: Member = { id, name, look, key, admin, wallet, fightTick: -Infinity, adminOn: false, mutedUntil: 0, player, conn, queue: [], budget: 0, ack: 0, lastSeq: 0, invDirty: true, chatTokens: 5, socialTokens: SOCIAL_BURST, book: key && this.opts.store ? parseSocialBook(this.opts.store.getJson(`social:${key}`)) : new SocialBook(), replyTo: null, guildInvite: null, trade: null, tradeAsk: null, tradeTokens: TRADE_BURST, cmdTokens: CMD_BURST, score: 0, warned: false, messages: 0, fxSent: new Map(), signRev: -1, signCell: '', signCount: 0 };
    this.members.set(id, m);

    conn.send({ t: 'joined', id, name, look: lookOf(m), seed: this.seed, kind: this.kind, tickHz: this.tickHz, time: this.realm.time });
    const edits = this.world.diffAgainstTerrain();
    if (edits.length === 0) conn.send({ t: 'edits', blocks: [], last: true });
    for (let i = 0; i < edits.length; i += EDITS_PER_MESSAGE) {
      conn.send({ t: 'edits', blocks: edits.slice(i, i + EDITS_PER_MESSAGE), last: i + EDITS_PER_MESSAGE >= edits.length });
    }
    this.broadcast({ t: 'notice', text: `${name} joined` }, id);
    this.logChat('', `${name} joined`);
    this.presence(m, true);
    player.drainEvents();
    player.syncQuests(); // the log was among the events just thrown away
    this.sendState(m);
    return id;
  }

  leave(id: number): void {
    const m = this.members.get(id);
    if (!m) return;
    // Items on the cursor or in a crafting grid go back to the player, so a disconnect loses nothing.
    m.player.closeMenu();
    m.player.leave();
    try {
      this.savePlayer(m);
    } catch (err) {
      console.error(`[solrift] saving player ${m.name} failed`, err);
    }
    this.members.delete(id);
    if (m.trade) this.endTrade(m, `${m.name} left: the trade was called off.`);
    this.broadcast({ t: 'notice', text: `${m.name} left` });
    this.logChat('', `${m.name} left`);
    this.presence(m, false);
  }

  /** Tell the friends of somebody who came or went (the ones who have them on their list, found by account). */
  private presence(m: Member, online: boolean): void {
    if (!m.key) return;
    const g = this.guilds.of(m.key);
    if (g) {
      const me = memberOf(g, m.key);
      if (me && me.name !== m.name) {
        me.name = m.name; // they play under another name now
        this.guilds.save(g);
      }
      for (const o of this.guildOnline(g)) if (o !== m) this.tell(o, `${m.name} has ${online ? 'come online' : 'gone offline'}.`);
      if (online && g.motd) this.tell(m, `Guild <${g.tag}>: ${g.motd}`);
    }
    for (const o of this.members.values()) {
      if (o === m || !o.book.isFriend(entryOf(m))) continue;
      o.book.add('friends', entryOf(m)); // keeps the name they play under now
      this.tell(o, online ? `${m.name} is online.` : `${m.name} went offline.`);
    }
  }

  private uniqueName(wanted: string): string {
    const taken = new Set([...this.members.values()].map((m) => m.name.toLowerCase()));
    if (!taken.has(wanted.toLowerCase())) return wanted;
    for (let n = 2; ; n++) {
      const candidate = `${wanted}${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  private broadcast(msg: NetServerMessage, except?: number): void {
    for (const m of this.members.values()) if (m.id !== except) m.conn.send(msg);
  }

  // ---- messages from clients -----------------------------------------------------

  /** Handle an already validated message from a joined player. */
  receive(id: number, msg: NetClientMessage): void {
    const m = this.members.get(id);
    if (!m) return;
    switch (msg.t) {
      case 'input':
        for (const f of msg.frames) {
          if (f.seq <= m.lastSeq) {
            // TCP delivers in order, so an old sequence number is a replay or a broken client.
            this.strike(m, STRIKES.staleInput, 'stale input');
            continue;
          }
          m.lastSeq = f.seq;
          if (m.queue.length < MAX_QUEUE) m.queue.push({ k: 'input', f });
          else this.strike(m, STRIKES.droppedInput, 'input flood');
          if (!this.members.has(id)) return; // kicked
        }
        return;
      case 'cmd':
        // Switching to creative is a cheat; only the server's rules may allow it.
        if (msg.c.t === 'mode' && !this.cheatsFor(m)) {
          this.tell(m, 'Cheats are off on this server');
          this.strike(m, STRIKES.forbidden, 'creative switch without cheats');
          return;
        }
        if (m.cmdTokens < 1 || m.queue.length >= MAX_QUEUE) {
          this.strike(m, STRIKES.commandFlood, 'command flood');
          return;
        }
        m.cmdTokens -= 1;
        m.queue.push({ k: 'cmd', c: msg.c });
        return;
      case 'chat':
        this.chat(m, msg.text);
        return;
      case 'social':
        if (this.socialLimit(m)) m.conn.send({ t: 'social', view: this.viewFor(m) });
        return;
      case 'socialAct':
        if (this.socialLimit(m)) this.socialAct(m, msg.a, msg.name);
        return;
      case 'guild':
        if (this.socialLimit(m)) this.guildCommand(m, msg.line.split(/\s+/));
        return;
      case 'trade':
        this.tradeAct(m, msg.act);
        return;
      case 'inspect':
        if (this.socialLimit(m)) {
          const target = findMember(this.members.values(), msg.name);
          m.conn.send({ t: 'inspected', name: target?.name ?? msg.name, view: target ? inspectView(target, itemView) : null });
        }
        return;
      case 'leave':
        this.leave(id);
        return;
      default:
    }
  }

  private chat(m: Member, text: string): void {
    if (m.chatTokens < 1) {
      this.strike(m, STRIKES.chatSpam, 'chat spam');
      return; // slow down
    }
    m.chatTokens -= 1;
    if (text.startsWith('/')) {
      this.command(m, text.slice(1));
      return;
    }
    if (this.muted(m)) return this.tell(m, 'You are muted.');
    this.say(m, { t: 'chat', from: m.name, text, ch: 'say' });
    this.logChat(m.name, text);
  }

  /** Send a line of chat to everyone except the people who ignore its sender. */
  private say(from: Member, msg: NetServerMessage, to: Iterable<Member> = this.members.values()): void {
    for (const o of to) if (o === from || !o.book.isIgnored(entryOf(from))) o.conn.send(msg);
  }

  /** The social window and the look at another player cost a token each, so neither can be polled in a flood. */
  private socialLimit(m: Member): boolean {
    if (m.socialTokens < 1) {
      this.strike(m, STRIKES.socialSpam, 'social spam');
      return false;
    }
    m.socialTokens -= 1;
    return true;
  }

  /** The social window of this player: friends, who is here, their guild and the guild that is asking them. */
  private viewFor(m: Member) {
    const g = this.guilds.of(m.key);
    const inv = m.guildInvite && this.tickCount < m.guildInvite.until ? this.guilds.get(m.guildInvite.guildId) : null;
    return socialView([...this.members.values()], m, g, inv && m.guildInvite ? { guild: inv.name, from: m.guildInvite.from } : null);
  }

  private tell(m: Member, text: string): void {
    m.conn.send({ t: 'notice', text });
  }

  private saveBook(m: Member): void {
    if (m.key && this.opts.store) this.opts.store.setJson(`social:${m.key}`, m.book.toJSON());
  }

  /** `/w name text` and the Whisper button: only the two of them see it. Returns what to tell the sender when it cannot go. */
  private whisper(m: Member, target: Member, text: string): void {
    if (target === m) return this.tell(m, 'You cannot whisper to yourself.');
    if (!text) return this.tell(m, `Usage: /w ${target.name} <message>`);
    m.conn.send({ t: 'chat', from: m.name, to: target.name, text, ch: 'whisper' });
    m.replyTo = target.id;
    // Somebody who ignores the sender hears nothing, and the sender is not told (so it cannot be used to check).
    if (target.book.isIgnored(entryOf(m))) return;
    target.conn.send({ t: 'chat', from: m.name, text, ch: 'whisper' });
    target.replyTo = m.id;
  }

  /** The members of a guild who are in the room. */
  private guildOnline(g: GuildData): Member[] {
    return [...this.members.values()].filter((o) => o.key !== null && g.members.some((x) => x.key === o.key));
  }

  /** /guild create|invite|accept|decline|leave|kick|promote|demote|leader|disband|motd|info, for the command and the window alike. */
  private guildCommand(m: Member, args: string[]): void {
    const sub = (args[0] ?? 'info').toLowerCase();
    const words = args.slice(1);
    const rest = words.join(' ').trim();
    const g = this.guilds.of(m.key);
    const say = (text: string) => this.tell(m, text);
    const push = (list: Member[]) => {
      for (const o of list) o.conn.send({ t: 'social', view: this.viewFor(o) });
    };
    /** Tell the whole guild (and refresh their windows), whatever just changed. */
    const announce = (guild: GuildData, text: string, extra: Member[] = []) => {
      const all = [...new Set([...this.guildOnline(guild), ...extra])];
      for (const o of all) this.tell(o, text);
      push(all);
    };
    if (!m.key) return say('Guilds are for players with an account.');

    switch (sub) {
      case 'create': {
        if (g) return say(`You are already in ${g.name}. Leave it first.`);
        // "/guild create Name Of The Guild TAG": the last word is the tag.
        const tag = cleanGuildTag(words.pop() ?? '');
        const name = cleanGuildName(words.join(' '));
        const bad = guildNameError(name, tag);
        if (bad) return say(`${bad} Usage: /guild create <name> <TAG>`);
        const taken = this.guilds.taken(name, tag);
        if (taken) return say(`A guild with that ${taken} already exists.`);
        if (!m.player.spendCoins(GUILD_COST)) return say(`Founding a guild costs ${GUILD_COST} coins.`);
        const made = this.guilds.create(name, tag, { key: m.key, name: m.name });
        m.guildInvite = null;
        announce(made, `You founded ${made.name} <${made.tag}>.`);
        return;
      }
      case 'invite': {
        if (!g) return say('You are not in a guild.');
        const bad = inviteError(g, m.key);
        if (bad) return say(bad);
        const target = findMember(this.members.values(), rest);
        if (!target) return say(rest ? `${rest} is not online.` : 'Usage: /guild invite <player>');
        if (!target.key) return say(`${target.name} is a guest: guilds are for players with an account.`);
        if (this.guilds.of(target.key)) return say(`${target.name} is already in a guild.`);
        if (target.book.isIgnored(entryOf(m))) return say(`Invited ${target.name}.`); // they are not told
        target.guildInvite = { guildId: g.id, from: m.name, until: this.tickCount + GUILD_INVITE_SECONDS * this.tickHz };
        this.tell(target, `${m.name} invites you to join ${g.name} <${g.tag}>. /guild accept or /guild decline.`);
        push([target]);
        return say(`Invited ${target.name}.`);
      }
      case 'accept':
      case 'decline': {
        const inv = m.guildInvite;
        m.guildInvite = null;
        const target = inv && this.tickCount < inv.until ? this.guilds.get(inv.guildId) : null;
        if (!target) {
          push([m]);
          return say('You have no guild invitation.');
        }
        if (sub === 'decline') {
          push([m]);
          return say(`You turned down ${target.name}.`);
        }
        if (g) return say(`You are already in ${g.name}.`);
        if (target.members.length >= MAX_GUILD_MEMBERS) return say(`${target.name} is full.`);
        this.guilds.join(target, { key: m.key, name: m.name });
        return announce(target, `${m.name} joined the guild.`);
      }
      case 'leave': {
        if (!g) return say('You are not in a guild.');
        const bad = leaveError(g, m.key);
        if (bad) return say(bad);
        const alone = g.members.length === 1;
        this.guilds.remove(g, m.key);
        say(alone ? `You left ${g.name}, and it is gone.` : `You left ${g.name}.`);
        if (!alone) announce(g, `${m.name} left the guild.`);
        push([m]);
        return;
      }
      case 'kick': {
        if (!g) return say('You are not in a guild.');
        const t = findGuildMember(g, rest);
        if (!t) return say(rest ? `${rest} is not in the guild.` : 'Usage: /guild kick <name>');
        const bad = kickError(g, m.key, t.key);
        if (bad) return say(bad);
        const gone = [...this.members.values()].find((o) => o.key === t.key);
        this.guilds.remove(g, t.key);
        announce(g, `${t.name} was removed from the guild.`);
        if (gone) {
          this.tell(gone, `You were removed from ${g.name}.`);
          push([gone]);
        }
        return;
      }
      case 'promote':
      case 'demote': {
        if (!g) return say('You are not in a guild.');
        const t = findGuildMember(g, rest);
        if (!t) return say(rest ? `${rest} is not in the guild.` : `Usage: /guild ${sub} <name>`);
        const up = sub === 'promote';
        const bad = rankError(g, m.key, t.key, up);
        if (bad) return say(bad);
        doRank(g, t.key, up);
        this.guilds.save(g);
        return announce(g, `${t.name} is ${up ? 'promoted to officer' : 'a member again'}.`);
      }
      case 'leader': {
        if (!g) return say('You are not in a guild.');
        const t = findGuildMember(g, rest);
        if (!t) return say(rest ? `${rest} is not in the guild.` : 'Usage: /guild leader <name>');
        const bad = leaderError(g, m.key, t.key);
        if (bad) return say(bad);
        doLeader(g, m.key, t.key);
        this.guilds.save(g);
        return announce(g, `${t.name} now leads ${g.name}.`);
      }
      case 'disband': {
        if (!g) return say('You are not in a guild.');
        const bad = disbandError(g, m.key);
        if (bad) return say(bad);
        const everyone = this.guildOnline(g);
        this.guilds.disband(g);
        for (const o of everyone) this.tell(o, `${g.name} was disbanded.`);
        return push(everyone);
      }
      case 'motd': {
        if (!g) return say('You are not in a guild.');
        const bad = motdError(g, m.key);
        if (bad) return say(bad);
        g.motd = cleanMotd(rest);
        this.guilds.save(g);
        return announce(g, g.motd ? `Guild message: ${g.motd}` : 'The guild message was cleared.');
      }
      case 'info':
      case 'roster': {
        if (!g) return say('You are not in a guild. /guild create <name> <TAG> founds one for ' + GUILD_COST + ' coins.');
        const on = this.guildOnline(g).length;
        say(`${g.name} <${g.tag}>: ${g.members.length} members, ${on} online.${g.motd ? ` ${g.motd}` : ''}`);
        return push([m]);
      }
      default:
        return say('Guild commands: create, invite, accept, decline, leave, kick, promote, demote, leader, disband, motd, info.');
    }
  }

  // ---- trading between players -------------------------------------------------

  private sideView(side: TradeSide): TradeSideView {
    return { offers: side.offers.map((o) => ({ slot: o.slot, item: itemView(o.stack)! })), coins: side.coins, ready: side.ready };
  }

  /** The table as this player sees it: theirs and the other's. */
  private tradeViewOf(m: Member): TradeView | null {
    if (!m.trade) return null;
    const { trade, peer } = m.trade;
    const mine = trade.sideOf(m.player);
    const theirs = trade.sideOf(peer.player);
    if (!mine || !theirs) return null;
    const c = peer.player.cls;
    return { with: peer.name, ...(c ? { cls: c.classId, level: c.level } : {}), mine: this.sideView(mine), theirs: this.sideView(theirs) };
  }

  private pushTrade(...list: Member[]): void {
    for (const o of list) if (this.members.has(o.id)) o.conn.send({ t: 'trade', view: this.tradeViewOf(o) });
  }

  private startTrade(a: Member, b: Member): void {
    for (const o of [a, b]) {
      o.tradeAsk = null;
      o.conn.send({ t: 'tradeAsk', from: null });
    }
    const trade = new Trade(a.player, b.player);
    a.trade = { trade, peer: b };
    b.trade = { trade, peer: a };
    this.tell(a, `You are trading with ${b.name}.`);
    this.tell(b, `You are trading with ${a.name}.`);
    this.pushTrade(a, b);
  }

  /** Close the table for both (`text` tells them why). Safe on somebody who has just left. */
  private endTrade(m: Member, text: string | null): void {
    const t = m.trade;
    if (!t) return;
    const both = [m, t.peer];
    for (const o of both) o.trade = null;
    for (const o of both) {
      if (!this.members.has(o.id)) continue;
      if (text) this.tell(o, text);
      o.conn.send({ t: 'trade', view: null });
    }
  }

  /** Every tick: calls off the trades whose players drifted apart or died, takes lapsed offers off the table, ends old requests. */
  private watchTrades(all: Member[]): void {
    for (const m of all) {
      if (m.tradeAsk && this.tickCount >= m.tradeAsk.until) {
        m.tradeAsk = null;
        m.conn.send({ t: 'tradeAsk', from: null });
      }
      if (!m.trade || m.id > m.trade.peer.id) continue; // each trade once
      const why = m.trade.trade.broken();
      if (why) this.endTrade(m, why);
      else if (m.trade.trade.validate()) this.pushTrade(m, m.trade.peer);
    }
  }

  /** Asking, answering, filling the table, accepting and calling off: what the trade window and /trade do. */
  private tradeAct(m: Member, act: TradeAct): void {
    if (m.tradeTokens < 1) {
      this.strike(m, STRIKES.socialSpam, 'trade spam');
      return;
    }
    m.tradeTokens -= 1;
    const p = m.player;
    switch (act.a) {
      case 'ask': {
        if (m.trade) return this.tell(m, 'You are already trading. Finish or cancel that trade first.');
        const target = findMember(this.members.values(), act.name);
        if (!target) return this.tell(m, `${act.name} is not online.`);
        if (target === m) return this.tell(m, 'You cannot trade with yourself.');
        if (target.trade) return this.tell(m, `${target.name} is busy trading.`);
        const blocked = tradeBlocker(p, target.player);
        if (blocked) return this.tell(m, blocked);
        if (target.book.isIgnored(entryOf(m))) return this.tell(m, `Asked ${target.name} to trade.`); // they are not told
        // They had asked already: that is the answer.
        if (m.tradeAsk && m.tradeAsk.from === target.id && this.tickCount < m.tradeAsk.until) return this.startTrade(target, m);
        target.tradeAsk = { from: m.id, until: this.tickCount + TRADE_ASK_SECONDS * this.tickHz };
        target.conn.send({ t: 'tradeAsk', from: m.name });
        this.tell(target, `${m.name} wants to trade with you. /trade accept or /trade decline.`);
        return this.tell(m, `Asked ${target.name} to trade.`);
      }
      case 'accept':
      case 'decline': {
        const ask = m.tradeAsk;
        m.tradeAsk = null;
        m.conn.send({ t: 'tradeAsk', from: null });
        const from = ask && this.tickCount < ask.until ? this.members.get(ask.from) : undefined;
        if (!from) return this.tell(m, 'Nobody is asking you to trade.');
        if (act.a === 'decline') return this.tell(from, `${m.name} turned down the trade.`);
        if (m.trade || from.trade) return this.tell(m, from.trade ? `${from.name} is busy trading.` : 'You are already trading.');
        const blocked = tradeBlocker(p, from.player);
        if (blocked) return this.tell(m, blocked);
        return this.startTrade(from, m);
      }
      default:
    }
    const t = m.trade;
    if (!t) return this.tell(m, 'You are not trading.');
    const { trade, peer } = t;
    switch (act.a) {
      case 'cancel':
        return this.endTrade(m, `${m.name} called off the trade.`);
      case 'put': {
        const bad = trade.put(p, act.slot, act.count);
        if (bad) this.tell(m, bad);
        break;
      }
      case 'take':
        trade.take(p, act.i);
        break;
      case 'coins':
        trade.setCoins(p, act.n);
        break;
      case 'ready': {
        const r = trade.setReady(p, act.on);
        if (r.done) {
          this.endTrade(m, 'The trade is complete.');
          for (const o of [m, peer]) {
            try {
              this.savePlayer(o);
            } catch (err) {
              console.error(`[solrift] saving player ${o.name} failed`, err);
            }
          }
          return;
        }
        if (r.error) {
          this.tell(m, r.error);
          this.tell(peer, r.error);
        }
        break;
      }
      default:
    }
    this.pushTrade(m, peer);
  }

  /** Friends and the ignore list, for the commands and the window alike. Says what happened. */
  private socialAct(m: Member, a: SocialAction, name: string): void {
    const target = findMember(this.members.values(), name);
    const listed = (list: 'friends' | 'ignored') => m.book[list].find((e) => e.name.toLowerCase() === name.toLowerCase()) ?? null;
    const done = (text: string) => {
      this.tell(m, text);
      this.saveBook(m);
      m.conn.send({ t: 'social', view: this.viewFor(m) });
    };
    if (a === 'friend' || a === 'ignore') {
      const list = a === 'friend' ? 'friends' : 'ignored';
      if (!target) return this.tell(m, `${name} is not online.`);
      if (target === m) return this.tell(m, a === 'friend' ? 'You cannot be your own friend.' : 'You cannot ignore yourself.');
      if (a === 'friend' && !target.key) return this.tell(m, `${target.name} is a guest: only players with an account can be friends.`);
      const r = m.book.add(list, entryOf(target));
      if (r === 'full') return this.tell(m, a === 'friend' ? 'Your friends list is full.' : 'Your ignore list is full.');
      if (r === 'exists') return this.tell(m, `${target.name} is already ${a === 'friend' ? 'your friend' : 'ignored'}.`);
      return done(a === 'friend' ? `${target.name} is now your friend.` : `You ignore ${target.name}.`);
    }
    const list = a === 'unfriend' ? 'friends' : 'ignored';
    const entry = listed(list);
    if (!entry) return this.tell(m, `${name} is not on your ${list === 'friends' ? 'friends' : 'ignore'} list.`);
    m.book.remove(list, entry);
    done(a === 'unfriend' ? `${entry.name} is no longer your friend.` : `You hear ${entry.name} again.`);
  }

  private command(m: Member, line: string): void {
    const [name, ...args] = line.trim().split(/\s+/);
    const p = m.player;
    const cmd = (name ?? '').toLowerCase();
    if (cmd === 'admin' || ADMIN_COMMANDS.has(cmd)) return this.adminCommand(m, cmd, args);
    if (CHAT_COMMANDS.has(cmd) && this.muted(m)) return this.tell(m, 'You are muted.');
    switch (cmd) {
      case 'help':
        this.tell(m, `Commands: /help /who /home /w /r /me /friend /ignore /inspect /trade /guild /g /party /p${this.cheatsFor(m) ? ' /time /weather /gamemode /tp /xp /coins /rift /invasion' : ''}${m.adminOn ? ' (admin: /admin help)' : m.admin ? ' /admin' : ''}`);
        return;
      case 'who':
        this.tell(m, `Online (${this.members.size}): ${[...this.members.values()].map((x) => x.name).join(', ')}`);
        return;
      case 'home':
        p.respawn();
        return;
      case 'party':
        this.tell(m, this.partyCommand(p, args));
        return;
      case 'p': {
        // Party chat: only the people in your party hear it.
        const text = args.join(' ').trim();
        if (!text) return this.tell(m, 'Usage: /p <message>');
        const party = this.realm.parties.membersOf(p);
        if (party.length < 2) return this.tell(m, 'You are not in a party.');
        this.say(m, { t: 'chat', from: `${m.name} (party)`, text, ch: 'party' }, [...this.members.values()].filter((x) => party.includes(x.player)));
        return;
      }
      case 'w':
      case 'whisper':
      case 'tell': {
        const rest = args.join(' ');
        const hit = splitTarget(this.members.values(), rest);
        if (!hit) return this.tell(m, rest ? `No player called "${args[0]}" is online.` : 'Usage: /w <player> <message>');
        return this.whisper(m, hit.target, hit.text);
      }
      case 'r':
      case 'reply': {
        const to = m.replyTo === null ? null : this.members.get(m.replyTo);
        if (!to) return this.tell(m, m.replyTo === null ? 'Nobody has whispered you yet.' : 'That player is no longer online.');
        return this.whisper(m, to, args.join(' ').trim());
      }
      case 'guild':
        return this.guildCommand(m, args);
      case 'g': {
        const g = this.guilds.of(m.key);
        const text = args.join(' ').trim();
        if (!g) return this.tell(m, m.key ? 'You are not in a guild.' : 'Guilds are for players with an account.');
        if (!text) return this.tell(m, 'Usage: /g <message>');
        return this.say(m, { t: 'chat', from: m.name, text, ch: 'guild' }, this.guildOnline(g));
      }
      case 'me':
      case 'emote': {
        const text = args.join(' ').trim();
        if (!text) return this.tell(m, 'Usage: /me <what you do>');
        return this.say(m, { t: 'chat', from: m.name, text, ch: 'emote' });
      }
      case 'friend':
      case 'friends':
      case 'f': {
        const sub = (args[0] ?? 'list').toLowerCase();
        const who = args.slice(1).join(' ');
        if (sub === 'add' || sub === 'remove') return who ? this.socialAct(m, sub === 'add' ? 'friend' : 'unfriend', who) : this.tell(m, `Usage: /friend ${sub} <player>`);
        const v = this.viewFor(m);
        return this.tell(m, v.friends.length === 0 ? 'You have no friends yet. /friend add <player>' : `Friends: ${v.friends.map((f) => (f.online ? f.name : `${f.name} (offline)`)).join(', ')}`);
      }
      case 'ignore':
      case 'unignore': {
        const undo = (name ?? '').toLowerCase() === 'unignore';
        const who = args.join(' ');
        if (!undo && !who) return this.tell(m, m.book.ignored.length === 0 ? 'You ignore nobody. /ignore <player>' : `Ignored: ${m.book.ignored.map((e) => e.name).join(', ')}`);
        return who ? this.socialAct(m, undo ? 'unignore' : 'ignore', who) : this.tell(m, 'Usage: /unignore <player>');
      }
      case 'trade': {
        const sub = (args[0] ?? '').toLowerCase();
        if (sub === 'accept' || sub === 'decline' || sub === 'cancel') return this.tradeAct(m, { a: sub });
        const who = args.join(' ');
        return who ? this.tradeAct(m, { a: 'ask', name: who }) : this.tell(m, 'Usage: /trade <player>');
      }
      case 'inspect': {
        const who = args.join(' ');
        const target = findMember(this.members.values(), who);
        if (!target) return this.tell(m, who ? `${who} is not online.` : 'Usage: /inspect <player>');
        m.conn.send({ t: 'inspected', name: target.name, view: inspectView(target, itemView) });
        return;
      }
      case 'time':
      case 'weather':
      case 'gamemode':
      case 'tp':
      case 'xp':
      case 'coins':
      case 'rift':
      case 'invasion':
        if (!this.cheatsFor(m)) {
          this.tell(m, 'Cheats are off on this server');
          this.strike(m, STRIKES.forbidden, 'cheat command without cheats');
          return;
        }
        if (m.adminOn) this.audit(m, cmd, args.join(' '));
        this.cheat(m, name.toLowerCase(), args);
        return;
      default:
        this.tell(m, `Unknown command: /${name ?? ''}`);
    }
  }

  // ---- admin mode ----------------------------------------------------------------

  /** Cheats are allowed on the whole server (CHEATS=1) or for an admin who has switched admin mode on. */
  private cheatsFor(m: Member): boolean {
    return !!this.opts.cheats || m.adminOn;
  }

  private muted(m: Member): boolean {
    return this.tickCount < m.mutedUntil;
  }

  private bans(): Bans {
    return parseBans(this.opts.store?.getJson(BANS_KEY));
  }

  private audit(m: Member, action: string, detail = ''): void {
    this.opts.onAdmin?.({ name: m.name, account: m.key, action, detail });
  }

  /**
   * `/admin on|off|status|help` and the admin's tools. Every check is made here on the server from `m.admin`, which was decided at join from the
   * signed-in wallet: a client cannot say it is an admin, and anyone not on the list is told the command does not exist (and noted in the log).
   */
  private adminCommand(m: Member, cmd: string, args: string[]): void {
    if (!m.admin) {
      this.audit(m, 'refused', `/${cmd} ${args.join(' ')}`.trim());
      this.strike(m, STRIKES.forbidden, 'admin command without being an admin');
      return this.tell(m, `Unknown command: /${cmd}`);
    }
    const p = m.player;
    if (cmd === 'admin') {
      const sub = (args[0] ?? 'status').toLowerCase();
      if (sub === 'on') {
        if (m.adminOn) return this.tell(m, 'Admin mode is already on.');
        m.adminOn = true;
        this.audit(m, 'on');
        m.conn.send({ t: 'admin', on: true });
        return this.tell(m, 'Admin mode ON. /admin help lists your commands; /admin off to leave.');
      }
      if (sub === 'off') {
        if (!m.adminOn) return this.tell(m, 'Admin mode is already off.');
        m.adminOn = false;
        // Creative mode was a gift of admin mode: it ends with it.
        const own = this.opts.mode ?? 'survival';
        if (!this.opts.cheats && p.mode !== own) p.setMode(own);
        this.audit(m, 'off');
        m.conn.send({ t: 'admin', on: false });
        return this.tell(m, 'Admin mode OFF.');
      }
      if (sub === 'help') {
        return this.tell(
          m,
          'Admin: /admin on|off  /players  /kick <player> [reason]  /ban <player> [reason]  /unban <name>  /bans  /mute <player> [minutes]  /unmute <player>  /tpto <player>  /bring <player>  /give <item> [count]  /spawn <mob id> [count]  /mobs [filter]  /announce <text>  /land help  and /time /weather /gamemode /tp /xp /coins /rift /invasion',
        );
      }
      if (sub === 'status') return this.tell(m, `Admin mode is ${m.adminOn ? 'on' : 'off'}.`);
      return this.tell(m, 'Usage: /admin on|off|status|help');
    }
    if (!m.adminOn) return this.tell(m, 'Admin mode is off. Type /admin on.');

    const rest = args.join(' ');
    /** The player a command names (names may hold spaces) and what follows the name; tells the admin when there is none or it may not be touched. */
    const target = (touch: boolean): { who: Member; text: string } | null => {
      const hit = splitTarget(this.members.values(), rest);
      if (!hit) {
        this.tell(m, rest ? `No player called "${args[0]}" is online.` : `Usage: /${cmd} <player>`);
        return null;
      }
      if (touch && (hit.target === m || hit.target.admin)) {
        this.tell(m, 'You cannot do that to an admin (or to yourself).');
        return null;
      }
      return { who: hit.target, text: hit.text };
    };

    switch (cmd) {
      case 'players': {
        const rows = [...this.members.values()].map((x) => `${x.name}${x.admin ? '*' : ''} L${x.player.cls?.level ?? '-'} ${Math.round(x.player.body.x)},${Math.round(x.player.body.y)},${Math.round(x.player.body.z)}${x.key ? '' : ' (guest)'}`);
        this.tell(m, `Players (${rows.length}): ${rows.slice(0, 25).join(' | ')}${rows.length > 25 ? ' | ...' : ''}`);
        return;
      }
      case 'kick': {
        const t = target(true);
        if (!t) return;
        this.audit(m, 'kick', `${t.who.name} ${t.text}`.trim());
        this.tell(m, `Kicked ${t.who.name}.`);
        this.kick(t.who.id, t.text ? `kicked by an admin: ${t.text.slice(0, 80)}` : 'kicked by an admin');
        return;
      }
      case 'ban': {
        if (!this.opts.store) return this.tell(m, 'Bans need the server database.');
        const t = target(true);
        if (!t) return;
        // The wallet is banned when there is one (so none of its characters gets back in), else the character.
        const id = t.who.wallet ?? t.who.key;
        if (!id) return this.tell(m, `${t.who.name} is a guest and cannot be banned: use /kick.`);
        const bans = this.bans();
        bans[id] = { name: t.who.name, by: m.name, reason: t.text.slice(0, 80), at: Date.now() };
        this.opts.store.setJson(BANS_KEY, bans);
        this.audit(m, 'ban', `${t.who.name} (${id}) ${t.text}`.trim());
        this.tell(m, `Banned ${t.who.name}.`);
        this.kick(t.who.id, t.text ? `banned: ${t.text.slice(0, 80)}` : 'banned');
        return;
      }
      case 'unban': {
        if (!this.opts.store) return this.tell(m, 'Bans need the server database.');
        const want = rest.trim().toLowerCase();
        const bans = this.bans();
        const id = want ? Object.keys(bans).find((k) => bans[k].name.toLowerCase() === want) : undefined;
        if (!id) return this.tell(m, want ? `Nobody called "${rest}" is banned.` : 'Usage: /unban <name>');
        const name = bans[id].name;
        delete bans[id];
        this.opts.store.setJson(BANS_KEY, bans);
        this.audit(m, 'unban', name);
        this.tell(m, `${name} is no longer banned.`);
        return;
      }
      case 'bans': {
        const all = Object.values(this.bans());
        this.tell(m, all.length === 0 ? 'Nobody is banned.' : `Banned: ${all.map((b) => (b.reason ? `${b.name} (${b.reason})` : b.name)).join(', ')}`);
        return;
      }
      case 'mute': {
        const t = target(true);
        if (!t) return;
        const minutes = Math.max(1, Math.min(1440, Math.floor(Number(t.text) || 10)));
        t.who.mutedUntil = this.tickCount + minutes * 60 * this.tickHz;
        this.audit(m, 'mute', `${t.who.name} ${minutes} min`);
        this.tell(m, `${t.who.name} is muted for ${minutes} minutes.`);
        this.tell(t.who, `You have been muted for ${minutes} minutes.`);
        return;
      }
      case 'unmute': {
        const t = target(false);
        if (!t) return;
        t.who.mutedUntil = 0;
        this.audit(m, 'unmute', t.who.name);
        this.tell(m, `${t.who.name} can chat again.`);
        this.tell(t.who, 'You can chat again.');
        return;
      }
      case 'tpto': {
        const t = target(false);
        if (!t) return;
        p.teleport(t.who.player.body.x, t.who.player.body.y, t.who.player.body.z);
        this.audit(m, 'tpto', t.who.name);
        return;
      }
      case 'bring': {
        const t = target(true);
        if (!t) return;
        t.who.player.teleport(p.body.x, p.body.y, p.body.z);
        this.audit(m, 'bring', t.who.name);
        this.tell(m, `${t.who.name} is with you.`);
        return;
      }
      case 'give': {
        const last = args[args.length - 1];
        const hasCount = args.length > 1 && /^\d{1,5}$/.test(last);
        const count = hasCount ? Number(last) : 1;
        const query = (hasCount ? args.slice(0, -1) : args).join(' ');
        const item = findItem(query);
        if (!item) {
          const near = itemMatches(query);
          return this.tell(m, query ? (near.length ? `Which one? ${near.join(', ')}` : `No item called "${query}".`) : 'Usage: /give <item> [count]');
        }
        let left = Math.max(1, Math.min(2304, count));
        const total = left;
        while (left > 0) {
          const n = Math.min(left, Math.max(1, item.maxStack));
          p.giveItem(item.id, n);
          left -= n;
        }
        this.audit(m, 'give', `${item.name} x${total}`);
        this.tell(m, `Given ${total} ${item.name}.`);
        return;
      }
      case 'mobs': {
        // The ids /spawn takes, optionally only those that hold the words (the id or the display name).
        const q = norm(rest);
        const ids = (Object.keys(MOBS) as MobKind[]).filter((k) => !q || k.includes(q) || norm(MOBS[k].name).includes(q));
        this.tell(m, ids.length === 0 ? `No mob matches "${rest}".` : `Mob ids (${ids.length}): ${ids.slice(0, 60).join(', ')}${ids.length > 60 ? ', ... (add a word to narrow it)' : ''}`);
        return;
      }
      case 'spawn': {
        // /spawn <id> [count]: puts that creature in front of the admin, facing them. The id is a key of MOBS (see /mobs).
        const last = args[args.length - 1];
        const hasCount = args.length > 1 && /^\d{1,2}$/.test(last);
        const count = Math.max(1, Math.min(20, hasCount ? Number(last) : 1));
        const query = norm((hasCount ? args.slice(0, -1) : args).join(' '));
        const all = Object.keys(MOBS) as MobKind[];
        const kind = all.find((k) => k === query) ?? all.find((k) => norm(MOBS[k].name) === query);
        if (!kind) {
          const near = all.filter((k) => query && (k.includes(query) || norm(MOBS[k].name).includes(query))).slice(0, 12);
          return this.tell(m, query ? (near.length ? `Which one? ${near.join(', ')}` : `No mob with the id "${query}". /mobs lists them.`) : 'Usage: /spawn <mob id> [count]  (/mobs lists the ids)');
        }
        const b = p.body;
        const fx = -Math.sin(p.yaw);
        const fz = -Math.cos(p.yaw);
        for (let i = 0; i < count; i++) {
          // 3 blocks ahead (a bit further for a big one), several side by side.
          const dist = 3 + MOBS[kind].width * 0.5;
          const side = (i - (count - 1) / 2) * (MOBS[kind].width + 0.6);
          p.spawnMob(kind, b.x + fx * dist - fz * side, b.y + 0.1, b.z + fz * dist + fx * side);
        }
        this.audit(m, 'spawn', `${kind} x${count}`);
        this.tell(m, `Spawned ${count > 1 ? `${count} x ` : ''}${MOBS[kind].name} (${kind}).`);
        return;
      }
      case 'land':
        this.landAdmin(m, args);
        return;
      case 'announce': {
        const text = rest.slice(0, 200).trim();
        if (!text) return this.tell(m, 'Usage: /announce <text>');
        this.audit(m, 'announce', text);
        this.broadcast({ t: 'notice', text: `[Admin] ${text}` });
        return;
      }
      default:
        this.tell(m, `Unknown command: /${cmd}`);
    }
  }

  /**
   * /land: the administrator's tools for the land (see landService.ts). Everything that changes something is written to the land's own log
   * (and the server's), with who did it. Reached only through `adminCommand`, so only an admin with admin mode on.
   */
  private landAdmin(m: Member, args: string[]): void {
    const land = this.land;
    const p = m.player;
    const sub = (args[0] ?? 'help').toLowerCase();
    const who = m.key ?? m.name;
    const say = (t: string): void => this.tell(m, t);
    const num = (v: string | undefined, d: number, lo: number, hi: number): number => (v && /^\d{1,5}$/.test(v) ? Math.max(lo, Math.min(hi, Number(v))) : d);
    const line = (c: ReturnType<LandService['allClaims']>[number]): string => `${c.id} "${c.name}" by ${c.ownerName} ${c.polygon.area} blocks ${c.status} at ${c.polygon.box.x0},${c.polygon.box.z0}`;
    switch (sub) {
      case 'help':
        return say('/land here | list [owner] | info <id> | revoke <id> [refund] | invalid | reserve <name> [radius] | unreserve <id> | reserved | pause | resume | queue | stats | restore [radius] | rollback <radius> [player] | audit [player] | log | legacy ... | backups');
      case 'here': {
        const b = p.body;
        const r = land.inspect(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z));
        if (!r.claim) return say(`No claim here.${r.entry ? ` The block under you was changed (${r.entry.cls}, by ${r.entry.by ?? 'nobody'}).` : ''}`);
        return say(`${line(r.claim)}; paid ${r.claim.paid}, ${r.claim.grants.length} invited${r.entry ? `; this block: ${r.entry.cls}` : ''}`);
      }
      case 'list': {
        const q = norm(args.slice(1).join(' '));
        const all = land.allClaims().filter((c) => !q || norm(c.ownerName).includes(q) || norm(c.name).includes(q));
        return say(`${all.length} claims: ${all.slice(0, 8).map(line).join(' | ')}${all.length > 8 ? ' | ... (add a name to narrow it)' : ''}`);
      }
      case 'info': {
        const c = land.allClaims().find((x) => x.id === args[1]);
        if (!c) return say('Usage: /land info <claim id>');
        const d = land.detail(c.ownerType === 'player' ? c.ownerId : null, c.id);
        return say(`${line(c)}; paid ${c.paid}; depth ${c.depth}, height ${c.height}; invited: ${c.grants.map((g) => `${g.name} (${g.role})`).join(', ') || 'nobody'}${d ? `; ${d.changes} changes held` : ''}`);
      }
      case 'revoke': {
        if (!args[1]) return say('Usage: /land revoke <claim id> [refund]');
        const r = land.revoke(args[1], who, args[2] === 'refund');
        this.audit(m, 'land revoke', args.slice(1).join(' '));
        return say(r.text);
      }
      case 'invalid': {
        const bad = land.findInvalid();
        return say(bad.length === 0 ? 'Every claim fits the rules.' : `${bad.length} claims do not: ${bad.slice(0, 6).map((b) => `${b.id} (${b.why})`).join(' | ')}`);
      }
      case 'reserve': {
        const name = args[1];
        if (!name) return say('Usage: /land reserve <name> [radius]');
        const r = num(args[2], 24, 4, 256);
        const b = p.body;
        const res = land.reserve(who, name, { x0: Math.floor(b.x) - r, z0: Math.floor(b.z) - r, x1: Math.floor(b.x) + r, z1: Math.floor(b.z) + r });
        this.audit(m, 'land reserve', `${name} r${r}`);
        return say(res.text);
      }
      case 'unreserve': {
        const res = land.unreserve(who, args[1] ?? '');
        this.audit(m, 'land unreserve', args[1] ?? '');
        return say(res.text);
      }
      case 'reserved':
        return say(land.reserved().length === 0 ? 'No reserved regions.' : land.reserved().map((r) => `${r.id} ${r.name} ${r.x0},${r.z0}..${r.x1},${r.z1}`).join(' | '));
      case 'pause':
      case 'resume':
        land.setPaused(sub === 'pause', who);
        this.audit(m, `land ${sub}`);
        return say(`Wilderness restoration is ${sub === 'pause' ? 'paused' : 'running'}.`);
      case 'queue':
      case 'stats': {
        const s = land.stats();
        return say(`Claims ${s.claims} (${s.area} blocks); restoration ${s.paused ? 'PAUSED' : 'running'}; ledger ${JSON.stringify(s.ledger)}; last step ${JSON.stringify(s.last)}; since start ${JSON.stringify(s.totals)}`);
      }
      case 'restore': {
        const r = num(args[1], 32, 1, 256);
        const b = p.body;
        const n = land.rollback(who, { x0: Math.floor(b.x) - r, y0: 0, z0: Math.floor(b.z) - r, x1: Math.floor(b.x) + r, y1: 255, z1: Math.floor(b.z) + r }, { wildOnly: true });
        this.audit(m, 'land restore', `r${r}: ${n} blocks`);
        return say(`Put ${n} wilderness blocks back (claimed ones were left alone).`);
      }
      case 'rollback': {
        const r = num(args[1], 0, 1, 256);
        if (!r) return say('Usage: /land rollback <radius> [player]');
        const name = args.slice(2).join(' ');
        const target = name ? [...this.members.values()].find((x) => norm(x.name) === norm(name)) : null;
        if (name && !target?.key) return say(`No signed-in player called "${name}" is online.`);
        const b = p.body;
        const n = land.rollback(who, { x0: Math.floor(b.x) - r, y0: 0, z0: Math.floor(b.z) - r, x1: Math.floor(b.x) + r, y1: 255, z1: Math.floor(b.z) + r }, target?.key ? { by: target.key } : {});
        this.audit(m, 'land rollback', `r${r}${name ? ` ${name}` : ''}: ${n} blocks`);
        return say(`Rolled back ${n} blocks (claimed ones included: this is the administrator's undo).`);
      }
      case 'audit': {
        const name = args.slice(1).join(' ');
        const target = name ? [...this.members.values()].find((x) => norm(x.name) === norm(name)) : null;
        if (name && !target?.key) return say(`No signed-in player called "${name}" is online.`);
        const rows = land.recentTxns(8, target?.key ?? undefined);
        return say(rows.length === 0 ? 'No land transactions.' : rows.map((t) => `${t.kind} ${t.amount} Auren ${t.state} by ${t.playerKey} ${t.claimId ?? ''}`).join(' | '));
      }
      case 'log': {
        const rows = land.adminLog(8);
        return say(rows.length === 0 ? 'The land log is empty.' : rows.map((r) => `${new Date(r.at).toISOString().slice(0, 16)} ${r.action} ${r.detail}`).join(' | '));
      }
      case 'backups': {
        const b = land.backups();
        return say(b.length === 0 ? 'No copies of the claims yet (one is made before each adoption).' : b.map((x) => `${new Date(x.at).toISOString().slice(0, 16)} ${x.why} (${x.claims} claims)`).join(' | '));
      }
      case 'legacy': {
        // Builds from before there was land: nobody's, and never put back, but anybody could buy the ground under them.
        const what = (args[1] ?? 'help').toLowerCase();
        const siteLine = (s: ReturnType<LandService['scanLegacy']>[number]): string => `#${s.id} ${s.box.x0},${s.box.z0}..${s.box.x1},${s.box.z1} (${s.blocks} blocks)`;
        if (what === 'scan') {
          const sites = land.scanLegacy(this.world.diffAgainstTerrain(), num(args[2], 40, 1, 5000));
          return say(sites.length === 0 ? 'No old builds without an owner.' : `${sites.length} old builds: ${sites.slice(0, 8).map(siteLine).join(' | ')}${sites.length > 8 ? ' | ...' : ''}. (Grown trees and crops show here too.) /land legacy reserve keeps them free; /land legacy adopt <player> <#n> [name] gives one to its builder.`);
        }
        if (what === 'reserve') {
          if (land.legacySites().length === 0) return say('Scan first: /land legacy scan');
          const n = land.reserveLegacy(who);
          this.audit(m, 'land legacy reserve', `${n} sites`);
          return say(`${n} old builds are now kept free of claims until they are adopted.`);
        }
        if (what === 'adopt') {
          const id = /^#?(\d{1,4})$/.exec(args[3] ?? '');
          const site = id ? land.legacySites().find((s) => s.id === Number(id[1])) : undefined;
          if (!args[2] || !site) return say('Usage: /land legacy adopt <player> <#n> [name]  (scan first: the number is the one from /land legacy scan)');
          const target = [...this.members.values()].find((x) => norm(x.name) === norm(args[2]));
          if (!target?.key) return say(`No signed-in player called "${args[2]}" is online.`);
          const b = land.siteBox(site);
          const res = land.adopt(who, { account: target.key, ownerName: target.name, name: args.slice(4).join(' '), vertices: [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]] });
          this.audit(m, 'land legacy adopt', `#${site.id} -> ${target.name}: ${res.ok ? 'done' : res.text}`);
          if (res.ok) {
            this.tell(target, `An administrator has given you the land your old build stands on: ${res.claim?.name ?? 'your land'}. Press B to see it.`);
            target.player.landForget(res.claim?.id ?? '');
          }
          return say(res.text);
        }
        return say('/land legacy scan [minBlocks] | reserve | adopt <player> <#n> [name]');
      }
      default:
        return say('Unknown /land command. /land help lists them.');
    }
  }

  /** /party invite|accept|decline|leave|kick|leader|list: up to four players share a dungeon. */
  private partyCommand(p: Player, args: string[]): string {
    return this.realm.parties.run(p, args[0], args[1]);
  }

  private cheat(m: Member, name: string, args: string[]): void {
    const p = m.player;
    if (name === 'time') {
      const t = { day: 0.25, noon: 0.25, night: 0.75, midnight: 0.75, dawn: 0, sunrise: 0, dusk: 0.5, sunset: 0.5 }[args[0] ?? ''];
      if (t === undefined) return this.tell(m, 'Usage: /time day|night|dawn|dusk');
      this.realm.time = t;
      this.tell(m, `Time set to ${args[0]}`);
    } else if (name === 'weather') {
      if (args[0] !== 'clear' && args[0] !== 'rain' && args[0] !== 'thunder') return this.tell(m, 'Usage: /weather clear|rain|thunder');
      p.setWeather(args[0]);
      this.tell(m, `Weather set to ${args[0]}`);
    } else if (name === 'gamemode') {
      if (args[0] !== 'survival' && args[0] !== 'creative') return this.tell(m, 'Usage: /gamemode survival|creative');
      p.setMode(args[0]);
    } else if (name === 'xp') {
      const m1 = /^(\d{1,6})(l?)$/i.exec(args[0] ?? '');
      if (!m1) return this.tell(m, 'Usage: /xp <points> or /xp <levels>L');
      const n = Number(m1[1]);
      let left = m1[2] ? Math.max(0, totalForLevel(Math.min(MAX_LEVEL, p.xp.level + n)) - p.xp.total) : n;
      while (left > 0) {
        const step = Math.min(left, MAX_AWARD);
        p.addXp(step);
        left -= step;
      }
      this.tell(m, `Level ${p.xp.level}`);
    } else if (name === 'coins') {
      const n = /^\d{1,9}$/.test(args[0] ?? '') ? Number(args[0]) : 0;
      if (n <= 0) return this.tell(m, 'Usage: /coins <amount>');
      p.addCoins(n);
      this.tell(m, `You carry ${p.coins} coins`);
    } else if (name === 'rift') {
      const g = (args[0] ?? '').toLowerCase();
      const grade = g === 'uncommon' || g === 'rare' || g === 'epic' ? g : undefined;
      if (args[0] && !grade) return this.tell(m, 'Usage: /rift [uncommon|rare|epic]');
      this.tell(m, this.realm.startRift(grade) ? 'A rift is tearing open nearby' : this.realm.rifts?.current ? 'A rift is already open' : 'No place for a rift here');
    } else if (name === 'invasion') {
      this.tell(m, this.realm.startInvasion() ? 'The Gilded Tide breaks over the land' : this.realm.invasions?.current ? 'The Gilded Tide is on already' : !this.realm.invasions ? 'Invasions are off on this server' : 'No place for the Gilded Tide here');
    } else if (name === 'tp') {
      const [x, y, z] = args.map(Number);
      if (![x, y, z].every((v) => Number.isFinite(v) && Math.abs(v) < 30_000_000)) return this.tell(m, 'Usage: /tp x y z');
      p.teleport(x, Math.max(-20, Math.min(255, y)), z);
    }
  }

  // ---- misbehaviour ------------------------------------------------------------

  /** Add suspicion points. Warns once, and kicks at the threshold. Safe to call for unknown ids. */
  strike(target: Member | number, points: number, reason: string): void {
    const m = typeof target === 'number' ? this.members.get(target) : target;
    if (!m || !this.members.has(m.id)) return;
    m.score += points;
    this.stat.strikes++;
    const limit = this.opts.kickScore ?? 50;
    const kicked = m.score >= limit;
    this.opts.onViolation?.({ id: m.id, name: m.name, reason, points, score: m.score, kicked });
    if (kicked) {
      this.kick(m.id, `kicked: ${reason}`);
    } else if (m.score >= limit / 2 && !m.warned) {
      m.warned = true;
      this.tell(m, 'Warning: unusual activity detected. Slow down or you will be removed.');
    }
  }

  kick(id: number, reason: string): void {
    const m = this.members.get(id);
    if (!m) return;
    this.stat.kicks++;
    m.conn.send({ t: 'kicked', reason });
    this.leave(id);
    m.conn.close(reason);
  }

  stats(reset = false): RoomStats {
    const s = { players: this.members.size, ticks: this.tickCount, ...this.stat };
    if (reset) this.stat.tickMsMax = 0;
    return s;
  }

  // ---- the tick ----------------------------------------------------------------

  tick(): void {
    const t0 = performance.now();
    this.tickInner();
    const ms = performance.now() - t0;
    this.stat.tickMsAvg += (ms - this.stat.tickMsAvg) * 0.05;
    if (ms > this.stat.tickMsMax) this.stat.tickMsMax = ms;
    if (ms > 1000 / this.tickHz) this.stat.overruns++;
  }

  private tickInner(): void {
    const dt = 1 / this.tickHz;
    this.tickCount++;
    if (this.opts.store && this.tickCount % Math.round(this.tickHz * (this.opts.autosaveSeconds ?? 30)) === 0) this.save();
    const all = [...this.members.values()];

    for (const m of all) {
      m.budget = Math.min(MAX_BUDGET, m.budget + dt);
      m.chatTokens = Math.min(5, m.chatTokens + dt / 2);
      m.socialTokens = Math.min(SOCIAL_BURST, m.socialTokens + dt * SOCIAL_RATE);
      m.tradeTokens = Math.min(TRADE_BURST, m.tradeTokens + dt * TRADE_RATE);
      m.cmdTokens = Math.min(CMD_BURST, m.cmdTokens + dt * CMD_RATE);
      m.score = Math.max(0, m.score - dt);
      if (m.score < (this.opts.kickScore ?? 50) / 4) m.warned = false;
      this.runQueue(m);
    }
    if (all.length > 0) {
      const players = all.map((m) => m.player);
      this.realm.update(dt, players);
      for (const p of players) p.postRealm(dt);
    }
    this.keepLand(all);
    this.realm.advanceClock(dt);
    this.keepAuctions(all);
    this.keepStashes(all);
    this.watchTrades(all);
    this.flush(all);
  }

  /** The land's clock (putting the wilderness back, letting go of released claims), and telling those who see a claim that it changed. */
  private keepLand(all: Member[]): void {
    try {
      this.land.tick();
    } catch (err) {
      console.error('[solrift] the land tick failed', err);
    }
    if (this.land.changed.size === 0) return;
    for (const id of this.land.changed) for (const m of all) m.player.landForget(id);
    this.land.changed.clear();
  }

  /**
   * What happened at the Auction House this tick is written down at once: first what the players carry (the item that went up, the coins
   * that were paid), then the house. A crash between the two loses an item rather than making one twice.
   */
  private keepAuctions(all: Member[]): void {
    for (const m of all) {
      if (!m.player.auctionTouched) continue;
      m.player.auctionTouched = false;
      try {
        this.savePlayer(m);
      } catch (err) {
        console.error(`[solrift] saving player ${m.name} failed`, err);
      }
    }
    this.commitAuctionMoves();
    if (this.realm.auctions.dirty) this.saveAuctions();
  }

  /**
   * What a player did at the Stash this tick is written down at once, the player and the stash together in one write: an item that moved
   * between them is never lost and never in both. (A store that cannot write several records at once gets them one after the other.)
   */
  private keepStashes(all: Member[]): void {
    const store = this.opts.store;
    if (!store) return;
    for (const m of all) {
      if (!m.player.stashTouched) continue;
      m.player.stashTouched = false;
      const owner = m.player.wallet;
      try {
        const entries: [string, unknown][] = [];
        if (m.key) entries.push([`player:${m.key}`, m.player.savePlayer()]);
        if (owner) entries.push([`stash:${owner}`, this.realm.stashes.toJSON(owner)]);
        if (store.setJsonBatch) store.setJsonBatch(entries);
        else for (const [k, v] of entries) store.setJson(k, v);
        if (owner) this.realm.stashes.dirty.delete(owner);
      } catch (err) {
        console.error(`[solrift] saving the stash of ${m.name} failed`, err);
      }
    }
  }
  /** Run as much queued input as the player's time budget allows. */
  private runQueue(m: Member): void {
    const p = m.player;
    let steps = 0;
    while (m.queue.length > 0) {
      const item = m.queue[0];
      if (item.k === 'cmd') {
        m.queue.shift();
        p.apply(item.c);
        continue;
      }
      if (m.budget < STEP - 1e-9 || steps >= MAX_STEPS_PER_TICK) break;
      m.queue.shift();
      m.budget -= STEP;
      steps++;
      const f: InputFrame = { t: 'frame', dt: STEP, locked: true, ...item.f };
      p.beginFrame(f);
      p.advanceOne(f);
      if (p.screen === 'none') p.updateInteraction(STEP, f);
      m.ack = item.f.seq;
    }
  }

  private flush(all: Member[]): void {
    if (this.pendingBlocks.length > 0) {
      const blocks = this.pendingBlocks;
      this.pendingBlocks = [];
      for (let i = 0; i < blocks.length; i += EDITS_PER_MESSAGE) {
        this.broadcast({ t: 'blocks', blocks: blocks.slice(i, i + EDITS_PER_MESSAGE) });
      }
    }
    // Everybody sees the same views of the others: build them (and their JSON) once, not once per recipient.
    this.frames = all.map((o) => this.playerFrame(o));
    try {
      for (const m of all) this.sendState(m);
    } finally {
      this.frames = null;
    }
  }

  /** The views of all players for this tick (set while `flush` runs). */
  private frames: PlayerFrame[] | null = null;

  private playerFrame(o: Member): PlayerFrame {
    const ob = o.player.body;
    return {
      x: ob.x,
      z: ob.z,
      id: o.id,
      json: null,
      view: {
        id: o.id,
        name: o.name,
        look: lookOf(o),
        x: round(ob.x),
        y: round(ob.y),
        z: round(ob.z),
        yaw: round(o.player.yaw),
        pitch: round(o.player.pitch),
        sneaking: o.player.sneaking,
        onGround: ob.onGround,
        held: o.player.held?.id ?? 0,
        ...(glowCode(o.player.held) ? { hg: glowCode(o.player.held) } : {}),
        ...(glowCode(o.player.offhand.get(0)) ? { og: glowCode(o.player.offhand.get(0)) } : {}),
        armor: o.player.armorIds(),
        offhand: o.player.offhand.get(0)?.id ?? 0,
        blocking: o.player.blocking,
        ...(o.player.eatProgress > 0 ? { ea: 1 as const } : {}),
        ...(o.player.screen === 'dead' ? { dd: 1 as const } : {}),
        ...(o.player.swingAge * o.player.swingRate < 0.35 ? { sw: round(o.player.swingAge), ...(o.player.swingRate !== 1 ? { sr: o.player.swingRate } : {}) } : {}),
        ...(o.player.slamPhase ? { sl: o.player.slamPhase } : {}),
        ...(o.player.charging ? { rs: 1 as const } : {}),
        ...(o.player.emberProgress > 0 ? { em: round(o.player.emberProgress) } : {}),
        ...(o.player.bashAge < BASH_ANIM ? { bs: round(o.player.bashAge) } : {}),
        sleeping: o.player.sleeping ? o.player.sleeping.dir + 1 : 0,
        ...(o.player.mountId ? { mt: o.player.mountView().mount } : {}),
        ...(o.player.companionNumber > 0 ? { pt: o.player.companionNumber } : {}),
        ...(o.player.wingNumber > 0 ? { wg: o.player.wingNumber } : {}),
        ...(o.player.wingFlying ? { fl: 1 as const } : {}),
        ...(o.player.cls ? { cls: o.player.cls.classId, clv: o.player.cls.level } : {}),
        ...(o.key && this.guilds.of(o.key) ? { gt: this.guilds.of(o.key)!.tag } : {}),
      },
    };
  }

  /**
   * A snapshot that was skipped (the client is behind: right after joining it is still taking in the world) never arrived, and the
   * things only a snapshot says once go with it: the inventory and clothes, and the effects the client was told in full.
   * They are sent again with the next one.
   */
  private delivered(m: Member, snap: Snapshot, result: unknown): void {
    if (result !== 'skipped') return;
    if (snap.inv) m.invDirty = true;
    if (snap.signs) m.signRev = -1;
    m.fxSent.clear();
  }

  /**
   * Pay what the achievements won this tick (and the dungeon clears) are worth in $SOLRIFT, and tell the player (the amount is the
   * server's, never the client's). Events are read in order, so a blow and the kill it made in the same tick count as fighting.
   */
  private payAchievements(m: Member, events: SessionEvent[]): void {
    // A hit this player landed on a mob (not damage they took): they are fighting. Noted for everyone, paid or not, so it is true when it matters.
    const engaged = (): boolean => this.tickCount - m.fightTick <= CLEAR_ENGAGED_SECONDS * this.tickHz;
    const honest = !!m.wallet && !m.adminOn && !this.opts.cheats && m.player.mode !== 'creative';
    for (const e of events) {
      if (e.t === 'dmg' && !e.taken) {
        m.fightTick = this.tickCount;
        continue;
      }
      if (!honest) continue;
      if (e.t === 'bounty') {
        let paid = 0;
        try {
          paid = this.opts.onBounty?.({ wallet: m.wallet!, account: m.key, id: e.id, day: e.day }) ?? 0;
        } catch (err) {
          console.error('[solrift] paying a bounty failed', err);
        }
        if (paid > 0) m.conn.send({ t: 'notice', text: `+${paid} $SOLRIFT added to your balance (daily bounty: ${e.name})` });
        continue;
      }
      if (e.t !== 'achievement' && e.t !== 'clear') continue;
      // Standing near a boss while others kill it earns nothing: only a player who landed a hit lately is paid for a clear.
      if (e.t === 'clear' && !engaged()) continue;
      const pay = e.t === 'achievement' ? this.opts.onAchievement : this.opts.onClear;
      if (!pay) continue;
      let paid = 0;
      try {
        paid = pay({ wallet: m.wallet!, account: m.key, id: e.id });
      } catch (err) {
        console.error(`[solrift] paying ${e.t === 'achievement' ? 'an achievement' : 'a clear'} failed`, err);
      }
      if (paid > 0) m.conn.send({ t: 'notice', text: e.t === 'achievement' ? `+${paid} $SOLRIFT added to your balance (${e.name})` : `+${paid} $SOLRIFT added to your balance for clearing ${e.name}` });
    }
  }

  private sendState(m: Member): void {
    const events: SessionEvent[] = m.player.drainEvents();
    if (events.length > 0) {
      if (events.some((e) => e.t === 'inv')) m.invDirty = true;
      m.conn.send({ t: 'events', events });
      this.payAchievements(m, events);
    }
    if (m.conn.sendSnapshot && this.frames) {
      const snap = this.snapshot(m, true);
      const { frames, keep } = this.framesFor(m);
      if (keep.length > 0) snap.keep = keep;
      this.delivered(m, snap, m.conn.sendSnapshot(snap, '[' + frames.map((f) => (f.json ??= JSON.stringify(f.view))).join(',') + ']'));
    } else {
      const snap = this.snapshot(m);
      this.delivered(m, snap, m.conn.send(snap));
    }
  }

  /** The other players inside `m`'s view range, from this tick's frames (or built fresh outside a tick). */
  private visibleFrames(m: Member): PlayerFrame[] {
    const b = m.player.body;
    const frames = this.frames ?? [...this.members.values()].map((o) => this.playerFrame(o));
    return frames.filter((f) => f.id !== m.id && Math.abs(f.x - b.x) <= VIEW_PLAYERS && Math.abs(f.z - b.z) <= VIEW_PLAYERS);
  }

  /** What a real connection is sent of the players in its view (see NEAR_PLAYERS): the frames, and the ids it is to keep without news. */
  private framesFor(m: Member): { frames: PlayerFrame[]; keep: number[] } {
    const all = this.visibleFrames(m);
    if (all.length <= NEAR_PLAYERS) return { frames: all, keep: [] };
    const b = m.player.body;
    const d = new Float64Array(all.length);
    for (let i = 0; i < all.length; i++) d[i] = (all[i].x - b.x) ** 2 + (all[i].z - b.z) ** 2;
    const order = Array.from(d.keys()).sort((a, c) => d[a] - d[c]);
    const frames: PlayerFrame[] = [];
    const keep: number[] = [];
    for (let rank = 0; rank < order.length; rank++) {
      const f = all[order[rank]];
      if (rank < NEAR_PLAYERS || (this.tickCount + f.id) % FAR_PLAYER_EVERY === 0) frames.push(f);
      else keep.push(f.id);
    }
    return { frames, keep };
  }

  // ---- snapshots ---------------------------------------------------------------

  snapshot(m: Member, noPlayers = false): Snapshot {
    const p = m.player;
    const b = p.body;
    const near = (x: number, z: number, r: number): boolean => Math.abs(x - b.x) <= r && Math.abs(z - b.z) <= r;

    const you: SelfView = {
      x: b.x,
      y: b.y,
      z: b.z,
      vx: b.vx,
      vy: b.vy,
      vz: b.vz,
      onGround: b.onGround,
      inWater: b.inWater,
      eyeInWater: b.eyeInWater,
      flying: p.flying,
      mode: p.mode,
      selected: p.selected,
      screen: p.screen,
      health: p.vitals.health,
      hunger: p.vitals.hunger,
      saturation: p.vitals.saturation,
      air: p.vitals.air,
      dead: p.vitals.dead,
      ...(p.poison > 0.05 ? { poison: round(p.poison) } : {}),
      ...(p.moveMul < 1 ? { mv: round(p.moveMul) } : {}),
      ...(p.foodSick > 0.05 ? { foodSick: round(p.foodSick) } : {}),
      level: p.xp.level,
      xpProgress: round(p.xp.progress),
      coins: p.coins,
      defense: p.defense,
      deathMessage: p.screen === 'dead' ? p.deathMessage() : null,
      target: p.target ? { x: p.target.x, y: p.target.y, z: p.target.z, id: p.target.id } : null,
      breakProgress: round(p.breakProgress),
      hudProgress: round(p.hudProgress),
      bowDraw: round(p.bowDraw),
      offhand: itemView(p.offhand.get(0)),
      mountSlot: itemView(p.mountSlot.get(0)),
      outfitSlot: itemView(p.outfitSlot.get(0)),
      companionSlot: itemView(p.companionSlot.get(0)),
      wingSlot: itemView(p.wingSlot.get(0)),
      accessories: [0, 1, 2].map((i) => itemView(p.accessories.get(i))),
      blocking: p.blocking,
      ...(p.eatProgress > 0 ? { eat: round(p.eatProgress) } : {}),
      ...(p.emberProgress > 0 ? { emb: Math.max(0.01, round(p.emberProgress)) } : {}),
      ...(p.aimsAtTalker ? { talk: 1 as const } : {}),
      burning: p.burning,
      sleeping: p.sleeping ? p.sleeping.dir + 1 : 0,
      riding: p.riding?.id ?? 0,
      ...mountFields(p),
      ...(p.cls ? { cls: p.classView()! } : {}),
      ...(p.bossView() ? { boss: p.bossView()! } : {}),
      ...(p.dungeonView() ? { dungeon: p.dungeonView()! } : {}),
      ...(p.riftView() ? { rift: p.riftView()! } : {}),
    };

    const players: PlayerView[] = noPlayers ? [] : this.visibleFrames(m).map((f) => f.view);

    const mobs: MobView[] = [];
    for (const mob of this.realm.mobs.mobs) {
      if (!near(mob.body.x, mob.body.z, VIEW_MOBS)) continue;
      mobs.push({
        id: mob.id,
        kind: mob.kind,
        x: round(mob.body.x),
        y: round(mob.body.y),
        z: round(mob.body.z),
        yaw: round(mob.yaw),
        walk: round(mob.walkPhase),
        speed: round(mob.speedNow),
        hurt: round(Math.min(mob.hurtTime, 9.99)),
        dead: mob.dead,
        deathTime: round(mob.deathTime),
        burning: mob.burning,
        fuse: round(mob.fuse),
        ...(mob.attackTime < (mob.def.boss ? BOSS_ANIM : ATTACK_ANIM) ? { atk: round(mob.attackTime) } : {}),
        ...(mob.casting ? { cast: mob.casting } : {}),
        size: mob.size,
        variant: mob.variant,
        ...(mob.baby ? { baby: 1 as const } : {}),
        ...(mob.sheared ? { sheared: 1 as const } : {}),
        ...(mob.love > 0 ? { love: 1 as const } : {}),
        ...(mob.gear ? { gear: [...mob.gear] } : {}),
        ...(mob.health < mob.maxHealth || mob.elite ? { hp: Math.max(0, Math.ceil(mob.health)), mx: Math.round(mob.maxHealth) } : {}),
        ...(mob.elite ? { el: 1 as const } : {}),
      });
    }

    const arrows: ArrowView[] = [];
    for (const a of this.realm.mobs.arrows) {
      if (near(a.x, a.z, VIEW_MOBS)) arrows.push({ x: round(a.x), y: round(a.y), z: round(a.z), vx: round(a.vx), vy: round(a.vy), vz: round(a.vz), ...(a.bottle ? { b: 1 as const } : {}), ...(a.pearl ? { p: 1 as const } : {}), ...(a.spell ? { s: a.spell } : {}) });
    }

    const vehicles: VehicleView[] = [];
    for (const v of this.realm.vehicles.list) {
      if (near(v.x, v.z, VIEW_MOBS)) vehicles.push({ id: v.id, kind: v.kind, x: round(v.x), y: round(v.y), z: round(v.z), yaw: round(v.yaw), speed: round(v.speed), hurt: round(Math.min(v.hurt, 9.99)), rider: !!v.rider });
    }

    const fires: number[] = [];
    for (const c of this.realm.blockEntities.foods()) {
      if (!near(c.x + 0.5, c.z + 0.5, VIEW_DROPS)) continue;
      fires.push(c.x, c.y, c.z, c.slots[0] ?? 0, c.slots[1] ?? 0, c.slots[2] ?? 0, c.slots[3] ?? 0);
    }

    const drops: DropView[] = [];
    for (const d of this.realm.drops.drops) {
      if (!near(d.x, d.z, VIEW_DROPS)) continue;
      drops.push({ id: d.id, item: d.stack.id, count: d.stack.count, damage: d.stack.damage, ...(d.stack.name ? { name: d.stack.name } : {}), ...(d.stack.ench && d.stack.ench.length > 0 ? { ench: d.stack.ench } : {}), ...(d.stack.gear ? { g: d.stack.gear } : {}), x: round(d.x), y: round(d.y), z: round(d.z), age: round(d.age), phase: round(d.phase) });
    }

    const orbs: XpOrbView[] = [];
    for (const o of this.realm.xpOrbs.orbs) {
      if (near(o.x, o.z, VIEW_DROPS)) orbs.push({ id: o.id, v: o.value, x: round(o.x), y: round(o.y), z: round(o.z), age: round(o.age), phase: round(o.phase) });
    }

    const bobbers: BobberView[] = [];
    if (this.realm.fishing.bobbers.length > 0) {
      const ids = new Map<unknown, number>();
      for (const o of this.members.values()) ids.set(o.player, o.id);
      for (const f of this.realm.fishing.bobbers) {
        const owner = ids.get(f.owner);
        if (owner === undefined || !near(f.x, f.z, VIEW_MOBS)) continue;
        bobbers.push({ id: f.id, o: owner, x: round(f.x), y: round(f.y), z: round(f.z), m: bobberMode(f), ...(f.owner === p ? { own: 1 as const } : {}) });
      }
    }

    // (A real connection is sent an effect in full when it is new or has moved, and later only its id in `fxKeep`: the client plays it by itself.)
    const wire = noPlayers;
    let live = this.realm.effects.fx.filter((f) => near(f.x, f.z, wire ? VIEW_FX : VIEW_MOBS));
    if (wire && live.length > MAX_FX) live = live.sort((a, c) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 - ((c.x - b.x) ** 2 + (c.z - b.z) ** 2)).slice(0, MAX_FX);
    const fxKeep: number[] = [];
    const fx = [];
    for (const f of live) {
      const view = { ...f, x: round(f.x), y: round(f.y), z: round(f.z), age: round(f.age), ttl: round(f.ttl) };
      if (wire) {
        const at = `${view.x},${view.y},${view.z},${f.x2 ?? ''},${f.z2 ?? ''}`;
        if (m.fxSent.get(f.id) === at) {
          fxKeep.push(f.id);
          continue;
        }
        m.fxSent.set(f.id, at);
      }
      fx.push(view);
    }
    if (wire) {
      const ids = new Set(live.map((f) => f.id));
      for (const id of m.fxSent.keys()) if (!ids.has(id)) m.fxSent.delete(id);
    }
    // The signs near: the whole list, when one changed or the player has walked into another 8-block square (an empty list clears the last one).
    let signs: SignView[] | undefined;
    const signRev = this.realm.blockEntities.signRev;
    const signCell = `${Math.floor(b.x / 8)},${Math.floor(b.z / 8)}`;
    if (m.signRev !== signRev || m.signCell !== signCell) {
      const list = this.realm.signsAround(b.x, b.z, VIEW_SIGNS);
      if (list.length > 0 || m.signCount > 0) signs = list.map((s) => ({ x: s.x, y: s.y, z: s.z, l: s.lines }));
      m.signRev = signRev;
      m.signCell = signCell;
      m.signCount = list.length;
    }
    const w = this.realm.weather;
    const snap: Snapshot = {
      t: 'snap',
      tick: this.tickCount,
      ack: m.ack,
      time: this.realm.time,
      weather: { kind: w.kind, rain: round(w.rain), storm: round(w.storm), flash: round(w.flash) },
      you,
      players,
      mobs,
      arrows,
      vehicles,
      drops,
      ...(fires.length > 0 ? { fires } : {}),
      ...(signs ? { signs } : {}),
      ...(orbs.length > 0 ? { orbs } : {}),
      ...(bobbers.length > 0 ? { bobbers } : {}),
      ...(fx.length > 0 ? { fx } : {}),
      ...(fxKeep.length > 0 ? { fxKeep } : {}),
    };
    if (m.invDirty) {
      m.invDirty = false;
      snap.inv = this.inventoryView(p);
    }
    return snap;
  }

  private inventoryView(p: Player): InventoryView {
    const slots: (ItemView | null)[] = [];
    for (let i = 0; i < p.inventory.size; i++) slots.push(itemView(p.inventory.get(i)));
    let menu: MenuView | null = null;
    if (p.menu) {
      menu = {
        kind: p.menu.kind,
        slots: p.menu.slots.map((_, i) => itemView(p.menu!.stackAt(i))),
        cursor: itemView(p.menu.cursor),
        furnace: p.furnaceState(),
        trade: p.menu instanceof TradeMenu ? { profession: p.menu.villager.profession, level: p.menu.villager.level, xp: p.menu.villager.xp, offers: p.menu.villager.offers, selected: p.menu.selected } : null,
        enchant: p.menu instanceof EnchantMenu ? { shelves: p.menu.shelves } : null,
        anvil: p.menu instanceof AnvilMenu ? { cost: p.menu.cost, tooExpensive: p.menu.tooExpensive, name: p.menu.name } : null,
        grindstone: p.menu instanceof GrindstoneMenu ? { xp: p.menu.xp } : null,
        craft: p.menu instanceof CraftingMenu ? { forging: p.menu.forging ? { duration: p.menu.forging.duration, sets: p.menu.forging.sets } : null, made: p.menu.hasMade } : null,
      };
    }
    return { slots, bags: p.bags.slots.map((s) => itemView(s)), armor: p.armor.slots.map((s) => itemView(s)), menu };
  }

  /** The players' sessions, for tests. */
  player(id: number): Player | undefined {
    return this.members.get(id)?.player;
  }
}
