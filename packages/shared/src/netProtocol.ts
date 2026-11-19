import { cleanPlayerName, parseLookCode } from './look';
import type { MobKind } from './mobs';
import type { VehicleKind } from './vehicles';
import type { MenuKind } from './menu';
import type { Offer, Profession } from './trading';
import type { SaveMode } from './save';
import type { WorldKind } from './squareWorld';
import type { WeatherKind } from './weather';
import { cleanCamera, parseSessionMessage, type ClassView, type Command, type SessionEvent, type SessionScreen } from './sessionProtocol';
import { isClassId, type ClassId } from './classes';
import type { Fx } from './abilityEffects';
import type { GearRoll } from './gear';
import { isSocialAction, type ChatChannel, type SocialAction, type SocialView } from './social';

/**
 * Multiplayer messages (JSON for now; a packed binary format is a later optimisation). The server
 * owns the world. A client sends its inputs and commands, and receives snapshots of what it can see.
 *
 * Flow: `hello` -> `welcome` (all connections, also used for the status line) then
 * `join` -> `joined` + `edits...` + a stream of `snap`, `blocks`, `events` and `chat`.
 */

export const MAX_INPUTS_PER_MESSAGE = 8;
export const MAX_CHAT_LENGTH = 200;
export const MAX_NAME_LENGTH = 24;

/** One fixed physics step of input. The server runs exactly one step per input. */
export interface NetInput {
  /** Increases by one with every input; echoed back as `ack`. */
  seq: number;
  yaw: number;
  pitch: number;
  /** Third person: where the camera is, see InputFrame.cam. */
  cam?: [number, number, number];
  forward: number;
  strafe: number;
  jump: boolean;
  sprint: boolean;
  sneak: boolean;
  left: boolean;
  right: boolean;
}

export type NetClientMessage =
  /** `look` is a `lookCode`; accounts use the one saved with them instead. */
  | { t: 'join'; name: string; look?: number; class?: ClassId }
  | { t: 'input'; frames: NetInput[] }
  | { t: 'cmd'; c: Command }
  | { t: 'chat'; text: string }
  /** The social window asks for its lists (friends, ignored, who is online). */
  | { t: 'social' }
  | { t: 'socialAct'; a: SocialAction; name: string }
  /** Look at another player: their class, level and what they wear. */
  | { t: 'inspect'; name: string }
  /** A guild action as the words of the command (kick ann, create Name TAG): the same ones /guild takes. */
  | { t: 'guild'; line: string }
  /** One step of a trade between players (see playerTrade.ts). */
  | { t: 'trade'; act: TradeAct }
  | { t: 'leave' };

/** What a player does in a trade: ask somebody, answer a request, work the table, accept, call it off. */
export type TradeAct =
  | { a: 'ask'; name: string }
  | { a: 'accept' }
  | { a: 'decline' }
  /** Put the stack in an inventory slot on the table (count: how many of it; all when left out). */
  | { a: 'put'; slot: number; count?: number }
  | { a: 'take'; i: number }
  | { a: 'coins'; n: number }
  | { a: 'ready'; on: boolean }
  | { a: 'cancel' };

/** One side of the table. */
export interface TradeSideView {
  offers: { slot: number; item: ItemView }[];
  coins: number;
  ready: boolean;
}

/** The trade you are in: who with, and both sides of the table. */
export interface TradeView {
  with: string;
  cls?: ClassId;
  level?: number;
  mine: TradeSideView;
  theirs: TradeSideView;
}

export interface ItemView {
  id: number;
  count: number;
  damage: number;
  /** Enchantments [id, level][] (left out when there are none). */
  e?: [number, number][];
  /** A name given at an anvil, and its prior-work penalty (left out when there are none). */
  n?: string;
  r?: number;
  /** What a piece of found gear rolled (left out for plain items). */
  g?: GearRoll;
}

/** What another player has on, as the inspect window shows it (null: nothing in the slot; the order is INSPECT_SLOTS). */
export interface InspectView {
  name: string;
  cls?: ClassId;
  level?: number;
  items: (ItemView | null)[];
}

/** The player's own authoritative state. */
export interface SelfView {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  inWater: boolean;
  eyeInWater: boolean;
  flying: boolean;
  mode: SaveMode;
  selected: number;
  screen: SessionScreen;
  health: number;
  hunger: number;
  saturation: number;
  air: number;
  dead: boolean;
  /** Seconds of the Poison status effect left. Left out when there is none. */
  poison?: number;
  /** Seconds of the Hunger sickness status effect left. Left out when there is none. */
  foodSick?: number;
  /** Experience level, and how full the bar is (0..1). */
  level: number;
  xpProgress: number;
  /** Coins carried. */
  coins: number;
  /** Defense points of the worn armor (0..20). */
  defense: number;
  deathMessage: string | null;
  /** Targeted block, mining progress (0..1), action-bar progress, bow draw. */
  target: { x: number; y: number; z: number; id: number } | null;
  breakProgress: number;
  hudProgress: number;
  bowDraw: number;
  /** The off-hand item (a shield) and whether it is raised. */
  offhand: ItemView | null;
  /** The mount slot: the horn of the mount the mount key summons. */
  mountSlot: ItemView | null;
  blocking: boolean;
  /** How far into a meal you are (0..1), left out while not eating. */
  eat?: number;
  /** How far into the Emberstone's cast you are (0..1), left out while not casting it. */
  emb?: number;
  /** The crosshair is on someone to talk to (a villager or a quest giver); left out otherwise. */
  talk?: 1;
  /** On fire: the HUD shows flames. */
  burning: boolean;
  /** Lying in a bed: 0 = awake, else 1 + the way the bed points (see BED_DIRS). */
  sleeping: number;
  /** The id of the minecart or boat you sit in (0 = on foot): the body then follows the vehicle, so the client stops predicting. */
  riding: number;
  /** The mount you ride: 0 = none, else 1 + its place in MOUNTS. The client predicts with its speed and sees through its saddle. */
  mount?: number;
  /** Seconds until the mount's two skills are ready again (left button, right button); sent while mounted. */
  mountCd?: [number, number];
  /** The class state, for a character that has a class (left out otherwise). */
  cls?: ClassView;
}

export interface MenuView {
  kind: MenuKind;
  /** Contents of every slot, in menu order. */
  slots: (ItemView | null)[];
  cursor: ItemView | null;
  furnace: { burn: number; cook: number } | null;
  /** A villager's trade list, while the trade screen is open. */
  trade?: { profession: Profession; level: number; xp: number; offers: Offer[]; selected: number } | null;
  /** The enchanting table: bookshelves around it and the three offers (cost and a hint of one enchantment). */
  enchant?: { shelves: number; offers: { cost: number; clue: [number, number] | null }[] } | null;
  /** The anvil: what the job costs in levels and whether it is more than an anvil will do. */
  anvil?: { cost: number; tooExpensive: boolean; name: string | null } | null;
  /** The grindstone: the most experience taking the result would give. */
  grindstone?: { xp: number } | null;
  /** The crafting grid: the crafting at work (how long it takes, and how many crafts of a recipe; 0 sets is the forge), and whether what was made waits in the result slot. */
  craft?: { forging: { duration: number; sets: number } | null; made: boolean } | null;
}

/** Sent when inventory or menu contents changed. */
export interface InventoryView {
  /** Every inventory slot: the hotbar, the backpack, then the room of the bags (see bags.ts). */
  slots: (ItemView | null)[];
  /** The bags worn, one per bag slot. */
  bags: (ItemView | null)[];
  /** The worn armor (helmet, chestplate, leggings, boots): without it the client would only know them while the inventory is open. */
  armor?: (ItemView | null)[];
  menu: MenuView | null;
}

export interface PlayerView {
  id: number;
  name: string;
  /** What they look like (a `lookCode`). */
  look: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  sneaking: boolean;
  onGround: boolean;
  /** Item in hand (0 = empty). */
  held: number;
  /** Worn armor item ids: helmet, chestplate, leggings, boots (0 = none). */
  armor: number[];
  /** Off-hand item id (0 = empty) and whether the shield is raised. */
  offhand: number;
  blocking: boolean;
  /** Eating (left out otherwise). */
  ea?: 1;
  /** Dead (left out otherwise): the figure has come apart and is not drawn until they are back. */
  dd?: 1;
  /** Seconds since the arm swung (a blow, a block placed or being mined), sent only while the swing is on screen. */
  sw?: number;
  /** A Ground Slam: 1 crouching, 2 in the air, 3 down on the shield after the blow (left out otherwise). */
  sl?: number;
  /** Seconds since a Shield Bash was thrown, sent only while the figure is still drawn in it (left out otherwise). */
  bs?: number;
  /** Charging: running at a Charge (left out otherwise). */
  rs?: 1;
  /** Casting the Emberstone: how far into the cast (0..1), left out otherwise. */
  em?: number;
  /** Lying in a bed: 0 = awake, else 1 + the way the bed points (see BED_DIRS). */
  sleeping: number;
  /** Their class and class level, for a character that has one. */
  cls?: ClassId;
  clv?: number;
  /** The tag of their guild (left out when they are in none). */
  gt?: string;
  /** The mount they ride (1 + its place in MOUNTS), left out when on foot. */
  mt?: number;
}

export interface MobView {
  id: number;
  kind: MobKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  walk: number;
  speed: number;
  hurt: number;
  dead: boolean;
  deathTime: number;
  burning: boolean;
  fuse: number;
  /** Seconds since its melee swing, sent only while the swing is on screen (so it never costs a byte at rest). */
  atk?: number;
  /** Slime size (1, 2, 4). */
  size: number;
  /** Coat variant (rabbits). */
  variant: number;
  /** Young (half size), shorn (sheep) and in love (hearts): sent only when true. */
  baby?: 1;
  sheared?: 1;
  love?: 1;
  /** An armor stand: helmet, chestplate, leggings, boots and the item in its hand. 0 is empty. Left out for every other mob. */
  gear?: number[];
}

export interface ArrowView {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** A thrown bottle o' enchanting (drawn as a bottle rather than an arrow). */
  b?: 1;
  /** A thrown ender pearl. */
  p?: 1;
  /** A spell (1 fireball, 2 the spellbook's arcane bolt, 3 the wand's and 4 the staff's bolt of cubes). */
  s?: number;
}

/** A minecart or boat: where it is, which way it points, how fast it goes and whether somebody sits in it. */
export interface VehicleView {
  id: number;
  kind: VehicleKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  /** Seconds since it was hit (it shakes while this is small). */
  hurt: number;
  rider: boolean;
}

export interface DropView {
  id: number;
  item: number;
  count: number;
  damage: number;
  /** An anvil name and enchantments, when it has any: the label above the item on the ground tells them. */
  name?: string;
  ench?: [number, number][];
  /** The stats of a piece of found gear: its label on the ground shows the rarity. */
  g?: GearRoll;
  x: number;
  y: number;
  z: number;
  age: number;
  phase: number;
}

/** An experience orb near the player. */
export interface XpOrbView {
  id: number;
  /** What it is worth (the size it is drawn at follows from this). */
  v: number;
  x: number;
  y: number;
  z: number;
  age: number;
  phase: number;
}

/** A fishing bobber near the player: where the float is, what the line is doing (a `BobberMode`), and whose it is. */
export interface BobberView {
  id: number;
  /** The id of the player that cast it. */
  o: number;
  x: number;
  y: number;
  z: number;
  m: number;
  /** Set on the viewer's own bobber (the client does not know its own id). */
  own?: 1;
}

export interface Snapshot {
  t: 'snap';
  tick: number;
  /** Highest input `seq` the server has applied for this player. */
  ack: number;
  time: number;
  weather: { kind: WeatherKind; rain: number; storm: number; flash: number };
  you: SelfView;
  inv?: InventoryView;
  players: PlayerView[];
  mobs: MobView[];
  arrows: ArrowView[];
  vehicles: VehicleView[];
  drops: DropView[];
  /** Food on campfires near you, packed `x, y, z` and four item ids (0 is an empty place). Left out when none are near. */
  fires?: number[];
  /** Experience orbs near the player (left out when there are none). */
  orbs?: XpOrbView[];
  /** Fishing bobbers near the player (left out when there are none). */
  bobbers?: BobberView[];
  /** Ability effects near the player (left out when there are none). Each has an id that does not repeat, so a client plays one once. */
  fx?: Fx[];
  /** Effects that are still on, and as they were last sent (a real connection is sent an effect in full once: the client keeps it until its id is not listed). */
  fxKeep?: number[];
  /** Players far away that are not in players this time: the client keeps them as they were (they are updated every few snapshots). */
  keep?: number[];
}

/** Edits to the generated terrain: `[x, y, z, id, ...]`. */
export type BlockEdits = number[];

export type NetServerMessage =
  | { t: 'joined'; id: number; name: string; look?: number; seed: number; kind?: WorldKind; tickHz: number; time: number }
  /** A batch of the world's edits (sent in pieces right after joining). `last` ends the batch. */
  | { t: 'edits'; blocks: BlockEdits; last: boolean }
  | { t: 'blocks'; blocks: BlockEdits }
  | Snapshot
  | { t: 'events'; events: SessionEvent[] }
  /** ch says where it was said (absent: say); a whisper names who it is to when it is yours. */
  | { t: 'chat'; from: string; text: string; ch?: ChatChannel; to?: string }
  | { t: 'social'; view: SocialView }
  | { t: 'inspected'; name: string; view: InspectView | null }
  /** Your trade: it opens, changes, and closes (null). */
  | { t: 'trade'; view: TradeView | null }
  /** Somebody asks you to trade (null: the request is over). */
  | { t: 'tradeAsk'; from: string | null }
  | { t: 'notice'; text: string }
  | { t: 'kicked'; reason: string };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function parseNetInput(raw: unknown): NetInput | null {
  if (!isObject(raw)) return null;
  const { seq, yaw, pitch, forward, strafe } = raw;
  if (!fin(seq) || !Number.isInteger(seq) || seq < 0 || seq > 2 ** 31) return null;
  if (!fin(yaw) || !fin(pitch) || !fin(forward) || !fin(strafe)) return null;
  for (const k of ['jump', 'sprint', 'sneak', 'left', 'right'] as const) if (typeof raw[k] !== 'boolean') return null;
  return {
    seq,
    yaw: ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
    pitch: clamp(pitch, -Math.PI / 2, Math.PI / 2),
    ...cleanCamera(raw.cam),
    forward: clamp(forward, -1, 1),
    strafe: clamp(strafe, -1, 1),
    jump: raw.jump as boolean,
    sprint: raw.sprint as boolean,
    sneak: raw.sneak as boolean,
    left: raw.left as boolean,
    right: raw.right as boolean,
  };
}

const whole = (x: unknown, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max;

function parseTradeAct(raw: unknown): TradeAct | null {
  if (!isObject(raw)) return null;
  switch (raw.a) {
    case 'ask': {
      if (typeof raw.name !== 'string') return null;
      const name = cleanPlayerName(raw.name);
      return name ? { a: 'ask', name } : null;
    }
    case 'accept':
    case 'decline':
    case 'cancel':
      return { a: raw.a };
    case 'put':
      if (!whole(raw.slot, 255)) return null;
      if (raw.count === undefined) return { a: 'put', slot: raw.slot };
      return whole(raw.count, 64) && raw.count > 0 ? { a: 'put', slot: raw.slot, count: raw.count } : null;
    case 'take':
      return whole(raw.i, 15) ? { a: 'take', i: raw.i } : null;
    case 'coins':
      return whole(raw.n, 999_999_999) ? { a: 'coins', n: raw.n } : null;
    case 'ready':
      return typeof raw.on === 'boolean' ? { a: 'ready', on: raw.on } : null;
    default:
      return null;
  }
}

/** Validate anything a client sends once connected. Returns null for malformed messages. */
export function parseNetClientMessage(raw: unknown): NetClientMessage | null {
  if (!isObject(raw)) return null;
  switch (raw.t) {
    case 'join': {
      if (typeof raw.name !== 'string') return null;
      // Printable characters only, trimmed and capped.
      const name = raw.name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, MAX_NAME_LENGTH);
      const look = parseLookCode(raw.look) ? (raw.look as number) : undefined;
      const cls = isClassId(raw.class) ? raw.class : undefined;
      return { t: 'join', name: name || 'player', ...(look !== undefined ? { look } : {}), ...(cls ? { class: cls } : {}) };
    }
    case 'input': {
      if (!Array.isArray(raw.frames) || raw.frames.length === 0 || raw.frames.length > MAX_INPUTS_PER_MESSAGE) return null;
      const frames: NetInput[] = [];
      for (const f of raw.frames) {
        const p = parseNetInput(f);
        if (!p) return null;
        frames.push(p);
      }
      return { t: 'input', frames };
    }
    case 'cmd': {
      const c = parseSessionMessage(raw.c);
      return c && c.t !== 'frame' ? { t: 'cmd', c } : null;
    }
    case 'chat': {
      if (typeof raw.text !== 'string') return null;
      // Drop control characters; empty messages are not messages.
      const text = raw.text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT_LENGTH);
      return text ? { t: 'chat', text } : null;
    }
    case 'social':
      return { t: 'social' };
    case 'socialAct': {
      if (!isSocialAction(raw.a) || typeof raw.name !== 'string') return null;
      const name = cleanPlayerName(raw.name);
      return name ? { t: 'socialAct', a: raw.a, name } : null;
    }
    case 'inspect': {
      if (typeof raw.name !== 'string') return null;
      const name = cleanPlayerName(raw.name);
      return name ? { t: 'inspect', name } : null;
    }
    case 'guild': {
      if (typeof raw.line !== 'string') return null;
      const line = raw.line.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT_LENGTH);
      return line ? { t: 'guild', line } : null;
    }
    case 'trade': {
      const act = parseTradeAct(raw.act);
      return act ? { t: 'trade', act } : null;
    }
    case 'leave':
      return { t: 'leave' };
    default:
      return null;
  }
}
