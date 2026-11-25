import { BLOCKS } from './blocks';
import { I, OXYGEN_SECONDS, getItem } from './items';

/** A line under an item's name, in the same voice as the tooltips that already explain themselves. */
export interface AboutLine {
  text: string;
  color: 'good' | 'dim';
}

const line = (text: string, color: AboutLine['color'] = 'dim'): AboutLine[] => [{ text, color }];

const EXACT: Record<string, string> = {
  stone: 'The rock under the world. Smelt it smooth, or build with it.',
  dirt: 'The ground. A hoe tills it into farmland.',
  grass: 'Dirt with grass on it. Trees and flowers grow here.',
  sand: 'Smelt it into glass.',
  gravel: 'It can drop flint when you dig it.',
  cobblestone: 'What stone drops. Smelt it back into stone, or build with it.',
  glass: 'Smelted from sand. Place it as a window, or craft it with kelp into oxygen.',
  glowstone: 'A block of light.',
  crafting_table: 'Right-click it for the big crafting grid.',
  furnace: 'Smelts ore and cooks food. It needs fuel.',
  chest: 'Right-click to open it. What you put in stays there.',
  torch: 'A light you can hold or place. Water puts it out.',
  obsidian: 'Made where water meets lava. A portal frame is built from it.',
  ice: 'Slippery. Broken without care, it turns back into water.',
  anvil: 'Repairs, names, and moves glyphs onto a piece. It costs levels.',
  chipped_anvil: 'A worn anvil. It still repairs, names and moves glyphs.',
  damaged_anvil: 'A badly worn anvil. It still repairs, names and moves glyphs.',
  grindstone: 'Takes the glyphs off a piece and gives some of the experience back.',
  enchanting_table: 'The Runic Altar. It inscribes glyphs, paid in lapis and Auren.',
  bookshelf: 'Lore for a Runic Altar. More shelves around it allow stronger glyphs.',
  stick: 'A handle. Tools, torches and fences are made with it.',
  coal: 'Fuel for a furnace, and what a torch is made with.',
  iron_ingot: 'Smelted iron. Tools, armor and machines are made from it.',
  gold_ingot: 'Smelted gold. Tools and a few crafts are made from it.',
  diamond: 'A gem for the finest tools and armor.',
  bone: 'From a skeleton. Craft it into bone meal.',
  gunpowder: 'From a creeper. It makes TNT.',
  wheat: 'Grown from seeds. Bread is baked from it, and animals eat it.',
  flint: 'From gravel. Flint and steel, and arrows, are made with it.',
  string: 'From a spider. Bows, fishing rods and wool are made with it.',
  leather: 'From a cow. Books, armor and bags are made with it.',
  raw_iron: 'Smelt it into an iron ingot.',
  raw_gold: 'Smelt it into a gold ingot.',
  feather: 'From a chicken. Arrows can be made with it.',
  ink_sac: 'From a squid. It makes black dye.',
  slimeball: 'From a slime. Nine of them make a slime block.',
  emerald: 'What the villagers trade in.',
  paper: 'Made from wheat. Books are made from it.',
  book: 'Paper and leather. Bookshelves and the Runic Altar are made with it.',
  enchanted_book: 'Holds glyphs. At an anvil, move them onto a piece.',
  lapis_lazuli: 'The Runic Altar is paid in it, and it makes blue dye.',
  redstone: 'Place it as dust to carry a signal between switches and machines.',
  sugar: 'From sugar cane. Cakes and pies take it.',
  egg: 'Chickens lay them. A cake and pumpkin pie are made with one.',
  bowl: 'Craft it into mushroom stew, beetroot soup or rabbit stew.',
  cocoa_beans: 'Plant them on a jungle log. They also make brown dye.',
  tnt: 'Light it with flint and steel, or with redstone, and stand back.',
  slime_block: 'A bouncy block, made from slimeballs.',
  rail: 'Minecarts ride on it.',
  powered_rail: 'Speeds a minecart along when redstone is powering it.',
  redstone_block: 'A solid block of redstone signal.',
  redstone_lamp: 'A light that turns on when redstone powers it.',
  redstone_torch: 'Powers redstone, and goes out when the block under it is powered.',
  lever: 'Right-click to switch a redstone signal on or off.',
  ladder: 'Place it on a wall and climb it.',
  kelp: 'A sea plant. Craft it with glass to bottle oxygen.',
  seagrass: 'A sea plant. Punch it to pick it up, and the water stays.',
  bubble_bloom: 'Breathes out a column of bubbles. Standing in it refills your air, and glass you carry becomes oxygen.',
  imp_horn: 'A part for crafting a companion.',
  cinder_heart: 'A part for crafting a companion.',
  seraph_feather: 'A part for crafting a companion.',
  halo_ring: 'A part for crafting a companion.',
  wing_frame: 'The frame a pair of wings is built on.',
  storm_feather: 'A feather a pair of wings is built with.',
};

const FLOWERS = new Set([
  'rose', 'dandelion', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'allium', 'azure_bluet', 'blue_orchid', 'moonpetal', 'lavender', 'heather',
]);

/**
 * What an item is, when nothing else in the tooltip has said so. Oxygen and the diving helmet are named outright.
 * Everything else follows from its name and its shape, so a stair, a dye and a lump of ore each say their own thing.
 */
export function itemAbout(id: number): AboutLine[] {
  if (id === I.OXYGEN) {
    return [
      { text: 'Air for a diving helmet', color: 'good' },
      { text: `Each bottle lasts ${OXYGEN_SECONDS} seconds underwater. The helmet takes the next one from your inventory.`, color: 'dim' },
    ];
  }
  if (id === I.DIVER_HELM) {
    return [
      { text: 'Lets you breathe underwater', color: 'good' },
      { text: 'It burns an oxygen bottle from your inventory while your eyes are under the water.', color: 'dim' },
    ];
  }
  const item = getItem(id);
  if (item.kind === 'Quest item') return line('A quest asks you to bring these back.');
  if (item.kind === 'Dye') return line('Colours wool, glass, beds and the other things that take a colour.');
  const named = EXACT[item.name];
  if (named) return line(named);
  const byName = fromName(item.name);
  if (byName) return line(byName);
  if (item.block != null) return line(fromBlock(item.name, item.block));
  if (item.kind === 'Material' || item.block === null) return line('An ingredient for crafting.');
  return line('Place it to build with.');
}

function fromName(name: string): string | null {
  if (name.endsWith('_sapling') || name.endsWith('_propagule') || name === 'sapling') return 'Plant it on dirt or grass. It grows into a tree.';
  if (name.endsWith('_seeds')) return 'Plant them on farmland.';
  if (name.endsWith('_ore') || name.endsWith('_ore_block')) return 'Mine it for what is in the rock.';
  if (name.endsWith('_planks')) return 'Boards cut from a log. Most wooden things start here.';
  if (name.endsWith('_slab')) return 'A half-height block, for floors and trim.';
  if (name.endsWith('_stairs')) return 'Steps you can walk, or build a stair from.';
  if (name.endsWith('_wall')) return 'A low wall. It joins the walls beside it.';
  if (name.endsWith('_fence_gate') || name === 'fence_gate') return 'A gate in a fence. Right-click to open it.';
  if (name.endsWith('_fence') || name === 'fence') return 'A fence you can see through. Most things cannot jump it.';
  if (name.endsWith('_trapdoor') || name === 'trapdoor') return 'A hatch. Right-click to open and close it.';
  if (name.endsWith('_button')) return 'Right-click it for a short pulse of redstone.';
  if (name.endsWith('_pressure_plate')) return 'Stepping on it sends a redstone signal.';
  if (name.endsWith('_sign')) return 'Place it, then write on it.';
  if (name.endsWith('_candle') || name === 'candle') return 'A small light. Place it, and light it.';
  if (name.endsWith('_banner')) return 'A banner you can stand up or hang.';
  if (name.endsWith('_carpet')) return 'A thin cover for a floor.';
  if (name.includes('stained_glass_pane') || name === 'glass_pane') return 'A thin window. You can see through it.';
  if (name.includes('stained_glass')) return 'Coloured glass. You can see through it.';
  if (name.endsWith('_leaves') || name.endsWith('_fronds') || name === 'leaves') return 'The crown of a tree. Shears keep it whole.';
  if (name === 'petrified_log' || name === 'mushroom_stem' || name === 'glowshroom_stem') return 'A wooden block for building.';
  if (name.endsWith('_log') || name.endsWith('_stem') || name.endsWith('_hyphae') || name.endsWith('_wood') || name === 'log') return 'Craft it into planks, or burn it as fuel.';
  if (name.includes('wool')) return 'A soft block. Dye it, or make a bed from it.';
  if (name.endsWith('_concrete')) return 'A solid dyed block.';
  if (name.includes('terracotta')) return 'Dyed clay, for building.';
  if (name.endsWith('_bars') || name === 'iron_bars') return 'Thin bars you can see through.';
  if (FLOWERS.has(name)) return 'A flower. Several of them make a dye.';
  if (name.endsWith('_mushroom') || name === 'brown_mushroom' || name === 'red_mushroom') return 'A mushroom. Stew is made from the two colours together.';
  if (name === 'sugar_cane') return 'Plant it beside water. Sugar is made from it.';
  if (name === 'lily_pad') return 'It floats on the water.';
  if (name === 'vines') return 'It climbs a wall.';
  if (name === 'cactus') return 'Plant it on sand. Touching it hurts.';
  if (name === 'bamboo') return 'Plant it. It grows tall, and can be crafted into blocks.';
  if (name.startsWith('coral_block') || name === 'dead_coral_block') return 'A solid block of coral.';
  if (name.includes('coral')) return 'A sea plant. Punch it to pick it up, and the water stays.';
  return null;
}

function fromBlock(name: string, block: number): string {
  const shape = BLOCKS[block]?.shape;
  switch (shape) {
    case 'slab':
      return 'A half-height block, for floors and trim.';
    case 'stair':
      return 'Steps you can walk, or build a stair from.';
    case 'wall':
      return 'A low wall. It joins the walls beside it.';
    case 'fence':
      return 'A fence you can see through. Most things cannot jump it.';
    case 'gate':
      return 'A gate in a fence. Right-click to open it.';
    case 'trapdoor':
      return 'A hatch. Right-click to open and close it.';
    case 'door':
      return 'Right-click to open and close it.';
    case 'button':
      return 'Right-click it for a short pulse of redstone.';
    case 'plate':
      return 'Stepping on it sends a redstone signal.';
    case 'lever':
      return 'Right-click to switch a redstone signal on or off.';
    case 'sign':
      return 'Place it, then write on it.';
    case 'candle':
      return 'A small light. Place it, and light it.';
    case 'banner':
      return 'A banner you can stand up or hang.';
    case 'lantern':
      return 'A hanging light. It stays lit under the water.';
    case 'chain':
      return 'Hang a lantern from it. It stays in the water.';
    case 'torch':
      return 'A light you can hold or place. Water puts it out.';
    case 'ladder':
      return 'Place it on a wall and climb it.';
    case 'pane':
      return 'A thin window. You can see through it.';
    case 'pot':
      return 'Place it, then plant a flower in it.';
    case 'chest':
      return 'Right-click to open it. What you put in stays there.';
    case 'cross':
    case 'crop':
    case 'cocoa':
      return 'It grows in the wild. Break it to pick it up.';
    default:
      return name.includes('ice') ? 'A cold block.' : 'Place it to build with.';
  }
}
