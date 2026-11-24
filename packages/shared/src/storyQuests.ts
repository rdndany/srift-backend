import { B, LOG_BLOCKS, campfireId } from './blocks';
import type { AbilityId } from './abilities';
import type { ClassId } from './classes';
import { CLASS_LEVELS } from './classes';
import { I, armorId, bagId, bedItemId, companionItemId, getItem, mountItemId, necklaceId, ringId, skillBookId, toolId, wingItemId } from './items';
import type { MobKind } from './mobs';
import type { ArmorMaterial } from './armor';
import type { ItemReward, Objective, QuestDef } from './quests';

/**
 * The story of the Adventure world, "Embers of the Hollow King": every quest of the game as plain data (the design is in
 * docs/adventure). The main line is `ms00`..`ms38`; the rest are the side quests of each place, the three class lines
 * (`cl_*`), the Wayfarer's Ledger (`ex_*`) and the endgame (`eg_*`).
 *
 * Experience is not written quest by quest: a quest says its level and its tier, and `questXp` gives the number, so the
 * whole story follows one curve (a share of the class experience that level needs).
 */

/** The tiers of a quest: a side quest (S), a class quest (C), a main quest (M) and a finale (F). */
export type QuestTier = 'S' | 'C' | 'M' | 'F';

/** The share (per cent) of the class experience a level needs that each tier pays. */
export const TIER_PERCENT: Readonly<Record<QuestTier, number>> = { S: 6, C: 12, M: 22, F: 35 };

/** What a quest of this level and tier pays in experience. The class level cap is 20, so the last level uses the one before it. */
export const questXp = (level: number, tier: QuestTier): number => Math.round((CLASS_LEVELS.toNext(Math.min(19, Math.max(1, Math.floor(level)))) * TIER_PERCENT[tier]) / 100);

// ---- the words for the objectives ------------------------------------------------------------------------------------

const blockOf = (item: number): number => getItem(item).block ?? item;
const kill = (mobs: readonly MobKind[], count: number, label: string): Objective => ({ kind: 'kill', mobs, count, label });
const collect = (items: readonly number[], count: number, label: string): Objective => ({ kind: 'collect', items, count, label });
const craft = (items: readonly number[], count: number, label: string): Objective => ({ kind: 'craft', items, count, label });
const smelt = (items: readonly number[], count: number, label: string): Objective => ({ kind: 'smelt', items, count, label });
const mine = (blocks: readonly number[], count: number, label: string): Objective => ({ kind: 'mine', blocks, count, label });
const place = (items: readonly number[], count: number, label: string): Objective => ({ kind: 'place', blocks: items.map(blockOf), count, label });
const enter = (zone: string, label: string): Objective => ({ kind: 'enter', zone, count: 1, label });
const it = (id: number, count = 1): ItemReward => ({ id, count });

const LOGS: readonly number[] = LOG_BLOCKS;
const STONES = [B.STONE, B.COBBLE];
const BEDS = Array.from({ length: 16 }, (_, c) => bedItemId(c));
const FARM_ANIMALS: readonly MobKind[] = ['pig', 'cow', 'sheep', 'chicken'];
const COOKED_FISH = [I.COOKED_COD, I.COOKED_SALMON];
const RAW_FISH = [I.RAW_COD, I.RAW_SALMON];
const MUSHROOMS = [B.BROWN_MUSHROOM, B.RED_MUSHROOM];
const SLOT_NAMES = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
const armorSet = (material: ArmorMaterial): Objective[] => SLOT_NAMES.map((s, i) => craft([armorId(i, material)], 1, `Craft ${material} ${s}`));
const hostiles: readonly MobKind[] = ['zombie', 'skeleton', 'spider', 'creeper', 'slime'];

const book = (ability: AbilityId): ItemReward => ({ id: skillBookId(ability), count: 1 });
/** What each calling is handed with its first stone sword: the weapons of its way of fighting. */
const KIT: Partial<Record<ClassId, readonly ItemReward[]>> = {
  warrior: [it(I.SHIELD)],
  mage: [it(I.WAND), it(I.ORB)],
  ranger: [it(I.BOW), it(I.ARROW, 32), it(I.DAGGER)],
};

// ---- what an NPC says when a quest of theirs is handed in and the quest has no words of its own ----------------------------

const DONE: Readonly<Record<string, string>> = {
  edda: 'Good. Ashbrook is small, but it keeps count of those who help.',
  maren: 'Good. You are more use than you know.',
  brannoc: 'Hm. Honest work. That is rarer than iron.',
  isolde: 'Quiet, careful, and back in one piece. That is all I ask of anybody.',
  varro: 'The Watch is in your debt, traveller.',
  tobin: 'Good goods, fair price. Pleasure doing business.',
  hilda: 'Wear it well. Armor you do not wear is a paperweight.',
  garrick: 'Better. Not good. Better.',
  fenna: 'Steady hands. Keep them that way.',
  lysa: 'Neatly done. The page remembers who wrote it.',
  mirel: 'Thank you. The dead are not the only ones who notice.',
  auctioneer: 'Everything has a price. You are learning it.',
  stashkeeper: 'A place for everything. You will thank me later.',
  hale: 'Noted in the ledger. Mind the stairs on the way out.',
  wick: 'Soil does not lie. You did well by it.',
  nell: 'There is a seat by the fire with your name on it.',
  ilse: 'May the road remember you kindly.',
  tamsin: 'Reedhollow does not forget a kindness.',
  dunstan: 'The marsh will be kinder to you for that.',
  idris: 'Sit, drink, be welcome. You have earned it.',
  oska: 'Not bad, for someone who has never been in a real mine.',
  halvard: 'Frostgate stands a little taller for it.',
  sigrun: 'The cold takes the weak. You are not weak.',
  thessaly: 'The town is better for your hands.',
  vael: 'Remember how that felt. It is how all of it feels.',
  ivo: 'Look at that. Look at it. Now imagine it in the air.',
  aldren: 'The keep will remember this, and so will I.',
};

// ---- the quests ------------------------------------------------------------------------------------------------------

interface Spec {
  /** The name of the quest. */
  n: string;
  /** The chapter (the heading in the quest log). */
  ch: string;
  lv: number;
  t: QuestTier;
  from: string;
  to?: string;
  req?: readonly string[];
  offer: string;
  done?: string;
  prog?: string;
  /** The line for the tracker. */
  sum?: string;
  obj: readonly Objective[];
  give?: readonly ItemReward[];
  items?: readonly ItemReward[];
  /** Coins, when it is not the usual (twice the experience for a side quest, three times for the rest). */
  coins?: number;
  /** Coins on top of the usual. */
  plus?: number;
  cls?: ClassId;
  classItems?: QuestDef['reward']['classItems'];
  /** Experience, when it is not the tier's (the first quest of the game). */
  xp?: number;
}

const ACT1 = 'Act I: Waking';
const ACT2 = 'Act II: Three Embers';
const ACT3 = 'Act III: The Records';
const ACT4 = 'Act IV: The Hollow Deep';

const build = (id: string, s: Spec): QuestDef => {
  const xp = s.xp ?? questXp(s.lv, s.t);
  const coins = s.coins ?? xp * (s.t === 'S' ? 2 : 3) + (s.plus ?? 0);
  const labels = s.obj.map((o) => o.label);
  return {
    id,
    name: s.n,
    chapter: s.ch,
    giver: s.from,
    turnIn: s.to ?? s.from,
    requires: s.req ?? [],
    summary: s.sum ?? labels.join(', ') + '.',
    offer: s.offer,
    progress: s.prog ?? (labels.length > 0 ? `Still to do: ${labels.join('; ')}.` : 'Nothing more to do here: hand it in.'),
    complete: s.done ?? DONE[s.to ?? s.from] ?? 'Well done.',
    objectives: s.obj,
    give: s.give,
    class: s.cls,
    reward: { xp, coins, items: s.items ?? [], classItems: s.classItems },
  };
};

const list: QuestDef[] = [];
const q = (id: string, s: Spec): void => {
  list.push(build(id, s));
};

// ============================================================================================================
// ACT I — Waking (Lv 1 to 5)
// ============================================================================================================

q('ms00', {
  n: 'Out of the Dark',
  ch: ACT1,
  lv: 1,
  t: 'M',
  xp: 5,
  coins: 8,
  from: 'mirel',
  to: 'edda',
  offer:
    'Easy now, do not try to stand too fast. Do you know where you are? No? Then listen.\n\nThe hunters of Ashbrook found you at dusk at the edge of the Whisperwood, face down in the leaves and nearly dead: frost in your hair, the Rift\'s mark on your arm, and nothing on you but a stone that glows when I touch it. They carried you down here, into the Undercroft, the old storm cellars under the village. You have lain on that cot three nights.\n\nThere is nothing more I can do for you down here. The stair at the west end of the cave climbs into the village. Go up into the light, and ask for Reeve Edda.',
  prog: 'The stair at the west end of the cave climbs up into a stone house in Ashbrook. Go up and out into the village, then find Reeve Edda by the waystone in the middle of it.',
  done: 'So you are the one the hunters carried in. Mirel sent word that you were on your feet, but I wanted to see it for myself. Few come back from the Whisperwood, and fewer still with the Rift\'s mark on them.\n\nYou have nothing, so we begin with what we have. Eat. Then we will find work for those hands.',
  obj: [enter('ashbrook', 'Climb out into Ashbrook')],
  items: [it(I.BREAD, 2), it(B.TORCH, 4), it(I.EMBERSTONE), it(I.MAP)],
});

q('ms01', {
  n: 'Embers in the Dark',
  ch: ACT1,
  lv: 1,
  t: 'M',
  coins: 14,
  from: 'edda',
  req: ['ms00'],
  offer:
    'You are awake, and standing. Good. There is a mark on your arm that is still warm, and the only thing the dark left on you is that stone in your hand. I do not know what either means yet.\n\nThe hearth is cold. Fetch wood and turn it into planks and sticks: your pack has a small crafting grid for that. For anything bigger, the village workshop, with its roof on posts, has crafting tables and furnaces that belong to everybody, so you need not carry your own.',
  done: 'Planks and sticks. Hands that remember what they are doing, even when the head does not.',
  obj: [mine(LOGS, 5, 'Mine logs'), craft([B.PLANKS], 8, 'Craft planks'), craft([I.STICK], 4, 'Craft sticks')],
  items: [it(B.TORCH, 8), it(I.BREAD, 4)],
});

q('ms02', {
  n: 'A Pick for a Pilgrim',
  ch: ACT1,
  lv: 1,
  t: 'M',
  coins: 20,
  from: 'edda',
  to: 'brannoc',
  req: ['ms01'],
  offer: 'Take this word to Brannoc, at the forge east of the plaza. A pick first, then a better pick. Everything in this land is a better pick.',
  done: 'Good. You hold it like a person who has held one before. Interesting. Here, a blade for the road, and whatever else the Elder thinks a pilgrim of your calling will need.',
  obj: [craft([toolId('pickaxe', 'wood')], 1, 'Craft a wooden pickaxe'), mine(STONES, 8, 'Mine stone'), craft([toolId('pickaxe', 'stone')], 1, 'Craft a stone pickaxe')],
  items: [it(toolId('sword', 'stone'))],
  classItems: KIT,
});

q('ms03', {
  n: 'Hot Food, Cold Night',
  ch: ACT1,
  lv: 2,
  t: 'M',
  coins: 30,
  from: 'brannoc',
  to: 'nell',
  req: ['ms02'],
  offer: 'You are thin as a rake. Nell at the inn feeds everyone who is hungry and hates everyone who is late. Hunt something, cook it in one of the furnaces at the workshop, and bring it to her. There is no healing here: food is how you stay on your feet.',
  done: 'Eat that. Slowly. You cooked it yourself; that counts for more than you think.',
  obj: [kill(FARM_ANIMALS, 3, 'Hunt animals'), smelt([I.COOKED_MEAT], 4, 'Cook raw meat in a furnace')],
  items: [it(I.MUSHROOM_STEW, 2)],
});

q('ms04', {
  n: 'Something Wearing a Face',
  ch: ACT1,
  lv: 2,
  t: 'M',
  coins: 24,
  from: 'isolde',
  req: ['ms02'],
  offer: 'They gather at dusk, at the same place in the Whisperwood, as if somebody had called them. Zombies, and they do not wander like zombies should. Kill six, and bring me a scrap of what they wear.',
  done: 'The mark is stitched into the rag. The same mark as on your arm. I did not want to say it first.',
  obj: [kill(['zombie'], 6, 'Kill zombies'), collect([I.RIFT_SINGED_RAG], 3, 'Rift-Singed Rags')],
  items: [it(armorId(1, 'leather'))],
});

q('ms05', {
  n: 'The Mark Wakes',
  ch: ACT1,
  lv: 2,
  t: 'M',
  coins: 24,
  from: 'edda',
  to: 'mirel',
  req: ['ms04'],
  offer: 'Take this letter below. Mirel keeps the oldest records in the village. She will want to see that stone of yours again.',
  done: 'It is warm. It only does that near the Rift. Hold it a moment... there. Now you know what it does: stand still and hold the right mouse button on it, and it will take you home.',
  give: [it(I.PAPER)],
  obj: [collect([I.PAPER], 1, "Maren's letter"), enter('undercroft', 'Go down to the Undercroft')],
  items: [it(B.TORCH, 6)],
});

q('ms06', {
  n: 'A Place to Come Home To',
  ch: ACT1,
  lv: 3,
  t: 'M',
  coins: 38,
  from: 'mirel',
  req: ['ms05'],
  offer: 'Your stone goes where your bed is. Build one wherever you mean to rest, and it will always bring you back. Wool and planks: shear or kill a sheep.',
  done: 'Now it has somewhere to take you. That is more than the Rift ever gave anybody.',
  obj: [craft(BEDS, 1, 'Craft a bed'), place(BEDS, 1, 'Place the bed')],
  items: [it(I.BREAD, 8)],
});

q('ms07', {
  n: 'Where the Dark Found You',
  ch: ACT1,
  lv: 3,
  t: 'M',
  coins: 38,
  from: 'isolde',
  req: ['ms04'],
  offer: 'We found you in a clearing in the Whisperwood, face down. Whatever you carried, they took. Not for use: they took it the way a magpie takes things. Go to the clearing at dusk, and bring back what is left of your pack.',
  done: 'A Warden\'s stitching. This satchel belonged to a sworn Warden of the Seal. Before you ask: no. I do not know what that means for you.',
  obj: [enter('whisper_clearing', 'Find the Clearing'), collect([I.TORN_SATCHEL_SCRAP], 4, 'Torn Satchel Scraps')],
  items: [it(I.ARROW, 24)],
});

q('ms08', {
  n: 'Iron in the Blood',
  ch: ACT1,
  lv: 4,
  t: 'M',
  coins: 80,
  from: 'brannoc',
  to: 'maren',
  req: ['ms02'],
  offer: 'Stone is for beginners. The Rift\'s dead wear iron. So will you. Dig it, smelt it, and make yourself a pick of it.\n\nThen take the gravel road east, out of the village, to Dawnwatch: the big walled city at the edge of the Rift. Elder Maren sits there, and she has been asking after whoever the hunters carried out of the Whisperwood. Show her the pick. Tell her Brannoc sent you.',
  prog: 'Mine and smelt the iron and craft the pick, then walk the gravel road east out of Ashbrook to Dawnwatch, and find Elder Maren in the north of the city.',
  done: 'So you are the one they carried in. Brannoc sent word ahead, and Edda before him, but I wanted to see for myself. Few come back from the Whisperwood, and fewer with the Rift\'s mark on them.\n\nWelcome to Dawnwatch. Take this bag: you will need to carry more than you think. And speak to Captain Varro: the Watch has questions for you, and a door below the old chapel that wants a key.',
  obj: [mine([B.IRON_ORE], 8, 'Mine iron ore'), smelt([I.IRON_INGOT], 8, 'Smelt iron ingots'), craft([toolId('pickaxe', 'iron')], 1, 'Craft an iron pickaxe'), enter('dawnwatch', 'Reach Dawnwatch')],
  items: [it(bagId(0))],
});

q('ms09', {
  n: 'The Sigil Fee',
  ch: ACT1,
  lv: 4,
  t: 'M',
  coins: 80,
  from: 'varro',
  req: ['ms04', 'ms06', 'ms08'],
  offer: 'The door below wants a sigil: a Warden Scroll and a Hollow Bone, joined. The Watch has the scroll. The bone, you buy: Tobin sells them. Sell him what you have taken from the dark.',
  done: 'That will open the door once. Make sure you want it open.',
  give: [it(I.WARDEN_SCROLL)],
  obj: [craft([I.HOLLOW_SIGIL], 1, 'Craft a Hollow Sigil (buy the Hollow Bone from Tobin)')],
  items: [it(B.TORCH, 12), it(I.BREAD, 2)],
});

q('ms10', {
  n: 'Into the Hollow Cellar',
  ch: ACT1,
  lv: 5,
  t: 'F',
  from: 'varro',
  to: 'hale',
  req: ['ms07', 'ms09'],
  offer: 'East down the gravel road there is a ruined chapel, and in it a portal of black stone. Hale is inside. Do not go further than Hale until you are told. The Cellar wants a Hollow Sigil, and a level of five or more.',
  done: 'You hear it? That is not the wind. That is a voice, and it said one word: "Ember". It said it to you.',
  obj: [enter('hollow_cellar', 'Enter the Hollow Cellar'), kill(['moss_lurker'], 4, 'Kill moss lurkers')],
  items: [it(I.JEWEL_DAWN), it(I.BREAD, 4)],
});

// ============================================================================================================
// ACT II — Three Embers (Lv 5 to 11)
// ============================================================================================================

q('ms11', {
  n: 'The Four Embers',
  ch: ACT2,
  lv: 5,
  t: 'M',
  from: 'hale',
  to: 'maren',
  req: ['ms10'],
  offer: 'Go back to Maren and tell her what you heard. Take a compass: you will not find the way by luck. (Redstone for it is in the stone; iron you have.)',
  done: 'The Dawn Seal was five Embers. Orrin carried the last. Reedhollow, Sandmere and Frostgate each hid one and forgot why. Start with Reedhollow: it is closest, and the water has been wrong for a month.',
  obj: [mine([B.REDSTONE_ORE], 1, 'Mine redstone'), craft([I.COMPASS], 1, 'Craft a compass')],
  items: [it(bagId(1))],
});

q('ms12', {
  n: 'The Reed Road',
  ch: ACT2,
  lv: 6,
  t: 'M',
  from: 'maren',
  to: 'tamsin',
  req: ['ms11'],
  offer: 'The marsh is wide and the causeway has sunk. Tamsin will take this letter, and you will need a boat.',
  done: 'A letter from Maren, and a stranger with a stone that glows. Sit. We have something to tell you, and the fish are not it.',
  give: [it(I.PAPER)],
  obj: [collect([I.PAPER], 1, "Maren's letter"), craft([I.BOAT], 1, 'Craft a boat'), enter('reedhollow', 'Reach Reedhollow')],
  items: [it(I.COOKED_MEAT, 6)],
});

q('ms13', {
  n: 'Charms of the Drowned',
  ch: ACT2,
  lv: 6,
  t: 'M',
  from: 'tamsin',
  req: ['ms12'],
  offer: 'The villagers who drowned wore a charm to keep the water away. They still wear them. Bring them back and we can bury our people properly.',
  done: 'Thank you. They looked almost peaceful when you took them. The ground sings now. It never did before.',
  obj: [kill(['drowned'], 8, 'Kill drowned'), collect([I.DROWNED_REED_CHARM], 5, 'Drowned Reed-Charms')],
  items: [it(armorId(0, 'iron'))],
});

q('ms14', {
  n: 'What the Marsh Gives',
  ch: ACT2,
  lv: 7,
  t: 'M',
  from: 'dunstan',
  to: 'tamsin',
  req: ['ms12'],
  offer: 'The marsh gives, if you are patient. Cast, wait for the splash, reel in. Do not reel in early. Do not be like me. The village has no food: six cooked fish would feed it for a night.',
  done: 'Six fish and not a single one wasted. The whole village eats tonight.',
  obj: [craft([I.FISHING_ROD], 1, 'Craft a fishing rod'), smelt(COOKED_FISH, 6, 'Cook fish'), collect(COOKED_FISH, 6, 'Cooked cod or salmon')],
  items: [it(I.BREAD, 8)],
});

q('ms15', {
  n: 'The Reed Ember',
  ch: ACT2,
  lv: 7,
  t: 'F',
  from: 'tamsin',
  req: ['ms13', 'ms14'],
  offer: 'We hid it in the grotto under the reeds, east of the village. Our grandmothers called it the bottled sunrise and told us never to look. We looked.',
  done: 'It is warm. Take it to Maren. It was never ours to keep.',
  prog: 'The Reed Grotto, under the marsh by Reedhollow. Whatever you kill there may be carrying it.',
  obj: [enter('reed_grotto', 'Enter the Reed Grotto'), collect([I.REED_EMBER], 1, 'The Reed Ember')],
  items: [it(armorId(1, 'iron')), it(I.REED_EMBER)],
});

q('ms16', {
  n: 'Caravans in the Dust',
  ch: ACT2,
  lv: 8,
  t: 'M',
  from: 'tamsin',
  to: 'idris',
  req: ['ms15'],
  offer: 'Take this letter to Idris in Sandmere. Take him water as well; the desert people say a guest brings water.',
  done: 'Water! The right gift, and from a stranger. Sit, you are welcome here.',
  give: [it(I.PAPER)],
  obj: [collect([I.PAPER], 1, "Tamsin's letter"), collect([I.WATER_BUCKET], 1, 'A bucket of water'), enter('sandmere', 'Reach Sandmere')],
  items: [it(I.COOKED_MUTTON, 6)],
});

q('ms17', {
  n: 'The Sun-Scorched Tally',
  ch: ACT2,
  lv: 8,
  t: 'M',
  from: 'idris',
  req: ['ms16'],
  offer: 'The husks took our tally sticks. They do not know what they hold. Without them, I cannot tell who owes what to whom.',
  done: 'The marks tell a story: someone paid the caravan to move a sealed box from Greykeep. The box was never delivered.',
  obj: [kill(['husk'], 8, 'Kill husks'), collect([I.SUN_SCORCHED_TALLY], 6, 'Sun-Scorched Tally Sticks')],
  items: [it(armorId(2, 'iron'))],
});

q('ms18', {
  n: 'Tags and Hides',
  ch: ACT2,
  lv: 9,
  t: 'M',
  from: 'idris',
  req: ['ms16'],
  offer: 'My feral herd carries our tags on their collars. Bring me the tags and the hides, and I will tell you where the Ember went.',
  done: 'You have a good eye. The Ember is in the crypt under the dunes, near Sandmere. Bring it, and Sandmere will not forget your name.',
  obj: [kill(['llama', 'trader_llama'], 6, 'Kill llamas'), collect([I.LEATHER], 8, 'Leather'), collect([I.CARAVAN_TALLY_TAG], 4, 'Caravan Tally Tags')],
  items: [it(I.BREAD, 6)],
});

q('ms19', {
  n: 'The Sand Ember',
  ch: ACT2,
  lv: 9,
  t: 'F',
  from: 'idris',
  req: ['ms17', 'ms18'],
  offer: 'The cave sings when the wind blows through it. At the end of the song is a stone that is not stone. Take it.',
  done: 'Two of five. The caravans will carry your story as far as the sea. And take this horn: the Fenrir will carry you faster than any of my llamas.',
  prog: 'The Sand Crypt, under the dunes by Sandmere. Whatever you kill there may be carrying it.',
  obj: [enter('sand_crypt', 'Enter the Sand Crypt'), collect([I.SAND_EMBER], 1, 'The Sand Ember')],
  items: [it(armorId(3, 'iron')), it(mountItemId('fenrir')), it(I.SAND_EMBER)],
});

q('ms20', {
  n: 'North by Snow',
  ch: ACT2,
  lv: 10,
  t: 'M',
  from: 'idris',
  to: 'halvard',
  req: ['ms19'],
  offer: 'Halvard in Frostgate has run out of coal. Bring him sixteen, and a letter from me, and he will listen.',
  done: 'Coal. The first honest welcome we have had in a month. Come, warm yourself.',
  give: [it(I.PAPER)],
  obj: [collect([I.PAPER], 1, "Idris's letter"), mine([B.COAL_ORE], 16, 'Mine coal'), collect([I.COAL], 16, 'Coal'), enter('frostgate', 'Reach Frostgate')],
  items: [it(I.MUSHROOM_STEW, 2)],
});

q('ms21', {
  n: 'The Frozen Bells',
  ch: ACT2,
  lv: 10,
  t: 'M',
  from: 'halvard',
  req: ['ms20'],
  offer: 'The bells on the gate rang for the Seal. The strays took them. Without them the Frost Ember hears nothing.',
  done: 'I hear them! They ring in the right key. Now the Ember will answer.',
  obj: [kill(['stray'], 8, 'Kill strays'), collect([I.FROZEN_WARD_BELL], 5, 'Frozen Ward-Bells')],
  items: [it(I.ARROW, 32)],
});

q('ms22', {
  n: 'Pelts for the Gate',
  ch: ACT2,
  lv: 10,
  t: 'M',
  from: 'sigrun',
  to: 'halvard',
  req: ['ms20'],
  offer: 'Winter takes the weak. I feed the strong. Get me wolves for pelts and rabbits for meat.',
  done: 'The gate will be fed and warm. Halvard will see it.',
  obj: [kill(['wolf'], 5, 'Kill wolves'), kill(['fox'], 2, 'Kill foxes'), kill(['rabbit'], 8, 'Hunt rabbits'), smelt([I.COOKED_RABBIT], 6, 'Cook rabbit'), collect([I.COOKED_RABBIT], 6, 'Cooked rabbit')],
  items: [it(I.COOKED_CHICKEN, 4)],
});

q('ms23', {
  n: 'The Frost Ember',
  ch: ACT2,
  lv: 11,
  t: 'F',
  from: 'halvard',
  req: ['ms21', 'ms22'],
  offer: 'The Frost Vault is under the ice by the gate. Nothing grows there. The Ember is down there, where the cold is not natural.',
  done: 'Three of five. The last two are not for villages to guard.',
  prog: 'The Frost Vault, under the snow by Frostgate. Whatever you kill there may be carrying it.',
  obj: [enter('frost_vault', 'Enter the Frost Vault'), collect([I.FROST_EMBER], 1, 'The Frost Ember')],
  items: [it(bagId(2)), it(I.FROST_EMBER)],
});

q('ms24', {
  n: 'The Council of Embers',
  ch: ACT2,
  lv: 11,
  t: 'M',
  from: 'halvard',
  to: 'maren',
  req: ['ms15', 'ms19', 'ms23'],
  offer: 'Take the three Embers to Maren. She will know what to do with them.',
  done: 'Three. I had hoped for one. You are more than lucky. The records of the Wardens are in Highmarket, and Thessaly keeps them. I will give you a letter.',
  obj: [collect([I.REED_EMBER], 1, 'The Reed Ember'), collect([I.SAND_EMBER], 1, 'The Sand Ember'), collect([I.FROST_EMBER], 1, 'The Frost Ember'), enter('dawnwatch', 'Return to Dawnwatch')],
  items: [it(I.COOKED_MEAT, 8)],
});

// ============================================================================================================
// ACT III — The Records (Lv 11 to 15)
// ============================================================================================================

q('ms25', {
  n: 'The Walled Town',
  ch: ACT3,
  lv: 11,
  t: 'M',
  from: 'maren',
  to: 'thessaly',
  req: ['ms24'],
  offer: 'Highmarket charges a toll at the gate, in emeralds. Trade for them: every villager buys wheat, coal or flint.',
  done: 'A letter from Maren, a toll paid honestly, and a stone in your pocket that I have read about for ten years. Welcome.',
  give: [it(I.PAPER)],
  obj: [collect([I.PAPER], 1, "Maren's letter"), collect([I.EMERALD], 3, 'Emeralds (trade with a villager)'), enter('highmarket', 'Reach Highmarket')],
  items: [it(I.BREAD, 6)],
});

q('ms26', {
  n: 'The Hall of Records',
  ch: ACT3,
  lv: 12,
  t: 'M',
  from: 'thessaly',
  req: ['ms25'],
  offer: 'The archive burned in the last tear. I need a shelf, and books to put on it. Paper from sugar cane, leather from a cow.',
  done: 'A shelf, and the first books we have had in years. I will read to you in the morning.',
  obj: [craft([B.BOOKSHELF], 1, 'Craft a bookshelf'), place([B.BOOKSHELF], 1, 'Place the bookshelf'), craft([I.BOOK], 2, 'Craft two more books')],
  items: [it(I.BOOK, 2)],
});

q('ms27', {
  n: 'The Sixth Bearer',
  ch: ACT3,
  lv: 12,
  t: 'F',
  from: 'thessaly',
  req: ['ms26'],
  offer: 'The ledger was scattered by the skeletons that nest in the old barrows. Bring me the pages, and I will tell you what I have never said aloud.',
  done: 'The sixth bearer was a Rift-marked wanderer with a stone like yours. They went below at the last tear, and did not come back. The date is... three months ago.',
  obj: [collect([I.WARDEN_LEDGER_PAGE], 4, 'Warden Ledger Pages')],
  items: [it(I.JEWEL_DAWN)],
});

q('ms28', {
  n: 'Seal and Anvil',
  ch: ACT3,
  lv: 13,
  t: 'M',
  from: 'thessaly',
  to: 'vael',
  req: ['ms27'],
  offer: 'The Seal can be mended only by something that can be mended. Vael teaches that. Ask her.',
  done: 'Lapis, a table, and a jewel on loan. Learn how to raise a piece of gear. One day you will raise a Seal.',
  obj: [craft([B.ENCHANTING_TABLE], 1, 'Craft an enchanting table'), place([B.ENCHANTING_TABLE], 1, 'Place the enchanting table'), collect([I.LAPIS_LAZULI], 6, 'Lapis lazuli')],
  items: [it(I.JEWEL_DAWN)],
});

q('ms29', {
  n: 'The Road to Greykeep',
  ch: ACT3,
  lv: 13,
  t: 'M',
  from: 'thessaly',
  to: 'aldren',
  req: ['ms28'],
  offer: 'Greykeep has been holding out for three hundred years, and there is nothing left to eat. Bread, as much as you can carry, and this letter.',
  done: 'Bread. I did not think I would see it again. Come in. Mind the third step.',
  give: [it(I.PAPER)],
  obj: [collect([I.PAPER], 1, "Thessaly's letter"), collect([I.BREAD], 10, 'Bread'), enter('greykeep', 'Reach Greykeep')],
  items: [it(I.COOKED_MEAT, 4)],
});

q('ms30', {
  n: 'The Ashen Court',
  ch: ACT3,
  lv: 14,
  t: 'M',
  from: 'aldren',
  req: ['ms29'],
  offer: 'My knights are down in the Cellar. They did not desert. They never left their post. Bring me their medals, so that the names are not lost.',
  done: 'Four names. I will carve them in the wall. The King stood with them.',
  give: [it(I.HOLLOW_SIGIL)],
  obj: [enter('hollow_cellar', 'Enter the Hollow Cellar'), kill(['ashen_knight'], 6, 'Kill ashen knights'), collect([I.ASHEN_MEDAL], 4, 'Ashen Medals')],
  items: [it(toolId('sword', 'iron'))],
});

q('ms31', {
  n: 'Light in the Keep',
  ch: ACT3,
  lv: 14,
  t: 'M',
  from: 'aldren',
  req: ['ms29'],
  offer: 'The keep is dark and the garrison forgets itself in the dark. Light every hall.',
  done: 'For the first time in my life I can see the end of the corridor.',
  obj: [craft([B.LANTERN], 6, 'Craft lanterns'), place([B.LANTERN], 6, 'Place lanterns'), place([B.TORCH], 10, 'Place torches')],
  items: [it(B.TORCH, 12)],
});

q('ms32', {
  n: 'What Maren Knew',
  ch: ACT3,
  lv: 15,
  t: 'F',
  from: 'aldren',
  to: 'maren',
  req: ['ms30', 'ms31'],
  offer: 'Take this letter to Maren. Ask her what she did not tell you.',
  done: 'I taught you. I taught you everything you have forgotten. When you went below I thought I had lost you. When you came back with no name I thought it was a mercy. It was not mine to decide. I am sorry.',
  give: [it(I.PAPER)],
  obj: [collect([I.PAPER], 1, "Aldren's letter"), enter('dawnwatch', 'Return to Dawnwatch')],
  items: [it(mountItemId('fenrir_black')), it(I.AURELION_CODEX)],
});

// ============================================================================================================
// ACT IV — The Hollow Deep (Lv 15 to 20)
// ============================================================================================================

q('ms33', {
  n: 'Five Hands',
  ch: ACT4,
  lv: 15,
  t: 'M',
  from: 'maren',
  to: 'hale',
  req: ['ms32'],
  offer: 'The Seal needs no bearer. It needs five hands, and five Embers. You carry the stone, and here are the three. The fourth is on the King\'s throne.',
  done: 'Everything below is the Court. Take them in order. When the King speaks, listen. He is not what he was.',
  give: [it(I.HOLLOW_SIGIL), it(I.REED_EMBER), it(I.SAND_EMBER), it(I.FROST_EMBER)],
  obj: [enter('hollow_cellar', 'Enter the Hollow Cellar')],
  items: [it(I.BREAD, 12)],
});

q('ms34', {
  n: 'Moss and Spore',
  ch: ACT4,
  lv: 16,
  t: 'M',
  from: 'hale',
  req: ['ms33'],
  offer: 'The mossy caves are the Court\'s gardeners. Clear them.',
  done: 'The way is open.',
  obj: [kill(['moss_lurker'], 10, 'Kill moss lurkers'), kill(['spore_puff'], 6, 'Kill spore puffs')],
  items: [it(I.GLOW_BERRIES, 6)],
});

q('ms35', {
  n: 'Ash and Bone',
  ch: ACT4,
  lv: 17,
  t: 'M',
  from: 'hale',
  req: ['ms33'],
  offer: 'The knights guard the stair, and the priests keep the flame. Break both.',
  done: 'They fought as if they had a reason.',
  obj: [kill(['ashen_knight'], 8, 'Kill ashen knights'), kill(['hollow_priest'], 6, 'Kill hollow priests')],
  items: [it(I.LAPIS_LAZULI, 4)],
});

q('ms36', {
  n: 'The Dark Under',
  ch: ACT4,
  lv: 18,
  t: 'M',
  from: 'hale',
  req: ['ms33'],
  offer: 'The deepest caves: wraiths of the Seal and the shades it casts. They are fast. Do not run from them.',
  done: 'The throne room is open. The King is waiting.',
  obj: [kill(['shade'], 6, 'Kill shades'), kill(['ember_wraith'], 6, 'Kill ember wraiths')],
  items: [it(I.COOKED_MEAT, 6)],
});

q('ms37', {
  n: 'The Hollow King',
  ch: ACT4,
  lv: 19,
  t: 'F',
  from: 'hale',
  req: ['ms34', 'ms35', 'ms36'],
  offer: 'He will speak three times: once at the start, once at seventy percent, once at forty. Listen. The last words are for you.',
  done: 'Bearer... you came back. Take it. End this.',
  obj: [kill(['hollow_king'], 1, 'Defeat The Hollow King'), collect([I.THRONE_EMBER], 1, 'The Throne Ember')],
  items: [it(I.AURELION_CODEX), it(I.JEWEL_RIFT), it(I.THRONE_EMBER)],
});

q('ms38', {
  n: 'The Dawn Seal',
  ch: ACT4,
  lv: 19,
  t: 'F',
  from: 'hale',
  to: 'maren',
  req: ['ms37'],
  offer: 'Take the four Embers to Maren. The Emberstone you carry is the fifth hand.',
  done: 'Four Embers and one stone. Watch.\n\n(The Seal is relit.)\n\nThe bell has not rung since Orrin. Listen.',
  obj: [collect([I.REED_EMBER], 1, 'The Reed Ember'), collect([I.SAND_EMBER], 1, 'The Sand Ember'), collect([I.FROST_EMBER], 1, 'The Frost Ember'), collect([I.THRONE_EMBER], 1, 'The Throne Ember'), enter('dawnwatch', 'Return to Dawnwatch')],
  items: [it(I.AURELION_CODEX), it(bagId(5))],
});

// ============================================================================================================
// SIDE QUESTS — Dawnwatch
// ============================================================================================================

const DW = 'Dawnwatch';
const AB = 'Ashbrook';

// Merchant Tobin
q('dw_tobin_1', { n: 'Sell What You Dragged Out', ch: DW, lv: 2, t: 'S', from: 'tobin', req: ['ms01'], offer: 'Bones and string. Always short of both.', obj: [collect([I.BONE], 6, 'Bones'), collect([I.STRING], 4, 'String')], items: [it(I.BREAD, 2)] });
q('dw_tobin_2', { n: 'A Full Larder', ch: DW, lv: 3, t: 'S', from: 'tobin', req: ['ms01'], offer: 'Forest food, please. My customers will not touch my own cooking.', obj: [collect([I.SWEET_BERRIES], 6, 'Sweet berries'), collect([I.APPLE], 4, 'Apples')], items: [it(I.MUSHROOM_STEW)] });
q('dw_tobin_3', { n: 'Light for the Road', ch: DW, lv: 4, t: 'S', from: 'tobin', req: ['ms02'], offer: 'Light is the cheapest armour there is.', obj: [craft([B.TORCH], 16, 'Craft torches'), place([B.TORCH], 8, 'Place torches')], items: [it(bagId(0))] });
q('dw_tobin_4', { n: 'The Heavy Bag', ch: DW, lv: 6, t: 'S', from: 'tobin', req: ['ms08'], offer: 'A good bag is a second pair of hands.', obj: [craft([bagId(0), bagId(1)], 1, 'Craft a bag'), collect([I.LEATHER], 12, 'Leather')], items: [it(I.BREAD, 12)] });

// Hilda Ironwall
q('dw_hilda_1', { n: 'A Full Set of Leather', ch: DW, lv: 3, t: 'S', from: 'hilda', req: ['ms04'], offer: 'Wear all four pieces. Half a set is half a life.', obj: armorSet('leather'), items: [it(ringId('gold'))] });
q('dw_hilda_2', { n: 'Iron Resolve', ch: DW, lv: 7, t: 'S', from: 'hilda', req: ['dw_hilda_1'], offer: 'Now I would like to see you in iron.', done: 'Now you look like someone who intends to come back.', obj: armorSet('iron'), items: [it(necklaceId('gold'))] });

// Garrick Bladesworn
q('dw_garrick_1', { n: 'The Dummy Never Dodges', ch: DW, lv: 2, t: 'S', from: 'garrick', req: ['ms01'], offer: 'Hit the dummy until your arm shakes. It does not complain.', obj: [enter('training_yard', 'Visit the Training Yard'), craft([toolId('sword', 'wood'), toolId('sword', 'stone'), toolId('sword', 'iron')], 1, 'Craft a sword')], items: [it(I.ARROW, 12)] });
q('dw_garrick_2', { n: 'Sharp as a Promise', ch: DW, lv: 10, t: 'S', from: 'garrick', req: ['ms08'], offer: 'A blade you do not look after is a stick.', obj: [craft([B.GRINDSTONE], 1, 'Craft a grindstone'), craft([B.ANVIL], 1, 'Craft an anvil'), place([B.GRINDSTONE], 1, 'Place the grindstone'), place([B.ANVIL], 1, 'Place the anvil')], items: [it(I.JEWEL_DAWN)] });

// Fenna Longbow
q('dw_fenna_1', { n: 'A Quiver Full', ch: DW, lv: 3, t: 'S', from: 'fenna', req: ['ms01'], offer: 'A ranger without arrows is a hiker.', obj: [craft([I.BOW], 1, 'Craft a bow'), craft([I.ARROW], 32, 'Craft arrows')], items: [it(I.ARROW, 24)] });
q('dw_fenna_2', { n: 'Fletching', ch: DW, lv: 6, t: 'S', from: 'fenna', req: ['dw_fenna_1'], offer: 'Feathers from chickens, flint from gravel. Be patient with both.', obj: [collect([I.FEATHER], 12, 'Feathers'), collect([I.FLINT], 12, 'Flint'), craft([I.ARROW], 24, 'Craft arrows')], items: [it(I.CROSSBOW)] });

// Lysa Moonweaver
q('dw_lysa_1', { n: 'Ink and Paper', ch: DW, lv: 3, t: 'S', from: 'lysa', req: ['ms01'], offer: 'Every spell begins as a page.', obj: [collect([I.PAPER], 6, 'Paper'), craft([I.BOOK], 1, 'Craft a book')], items: [it(I.LAPIS_LAZULI, 6)] });
q('dw_lysa_2', { n: 'Glow of the Deep', ch: DW, lv: 7, t: 'S', from: 'lysa', req: ['dw_lysa_1'], offer: 'Lapis and glow berries, from the deep caves. Take a torch and a friend.', obj: [mine([B.LAPIS_ORE], 6, 'Mine lapis'), collect([I.GLOW_BERRIES], 8, 'Glow berries')], items: [it(B.BOOKSHELF)] });

// Smith Brannoc
q('dw_brannoc_1', { n: 'Cobble to Brick', ch: AB, lv: 3, t: 'S', from: 'brannoc', req: ['ms02'], offer: 'Rough stone for beginners, bricks for builders.', obj: [smelt([B.STONE], 8, 'Smelt cobblestone'), craft([B.STONE_BRICKS], 8, 'Craft stone bricks')], items: [it(B.TORCH, 16)] });
q('dw_brannoc_2', { n: 'Glass for the Chapel', ch: AB, lv: 5, t: 'S', from: 'brannoc', req: ['dw_brannoc_1'], offer: 'The chapel has no windows. Sand and a fire.', obj: [smelt([B.GLASS], 12, 'Smelt sand into glass'), collect([B.GLASS], 12, 'Glass')], items: [it(B.LANTERN)] });
q('dw_brannoc_3', { n: 'A Shield for the Watch', ch: AB, lv: 6, t: 'S', from: 'brannoc', to: 'varro', req: ['ms08'], offer: 'Varro\'s watch is running short of shields. Make two and take them to him.', obj: [craft([I.SHIELD], 2, 'Craft shields')], plus: 30 });
q('dw_brannoc_4', { n: 'The Rail Line', ch: AB, lv: 9, t: 'S', from: 'brannoc', req: ['ms08'], offer: 'Hauling ore by hand is for the young.', obj: [craft([B.RAIL_X], 16, 'Craft rails'), craft([I.MINECART], 1, 'Craft a minecart'), place([B.RAIL_X], 12, 'Place rails')], items: [it(B.POWERED_RAIL_X, 8)] });

// Ranger Isolde
q('dw_isolde_1', { n: 'Night Watch', ch: AB, lv: 4, t: 'S', from: 'isolde', req: ['ms04'], offer: 'The night has more than zombies. Learn them all.', obj: [kill(['spider'], 4, 'Kill spiders'), kill(['skeleton'], 4, 'Kill skeletons')], items: [it(I.ARROW, 24)] });
q('dw_isolde_2', { n: "The Ranger's Count", ch: AB, lv: 6, t: 'S', from: 'isolde', req: ['dw_isolde_1'], offer: 'Never fight one at close range. Never. I mean it.', obj: [kill(['creeper'], 3, 'Kill creepers'), collect([I.GUNPOWDER], 6, 'Gunpowder')], items: [it(I.FLINT_AND_STEEL)] });

// Captain Varro
q('dw_varro_1', { n: 'Watchman for a Night', ch: DW, lv: 3, t: 'S', from: 'varro', req: ['ms04'], offer: 'Stand on the wall and count. I will pay you in coin.', obj: [kill(['zombie'], 10, 'Kill zombies')], items: [it(I.SHIELD)] });
q('dw_varro_2', { n: 'Spider Season', ch: DW, lv: 5, t: 'S', from: 'varro', req: ['ms04'], offer: 'They come in autumn. Bring me the eyes; the apothecary counts them.', obj: [kill(['spider'], 8, 'Kill spiders'), collect([I.STRING], 6, 'String'), collect([I.SPIDER_EYE], 4, 'Spider eyes')], items: [it(I.COOKED_MEAT, 4)] });
q('dw_varro_3', { n: 'Burned Fields', ch: DW, lv: 8, t: 'S', from: 'varro', req: ['dw_varro_2'], offer: 'Somebody burned the east fields. I want the fuse ends. They tell me what burned them.', obj: [collect([I.SCORCHED_FUSE], 5, 'Scorched Fuses')], items: [it(toolId('axe', 'iron'))] });

// Elder Maren
q('dw_maren_1', { n: 'Bread for the Bell', ch: DW, lv: 4, t: 'S', from: 'maren', req: ['ms01'], offer: 'The bell-ringer is old and hungry. Feed him and he will ring it right.', obj: [collect([I.BREAD], 8, 'Bread')], items: [it(I.CAKE)] });
q('dw_maren_2', { n: 'The Old Hearth', ch: DW, lv: 10, t: 'S', from: 'maren', req: ['ms24'], offer: 'Light the old hearth in the square. It has been dark since Orrin.', obj: [craft([campfireId(0, true)], 2, 'Craft campfires'), place([campfireId(0, true)], 2, 'Place campfires')], items: [it(I.BREAD, 12)] });

// Healer Mirel
q('dw_mirel_1', { n: 'Cobwebs in the Undercroft', ch: AB, lv: 3, t: 'S', from: 'mirel', req: ['ms05'], offer: 'The old storm cellars are choked with webs. Take shears.', obj: [mine([B.COBWEB], 8, 'Clear cobwebs'), collect([I.STRING], 4, 'String')], items: [it(I.SHEARS)] });
q('dw_mirel_2', { n: 'Lanterns for the Dead', ch: AB, lv: 6, t: 'S', from: 'mirel', req: ['dw_mirel_1'], offer: 'The dead did not ask for much. A little light.', obj: [craft([B.LANTERN], 4, 'Craft lanterns'), place([B.LANTERN], 4, 'Place lanterns')], items: [it(B.SOUL_LANTERN)] });

// Farmer Wick
q('dw_wick_1', { n: 'Dirt Under the Nails', ch: AB, lv: 1, t: 'S', from: 'wick', req: ['ms01'], offer: 'Seeds are in the grass for anybody who looks. Make a hoe, and find me six.', obj: [craft([toolId('hoe', 'wood'), toolId('hoe', 'stone'), toolId('hoe', 'iron')], 1, 'Craft a hoe'), collect([I.WHEAT_SEEDS], 6, 'Wheat seeds')], items: [it(I.BREAD, 4)] });
q('dw_wick_2', { n: 'First Harvest', ch: AB, lv: 2, t: 'S', from: 'wick', req: ['dw_wick_1'], offer: 'Water nearby. Patience. Then the sickle.', obj: [place([I.WHEAT_SEEDS], 6, 'Sow wheat seeds'), collect([I.WHEAT], 12, 'Wheat')], items: [it(I.BREAD, 8)] });
q('dw_wick_3', { n: 'The Root Cellar', ch: AB, lv: 4, t: 'S', from: 'wick', req: ['dw_wick_2'], offer: 'Roots keep through winter.', obj: [collect([I.POTATO], 10, 'Potatoes'), collect([I.CARROT], 10, 'Carrots'), smelt([I.BAKED_POTATO], 6, 'Bake potatoes')], items: [it(I.BAKED_POTATO, 6)] });
q('dw_wick_4', { n: 'The Pumpkin Patch', ch: AB, lv: 6, t: 'S', from: 'wick', req: ['dw_wick_3'], offer: 'Pie for the Elder, cake for the child.', obj: [collect([B.PUMPKIN], 4, 'Pumpkins'), collect([B.MELON], 4, 'Melons'), craft([I.PUMPKIN_PIE], 2, 'Craft pumpkin pies'), craft([I.CAKE], 1, 'Craft a cake')], items: [it(I.SHEARS)] });

// Nell Hearthwood
q('dw_nell_1', { n: 'Stew for Seven', ch: AB, lv: 2, t: 'S', from: 'nell', req: ['ms03'], offer: 'Brown and red. Never the pale ones.', obj: [collect(MUSHROOMS, 4, 'Mushrooms'), craft([I.MUSHROOM_STEW], 4, 'Craft mushroom stew')], items: [it(I.MUSHROOM_STEW, 2)] });
q('dw_nell_2', { n: 'Sweet Tooth', ch: AB, lv: 4, t: 'S', from: 'nell', req: ['dw_nell_1'], offer: 'The child has not smiled in a week.', obj: [collect([I.COCOA_BEANS], 6, 'Cocoa beans'), craft([I.COOKIE], 6, 'Craft cookies')], items: [it(I.CAKE)] });
q('dw_nell_3', { n: 'Rabbit for the Road', ch: AB, lv: 7, t: 'S', from: 'nell', req: ['dw_nell_2'], offer: 'A stew that travels well.', obj: [kill(['rabbit'], 4, 'Hunt rabbits'), craft([I.RABBIT_STEW], 3, 'Craft rabbit stew')], items: [it(I.RABBIT_STEW, 3)] });

// Sister Ilse
q('dw_ilse_1', { n: 'Flowers for the Road', ch: DW, lv: 5, t: 'S', from: 'ilse', req: ['ms04'], offer: 'The road to the chapel is bleak. Make it less so.', obj: [place([B.ROSE], 4, 'Plant roses'), place([B.DANDELION], 4, 'Plant dandelions')], items: [it(B.TORCH, 12)] });
q('dw_ilse_2', { n: "A Warden's Grave", ch: DW, lv: 9, t: 'S', from: 'ilse', req: ['ms10'], offer: 'Orrin\'s wardens lie in the chapel yard. Honour them.', obj: [collect([I.BONE], 8, 'Bones'), place([B.ROSE, B.DANDELION, B.TULIP_RED, B.TULIP_WHITE, B.OXEYE_DAISY, B.CORNFLOWER], 4, 'Lay flowers')], items: [it(I.LAPIS_LAZULI, 4)] });

// Warden Hale
q('dw_hale_1', { n: 'Spore Samples', ch: DW, lv: 6, t: 'S', from: 'hale', req: ['ms10'], offer: 'The spores stick to everything. Bring me jars so that I can count them.', obj: [kill(['spore_puff'], 5, 'Kill spore puffs'), collect([I.SPORE_JAR], 3, 'Spore Jars')], items: [it(I.HOLLOW_SIGIL)] });
q('dw_hale_2', { n: 'Moss for the Wounded', ch: DW, lv: 8, t: 'S', from: 'hale', req: ['dw_hale_1'], offer: 'Moss is the only dressing we have. Do not ask.', obj: [kill(['moss_lurker'], 6, 'Kill moss lurkers'), collect([B.MOSS_BLOCK], 8, 'Moss blocks')], items: [it(I.HOLLOW_SIGIL)] });

// Auctioneer Corvin and Stashkeeper Bram
q('dw_corvin_1', { n: 'Putting Up a Price', ch: DW, lv: 6, t: 'S', from: 'auctioneer', req: ['ms08'], offer: 'Everything has a price. Learn the board. Bring me a sample lot.', obj: [collect([I.COOKED_MEAT], 4, 'Cooked meat'), collect([I.EMERALD], 1, 'An emerald')], plus: 60 });
q('dw_bram_1', { n: 'A Place for Everything', ch: DW, lv: 4, t: 'S', from: 'stashkeeper', req: ['ms08'], offer: 'What you cannot carry you can keep in the Stash. What you cannot keep, you can sell.', obj: [craft([B.CHEST], 2, 'Craft chests'), place([B.CHEST], 2, 'Place chests')], items: [it(bagId(1))] });

// ============================================================================================================
// SIDE QUESTS — the villages, the town and the castle
// ============================================================================================================

const RH = 'Reedhollow';
q('rh_tamsin_1', { n: 'Slime in the Well', ch: RH, lv: 6, t: 'S', from: 'tamsin', req: ['ms12'], offer: 'Something green is in our water.', obj: [kill(['slime'], 10, 'Kill slimes'), collect([I.SLIMEBALL], 6, 'Slimeballs')], items: [it(I.BREAD, 8)] });
q('rh_tamsin_2', { n: 'Reed Roofs', ch: RH, lv: 7, t: 'S', from: 'tamsin', req: ['ms12'], offer: 'The roofs leak, the ink runs, the children cry.', obj: [collect([B.SUGAR_CANE], 16, 'Sugar cane'), craft([I.PAPER], 8, 'Craft paper')], items: [it(I.BREAD, 6)] });
q('rh_tamsin_3', { n: 'Lanterns on the Water', ch: RH, lv: 8, t: 'S', from: 'tamsin', req: ['rh_tamsin_2'], offer: 'On the night of the drowned we float lights.', obj: [place([B.LANTERN], 8, 'Place lanterns')], items: [it(I.BOAT)] });
q('rh_dunstan_1', { n: 'The Big One', ch: RH, lv: 7, t: 'S', from: 'dunstan', req: ['ms14'], offer: 'There is a salmon in the deep pool as long as my arm.', obj: [collect([I.RAW_SALMON], 4, 'Raw salmon')], items: [it(I.FISHING_ROD)] });
q('rh_dunstan_2', { n: 'Pufferfish Warning', ch: RH, lv: 8, t: 'S', from: 'dunstan', req: ['rh_dunstan_1'], offer: 'Do not eat them. Do not let the child near them. I want them out of the nets.', obj: [collect([I.PUFFERFISH], 3, 'Pufferfish')], items: [it(I.BREAD, 12)] });

const SM = 'Sandmere';
q('sm_idris_1', { n: 'Sand and Glass', ch: SM, lv: 8, t: 'S', from: 'idris', req: ['ms16'], offer: 'Glass sells in every market from here to the sea.', obj: [smelt([B.GLASS], 16, 'Smelt glass'), collect([B.GLASS], 16, 'Glass')], plus: 60 });
q('sm_idris_2', { n: 'The Missing Camel', ch: SM, lv: 9, t: 'S', from: 'idris', req: ['sm_idris_1'], offer: 'Some say my camel was taken by the dust. I say it was a thief.', obj: [kill(['husk'], 4, 'Kill husks'), collect([I.LEATHER], 4, 'Leather')], items: [it(toolId('pickaxe', 'iron'))] });
q('sm_oska_1', { n: 'Red Stone Delve', ch: SM, lv: 8, t: 'S', from: 'oska', req: ['ms16'], offer: 'Red dust lights the lamps and opens the doors.', obj: [mine([B.REDSTONE_ORE], 10, 'Mine redstone')], plus: 60 });
q('sm_oska_2', { n: 'Gold in the Bones', ch: SM, lv: 9, t: 'S', from: 'oska', req: ['sm_oska_1'], offer: 'Gold is the only thing the dead leave behind.', obj: [mine([B.GOLD_ORE], 6, 'Mine gold ore'), smelt([I.GOLD_INGOT], 6, 'Smelt gold')], items: [it(ringId('gold'))] });
q('sm_oska_3', { n: 'Nest of Eight Legs', ch: SM, lv: 9, t: 'S', from: 'oska', req: ['sm_oska_1'], offer: 'They have taken the old shaft.', obj: [kill(['spider'], 8, 'Kill spiders'), collect([I.STRING], 8, 'String')], items: [it(I.COOKED_MUTTON, 4)] });

const FG = 'Frostgate';
q('fg_halvard_1', { n: 'Spruce for the Wall', ch: FG, lv: 10, t: 'S', from: 'halvard', req: ['ms20'], offer: 'The wall must be higher than the drifts.', obj: [mine([B.SPRUCE_LOG], 24, 'Chop spruce'), craft([B.FENCE], 24, 'Craft fences')], items: [it(I.MUSHROOM_STEW, 2)] });
q('fg_halvard_2', { n: 'Warm Hearts', ch: FG, lv: 10, t: 'S', from: 'halvard', req: ['fg_halvard_1'], offer: 'We are cold in the middle of the square.', obj: [craft([campfireId(0, true)], 4, 'Craft campfires'), place([campfireId(0, true)], 4, 'Place campfires')], items: [it(I.BREAD, 12)] });
q('fg_sigrun_1', { n: 'Wolf Count', ch: FG, lv: 10, t: 'S', from: 'sigrun', req: ['ms20'], offer: 'More every year.', obj: [kill(['wolf'], 6, 'Kill wolves')], items: [it(I.ARROW, 24)] });
q('fg_sigrun_2', { n: 'Fish Under the Ice', ch: FG, lv: 11, t: 'S', from: 'sigrun', req: ['fg_sigrun_1'], offer: 'Winter fish are the best, if you can stand the wait.', obj: [collect(RAW_FISH, 6, 'Raw fish'), smelt(COOKED_FISH, 6, 'Cook fish')], items: [it(I.FISHING_ROD)] });
q('fg_sigrun_3', { n: 'The Bear of the Pass', ch: FG, lv: 11, t: 'S', from: 'sigrun', req: ['fg_sigrun_2'], offer: 'It has taken two of my dogs. I want a claw to show them.', obj: [kill(['polar_bear'], 1, 'Kill the polar bear'), collect([I.BEAR_CLAW], 1, 'A Bear Claw')], items: [it(I.DIAMOND)] });

const HM = 'Highmarket';
q('hm_thessaly_1', { n: 'Trade Winds', ch: HM, lv: 11, t: 'S', from: 'thessaly', req: ['ms25'], offer: 'The market is the heart. Trade, and the heart beats.', obj: [collect([I.EMERALD], 6, 'Emeralds (trade with a villager)')], items: [it(bagId(3))] });
q('hm_thessaly_2', { n: 'The Toll Road', ch: HM, lv: 12, t: 'S', from: 'thessaly', req: ['hm_thessaly_1'], offer: 'The caravans pay in emeralds. The mine is dry. Dig.', obj: [mine([B.EMERALD_ORE], 4, 'Mine emerald ore')], items: [it(I.JEWEL_DAWN, 2)] });
q('hm_vael_1', { n: 'Bottled Experience', ch: HM, lv: 12, t: 'S', from: 'vael', req: ['ms28'], offer: 'Lapis is half of every enchantment.', obj: [collect([I.LAPIS_LAZULI], 12, 'Lapis lazuli'), collect([I.BOOK], 1, 'A book')], plus: 90 });
q('hm_vael_2', { n: 'The Fifth Pillar', ch: HM, lv: 13, t: 'S', from: 'vael', req: ['hm_vael_1'], offer: 'Shelves make the table strong.', obj: [craft([B.BOOKSHELF], 2, 'Craft bookshelves'), place([B.BOOKSHELF], 2, 'Place them beside the table')], items: [it(I.JEWEL_BLOOM)] });
q('hm_vael_3', { n: 'A Piece to Raise', ch: HM, lv: 13, t: 'S', from: 'vael', req: ['hm_vael_2'], offer: 'Show me you know when to stop.', obj: [collect([I.JEWEL_DAWN], 3, 'Jewels of Dawn (handed over for the lesson)')], items: [it(I.JEWEL_RIFT)] });
q('hm_trade_1', { n: "The Journeyman's Bargain", ch: HM, lv: 12, t: 'S', from: 'thessaly', req: ['hm_thessaly_1'], offer: 'The library will pay well.', obj: [collect([I.BOOK], 4, 'Books'), collect([I.PAPER], 4, 'Paper')], coins: 150 });

const GK = 'Greykeep';
q('gk_aldren_1', { n: 'The Sealed Coffer', ch: GK, lv: 13, t: 'S', from: 'aldren', req: ['ms29'], offer: 'A box the caravan was paid to bring me, three hundred years late. It must be with the dead.', obj: [collect([I.SEALED_COFFER], 1, 'The Sealed Coffer')], items: [it(I.JEWEL_DAWN)] });
q('gk_aldren_2', { n: 'Stones of the Wall', ch: GK, lv: 14, t: 'S', from: 'aldren', req: ['ms29'], offer: 'The wall has gaps. I like to think I know why.', obj: [mine(STONES, 32, 'Mine stone'), craft([B.STONE_BRICKS], 32, 'Craft stone bricks')], items: [it(armorId(1, 'iron'))] });
q('gk_aldren_3', { n: 'Water in the Moat', ch: GK, lv: 15, t: 'S', from: 'aldren', req: ['gk_aldren_2'], offer: 'A moat with no water is a ditch. Bring me four buckets of it.', obj: [collect([I.WATER_BUCKET], 4, 'Buckets of water')], items: [it(I.DIAMOND)] });
q('gk_aldren_4', { n: 'The Garrison Eats', ch: GK, lv: 16, t: 'S', from: 'aldren', req: ['gk_aldren_3'], offer: 'The garrison is large and likes second helpings.', obj: [collect([I.COOKED_CHICKEN], 16, 'Cooked chicken')], items: [it(mountItemId('fenrir_blue'))] });

// ============================================================================================================
// CLASS LINES — each only for its own class
// ============================================================================================================

const WAR = 'Class: Warrior';
const MAG = 'Class: Mage';
const RAN = 'Class: Ranger';
const classBook = (cls: ClassId, ability: AbilityId): QuestDef['reward']['classItems'] => ({ [cls]: [book(ability)] });
const capstone = [it(I.AURELION_CODEX), it(I.JEWEL_RIFT)];

q('cl_w1', { n: 'Oath of the Blade', ch: WAR, lv: 3, t: 'C', cls: 'warrior', from: 'garrick', req: ['ms01'], offer: 'A warrior does not borrow a blade. Make one, and then hit the dummy until your arm shakes.', done: 'Now say the oath. Ground Slam is yours.', obj: [craft([I.GREATSWORD], 1, 'Craft a greatsword'), enter('training_yard', 'Visit the Training Yard')], classItems: classBook('warrior', 'ground_slam') });
q('cl_w2', { n: 'Shield Wall', ch: WAR, lv: 6, t: 'C', cls: 'warrior', from: 'garrick', req: ['cl_w1'], offer: 'A shield is a second sword that never tires.', obj: [craft([I.SHIELD], 1, 'Craft a shield'), kill(['zombie'], 12, 'Kill zombies')], classItems: classBook('warrior', 'shield_bash') });
q('cl_w3', { n: 'The Charge', ch: WAR, lv: 9, t: 'C', cls: 'warrior', from: 'garrick', req: ['cl_w2'], offer: 'Stand still and you die. Charge.', obj: [kill(['skeleton'], 10, 'Kill skeletons'), mine([B.IRON_ORE], 12, 'Mine iron ore')], classItems: classBook('warrior', 'charge') });
q('cl_w4', { n: 'Unbroken', ch: WAR, lv: 12, t: 'C', cls: 'warrior', from: 'garrick', req: ['cl_w3'], offer: 'The Ashen Knights never broke. Learn from them, and then break them.', obj: [...armorSet('iron'), kill(['ashen_knight'], 8, 'Kill ashen knights')], classItems: classBook('warrior', 'iron_defense') });
q('cl_w5', { n: 'Master at Arms', ch: WAR, lv: 16, t: 'C', cls: 'warrior', from: 'garrick', req: ['cl_w4'], offer: 'There is nothing left I can teach you. Take this, and make the anvil ring.', obj: [collect([I.DIAMOND], 3, 'Diamonds'), craft([B.ANVIL], 1, 'Craft an anvil')], items: capstone });

q('cl_m1', { n: 'The First Spark', ch: MAG, lv: 3, t: 'C', cls: 'mage', from: 'lysa', req: ['ms01'], offer: 'Spells need something to flow through. Make a wand or a book, and test it on the dummies.', done: 'There. Do you feel it? That is Fireball.', obj: [craft([I.SPELLBOOK, I.WAND, I.STAFF], 1, 'Craft a spellbook, wand or staff'), enter('training_yard', 'Visit the Training Yard')], classItems: classBook('mage', 'fireball') });
q('cl_m2', { n: 'Frostbite', ch: MAG, lv: 6, t: 'C', cls: 'mage', from: 'lysa', req: ['cl_m1'], offer: 'Cold is the opposite of fire, and just as hungry.', obj: [mine([B.SNOW_BLOCK, B.SNOW], 8, 'Gather snow'), kill(['stray'], 8, 'Kill strays')], classItems: classBook('mage', 'frost_nova') });
q('cl_m3', { n: 'Falling Star', ch: MAG, lv: 9, t: 'C', cls: 'mage', from: 'lysa', req: ['cl_m2'], offer: 'A meteor is only a rock with enough ambition.', obj: [mine([B.GOLD_ORE], 6, 'Mine gold ore'), collect([I.REDSTONE], 6, 'Redstone'), kill(['husk'], 6, 'Kill husks')], classItems: classBook('mage', 'meteor') });
q('cl_m4', { n: 'Ward of Light', ch: MAG, lv: 12, t: 'C', cls: 'mage', from: 'lysa', req: ['cl_m3'], offer: 'The best attack is a shield that does not break.', obj: [craft([B.ENCHANTING_TABLE], 1, 'Craft an enchanting table'), collect([I.LAPIS_LAZULI], 12, 'Lapis lazuli')], classItems: classBook('mage', 'arcane_shield') });
q('cl_m5', { n: "The Archmage's Trial", ch: MAG, lv: 16, t: 'C', cls: 'mage', from: 'lysa', req: ['cl_m4'], offer: 'The last trial is the Hollow priests. They keep a flame that is not theirs.', obj: [kill(['hollow_priest'], 6, 'Kill hollow priests'), collect([I.DIAMOND], 3, 'Diamonds')], items: capstone });

q('cl_r1', { n: 'A Steady Hand', ch: RAN, lv: 3, t: 'C', cls: 'ranger', from: 'fenna', req: ['ms01'], offer: 'Make your own bow. A bow you made shoots truer.', done: 'Breathe in, loose on the breath out. Piercing Shot is yours.', obj: [craft([I.BOW, I.CROSSBOW], 1, 'Craft a bow'), enter('training_yard', 'Visit the Training Yard')], classItems: classBook('ranger', 'piercing_shot') });
q('cl_r2', { n: 'Roll With It', ch: RAN, lv: 6, t: 'C', cls: 'ranger', from: 'fenna', req: ['cl_r1'], offer: 'The best way to take a hit is not to be there.', obj: [kill(['spider'], 6, 'Kill spiders'), collect([I.STRING], 6, 'String')], classItems: classBook('ranger', 'evasive_roll') });
q('cl_r3', { n: 'Snares and Traps', ch: RAN, lv: 9, t: 'C', cls: 'ranger', from: 'fenna', req: ['cl_r2'], offer: 'Hunt the hunters, and learn how they move.', obj: [kill(['fox'], 4, 'Kill foxes'), kill(['wolf'], 4, 'Kill wolves')], classItems: classBook('ranger', 'bear_trap') });
q('cl_r4', { n: 'Rain of Arrows', ch: RAN, lv: 12, t: 'C', cls: 'ranger', from: 'fenna', req: ['cl_r3'], offer: 'One arrow is a threat. Sixty-four is a weather report.', obj: [craft([I.ARROW], 64, 'Craft arrows'), kill(['skeleton'], 10, 'Kill skeletons')], classItems: classBook('ranger', 'rain_of_arrows') });
q('cl_r5', { n: 'Warden of the Wilds', ch: RAN, lv: 16, t: 'C', cls: 'ranger', from: 'fenna', req: ['cl_r4'], offer: 'Shades are the fastest thing in the dark. Hit them anyway.', obj: [kill(['shade'], 6, 'Kill shades'), collect([I.DIAMOND], 3, 'Diamonds')], items: capstone });

// ============================================================================================================
// THE WAYFARER'S LEDGER
// ============================================================================================================

const EX = "The Wayfarer's Ledger";
q('ex_1', { n: 'The Road to the Chapel', ch: EX, lv: 4, t: 'S', from: 'isolde', req: ['ms04'], offer: 'The gravel road east ends at a ruin. Go and look at it, in daylight, with a torch in your pack.', obj: [enter('chapel_ruin', 'Visit the Chapel Ruin')], items: [it(B.TORCH, 12)] });
q('ex_2', { n: 'Where You Were Found', ch: EX, lv: 6, t: 'S', from: 'isolde', req: ['ex_1'], offer: 'Walk back to the clearing in the Whisperwood, and look at it with your eyes open this time.', obj: [enter('whisper_clearing', 'Visit the Clearing')], items: [it(I.BREAD, 6)] });
q('ex_3', { n: 'The Three Hollows', ch: EX, lv: 12, t: 'S', from: 'isolde', req: ['ms24'], offer: 'Three holes in the ground, and one pilgrim who has been in all of them. Come and draw me the map.', obj: [enter('reed_grotto', 'Visit the Reed Grotto'), enter('sand_crypt', 'Visit the Sand Crypt'), enter('frost_vault', 'Visit the Frost Vault')], items: [it(I.COMPASS)] });
q('ex_4', { n: 'The Villages on the Map', ch: EX, lv: 8, t: 'S', from: 'isolde', req: ['ms16'], offer: 'Walk the road once, and you will never be lost.', obj: [enter('reedhollow', 'Visit Reedhollow'), enter('sandmere', 'Visit Sandmere'), enter('frostgate', 'Visit Frostgate')], items: [it(I.BOAT)] });
q('ex_5', { n: 'Cairn Builder', ch: EX, lv: 5, t: 'S', from: 'isolde', req: ['ex_1'], offer: 'A cairn marks the way for the next one.', obj: [place([B.COBBLE], 16, 'Stack a cairn')], items: [it(B.TORCH, 12)] });
q('ex_6', { n: 'The Far Country', ch: EX, lv: 15, t: 'S', from: 'isolde', req: ['ms32'], offer: 'There is a whole world past the villages.', obj: [enter('highmarket', 'Visit Highmarket'), enter('greykeep', 'Visit Greykeep'), enter('whisper_clearing', 'Return to the Clearing')], items: [it(I.DIAMOND)] });

// ============================================================================================================
// THE ENDGAME
// ============================================================================================================

const EG = 'Endgame';
q('eg_wing_1', { n: 'Gladewings', ch: EG, lv: 14, t: 'S', from: 'ivo', req: ['ms28'], offer: 'Every flight starts with a frame, and a Jewel of Dawn to wake it.', give: [it(I.JEWEL_DAWN)], obj: [craft([I.WING_FRAME], 1, 'Craft a wing frame'), craft([wingItemId('gladewings')], 1, 'Craft the Gladewings')], plus: 120 });
q('eg_wing_2', { n: 'Cinderwings', ch: EG, lv: 16, t: 'S', from: 'ivo', req: ['eg_wing_1'], offer: 'Horns of bone and powder, leather, and fire.', give: [it(I.JEWEL_DAWN)], obj: [craft([I.IMP_HORN], 6, 'Craft imp horns'), craft([wingItemId('cinderwings')], 1, 'Craft the Cinderwings')] });
q('eg_wing_3', { n: 'Skywings', ch: EG, lv: 18, t: 'S', from: 'ivo', req: ['eg_wing_2'], offer: 'Feathers bright with glowstone, and gold.', give: [it(I.JEWEL_DAWN)], obj: [craft([I.SERAPH_FEATHER], 4, 'Craft seraph feathers'), craft([wingItemId('skywings')], 1, 'Craft the Skywings')] });
q('eg_wing_4', { n: 'The Storm Feather', ch: EG, lv: 19, t: 'S', from: 'ivo', req: ['eg_wing_3'], offer: 'The second wings are made from the first, a storm feather and a Jewel of the Rift.', give: [it(I.JEWEL_RIFT)], obj: [craft([I.STORM_FEATHER], 1, 'Craft a storm feather'), craft([wingItemId('ruinwings'), wingItemId('radiantwings'), wingItemId('stormwings')], 1, 'Craft one upgraded pair of wings')] });
q('eg_comp_1', { n: 'Cinder at Your Shoulder', ch: EG, lv: 15, t: 'S', from: 'vael', req: ['ms28'], offer: 'An imp of embers: horns, a heart of coal and red dust, and a Jewel of the Rift.', give: [it(I.JEWEL_RIFT)], obj: [craft([I.CINDER_HEART], 1, 'Craft a cinder heart'), craft([companionItemId('cinder-imp')], 1, 'Craft the Cinder Imp')] });
q('eg_comp_2', { n: 'Dawn at Your Shoulder', ch: EG, lv: 16, t: 'S', from: 'vael', req: ['eg_comp_1'], offer: 'A seraph of the dawn: feathers, a ring of gold, and a Jewel of Dawn.', give: [it(I.JEWEL_DAWN)], obj: [craft([I.HALO_RING], 1, 'Craft a halo ring'), craft([companionItemId('dawn-seraph')], 1, 'Craft the Dawn Seraph')] });
q('eg_tide_1', { n: 'The Gilded Tithe', ch: EG, lv: 15, t: 'S', from: 'varro', req: ['ms33'], offer: 'Every half hour the Rift pays what it owes. In gold, and with teeth.', obj: [kill(['gilt_imp'], 20, 'Kill gilt imps'), kill(['gilt_hound'], 10, 'Kill gilt hounds')], items: [it(I.AURELION_CODEX)] });
q('eg_tide_2', { n: 'Scales of Aurelion', ch: EG, lv: 17, t: 'S', from: 'varro', req: ['eg_tide_1'], offer: 'The drakes carry scales of true gold. Bring me four.', obj: [kill(['gilt_drake'], 4, 'Kill gilt drakes'), collect([I.GILDED_SCALE], 4, 'Gilded Scales')], items: [it(I.AURELION_CODEX)] });
q('eg_tide_3', { n: 'The Golden Colossus', ch: EG, lv: 19, t: 'S', from: 'varro', req: ['eg_tide_2'], offer: 'Among the shy gold of the Tide walks one that is not small. Find the colossus and bring it down.', obj: [kill(['gilt_colossus'], 1, 'Kill a gilt colossus')], items: [it(I.AURELION_CODEX, 2), it(I.JEWEL_RIFT)] });
q('eg_rift_1', { n: 'Closing the Tear', ch: EG, lv: 17, t: 'S', from: 'hale', req: ['ms33'], offer: 'Close the tear and be paid.', obj: [kill(hostiles, 30, 'Kill monsters (best while a Rift is open)')], items: [it(I.JEWEL_RIFT)] });
q('eg_hollow_1', { n: 'Ashes Again', ch: EG, lv: 20, t: 'S', from: 'hale', req: ['ms38'], offer: 'The Seal holds, but the Court remembers. Walk it again for the new ones.', give: [it(I.HOLLOW_SIGIL)], obj: [kill(['hollow_king'], 1, 'Defeat The Hollow King again')], items: [it(I.AURELION_CODEX)] });

export const STORY_QUESTS: readonly QuestDef[] = list;
