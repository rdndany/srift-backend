import type { BobberDraw, RiftView, BossView, DungeonView, Body, ClassView, Container, Fx, GearRoll, ItemStack, Menu, MobKind, SessionScreen, WeatherKind } from '@solrift/shared';
import type { MountView, SaveMode } from '@solrift/shared';

/** A mob as the renderer needs it. The shared `Mob` fits, and so does an interpolated network copy. */
export interface MobLike {
  id: number;
  kind: MobKind;
  body: { x: number; y: number; z: number };
  yaw: number;
  walkPhase: number;
  speedNow: number;
  hurtTime: number;
  /** Seconds since its melee swing (`ATTACK_ANIM` or more: not swinging). A mob that never reports it simply never swings. */
  attackTime?: number;
  /** A boss gathering a spell: 1 while it winds up. */
  casting?: number;
  dead: boolean;
  deathTime: number;
  burning: boolean;
  fuse: number;
  fuseFraction: number;
  size: number;
  variant: number;
  /** Half size (a young animal), shorn (a sheep) and wanting a mate; a local game's Mob answers these itself. */
  baby?: boolean;
  sheared?: boolean;
  love?: number;
  /** An armor stand's worn item ids: helmet, chestplate, leggings, boots, hand. */
  gear?: readonly number[];
  /** Its health and its most (a local game's Mob has both; over the network they are only known while it is hurt, otherwise it is at full health), and whether it is a strong one of a dungeon. */
  health?: number;
  maxHealth?: number;
  elite?: boolean;
  /** Hunting someone. Absent, or false, when it is at rest. */
  aggro?: boolean;
}

export interface ArrowLike {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** A thrown bottle o' enchanting (set as bottle in a local game, as b by a server). */
  bottle?: boolean;
  b?: number;
  /** A thrown ender pearl (an owner in a local game, p by a server). */
  pearl?: unknown;
  p?: number;
  /** A spell (1 fireball, 2 arcane bolt): spell in a local game, s from a server. */
  spell?: number;
  s?: number;
}

/** A minecart or boat as the renderer needs it. */
export interface VehicleLike {
  id: number;
  kind: 'minecart' | 'boat';
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Blocks per second over the ground. */
  speed: number;
  /** Seconds since it was last hit. */
  hurt: number;
}

/** A dropped item as the renderer needs it. */
export interface DropLike {
  id: number;
  stack: { id: number; count?: number; damage?: number; name?: string; ench?: readonly [number, number][]; gear?: GearRoll };
  x: number;
  y: number;
  z: number;
  age: number;
  phase: number;
}

/** An experience orb as the renderer needs it. */
export interface XpOrbLike {
  id: number;
  value: number;
  x: number;
  y: number;
  z: number;
  age: number;
  phase: number;
}

export interface AimTarget {
  x: number;
  y: number;
  z: number;
  id: number;
}

/**
 * What the browser client reads to draw and run the game. Single-player gives it a live
 * `GameSession`; online play gives it a `RemoteSession` that mirrors the server's snapshots.
 */
export interface ClientSession {
  readonly body: Body;
  readonly vitals: { health: number; hunger: number; saturation: number; air: number; dead: boolean };
  /** Seconds left in the open oxygen bottle while the diving helmet is under water. -1 when the bottle is not in use. */
  bottleSec: number;
  /** Spare oxygen items while that bottle is in use. */
  bottleSpare: number;
  /** Seconds of clear sight left underwater (Night Vision or Conduit Power). 0 when the eyes are ordinary. */
  readonly waterSight: number;
  readonly inventory: Container;
  /** The bags worn (see bags.ts): the room of each is in `inventory`, after the backpack. */
  readonly bags: Container;
  readonly mobs: { readonly mobs: readonly MobLike[]; readonly arrows: readonly ArrowLike[] };
  readonly drops: { readonly drops: readonly DropLike[]; readonly count: number };
  /** The experience orbs about. */
  readonly xpOrbs: { readonly orbs: readonly XpOrbLike[] };
  /** The fishing lines out: where each float is, and whose hand the line comes from. */
  readonly bobbers: { readonly bobbers: readonly BobberDraw[] };
  readonly vehicles: readonly VehicleLike[];
  /** The minecart or boat you sit in, or null on foot. */
  readonly riding: { readonly id: number } | null;
  /** Experience: whole levels and how full the bar is (0..1). */
  readonly xp: { readonly level: number; readonly progress: number };
  /** Coins carried. */
  readonly coins: number;
  /** Defense points of the worn armor (0..20). */
  readonly defense: number;
  /** The four armor slots: helmet, chestplate, leggings, boots. */
  readonly armor: Container;
  /** The off-hand slot (it holds a shield) and whether the shield is raised. */
  readonly offhand: Container;
  /** The mount slot: the horn of the mount the mount key summons. */
  readonly mountSlot: Container;
  /** The outfit slot: the glowing set the hero wears. */
  readonly outfitSlot: Container;
  /** The companion slot: the companion that follows the hero. */
  readonly companionSlot: Container;
  /** The wing slot: the wings the hero wears. */
  readonly wingSlot: Container;
  /** The rings and the necklace worn: ring, ring, necklace. */
  readonly accessories: Container;
  readonly blocking: boolean;
  /** How far into a meal you are (0..1): 0 when not eating. */
  readonly eatProgress: number;
  /** How far into the Emberstone's cast you are (0..1): 0 when not casting it. */
  readonly emberProgress: number;
  /** The crosshair is on a villager or a quest giver (a right click talks to it, even with a map in the hand). */
  readonly aimsAtTalker: boolean;
  /** On fire (flames on the HUD). */
  readonly burning: boolean;
  /** Seconds of the Poison status effect left (0 when it is clear). */
  readonly poison: number;
  /** Seconds of the Hunger sickness status effect left (0 when it is clear). */
  readonly foodSick: number;
  /** The bed being slept in (dir = the way it points, see BED_DIRS), or null when awake. */
  readonly sleeping: { readonly dir: number } | null;
  readonly sneaking: boolean;
  /** Hardcore world (single-player only). */
  readonly hardcore: boolean;
  /** Hardcore, after dying. */
  readonly spectating: boolean;
  readonly weather: { kind: WeatherKind; rain: number; storm: number; flash: number; readonly darkness: number };
  readonly generator: {
    columnAt(x: number, z: number): { biome: number; height: number; t?: number };
    nearestVillage(x: number, z: number): { x: number; z: number } | null;
    caveKindAt(x: number, y: number, z: number): 'plain' | 'lush' | 'dripstone' | 'deep_dark';
    zoneAt(x: number, y: number, z: number): string | null;
  };
  readonly mode: SaveMode;
  readonly selected: number;
  readonly screen: SessionScreen;
  readonly flying: boolean;
  readonly menu: Menu | null;
  readonly held: ItemStack | null;
  readonly target: AimTarget | null;
  readonly breakProgress: number;
  readonly hudProgress: number;
  readonly bowDraw: number;
  readonly time: number;
  readonly ready: boolean;
  /** Ability effects in the world right now (an id never repeats, so each can be played once). */
  readonly fx: readonly Fx[];
  /** The character's class state for the interface, or null for a character without a class. */
  classView(): ClassView | null;
  /** The boss being fought, for its health bar (null when not in a fight). */
  bossView(): BossView | null;
  /** How far the player is in the dungeon they are in, for its tracker (null outside one). */
  dungeonView(): DungeonView | null;
  /** The rift open near the player, for its tracker and its beam (null when none is within sight). */
  riftView(): RiftView | null;
  /** The mount ridden (1 + its place in MOUNTS, 0 on foot), the one the mount key summons (the same way) and a bit for each mount learned. */
  mountView(): MountView;
  eye(): { x: number; y: number; z: number };
  /**
   * Where the body is to be DRAWN: between the last two fixed steps of the simulation, by how far into the next one the frame is (the body itself
   * moves in jumps of 1/60 s, which shows as judder on a screen that does not run at exactly 60 frames a second).
   */
  viewPos(): { x: number; y: number; z: number };
  /** The eye of a body that stands at `at` (as `eye()` is for the real body). */
  eyeAt(at: { x: number; y: number; z: number }): { x: number; y: number; z: number };
  deathMessage(): string;
  furnaceState(): { burn: number; cook: number } | null;
}
