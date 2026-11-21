import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  GameSession,
  HeadlessWorld,
  I,
  ITEMS,
  MOBS,
  MOUNTS,
  RECIPES,
  SKILL_BOOKS,
  SMELTING,
  TOOL_KINDS,
  WorldGenerator,
  bagId,
  blockDrops,
  axeStripPairs,
  groveLeaves,
  cakeId,
  doorInfo,
  getItem,
  harvestHint,
  makeStack,
  mountItemId,
  mulberry32,
  toolId,
  type SessionEvent,
  isFluid,
  OUTFIT_CLASSES,
  outfitItems,
} from './index';
import { settleOrbs } from './xpOrbs.testutil';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

function make() {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5) });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

const bestTool = (kind: (typeof TOOL_KINDS)[number] | null) => getItem(toolId(kind ?? 'pickaxe', 'diamond')).tool;
/** A few "random" streams, so chance drops are sampled at both ends. */
const rolls = [0, 0.04, 0.2, 0.5, 0.99];
const seq = (v: number) => () => v;

describe('what every block drops', () => {
  const blocks = BLOCKS.filter((b, i, all) => all.findIndex((o) => o.id === b.id) === i && b.id !== B.AIR);
  // A bed drops one item in all, from its foot half, which carries the colour; the head half drops nothing.
  const nothing = new Set<number>([B.WATER, B.LAVA, B.SPAWNER, B.BEDROCK, B.PORTAL, B.WAYSTONE, B.GLASS, B.ICE, B.PACKED_ICE, B.BED_HEAD_PX, B.BED_HEAD_NX, B.BED_HEAD_PZ, B.BED_HEAD_NZ, B.FIRE]);
  for (let id = 0; id < 256; id++) if (isFluid(id)) nothing.add(id);
  // A cake drops nothing when broken, whole or eaten (as in the original).
  for (let bites = 0; bites < 7; bites++) nothing.add(cakeId(bites));
  // A door drops one item, from its lower half.
  // Every kind of door has one: oak, the other woods, iron and the nether ones.
  for (const b of BLOCKS) if (doorInfo(b.id)?.upper) nothing.add(b.id);

  it('gives something that exists as an item, with the right tool', () => {
    for (const b of blocks) {
      if (nothing.has(b.id)) continue;
      const got = rolls.flatMap((r) => blockDrops(b, bestTool(b.tool), seq(r)));
      expect(got.length, `${b.name} (${b.id}) drops nothing`).toBeGreaterThan(0);
      for (const d of got) {
        expect(ITEMS.has(d.id), `${b.name} drops item ${d.id} which does not exist`).toBe(true);
        expect(d.count).toBeGreaterThan(0);
      }
    }
  });

  it('drops nothing for water, lava, spawners, bedrock and glass (as in the original)', () => {
    for (const id of nothing) expect(blockDrops(BLOCKS[id], bestTool('pickaxe'), seq(0))).toEqual([]);
  });

  it('ores drop what they are for', () => {
    const wood = getItem(toolId('pickaxe', 'wood')).tool;
    const stone = getItem(toolId('pickaxe', 'stone')).tool;
    const iron = getItem(toolId('pickaxe', 'iron')).tool;
    const only = (id: number, tool: typeof wood) => blockDrops(BLOCKS[id], tool, seq(0.5)).map((d) => d.id);
    expect(only(B.COAL_ORE, wood)).toEqual([I.COAL]);
    expect(only(B.IRON_ORE, stone)).toEqual([I.RAW_IRON]);
    expect(only(B.GOLD_ORE, iron)).toEqual([I.RAW_GOLD]);
    expect(only(B.DIAMOND_ORE, iron)).toEqual([I.DIAMOND]);
    // Too weak a tool breaks the block but gives nothing.
    expect(only(B.IRON_ORE, wood)).toEqual([]);
    expect(only(B.GOLD_ORE, stone)).toEqual([]);
    expect(only(B.DIAMOND_ORE, stone)).toEqual([]);
    expect(only(B.GOLD_ORE, null)).toEqual([]);
  });

  it('tells you which tool a block needs', () => {
    const wood = getItem(toolId('pickaxe', 'wood')).tool;
    const stone = getItem(toolId('pickaxe', 'stone')).tool;
    const iron = getItem(toolId('pickaxe', 'iron')).tool;
    expect(harvestHint(BLOCKS[B.GOLD_ORE], stone)).toBe('Needs an iron pickaxe or better');
    expect(harvestHint(BLOCKS[B.IRON_ORE], wood)).toBe('Needs a stone pickaxe or better');
    expect(harvestHint(BLOCKS[B.STONE], null)).toBe('Needs a wooden pickaxe or better');
    expect(harvestHint(BLOCKS[B.GOLD_ORE], iron)).toBeNull();
    expect(harvestHint(BLOCKS[B.DIRT], null)).toBeNull();
    expect(harvestHint(BLOCKS[B.LEAVES], null)).toBeNull();
  });
});

describe('every item can be obtained', () => {
  it('by mining, mobs, crafting or smelting', () => {
    const have = new Set<number>();
    // Mined from blocks (with the best tool of the right kind) and picked up.
    for (const b of BLOCKS) for (const r of rolls) for (const d of blockDrops(b, bestTool(b.tool), seq(r))) have.add(d.id);
    // Dropped by mobs.
    for (const m of Object.values(MOBS)) for (const r of rolls) for (const d of m.drops(seq(r))) have.add(d.id);
    // A chicken lays an egg while it lives (see mobs.ts). Killing one does not drop an egg.
    have.add(I.EGG);
    // A cow is milked with an empty bucket (see player.ts). Killing one does not drop milk.
    have.add(I.MILK_BUCKET);
    // Crafted and smelted from what is already in hand, until nothing new turns up.
    for (let changed = true; changed; ) {
      changed = false;
      for (const r of RECIPES) {
        const need = r.pattern ? Object.values(r.key!) : r.shapeless!;
        if (!have.has(r.result.id) && need.every((id) => have.has(id))) {
          have.add(r.result.id);
          changed = true;
        }
      }
      for (const [from, to] of SMELTING) {
        if (have.has(from) && !have.has(to)) {
          have.add(to);
          changed = true;
        }
      }
      for (const [from, to] of axeStripPairs()) {
        if (have.has(from) && !have.has(to)) {
          have.add(to);
          changed = true;
        }
      }
    }
    // Blocks that break into something else (as in the original, only a special tool keeps them whole).
    // Cobwebs, ice and the other tree's leaves need shears or silk touch (an enchantment, so not a plain drop);
    // the filled buckets are made by using an empty bucket on a liquid, not crafted; an enchanted book comes
    // from the enchanting table, chest loot and the anvil (see enchant.test.ts); a bottle o' enchanting from
    // dungeon chests and the cleric; a skill book from the kills of a player of its class, quests and the merchants of
    // Dawnwatch (see skillBooks.test.ts); the biggest bag from monsters and quests (see bags.test.ts); the jewels from monsters, chests and the arcanist (see jewels.test.ts); the mount horns from the ranger quartermaster (see mounts.test.ts); the clothes of the classes are put on every new character of the class (see outfit.test.ts); the two halves of the Hollow Sigil from Tobin's shelves and the chests of the dungeons (see dungeonQuests.test.ts).
    const wholeOnlyInCreative = new Set<number>([...OUTFIT_CLASSES.flatMap((c) => outfitItems(c)), ...SKILL_BOOKS.map((_, i) => I.SKILL_BOOK_BASE + i), ...MOUNTS.map((m) => mountItemId(m.id)), bagId(5), I.EMBERSTONE, I.COMPASS, I.WARDEN_SCROLL, I.HOLLOW_BONE, I.HOLLOW_SIGIL, I.JEWEL_DAWN, I.JEWEL_RIFT, I.JEWEL_BLOOM, B.GRASS, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.COBWEB, B.ICE, B.PACKED_ICE, B.DEEPSLATE, B.MYCELIUM, B.ACACIA_LEAVES, B.JUNGLE_LEAVES, B.DARK_OAK_LEAVES, B.CHERRY_LEAVES, ...groveLeaves(), B.FERN, B.COAL_ORE, B.LAPIS_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.EMERALD_ORE, B.REDSTONE_ORE, I.WATER_BUCKET, I.LAVA_BUCKET, I.ENCHANTED_BOOK, I.EXPERIENCE_BOTTLE]);
    const missing = [...ITEMS.values()].filter((i) => !have.has(i.id) && !wholeOnlyInCreative.has(i.id)).map((i) => `${i.name} (${i.id})`);
    expect(missing).toEqual([]);
  });

  it('and every smelting input and output is a real item', () => {
    for (const [from, to] of SMELTING) {
      expect(ITEMS.has(from), `smelting input ${from}`).toBe(true);
      expect(ITEMS.has(to), `smelting output ${to}`).toBe(true);
    }
  }, 180_000);
});

describe('mining in the game', () => {
  const mine = (tool: number | null, block: number) => {
    const { s, world } = make();
    if (tool !== null) {
      s.inventory.set(0, makeStack(tool));
      s.selectSlot(0);
    }
    s.drainEvents();
    world.setBlock(CX + 2, FLOOR + 1, CZ, block);
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    const events: SessionEvent[] = s.drainEvents();
    s.tickDrops(3); // let the drop fall and be picked up
    return { s, events, world };
  };
  const toasts = (events: SessionEvent[]) => events.flatMap((e) => (e.t === 'toast' ? [e.text] : []));

  it('gold ore with an iron pickaxe gives raw gold', () => {
    const { s, world } = mine(toolId('pickaxe', 'iron'), B.GOLD_ORE);
    // (It lies where the ore was: items are picked up by walking onto them, not drawn in.)
    expect(s.inventory.countOf(I.RAW_GOLD) + s.drops.drops.filter((d) => d.stack.id === I.RAW_GOLD).length).toBe(1);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.AIR);
  });

  it('gold ore with a stone pickaxe gives nothing, and says why', () => {
    const { s, events } = mine(toolId('pickaxe', 'stone'), B.GOLD_ORE);
    expect(s.inventory.countOf(I.RAW_GOLD)).toBe(0);
    expect(s.inventory.countOf(B.GOLD_ORE)).toBe(0);
    expect(toasts(events)).toContain('Needs an iron pickaxe or better');
  });

  it('iron ore with a stone pickaxe gives raw iron', () => {
    const { s } = mine(toolId('pickaxe', 'stone'), B.IRON_ORE);
    expect(s.inventory.countOf(I.RAW_IRON) + s.drops.drops.filter((d) => d.stack.id === I.RAW_IRON).length).toBe(1);
  });

  it('does not nag when the tool is right', () => {
    const { events } = mine(toolId('pickaxe', 'iron'), B.STONE);
    expect(toasts(events).filter((t) => t.startsWith('Needs'))).toEqual([]);
  });

  it('raw gold and raw iron smelt into ingots', () => {
    const { s } = make();
    s.openScreen('furnace');
    const f = (s.menu as unknown as { furnace: { container: { set(i: number, v: unknown): void; get(i: number): { id: number; count: number } | null }; tick(dt: number): void } }).furnace;
    f.container.set(0, makeStack(I.RAW_GOLD, 2));
    f.container.set(1, makeStack(I.COAL, 1));
    for (let i = 0; i < 25 * 20; i++) f.tick(1 / 20);
    expect(f.container.get(2)).toMatchObject({ id: I.GOLD_INGOT, count: 2 });
    f.container.set(0, makeStack(I.RAW_IRON, 1));
    f.container.set(1, makeStack(I.COAL, 1));
    for (let i = 0; i < 12 * 20; i++) f.tick(1 / 20);
    expect(f.container.get(2)).toMatchObject({ id: I.GOLD_INGOT, count: 2 }); // different output: stays blocked
  });

  it('every kind of block can be mined and picked up in survival', () => {
    const skip = new Set<number>([B.AIR, B.WATER, B.BEDROCK, B.GLASS, B.PORTAL, B.WAYSTONE]);
    for (const b of BLOCKS.filter((x, i, all) => all.findIndex((o) => o.id === x.id) === i)) {
      if (skip.has(b.id)) continue;
      const tool = b.tool ? toolId(b.tool, 'diamond') : toolId('pickaxe', 'diamond');
      const { s } = mine(tool, b.id);
      // Walk the slots once (asking `countOf` for every item in the game is quadratic in the amount of content).
      let total = 0;
      for (const stack of s.inventory.slots) if (stack && stack.id !== tool && ITEMS.has(stack.id)) total += stack.count;
      // Chance drops (leaves, tall grass) may roll nothing with this seed, so only demand the sure ones.
      const sure = blockDrops(b, getItem(tool).tool, () => 0.5).length > 0;
      if (sure) expect(total, `${b.name} gave nothing`).toBeGreaterThan(0);
    }
  }, 420_000); // one session per kind of block: the time grows with the amount of content
});
