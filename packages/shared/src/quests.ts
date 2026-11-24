import type { RGB } from './biomeColors';
import { isClassId, type ClassId } from './classes';
import type { MobKind } from './mobs';
import { outpostById } from './outposts';
import { STORY_QUESTS } from './storyQuests';

/**
 * Quests, for the Adventure game mode: who gives them, what they ask for and what they pay, and a
 * `QuestLog` that keeps one player's progress.
 *
 * The content here is plain data. The log is a small state machine that the game feeds with what the
 * player does (a mob killed, an item crafted, a block mined...), so it has no idea about the world and
 * is easy to test. The server runs the authoritative log (it is saved with the player); a client keeps a
 * read-only copy, sent whenever it changes, to draw the quest log, the tracker and the markers over the
 * quest givers.
 *
 * The chain is meant to teach the whole game: the first quests are the very basics (wood, a workbench,
 * stone tools, a furnace), then hunting and cooking, then the first dungeon. Later expansions add chapters.
 */

/** What a quest asks for. `count` is how many times (1 for `enter`). */
export type Objective =
  /** Have this many of the items on you (the count follows the inventory, like a WoW quest item). */
  | { kind: 'collect'; items: readonly number[]; count: number; label: string }
  /** Take this many of the items out of a crafting grid. */
  | { kind: 'craft'; items: readonly number[]; count: number; label: string }
  /** Take this many things out of a furnace (any, when `items` is left out). */
  | { kind: 'smelt'; items?: readonly number[]; count: number; label: string }
  /** Kill this many of the mobs (any of the kinds listed counts). */
  | { kind: 'kill'; mobs: readonly MobKind[]; count: number; label: string }
  /** Break this many of the blocks. */
  | { kind: 'mine'; blocks: readonly number[]; count: number; label: string }
  /** Place this many of the blocks. */
  | { kind: 'place'; blocks: readonly number[]; count: number; label: string }
  /** Walk into a named place (see `ZONES`). */
  | { kind: 'enter'; zone: string; count: 1; label: string };

export interface ItemReward {
  id: number;
  count: number;
}

export interface QuestReward {
  xp: number;
  /** Coins paid on top; left out, a quest pays twice its experience (see `rewardCoins`). */
  coins?: number;
  items: readonly ItemReward[];
  /** Extra items that depend on the class of whoever hands the quest in (a skill book of their own class). */
  classItems?: Partial<Record<ClassId, readonly ItemReward[]>>;
}

/** The first quest of every new Adventure character: they wake in the Undercroft, the cave under the village of Ashbrook, and are sent up into the village. */
export const FIRST_QUEST = 'ms00';

/** The coins a quest pays. */
export const rewardCoins = (r: QuestReward): number => r.coins ?? r.xp * 2;

/** Every item a quest hands over to a character of this class (null: no class): the plain rewards, then the class's own. */
export const rewardItems = (r: QuestReward, classId: ClassId | null): readonly ItemReward[] => (classId && r.classItems?.[classId] ? [...r.items, ...r.classItems[classId]!] : r.items);

export interface QuestDef {
  id: string;
  name: string;
  /** The chapter it belongs to, for the log. */
  chapter: string;
  /** Only a character of this class is offered it (the class lines); left out, everybody is. */
  class?: ClassId;
  /** The NPC who gives it, and the one who takes it in (the same one, mostly). */
  giver: string;
  turnIn: string;
  /** Quests that must be handed in first. */
  requires: readonly string[];
  /** One line for the tracker. */
  summary: string;
  /** What the giver says when you are offered it, while you are at it, and when you hand it in. */
  offer: string;
  progress: string;
  complete: string;
  objectives: readonly Objective[];
  /** Handed over the moment the quest is taken up (the key to a place the quest sends you to). */
  give?: readonly ItemReward[];
  reward: QuestReward;
}

/** A person of the hub, standing at a fixed place. Their index in `NPCS` is the mob's `variant`. */
export interface NpcDef {
  id: string;
  name: string;
  title: string;
  /** Where they stand (the height is the hub's ground, or the floor of the Undercroft for `cellar`) and which way they look when nobody is near: yaw 0 looks toward -z. */
  x: number;
  z: number;
  yaw: number;
  /** Stands in the cave under the village, not on its ground. */
  cellar?: boolean;
  /** Stands in a dungeon, one for every copy of it: x and z are where they stand in the first copy, and the others are the same place shifted (see NpcStation.key). */
  dungeon?: boolean;
  /** Stands in an outpost of the story (see `OUTPOSTS`) and not in Dawnwatch: x and z are then measured from the outpost's middle. */
  place?: string;
  /** Keeps a stash: talking to them opens the wallet's Stash (see stash.ts). Every village and town has one such person. */
  stash?: boolean;
  /** What they say when you have no quest business with them. */
  greeting: string;
  /** How they are drawn. */
  look: { robe: RGB; trim: RGB; hair: RGB; hat: 'none' | 'hood' | 'cap' | 'helm' | 'wide'; beard: boolean };
}

/** An NPC and the spot it stands on in a world (the generator knows the height of the ground there). */
export interface NpcStation {
  npc: NpcDef;
  index: number;
  /** What tells this station from the others of the same person (a dungeon has one for every copy). Left out: the index. */
  key?: number;
  x: number;
  y: number;
  z: number;
}

/** A training dummy's spot in a world (the generator knows the height of the ground there). */
export interface DummyStation {
  index: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  sub: string;
}

/** Named places, shown as a banner when the player walks into one. */
export const ZONES: readonly ZoneDef[] = [
  { id: 'ashbrook', name: 'Ashbrook', sub: 'A small village at the edge of the Whisperwood' },
  { id: 'dawnwatch', name: 'Dawnwatch', sub: 'The walled city at the edge of the Rift' },
  { id: 'greykeep', name: 'Greykeep', sub: 'A castle that has held out for three hundred years' },
  { id: 'whisper_clearing', name: 'The Clearing', sub: 'Where the Whisperwood gave you back' },
  { id: 'reedhollow', name: 'Reedhollow', sub: 'A village on stilts in the marsh' },
  { id: 'sandmere', name: 'Sandmere', sub: 'A caravan village on the edge of the dunes' },
  { id: 'frostgate', name: 'Frostgate', sub: 'A walled village in the snow' },
  { id: 'highmarket', name: 'Highmarket', sub: 'The walled town of the Warden houses' },
  { id: 'undercroft', name: 'The Undercroft', sub: 'The old storm cellars under Ashbrook' },
  { id: 'training_yard', name: 'Training Yard', sub: 'Hit the dummies to test your damage and abilities' },
  { id: 'hollow_cellar', name: 'The Hollow Cellar', sub: 'Dungeon' },
  { id: 'reed_grotto', name: 'The Reed Grotto', sub: 'Cold water under the marsh' },
  { id: 'sand_crypt', name: 'The Sand Crypt', sub: 'Bones in the dry dark' },
  { id: 'frost_vault', name: 'The Frost Vault', sub: 'Ice that does not melt' },
  { id: 'chapel_ruin', name: 'The Chapel Ruin', sub: 'Where the gravel road ends' },
  // The caves of the ordinary worlds (shown as a banner when you walk into one; see `caveKindAt`).
  { id: 'lush_cave', name: 'Lush Cave', sub: 'Moss, vines and glowing berries' },
  { id: 'dripstone_cave', name: 'Dripstone Cave', sub: 'Stalactites and stalagmites' },
  { id: 'deep_dark', name: 'The Deep Dark', sub: 'Nothing grows here but sculk' },
];

export const zoneDef = (id: string): ZoneDef | null => ZONES.find((z) => z.id === id) ?? null;

const BASE_NPCS: readonly NpcDef[] = [
  {
    id: 'maren',
    name: 'Elder Maren',
    title: 'Village Elder',
    x: 2.5,
    z: -10.5,
    yaw: Math.PI,
    greeting: 'The Rift has been quiet for years. Quiet is how it likes us. Walk softly, traveller, and learn the land.',
    look: { robe: [92, 58, 128], trim: [226, 190, 70], hair: [226, 226, 230], hat: 'none', beard: true },
  },
  {
    id: 'brannoc',
    name: 'Smith Brannoc',
    title: 'Master Craftsman',
    place: 'ashbrook',
    x: 9.5,
    z: -3.5,
    yaw: Math.PI,
    greeting: 'Hands make everything, friend. A table, a pick, a fire. The rest is just more of the same, done harder.',
    look: { robe: [70, 66, 62], trim: [150, 90, 50], hair: [110, 52, 28], hat: 'cap', beard: true },
  },
  {
    id: 'isolde',
    name: 'Ranger Isolde',
    title: 'Warden of the Wilds',
    place: 'ashbrook',
    x: -9.5,
    z: -3.5,
    yaw: Math.PI,
    greeting: 'Keep your bow close and your back to a wall after dark. The things that come out of the Rift do not knock.',
    look: { robe: [56, 112, 70], trim: [120, 84, 48], hair: [150, 96, 44], hat: 'hood', beard: false },
  },
  {
    id: 'varro',
    name: 'Captain Varro',
    title: 'Captain of the Watch',
    x: 28.5,
    z: -2.5,
    yaw: Math.PI / 2,
    greeting: 'The Watch holds the road. Whatever is under the old cellar is not going to hold itself.',
    look: { robe: [58, 82, 150], trim: [214, 214, 220], hair: [60, 44, 36], hat: 'helm', beard: false },
  },
  // The merchants, one trade each (see `SHOPS`). They stand behind the counters of the market stalls.
  {
    id: 'tobin',
    name: 'Merchant Tobin',
    title: 'General Goods',
    x: 19.5,
    z: 4.5,
    yaw: 0,
    greeting: 'Bread, torches, a pick. Anything the road asks for, I have on this table. Sell me what you have dragged out of the dark.',
    look: { robe: [150, 100, 40], trim: [236, 204, 84], hair: [96, 62, 30], hat: 'cap', beard: false },
  },
  {
    id: 'hilda',
    name: 'Hilda Ironwall',
    title: 'Armorer',
    x: -19.5,
    z: 4.5,
    yaw: 0,
    greeting: 'Leather for the quick, iron for the stubborn. Whatever you choose, wear all four pieces.',
    look: { robe: [96, 98, 108], trim: [196, 196, 206], hair: [150, 62, 30], hat: 'helm', beard: false },
  },
  {
    id: 'garrick',
    name: 'Garrick Bladesworn',
    title: 'Weaponsmith',
    x: 17.5,
    z: -5.5,
    yaw: Math.PI,
    greeting: 'Swords, daggers, and a greatsword for those who like to end an argument in one swing.',
    look: { robe: [122, 38, 30], trim: [206, 164, 62], hair: [34, 26, 24], hat: 'none', beard: true },
  },
  {
    id: 'fenna',
    name: 'Fenna Longbow',
    title: 'Ranger Quartermaster',
    x: 26.5,
    z: 4.5,
    yaw: 0,
    greeting: 'A bow, a quiver and a clear line. The best fights are the ones that never reach you.',
    look: { robe: [74, 102, 52], trim: [156, 124, 62], hair: [204, 172, 82], hat: 'hood', beard: false },
  },
  {
    id: 'lysa',
    name: 'Lysa Moonweaver',
    title: 'Arcanist',
    x: -25.5,
    z: 4.5,
    yaw: 0,
    greeting: 'The Rift hums for those who listen. Wands, staves, and the small things the old magic is made of.',
    look: { robe: [46, 52, 124], trim: [144, 204, 244], hair: [222, 222, 236], hat: 'wide', beard: false },
  },
  // The people of Ashbrook, the small village where everyone starts (x and z are measured from its plaza, see outposts.ts): the healer of the Undercroft, the cave under it, and its reeve.
  {
    id: 'mirel',
    name: 'Healer Mirel',
    title: 'Keeper of the Undercroft',
    place: 'ashbrook',
    x: 2.5,
    z: 12.5,
    yaw: -Math.PI / 2,
    cellar: true,
    greeting: 'Rest while you can. The stair at the west end of the cave climbs up into Ashbrook, whenever you are ready for the light.',
    look: { robe: [196, 188, 160], trim: [92, 140, 96], hair: [120, 72, 40], hat: 'hood', beard: false },
  },
  {
    id: 'edda',
    name: 'Reeve Edda',
    title: 'Reeve of Ashbrook',
    place: 'ashbrook',
    x: 2.5,
    z: -3.5,
    yaw: Math.PI,
    greeting: 'Ashbrook is small, and we like it so. Mind the fields, mind the dark, and come to me if you need work.',
    look: { robe: [104, 116, 70], trim: [214, 190, 110], hair: [186, 176, 164], hat: 'hood', beard: false },
  },
  // The Auctioneer of the market square (see auction.ts: his id is `AUCTIONEER`). He stands behind the counter of the stall in the south-east corner.
  {
    id: 'auctioneer',
    name: 'Auctioneer Corvin',
    title: 'Auction House',
    x: 27.5,
    z: 18.5,
    yaw: 0,
    greeting: 'Going once, going twice! Put what you do not need up for bids, and take home what you do. The house keeps only its small cut.',
    look: { robe: [128, 30, 40], trim: [236, 196, 70], hair: [52, 38, 30], hat: 'wide', beard: true },
  },
  // The Stashkeeper of the market square (see stash.ts: his id is `STASHKEEPER`). He stands behind the counter of the stall in the north of the square.
  {
    id: 'stashkeeper',
    stash: true,
    name: 'Stashkeeper Bram',
    title: 'The Stash',
    x: 19.5,
    z: 12.5,
    yaw: Math.PI,
    greeting: 'Anything you leave with me waits for you, and for any other hero on your wallet. Leave a wand as a mage and your warrior can pick it up. Nobody else gets near it.',
    look: { robe: [76, 60, 38], trim: [196, 150, 60], hair: [150, 150, 150], hat: 'cap', beard: true },
  },
  // The Warden of the Hollow Cellar: he stands just inside the portal of every copy (`dungeon`), and gives and takes in the quests that send you down.
  {
    id: 'hale',
    name: 'Warden Hale',
    title: 'Warden of the Hollow Cellar',
    x: 4108.5,
    z: 4189.5,
    yaw: Math.PI / 2,
    dungeon: true,
    greeting: 'Keep your voice down and your torch up. Whatever is awake in here does not need much of a reason.',
    look: { robe: [70, 84, 110], trim: [196, 172, 96], hair: [120, 112, 104], hat: 'helm', beard: true },
  },
  // More people of the story: the farmer and the cook of Ashbrook, and the sister of the chapel road.
  {
    id: 'wick',
    name: 'Farmer Wick',
    title: 'Keeper of the Fields',
    place: 'ashbrook',
    x: -22.5,
    z: -4.5,
    yaw: 0,
    greeting: 'Seeds in the soil, patience in the arms, and a hat against the sun. That is all a farm is.',
    look: { robe: [120,92,50], trim: [196,170,90], hair: [110,80,50], hat: 'wide', beard: false },
  },
  {
    id: 'nell',
    name: 'Nell Hearthwood',
    title: 'Innkeeper',
    place: 'ashbrook',
    x: 11.5,
    z: 2.5,
    yaw: 0,
    greeting: 'Sit, sit. There is stew, and there is more stew. Nobody leaves my fire hungry.',
    look: { robe: [150,60,50], trim: [240,220,190], hair: [90,50,30], hat: 'none', beard: false },
  },
  {
    id: 'ilse',
    name: 'Sister Ilse',
    title: 'Keeper of the Chapel Road',
    x: 30.5,
    z: -4.5,
    yaw: 1.5707963267948966,
    greeting: 'The road east is long, and the dead are patient. Walk it with respect.',
    look: { robe: [220,220,226], trim: [120,120,160], hair: [60,50,44], hat: 'hood', beard: false },
  },
  // The outposts: x and z are measured from the middle of each (see outposts.ts).
  {
    id: 'tamsin',
    name: 'Headwoman Tamsin',
    title: 'Headwoman of Reedhollow',
    place: 'reedhollow',
    x: 2.5,
    z: -3.5,
    yaw: 3.141592653589793,
    greeting: 'The water is wrong, and the reeds know it. Mind your feet on the planks.',
    look: { robe: [70,110,90], trim: [190,210,140], hair: [120,120,110], hat: 'none', beard: false },
  },
  {
    id: 'dunstan',
    name: 'Dunstan the Fisher',
    title: 'Fisher of Reedhollow',
    place: 'reedhollow',
    x: -4.5,
    z: 2.5,
    yaw: 0,
    greeting: 'Patience, friend. The marsh gives to those who wait, and takes from those who hurry.',
    look: { robe: [90,100,70], trim: [170,150,100], hair: [140,110,70], hat: 'wide', beard: true },
  },
  {
    id: 'idris',
    name: 'Caravan-master Idris',
    title: 'Caravan-master of Sandmere',
    place: 'sandmere',
    x: 2.5,
    z: -3.5,
    yaw: 3.141592653589793,
    greeting: 'A guest brings water, and a friend brings news. Which are you?',
    look: { robe: [200,150,70], trim: [250,230,170], hair: [50,40,36], hat: 'wide', beard: true },
  },
  {
    id: 'oska',
    name: 'Delver Oska',
    title: 'Delver of Sandmere',
    place: 'sandmere',
    x: -4.5,
    z: 2.5,
    yaw: 0,
    greeting: 'The old shafts run under the dunes for miles. I know them all, and I do not go down them alone.',
    look: { robe: [150,110,80], trim: [210,190,150], hair: [90,60,40], hat: 'cap', beard: false },
  },
  {
    id: 'halvard',
    name: 'Warden Halvard',
    title: 'Warden of Frostgate',
    place: 'frostgate',
    x: 2.5,
    z: -3.5,
    yaw: 3.141592653589793,
    greeting: 'Frostgate stands because we stand. Warm yourself, and then tell me what you want.',
    look: { robe: [90,110,150], trim: [220,230,240], hair: [200,200,200], hat: 'helm', beard: true },
  },
  {
    id: 'sigrun',
    name: 'Hunter Sigrun',
    title: 'Hunter of Frostgate',
    place: 'frostgate',
    x: -4.5,
    z: 2.5,
    yaw: 0,
    greeting: 'Winter feeds the hungry and starves the proud. I hunt for the gate. What do you hunt for?',
    look: { robe: [120,130,140], trim: [200,210,220], hair: [170,130,80], hat: 'hood', beard: false },
  },
  {
    id: 'thessaly',
    name: 'Burgomaster Thessaly',
    title: 'Burgomaster of Highmarket',
    place: 'highmarket',
    x: 2.5,
    z: -3.5,
    yaw: 3.141592653589793,
    greeting: 'The Warden houses built this town to remember. I mean to make sure it does.',
    look: { robe: [120,50,80], trim: [230,200,120], hair: [180,170,170], hat: 'none', beard: false },
  },
  {
    id: 'vael',
    name: 'Enchantress Vael',
    title: 'Enchantress',
    place: 'highmarket',
    x: -4.5,
    z: 2.5,
    yaw: 0,
    greeting: 'Every piece of gear can be more than it is. The trick is knowing how far it will bend.',
    look: { robe: [60,60,140], trim: [170,140,230], hair: [70,40,90], hat: 'hood', beard: false },
  },
  {
    id: 'ivo',
    name: 'Skywright Ivo',
    title: 'Skywright',
    place: 'highmarket',
    x: 8.5,
    z: 2.5,
    yaw: 0,
    greeting: 'Wings are only frames and promises. I make both, and I am very good at one of them.',
    look: { robe: [140,110,60], trim: [230,200,120], hair: [60,60,60], hat: 'cap', beard: true },
  },
  {
    id: 'aldren',
    name: 'Castellan Aldren',
    title: 'Castellan of Greykeep',
    place: 'greykeep',
    x: 2.5,
    z: -3.5,
    yaw: 3.141592653589793,
    greeting: 'Greykeep has not fallen in three hundred years. I do not intend to be the one to let it.',
    look: { robe: [80,80,90], trim: [200,200,210], hair: [190,190,190], hat: 'helm', beard: true },
  },
  // The stashkeepers of the villages and towns: each stands at the end of the workshop of the place (see WORKSHOPS in outposts.ts), and opens the same wallet stash as Bram in Dawnwatch.
  {
    id: 'stash_ashbrook',
    stash: true,
    name: 'Cellarer Odo',
    title: 'The Stash',
    place: 'ashbrook',
    x: 22.5,
    z: -14.5,
    yaw: Math.PI,
    greeting: 'Leave it with me and it keeps. Ashbrook has stored its grain and its secrets in the dark for a hundred years; your things will be no trouble.',
    look: { robe: [110, 86, 60], trim: [210, 180, 110], hair: [160, 150, 140], hat: 'cap', beard: true },
  },
  {
    id: 'stash_reedhollow',
    stash: true,
    name: 'Netkeeper Brin',
    title: 'The Stash',
    place: 'reedhollow',
    x: 12.5,
    z: 13.5,
    yaw: 0,
    greeting: 'Everything dries in the end, if it is stored right. Put your things on the high shelf, away from the water.',
    look: { robe: [80, 104, 84], trim: [180, 200, 130], hair: [110, 90, 60], hat: 'wide', beard: false },
  },
  {
    id: 'stash_sandmere',
    stash: true,
    name: 'Warehouser Zahir',
    title: 'The Stash',
    place: 'sandmere',
    x: 12.5,
    z: 13.5,
    yaw: 0,
    greeting: 'Under the sand it is cool and nothing spoils. Give me what you cannot carry, and take it back at any gate of the land.',
    look: { robe: [196, 156, 84], trim: [244, 226, 170], hair: [40, 32, 30], hat: 'wide', beard: true },
  },
  {
    id: 'stash_frostgate',
    stash: true,
    name: 'Tallyman Ketil',
    title: 'The Stash',
    place: 'frostgate',
    x: 12.5,
    z: 13.5,
    yaw: 0,
    greeting: 'Winter is long. A wise traveller leaves a little behind for the thaw, and I count every piece.',
    look: { robe: [100, 116, 150], trim: [214, 224, 238], hair: [190, 190, 196], hat: 'hood', beard: true },
  },
  {
    id: 'stash_highmarket',
    stash: true,
    name: 'Vaultkeeper Orsolya',
    title: 'The Stash',
    place: 'highmarket',
    x: 16.5,
    z: -14.5,
    yaw: Math.PI,
    greeting: 'The Warden houses kept their wealth in vaults, and so does Highmarket. Your things share a vault with your other heroes, and with nobody else.',
    look: { robe: [110, 56, 86], trim: [226, 196, 120], hair: [70, 50, 60], hat: 'none', beard: false },
  },
  {
    id: 'stash_greykeep',
    stash: true,
    name: 'Quartermaster Hadrian',
    title: 'The Stash',
    place: 'greykeep',
    x: 12.5,
    z: 13.5,
    yaw: 0,
    greeting: 'The keep has stores for a three-year siege. There is room in them for a spare blade.',
    look: { robe: [86, 88, 98], trim: [196, 196, 208], hair: [150, 150, 150], hat: 'helm', beard: true },
  },
];

/** The people of the outposts are written with x and z from the middle of their place; here they are put where they stand in the world. */
export const NPCS: readonly NpcDef[] = BASE_NPCS.map((n) => {
  const o = n.place ? outpostById(n.place) : null;
  return o ? { ...n, x: n.x + o.x, z: n.z + o.z } : n;
});

export const npcById = (id: string): NpcDef | null => NPCS.find((n) => n.id === id) ?? null;

/** Every quest of the game: the story of the Adventure world (see storyQuests.ts and docs/adventure). */
export const QUESTS: readonly QuestDef[] = STORY_QUESTS;

const questMap = new Map(QUESTS.map((q) => [q.id, q]));
export const questById = (id: string): QuestDef | null => questMap.get(id) ?? null;

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';

/** What happened to one objective, so the game can say so ("Zombies slain: 2/4"). */
export interface QuestProgress {
  quest: QuestDef;
  index: number;
  now: number;
  count: number;
  /** This step is complete, and the whole quest is ready to hand in. */
  stepDone: boolean;
  ready: boolean;
}

export interface QuestLogJSON {
  /** Quests handed in. */
  d: string[];
  /** Quests under way, with each objective's progress. */
  a: [string, number[]][];
  /** The class of whoever keeps the log (for the class lines). */
  c?: ClassId;
}

/** The things the game tells the log about. */
export type QuestEvent =
  | { t: 'kill'; mob: MobKind }
  | { t: 'craft'; item: number; count: number }
  | { t: 'smelt'; item: number; count: number }
  | { t: 'mine'; block: number }
  | { t: 'place'; block: number }
  | { t: 'enter'; zone: string };

const MAX_ACTIVE = 15;

/** One player's quests. */
export class QuestLog {
  readonly done = new Set<string>();
  readonly active = new Map<string, number[]>();

  constructor(private readonly defs: ReadonlyMap<string, QuestDef> = questMap) {}

  get empty(): boolean {
    return this.done.size === 0 && this.active.size === 0;
  }

  /** The class of whoever keeps this log (the class lines are only offered to their own class). Set by the player, or by the client that draws a copy of the log. */
  classId: ClassId | null = null;

  status(id: string): QuestStatus {
    const q = this.defs.get(id);
    if (!q) return 'locked';
    if (this.done.has(id)) return 'done';
    if (q.class && q.class !== this.classId && !this.active.has(id)) return 'locked';
    const p = this.active.get(id);
    if (p) return this.isComplete(q, p) ? 'ready' : 'active';
    return q.requires.every((r) => this.done.has(r)) ? 'available' : 'locked';
  }

  private isComplete(q: QuestDef, p: readonly number[]): boolean {
    return q.objectives.every((o, i) => (p[i] ?? 0) >= o.count);
  }

  /** The numbers behind an active quest's objectives. */
  progressOf(id: string): readonly number[] {
    return this.active.get(id) ?? [];
  }

  /** Quests this NPC can give you right now. */
  offeredBy(npc: string): QuestDef[] {
    return [...this.defs.values()].filter((q) => q.giver === npc && this.status(q.id) === 'available');
  }

  /** Quests this NPC takes in right now. */
  readyFor(npc: string): QuestDef[] {
    return [...this.defs.values()].filter((q) => q.turnIn === npc && this.status(q.id) === 'ready');
  }

  /** Quests this NPC is waiting on you for. */
  waitingOn(npc: string): QuestDef[] {
    return [...this.defs.values()].filter((q) => q.turnIn === npc && this.status(q.id) === 'active');
  }

  /** The mark over an NPC's head: a quest to give, one to hand in, or one still being done. */
  markerFor(npc: string): 'offer' | 'ready' | 'waiting' | null {
    if (this.readyFor(npc).length > 0) return 'ready';
    if (this.offeredBy(npc).length > 0) return 'offer';
    if (this.waitingOn(npc).length > 0) return 'waiting';
    return null;
  }

  activeQuests(): QuestDef[] {
    return [...this.active.keys()].map((id) => this.defs.get(id)).filter((q): q is QuestDef => !!q);
  }

  accept(id: string): boolean {
    const q = this.defs.get(id);
    if (!q || this.status(id) !== 'available' || this.active.size >= MAX_ACTIVE) return false;
    this.active.set(id, q.objectives.map(() => 0));
    return true;
  }

  abandon(id: string): boolean {
    return this.active.delete(id);
  }

  /** Hand in a finished quest; gives back what it pays, or null when it is not ready. */
  complete(id: string): QuestReward | null {
    const q = this.defs.get(id);
    if (!q || this.status(id) !== 'ready') return null;
    this.active.delete(id);
    this.done.add(id);
    return q.reward;
  }

  /** The game did something; moves every quest it counts towards. */
  record(e: QuestEvent): QuestProgress[] {
    const out: QuestProgress[] = [];
    for (const [id, p] of this.active) {
      const q = this.defs.get(id);
      if (!q) continue;
      q.objectives.forEach((o, i) => {
        if (p[i] >= o.count) return;
        let add = 0;
        switch (o.kind) {
          case 'kill':
            if (e.t === 'kill' && o.mobs.includes(e.mob)) add = 1;
            break;
          case 'craft':
            if (e.t === 'craft' && o.items.includes(e.item)) add = e.count;
            break;
          case 'smelt':
            if (e.t === 'smelt' && (!o.items || o.items.includes(e.item))) add = e.count;
            break;
          case 'mine':
            if (e.t === 'mine' && o.blocks.includes(e.block)) add = 1;
            break;
          case 'place':
            if (e.t === 'place' && o.blocks.includes(e.block)) add = 1;
            break;
          case 'enter':
            if (e.t === 'enter' && e.zone === o.zone) add = 1;
            break;
          default:
        }
        if (add <= 0) return;
        p[i] = Math.min(o.count, p[i] + add);
        out.push({ quest: q, index: i, now: p[i], count: o.count, stepDone: p[i] >= o.count, ready: this.isComplete(q, p) });
      });
    }
    return out;
  }

  /** Bring the "collect" objectives in line with what the player carries. */
  sync(countOf: (items: readonly number[]) => number): QuestProgress[] {
    const out: QuestProgress[] = [];
    for (const [id, p] of this.active) {
      const q = this.defs.get(id);
      if (!q) continue;
      q.objectives.forEach((o, i) => {
        if (o.kind !== 'collect') return;
        const now = Math.min(o.count, countOf(o.items));
        if (now === p[i]) return;
        const grew = now > p[i];
        p[i] = now;
        if (grew) out.push({ quest: q, index: i, now, count: o.count, stepDone: now >= o.count, ready: this.isComplete(q, p) });
      });
    }
    return out;
  }

  toJSON(): QuestLogJSON {
    return { d: [...this.done], a: [...this.active].map(([id, p]) => [id, [...p]]), ...(this.classId ? { c: this.classId } : {}) };
  }

  /** Read a saved or received log; anything unknown or malformed is dropped. */
  loadJSON(raw: unknown): void {
    this.done.clear();
    this.active.clear();
    if (typeof raw !== 'object' || raw === null) return;
    const r = raw as { d?: unknown; a?: unknown; c?: unknown };
    if (isClassId(r.c)) this.classId = r.c;
    if (Array.isArray(r.d)) for (const id of r.d) if (typeof id === 'string' && this.defs.has(id)) this.done.add(id);
    if (Array.isArray(r.a)) {
      for (const entry of r.a) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) continue;
        const q = this.defs.get(entry[0]);
        if (!q || this.done.has(q.id)) continue;
        const p = q.objectives.map((o, i) => {
          const v = entry[1][i];
          return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(o.count, Math.floor(v))) : 0;
        });
        this.active.set(q.id, p);
      }
    }
  }
}
