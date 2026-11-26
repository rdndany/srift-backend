import { Biome, type BiomeId, type Column, WorldGenerator } from './worldgen';
import { B, BB, BUBBLE_BLOOM, CORAL_FAN_RED, CORAL_FAN_YELLOW, IS_SOLID, chestId, isChest } from './blocks';
import type { LootTableName } from './loot';
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import { FLUID_KIND, FLUID_WATER } from './fluids';
import { ISLE_HERD, nearLight, type MobKind } from './mobs';
import { hash2, mulberry32 } from './noise';
import { sunHeight } from './daylight';
import { treeBlocks } from './trees';

/**
 * Isle: one small island in an open sea. A survival world of its own.
 * Nothing here runs for the overworld, the World Beyond, or any other kind.
 * The night window matches Realm (beds, from tick 12542 to 23459 of a 24000-tick day).
 */
const NIGHT_START = 12542 / 24000;
const NIGHT_END = 23459 / 24000;

/** How far the grass usually reaches, before the shore wobbles in and out. */
const LAND = 6;
/** Sand past the grass, then the sea floor falls away over this many blocks. */
const BEACH_BAND = 2.6;
const SLOPE = 36;
/** Stone starts here under the island. Above it the mound is dirt and sand. */
const FOOT = SEA_LEVEL - 7;

export const ISLE_WRECK = { x: 14, y: SEA_LEVEL + 1, z: -3 };
export const ISLE_TREASURE = { x: -7, y: SEA_LEVEL - 2, z: 6 };

/** Dry sand the tide walks onto. These cells are always sand at sea level. */
export const ISLE_BEACH: readonly (readonly [number, number])[] = [
  [8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, 6], [6, -6], [-6, -6],
];

export type IsleEvent = 'crate' | 'sharks' | 'map' | 'ghost';

const EVENTS: readonly IsleEvent[] = ['crate', 'sharks', 'map', 'ghost'];
const isEvent = (v: unknown): v is IsleEvent => EVENTS.includes(v as IsleEvent);

export interface GhostCell {
  x: number;
  y: number;
  z: number;
  was: number;
  placed: number;
}

export interface IsleSave {
  day: number;
  last: IsleEvent | null;
  today: IsleEvent | null;
  ready: boolean;
  map: boolean;
  prev: number;
  ghost: GhostCell[];
  /** The supply crate, so a map can wait until somebody opens it. */
  crate: { x: number; y: number; z: number } | null;
  /** The sea has already been thinned. A later visit does not pull up kelp the player planted. */
  sparse: boolean;
  /** Short stalks left by that thinning have been grown up. Later visits leave them. */
  tall: boolean;
  /** The morning's drowned have already come ashore. Opening the island again does not call another band. */
  placed: boolean;
  /** The day the black moon already brought drowned onto the sand. */
  tide: number;
}

const ISLE_ANIMALS = ['pig', 'chicken', 'sheep'] as const;
type IsleAnimal = (typeof ISLE_ANIMALS)[number];

/** Where each island animal stands, so the two that are chosen do not share a block. */
const ISLE_ANIMAL_SPOT: Record<IsleAnimal, readonly [number, number]> = {
  pig: [-1.5, 0.5],
  chicken: [2.5, -1.5],
  sheep: [0.5, 2.5],
};

/** Two of the three island animals. The same seed always keeps the same pair. */
export function isleFlock(seed: number): [IsleAnimal, IsleAnimal] {
  const kinds: IsleAnimal[] = [...ISLE_ANIMALS];
  const n = seed >>> 0;
  kinds.splice(n % 3, 1);
  if (((n >>> 2) & 1) === 1) kinds.reverse();
  return [kinds[0]!, kinds[1]!];
}

/** The night a clock time belongs to. The moon rises just before sunset, so that first appearance is still this day. */
function moonNight(day: number, time: number): number {
  return time > 0.25 ? day : day - 1;
}

/**
 * The night that ends day 4, then every fourth night. It starts the moment the moon appears and lasts
 * until that moon has left the sky, including the fade after the clock wraps to the next morning.
 * The moon gives no light. `0.03` is the sun height where the moon disc has faded out.
 */
export function isleBlackMoon(day: number, time: number): boolean {
  if (sunHeight(time) >= 0.03) return false;
  const night = moonNight(day, time);
  return night >= 4 && night % 4 === 0;
}

/**
 * One event at dawn, or a quiet morning. A black-moon day stays quiet.
 * The same event does not come twice in a row. A treasure map waits until its chest is dug.
 */
export function isleRoll(day: number, ready: boolean, mapOpen: boolean, last: IsleEvent | null, rand: () => number): IsleEvent | null {
  if (day >= 4 && day % 4 === 0) return null;
  const late = day >= 8;
  const mid = day >= 5;
  const pool: { id: IsleEvent; w: number }[] = [{ id: 'crate', w: late ? 25 : mid ? 35 : 50 }];
  if (mid) pool.push({ id: 'sharks', w: 20 });
  if (ready && !mapOpen) pool.push({ id: 'map', w: late ? 15 : 10 });
  if (late) pool.push({ id: 'ghost', w: 15 });
  const open = pool.filter((p) => p.id !== last);
  const sum = open.reduce((a, p) => a + p.w, 0);
  if (sum <= 0) return null;
  const quiet = day < 5 ? sum : Math.round(sum / 3);
  let r = rand() * (sum + quiet);
  for (const p of open) {
    r -= p.w;
    if (r < 0) return p.id;
  }
  return null;
}

function ghostPlan(): { x: number; y: number; z: number; id: number }[] {
  const out: { x: number; y: number; z: number; id: number }[] = [];
  const x0 = -12;
  const z0 = 9;
  for (let i = 0; i < 5; i++) {
    out.push({ x: x0 + i, y: SEA_LEVEL, z: z0, id: B.PLANKS });
    out.push({ x: x0 + i, y: SEA_LEVEL, z: z0 + 1, id: B.PLANKS });
  }
  for (let h = 1; h <= 3; h++) out.push({ x: x0 + 2, y: SEA_LEVEL + h, z: z0, id: B.LOG });
  out.push({ x: x0 + 4, y: SEA_LEVEL + 1, z: z0 + 1, id: chestId(0, 0) });
  return out;
}

const GHOST_PLAN = ghostPlan();

function cellOf(raw: unknown): GhostCell | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const nums = [c.x, c.y, c.z, c.was, c.placed];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { x: c.x as number, y: c.y as number, z: c.z as number, was: c.was as number, placed: c.placed as number };
}

export function parseIsleSave(raw: unknown): IsleSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const day = typeof o.day === 'number' && Number.isFinite(o.day) ? Math.floor(o.day) : 0;
  if (day < 1) return null;
  const prev = typeof o.prev === 'number' && Number.isFinite(o.prev) ? o.prev : 0.2;
  const last = o.last == null ? null : isEvent(o.last) ? o.last : null;
  const today = o.today == null ? null : isEvent(o.today) ? o.today : null;
  const ghost: GhostCell[] = [];
  if (Array.isArray(o.ghost)) for (const g of o.ghost.slice(0, 40)) {
    const cell = cellOf(g);
    if (cell) ghost.push(cell);
  }
  const tide = typeof o.tide === 'number' && Number.isFinite(o.tide) ? Math.floor(o.tide) : 0;
  return {
    day, last, today, ready: o.ready === true, map: o.map === true, prev, ghost, crate: spotOf(o.crate),
    sparse: o.sparse === true, tall: o.tall === true, placed: o.placed === true, tide: tide > 0 ? tide : 0,
  };
}

function spotOf(raw: unknown): { x: number; y: number; z: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.x !== 'number' || typeof c.y !== 'number' || typeof c.z !== 'number') return null;
  if (![c.x, c.y, c.z].every((n) => Number.isFinite(n))) return null;
  return { x: c.x, y: c.y, z: c.z };
}

export interface IsleSim {
  seed: number;
  rand: () => number;
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  spawn(kind: MobKind, x: number, y: number, z: number): void;
  count(kind: MobKind, x: number, z: number, r: number): number;
  clearDrowned(x: number, z: number, r: number): void;
  /** Leave at most `keep` of this kind inside the radius. The nearest stay. */
  trim(kind: MobKind, x: number, z: number, r: number, keep: number): void;
  say(text: string): void;
  noteChest(x: number, y: number, z: number): void;
  forgetChest(x: number, y: number, z: number): void;
  chestRolled(x: number, y: number, z: number): boolean;
  discardChest(x: number, y: number, z: number): void;
  hasFish(): boolean;
  /** A deed the island's achievements count: a crate, a map, a ship, a black moon, or drowned coming ashore. */
  note?(what: 'crate' | 'map' | 'ship' | 'moon' | 'tide'): void;
}

/** Days, the black moon, and the morning roll. The realm calls it only for an isle world. */
export class IsleDirector {
  day = 1;
  line: string | null = null;
  private prev = 0.2;
  private last: IsleEvent | null = null;
  private today: IsleEvent | null = null;
  private ready = false;
  private map = false;
  private crate: { x: number; y: number; z: number } | null = null;
  private started = false;
  private booted = false;
  private placed = true;
  private ensured = false;
  private tideDay = 0;
  private crew = false;
  private ghost: GhostCell[] = [];
  /** Set once the saved sea has been thinned, so a kelp farm is left alone after that. */
  private sparse = false;
  /** Set once the short stalks from that thinning have been grown. */
  private tall = false;

  constructor(private readonly sim: IsleSim) {}

  blackMoon(time: number): boolean {
    return isleBlackMoon(this.day, time);
  }

  save(time: number): IsleSave {
    return {
      day: this.day,
      last: this.last,
      today: this.today,
      ready: this.ready,
      map: this.map,
      prev: time,
      ghost: this.ghost.map((c) => ({ ...c })),
      crate: this.crate ? { ...this.crate } : null,
      sparse: this.sparse,
      tall: this.tall,
      placed: this.placed,
      tide: this.tideDay,
    };
  }

  /** A saved isle. A world with no isle record starts at day 1 on the next tick. */
  restore(raw: unknown, time: number): void {
    const s = parseIsleSave(raw);
    this.prev = s?.prev ?? time;
    if (!s) return;
    this.day = s.day;
    this.last = s.last;
    this.today = s.today;
    this.ready = s.ready;
    this.map = s.map;
    this.ghost = s.ghost;
    this.crate = s.crate;
    this.sparse = s.sparse;
    this.tall = s.tall;
    this.started = true;
    this.tideDay = s.tide;
    // A ship remembers itself by the blocks it left. The drowned do too, once `placed` was saved.
    // An older save has no such mark: a sharks morning is treated as not yet ashore, and the first
    // tick below keeps it that way only when the beach is actually empty.
    if (s.today === 'ghost') this.placed = s.ghost.length >= GHOST_PLAN.length;
    else this.placed = s.placed || s.today !== 'sharks';
  }

  /** The sea was thinned, and its kelp grown to full height. Later saves remember both. */
  keepSparse(): void {
    this.sparse = true;
    this.tall = true;
  }

  /** The character was already this far into the island. A lower number does not rewind the day. */
  adopt(day: number): void {
    if (!Number.isInteger(day) || day <= this.day) return;
    this.day = day;
    this.started = true;
  }

  /** Called after the clock moves. A wrap of the day is dawn. */
  onClock(time: number): void {
    if (!this.booted) {
      this.booted = true;
      this.settleTide(time);
      this.ensure();
      if (!this.started) {
        this.started = true;
        this.roll();
      }
    }
    const wrapped = time + 0.5 < this.prev;
    this.prev = time;
    if (wrapped) {
      this.finishNight();
      this.day += 1;
      this.roll();
    }
    this.tryToday(time);
    this.night(time);
  }

  private ensure(): void {
    if (this.ensured) return;
    this.ensured = true;
    for (const kind of isleFlock(this.sim.seed)) {
      if (this.sim.count(kind, 0, 0, 96) > 0) continue;
      const [x, z] = ISLE_ANIMAL_SPOT[kind];
      this.sim.spawn(kind, x, SEA_LEVEL + 1, z);
    }
    if (this.sim.count('cod', 0, 0, 30) < 2) {
      this.sim.spawn('cod', 12.5, SEA_LEVEL - 0.4, 3.5);
      this.sim.spawn('cod', -11.5, SEA_LEVEL - 0.4, -5.5);
      this.sim.spawn('salmon', 4.5, SEA_LEVEL - 0.4, -12.5);
    }
    this.crewShip();
  }

  /**
   * Opening the island used to call the drowned ashore again, so a visit started inside a crowd,
   * and the ones from the last visit were still there too. A band that is already on the sand is
   * the one for today. A crowd left by that bug is sent back. Three is the whole band.
   */
  private settleTide(time: number): void {
    this.settleHerd();
    const n = this.sim.count('drowned', 0, 0, 48);
    const here = n > 0;
    if (n > 3) this.sim.clearDrowned(0, 0, 48);
    if (this.today === 'sharks' && here) this.placed = true;
    if (here && isleBlackMoon(this.day, time)) this.tideDay = moonNight(this.day, time);
  }

  /**
   * The day spawner used to drop groups of pigs and chickens whenever the player was out on the
   * water, and they never left, so a visit could find a herd of twenty. Four of a kind is the flock.
   */
  private settleHerd(): void {
    for (const kind of ['pig', 'chicken', 'cow', 'sheep', 'rabbit', 'horse'] as const) this.sim.trim(kind, 0, 0, 96, ISLE_HERD);
  }

  /** The chest the morning map is pointing at: the one under the sand, or the wreck once that one is dug. */
  private chart(): { x: number; y: number; z: number; buried: boolean } | null {
    const m = isleMarks(this.sim.seed);
    if (isChest(this.sim.getBlock(m.hoard.x, m.hoard.y, m.hoard.z))) return { ...m.hoard, buried: true };
    if (isChest(this.sim.getBlock(m.wreck.x, m.wreck.y, m.wreck.z))) return { ...m.wreck, buried: false };
    return null;
  }

  private roll(): void {
    if (this.map && !this.chart()) this.map = false;
    if (this.sim.chestRolled(ISLE_WRECK.x, ISLE_WRECK.y, ISLE_WRECK.z) || this.sim.hasFish()) this.ready = true;
    if (this.crate && this.sim.chestRolled(this.crate.x, this.crate.y, this.crate.z)) this.ready = true;
    const event = isleRoll(this.day, this.ready, this.map, this.last, this.sim.rand);
    this.today = event;
    this.placed = event == null;
    if (event) this.last = event;
  }

  private tryToday(time: number): void {
    if (!this.today || this.placed) return;
    if (this.today === 'crate' && this.placeCrate()) {
      this.placed = true;
      this.tell('A crate has washed onto the sand.');
      this.sim.note?.('crate');
    } else if (this.today === 'sharks') {
      this.spawnRing();
      this.placed = true;
      this.tell('Drowned come onto the sand.');
      this.sim.note?.('tide');
    } else if (this.today === 'map' && this.placeMap()) {
      this.placed = true;
      this.map = true;
      this.sim.note?.('map');
    } else if (this.today === 'ghost' && time >= NIGHT_START && time <= NIGHT_END && this.placeGhost()) {
      this.placed = true;
      this.crewShip();
      this.tell('A ship stands offshore. It will be gone by morning.');
      this.sim.note?.('ship');
    }
  }

  private night(time: number): void {
    const night = moonNight(this.day, time);
    if (!isleBlackMoon(this.day, time) || this.tideDay === night) return;
    this.tideDay = night;
    this.tell('The moon is black. The drowned walk onto the sand.');
    this.sim.note?.('moon');
    this.spawnBand();
  }

  private finishNight(): void {
    this.removeGhost();
    this.sim.clearDrowned(0, 0, 32);
    this.line = null;
  }

  private tell(text: string): void {
    this.line = text;
    this.sim.say(text);
  }

  private placeCrate(): boolean {
    const start = this.day % ISLE_BEACH.length;
    for (let i = 0; i < ISLE_BEACH.length; i++) {
      const [x, z] = ISLE_BEACH[(start + i) % ISLE_BEACH.length];
      const y = SEA_LEVEL + 1;
      if (this.sim.getBlock(x, y, z) !== B.AIR) continue;
      if (!this.sim.setBlock(x, y, z, chestId(0, 0))) continue;
      this.sim.noteChest(x, y, z);
      this.crate = { x, y, z };
      return true;
    }
    return false;
  }

  private placeMap(): boolean {
    const spot = this.chart();
    if (!spot) return false;
    this.sim.noteChest(spot.x, spot.y, spot.z);
    this.tell(spot.buried ? `Buried treasure is under the sand at ${spot.x}, ${spot.z}.` : `A wreck lies on the seabed at ${spot.x}, ${spot.z}.`);
    return true;
  }

  /** Places whatever of the ship is not down yet. True once every plank, log and chest is recorded. */
  private placeGhost(): boolean {
    const have = new Set(this.ghost.map((c) => `${c.x},${c.y},${c.z}`));
    for (const part of GHOST_PLAN) {
      const k = `${part.x},${part.y},${part.z}`;
      if (have.has(k)) continue;
      const was = this.sim.getBlock(part.x, part.y, part.z);
      if (was !== part.id && !this.sim.setBlock(part.x, part.y, part.z, part.id)) return false;
      this.ghost.push({ x: part.x, y: part.y, z: part.z, was, placed: part.id });
      if (isChest(part.id)) this.sim.noteChest(part.x, part.y, part.z);
    }
    return this.ghost.length >= GHOST_PLAN.length;
  }

  private crewShip(): void {
    if (this.crew || this.today !== 'ghost' || this.ghost.length < GHOST_PLAN.length) return;
    this.crew = true;
    // On the deck, beside the mast. The mast cell itself is a log, and a drowned put there stays inside it.
    if (this.sim.count('drowned', -10, 9, 8) === 0 && this.sim.getBlock(-12, SEA_LEVEL + 1, 9) === B.AIR) {
      this.sim.spawn('drowned', -11.5, SEA_LEVEL + 1, 9.5);
    }
  }

  /** Puts back only the blocks this ship placed, and only where the player has not replaced them. */
  private removeGhost(): void {
    for (const c of this.ghost) {
      this.sim.forgetChest(c.x, c.y, c.z);
      if (this.sim.getBlock(c.x, c.y, c.z) !== c.placed) continue;
      if (isChest(c.placed)) this.sim.discardChest(c.x, c.y, c.z);
      this.sim.setBlock(c.x, c.y, c.z, c.was);
    }
    this.ghost = [];
    this.crew = false;
  }

  private spawnRing(): void {
    this.spawnBand();
  }

  /** Three drowned, on empty dark sand. A chest, a log, a leaf or a torch is not a place to stand. */
  private spawnBand(): void {
    let n = 0;
    const world = { getBlock: (x: number, y: number, z: number) => this.sim.getBlock(x, y, z) };
    for (const [x, z] of ISLE_BEACH) {
      if (n >= 3) return;
      const y = SEA_LEVEL + 1;
      if (this.sim.getBlock(x, y, z) !== B.AIR || this.sim.getBlock(x, y + 1, z) !== B.AIR) continue;
      if (nearLight(world, x, y, z, 4)) continue;
      this.sim.spawn('drowned', x + 0.5, y, z + 0.5);
      n++;
    }
  }
}

interface Surface {
  y: number;
  id: number;
  biome: BiomeId;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth 0..1 noise, so the shore and the sea floor roll instead of stepping. */
function wave(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fz = fade(z - z0);
  const v = (ix: number, iz: number): number => hash2(seed, ix, iz);
  const a = v(x0, z0) + (v(x0 + 1, z0) - v(x0, z0)) * fx;
  const b = v(x0, z0 + 1) + (v(x0 + 1, z0 + 1) - v(x0, z0 + 1)) * fx;
  return a + (b - a) * fz;
}

/** The trees stand on these cells, so a knoll or the tide cannot move the ground under them. */
function trunkAt(x: number, z: number): boolean {
  return (x === 1 && z === 1) || (x === -4 && z === 3) || (x === 3 && z === -4);
}

function beachPin(x: number, z: number): boolean {
  for (const [bx, bz] of ISLE_BEACH) if (x === bx && z === bz) return true;
  return false;
}

/**
 * A round island a little larger than a few blocks, with a soft shore.
 * Past the sand the floor slopes down into a deep rolling seabed, sand then gravel and clay.
 */
function surfaceAt(seed: number, x: number, z: number): Surface {
  if ((x === 0 && z === 0) || trunkAt(x, z)) return { y: SEA_LEVEL, id: B.GRASS, biome: Biome.PLAINS };
  if (beachPin(x, z)) return { y: SEA_LEVEL, id: B.SAND, biome: Biome.BEACH };
  const dist = Math.hypot(x, z);
  const coast = LAND + (wave(seed, x / 8, z / 8) - 0.5) * 3;
  if (dist <= coast) {
    const knoll = dist > 2.8 && dist < coast - 1 && wave(seed + 17, x / 3.5, z / 3.5) > 0.78;
    return { y: SEA_LEVEL + (knoll ? 1 : 0), id: B.GRASS, biome: Biome.PLAINS };
  }
  const beach = coast + BEACH_BAND + (wave(seed + 5, x / 7, z / 7) - 0.5);
  if (dist <= beach) {
    const toe = dist > coast + BEACH_BAND * 0.55;
    return { y: toe ? SEA_LEVEL - 1 : SEA_LEVEL, id: B.SAND, biome: Biome.BEACH };
  }
  const t = Math.min(1, (dist - beach) / SLOPE);
  const smooth = t * t * (3 - 2 * t);
  const deep = SEA_LEVEL - 30 - Math.round(wave(seed + 11, x / 32, z / 32) * 16);
  const ripple = t > 0.2 ? Math.round((wave(seed + 29, x / 6, z / 6) - 0.5) * 4) : 0;
  let y = Math.round(SEA_LEVEL - 1 + (deep - (SEA_LEVEL - 1)) * smooth) + ripple;
  if (y > SEA_LEVEL - 1) y = SEA_LEVEL - 1;
  if (y < 10) y = 10;
  const n = wave(seed + 41, x / 5, z / 5);
  if (n > 0.86 && y < SEA_LEVEL - 3) return { y: Math.min(SEA_LEVEL - 2, y + 2), id: B.SANDSTONE, biome: Biome.OCEAN };
  const id = y >= SEA_LEVEL - 5 ? (n > 0.8 ? B.GRAVEL : B.SAND) : n < 0.5 ? B.SAND : n < 0.78 ? B.GRAVEL : B.CLAY;
  return { y, id, biome: Biome.OCEAN };
}

/** The flooded sea caves. A dry cave never claims one of these cells, and never sits against one. */
function seaOpenAt(seed: number, x: number, y: number, z: number): boolean {
  const a = Math.abs(wave(seed + 90, x / 7, z / 7) - 0.5);
  const b = Math.abs(wave(seed + 91, y / 4, (x + z) / 9) - 0.5);
  return a + b < 0.22;
}

/** One dry room carved in the rock. Several of them are scattered across the whole sea. */
const CAVE_CELL = 40;
const CAVE_REACH = 16;
const CAVE_DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

interface CaveLobe {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface IsleDryCave {
  lobes: readonly CaveLobe[];
  chest: { x: number; y: number; z: number };
  spawner: { x: number; y: number; z: number };
  ores: readonly { x: number; y: number; z: number; id: number }[];
}

const dryCaveCache = new Map<string, IsleDryCave | null>();

function inLobes(lobes: readonly CaveLobe[], x: number, y: number, z: number): boolean {
  for (const l of lobes) {
    const dx = (x + 0.5 - l.x) / l.rx;
    const dy = (y + 0.5 - l.y) / l.ry;
    const dz = (z + 0.5 - l.z) / l.rz;
    if (dx * dx + dy * dy + dz * dz < 1) return true;
  }
  return false;
}

/** A block the sea does not occupy. Sand and stone both hold water back. */
function solidSeal(seed: number, x: number, y: number, z: number): boolean {
  if (y <= 0 || y >= WORLD_HEIGHT) return true;
  if (y > SEA_LEVEL) return false;
  const s = surfaceAt(seed, x, z);
  if (y > s.y) return false;
  if (s.biome === Biome.OCEAN && y >= 8 && y <= s.y - 4 && seaOpenAt(seed, x, y, z)) return false;
  return true;
}

function canCarve(seed: number, x: number, y: number, z: number): boolean {
  if (y < 4 || !solidSeal(seed, x, y, z)) return false;
  const s = surfaceAt(seed, x, z);
  return y <= s.y - 5;
}

function caveOre(y: number, i: number): number {
  if (y < 16) return [B.DIAMOND_ORE, B.REDSTONE_ORE, B.GOLD_ORE, B.IRON_ORE][i % 4]!;
  if (y < 32) return [B.GOLD_ORE, B.LAPIS_ORE, B.IRON_ORE, B.COAL_ORE][i % 4]!;
  return [B.IRON_ORE, B.COAL_ORE, B.LAPIS_ORE, B.COAL_ORE][i % 4]!;
}

/** The room, its chest, its cage and four ore blocks in the wall. Null when it would touch the sea. */
function studyCave(seed: number, lobes: readonly CaveLobe[]): Pick<IsleDryCave, 'chest' | 'spawner' | 'ores'> | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const l of lobes) {
    minX = Math.min(minX, Math.floor(l.x - l.rx));
    maxX = Math.max(maxX, Math.floor(l.x + l.rx));
    minY = Math.min(minY, Math.floor(l.y - l.ry));
    maxY = Math.max(maxY, Math.floor(l.y + l.ry));
    minZ = Math.min(minZ, Math.floor(l.z - l.rz));
    maxZ = Math.max(maxZ, Math.floor(l.z + l.rz));
  }
  let n = 0;
  const shell: { x: number; y: number; z: number }[] = [];
  const seen = new Set<string>();
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (!inLobes(lobes, x, y, z)) continue;
        n++;
        if (!canCarve(seed, x, y, z)) return null;
        for (const [dx, dy, dz] of CAVE_DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (inLobes(lobes, nx, ny, nz)) continue;
          if (!solidSeal(seed, nx, ny, nz)) return null;
          if (shell.length >= 8) continue;
          const key = `${nx},${ny},${nz}`;
          if (seen.has(key)) continue;
          seen.add(key);
          shell.push({ x: nx, y: ny, z: nz });
        }
      }
    }
  }
  if (n < 16 || shell.length < 4) return null;
  const cx = Math.floor(lobes[0]!.x);
  const cz = Math.floor(lobes[0]!.z);
  let y = Math.floor(lobes[0]!.y);
  if (!inLobes(lobes, cx, y, cz)) return null;
  while (inLobes(lobes, cx, y - 1, cz)) y--;
  if (!inLobes(lobes, cx, y + 1, cz)) return null;
  let chest: { x: number; y: number; z: number } | null = null;
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]] as const) {
    const tx = cx + dx;
    const tz = cz + dz;
    if (inLobes(lobes, tx, y, tz) && inLobes(lobes, tx, y + 1, tz)) {
      chest = { x: tx, y, z: tz };
      break;
    }
  }
  if (!chest) return null;
  return {
    spawner: { x: cx, y, z: cz },
    chest,
    ores: shell.slice(0, 4).map((p, i) => ({ ...p, id: caveOre(p.y, i) })),
  };
}

function planDryCave(seed: number, gx: number, gz: number): IsleDryCave | null {
  if (hash2(seed + 510, gx, gz) < 0.3) return null;
  const x = gx * CAVE_CELL + 8 + Math.floor(hash2(seed + 511, gx, gz) * (CAVE_CELL - 16));
  const z = gz * CAVE_CELL + 8 + Math.floor(hash2(seed + 512, gx, gz) * (CAVE_CELL - 16));
  const s = surfaceAt(seed, x, z);
  const rx = 2.4 + hash2(seed + 513, gx, gz) * 1.3;
  const rz = 2.4 + hash2(seed + 514, gx, gz) * 1.3;
  const ry = 1.85;
  for (const depth of [7, 11, 15, 20, 26, 34]) {
    const cy = s.y - depth;
    if (cy < 8) continue;
    const main: CaveLobe = { x: x + 0.5, y: cy + 0.5, z: z + 0.5, rx, ry, rz };
    let lobes: CaveLobe[] = [main];
    let room: ReturnType<typeof studyCave> = null;
    if (hash2(seed + 515, gx, gz) > 0.45) {
      const side: CaveLobe = {
        x: main.x + (hash2(seed + 516, gx, gz) - 0.5) * rx * 1.5,
        y: main.y,
        z: main.z + (hash2(seed + 518, gx, gz) - 0.5) * rz * 1.5,
        rx: rx * 0.8,
        ry,
        rz: rz * 0.8,
      };
      room = studyCave(seed, [main, side]);
      if (room) lobes = [main, side];
    }
    if (!room) room = studyCave(seed, [main]);
    if (!room) continue;
    return { lobes, ...room };
  }
  return null;
}

/** The dry cave whose plot is this grid cell, or null when that plot is quiet or would open into the sea. */
export function isleDryCave(seed: number, gx: number, gz: number): IsleDryCave | null {
  const key = `${seed}:${gx}:${gz}`;
  const hit = dryCaveCache.get(key);
  if (hit !== undefined) return hit;
  const plan = planDryCave(seed, gx, gz);
  if (dryCaveCache.size > 5000) dryCaveCache.clear();
  dryCaveCache.set(key, plan);
  return plan;
}

function cavesNear(seed: number, x: number, z: number): IsleDryCave[] {
  const out: IsleDryCave[] = [];
  const gx0 = Math.floor((x - CAVE_REACH) / CAVE_CELL);
  const gx1 = Math.floor((x + CAVE_REACH) / CAVE_CELL);
  const gz0 = Math.floor((z - CAVE_REACH) / CAVE_CELL);
  const gz1 = Math.floor((z + CAVE_REACH) / CAVE_CELL);
  for (let gz = gz0; gz <= gz1; gz++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const cave = isleDryCave(seed, gx, gz);
      if (cave) out.push(cave);
    }
  }
  return out;
}

/** True when this block is air inside a dry cave. */
export function isleDryAir(seed: number, x: number, y: number, z: number): boolean {
  for (const cave of cavesNear(seed, x, z)) if (inLobes(cave.lobes, x, y, z)) return true;
  return false;
}

/** True when the dry-cave chest is this block. Its loot is the same plain ruin table as the wreck. */
export function isleCaveChest(seed: number, x: number, y: number, z: number): boolean {
  for (const cave of cavesNear(seed, x, z)) {
    if (cave.chest.x === x && cave.chest.y === y && cave.chest.z === z) return true;
  }
  return false;
}

const FLORA = [B.TALL_GRASS, B.TALL_GRASS, B.TALL_GRASS, B.FERN, B.DANDELION, B.ROSE, B.OXEYE_DAISY, B.CORNFLOWER, B.TULIP_PINK, B.TULIP_WHITE, B.AZURE_BLUET, B.BLUE_ORCHID];

export interface IsleMark {
  x: number;
  y: number;
  z: number;
}

/** A wreck on the seabed and a chest buried under the sand. Each seed puts them somewhere else. */
export function isleMarks(seed: number): { wreck: IsleMark; hoard: IsleMark } {
  const spot = (kind: 'wreck' | 'hoard'): IsleMark => {
    const ang = hash2(seed + (kind === 'wreck' ? 3 : 8), 1, 2) * Math.PI * 2;
    const dist = kind === 'wreck' ? 42 + hash2(seed + 4, 2, 3) * 70 : 20 + hash2(seed + 5, 2, 3) * 18;
    let x = Math.round(Math.cos(ang) * dist);
    let z = Math.round(Math.sin(ang) * dist);
    if (Math.hypot(x, z) < 16) {
      x = kind === 'wreck' ? 42 : 24;
      z = kind === 'wreck' ? -8 : 6;
    }
    const s = surfaceAt(seed, x, z);
    const y = kind === 'wreck' ? Math.min(WORLD_HEIGHT - 2, s.y + 1) : Math.max(2, s.y - 1);
    return { x, y, z };
  };
  return { wreck: spot('wreck'), hoard: spot('hoard') };
}

/**
 * Grass, a sand shore, trees and flowers, and ocean on every side.
 * A wreck with a chest sits offshore, close enough to see from the trees.
 */
export class IsleWorldGenerator extends WorldGenerator {
  override readonly kind = 'isle' as const;
  /** Chests the morning roll added (a crate, a buried chest, the night ship). */
  readonly chests = new Set<string>();

  noteChest(x: number, y: number, z: number): void {
    this.chests.add(`${x},${y},${z}`);
  }

  forgetChest(x: number, y: number, z: number): void {
    this.chests.delete(`${x},${y},${z}`);
  }

  override lootAt(x: number, y: number, z: number): LootTableName | null {
    const m = isleMarks(this.seed);
    const marked = (p: IsleMark) => x === p.x && y === p.y && z === p.z;
    if ((x === ISLE_WRECK.x && y === ISLE_WRECK.y && z === ISLE_WRECK.z) || marked(m.wreck) || marked(m.hoard) || this.chests.has(`${x},${y},${z}`) || isleCaveChest(this.seed, x, y, z)) return 'ruin';
    return null;
  }

  override columnAt(wx: number, wz: number): Column {
    const s = surfaceAt(this.seed, wx, wz);
    // The same climate the creative overworld uses here, so the sea is that water and not an empty colour.
    const climate = this.climateAt(wx, wz);
    return { height: s.y, biome: s.biome, t: Math.round(climate.t * 255) / 255, h: Math.round(climate.h * 255) / 255 };
  }

  override findSpawn(): { x: number; y: number; z: number } {
    return { x: 0.5, y: SEA_LEVEL + 1, z: 0.5 };
  }

  override generateChunk(cx: number, cz: number): Uint16Array {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const s = surfaceAt(this.seed, wx, wz);
        blocks[blockIndex(lx, 0, lz)] = B.BEDROCK;
        for (let y = 1; y <= s.y; y++) {
          let id: number = B.STONE;
          if (y === s.y) id = s.id;
          else if (y >= FOOT) id = s.id === B.GRASS && y >= s.y - 3 ? B.DIRT : B.SAND;
          else if (y >= s.y - 2 && s.biome === Biome.OCEAN) id = s.id === B.SANDSTONE ? B.SAND : s.id;
          else id = this.rock(y, wx, wz);
          blocks[blockIndex(lx, y, lz)] = id;
        }
        for (let y = s.y + 1; y <= SEA_LEVEL; y++) blocks[blockIndex(lx, y, lz)] = B.WATER;
        this.plant(blocks, lx, lz, wx, wz, s);
        this.seaPlants(blocks, lx, lz, wx, wz, s);
      }
    }
    // The same veins as the overworld: coal and iron through the stone, gold and diamond deeper.
    this.placeOres(blocks, cx, cz);
    this.placeBlobs(blocks, cx, cz);
    this.seaCaves(blocks, cx, cz);
    this.stampFinds(blocks, cx, cz);
    this.stampDryCaves(blocks, cx, cz);
    const stamp = (x: number, y: number, z: number, id: number, leaves: boolean): void => {
      if (y < 0 || y >= WORLD_HEIGHT || (x >> 4) !== cx || (z >> 4) !== cz) return;
      const idx = blockIndex(x & 15, y, z & 15);
      if (leaves && blocks[idx] !== B.AIR) return;
      blocks[idx] = id;
    };
    for (const b of treeBlocks(1, SEA_LEVEL + 1, 1, 5, mulberry32(this.seed ^ 0x715e), 'oak')) stamp(b.x, b.y, b.z, b.id, b.leaf);
    for (const b of treeBlocks(-4, SEA_LEVEL + 1, 3, 5, mulberry32(this.seed ^ 0x91c0), 'birch')) stamp(b.x, b.y, b.z, b.id, b.leaf);
    for (const b of treeBlocks(3, SEA_LEVEL + 1, -4, 3, mulberry32(this.seed ^ 0xa2a1), 'azalea')) stamp(b.x, b.y, b.z, b.id, b.leaf);
    for (let i = 0; i < 4; i++) {
      stamp(13 + i, SEA_LEVEL, -3, B.PLANKS, false);
      stamp(13 + i, SEA_LEVEL, -4, B.PLANKS, false);
    }
    stamp(ISLE_WRECK.x, ISLE_WRECK.y, ISLE_WRECK.z, chestId(0, 0), false);
    return blocks;
  }

  /** Grass, flowers and shore reeds. Nothing is written into the water, so the sea stays swimmable. */
  private plant(blocks: Uint16Array, lx: number, lz: number, wx: number, wz: number, s: Surface): void {
    if (s.y + 1 >= WORLD_HEIGHT) return;
    const up = blockIndex(lx, s.y + 1, lz);
    if (blocks[up] !== B.AIR) return;
    if (s.id === B.GRASS && !trunkAt(wx, wz)) {
      if (hash2(this.seed + 80, wx, wz) < 0.52) {
        blocks[up] = FLORA[Math.floor(hash2(this.seed + 81, wx, wz) * FLORA.length)]!;
      }
      return;
    }
    if (s.id !== B.SAND || s.y !== SEA_LEVEL || beachPin(wx, wz)) return;
    const h = hash2(this.seed + 90, wx, wz);
    const wet =
      surfaceAt(this.seed, wx + 1, wz).y < SEA_LEVEL ||
      surfaceAt(this.seed, wx - 1, wz).y < SEA_LEVEL ||
      surfaceAt(this.seed, wx, wz + 1).y < SEA_LEVEL ||
      surfaceAt(this.seed, wx, wz - 1).y < SEA_LEVEL;
    if (wet && h < 0.4) {
      blocks[up] = B.SUGAR_CANE;
      if (h < 0.14 && s.y + 2 < WORLD_HEIGHT) blocks[blockIndex(lx, s.y + 2, lz)] = B.SUGAR_CANE;
    } else if (h > 0.93) blocks[blockIndex(lx, s.y, lz)] = B.COBBLE;
  }

  /**
   * A little kelp, seagrass and coral. Kelp is rare, and each stalk climbs toward the surface.
   * The top block of water stays water, so the surface is unbroken and you can swim through the plants.
   */
  private seaPlants(blocks: Uint16Array, lx: number, lz: number, wx: number, wz: number, s: Surface): void {
    if (s.biome !== Biome.OCEAN || s.y >= SEA_LEVEL - 1) return;
    const floor = s.id;
    if (floor !== B.SAND && floor !== B.GRAVEL && floor !== B.CLAY && floor !== B.SANDSTONE) return;
    const depth = SEA_LEVEL - s.y;
    if (depth >= 18 && hash2(this.seed + 333, wx, wz) > 0.965) {
      blocks[blockIndex(lx, s.y + 1, lz)] = BUBBLE_BLOOM;
      return;
    }
    const kelp = isleKelpHeight(this.seed, wx, wz, depth);
    if (kelp > 0) {
      for (let k = 1; k <= kelp && s.y + k < SEA_LEVEL; k++) blocks[blockIndex(lx, s.y + k, lz)] = BB.kelp;
      return;
    }
    if (isleCoral(this.seed, wx, wz, depth)) {
      const fans = [BB.coral_fan_pink, BB.coral_fan_blue, CORAL_FAN_YELLOW, CORAL_FAN_RED];
      blocks[blockIndex(lx, s.y + 1, lz)] = fans[Math.floor(hash2(this.seed + 201, wx, wz) * fans.length)]!;
      return;
    }
    if (isleSeagrass(this.seed, wx, wz, depth)) blocks[blockIndex(lx, s.y + 1, lz)] = BB.seagrass;
  }

  /** Flooded caves under the sea floor. Every open cell is water, with bubble plants on the cave floor. */
  private seaCaves(blocks: Uint16Array, cx: number, cz: number): void {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const s = surfaceAt(this.seed, wx, wz);
        if (s.biome !== Biome.OCEAN) continue;
        const top = s.y - 4;
        for (let y = 8; y <= top; y++) {
          if (!this.seaOpen(wx, y, wz)) continue;
          const idx = blockIndex(lx, y, lz);
          if (isChest(blocks[idx]!)) continue;
          const under = y > 1 ? blocks[blockIndex(lx, y - 1, lz)]! : B.STONE;
          // Only the stone or sand under the plant. A bloom is not a floor, so two never stand one on the other.
          const floor = IS_SOLID[under] === 1;
          blocks[idx] = floor && hash2(this.seed + 77, wx, wz + y * 3) > 0.94 ? BUBBLE_BLOOM : B.WATER;
        }
      }
    }
  }

  private seaOpen(x: number, y: number, z: number): boolean {
    return seaOpenAt(this.seed, x, y, z);
  }

  /**
   * Dry caves in the rock, on a grid so the whole sea has them. Each one is carved only where stone
   * already is, and only when a solid wall stands between it and the water, so a later visit does not flood it.
   */
  private stampDryCaves(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const gx0 = Math.floor((ox - CAVE_REACH) / CAVE_CELL);
    const gx1 = Math.floor((ox + CHUNK_SIZE + CAVE_REACH) / CAVE_CELL);
    const gz0 = Math.floor((oz - CAVE_REACH) / CAVE_CELL);
    const gz1 = Math.floor((oz + CHUNK_SIZE + CAVE_REACH) / CAVE_CELL);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cave = isleDryCave(this.seed, gx, gz);
        if (cave) this.carveDryCave(blocks, cx, cz, cave);
      }
    }
  }

  private carveDryCave(blocks: Uint16Array, cx: number, cz: number, cave: IsleDryCave): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const l of cave.lobes) {
      minX = Math.min(minX, Math.floor(l.x - l.rx));
      maxX = Math.max(maxX, Math.floor(l.x + l.rx));
      minY = Math.min(minY, Math.floor(l.y - l.ry));
      maxY = Math.max(maxY, Math.floor(l.y + l.ry));
      minZ = Math.min(minZ, Math.floor(l.z - l.rz));
      maxZ = Math.max(maxZ, Math.floor(l.z + l.rz));
    }
    const x0 = Math.max(ox, minX);
    const x1 = Math.min(ox + CHUNK_SIZE - 1, maxX);
    const z0 = Math.max(oz, minZ);
    const z1 = Math.min(oz + CHUNK_SIZE - 1, maxZ);
    if (x0 > x1 || z0 > z1) return;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        for (let y = minY; y <= maxY; y++) {
          if (y < 1 || y >= WORLD_HEIGHT || !inLobes(cave.lobes, x, y, z)) continue;
          const idx = blockIndex(x & 15, y, z & 15);
          const id = blocks[idx]!;
          if (id === B.BEDROCK || id === B.WATER || id === B.AIR || isChest(id) || id === B.SPAWNER) continue;
          blocks[idx] = B.AIR;
        }
      }
    }
    const put = (x: number, y: number, z: number, id: number, air: boolean): void => {
      if ((x >> 4) !== cx || (z >> 4) !== cz || y < 1 || y >= WORLD_HEIGHT) return;
      const idx = blockIndex(x & 15, y, z & 15);
      const have = blocks[idx]!;
      if (air) {
        if (have !== B.AIR) return;
      } else if (have === B.AIR || have === B.WATER || have === B.BEDROCK || isChest(have)) return;
      blocks[idx] = id;
    };
    put(cave.spawner.x, cave.spawner.y, cave.spawner.z, B.SPAWNER, true);
    put(cave.chest.x, cave.chest.y, cave.chest.z, chestId(0, 0), true);
    for (const ore of cave.ores) put(ore.x, ore.y, ore.z, ore.id, false);
  }

  /** A seed-placed wreck on the seabed, and a chest under one block of sand. */
  private stampFinds(blocks: Uint16Array, cx: number, cz: number): void {
    const { wreck, hoard } = isleMarks(this.seed);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const x = wreck.x + dx;
        const z = wreck.z + dz;
        if ((x >> 4) !== cx || (z >> 4) !== cz || wreck.y < 1 || wreck.y >= WORLD_HEIGHT) continue;
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 1;
        blocks[blockIndex(x & 15, wreck.y, z & 15)] = dx === 0 && dz === 0 ? chestId(0, 0) : B.PLANKS;
        if (edge && wreck.y + 1 < WORLD_HEIGHT) blocks[blockIndex(x & 15, wreck.y + 1, z & 15)] = B.PLANKS;
      }
    }
    if ((hoard.x >> 4) === cx && (hoard.z >> 4) === cz && hoard.y > 0 && hoard.y < WORLD_HEIGHT) {
      const idx = blockIndex(hoard.x & 15, hoard.y, hoard.z & 15);
      const id = blocks[idx]!;
      if (id === B.SAND || id === B.GRAVEL || id === B.CLAY || id === B.SANDSTONE || id === B.STONE || id === B.DEEPSLATE) blocks[idx] = chestId(0, 0);
    }
  }
}

const SEA_FANS = new Set<number>([BB.coral_fan_pink, BB.coral_fan_blue, CORAL_FAN_YELLOW, CORAL_FAN_RED]);

/** Stalk height. Zero is open water. The patches stay rare. A stalk climbs well up toward the surface. */
function isleKelpHeight(seed: number, x: number, z: number, depth: number): number {
  if (depth < 10) return 0;
  if (hash2(seed + 160, Math.floor(x / 8), Math.floor(z / 8)) <= 0.93) return 0;
  if (hash2(seed + 120, x, z) <= 0.9) return 0;
  const cap = Math.min(12, depth - 2);
  const base = Math.min(6, cap);
  if (cap <= base) return cap;
  return base + Math.floor(hash2(seed + 161, x, z) * (cap - base + 1));
}

function isleSeagrass(seed: number, x: number, z: number, depth: number): boolean {
  if (depth < 2 || depth > 16 || isleKelpHeight(seed, x, z, depth) > 0) return false;
  return hash2(seed + 120, x, z) > 0.93;
}

function isleCoral(seed: number, x: number, z: number, depth: number): boolean {
  if (depth < 4 || depth > 22 || isleKelpHeight(seed, x, z, depth) > 0) return false;
  if (hash2(seed + 200, Math.floor(x / 9), Math.floor(z / 9)) <= 0.82) return false;
  return hash2(seed + 120, x, z) > 0.7;
}

/**
 * A saved sea that was grown as a kelp forest is cut back to the same scarce plants a new sea grows.
 * Kelp the player plants after this is left alone, because the visit that ran it is remembered.
 * Returns the chunk keys that changed.
 */
export function thinIsleSea(seed: number, chunks: Map<string, Uint16Array>): string[] {
  const changed: string[] = [];
  for (const [key, data] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    let dirty = false;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const kelp: number[] = [];
        const grass: number[] = [];
        const coral: number[] = [];
        for (let y = 1; y <= SEA_LEVEL; y++) {
          const id = data[blockIndex(lx, y, lz)]!;
          if (id === BB.kelp) kelp.push(y);
          else if (id === BB.seagrass) grass.push(y);
          else if (SEA_FANS.has(id)) coral.push(y);
        }
        if (kelp.length === 0 && grass.length === 0 && coral.length === 0) continue;
        const lowest = Math.min(...kelp, ...grass, ...coral);
        const floor = lowest - 1;
        const depth = SEA_LEVEL - floor;
        const tall = isleKelpHeight(seed, ox + lx, oz + lz, depth);
        const clear = (y: number) => {
          data[blockIndex(lx, y, lz)] = B.WATER;
          dirty = true;
        };
        for (const y of kelp) if (tall <= 0 || y <= floor || y > floor + tall) clear(y);
        if (!isleSeagrass(seed, ox + lx, oz + lz, depth)) for (const y of grass) clear(y);
        if (!isleCoral(seed, ox + lx, oz + lz, depth)) for (const y of coral) clear(y);
      }
    }
    if (dirty) changed.push(key);
  }
  return changed;
}

/** A short stalk already in a saved sea grows up to the height a new sea would give it. Water above it becomes kelp. */
export function raiseIsleKelp(seed: number, chunks: Map<string, Uint16Array>): string[] {
  const changed: string[] = [];
  for (const [key, data] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    let dirty = false;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        let floor = -1;
        for (let y = 1; y < SEA_LEVEL; y++) {
          if (data[blockIndex(lx, y, lz)] !== BB.kelp) continue;
          floor = y - 1;
          break;
        }
        if (floor < 1) continue;
        const tall = isleKelpHeight(seed, ox + lx, oz + lz, SEA_LEVEL - floor);
        for (let k = 1; k <= tall; k++) {
          const y = floor + k;
          if (y >= SEA_LEVEL) break;
          const idx = blockIndex(lx, y, lz);
          const id = data[idx]!;
          if (id === BB.kelp) continue;
          if (id !== B.WATER) break;
          data[idx] = BB.kelp;
          dirty = true;
        }
      }
    }
    if (dirty) changed.push(key);
  }
  return changed;
}

/**
 * A saved sea can have two blooms in one column, because a bloom used to count as ground for the one above it.
 * The lower plant stays. The one standing on it becomes water.
 */
export function unstackIsleBlooms(chunks: Map<string, Uint16Array>): string[] {
  const changed: string[] = [];
  const solidUnder = (x: number, y: number, z: number): boolean => {
    if (y < 1) return true;
    const data = chunks.get(`${x >> 4},${z >> 4}`);
    if (!data) return true;
    return IS_SOLID[data[blockIndex(x & 15, y, z & 15)]!] === 1;
  };
  for (const [key, data] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    let dirty = false;
    for (let y = 1; y <= SEA_LEVEL; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = blockIndex(lx, y, lz);
          if (data[idx] !== BUBBLE_BLOOM) continue;
          if (solidUnder(ox + lx, y - 1, oz + lz)) continue;
          data[idx] = B.WATER;
          dirty = true;
        }
      }
    }
    if (dirty) changed.push(key);
  }
  return changed;
}

const seaWater = (id: number): boolean => id > 0 && FLUID_KIND[id] === FLUID_WATER;

/**
 * Air left in a saved sea becomes water when it touches water. Old cave pockets and a hole dug under a bloom
 * stay empty until the island is loaded again; a dry room that does not touch the sea is left alone.
 * Returns the chunk keys that changed.
 */
export function floodIsleGaps(chunks: Map<string, Uint16Array>): string[] {
  const at = (x: number, y: number, z: number): number => {
    if (y < 1 || y > SEA_LEVEL) return B.STONE;
    const data = chunks.get(`${x >> 4},${z >> 4}`);
    if (!data) return B.STONE;
    return data[blockIndex(x & 15, y, z & 15)]!;
  };
  const queue: number[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number, z: number): void => {
    if (y < 1 || y > SEA_LEVEL) return;
    const mark = `${x},${y},${z}`;
    if (seen.has(mark)) return;
    const data = chunks.get(`${x >> 4},${z >> 4}`);
    if (!data || data[blockIndex(x & 15, y, z & 15)] !== B.AIR) return;
    seen.add(mark);
    queue.push(x, y, z);
  };
  for (const [key, data] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx;
        const z = oz + lz;
        for (let y = 1; y <= SEA_LEVEL; y++) {
          if (data[blockIndex(lx, y, lz)] !== B.AIR) continue;
          if (
            seaWater(at(x + 1, y, z)) ||
            seaWater(at(x - 1, y, z)) ||
            seaWater(at(x, y + 1, z)) ||
            seaWater(at(x, y - 1, z)) ||
            seaWater(at(x, y, z + 1)) ||
            seaWater(at(x, y, z - 1))
          ) {
            push(x, y, z);
          }
        }
      }
    }
  }
  const changed = new Set<string>();
  for (let i = 0; i < queue.length; i += 3) {
    const x = queue[i]!;
    const y = queue[i + 1]!;
    const z = queue[i + 2]!;
    const key = `${x >> 4},${z >> 4}`;
    const data = chunks.get(key);
    if (!data) continue;
    const idx = blockIndex(x & 15, y, z & 15);
    if (data[idx] !== B.AIR) continue;
    data[idx] = B.WATER;
    changed.add(key);
    push(x + 1, y, z);
    push(x - 1, y, z);
    push(x, y + 1, z);
    push(x, y - 1, z);
    push(x, y, z + 1);
    push(x, y, z - 1);
  }
  return [...changed];
}
