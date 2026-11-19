import { ABILITIES, ABILITY_BY_ID, CLASSES, CLASS_BALANCE, CLASS_IDS, CLASS_LEVELS, LEVEL_SCALING, abilitiesOf, computeStats, skillBookPrice, type AbilityDef, type AbilityId, type ClassId } from '@solrift/shared';

/**
 * What the class pages (`/classes/<id>`) say. The numbers come from the game's own data (classes.ts, abilities.ts), so a
 * rebalance shows up here by itself; this file only adds the words: how a class plays, and what each ability is for.
 */

/** The keys of the four ability buttons (the game's own: see gameKeys.ts). */
export const ABILITY_KEY_LABELS = ['Z', 'X', 'C', 'G'] as const;

/** One line of "how it works" on an ability card. */
export interface Fact {
  label: string;
  value: string;
}

export interface AbilityGuide {
  /** What it is for, in a sentence or two. */
  use: string;
  /** A tip that comes from playing it. */
  tip: string;
}

export interface Combo {
  name: string;
  /** Ability ids, in the order they are cast. */
  steps: AbilityId[];
  text: string;
}

export interface ClassGuide {
  /** A few paragraphs: what the class is and how a fight feels. */
  intro: string[];
  /** How the class attacks without using an ability (its starting weapon). */
  basic: { title: string; text: string };
  /** One line for each item of `CLASSES[id].startingKit`, in that order. */
  kit: string[];
  /** What the resource is and how it behaves. */
  resource: string;
  /** Good teammates and bad matchups. */
  party: string;
  combos: Combo[];
  tips: string[];
}

export const GUIDE: Record<ClassId, ClassGuide> = {
  warrior: {
    intro: [
      'The Warrior is the one who walks up to the monster. With the most health of the three classes, a hide that turns a fifth of every blow aside and the strongest melee damage, the Warrior is built to stand in the middle of a fight and stay there.',
      'The Warrior\u2019s abilities are about control rather than range: leap on a crowd and stun it, bash a single enemy off its feet, charge across a gap, then harden up when the pack turns on you. In a party the Warrior pulls the attention of everything nearby, which gives the Mage and the Ranger room to work.',
    ],
    basic: {
      title: 'Sword and shield',
      text: 'You start with a stone sword and a shield. Swinging the sword is a melee attack, the kind of damage the Warrior is best at (25% more than the base). The shield sits in your off hand and blocks. Nothing here costs Stamina: abilities do, a swing never does.',
    },
    kit: ['Your weapon. Melee damage, no cost, upgrade it with iron, gold and diamond as you find them.', 'Held in the off hand. Hold the use button (right mouse) to raise it: after a quarter of a second it stops the hits that land on it.'],
    resource: 'Stamina is spent by every ability and comes back by itself, six points a second. The Warrior\u2019s abilities are heavy (20 to 30 each), so the rhythm is: slam, bash, rest, charge, not all four at once.',
    party: 'Stand in front. Mages and Rangers deal more damage than you do, but only while nothing is chewing on them. Against a pack of ranged enemies, such as skeletons, close the distance with Charge first.',
    combos: [
      { name: 'Opening a fight', steps: ['charge', 'ground_slam', 'shield_bash'], text: 'Charge into the middle of the group, slam to stun and launch everything around you, then bash whichever enemy is still standing in front of you.' },
      { name: 'Taking a beating', steps: ['iron_defense', 'ground_slam'], text: 'When three monsters are on you, harden first. With Iron Defense up you take 40% of the damage you would otherwise, and the slam takes them all off you for a moment.' },
    ],
    tips: ['Stun is your best defense: an enemy that is stunned is not hitting you. Slam and Bash both do it.', 'Charge goes where you look, not where you walk. Aim it before you press it.', 'Keep Iron Defense for a real emergency. Its cooldown is almost four times its duration.', 'A Warrior is slower than a Ranger. You cannot run from a fight you do not want, so pick them.'],
  },
  mage: {
    intro: [
      'The Mage is fragile on purpose. With the least health of the three classes and a thin defense, the Mage lives by staying away. In return nothing in the game deals more damage from range: spell damage is half again the base, and the abilities hit areas, not single targets.',
      'The Mage sets fire to things, slows what runs at it and calls a meteor down on whatever is left. Every spell costs mana, so the Mage fights in bursts: spend, back off, wait for the pool to fill, go again.',
    ],
    basic: {
      title: 'The wand',
      text: 'You start with a wand: each swing sends a small bolt of magic that costs 4 mana. It is spell damage, the Mage\u2019s best kind, and it is the cheapest thing you can do in a fight. It is your filler between abilities, not your opening.',
    },
    kit: ['Your weapon. Fires a bolt at a distance for 4 mana a shot.', 'Held in the off hand: 12% more spell damage, 20 more mana and a faster mana regeneration.'],
    resource: 'Mana is the biggest pool in the game (120) and refills at seven points a second. Fireball is cheap enough to cast again and again; Meteor and Frost Nova are what you save it for.',
    party: 'Stay behind the Warrior. The Mage is the first thing monsters want and the last thing that can take a hit: 14 health is seven hearts. Arcane Shield soaks up almost all of it once, which is time to run, not a reason to stand still.',
    combos: [
      { name: 'Kiting', steps: ['frost_nova', 'fireball', 'fireball'], text: 'When something reaches you, freeze it in place with Frost Nova, back away, and set it alight twice from range. It burns while it walks towards you at 40% speed.' },
      { name: 'Clearing a pack', steps: ['frost_nova', 'meteor'], text: 'Slowed enemies cluster. Slow them, then aim the meteor at the middle of the group. It lands 1.3 seconds later, so it hits what is still there.' },
    ],
    tips: ['Look where the enemy is going, not where it is. Meteor lands after a delay and Fireball takes time to fly.', 'Fireball sets targets on fire: a burning enemy keeps taking damage after you stop casting.', 'Mana does not run out in one fight if you mix the wand with abilities. Do not spend all of it on the first volley.', 'Never cast Arcane Shield after you are hurt. Cast it as the fight starts.'],
  },
  ranger: {
    intro: [
      'The Ranger is the fastest of the three, and the most precise. Quick on foot, the highest chance to land a critical hit, and a bow that hits harder than anyone else\u2019s. A Ranger does not take blows; a Ranger is not where the blow lands.',
      'The Ranger\u2019s abilities are about position: a shot that pierces a whole line, a roll that dodges anything, a trap to hold one enemy in place and a rain of arrows for the ones that follow. None of it is as heavy as the Warrior\u2019s or as big as the Mage\u2019s, but all of it can be done while moving.',
    ],
    basic: {
      title: 'The bow',
      text: 'You start with a bow and 32 arrows. Drawing and releasing the bow is ranged damage, the Ranger\u2019s kind (30% more than the base), and every critical hit lands for 80% extra. Arrows are the Ranger\u2019s one cost outside of Focus: keep a stack, and craft more.',
    },
    kit: ['Your weapon. Ranged damage, uses an arrow for every shot.', 'Thirty-two arrows to start with. Every shot of the bow uses one, so craft more before you run low.', 'Held in the off hand: 5% more chance to land a critical hit, and critical hits hit 10% harder.'],
    resource: 'Focus refills fastest (eight a second) of the three resources, and the Ranger\u2019s abilities cost between 15 and 40. That is enough to use one every few seconds while you keep moving.',
    party: 'Stay at the edge of the fight and move around it. Enemies chasing a Warrior run into a line, and a line is what Piercing Shot is for. Ask the Warrior to hold the front; place the traps behind the Warrior.',
    combos: [
      { name: 'Controlling one enemy', steps: ['bear_trap', 'piercing_shot'], text: 'Drop a trap where the enemy will walk, then shoot it as it struggles. Rooted for four seconds is four free seconds.' },
      { name: 'Escaping and punishing', steps: ['evasive_roll', 'rain_of_arrows'], text: 'Roll out of danger, then put the volleys on the spot you rolled away from. Whatever follows you walks through them.' },
    ],
    tips: ['Evasive Roll goes the way you are moving (backwards if you stand still), and you cannot be hurt while rolling. Time it for a hit.', 'Aim a trap at the floor in front of a doorway or a corridor. The first enemy to step in is rooted.', 'Move before you shoot. The Ranger\u2019s speed is the main defense, not the health.', 'Rain of Arrows lands in volleys, one every half a second for three seconds. Enemies that stay in it take all of them.'],
  },
};

/** What each ability is for, and a tip. */
export const ABILITY_GUIDE: Record<AbilityId, AbilityGuide> = {
  ground_slam: {
    use: 'Your answer to being surrounded. You jump, you land, and everything around the place you land is hurt, thrown into the air and stunned. It is the Warrior\u2019s only area attack, so it is the one that matters when there are more of them than of you.',
    tip: 'You leap forward as well as up, so you land ahead of where you stood: aim it into the group, not at your own feet.',
  },
  shield_bash: {
    use: 'A short, wide hit for what is in front of you: damage, a stun and a shove that throws them back out of reach. Use it to stop one enemy from hitting you or to knock something off an ally.',
    tip: 'It only reaches about three blocks, so turn to face them first. It is the cheapest of the Warrior\u2019s abilities.',
  },
  charge: {
    use: 'Closes the distance. You rush eight blocks along the way you are looking, hitting and flinging aside anything you pass. Use it to reach an archer, to cross a gap or to join a fight that is not next to you.',
    tip: 'Enemies in the way are flung aside rather than stopping you, so look past the first one to where you want to end up.',
  },
  iron_defense: {
    use: 'For six seconds you take half of the damage you would otherwise. It stacks with the Warrior\u2019s own hide, so in total only 40% reaches your health. Your emergency button.',
    tip: 'It does not heal. Cast it before the damage, not after, and combine it with a stun so that you are not just taking half of everything.',
  },
  fireball: {
    use: 'The Mage\u2019s everyday spell. A fast, cheap, explosive ball of fire that hurts everything where it lands and sets it alight. It is the one you use most.',
    tip: 'The burn keeps working after the explosion: fire one at an enemy that is far away and let it walk to you.',
  },
  frost_nova: {
    use: 'A wave of cold that spreads around you and slows everything it touches to 40% of its speed for four seconds. It does not stun, but a slowed enemy cannot catch you, and a Mage walking away from a slowed enemy cannot be caught.',
    tip: 'It is centred on you, so it is a tool for when something is already close. Cast it, then walk away.',
  },
  meteor: {
    use: 'The Mage\u2019s biggest hit. You choose a place on the ground, and a moment later a meteor lands there and hurts everything in a wide circle. It is the biggest single hit of any ability in the game.',
    tip: 'Do not aim at a moving target; aim at where it will be, or at a door it must come through. After a moment of warning, a smart enemy walks out of it.',
  },
  arcane_shield: {
    use: 'Wraps you in energy that soaks up the next twelve points of damage for eight seconds: six hearts of damage, a lot when you only have seven. Whatever is left over reaches your health as usual.',
    tip: 'Because it takes a fixed amount, it is best against many small hits. A big hit can break through what is left of it.',
  },
  piercing_shot: {
    use: 'An arrow that does not stop at the first thing it hits. It crosses 32 blocks and hurts every enemy on the line. Against one target it is a good, strong shot; against a line of them it is the best thing the Ranger has.',
    tip: 'Line up enemies that chase you down a corridor, or wait until the Warrior has them all in a row.',
  },
  evasive_roll: {
    use: 'A quick roll in the direction you are moving (backwards if you stand still), with a blur of wind behind you. For a little over half a second nothing can hurt you, so it is both your escape and your dodge.',
    tip: 'You cannot be hurt for about half a second from the start, a little longer than the roll itself. Time it to a hit, a creeper blast or an arrow, not before.',
  },
  bear_trap: {
    use: 'Throw a trap onto the ground where you are looking. The first enemy to step in is rooted in place for four seconds and hurt. Two traps can wait at once, and each one stays armed for a minute and a half.',
    tip: 'You can aim it at a far hill and it lands at the foot of it. Put it between you and the thing that is coming, not under it.',
  },
  rain_of_arrows: {
    use: 'Mark a piece of ground and arrows fall on it in six volleys, one every half second. Enemies that stay in it take every volley; those who run do not. Use it to hold a doorway, or on whatever is chasing you.',
    tip: 'It starts almost at once (0.6 seconds) so you can use it as a reaction. Put it where the enemies are about to be, not where they are.',
  },
};

// ---- numbers from the game's own data -------------------------------------------------------------

/** 7 -> "7", 7.25 -> "7.3": at most one decimal. */
export const num = (n: number): string => String(Math.round(n * 10) / 10);
const pct = (n: number): string => `${Math.round(n * 100)}%`;
const seconds = (n: number): string => `${Math.round(n * 100) / 100} s`;

/** The damage of an ability's own base number for a class at a level: the class's multiplier for its kind, times its growth. */
export function damageAt(a: AbilityDef, base: number, level: number): number {
  return computeStats(a.classId, level).damage[a.kind] * base;
}

/** The base damage in an ability's effect (0 when it deals none). */
export function baseDamage(a: AbilityDef): number {
  const e = a.effect;
  switch (e.t) {
    case 'nova':
    case 'cone':
    case 'bolt':
    case 'zone':
    case 'pierce':
    case 'trap':
      return e.damage;
    case 'dash':
      return e.hit?.damage ?? 0;
    default:
      return 0;
  }
}

/** "17.5 (24.1 at level 20)": what a hit does at the start and at the cap. */
export function damageText(a: AbilityDef, base: number): string {
  return `${num(damageAt(a, base, 1))} (${num(damageAt(a, base, CLASS_LEVELS.max))} at level ${CLASS_LEVELS.max})`;
}

/** The "how it works" lines of an ability: its numbers, in words, worked out from its effect. */
export function abilityFacts(a: AbilityDef): Fact[] {
  const e = a.effect;
  const out: Fact[] = [];
  const dmg = (label = 'Damage', base = baseDamage(a)) => out.push({ label, value: damageText(a, base) });
  switch (e.t) {
    case 'nova':
      out.push({ label: 'Area', value: `Everything within ${num(e.radius)} blocks${e.leap ? ' of where you land' : ' of you'}` });
      if (e.leap) out.push({ label: 'Leap', value: 'You jump first, and the blast comes down where you land' });
      dmg();
      if (e.stun) out.push({ label: 'Stun', value: seconds(e.stun) });
      if (e.slow) out.push({ label: 'Slow', value: `To ${pct(e.slow.mult)} of their speed for ${seconds(e.slow.seconds)}` });
      if (e.lift) out.push({ label: 'Launch', value: 'Throws enemies into the air' });
      break;
    case 'cone':
      out.push({ label: 'Area', value: `${num(e.range)} blocks in front of you, ${Math.round((e.arc * 180) / Math.PI)}\u00B0 wide` });
      dmg();
      if (e.stun) out.push({ label: 'Stun', value: seconds(e.stun) });
      if (e.knock) out.push({ label: 'Knockback', value: 'Throws enemies back through the air' });
      break;
    case 'dash':
      out.push({ label: 'Distance', value: `${num(e.distance)} blocks${e.speed ? `, at ${num(e.speed)} blocks a second` : ''}` });
      out.push({ label: 'Direction', value: e.direction === 'look' ? 'Where you are looking' : 'The way you are moving (backwards if you stand still)' });
      if (e.hit) {
        out.push({ label: 'Hits', value: `Everything within ${num(e.hit.radius)} blocks of your path` });
        dmg();
      }
      if (e.immune) out.push({ label: 'Invulnerable', value: `${seconds(e.immune)} while you roll` });
      break;
    case 'bolt':
      out.push({ label: 'Flight', value: `${num(e.speed)} blocks a second, in a straight line` });
      if (e.radius) out.push({ label: 'Burst', value: `Hurts everything within ${num(e.radius)} blocks of where it lands` });
      dmg();
      if (e.burn) out.push({ label: 'Burning', value: `Targets keep burning for ${seconds(e.burn)}` });
      break;
    case 'zone':
      out.push({ label: 'Aim', value: `A spot on the ground, up to ${num(e.reach)} blocks away` });
      out.push({ label: 'Delay', value: `${seconds(e.delay)} before it lands` });
      out.push({ label: 'Area', value: `Everything within ${num(e.radius)} blocks` });
      if (e.waves && e.waves > 1) {
        out.push({ label: 'Volleys', value: `${e.waves}, one every ${seconds(e.interval ?? 0.5)}` });
        out.push({ label: 'Damage per volley', value: damageText(a, e.damage) });
        out.push({ label: 'Damage if all land', value: damageText(a, e.damage * e.waves) });
      } else dmg();
      break;
    case 'pierce':
      out.push({ label: 'Range', value: `${num(e.range)} blocks, in a line` });
      out.push({ label: 'Hits', value: 'Every enemy on the line, not only the first' });
      dmg();
      break;
    case 'guard': {
      out.push({ label: 'Lasts', value: seconds(e.seconds) });
      if (e.reduction) {
        out.push({ label: 'Effect', value: `You take ${pct(e.reduction)} of the damage you would have taken` });
        const own = CLASS_BALANCE[a.classId].damageTaken;
        out.push({ label: `With the ${CLASSES[a.classId].name}\u2019s own defense`, value: `${pct(own * e.reduction)} of normal damage reaches you` });
      }
      if (e.absorb) out.push({ label: 'Effect', value: `Soaks up the next ${num(e.absorb)} damage (${num(e.absorb / 2)} hearts)` });
      break;
    }
    case 'trap':
      out.push({ label: 'Aim', value: `The ground you are looking at, up to ${num(e.reach)} blocks away` });
      dmg();
      out.push({ label: 'Root', value: `${seconds(e.root)}: the enemy cannot move` });
      out.push({ label: 'Stays armed', value: `${seconds(e.ttl)}, and up to ${e.max} traps at once` });
      break;
  }
  return out;
}

/** The skill book of an ability costs this many Auren from a merchant. */
export const bookPrice = (id: AbilityId): number => skillBookPrice(id);

/** The first letter big: "stone_sword" -> "Stone sword". */
export const itemTitle = (name: string): string => {
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** One row of the class's numbers: a label, the value at level 1 and at the cap, and how full its bar is (0..1). */
export interface StatRow {
  key: string;
  label: string;
  start: string;
  cap: string;
  fill: number;
  note: string;
}

/** The numbers of a class, for the page's bars. Bars are compared with the other classes, so a bar says "more than the others". */
export function statRows(id: ClassId): StatRow[] {
  const at = (c: ClassId, lv: number) => computeStats(c, lv);
  const max = <T extends number>(f: (c: ClassId) => T): number => Math.max(...CLASS_IDS.map(f));
  const s1 = at(id, 1);
  const sN = at(id, CLASS_LEVELS.max);
  const cls = CLASSES[id];
  const rows: StatRow[] = [
    { key: 'health', label: 'Health', start: `${num(s1.maxHealth)}`, cap: `${num(sN.maxHealth)}`, fill: s1.maxHealth / max((c) => at(c, 1).maxHealth), note: `${num(s1.maxHealth / 2)} hearts at the start` },
    { key: 'defense', label: 'Toughness', start: s1.damageTaken < 1 ? `${pct(1 - s1.damageTaken)} less damage` : s1.damageTaken > 1 ? `${pct(s1.damageTaken - 1)} more damage` : 'Normal', cap: '', fill: (1.4 - s1.damageTaken) / 0.6, note: 'Damage taken from every hit' },
    { key: 'melee', label: 'Melee damage', start: `${pct(s1.damage.melee)}`, cap: `${pct(sN.damage.melee)}`, fill: s1.damage.melee / max((c) => at(c, 1).damage.melee), note: 'Swords and close combat' },
    { key: 'ranged', label: 'Ranged damage', start: `${pct(s1.damage.ranged)}`, cap: `${pct(sN.damage.ranged)}`, fill: s1.damage.ranged / max((c) => at(c, 1).damage.ranged), note: 'Bows and arrows' },
    { key: 'spell', label: 'Spell damage', start: `${pct(s1.damage.spell)}`, cap: `${pct(sN.damage.spell)}`, fill: s1.damage.spell / max((c) => at(c, 1).damage.spell), note: 'Wands and spells' },
    { key: 'speed', label: 'Speed', start: `${pct(s1.moveSpeed)}`, cap: '', fill: (s1.moveSpeed - 0.8) / 0.4, note: 'Walking and running' },
    { key: 'crit', label: 'Critical hits', start: `${pct(s1.critChance)} chance, x${num(s1.critDamage)}`, cap: `${pct(sN.critChance)}`, fill: s1.critChance / max((c) => at(c, 1).critChance), note: 'Chance of a hit that lands harder' },
    { key: 'resource', label: cls.resource.name, start: `${num(s1.maxResource)}, +${num(s1.resourceRegen)} a second`, cap: `${num(sN.maxResource)}`, fill: s1.maxResource / max((c) => at(c, 1).maxResource), note: 'What every ability spends' },
  ];
  return rows;
}

/** The levels at which abilities can be learned, with what each unlocks. */
export function unlockSteps(id: ClassId): { level: number; abilities: AbilityDef[] }[] {
  const by = new Map<number, AbilityDef[]>();
  for (const a of abilitiesOf(id)) by.set(a.unlockLevel, [...(by.get(a.unlockLevel) ?? []), a]);
  return [...by.entries()].sort((x, y) => x[0] - y[0]).map(([level, abilities]) => ({ level, abilities }));
}

/** What each class level adds, in the game's own numbers. */
export const LEVEL_GAINS = [
  { label: 'Health', value: `+${num(LEVEL_SCALING.health)} a level` },
  { label: 'Damage', value: `+${pct(LEVEL_SCALING.damage)} a level` },
  { label: 'Resource pool', value: `+${num(LEVEL_SCALING.resource)} a level` },
  { label: 'Critical chance', value: `+${num(LEVEL_SCALING.critChance * 100)}% a level` },
] as const;

/** Every ability id, for tests: the guide must say something about each. */
export const ALL_ABILITY_IDS: AbilityId[] = ABILITIES.map((a) => a.id);
export const abilityDef = (id: AbilityId): AbilityDef => ABILITY_BY_ID.get(id) as AbilityDef;
