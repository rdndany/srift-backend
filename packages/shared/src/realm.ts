import { B, BLOCKS, FALLS, IS_LEAVES, IS_LOG, SOUL_WARD_HEIGHT, SOUL_WARD_RADIUS, chestId, chestInfo, chestPartnerPos, doorId, doorInfo, doorKind, isAnvil, isChest } from './blocks';
import { WORLD_HEIGHT } from './chunk';
import { LOOT_TABLES, positionRand, rollChest, spawnerKind } from './loot';
import { bodyOverlapsBlock } from './physics';
import { BlockEntities } from './blockEntities';
import { DAY_LENGTH_SECONDS, daylightAt } from './daylight';
import { DropWorld, type DropCollector } from './dropEntities';
import { XpOrbWorld } from './xpOrbs';
import { BOBBER_LEASH, FishingWorld, type FishingEvents } from './fishing';
import type { WorldAccess } from './headlessWorld';
import { BOTTLE_XP_MAX, BOTTLE_XP_MIN, blockDrops, getItem, toolId } from './items';
import { makeStack, type ItemStack } from './inventory';
import { ChestMenu } from './menu';
import { EffectField } from './abilityEffects';
import { MobManager, MobSpawner, type Mob, type MobEvents, type MobKind, type MobPlayer } from './mobs';
import { hash2 } from './noise';
import type { Player } from './player';
import { Parties } from './party';
import { AuctionHouse } from './auction';
import { StashVault } from './stash';
import { bagDrop } from './bags';
import { skillBookDrop } from './skillbooks';
import { gearDrop, type GearRoll } from './gear';
import { jewelDrop, jewelKind } from './jewels';
import type { DummyStation, NpcStation } from './quests';
import { canStayAt } from './plants';
import { isRail, railRemoved } from './rails';
import { VEHICLE_ITEM, VehicleWorld, type Vehicle, type VehicleKind } from './vehicles';
import { FluidSim } from './fluids';
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
/** A mob a player killed counts towards the quests of every player this close to where it died. */
export const KILL_CREDIT_RANGE = 40;
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

export interface RealmOptions {
  seed: number;
  world: WorldAccess;
  /** Defaults to a generator for `seed`. */
  generator?: WorldGenerator;
  /** Natural mob spawning. Tests that want a quiet world turn it off. */
  naturalSpawning?: boolean;
  /** The villages' people (default: whatever `naturalSpawning` is). */
  villagers?: boolean;
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
    });
    this.fire = new FireSim({
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      // Flames do not start in a protected place, and what is there does not burn (so neither does it need to be put out).
      setBlock: (x, y, z, id) => (id === B.FIRE && this.isProtected(x, y, z) ? false : this.world.setBlock(x, y, z, id)),
      consume: (x, y, z) => {
        if (this.isProtected(x, y, z)) return;
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
      explode: (x, y, z, radius, source) => this.explode(x, y, z, radius, source),
      sound: (sound, mob) => {
        for (const p of this.players) {
          const b = p.body;
          const d = Math.hypot(mob.body.x - b.x, mob.body.y - b.y, mob.body.z - b.z);
          const vol = Math.max(0, 1 - d / MOB_HEARING);
          if (vol > 0) p.emit({ t: 'mob', kind: mob.kind, sound, vol, x: mob.body.x, y: mob.body.y, z: mob.body.z });
        }
      },
      drop: (d, x, y, z) => {
        const a = this.rand() * Math.PI * 2;
        this.drops.spawn(makeStack(d.id, d.count), x, y, z, Math.cos(a) * 1.2, 3, Math.sin(a) * 1.2, 0.5);
      },
      xp: (amount, x, y, z) => this.awardXp(amount, x, y, z),
      coins: (amount, x, y, z) => this.nearestPlayer(x, y, z)?.addCoins(amount),
      // A monster may leave a skill book (any of the twelve, for any class, known or not) and, separately, a bag and a jewel.
      loot: (mob, x, y, z) => {
        for (const found of [skillBookDrop(mob.kind, this.rand), bagDrop(mob.kind, this.rand), jewelDrop(mob.kind, this.rand)]) {
          if (found === null) continue;
          const a = this.rand() * Math.PI * 2;
          this.drops.spawn(makeStack(found, 1), x, y, z, Math.cos(a) * 1.2, 3, Math.sin(a) * 1.2, 0.5);
          // A jewel has a sound of its own, heard by whoever is near enough (louder the closer it falls).
          const jewel = jewelKind(found);
          if (jewel) {
            for (const p of this.players) {
              const vol = Math.max(0, 1 - Math.hypot(x - p.body.x, y - p.body.y, z - p.body.z) / MOB_HEARING);
              if (vol > 0) p.emit({ t: 'jewelDrop', kind: jewel, vol });
            }
          }
        }
        // ...and sometimes a piece of gear with a rarity, a level and bonus stats (see gear.ts).
        const piece = gearDrop(mob.kind, this.rand);
        if (piece) {
          const a = this.rand() * Math.PI * 2;
          this.drops.spawn(piece, x, y, z, Math.cos(a) * 1.2, 3, Math.sin(a) * 1.2, 0.5);
        }
      },
      // A kill counts for every player nearby (a party shares its kills, as in the old MMOs).
      killed: (mob) => {
        for (const p of this.players) {
          if (p.screen === 'dead' || p.spectating) continue;
          if (Math.hypot(p.body.x - mob.body.x, p.body.z - mob.body.z) > KILL_CREDIT_RANGE) continue;
          if (p.quests) p.questEvent({ t: 'kill', mob: mob.kind });
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
        canFit: (s) => !dead && p.inventory.canFit(s),
        collect: (s) => {
          if (dead) return s;
          // What is actually taken (the bag may only have room for part of it) is what the pickup feed shows.
          const before = s.count;
          const { id, name, ench, gear } = s;
          const left = p.inventory.collect(s);
          const taken = before - (left?.count ?? 0);
          if (taken > 0) {
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
      active.map((p) => ({ x: p.body.x, y: p.body.y, z: p.body.z, alive: p.screen !== 'dead' && !p.spectating, take: (v: number) => p.addXp(v, true) })),
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
   * Experience that comes of something happening at a place (a mob dying, a bottle breaking, an ore) comes out as orbs there,
   * which drift to any player who comes near and are taken on touch.
   */
  awardXp(amount: number, x: number, y: number, z: number): void {
    this.xpOrbs.spawn(amount, x, y, z);
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
      const have = this.npcMobs.get(st.index);
      let nearest = Infinity;
      for (const p of players) nearest = Math.min(nearest, Math.hypot(p.x - st.x, p.z - st.z));
      if (have) {
        const gone = have.dead || !this.mobs.mobs.includes(have);
        if (gone || nearest > FOLK_LEAVE) {
          this.npcMobs.delete(st.index);
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
      this.npcMobs.set(st.index, m);
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
    if (slot < 0 || !spot) {
      p.portalCooldown = 3;
      p.emit({ t: 'toast', text: 'The portal is crowded: every dungeon is in use. Try again soon.' });
      return;
    }
    const need = this.generator.instanceRequirement();
    if (need?.item !== undefined && need.consume && !reopen && p.mode === 'survival') p.inventory.remove(need.item, 1);
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
    } else if (need.item !== undefined && !reopen && p.inventory.countOf(need.item) < 1) {
      why = `${need.name} needs ${getItem(need.item).name}.`;
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

  /** Is this block part of a place players may not change? (See `WorldGenerator.isProtected`.) */
  isProtected(x: number, y: number, z: number): boolean {
    return this.generator.isProtected(x, y, z);
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
          if (this.isProtected(wx, wy, wz)) continue;
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
          if (this.isProtected(bx, by, bz)) continue;
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
