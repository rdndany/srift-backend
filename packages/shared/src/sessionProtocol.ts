import { ABILITY_SLOTS, type AbilityId } from './abilities';
import { AUCTION_CATEGORIES, AUCTION_HOURS, AUCTION_SORTS, cleanQuery, type AuctionCommand, type AuctionHours, type AuctionView } from './auction';
import type { SoundKind } from './blocks';
import type { BountyTier, BountyView } from './bounties';
import { STASH_MAX_SLOTS, type StashCommand, type StashView } from './stash';
import { MAX_POINTS, ATTR_KEYS, type AttrKey } from './statPoints';
import type { ClassId } from './classes';
import { isCreativeAmount, validGearSpec, type CreativeAmount, type GearSpec } from './creative';
import type { GearRoll } from './gear';
import type { MenuKind } from './menu';
import type { MobKind } from './mobs';
import type { MountId } from './mounts';
import type { QuestLogJSON } from './quests';
import type { SaveMode } from './save';

/**
 * Messages between a game client and a `GameSession`. Plain JSON-safe data, so they can cross a
 * loopback link in single-player today and a WebSocket in multiplayer (Phase 3.5). Everything a
 * session receives is untrusted: it goes through `parseSessionMessage` first.
 */

/** One frame of player input. The session turns it into movement and interaction. */
export interface InputFrame {
  t: 'frame';
  /** Seconds since the previous frame (clamped to `MAX_FRAME_DT`). */
  dt: number;
  /** The mouse is captured: the player is in control. Without it the world idles. */
  locked: boolean;
  yaw: number;
  pitch: number;
  /**
   * Third person: where the camera is (x, y, z), looking along yaw and pitch. What the crosshair is on is then what the player aims
   * at (see `aimThroughCrosshair`). Left out in first person, where the eyes are the camera.
   */
  cam?: [number, number, number];
  /** -1..1 */
  forward: number;
  /** -1..1, right positive */
  strafe: number;
  jump: boolean;
  sprint: boolean;
  sneak: boolean;
  /** Primary button: attack, mine. */
  left: boolean;
  /** Secondary button: use, place, eat, draw the bow. */
  right: boolean;
}

export const MAX_FRAME_DT = 0.1;

/** Discrete things the player does. Applied in order, before the frame that follows them. */
export type Command =
  | { t: 'select'; slot: number }
  | { t: 'scroll'; delta: number }
  | { t: 'mode'; mode: SaveMode }
  | { t: 'fly' }
  | { t: 'home' }
  | { t: 'inventory' }
  | { t: 'closeMenu' }
  | { t: 'drop'; all: boolean }
  /** Let go of the stack held on the cursor outside the open screen: all of it, or one. */
  | { t: 'dropCursor'; all: boolean }
  /** Throw the stack held on the cursor in the trash of the open screen: it is gone for good (all of it, or one). */
  | { t: 'destroyCursor'; all: boolean }
  | { t: 'click'; slot: number; button: 0 | 1 }
  | { t: 'shift'; slot: number }
  /** The Organize button of the inventory: merge and sort the backpack and each worn bag (not the hotbar). */
  | { t: 'organize' }
  /** Recipe book: fill the crafting grid with recipe `index` (all = as many crafts as fit). */
  | { t: 'recipe'; index: number; all: boolean }
  /** Craft what is in the grid with the button: the forge for a piece with its jewels, a recipe otherwise (`all`: as many as the grid has the items for). */
  | { t: 'forge'; all?: boolean }
  /** Creative inventory: how many a click on the palette hands out. */
  | { t: 'creativeAmount'; n: CreativeAmount }
  /** Creative inventory: empty the inventory. */
  | { t: 'creativeClear' }
  /** Creative inventory: make a piece of gear with the forge and put it on the cursor. */
  | { t: 'creativeGear'; spec: GearSpec }
  /** Trading: choose offer index of the villager you are talking to. */
  | { t: 'trade'; index: number }
  /** The Runic Altar: inscribe glyph `id` on the piece in it (a rank up if it has it), or take it off (`erase`). */
  | { t: 'enchant'; id: number; erase?: boolean }
  /** Anvil: the name typed in the box (null puts the item's own name back). */
  | { t: 'anvilName'; name: string | null }
  /** Swap the held item with the off hand (a shield, in practice). */
  | { t: 'swap' }
  /** Get out of the bed you are sleeping in. */
  | { t: 'wake' }
  | { t: 'respawn' }
  /** Quests: take one up or hand one in (while talking to the NPC who gives or takes it), or give one up. */
  | { t: 'quest'; a: 'accept' | 'complete' | 'abandon'; id: string }
  /** At a merchant: buy `n` times the ware at stock index `i`, or sell `n` of the item in inventory slot `i`. */
  | { t: 'shop'; a: 'buy' | 'sell'; i: number; n: number }
  /** At the Auctioneer: search the house, put an item up, bid, buy out, take an auction down, collect mail (see auction.ts). */
  | ({ t: 'auction' } & AuctionCommand)
  /** At the Stashkeeper: put an item of the inventory into the wallet's stash, or take one out (see stash.ts). */
  | ({ t: 'stash' } & StashCommand)
  /** The party (see party.ts): invite a player, answer an invitation, leave, remove a member or hand over the lead. */
  | { t: 'party'; a: PartyAction; name?: string }
  /** Use the ability on a button of the ability bar (0..3). Only the button: what it does, to what and for how much is the server's to decide. */
  | { t: 'ability'; slot: number }
  /** The mount key: get off the mount you ride, or begin summoning the one whose horn is in the mount slot. */
  | { t: 'mount' }
  /** Spend `n` of the stat points a level gives on a stat (see statPoints.ts), or take them all back to spend again. */
  | { t: 'stat'; stat: AttrKey; n: number }
  | { t: 'statReset' };

/** What a class player's interface needs to know about their class (sent with every snapshot, so a cooldown on the bar is the server's). */
export interface ClassView {
  id: ClassId;
  level: number;
  /** Points towards the next level, what the level needs (0 at the cap) and the fraction of the way (0..1). */
  xp: number;
  xpNext: number;
  xpProgress: number;
  resource: number;
  maxResource: number;
  maxHealth: number;
  /** Movement speed multiplier (the client uses it when predicting its own steps). */
  speedMul: number;
  /** The four buttons in order: seconds left on the cooldown, and whether the ability has been learned (from its skill book). */
  abilities: { id: AbilityId; cd: number; unlocked: boolean }[];
  /** Temporary defenses: seconds left of damage reduction, damage left in the absorb shield, seconds left of immunity. */
  guard: number;
  shield: number;
  immune: number;
  /** Stat points: spent on Strength, Agility, Vitality and Energy, and how many are left to spend. */
  pts: [number, number, number, number];
  free: number;
  /** Charging: which way (a yaw) and how fast. The client's own prediction runs the same way until it is over. */
  rush?: { yaw: number; speed: number; roll?: boolean };
  /** A Ground Slam: 1 crouching, 2 in the air, 3 down on the shield after the blow. Left out when none. */
  slam?: number;
}

export type PartyAction = 'invite' | 'accept' | 'decline' | 'leave' | 'kick' | 'leader';
export const PARTY_ACTIONS: readonly PartyAction[] = ['invite', 'accept', 'decline', 'leave', 'kick', 'leader'];

/** One member of the party, as the interface shows it. */
export interface PartyMemberView {
  name: string;
  lead: boolean;
  /** This member is the player the view is for. */
  you: boolean;
  /** Health, 0 to 20. */
  hp: number;
  level: number;
}

export type SessionMessage = InputFrame | Command;

export type MobSound = 'say' | 'hurt' | 'death' | 'hiss' | 'shoot' | 'teleport' | 'yes' | 'no';

/** What a boss fight makes a sound of (see the `bossFx` event) and the spells a boss may wind up. */
export type BossFxKind = 'wake' | 'cast' | 'release' | 'phase' | 'down' | 'step' | 'swing';
export type BossSpell = 'slam' | 'pillars' | 'court' | 'rain' | 'unbound';
/** A `bossFx` event without its tag: what a boss's script hands the realm to send. */
export type BossFx = Omit<Extract<SessionEvent, { t: 'bossFx' }>, 't'>;

/** What happened, for the client to show and hear. The session never touches graphics or audio. */
export type SessionEvent =
  /** Inventory, menu or furnace contents changed: re-read them. */
  | { t: 'inv' }
  | { t: 'toast'; text: string }
  /** An achievement was won (the client finds its text in the shared list by `id`). `reward` is the tier's name. */
  | { t: 'achievement'; id: string; name: string; tier: 'bronze' | 'silver' | 'gold' | 'mythic'; reward: string }
  /** A dungeon was cleared with this player in range (its last boss fell). The server decides what, if anything, that pays. */
  | { t: 'clear'; id: string; name: string }
  /** A daily bounty was finished. The server decides what, if anything, that pays (`day` is the UTC day it was posted for). */
  | { t: 'bounty'; id: string; name: string; tier: BountyTier; day: number }
  /** Today's three bounties and how far along each is, whole (sent when the character joins, now and then as it progresses, and when the day turns). */
  | { t: 'bounties'; view: BountyView }
  /** The achievement counts and the ids won, whole (sent when the character joins and when one is won). */
  | { t: 'ach'; view: { stats: Record<string, number>; done: string[] } }
  /** A boss speaks (yell, in its own voice) or the fight is announced (warn): shown across the screen to everybody in its room. */
  | { t: 'boss'; text: string; kind: 'yell' | 'warn' }
  /** A rift: it is tearing open (`omen`), opens, sends the next wave, is sealed or collapses. Shown across the screen, with its own sound; `grade` colours it. */
  | { t: 'rift'; what: 'omen' | 'open' | 'wave' | 'sealed' | 'collapsed'; grade: 'uncommon' | 'rare' | 'epic'; text: string }
  /**
   * The sound of a boss fight, for everybody in the copy (the client works the loudness out from where it stands). `wake`: he rises; `cast`: `spell` begins to wind up (`seconds` long); `release`: it lands (at x,y,z);
   * `phase`: the next phase (`phase`) begins; `down`: he has fallen; `step`: a stride; `swing`: a melee blow.
   */
  | { t: 'bossFx'; what: BossFxKind; spell?: BossSpell; phase?: number; seconds?: number; x?: number; y?: number; z?: number }
  | { t: 'sound'; sound: SoundKind; action: 'break' | 'place' | 'step' | 'hit' | 'land' | 'jump'; vol: number; x?: number; y?: number; z?: number }
  /** Chips of a block's own texture. `soft` is the short puff of placing one; without it, the block has broken. */
  | { t: 'burst'; id: number; x: number; y: number; z: number; count: number; soft?: boolean }
  /** A chest lid opened or shut. Everyone near hears it. */
  | { t: 'chest'; open: boolean; x: number; y: number; z: number }
  | { t: 'splash'; vol: number }
  /** Fishing, where x,y,z is: a cast, the bobber landing in the water, a fish taking notice (bubbles) and biting (the bobber is pulled under), getting away, a reel-in, and a catch coming out of the water. Everyone near sees and hears it. */
  | { t: 'fish'; what: 'cast' | 'splash' | 'lure' | 'bite' | 'escape' | 'reel' | 'catch'; x: number; y: number; z: number }
  /** Fire sounds: lighting one (flint and steel), the crackle of burning, the hiss of rain or water putting it out. */
  | { t: 'fire'; kind: 'ignite' | 'crackle' | 'hiss'; vol: number }
  | { t: 'eat' }
  | { t: 'pop' }
  /** Something was picked up off the ground: how many (`count`), how many of it the bag holds now (`total`), its name if it has one and its enchantments if it has any. */
  | { t: 'pickup'; id: number; count: number; total: number; name?: string; ench?: [number, number][]; gear?: GearRoll }
  /** Experience came to you (gain points, when known): there are no orbs, it is simply yours. */
  | { t: 'xp'; gain?: number }
  /** Coins came in (a kill, a quest, a sale). */
  | { t: 'coins'; gain: number }
  /** A purchase or a sale went through. */
  | { t: 'shop'; what: 'buy' | 'sell' }
  /** What the Auction House window shows (sent when it opens and after everything done there). */
  | { t: 'auction'; view: AuctionView }
  /** What the stash window shows (sent when it opens and after everything done there). */
  | { t: 'stash'; view: StashView }
  | { t: 'equip' }
  /** Something was enchanted at the altar (`glyph` and its new `rank`, `fail` when the roll failed, or `erase` for one taken off) or repaired at the anvil. */
  | { t: 'enchant'; anvil?: boolean; glyph?: number; rank?: number; erase?: boolean; fail?: boolean }
  | { t: 'levelup'; level: number }
  /** The class level went up (abilities do not come with it: they are learned from skill books). */
  | { t: 'classlevel'; level: number }
  /** A jewel was used on a piece of equipment (ok: it worked, else it shattered or withered). */
  | { t: 'jewel'; ok: boolean; kind: 'dawn' | 'rift' | 'bloom'; slot: number; label: string; detail: string }
  /** The crafting in the grid started (`craft`: a recipe, otherwise the forge past +9): the animation and its sounds begin. */
  | { t: 'forgeStart'; craft: boolean }
  /** A recipe was crafted: the result is in the result slot (`slot`), with what it is floated above it. */
  | { t: 'crafted'; slot: number; label: string; detail: string }
  /** A monster near you let a jewel fall (a sound of its own; `vol` 0..1 falls off with the distance). */
  | { t: 'jewelDrop'; kind: 'dawn' | 'rift' | 'bloom'; vol: number }
  /** A skill book was read and the ability is now known. */
  | { t: 'learned'; ability: AbilityId }
  /** An ability was cast (the button, for the sound and the swing); a refused one is a toast instead. */
  | { t: 'cast'; slot: number }
  | { t: 'hurt' }
  /** A number to float up where damage was done: by this player to a mob (`x,y,z` is the mob), or to this player (`taken`; `guarded`: a guard ability was cutting it down). */
  /** `arrow`: it was an arrow that did it; `head`: a headshot; `blade`: a dagger stab; `combo`: the last of a dagger's three quick stabs. */
  | { t: 'dmg'; x: number; y: number; z: number; amount: number; crit?: boolean; total?: number; taken?: boolean; guarded?: boolean; head?: boolean; arrow?: boolean; blade?: boolean; combo?: boolean }
  | { t: 'thunder'; distance: number }
  | { t: 'explode'; vol: number }
  | { t: 'mob'; kind: MobKind; sound: MobSound; vol: number; x?: number; y?: number; z?: number }
  /** A staff, wand or spellbook was cast (the sound of the weapon; the bolt and its burst are drawn from the world). */
  | { t: 'spell'; weapon: 'wand' | 'staff' | 'spellbook'; vol: number }
  /** The hand swung (`off`: the off hand did, a dagger stabbing while a bow is in the main hand). */
  /** The arm swings (`rate`: how much faster than the usual swing, for the attack speed of a weapon in the hand; left out at 1). */
  | { t: 'swing'; off?: boolean; rate?: number }
  /** A shield took a hit (`broke`: it was the last one). */
  | { t: 'shield'; vol: number; broke?: boolean; parry?: boolean }
  /** Your shield stopped a hit: a plain block, or a parry (the hit came just as the guard went up, so the shield took no wear). */
  | { t: 'guard'; what: 'block' | 'parry' | 'dodge' }
  /** The Emberstone: someone began to cast it where x,y,z is (start), lost the cast (stop), vanished from there (depart) or appeared there (arrive). Everyone near sees and hears it. */
  | { t: 'ember'; what: 'start' | 'stop' | 'depart' | 'arrive'; x: number; y: number; z: number }
  | { t: 'died' }
  /** Places the map should mark: where your party members are (those in the same place as you). Sent when it changes. */
  | { t: 'pins'; party: { name: string; x: number; z: number }[] }
  | { t: 'respawned' }
  /** The player's quest log (all of it; sent when it changes and when they join). Adventure mode only. */
  | { t: 'quests'; log: QuestLogJSON }
  /** The conversation with a quest giver (an id of NPCS) opened; null: it closed. */
  | { t: 'dialog'; npc: string | null }
  /** A mount: someone began to summon it where x,y,z is (start), lost the cast (stop), got on (on) or got off (off). Everyone near sees and hears it. bite, howl: the rider used a skill of the mount (x,y,z: the body; yaw: the way it faces). What the skills leave in the world (the bite's fangs, the lightning of the howl) comes as marks (`Fx`). */
  | { t: 'mount'; what: 'start' | 'stop' | 'on' | 'off' | 'bite' | 'howl'; id: MountId; x: number; y: number; z: number; yaw?: number }
  /** The player walked into a named place (an id of ZONES). */
  | { t: 'zone'; id: string }
  /** What a quest did: it was taken up, a step moved or was finished, it can be handed in, it was handed in. */
  | { t: 'quest'; what: 'accept' | 'step' | 'ready' | 'done'; text: string }
  /** Your party (empty when you are alone) and who is inviting you, if anyone. Sent whenever either changes. */
  | { t: 'party'; members: PartyMemberView[]; invite: string | null };

export type SessionScreen = 'none' | MenuKind | 'dead' | 'dialog';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The camera of a frame (three finite numbers), or nothing: a malformed one is left out rather than failing the whole frame. */
export function cleanCamera(raw: unknown): { cam?: [number, number, number] } {
  if (!Array.isArray(raw) || raw.length !== 3) return {};
  const [x, y, z] = raw;
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e7;
  return ok(x) && ok(y) && ok(z) ? { cam: [x, y, z] } : {};
}

const whole = (x: unknown, lo: number, hi: number): number | null => {
  const v = num(x);
  return v !== null && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
};

/** The Auction House's commands: every number a whole one in range, every word one of the known ones. */
function parseAuction(raw: Record<string, unknown>): Command | null {
  switch (raw.a) {
    case 'search': {
      if (typeof raw.q !== 'string' || raw.q.length > 80 || !AUCTION_CATEGORIES.some((c) => c.id === raw.cat) || !AUCTION_SORTS.includes(raw.sort as never) || typeof raw.desc !== 'boolean') return null;
      const page = whole(raw.page, 0, 9999);
      if (page === null) return null;
      const q = cleanQuery({ q: raw.q, cat: raw.cat as never, sort: raw.sort as never, desc: raw.desc, page });
      return { t: 'auction', a: 'search', ...q };
    }
    case 'post': {
      const slot = whole(raw.slot, 0, 1023);
      const count = whole(raw.count, 1, 64);
      const bid = whole(raw.bid, 1, 999_999_999);
      const buyout = whole(raw.buyout, 0, 999_999_999);
      if (slot === null || count === null || bid === null || buyout === null || !AUCTION_HOURS.includes(raw.hours as AuctionHours)) return null;
      if (raw.token !== undefined && typeof raw.token !== 'boolean') return null;
      return { t: 'auction', a: 'post', slot, count, bid, buyout, hours: raw.hours as AuctionHours, ...(raw.token === true ? { token: true } : {}) };
    }
    case 'bid': {
      const id = whole(raw.id, 1, 1e9);
      const amount = whole(raw.amount, 1, 999_999_999);
      return id !== null && amount !== null ? { t: 'auction', a: 'bid', id, amount } : null;
    }
    case 'buyout':
    case 'cancel': {
      const id = whole(raw.id, 1, 1e9);
      return id !== null ? { t: 'auction', a: raw.a, id } : null;
    }
    case 'take': {
      const id = whole(raw.id, 0, 1e9);
      return id !== null ? { t: 'auction', a: 'take', id } : null;
    }
    default:
      return null;
  }
}

/**
 * Validate and normalise anything a client sends. Returns null for anything malformed. Numbers are
 * clamped to sane ranges, so a hostile client cannot feed NaN, huge steps or fractional slots in.
 */
export function parseSessionMessage(raw: unknown): SessionMessage | null {
  if (!isObject(raw)) return null;
  switch (raw.t) {
    case 'frame': {
      const dt = num(raw.dt);
      const yaw = num(raw.yaw);
      const pitch = num(raw.pitch);
      const forward = num(raw.forward);
      const strafe = num(raw.strafe);
      if (dt === null || yaw === null || pitch === null || forward === null || strafe === null) return null;
      for (const k of ['locked', 'jump', 'sprint', 'sneak', 'left', 'right'] as const) if (typeof raw[k] !== 'boolean') return null;
      return {
        t: 'frame',
        dt: clamp(dt, 0, MAX_FRAME_DT),
        locked: raw.locked as boolean,
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
    case 'select': {
      const slot = num(raw.slot);
      return slot !== null && Number.isInteger(slot) && slot >= 0 && slot < 9 ? { t: 'select', slot } : null;
    }
    case 'scroll': {
      const delta = num(raw.delta);
      return delta !== null && Number.isInteger(delta) && Math.abs(delta) <= 64 ? { t: 'scroll', delta } : null;
    }
    case 'mode':
      return raw.mode === 'survival' || raw.mode === 'creative' ? { t: 'mode', mode: raw.mode } : null;
    case 'fly':
    case 'home':
    case 'inventory':
    case 'closeMenu':
    case 'respawn':
    case 'swap':
    case 'organize':
    case 'wake':
      return { t: raw.t };
    case 'forge':
      return { t: 'forge', all: raw.all === true };
    case 'creativeClear':
      return { t: 'creativeClear' };
    case 'creativeAmount':
      return isCreativeAmount(raw.n) ? { t: 'creativeAmount', n: raw.n } : null;
    case 'creativeGear': {
      const s = raw.spec as Record<string, unknown> | null;
      if (!s || typeof s !== 'object') return null;
      const spec = { id: s.id, rarity: s.rarity, level: s.level, cls: s.cls ?? null, plus: s.plus, bloom: s.bloom } as GearSpec;
      return validGearSpec(spec) ? { t: 'creativeGear', spec } : null;
    }
    case 'drop':
      return typeof raw.all === 'boolean' ? { t: 'drop', all: raw.all } : null;
    case 'dropCursor':
      return typeof raw.all === 'boolean' ? { t: 'dropCursor', all: raw.all } : null;
    case 'destroyCursor':
      return typeof raw.all === 'boolean' ? { t: 'destroyCursor', all: raw.all } : null;
    case 'click': {
      const slot = num(raw.slot);
      if (slot === null || !Number.isInteger(slot) || slot < 0 || slot > 1023) return null;
      return raw.button === 0 || raw.button === 1 ? { t: 'click', slot, button: raw.button } : null;
    }
    case 'shift': {
      const slot = num(raw.slot);
      return slot !== null && Number.isInteger(slot) && slot >= 0 && slot <= 1023 ? { t: 'shift', slot } : null;
    }
    case 'trade': {
      const index = num(raw.index);
      return index !== null && Number.isInteger(index) && index >= 0 && index < 64 ? { t: 'trade', index } : null;
    }
    case 'anvilName':
      if (raw.name === null) return { t: 'anvilName', name: null };
      return typeof raw.name === 'string' ? { t: 'anvilName', name: raw.name.slice(0, 64) } : null;
    case 'enchant': {
      const id = num(raw.id);
      if (id === null || !Number.isInteger(id) || id < 1 || id > 255) return null;
      return raw.erase === true ? { t: 'enchant', id, erase: true } : { t: 'enchant', id };
    }
    case 'recipe': {
      const index = num(raw.index);
      if (index === null || !Number.isInteger(index) || index < 0 || index > 4095 || typeof raw.all !== 'boolean') return null;
      return { t: 'recipe', index, all: raw.all };
    }
    case 'quest': {
      const id = raw.id;
      const a = raw.a;
      if (a !== 'accept' && a !== 'complete' && a !== 'abandon') return null;
      return typeof id === 'string' && id.length > 0 && id.length <= 48 ? { t: 'quest', a, id } : null;
    }
    case 'shop': {
      const i = num(raw.i);
      const n = num(raw.n);
      if ((raw.a !== 'buy' && raw.a !== 'sell') || i === null || n === null || !Number.isInteger(i) || !Number.isInteger(n) || i < 0 || i > 255 || n < 1 || n > 64) return null;
      return { t: 'shop', a: raw.a, i, n };
    }
    case 'auction':
      return parseAuction(raw);
    case 'stash': {
      const count = whole(raw.count, 1, 64);
      if (count === null) return null;
      if (raw.a === 'put') {
        const slot = whole(raw.slot, 0, 255);
        return slot === null ? null : { t: 'stash', a: 'put', slot, count };
      }
      if (raw.a === 'take') {
        const slot = whole(raw.slot, 0, STASH_MAX_SLOTS - 1);
        return slot === null ? null : { t: 'stash', a: 'take', slot, count };
      }
      return null;
    }
    case 'ability': {
      const slot = num(raw.slot);
      return slot !== null && Number.isInteger(slot) && slot >= 0 && slot < ABILITY_SLOTS ? { t: 'ability', slot } : null;
    }
    case 'mount':
      return { t: 'mount' };
    case 'stat': {
      const stat = ATTR_KEYS.find((x) => x === raw.stat);
      const n = whole(raw.n, 1, MAX_POINTS);
      return stat && n !== null ? { t: 'stat', stat, n } : null;
    }
    case 'statReset':
      return { t: 'statReset' };
    case 'party': {
      const a = PARTY_ACTIONS.find((x) => x === raw.a);
      if (!a) return null;
      const name = raw.name;
      if (name === undefined) return { t: 'party', a };
      return typeof name === 'string' && name.length <= 32 ? { t: 'party', a, name } : null;
    }
    default:
      return null;
  }
}
