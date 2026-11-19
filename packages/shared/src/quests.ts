import type { RGB } from './biomeColors';
import { B } from './blocks';
import type { AbilityId } from './abilities';
import type { ClassId } from './classes';
import { I, bagId, skillBookId, toolId } from './items';
import type { MobKind } from './mobs';

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

/** The first quest of every new Adventure character: they wake in the Undercroft, the cave under Dawnwatch, and are sent up into the village. */
export const FIRST_QUEST = 'out_of_the_dark';

/** The coins a quest pays. */
export const rewardCoins = (r: QuestReward): number => r.coins ?? r.xp * 2;

/** Every item a quest hands over to a character of this class (null: no class): the plain rewards, then the class's own. */
export const rewardItems = (r: QuestReward, classId: ClassId | null): readonly ItemReward[] => (classId && r.classItems?.[classId] ? [...r.items, ...r.classItems[classId]!] : r.items);

/** A class's skill book as a quest reward. */
const book = (ability: AbilityId): ItemReward => ({ id: skillBookId(ability), count: 1 });

/**
 * The skill books the early quests give, one per ability of each class, in button order. A new character knows no
 * ability: these (the monsters' drops and the merchants' counters are the other ways) are how they learn them.
 */
const BOOK_REWARDS: readonly Record<ClassId, readonly ItemReward[]>[] = [
  { warrior: [book('ground_slam')], mage: [book('fireball')], ranger: [book('piercing_shot')] },
  { warrior: [book('shield_bash')], mage: [book('frost_nova')], ranger: [book('evasive_roll')] },
  { warrior: [book('charge')], mage: [book('meteor')], ranger: [book('bear_trap')] },
  { warrior: [book('iron_defense')], mage: [book('arcane_shield')], ranger: [book('rain_of_arrows')] },
];

export interface QuestDef {
  id: string;
  name: string;
  /** The chapter it belongs to, for the log. */
  chapter: string;
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
  /** What they say when you have no quest business with them. */
  greeting: string;
  /** How they are drawn. */
  look: { robe: RGB; trim: RGB; hair: RGB; hat: 'none' | 'hood' | 'cap' | 'helm' | 'wide'; beard: boolean };
}

/** An NPC and the spot it stands on in a world (the generator knows the height of the ground there). */
export interface NpcStation {
  npc: NpcDef;
  index: number;
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
  { id: 'dawnwatch', name: 'Dawnwatch', sub: 'A small village at the edge of the Rift' },
  { id: 'greykeep', name: 'Greykeep', sub: 'The castle north of Dawnwatch' },
  { id: 'undercroft', name: 'The Undercroft', sub: 'The old storm cellars under Dawnwatch' },
  { id: 'training_yard', name: 'Training Yard', sub: 'Hit the dummies to test your damage and abilities' },
  { id: 'hollow_cellar', name: 'The Hollow Cellar', sub: 'Dungeon' },
  { id: 'lush_cave', name: 'Lush Cave', sub: 'Moss, vines and glowing berries' },
  { id: 'dripstone_cave', name: 'Dripstone Cave', sub: 'Stalactites and stalagmites' },
  { id: 'deep_dark', name: 'The Deep Dark', sub: 'Nothing grows here but sculk' },
];

export const zoneDef = (id: string): ZoneDef | null => ZONES.find((z) => z.id === id) ?? null;

export const NPCS: readonly NpcDef[] = [
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
    x: 12.5,
    z: -3.5,
    yaw: Math.PI,
    greeting: 'Hands make everything, friend. A table, a pick, a fire. The rest is just more of the same, done harder.',
    look: { robe: [70, 66, 62], trim: [150, 90, 50], hair: [110, 52, 28], hat: 'cap', beard: true },
  },
  {
    id: 'isolde',
    name: 'Ranger Isolde',
    title: 'Warden of the Wilds',
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
  // The healer of the Undercroft, the cave under the village where everyone starts.
  {
    id: 'mirel',
    name: 'Healer Mirel',
    title: 'Keeper of the Undercroft',
    x: -9.5,
    z: 12.5,
    yaw: -Math.PI / 2,
    cellar: true,
    greeting: 'Rest while you can. The stair at the west end of the cave climbs up into Dawnwatch, whenever you are ready for the light.',
    look: { robe: [196, 188, 160], trim: [92, 140, 96], hair: [120, 72, 40], hat: 'hood', beard: false },
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
    name: 'Stashkeeper Bram',
    title: 'The Stash',
    x: 19.5,
    z: 12.5,
    yaw: Math.PI,
    greeting: 'Anything you leave with me waits for you, and for any other hero on your wallet. Leave a wand as a mage and your warrior can pick it up. Nobody else gets near it.',
    look: { robe: [76, 60, 38], trim: [196, 150, 60], hair: [150, 150, 150], hat: 'cap', beard: true },
  },
];

export const npcById = (id: string): NpcDef | null => NPCS.find((n) => n.id === id) ?? null;

const LOGS = [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG];
const COOKED = [I.COOKED_MEAT, I.COOKED_MUTTON, I.COOKED_CHICKEN, I.COOKED_RABBIT];
const FARM_ANIMALS: readonly MobKind[] = ['pig', 'cow', 'sheep', 'chicken'];

const CH1 = 'Chapter 1: Dawnwatch';
const CH2 = 'Chapter 2: The Hollow Cellar';

const CH0 = 'Prologue: The Rift';

export const QUESTS: readonly QuestDef[] = [
  {
    id: FIRST_QUEST,
    name: 'Out of the Dark',
    chapter: CH0,
    giver: 'mirel',
    turnIn: 'maren',
    requires: [],
    summary: 'Climb out of the Undercroft into Dawnwatch and find Elder Maren.',
    offer:
      'Easy now, do not try to stand too fast. Do you know where you are? No? Then listen.\n\nThe hunters of Dawnwatch found you at dusk at the edge of the Whisperwood, face down in the leaves and nearly dead: frost in your hair, the Rift\'s mark on your skin, and not a stitch of gear on you. They carried you down here, into the Undercroft, the old storm cellars under the village where we keep the wounded out of the Rift\'s sight. You have lain on that cot three nights.\n\nYou are mending, and there is nothing more I can do for you down here. The stair at the west end of the cave climbs into a stone house in the village. Go up into the light, and ask for Elder Maren. She will want to meet the one the forest gave back.',
    progress: 'The stair at the west end of the cave climbs up into a stone house in Dawnwatch. Go up and out into the village, then find Elder Maren, north of the plaza.',
    complete:
      'So you are the one the hunters carried in. Mirel sent word that you were on your feet, but I wanted to see it for myself. Few come back from the Whisperwood, and fewer still from the Rift\'s mark.\n\nYou have nothing, so we will begin with what we have. Here is a map of the lands around Dawnwatch: hold it and press the right mouse button to read it; the little chart in the corner of your screen is drawn from it too. And this was my husband\'s compass. Hold it and turn around, and its red needle will always find north. You will not be lost again.',
    objectives: [{ kind: 'enter', zone: 'dawnwatch', count: 1, label: 'Climb out into Dawnwatch' }],
    reward: { xp: 25, items: [{ id: I.MAP, count: 1 }, { id: I.COMPASS, count: 1 }] },
  },
  {
    id: 'a_blade_for_the_road',
    name: 'A Blade for the Road',
    chapter: CH0,
    giver: 'maren',
    turnIn: 'garrick',
    requires: [FIRST_QUEST],
    summary: 'Visit Garrick Bladesworn, the weaponsmith, and take the weapon he has for you.',
    offer:
      'The hunters carried you in with nothing on you, not even a knife. That is bad luck, but it is not a plan. Nobody should walk out there unarmed.\n\nGarrick Bladesworn, our weaponsmith, owes me an old favour. Go to his stall at the east of the market and tell him Maren sent you. He will put something in your hand.',
    progress: 'Garrick keeps the weapon stall in the east of the market, past the forge.',
    complete:
      'Maren sent you, did she? Then you are the one the hunters pulled out of the Whisperwood with nothing. Here, this was paid for long ago and nobody has come to collect it.\n\nKeep it sharp. Steel does not care how brave you are.',
    objectives: [],
    reward: {
      xp: 25,
      items: [{ id: toolId('sword', 'stone'), count: 1 }],
      classItems: {
        warrior: [{ id: I.SHIELD, count: 1 }],
        mage: [{ id: I.WAND, count: 1 }, { id: I.ORB, count: 1 }],
        ranger: [{ id: I.BOW, count: 1 }, { id: I.ARROW, count: 32 }, { id: I.DAGGER, count: 1 }],
      },
    },
  },
  {
    id: 'welcome',
    name: 'Welcome to Dawnwatch',
    chapter: CH1,
    giver: 'maren',
    turnIn: 'brannoc',
    requires: [FIRST_QUEST],
    summary: 'Speak with Smith Brannoc.',
    offer:
      'So the Rift has sent us another one. Welcome to Dawnwatch, traveller. We are a small village, but an honest one.\n\nBefore you do anything else, go and see Brannoc, our smith, at the forge to the east. He will show you how things are done here. Take this bread, you look hungry.',
    progress: 'Brannoc is the broad man at the forge, east of the plaza. Do not keep him waiting.',
    complete:
      'Maren sent you? Good. She does not send me idle hands. A newcomer who can learn is worth ten who cannot.\n\nLet us find out which you are.\n\nHere is an Emberstone, to bring you home: hold it and press the right mouse button, and once you have stood still a few seconds it takes you to your bed, or to the village if you have none.\n\nAnd one more thing, for the road: a skill book of your calling. You know no ability yet, traveller; you learn each one from its book. Right-click the book, in your pack or in your hand, and what is written in it becomes yours. More are sold at the market, and the things that crawl out of the Rift carry them now and then.',
    objectives: [],
    reward: { xp: 20, items: [{ id: I.EMBERSTONE, count: 1 }, { id: I.BREAD, count: 3 }, { id: bagId(0), count: 1 }], classItems: BOOK_REWARDS[0] },
  },
  {
    id: 'first_timber',
    name: 'First Timber',
    chapter: CH1,
    giver: 'brannoc',
    turnIn: 'brannoc',
    requires: ['welcome'],
    summary: 'Gather logs from the trees around Dawnwatch.',
    offer:
      'Everything starts with wood. Take any tree around the village and punch it until a log falls off. Yes, with your bare hands; it works, it just takes a while.\n\nBring me five logs. Oak, birch or spruce, I am not picky.',
    progress: 'Five logs. The trees are right there. Hold the left mouse button on the trunk.',
    complete: 'Fine logs. Rough, but they will burn or build, and you can make planks out of them in the 2x2 grid of your inventory. Press E.',
    objectives: [{ kind: 'collect', items: LOGS, count: 5, label: 'Logs' }],
    reward: { xp: 30, items: [{ id: B.TORCH, count: 6 }], classItems: BOOK_REWARDS[1] },
  },
  {
    id: 'workbench',
    name: 'A Proper Workbench',
    chapter: CH1,
    giver: 'brannoc',
    turnIn: 'brannoc',
    requires: ['first_timber'],
    summary: 'Craft a crafting table and a wooden pickaxe.',
    offer:
      'Planks first: put a log in your inventory grid and take the planks. Four planks in a square make a crafting table, and with a table you can craft almost anything.\n\nMake one, then use it to craft a wooden pickaxe: three planks across the top, two sticks down the middle. Show me when you are done.',
    progress: 'A crafting table (four planks in a 2x2 square) and then a wooden pickaxe at it. Right-click the table to open it.',
    complete: 'That is a tool, not a stick with ambitions. Now you can break stone. Take some coal for the furnace you will want soon.',
    objectives: [
      { kind: 'craft', items: [B.CRAFTING_TABLE], count: 1, label: 'Craft a crafting table' },
      { kind: 'craft', items: [toolId('pickaxe', 'wood')], count: 1, label: 'Craft a wooden pickaxe' },
    ],
    reward: { xp: 40, items: [{ id: I.COAL, count: 4 }, { id: bagId(1), count: 1 }] },
  },
  {
    id: 'stone_age',
    name: 'The Stone Age',
    chapter: CH1,
    giver: 'brannoc',
    turnIn: 'brannoc',
    requires: ['workbench'],
    summary: 'Mine stone and craft a stone pickaxe.',
    offer:
      'Wood breaks easy and wears out quick. Stone is better. Find grey rock, there is plenty past the village edge, and mine ten blocks of it with your pickaxe. It drops cobblestone.\n\nThen craft a stone pickaxe: cobblestone on top, sticks below. A better pick opens the way to iron, and iron changes everything.',
    progress: 'Ten blocks of stone, then a stone pickaxe: three cobblestone and two sticks.',
    complete: 'There. A real tool. You are no longer a visitor, you are a worker. I will not tell Maren you did it with a smile, though.',
    objectives: [
      { kind: 'mine', blocks: [B.STONE], count: 10, label: 'Mine stone' },
      { kind: 'craft', items: [toolId('pickaxe', 'stone')], count: 1, label: 'Craft a stone pickaxe' },
    ],
    reward: { xp: 60, items: [{ id: B.COBBLE, count: 16 }], classItems: BOOK_REWARDS[2] },
  },
  {
    id: 'forge_fire',
    name: 'Fire and Forge',
    chapter: CH1,
    giver: 'brannoc',
    turnIn: 'brannoc',
    requires: ['stone_age'],
    summary: 'Craft a furnace and smelt something in it.',
    offer:
      'Ore is no use as it comes out of the ground. You smelt it. A furnace is eight cobblestone in a ring around an empty middle.\n\nBuild one, put it down, and cook something in it: coal as fuel on the bottom, whatever you like to cook on top. Sand makes glass, raw meat makes dinner. Do it three times and you will have the idea.',
    progress: 'Craft a furnace (eight cobblestone in a ring), then take three things out of it. Coal goes in the bottom slot as fuel.',
    complete: 'Now you have the whole trade in your hands: dig, craft, smelt. Everything else is a question of how big a thing you want to make.',
    objectives: [
      { kind: 'craft', items: [B.FURNACE], count: 1, label: 'Craft a furnace' },
      { kind: 'smelt', count: 3, label: 'Smelt items' },
    ],
    reward: { xp: 70, items: [{ id: I.IRON_INGOT, count: 3 }, { id: bagId(2), count: 1 }] },
  },
  {
    id: 'hungry_mouths',
    name: 'Hungry Mouths',
    chapter: CH1,
    giver: 'isolde',
    turnIn: 'isolde',
    requires: ['welcome'],
    summary: 'Hunt pigs, cows, sheep or chickens.',
    offer:
      'You look like you can swing something. Good. The village is low on meat, and the herds around Dawnwatch have grown thick.\n\nHunt six animals, any of the farm sort: pigs, cows, sheep, chickens. Hit them until they stop. They do not hit back.',
    progress: 'Six animals so far? Pigs, cows, sheep and chickens all count. They graze on the grass around the village.',
    complete: 'Good hunting. Do not waste any of it; everything those animals drop will be useful, even the feathers.',
    objectives: [{ kind: 'kill', mobs: FARM_ANIMALS, count: 6, label: 'Animals hunted' }],
    reward: { xp: 50, items: [{ id: I.ARROW, count: 8 }] },
  },
  {
    id: 'hot_meal',
    name: 'A Hot Meal',
    chapter: CH1,
    giver: 'isolde',
    turnIn: 'isolde',
    requires: ['hungry_mouths', 'forge_fire'],
    summary: 'Cook meat in a furnace.',
    offer:
      'Raw meat will keep you alive and make you sick of it. Cooked meat will keep you alive and strong.\n\nYou have a furnace now, thanks to Brannoc. Cook three pieces of meat and bring them to me. Eat one on the way, hunger is a poor travelling companion.',
    progress: 'Put raw meat in a furnace with coal under it. Three cooked pieces.',
    complete: 'Now that is a meal. Keep some in your pack always. A full stomach heals you faster than any potion.',
    objectives: [{ kind: 'collect', items: COOKED, count: 3, label: 'Cooked meat' }],
    reward: { xp: 60, items: [{ id: I.BOW, count: 1 }] },
  },
  {
    id: 'night_watch',
    name: 'The Night Watch',
    chapter: CH1,
    giver: 'isolde',
    turnIn: 'isolde',
    requires: ['hot_meal'],
    summary: 'Slay zombies and skeletons that come out at night.',
    offer:
      'Once the sun goes down the dead walk. Zombies shamble, skeletons shoot. They burn in daylight, so the worst of them wait for the dark.\n\nStand your ground near the village after sunset and put down four zombies and two skeletons. Keep your back to something solid, and use that bow I gave you.',
    progress: 'Four zombies and two skeletons. They come out at night, or in the dark of a cave.',
    complete: 'You are still standing. That is more than most manage on the first night. Varro has been asking about you. Go and see the Captain.',
    objectives: [
      { kind: 'kill', mobs: ['zombie'], count: 4, label: 'Zombies slain' },
      { kind: 'kill', mobs: ['skeleton'], count: 2, label: 'Skeletons slain' },
    ],
    reward: { xp: 100, items: [{ id: I.ARROW, count: 16 }, { id: I.COOKED_MEAT, count: 4 }, { id: bagId(3), count: 1 }], classItems: BOOK_REWARDS[3] },
  },
  {
    id: 'into_the_dark',
    name: 'Into the Dark',
    chapter: CH2,
    giver: 'varro',
    turnIn: 'varro',
    requires: ['night_watch', 'stone_age'],
    summary: 'Find the ruined chapel east of Dawnwatch and step through the portal in it.',
    offer:
      'Follow the road east out of the village. A mile on there is a ruined chapel, and in it a portal of black stone that was not there in my father\'s day. It leads to the Hollow Cellar, and something has been waking down there. The dead we keep fighting are coming from it.\n\nI want to know what is in it. Step through, look around, and come back by the portal on the far side. The portal turns back anyone below level 5, so if it will not take you, go and earn some experience first. The cellar is yours alone: it is made fresh for whoever goes in. Bring torches, a sword, and food. It is dark in there.',
    progress: 'East along the gravel road to the ruin, then through the portal (level 5 and up). Do not go in without torches and food.',
    complete: 'You went in and came out. Then it is real. Cages that make the dead? That explains the numbers. We cannot let them keep running.',
    objectives: [{ kind: 'enter', zone: 'hollow_cellar', count: 1, label: 'Enter the Hollow Cellar' }],
    reward: { xp: 80, items: [{ id: B.TORCH, count: 16 }] },
  },
  {
    id: 'cellar_cleanse',
    name: 'Cleansing the Cellar',
    chapter: CH2,
    giver: 'varro',
    turnIn: 'varro',
    requires: ['into_the_dark'],
    summary: 'Destroy the monster spawners in the Hollow Cellar.',
    offer:
      'Three cages. Each one makes the dead as fast as we cut them down. You will find them in the cellar, past the portal in the chapel: the gatehall, the crypt, and the vault at the back. Break each cage with a pick and they stop.\n\nExpect company. If you fall or leave, the cellar keeps your place for a minute or two; after that it is made new. Use what you have learned: tools, armour if you have it, a shield, food in your pack. The treasure in the vault is yours to keep.',
    progress: 'Three monster cages in the Cellar: the gatehall, the crypt, the vault. Break each with a pickaxe.',
    complete: 'The cages are broken. The Watch owes you a great deal, traveller. Take this, and the thanks of Dawnwatch.\n\nThere is more under the Rift than one cellar. But that is a story for another day.',
    objectives: [{ kind: 'mine', blocks: [B.SPAWNER], count: 3, label: 'Monster cages destroyed' }],
    reward: { xp: 250, items: [{ id: toolId('sword', 'iron'), count: 1 }, { id: I.SHIELD, count: 1 }, { id: I.EMERALD, count: 6 }, { id: bagId(5), count: 1 }] },
  },
];

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
}

/** The things the game tells the log about. */
export type QuestEvent =
  | { t: 'kill'; mob: MobKind }
  | { t: 'craft'; item: number; count: number }
  | { t: 'smelt'; item: number; count: number }
  | { t: 'mine'; block: number }
  | { t: 'place'; block: number }
  | { t: 'enter'; zone: string };

const MAX_ACTIVE = 12;

/** One player's quests. */
export class QuestLog {
  readonly done = new Set<string>();
  readonly active = new Map<string, number[]>();

  constructor(private readonly defs: ReadonlyMap<string, QuestDef> = questMap) {}

  get empty(): boolean {
    return this.done.size === 0 && this.active.size === 0;
  }

  status(id: string): QuestStatus {
    const q = this.defs.get(id);
    if (!q) return 'locked';
    if (this.done.has(id)) return 'done';
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
    return { d: [...this.done], a: [...this.active].map(([id, p]) => [id, [...p]]) };
  }

  /** Read a saved or received log; anything unknown or malformed is dropped. */
  loadJSON(raw: unknown): void {
    this.done.clear();
    this.active.clear();
    if (typeof raw !== 'object' || raw === null) return;
    const r = raw as { d?: unknown; a?: unknown };
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
