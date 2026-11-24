import { B, BLOCKS, FALLS, IS_LEAVES, IS_LOG, SOUL_WARD_HEIGHT, SOUL_WARD_RADIUS, chestId, chestInfo, chestPartnerPos, doorId, doorInfo, doorKind, isAnvil, isChest, signInfo } from './blocks';
import { WORLD_HEIGHT } from './chunk';
import { LOOT_TABLES, positionRand, rollChest, spawnerKind } from './loot';
import { PLAYER_HEIGHT, PLAYER_WIDTH, bodyOverlapsBlock, type Body, type Solid } from './physics';
import { mobSolid, mobTouch } from './mobSolids';
import { BlockEntities } from './blockEntities';
import { DAY_LENGTH_SECONDS, daylightAt } from './daylight';
import { DropWorld, type DropCollector } from './dropEntities';
import { XpOrbWorld } from './xpOrbs';
import { BOBBER_LEASH, FishingWorld, type FishingEvents } from './fishing';
import type { WorldAccess } from './headlessWorld';
import type { LandService } from './landService';
import { BOTTLE_XP_MAX, BOTTLE_XP_MIN, blockDrops, getItem, toolId } from './items';
import { makeStack, type ItemStack } from './inventory';
import { ChestMenu } from './menu';
import { EffectField } from './abilityEffects';
import { MobManager, MobSpawner, type Mob, type MobEvents, type MobFx, type MobKind, type MobPlayer } from './mobs';
import { hash2 } from './noise';
import type { Player } from './player';
import { Parties } from './party';
import { AuctionHouse, type TokenDesk } from './auction';
import { StashVault } from './stash';
import { bagDrop } from './bags';
import { skillBookDrop } from './skillbooks';
import { gearDrop, pickRarity, randomGear, type GearRoll } from './gear';
import { randomHollowKingRelic } from './hollowKing';
import { tooltipName } from './tooltip';
import type { DungeonView } from './dungeonView';
import { BossBrain, type BossArenaDef, type BossTarget, type BossView, type BossWorld } from './boss';
import { jewelDrop, jewelKind } from './jewels';
import type { DummyStation, NpcStation } from './quests';
import { canStayAt } from './plants';
import { isRail, railRemoved } from './rails';
import { VEHICLE_ITEM, VehicleWorld, type Vehicle, type VehicleKind } from './vehicles';
import { FluidSim, isFluid } from './fluids';
import { InvasionDirector, whereIs, type InvasionHost, type InvasionView } from './invasion';
import { RIFT_GRADE_DEFS, RiftDirector, compass, type RiftGrade, type RiftHost, type RiftPlayer, type RiftView } from './rift';
import { randomEnchantedBook } from './enchant';
import { FireSim } from './fire';
import { RedstoneSim } from './redstone';
import type { SessionEvent } from './sessionProtocol';
import type { WorldState } from './save';
import { Weather } from './weather';
import { folkFromJSON, folkToJSON, makeRecord, professionFor, villagerVariant, type VillagerRecord } from './villagerFolk';
import { restock } from './trading';
import { SAFE_BUFFER, WorldGenerator } from './worldgen';

/** How many steps (through leaves) from a log a leaf still counts as part of its tree. */
const LEAF_REACH = 7;
/** The most leaves one felled log sets falling (a very big tree gets the rest on the next cut), and how many go in one tick. */
const LEAF_BATCH = 1500;
const LEAF_PER_TICK = 24;
const NEIGHBOURS: [number, number, number][] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const DIAMOND_PICK = getItem(toolId('pickaxe', 'diamond')).tool;

/** Ranges beyond which nobody hears a mob or an explosion. */
const MOB_HEARING = 26;
const BLAST_HEARING = 40;

/** The night, as a share of the day: beds can be used from dusk until just before dawn. */
/** What a player picked up off the ground during one update (merged per kind of item): for the pickup feed. */
interface PickedUp {
  id: number;
  count: number;
  name?: string;
  ench?: [number, number][];
  gear?: GearRoll;
}

export const NIGHT_START = 12542 / 24000;
export const NIGHT_END = 23459 / 24000;
/** Seconds all players must lie in bed for the night to be skipped. */
export const SLEEP_SKIP_SECONDS = 5;
/** A village's people come to life when a player is this close, and go back to being records when everyone is farther than FOLK_LEAVE. */
export const FOLK_NEAR = 72;
/** Experience from a mob's death or a breaking bottle goes to the nearest player this close. */
export const XP_AWARD_RANGE = 48;
export const FOLK_LEAVE = 100;
/** How far a quest giver may be from their station before they are put back. */
export const NPC_LEASH = 2.5;
/** A mob a player killed counts towards the quests of every player this close to where it died. Party experience uses the same reach. */
export const KILL_CREDIT_RANGE = 40;
/** Each party member near a kill receives the experience times this (a fifth more than killing it alone). */
export const PARTY_XP = 1.2;
/** The villagers restock at dawn and again in the afternoon, as the original's (up to) twice a day. */
const RESTOCK_AFTERNOON = 0.3;
/** How far ordinary sounds and particles carry. */
export const NEAR_RANGE = 48;
/** The cells (8 blocks a side) of the soul lantern scan that are looked at in a tick, at least (see `Realm.scanWards`). */
const WARD_CELLS_PER_TICK = 768;
/** How far the sounds of footsteps, jumps and landings carry (they are quiet: at 48 blocks nobody hears them, and in a crowd they were most of what the server sent). */
export const STEP_RANGE = 16;
/** The most such sounds a player is told of in a tick (their own do not count): in a crowd the rest would only be noise. */
export const STEP_SOUNDS_PER_TICK = 6;
/** Fire burns, spreads and dies only this close to a player (blocks). */
export const FIRE_RANGE = 96;
/** Chance that an anvil is chipped (or broken, when damaged) by landing after a fall. */
export const ANVIL_LANDING_WEAR = 0.05;
/** A lit block of TNT blows up after this many seconds, with this radius (a creeper's is 3). */
export const TNT_FUSE = 4;
export const TNT_RADIUS = 4;

/**
 * What lets a player into a dungeon with a key bought with $SOLRIFT instead of the dungeon's own item (see `TokenService.takeKey`). The
 * realm only asks; whose key it is, and whether they may use one (a signed-in wallet in honest play), is the server's.
 */
export interface KeyDesk {
  /** May this player use a bought key at all (signed in with a wallet, honest play)? */
  allowed(player: Player): boolean;
  /** Does this player have one to use? */
  has(player: Player): boolean;
  /** Use one up. Returns how many are left, or -1 when there was none. */
  take(player: Player): number;
}

export interface RealmOptions {
  seed: number;
  world: WorldAccess;
  /** Defaults to a generator for `seed`. */
  generator?: WorldGenerator;
  /** Natural mob spawning. Tests that want a quiet world turn it off. */
  naturalSpawning?: boolean;
  /** The villages' people (default: whatever `naturalSpawning` is). */
  villagers?: boolean;
  /** Rifts: now and then a tear opens near the players and waves of monsters come out of it (see rift.ts). Off by default; the game and the server turn it on. */
  rifts?: boolean;
  /** The Gilded Tide: an invasion every half hour by the wall clock (see invasion.ts). Off by default; the game and the server turn it on. */
  invasions?: boolean;
  /** The wall clock the invasions keep (milliseconds since 1970; default `Date.now`). Tests inject their own. */
  clock?: () => number;
  /** Random source for everything the simulation does by chance. Inject a seeded one in tests. */
  rand?: () => number;
  /**
   * Can players sleep through the night? On by default (single player). The multiplayer server turns it
   * off: one shared clock must not be skipped by whoever lies down, so a bed there only sets your
   * respawn point.
   */
  sleeping?: boolean;
  /**
   * Does the Auction House put up stock of its own? On by default (single player has no other sellers); the multiplayer server turns
   * it off, so that everything on its shelves is something a player put there.
   */
  auctionStock?: boolean;
}

/**
 * The part of the game that all players share: blocks, mobs, dropped items, weather, chests and the
 * day clock. A `Player` lives in a realm. Single-player is one realm with one player; the server runs
 * one realm with many.
 */
export class Realm {
  readonly seed: number;
  readonly world: WorldAccess;
  readonly generator: WorldGenerator;
  readonly rand: () => number;
  /** The land of this world (claims and what was changed), when it has one: the server's rooms do. Set by whoever owns the realm. */
  land: LandService | null = null;
  /** How to write a player's save as it is now, so a purchase can be stored in the same transaction as the Auren it took (set by the room with the land). */
  landSave: ((p: Player) => [key: string, value: unknown] | null) | null = null;

  readonly blockEntities = new BlockEntities();
  /** The mobs (made in the constructor, from the realm's own dice: a seeded realm must roll the same for them as for everything else). */
  readonly mobs: MobManager;
  readonly spawner = new MobSpawner();
  /** Flowing water and lava. Anything that changes a block next to a fluid calls `fluids.notify`. */
  readonly fluids: FluidSim;
  /** Fire: it spreads over what burns, eats it and goes out (see fire.ts). */
  readonly fire: FireSim;
  /** Redstone: dust, levers, buttons, plates, torches and what they switch (see redstone.ts). */
  readonly redstone: RedstoneSim;
  readonly weather: Weather;
  readonly drops: DropWorld;
  /** The experience orbs about (see xpOrbs.ts). */
  readonly xpOrbs: XpOrbWorld;
  /** The bobbers of the fishing rods that are out (see fishing.ts). */
  readonly fishing: FishingWorld;
  private readonly fishingEvents: FishingEvents = {
    splash: (b) => this.emitNear(b.x, b.y, b.z, { t: 'fish', what: 'splash', x: b.x, y: b.y, z: b.z }, 40),
    lured: (b) => this.emitNear(b.x, b.y, b.z, { t: 'fish', what: 'lure', x: b.x, y: b.y, z: b.z }, 40),
    bite: (b) => this.emitNear(b.x, b.y, b.z, { t: 'fish', what: 'bite', x: b.x, y: b.y, z: b.z }, 40),
    escaped: (b) => this.emitNear(b.x, b.y, b.z, { t: 'fish', what: 'escape', x: b.x, y: b.y, z: b.z }, 40),
    dry: (b) => (b.owner as Player).emit({ t: 'toast', text: 'You can only fish in water.' }),
  };
  /** Minecarts and boats. */
  readonly vehicles: VehicleWorld;
  /** Vehicles from a save, waiting for their chunk (a cart needs its rail to be there). */
  private pendingVehicles: { kind: VehicleKind; x: number; y: number; z: number; yaw: number; wait: number }[] = [];
  readonly players: Player[] = [];
  /** Groups of up to four that share a dungeon. */
  readonly parties = new Parties(this);
  /** The Auction House of Dawnwatch: every auction and every letter owed (see auction.ts). */
  readonly auctions = new AuctionHouse();
  /** What lets a player into a dungeon with a bought key (set by a server that has a token; null: the dungeon's own item only). */
  keyDesk: KeyDesk | null = null;
  /** The wall clock (ms): what the day's bounties are cut by. A server (or a test) may set its own. */
  clock: () => number = Date.now;
  /** What lets players trade in $SOLRIFT at the Auction House (set by a server that has a token; null: Auren only). */
  tokenDesk: TokenDesk | null = null;
  /** The stashes of the wallets that play here (see stash.ts): shared by a wallet's characters, never by other players. */
  readonly stashes = new StashVault();
  private readonly auctionStock: boolean;
  private auctionTimer = 0;
  private stockState = 0;
  private readonly stockRand = (): number => {
    this.stockState = (Math.imul(this.stockState, 1664525) + 1013904223) >>> 0;
    return this.stockState / 4294967296;
  };
  readonly mobEvents: MobEvents;
  /** What class abilities leave behind (pending hits, traps) and the marks players are shown. */
  readonly effects = new EffectField();

  /** Day phase: 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. */
  time = 0.2;
  naturalSpawning: boolean;
  villagers: boolean;
  /** The rifts of this world (null: none). */
  readonly rifts: RiftDirector | null;
  /** The Gilded Tide of this world (null: none). */
  readonly invasions: InvasionDirector | null;
  /** False on a shared server: beds are respawn points only and nobody can skip the night. */
  readonly allowSleep: boolean;

  private cropTimer = 0;
  /** Sand and gravel that lost their support and are about to drop one block. */
  private falling: { x: number; y: number; z: number; t: number; dist: number }[] = [];
  /** TNT with a burning fuse: where, and seconds left. */
  private lit: { x: number; y: number; z: number; t: number }[] = [];
  /** Leaves of a felled tree, waiting to fall away one by one. */
  private fading: { x: number; y: number; z: number; t: number; drops: boolean }[] = [];
  private spawnerScan = 0;
  /** The soul lanterns found around the players (rescanned now and then), whose ward keeps monsters off. */
  private wards: { x: number; y: number; z: number }[] = [];
  private wardScan = 99;
  /** How many footsteps, jumps and landings of others each player has been told of in this tick (see emitNear). */
  private stepHeard = new Map<Player, number>();
  /** The scan that is going on (see `scanWards`): the cells still to look at, how far it has come and what it has found. */
  private wardCells: number[] = [];
  private wardNext = 0;
  private wardFound = new Map<string, { x: number; y: number; z: number }>();
  private wardBusy = false;
  private spawnerClock = 0;
  /** When each monster spawner may next produce mobs (realm seconds). */
  private spawnerReady = new Map<string, number>();
  /** The villagers of every village a player has come near, by village (x,z). */
  readonly folk = new Map<string, VillagerRecord[]>();
  /** Counts the restocks: once at dawn and once in the afternoon of every day. */
  restockEpoch = 0;
  private prevTime = 0.2;
  private folkTimer = 0;
  /** The world's quest givers (Adventure), the mobs standing in for the ones near a player, and a timer. */
  private readonly stations: readonly NpcStation[];
  private readonly npcMobs = new Map<number, Mob>();
  private npcTimer = 1;
  /** The training dummies of the world, the mobs standing in for the ones near a player, and a timer. */
  private readonly dummySpots: readonly DummyStation[];
  private readonly dummyMobs = new Map<number, Mob>();
  private dummyTimer = 1;
  /** How many players have started here so far: the n-th one starts on the n-th spawn spot. */
  private arrivals = 0;

  constructor(opts: RealmOptions) {
    this.seed = opts.seed;
    this.world = opts.world;
    this.generator = opts.generator ?? new WorldGenerator(opts.seed);
    this.stations = this.generator.npcStations();
    this.dummySpots = this.generator.dummyStations();
    this.rand = opts.rand ?? Math.random;
    this.mobs = new MobManager(this.rand);
    this.naturalSpawning = opts.naturalSpawning ?? true;
    this.villagers = opts.villagers ?? this.naturalSpawning;
    this.rifts = opts.rifts ? new RiftDirector(this.riftHost(), opts.seed) : null;
    this.invasions = opts.invasions ? new InvasionDirector(this.invasionHost(opts.clock ?? Date.now), opts.seed) : null;
    this.allowSleep = opts.sleeping ?? true;
    this.auctionStock = opts.auctionStock ?? true;
    this.stockState = (opts.seed ^ 0x5eed1e55) >>> 0;
    // An account that is in the game is told when what it put up sells, ends or is outbid.
    this.auctions.notify = (owner, text) => {
      for (const p of this.players) if (p.account === owner) p.emit({ t: 'toast', text });
    };
    this.weather = new Weather(this.rand);
    this.fluids = new FluidSim({
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => this.world.setBlock(x, y, z, id),
      washAway: (x, y, z, id) => {
        this.emitNear(x, y, z, { t: 'burst', id, x, y, z, count: 6 });
        for (const s of this.takeBlock(x, y, z, id)) this.drops.spawnAtBlock(s, x, y, z);
        for (const d of blockDrops(BLOCKS[id], null, this.rand)) this.drops.spawnAtBlock(makeStack(d.id, d.count), x, y, z);
      },
      hiss: (x, y, z) => this.emitNear(x, y, z, { t: 'splash', vol: 0.5 }),
      isProtected: (x, y, z) => this.isProtected(x, y, z),
      // Water and lava do not run from the wild into somebody's land.
      crossBlocked: (fx, fy, fz, x, y, z) => this.land?.fluidBlocked(fx, fy, fz, x, y, z) ?? false,
    });
    this.fire = new FireSim({
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      // Flames do not start in a protected place, and what is there does not burn (so neither does it need to be put out).
      setBlock: (x, y, z, id) => (id === B.FIRE && this.isGriefProof(x, y, z) ? false : this.world.setBlock(x, y, z, id)),
      consume: (x, y, z) => {
        if (this.isGriefProof(x, y, z)) return;
        const id = this.world.getBlock(x, y, z);
        if (id === B.TNT) this.primeTnt(x, y, z, 0.2);
        this.world.setBlock(x, y, z, B.AIR);
        for (const s of this.takeBlock(x, y, z, id)) this.drops.spawnAtBlock(s, x, y, z);
        this.emitNear(x, y, z, { t: 'burst', id, x, y, z, count: 8 });
        this.settleAround(x, y, z, false);
        if (IS_LOG[id]) this.treeCut(x, y, z, true);
      },
      rainsOn: (x, y, z) => this.weather.kind !== 'clear' && y > this.world.surfaceY(x, z),
      active: (x, y, z) => this.players.some((p) => !p.spectating && Math.hypot(p.body.x - x, p.body.z - z) < FIRE_RANGE),
      sound: (x, y, z, kind) => this.emitNear(x, y, z, { t: 'fire', kind, vol: kind === 'hiss' ? 0.6 : 0.5 }, 32),
      rand: () => this.rand(),
    });
    this.redstone = new RedstoneSim({
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => this.world.setBlock(x, y, z, id),
      door: (x, y, z, open) => {
        this.setDoor(x, y, z, open);
      },
      tnt: (x, y, z) => this.primeTnt(x, y, z),
      entities: () => this.pressers(),
      sound: (x, y, z, kind) => {
        if (kind === 'click') this.emitNear(x, y, z, { t: 'sound', sound: 'stone', action: 'place', vol: 0.5 });
        else this.emitNear(x, y, z, { t: 'fire', kind: 'hiss', vol: 0.5 }, 24);
      },
    });
    this.drops = new DropWorld((x, y, z) => this.world.getBlock(x, y, z), this.rand);
    this.xpOrbs = new XpOrbWorld((x, y, z) => this.world.getBlock(x, y, z), this.rand);
    this.fishing = new FishingWorld((x, y, z) => this.world.getBlock(x, y, z), this.rand, () => this.mobs.mobs);

    this.vehicles = new VehicleWorld(this.world.physicsReader);
    this.blockEntities.loot = (x, y, z) => {
      const name = this.generator.lootAt(x, y, z);
      return name ? rollChest(LOOT_TABLES[name], positionRand(this.seed, x, y, z)) : null;
    };

    this.mobEvents = {
      hurtPlayer: (amount, kx, kz, source, target, effect) => {
        const p = (target?.ref as Player | undefined) ?? this.players[0];
        p?.hurtByMob(amount, kx, kz, source, effect);
      },
      afflict: (target, effect, seconds, power) => {
        const p = target.ref as Player | undefined;
        p?.afflict(effect, seconds, power);
      },
      // The ground fire of a fireball: only where fire may burn (not in a protected place, and it needs floor or fuel).
      ignite: (x, y, z) => this.fire.ignite(x, y, z),
      fx: (kind, x, y, z, x2, y2, z2) => this.deepFx(kind, x, y, z, x2, y2, z2),
      explode: (x, y, z, radius, source) => this.explode(x, y, z, radius, source),
      sound: (sound, mob) => {
        for (const p of this.players) {
          const b = p.body;
          const d = Math.hypot(mob.body.x - b.x, mob.body.y - b.y, mob.body.z - b.z);
          const vol = Math.max(0, 1 - d / MOB_HEARING);
          if (vol > 0) p.emit({ t: 'mob', kind: mob.kind, sound, vol, x: mob.body.x, y: mob.body.y, z: mob.body.z });
        }
      },
      drop: (d, x, y, z, owner) => {
        const a = this.rand() * Math.PI * 2;
        this.drops.spawn(makeStack(d.id, d.count), x, y, z, Math.cos(a) * 1.2, 3, Math.sin(a) * 1.2, 0.5, owner, this.shareKill(owner));
      },
      xp: (amount, x, y, z, owner) => this.awardXp(amount, x, y, z, owner),
      coins: (amount, x, y, z, owner) => {
        const who = owner != null ? this.players.find((p) => p === owner) : this.nearestPlayer(x, y, z);
        who?.addCoins(amount, true);
      },
      // A monster may leave a skill book (any of the twelve, for any class, known or not) and, separately, a bag and a jewel.
      loot: (mob, x, y, z) => {
        const owner = mob.killedBy ?? undefined;
        for (const found of [skillBookDrop(mob.kind, this.rand), bagDrop(mob.kind, this.rand), jewelDrop(mob.kind, this.rand)]) {
          if (found === null) continue;
          const a = this.rand() * Math.PI * 2;
          this.drops.spawn(makeStack(found, 1), x, y, z, Math.cos(a) * 1.2, 3, Math.sin(a) * 1.2, 0.5, owner, this.shareKill(owner));
          // A jewel has a sound of its own. A kill's jewel is heard by the player it belongs to, and by their party when they share it.
          const jewel = jewelKind(found);
          if (jewel) {
            const hear = owner != null ? this.players.filter((p) => this.maySeeDrop(p, owner, this.shareKill(owner))) : this.players;
            for (const p of hear) {
              const vol = Math.max(0, 1 - Math.hypot(x - p.body.x, y - p.body.y, z - p.body.z) / MOB_HEARING);
              if (vol > 0) p.emit({ t: 'jewelDrop', kind: jewel, vol });
            }
          }
        }
        if (mob.def.boss) this.bossLoot(mob, x, y, z);
        if (mob.elite) this.eliteLoot(x, y, z, owner);
        // ...and sometimes a piece of gear with a rarity, a level and bonus stats (see gear.ts).
        const piece = gearDrop(mob.kind, this.rand);
        if (piece) {
          const a = this.rand() * Math.PI * 2;
          this.drops.spawn(piece, x, y, z, Math.cos(a) * 1.2, 3, Math.sin(a) * 1.2, 0.5, owner, this.shareKill(owner));
        }
      },
      // A kill counts for every player nearby (a party shares its kills, as in the old MMOs).
      killed: (mob) => {
        for (const p of this.players) {
          if (p.screen === 'dead' || p.spectating) continue;
          if (Math.hypot(p.body.x - mob.body.x, p.body.z - mob.body.z) > KILL_CREDIT_RANGE) continue;
          if (p.quests) {
            p.questEvent({ t: 'kill', mob: mob.kind });
            p.questKill(mob.kind, this.rand);
          }
          p.achKill(mob);
        }
        if (this.rifts && mob.rift !== 0) {
          this.rifts.onKill(mob, this.riftPlayers().filter((q) => Math.hypot(q.x - mob.body.x, q.z - mob.body.z) <= KILL_CREDIT_RANGE));
        }
      },
      pearl: (x, y, z, owner) => {
        const p = this.players.find((q) => q === owner);
        if (p) p.pearlLand(x, y, z);
      },
      shatter: (x, y, z) => {
        this.awardXp(BOTTLE_XP_MIN + Math.floor(this.rand() * (BOTTLE_XP_MAX - BOTTLE_XP_MIN + 1)), x, y, z);
        this.emitNear(x, y, z, { t: 'sound', sound: 'glass', action: 'break', vol: 0.8 });
        this.emitNear(x, y, z, { t: 'burst', id: B.GLASS, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), count: 10 });
      },
      door: (x, y, z, open) => this.setDoor(x, y, z, open),
    };
  }

  /** 0 (night) .. 1 (full day), including storm darkness and lightning. */
  get daylight(): number {
    return daylightAt(this.time, this.weather.darkness, this.weather.flash);
  }

  /** Beds work at night and during thunderstorms (the original's tick 12542..23459 of its 24000-tick day). */
  get canSleep(): boolean {
    const t = this.time;
    return this.weather.kind === 'thunder' || (t >= NIGHT_START && t <= NIGHT_END);
  }

  /** Once every player in the world has been in bed long enough, it is morning and the weather clears. */
  private skipNightIfAllAsleep(): void {
    if (!this.allowSleep) return;
    let sleepers = 0;
    for (const p of this.players) {
      if (p.spectating || p.screen === 'dead') continue;
      if (!p.sleeping || p.sleepTime < SLEEP_SKIP_SECONDS) return;
      sleepers++;
    }
    if (sleepers === 0) return;
    this.time = 0;
    if (this.weather.kind !== 'clear') this.weather.set('clear');
  }

  emitAll(e: SessionEvent): void {
    for (const p of this.players) p.emit(e);
  }

  /**
   * Tell the players who are close enough to notice something at a place. Sounds get quieter with
   * distance; beyond `range` nobody hears or sees it.
   */
  emitNear(x: number, y: number, z: number, e: SessionEvent, range = NEAR_RANGE): void {
    // Footsteps, jumps and landings carry only a little way, and a player hears just a few of them in a tick (their own always): with a crowd
    // in one place every step went to everyone, a hundred and more sounds each tick for each player.
    const quiet = e.t === 'sound' && (e.action === 'step' || e.action === 'jump' || e.action === 'land');
    if (quiet) range = Math.min(range, STEP_RANGE);
    for (const p of this.players) {
      const d = Math.hypot(p.body.x - x, p.body.y - y, p.body.z - z);
      if (d > range) continue;
      if (quiet && d > 1.5) {
        const heard = this.stepHeard.get(p) ?? 0;
        if (heard >= STEP_SOUNDS_PER_TICK) continue;
        this.stepHeard.set(p, heard + 1);
      }
      if (e.t === 'sound' || e.t === 'splash' || e.t === 'mob' || e.t === 'shield' || e.t === 'fire' || e.t === 'spell') {
        const f = d <= 8 ? 1 : Math.max(0, 1 - (d - 8) / (range - 8));
        if (f <= 0) continue;
        // Where it came from goes along with a sound, so the listener can hear which side it is on.
        p.emit(e.t === 'sound' ? { ...e, vol: e.vol * f, x, y, z } : { ...e, vol: e.vol * f });
      } else {
        p.emit(e);
      }
    }
  }

  // ---- the shared simulation ----------------------------------------------

  /**
   * Advance everything that is not a player by `dt`: chests and furnaces, weather, crops, drops,
   * mobs and natural spawning. `active` are the players whose simulation is running.
   */
  update(dt: number, active: readonly Player[]): void {
    // (the tick's steps were heard before this: a new count)
    this.stepHeard.clear();
    this.skipNightIfAllAsleep();
    this.parties.update(dt);
    this.parties.sync();
    this.auctionTimer += dt;
    if (this.auctionTimer >= 1) {
      this.auctionTimer = 0;
      this.auctions.update();
      // (the house has dice of its own: what it puts up must not change what the seeded simulation rolls)
      if (this.auctionStock && this.generator.kind === 'adventure') this.auctions.restock(this.stockRand);
    }
    if (this.generator.instanceCount() > 0) this.updateCopies(dt);
    this.countRestocks();
    this.blockEntities.tick(dt);
    this.blockEntities.tickCampfires(dt, (x, y, z) => this.world.getBlock(x, y, z), (stack, x, y, z) => {
      const a = this.rand() * Math.PI * 2;
      this.drops.spawn(stack, x + 0.5, y + 0.45, z + 0.5, Math.cos(a) * 0.6, 2.4, Math.sin(a) * 0.6, 0.3);
    });
    const thunder = this.weather.update(dt);
    if (thunder > 0) this.emitAll({ t: 'thunder', distance: this.rand() });
    this.cropTimer += dt;
    if (this.cropTimer >= 2) {
      this.world.growCrops(this.cropTimer, this.rand, (x, y, z) => this.fire.adopt(x, y, z));
      this.cropTimer = 0;
    }
    this.fluids.update(dt);
    this.fire.update(dt);
    this.redstone.update(dt);
    this.updateTnt(dt);
    this.updateLeafDecay(dt);
    this.updateVehicles(dt, active);

    const collectors: (DropCollector & { player: Player; got: Map<string, PickedUp> })[] = active.map((p) => {
      const dead = p.screen === 'dead' || p.spectating;
      const got = new Map<string, PickedUp>();
      return {
        player: p,
        got,
        x: p.body.x,
        y: p.body.y,
        z: p.body.z,
        ref: p,
        sharesWith: (owner) => this.maySeeDrop(p, owner, true),
        canFit: (s) => !dead && p.inventory.canFit(s),
        collect: (s) => {
          if (dead) return s;
          // What is actually taken (the bag may only have room for part of it) is what the pickup feed shows.
          const before = s.count;
          const { id, name, ench, gear } = s;
          const left = p.inventory.collect(s);
          const taken = before - (left?.count ?? 0);
          if (taken > 0) {
            const jewel = jewelKind(id);
            if (jewel) p.emit({ t: 'jewelDrop', kind: jewel, vol: 1 });
            const key = `${id}|${name ?? ''}|${ench ? JSON.stringify(ench) : ''}|${gear ? JSON.stringify(gear) : ''}`;
            const seen = got.get(key);
            if (seen) seen.count += taken;
            else got.set(key, { id, count: taken, ...(name ? { name } : {}), ...(ench && ench.length > 0 ? { ench: ench.map(([a, b]) => [a, b] as [number, number]) } : {}), ...(gear ? { gear } : {}) });
          }
          return left;
        },
        picked: 0,
      };
    });
    this.drops.updateMany(dt, collectors);
    this.xpOrbs.update(
      dt,
      active.map((p) => ({ x: p.body.x, y: p.body.y, z: p.body.z, ref: p, alive: p.screen !== 'dead' && !p.spectating, take: (v: number) => p.addXp(v, true) })),
    );
    this.fishing.update(dt, {
      rain: this.weather.rain,
      events: this.fishingEvents,
      valid: (owner) => (owner as Player).keepsLine(this.fishing.of(owner), BOBBER_LEASH),
    });
    for (const c of collectors) {
      if (c.picked > 0) {
        c.player.emit({ t: 'pop' });
        // One line per kind of thing picked up, with how many the bag holds now.
        for (const g of c.got.values()) c.player.emit({ t: 'pickup', id: g.id, count: g.count, total: c.player.inventory.countOf(g.id), ...(g.name ? { name: g.name } : {}), ...(g.ench ? { ench: g.ench } : {}), ...(g.gear ? { gear: g.gear } : {}) });
        c.player.emit({ t: 'inv' });
      }
    }

    const view: MobPlayer[] = active.map((p) => ({
      x: p.body.x,
      y: p.body.y,
      z: p.body.z,
      alive: !p.vitals.dead && !p.spectating,
      invulnerable: p.mode === 'creative' || p.spectating,
      yaw: p.yaw,
      pitch: p.pitch,
      ref: p,
    }));
    if (view.length === 0) return;
    this.updateFalling(dt);
    this.scanWards(dt, view);
    const daylight = this.daylight;
    this.mobs.update(
      dt,
      { world: this.world.physicsReader, player: view[0], players: view, daylight, rand: this.rand, safe: (x, z) => this.generator.safeFromMonsters(x, z), ward: (x, y, z) => this.wardAt(x, y, z) },
      this.mobEvents,
    );
    this.effects.update(dt, this.mobs);
    for (const brain of this.bosses.values()) brain.update(dt);
    if (this.naturalSpawning) {
      const living = view.filter((v) => (v.ref as Player).screen !== 'dead' && !(v.ref as Player).spectating);
      if (living.length > 0) {
        this.spawner.update(dt, this.mobs, {
          world: this.world.physicsReader,
          player: living[0],
          players: living,
          daylight,
          rand: this.rand,
          slimeChunk: (cx, cz) => hash2(this.seed ^ 0x51ee, cx, cz) < 0.1,
          quiet: (p) => this.generator.instanceAt(p.x, p.z) >= 0,
          wildlife: (x, z) => this.generator.wildlifeAt(x, z),
          noMonsters: (x, z, y) => this.generator.safeFromMonsters(x, z, SAFE_BUFFER) || this.wardAt(x, y, z, 2) !== null,
        });
        this.updateSpawners(dt, living);
      }
    }
    if (this.villagers) {
      const living = view.filter((v) => (v.ref as Player).screen !== 'dead' && !(v.ref as Player).spectating);
      if (living.length > 0) this.updateVillagers(dt, living);
    }
    this.rifts?.update(dt);
    this.invasions?.update(dt);
    if (this.stations.length > 0) this.updateNpcs(dt, view);
    if (this.dummySpots.length > 0) this.updateDummies(dt, view);
  }

  /**
   * Keep the training dummies standing: bring each to life when a player comes near and put it away when everybody
   * has gone (they are never saved). A dummy that has been thrown across the yard is put back on its spot a moment
   * after its last hit, so a test can go on.
   */
  private updateDummies(dt: number, players: readonly MobPlayer[]): void {
    this.dummyTimer += dt;
    if (this.dummyTimer < 0.5) return;
    this.dummyTimer = 0;
    for (const st of this.dummySpots) {
      const have = this.dummyMobs.get(st.index);
      let nearest = Infinity;
      for (const p of players) nearest = Math.min(nearest, Math.hypot(p.x - st.x, p.z - st.z));
      if (have) {
        const gone = have.dead || !this.mobs.mobs.includes(have);
        if (gone || nearest > FOLK_LEAVE) {
          this.dummyMobs.delete(st.index);
          const i = this.mobs.mobs.indexOf(have);
          if (i >= 0) this.mobs.mobs.splice(i, 1);
        } else if (have.sincePlayerHit > 1.2 && (Math.hypot(have.body.x - st.x, have.body.z - st.z) > 0.05 || Math.abs(have.body.y - st.y) > 0.5)) {
          have.body.x = st.x;
          have.body.y = st.y;
          have.body.z = st.z;
          have.body.vx = have.body.vy = have.body.vz = 0;
        }
        continue;
      }
      if (nearest > FOLK_NEAR) continue;
      const x = Math.floor(st.x);
      const y = Math.floor(st.y);
      const z = Math.floor(st.z);
      if (!BLOCKS[this.world.getBlock(x, y - 1, z)].solid || BLOCKS[this.world.getBlock(x, y, z)].solid) continue;
      const m = this.mobs.spawn('dummy', st.x, st.y, st.z, { variant: st.index });
      m.homeYaw = st.yaw;
      m.yaw = st.yaw;
      this.dummyMobs.set(st.index, m);
    }
  }

  // ---- experience ------------------------------------------------------------

  /**
   * Experience that comes of something happening at a place (a mob dying, a bottle breaking, an ore) comes out as orbs there.
   * A kill's orbs (`owner`) drift only to that player. A party kill gives each living member within `KILL_CREDIT_RANGE`
   * their own orbs, worth `PARTY_XP` times as much. Anything else drifts to whoever comes near, and is taken on touch.
   */
  awardXp(amount: number, x: number, y: number, z: number, owner?: unknown): void {
    const killer = owner != null ? this.players.find((p) => p === owner) : undefined;
    const party = killer ? this.parties.partyOf(killer) : null;
    if (!killer || !party || party.members.length < 2) {
      this.xpOrbs.spawn(amount, x, y, z, owner);
      return;
    }
    const bonus = Math.ceil(amount * PARTY_XP);
    for (const m of party.members) {
      if (m.screen === 'dead' || m.spectating) continue;
      if (m !== killer && Math.hypot(m.body.x - x, m.body.z - z) > KILL_CREDIT_RANGE) continue;
      this.xpOrbs.spawn(bonus, x, y, z, m);
    }
  }

  /** True when this kill's loot should be open to the killer's party. Personal boss rewards stay with the one they were rolled for. */
  private shareKill(owner: unknown): boolean {
    const p = owner != null ? this.players.find((q) => q === owner) : undefined;
    const party = p ? this.parties.partyOf(p) : null;
    return !!party && party.members.length >= 2;
  }

  /** Whether `viewer` is shown a drop or orb. Shared kill loot is also shown to the owner's current party. */
  maySeeDrop(viewer: Player, owner: unknown, share = false): boolean {
    if (owner == null || owner === viewer) return true;
    if (!share) return false;
    const party = this.parties.partyOf(viewer);
    return !!party && party.members.includes(owner as Player);
  }

  /** The nearest living player within XP_AWARD_RANGE blocks of a place (who a kill pays out to), if any. */
  private nearestPlayer(x: number, y: number, z: number): Player | null {
    let best: Player | null = null;
    let bestD = XP_AWARD_RANGE;
    for (const p of this.players) {
      if (p.screen === 'dead' || p.spectating) continue;
      const d = Math.hypot(p.body.x - x, p.body.y - y, p.body.z - z);
      if (d <= bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  // ---- quest givers ----------------------------------------------------------

  /** Where the n-th player to join starts (one spot for all in an ordinary world; see `WorldGenerator.spawnFor`). */
  nextSpawn(): { x: number; y: number; z: number } {
    return this.generator.spawnFor(this.arrivals++);
  }

  /** Where a brand-new character starts (the Adventure world puts them in the cave under the village; deaths still use `nextSpawn`). */
  nextStart(): { x: number; y: number; z: number } {
    return this.generator.startFor(this.arrivals++);
  }

  /**
   * Keep the world's quest givers standing where they belong: bring each to life when a player comes
   * near and put it away when everybody has gone, like a village's people (but they are never saved).
   */
  private updateNpcs(dt: number, players: readonly MobPlayer[]): void {
    this.npcTimer += dt;
    if (this.npcTimer < 1) return;
    this.npcTimer = 0;
    for (const st of this.stations) {
      const key = st.key ?? st.index;
      const have = this.npcMobs.get(key);
      let nearest = Infinity;
      for (const p of players) nearest = Math.min(nearest, Math.hypot(p.x - st.x, p.z - st.z));
      if (have) {
        const gone = have.dead || !this.mobs.mobs.includes(have);
        if (gone || nearest > FOLK_LEAVE) {
          this.npcMobs.delete(key);
          const i = this.mobs.mobs.indexOf(have);
          if (i >= 0) this.mobs.mobs.splice(i, 1);
        } else {
          this.leashNpc(st, have);
        }
        continue;
      }
      if (nearest > FOLK_NEAR) continue;
      // Wait for the ground: a chunk that has not arrived yet reads as air.
      const x = Math.floor(st.x);
      const y = Math.floor(st.y);
      const z = Math.floor(st.z);
      if (!BLOCKS[this.world.getBlock(x, y - 1, z)].solid || BLOCKS[this.world.getBlock(x, y, z)].solid) continue;
      const m = this.mobs.spawn('npc', st.x, st.y, st.z, { variant: st.index });
      m.homeYaw = st.npc.yaw;
      m.yaw = st.npc.yaw;
      this.npcMobs.set(key, m);
    }
  }

  /**
   * A quest giver must always be where players can find them. The village is protected, so this is a safety net
   * (a blast's push, a mob, a world that was changed by hand): if one has strayed from their station, or is walled in
   * or standing over nothing, put them back, and clear the air and mend the floor around them.
   */
  private leashNpc(st: NpcStation, m: Mob): void {
    const b = m.body;
    const x = Math.floor(st.x);
    const y = Math.floor(st.y);
    const z = Math.floor(st.z);
    const strayed = Math.hypot(b.x - st.x, b.z - st.z) > NPC_LEASH || Math.abs(b.y - st.y) > NPC_LEASH;
    const stuck = BLOCKS[this.world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.1), Math.floor(b.z))].solid || BLOCKS[this.world.getBlock(Math.floor(b.x), Math.floor(b.y + 1.1), Math.floor(b.z))].solid;
    const blocked = BLOCKS[this.world.getBlock(x, y, z)].solid || BLOCKS[this.world.getBlock(x, y + 1, z)].solid;
    const floorGone = !BLOCKS[this.world.getBlock(x, y - 1, z)].solid;
    if (!strayed && !stuck && !blocked && !floorGone) return;
    // Their own two cells: anything in them (a block put there, a liquid) goes, and something stands under their feet.
    for (const cy of [y, y + 1]) if (this.world.getBlock(x, cy, z) !== B.AIR) this.world.setBlock(x, cy, z, B.AIR);
    if (floorGone) this.world.setBlock(x, y - 1, z, B.STONE_BRICKS);
    b.x = st.x;
    b.y = st.y;
    b.z = st.z;
    b.vx = b.vy = b.vz = 0;
    m.yaw = st.npc.yaw;
  }

  // ---- dungeon copies ----------------------------------------------------------------------------
  // A dungeon (see `WorldGenerator.instanceAt`) is a separate map: a player who steps into its portal is sent to
  // a copy of it that is theirs alone, and sent back out through the portal inside. A copy is kept for a while
  // after its people have gone, so that dying or logging off does not lose the progress, and then wiped: mobs,
  // loot, spawners and all, ready for the next.

  /** Who has each copy (by slot), and how long it has been without anybody in it. */
  private readonly copies = new Map<number, { key: string; empty: number }>();
  private readonly copyOf = new Map<string, number>();
  private copyTimer = 0;

  /** Seconds a copy is kept after the last player has left it. */
  static readonly COPY_KEEP = 90;

  /** How many copies of a dungeon are in use. */
  get copiesInUse(): number {
    return this.copies.size;
  }

  /** The copy a player is standing in, or -1. */
  copyAt(p: Player): number {
    return this.generator.instanceAt(p.body.x, p.body.z);
  }

  /** A player or group has a new key (a party was formed): its open copy, if any, goes with it. */
  rekeyCopy(from: string, to: string): void {
    const slot = this.copyOf.get(from);
    if (slot === undefined || this.copyOf.has(to)) return;
    this.copyOf.delete(from);
    this.copyOf.set(to, slot);
    const c = this.copies.get(slot);
    if (c) c.key = to;
  }

  /** Whose copy this is (the key of the player or group it belongs to), if anyone's. */
  copyOwner(slot: number): string | null {
    return this.copies.get(slot)?.key ?? null;
  }

  private sendTo(p: Player, spot: { x: number; y: number; z: number; yaw: number }): void {
    this.emitNear(p.body.x, p.body.y, p.body.z, { t: 'mob', kind: 'enderman', sound: 'teleport', vol: 0.6 });
    p.teleport(spot.x, spot.y, spot.z, spot.yaw, 0);
    p.portalCooldown = 3;
    this.emitNear(spot.x, spot.y, spot.z, { t: 'mob', kind: 'enderman', sound: 'teleport', vol: 0.6 });
  }

  /** A player has walked into a portal: into their copy of the dungeon from the land, back out of it from inside. */
  usePortal(p: Player): void {
    const inside = this.copyAt(p);
    if (inside >= 0) {
      const out = this.generator.instanceExit();
      if (out) this.sendTo(p, out);
      return;
    }
    const key = p.instanceKey();
    const reopen = this.copyOf.has(key);
    if (!this.mayEnter(p, reopen)) return;
    const slot = this.assignCopy(key);
    const spot = this.generator.instanceEntry(slot);
    if (slot >= 0) {
      this.openBoss(slot);
      this.openMobs(slot);
    }
    if (slot < 0 || !spot) {
      p.portalCooldown = 3;
      p.emit({ t: 'toast', text: 'The portal is crowded: every dungeon is in use. Try again soon.' });
      return;
    }
    const need = this.generator.instanceRequirement();
    if (need?.item !== undefined && need.consume && !reopen && p.mode === 'survival') {
      // The dungeon's own item is used first (it costs nothing to keep); without one, a key bought with $SOLRIFT.
      if (p.inventory.countOf(need.item) >= 1) p.inventory.remove(need.item, 1);
      else {
        const left = this.keyDesk?.take(p) ?? -1;
        if (left < 0) {
          p.emit({ t: 'toast', text: `${need.name} needs a key you do not have.` });
          const out = this.generator.instanceExit();
          if (out) this.sendTo(p, out);
          else p.portalCooldown = 3;
          return;
        }
        p.emit({ t: 'toast', text: `A Hollow Key opens the way (${left} left).` });
      }
    }
    this.sendTo(p, spot);
  }

  /**
   * Does the dungeon let this player in? If not they are told why and the portal turns them back. Creative players
   * (operators) always may; a player who still has a copy open may come back to it without the key again.
   */
  private mayEnter(p: Player, reopen: boolean): boolean {
    const need = this.generator.instanceRequirement();
    if (!need || p.mode !== 'survival') return true;
    let why = '';
    if (need.level !== undefined && p.xp.level < need.level) {
      why = `${need.name} is for level ${need.level} and up. You are level ${p.xp.level}.`;
    } else if (need.item !== undefined && !reopen && p.inventory.countOf(need.item) < 1 && !this.keyDesk?.has(p)) {
      const item = getItem(need.item).name.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
      why = `${need.name} needs ${item}${this.keyDesk?.allowed(p) ? ', or a Hollow Key (you can buy one with $SOLRIFT on the token page)' : ''}.`;
    }
    if (!why) return true;
    p.emit({ t: 'toast', text: why });
    const out = this.generator.instanceExit();
    if (out) this.sendTo(p, out);
    else p.portalCooldown = 3;
    return false;
  }

  /** The copy for this key: the one it already has, or the lowest one nobody has (-1 when all are taken). */
  private assignCopy(key: string): number {
    const have = this.copyOf.get(key);
    if (have !== undefined) {
      this.copies.get(have)!.empty = 0;
      return have;
    }
    for (let slot = 0; slot < this.generator.instanceCount(); slot++) {
      if (this.copies.has(slot)) continue;
      this.copies.set(slot, { key, empty: 0 });
      this.copyOf.set(key, slot);
      return slot;
    }
    return -1;
  }

  private updateCopies(dt: number): void {
    for (const p of this.players) {
      p.portalCooldown -= dt;
      if (p.portalCooldown > 0 || p.screen === 'dead' || p.spectating || p.sleeping || p.riding) continue;
      const b = p.body;
      const x = Math.floor(b.x);
      const z = Math.floor(b.z);
      const y = Math.floor(b.y);
      if (this.world.getBlock(x, y, z) === B.PORTAL || this.world.getBlock(x, y + 1, z) === B.PORTAL) this.usePortal(p);
    }
    this.copyTimer += dt;
    if (this.copyTimer < 1) return;
    const elapsed = this.copyTimer;
    this.copyTimer = 0;
    // Strangers are put out: somebody who logged in inside a copy that is no longer theirs.
    const present = new Set<number>();
    for (const p of this.players) {
      const slot = this.copyAt(p);
      if (slot < 0) continue;
      if (this.copies.get(slot)?.key === p.instanceKey()) {
        present.add(slot);
        continue;
      }
      const out = this.generator.instanceExit();
      if (out) this.sendTo(p, out);
    }
    this.updateGates(present);
    for (const slot of present) this.ensureExit(slot);
    for (const [slot, c] of [...this.copies]) {
      if (present.has(slot)) {
        c.empty = 0;
        continue;
      }
      c.empty += elapsed;
      if (c.empty >= Realm.COPY_KEEP) this.releaseCopy(slot);
    }
  }

  /** Wipe a copy and give it back. */
  private releaseCopy(slot: number): void {
    const c = this.copies.get(slot);
    if (c) {
      this.copies.delete(slot);
      this.copyOf.delete(c.key);
    }
    this.wipeCopy(slot);
  }

  /** Put a copy back as it was generated, and clear everything that lived in it. */
  private wipeCopy(slot: number): void {
    const b = this.generator.instanceBounds(slot);
    if (!b) return;
    const inside = (x: number, y: number, z: number): boolean => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && y >= b.y0 - 2 && y <= b.y1 + 2;
    const mobs = this.mobs.mobs;
    for (let i = mobs.length - 1; i >= 0; i--) if (inside(mobs[i].body.x, mobs[i].body.y, mobs[i].body.z) && mobs[i].kind !== 'npc') mobs.splice(i, 1);
    const drops = this.drops.drops;
    for (let i = drops.length - 1; i >= 0; i--) if (inside(drops[i].x, drops[i].y, drops[i].z)) drops.splice(i, 1);
    const arrows = this.mobs.arrows;
    for (let i = arrows.length - 1; i >= 0; i--) if (inside(arrows[i].x, arrows[i].y, arrows[i].z)) arrows.splice(i, 1);
    for (const k of [...this.spawnerReady.keys()]) {
      const [x, y, z] = k.split(',').map(Number);
      if (inside(x, y, z)) this.spawnerReady.delete(k);
    }
    this.bosses.delete(slot);
    this.populated.delete(slot);
    this.progress.delete(slot);
    this.blockEntities.clearWhere(inside);
    // Blocks: whatever was changed goes back, and the chunk is let go of.
    for (let cz = b.z0 >> 4; cz <= b.z1 >> 4; cz++) {
      for (let cx = b.x0 >> 4; cx <= b.x1 >> 4; cx++) {
        if (this.world.hasChunk && !this.world.hasChunk(cx, cz)) continue;
        const base = this.generator.generateChunk(cx, cz);
        for (let i = 0; i < base.length; i++) {
          const x = cx * 16 + (i & 15);
          const y = i >> 8;
          const z = cz * 16 + ((i >> 4) & 15);
          if (this.world.getBlock(x, y, z) !== base[i]) this.world.setBlock(x, y, z, base[i]);
        }
        this.world.forgetChunk?.(cx, cz);
      }
    }
  }

  /** At the start (the world has just been loaded): no copy is in use, so wipe whatever a crash left in them. */
  private sweepCopies(): void {
    for (let slot = 0; slot < this.generator.instanceCount(); slot++) {
      const b = this.generator.instanceBounds(slot);
      if (b) this.blockEntities.clearWhere((x, _y, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
    }
  }

  // ---- the monsters and gates of a dungeon ---------------------------------------------------------

  /** The copies whose monsters have been put in their places (once each: what is killed in a copy stays dead until the copy is wiped). */
  private readonly populated = new Set<number>();
  /** For each open copy: the cages that have been broken and the gates that have opened. */
  private readonly progress = new Map<number, { broken: Set<string>; open: Set<string> }>();

  /** A copy was opened: its monsters are put at their posts, once. They are guards: they walk a short beat round their post until they see somebody. */
  private openMobs(slot: number): void {
    if (this.populated.has(slot)) return;
    this.populated.add(slot);
    for (const spec of this.generator.instanceMobs(slot)) {
      const m = this.mobs.spawn(spec.kind, spec.x, spec.y, spec.z);
      m.bound = true;
      m.guard = true;
      // They walk their beat, 4 to 8 blocks round the post, until somebody comes into their sight.
      m.patrol = 4 + this.rand() * 4;
      m.homeX = spec.x;
      m.homeZ = spec.z;
      m.yaw = m.homeYaw = spec.yaw;
      if (spec.elite) {
        m.elite = true;
        m.maxHealth *= spec.elite;
        m.health = m.maxHealth;
        m.damageMul = 1 + (spec.elite - 1) * 0.25;
      }
    }
  }

  /** What an elite leaves: a piece of gear, uncommon or better, for the player who killed it (their party may take it too). */
  private eliteLoot(x: number, y: number, z: number, owner?: unknown): void {
    const piece = randomGear(5 + Math.floor(this.rand() * 3), pickRarity([60, 33, 7], this.rand), undefined, this.rand);
    const a = this.rand() * Math.PI * 2;
    this.drops.spawn(piece, x, y + 0.5, z, Math.cos(a) * 1.4, 3.5, Math.sin(a) * 1.4, 0.5, owner, this.shareKill(owner));
  }

  /** Tell everybody in a copy something. */
  private tellCopy(slot: number, text: string): void {
    for (const p of this.players) if (this.copyAt(p) === slot) p.emit({ t: 'toast', text });
  }

  /**
   * The gates of the copies that have somebody in them: each cage that is gone is noted, and a gate whose cages are
   * all gone opens (its bars are taken out of the wall). A cage that is not in a loaded chunk has not been touched.
   */
  private updateGates(present: ReadonlySet<number>): void {
    for (const slot of present) {
      const gates = this.generator.instanceGates(slot);
      if (gates.length === 0) continue;
      let st = this.progress.get(slot);
      if (!st) this.progress.set(slot, (st = { broken: new Set(), open: new Set() }));
      const all = new Set(gates.flatMap((g) => g.cages.map((c) => `${c.x},${c.y},${c.z}`)));
      for (const g of gates) {
        for (const c of g.cages) {
          const k = `${c.x},${c.y},${c.z}`;
          if (st.broken.has(k) || (this.world.hasChunk && !this.world.hasChunk(c.x >> 4, c.z >> 4)) || this.world.getBlock(c.x, c.y, c.z) === B.SPAWNER) continue;
          st.broken.add(k);
          this.tellCopy(slot, `A cage shatters (${st.broken.size} of ${all.size}).`);
        }
        const wasOpen = st.open.has(g.id);
        if (!wasOpen && !g.cages.every((c) => st!.broken.has(`${c.x},${c.y},${c.z}`))) continue;
        if (wasOpen) {
          // Open already: its bars come back if the chunk was unloaded and made again, so take them out again.
          for (const b of g.boxes) {
            if (this.world.hasChunk && !this.world.hasChunk(b.x0 >> 4, b.z0 >> 4)) continue;
            for (let y = b.y0; y <= b.y1; y++) for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) if (this.world.getBlock(x, y, z) !== B.AIR) this.world.setBlock(x, y, z, B.AIR);
          }
          continue;
        }
        st.open.add(g.id);
        for (const b of g.boxes) {
          for (let y = b.y0; y <= b.y1; y++) for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) if (this.world.getBlock(x, y, z) !== B.AIR) this.world.setBlock(x, y, z, B.AIR);
          this.emitNear(b.x0, b.y0 + 1, b.z0 + 1, { t: 'burst', id: B.COBBLE, x: b.x0, y: b.y0 + 1, z: b.z0 + 1, count: 24 });
        }
        this.tellCopy(slot, `${g.name} grinds open.`);
      }
    }
  }

  // ---- the boss of a dungeon ---------------------------------------------------------------------
  /** The boss of each open copy (by slot), asleep on his throne until somebody comes near. A boss that has fallen stays fallen until the copy is wiped. */
  private readonly bosses = new Map<number, BossBrain>();

  /** A copy was opened: its boss (if its dungeon has one) is put on his throne, once. */
  private openBoss(slot: number): void {
    if (this.bosses.has(slot)) return;
    const spec = this.generator.instanceBoss(slot);
    if (!spec) return;
    const mob = this.mobs.spawn('hollow_king', spec.x, spec.y, spec.z);
    mob.bound = true;
    mob.yaw = mob.homeYaw = spec.yaw;
    const arena: BossArenaDef = { ...spec.arena, y: spec.y, home: { x: spec.x, y: spec.y, z: spec.z, yaw: spec.yaw } };
    const inRoom = (p: Player): boolean => this.copyAt(p) === slot && !p.vitals.dead && !p.spectating && p.screen !== 'dead' && p.body.x >= arena.x0 - 2 && p.body.x <= arena.x1 + 3 && p.body.z >= arena.z0 - 2 && p.body.z <= arena.z1 + 3 && Math.abs(p.body.y - arena.y) <= 16;
    const emitRoom = (e: SessionEvent): void => {
      for (const p of this.players) if (this.copyAt(p) === slot) p.emit(e);
    };
    const world: BossWorld = {
      targets: (): BossTarget[] =>
        this.players.filter(inRoom).map((p) => ({
          x: p.body.x,
          y: p.body.y,
          z: p.body.z,
          hurt: (amount, kx, kz) => p.hurtByMob(amount, kx, kz, 'hollow_king'),
        })),
      spawnAdd: (kind, x, y, z) => {
        const add = this.mobs.spawn(kind, x, y, z);
        add.bound = true;
        add.aggro = true;
        // The court is a part of the fight, not a prize: it leaves nothing.
        add.noDrops = true;
        this.emitNear(x, y, z, { t: 'burst', id: B.OBSIDIAN, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), count: 14 });
        return add;
      },
      removeMob: (m) => {
        const i = this.mobs.mobs.indexOf(m);
        if (i >= 0) this.mobs.mobs.splice(i, 1);
      },
      mark: (kind, x, y, z, r, ttl) => void this.effects.mark(kind, 'The Hollow King', x, y, z, r, ttl),
      say: (text, kind) => emitRoom({ t: 'boss', text, kind }),
      fx: (e) => emitRoom({ t: 'bossFx', ...e }),
      defeated: () => emitRoom({ t: 'toast', text: 'The Hollow King has fallen.' }),
      rand: () => this.rand(),
    };
    this.bosses.set(slot, new BossBrain(mob, arena, world));
  }

  /**
   * When a copy's boss has fallen, a portal stands where he fought: a frame of obsidian across the way (5 wide, 5 high) with a
   * violet portal in it, which takes whoever steps into it out of the dungeon (see `usePortal`). It is made as soon as the
   * chunk is there, and made again if the chunk was unloaded and generated afresh.
   */
  private ensureExit(slot: number): void {
    const brain = this.bosses.get(slot);
    const spec = this.generator.instanceBoss(slot);
    if (!brain || brain.state !== 'dead' || !spec?.exit) return;
    const { x, y, z } = spec.exit;
    if (this.world.hasChunk && !this.world.hasChunk(x >> 4, (z - 2) >> 4) || this.world.hasChunk && !this.world.hasChunk(x >> 4, (z + 2) >> 4)) return;
    if (this.world.getBlock(x, y, z) === B.PORTAL && this.world.getBlock(x, y + 2, z) === B.PORTAL) return;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = -1; dy <= 3; dy++) {
        const frame = dz === -2 || dz === 2 || dy === -1 || dy === 3;
        this.world.setBlock(x, y + dy, z + dz, frame ? B.OBSIDIAN : B.PORTAL);
      }
    }
    this.emitNear(x, y + 1, z, { t: 'burst', id: B.OBSIDIAN, x, y: y + 1, z, count: 30 });
    this.tellCopy(slot, 'A portal opens in the Molten Heart: step into it to leave the dungeon.');
  }

  /** How far a player is in the dungeon they stand in (null outside one). */
  dungeonViewFor(p: Player): DungeonView | null {
    const slot = this.copyAt(p);
    if (slot < 0) return null;
    const gates = this.generator.instanceGates(slot);
    const st = this.progress.get(slot);
    const cages = new Set(gates.flatMap((g) => g.cages.map((c) => `${c.x},${c.y},${c.z}`)));
    const brain = this.bosses.get(slot);
    return { name: 'The Hollow Cellar', cages: st ? st.broken.size : 0, cagesTotal: cages.size, gates: st ? st.open.size : 0, gatesTotal: gates.length, boss: brain ? brain.state : 'none' };
  }

  /** What a player sees of the boss they are fighting (null when they are not in a fight). */
  bossViewFor(p: Player): BossView | null {
    const slot = this.copyAt(p);
    if (slot < 0) return null;
    const brain = this.bosses.get(slot);
    return brain && brain.state === 'fighting' ? brain.view() : null;
  }

  /** The players who can be in a rift: alive, in a survival world, and out in the open (not in a dungeon copy). */
  private riftPlayers(): (RiftPlayer & { player: Player })[] {
    const out: (RiftPlayer & { player: Player })[] = [];
    for (const p of this.players) {
      if (p.screen === 'dead' || p.spectating || p.mode === 'creative' || this.copyAt(p) >= 0) continue;
      out.push({ ref: p, player: p, x: p.body.x, y: p.body.y, z: p.body.z });
    }
    return out;
  }

  /** What a player's interface shows of the rift (null when there is none near enough to know of). */
  riftViewFor(p: Player): RiftView | null {
    if (!this.rifts?.current || p.spectating || this.copyAt(p) >= 0) return null;
    return this.rifts.viewFor({ ref: p, x: p.body.x, y: p.body.y, z: p.body.z });
  }

  /** Open a rift right now near the players (a cheat, a test). Returns false when there is no one about or no place for it. */
  startRift(grade?: RiftGrade): boolean {
    return !!this.rifts && this.rifts.open(this.riftPlayers(), grade);
  }

  private riftHost(): RiftHost {
    return {
      players: () => this.riftPlayers(),
      groundAt: (x, z) => this.world.surfaceY(Math.floor(x), Math.floor(z)),
      standable: (x, y, z) => {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const floor = this.world.getBlock(bx, y - 1, bz);
        return BLOCKS[floor].solid && !BLOCKS[floor].liquid && this.world.getBlock(bx, y, bz) === B.AIR && this.world.getBlock(bx, y + 1, bz) === B.AIR && !isFluid(this.world.getBlock(bx, y, bz));
      },
      allowed: (x, z) => !this.generator.safeFromMonsters(x, z, SAFE_BUFFER) && this.generator.instanceAt(x, z) < 0,
      spawn: (kind, x, y, z) => this.mobs.spawn(kind, x, y, z),
      remove: (mob) => {
        const i = this.mobs.mobs.indexOf(mob);
        if (i >= 0) this.mobs.mobs.splice(i, 1);
      },
      puff: (x, y, z) => this.emitNear(x, y, z, { t: 'burst', id: B.OBSIDIAN, x, y, z, count: 8 }),
      chests: (x, y, z, grade) => this.placeRiftChests(x, y, z, grade),
      announce: (what, grade, text, x, z) => {
        for (const p of this.players) {
          if (p.spectating || this.copyAt(p) >= 0) continue;
          const dx = x - p.body.x;
          const dz = z - p.body.z;
          const far = Math.hypot(dx, dz);
          // Told where it is, as far as it is from them (only the omen: after that the tracker says).
          const where = what === 'omen' ? ` (${Math.round(far)} blocks ${compass(dx, dz)})` : '';
          if (far > 600) continue;
          p.emit({ t: 'rift', what, grade, text: text + where });
        }
      },
      reward: (rp, grade, rank, helpers) => {
        const p = (rp as RiftPlayer & { player: Player }).player;
        const def = RIFT_GRADE_DEFS[grade].reward;
        const rand = this.rand;
        const level = def.gearLevel[0] + Math.floor(rand() * (def.gearLevel[1] - def.gearLevel[0] + 1));
        const piece = randomGear(level, pickRarity(def.gearRarity, rand), p.cls?.classId, rand);
        p.addXp(def.xp);
        p.addCoins(def.coins, true);
        p.giveOrDrop(piece);
        if (rand() < def.tome) p.giveOrDrop(randomEnchantedBook(rand));
        p.emit({ t: 'toast', text: rank === 1 && helpers > 1 ? `${RIFT_GRADE_DEFS[grade].name}: you fought the best! +${def.xp} xp, +${def.coins} coins and a piece of gear` : `${RIFT_GRADE_DEFS[grade].name}: +${def.xp} xp, +${def.coins} coins and a piece of gear` });
      },
    };
  }

  /**
   * A sealed rift leaves two chests of treasure by its place, one each side of the middle facing it, filled from the grade's loot table.
   * Where the ground is too rough for a chest the stacks that would have been in it are dropped at the middle instead.
   */
  private placeRiftChests(x: number, y: number, z: number, grade: RiftGrade): void {
    const table = LOOT_TABLES[RIFT_GRADE_DEFS[grade].chest];
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    // Offsets from the middle to try, best first, and the way the chest on each faces (BED_DIRS: +x, -x, +z, -z): toward the middle.
    const tries: readonly [number, number, number][] = [[-2, 0, 0], [2, 0, 1], [0, -2, 2], [0, 2, 3], [-3, 1, 0], [3, -1, 1], [-3, -2, 0], [3, 2, 1], [-1, 3, 3], [1, -3, 2]];
    const spots: { x: number; y: number; z: number; dir: number }[] = [];
    for (const [dx, dz, dir] of tries) {
      if (spots.length >= 2) break;
      const bx = cx + dx;
      const bz = cz + dz;
      const g = this.world.surfaceY(bx, bz);
      if (g < 0 || Math.abs(g + 1 - Math.floor(y)) > 3) continue;
      const floor = BLOCKS[this.world.getBlock(bx, g, bz)];
      if (!floor.solid || floor.liquid || this.world.getBlock(bx, g + 1, bz) !== B.AIR) continue;
      if (spots.some((s) => s.x === bx && s.z === bz)) continue;
      spots.push({ x: bx, y: g + 1, z: bz, dir });
    }
    for (let i = 0; i < 2; i++) {
      const slots = rollChest(table, this.rand);
      const spot = spots[i];
      if (!spot) {
        for (const s of slots) if (s) this.drops.spawn(s, x, y + 0.5, z, (this.rand() - 0.5) * 2, 4, (this.rand() - 0.5) * 2, 0.5);
        continue;
      }
      this.world.setBlock(spot.x, spot.y, spot.z, chestId(spot.dir, 0));
      this.blockChanged(spot.x, spot.y, spot.z);
      const chest = this.blockEntities.chest(spot.x, spot.y, spot.z);
      slots.forEach((s, k) => chest.set(k, s));
      this.emitNear(spot.x + 0.5, spot.y + 0.5, spot.z + 0.5, { t: 'burst', id: B.GOLD_ORE, x: spot.x, y: spot.y, z: spot.z, count: 14 });
    }
  }

  /** What a player's interface shows of the Gilded Tide (null when none is on, or the player is in a dungeon). */
  invasionViewFor(p: Player): InvasionView | null {
    if (!this.invasions?.current || p.spectating || this.copyAt(p) >= 0) return null;
    return this.invasions.view();
  }

  /**
   * The players the Gilded Tide can start for and keep alive: alive, out in the open (not in a dungeon copy). Creative is allowed
   * (unlike rifts): the Tide is a hunt for shy gold, and an admin in creative still needs to be able to start and find it.
   */
  private tidePlayers(): (RiftPlayer & { player: Player })[] {
    const out: (RiftPlayer & { player: Player })[] = [];
    for (const p of this.players) {
      if (p.screen === 'dead' || p.spectating || this.copyAt(p) >= 0) continue;
      out.push({ ref: p, player: p, x: p.body.x, y: p.body.y, z: p.body.z });
    }
    return out;
  }

  /** Begin the Gilded Tide right now near the players (a cheat, a test). Returns false when one is on already, or there is no one about or no ground for it. */
  startInvasion(): boolean {
    return !!this.invasions && this.invasions.open(this.tidePlayers());
  }

  private invasionHost(clock: () => number): InvasionHost {
    return {
      now: clock,
      players: () => this.tidePlayers(),
      chunks: () => this.world.chunkCoords?.() ?? [],
      groundAt: (x, z) => this.world.surfaceY(Math.floor(x), Math.floor(z)),
      standable: (x, y, z) => {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const floor = this.world.getBlock(bx, y - 1, bz);
        return BLOCKS[floor].solid && !BLOCKS[floor].liquid && this.world.getBlock(bx, y, bz) === B.AIR && this.world.getBlock(bx, y + 1, bz) === B.AIR && !isFluid(this.world.getBlock(bx, y, bz));
      },
      allowed: (x, z) => !this.generator.safeFromMonsters(x, z, SAFE_BUFFER) && this.generator.instanceAt(x, z) < 0,
      spawn: (kind, x, y, z) => this.mobs.spawn(kind, x, y, z),
      present: (mob) => this.mobs.mobs.includes(mob),
      remove: (mob) => {
        const i = this.mobs.mobs.indexOf(mob);
        if (i >= 0) this.mobs.mobs.splice(i, 1);
      },
      puff: (x, y, z) => this.emitNear(x, y, z, { t: 'burst', id: B.GOLD_ORE, x, y, z, count: 10 }),
      announce: (what, text, x, z) => {
        for (const p of this.players) {
          if (p.spectating || this.copyAt(p) >= 0) continue;
          const where = x !== undefined && z !== undefined ? ` (${whereIs(p.body.x, p.body.z, x, z)})` : '';
          p.emit({ t: 'invasion', what, text: text + where });
        }
      },
    };
  }

  /** The Hollow King's reward: everybody who fought him gets a piece of gear for their own class, rare or better. */
  private bossLoot(mob: Mob, x: number, y: number, z: number): void {
    const slot = this.generator.instanceAt(mob.body.x, mob.body.z);
    for (const p of this.players) {
      if (p.screen === 'dead' || p.spectating || this.copyAt(p) !== slot) continue;
      const piece = randomGear(7 + Math.floor(this.rand() * 3), pickRarity([0, 62, 38], this.rand), p.cls?.classId, this.rand);
      const a = this.rand() * Math.PI * 2;
      this.drops.spawn(piece, x, y + 0.5, z, Math.cos(a) * 1.6, 4, Math.sin(a) * 1.6, 0.5, p);
      // The Hollow King besides leaves each of them one of his nine relics, all of them burning (see hollowKing.ts).
      if (mob.kind === 'hollow_king') {
        const relic = randomHollowKingRelic(this.rand);
        const b = this.rand() * Math.PI * 2;
        this.drops.spawn(relic, x, y + 1, z, Math.cos(b) * 1.3, 5, Math.sin(b) * 1.3, 0.5, p);
        p.emit({ t: 'toast', text: `The Hollow King's hoard burns on the floor: ${tooltipName(relic)}` });
      }
    }
    if (mob.kind === 'hollow_king') this.placeHoardChest(slot, x, y, z);
  }

  /**
   * The Hollow King's chest of loot, set down by where he fell: on the closest floor around the middle with room for it, facing
   * the middle, filled from the hoard's table. Where there is no such floor, what would have been in it is dropped at the middle.
   */
  private placeHoardChest(slot: number, x: number, y: number, z: number): void {
    // The portal out is made across the way where he fell (see `ensureExit`): the chest keeps clear of it.
    const exit = this.generator.instanceBoss(slot)?.exit;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const cy = Math.floor(y);
    const slots = rollChest(LOOT_TABLES.hollow_king, this.rand);
    const ring: { dx: number; dz: number }[] = [];
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) >= 3) ring.push({ dx, dz });
    ring.sort((a, b) => a.dx * a.dx + a.dz * a.dz - (b.dx * b.dx + b.dz * b.dz) || a.dx - b.dx || a.dz - b.dz);
    for (const { dx, dz } of ring) {
      const bx = cx + dx;
      const bz = cz + dz;
      if (exit && Math.abs(bx - exit.x) <= 3 && Math.abs(bz - exit.z) <= 4) continue;
      // The floor within a few blocks of where he stood: solid below, two clear blocks above.
      for (let by = cy + 3; by >= cy - 3; by--) {
        const below = BLOCKS[this.world.getBlock(bx, by - 1, bz)];
        if (!below.solid || below.liquid || this.world.getBlock(bx, by, bz) !== B.AIR || this.world.getBlock(bx, by + 1, bz) !== B.AIR) continue;
        const dir = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 0 : 1) : dz < 0 ? 2 : 3;
        this.world.setBlock(bx, by, bz, chestId(dir, 0));
        this.blockChanged(bx, by, bz);
        const chest = this.blockEntities.chest(bx, by, bz);
        slots.forEach((s, k) => chest.set(k, s));
        this.emitNear(bx + 0.5, by + 0.5, bz + 0.5, { t: 'burst', id: B.GOLD_ORE, x: bx, y: by, z: bz, count: 24 });
        return;
      }
    }
    for (const s of slots) if (s) this.drops.spawn(s, x, y + 0.5, z, (this.rand() - 0.5) * 3, 4, (this.rand() - 0.5) * 3, 0.5);
  }

  /** The players, monsters and villagers close to a spot, as things a player cannot walk through (undefined when none is). */
  solidsNear(x: number, y: number, z: number, self?: Body): Solid[] | undefined {
    let out: Solid[] | undefined;
    for (const p of this.players) {
      const pb = p.body;
      if (pb === self || p.vitals.dead || p.spectating || p.screen === 'dead') continue;
      if (Math.abs(pb.x - x) > 4 || Math.abs(pb.z - z) > 4 || Math.abs(pb.y - y) > 3) continue;
      (out ??= []).push({ x: pb.x, y: pb.y, z: pb.z, r: PLAYER_WIDTH / 2, h: pb.height ?? PLAYER_HEIGHT });
    }
    for (const m of this.mobs.mobs) {
      if (m.dead || m.width < 0.3) continue;
      // (Its size next to its model, as for a blow: see `Mob.hitDistance`; a giant's arm reaches further than 6 blocks from its middle.)
      const k = m.def.height > 0 ? m.height / m.def.height : 1;
      const near = 6 + mobTouch(m.def.kind, k, m.width);
      if (Math.abs(m.body.x - x) > near || Math.abs(m.body.z - z) > near || Math.abs(m.body.y - y) > 6 + m.height) continue;
      (out ??= []).push(mobSolid(m.def.kind, m.body.x, m.body.y, m.body.z, m.yaw, k, m.width, m.height));
    }
    return out;
  }

  /** Is this block part of a place players may not change? (See `WorldGenerator.isProtected`.) */
  isProtected(x: number, y: number, z: number): boolean {
    return this.generator.isProtected(x, y, z);
  }

  /** Nobody's hand (a blast, a fire) leaves this block alone: a protected place, and anything somebody has claimed. */
  isGriefProof(x: number, y: number, z: number): boolean {
    return this.generator.isProtected(x, y, z) || (this.land?.blocksEnvironment(x, y, z) ?? false);
  }

  // ---- villagers -------------------------------------------------------------

  /** A new restock epoch at dawn (the clock wrapped or was reset) and when the afternoon begins. */
  private countRestocks(): void {
    const t = this.time;
    if (t < this.prevTime || (this.prevTime < RESTOCK_AFTERNOON && t >= RESTOCK_AFTERNOON)) this.restockEpoch++;
    this.prevTime = t;
  }

  /** The records of one village, made when a player first comes near it. */
  folkOf(site: { x: number; z: number }): VillagerRecord[] {
    const key = `${site.x},${site.z}`;
    let list = this.folk.get(key);
    if (!list) {
      const homes = this.generator.villages.homesOf(site as never);
      list = homes.map((h, slot) => makeRecord(slot, h, professionFor(h.kind, hash2(this.seed + 700 + slot, site.x, site.z)), this.restockEpoch));
      this.folk.set(key, list);
    }
    return list;
  }

  /**
   * Keep a village's people in step with the players: bring them to life near one, put them away when
   * everybody has left, restock their trades and remember who died.
   */
  private updateVillagers(dt: number, living: readonly MobPlayer[]): void {
    this.folkTimer += dt;
    if (this.folkTimer < 1) return;
    this.folkTimer = 0;
    const mobs = this.mobs.mobs;
    for (const list of this.folk.values()) {
      for (const rec of list) {
        const m = rec.mob;
        if (!m) continue;
        if (m.dead) {
          rec.alive = false;
          rec.mob = null;
          continue;
        }
        if (!mobs.includes(m)) {
          rec.mob = null; // gone (cleared, say): back to its record
          continue;
        }
        m.variant = villagerVariant(rec);
        if (rec.epoch !== this.restockEpoch && !m.customer) {
          restock(rec);
          rec.epoch = this.restockEpoch;
        }
        let nearest = Infinity;
        for (const p of living) nearest = Math.min(nearest, Math.hypot(p.x - m.body.x, p.z - m.body.z));
        if (nearest > FOLK_LEAVE && !m.customer) this.putAway(rec, m);
      }
    }
    for (const p of living) {
      for (const site of this.generator.villages.sitesNear(p.x - FOLK_NEAR, p.z - FOLK_NEAR, p.x + FOLK_NEAR, p.z + FOLK_NEAR)) {
        if (Math.hypot(site.x - p.x, site.z - p.z) > FOLK_NEAR) continue;
        for (const rec of this.folkOf(site)) {
          if (rec.alive && !rec.mob) this.bringToLife(rec);
        }
      }
    }
  }

  private bringToLife(rec: VillagerRecord): void {
    // Wait for the ground (a chunk the player has not loaded yet reads as air).
    const fits = (px: number, py: number, pz: number): boolean => {
      const x = Math.floor(px);
      const y = Math.floor(py + 0.01);
      const z = Math.floor(pz);
      return BLOCKS[this.world.getBlock(x, y - 1, z)].solid && !BLOCKS[this.world.getBlock(x, y, z)].solid;
    };
    if (!fits(rec.x, rec.y, rec.z)) {
      // Saved in a doorway that is shut now? Go home.
      if (!fits(rec.homeX, rec.homeY, rec.homeZ)) return;
      rec.x = rec.homeX;
      rec.y = rec.homeY;
      rec.z = rec.homeZ;
    }
    const m = this.mobs.spawn('villager', rec.x, rec.y, rec.z, { variant: villagerVariant(rec) });
    m.villager = rec;
    rec.mob = m;
  }

  private putAway(rec: VillagerRecord, m: Mob): void {
    rec.x = m.body.x;
    rec.y = m.body.y;
    rec.z = m.body.z;
    rec.mob = null;
    const i = this.mobs.mobs.indexOf(m);
    if (i >= 0) this.mobs.mobs.splice(i, 1);
  }

  /** Open or close a door for a villager (the door's lower half is at y). False when somebody is in the way of closing it. */
  setDoor(x: number, y: number, z: number, open: boolean): boolean {
    const lower = doorInfo(this.world.getBlock(x, y, z));
    if (!lower || lower.upper) return false;
    if (lower.open === open) return true;
    if (!open) {
      const inWay = (bx: number, by: number, bz: number, h: number): boolean => Math.hypot(bx - (x + 0.5), bz - (z + 0.5)) < 0.8 && by < y + 2 && by + h > y;
      if (this.players.some((p) => inWay(p.body.x, p.body.y, p.body.z, p.body.height ?? 1.8))) return false;
      if (this.mobs.mobs.some((m) => !m.dead && inWay(m.body.x, m.body.y, m.body.z, m.height))) return false;
    }
    const kind = doorKind(this.world.getBlock(x, y, z));
    this.world.setBlock(x, y, z, doorId(false, open, lower.facing, kind));
    if (doorInfo(this.world.getBlock(x, y + 1, z))) this.world.setBlock(x, y + 1, z, doorId(true, open, lower.facing, kind));
    this.emitNear(x, y, z, { t: 'sound', sound: BLOCKS[doorId(false, false, lower.facing, kind)].sound, action: 'place', vol: 0.6 });
    return true;
  }

  // ---- falling blocks --------------------------------------------------------

  private canFallInto(id: number): boolean {
    return id === B.AIR || BLOCKS[id].liquid || BLOCKS[id].shape === 'cross' || BLOCKS[id].shape === 'crop' || BLOCKS[id].shape === 'torch';
  }

  /** If the block here is sand or gravel with nothing under it, schedule it to fall. */
  checkFall(x: number, y: number, z: number): void {
    if (!FALLS[this.world.getBlock(x, y, z)]) return;
    if (!this.canFallInto(this.world.getBlock(x, y - 1, z))) return;
    if (this.falling.some((f) => f.x === x && f.y === y && f.z === z)) return;
    if (this.falling.length > 2000) return;
    this.falling.push({ x, y, z, t: 0.12, dist: 0 });
  }

  /**
   * Sand and gravel drop one block per tick-ish until something stops them. They are moved cell by
   * cell, not simulated as entities, which keeps them identical on every client for free.
   */
  private updateFalling(dt: number): void {
    if (this.falling.length === 0) return;
    const due: typeof this.falling = [];
    const keep: typeof this.falling = [];
    for (const f of this.falling) {
      f.t -= dt;
      (f.t <= 0 ? due : keep).push(f);
    }
    this.falling = keep;
    for (const f of due) {
      const id = this.world.getBlock(f.x, f.y, f.z);
      if (!FALLS[id]) continue;
      const below = this.world.getBlock(f.x, f.y - 1, f.z);
      if (!this.canFallInto(below) || f.y <= 1) continue;
      // Landing on a plant squashes it; landing on a person just turns the block into an item.
      const dist = f.dist + 1;
      this.world.setBlock(f.x, f.y, f.z, B.AIR);
      const anvil = isAnvil(id);
      if (anvil) this.crushBelow(f.x, f.y - 1, f.z, dist);
      if (this.players.some((p) => !p.spectating && bodyOverlapsBlock(p.body, f.x, f.y - 1, f.z))) {
        this.drops.spawnAtBlock(makeStack(id, 1), f.x, f.y - 1, f.z);
      } else {
        this.world.setBlock(f.x, f.y - 1, f.z, id);
        if (this.canFallInto(this.world.getBlock(f.x, f.y - 2, f.z)) && f.y - 1 > 1) {
          this.falling.push({ x: f.x, y: f.y - 1, z: f.z, t: 0.06, dist });
        } else {
          this.emitNear(f.x, f.y - 1, f.z, { t: 'sound', sound: BLOCKS[id].sound, action: 'place', vol: anvil ? 1 : 0.8 });
          // An anvil that has dropped chips or breaks a little now and then.
          if (anvil && this.rand() < ANVIL_LANDING_WEAR) {
            this.world.setBlock(f.x, f.y - 1, f.z, id === B.ANVIL ? B.ANVIL_CHIPPED : id === B.ANVIL_CHIPPED ? B.ANVIL_DAMAGED : B.AIR);
          }
        }
      }
      this.settleAround(f.x, f.y, f.z, true);
    }
  }

  /** A falling anvil hits whoever stands in this cell: two points a block it fell, at most forty. */
  private crushBelow(x: number, y: number, z: number, dist: number): void {
    const amount = Math.min(40, 2 * dist);
    for (const p of this.players) if (!p.spectating && bodyOverlapsBlock(p.body, x, y, z)) p.hurtByAnvil(amount);
    for (const m of this.mobs.mobs) {
      if (!m.dead && bodyOverlapsBlock(m.body, x, y, z)) this.mobs.damage(m, amount, 0, 0, this.mobEvents, true);
    }
  }
  // ---- soul lanterns ---------------------------------------------------------

  /**
   * Look for soul lanterns around the players, every couple of seconds. The space within reach of a player (80 blocks wide, 32 high) is
   * cut into cells of 8 blocks, and a cell that more than one player has within reach is looked at once, not once for each of them: a crowd
   * in one place costs hardly more than one player (it used to cost each of them 216,000 blocks, all in one tick: 120 players stopped the
   * game for a third of a second every two seconds). The cells are then looked at a share per tick (`WARD_CELLS_PER_TICK`, or all of them
   * in 20 ticks if there are many), so that players spread over a big world do not stop a tick either; the lanterns found replace the
   * old list when the last cell is done.
   */
  private scanWards(dt: number, players: readonly MobPlayer[]): void {
    if (!this.wardBusy) {
      this.wardScan += dt;
      if (this.wardScan < 2) return;
      this.wardScan = 0;
      const cells = new Set<number>();
      const R = 40;
      for (const p of players) {
        const px = Math.floor(p.x);
        const py = Math.floor(p.y);
        const pz = Math.floor(p.z);
        const y0 = Math.max(0, Math.floor(Math.max(1, py - 16) / 8));
        const y1 = Math.min(WORLD_HEIGHT / 8 - 1, Math.floor((py + 16) / 8));
        for (let cz = Math.floor((pz - R) / 8); cz <= Math.floor((pz + R) / 8); cz++) {
          for (let cx = Math.floor((px - R) / 8); cx <= Math.floor((px + R) / 8); cx++) {
            for (let cy = y0; cy <= y1; cy++) cells.add(((cx + 4194304) * 8388608 + (cz + 4194304)) * 64 + cy);
          }
        }
      }
      this.wardCells = [...cells];
      this.wardNext = 0;
      this.wardFound = new Map();
      this.wardBusy = true;
    }
    const cells = this.wardCells;
    const end = Math.min(cells.length, this.wardNext + Math.max(WARD_CELLS_PER_TICK, Math.ceil(cells.length / 20)));
    for (; this.wardNext < end; this.wardNext++) {
      const key = cells[this.wardNext];
      const cy = key % 64;
      const rest = Math.floor(key / 64);
      const cz = (rest % 8388608) - 4194304;
      const cx = Math.floor(rest / 8388608) - 4194304;
      for (let y = cy * 8; y < cy * 8 + 8; y++) {
        for (let z = cz * 8; z < cz * 8 + 8; z++) {
          for (let x = cx * 8; x < cx * 8 + 8; x++) {
            const id = this.world.getBlock(x, y, z);
            if (id === B.SOUL_LANTERN || id === B.SOUL_LANTERN_HANG) this.wardFound.set(`${x},${y},${z}`, { x, y, z });
          }
        }
      }
    }
    if (this.wardNext >= cells.length) {
      this.wards = [...this.wardFound.values()];
      this.wardCells = [];
      this.wardBusy = false;
    }
  }

  /** The nearest soul lantern whose ward (plus extra blocks) reaches this spot, or null. With no height, only the sides count. */
  wardAt(x: number, y: number | undefined, z: number, extra = 0): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const l of this.wards) {
      const d = Math.hypot(l.x + 0.5 - x, l.z + 0.5 - z);
      if (d > SOUL_WARD_RADIUS + extra || d >= bestD) continue;
      if (y !== undefined && Math.abs(l.y + 0.5 - y) > SOUL_WARD_HEIGHT + extra) continue;
      const id = this.world.getBlock(l.x, l.y, l.z);
      if (id !== B.SOUL_LANTERN && id !== B.SOUL_LANTERN_HANG) continue; // mined since the last scan
      best = { x: l.x + 0.5, z: l.z + 0.5 };
      bestD = d;
    }
    return best;
  }

  // ---- monster spawners ------------------------------------------------------

  /**
   * Cages found in dungeons keep making mobs while a player is within 16 blocks: up to four every
   * 10 to 40 seconds, never more than six of the kind nearby.
   */
  private updateSpawners(dt: number, living: readonly MobPlayer[]): void {
    this.spawnerClock += dt;
    this.spawnerScan += dt;
    if (this.spawnerScan < 1) return;
    this.spawnerScan = 0;
    const R = 16;
    for (const p of living) {
      const px = Math.floor(p.x);
      const py = Math.floor(p.y);
      const pz = Math.floor(p.z);
      for (let y = Math.max(1, py - 8); y <= py + 8; y++) {
        for (let z = pz - R; z <= pz + R; z++) {
          for (let x = px - R; x <= px + R; x++) {
            if (this.world.getBlock(x, y, z) !== B.SPAWNER) continue;
            if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z) > R) continue;
            this.runSpawner(x, y, z);
          }
        }
      }
    }
  }

  private runSpawner(x: number, y: number, z: number): void {
    // The cages of a dungeon make nothing: they are the locks of its gates (see `updateGates`), and its monsters are already in it.
    if (this.generator.instanceAt(x, z) >= 0) return;
    const k = `${x},${y},${z}`;
    const ready = this.spawnerReady.get(k);
    if (ready === undefined) {
      // First seen: wait a few seconds so walking in is not an ambush.
      this.spawnerReady.set(k, this.spawnerClock + 4 + this.rand() * 6);
      return;
    }
    if (this.spawnerClock < ready) return;
    this.spawnerReady.set(k, this.spawnerClock + 10 + this.rand() * 30);
    const kind: MobKind = this.generator.spawnerAt(x, y, z) ?? spawnerKind(this.seed, x, y, z);
    let near = 0;
    for (const m of this.mobs.mobs) {
      if (!m.dead && m.kind === kind && Math.hypot(m.body.x - x, m.body.y - y, m.body.z - z) < 10) near++;
    }
    const want = Math.min(4, 6 - near);
    let made = 0;
    for (let i = 0; i < 12 && made < want; i++) {
      const sx = x + Math.floor(this.rand() * 9) - 4;
      const sy = y + Math.floor(this.rand() * 3) - 1;
      const sz = z + Math.floor(this.rand() * 9) - 4;
      if (BLOCKS[this.world.getBlock(sx, sy, sz)].solid || BLOCKS[this.world.getBlock(sx, sy + 1, sz)].solid) continue;
      if (BLOCKS[this.world.getBlock(sx, sy, sz)].liquid || !BLOCKS[this.world.getBlock(sx, sy - 1, sz)].solid) continue;
      if (this.wardAt(sx, sy, sz, 2)) continue;
      this.mobs.spawn(kind, sx + 0.5, sy, sz + 0.5);
      this.emitNear(sx, sy, sz, { t: 'burst', id: B.SPAWNER, x: sx, y: sy, z: sz, count: 10 });
      made++;
    }
  }

  /** Advance the day clock. `speed` < 1 slows it, like the original's pause. */
  advanceClock(dt: number, speed = 1): void {
    this.time = (this.time + (dt * speed) / DAY_LENGTH_SECONDS) % 1;
  }

  // ---- world edits ---------------------------------------------------------

  /**
   * A block is gone. A double chest's other half becomes a single chest first, anyone looking inside is closed,
   * and the contents come back exactly once.
   */
  takeBlock(x: number, y: number, z: number, id: number): ItemStack[] {
    if (isChest(id)) {
      const c = this.blockEntities.chest(x, y, z);
      for (const p of this.players) {
        if (p.menu instanceof ChestMenu && p.menu.chest === c) p.closeMenu();
      }
      const other = chestPartnerPos(id, x, y, z);
      if (other) {
        const [ox, oy, oz] = other;
        const info = chestInfo(this.world.getBlock(ox, oy, oz));
        if (info && info.half !== 0) {
          this.world.setBlock(ox, oy, oz, chestId(info.dir, 0));
          this.blockChanged(ox, oy, oz);
        }
      }
    }
    return this.blockEntities.remove(id, x, y, z);
  }

  /** The signs with writing on them within 
 blocks of (x, z) that are still signs (one whose block was destroyed some other way is not shown). */
  signsAround(x: number, z: number, r: number): { x: number; y: number; z: number; lines: string[] }[] {
    return this.blockEntities.signsNear(x, z, r).filter((s) => signInfo(this.world.getBlock(s.x, s.y, s.z)) !== null);
  }

  /** A block was placed, changed or removed here: liquids and redstone look at what it touches. */
  blockChanged(x: number, y: number, z: number): void {
    this.fluids.notify(x, y, z);
    this.redstone.notify(x, y, z);
  }

  /** Everything that can stand on a pressure plate. */
  private *pressers(): Iterable<{ x: number; y: number; z: number; item: boolean }> {
    for (const p of this.players) if (!p.spectating && p.screen !== 'dead' && !p.riding) yield { x: p.body.x, y: p.body.y, z: p.body.z, item: false };
    for (const m of this.mobs.mobs) if (!m.dead) yield { x: m.body.x, y: m.body.y, z: m.body.z, item: false };
    for (const v of this.vehicles.list) yield { x: v.x, y: v.y, z: v.z, item: false };
    for (const d of this.drops.drops) yield { x: d.x, y: d.y, z: d.z, item: true };
  }

  /** After a block disappears, pop off anything that depended on it (torches, flowers, crops). */
  settleAround(x: number, y: number, z: number, withDrops: boolean): void {
    this.blockChanged(x, y, z);
    railRemoved(this.world, x, y, z);
    const stack: [number, number, number][] = [[x, y, z]];
    while (stack.length) {
      const [sx, sy, sz] = stack.pop()!;
      this.checkFall(sx, sy + 1, sz);
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const nx = sx + dx;
        const ny = sy + dy;
        const nz = sz + dz;
        const id = this.world.getBlock(nx, ny, nz);
        if (id === B.AIR || canStayAt(id, this.world, nx, ny, nz)) continue;
        // What is on somebody's land is not knocked off by a change made on the other side of its edge.
        if (this.land?.fluidBlocked(x, y, z, nx, ny, nz)) continue;
        const def = BLOCKS[id];
        this.world.setBlock(nx, ny, nz, B.AIR);
        this.emitNear(nx, ny, nz, { t: 'burst', id, x: nx, y: ny, z: nz, count: 6 });
        const contents = this.takeBlock(nx, ny, nz, id);
        if (withDrops) {
          for (const s of contents) this.drops.spawnAtBlock(s, nx, ny, nz);
          for (const d of blockDrops(def, null, this.rand)) this.drops.spawnAtBlock(makeStack(d.id, d.count), nx, ny, nz);
        }
        if (isRail(id)) railRemoved(this.world, nx, ny, nz);
        stack.push([nx, ny, nz]);
      }
    }
  }

  // ---- leaves ----------------------------------------------------------------

  /**
   * A log was removed here. Every leaf in reach that has no log within `LEAF_REACH` steps (through leaves) is now cut off from its
   * tree, and fades away over the next few seconds, dropping what leaves drop: a sapling, a stick, now and then an apple. Leaves that
   * another tree still holds stay, and so do leaves a long way off. (Only the region round the cut is looked at, once per log.)
   */
  treeCut(x: number, y: number, z: number, withDrops: boolean): void {
    const HR = 8;
    const DOWN = 6;
    const UP = 26;
    const M = LEAF_REACH;
    const x0 = x - HR - M;
    const y0 = Math.max(0, y - DOWN - M);
    const z0 = z - HR - M;
    const sx = 2 * (HR + M) + 1;
    const sy = Math.min(WORLD_HEIGHT, y + UP + M + 1) - y0;
    const sz = sx;
    const dist = new Uint8Array(sx * sy * sz).fill(255);
    const queue: number[] = [];
    const at = (ix: number, iy: number, iz: number): number => (iy * sz + iz) * sx + ix;
    for (let iy = 0; iy < sy; iy++)
      for (let iz = 0; iz < sz; iz++)
        for (let ix = 0; ix < sx; ix++) {
          if (IS_LOG[this.world.getBlock(x0 + ix, y0 + iy, z0 + iz)]) {
            dist[at(ix, iy, iz)] = 0;
            queue.push(at(ix, iy, iz));
          }
        }
    // Spread from the logs through the leaves, one step at a time.
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      const d = dist[cell];
      if (d >= M) continue;
      const ix = cell % sx;
      const iz = Math.floor(cell / sx) % sz;
      const iy = Math.floor(cell / (sx * sz));
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const nx = ix + dx;
        const ny = iy + dy;
        const nz = iz + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue;
        const n = at(nx, ny, nz);
        if (dist[n] !== 255 || !IS_LEAVES[this.world.getBlock(x0 + nx, y0 + ny, z0 + nz)]) continue;
        dist[n] = d + 1;
        queue.push(n);
      }
    }
    // The leaves in the middle part of the box that nothing holds.
    const queued = new Set(this.fading.map((f) => (f.y * 65536 + f.x) * 65536 + f.z));
    let found = 0;
    for (let iy = M; iy < sy - M && found < LEAF_BATCH; iy++)
      for (let iz = M; iz < sz - M && found < LEAF_BATCH; iz++)
        for (let ix = M; ix < sx - M && found < LEAF_BATCH; ix++) {
          if (dist[at(ix, iy, iz)] !== 255) continue;
          const wx = x0 + ix;
          const wy = y0 + iy;
          const wz = z0 + iz;
          if (!IS_LEAVES[this.world.getBlock(wx, wy, wz)] || queued.has((wy * 65536 + wx) * 65536 + wz)) continue;
          if (this.isProtected(wx, wy, wz) || this.land?.fluidBlocked(x, y, z, wx, wy, wz)) continue;
          this.fading.push({ x: wx, y: wy, z: wz, t: 0.4 + this.rand() * 4.6, drops: withDrops });
          found++;
        }
  }

  private updateLeafDecay(dt: number): void {
    if (this.fading.length === 0) return;
    let done = 0;
    const keep: typeof this.fading = [];
    for (const f of this.fading) {
      f.t -= dt;
      if (f.t > 0 || done >= LEAF_PER_TICK) {
        keep.push(f);
        continue;
      }
      const id = this.world.getBlock(f.x, f.y, f.z);
      if (!IS_LEAVES[id]) continue;
      done++;
      const def = BLOCKS[id];
      this.world.setBlock(f.x, f.y, f.z, B.AIR);
      this.emitNear(f.x, f.y, f.z, { t: 'burst', id, x: f.x, y: f.y, z: f.z, count: 10 });
      this.emitNear(f.x, f.y, f.z, { t: 'sound', sound: def.sound, action: 'break', vol: 0.4 });
      if (f.drops) for (const d of blockDrops(def, null, this.rand)) this.drops.spawnAtBlock(makeStack(d.id, d.count), f.x, f.y, f.z);
      this.blockChanged(f.x, f.y, f.z);
    }
    this.fading = keep;
  }

  /** Light the fuse of the TNT at a cell (it blows up when the fuse runs out, even if the block is gone by then). */
  primeTnt(x: number, y: number, z: number, fuse = TNT_FUSE): void {
    if (this.lit.some((l) => l.x === x && l.y === y && l.z === z)) return;
    this.lit.push({ x, y, z, t: fuse });
    this.emitNear(x, y, z, { t: 'fire', kind: 'hiss', vol: 0.9 });
  }

  /** How many fuses are burning (tests and the debug hook). */
  get litTnt(): number {
    return this.lit.length;
  }

  // ---- vehicles --------------------------------------------------------------

  private updateVehicles(dt: number, active: readonly Player[]): void {
    for (let i = this.pendingVehicles.length - 1; i >= 0; i--) {
      const q = this.pendingVehicles[i];
      q.wait += dt;
      if (q.wait < 0.5) continue;
      if (this.vehicles.spawn(q.kind, q.x, q.y, q.z, q.yaw)) this.pendingVehicles.splice(i, 1);
      else if (q.wait > 8) {
        // Its rail is gone: give the cart back as an item instead of losing it.
        this.drops.spawn(makeStack(VEHICLE_ITEM[q.kind], 1), q.x, q.y + 0.5, q.z, 0, 2, 0, 0.5);
        this.pendingVehicles.splice(i, 1);
      }
    }
    if (this.vehicles.list.length === 0) return;
    // A rider who left the game is no longer in the seat.
    for (const v of this.vehicles.list) if (v.rider && !this.players.some((p) => p.riding === v)) v.rider = null;
    this.vehicles.update(dt, active.filter((p) => !p.riding && !p.spectating && p.screen !== 'dead').map((p) => p.body));
  }

  /** Break a vehicle: whoever rides it gets out, and it drops its item (not for players in creative mode, who just clear it away). */
  destroyVehicle(v: Vehicle, drop: boolean): void {
    const rider = this.players.find((p) => p.riding === v);
    if (rider) rider.dismount();
    this.vehicles.remove(v);
    if (drop) this.drops.spawn(makeStack(VEHICLE_ITEM[v.kind], 1), v.x, v.y + 0.3, v.z, 0, 2.5, 0, 0.3);
    this.emitNear(v.x, v.y, v.z, { t: 'sound', sound: v.kind === 'boat' ? 'wood' : 'stone', action: 'break', vol: 1 });
  }

  private updateTnt(dt: number): void {
    if (this.lit.length === 0) return;
    const due = this.lit.filter((l) => (l.t -= dt) <= 0);
    if (due.length === 0) return;
    this.lit = this.lit.filter((l) => l.t > 0);
    for (const l of due) {
      if (this.world.getBlock(l.x, l.y, l.z) === B.TNT) this.world.setBlock(l.x, l.y, l.z, B.AIR);
      this.explode(l.x + 0.5, l.y + 0.5, l.z + 0.5, TNT_RADIUS, 'tnt');
    }
  }

  /** What the monsters of the Hollow Deep show of what they do: chips of a block of a fitting look (no block is touched) and a sound. x2, y2, z2: the other end of a beam (a healing), or the size of a thinning cloud of spores. */
  private deepFx(kind: MobFx, x: number, y: number, z: number, x2?: number, y2?: number, z2?: number): void {
    const burst = (id: number, px: number, py: number, pz: number, count: number): void => {
      const bx = Math.floor(px);
      const by = Math.floor(py);
      const bz = Math.floor(pz);
      this.emitNear(bx, by, bz, { t: 'burst', id, x: bx, y: by, z: bz, count, soft: true }, 40);
    };
    switch (kind) {
      case 'spores': {
        // The burst (no size given) is thick; the thinning cloud after it is a few chips.
        const thin = x2 !== undefined;
        burst(B.MOSS_BLOCK, x, y, z, thin ? 6 : 26);
        burst(B.SLIME_BLOCK, x + (this.rand() - 0.5) * 2, y + (this.rand() - 0.3), z + (this.rand() - 0.5) * 2, thin ? 3 : 12);
        break;
      }
      case 'heal': {
        // A beam of green light chips from the staff to the one it mends.
        const ex = x2 ?? x;
        const ey = y2 ?? y;
        const ez = z2 ?? z;
        for (let i = 0; i <= 6; i++) burst(B.SLIME_BLOCK, x + ((ex - x) * i) / 6, y + ((ey - y) * i) / 6, z + ((ez - z) * i) / 6, 2);
        burst(B.EMERALD_ORE, ex, ey, ez, 6);
        break;
      }
      case 'summon':
        burst(B.OBSIDIAN, x, y, z, 14);
        burst(B.AMETHYST_BLOCK, x, y + 0.5, z, 6);
        break;
      case 'blink':
        burst(B.OBSIDIAN, x, y, z, 8);
        break;
      case 'curse':
        burst(B.AMETHYST_BLOCK, x, y, z, 8);
        break;
      case 'slam':
        burst(B.COBBLED_DEEPSLATE, x, y + 0.3, z, 16);
        this.emitNear(x, y, z, { t: 'sound', sound: 'stone', action: 'break', vol: 1 }, 40);
        break;
      case 'block':
        burst(B.COBBLED_DEEPSLATE, x, y, z, 4);
        this.emitNear(x, y, z, { t: 'sound', sound: 'stone', action: 'hit', vol: 0.8 }, 32);
        break;
      case 'ignite':
        this.emitNear(x, y, z, { t: 'fire', kind: 'ignite', vol: 0.7 }, 32);
        break;
    }
  }

  private explode(x: number, y: number, z: number, radius: number, source: Mob | 'tnt'): void {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const cz = Math.floor(z);
    const r = Math.ceil(radius);
    const rand = this.rand;
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > radius + 0.4) continue;
          // The rim is ragged: outer blocks survive some of the time.
          if (d > radius - 1 && rand() < 0.45) continue;
          const bx = cx + dx;
          const by = cy + dy;
          const bz = cz + dz;
          const id = this.world.getBlock(bx, by, bz);
          const def = BLOCKS[id];
          if (id === B.AIR || def.liquid || !Number.isFinite(def.hardness)) continue;
          if (this.isGriefProof(bx, by, bz)) continue;
          // The blast sets other TNT off rather than breaking it.
          if (id === B.TNT) {
            this.primeTnt(bx, by, bz, 0.3 + rand() * 0.9);
            continue;
          }
          this.world.setBlock(bx, by, bz, B.AIR);
          const contents = this.takeBlock(bx, by, bz, id);
          for (const s of contents) this.drops.spawnAtBlock(s, bx, by, bz);
          if (rand() < 0.3) {
            for (const drop of blockDrops(def, DIAMOND_PICK, rand)) this.drops.spawnAtBlock(makeStack(drop.id, drop.count), bx, by, bz);
          }
          this.settleAround(bx, by, bz, true);
          if (IS_LOG[id]) this.treeCut(bx, by, bz, true);
        }
    for (let i = 0; i < 10; i++) {
      const bx = cx + Math.floor(rand() * 5) - 2;
      const by = cy + Math.floor(rand() * 4) - 1;
      const bz = cz + Math.floor(rand() * 5) - 2;
      this.emitNear(bx, by, bz, { t: 'burst', id: B.STONE, x: bx, y: by, z: bz, count: 8 }, 64);
    }
    for (const p of this.players) {
      const b = p.body;
      const dPlayer = Math.hypot(b.x - x, b.y + 0.9 - y, b.z - z);
      if (dPlayer < BLAST_HEARING * 1.5) p.emit({ t: 'explode', vol: Math.max(0.15, 1 - dPlayer / BLAST_HEARING) });
      p.hurtByExplosion(x, y, z, radius, source === 'tnt' ? 'tnt' : source.kind);
    }
    this.mobs.explosionDamage(x, y, z, radius, this.mobEvents, source === 'tnt' ? undefined : source);
  }

  // ---- persistence ---------------------------------------------------------

  /** Restore the clock, weather and chests. `weather: false` keeps the current weather. */
  loadState(w: WorldState, opts: { weather?: boolean } = {}): void {
    this.time = w.time;
    this.prevTime = w.time;
    if (w.villagers != null) {
      const saved = folkFromJSON(w.villagers);
      this.restockEpoch = saved.epoch;
      this.folk.clear();
      for (const [k, v] of saved.folk) this.folk.set(k, v);
    }
    if (opts.weather !== false) this.weather.loadJSON(w.weather as never);
    this.blockEntities.loadJSON(w.blockEntities);
    this.sweepCopies();
    this.vehicles.list.length = 0;
    this.pendingVehicles = [];
    this.redstone.load(w.redstone);
    if (Array.isArray(w.vehicles)) {
      for (const q of w.vehicles as Record<string, unknown>[]) {
        const kind = q?.kind;
        const [x, y, z, yaw] = [q?.x, q?.y, q?.z, q?.yaw];
        if ((kind !== 'minecart' && kind !== 'boat') || ![x, y, z].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
        this.pendingVehicles.push({ kind, x: x as number, y: y as number, z: z as number, yaw: typeof yaw === 'number' && Number.isFinite(yaw) ? yaw : 0, wait: 0 });
      }
    }
  }

  saveState(): WorldState {
    const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    // People out and about are written down where they stand.
    for (const list of this.folk.values()) {
      for (const rec of list) {
        if (!rec.mob) continue;
        rec.x = rec.mob.body.x;
        rec.y = rec.mob.body.y;
        rec.z = rec.mob.body.z;
      }
    }
    const villagers = this.folk.size > 0 ? { villagers: plain(folkToJSON(this.restockEpoch, this.folk)) } : {};
    const rigs = [...this.vehicles.list.map((v) => ({ kind: v.kind, x: v.x, y: v.y, z: v.z, yaw: v.yaw })), ...this.pendingVehicles.map(({ kind, x, y, z, yaw }) => ({ kind, x, y, z, yaw }))];
    const vehicles = rigs.length > 0 ? { vehicles: rigs } : {};
    const rs = this.redstone.toJSON();
    const redstone = rs.buttons.length + rs.plates.length > 0 ? { redstone: rs } : {};
    return { v: 1, time: this.time, weather: plain(this.weather.toJSON()), blockEntities: plain(this.blockEntities.toJSON()), ...villagers, ...vehicles, ...redstone };
  }
}
