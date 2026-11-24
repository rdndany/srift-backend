import {
  B,
  BED_DIRS,
  BED_HEIGHT,
  BLOCKS,
  bedId,
  bedInfo,
  doorId,
  doorInfo,
  doorKind,
  gateId,
  gateInfo,
  gateKind,
  opensByHand,
  isAnvil,
  isBed,
  isInteractive,
  leverInfo,
  buttonInfo,
  isSwitchable,
  signInfo,
  campfireId,
  campfireInfo,
  chestId,
  chestMerge,
  isChest,
  lanternId,
  lanternInfo,
  materialBlock,
  slabInfo,
  strippedOf,
  trapdoorId,
  trapdoorInfo,
  trapdoorKind,
  woolId,
  DRESS,
  candleId,
  candleInfo,
  candleItem,
  pottedOf,
} from './blocks';
import { ARMOR_SLOTS, armorWear, reduceDamage } from './armor';
import { COMPANIONS, companionBonusText } from './companions';
import { WING_EXHAUSTION_PER_BLOCK, WING_MIN_HUNGER, WING_TAKEOFF, wingBonusText, wingByNumber, WINGS, type WingDef } from './wings';
import { ENCH, MAX_SHELVES, efficiencyBonus, levelOf, protectionFactor, protectionPoints, sharpnessBonus, siphonShare, wearAfterUnbreaking, type ProtectionKind } from './enchant';
import { BLOCK_XP, Experience } from './experience';
import type { BlockEntities } from './blockEntities';
import type { DropWorld } from './dropEntities';
import type { XpOrbWorld } from './xpOrbs';
import { ROD_WEAR, bobberMode, catchXp, isFishingRod, pullMob, rodEnchants, rollCatch, type Bobber, type BobberDraw, type FishingWorld } from './fishing';
import type { WorldAccess } from './headlessWorld';
import { BAG_SLOTS, bagInventory, strandedSlots } from './bags';
import { organizeInventory } from './organize';
import { formatEmberTime, EMBER_CAST, EMBER_COOLDOWN, EMBER_MOVE_LIMIT } from './emberstone';import { MOUNTS, MOUNT_BITE, MOUNT_BLOCK_TEXT, MOUNT_HOWL, MOUNT_CAST, MOUNT_MOVE_LIMIT, MOUNT_STEP_HEIGHT, MOUNTED_EYE, RIDE_CHECK, RIDE_GRACE, mountBlocker, mountDef, rideEnclosed, mountSpeedText, type MountId, type MountView } from './mounts';
import { Container, HOTBAR_SLOTS, canMerge, cloneStack, makeStack, maxStackOf, type ItemStack } from './inventory';
import { I, PEARL_TRIP_DAMAGE, accessoryOfItem, bagSlotsOf, bedItemColor, companionOfItem, wingOfItem, blockDrops, breakTime, canHarvest, dyeColor, getItem, harvestHint, holdsInOffhand, isUndroppable, mountOfItem, outfitItems, outfitSetFits, outfitSetOfItem, silkKeeps, skillBookAbility, usedOnBlock, type ItemDef, type ItemUse, type WeaponDef } from './items';
import { AnvilMenu, ChestMenu, CraftingMenu, EnchantMenu, CreativeMenu, FurnaceMenu, GrindstoneMenu, TradeMenu, type Menu } from './menu';
import { tooltipName } from './tooltip';
import { ARMOR_STAND_POSES, ARROW_GRAVITY, WOOL_REGROW, arrowSpeed, rayAabb, type Mob, type MobEffect, type MobEffects, type MobKind, type MobManager } from './mobs';
import { growTree, isSapling } from './trees';
import { PLAYER_EYE, bodyOverlapsBlock, collides, createBody, stepPlayer, type Body, type MoveInput } from './physics';

/** A Ground Slam: seconds the body crouches before it springs, and seconds the figure stays down on its shield after the blow. */
export const SLAM_WIND = 0.2;
export const SLAM_IMPACT = 0.4;
/** A Shield Bash: seconds the figure takes to draw the shield back, drive it forward and come out of it (others see it from `bashAge`). */
export const BASH_ANIM = 0.5;
import { canStayAt, growColumn, growFruit, growVine, isTillable, isYoungCrop, lookDir, placementFor, placesUpper, ripeCrop, stemFruit } from './plants';
import { seatDrop } from './shapes';
import { FLUID_KIND, FLUID_WATER, isFluidSource } from './fluids';
import { IS_LIQUID, IS_LOG, IS_SOLID, cakeId, cakeInfo } from './blocks';
import { isRail, railPlaced } from './rails';
import { type Rider, type Vehicle, type VehicleKind } from './vehicles';
import { raycast, type RayHit } from './raycast';
import { aimThroughCrosshair, lookVector, sanitizeCamera } from './crosshair';
import type { Realm } from './realm';
import { GuardedWorld } from './landGuard';
import { parseLandCommand, publicLandConfig, type LandCommand } from './landProtocol';
import type { LandClaim } from './landClaims';
import { MESSAGES as LAND_MESSAGES, type Econ } from './landService';
import type { PlayerSave, SaveMode } from './save';
import type { Weather, WeatherKind } from './weather';
import type { WorldGenerator } from './worldgen';
import { campfireFood } from './campfire';
import { COOK_SECONDS } from './smelting';
import { EXHAUSTION, Vitals } from './survival';
import type { BossView } from './boss';
import type { RiftView } from './rift';
import type { DungeonView } from './dungeonView';
import type { ClassView, Command, InputFrame, SessionEvent, SessionScreen } from './sessionProtocol';
import { MAX_COINS, stackSellPrice, shopOf } from './economy';
import { AUCTIONEER, DEFAULT_AUCTION_QUERY, cleanQuery, depositFor, sellBlocker, type AuctionQuery, type TokenDesk } from './auction';
import { isStashkeeper, stashBlocker } from './stash';
import { AchievementBook, ACH_TIERS, type AchStat, type AchievementDef } from './achievements';
import { BountyBook, dayOf, type BountyDef } from './bounties';
import { rollQuestDrops } from './questDrops';
import { FIRST_QUEST, NPCS, QuestLog, npcById, questById, rewardCoins, rewardItems, type QuestEvent, type QuestProgress } from './quests';
import { ABILITY_BY_ID, ClassState, abilitiesOf, abilityAt, type AbilityDef, type CastBlock } from './abilities';
import type { EffectOwner, Fx } from './abilityEffects';
import { creativeGear } from './creative';
import { accessoryModifiers, cloneGear, gearKey, gearModifiers, glyphKey, glyphModifiers, pickRarity, randomGear } from './gear';
import { ACCESSORY_SLOT_COUNT, NECKLACE_SLOT, accessorySlotsOf } from './accessories';
import { HK } from './hollowKingData';
import { jewelKind, useJewel } from './jewels';
import { CLASSES, offhandModifier, rollDamage, swingRate, type ClassId, type DamageKind } from './classes';
import { POINTS_PER_LEVEL, type AttrKey } from './statPoints';
import { TUNING, castCost } from './tuning';

/** Blocks per second under which a player counts as standing still (the speed dies away within a fifth of a second of letting go of the keys). */
const STILL_SPEED = 0.3;
export const REACH = 5;
/** How far from a sign (blocks, from the eye to its middle) its writing may be changed: a little more than the reach, for the lag between the click and the words. */
const SIGN_REACH = REACH + 3;
/** How far a blow reaches, and how far beside a mob's body or head it still lands: what the screen showed a moment ago is not exactly where the mob is now (it walks, and the picture is a tick or two behind). */
const MELEE_REACH = 4;
/** A dagger's combo: this many stabs, each within this many seconds of the last, and the last hits half as hard again. */
const COMBO_STABS = 3;
const COMBO_WINDOW = 1;
/** The dagger of a ranger with a bow in the hand only reaches this far from the eye along the line of sight (the mob has to be right up against the body: about a stride at most). */
const STAB_REACH = 1;
/** While stabbing with a dagger (this many seconds after a stab) a blow taken is parried or dodged with this chance. */
const STAB_GUARD_TIME = 0.6;
const STAB_GUARD_CHANCE = 0.02;
const MELEE_MARGIN = 0.15;
const MELEE_LAG = 0.12;
/** Fixed simulation step. */
export const STEP = 1 / 60;
/** How long a status from a monster's blow lasts when it does not say (poison: 7 s, 12 on hardcore), and how much of its damage a weakened player does. */
const AFFLICT_SECONDS: Record<MobEffect, number> = { poison: 7, root: 1.6, slow: 3, weak: 6, burn: 4 };
const WEAK_DAMAGE = 0.6;
/** Chance that one use of an anvil wears it down a step. */
export const ANVIL_WEAR_CHANCE = 0.12;
/** Points of damage an ender pearl's trip costs. */
export const PEARL_DAMAGE = PEARL_TRIP_DAMAGE;
const EAT_TIME = 1.4;
const BOW_FULL_DRAW = 1.0;
/** A crossbow is drawn fully or not at all, and takes this long to. */
const CROSSBOW_DRAW = 0.8;

/** Hard difficulty: mobs and explosions hurt this much more than on Normal. */
export const HARD_DAMAGE = 1.5;
/** Walk this far from the person you are talking to and the conversation ends. */
export const DIALOG_RANGE = 7;

/** A raised shield only stops hits after this long (the original's five ticks). */
export const SHIELD_RAISE = 0.25;
/** A hit that lands within this many seconds after the guard comes up (after `SHIELD_RAISE`) is parried: no wear on the shield. */
export const PARRY_WINDOW = 0.2;

/** Eye height above the mattress while lying down. */
export const SLEEP_EYE = 0.2;

/** Starting hotbar for creative mode. */
/** Uses of the item in the main hand that keep the use button for themselves: a shield in the off hand is not raised by it. */
const TAKES_THE_BUTTON: ReadonlySet<ItemUse> = new Set<ItemUse>(['xp_bottle', 'pearl', 'emberstone', 'skill_book', 'codex', 'bucket', 'armor_stand', 'fishing_rod']);

export const CREATIVE_HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.GLASS, B.SAND, B.GLOWSTONE];

/** What a death costs: this share of the experience, and this share of the durability of the armor, shield and tool you have equipped (never breaking them). */
export const DEATH_XP_LOSS = 0.25;
export const DEATH_WEAR = 0.2;
const DEATH_WEAR_PERCENT = Math.round(DEATH_WEAR * 100);

export const DEATH_TEXT: Record<string, string> = {
  fall: 'You hit the ground too hard',
  drown: 'You drowned',
  starve: 'You starved to death',
  void: 'You fell out of the world',
  mob: 'You were slain',
  explosion: 'You were blown up',
  lava: 'You tried to swim in lava',
  cactus: 'You were pricked to death',
  berry: 'You were scratched to death',
  fire: 'You burned to death',
  campfire: 'You walked into a campfire',
  anvil: 'You were squashed by a falling anvil',
};

/** Turn one frame of input into movement for the physics step. Shared with client-side prediction. */
/** While charging the body runs flat out along yaw, whatever the keys say (jumping the one block that is in the way). The server and the client's own prediction both use this. */
export function rushMove(move: MoveInput, yaw: number, speed: number, hop = false): void {
  move.forward = 1;
  move.strafe = 0;
  move.sprint = false;
  move.sneak = false;
  move.jump = hop;
  move.yaw = yaw;
  move.speed = speed;
  move.accel = 90;
}

/**
 * `wing`: the wings worn (they make the wearer quicker on foot), and `wingFlight`: the wearer flies on them (not the flight of creative mode):
 * the flight is then at the speed of the wings, without sprinting, and it climbs and sinks at their pace.
 */
export function buildMove(f: InputFrame, flying: boolean, canSprint: boolean, noclip = false, speedMul = 1, wing: WingDef | null = null, wingFlight = false): MoveInput {
  const quick = wing ? speedMul * wing.walk : speedMul;
  const winged = !!wing && wingFlight && flying;
  return {
    ...(noclip ? { noclip: true } : {}),
    ...(quick !== 1 ? { speedMul: quick } : {}),
    ...(winged ? { flyBoost: wing!.fly, flyRise: wing!.rise, flyAssist: true } : {}),
    forward: f.forward,
    strafe: f.strafe,
    jump: f.jump,
    sprint: f.sprint && f.forward > 0 && canSprint && !winged,
    sneak: f.sneak && !flying,
    fly: flying,
    flyDown: flying && f.sneak,
    yaw: f.yaw,
  };
}

/** A rooted player (see `Player.rootTime`) neither walks nor jumps: the move of the frame is emptied. The server and the client's own prediction both do this. */
export function rooted(move: MoveInput): void {
  move.forward = 0;
  move.strafe = 0;
  move.jump = false;
  move.sprint = false;
}

export interface PlayerOptions {
  mode?: SaveMode;
  /** One life on Hard difficulty (see `Player.hardcore`). */
  hardcore?: boolean;
  /** Shown to other players. */
  name?: string;
  /** The character's class (permanent). Without one the player plays the unmodified game. */
  classId?: ClassId | null;
  /**
   * The account this character belongs to: what the Auction House knows them by (its mail waits for the account). A guest has none
   * (null) and can only look at the house. Left out, it is the one account of a single-player world.
   */
  account?: string | null;
  /**
   * The wallet this character belongs to: whose Stash it opens (every character of one wallet shares one). A guest has none (null)
   * and has no stash. Left out, it is the one wallet of a single-player world.
   */
  wallet?: string | null;
}

/**
 * One player's side of the game: body, vitals, inventory, menus, mining and building. It lives in a
 * `Realm`, which owns everything shared (blocks, mobs, drops, weather, the clock).
 *
 * It has no rendering, audio or DOM. A client feeds it `InputFrame`s and `Command`s and plays back
 * the `SessionEvent`s it emits.
 */
export class Player implements EffectOwner {
  readonly body: Body;
  /** The class this character plays, with its level, resource and cooldowns (null: no class). Never changes: a class is permanent. */
  readonly cls: ClassState | null;
  /** The bags worn (up to four, see bags.ts): each opens room in `inventory` after the backpack. */
  readonly bags = new Container(BAG_SLOTS);
  readonly inventory = bagInventory(this.bags);
  readonly vitals = new Vitals();
  readonly xp = new Experience();
  /** Worn armor: 0 helmet, 1 chestplate, 2 leggings, 3 boots. */
  readonly armor = new Container(ARMOR_SLOTS.length);
  /** The off hand: a single slot that takes a shield. */
  readonly offhand = new Container(1);
  readonly name: string;
  /** What the Auction House knows this player by (null: a guest). */
  readonly account: string | null;
  /** Whose Stash this character opens (null: a guest, who has none). */
  readonly wallet: string | null;
  /** The player changed the Stash (or what they carry because of it) since a server last looked: it should be written down. */
  stashTouched = false;
  /** What the player last searched the Auction House for (it is shown again after everything they do there). */
  private auctionQuery: AuctionQuery = { ...DEFAULT_AUCTION_QUERY };
  /** The player changed the Auction House (or what they carry because of it) since a server last looked: it should be written down. */
  auctionTouched = false;

  mode: SaveMode;
  /**
   * Hardcore: survival with one life. Mobs hit 1.5 times as hard and starving can kill (Hard
   * difficulty), the game mode cannot be changed, and dying ends the world: you can only spectate.
   */
  hardcore = false;
  /** Hardcore: this player has died. Saved, so closing the page does not bring them back. */
  gameOver = false;
  /** Hardcore, after dying: floating through the world with no way to touch it. */
  spectating = false;
  selected = 0;
  menu: Menu | null = null;
  /** The villager whose trade screen is open. */
  tradingWith: Mob | null = null;
  screen: SessionScreen = 'none';
  flying = false;
  /** True once the terrain around the player exists and the simulation runs. */
  ready = false;
  yaw = 0;
  pitch = 0;
  /**
   * Third person: where the client's camera is (it looks along yaw/pitch). The aim then goes from the eyes to what that camera's
   * crosshair is on, see `look()`. Null in first person, where the eyes are the camera.
   */
  private camera: { x: number; y: number; z: number } | null = null;
  /** The aim worked out from `camera`, once per frame (null: not yet). */
  private aimCache: { x: number; y: number; z: number } | null = null;
  sneaking = false;
  /** Block under the crosshair (null when aiming at a mob or nothing). */
  target: RayHit | null = null;
  /** 0..1 mining progress of the targeted block. */
  breakProgress = 0;
  /** 0..1 value for the HUD action bar: mining, or eating. */
  hudProgress = 0;
  /** 0..1 how far the bow is drawn. */
  bowDraw = 0;
  /** The shield is raised (use button held with a shield in the off hand, or in the hand). */
  blocking = false;
  /** How long the shield has been up; it only stops hits after `SHIELD_RAISE`. */
  blockTime = 0;
  private shieldInOffhand = false;
  /** The bed this player is lying in (its head block and the way it points), or null when awake. */
  sleeping: { x: number; y: number; z: number; dir: number } | null = null;
  /** The minecart or boat this player sits in (the body follows it; sneak gets out). */
  riding: Vehicle | null = null;
  /** Ability effects in the world (what a client draws as flashes, rings and falling meteors). */
  get fx(): readonly Fx[] {
    return this.realm.effects.fx;
  }
  /** Every minecart and boat in the world (what a client draws). */
  get vehicles(): readonly Vehicle[] {
    return this.realm.vehicles.list;
  }
  /** What the seat needs to know about this player (see vehicles.ts). */
  readonly rider: Rider;
  /** Seconds spent in bed; the night is skipped once everyone has slept SLEEP_SKIP_SECONDS. */
  sleepTime = 0;
  /** The bed (its head block) to respawn at; null = the world's spawn. */
  spawnPoint: { x: number; y: number; z: number } | null = null;
  killedBy = '';
  /** Adventure mode: this player's quests (null in every other world). */
  readonly quests: QuestLog | null;
  /** The deeds counted and the achievements won (see achievements.ts). */
  readonly ach = new AchievementBook();
  /** Today's daily bounties and how far this character is with them (see bounties.ts). */
  readonly bounty = new BountyBook();
  /** The counts have changed (or the client has not been told them yet): they go out at the next whole second. */
  private bountyDirty = true;
  private achSeconds = 0;
  private achLevelTimer = 0;
  /** The quest giver (an id of `NPCS`) being talked to, while the dialog is open. */
  dialogNpc: string | null = null;
  /** The money the character carries (see economy.ts). */
  coins = 0;
  /** The named place the player is in (an id of `ZONES`), and a timer for looking it up. */
  private zoneId: string | null = null;
  /** Kills without a quest drop, by quest (the drops that are certain after a number of misses; see questDrops.ts). */
  private readonly questMisses = new Map<string, number>();
  private questTimer = 0;

  private events: SessionEvent[] = [];
  private queue: Command[] = [];
  private spawned = false;
  private savedMobs: unknown = null;
  private acc = 0;
  private uiTimer = 0;
  private prevOnGround = false;
  private prevInWater = false;
  private stepAcc = 0;
  private lavaTimer = 0.5;
  private cactusTimer = 0.5;
  /** Sweet berry bushes scratch while you walk through a ripe one. Starts full so the first step hurts. */
  private berryTimer = 0.5;
  private campfireTimer = 0.5;
  /** The mark that shows an Arcane Shield around this player while it holds: it follows them and ends with the shield. */
  private shieldMark: Fx | null = null;
  /** A Ground Slam in the air: the blast comes when the feet are back on the ground. */
  private slamLeap: { def: AbilityDef; time: number; launched: boolean } | null = null;
  /** Seconds left of the blow after a slam has landed (the figure is still down on its shield). */
  private slamImpact = 0;
  /** A Charge under way: the body runs along `yaw` at `speed` until `left` blocks are covered or it is stopped. */
  private rush: { yaw: number; speed: number; left: number; time: number; stall: number; dx: number; dz: number; hit: Set<Mob>; def: AbilityDef; mark: Fx } | null = null;
  /** Seconds left alight (flames and lava set you on fire; water puts it out). */
  onFire = 0;
  private fireTimer = 0.5;
  private burnTimer = 0;
  private peakY: number;
  private lastHealth: number;
  private breakKey = '';
  private hitTimer = 0;
  private placeCooldown = 0;
  private breakCooldown = 0;
  private attackCooldown = 0;
  /** A dagger's quick stabs: how many in a row, and the seconds since the last. */
  private stabs = 0;
  private stabAge = 9;
  private eatTimer = 0;
  /** The Emberstone: seconds cast so far (0: not casting), where the cast began, and the seconds it still has to rest. */
  private emberTimer = 0;
  private emberFrom = { x: 0, y: 0, z: 0, health: 0 };
  /** After a cast is lost the button must be let go before the stone tries again. */
  private emberHeld = false;
  emberCooldown = 0;
  /** The mount slot: the horn of the mount the mount key summons (shown top right of the screen, and beside the off hand in the inventory). */
  readonly mountSlot = new Container(1);
  /** The outfit slot: the glowing set the hero wears (it shows to everyone, and nothing else changes). */
  readonly outfitSlot = new Container(1);
  /** The companion that follows the hero (one item, see companions.ts). */
  readonly companionSlot = new Container(1);
  /** How long the feet have been on the ground in a flight on wings (the flight ends after a moment of it). */
  private wingGroundT = 0;
  /** The wings the hero wears (one item, see wings.ts). */
  readonly wingSlot = new Container(1);
  /** The jewelry the hero wears: two rings (slots 0 and 1) and a necklace (slot 2), see accessories.ts. */
  readonly accessories = new Container(ACCESSORY_SLOT_COUNT);
  /** The mount being ridden. */
  mountId: MountId | null = null;
  /** How long (seconds) the rider has been enclosed without a break, and the seconds to the next look (see `rideEnclosed`). */
  private rideCover = 0;
  private rideCheck = 0;
  /** A mount being summoned: which, how many seconds so far, and where and how healthy the player was when it began (moving or a hit loses it). */
  /** Seconds until the mount's two skills (the bite, the howl) can be used again. */
  biteCd = 0;
  howlCd = 0;
  private mountCast: { id: MountId; time: number; x: number; y: number; z: number; health: number } | null = null;
  private rightWas = false;
  private bowCharge = 0;
  /** Seconds before the next bolt of a staff, wand or spellbook. */
  private castCooldown = 0;
  /** What the last input frame asked for, so a roll goes the way the player was moving. */
  private moveIn = { forward: 0, strafe: 0 };

  constructor(
    readonly realm: Realm,
    opts: PlayerOptions = {},
  ) {
    this.mode = opts.mode ?? 'survival';
    this.hardcore = opts.hardcore === true && this.mode === 'survival';
    this.name = opts.name ?? 'player';
    this.account = opts.account === undefined ? 'local' : opts.account;
    this.wallet = opts.wallet === undefined ? 'local' : opts.wallet;
    // A new survival character begins where the world puts newcomers (the Adventure cave); a creative one in the open.
    const spawn = this.mode === 'survival' ? realm.nextStart() : realm.nextSpawn();
    this.body = createBody(spawn.x, spawn.y, spawn.z);
    this.quests = realm.generator.kind === 'adventure' ? new QuestLog() : null;
    this.syncQuests();
    this.rider = { body: this.body, input: { forward: 0, fx: 0, fz: -1 } };
    this.cls = opts.classId ? new ClassState(opts.classId) : null;
    this.applyClassVitals(true);
    this.peakY = this.body.y;
    this.lastHealth = this.vitals.health;
    if (this.mode === 'creative') this.setCreativeHotbar();
    realm.players.push(this);
  }

  /** Leave the realm (disconnect). */
  leave(): void {
    this.dismount();
    this.realm.fishing.take(this);
    this.realm.effects.dropOwner(this);
    this.realm.parties.onLeave(this);
    const i = this.realm.players.indexOf(this);
    if (i >= 0) this.realm.players.splice(i, 1);
  }

  // ---- shared state, by shortcut ---------------------------------------------

  /** The world as this player's hands see it: where the realm has land, every write is asked of the land first (see landGuard.ts). */
  private guarded: GuardedWorld | null = null;
  get world(): WorldAccess {
    if (!this.realm.land) return this.realm.world;
    return (this.guarded ??= new GuardedWorld(
      this.realm.world,
      () => this.realm.land,
      () => this.account,
      (_x, _y, _z, why, owner) => this.landNotice(why, owner),
    ));
  }
  get generator(): WorldGenerator {
    return this.realm.generator;
  }
  get rand(): () => number {
    return this.realm.rand;
  }
  get mobs(): MobManager {
    return this.realm.mobs;
  }
  get weather(): Weather {
    return this.realm.weather;
  }
  get drops(): DropWorld {
    return this.realm.drops;
  }
  get xpOrbs(): XpOrbWorld {
    return this.realm.xpOrbs;
  }
  get fishing(): FishingWorld {
    return this.realm.fishing;
  }
  /** The bobbers to draw (the line out of a hand, and where the float is): yours, and those of the other players of the realm. */
  get bobbers(): { readonly bobbers: readonly BobberDraw[] } {
    return {
      bobbers: this.realm.fishing.bobbers.map((b) => {
        const who = b.owner as Player;
        return { id: b.id, x: b.x, y: b.y, z: b.z, mode: bobberMode(b), own: who === this, owner: who === this ? null : { x: who.body.x, y: who.body.y, z: who.body.z, yaw: who.yaw } };
      }),
    };
  }
  get blockEntities(): BlockEntities {
    return this.realm.blockEntities;
  }
  get time(): number {
    return this.realm.time;
  }
  set time(t: number) {
    this.realm.time = t;
  }

  // ---- state views ---------------------------------------------------------

  get held(): ItemStack | null {
    return this.inventory.get(this.selected);
  }

  /** 0 (night) .. 1 (full day), including storm darkness and lightning. */
  get daylight(): number {
    return this.realm.daylight;
  }

  get invulnerable(): boolean {
    return this.mode === 'creative' || this.spectating;
  }

  /** Eye position, the origin of aiming. */
  eye(): { x: number; y: number; z: number } {
    return this.eyeAt(this.body);
  }

  /** The eye of a body standing at `at` (for the real body, `eye()`). */
  eyeAt(at: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    if (this.sleeping) return { x: at.x, y: at.y + SLEEP_EYE, z: at.z };
    // On a mount the eyes sit higher, and a rider cannot sneak.
    if (this.mountId) return { x: at.x, y: at.y + MOUNTED_EYE, z: at.z };
    return { x: at.x, y: at.y + PLAYER_EYE - (this.sneaking && !this.flying ? 0.2 : 0), z: at.z };
  }

  /** The body one physics step ago, and how far between it and the body the picture is (0..1): see `viewPos`. */
  private viewPrev = { x: 0, y: 0, z: 0 };
  private viewBlend = 1;

  private markView(): void {
    this.viewPrev.x = this.body.x;
    this.viewPrev.y = this.body.y;
    this.viewPrev.z = this.body.z;
  }

  /**
   * Where the body is to be DRAWN: between its last two physics steps, by how far into the next one the frame is. The body itself moves in jumps
   * of 1/60 s, which shows as judder on a screen that does not run at exactly 60 frames a second.
   */
  viewPos(): { x: number; y: number; z: number } {
    const b = this.body;
    const p = this.viewPrev;
    // After a jump (a teleport, a respawn) there is nothing to blend from.
    if (Math.abs(b.x - p.x) + Math.abs(b.y - p.y) + Math.abs(b.z - p.z) > 2) return { x: b.x, y: b.y, z: b.z };
    const a = this.viewBlend;
    return { x: p.x + (b.x - p.x) * a, y: p.y + (b.y - p.y) * a, z: p.z + (b.z - p.z) * a };
  }

  /**
   * Unit vector of the aim, from the eyes. In first person that is the way the head points (yaw and pitch); in third person it
   * is toward what the camera's crosshair is on, so a blow, an arrow or a spell lands where the crosshair shows.
   */
  look(): { x: number; y: number; z: number } {
    if (!this.camera) return lookVector(this.yaw, this.pitch);
    this.aimCache ??= aimThroughCrosshair(this.world, this.mobs, this.eye(), this.camera, this.yaw, this.pitch);
    return { ...this.aimCache };
  }

  deathMessage(): string {
    const base = DEATH_TEXT[this.vitals.lastDamage ?? ''] ?? 'You died';
    if ((this.vitals.lastDamage === 'mob' || this.vitals.lastDamage === 'explosion') && this.killedBy) {
      const by = this.killedBy === 'arrow' ? 'a skeleton' : this.killedBy === 'tnt' ? 'TNT' : `a ${this.killedBy.replace('_', ' ')}`;
      return `${base} by ${by}`;
    }
    return base;
  }

  furnaceState(): { burn: number; cook: number } | null {
    if (!(this.menu instanceof FurnaceMenu)) return null;
    const f = this.menu.furnace;
    return { burn: f.burnTotal > 0 ? Math.max(0, f.burnLeft / f.burnTotal) : 0, cook: Math.min(1, f.cook / COOK_SECONDS) };
  }

  // ---- events --------------------------------------------------------------

  emit(e: SessionEvent): void {
    if (e.t === 'swing') {
      // A weapon in the hand swings as fast as its attack speed: others see it from `swingRate`, and so does the client for its own arm.
      this.swingAge = 0;
      this.swingRate = this.holdsWeapon() ? swingRate(this.cls?.stats.attackSpeed ?? 1) : 1;
      if (this.swingRate !== 1 && !e.off) e = { ...e, rate: this.swingRate };
    }
    this.events.push(e);
  }

  /** How much faster than usual the last swing runs (1 for the usual one; mining and placing are always 1). */
  swingRate = 1;

  /** A blade, a class weapon or a bow in the hand: what attack speed speeds up. */
  private holdsWeapon(): boolean {
    const h = this.held;
    if (!h) return false;
    const it = getItem(h.id);
    return !!it.weapon || it.tool?.kind === 'sword' || it.use === 'bow' || it.use === 'crossbow';
  }

  /** Seconds since the arm last swung (a blow, a placed block, a block being mined): other players see it from this. */
  swingAge = 9;
  /** Seconds since a Shield Bash was thrown (`BASH_ANIM` and more: none): other players see the figure drive its shield forward from this. */
  bashAge = 9;

  /** Hand over everything that happened since the last call. */
  drainEvents(): SessionEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---- input ---------------------------------------------------------------

  /** Queue a command; it runs at the start of the next frame. */
  command(c: Command): void {
    this.queue.push(c);
  }

  protected runCommands(): void {
    const list = this.queue;
    this.queue = [];
    for (const c of list) this.apply(c);
  }

  /** Apply a command immediately (what a frame does for queued ones). */
  apply(c: Command): void {
    switch (c.t) {
      case 'closeMenu':
        this.closeMenu();
        return;
      case 'click':
        if (this.menu) {
          // Right-clicking a skill book in the bags reads it (it never goes onto the cursor).
          if (c.button === 1 && !this.menu.cursor) {
            const slot = this.menu.slots[c.slot];
            if (slot && slot.container === this.inventory && slot.kind === 'normal' && (this.learnFromBook(slot.index) || this.openCodex(slot.index) || this.equipHorn(slot.index) || this.equipOutfit(slot.index) || this.equipCompanion(slot.index) || this.equipWings(slot.index) || this.equipAccessory(slot.index))) return;
          }
          // A jewel on the cursor, clicked on a piece of equipment, is used on it (instead of swapping places with it).
          if (c.button === 0 && this.useJewelOnSlot(c.slot)) {
            this.emit({ t: 'inv' });
            return;
          }
          this.menu.click(c.slot, c.button);
          this.emit({ t: 'inv' });
          this.syncChestViewers();
        }
        return;
      case 'shift':
        if (this.menu) {
          this.menu.shiftClick(c.slot);
          this.emit({ t: 'inv' });
          this.syncChestViewers();
        }
        return;
      case 'organize':
        if (this.menu && organizeInventory(this.inventory)) this.emit({ t: 'inv' });
        return;
      case 'forge':
        if (this.menu instanceof CraftingMenu && this.menu.startForge(() => this.rand(), c.all === true)) {
          this.emit({ t: 'forgeStart', craft: (this.menu.forging?.sets ?? 0) > 0 });
          this.emit({ t: 'inv' });
        }
        return;
      case 'creativeAmount':
        if (this.menu instanceof CreativeMenu) this.menu.setAmount(c.n);
        return;
      case 'creativeClear':
        if (this.menu instanceof CreativeMenu) {
          this.menu.clearAll();
          this.emit({ t: 'inv' });
        }
        return;
      case 'creativeGear':
        if (this.menu instanceof CreativeMenu) {
          const made = creativeGear(c.spec, () => this.rand());
          const left = made ? this.menu.give(made) : null;
          if (left) this.dropFromPlayer(left, 2);
          this.emit({ t: 'inv' });
        }
        return;
      case 'recipe':
        if (this.menu instanceof CraftingMenu && this.menu.fillRecipe(c.index, c.all)) this.emit({ t: 'inv' });
        return;
      case 'trade':
        if (this.menu instanceof TradeMenu) {
          this.menu.select(c.index);
          this.emit({ t: 'inv' });
        }
        return;
      case 'anvilName':
        if (this.menu instanceof AnvilMenu) {
          this.menu.setName(c.name);
          this.emit({ t: 'inv' });
        }
        return;
      case 'enchant':
        if (this.menu instanceof EnchantMenu && (c.erase ? this.menu.erase(c.id) : this.menu.inscribe(c.id))) this.emit({ t: 'inv' });
        return;
      case 'respawn':
        this.respawnFromDeath();
        return;
      case 'wake':
        this.wake();
        return;
      case 'dropCursor': {
        // A stack let go of outside the screen lands on the ground in front of the player.
        const m = this.menu;
        const s = m?.cursor;
        if (!m || !s) return;
        if (this.keepsItem(s.id)) return;
        const n = c.all ? s.count : 1;
        this.dropFromPlayer({ ...s, count: n });
        s.count -= n;
        if (s.count <= 0) m.cursor = null;
        this.emit({ t: 'inv' });
        return;
      }
      case 'destroyCursor': {
        // The trash of an open screen: what is on the cursor is destroyed (the Emberstone and the map are kept).
        const m = this.menu;
        const s = m?.cursor;
        if (!m || !s) return;
        if (this.keepsItem(s.id)) return;
        const n = c.all ? s.count : 1;
        s.count -= n;
        if (s.count <= 0) m.cursor = null;
        this.emit({ t: 'inv' });
        return;
      }
      case 'quest':
        this.questCommand(c);
        return;
      case 'shop':
        this.shopCommand(c);
        return;
      case 'auction':
        this.auctionCommand(c);
        return;
      case 'stash':
        this.stashCommand(c);
        return;
      case 'land':
        this.landCommand(c);
        return;
      case 'sign':
        this.signCommand(c);
        return;
      case 'party': {
        const reply = this.realm.parties.run(this, c.a, c.name);
        if (reply) this.emit({ t: 'toast', text: reply });
        this.realm.parties.sync();
        return;
      }
      case 'stat':
        this.spendStatPoints(c.stat, c.n);
        return;
      case 'statReset':
        this.resetStatPoints();
        return;
      default:
    }
    // Everything else is something a player does while in control (and a spectator only watches).
    if (!this.ready || this.screen !== 'none' || this.spectating || this.sleeping) return;
    switch (c.t) {
      case 'select':
        this.selectSlot(c.slot);
        return;
      case 'scroll':
        this.selectSlot(this.selected + c.delta);
        return;
      case 'mode':
        this.setMode(c.mode);
        return;
      case 'fly':
        if (this.mode === 'creative') this.flying = !this.flying;
        else if (this.wingNumber > 0) this.toggleWingFlight();
        return;
      case 'swap':
        this.swapHands();
        return;
      case 'home':
        this.respawn();
        return;
      case 'inventory':
        this.openMenu(this.mode === 'creative' ? new CreativeMenu(this.inventory) : new CraftingMenu(this.inventory, 2, this.armor, this.offhand, this.mountSlot, this.outfitSlot, () => this.cls?.classId ?? null, this.companionSlot, this.wingSlot, this.accessories));
        return;
      case 'ability':
        this.useAbility(c.slot);
        return;
      case 'mount':
        this.useMountKey();
        return;
      case 'drop': {
        const s = this.held;
        if (!s) return;
        if (this.keepsItem(s.id)) return;
        const n = c.all ? s.count : 1;
        this.dropFromPlayer({ ...s, count: n });
        s.count -= n;
        if (s.count <= 0) this.inventory.set(this.selected, null);
        this.emit({ t: 'inv' });
        return;
      }
      default:
    }
  }

  selectSlot(i: number, announce = true): void {
    this.selected = ((i % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS;
    if (announce) this.announceHeld();
    this.emit({ t: 'inv' });
  }

  private announceHeld(): void {
    const s = this.held;
    this.emit({ t: 'toast', text: s ? getItem(s.id).name : '' });
  }

  setMode(next: SaveMode): void {
    if (this.hardcore) return; // no creative mode in a hardcore world
    this.mode = next;
    if (next === 'survival') this.flying = false;
    this.emit({ t: 'toast', text: `${next} mode` });
    this.emit({ t: 'inv' });
  }

  private setCreativeHotbar(): void {
    CREATIVE_HOTBAR.forEach((id, i) => this.inventory.set(i, makeStack(id)));
  }

  // ---- menus ---------------------------------------------------------------

  openMenu(m: Menu): void {
    m.attachBags(this.inventory, this.bags);
    this.menu = m;
    this.screen = m.kind;
    if (this.emberTimer > 0) this.emberEvent('stop');
    this.emberTimer = 0;
    if (this.quests) m.taken = (stack, kind) => this.tookFromMenu(stack, kind);
    this.lowerShield();
    this.emit({ t: 'inv' });
  }

  /** Closes the open menu; returns held / crafting-grid stacks to the player. */
  closeMenu(): void {
    if (this.screen === 'dialog') {
      this.closeDialog();
      return;
    }
    if (!this.menu) return;
    if (this.chestAt) {
      this.realm.emitNear(this.chestAt.x, this.chestAt.y, this.chestAt.z, { t: 'chest', open: false, x: this.chestAt.x, y: this.chestAt.y, z: this.chestAt.z });
      this.chestAt = null;
    }
    const leftovers = this.menu.close();
    if (this.menu.kind !== 'creative') for (const s of leftovers) this.giveOrDrop(s);
    this.menu = null;
    this.screen = 'none';
    if (this.tradingWith) {
      if (this.tradingWith.customer?.body === this.body) this.tradingWith.customer = null;
      this.tradingWith = null;
    }
    this.emit({ t: 'inv' });
  }

  private openForBlock(hit: RayHit): void {
    const claims = this.realm.land;
    if (claims) {
      const d = claims.checkUse(this.account, hit.x, hit.y, hit.z, hit.id);
      if (!d.ok) {
        this.landNotice(d.why ?? 'claim', d.owner);
        return;
      }
    }
    if (signInfo(hit.id)) {
      this.editSign(hit.x, hit.y, hit.z);
      return;
    }
    if (isBed(hit.id)) {
      this.useBed(hit);
      return;
    }
    if (isSwitchable(hit.id)) {
      this.toggleSwitch(hit);
      return;
    }
    if (leverInfo(hit.id)) {
      this.realm.redstone.toggleLever(hit.x, hit.y, hit.z);
      this.emit({ t: 'swing' });
      return;
    }
    if (buttonInfo(hit.id)) {
      this.realm.redstone.pressButton(hit.x, hit.y, hit.z);
      this.emit({ t: 'swing' });
      return;
    }
    if (hit.id === B.CRAFTING_TABLE) this.openMenu(new CraftingMenu(this.inventory, 3));
    else if (hit.id === B.FURNACE) this.openMenu(new FurnaceMenu(this.inventory, this.blockEntities.furnace(hit.x, hit.y, hit.z), (n) => this.spawnXpAtFeet(n)));
    else if (isChest(hit.id)) {
      this.chestAt = { x: hit.x, y: hit.y, z: hit.z };
      this.openMenu(new ChestMenu(this.inventory, this.blockEntities.chest(hit.x, hit.y, hit.z)));
      this.realm.emitNear(hit.x, hit.y, hit.z, { t: 'chest', open: true, x: hit.x, y: hit.y, z: hit.z });
    }
    else if (hit.id === B.ENCHANTING_TABLE) this.openEnchantTable(hit);
    else if (isAnvil(hit.id)) this.openAnvil(hit);
    else if (hit.id === B.GRINDSTONE) this.openGrindstone();
  }

  /**
   * Right-click a sign (or put one up): its editor opens, with what is written on it, for anybody who may build there. Others read it and that is all.
   */
  private editSign(x: number, y: number, z: number): boolean {
    if (this.spectating || this.vitals.dead || !signInfo(this.world.getBlock(x, y, z))) return false;
    if (this.placeLocked(x, y, z, true, 'place')) return false;
    this.emit({ t: 'signEdit', x, y, z, lines: this.blockEntities.signAt(x, y, z) });
    return true;
  }

  /** The words typed into a sign's editor: kept (after cleaning) only for a sign within reach that the player may build on. */
  private signCommand(c: Extract<Command, { t: 'sign' }>): void {
    if (this.spectating || this.vitals.dead || !signInfo(this.world.getBlock(c.x, c.y, c.z))) return;
    const e = this.eye();
    if (Math.hypot(e.x - (c.x + 0.5), e.y - (c.y + 0.5), e.z - (c.z + 0.5)) > SIGN_REACH) return;
    if (this.placeLocked(c.x, c.y, c.z, true, 'place')) return;
    this.blockEntities.setSign(c.x, c.y, c.z, c.lines);
  }

  /** Open one of the standard screens without a block (tests, hotkeys). */
  openScreen(kind: 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative'): void {
    if (kind === 'inventory') this.openMenu(new CraftingMenu(this.inventory, 2, this.armor, this.offhand, this.mountSlot, this.outfitSlot, () => this.cls?.classId ?? null, this.companionSlot, this.wingSlot, this.accessories));
    else if (kind === 'crafting') this.openMenu(new CraftingMenu(this.inventory, 3));
    else if (kind === 'furnace') this.openMenu(new FurnaceMenu(this.inventory, this.blockEntities.furnace(0, 0, 0), (n) => this.spawnXpAtFeet(n)));
    else if (kind === 'chest') this.openMenu(new ChestMenu(this.inventory, this.blockEntities.chest(0, 0, 0)));
    else this.openMenu(new CreativeMenu(this.inventory));
  }

  // ---- items ---------------------------------------------------------------

  /** Some items cannot be thrown away (the Emberstone and the map): say so, and keep them. */
  private keepsItem(id: number): boolean {
    if (!isUndroppable(id)) return false;
    this.emit({ t: 'toast', text: `The ${getItem(id).name.replace(/_/g, ' ')} cannot be dropped.` });
    return true;
  }

  private dropFromPlayer(stack: ItemStack, speed = 4): void {
    const d = this.look();
    // A jewel let go of has its sound too, as when one falls from a monster.
    const jewel = jewelKind(stack.id);
    if (jewel) this.emit({ t: 'jewelDrop', kind: jewel, vol: 1 });
    this.drops.spawn(
      stack,
      this.body.x + d.x * 0.4,
      this.body.y + PLAYER_EYE - 0.35,
      this.body.z + d.z * 0.4,
      d.x * speed,
      d.y * speed + 1.8,
      d.z * speed,
      1.5,
    );
  }

  giveOrDrop(stack: ItemStack): void {
    const left = this.inventory.add(stack);
    if (left) this.dropFromPlayer(left, 2);
  }

  /** Like giveOrDrop, for what is picked up or won (a quest reward): it goes into the hotbar first, the backpack and the bags only when the bar is full. */
  collectOrDrop(stack: ItemStack): void {
    const left = this.inventory.collect(stack);
    if (left) this.dropFromPlayer(left, 2);
  }

  // ---- enchantments -----------------------------------------------------------------

  /** The held stack when its enchantments act (an enchanted book in the hand does nothing). */
  private enchHeld(): ItemStack | null {
    const h = this.held;
    return h && h.ench && !getItem(h.id).storesEnchants ? h : null;
  }

  /** What the held tool's enchantments do to a block that is being broken. */
  private toolEnchants(): { silk: boolean; fortune: number; efficiency: number } {
    const h = this.enchHeld();
    return { silk: levelOf(h, ENCH.SILK_TOUCH) > 0, fortune: levelOf(h, ENCH.FORTUNE), efficiency: efficiencyBonus(levelOf(h, ENCH.EFFICIENCY)) };
  }

  /** Protection points of everything worn against one kind of damage. */
  private armorProtection(kind: ProtectionKind): number {
    let p = 0;
    for (let i = 0; i < this.armor.size; i++) p += protectionPoints(this.armor.get(i), kind);
    return p;
  }

  /** Damage that gets through the enchantments of the worn armor. */
  private protect(amount: number, kind: ProtectionKind): number {
    return amount * protectionFactor(this.armorProtection(kind));
  }

  /** Bookshelves that feed an enchanting table: the ring two blocks out, one and two high, with a clear gap towards the table. */
  countShelves(x: number, y: number, z: number): number {
    let n = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
        const mx = x + Math.trunc(dx / 2);
        const mz = z + Math.trunc(dz / 2);
        if (this.world.getBlock(mx, y, mz) !== B.AIR || this.world.getBlock(mx, y + 1, mz) !== B.AIR) continue;
        for (let dy = 0; dy <= 1; dy++) if (this.world.getBlock(x + dx, y + dy, z + dz) === B.BOOKSHELF) n++;
      }
    }
    return Math.min(MAX_SHELVES, n);
  }

  private openEnchantTable(hit: RayHit): void {
    this.openMenu(
      new EnchantMenu(this.inventory, {
        shelves: this.countShelves(hit.x, hit.y, hit.z),
        creative: () => this.mode === 'creative',
        coins: () => this.coins,
        spend: (n) => void this.spendCoins(n),
        rand: () => this.rand(),
        done: (w) => this.emit({ t: 'enchant', glyph: w.glyph, rank: w.rank, ...(w.erase ? { erase: true } : {}), ...(w.fail ? { fail: true } : {}) }),
      }),
    );
  }

  /** Using an anvil can wear it: one use in eight chips it, then damages it, then it breaks (not in creative). */
  private wearAnvil(x: number, y: number, z: number): void {
    if (this.mode === 'creative') return;
    const id = this.world.getBlock(x, y, z);
    if (!isAnvil(id) || this.rand() >= ANVIL_WEAR_CHANCE) return;
    const next = id === B.ANVIL ? B.ANVIL_CHIPPED : id === B.ANVIL_DAMAGED ? B.AIR : B.ANVIL_DAMAGED;
    this.world.setBlock(x, y, z, next);
    this.realm.emitNear(x + 0.5, y + 0.5, z + 0.5, { t: 'sound', sound: 'stone', action: next === B.AIR ? 'break' : 'place', vol: 0.9 });
    if (next === B.AIR) {
      this.realm.emitNear(x + 0.5, y + 0.5, z + 0.5, { t: 'burst', id, x, y, z, count: 16 });
      this.closeMenu();
    }
  }

  private openGrindstone(): void {
    this.openMenu(
      new GrindstoneMenu(this.inventory, {
        creative: () => this.mode === 'creative',
        xp: (n) => this.spawnXpAtFeet(n),
        rand: () => this.rand(),
        done: () => this.emit({ t: 'enchant', anvil: true }),
      }),
    );
  }

  private openAnvil(hit: RayHit): void {
    this.openMenu(
      new AnvilMenu(this.inventory, {
        level: () => this.xp.level,
        creative: () => this.mode === 'creative',
        spend: (n) => {
          this.xp.spend(n);
          this.emit({ t: 'xp' });
        },
        done: () => {
          this.emit({ t: 'enchant', anvil: true });
          this.wearAnvil(hit.x, hit.y, hit.z);
        },
      }),
    );
  }

  /** Mending: experience mends the worn and held items that have it before it counts as levels. Returns what is left. */
  private mend(amount: number): number {
    const pool: ItemStack[] = [];
    const add = (s: ItemStack | null) => {
      if (s && !getItem(s.id).storesEnchants && s.ench && levelOf(s, ENCH.MENDING) > 0) pool.push(s);
    };
    add(this.held);
    add(this.offhand.get(0));
    for (let i = 0; i < this.armor.size; i++) add(this.armor.get(i));
    let mended = false;
    while (amount > 0) {
      const live = pool.filter((s) => s.damage > 0);
      if (live.length === 0) break;
      const s = live[Math.floor(this.rand() * live.length)];
      const fix = Math.min(s.damage, amount * 2);
      s.damage -= fix;
      amount -= Math.ceil(fix / 2);
      mended = true;
    }
    if (mended) this.emit({ t: 'inv' });
    return amount;
  }
  private damageHeld(amount: number): void {
    const s = this.held;
    const dur = s ? getItem(s.id).durability : 0;
    if (!s || dur <= 0) return;
    s.damage += wearAfterUnbreaking(amount, levelOf(s, ENCH.UNBREAKING), false, this.rand);
    if (s.damage >= dur) {
      this.inventory.set(this.selected, null);
      this.emit({ t: 'sound', sound: 'stone', action: 'break', vol: 0.8 });
    }
    this.emit({ t: 'inv' });
  }

  // ---- dungeon portals -------------------------------------------------------

  /** Seconds before a portal may take this player again (so that arriving does not send them straight back). */
  portalCooldown = 0;
  /** What the player was last told about their party and invitation (see `Parties.sync`); '' when nothing. */
  partyView = '';
  private pinsKey = '';
  private pinsTimer = 0;

  /**
   * Whose copy of a dungeon this player goes into: everybody who answers with the same key shares one.
   * A party shares one (see `party.ts`); everybody else is alone (names are unique within a server).
   */
  instanceKey(): string {
    return this.realm.parties.keyOf(this) ?? `solo:${this.name}`;
  }

  // ---- world edits ---------------------------------------------------------

  /** Seconds until the next "you can't change this" notice (so that holding the button does not flood the chat). */
  private lockedNotice = 0;
  /** Seconds until the wilderness hint may be said again, and how many times it has been said this visit. */
  private wildHint = 0;
  private wildHints = 0;
  /** The chest whose lid is open for this player, so closing the window can shut it. */
  private chestAt: { x: number; y: number; z: number } | null = null;

  /** Someone else with the same chest open should see a change as it happens. */
  private syncChestViewers(): void {
    if (!(this.menu instanceof ChestMenu)) return;
    const chest = this.menu.chest;
    for (const p of this.realm.players) {
      if (p !== this && p.menu instanceof ChestMenu && p.menu.chest === chest) p.emit({ t: 'inv' });
    }
  }

  /** Shut every window looking at this container, so a merge or a break cannot leave a stale copy. */
  private closeChestViewers(chest: Container): void {
    for (const p of this.realm.players) {
      if (p.menu instanceof ChestMenu && p.menu.chest === chest) p.closeMenu();
    }
  }

  /** A chest that was just placed joins a single neighbour, when there is one. */
  private settleChest(x: number, y: number, z: number): void {
    const merge = chestMerge((px, py, pz) => this.world.getBlock(px, py, pz), x, y, z);
    if (!merge) return;
    const [lx, ly, lz] = merge.left;
    const [rx, ry, rz] = merge.right;
    this.closeChestViewers(this.blockEntities.chest(lx, ly, lz));
    this.closeChestViewers(this.blockEntities.chest(rx, ry, rz));
    this.blockEntities.joinChests(rx, ry, rz, lx, ly, lz);
    this.world.setBlock(lx, ly, lz, chestId(merge.facing, 1));
    this.world.setBlock(rx, ry, rz, chestId(merge.facing, 2));
    this.realm.blockChanged(lx, ly, lz);
    this.realm.blockChanged(rx, ry, rz);
  }

  /**
   * Is this block part of a protected place (an Adventure village or dungeon) that this player may not change?
   * Creative players (operators, online) may; so may everybody mine a monster spawner, which is what the quests ask for.
   */
  private breakLocked(id: number, x: number, y: number, z: number, say: boolean): boolean {
    if (id === B.SPAWNER) return this.placeLocked(x, y, z, say, 'break', 0, true);
    return this.placeLocked(x, y, z, say, 'break');
  }

  /**
   * Is the block at (x, y, z) off limits to this player: a protected place (see above), or land that somebody has claimed? `land` is
   * what the player would do to the block for the land's rules (null: it is only being looked at, say the block a thing is set against).
   * The land is also asked at the write itself (`GuardedWorld`), so this is the early, polite no: the item is not used up and they are told why.
   */
  private placeLocked(x: number, y: number, z: number, say: boolean, land: 'place' | 'break' | null = 'place', placing = 0, landOnly = false): boolean {
    if (!landOnly && this.mode !== 'creative' && this.realm.isProtected(x, y, z)) {
      if (say && this.lockedNotice <= 0) {
        this.lockedNotice = 2;
        this.emit({ t: 'toast', text: 'This place is protected: you cannot change it' });
      }
      return true;
    }
    const claims = this.realm.land;
    if (!claims || !land) return false;
    const d = claims.checkBuild(this.account, x, y, z, land, placing);
    if (d.ok) {
      // Building in the open: said once in a while, never more than a few times in a visit (the land's rule, not a nag).
      if (say && land === 'place' && this.wildHint <= 0 && this.wildHints < 3 && claims.inspect(x, y, z).claim === null) {
        this.wildHint = 600;
        this.wildHints++;
        this.emit({ t: 'toast', text: LAND_MESSAGES.wilderness });
      }
      return false;
    }
    if (say) this.landNotice(d.why ?? 'claim', d.owner);
    return true;
  }

  // ---- land claims ---------------------------------------------------------------------------------------------

  private landCool = 0;
  private landSyncIn = 0;
  private landCfgSent = false;
  /** The claims this player has been told about, and the version of each (what `landTick` compares). */
  private readonly landSeen = new Map<string, string>();
  /** Where the server's own territory was last worked out for this player, and which of it they were told about. */
  private landZonesAt: [number, number] | null = null;
  private landZonesSig = '';
  private landZonesIn = 0;

  /** What a purchase needs of this player: the Auren, taken from and given back to this one purse, and the save to store with it. */
  private landEcon(): Econ {
    return {
      balance: () => this.coins,
      charge: (n) => this.spendCoins(n),
      refund: (n) => {
        this.coins = Math.min(this.coins + Math.max(0, Math.floor(n)), MAX_COINS);
      },
      save: () => this.realm.landSave?.(this) ?? null,
    };
  }

  /** The Land Surveyor: is there one in a bag? (A purchase needs it; the one who has none cannot buy.) */
  private carriesSurveyor(): boolean {
    return this.inventory.countOf(I.LAND_SURVEYOR) > 0;
  }

  /** Hand the claims round the player to their client, as they change (once a second; a claim is sent when it is new or has a new version). */
  private landTick(dt: number): void {
    const land = this.realm.land;
    if (!land || this.spectating) return;
    this.landCool = Math.max(0, this.landCool - dt);
    this.landSyncIn -= dt;
    if (this.landSyncIn > 0) return;
    this.landSyncIn = 1;
    if (!this.landCfgSent) {
      this.landCfgSent = true;
      this.emit({ t: 'land', e: { k: 'cfg', cfg: publicLandConfig(land.cfg) } });
    }
    // The towns, vaults and landmarks round here: looked up again after a walk of a couple of dozen blocks, and every few seconds (an administrator may reserve ground).
    this.landZonesIn -= 1;
    if (!this.landZonesAt || this.landZonesIn <= 0 || Math.hypot(this.body.x - this.landZonesAt[0], this.body.z - this.landZonesAt[1]) >= 24) {
      this.landZonesIn = 5;
      this.landZonesAt = [this.body.x, this.body.z];
      const zones = land.protectedNear(this.body.x, this.body.z, 220);
      const sig = zones.map((z) => z.id).join('|');
      if (sig !== this.landZonesSig) {
        this.landZonesSig = sig;
        this.emit({ t: 'land', e: { k: 'zones', zones } });
      }
    }
    const near = land.claimsNear(this.account, this.body.x, this.body.z, 128);
    const add = [];
    const keep = new Set<string>();
    for (const v of near) {
      keep.add(v.id);
      const sig = `${v.rev}:${v.kind}:${v.role}:${v.status}`;
      if (this.landSeen.get(v.id) !== sig) {
        this.landSeen.set(v.id, sig);
        add.push(v);
      }
    }
    const remove: string[] = [];
    for (const id of [...this.landSeen.keys()]) {
      if (keep.has(id)) continue;
      this.landSeen.delete(id);
      remove.push(id);
    }
    if (add.length > 0 || remove.length > 0) this.emit({ t: 'land', e: { k: 'sync', add, remove } });
  }

  /** A change to one of the claims (the owner renamed it, a grant was made): everybody who has it in view is sent it again at their next tick. */
  landForget(id: string): void {
    this.landSeen.delete(id);
    this.landSyncIn = 0;
  }

  private landCommand(c: Extract<Command, { t: 'land' }>): void {
    const land = this.realm.land;
    if (!land) return;
    const cmd: LandCommand | null = parseLandCommand(c);
    if (!cmd) return;
    const account = this.account;
    // Pricing a shape is the one thing a client asks for as it moves a corner: it may ask often, not without limit.
    if (cmd.a === 'preview') {
      if (this.landCool > 0.7) return;
      this.landCool += 0.1;
    } else if (this.landCool > 2.5) {
      this.emit({ t: 'toast', text: 'Slow down a moment.' });
      return;
    } else {
      this.landCool += 0.25;
    }
    const reply = (what: string, result: import('./landService').LandResult): void => {
      this.emit({ t: 'land', e: { k: 'result', what, result } });
      if (result.claim) this.landForget(result.claim.id);
      this.realm.land?.touchOwner(account ?? '');
    };
    const where = { x: this.body.x, z: this.body.z };
    switch (cmd.a) {
      case 'preview':
        this.emit({ t: 'land', e: { k: 'preview', preview: land.preview(account, cmd.v, this.landEcon(), { asGuild: cmd.guild, expand: cmd.expand, carries: this.carriesSurveyor() }) } });
        return;
      case 'buy': {
        const r = land.purchase({ account, ownerName: this.name, name: cmd.name, vertices: cmd.v, idem: cmd.idem, asGuild: cmd.guild, carries: this.carriesSurveyor(), reach: where }, this.landEcon());
        reply('buy', r);
        if (r.ok && !r.replay) {
          this.emit({ t: 'toast', text: r.text });
          this.emit({ t: 'land', e: { k: 'mine', claims: land.claimsOf(account ?? '').map((x) => land.viewOf(x, land.actorOf(account))) } });
        }
        return;
      }
      case 'expand':
        reply('expand', land.expand({ account, id: cmd.id, vertices: cmd.v, idem: cmd.idem, carries: this.carriesSurveyor(), reach: where }, this.landEcon()));
        return;
      case 'hello':
        // Say it all again at the next tick: the rules, and every claim round here (nothing is "already seen").
        this.landCfgSent = false;
        this.landSeen.clear();
        this.landZonesAt = null;
        this.landZonesSig = '';
        this.landSyncIn = 0;
        return;
      case 'list':
        this.emit({ t: 'land', e: { k: 'mine', claims: land.claimsOf(account ?? '').map((x: LandClaim) => land.viewOf(x, land.actorOf(account))) } });
        return;
      case 'detail':
        this.emit({ t: 'land', e: { k: 'detail', detail: land.detail(account, cmd.id) } });
        return;
      case 'rename':
        reply('rename', land.rename(account, cmd.id, cmd.name));
        return;
      case 'grant': {
        if (cmd.kind === 'guild') {
          const gid = land.actorOf(account).guildId;
          if (!gid) return reply('grant', { ok: false, code: 'guild', text: 'You are not in a guild.' });
          reply('grant', land.grant(account, cmd.id, { kind: 'guild', id: gid, name: land.guildLabel(gid), role: cmd.role }));
          return;
        }
        const who = cmd.who.toLowerCase();
        const target = this.realm.players.find((p) => p.name.toLowerCase() === who && p.account && p.account !== account);
        if (!target || !target.account) return reply('grant', { ok: false, code: 'unknown', text: `${cmd.who} is not here. They must be in the world to be invited.` });
        reply('grant', land.grant(account, cmd.id, { kind: 'player', id: target.account, name: target.name, role: cmd.role }));
        target.landForget(cmd.id);
        return;
      }
      case 'revoke': {
        const r = land.revokeGrant(account, cmd.id, cmd.kind, cmd.who);
        reply('revoke', r);
        for (const p of this.realm.players) p.landForget(cmd.id);
        return;
      }
      case 'public':
        reply('public', land.setPublic(account, cmd.id, cmd.perms, cmd.guildRole));
        for (const p of this.realm.players) p.landForget(cmd.id);
        return;
      case 'release':
        reply('release', land.release(account, cmd.id));
        return;
      case 'unrelease':
        reply('unrelease', land.cancelRelease(account, cmd.id));
        return;
      case 'recover': {
        let stacks = 0;
        for (const r of land.recoveryOf(account ?? '')) {
          const items = r.items as { id: number; count: number }[] | null;
          if (Array.isArray(items)) {
            for (const s of items) {
              if (s && typeof s.id === 'number' && typeof s.count === 'number' && s.count > 0) {
                this.giveOrDrop(s as ItemStack);
                stacks++;
              }
            }
          }
          land.takeRecovery(r.id);
        }
        if (stacks > 0) this.emit({ t: 'inv' });
        this.emit({ t: 'land', e: { k: 'recovered', stacks } });
        return;
      }
    }
  }

  /** Tell the player the land is somebody's (not more than every couple of seconds). */
  private landNotice(why: 'claim' | 'band', owner?: string): void {
    if (this.lockedNotice > 0) return;
    this.lockedNotice = 2;
    this.emit({ t: 'toast', text: why === 'band' ? LAND_MESSAGES.band : owner ? `${LAND_MESSAGES.protectedProperty} (${owner})` : LAND_MESSAGES.protectedProperty });
  }

  /**
   * Chips of this block, for everyone close enough to see them. A break fills the block and falls.
   * A placement is a short, small puff.
   */
  private puff(x: number, y: number, z: number, id: number, soft: boolean): void {
    this.realm.emitNear(x, y, z, soft ? { t: 'burst', id, x, y, z, count: 8, soft: true } : { t: 'burst', id, x, y, z, count: 32 });
  }

  /** Remove a block as the player: sounds, particles and (survival) drops + tool wear. */
  breakBlock(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    const def = BLOCKS[id];
    if (id === B.AIR || !Number.isFinite(def.hardness)) return;
    if (this.breakLocked(id, x, y, z, true)) return;
    const held = this.held;
    const tool = held ? getItem(held.id).tool : null;
    const ench = { ...this.toolEnchants(), shears: !!held && getItem(held.id).shears };
    // Silk Touch lifts the block whole (ice stays ice, and nothing falls out of it as experience).
    const kept = ench.silk && silkKeeps(id) && canHarvest(def, tool);

    this.puff(x, y, z, id, false);
    this.realm.emitNear(x, y, z, { t: 'sound', sound: def.sound, action: 'break', vol: 1 });
    // Ice leaves water behind (the original needs silk touch to keep it).
    this.world.setBlock(x, y, z, id === B.ICE && !kept && this.world.getBlock(x, y - 1, z) !== B.AIR ? B.WATER : B.AIR);
    const contents = this.realm.takeBlock(x, y, z, id);

    if (this.mode === 'survival') {
      const hint = harvestHint(def, tool);
      if (hint) this.emit({ t: 'toast', text: hint });
      for (const drop of blockDrops(def, tool, this.rand, ench)) this.drops.spawnAtBlock(makeStack(drop.id, drop.count), x, y, z);
      for (const s of contents) this.drops.spawnAtBlock(s, x, y, z);
      const xpRange = BLOCK_XP[id];
      if (xpRange && canHarvest(def, tool) && !kept) {
        this.realm.awardXp(xpRange[0] + Math.floor(this.rand() * (xpRange[1] - xpRange[0] + 1)), x + 0.5, y + 0.5, z + 0.5);
      }
      if (def.hardness > 0) this.damageHeld(1);
      this.vitals.addExhaustion(EXHAUSTION.breakBlock);
    }
    if (id === B.FIRE) {
      this.realm.fire.extinguish(x, y, z);
      this.realm.emitNear(x, y, z, { t: 'fire', kind: 'hiss', vol: 0.5 });
    }
    this.realm.settleAround(x, y, z, this.mode === 'survival');
    // The last log of a tree takes its leaves with it.
    if (IS_LOG[id]) this.realm.treeCut(x, y, z, this.mode === 'survival');
    this.questEvent({ t: 'mine', block: id });
  }

  /** Right-click the held item on a block face: till soil with a hoe, or place a block. */
  useHeldOn(t: { x: number; y: number; z: number; id: number; nx: number; ny: number; nz: number; fy?: number }): boolean {
    const held = this.held;
    const item = held ? getItem(held.id) : null;
    if (!held || !item) return false;
    const world = this.world;
    // Nothing is built, tilled or lit in a protected place (bone meal only helps what already grows there).
    if (item.use !== 'bone_meal' && (this.placeLocked(t.x, t.y, t.z, true, null) || this.placeLocked(t.x + t.nx, t.y + t.ny, t.z + t.nz, true))) return false;

    if (item.tool?.kind === 'axe' && this.stripBlock(t)) return true;
    if (item.tool?.kind === 'hoe') {
      if (!isTillable(t.id) || world.getBlock(t.x, t.y + 1, t.z) !== B.AIR) return false;
      if (!world.setBlock(t.x, t.y, t.z, B.FARMLAND)) return false;
      this.realm.emitNear(t.x, t.y, t.z, { t: 'sound', sound: 'dirt', action: 'place', vol: 1 });
      if (this.mode === 'survival') this.damageHeld(1);
      return true;
    }
    if (item.use === 'flint') return this.strikeFlint(t);
    if (item.use === 'bone_meal' && this.useBoneMeal(t)) return true;
    if (item.use === 'bed') return this.placeBed(t);
    if (item.use === 'door') return this.placeDoor(t);
    if (this.dressClick(t)) return true;
    if (item.block == null) return false;
    const slab = slabInfo(item.block);
    if (slab && this.mergeSlab(t, slab.mat)) return true;

    const spot = this.blockPlaceSpot(t);
    if (!spot) return false;
    if (!world.setBlock(spot.x, spot.y, spot.z, spot.id)) return false;
    if (isChest(spot.id)) this.settleChest(spot.x, spot.y, spot.z);
    if (isRail(spot.id)) railPlaced(world, spot.x, spot.y, spot.z);
    this.realm.checkFall(spot.x, spot.y, spot.z);
    this.realm.blockChanged(spot.x, spot.y, spot.z);
    // A sign put up is written on at once, as in the original (and keeps none of what an old one there had).
    if (signInfo(spot.id)) {
      this.blockEntities.forgetSign(spot.x, spot.y, spot.z);
      this.editSign(spot.x, spot.y, spot.z);
    }
    this.puff(spot.x, spot.y, spot.z, spot.id, true);
    this.realm.emitNear(spot.x, spot.y, spot.z, { t: 'sound', sound: BLOCKS[spot.id].sound, action: 'place', vol: 1 });
    this.emit({ t: 'swing' });
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, null);
      this.emit({ t: 'inv' });
    }
    this.questEvent({ t: 'place', block: item.block });
    return true;
  }

  /**
   * Where the held block would be put on this face, or null when it cannot go there. A potato is food and a seed:
   * while this is a spot, the click plants it instead of eating it.
   */
  private blockPlaceSpot(t: { x: number; y: number; z: number; id: number; nx: number; ny: number; nz: number; fy?: number }): { x: number; y: number; z: number; id: number } | null {
    const held = this.held;
    const item = held ? getItem(held.id) : null;
    if (!item || item.block == null) return null;
    if (this.placeLocked(t.x, t.y, t.z, false, null) || this.placeLocked(t.x + t.nx, t.y + t.ny, t.z + t.nz, false, 'place', item.block)) return null;
    const world = this.world;
    // Plants and grass are replaced in place rather than built against.
    const inPlace = BLOCKS[t.id].replaceable;
    const px = inPlace ? t.x : t.x + t.nx;
    const py = inPlace ? t.y : t.y + t.ny;
    const pz = inPlace ? t.z : t.z + t.nz;
    const existing = world.getBlock(px, py, pz);
    const placeable = existing === B.AIR || BLOCKS[existing].liquid || BLOCKS[existing].replaceable;
    // A block on a slab hangs below its cell. The click height has to be read from the block, not from the empty space above it.
    const drop = inPlace ? 0 : seatDrop(t.id, (dy) => world.getBlock(t.x, t.y - dy, t.z));
    let id = placementFor(item.block, inPlace ? 0 : t.nx, inPlace ? 1 : t.ny, inPlace ? 0 : t.nz, this.yaw, t.fy ?? 0.5, drop);
    // A lantern with no floor under it hangs instead, if there is something above to hang it from.
    const lantern = id === null ? null : lanternInfo(id);
    if (id !== null && lantern && !canStayAt(id, world, px, py, pz)) id = lanternId(lantern.soul, !lantern.hanging);
    if (id === null || !placeable || !canStayAt(id, world, px, py, pz)) return null;
    if (BLOCKS[id].solid && this.realm.players.some((p) => bodyOverlapsBlock(p.body, px, py, pz))) return null;
    return { x: px, y: py, z: pz, id };
  }

  /** Bone meal on a crop, a sapling or grass: it grows (a sapling only now and then, like the original). */
  private useBoneMeal(t: { x: number; y: number; z: number; id: number }): boolean {
    const world = this.world;
    const rand = this.rand;
    let used = false;
    if (isSapling(t.id)) {
      used = true;
      if (rand() < 0.45) growTree(world, t.x, t.y, t.z, rand);
    } else if (isYoungCrop(t.id)) {
      used = world.setBlock(t.x, t.y, t.z, Math.min(ripeCrop(t.id), t.id + 1 + Math.floor(rand() * 3)));
    } else if (stemFruit(t.id) && growFruit(world, t.x, t.y, t.z, t.id, rand)) {
      used = true;
    } else if ((t.id === B.CACTUS || t.id === B.SUGAR_CANE) && growColumn(world, t.x, t.y, t.z, t.id)) {
      used = true;
    } else if ((t.id === B.CAVE_VINES || t.id === B.CAVE_VINES_BERRIES) && growVine(world, t.x, t.y, t.z, t.id)) {
      used = true;
    } else if (t.id === B.GRASS && world.getBlock(t.x, t.y + 1, t.z) === B.AIR) {
      used = true;
      for (let i = 0; i < 14; i++) {
        const x = t.x + Math.floor(rand() * 5) - 2;
        const z = t.z + Math.floor(rand() * 5) - 2;
        for (const y of [t.y, t.y + 1, t.y - 1]) {
          if (world.getBlock(x, y, z) !== B.GRASS || world.getBlock(x, y + 1, z) !== B.AIR) continue;
          world.setBlock(x, y + 1, z, rand() < 0.08 ? (rand() < 0.5 ? B.DANDELION : B.ROSE) : B.TALL_GRASS);
          break;
        }
      }
    }
    if (!used) return false;
    this.realm.emitNear(t.x, t.y, t.z, { t: 'burst', id: B.LEAVES, x: t.x, y: t.y + 1, z: t.z, count: 8 });
    this.realm.emitNear(t.x, t.y, t.z, { t: 'sound', sound: 'grass', action: 'place', vol: 1 });
    this.emit({ t: 'swing' });
    this.useUpHeld();
    return true;
  }

  /**
   * Right-click a campfire. Food goes on to cook, a shovel puts the fire out, and flint and steel lights it again.
   * A full campfire still takes the click, so the food is not eaten instead.
   */
  private useCampfire(t: { x: number; y: number; z: number; id: number }): boolean {
    const info = campfireInfo(t.id);
    if (!info) return false;
    const held = this.held;
    const item = held ? getItem(held.id) : null;
    if (item?.tool?.kind === 'shovel' && info.lit) {
      this.world.setBlock(t.x, t.y, t.z, campfireId(info.facing, false));
      this.realm.blockChanged(t.x, t.y, t.z);
      this.realm.emitNear(t.x, t.y, t.z, { t: 'fire', kind: 'hiss', vol: 0.7 });
      this.emit({ t: 'swing' });
      if (this.mode === 'survival') this.damageHeld(1);
      return true;
    }
    if (item?.use === 'flint' && !info.lit) {
      this.world.setBlock(t.x, t.y, t.z, campfireId(info.facing, true));
      this.realm.blockChanged(t.x, t.y, t.z);
      this.realm.emitNear(t.x, t.y, t.z, { t: 'fire', kind: 'ignite', vol: 0.9 });
      this.emit({ t: 'swing' });
      if (this.mode === 'survival') this.damageHeld(1);
      return true;
    }
    if (!held || campfireFood(held.id) === null) return false;
    const fire = this.blockEntities.campfire(t.x, t.y, t.z);
    if (!fire.add(held.id)) return true;
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, null);
      this.emit({ t: 'inv' });
    }
    this.realm.emitNear(t.x, t.y, t.z, { t: 'sound', sound: 'wood', action: 'place', vol: 0.6 });
    this.emit({ t: 'swing' });
    return true;
  }

  /** Right-click with flint and steel: light a fire in the cell next to the face you click (or in the plant you click). */
  private strikeFlint(t: { x: number; y: number; z: number; id: number; nx: number; ny: number; nz: number }): boolean {
    if (t.id === B.FIRE) return false;
    // TNT: the spark goes into it rather than beside it.
    if (t.id === B.TNT) {
      this.realm.primeTnt(t.x, t.y, t.z);
      this.emit({ t: 'swing' });
      if (this.mode === 'survival') this.damageHeld(1);
      return true;
    }
    const inPlace = BLOCKS[t.id].replaceable && !BLOCKS[t.id].liquid;
    const x = inPlace ? t.x : t.x + t.nx;
    const y = inPlace ? t.y : t.y + t.ny;
    const z = inPlace ? t.z : t.z + t.nz;
    const there = this.world.getBlock(x, y, z);
    if (there !== B.AIR && !(BLOCKS[there].replaceable && !BLOCKS[there].liquid)) return false;
    if (!canStayAt(B.FIRE, this.world, x, y, z)) return false;
    if (there !== B.AIR) this.world.setBlock(x, y, z, B.AIR);
    if (!this.realm.fire.ignite(x, y, z)) return false;
    this.realm.emitNear(x, y, z, { t: 'fire', kind: 'ignite', vol: 0.9 });
    this.emit({ t: 'swing' });
    if (this.mode === 'survival') this.damageHeld(1);
    return true;
  }

  /** Take one of the held item after placing it (survival only). */
  private useUpHeld(): void {
    const held = this.held;
    if (!held || this.mode !== 'survival') return;
    held.count -= 1;
    if (held.count <= 0) this.inventory.set(this.selected, null);
    this.emit({ t: 'inv' });
  }

  /**
   * Two slabs of one kind make a full block: click the top of a bottom slab (or the underside of a top
   * one), or place the other half into the cell beside the face you click.
   */
  private mergeSlab(t: { x: number; y: number; z: number; id: number; nx: number; ny: number; nz: number; fy?: number }, mat: number): boolean {
    const world = this.world;
    const clicked = slabInfo(t.id);
    let cell: [number, number, number] | null = null;
    if (clicked && clicked.mat === mat && ((t.ny > 0 && !clicked.top) || (t.ny < 0 && clicked.top))) {
      cell = [t.x, t.y, t.z];
    } else {
      const nx = t.x + t.nx;
      const ny = t.y + t.ny;
      const nz = t.z + t.nz;
      const there = slabInfo(world.getBlock(nx, ny, nz));
      const drop = seatDrop(t.id, (dy) => world.getBlock(t.x, t.y - dy, t.z));
      const wantTop = placesUpper(t.ny, t.fy ?? 0.5, drop);
      if (there && there.mat === mat && there.top !== wantTop) cell = [nx, ny, nz];
    }
    if (!cell) return false;
    const full = materialBlock(mat);
    if (!full) return false;
    const [cx, cy, cz] = cell;
    if (this.realm.players.some((p) => bodyOverlapsBlock(p.body, cx, cy, cz))) return false;
    if (!world.setBlock(cx, cy, cz, full)) return false;
    this.realm.blockChanged(cx, cy, cz);
    this.puff(cx, cy, cz, full, true);
    this.realm.emitNear(cx, cy, cz, { t: 'sound', sound: BLOCKS[full].sound, action: 'place', vol: 1 });
    this.emit({ t: 'swing' });
    this.useUpHeld();
    return true;
  }

  /** An axe shaves the bark off a log, a wood block, or a stem. */
  private stripBlock(t: { x: number; y: number; z: number; id: number }): boolean {
    const to = strippedOf(t.id);
    if (!to || this.placeLocked(t.x, t.y, t.z, true)) return false;
    if (!this.world.setBlock(t.x, t.y, t.z, to)) return false;
    this.realm.blockChanged(t.x, t.y, t.z);
    this.realm.emitNear(t.x, t.y, t.z, { t: 'sound', sound: 'wood', action: 'place', vol: 1 });
    this.emit({ t: 'swing' });
    if (this.mode === 'survival') this.damageHeld(1);
    return true;
  }

  /**
   * A candle takes another of the same colour, up to four. An empty flower pot takes a small plant.
   * Either click is used up, so the plant is not placed beside the pot.
   */
  private dressClick(t: { x: number; y: number; z: number; id: number }): boolean {
    const held = this.held;
    if (!held) return false;
    const candle = candleInfo(t.id);
    if (candle && candle.count < 4 && held.id === candleItem(candle.color)) {
      const next = candleId(candle.color, candle.count + 1);
      if (!this.world.setBlock(t.x, t.y, t.z, next)) return false;
      this.realm.blockChanged(t.x, t.y, t.z);
      this.puff(t.x, t.y, t.z, next, true);
      this.realm.emitNear(t.x, t.y, t.z, { t: 'sound', sound: 'wood', action: 'place', vol: 0.6 });
      this.emit({ t: 'swing' });
      this.useUpHeld();
      return true;
    }
    if (t.id === DRESS.pot) {
      const plant = getItem(held.id).block;
      const filled = plant == null ? 0 : pottedOf(plant);
      if (!filled) return false;
      if (!this.world.setBlock(t.x, t.y, t.z, filled)) return false;
      this.realm.blockChanged(t.x, t.y, t.z);
      this.puff(t.x, t.y, t.z, filled, true);
      this.realm.emitNear(t.x, t.y, t.z, { t: 'sound', sound: BLOCKS[filled].sound, action: 'place', vol: 0.7 });
      this.emit({ t: 'swing' });
      this.useUpHeld();
      return true;
    }
    return false;
  }

  /** Right-click with a door: it fills two blocks, standing on the one under it, on the edge nearest you. */
  private placeDoor(t: { x: number; y: number; z: number; id: number; nx: number; ny: number; nz: number }): boolean {
    const world = this.world;
    const inPlace = BLOCKS[t.id].replaceable;
    const px = inPlace ? t.x : t.x + t.nx;
    const py = inPlace ? t.y : t.y + t.ny;
    const pz = inPlace ? t.z : t.z + t.nz;
    const free = (y: number) => {
      const id = world.getBlock(px, y, pz);
      return id === B.AIR || (BLOCKS[id].replaceable && !BLOCKS[id].liquid);
    };
    if (!this.held || !free(py) || !free(py + 1) || !IS_SOLID[world.getBlock(px, py - 1, pz)]) return false;
    if (this.realm.players.some((p) => bodyOverlapsBlock(p.body, px, py, pz) || bodyOverlapsBlock(p.body, px, py + 1, pz))) return false;
    const facing = lookDir(this.yaw) ^ 1;
    const kind = doorKind(this.held.id);
    if (!world.setBlock(px, py, pz, doorId(false, false, facing, kind))) return false;
    if (!world.setBlock(px, py + 1, pz, doorId(true, false, facing, kind))) {
      world.setBlock(px, py, pz, B.AIR);
      return false;
    }
    this.realm.blockChanged(px, py, pz);
    this.realm.blockChanged(px, py + 1, pz);
    this.puff(px, py, pz, doorId(false, false, facing, kind), true);
    this.realm.emitNear(px, py, pz, { t: 'sound', sound: BLOCKS[doorId(false, false, facing, kind)].sound, action: 'place', vol: 1 });
    this.emit({ t: 'swing' });
    this.useUpHeld();
    return true;
  }

  /** Open or close a door, trapdoor or fence gate (a door moves both its halves). */
  private toggleSwitch(hit: { x: number; y: number; z: number; id: number }): void {
    const world = this.world;
    const changes: [number, number, number, number, number][] = []; // x, y, z, new id, old id
    const door = doorInfo(hit.id);
    const trap = trapdoorInfo(hit.id);
    const gate = gateInfo(hit.id);
    if ((door || trap) && !opensByHand(hit.id)) return;
    let closing = false;
    if (door) {
      const kind = doorKind(hit.id);
      changes.push([hit.x, hit.y, hit.z, doorId(door.upper, !door.open, door.facing, kind), hit.id]);
      const oy = door.upper ? hit.y - 1 : hit.y + 1;
      const other = world.getBlock(hit.x, oy, hit.z);
      if (doorInfo(other)) changes.push([hit.x, oy, hit.z, doorId(!door.upper, !door.open, door.facing, kind), other]);
      closing = door.open;
    } else if (trap) {
      changes.push([hit.x, hit.y, hit.z, trapdoorId(trap.top, !trap.open, trap.facing, trapdoorKind(hit.id)), hit.id]);
      closing = trap.open;
    } else if (gate) {
      changes.push([hit.x, hit.y, hit.z, gateId(!gate.open, gate.facing, gateKind(hit.id)), hit.id]);
      closing = gate.open;
    } else return;
    for (const [x, y, z, id] of changes) world.setBlock(x, y, z, id);
    // Never shut one on somebody: they would be stuck inside it.
    if (closing && this.realm.players.some((p) => collides(world, p.body.x, p.body.y, p.body.z, p.body.width, p.body.height))) {
      for (const [x, y, z, , old] of changes) world.setBlock(x, y, z, old);
      return;
    }
    this.realm.emitNear(hit.x, hit.y, hit.z, { t: 'sound', sound: BLOCKS[hit.id].sound, action: 'place', vol: 0.8 });
    this.emit({ t: 'swing' });
  }

  /** Right-click a ripe sweet berry bush: the berries come off and the bush grows them again. */
  private pickBerries(t: { x: number; y: number; z: number; id: number }): boolean {
    const sweet = t.id === B.SWEET_BERRY_3;
    const glow = t.id === B.CAVE_VINES_BERRIES;
    if (!sweet && !glow) return false;
    this.world.setBlock(t.x, t.y, t.z, sweet ? B.SWEET_BERRY_1 : B.CAVE_VINES);
    this.realm.blockChanged(t.x, t.y, t.z);
    if (this.mode === 'survival') {
      const id = sweet ? I.SWEET_BERRIES : I.GLOW_BERRIES;
      const count = sweet ? 2 + Math.floor(this.rand() * 2) : 1;
      this.drops.spawnAtBlock(makeStack(id, count), t.x, t.y, t.z);
    }
    this.realm.emitNear(t.x, t.y, t.z, { t: 'sound', sound: 'grass', action: 'break', vol: 0.7 });
    this.emit({ t: 'swing' });
    return true;
  }

  /** Right-click a placed cake: one bite, if there is room for it. The seventh bite removes the cake. */
  private biteCake(t: { x: number; y: number; z: number; id: number }): boolean {
    const cake = cakeInfo(t.id);
    if (!cake || this.mode !== 'survival' || !this.vitals.canEat()) return false;
    this.vitals.eat({ hunger: 2, saturation: 0.4 });
    const next = cake.bites >= 6 ? B.AIR : cakeId(cake.bites + 1);
    this.world.setBlock(t.x, t.y, t.z, next);
    if (next === B.AIR) this.realm.settleAround(t.x, t.y, t.z, false);
    else this.realm.blockChanged(t.x, t.y, t.z);
    this.emit({ t: 'eat' });
    return true;
  }

  /** Right-click with a bucket: scoop up a water or lava source, or pour out what it holds. */
  useBucket(): boolean {
    const held = this.held;
    if (!held || (held.id !== I.BUCKET && held.id !== I.WATER_BUCKET && held.id !== I.LAVA_BUCKET)) return false;
    const d = this.look();
    const eye = this.eye();
    const hit = raycast(this.world, eye.x, eye.y, eye.z, d.x, d.y, d.z, REACH, true);
    if (!hit) return false;
    const survival = this.mode === 'survival';
    const pickUp = held.id === I.BUCKET;
    if (this.placeLocked(hit.x, hit.y, hit.z, true, pickUp ? 'break' : null) || this.placeLocked(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz, true, pickUp ? null : 'place', held.id === I.LAVA_BUCKET ? B.LAVA : B.WATER)) return false;

    if (held.id === I.BUCKET) {
      if (!isFluidSource(hit.id)) return false;
      const filled = FLUID_KIND[hit.id] === FLUID_WATER ? I.WATER_BUCKET : I.LAVA_BUCKET;
      this.world.setBlock(hit.x, hit.y, hit.z, B.AIR);
      this.realm.blockChanged(hit.x, hit.y, hit.z);
      this.realm.emitNear(hit.x, hit.y, hit.z, { t: 'splash', vol: 0.6 });
      if (survival) {
        held.count -= 1;
        if (held.count <= 0) this.inventory.set(this.selected, makeStack(filled, 1));
        else this.giveOrDrop(makeStack(filled, 1));
      } else {
        this.giveOrDrop(makeStack(filled, 1));
      }
      this.emit({ t: 'swing' });
      this.emit({ t: 'inv' });
      return true;
    }

    if (held.id === I.WATER_BUCKET && campfireInfo(hit.id)?.lit) {
      const info = campfireInfo(hit.id)!;
      this.world.setBlock(hit.x, hit.y, hit.z, campfireId(info.facing, false));
      this.realm.blockChanged(hit.x, hit.y, hit.z);
      this.realm.emitNear(hit.x, hit.y, hit.z, { t: 'fire', kind: 'hiss', vol: 0.7 });
      if (survival) this.inventory.set(this.selected, makeStack(I.BUCKET, 1));
      this.emit({ t: 'swing' });
      this.emit({ t: 'inv' });
      return true;
    }

    const water = held.id === I.WATER_BUCKET;
    const into = IS_LIQUID[hit.id] === 1 || BLOCKS[hit.id].replaceable;
    const px = into ? hit.x : hit.x + hit.nx;
    const py = into ? hit.y : hit.y + hit.ny;
    const pz = into ? hit.z : hit.z + hit.nz;
    const existing = this.world.getBlock(px, py, pz);
    if (IS_SOLID[existing]) return false;
    if (isFluidSource(existing) && FLUID_KIND[existing] === (water ? FLUID_WATER : 2)) return false;
    if (!this.world.setBlock(px, py, pz, water ? B.WATER : B.LAVA)) return false;
    this.realm.blockChanged(px, py, pz);
    this.realm.emitNear(px, py, pz, { t: 'splash', vol: 0.6 });
    if (survival) this.inventory.set(this.selected, makeStack(I.BUCKET, 1));
    this.emit({ t: 'swing' });
    this.emit({ t: 'inv' });
    return true;
  }

  // ---- mobs: damage taken, melee --------------------------------------------

  /** Seconds of the Poison status effect left (cave spider bites, a spider eye): a point of damage now and then, never the last heart. */
  poison = 0;
  private poisonTick = 0;
  /** Seconds of the Hunger sickness status effect left (rotten flesh, raw chicken): the food bar drains while it lasts. */
  foodSick = 0;
  private foodSickTick = 0;

  /**
   * Statuses a monster's blow can leave (see fflict): seconds of Root (no walking or jumping), of Slow (to slowMul of the speed) and of Weakness (the
   * player's attacks do WEAK_DAMAGE of their damage). The client predicts its own steps with the move multiplier the snapshot carries (moveMul).
   */
  rootTime = 0;
  slowTime = 0;
  slowMul = 1;
  weakTime = 0;

  /** How fast the statuses let the player move now: 1 free, 0 rooted, else the slow's share. */
  get moveMul(): number {
    if (this.rootTime > 0) return 0;
    return this.slowTime > 0 ? this.slowMul : 1;
  }

  /** Put a status on the player (not a creative player or a spectator, who are not touched by monsters): seconds of it, a slow to power of the speed. */
  afflict(effect: MobEffect, seconds = AFFLICT_SECONDS[effect], power = 0.5): void {
    if (this.invulnerable || this.vitals.dead || this.spectating || seconds <= 0) return;
    if (effect === 'poison') this.poison = Math.max(this.poison, this.hardcore ? Math.round(((seconds * 12) / 7) * 100) / 100 : seconds);
    else if (effect === 'root') this.rootTime = Math.max(this.rootTime, seconds);
    else if (effect === 'slow') {
      this.slowMul = this.slowTime > 0 ? Math.min(this.slowMul, power) : power;
      this.slowTime = Math.max(this.slowTime, seconds);
    } else if (effect === 'weak') this.weakTime = Math.max(this.weakTime, seconds);
    else this.catchFire(seconds);
  }

  hurtByMob(amount: number, kx: number, kz: number, source: MobKind | 'arrow', effect?: MobEffects): void {
    if (this.invulnerable || this.vitals.dead) return;
    if (this.hardcore) amount *= HARD_DAMAGE;
    // The class's toughness, a guard ability or a roll in progress come first; a hit that is fully avoided does not even push.
    if (this.cls) amount = this.cls.mitigate(amount);
    if (amount <= 0) return;
    // A dagger that is stabbing turns a blow aside now and then, with a parry or a dodge: nothing is taken and nothing pushes.
    if (this.stabAge < STAB_GUARD_TIME && this.rand() < STAB_GUARD_CHANCE) {
      this.emit({ t: 'guard', what: this.rand() < 0.5 ? 'parry' : 'dodge' });
      return;
    }
    if (this.tryBlock(amount, kx, kz)) return;
    const before = this.vitals.health;
    this.vitals.damage(this.protect(this.afterArmor(amount), source === 'arrow' ? 'projectile' : 'all'), 'mob');
    if (effect !== undefined && this.mode === 'survival') for (const e of typeof effect === 'string' ? [effect] : effect) this.afflict(e);
    if (this.vitals.health < before) {
      this.emit({ t: 'dmg', x: this.body.x, y: this.body.y + 1.2, z: this.body.z, amount: Math.round((before - this.vitals.health) * 10) / 10, taken: true, ...(this.cls && this.cls.reductionLeft > 0 ? { guarded: true } : {}) });
      this.wearArmor(amount);
      this.killedBy = source;
      this.body.vx = kx * 7;
      this.body.vz = kz * 7;
      if (this.body.onGround) this.body.vy = 4.5;
    }
  }

  /** A falling anvil lands on the player: two points a block of the fall, at most forty. */
  hurtByAnvil(amount: number): void {
    if (this.mode !== 'survival' || this.spectating || this.vitals.dead || amount <= 0) return;
    this.vitals.damage(amount * (this.hardcore ? HARD_DAMAGE : 1), 'anvil');
  }

  hurtByExplosion(x: number, y: number, z: number, radius: number, source: MobKind | 'tnt'): void {
    const b = this.body;
    const dPlayer = Math.hypot(b.x - x, b.y + 0.9 - y, b.z - z);
    if (this.mode !== 'survival' || this.spectating || dPlayer >= radius * 2 || this.vitals.dead) return;
    if (this.cls && this.cls.immuneLeft > 0) return;
    const f = 1 - dPlayer / (radius * 2);
    // The original's formula (exposure ignored): about 43 points at the centre of a creeper blast on Normal, 17 halfway out.
    const blast = Math.floor(((f * f + f) / 2) * 7 * radius * 2 + 1) * (this.hardcore ? HARD_DAMAGE : 1);
    const raw = this.cls ? this.cls.mitigate(blast) : blast;
    const hp = this.vitals.health;
    // A raised shield stops the blast's damage when it comes from the front (the push still happens).
    if (!this.tryBlock(raw, b.x - x, b.z - z)) {
      this.vitals.damage(this.protect(this.afterArmor(raw), 'blast'), 'explosion');
      if (this.vitals.health < hp) this.wearArmor(raw);
      this.killedBy = source;
    }
    const len = dPlayer || 1;
    b.vx = ((b.x - x) / len) * 12 * f;
    b.vz = ((b.z - z) / len) * 12 * f;
    b.vy = 6 * f + 2;
  }

  /** The mob under the crosshair, if it is closer than any block in the way. */
  aimedMob(): { mob: Mob; dist: number } | null {
    const d = this.look();
    const { x: ox, y: oy, z: oz } = this.eye();
    const hit = this.mobs.raycast(ox, oy, oz, d.x, d.y, d.z, MELEE_REACH, MELEE_MARGIN, MELEE_LAG);
    if (!hit) return null;
    const block = raycast(this.world, ox, oy, oz, d.x, d.y, d.z, REACH);
    if (block) {
      const t = rayAabb(ox, oy, oz, d.x, d.y, d.z, [block.x, block.y, block.z], [block.x + 1, block.y + 1, block.z + 1], REACH + 1);
      if (t !== null && t < hit.dist) return null;
    }
    return hit;
  }

  /** Whether the crosshair is on someone to talk to: a villager or a quest giver. */
  get aimsAtTalker(): boolean {
    const hit = this.aimedMob();
    return !!hit && !hit.mob.dead && (hit.mob.kind === 'villager' || hit.mob.kind === 'npc');
  }

  /** Where a Ground Slam is (see slamLeap): 1 crouching, 2 in the air, 3 down on the shield after the blow, 0 none. The figure is drawn from it. */
  get slamPhase(): number {
    const leap = this.slamLeap;
    if (leap) return leap.launched ? 2 : 1;
    return this.slamImpact > 0 ? 3 : 0;
  }

  /** Whether a Charge (not a roll) is running: the figure is drawn leaning into it, shield first. */
  get charging(): boolean {
    return !!this.rush && this.rush.def.id === 'charge';
  }

  /** `dist`: how far along the line of sight the mob was hit (a stab of the off hand needs it close: see `STAB_REACH`). */
  attackMob(mob: Mob, dist = 0): void {
    if (mob.def.invulnerable) return;
    this.leaveMount(); // a quest giver is spoken to, not struck
    const held = this.held;
    const item = held ? getItem(held.id) : null;
    const tool = item ? item.tool : null;
    const weapon = item ? item.weapon : null;
    const d = this.look();
    const hs = this.enchHeld();
    // A class weapon hits as it says (a wand or a bow in melee is a poke); anything else as before. The class multiplies it.
    // A bow (or crossbow) in the hand only pokes: a dagger in the off hand does the stabbing instead.
    const offItem = this.offhand.get(0) ? getItem(this.offhand.get(0)!.id) : null;
    const stab = !!offItem && offItem.id === I.DAGGER && !!item && (item.use === 'bow' || item.use === 'crossbow');
    // A bow does not attack in melee at all: with no dagger in the off hand a left click does nothing to a mob.
    if (!stab && !!item && (item.use === 'bow' || item.use === 'crossbow')) return;
    // ... and the dagger of the off hand is short: the mob must be right up against the player.
    if (stab && dist > STAB_REACH) return;
    const blade = stab ? offItem.weapon : weapon;
    // A dagger (in either hand) is quick: three stabs in a row, each within a second of the last, and the third goes in half as deep again.
    const dagger = stab || item?.id === I.DAGGER;
    let combo = false;
    if (dagger) {
      this.stabs = this.stabAge < COMBO_WINDOW ? this.stabs + 1 : 1;
      this.stabAge = 0;
      if (this.stabs >= COMBO_STABS) {
        combo = true;
        this.stabs = 0;
      }
    } else this.stabs = 0;
    const base = blade ? (blade.kind === 'melee' ? blade.damage : 1) : tool ? tool.damage : 1;
    const roll = rollDamage(this.cls?.stats ?? null, 'melee', (base + sharpnessBonus(levelOf(hs, ENCH.SHARPNESS))) * (combo ? 1.5 : 1) * (this.weakTime > 0 ? WEAK_DAMAGE : 1) * this.companionMight * this.wingMight, this.rand);
    const dealt = roll.amount;
    this.mobs.damage(mob, dealt, d.x, d.z, this.realm.mobEvents, true, true, true, {
      knock: 1 + levelOf(hs, ENCH.KNOCKBACK),
      fire: 4 * levelOf(hs, ENCH.FIRE_ASPECT),
      looting: levelOf(hs, ENCH.LOOTING),
    });
    this.showHit(mob, dealt, roll.crit, { blade: dagger, combo });
    // Siphon: a share of what the blow did comes back as health.
    const siphon = siphonShare(levelOf(hs, ENCH.SIPHON));
    if (siphon > 0 && !this.vitals.dead) this.vitals.health = Math.min(this.vitals.maxHealth, this.vitals.health + Math.round(dealt * siphon * 10) / 10);
    this.attackCooldown = (blade?.kind === 'melee' ? blade.cooldown : 0.5) / (this.cls ? this.cls.stats.attackSpeed : 1);
    this.emit(stab ? { t: 'swing', off: true } : { t: 'swing' });
    if (tool || weapon?.kind === 'melee') this.damageHeld(1);
    this.vitals.addExhaustion(EXHAUSTION.attack);
    this.emit({ t: 'inv' });
  }

  // ---- interaction ---------------------------------------------------------

  /** Aim, mine, attack, use and place for one frame. Call while the player is in control. */
  updateInteraction(dt: number, f: InputFrame): void {
    this.swingAge = Math.min(9, this.swingAge + dt);
    this.bashAge = Math.min(9, this.bashAge + dt);
    if (this.spectating || this.sleeping) {
      this.target = null;
      this.breakProgress = 0;
      this.hudProgress = 0;
      this.bowDraw = 0;
      this.lowerShield();
      return;
    }
    let rightPressed = f.right && !this.rightWas;
    this.rightWas = f.right;
    this.breakCooldown -= dt;
    this.placeCooldown -= dt;
    this.attackCooldown -= dt;
    this.stabAge = Math.min(9, this.stabAge + dt);
    this.castCooldown -= dt;
    this.lockedNotice -= dt;
    this.wildHint -= dt;
    if (this.emberCooldown > 0) this.emberCooldown = Math.max(0, this.emberCooldown - dt);
    if (!f.right) this.emberHeld = false;

    // Summoning a mount: nothing else is done while the cast goes on (it is ticked with the physics, see tickMount).
    if (this.mountCast) {
      this.target = null;
      this.breakProgress = 0;
      this.bowDraw = 0;
      this.hudProgress = Math.min(1, this.mountCast.time / MOUNT_CAST);
      return;
    }

    // Mounted: the two buttons are the mount's skills, and nothing else is done from the saddle.
    if (this.mountId) {
      this.updateMountSkills(dt, f);
      return;
    }

    // A map in the hand is only for reading: it does not attack, mine, place or use anything (but it still speaks to a villager or a quest giver).
    if (this.held && (getItem(this.held.id).use === 'map' || getItem(this.held.id).use === 'land_surveyor')) {
      const talk = rightPressed;
      f = { ...f, left: false, right: false };
      rightPressed = false;
      if (talk && this.aimsAtTalker && this.useOnMob()) return;
    }

    const d = this.look();
    const eye = this.eye();
    const mobHit = this.aimedMob();
    if (mobHit && f.left && this.attackCooldown <= 0) this.attackMob(mobHit.mob, mobHit.dist);
    if (rightPressed && this.useOnMob()) return;
    const rigHit = mobHit ? null : this.aimedVehicle();
    if (rigHit && f.left && this.attackCooldown <= 0) this.hitVehicle(rigHit.vehicle);
    if (rigHit && rightPressed && !f.sneak && this.mount(rigHit.vehicle)) return;
    // Aiming at a mob or a vehicle: don't also mine the block behind it.
    this.target = mobHit || rigHit ? null : raycast(this.world, eye.x, eye.y, eye.z, d.x, d.y, d.z, REACH);

    const held = this.held;
    const item = held ? getItem(held.id) : null;
    const target = this.target;

    // ---- skill book: right-click to learn what is written in it (before anything the cursor is on can take the click) ----
    if (rightPressed && item?.use === 'skill_book') {
      this.learnFromBook(this.selected);
      this.hudProgress = 0;
      return;
    }
    // ---- codex: right-click to open it ----
    if (rightPressed && item?.use === 'codex') {
      this.openCodex(this.selected);
      this.hudProgress = 0;
      return;
    }
    // ---- glowing set: right-click to put it in the outfit slot ----
    if (rightPressed && item?.use === 'outfit') {
      this.equipOutfit(this.selected);
      this.hudProgress = 0;
      return;
    }
    // ---- companion: right-click to put it in the companion slot ----
    if (rightPressed && item?.use === 'companion') {
      this.equipCompanion(this.selected);
      this.hudProgress = 0;
      return;
    }
    // ---- wings: right-click to put them in the wing slot ----
    if (rightPressed && item?.use === 'wings') {
      this.equipWings(this.selected);
      this.hudProgress = 0;
      return;
    }
    // ---- rings and necklaces: right-click to wear one ----
    if (rightPressed && item?.use === 'accessory') {
      this.equipAccessory(this.selected);
      this.hudProgress = 0;
      return;
    }
    // ---- mount horn: right-click to put it in the mount slot ----
    if (rightPressed && item?.use === 'horn') {
      this.equipHorn(this.selected);
      this.hudProgress = 0;
      return;
    }

    if (!target) {
      this.breakProgress = 0;
      this.breakKey = '';
    } else {
      // ---- breaking ----
      const key = `${target.x},${target.y},${target.z}`;
      const def = BLOCKS[target.id];
      // A protected block does not even start to crack.
      if (f.left && Number.isFinite(def.hardness) && !this.breakLocked(target.id, target.x, target.y, target.z, true)) {
        if (key !== this.breakKey) {
          this.breakKey = key;
          this.breakProgress = 0;
          this.hitTimer = 0;
        }
        const time = this.mode === 'creative' ? 0 : breakTime(def, item?.tool ?? null, this.toolEnchants().efficiency, !!item?.shears);
        if (this.mode === 'creative') {
          if (this.breakCooldown <= 0) {
            this.breakCooldown = 0.22;
            this.breakBlock(target.x, target.y, target.z);
            this.breakKey = '';
          }
        } else {
          this.breakProgress += dt / Math.max(0.05, time);
          this.hitTimer -= dt;
          // Mining swings the arm again and again (the others see it, though no swing event is sent).
          if (this.swingAge >= 0.3) {
            this.swingAge = 0;
            this.swingRate = 1;
          }
          if (this.hitTimer <= 0 && this.breakProgress < 1) {
            this.hitTimer = 0.24;
            this.realm.emitNear(target.x, target.y, target.z, { t: 'sound', sound: def.sound, action: 'hit', vol: 1 });
            // Each blow knocks a few chips off the block.
            this.realm.emitNear(target.x, target.y, target.z, { t: 'burst', id: target.id, x: target.x, y: target.y, z: target.z, count: 3 });
          }
          if (this.breakProgress >= 1) {
            this.breakBlock(target.x, target.y, target.z);
            this.breakProgress = 0;
            this.breakKey = '';
          }
        }
      } else {
        this.breakProgress = 0;
        this.breakKey = '';
      }

      // ---- use block (open GUI) ----
      if (rightPressed && isInteractive(target.id) && !f.sneak) {
        this.openForBlock(target);
        this.hudProgress = 0;
        return;
      }
      if (rightPressed && !f.sneak && this.biteCake(target)) {
        this.placeCooldown = 0.22;
        this.eatTimer = 0;
        this.hudProgress = 0;
        return;
      }
      if (rightPressed && this.pickBerries(target)) {
        this.placeCooldown = 0.22;
        this.eatTimer = 0;
        this.hudProgress = 0;
        return;
      }
      if (rightPressed && !f.sneak && this.useCampfire(target)) {
        this.placeCooldown = 0.22;
        this.eatTimer = 0;
        this.hudProgress = 0;
        return;
      }
    }
    this.hudProgress = this.breakProgress;
    this.updateShield(dt, f, item);

    if (rightPressed && this.target && item?.tool?.kind === 'axe' && this.stripBlock(this.target)) {
      this.placeCooldown = 0.25;
      this.eatTimer = 0;
      this.hudProgress = 0;
      return;
    }

    // A potato is food and a seed. Planting wins while the ground will take it, so a click on farmland does not start a meal.
    const plantSpot = item?.food && item.block != null && this.target ? this.blockPlaceSpot(this.target) : null;
    if (this.target && f.right && this.placeCooldown <= 0 && item && usedOnBlock(item)) {
      this.placeCooldown = item.tool ? 0.25 : 0.22;
      if (this.useHeldOn(this.target)) {
        this.eatTimer = 0;
        return;
      }
    }

    // The off hand gets the click when the main hand has no use for it: a torch set down from the off hand, as in the original.
    if (this.target && f.right && this.placeCooldown <= 0 && !this.mainHandOwnsUse(item) && this.offhandPlaceable()) {
      this.placeCooldown = 0.22;
      if (this.useOffhandOn(this.target)) {
        this.eatTimer = 0;
        return;
      }
    }

    // ---- eating ----
    // A poisonous potato can be eaten on a full stomach. Ordinary food cannot, even when it can make you sick.
    if (!plantSpot && item?.food && f.right && this.mode === 'survival' && (item.food.always || this.vitals.canEat())) {
      this.eatTimer += dt;
      this.hudProgress = Math.min(1, this.eatTimer / EAT_TIME);
      if (this.eatTimer >= EAT_TIME) {
        this.eatTimer = 0;
        this.vitals.eat(item.food);
        const poison = item.food.poison;
        if (poison && this.rand() < poison.chance) this.poison = Math.max(this.poison, poison.seconds);
        const sickness = item.food.sickness;
        if (sickness && this.rand() < sickness.chance) this.foodSick = Math.max(this.foodSick, sickness.seconds);
        if (item.food.clears) {
          this.poison = 0;
          this.poisonTick = 0;
          this.foodSick = 0;
          this.foodSickTick = 0;
        }
        held!.count -= 1;
        const leaves = item.food.leaves;
        if (held!.count <= 0) this.inventory.set(this.selected, leaves != null ? makeStack(leaves) : null);
        else if (leaves != null) this.giveOrDrop(makeStack(leaves));
        this.emit({ t: 'eat' });
        this.emit({ t: 'inv' });
      }
      return;
    }
    this.eatTimer = 0;

    // ---- emberstone: hold the button and stand still, and it takes you home ----
    if (item?.use === 'emberstone' && f.right && !this.emberHeld && this.updateEmberstone(dt)) return;
    if (this.emberTimer > 0) this.cancelEmberstone('The Emberstone was interrupted.');

    // ---- armor: right-click to put it on ----
    if (rightPressed && item?.armor) {
      this.equipHeld();
      return;
    }

    // ---- buckets ----
    if (rightPressed && item?.use === 'bucket') {
      this.useBucket();
      return;
    }

    // ---- bottle o' enchanting: throw it ----
    if (rightPressed && held && item?.use === 'xp_bottle') {
      this.throwBottle(held);
      return;
    }

    // ---- minecart on a rail, boat on the water ----
    if (rightPressed && held && item?.use === 'vehicle' && this.placeVehicle(held)) return;

    // ---- armor stand: set it on the block you are looking at ----
    if (rightPressed && held && item?.use === 'armor_stand' && this.placeArmorStand()) return;

    // ---- ender pearl: throw it, and go where it lands ----
    if (rightPressed && held && item?.use === 'pearl') {
      this.throwPearl(held);
      return;
    }

    // ---- fishing rod: cast it, and reel it in ----
    if (rightPressed && held && item?.use === 'fishing_rod') {
      this.useRod(held);
      return;
    }

    // ---- bow (a rider has to get off to draw it) ----
    const aims = item?.use === 'bow' || item?.use === 'crossbow';
    if (this.mountId && f.right && aims) this.leaveMount();
    this.updateBow(dt, f, aims && held ? held : null);

    // ---- staff, wand, spellbook: right-click casts ----
    if (f.right && item?.weapon?.kind === 'spell' && this.castCooldown <= 0) this.castWeapon(item.weapon, item.id);
  }

  /**
   * One frame of casting the Emberstone (the button is held on it). Returns true while the cast goes on. It is lost when you
   * walk off, are hurt or let go, and the stone then has to be tried again from the start.
   */
  private updateEmberstone(dt: number): boolean {
    const b = this.body;
    if (this.emberTimer <= 0) {
      if (this.mode !== 'creative' && this.emberCooldown > 0) {
        this.emit({ t: 'toast', text: `The Emberstone is resting: ${formatEmberTime(this.emberCooldown)} left.` });
        this.emberHeld = true;
        return false;
      }
      if (!this.standingStill()) {
        this.emit({ t: 'toast', text: 'The Emberstone needs you to stand still: not while moving or jumping.' });
        this.emberHeld = true;
        return false;
      }
      this.emberFrom = { x: b.x, y: b.y, z: b.z, health: this.vitals.health };
      this.emberTimer = Math.max(dt, 1e-3);
      this.emberEvent('start');
    } else {
      if (Math.hypot(b.x - this.emberFrom.x, b.z - this.emberFrom.z) > EMBER_MOVE_LIMIT || !b.onGround) {
        this.cancelEmberstone('The Emberstone was interrupted: you moved.');
        return false;
      }
      if (this.vitals.health < this.emberFrom.health) {
        this.cancelEmberstone('The Emberstone was interrupted: you were hurt.');
        return false;
      }
      this.emberTimer += dt;
    }
    this.hudProgress = Math.min(1, this.emberTimer / EMBER_CAST);
    if (this.emberTimer >= EMBER_CAST) this.finishEmberstone();
    return true;
  }

  /** Tell everyone near where the cast began what the Emberstone is doing. */
  private emberEvent(what: 'start' | 'stop'): void {
    const f = this.emberFrom;
    this.realm.emitNear(f.x, f.y, f.z, { t: 'ember', what, x: f.x, y: f.y, z: f.z }, 48);
  }

  private cancelEmberstone(text: string): void {
    this.emberEvent('stop');
    this.emberTimer = 0;
    this.emberHeld = true;
    this.hudProgress = 0;
    this.emit({ t: 'toast', text });
  }

  /** The cast is done: stand at the bed, or in the village when there is no bed, and let the stone rest. */
  private finishEmberstone(): void {
    const b = this.body;
    this.emberTimer = 0;
    this.emberHeld = true;
    this.hudProgress = 0;
    if (this.mode !== 'creative') this.emberCooldown = EMBER_COOLDOWN;
    this.slamLeap = null;
    const f = { x: b.x, y: b.y, z: b.z };
    this.realm.emitNear(f.x, f.y, f.z, { t: 'ember', what: 'depart', x: f.x, y: f.y, z: f.z }, 48);
    const home = this.respawnAtBed();
    if (!home) this.respawn();
    this.realm.emitNear(b.x, b.y, b.z, { t: 'ember', what: 'arrive', x: b.x, y: b.y, z: b.z }, 48);
    this.emit({ t: 'toast', text: home ? 'The Emberstone took you home.' : 'You have no bed: the Emberstone took you to the village.' });
  }

  /** Whether the line of the bobber you have out still holds: you are alive, have the rod in hand and it is not too far off. */
  keepsLine(b: Bobber | null, leash: number): boolean {
    if (!b || this.vitals.dead || this.spectating || this.screen === 'dead') return false;
    if (!this.realm.players.includes(this) || !isFishingRod(this.held?.id)) return false;
    if (Math.hypot(b.x - this.body.x, b.y - this.body.y, b.z - this.body.z) <= leash) return true;
    this.emit({ t: 'toast', text: 'You went too far: the line came loose.' });
    return false;
  }

  private fishEvent(what: 'cast' | 'reel' | 'catch', x: number, y: number, z: number): void {
    this.realm.emitNear(x, y, z, { t: 'fish', what, x, y, z }, 40);
  }

  /** The use button with a rod in the hand: with no bobber out it casts one, with one out it reels it in. */
  private useRod(rod: ItemStack): void {
    const out = this.realm.fishing.of(this);
    if (out) {
      this.reelIn(out);
      return;
    }
    const e = this.eye();
    const d = this.look();
    const { lure, luck } = rodEnchants(rod);
    this.realm.fishing.cast(this, e.x + d.x * 0.4, e.y - 0.15 + d.y * 0.4, e.z + d.z * 0.4, d.x, d.y, d.z, lure, luck);
    this.fishEvent('cast', e.x, e.y, e.z);
    this.emit({ t: 'swing' });
  }

  /**
   * Reel the bobber in. A fish that is biting comes out of the water (a fish, a bit of junk or, in open water, now and then a
   * treasure), arcing through the air to you, with a little experience; a creature that is hooked is pulled towards you; a
   * bobber that nothing has bitten on just comes back. Only a catch or a pull wears the rod.
   */
  private reelIn(b: Bobber): void {
    const fishing = this.realm.fishing;
    fishing.take(this);
    const body = this.body;
    this.emit({ t: 'swing' });
    let wear = 0;
    if (b.state === 'floating' && b.phase === 'bite') {
      const c = rollCatch(this.rand, b.luck, fishing.openWater(b));
      // It leaves the water in an arc that ends at your feet.
      const tx = body.x;
      const ty = body.y + 0.6;
      const tz = body.z;
      const dx = tx - b.x;
      const dz = tz - b.z;
      const T = 0.55 + Math.hypot(dx, dz) * 0.035;
      const sy = b.y + 0.45;
      this.drops.spawn(c.stack, b.x, sy, b.z, (dx * 0.92) / T, (ty - sy) / T + 10 * T, (dz * 0.92) / T, 0.45);
      this.realm.awardXp(catchXp(this.rand), body.x, body.y + 0.5, body.z);
      this.fishEvent('catch', b.x, b.y, b.z);
      wear = ROD_WEAR.catch;
    } else if (b.state === 'hooked' && b.hook && !b.hook.dead) {
      pullMob(b.hook, body.x, body.y, body.z);
      this.fishEvent('reel', b.x, b.y, b.z);
      wear = ROD_WEAR.mob;
    } else {
      this.fishEvent('reel', b.x, b.y, b.z);
    }
    if (wear > 0 && this.mode === 'survival') this.damageHeld(wear);
  }

  private throwPearl(held: ItemStack): void {
    const d = this.look();
    const e = this.eye();
    this.mobs.throwPearl(e.x + d.x * 0.5, e.y + d.y * 0.5 - 0.1, e.z + d.z * 0.5, d.x, d.y, d.z, this);
    this.realm.emitNear(e.x, e.y, e.z, { t: 'mob', kind: 'skeleton', sound: 'shoot', vol: 0.5 });
    this.emit({ t: 'swing' });
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, null);
    }
    this.emit({ t: 'inv' });
  }

  /**
   * A thrown ender pearl came down at (x, y, z) (the last free spot of its flight): the thrower is carried there,
   * landing on the ground below, and takes five points of fall damage (not in creative). Nothing happens when there
   * is no room to stand.
   */
  pearlLand(x: number, y: number, z: number): void {
    if (this.vitals.dead || this.spectating || this.screen === 'dead') return;
    this.dismount();
    const world = this.world;
    const body = this.body;
    let feet = Math.floor(y);
    let found = false;
    // The pearl stops against a wall, so back off from it when the exact spot is too tight for a person.
    const nudges: [number, number][] = [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]];
    outer: for (const [nx, nz] of nudges) {
      for (const dy of [0, 1, 2, -1]) {
        if (!collides(world, x + nx, feet + dy, z + nz, body.width, body.height)) {
          feet += dy;
          x += nx;
          z += nz;
          found = true;
          break outer;
        }
      }
    }
    if (!found) return;
    // Settle onto whatever is below.
    for (let i = 0; i < 12 && feet > 1 && !collides(world, x, feet - 1, z, body.width, body.height); i++) feet--;
    this.realm.emitNear(body.x, body.y, body.z, { t: 'mob', kind: 'enderman', sound: 'teleport', vol: 0.6 });
    this.teleport(x, feet, z);
    this.realm.emitNear(x, feet, z, { t: 'mob', kind: 'enderman', sound: 'teleport', vol: 0.6 });
    if (this.mode === 'survival') this.vitals.damage(PEARL_DAMAGE * (this.hardcore ? HARD_DAMAGE : 1), 'fall');
    this.emit({ t: 'inv' });
  }

  private throwBottle(held: ItemStack): void {
    const d = this.look();
    const e = this.eye();
    this.mobs.throwBottle(e.x + d.x * 0.5, e.y + d.y * 0.5 - 0.1, e.z + d.z * 0.5, d.x, d.y, d.z);
    this.realm.emitNear(e.x, e.y, e.z, { t: 'mob', kind: 'skeleton', sound: 'shoot', vol: 0.5 });
    this.emit({ t: 'swing' });
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, null);
    }
    this.emit({ t: 'inv' });
  }

  /**
   * Bow: hold right-click to draw (needs an arrow, free in creative), release to shoot. Like the
   * original, a quick tap fires a weak arrow, a full second of draw a fast, strong one.
   */
  private updateBow(dt: number, f: InputFrame, bow: { id: number } | null): void {
    const canDraw = !!bow && (this.mode === 'creative' || this.inventory.countOf(I.ARROW) > 0);
    const crossbow = !!bow && getItem(bow.id).use === 'crossbow';
    const full = crossbow ? CROSSBOW_DRAW : BOW_FULL_DRAW;
    if (canDraw && f.right) {
      this.bowCharge = Math.min(full * 1.2, this.bowCharge + dt * (this.cls ? this.cls.stats.attackSpeed : 1));
    } else if (this.bowCharge > 0) {
      const c = Math.min(1, this.bowCharge / full);
      this.bowCharge = 0;
      if (canDraw && c >= (crossbow ? 1 : 0.15)) {
        const power = crossbow ? 1 : (c * c + 2 * c) / 3;
        const e = this.eye();
        const hb = this.enchHeld();
        // It leaves from the bow, held low on the right, not from the middle of the view.
        const look = this.look();
        const sx = e.x + look.x * 1 + Math.cos(this.yaw) * 0.28;
        const sy = e.y + look.y * 1 - 0.2;
        const sz = e.z + look.z * 1 - Math.sin(this.yaw) * 0.28;
        // Arrows fall as they fly, so it is aimed a little above the crosshair: it lands on what the crosshair is on.
        const d = this.ballisticAim(sx, sy, sz, arrowSpeed(power));
        const arrow = this.mobs.shootArrow(sx, sy, sz, d.x, d.y, d.z, power, {
          power: levelOf(hb, ENCH.POWER),
          punch: levelOf(hb, ENCH.PUNCH),
          flame: levelOf(hb, ENCH.FLAME) > 0,
        });
        // A crossbow bolt hits as hard as the weapon says (9 is a full bow); the class's ranged multiplier and crits come on top.
        const weapon = bow ? getItem(bow.id).weapon : null;
        const shot = weapon ? (arrow.damage * weapon.damage) / 9 : arrow.damage;
        const roll = rollDamage(this.cls?.stats ?? null, 'ranged', shot * (this.weakTime > 0 ? WEAK_DAMAGE : 1) * this.companionMight * this.wingMight, this.rand);
        arrow.damage = roll.amount;
        // Where it ends, the archer is told: a number and a mark over what it hit (a headshot counts as a critical hit), or the arrow stands in the wall.
        arrow.onHit = (a, mob, dealt, head) => {
          if (mob) {
            this.showHit(mob, dealt, roll.crit || head, { arrow: true, head });
            return;
          }
          const v = Math.hypot(a.vx, a.vy, a.vz) || 1;
          this.realm.effects.mark('arrow_stick', this.name, a.x, a.y, a.z, 0, 5, { x: a.x + a.vx / v, y: a.y + a.vy / v, z: a.z + a.vz / v });
        };
        // A full draw rings louder than a tap.
        this.realm.emitNear(e.x, e.y, e.z, { t: 'mob', kind: 'skeleton', sound: 'shoot', vol: 0.35 + 0.45 * power });
        if (this.mode === 'survival') {
          if (levelOf(this.enchHeld(), ENCH.INFINITY) <= 0) this.inventory.remove(I.ARROW, 1);
          this.damageHeld(1);
          this.vitals.addExhaustion(0.02);
        }
        this.emit({ t: 'inv' });
      }
    }
    this.bowDraw = bow ? Math.min(1, this.bowCharge / full) : 0;
  }

  // ---- classes: abilities, damage dealt, experience -------------------------------------------------------
  // Everything a class does is decided here, on the server's copy of the player. A client names a button (`Command
  // 'ability'`); what the ability costs, whether it is ready, where it aims and what it hits come from this file and
  // from the player's own state. Abilities act on mobs only: players are never targets (PvP is off), and passive
  // animals and villagers are left alone by the area abilities.

  /** In the realm and alive: pending effects (a meteor on its way) are dropped when this is false. */
  alive(): boolean {
    return !this.vitals.dead && this.screen !== 'dead' && !this.spectating && this.realm.players.includes(this);
  }

  /** How fast this player moves compared with a person without a class. */
  get speedMul(): number {
    // A mount runs at its own speed, whoever rides it.
    const mount = mountDef(this.mountId);
    if (mount) return mount.speed;
    return this.cls ? this.cls.stats.moveSpeed : 1;
  }

  /** The off-hand item that is giving the class its bonus right now (0: none), see offhandModifier. */
  private offhandBonusId = 0;

  /** Keep the class stats in step with the item in the off hand (an orb or a dagger adds to them, a shield or nothing does not). */
  private syncOffhandBonus(): void {
    const cls = this.cls;
    if (!cls) return;
    const id = this.offhand.get(0)?.id ?? 0;
    const mod = offhandModifier(id);
    const key = mod ? id : 0;
    if (key === this.offhandBonusId) return;
    this.offhandBonusId = key;
    const full = cls.resource >= cls.stats.maxResource - 1e-6;
    cls.setOffhandModifier(mod);
    if (full) cls.resource = cls.stats.maxResource; // a pool that was full stays full when it gets deeper
    this.applyClassVitals(false);
  }

  /** What the worn and held gear gave the class stats last time (see gearKey). */
  private gearBonusKey = '';

  /**
   * Keep the class stats in step with the gear: the armor worn, the off hand and the item in hand add their bonus stats
   * (the pieces that need a higher level or another class add nothing). Recomputed only when something changed.
   */
  private syncGearBonus(): void {
    const cls = this.cls;
    if (!cls) return;
    const worn: (ItemStack | null)[] = [this.held, this.offhand.get(0)];
    for (let i = 0; i < this.armor.size; i++) worn.push(this.armor.get(i));
    const jewelry: (ItemStack | null)[] = [];
    for (let i = 0; i < this.accessories.size; i++) jewelry.push(this.accessories.get(i));
    const who = { id: cls.classId, level: cls.level };
    const key = `${gearKey(worn, who)}#${jewelry.map((j) => j?.id ?? 0).join(',')}#${glyphKey(worn)}#${glyphKey(jewelry)}`;
    if (key === this.gearBonusKey) return;
    this.gearBonusKey = key;
    const full = cls.resource >= cls.stats.maxResource - 1e-6;
    cls.setGearModifiers([...gearModifiers(worn, who), ...accessoryModifiers(jewelry, who), ...glyphModifiers(worn, who), ...glyphModifiers(jewelry, who)]);
    if (full) cls.resource = cls.stats.maxResource; // a pool that was full stays full when it gets deeper
    this.applyClassVitals(false);
  }

  /** Make health follow the class's stats (at a level-up the new health comes as a gain, not a full heal). */
  private applyClassVitals(fill: boolean): void {
    const cls = this.cls;
    if (!cls) return;
    const max = Math.max(1, Math.round(cls.stats.maxHealth));
    const gained = max - this.vitals.maxHealth;
    this.vitals.maxHealth = max;
    if (fill) this.vitals.health = max;
    else if (gained > 0 && !this.vitals.dead) this.vitals.health = Math.min(max, this.vitals.health + gained);
    else this.vitals.health = Math.min(max, this.vitals.health);
    this.lastHealth = this.vitals.health;
  }

  /** What every new character starts a world with, whatever the class: an Emberstone in the second slot of the bottom bar and a map in the third (survival only). */
  grantStarterItems(): void {
    if (this.mode !== 'survival') return;
    // The Emberstone in the second slot of the bottom bar and the map in the third (they go into the bags only when those are taken).
    for (const [slot, id] of [[1, I.EMBERSTONE], [2, I.MAP]] as const) {
      if (!this.inventory.get(slot)) this.inventory.set(slot, makeStack(id, 1));
      else this.collectOrDrop(makeStack(id, 1));
    }
  }

  /**
   * How an Adventure character begins: with nothing at all, on a cot in the Undercroft (the cave under the village), where the
   * healer has the first quest for them (the map, the compass, the Emberstone and the weapons are rewards along the way, see
   * quests.ts). A creative character skips all of it.
   */
  private beginAdventure(): void {
    const log = this.quests;
    if (!log) return;
    if (this.mode !== 'survival') {
      log.done.add(FIRST_QUEST);
      this.syncQuests();
      return;
    }
    this.emit({ t: 'toast', text: 'You wake in a lamplit cave. A woman is bending over you: right-click her to speak.' });
    this.syncQuests();
  }

  /** Whether the character has been given the clothes of its class yet (once given, they are items like any other: taking them off keeps them off). */
  private outfitted = false;

  /** Dress a character of a class in its clothes (only into slots that are empty): they are real items in the armor slots, and may be taken off. */
  grantOutfit(): void {
    this.outfitted = true;
    if (!this.cls) return;
    outfitItems(this.cls.classId).forEach((id, slot) => {
      if (!this.armor.get(slot)) this.armor.set(slot, makeStack(id, 1));
    });
    this.emit({ t: 'inv' });
  }

  /** The items a new character of the class starts a world with (survival only; nothing for a classless player). */
  grantClassKit(): void {
    if (!this.cls || this.mode !== 'survival') return;
    const def = CLASSES[this.cls.classId];
    for (const it of def.startingKit) {
      // The off-hand piece (shield, orb, dagger) goes straight to its slot.
      if (it.id === def.startingOffhand && !this.offhand.get(0)) this.offhand.set(0, makeStack(it.id, 1));
      else this.giveOrDrop(makeStack(it.id, it.count));
    }
    this.selected = 0;
    this.emit({ t: 'inv' });
  }

  /**
   * Class experience, with the level-up it may bring. The game itself no longer gives any (the class follows the
   * character's level, see `syncClassLevel`); this stays as a way to push the class level for tests and debugging.
   */
  addClassXp(amount: number): void {
    const cls = this.cls;
    if (!cls || this.spectating || this.vitals.dead) return;
    this.announceClassLevel(cls.addXp(amount), true);
  }

  /**
   * The class follows the character's level (the experience level on the green bar): levels it reaches teach the
   * abilities that unlock at them and strengthen the class. Never goes back down, so spending levels costs nothing.
   * `announce` is false when a save was just loaded.
   */
  syncClassLevel(announce = true): void {
    const cls = this.cls;
    if (!cls || this.spectating || this.vitals.dead) return;
    this.announceClassLevel(cls.raiseLevel(this.xp.level), announce);
  }

  /** Spend stat points (the server's say alone: the client only asks). Health follows at once, a deeper pool stays as full as it was. */
  private spendStatPoints(stat: AttrKey, n: number): void {
    const cls = this.cls;
    if (!cls || this.spectating || this.vitals.dead) return;
    const full = cls.resource >= cls.stats.maxResource - 1e-6;
    if (cls.spendPoints(stat, n) <= 0) return;
    if (full) cls.resource = cls.stats.maxResource;
    this.applyClassVitals(false);
  }

  /** Take back every stat point, to spend them again. */
  private resetStatPoints(): void {
    const cls = this.cls;
    if (!cls || this.spectating || this.vitals.dead) return;
    if (cls.resetPoints() <= 0) return;
    this.applyClassVitals(false);
    this.emit({ t: 'toast', text: `${cls.freePoints} stat points ready to spend again` });
  }

  private announceClassLevel(gained: { levels: number }, announce: boolean): void {
    const cls = this.cls;
    if (!cls || gained.levels <= 0) return;
    this.applyClassVitals(false);
    if (!announce) return;
    this.emit({ t: 'classlevel', level: cls.level });
    // A skill book in the bags that the new level has made readable: say so (abilities are learned from books, not by levelling).
    const readable: string[] = [];
    for (let i = 0; i < this.inventory.size; i++) {
      const s = this.inventory.get(i);
      const id = s ? skillBookAbility(s.id) : null;
      const def = id ? ABILITY_BY_ID.get(id) : undefined;
      if (def && def.classId === cls.classId && !cls.unlocked.has(def.id) && def.unlockLevel <= cls.level && def.unlockLevel > cls.level - gained.levels) readable.push(def.name);
    }
    this.emit({ t: 'toast', text: readable.length ? `You can now learn ${readable.join(', ')}: right-click the skill book` : `${CLASSES[cls.classId].name} grows stronger: ${gained.levels * POINTS_PER_LEVEL} stat points to spend` });
  }

  /**
   * Use the jewel on the cursor on the piece of equipment in slot `i` of the open screen (the bags, the armor slots or the off
   * hand). The jewel is used up unless it was refused, and the player is told how it went. False when this is not such a
   * click: no jewel, an empty slot, or something a jewel does not work on (the click then does what it always does).
   */
  private useJewelOnSlot(i: number): boolean {
    const m = this.menu;
    const cursor = m?.cursor;
    const kind = cursor ? jewelKind(cursor.id) : null;
    const slot = m?.slots[i];
    const target = m?.jewelTarget(i);
    if (!m || !cursor || !kind || !slot || !target) return false;
    const result = useJewel(kind, target, () => this.rand());
    this.emit({ t: 'toast', text: result.text });
    if (result.used) {
      if (result.stack) slot.container.set(slot.index, result.stack);
      cursor.count -= 1;
      if (cursor.count <= 0) m.cursor = null;
      this.emit({ t: 'jewel', ok: result.ok, kind, slot: i, label: result.label, detail: result.detail });
    }
    return true;
  }

  /**
   * Read a skill book in the bags (`index` is its slot): the ability it teaches is learned and the book is used up.
   * Nothing is lost when it cannot be learned, and the player is told why: the book is of another class, the level is
   * too low, or the ability is known already. Returns whether the slot held a skill book at all (so the click that
   * read it does not also pick it up).
   */
  learnFromBook(index: number): boolean {
    const stack = this.inventory.get(index);
    const ability = stack ? skillBookAbility(stack.id) : null;
    const def = ability ? ABILITY_BY_ID.get(ability) : undefined;
    if (!stack || !ability || !def) return false;
    if (this.vitals.dead || this.spectating || this.sleeping) return true;
    const cls = this.cls;
    const result = cls ? cls.learn(ability) : 'class';
    if (result === 'learned') {
      if (this.mode === 'survival') {
        stack.count -= 1;
        if (stack.count <= 0) this.inventory.set(index, null);
      }
      this.emit({ t: 'learned', ability });
      this.emit({ t: 'toast', text: `You have learned ${def.name}` });
    } else {
      const own = CLASSES[def.classId].name;
      this.emit({
        t: 'toast',
        text:
          result === 'level'
            ? `${def.name} needs level ${def.unlockLevel} (you are level ${cls?.level ?? 1})`
            : result === 'known'
              ? `You already know ${def.name}`
              : `Only a ${own} can learn ${def.name}`,
      });
    }
    this.emit({ t: 'inv' });
    return true;
  }

  /**
   * Open a Codex of Aurelion in the bags (`index` is its slot): it is used up and gives one piece of Epic gear, for the
   * character's class, near their level. Returns whether the slot held a codex (so the click that opened it does not pick it up).
   */
  openCodex(index: number): boolean {
    const stack = this.inventory.get(index);
    if (!stack || stack.id !== I.AURELION_CODEX) return false;
    if (this.vitals.dead || this.spectating || this.sleeping) return true;
    const piece = randomGear(this.mountLevel + Math.floor(this.rand() * 3) - 1, pickRarity([0, 0, 1], () => this.rand()), this.cls?.classId, () => this.rand());
    if (this.mode === 'survival') {
      stack.count -= 1;
      if (stack.count <= 0) this.inventory.set(index, null);
    }
    this.giveOrDrop(piece);
    this.emit({ t: 'toast', text: 'The Codex of Aurelion opens: a piece of epic gear' });
    this.emit({ t: 'inv' });
    return true;
  }

  // ---- mounts (see mounts.ts) ---------------------------------------------------------------------------------

  /** The level a mount asks for: the class level, or the experience level for a character without a class. */
  private get mountLevel(): number {
    return this.cls ? this.cls.level : Math.max(1, this.xp.level);
  }

  /** The mount whose horn is in the mount slot (null: the slot is empty). */
  get slotMount(): MountId | null {
    const s = this.mountSlot.get(0);
    return s ? mountOfItem(s.id) : null;
  }

  /** What the interface needs to know about the mounts: the one being ridden and the one in the slot (1 + their place in MOUNTS, 0 for none), and the cooldowns of the skills. */
  mountView(): MountView {
    const at = (id: MountId | null): number => (id ? MOUNTS.findIndex((m) => m.id === id) + 1 : 0);
    return { mount: at(this.mountId), pick: at(this.slotMount), cd: [Math.ceil(this.biteCd * 10) / 10, Math.ceil(this.howlCd * 10) / 10] };
  }

  /**
   * Put a mount horn of the bags (`index` is its slot) in the mount slot; a horn already there goes back to where this one
   * was. Returns whether the slot held a horn at all (so the click that used it does not also pick it up).
   */
  equipHorn(index: number): boolean {
    const stack = this.inventory.get(index);
    const id = stack ? mountOfItem(stack.id) : null;
    const def = mountDef(id);
    if (!stack || !id || !def) return false;
    if (this.vitals.dead || this.spectating || this.sleeping || this.mountId || this.mountCast) return true;
    const worn = this.mountSlot.get(0);
    this.mountSlot.set(0, cloneStack({ ...stack, count: 1 }));
    this.inventory.set(index, worn);
    this.emit({ t: 'toast', text: `${def.name} is in the mount slot: press H to ride (${mountSpeedText(def)}, level ${def.level})` });
    this.emit({ t: 'inv' });
    return true;
  }

  // ---- outfits (see outfits.ts) -----------------------------------------------------------------------------------

  /** The id of the glowing set in the outfit slot (null: none, or not a set of this hero's class). */
  get wornOutfit(): string | null {
    const s = this.outfitSlot.get(0);
    const def = s ? outfitSetOfItem(s.id) : null;
    return def && outfitSetFits(s!.id, this.cls?.classId ?? null) ? def.id : null;
  }

  /**
   * Put a glowing set of the bags (`index` is its slot) in the outfit slot; a set already there goes back to where this one was. Returns whether it
   * was a set at all (so the click that used it does not also pick it up). A set of another class stays where it is.
   */
  equipOutfit(index: number): boolean {
    const stack = this.inventory.get(index);
    const def = stack ? outfitSetOfItem(stack.id) : null;
    if (!stack || !def) return false;
    if (this.vitals.dead || this.spectating || this.sleeping) return true;
    if (!outfitSetFits(stack.id, this.cls?.classId ?? null)) {
      this.emit({ t: 'toast', text: `${def.name} is a set for the ${CLASSES[def.cls].name}: your hero cannot wear it` });
      return true;
    }
    const worn = this.outfitSlot.get(0);
    this.outfitSlot.set(0, cloneStack({ ...stack, count: 1 }));
    this.inventory.set(index, worn);
    this.emit({ t: 'toast', text: `You are wearing ${def.name}` });
    this.emit({ t: 'inv' });
    return true;
  }

  // ---- companions (see companions.ts) -----------------------------------------------------------------------------

  /** The companion in the companion slot, 1 + its place in COMPANIONS (0: none). It is what the other players are told, and the figure that follows. */
  get companionNumber(): number {
    const s = this.companionSlot.get(0);
    const def = s ? companionOfItem(s.id) : null;
    return def ? COMPANIONS.indexOf(def) + 1 : 0;
  }

  /** What the companion gives: a share more damage dealt (1.1) and a share of the damage taken that does not land (0.9). */
  private get companionMight(): number {
    const def = COMPANIONS[this.companionNumber - 1];
    return 1 + (def?.might ?? 0);
  }
  private get companionWard(): number {
    const def = COMPANIONS[this.companionNumber - 1];
    return 1 - (def?.ward ?? 0);
  }

  /** Put a companion of the bags (`index` is its slot) in the companion slot; one already there goes back to where this one was. Returns whether it was a companion at all. */
  equipCompanion(index: number): boolean {
    const stack = this.inventory.get(index);
    const def = stack ? companionOfItem(stack.id) : null;
    if (!stack || !def) return false;
    if (this.vitals.dead || this.spectating || this.sleeping) return true;
    const worn = this.companionSlot.get(0);
    this.companionSlot.set(0, cloneStack({ ...stack, count: 1 }));
    this.inventory.set(index, worn);
    this.emit({ t: 'toast', text: `${def.name} follows you now (${companionBonusText(def)})` });
    this.emit({ t: 'inv' });
    return true;
  }

  // ---- wings (see wings.ts) ---------------------------------------------------------------------------------------

  /** The wings in the wing slot, 1 + their place in WINGS (0: none). It is what the other players are told, and what is drawn on the back. */
  get wingNumber(): number {
    const s = this.wingSlot.get(0);
    const def = s ? wingOfItem(s.id) : null;
    return def ? WINGS.indexOf(def) + 1 : 0;
  }

  /** The wings worn (null: none). */
  get wingDef(): WingDef | null {
    return wingByNumber(this.wingNumber);
  }

  /** Flying on wings (the flight of survival mode: creative mode flies as it always did). */
  get wingFlying(): boolean {
    return this.flying && this.mode === 'survival' && !this.spectating && this.wingNumber > 0;
  }

  /** What the wings give: a share more damage dealt and a share of the damage taken that does not land. */
  private get wingMight(): number {
    return 1 + (this.wingDef?.might ?? 0);
  }
  private get wingWard(): number {
    return 1 - (this.wingDef?.ward ?? 0);
  }

  /** Put a pair of wings of the bags (`index` is its slot) in the wing slot; a pair already there goes back to where this one was. Returns whether it was a pair of wings at all. */
  equipWings(index: number): boolean {
    const stack = this.inventory.get(index);
    const def = stack ? wingOfItem(stack.id) : null;
    if (!stack || !def) return false;
    if (this.vitals.dead || this.spectating || this.sleeping) return true;
    const worn = this.wingSlot.get(0);
    this.wingSlot.set(0, cloneStack({ ...stack, count: 1 }));
    this.inventory.set(index, worn);
    this.emit({ t: 'toast', text: `${def.name} on your back (${wingBonusText(def)}): double-tap jump to fly` });
    this.emit({ t: 'inv' });
    return true;
  }

  // ---- rings and necklaces (see accessories.ts) -------------------------------------------------------------------

  /**
   * Wear a ring or a necklace of the bags (`index` is its slot). A ring goes in a free ring slot; with both full it takes the place of the
   * first one, which goes back to where this one was. A necklace takes the place of the one worn. Returns whether it was jewelry at all.
   */
  equipAccessory(index: number): boolean {
    const stack = this.inventory.get(index);
    const def = stack ? accessoryOfItem(stack.id) : null;
    if (!stack || !def) return false;
    if (this.vitals.dead || this.spectating || this.sleeping) return true;
    const places = accessorySlotsOf(def.kind);
    const at = places.find((i) => !this.accessories.get(i)) ?? places[0];
    const worn = this.accessories.get(at);
    this.accessories.set(at, cloneStack({ ...stack, count: 1 }));
    this.inventory.set(index, worn);
    this.emit({ t: 'toast', text: `${def.name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} on` });
    this.emit({ t: 'inv' });
    return true;
  }

  /** Only a ring in a ring slot, and a necklace in the necklace slot, one of each (a hostile or old save): anything else is dropped. */
  private sanitizeAccessories(): void {
    for (let i = 0; i < ACCESSORY_SLOT_COUNT; i++) {
      const s = this.accessories.get(i);
      if (!s) continue;
      const def = accessoryOfItem(s.id);
      if (!def || !accessorySlotsOf(def.kind).includes(i)) this.accessories.set(i, null);
      else s.count = 1;
    }
  }

  /** The double tap of the jump key with wings on: take off (a push off the ground), or fold the wings and come down. */
  private toggleWingFlight(): void {
    if (this.flying) {
      this.flying = false;
      return;
    }
    const b = this.body;
    if (this.vitals.dead || this.riding || this.sleeping) return;
    if (this.mountId) {
      this.emit({ t: 'toast', text: "You can't fly while mounted." });
      return;
    }
    if (b.inWater || b.onLadder || this.rootTime > 0) return;
    if (this.vitals.hunger <= WING_MIN_HUNGER) {
      this.emit({ t: 'toast', text: 'You are too hungry to fly.' });
      return;
    }
    this.flying = true;
    this.wingGroundT = 0;
    // A push off the ground, unless there is a roof in the way (a room, a doorway: the head would knock on it); the wings then lift gently.
    if (b.onGround) {
      const room = !collides(this.world, b.x, b.y + 1.2, b.z, b.width, b.height);
      b.vy = room ? WING_TAKEOFF : 2;
      b.onGround = false;
    }
  }

  /**
   * The mount key. Mounted: get off. Summoning: cancel. Otherwise begin to summon the mount of the horn in the mount slot: a
   * cast that needs the player to stand still (see tickMount), and is refused indoors, in water and in the air.
   */
  useMountKey(): void {
    if (!this.ready || this.vitals.dead || this.spectating || this.sleeping || this.screen !== 'none') return;
    if (this.mountCast) {
      this.cancelMountCast('Summoning cancelled.');
      return;
    }
    if (this.mountId) {
      this.leaveMount();
      return;
    }
    if (this.riding) return;
    const id = this.slotMount ?? (this.mode === 'creative' ? MOUNTS[MOUNTS.length - 1].id : null);
    const def = mountDef(id);
    if (!id || !def) {
      this.emit({ t: 'toast', text: 'The mount slot is empty. Fenna Longbow, at the market, sells horns: put one in the slot (top right).' });
      return;
    }
    if (this.mode === 'survival' && this.mountLevel < def.level) {
      this.emit({ t: 'toast', text: `${def.horn} needs level ${def.level} (you are level ${this.mountLevel})` });
      return;
    }
    const b = this.body;
    if (this.flying) {
      this.emit({ t: 'toast', text: "You can't mount while flying." });
      return;
    }
    if (!this.standingStill()) {
      this.emit({ t: 'toast', text: "You can't mount while moving or jumping: stand still." });
      return;
    }
    const block = mountBlocker(this.world, b.x, b.y, b.z, b.inWater);
    if (block) {
      this.emit({ t: 'toast', text: MOUNT_BLOCK_TEXT[block] });
      return;
    }
    this.lowerShield();
    this.mountCast = { id, time: 0, x: b.x, y: b.y, z: b.z, health: this.vitals.health };
    this.realm.emitNear(b.x, b.y, b.z, { t: 'mount', what: 'start', id, x: b.x, y: b.y, z: b.z }, 48);
  }

  /** The summoning is lost (`text`: told to the player), and everyone near sees it end. */
  private cancelMountCast(text?: string): void {
    const cast = this.mountCast;
    if (!cast) return;
    this.mountCast = null;
    this.hudProgress = 0;
    this.realm.emitNear(cast.x, cast.y, cast.z, { t: 'mount', what: 'stop', id: cast.id, x: cast.x, y: cast.y, z: cast.z }, 48);
    if (text) this.emit({ t: 'toast', text });
  }

  /** Get off the mount (and lose a summoning that is under way). */
  leaveMount(text?: string): void {
    this.cancelMountCast();
    const id = this.mountId;
    if (!id) return;
    this.mountId = null;
    const b = this.body;
    this.peakY = b.y;
    this.realm.emitNear(b.x, b.y, b.z, { t: 'mount', what: 'off', id, x: b.x, y: b.y, z: b.z }, 48);
    if (text) this.emit({ t: 'toast', text });
  }

  /** One frame of the mount's skills: the left button bites, the right one howls up a thunderstorm (each when it is ready). */
  private updateMountSkills(dt: number, f: InputFrame): void {
    this.biteCd = Math.max(0, this.biteCd - dt);
    this.howlCd = Math.max(0, this.howlCd - dt);
    this.target = null;
    this.breakProgress = 0;
    this.breakKey = '';
    this.bowDraw = 0;
    this.eatTimer = 0;
    this.hudProgress = 0;
    this.lowerShield();
    const def = mountDef(this.mountId);
    if (!def || this.vitals.dead || this.spectating) return;
    if (f.left && this.biteCd <= 0) this.mountBite(def.id, def.power);
    if (f.right && this.howlCd <= 0) this.mountHowl(def.id, def.power);
  }

  /** The bite: a sweep in front of the mount, hurting every foe in reach and throwing them back. */
  private mountBite(id: MountId, power: number): void {
    const b = this.body;
    const s = MOUNT_BITE;
    const look = this.flatLook();
    const min = Math.cos(s.arc / 2);
    const attackSpeed = this.cls ? this.cls.stats.attackSpeed : 1;
    this.biteCd = s.cooldown / attackSpeed;
    for (const m of this.foesNear(b.x, b.y, b.z, s.range, 5)) {
      const dx = m.body.x - b.x;
      const dz = m.body.z - b.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.5 && (dx * look.x + dz * look.z) / len < min) continue;
      this.strike(m, s.damage * power, 'melee', { x: b.x, z: b.z }, s.knock);
    }
    this.vitals.addExhaustion(EXHAUSTION.attack);
    // The bite leaves a mark running to the far end of its reach, in the colour of the mount's lightning.
    this.realm.effects.mark('fang', this.name, b.x, b.y, b.z, s.range, 0.7, { x: b.x + look.x * s.range, y: b.y, z: b.z + look.z * s.range }).mount = id;
    this.realm.emitNear(b.x, b.y, b.z, { t: 'mount', what: 'bite', id, x: b.x, y: b.y, z: b.z, yaw: this.yaw }, 48);
  }

  /**
   * The Thunder Howl: the mount throws up its head and howls, and the storm answers. The ground the rider's crosshair is on is marked
   * and, a moment later, lightning strikes it again and again, hurting every foe within reach of the strike.
   */
  private mountHowl(id: MountId, power: number): void {
    const b = this.body;
    const s = MOUNT_HOWL;
    const look = this.flatLook();
    this.howlCd = s.cooldown / (this.cls ? this.cls.stats.attackSpeed : 1);
    let { x, y, z } = this.aimGround(s.reach);
    // Not at the mount's own feet: a storm that close would strike the saddle, so it is called a few blocks ahead instead.
    if (Math.hypot(x - b.x, z - b.z) < 3) {
      x = b.x + look.x * 3;
      z = b.z + look.z * 3;
      y = this.groundBelow(x, b.y + 1, z, 4);
    }
    this.realm.effects.addZone({ owner: this, by: this.name, x, y, z, radius: s.radius, damage: s.damage * power, kind: 'spell', delay: s.delay, waves: s.strikes, interval: s.interval, warn: 'thunder_warn', hit: 'thunder_hit', knock: s.knock, mount: id });
    this.vitals.addExhaustion(EXHAUSTION.attack);
    this.realm.emitNear(b.x, b.y, b.z, { t: 'mount', what: 'howl', id, x: b.x, y: b.y, z: b.z, yaw: this.yaw }, 48);
  }

  /** One physics step of the mount: the summoning counts up (and is lost if the player moves or is hurt), and a rider in deep water or lava is thrown off. */
  private tickMount(dt: number): void {
    const b = this.body;
    const cast = this.mountCast;
    if (cast) {
      if (this.vitals.dead || this.screen !== 'none' || this.sleeping || this.riding || this.flying) {
        this.cancelMountCast();
        return;
      }
      if (Math.hypot(b.x - cast.x, b.z - cast.z) > MOUNT_MOVE_LIMIT || Math.abs(b.y - cast.y) > 0.6 || !b.onGround) {
        this.cancelMountCast('Summoning interrupted: you moved.');
        return;
      }
      if (this.vitals.health < cast.health) {
        this.cancelMountCast('Summoning interrupted: you were hurt.');
        return;
      }
      if (b.inWater) {
        this.cancelMountCast("You can't mount in the water.");
        return;
      }
      cast.health = Math.max(cast.health, this.vitals.health);
      cast.time += dt;
      if (cast.time >= MOUNT_CAST) {
        this.mountCast = null;
        this.mountId = cast.id;
        this.hudProgress = 0;
        this.peakY = b.y;
        this.realm.emitNear(b.x, b.y, b.z, { t: 'mount', what: 'on', id: cast.id, x: b.x, y: b.y, z: b.z }, 48);
      }
      return;
    }
    if (this.mountId) {
      if (this.vitals.dead || this.spectating) this.leaveMount();
      else if (this.flying) this.leaveMount();
      else if (b.eyeInWater || b.inLava) this.leaveMount('The water is too deep: you are off your mount.');
      else {
        // A mount is for the open: the inside of a house, a cellar or a cave puts the rider off after a moment (a gate or a bridge does not: see `rideEnclosed`).
        this.rideCheck -= dt;
        if (this.rideCheck <= 0) {
          this.rideCheck = RIDE_CHECK;
          this.rideCover = rideEnclosed(this.world, b.x, b.y, b.z) ? this.rideCover + RIDE_CHECK : 0;
          if (this.rideCover >= RIDE_GRACE) this.leaveMount('You are off your mount: you cannot ride indoors.');
        }
      }
    } else {
      this.rideCover = 0;
      this.rideCheck = 0;
    }
  }

  /** Whether the player is standing still on the ground: not walking, not jumping or falling (the Emberstone and the mount are only cast like that). */
  private standingStill(): boolean {
    const b = this.body;
    return b.onGround && Math.hypot(b.vx, b.vz) < STILL_SPEED;
  }
  /** A mob is a target for abilities: anything hostile, and the farm animals (cows, pigs, sheep...), but not villagers, quest givers or other bystanders. */
  private isFoe(m: Mob): boolean {
    return !m.dead && (m.def.hostile || !m.def.ambient) && !m.def.invulnerable;
  }

  private foesNear(x: number, y: number, z: number, radius: number, height = 3.5): Mob[] {
    const out: Mob[] = [];
    for (const m of this.mobs.mobs) {
      if (!this.isFoe(m)) continue;
      if (Math.hypot(m.body.x - x, m.body.z - z) <= radius + (m.body.width ?? 0.6) / 2 && Math.abs(m.body.y - y) <= height) out.push(m);
    }
    return out;
  }

  /**
   * One hit on a mob by this player's class: the class's multiplier for the kind of damage and a critical roll
   * (the server's own dice), then the mob's usual damage and knockback. `from` is where the push comes from.
   */
  strike(mob: Mob, base: number, kind: DamageKind, from: { x: number; z: number }, knock = 1, lift = 0): void {
    if (mob.dead || mob.def.invulnerable) return;
    const roll = rollDamage(this.cls?.stats ?? null, kind, base * (this.weakTime > 0 ? WEAK_DAMAGE : 1) * this.companionMight * this.wingMight, this.rand);
    this.mobs.damage(mob, roll.amount, mob.body.x - from.x, mob.body.z - from.z, this.realm.mobEvents, true, knock > 0, true, { knock, lift });
    this.showHit(mob, roll.amount, roll.crit);
  }

  /** Tell the player how much a hit of theirs did (the number floats up over the mob). */
  private showHit(mob: Mob, amount: number, crit: boolean, how: { arrow?: boolean; head?: boolean; blade?: boolean; combo?: boolean } = {}): void {
    // A training dummy also reports what it has taken so far (it starts over when it has taken all it has).
    const total = mob.kind === 'dummy' ? { total: Math.round(mob.maxHealth - mob.health) } : {};
    this.emit({
      t: 'dmg',
      x: mob.body.x,
      y: mob.body.y + (mob.body.height ?? 1.8) + 0.25,
      z: mob.body.z,
      // The number is what the mob lost, in the game's own units (see tuning.ts): whole numbers once they are big.
      amount: TUNING.damageScale > 1 ? Math.round(amount * TUNING.damageScale) : Math.round(amount * 10) / 10,
      ...(crit ? { crit: true } : {}),
      ...(how.arrow ? { arrow: true } : {}),
      ...(how.head ? { head: true } : {}),
      ...(how.blade ? { blade: true } : {}),
      ...(how.combo ? { combo: true } : {}),
      ...total,
    });
  }

  /** The way the player faces on the ground (unit length). */
  private flatLook(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  /** The ground at (x, z) at or below `y` (up to `depth` blocks down), as the height of a foot standing on it. */
  private groundBelow(x: number, y: number, z: number, depth = 12): number {
    let by = Math.floor(y);
    for (let i = 0; i < depth && by > 0; i++, by--) {
      if (IS_SOLID[this.world.getBlock(Math.floor(x), by - 1, Math.floor(z))]) return by;
    }
    return Math.floor(y);
  }

  /**
   * The direction to loose an arrow from (sx, sy, sz) at `speed` so that, falling as it flies, it passes through whatever
   * the crosshair is on (a mob or a block; far ahead if it is on nothing). Falls back to the line of sight when the target
   * is out of range or straight above or below.
   */
  private ballisticAim(sx: number, sy: number, sz: number, speed: number): { x: number; y: number; z: number } {
    const d = this.look();
    const e = this.eye();
    const REACH = 64;
    let dist = 40;
    const block = raycast(this.world, e.x, e.y, e.z, d.x, d.y, d.z, REACH);
    if (block) dist = Math.hypot(block.x + 0.5 + block.nx * 0.5 - e.x, block.y + 0.5 + block.ny * 0.5 - e.y, block.z + 0.5 + block.nz * 0.5 - e.z);
    const mob = this.mobs.raycast(e.x, e.y, e.z, d.x, d.y, d.z, Math.min(dist, REACH), 0.2);
    if (mob) dist = mob.dist;
    const hx = e.x + d.x * dist - sx;
    const hz = e.z + d.z * dist - sz;
    const dy = e.y + d.y * dist - sy;
    const h = Math.hypot(hx, hz);
    if (h < 1.5) return d;
    const g = ARROW_GRAVITY;
    const v2 = speed * speed;
    const disc = v2 * v2 - g * (g * h * h + 2 * dy * v2);
    // Out of range: lob it up as far as is natural, so it falls short of the target instead of flying flat.
    const tan = disc < 0 ? Math.min(0.45, v2 / (g * h)) : (v2 - Math.sqrt(disc)) / (g * h); // else the flatter of the two ways to get there
    const cos = 1 / Math.sqrt(1 + tan * tan);
    return { x: (hx / h) * cos, y: tan * cos, z: (hz / h) * cos };
  }

  /** The point on the ground the player is looking at, within `reach` blocks (the end of the reach, brought down to the ground, if nothing is hit). */
  private aimGround(reach: number): { x: number; y: number; z: number } {
    const d = this.look();
    const e = this.eye();
    const hit = raycast(this.world, e.x, e.y, e.z, d.x, d.y, d.z, reach);
    if (hit && hit.ny > 0) return { x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5 };
    const px = hit ? hit.x + 0.5 + hit.nx : e.x + d.x * reach;
    const pz = hit ? hit.z + 0.5 + hit.nz : e.z + d.z * reach;
    const py = hit ? hit.y + 0.5 + hit.ny : e.y + d.y * reach;
    return { x: px, y: this.groundBelow(px, py, pz, 24), z: pz };
  }

  /**
   * The ability on a button: checks it is unlocked, off cooldown and affordable, pays for it and does it. Returns what
   * happened. Everything here is decided by the server's own state, so asking for a button is all a client can do.
   */
  useAbility(slot: number): 'cast' | 'noclass' | 'busy' | CastBlock {
    const cls = this.cls;
    if (!cls) return 'noclass';
    const def = abilityAt(cls.classId, slot);
    if (!def) return 'locked';
    if (!this.ready || this.vitals.dead || this.spectating || this.sleeping || this.riding || this.screen !== 'none') return 'busy';
    if (this.mountId) {
      this.emit({ t: 'toast', text: 'On a mount your buttons are its skills: get off to use abilities.' });
      return 'busy';
    }
    const why = cls.block(def.id);
    if (why) {
      const text =
        why === 'locked'
          ? `You have not learned ${def.name}: find or buy its skill book`
          : why === 'cooldown'
            ? `${def.name} is not ready (${Math.ceil(cls.cooldownLeft(def.id))}s)`
            : `Not enough ${CLASSES[cls.classId].resource.name.toLowerCase()}`;
      this.emit({ t: 'toast', text });
      return why;
    }
    cls.commit(def.id);
    this.leaveMount();
    this.runAbility(def);
    this.emit({ t: 'cast', slot });
    // The sword swings for the others; a shield bash, a charge and a guard have their own pictures (the client draws them from the cast).
    if (def.id !== 'shield_bash' && def.id !== 'charge' && def.id !== 'iron_defense' && def.id !== 'ground_slam') this.emit({ t: 'swing' });
    return 'cast';
  }

  /** A blast around a point: hurts (and stuns or slows) every foe within the radius, and leaves its mark. */
  private novaAt(def: AbilityDef, e: Extract<AbilityDef['effect'], { t: 'nova' }>, x: number, y: number, z: number, from: { x: number; z: number }): void {
    for (const m of this.foesNear(x, y, z, e.radius)) {
      this.strike(m, e.damage, def.kind, from, e.knock ?? 0, e.lift ?? 0);
      if (e.stun || e.slow) this.mobs.applyStatus(m, { ...(e.stun ? { stun: e.stun } : {}), ...(e.slow ? { slow: e.slow } : {}) });
    }
    // The frost stays on the ground a little while after the wave has passed; a slam leaves its cracks.
    if (def.id === 'frost_nova') this.realm.effects.mark('frost_nova', this.name, x, y, z, e.radius, 2.5);
    else this.realm.effects.mark('slam', this.name, x, y, z, e.radius, 1.4);
  }

  /** Start a Charge: the body runs, a step at a time, along the way it was aimed (see stepRush). */
  private startRush(def: AbilityDef, e: Extract<AbilityDef['effect'], { t: 'dash' }>, dx: number, dz: number): void {
    const b = this.body;
    const speed = e.speed ?? 20;
    // A charge's mark follows the body; a roll's is the path it takes (to wherever the way is clear, up to its distance).
    let mark: Fx;
    if (e.hit) mark = this.realm.effects.mark('charge', this.name, b.x, b.y, b.z, 1.2, e.distance / speed + 0.5);
    else {
      let reach = 0;
      for (let at = 0.4; at <= e.distance; at += 0.4) {
        if (collides(this.world, b.x + dx * at, b.y, b.z + dz * at, b.width, b.height) && collides(this.world, b.x + dx * at, b.y + 1, b.z + dz * at, b.width, b.height)) break;
        reach = at;
      }
      mark = this.realm.effects.mark('roll', this.name, b.x, b.y + 0.9, b.z, 1, e.distance / speed + 0.5, { x: b.x + dx * reach, y: b.y + 0.9, z: b.z + dz * reach });
    }
    this.rush = { yaw: Math.atan2(-dx, -dz), speed, left: e.distance, time: 0, stall: 0, dx, dz, hit: new Set(), def, mark };
    // Off the mark at once rather than building up speed.
    b.vx = dx * speed * 0.6;
    b.vz = dz * speed * 0.6;
    if (e.immune) this.cls?.grantImmunity(e.immune);
  }

  private endRush(): void {
    const r = this.rush;
    if (!r) return;
    this.rush = null;
    if (r.mark.k === 'charge') r.mark.ttl = Math.min(r.mark.ttl, r.mark.age + 0.6);
    else {
      // a roll comes out of it with a little run left, not at full speed
      this.body.vx *= 0.35;
      this.body.vz *= 0.35;
    }
  }

  /** Called every step while charging: count the distance, hit what is in the way, hop a block that stops it, and stop at the end or at a wall. */
  private stepRush(px: number, pz: number): void {
    const r = this.rush;
    if (!r) return;
    const b = this.body;
    const e = r.def.effect;
    if (e.t !== 'dash') return this.endRush();
    r.time += STEP;
    const moved = Math.hypot(b.x - px, b.z - pz);
    r.left -= moved;
    if (r.mark.k === 'charge') {
      r.mark.x = b.x;
      r.mark.y = b.y;
      r.mark.z = b.z;
    }
    if (e.hit) {
      for (const m of this.foesNear(b.x, b.y, b.z, e.hit.radius, 2)) {
        if (r.hit.has(m)) continue;
        r.hit.add(m);
        this.strike(m, e.hit.damage, r.def.kind, { x: b.x - r.dx, z: b.z - r.dz }, e.hit.knock ?? 0, e.hit.lift ?? 0);
      }
    }
    // Stopped by something: a block high enough to hop is hopped, a wall ends it.
    r.stall = moved < r.speed * STEP * 0.35 ? r.stall + 1 : 0;
    if (r.stall > 16 || this.vitals.dead || this.flying || this.riding || b.inWater || r.time > (e.distance / r.speed) * 2 + 0.6 || r.left <= 0) {
      this.peakY = b.y;
      this.endRush();
    }
  }

  /** Called every step: a Ground Slam in the air comes down (the blast), or is called off if the player cannot land normally. */
  private stepSlamLeap(): void {
    if (this.slamImpact > 0) this.slamImpact = Math.max(0, this.slamImpact - STEP);
    const leap = this.slamLeap;
    if (!leap) return;
    const b = this.body;
    leap.time += STEP;
    if (this.vitals.dead || this.flying || this.riding || b.inWater || b.onLadder || b.inWeb || leap.time > 4 + SLAM_WIND) {
      this.slamLeap = null;
      this.endRush();
      return;
    }
    const e = leap.def.effect;
    if (e.t !== 'nova' || !e.leap) {
      this.slamLeap = null;
      return;
    }
    if (!leap.launched) {
      // Crouching (the body keeps moving as it was) until it springs.
      if (SLAM_WIND > leap.time) return;
      // The spring: thrown up and ahead, the way the player is looking now, with a puff of dust from the ground under the feet.
      const look = this.flatLook();
      b.vy = e.leap.up;
      b.vx = look.x * e.leap.forward;
      b.vz = look.z * e.leap.forward;
      b.onGround = false;
      this.prevOnGround = false;
      this.peakY = b.y;
      leap.launched = true;
      leap.time = 0;
      this.realm.effects.mark('leap', this.name, b.x, b.y, b.z, 1.4, 0.6);
      this.realm.emitNear(b.x, b.y, b.z, { t: 'sound', sound: this.soundUnderfoot(), action: 'land', vol: 1.5 });
      return;
    }
    // Still going up on the first steps: the body has not left the ground yet in the eyes of the physics.
    if (0.2 > leap.time || !b.onGround) return;
    this.slamLeap = null;
    this.endRush();
    // The landing is the attack, not a fall.
    this.peakY = b.y;
    b.vx = b.vz = 0;
    this.slamImpact = SLAM_IMPACT;
    this.novaAt(leap.def, e, b.x, b.y, b.z, { x: b.x, z: b.z });
    this.realm.emitNear(b.x, b.y, b.z, { t: 'sound', sound: this.soundUnderfoot(), action: 'land', vol: 1.2 });
  }

  private runAbility(def: AbilityDef): void {
    const b = this.body;
    const fx = this.realm.effects;
    const e = def.effect;
    const from = { x: b.x, z: b.z };
    const look = this.flatLook();
    switch (e.t) {
      case 'nova': {
        if (e.leap) {
          // A leap: a crouch first (the body is held still), then thrown up and ahead; the blast comes when the feet are back on the ground.
          this.slamLeap = { def, time: 0, launched: false };
          this.slamImpact = 0;
          return;
        }
        this.novaAt(def, e, b.x, b.y, b.z, from);
        return;
      }
      case 'cone': {
        if (def.id === 'shield_bash') this.bashAge = 0;
        const min = Math.cos(e.arc / 2);
        for (const m of this.foesNear(b.x, b.y, b.z, e.range)) {
          const dx = m.body.x - b.x;
          const dz = m.body.z - b.z;
          const len = Math.hypot(dx, dz);
          if (len > 0.5 && (dx * look.x + dz * look.z) / len < min) continue;
          this.strike(m, e.damage, def.kind, from, e.knock ?? 0, e.lift ?? 0);
          if (e.stun) this.mobs.applyStatus(m, { stun: e.stun });
        }
        // The far end of the mark says which way the blow went.
        fx.mark('bash', this.name, b.x + look.x * 1.2, b.y + 0.9, b.z + look.z * 1.2, e.range / 2, 0.7, { x: b.x + look.x * e.range, y: b.y + 0.9, z: b.z + look.z * e.range });
        return;
      }
      case 'dash': {
        let dx = look.x;
        let dz = look.z;
        if (e.direction === 'move') {
          // Where you are moving; standing still, backwards.
          const fwd = this.moveIn.forward;
          const side = this.moveIn.strafe;
          if (fwd === 0 && side === 0) {
            dx = -look.x;
            dz = -look.z;
          } else {
            // Strafe +1 is to the right of the facing direction, which is (cos yaw, -sin yaw).
            dx = look.x * fwd + Math.cos(this.yaw) * side;
            dz = look.z * fwd - Math.sin(this.yaw) * side;
            const len = Math.hypot(dx, dz) || 1;
            dx /= len;
            dz /= len;
          }
        }
        if (e.speed) {
          this.startRush(def, e, dx, dz);
          return;
        }
        const start = { x: b.x, y: b.y, z: b.z };
        const hit = new Set<Mob>();
        const stepLen = 0.4;
        for (let travelled = 0; travelled < e.distance; travelled += stepLen) {
          const nx = b.x + dx * stepLen;
          const nz = b.z + dz * stepLen;
          if (!collides(this.world, nx, b.y, nz, b.width, b.height)) {
            b.x = nx;
            b.z = nz;
          } else if (!collides(this.world, nx, b.y + 1, nz, b.width, b.height)) {
            b.x = nx;
            b.y += 1;
            b.z = nz;
          } else break;
          if (e.hit) {
            for (const m of this.foesNear(b.x, b.y, b.z, e.hit.radius, 2)) {
              if (hit.has(m)) continue;
              hit.add(m);
              this.strike(m, e.hit.damage, def.kind, { x: b.x - dx, z: b.z - dz }, e.hit.knock ?? 0, e.hit.lift ?? 0);
            }
          }
        }
        b.vx = 0;
        b.vz = 0;
        this.peakY = b.y;
        if (e.immune) this.cls?.grantImmunity(e.immune);
        fx.mark(e.hit ? 'charge' : 'roll', this.name, start.x, start.y + 0.9, start.z, 1, 0.6, { x: b.x, y: b.y + 0.9, z: b.z });
        return;
      }
      case 'bolt': {
        const d = this.look();
        const eye = this.eye();
        const spell = def.id === 'fireball' ? 1 : 2;
        this.mobs.castBolt(eye.x + d.x * 0.6, eye.y + d.y * 0.6 - 0.1, eye.z + d.z * 0.6, d.x, d.y, d.z, e.speed, spell, (hx, hy, hz, target) => {
          this.boltBurst(hx, hy, hz, target, e.damage, def.kind, e.radius ?? 0, e.burn ?? 0, spell === 1 ? 'fireball_burst' : 'bolt', spell === 1 ? 1 : 0.6);
        });
        this.realm.emitNear(eye.x, eye.y, eye.z, { t: 'mob', kind: 'skeleton', sound: 'shoot', vol: 0.5 });
        return;
      }
      case 'zone': {
        const at = this.aimGround(e.reach);
        const rain = def.id === 'rain_of_arrows';
        fx.addZone({ owner: this, by: this.name, ...at, radius: e.radius, damage: e.damage, kind: def.kind, delay: e.delay, waves: e.waves, interval: e.interval, warn: rain ? 'rain_mark' : 'meteor_warn', hit: rain ? 'rain_hit' : 'meteor_hit', knock: rain ? 0.12 : 0.8 });
        return;
      }
      case 'pierce': {
        const d = this.look();
        const eye = this.eye();
        const wall = raycast(this.world, eye.x, eye.y, eye.z, d.x, d.y, d.z, e.range);
        const reach = wall ? Math.hypot(wall.x + 0.5 - eye.x, wall.y + 0.5 - eye.y, wall.z + 0.5 - eye.z) : e.range;
        for (const m of this.mobs.mobs) {
          if (!this.isFoe(m)) continue;
          const t = m.hitDistance(eye.x, eye.y, eye.z, d.x, d.y, d.z, reach, e.width / 2);
          if (t !== null) this.strike(m, e.damage, def.kind, { x: eye.x, z: eye.z }, 0.6);
        }
        fx.mark('pierce', this.name, eye.x + d.x * 0.6, eye.y + d.y * 0.6 - 0.15, eye.z + d.z * 0.6, e.width, 0.5, { x: eye.x + d.x * reach, y: eye.y + d.y * reach, z: eye.z + d.z * reach });
        this.realm.emitNear(eye.x, eye.y, eye.z, { t: 'mob', kind: 'skeleton', sound: 'shoot', vol: 0.6 });
        return;
      }
      case 'guard': {
        if (e.reduction) this.cls?.guardReduction(1 - e.reduction, e.seconds);
        if (e.absorb) this.cls?.guardAbsorb(e.absorb, e.seconds);
        if (def.id === 'iron_defense') // The mark outlives the guard by half a second, which is the time the armour takes to fly off.
          this.shieldMark = fx.mark('guard_iron', this.name, b.x, b.y, b.z, 1.2, Math.max(0.9, e.seconds) + 0.5);
        else this.shieldMark = fx.mark('guard_arcane', this.name, b.x, b.y, b.z, 1.2, Math.max(0.9, e.seconds));
        return;
      }
      case 'trap': {
        // Thrown to the ground under the crosshair, never nearer than a step and never farther than its reach.
        const eye = this.eye();
        const at = this.aimGround(e.reach);
        let x = at.x;
        let z = at.z;
        const far = Math.hypot(x - b.x, z - b.z);
        if (far < 1.5) {
          x = b.x + look.x * 1.5;
          z = b.z + look.z * 1.5;
        }
        const y = far < 1.5 ? this.groundBelow(x, b.y + 1, z, 4) : at.y;
        fx.addTrap({ owner: this, by: this.name, x, y, z, radius: e.radius, damage: e.damage, root: e.root, kind: def.kind, ttl: e.ttl, max: e.max, from: { x: eye.x + look.x * 0.4, y: eye.y - 0.3, z: eye.z + look.z * 0.4 } });
        return;
      }
    }
  }

  /** Keep the Arcane Shield's (or Iron Defense's) mark on its owner, and end it when the shield has run out or been soaked up. */
  private followShieldMark(): void {
    const m = this.shieldMark;
    if (!m) return;
    const spent = this.cls ? (m.k === 'guard_iron' ? false : this.cls.absorbAmount <= 0) : true;
    if (m.age >= m.ttl || this.vitals.dead || spent) {
      m.ttl = Math.min(m.ttl, m.age);
      this.shieldMark = null;
      return;
    }
    m.x = this.body.x;
    m.y = this.body.y;
    m.z = this.body.z;
  }

  /** A spell ended at a point: the thing it struck takes the hit, and with `radius` so does everything hostile near the burst. */
  private boltBurst(x: number, y: number, z: number, target: Mob | null, damage: number, kind: DamageKind, radius: number, burn: number, mark: 'fireball_burst' | 'bolt' | 'wand_hit' | 'staff_hit', ttl = 0.6): void {
    const hurt = new Set<Mob>();
    if (target) hurt.add(target);
    if (radius > 0) for (const m of this.foesNear(x, y, z, radius, radius + 1)) hurt.add(m);
    for (const m of hurt) {
      this.strike(m, damage, kind, { x, z }, 0.7);
      if (burn > 0 && !m.dead && !m.body.inWater) m.onFire = Math.max(m.onFire, burn);
    }
    this.realm.effects.mark(mark, this.name, x, y, z, radius || 0.8, ttl);
  }

  /** Right-click with a staff, wand or spellbook: a bolt that costs the class's resource (a classless player pays in hunger). */
  private castWeapon(weapon: WeaponDef, itemId: number): void {
    this.leaveMount();
    const cls = this.cls;
    const d = this.look();
    const eye = this.eye();
    if (this.mode === 'survival') {
      if (cls) {
        if (!cls.spend(castCost(weapon.cost))) {
          this.castCooldown = 0.5;
          this.emit({ t: 'toast', text: `Not enough ${CLASSES[cls.classId].resource.name.toLowerCase()}` });
          return;
        }
      } else this.vitals.addExhaustion(weapon.cost * 0.05);
    }
    this.castCooldown = weapon.cooldown / (cls ? cls.stats.attackSpeed : 1);
    const radius = weapon.radius ?? 0;
    // Each weapon has its own look: a wand's bolt is spell 3 and bursts as 'wand_hit', a staff's is spell 4 and 'staff_hit'; the spellbook's is spell 2 and 'bolt'.
    const wand = itemId === I.WAND;
    const staff = itemId === I.STAFF;
    // The Hollow King's staff throws fireballs: they burn what they hit.
    const fire = itemId === HK.STAFF;
    this.mobs.castBolt(eye.x + d.x * 0.6, eye.y + d.y * 0.6 - 0.1, eye.z + d.z * 0.6, d.x, d.y, d.z, weapon.speed ?? 18, fire ? 1 : wand ? 3 : staff ? 4 : 2, (hx, hy, hz, target) => {
      this.boltBurst(hx, hy, hz, target, weapon.damage, weapon.kind, radius, fire ? 5 : 0, fire ? 'fireball_burst' : wand ? 'wand_hit' : staff ? 'staff_hit' : 'bolt', fire ? 1 : 0.6);
    });
    // Its own sound for each (a wand zaps, a staff booms, a spellbook hums), heard by the players near.
    this.realm.emitNear(eye.x, eye.y, eye.z, { t: 'spell', weapon: itemId === I.STAFF || itemId === HK.STAFF ? 'staff' : itemId === I.SPELLBOOK ? 'spellbook' : 'wand', vol: 0.8 });
    this.emit({ t: 'swing' });
  }

  /** The boss this player is fighting (its health, phase and the spell it gathers), for its health bar; null when none. */
  dungeonView(): DungeonView | null {
    return this.realm.dungeonViewFor(this);
  }

  bossView(): BossView | null {
    return this.realm.bossViewFor(this);
  }

  /** The rift that is open near this player (its wave, the monsters left, the time), for the tracker; null when none. */
  riftView(): RiftView | null {
    return this.realm.riftViewFor(this);
  }

  /** What a class player's interface shows (null without a class). */
  classView(): ClassView | null {
    const cls = this.cls;
    if (!cls) return null;
    return {
      id: cls.classId,
      level: cls.level,
      xp: cls.xp,
      xpNext: cls.xpToNext,
      xpProgress: cls.xpProgress,
      resource: Math.round(cls.resource * 10) / 10,
      maxResource: cls.stats.maxResource,
      maxHealth: this.vitals.maxHealth,
      speedMul: cls.stats.moveSpeed,
      abilities: abilitiesOf(cls.classId).map((a) => ({ id: a.id, cd: Math.round(cls.cooldownLeft(a.id) * 10) / 10, unlocked: cls.unlocked.has(a.id) })),
      pts: [...cls.points] as [number, number, number, number],
      free: cls.freePoints,
      guard: Math.round(cls.reductionLeft * 10) / 10,
      shield: Math.round(cls.absorbAmount * 10) / 10,
      immune: Math.round(cls.immuneLeft * 10) / 10,
      ...(this.slamPhase ? { slam: this.slamPhase } : {}),
      ...(this.rush ? { rush: { yaw: this.rush.yaw, speed: this.rush.speed, ...(this.rush.def.id === 'evasive_roll' ? { roll: true } : {}) } } : {}),
    };
  }

  // ---- shield -------------------------------------------------------------------

  /** Hold the use button with a shield in the hand, or in the off hand when the hand has nothing to use. */
  private updateShield(dt: number, f: InputFrame, item: ItemDef | null): void {
    const off = this.offhand.get(0);
    const offShield = !!off && getItem(off.id).shield;
    let want = false;
    let inOff = false;
    if (f.right) {
      if (item?.shield) want = true;
      else if (offShield && !this.mainHandBusy(item)) {
        want = true;
        inOff = true;
      }
    }
    if (!want) {
      this.lowerShield();
      return;
    }
    if (!this.blocking || inOff !== this.shieldInOffhand) this.blockTime = 0;
    this.blocking = true;
    this.shieldInOffhand = inOff;
    this.blockTime += dt;
  }

  /** The main hand has its own use for the button (eat, draw a bow, place, pour, tame soil, wear). */
  private mainHandBusy(item: ItemDef | null): boolean {
    if (!item) return false;
    if (item.food && this.mode === 'survival' && this.vitals.canEat()) return true;
    if (item.armor || (item.use !== null && TAKES_THE_BUTTON.has(item.use))) return true;
    if (item.use === 'bow' && (this.mode === 'creative' || this.inventory.countOf(I.ARROW) > 0)) return true;
    return !!this.target && usedOnBlock(item);
  }

  /** Everything the main hand does with the use button, shield, horn, vehicle and spell included. What is left over goes to the off hand. */
  private mainHandOwnsUse(item: ItemDef | null): boolean {
    if (!item) return false;
    return this.mainHandBusy(item) || item.shield || item.use === 'horn' || item.use === 'outfit' || item.use === 'companion' || item.use === 'wings' || item.use === 'vehicle' || item.weapon?.kind === 'spell';
  }

  /** A stack of blocks in the off hand that a click can set down. */
  private offhandPlaceable(): boolean {
    const off = this.offhand.get(0);
    return !!off && getItem(off.id).block != null;
  }

  /** Set down the block from the off hand. The stack trades places with the hand's slot for the placing, so every rule (reach, cost, sound, mode) is the hand's own, then it goes back. */
  private useOffhandOn(t: Parameters<Player['useHeldOn']>[0]): boolean {
    const off = this.offhand.get(0);
    if (!off) return false;
    const slot = this.selected;
    const hand = this.inventory.get(slot);
    this.inventory.set(slot, off);
    this.offhand.set(0, null);
    let placed = false;
    try {
      placed = this.useHeldOn(t);
    } finally {
      const left = this.inventory.get(slot);
      this.offhand.set(0, left);
      this.inventory.set(slot, hand);
    }
    if (placed) this.emit({ t: 'inv' });
    return placed;
  }

  lowerShield(): void {
    this.blocking = false;
    this.blockTime = 0;
  }

  /** The shield being held up, if any. */
  private shieldStack(): ItemStack | null {
    const s = this.shieldInOffhand ? this.offhand.get(0) : this.held;
    return s && getItem(s.id).shield ? s : null;
  }

  /**
   * Stop a hit coming from the front. (kx, kz) points from the attacker to the player, so the hit is
   * in front when it points against where the player looks. Like the original, a hit of 3 or more
   * hurts the shield (1 + the damage), and a shield that wears out breaks.
   */
  private tryBlock(amount: number, kx: number, kz: number): boolean {
    if (!this.blocking || this.blockTime < SHIELD_RAISE) return false;
    const s = this.shieldStack();
    if (!s) return false;
    const d = this.look();
    if (kx * d.x + kz * d.z >= 0) return false;
    // A parry: the hit lands just as the guard comes up, so the shield turns it aside and takes no wear.
    const parry = this.blockTime < SHIELD_RAISE + PARRY_WINDOW;
    let broke = false;
    if (amount >= 3 && !parry) {
      s.damage += wearAfterUnbreaking(1 + Math.floor(amount), levelOf(s, ENCH.UNBREAKING), false, this.rand);
      if (s.damage >= getItem(s.id).durability) {
        if (this.shieldInOffhand) this.offhand.set(0, null);
        else this.inventory.set(this.selected, null);
        this.lowerShield();
        broke = true;
      }
      this.emit({ t: 'inv' });
    }
    const b = this.body;
    this.realm.emitNear(b.x, b.y + 1, b.z, { t: 'shield', vol: 1, ...(broke ? { broke: true } : {}), ...(parry ? { parry: true } : {}) });
    // The word that floats up in front of this player's own view.
    this.emit({ t: 'guard', what: parry ? 'parry' : 'block' });
    return true;
  }

  /** Swap the hand with the off hand. The off hand only takes a shield, an orb, a dagger, a map or torches, so any other tool in hand stays put. */
  swapHands(): void {
    const held = this.held;
    const off = this.offhand.get(0);
    if (held && !holdsInOffhand(held.id)) {
      this.emit({ t: 'toast', text: 'the off hand only holds a shield, an orb, a dagger, a map or torches' });
      return;
    }
    if (!held && !off) return;
    this.inventory.set(this.selected, off);
    this.offhand.set(0, held);
    this.lowerShield();
    this.emit({ t: 'equip' });
    this.emit({ t: 'inv' });
  }

  /** Only a pair of wings, and one pair, may be in the wing slot (a hostile or old save): anything else is dropped. */
  private sanitizeWingSlot(): void {
    const s = this.wingSlot.get(0);
    if (!s) return;
    if (wingOfItem(s.id) === null) this.wingSlot.set(0, null);
    else s.count = 1;
  }

  /** Only a companion, and one of it, may be in the companion slot (a hostile or old save): anything else is dropped. */
  private sanitizeCompanionSlot(): void {
    const s = this.companionSlot.get(0);
    if (!s) return;
    if (companionOfItem(s.id) === null) this.companionSlot.set(0, null);
    else s.count = 1;
  }

  /** Only a glowing set of the hero's class, and one of it, may be in the outfit slot (a hostile or old save): anything else is dropped. */
  private sanitizeOutfitSlot(): void {
    const s = this.outfitSlot.get(0);
    if (!s) return;
    if (outfitSetOfItem(s.id) === null) this.outfitSlot.set(0, null);
    else s.count = 1;
  }

  /** Only a mount horn, and one of it, may be in the mount slot (a hostile or old save). */
  private sanitizeMountSlot(): void {
    const s = this.mountSlot.get(0);
    if (s && mountOfItem(s.id) === null) this.mountSlot.set(0, null);
    else if (s) s.count = 1;
  }

  /** Keep only what the off hand takes, one of each but torches, which stack (a hostile or old save). */
  private sanitizeOffhand(): void {
    const s = this.offhand.get(0);
    if (s && !holdsInOffhand(s.id)) this.offhand.set(0, null);
    else if (s) s.count = Math.max(1, Math.min(s.count, getItem(s.id).maxStack));
  }

  /** Only bags can be worn in a bag slot, one each (a hand-edited save could say otherwise). */
  private sanitizeBags(): void {
    for (let i = 0; i < this.bags.size; i++) {
      const s = this.bags.get(i);
      if (s && bagSlotsOf(s.id) === 0) this.bags.set(i, null);
      else if (s) s.count = 1;
    }
  }

  /** Items in the room of a bag that is not worn would be out of reach: they go back into the open slots (or to the ground). */
  private reclaimStranded(): void {
    for (const i of strandedSlots(this.inventory)) {
      const s = this.inventory.get(i);
      this.inventory.set(i, null);
      if (s) this.collectOrDrop(s);
    }
  }

  // ---- armor ------------------------------------------------------------------

  /** Defense points of everything worn (0..20). */
  get defense(): number {
    let n = 0;
    for (let i = 0; i < this.armor.size; i++) {
      const s = this.armor.get(i);
      if (s) n += getItem(s.id).armor?.defense ?? 0;
    }
    return n;
  }

  /** Item ids of the worn pieces (0 = nothing): what other players see. */
  armorIds(): number[] {
    return Array.from({ length: this.armor.size }, (_, i) => this.armor.get(i)?.id ?? 0);
  }

  private get toughness(): number {
    let n = 0;
    for (let i = 0; i < this.armor.size; i++) {
      const s = this.armor.get(i);
      if (s) n += getItem(s.id).armor?.toughness ?? 0;
    }
    return n;
  }

  /** Damage after the worn armor has taken its share. Only survival players are protected from anything. */
  private afterArmor(damage: number): number {
    return reduceDamage(damage, this.defense, this.toughness) * this.companionWard * this.wingWard;
  }

  /** Every worn piece takes wear from a hit; a piece that wears out breaks. */
  private wearArmor(damage: number): void {
    const wear = armorWear(damage);
    let broke = false;
    for (let i = 0; i < this.armor.size; i++) {
      const s = this.armor.get(i);
      const dur = s ? getItem(s.id).durability : 0;
      if (!s || dur <= 0) continue;
      s.damage += wearAfterUnbreaking(wear, levelOf(s, ENCH.UNBREAKING), true, this.rand);
      if (s.damage >= dur) {
        this.armor.set(i, null);
        broke = true;
      }
    }
    if (broke) this.emit({ t: 'sound', sound: 'stone', action: 'break', vol: 0.8 });
    this.emit({ t: 'inv' });
  }

  /** Put the held piece on, swapping with whatever is worn in that slot. */
  equipHeld(): boolean {
    const held = this.held;
    const def = held ? getItem(held.id).armor : null;
    if (!held || !def) return false;
    const worn = this.armor.get(def.slotIndex);
    this.armor.set(def.slotIndex, cloneStack({ ...held, count: 1 }));
    this.inventory.set(this.selected, worn);
    this.emit({ t: 'equip' });
    this.emit({ t: 'inv' });
    return true;
  }

  /** Drop anything in an armor slot that does not belong there (a hostile or old save). */
  private sanitizeArmor(): void {
    for (let i = 0; i < this.armor.size; i++) {
      const s = this.armor.get(i);
      if (s && getItem(s.id).armor?.slotIndex !== i) this.armor.set(i, null);
      else if (s) s.count = 1;
    }
  }

  /** How far into the Emberstone's cast the player is (0..1, never exactly 0 while it goes on); 0 when not casting it. The figure is drawn from it. */
  get emberProgress(): number {
    return this.emberTimer > 0 ? Math.max(0.01, Math.min(1, this.emberTimer / EMBER_CAST)) : 0;
  }

  /** How far into a meal the player is (0..1); 0 when not eating. */
  get eatProgress(): number {
    return this.eatTimer > 0 ? Math.min(1, this.eatTimer / EAT_TIME) : 0;
  }

  // ---- experience -----------------------------------------------------------

  /** Absorb experience (an orb reached you, or a cheat). Plays the pickup sound and announces new levels. */
  addXp(amount: number, orb = false): void {
    const gained = this.xp.add(this.mode === 'survival' ? this.mend(amount) : amount);
    // At the level cap the surplus fills bottles o' enchanting, which are yours to keep, use or trade.
    if (this.mode === 'survival') {
      const bottles = this.xp.takeBottles();
      if (bottles > 0) {
        this.collectOrDrop(makeStack(I.EXPERIENCE_BOTTLE, bottles));
        this.emit({ t: 'toast', text: bottles === 1 ? "Your surplus experience fills a Bottle o' Enchanting" : `Your surplus experience fills ${bottles} Bottles o' Enchanting` });
      }
    }
    // (An orb makes the sound only: a kill drops several, and a number over each would be noise.)
    this.emit(orb ? { t: 'xp' } : { t: 'xp', gain: Math.floor(amount) });
    if (gained > 0) {
      this.emit({ t: 'levelup', level: this.xp.level });
      // Everyone nearby sees it too (the client draws the column of light on the player).
      this.realm.effects.mark('level_up', this.name, this.body.x, this.body.y, this.body.z, 1, 0.6);
      this.syncClassLevel();
    }
  }

  // ---- coins ------------------------------------------------------------------------

  /** Take in coins (a kill, a quest, a sale). Returns how many were really added (a full purse takes no more). */
  addCoins(amount: number, earned = false): number {
    const n = Math.min(Math.floor(amount), MAX_COINS - this.coins);
    if (!(n > 0)) return 0;
    this.coins += n;
    this.emit({ t: 'coins', gain: n });
    // Only coins that were earned count for the achievements (not those another player handed over, or that came back by mail).
    if (earned) this.achAdd('coins', n);
    return n;
  }

  // ---- achievements ---------------------------------------------------------------------------------------------

  /** A deed was done: count it, and tell the player about any achievement it won. */
  achAdd(stat: AchStat, n = 1): void {
    if (this.spectating) return;
    this.achWon(this.ach.add(stat, n));
    this.bountyDone(this.bounty.add(dayOf(this.realm.clock()), stat, n));
    this.bountyDirty = true;
  }

  /** Daily bounties were finished: tell the player and the server (which pays them), and show the new counts at once. */
  private bountyDone(list: BountyDef[]): void {
    if (list.length === 0) return;
    const day = this.bounty.today;
    for (const b of list) this.emit({ t: 'bounty', id: b.id, name: b.name, tier: b.tier, day });
    this.syncBounties();
  }

  /** Tell the client today's bounties and the counts (it is small). */
  syncBounties(): void {
    this.bountyDirty = false;
    const now = this.realm.clock();
    this.emit({ t: 'bounties', view: this.bounty.view(dayOf(now), now) });
  }

  private achWon(list: AchievementDef[]): void {
    if (list.length === 0) return;
    for (const a of list) this.emit({ t: 'achievement', id: a.id, name: a.name, tier: a.tier, reward: ACH_TIERS[a.tier].name });
    this.syncAch();
  }

  /** Tell the client the counts and what has been won (it is small). */
  syncAch(): void {
    this.emit({ t: 'ach', view: this.ach.view() });
  }

  /** A monster was slain near the player (see Realm's `killed` hook). */
  achKill(mob: { kind: string; elite?: boolean; def: { hostile: boolean; boss?: boolean } }): void {
    if (!mob.def.hostile && !mob.def.boss) return;
    this.achAdd('kills');
    if (mob.elite) this.achAdd('elites');
    if (mob.def.boss) this.achAdd('bosses');
    if (mob.kind === 'hollow_king') {
      this.achAdd('dungeons');
      if (!this.spectating) this.emit({ t: 'clear', id: 'hollow-deep', name: 'the Hollow Deep' });
    }
  }

  /** Level and playing time, once a second. */
  private updateAch(dt: number): void {
    if (this.spectating || this.vitals.dead) return;
    this.achSeconds += dt;
    if (this.achSeconds >= 60) {
      const m = Math.floor(this.achSeconds / 60);
      this.achSeconds -= m * 60;
      this.achAdd('minutes', m);
    }
    this.achLevelTimer += dt;
    if (this.achLevelTimer < 1) return;
    this.achLevelTimer = 0;
    // (the counts of the day go out once a second at the most, and at once when the day turns)
    if (this.bountyDirty || this.bounty.today !== dayOf(this.realm.clock())) this.syncBounties();
    this.achWon(this.ach.reach('level', this.cls ? this.cls.level : this.xp.level));
  }

  /** Pay coins for something. False (and nothing taken) when there are not enough. */
  spendCoins(amount: number): boolean {
    const n = Math.floor(amount);
    if (!(n >= 0) || n > this.coins) return false;
    this.coins -= n;
    return true;
  }

  /** The server changed what the bags hold (a trade): tell the client to read them again. */
  inventoryChanged(): void {
    this.emit({ t: 'inv' });
  }

  /** Experience from a furnace goes straight to you. */
  private spawnXpAtFeet(amount: number): void {
    this.realm.awardXp(amount, this.body.x, this.body.y + 0.6, this.body.z);
  }

  // ---- beds ----------------------------------------------------------------

  /** Is the bed this player lies in (its head block) still there? */
  private bedIntact(): boolean {
    const s = this.sleeping;
    return !!s && this.world.getBlock(s.x, s.y, s.z) === bedId(true, s.dir);
  }

  /** A hostile mob close enough to the bed to stop you resting (8 blocks across, 5 up and down). */
  private monstersNear(x: number, y: number, z: number): boolean {
    return this.mobs.mobs.some(
      (m) => !m.dead && m.def.hostile && !m.def.ambient && Math.abs(m.body.x - x) <= 8 && Math.abs(m.body.z - z) <= 8 && Math.abs(m.body.y - y) <= 5,
    );
  }

  /** Right-click a bed: it becomes your respawn point, and at night you go to sleep in it. */
  useBed(hit: RayHit): void {
    const info = bedInfo(hit.id);
    if (!info || this.sleeping || this.spectating) return;
    const hx = hit.x + (info.head ? 0 : info.dx);
    const hz = hit.z + (info.head ? 0 : info.dz);
    const hy = hit.y;
    if (this.world.getBlock(hx, hy, hz) !== bedId(true, info.dir)) return;
    if (this.realm.players.some((p) => p !== this && p.sleeping && p.sleeping.x === hx && p.sleeping.y === hy && p.sleeping.z === hz)) {
      this.emit({ t: 'toast', text: 'This bed is occupied' });
      return;
    }
    const sp = this.spawnPoint;
    const changed = !sp || sp.x !== hx || sp.y !== hy || sp.z !== hz;
    this.spawnPoint = { x: hx, y: hy, z: hz };
    const say = (text: string) => this.emit({ t: 'toast', text: changed ? `Respawn point set - ${text}` : text[0].toUpperCase() + text.slice(1) });
    if (!this.realm.allowSleep) {
      // A shared world has one clock for everybody: the bed only remembers where you respawn.
      this.emit({ t: 'toast', text: changed ? 'Respawn point set' : 'Respawn point already set here' });
      return;
    }
    if (!this.realm.canSleep) {
      say('you can only sleep at night or during thunderstorms');
      return;
    }
    if (this.monstersNear(hx + 0.5, hy, hz + 0.5)) {
      say('you may not rest now, there are monsters nearby');
      return;
    }
    this.startSleep(hx, hy, hz, info.dir);
  }

  private startSleep(x: number, y: number, z: number, dir: number): void {
    this.leaveMount();
    this.sleeping = { x, y, z, dir };
    this.sleepTime = 0;
    const b = this.body;
    b.x = x + 0.5;
    b.z = z + 0.5;
    b.y = y + BED_HEIGHT;
    b.vx = b.vy = b.vz = 0;
    b.onGround = true;
    this.peakY = b.y;
    this.flying = false;
    this.target = null;
    this.breakProgress = 0;
    this.hudProgress = 0;
    this.bowDraw = 0;
    this.bowCharge = 0;
    this.eatTimer = 0;
    this.lowerShield();
  }

  /** Get out of bed (sneaking, the Leave Bed button, morning, a hit). `exit` stands you up beside the bed. */
  wake(exit = true): void {
    const s = this.sleeping;
    if (!s) return;
    this.sleeping = null;
    this.sleepTime = 0;
    if (!exit) return;
    const at = this.bedExit(s);
    const b = this.body;
    if (at) {
      b.x = at.x;
      b.y = at.y;
      b.z = at.z;
    }
    b.vx = b.vy = b.vz = 0;
    this.peakY = b.y;
  }

  /** Room to stand: two free cells above a solid floor that is not itself a bed. */
  private canStandAt(x: number, y: number, z: number): boolean {
    const w = this.world;
    const free = (yy: number) => {
      const id = w.getBlock(x, yy, z);
      return !IS_SOLID[id] && !IS_LIQUID[id] && id !== B.COBWEB;
    };
    const floor = w.getBlock(x, y - 1, z);
    return free(y) && free(y + 1) && IS_SOLID[floor] === 1 && !isBed(floor);
  }

  /** Where someone leaving a bed stands: beside it, nearest the pillow first (null = nowhere). */
  private bedExit(s: { x: number; y: number; z: number; dir: number }): { x: number; y: number; z: number } | null {
    const [dx, dz] = BED_DIRS[s.dir];
    const px = -dz;
    const pz = dx;
    const fx = s.x - dx;
    const fz = s.z - dz;
    const cells: [number, number][] = [
      [s.x + px, s.z + pz],
      [s.x - px, s.z - pz],
      [s.x + dx, s.z + dz],
      [fx + px, fz + pz],
      [fx - px, fz - pz],
      [fx - dx, fz - dz],
    ];
    for (const [cx, cz] of cells) {
      for (const cy of [s.y, s.y - 1]) {
        if (this.canStandAt(cx, cy, cz)) return { x: cx + 0.5, y: cy, z: cz + 0.5 };
      }
    }
    return null;
  }

  /** Put the player at their bed. False when there is none, or it is gone or boxed in (then the spawn point is forgotten). */
  private respawnAtBed(): boolean {
    const sp = this.spawnPoint;
    if (!sp) return false;
    const b = this.body;
    let at: { x: number; y: number; z: number } | null;
    if (this.world.surfaceY(sp.x, sp.z) < 0) {
      // Not loaded here (the browser streams terrain): trust the saved bed and land on top of it.
      at = { x: sp.x + 0.5, y: sp.y + BED_HEIGHT + 0.01, z: sp.z + 0.5 };
    } else {
      const info = bedInfo(this.world.getBlock(sp.x, sp.y, sp.z));
      at = info?.head ? this.bedExit({ x: sp.x, y: sp.y, z: sp.z, dir: info.dir }) : null;
    }
    if (!at) {
      this.spawnPoint = null;
      this.emit({ t: 'toast', text: 'Your home bed was missing or obstructed' });
      return false;
    }
    b.x = at.x;
    b.y = at.y;
    b.z = at.z;
    b.vx = b.vy = b.vz = 0;
    this.peakY = b.y;
    return true;
  }

  /** Right-click with a bed: two blocks lie down in front of you, foot where you click, head the way you face. */
  private placeBed(t: { x: number; y: number; z: number; id: number; nx: number; ny: number; nz: number }): boolean {
    const world = this.world;
    const held = this.held;
    const inPlace = BLOCKS[t.id].replaceable;
    const px = inPlace ? t.x : t.x + t.nx;
    const py = inPlace ? t.y : t.y + t.ny;
    const pz = inPlace ? t.z : t.z + t.nz;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 1) : fz > 0 ? 2 : 3;
    const [dx, dz] = BED_DIRS[dir];
    const hx = px + dx;
    const hz = pz + dz;
    const free = (x: number, z: number) => {
      const id = world.getBlock(x, py, z);
      return id === B.AIR || (BLOCKS[id].replaceable && !BLOCKS[id].liquid);
    };
    if (!held || !free(px, pz) || !free(hx, hz)) return false;
    if (this.realm.players.some((p) => bodyOverlapsBlock(p.body, px, py, pz) || bodyOverlapsBlock(p.body, hx, py, hz))) return false;
    if (!world.setBlock(px, py, pz, bedId(false, dir, bedItemColor(held.id)))) return false;
    world.setBlock(hx, py, hz, bedId(true, dir));
    this.realm.blockChanged(px, py, pz);
    this.realm.blockChanged(hx, py, hz);
    this.puff(px, py, pz, bedId(false, dir, bedItemColor(held.id)), true);
    this.realm.emitNear(px, py, pz, { t: 'sound', sound: 'wood', action: 'place', vol: 1 });
    this.emit({ t: 'swing' });
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, null);
      this.emit({ t: 'inv' });
    }
    return true;
  }

  // ---- life and death ------------------------------------------------------

  respawn(): void {
    const s = this.realm.nextSpawn();
    const b = this.body;
    b.x = s.x;
    b.z = s.z;
    b.y = s.y + 2;
    b.vx = b.vy = b.vz = 0;
    this.peakY = b.y;
    this.onFire = 0;
  }

  /** Move the player (tests, teleport tools). Clears velocity and fall tracking. */
  teleport(x: number, y: number, z: number, yaw = this.yaw, pitch = this.pitch): void {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = b.vy = b.vz = 0;
    this.peakY = y;
    this.yaw = yaw;
    this.pitch = pitch;
    this.camera = null;
    this.aimCache = null;
  }

  private die(): void {
    if (this.screen === 'dead') return;
    this.slamLeap = null;
    this.slamImpact = 0;
    this.endRush();
    this.wake(false);
    this.dismount();
    this.cancelMountCast();
    this.leaveMount();
    if (this.screen === 'dialog') this.closeDialog();
    if (this.menu) this.closeMenu();
    this.lowerShield();
    this.realm.effects.dropOwner(this);
    // Nothing is dropped. What you wear and hold is worn by the fall, and some of your experience is lost.
    const worn = this.wearOnDeath();
    const lost = this.xp.lose(DEATH_XP_LOSS);
    if (worn > 0 || lost > 0) {
      const parts: string[] = [];
      if (lost > 0) parts.push(`${lost} experience`);
      if (worn > 0) parts.push(`${DEATH_WEAR_PERCENT}% of the durability of your equipment`);
      this.emit({ t: 'toast', text: `You lost ${parts.join(' and ')}.` });
    }    this.flying = false;
    this.screen = 'dead';
    if (this.hardcore) this.gameOver = true;
    this.emit({ t: 'died' });
    this.emit({ t: 'inv' });
  }

  /**
   * What a death does to the gear: the armor you wear, the shield in your off hand and the tool or weapon in your hand each
   * lose a fifth of their durability (at least one point), but are never broken by it. Returns how many pieces were worn.
   */
  private wearOnDeath(): number {
    let n = 0;
    const wear = (s: ItemStack | null): void => {
      const dur = s ? getItem(s.id).durability : 0;
      if (!s || dur <= 0) return;
      const worn = Math.min(s.damage + Math.max(1, Math.ceil(dur * DEATH_WEAR)), dur - 1);
      if (worn > s.damage) {
        s.damage = worn;
        n++;
      }
    };
    for (let i = 0; i < this.armor.size; i++) wear(this.armor.get(i));
    wear(this.offhand.get(0));
    wear(this.held);
    return n;
  }

  respawnFromDeath(): void {
    if (this.screen !== 'dead') return;
    this.cls?.resetCombat();
    if (this.hardcore) {
      // One life: the world cannot be played on. Stay where you fell and look around.
      this.vitals.respawn();
      this.spectating = true;
      this.flying = true;
      this.screen = 'none';
      this.lastHealth = this.vitals.health;
      this.emit({ t: 'respawned' });
      this.emit({ t: 'inv' });
      return;
    }
    this.vitals.respawn();
    this.onFire = 0;
    this.poison = 0;
    this.rootTime = this.slowTime = this.weakTime = 0;
    if (!this.respawnAtBed()) this.respawn();
    this.screen = 'none';
    this.lastHealth = this.vitals.health;
    this.emit({ t: 'respawned' });
    this.emit({ t: 'inv' });
  }

  // ---- loading and saving --------------------------------------------------

  /** Restore the player. `keepMode` ignores the saved game mode (a mode forced by the URL). */
  loadPlayer(p: PlayerSave, keepMode = false): void {
    this.body.x = p.x;
    this.body.y = p.y;
    this.body.z = p.z;
    this.yaw = p.yaw;
    this.pitch = p.pitch;
    this.savedMobs = p.mobs;
    this.spawned = true; // trust the saved position; chunks stream in underneath
    if (this.cls) {
      // Class level first: it sets the most health there can be, which the saved health is then held to.
      this.cls.load(p.cls);
      this.applyClassVitals(true);
    }
    // The bags first: they decide which of the inventory's slots are open.
    for (let i = 0; i < this.bags.size; i++) this.bags.set(i, null); // an older save has none
    this.bags.loadJSON(p.bags);
    this.sanitizeBags();
    if (p.inv) this.inventory.loadJSON(p.inv);
    this.reclaimStranded();
    if (p.vitals) this.vitals.loadJSON(p.vitals as never);
    this.xp.loadJSON(p.xp);
    this.syncClassLevel(false); // a character whose level is above what the class remembers catches it up
    this.coins = typeof p.coins === 'number' && Number.isFinite(p.coins) ? Math.max(0, Math.min(MAX_COINS, Math.floor(p.coins))) : 0;
    for (let i = 0; i < this.armor.size; i++) this.armor.set(i, null); // an older save has none
    this.armor.loadJSON(p.armor);
    this.sanitizeArmor();
    // A character saved before the clothes were items is dressed once; after that, what it takes off stays off.
    this.outfitted = p.of === true;
    if (this.cls && !this.outfitted) this.grantOutfit();
    this.offhand.set(0, null);
    this.offhand.loadJSON(p.offhand);
    this.sanitizeOffhand();
    if (!keepMode) {
      this.mode = p.mode;
      this.hardcore = p.hardcore === true && p.mode === 'survival';
      this.gameOver = this.hardcore && p.gameOver === true;
      this.spectating = this.gameOver && p.spectating === true;
      if (this.spectating) this.flying = true;
      else if (this.gameOver) {
        // Closed the page on the death screen: still dead.
        this.vitals.dead = true;
        this.screen = 'dead';
      }
    }
    this.spawnPoint = p.spawn ? { x: p.spawn.x, y: p.spawn.y, z: p.spawn.z } : null;
    this.emberCooldown = typeof p.hs === 'number' && p.hs > 0 ? Math.min(EMBER_COOLDOWN, p.hs) : 0;
    this.emberTimer = 0;
    this.mountId = null;
    this.mountCast = null;
    this.mountSlot.set(0, null);
    this.mountSlot.loadJSON(p.mountSlot);
    this.sanitizeMountSlot();
    this.outfitSlot.set(0, null);
    this.outfitSlot.loadJSON(p.outfitSlot);
    this.sanitizeOutfitSlot();
    this.companionSlot.set(0, null);
    this.companionSlot.loadJSON(p.companionSlot);
    this.sanitizeCompanionSlot();
    this.wingSlot.set(0, null);
    this.wingSlot.loadJSON(p.wingSlot);
    this.sanitizeWingSlot();
    for (let i = 0; i < ACCESSORY_SLOT_COUNT; i++) this.accessories.set(i, null);
    this.accessories.loadJSON(p.accessories);
    this.sanitizeAccessories();
    this.selected = Math.max(0, Math.min(HOTBAR_SLOTS - 1, p.selected));
    this.peakY = this.body.y;
    this.lastHealth = this.vitals.health;
    this.ach.loadJSON(p.ach);
    this.syncAch();
    this.bounty.loadJSON(p.bounty);
    this.bountyDirty = true;
    if (this.quests) {
      this.quests.loadJSON(p.quests);
      // A character saved before the cave start who has already got on with the quests has long since left it: the quests
      // that come after need the first one done. (A brand-new character, with an empty log, still has it to do.)
      const first = this.quests.status(FIRST_QUEST);
      if (!this.quests.empty && first !== 'active' && first !== 'ready') this.quests.done.add(FIRST_QUEST);
      this.syncQuests();
    }
  }

  /**
   * Call once the terrain around the player has been built. Places a new player on the ground,
   * restores saved mobs and starts the simulation.
   */
  finishLoading(): void {
    if (this.ready) return;
    if (!this.spawned) {
      // A start the world picked underground (the Adventure cave) is kept when there is room to stand there; any other
      // is put on the ground above it.
      const bx = Math.floor(this.body.x);
      const bz = Math.floor(this.body.z);
      const by = Math.floor(this.body.y);
      const solid = (y: number): boolean => BLOCKS[this.world.getBlock(bx, y, bz)].solid;
      const roomToStand = by >= 2 && solid(by - 1) && !solid(by) && !solid(by + 1);
      if (!roomToStand) this.body.y = Math.max(this.world.surfaceY(bx, bz) + 1, 1);
      this.spawned = true;
      this.grantOutfit();
      if (this.quests) {
        // A new Adventure character wakes in the wilds with a compass and a quest to find the village; the rest is earned.
        this.beginAdventure();
      } else {
        // The starter items first: they own hotbar slots 2 and 3, the class kit takes the free ones around them.
        this.grantStarterItems();
        this.grantClassKit();
      }
    }
    this.peakY = this.body.y;
    if (this.savedMobs) this.mobs.loadJSON(this.savedMobs);
    this.savedMobs = null;
    this.ready = true;
  }

  /** Persist-ready snapshot (plain JSON data, exactly what the save format promises). */
  savePlayer(): PlayerSave {
    const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    // Saved mid-sleep, you wake up beside the bed.
    const at = this.sleeping ? (this.bedExit(this.sleeping) ?? this.body) : this.body;
    return {
      v: 1,
      x: at.x,
      y: at.y,
      z: at.z,
      yaw: this.yaw,
      pitch: this.pitch,
      mode: this.mode,
      selected: this.selected,
      inv: plain(this.inventory.toJSON()),
      ...(this.bags.isEmpty() ? {} : { bags: plain(this.bags.toJSON()) }),
      vitals: plain(this.vitals.toJSON()),
      mobs: plain(this.mobs.toJSON(this.body.x, this.body.z, 28)),
      xp: this.xp.toJSON(),
      ...(this.coins > 0 ? { coins: this.coins } : {}),
      armor: plain(this.armor.toJSON()),
      offhand: plain(this.offhand.toJSON()),
      ...(this.spawnPoint ? { spawn: { ...this.spawnPoint } } : {}),
      ...(this.emberCooldown > 0 ? { hs: Math.ceil(this.emberCooldown) } : {}),
      ...(this.mountSlot.get(0) ? { mountSlot: plain(this.mountSlot.toJSON()) } : {}),
      ...(this.outfitSlot.get(0) ? { outfitSlot: plain(this.outfitSlot.toJSON()) } : {}),
      ...(this.companionSlot.get(0) ? { companionSlot: plain(this.companionSlot.toJSON()) } : {}),
      ...(this.wingSlot.get(0) ? { wingSlot: plain(this.wingSlot.toJSON()) } : {}),
      ...(this.accessories.isEmpty() ? {} : { accessories: plain(this.accessories.toJSON()) }),
      ...(this.quests && !this.quests.empty ? { quests: plain(this.quests.toJSON()) } : {}),
      ...(Object.keys(this.ach.toJSON()).length > 0 ? { ach: plain(this.ach.toJSON()) } : {}),
      ...(!this.bounty.empty ? { bounty: plain(this.bounty.toJSON()) } : {}),
      ...(this.cls ? { cls: this.cls.toJSON() } : {}),
      ...(this.outfitted ? { of: true } : {}),
      ...(this.hardcore ? { hardcore: true, ...(this.gameOver ? { gameOver: true } : {}), ...(this.spectating ? { spectating: true } : {}) } : {}),
    };
  }

  // ---- the frame, in parts ---------------------------------------------------

  private vitalsCtx() {
    return {
      eyeInWater: this.body.eyeInWater && !this.body.eyeInLava,
      invulnerable: this.invulnerable,
      hard: this.hardcore,
      respiration: levelOf(this.armor.get(0), ENCH.RESPIRATION),
    };
  }

  private soundUnderfoot() {
    const b = this.body;
    return BLOCKS[this.world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z))].sound;
  }

  /** Take over the look angles and sneak state of a frame. */
  beginFrame(f: InputFrame): void {
    this.yaw = f.yaw;
    this.pitch = f.pitch;
    this.aimCache = null;
    // The eyes are where the body is after this frame's step; the camera is believed only as far as it is from them (see `look`).
    this.camera = f.cam ? { x: f.cam[0], y: f.cam[1], z: f.cam[2] } : null;
    if (this.camera) this.camera = sanitizeCamera(this.eye(), this.camera);
    this.sneaking = f.sneak;
    this.moveIn.forward = f.forward;
    this.moveIn.strafe = f.strafe;
  }

  /**
   * Lava and cactus hurt whoever touches them, a couple of times a second. The timers start full so the
   * first touch hurts at once, and keep their value while out of contact so that bobbing at the surface
   * of lava does not keep resetting them.
   */
  private environmentalDamage(): void {
    if (this.spectating || this.invulnerable || this.vitals.dead) {
      this.lavaTimer = 0;
      this.cactusTimer = 0;
      this.berryTimer = 0;
      this.campfireTimer = 0;
      this.poison = 0;
      this.foodSick = 0;
      this.onFire = 0;
      this.rootTime = this.slowTime = this.weakTime = 0;
      return;
    }
    if (this.rootTime > 0) this.rootTime = Math.max(0, this.rootTime - STEP);
    if (this.slowTime > 0 && (this.slowTime -= STEP) <= 0) {
      this.slowTime = 0;
      this.slowMul = 1;
    }
    if (this.weakTime > 0) this.weakTime = Math.max(0, this.weakTime - STEP);
    if (this.poison > 0) {
      this.poison = Math.max(0, this.poison - STEP);
      this.poisonTick += STEP;
      if (this.poisonTick >= 1.25) {
        this.poisonTick = 0;
        if (this.vitals.health > 1) this.vitals.damage(1, 'generic');
      }
    }
    if (this.foodSick > 0) {
      this.foodSick = Math.max(0, this.foodSick - STEP);
      this.foodSickTick += STEP;
      // One point of the food bar every ten seconds, the same drain as walking the exhaustion off.
      if (this.foodSickTick >= 10) {
        this.foodSickTick -= 10;
        this.vitals.addExhaustion(4);
      }
    } else this.foodSickTick = 0;
    const b = this.body;
    if (b.inLava) {
      this.lavaTimer += STEP;
      if (this.lavaTimer >= 0.5) {
        this.lavaTimer = 0;
        this.vitals.damage(this.protect(4, 'fire'), 'lava');
      }
      this.catchFire(15);
    }
    const inFlames = this.touchingFire();
    if (inFlames) {
      this.fireTimer += STEP;
      if (this.fireTimer >= 0.5) {
        this.fireTimer = 0;
        this.vitals.damage(this.protect(1, 'fire'), 'fire');
      }
      this.catchFire(8);
    }
    if (this.onFire > 0) {
      if (b.inWater && !b.inLava) {
        this.onFire = 0;
        this.realm.emitNear(b.x, b.y, b.z, { t: 'fire', kind: 'hiss', vol: 0.7 });
      } else {
        this.onFire = Math.max(0, this.onFire - STEP);
        this.burnTimer += STEP;
        // Standing in the flames already hurts; burning on its own is a point a second.
        if (this.burnTimer >= 1) {
          this.burnTimer = 0;
          if (!inFlames && !b.inLava) this.vitals.damage(this.protect(1, 'fire'), 'fire');
        }
      }
    } else {
      this.burnTimer = 0;
    }
    if (this.touchingCactus()) {
      this.cactusTimer += STEP;
      if (this.cactusTimer >= 0.5) {
        this.cactusTimer = 0;
        this.vitals.damage(this.protect(1, 'all'), 'cactus');
      }
    }
    const moving = Math.abs(b.vx) > 0.05 || Math.abs(b.vz) > 0.05;
    if (moving && this.touchingBerries()) {
      this.berryTimer += STEP;
      if (this.berryTimer >= 0.5) {
        this.berryTimer = 0;
        this.vitals.damage(this.protect(1, 'all'), 'berry');
      }
    }
    if (this.touchingCampfire()) {
      this.campfireTimer += STEP;
      if (this.campfireTimer >= 0.5) {
        this.campfireTimer = 0;
        this.vitals.damage(this.protect(1, 'fire'), 'campfire');
      }
    }
  }

  /** Set alight for seconds (fire protection shortens it). Creative players and spectators do not burn. */
  private catchFire(seconds: number): void {
    if (this.invulnerable) return;
    this.onFire = Math.max(this.onFire, seconds * protectionFactor(this.armorProtection('fire')));
  }

  get burning(): boolean {
    return this.onFire > 0;
  }

  private touchingFire(): boolean {
    const b = this.body;
    const r = 0.3;
    for (const dy of [0.1, 0.9, 1.6]) {
      const y = Math.floor(b.y + dy);
      for (let x = Math.floor(b.x - r); x <= Math.floor(b.x + r); x++) {
        for (let z = Math.floor(b.z - r); z <= Math.floor(b.z + r); z++) {
          if (this.world.getBlock(x, y, z) === B.FIRE) return true;
        }
      }
    }
    return false;
  }

  /** A lit campfire underfoot. It hurts, and it does not set you alight. */
  private touchingCampfire(): boolean {
    const b = this.body;
    const r = 0.3;
    const y = Math.floor(b.y + 0.1);
    for (let x = Math.floor(b.x - r); x <= Math.floor(b.x + r); x++) {
      for (let z = Math.floor(b.z - r); z <= Math.floor(b.z + r); z++) {
        if (campfireInfo(this.world.getBlock(x, y, z))?.lit) return true;
      }
    }
    return false;
  }

  /** A ripe sweet berry bush at the feet. Younger bushes do not scratch. */
  private touchingBerries(): boolean {
    const b = this.body;
    const r = 0.3;
    for (const dy of [0.1, 0.9]) {
      const y = Math.floor(b.y + dy);
      for (let x = Math.floor(b.x - r); x <= Math.floor(b.x + r); x++) {
        for (let z = Math.floor(b.z - r); z <= Math.floor(b.z + r); z++) {
          if (this.world.getBlock(x, y, z) === B.SWEET_BERRY_3) return true;
        }
      }
    }
    return false;
  }

  private touchingCactus(): boolean {
    const b = this.body;
    const r = 0.42;
    for (const dy of [0.1, 0.9, 1.6]) {
      const y = Math.floor(b.y + dy);
      for (let x = Math.floor(b.x - r); x <= Math.floor(b.x + r); x++) {
        for (let z = Math.floor(b.z - r); z <= Math.floor(b.z + r); z++) {
          if (this.world.getBlock(x, y, z) === B.CACTUS) return true;
        }
      }
    }
    return false;
  }

  /** One fixed physics step, with fall damage, exhaustion and footsteps. */
  simulateStep(f: InputFrame): void {
    // Cooldowns and the resource run on the fixed step the server controls, never on anything a client reports.
    if (this.cls && !this.vitals.dead) this.cls.tick(STEP);
    this.syncOffhandBonus();
    this.syncGearBonus();
    this.followShieldMark();
    this.tickMount(STEP);
    if (this.riding) {
      // Sitting in a minecart or boat: the vehicle carries the body. The forward key and where you look steer it; sneak gets out.
      const v = this.riding;
      const input = this.rider.input;
      input.forward = f.forward;
      input.fx = -Math.sin(f.yaw);
      input.fz = -Math.cos(f.yaw);
      this.environmentalDamage();
      this.vitals.tick(STEP, this.vitalsCtx());
      if (f.sneak || v.gone) this.dismount();
      return;
    }
    if (this.sleeping) {
      // Lying in bed: no movement, but the body still hungers and heals. Sneak (or the Leave Bed button) gets up.
      this.sleepTime += STEP;
      this.environmentalDamage();
      this.vitals.tick(STEP, this.vitalsCtx());
      if (f.sneak || !this.realm.canSleep || !this.bedIntact()) this.wake();
      return;
    }
    const b = this.body;
    const px = b.x;
    const pz = b.z;
    // A mount runs at its own speed: no sprinting on it (and so no hunger), and no sneaking.
    const canSprint = (this.mode === 'creative' || this.vitals.hunger > 6) && !this.blocking && !this.mountId;
    const wings = this.wingDef;
    const move = buildMove(f, this.flying, canSprint, this.spectating, this.speedMul * (this.slowTime > 0 && this.rootTime <= 0 ? this.slowMul : 1), wings, this.wingFlying);
    // Rooted: no walking, no jumping (the roots hold the feet).
    if (this.rootTime > 0 && !this.flying) rooted(move);
    if (this.mountId) {
      move.sneak = false;
      move.stepHeight = MOUNT_STEP_HEIGHT;
    }
    // In a leap the body carries on in the air (the keys only steer it a little).
    // (the crouch before it does not hold the body: it keeps walking or running into the spring)
    if (this.slamLeap?.launched) move.accel = 0.5;
    if (this.rush) rushMove(move, this.rush.yaw, this.rush.speed, this.rush.stall > 0);
    // Monsters and people are solid: the body is pushed out of whoever it walks into.
    if (!this.flying && !this.spectating) move.solids = this.realm.solidsNear(b.x, b.y, b.z);
    const vyBefore = b.vy;
    const wasOnGround = b.onGround;
    stepPlayer(this.world.physicsReader, b, move, STEP);
    this.stepSlamLeap();
    this.stepRush(px, pz);

    if (!this.prevOnGround && b.onGround && vyBefore < -8) {
      this.realm.emitNear(b.x, b.y, b.z, { t: 'sound', sound: this.soundUnderfoot(), action: 'land', vol: Math.min(1.2, 0.35 + (-vyBefore - 8) / 18) });
    }
    if (!this.prevInWater && b.inWater && vyBefore < -2.5) this.realm.emitNear(b.x, b.y, b.z, { t: 'splash', vol: Math.min(1, -vyBefore / 12) });

    // ---- fall damage: distance from the highest point since leaving the ground ----
    if (b.onGround) {
      if (!this.prevOnGround && !b.inWater && !b.inWeb && !b.onLadder) {
        if (this.world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.05), Math.floor(b.z)) === B.SLIME_BLOCK) {
          // Slime takes the fall, and gives it back as a bounce (crouch to stay put).
          if (!move.sneak && vyBefore < -6) {
            b.vy = Math.min(20, -vyBefore * 0.8);
            b.onGround = false;
            this.realm.emitNear(b.x, b.y, b.z, { t: 'sound', sound: 'dirt', action: 'land', vol: 1 });
          }
        } else {
          // (Wings take the fall: the wearer lands light.)
          this.vitals.land(wings ? 0 : this.peakY - b.y, this.vitalsCtx(), protectionFactor(this.armorProtection('fall')));
        }
      }
      this.peakY = b.y;
    } else if (b.inWater || b.inWeb || b.onLadder || this.flying) {
      this.peakY = b.y;
    } else {
      this.peakY = Math.max(this.peakY, b.y);
    }
    this.prevOnGround = b.onGround;
    this.prevInWater = b.inWater;
    this.environmentalDamage();

    // ---- exhaustion ----
    if (move.jump && wasOnGround && !b.onGround && b.vy > 0) {
      this.vitals.addExhaustion(move.sprint ? EXHAUSTION.sprintJump : EXHAUSTION.jump);
      if (!this.flying && !b.inWater && !b.onLadder && !this.mountId && this.wingNumber === 0) this.realm.emitNear(b.x, b.y, b.z, { t: 'sound', sound: this.soundUnderfoot(), action: 'jump', vol: move.sprint ? 1 : 0.8 });
    }
    if (move.sprint && b.onGround) this.vitals.addExhaustion(EXHAUSTION.sprintPerBlock * Math.hypot(b.x - px, b.z - pz));
    if (this.wingFlying) {
      // On the wings: the flight burns hunger as it goes, and ends on the ground (with jump not held), in the water, or on an empty belly.
      this.vitals.addExhaustion(WING_EXHAUSTION_PER_BLOCK * Math.hypot(b.x - px, b.z - pz));
      if (b.inWater || this.vitals.dead) this.flying = false;
      else if (this.vitals.hunger <= WING_MIN_HUNGER) {
        this.flying = false;
        this.emit({ t: 'toast', text: 'You are too hungry to keep flying.' });
      } else if (b.onGround && !f.jump) {
        // Down on the ground: the flight ends when the wearer sinks to it (sneaking) or has stood on it a moment, not at every touch of a slope.
        this.wingGroundT += STEP;
        if (f.sneak || this.wingGroundT > 0.4) this.flying = false;
      } else this.wingGroundT = 0;
    }
    this.vitals.tick(STEP, this.vitalsCtx());

    // (A mount's paws make their own sound, in time with its stride: the client plays them.)
    // (A figure with wings floats above the ground: its feet make no sound.)
    if (b.onGround && !this.flying && !move.sneak && !this.mountId && this.wingNumber === 0) {
      this.stepAcc += Math.hypot(b.x - px, b.z - pz);
      const stride = move.sprint ? 2.5 : 1.9;
      if (this.stepAcc >= stride) {
        this.stepAcc = 0;
        this.realm.emitNear(b.x, b.y, b.z, { t: 'sound', sound: this.soundUnderfoot(), action: 'step', vol: move.sprint ? 1 : 0.7 });
      }
    }
  }

  /** Run the physics steps that `dt` of real time buys, plus the fell-out-of-the-world check. */
  advance(f: InputFrame): void {
    if (this.spectating) this.flying = true;
    else if (this.mode === 'survival' && this.wingNumber === 0) this.flying = false;
    this.acc += f.dt;
    while (this.acc >= STEP) {
      this.markView();
      this.simulateStep(f);
      this.acc -= STEP;
    }
    this.viewBlend = Math.min(1, this.acc / STEP);
    this.voidCheck();
  }

  /** Exactly one physics step (the server runs clients' inputs this way). */
  advanceOne(f: InputFrame): void {
    if (this.spectating) this.flying = true;
    else if (this.mode === 'survival' && this.wingNumber === 0) this.flying = false;
    this.markView();
    this.simulateStep(f);
    this.viewBlend = 1;
    this.voidCheck();
  }

  private voidCheck(): void {
    if (this.body.y < -30) {
      if (this.mode === 'survival' && !this.spectating) this.vitals.damage(1000, 'void');
      else this.respawn();
    }
  }

  /** After the shared world updated: damage feedback, death, furnace screen refresh. */
  postRealm(dt: number): void {
    this.landTick(dt);
    if (this.vitals.health < this.lastHealth) {
      this.emit({ t: 'hurt' });
      this.wake(); // being hurt wakes you at once
    }
    this.lastHealth = this.vitals.health;
    if (this.vitals.dead) this.die();

    // The forge in the crafting grid: when it is done the outcome is announced like a jewel's, over the slot the piece is in.
    if (this.menu instanceof CraftingMenu && this.menu.forging) {
      const done = this.menu.stepForge(dt);
      if (done && done.sets > 0) {
        this.emit({ t: 'crafted', slot: this.menu.resultSlot, label: tooltipName(done.stack), detail: done.stack.count > 1 ? `x${done.stack.count}` : 'Crafted' });
        this.emit({ t: 'inv' });
      } else if (done) {
        this.emit({ t: 'toast', text: done.text });
        this.emit({ t: 'jewel', ok: done.ok, kind: 'rift', slot: this.menu.resultSlot, label: done.label, detail: done.detail });
        this.emit({ t: 'inv' });
      }
    }
    if (this.menu?.kind === 'furnace') {
      this.uiTimer += dt;
      if (this.uiTimer > 0.25) {
        this.uiTimer = 0;
        this.emit({ t: 'inv' });
      }
    }
    // Walk away from a villager (or lose it) and the trade screen closes.
    const v = this.tradingWith;
    if (v && (v.dead || Math.hypot(v.body.x - this.body.x, v.body.z - this.body.z) > 6 || Math.abs(v.body.y - this.body.y) > 4)) this.closeMenu();
    if (this.quests) this.updateQuests(dt);
    this.updateAch(dt);
    this.updatePins(dt);
  }

  /**
   * Keep the map's pins up to date: the other members of the party who are in the same place. Told to the client when it
   * changes, a few times a second at most.
   */
  private updatePins(dt: number): void {
    this.pinsTimer += dt;
    if (this.pinsTimer < 0.25) return;
    this.pinsTimer = 0;
    const here = this.realm.copyAt(this);
    const party = this.realm.parties
      .membersOf(this)
      .filter((m) => m !== this && !m.vitals.dead && this.realm.copyAt(m) === here)
      .map((m) => ({ name: m.name, x: Math.round(m.body.x), z: Math.round(m.body.z) }));
    const key = party.length === 0 ? '' : JSON.stringify(party);
    if (key === this.pinsKey) return;
    this.pinsKey = key;
    this.emit({ t: 'pins', party });
  }
  // ---- quests (Adventure mode) ---------------------------------------------

  /** Send the whole quest log (it is small): what the log window, the tracker and the marks over the quest givers draw. */
  syncQuests(): void {
    if (this.quests) this.emit({ t: 'quests', log: this.quests.toJSON() });
  }

  /** The game did something a quest may count; tell the log and say what moved. */
  questEvent(e: QuestEvent): void {
    const log = this.quests;
    if (!log || this.spectating) return;
    this.noteQuests(log.record(e));
  }

  /** A monster this player has a share in has died: what an active quest makes it carry goes straight into the bags (see questDrops.ts). */
  questKill(mob: MobKind, rand: () => number): void {
    const log = this.quests;
    if (!log || this.spectating) return;
    const count = (id: number): number => this.inventory.countOf(id);
    const need = (quest: string, item: number): number => {
      const q = questById(quest);
      return (q?.objectives ?? []).reduce((n, o) => (o.kind === 'collect' && o.items.includes(item) ? n + o.count : n), 0);
    };
    for (const id of rollQuestDrops(mob, this.zoneId, (quest) => log.status(quest) === 'active', count, need, this.questMisses, rand)) {
      this.collectOrDrop(makeStack(id, 1));
      this.emit({ t: 'quest', what: 'step', text: `Found: ${getItem(id).name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}` });
      this.emit({ t: 'inv' });
    }
  }

  private noteQuests(list: QuestProgress[]): void {
    if (list.length === 0) return;
    for (const p of list) {
      const o = p.quest.objectives[p.index];
      this.emit({ t: 'quest', what: 'step', text: `${o.label}: ${p.now}/${p.count}` });
      if (p.ready && p.stepDone) this.emit({ t: 'quest', what: 'ready', text: `${p.quest.name} (ready to hand in)` });
    }
    this.syncQuests();
  }

  /** What came out of a crafting grid or a furnace. */
  private tookFromMenu(stack: ItemStack, kind: string): void {
    if (kind === 'inventory' || kind === 'crafting') this.questEvent({ t: 'craft', item: stack.id, count: stack.count });
    else if (kind === 'furnace') this.questEvent({ t: 'smelt', item: stack.id, count: stack.count });
  }

  /** The things that are not a single action: where the player stands, what they carry, and who they are talking to. */
  private updateQuests(dt: number): void {
    const log = this.quests!;
    const classId = this.cls?.classId ?? null;
    if (log.classId !== classId) {
      log.classId = classId;
      this.syncQuests();
    }
    if (this.dialogNpc) {
      const npc = npcById(this.dialogNpc);
      // A dungeon's person stands in every copy: the one to measure to is the one in the copy being stood in.
      const slot = npc?.dungeon ? this.generator.instanceAt(this.body.x, this.body.z) : -1;
      const shift = slot > 0 ? (this.generator.instanceBounds(slot)?.z0 ?? 0) - (this.generator.instanceBounds(0)?.z0 ?? 0) : 0;
      if (!npc || Math.hypot(npc.x - this.body.x, npc.z + shift - this.body.z) > DIALOG_RANGE) this.closeDialog();
    }
    this.questTimer += dt;
    if (this.questTimer < 0.25) return;
    this.questTimer = 0;
    if (!this.ready || this.screen === 'dead' || this.spectating) return;
    const b = this.body;
    const zone = this.generator.zoneAt(b.x, b.y, b.z);
    if (zone !== this.zoneId) {
      this.zoneId = zone;
      if (zone) {
        this.emit({ t: 'zone', id: zone });
        this.questEvent({ t: 'enter', zone });
      }
    }
    this.noteQuests(log.sync((items) => items.reduce((n, id) => n + this.inventory.countOf(id), 0)));
  }

  /** Right-click on a quest giver: the dialog opens (the client draws it from the log and the NPC's lines). */
  talkNpc(mob: Mob): boolean {
    const npc = NPCS[mob.variant];
    if (!this.quests || !npc || mob.dead || this.screen !== 'none' || this.spectating) return false;
    this.dialogNpc = npc.id;
    this.screen = 'dialog';
    this.lowerShield();
    this.realm.mobEvents.sound('say', mob);
    this.emit({ t: 'dialog', npc: npc.id });
    if (npc.id === AUCTIONEER) this.sendAuctions();
    if (npc.stash) this.sendStash();
    this.emit({ t: 'swing' });
    return true;
  }

  closeDialog(): void {
    if (this.screen !== 'dialog') return;
    this.dialogNpc = null;
    this.screen = 'none';
    this.emit({ t: 'dialog', npc: null });
  }

  /** Taking up, handing in and giving up quests. Every id and every claim is checked: a client cannot take a reward it has not earned. */
  private questCommand(c: Extract<Command, { t: 'quest' }>): void {
    const log = this.quests;
    const q = questById(c.id);
    if (!log || !q || this.spectating || this.screen === 'dead') return;
    if (c.a === 'abandon') {
      if (log.abandon(q.id)) {
        this.emit({ t: 'quest', what: 'step', text: `Quest abandoned: ${q.name}` });
        this.syncQuests();
      }
      return;
    }
    // The rest happens face to face.
    const talking = this.screen === 'dialog' ? this.dialogNpc : null;
    if (c.a === 'accept') {
      if (talking !== q.giver || !log.accept(q.id)) return;
      this.emit({ t: 'quest', what: 'accept', text: `Quest accepted: ${q.name}` });
      for (const it of q.give ?? []) this.collectOrDrop(makeStack(it.id, it.count));
      if (q.give?.length) this.emit({ t: 'inv' });
      this.noteQuests(log.sync((items) => items.reduce((n, id) => n + this.inventory.countOf(id), 0)));
      // A place you are standing in already counts for a quest that asks you to go there.
      if (this.zoneId) this.questEvent({ t: 'enter', zone: this.zoneId });
      this.syncQuests();
      if (log.status(q.id) === 'ready') this.emit({ t: 'quest', what: 'ready', text: `${q.name} (ready to hand in)` });
      return;
    }
    if (talking !== q.turnIn) return;
    // The items a quest asks you to gather are handed over (like a quest item in the old MMOs).
    log.sync((items) => items.reduce((n, id) => n + this.inventory.countOf(id), 0));
    if (log.status(q.id) !== 'ready') return;
    for (const o of q.objectives) {
      if (o.kind !== 'collect') continue;
      let left = o.count;
      for (const id of o.items) {
        const n = Math.min(left, this.inventory.countOf(id));
        if (n > 0 && this.inventory.remove(id, n)) left -= n;
      }
    }
    const reward = log.complete(q.id);
    if (!reward) return;
    if (reward.xp > 0) {
      this.addXp(reward.xp);
    }
    for (const it of rewardItems(reward, this.cls?.classId ?? null)) this.collectOrDrop(makeStack(it.id, it.count));
    this.addCoins(rewardCoins(reward), true);
    this.achAdd('quests');
    this.emit({ t: 'quest', what: 'done', text: `Quest complete: ${q.name}` });
    this.emit({ t: 'inv' });
    this.syncQuests();
  }

  /**
   * Buying from and selling to the merchant being talked to. Everything is checked here: the keeper must be in reach,
   * the stock index and the slot must exist, the coins must be there and the wares must fit in the bags.
   */
  private shopCommand(c: Extract<Command, { t: 'shop' }>): void {
    const shop = this.screen === 'dialog' && this.dialogNpc ? shopOf(this.dialogNpc) : null;
    if (!shop || this.spectating) return;
    if (c.a === 'buy') {
      const ware = shop.stock[c.i];
      if (!ware) return;
      // As many purchases as asked, as long as coins and room last (the first one must go through).
      let bought = 0;
      for (let k = 0; k < c.n; k++) {
        const stack = makeStack(ware.id, ware.count);
        if (ware.gear) stack.gear = cloneGear(ware.gear);
        if (this.coins < ware.price || !this.inventory.canFit(stack)) break;
        this.spendCoins(ware.price);
        this.inventory.collect(stack);
        bought++;
      }
      if (bought === 0) {
        this.emit({ t: 'toast', text: this.coins < ware.price ? 'Not enough coins.' : 'Your bags are full.' });
        return;
      }
      this.emit({ t: 'inv' });
      this.emit({ t: 'shop', what: 'buy' });
      return;
    }
    const s = this.inventory.get(c.i);
    if (!s) return;
    const each = stackSellPrice(s);
    if (each <= 0) {
      this.emit({ t: 'toast', text: 'The merchant has no use for that.' });
      return;
    }
    const n = Math.min(c.n, s.count);
    s.count -= n;
    this.inventory.set(c.i, s.count > 0 ? s : null);
    this.addCoins(each * n, true);
    this.emit({ t: 'inv' });
    this.emit({ t: 'shop', what: 'sell' });
  }

  // ---- the Auction House -------------------------------------------------------------

  /** Show the window of the Auctioneer what the house holds now (for the search made last). */
  private sendAuctions(): void {
    this.realm.auctions.update();
    const view = this.realm.auctions.view(this.auctionQuery, this.account);
    const desk = this.tokenDesk();
    if (desk && this.wallet) view.tokens = { balance: desk.balance(this.wallet) };
    this.emit({ t: 'auction', view });
  }

  /** The desk that lets this player trade in $SOLRIFT, or null when they may not (no token, a guest, creative, admin, a cheats server). */
  private tokenDesk(): TokenDesk | null {
    const desk = this.realm.tokenDesk;
    return desk && this.wallet && this.mode !== 'creative' && desk.allowed(this) ? desk : null;
  }

  /**
   * The Auction House (see auction.ts). Everything is checked here: the Auctioneer must be in reach, the slot and the numbers must be
   * real, and the coins and the item must be there. What is owed (an item won, the coins of a sale, a bid that was outbid) is
   * not handed over at once but waits in the mail, and is taken from there.
   */
  private auctionCommand(c: Extract<Command, { t: 'auction' }>): void {
    if (this.spectating || this.screen !== 'dialog' || this.dialogNpc !== AUCTIONEER) return;
    const house = this.realm.auctions;
    const say = (text: string): void => this.emit({ t: 'toast', text });
    house.update();
    if (c.a === 'search') {
      this.auctionQuery = cleanQuery(c);
      this.sendAuctions();
      return;
    }
    if (!this.account) {
      say('Sign in to sell, bid or collect mail at the Auction House.');
      this.sendAuctions();
      return;
    }
    if (this.mode === 'creative' && c.a !== 'take' && c.a !== 'cancel') {
      say('Nobody trades in creative mode.');
      this.sendAuctions();
      return;
    }
    switch (c.a) {
      case 'post': {
        const stack = this.inventory.isUsable(c.slot) ? this.inventory.get(c.slot) : null;
        const blocked = sellBlocker(stack);
        if (blocked || !stack) {
          say(blocked ?? 'There is nothing there.');
          break;
        }
        const offered = { ...cloneStack(stack), count: Math.min(c.count, stack.count) };
        const deposit = depositFor(offered, c.hours);
        if (this.coins < deposit) {
          say(`You cannot afford the deposit of ${deposit} Auren.`);
          break;
        }
        const token = c.token === true;
        if (token && !this.tokenDesk()) {
          say('You cannot trade in $SOLRIFT here.');
          break;
        }
        const res = house.post({ seller: this.account, sellerName: this.name, item: offered, bid: c.bid, buyout: c.buyout, hours: c.hours, deposit, token, sellerWallet: token ? this.wallet : null });
        if (!res.ok) {
          say(res.error);
          break;
        }
        stack.count -= offered.count;
        this.inventory.set(c.slot, stack.count > 0 ? stack : null);
        this.spendCoins(deposit);
        this.auctionTouched = true;
        this.emit({ t: 'inv' });
        say(`Auction posted (deposit ${deposit} Auren).`);
        break;
      }
      case 'bid':
      case 'buyout': {
        const desk = this.tokenDesk();
        const funds = { wallet: desk ? this.wallet : null, tokens: desk && this.wallet ? desk.balance(this.wallet) : 0 };
        const res = c.a === 'bid' ? house.bid(c.id, this.account, this.name, c.amount, this.coins, funds) : house.buyout(c.id, this.account, this.name, this.coins, funds);
        if (!res.ok) {
          say(res.error);
          break;
        }
        // (an auction in $SOLRIFT is paid from the ledger by the house's moves, not from the purse)
        if (res.token) desk?.flush();
        else this.spendCoins(res.pay);
        this.auctionTouched = true;
        this.emit({ t: 'shop', what: 'buy' });
        say(res.bought ? 'Bought! The item is waiting in your mail.' : 'Bid placed.');
        break;
      }
      case 'cancel': {
        const res = house.cancel(c.id, this.account);
        if (!res.ok) say(res.error);
        else {
          this.auctionTouched = true;
          say('Auction cancelled. The item is in your mail; the deposit is lost.');
        }
        break;
      }
      case 'take': {
        let took = 0;
        let full = false;
        const wanted = c.id === 0 ? house.mailOf(this.account).map((m) => m.id) : [c.id];
        for (const id of wanted) {
          const m = house.mailOf(this.account).find((x) => x.id === id);
          if (!m) continue;
          if ((m.item && !this.inventory.canFit(m.item)) || this.coins + m.coins > MAX_COINS) {
            full = true;
            continue;
          }
          house.takeMail(this.account, id);
          if (m.item) this.inventory.collect(cloneStack(m.item));
          if (m.coins > 0) this.addCoins(m.coins);
          took++;
        }
        if (took > 0) {
          this.auctionTouched = true;
          this.emit({ t: 'inv' });
        }
        if (full) say('Your bags or your purse are full: make room and collect again.');
        break;
      }
    }
    this.sendAuctions();
  }

  // ---- the Stash -----------------------------------------------------------------------

  /** Show the window of the Stashkeeper what the wallet's stash holds now (an empty one without a wallet). */
  private sendStash(): void {
    this.emit({ t: 'stash', view: this.wallet ? this.realm.stashes.view(this.wallet) : { slots: [] } });
  }

  /**
   * The Stash (see stash.ts): move an item of the inventory in, or one out of it. Everything is checked here: the Stashkeeper must be
   * in reach, the slot must be real and there must be room on the other side. A stack moves only as far as it fits, and what is not
   * moved stays where it was, so an item is never in two places.
   */
  private stashCommand(c: Extract<Command, { t: 'stash' }>): void {
    if (this.spectating || this.screen !== 'dialog' || !isStashkeeper(this.dialogNpc)) return;
    const say = (text: string): void => this.emit({ t: 'toast', text });
    const wallet = this.wallet;
    if (!wallet) {
      say('Sign in with your wallet to use the stash.');
      this.sendStash();
      return;
    }
    if (this.mode === 'creative') {
      say('Nobody stores things in creative mode.');
      this.sendStash();
      return;
    }
    const vault = this.realm.stashes;
    if (c.a === 'put') {
      const stack = this.inventory.isUsable(c.slot) ? this.inventory.get(c.slot) : null;
      const blocked = stashBlocker(stack);
      if (blocked || !stack) say(blocked ?? 'There is nothing there.');
      else {
        const moved = vault.put(wallet, stack, c.count);
        if (moved === 0) say('The stash is full.');
        else {
          stack.count -= moved;
          this.inventory.set(c.slot, stack.count > 0 ? stack : null);
          this.stashTouched = true;
          this.emit({ t: 'inv' });
        }
      }
    } else {
      const there = vault.peek(wallet, c.slot);
      if (!there) say('There is nothing there.');
      else {
        const part = { ...cloneStack(there), count: Math.min(c.count, there.count) };
        const wanted = part.count;
        const left = this.inventory.collect(part);
        const moved = wanted - (left ? left.count : 0);
        if (moved === 0) say('Your bags are full.');
        else {
          vault.remove(wallet, c.slot, moved);
          this.stashTouched = true;
          this.emit({ t: 'inv' });
        }
      }
    }
    this.sendStash();
  }
  // ---- the website's Camp ------------------------------------------------------------------------------------------
  // A hero that is not in the game can still be looked after from the website (see camp.ts and the server's desk.ts): the server
  // loads the saved hero into a Player that has no body in the world, asks one of these, and writes the result back. They return
  // null when it was done, or the reason it was not.

  /** Stand at a counter (the Auctioneer, the Stashkeeper) without walking there: the counters' commands then work. `null` steps away. */
  atCounter(npc: string | null): void {
    this.dialogNpc = npc;
    this.screen = npc ? 'dialog' : 'none';
  }

  /** Put on what lies in a slot of the bags: a piece of armor, a horn, a glowing set, a companion, wings, or something for the off hand. What was worn goes back to that slot. */
  deskEquip(index: number): string | null {
    const stack = this.inventory.isUsable(index) ? this.inventory.get(index) : null;
    if (!stack) return 'There is nothing there.';
    if (this.vitals.dead) return 'Your hero is dead: revive it in the game first.';
    const armor = getItem(stack.id).armor;
    if (armor) {
      const worn = this.armor.get(armor.slotIndex);
      if (worn && stack.count > 1 && !this.inventory.canFit(worn)) return 'Your bags are full.';
      this.armor.set(armor.slotIndex, cloneStack({ ...stack, count: 1 }));
      this.inventory.set(index, stack.count > 1 ? { ...stack, count: stack.count - 1 } : null);
      if (worn) this.inventory.collect(worn);
      return null;
    }
    this.drainEvents();
    const done = this.equipHorn(index) || this.equipOutfit(index) || this.equipCompanion(index) || this.equipWings(index) || this.equipAccessory(index);
    if (done) {
      const toast = this.drainEvents().flatMap((e) => (e.t === 'toast' ? [e.text] : [])).pop();
      return this.inventory.get(index) === stack ? (toast ?? 'It cannot be worn now.') : null;
    }
    if (holdsInOffhand(stack.id)) {
      const worn = this.offhand.get(0);
      this.offhand.set(0, cloneStack(stack));
      this.inventory.set(index, worn);
      return null;
    }
    return 'That cannot be worn.';
  }

  /** Take off what is worn in a place and put it in the bags. */
  deskUnequip(where: string): string | null {
    const armorAt = ARMOR_SLOTS.indexOf(where as (typeof ARMOR_SLOTS)[number]);
    const box = armorAt >= 0 ? this.armor : where === 'offhand' ? this.offhand : where === 'mount' ? this.mountSlot : where === 'outfit' ? this.outfitSlot : where === 'companion' ? this.companionSlot : where === 'wings' ? this.wingSlot : where === 'ring1' || where === 'ring2' || where === 'necklace' ? this.accessories : null;
    if (!box) return 'There is nothing like that to take off.';
    const at = armorAt >= 0 ? armorAt : where === 'ring2' ? 1 : where === 'necklace' ? NECKLACE_SLOT : 0;
    const worn = box.get(at);
    if (!worn) return 'Nothing is worn there.';
    if (!this.inventory.canFit(worn)) return 'Your bags are full.';
    this.inventory.collect(cloneStack(worn));
    box.set(at, null);
    return null;
  }

  /** Move a stack of the bags onto another slot: it merges when they match, and swaps places otherwise. */
  deskSwap(a: number, b: number): string | null {
    if (a === b) return null;
    if (!this.inventory.isUsable(a) || !this.inventory.isUsable(b)) return 'That slot is not there.';
    const from = this.inventory.get(a);
    const to = this.inventory.get(b);
    if (!from) return 'There is nothing there.';
    if (to && canMerge(to, from) && to.count < maxStackOf(to)) {
      const n = Math.min(maxStackOf(to) - to.count, from.count);
      to.count += n;
      from.count -= n;
      this.inventory.set(a, from.count > 0 ? from : null);
      return null;
    }
    this.inventory.set(a, to);
    this.inventory.set(b, from);
    return null;
  }

  // ---- test and debug helpers ---------------------------------------------
  // These bypass the protocol on purpose. They are the "dev back door" behind `window.__solrift`
  // and the unit tests, and are never reachable from a client message.

  giveItem(id: number, count = 1): void {
    this.giveOrDrop(makeStack(id, count));
    this.emit({ t: 'inv' });
  }

  clearInventory(): void {
    for (let i = 0; i < this.inventory.size; i++) this.inventory.set(i, null);
    this.emit({ t: 'inv' });
  }

  breakTimeAt(x: number, y: number, z: number): number {
    const s = this.held;
    return breakTime(BLOCKS[this.world.getBlock(x, y, z)], s ? getItem(s.id).tool : null, this.toolEnchants().efficiency, !!s && getItem(s.id).shears);
  }

  useOn(x: number, y: number, z: number, nx: number, ny: number, nz: number, fy?: number): boolean {
    return this.useHeldOn({ x, y, z, id: this.world.getBlock(x, y, z), nx, ny, nz, fy });
  }

  /** Use a block the way a right-click does (open a screen, swing a door...); for tests and hotkeys. */
  useBlock(x: number, y: number, z: number): boolean {
    const id = this.world.getBlock(x, y, z);
    if (!isInteractive(id)) return false;
    this.openForBlock({ x, y, z, id, nx: 0, ny: 1, nz: 0 });
    return true;
  }

  setWeather(kind: WeatherKind): void {
    this.weather.set(kind, 100000);
  }

  spawnMob(kind: MobKind, x: number, y: number, z: number, variant = 0): number {
    return this.mobs.spawn(kind, x, y, z, { variant }).id;
  }

  /** Talk to a villager by mob id, as a right-click would (tests and hooks). */
  talkToMob(id: number): boolean {
    const m = this.mobs.mobs.find((x) => x.id === id);
    if (m?.kind === 'npc') return this.talkNpc(m);
    return !!m && m.kind === 'villager' && this.talkTo(m);
  }

  clearMobs(): void {
    this.mobs.mobs.length = 0;
    this.mobs.arrows.length = 0;
  }

  /** Hurt a mob like a player hit would (no cooldown), knocking it away along +x. */
  damageMob(id: number, amount: number): boolean {
    const m = this.mobs.mobs.find((x) => x.id === id);
    return m ? this.mobs.damage(m, amount, 1, 0, this.realm.mobEvents, true, true, true) : false;
  }

  // ---- vehicles ---------------------------------------------------------------

  /** The minecart or boat under the crosshair, if it is closer than any block in the way. */
  aimedVehicle(): { vehicle: Vehicle; dist: number } | null {
    const d = this.look();
    const { x: ox, y: oy, z: oz } = this.eye();
    const all = this.realm.vehicles;
    // Not the one you are sitting in (the ray starts inside it).
    const hit = all.raycast(ox, oy, oz, d.x, d.y, d.z, 3.8, this.riding ?? undefined);
    if (!hit) return null;
    const block = raycast(this.world, ox, oy, oz, d.x, d.y, d.z, REACH);
    // The rail a cart stands on never hides it.
    if (block && !isRail(block.id)) {
      const t = rayAabb(ox, oy, oz, d.x, d.y, d.z, [block.x, block.y, block.z], [block.x + 1, block.y + 1, block.z + 1], REACH + 1);
      if (t !== null && t < hit.dist) return null;
    }
    return hit;
  }

  /** Climb into a minecart or boat. */
  mount(v: Vehicle): boolean {
    if (v.rider || this.riding || this.mountId || this.mountCast || this.spectating || this.sleeping || this.vitals.dead || this.screen === 'dead') return false;
    if (Math.hypot(v.x - this.body.x, v.z - this.body.z) > 5) return false;
    this.riding = v;
    v.rider = this.rider;
    this.flying = false;
    this.peakY = this.body.y;
    this.emit({ t: 'toast', text: 'Press Shift to get out' });
    this.emit({ t: 'swing' });
    return true;
  }

  /** Get out of the vehicle, onto a free spot beside it. */
  dismount(): void {
    const v = this.riding;
    if (!v) return;
    this.riding = null;
    if (v.rider === this.rider) v.rider = null;
    const spot = this.realm.vehicles.exitSpot(v, this.body);
    const b = this.body;
    b.x = spot.x;
    b.y = spot.y;
    b.z = spot.z;
    b.vx = b.vy = b.vz = 0;
    this.peakY = b.y;
  }

  /** A punch breaks a minecart or boat: it drops as an item (nothing in creative mode). */
  hitVehicle(v: Vehicle): void {
    this.attackCooldown = 0.5;
    this.emit({ t: 'swing' });
    this.realm.destroyVehicle(v, this.mode === 'survival');
  }

  /** Set an armor stand on the top of the solid block you are looking at. It faces the way you face. */
  private placeArmorStand(): boolean {
    const d = this.look();
    const e = this.eye();
    const hit = raycast(this.world, e.x, e.y, e.z, d.x, d.y, d.z, REACH);
    if (!hit || hit.ny <= 0 || IS_SOLID[hit.id] !== 1) return false;
    const x = hit.x + 0.5;
    const y = hit.y + 1;
    const z = hit.z + 0.5;
    const blocked = (px: number, py: number, pz: number): boolean => {
      const id = this.world.getBlock(px, py, pz);
      return IS_SOLID[id] === 1 || !!IS_LIQUID[id];
    };
    if (blocked(hit.x, hit.y + 1, hit.z) || blocked(hit.x, hit.y + 2, hit.z)) return false;
    const b = this.body;
    const tall = b.height ?? 1.8;
    if (Math.abs(b.x - x) < 0.8 && Math.abs(b.z - z) < 0.8 && b.y < y + 2 && b.y + tall > y) return false;
    let placed = 0;
    for (const m of this.mobs.mobs) if (m.kind === 'armor_stand' && !m.dead) placed++;
    if (placed >= 128) {
      this.emit({ t: 'toast', text: 'There are already too many armor stands.' });
      return true;
    }
    if (this.mobs.mobs.some((m) => m.kind === 'armor_stand' && !m.dead && Math.abs(m.body.x - x) < 0.45 && Math.abs(m.body.z - z) < 0.45 && Math.abs(m.body.y - y) < 1)) return false;
    const mob = this.mobs.spawn('armor_stand', x, y, z);
    mob.yaw = this.yaw;
    mob.homeYaw = this.yaw;
    this.realm.emitNear(x, y, z, { t: 'sound', sound: 'wood', action: 'place', vol: 1 });
    this.emit({ t: 'swing' });
    this.useUpHeld();
    return true;
  }

  /**
   * Right-click an armor stand. A piece of armor goes in its slot, anything else in its hand, and an empty hand takes
   * one piece back. Sneaking changes the pose instead.
   */
  private useArmorStand(mob: Mob): boolean {
    const gear = mob.standGear;
    if (mob.dead || !gear) return false;
    if (this.sneaking) {
      mob.variant = (mob.variant + 1) % ARMOR_STAND_POSES;
      this.realm.emitNear(mob.body.x, mob.body.y, mob.body.z, { t: 'sound', sound: 'wood', action: 'step', vol: 0.5 });
      this.emit({ t: 'swing' });
      return true;
    }
    const held = this.held;
    if (held) {
      const piece = getItem(held.id).armor;
      this.swapOntoStand(mob, piece ? piece.slotIndex : 4);
      return true;
    }
    for (const slot of [4, 3, 2, 1, 0]) {
      const worn = gear[slot];
      if (!worn) continue;
      gear[slot] = null;
      this.giveOrDrop(worn);
      this.emit({ t: 'inv' });
      this.emit({ t: 'swing' });
      this.realm.emitNear(mob.body.x, mob.body.y, mob.body.z, { t: 'sound', sound: 'wood', action: 'step', vol: 0.6 });
      return true;
    }
    return false;
  }

  /** Move one of the held stack onto an armor stand, and hand back whatever was already there. */
  private swapOntoStand(mob: Mob, slot: number): void {
    const held = this.held;
    const gear = mob.standGear;
    if (!held || !gear) return;
    const one = cloneStack(held);
    one.count = 1;
    const prev = gear[slot];
    gear[slot] = one;
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, prev);
      else if (prev) this.giveOrDrop(prev);
    } else if (prev) this.giveOrDrop(prev);
    this.emit({ t: 'inv' });
    this.emit({ t: 'swing' });
    this.realm.emitNear(mob.body.x, mob.body.y, mob.body.z, { t: 'sound', sound: 'wood', action: 'place', vol: 0.7 });
  }

  /** Set a minecart on the rail you aim at, or a boat on the water. Returns whether it did. */
  private placeVehicle(held: ItemStack): boolean {
    const d = this.look();
    const e = this.eye();
    const boat = held.id === I.BOAT;
    const hit = raycast(this.world, e.x, e.y, e.z, d.x, d.y, d.z, REACH, boat);
    if (!hit) return false;
    let kind: VehicleKind;
    let x = hit.x + 0.5;
    let y: number;
    let z = hit.z + 0.5;
    if (boat) {
      if (!IS_LIQUID[hit.id] || FLUID_KIND[hit.id] !== FLUID_WATER) return false;
      kind = 'boat';
      let top = hit.y;
      while (FLUID_KIND[this.world.getBlock(hit.x, top + 1, hit.z)] === FLUID_WATER && IS_LIQUID[this.world.getBlock(hit.x, top + 1, hit.z)]) top++;
      y = top + 0.65;
    } else {
      if (!isRail(hit.id)) return false;
      kind = 'minecart';
      y = hit.y + 0.1;
    }
    if (this.realm.vehicles.list.some((o) => Math.abs(o.x - x) < 0.9 && Math.abs(o.z - z) < 0.9 && Math.abs(o.y - y) < 0.9)) return false;
    if (!this.realm.vehicles.spawn(kind, x, y, z, this.yaw)) return false;
    this.realm.emitNear(x, y, z, { t: 'sound', sound: boat ? 'wood' : 'stone', action: 'place', vol: 1 });
    this.emit({ t: 'swing' });
    this.useUpHeld();
    return true;
  }

  /** Right-click on the mob under the crosshair with whatever is held (a dye on a sheep). Returns whether it did something. */
  useOnMob(): boolean {
    const hit = this.aimedMob();
    const held = this.held;
    if (hit && hit.mob.kind === 'armor_stand') return this.useArmorStand(hit.mob);
    if (hit && hit.mob.kind === 'villager') return this.talkTo(hit.mob);
    if (hit && hit.mob.kind === 'npc') return this.talkNpc(hit.mob);
    if (!hit || !held || hit.mob.dead) return false;
    if (held.id === I.BUCKET && (hit.mob.kind === 'cow' || hit.mob.kind === 'mooshroom')) return this.milkCow(hit.mob);
    if (hit.mob.kind === 'sheep' && this.dyeSheep(hit.mob, held)) return true;
    if (getItem(held.id).shears) return hit.mob.kind === 'sheep' && this.shear(hit.mob);
    return this.feedMob(hit.mob, held);
  }

  /** An empty bucket on a grown cow fills with milk. The cow is not hurt. */
  private milkCow(mob: Mob): boolean {
    if (mob.baby || mob.dead) return false;
    const held = this.held;
    if (!held || held.id !== I.BUCKET) return false;
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, makeStack(I.MILK_BUCKET, 1));
      else this.giveOrDrop(makeStack(I.MILK_BUCKET, 1));
    } else this.giveOrDrop(makeStack(I.MILK_BUCKET, 1));
    this.realm.mobEvents.sound('yes', mob);
    this.emit({ t: 'swing' });
    this.emit({ t: 'inv' });
    return true;
  }

  /** Shears on a sheep: one to three pieces of its wool, and it stays bare for a while. */
  private shear(mob: Mob): boolean {
    if (mob.sheared || mob.baby) return false;
    mob.sheared = true;
    mob.woolTimer = WOOL_REGROW;
    const n = 1 + Math.floor(this.rand() * 3);
    this.realm.mobEvents.drop({ id: woolId(mob.variant), count: n }, mob.body.x, mob.body.y + 0.8, mob.body.z);
    this.realm.emitNear(mob.body.x, mob.body.y, mob.body.z, { t: 'sound', sound: 'grass', action: 'break', vol: 0.9 });
    this.emit({ t: 'swing' });
    if (this.mode === 'survival') this.damageHeld(1);
    return true;
  }

  /** The right food puts a grown animal in love, or helps a young one grow up. */
  private feedMob(mob: Mob, held: ItemStack): boolean {
    if (!this.mobs.feed(mob, held.id, this.realm.mobEvents)) return false;
    this.emit({ t: 'swing' });
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, null);
    }
    this.emit({ t: 'inv' });
    return true;
  }

  /**
   * Right-click on a villager: open its trade screen, or, when it has nothing to trade (a nitwit, one that is
   * busy, one that is not in a state to talk), it shakes its head. Returns whether it did something.
   */
  talkTo(mob: Mob): boolean {
    const book = mob.villager;
    if (mob.dead || this.screen !== 'none' || this.spectating) return false;
    if (!book || book.offers.length === 0 || (mob.customer && mob.customer.body !== this.body)) {
      this.realm.mobEvents.sound('no', mob);
      this.emit({ t: 'swing' });
      return true;
    }
    mob.customer = this;
    this.tradingWith = mob;
    this.openMenu(
      new TradeMenu(this.inventory, book, {
        onTrade: () => {
          this.realm.awardXp(3 + Math.floor(this.realm.rand() * 4), mob.body.x, mob.body.y + 0.8, mob.body.z);
          this.realm.mobEvents.sound('yes', mob);
        },
      }),
    );
    return true;
  }

  /** Dye a sheep's wool with the held dye (right-click). Returns whether it did. */
  private dyeSheep(mob: Mob, held: ItemStack): boolean {
    const c = dyeColor(held.id);
    if (c < 0 || mob.dead || mob.variant === c) return false;
    mob.variant = c;
    if (this.mode === 'survival') {
      held.count -= 1;
      if (held.count <= 0) this.inventory.set(this.selected, null);
    }
    this.emit({ t: 'inv' });
    return true;
  }

  /** Swing at whatever is under the crosshair, exactly like a left click. Returns the mob id hit. */
  swing(): number | null {
    const hit = this.aimedMob();
    if (hit) this.attackMob(hit.mob, hit.dist);
    return hit ? hit.mob.id : null;
  }

  /** Run drop physics (and pickup) without real time passing. */
  tickDrops(seconds: number): void {
    const b = this.body;
    for (let t = 0; t < seconds; t += 1 / 30) {
      this.drops.update(1 / 30, b.x, b.y, b.z, (s) => this.inventory.canFit(s), (s) => this.inventory.collect(s));
    }
    this.emit({ t: 'inv' });
  }

  tickFurnaces(seconds: number): void {
    for (let t = 0; t < seconds; t += 0.25) this.blockEntities.tick(0.25);
    this.emit({ t: 'inv' });
  }
}
