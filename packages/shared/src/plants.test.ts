import { describe, expect, it } from 'vitest';
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  ATLAS_TILES,
  B,
  BB,
  BLOCKS,
  CHUNK_SIZE,
  I,
  IS_SOLID,
  WORLD_HEIGHT,
  WorldGenerator,
  allItems,
  blockDrop,
  blockDrops,
  blockIndex,
  SMELTING,
  breakTime,
  cakeId,
  canStayAt,
  cocoaId,
  computeLight,
  findRecipe,
  getItem,
  growColumn,
  isSeaPlant,
  isTillable,
  isTorch,
  makeStack,
  placementFor,
  toolId,
  type BlockReader,
} from './index';

function reader(edits: Record<string, number> = {}): BlockReader & { set: (x: number, y: number, z: number, id: number) => void } {
  const m = new Map(Object.entries(edits));
  return {
    getBlock: (x, y, z) => m.get(`${x},${y},${z}`) ?? (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR),
    set: (x, y, z, id) => void m.set(`${x},${y},${z}`, id),
  };
}

describe('torches', () => {
  it('emit light and let light through', () => {
    for (const id of [B.TORCH, B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ]) {
      expect(BLOCKS[id].light).toBe(14);
      expect(BLOCKS[id].opaque).toBe(false);
      expect(BLOCKS[id].solid).toBe(false);
      expect(BLOCKS[id].shape).toBe('torch');
    }
    // A torch lights the cave around it.
    const W = 24;
    const H = 16;
    const idx = (x: number, y: number, z: number) => (y * W + z) * W + x;
    const b = new Uint16Array(W * H * W).fill(B.STONE);
    for (let x = 2; x < 22; x++) b[idx(x, 8, 12)] = B.AIR;
    b[idx(4, 8, 12)] = B.TORCH;
    const l = computeLight(b, W, H, W);
    expect(l[idx(4, 8, 12)] & 15).toBe(14);
    expect(l[idx(10, 8, 12)] & 15).toBe(8);
  });

  it('is placed upright on top faces and sideways on walls, never on ceilings', () => {
    expect(placementFor(B.TORCH, 0, 1, 0)).toBe(B.TORCH);
    expect(placementFor(B.TORCH, 0, -1, 0)).toBeNull();
    // Clicking the +x face of a wall: the wall is on the torch's -x side.
    expect(placementFor(B.TORCH, 1, 0, 0)).toBe(B.TORCH_NX);
    expect(placementFor(B.TORCH, -1, 0, 0)).toBe(B.TORCH_PX);
    expect(placementFor(B.TORCH, 0, 0, 1)).toBe(B.TORCH_NZ);
    expect(placementFor(B.TORCH, 0, 0, -1)).toBe(B.TORCH_PZ);
    expect(placementFor(B.STONE, 0, 0, 1)).toBe(B.STONE);
    expect(isTorch(B.TORCH_PZ)).toBe(true);
    expect(isTorch(B.STONE)).toBe(false);
  });

  it('falls off when its support disappears', () => {
    const w = reader({ '3,1,3': B.STONE });
    expect(canStayAt(B.TORCH, w, 3, 2, 3)).toBe(true);
    w.set(3, 1, 3, B.AIR);
    expect(canStayAt(B.TORCH, w, 3, 2, 3)).toBe(false);

    const wall = reader({ '5,3,4': B.STONE });
    expect(canStayAt(B.TORCH_PX, w, 4, 3, 4)).toBe(false);
    expect(canStayAt(B.TORCH_PX, wall, 4, 3, 4)).toBe(true);
    expect(canStayAt(B.TORCH_NX, wall, 4, 3, 4)).toBe(false);
  });

  it('stands in the sea and kelp grows up into the water', () => {
    const w = reader({ '0,1,0': B.SAND, '0,2,0': BB.kelp, '0,3,0': B.WATER, '1,2,0': B.WATER });
    const grow = Object.assign(w, { setBlock: (x: number, y: number, z: number, id: number) => (w.set(x, y, z, id), true) });
    expect(isSeaPlant(BB.kelp)).toBe(true);
    expect(isSeaPlant(BB.seagrass)).toBe(true);
    expect(BLOCKS[BB.kelp].liquid).toBe(true);
    expect(canStayAt(BB.kelp, w, 0, 2, 0)).toBe(true);
    expect(canStayAt(BB.seagrass, reader({ '0,1,0': B.SAND, '0,3,0': B.WATER }), 0, 2, 0)).toBe(true);
    expect(canStayAt(BB.kelp, reader(), 0, 2, 0)).toBe(false);
    expect(growColumn(grow, 0, 2, 0, BB.kelp)).toBe(true);
    expect(w.getBlock(0, 3, 0)).toBe(BB.kelp);
    expect(growColumn(grow, 0, 3, 0, BB.kelp)).toBe(false);
  });

  it('wall torches drop a normal torch, and torches craft from coal and a stick', () => {
    expect(blockDrop(BLOCKS[B.TORCH_NZ], null)).toEqual({ id: B.TORCH, count: 1 });
    const r = findRecipe([makeStack(I.COAL), null, makeStack(I.STICK), null], 2, 2);
    expect(r?.result).toEqual({ id: B.TORCH, count: 4 });
  });

  it('only a torch and a redstone torch exist as torch items', () => {
    const torches = allItems().filter((i) => BLOCKS[i.block ?? 0]?.shape === 'torch');
    expect(torches.map((t) => t.id)).toEqual([B.TORCH, B.RTORCH_BASE + 1]);
  });
});

describe('plants', () => {
  it('flowers and grass need soil and are replaceable and instant to break', () => {
    const w = reader();
    for (const id of [B.TALL_GRASS, B.ROSE, B.DANDELION]) {
      expect(canStayAt(id, w, 2, 1, 2)).toBe(true); // on grass
      w.set(2, 0, 2, B.STONE);
      expect(canStayAt(id, w, 2, 1, 2)).toBe(false);
      w.set(2, 0, 2, B.SAND);
      expect(canStayAt(id, w, 2, 1, 2)).toBe(false);
      w.set(2, 0, 2, B.DIRT);
      expect(canStayAt(id, w, 2, 1, 2)).toBe(true);
      w.set(2, 0, 2, B.GRASS);
      expect(BLOCKS[id].replaceable).toBe(true);
      expect(BLOCKS[id].solid).toBe(false);
      expect(breakTime(BLOCKS[id], null)).toBe(0);
    }
  });

  it('tall grass sometimes drops seeds; flowers drop themselves', () => {
    expect(blockDrop(BLOCKS[B.TALL_GRASS], null, () => 0.9)).toBeNull();
    expect(blockDrop(BLOCKS[B.TALL_GRASS], null, () => 0.01)).toEqual({ id: I.WHEAT_SEEDS, count: 1 });
    expect(blockDrop(BLOCKS[B.ROSE], null)).toEqual({ id: B.ROSE, count: 1 });
  });

  it('worldgen scatters plants only on grass with open air above, deterministically', () => {
    const gen = new WorldGenerator(1337);
    let plants = 0;
    let flowers = 0;
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const a = gen.generateChunk(cx, cz);
        const b = gen.generateChunk(cx, cz);
        expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
        for (let y = 1; y < WORLD_HEIGHT; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              const id = a[blockIndex(x, y, z)];
              if (BLOCKS[id].shape !== 'cross') continue;
              plants++;
              if (id !== B.TALL_GRASS) flowers++;
              // Every plant stands on what its own rule allows (sugar cane at the water's edge is judged by its soil alone).
              if (id === B.SUGAR_CANE) expect(IS_SOLID[a[blockIndex(x, y - 1, z)]] === 1 || a[blockIndex(x, y - 1, z)] === B.SUGAR_CANE).toBe(true);
              else expect(canStayAt(id, { getBlock: (bx, by, bz) => (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE || by < 0 || by >= WORLD_HEIGHT ? B.AIR : a[blockIndex(bx, by, bz)]) }, x, y, z), `plant ${id} at ${x},${y},${z}`).toBe(true);
            }
          }
        }
      }
    }
    expect(plants).toBeGreaterThan(100);
    expect(flowers).toBeGreaterThan(0);
  });
});

describe('farming', () => {
  it('only grass, dirt and snowy grass can be tilled', () => {
    expect(isTillable(B.GRASS)).toBe(true);
    expect(isTillable(B.DIRT)).toBe(true);
    expect(isTillable(B.SNOW)).toBe(true);
    expect(isTillable(B.SAND)).toBe(false);
    expect(isTillable(B.STONE)).toBe(false);
  });

  it('seeds plant a sprout that only survives on farmland', () => {
    const seeds = getItem(I.WHEAT_SEEDS);
    expect(seeds.block).toBe(B.WHEAT_0);
    const w = reader({ '1,0,1': B.FARMLAND });
    expect(canStayAt(B.WHEAT_0, w, 1, 1, 1)).toBe(true);
    expect(canStayAt(B.WHEAT_0, w, 2, 1, 2)).toBe(false); // plain grass
    w.set(1, 0, 1, B.AIR);
    expect(canStayAt(B.WHEAT_2, w, 1, 1, 1)).toBe(false);
  });

  it('young wheat gives a seed back; ripe wheat gives wheat and 1-3 seeds', () => {
    expect(blockDrops(BLOCKS[B.WHEAT_1], null)).toEqual([{ id: I.WHEAT_SEEDS, count: 1 }]);
    const ripe = blockDrops(BLOCKS[B.WHEAT_3], null, () => 0.99);
    expect(ripe).toEqual([
      { id: I.WHEAT, count: 1 },
      { id: I.WHEAT_SEEDS, count: 3 },
    ]);
    expect(blockDrops(BLOCKS[B.WHEAT_3], null, () => 0)[1].count).toBe(1);
    expect(blockDrops(BLOCKS[B.STONE], null)).toEqual([]);
  });

  it('a potato plants on farmland, grows, and a ripe one drops two to five', () => {
    const potato = getItem(I.POTATO);
    expect(potato.block).toBe(B.POTATO_0);
    expect(potato.food).toEqual({ hunger: 1, saturation: 0.6 });
    const w = reader({ '1,0,1': B.FARMLAND });
    expect(canStayAt(B.POTATO_0, w, 1, 1, 1)).toBe(true);
    expect(canStayAt(B.POTATO_0, w, 2, 1, 2)).toBe(false);
    expect(blockDrops(BLOCKS[B.POTATO_1], null)).toEqual([{ id: I.POTATO, count: 1 }]);
    expect(blockDrops(BLOCKS[B.POTATO_3], null, () => 0.99)).toEqual([{ id: I.POTATO, count: 5 }]);
    expect(blockDrops(BLOCKS[B.POTATO_3], null, () => 0)).toEqual([
      { id: I.POTATO, count: 2 },
      { id: I.POISONOUS_POTATO, count: 1 },
    ]);
    expect(SMELTING.get(I.POTATO)).toBe(I.BAKED_POTATO);
    expect(getItem(I.BAKED_POTATO).food).toEqual({ hunger: 5, saturation: 6 });
    expect(getItem(I.POISONOUS_POTATO).food?.poison).toEqual({ chance: 0.6, seconds: 5 });
    expect(getItem(I.POISONOUS_POTATO).food?.always).toBe(true);
  });

  it('a carrot plants on farmland, and a ripe one drops one to four', () => {
    const carrot = getItem(I.CARROT);
    expect(carrot.block).toBe(B.CARROT_0);
    expect(carrot.food).toEqual({ hunger: 3, saturation: 3.6 });
    const w = reader({ '1,0,1': B.FARMLAND });
    expect(canStayAt(B.CARROT_0, w, 1, 1, 1)).toBe(true);
    expect(canStayAt(B.CARROT_0, w, 2, 1, 2)).toBe(false);
    expect(blockDrops(BLOCKS[B.CARROT_1], null)).toEqual([{ id: I.CARROT, count: 1 }]);
    expect(blockDrops(BLOCKS[B.CARROT_3], null, () => 0)).toEqual([{ id: I.CARROT, count: 1 }]);
    expect(blockDrops(BLOCKS[B.CARROT_3], null, () => 0.99)).toEqual([{ id: I.CARROT, count: 4 }]);
  });

  it('melon seeds and pumpkin seeds plant a stem, and a ripe stem drops seeds', () => {
    expect(getItem(I.MELON_SEEDS).block).toBe(B.MELON_STEM_0);
    expect(getItem(I.PUMPKIN_SEEDS).block).toBe(B.PUMPKIN_STEM_0);
    const w = reader({ '1,0,1': B.FARMLAND });
    expect(canStayAt(B.MELON_STEM_0, w, 1, 1, 1)).toBe(true);
    expect(canStayAt(B.PUMPKIN_STEM_0, w, 2, 1, 2)).toBe(false);
    expect(blockDrops(BLOCKS[B.MELON_STEM_1], null)).toEqual([{ id: I.MELON_SEEDS, count: 1 }]);
    expect(blockDrops(BLOCKS[B.MELON_STEM_3], null, () => 0)).toEqual([{ id: I.MELON_SEEDS, count: 1 }]);
    expect(blockDrops(BLOCKS[B.MELON_STEM_3], null, () => 0.99)).toEqual([{ id: I.MELON_SEEDS, count: 3 }]);
    expect(blockDrops(BLOCKS[B.PUMPKIN_STEM_2], null)).toEqual([{ id: I.PUMPKIN_SEEDS, count: 1 }]);
    expect(blockDrops(BLOCKS[B.PUMPKIN_STEM_3], null, () => 0.99)).toEqual([{ id: I.PUMPKIN_SEEDS, count: 3 }]);
    expect(findRecipe([makeStack(I.MELON_SLICE)], 1, 1)?.result).toEqual({ id: I.MELON_SEEDS, count: 1 });
    expect(findRecipe([makeStack(B.PUMPKIN)], 1, 1)?.result).toEqual({ id: I.PUMPKIN_SEEDS, count: 4 });
  });

  it('beetroot seeds plant a crop, a ripe one drops the root and seeds, and six roots make soup', () => {
    expect(getItem(I.BEETROOT_SEEDS).block).toBe(B.BEETROOT_0);
    expect(getItem(I.BEETROOT).food).toEqual({ hunger: 1, saturation: 1.2 });
    expect(getItem(I.BEETROOT_SOUP).food).toEqual({ hunger: 6, saturation: 7.2, leaves: I.BOWL });
    const w = reader({ '1,0,1': B.FARMLAND });
    expect(canStayAt(B.BEETROOT_0, w, 1, 1, 1)).toBe(true);
    expect(canStayAt(B.BEETROOT_0, w, 2, 1, 2)).toBe(false);
    expect(blockDrops(BLOCKS[B.BEETROOT_1], null)).toEqual([{ id: I.BEETROOT_SEEDS, count: 1 }]);
    expect(blockDrops(BLOCKS[B.BEETROOT_3], null, () => 0)).toEqual([
      { id: I.BEETROOT, count: 1 },
      { id: I.BEETROOT_SEEDS, count: 1 },
    ]);
    expect(blockDrops(BLOCKS[B.BEETROOT_3], null, () => 0.99)).toEqual([
      { id: I.BEETROOT, count: 1 },
      { id: I.BEETROOT_SEEDS, count: 3 },
    ]);
    expect(findRecipe([makeStack(B.PLANKS), null, makeStack(B.PLANKS), null, makeStack(B.PLANKS), null], 3, 2)?.result).toEqual({ id: I.BOWL, count: 4 });
    const soup = [I.BOWL, I.BEETROOT, I.BEETROOT, I.BEETROOT, I.BEETROOT, I.BEETROOT, I.BEETROOT, null, null].map((id) => (id ? makeStack(id) : null));
    expect(findRecipe(soup, 3, 3)?.result).toEqual({ id: I.BEETROOT_SOUP, count: 1 });
  });

  it('a red mushroom and a brown one in a bowl make stew', () => {
    expect(getItem(I.MUSHROOM_STEW).food).toEqual({ hunger: 6, saturation: 7.2, leaves: I.BOWL });
    expect(getItem(I.MUSHROOM_STEW).maxStack).toBe(1);
    const stew = [I.BOWL, B.RED_MUSHROOM, B.BROWN_MUSHROOM].map((id) => makeStack(id));
    expect(findRecipe(stew, 3, 1)?.result).toEqual({ id: I.MUSHROOM_STEW, count: 1 });
    expect(findRecipe([makeStack(I.BOWL), makeStack(B.RED_MUSHROOM)], 2, 1)).toBeNull();
  });

  it('a bowl, baked potato, carrot, cooked rabbit and a brown mushroom make rabbit stew', () => {
    expect(getItem(I.RABBIT_STEW).food).toEqual({ hunger: 10, saturation: 12, leaves: I.BOWL });
    expect(getItem(I.RABBIT_STEW).maxStack).toBe(1);
    const cell = (id: number | null) => (id ? makeStack(id) : null);
    const stew = [null, I.BOWL, null, I.CARROT, I.COOKED_RABBIT, B.BROWN_MUSHROOM, null, I.BAKED_POTATO, null].map(cell);
    expect(findRecipe(stew, 3, 3)?.result).toEqual({ id: I.RABBIT_STEW, count: 1 });
    expect(findRecipe([I.BOWL, I.CARROT, I.COOKED_RABBIT, B.BROWN_MUSHROOM, I.BAKED_POTATO].map((id) => makeStack(id)), 5, 1)).toBeNull();
  });

  it('cocoa beans stick to a jungle log, a ripe pod drops three, and wheat plus cocoa makes cookies', () => {
    expect(getItem(I.COCOA_BEANS).block).toBe(cocoaId(0, 0));
    expect(getItem(I.COOKIE).food).toEqual({ hunger: 2, saturation: 0.4 });
    const log = reader({ '0,1,1': B.JUNGLE_LOG });
    expect(canStayAt(cocoaId(1, 0), log, 1, 1, 1)).toBe(true);
    expect(canStayAt(cocoaId(1, 2), log, 1, 1, 1)).toBe(true);
    expect(canStayAt(cocoaId(0, 0), log, 1, 1, 1)).toBe(false);
    expect(canStayAt(cocoaId(1, 0), reader({ '0,1,1': B.LOG }), 1, 1, 1)).toBe(false);
    expect(placementFor(cocoaId(0, 0), 1, 0, 0)).toBe(cocoaId(1, 0));
    expect(placementFor(cocoaId(0, 0), 0, 1, 0)).toBeNull();
    expect(blockDrops(BLOCKS[cocoaId(1, 0)], null)).toEqual([{ id: I.COCOA_BEANS, count: 1 }]);
    expect(blockDrops(BLOCKS[cocoaId(1, 1)], null)).toEqual([{ id: I.COCOA_BEANS, count: 1 }]);
    expect(blockDrops(BLOCKS[cocoaId(2, 2)], null)).toEqual([{ id: I.COCOA_BEANS, count: 3 }]);
    expect(findRecipe([makeStack(I.WHEAT), makeStack(I.COCOA_BEANS)], 2, 1)?.result).toEqual({ id: I.COOKIE, count: 8 });
  });

  it('a cake sits on solid ground, drops nothing, and three buckets of milk bake one', () => {
    expect(getItem(I.CAKE).block).toBe(cakeId(0));
    expect(getItem(I.MILK_BUCKET).food).toEqual({ hunger: 0, saturation: 0, always: true, leaves: I.BUCKET, clears: true });
    expect(canStayAt(cakeId(0), reader(), 1, 1, 1)).toBe(true);
    expect(canStayAt(cakeId(4), reader(), 1, 1, 1)).toBe(true);
    expect(canStayAt(cakeId(0), reader(), 1, 2, 1)).toBe(false);
    expect(canStayAt(cakeId(0), reader({ '1,0,1': cakeId(0) }), 1, 1, 1)).toBe(false);
    expect(blockDrops(BLOCKS[cakeId(0)], null)).toEqual([]);
    expect(blockDrops(BLOCKS[cakeId(6)], null)).toEqual([]);
    const baked = [I.MILK_BUCKET, I.MILK_BUCKET, I.MILK_BUCKET, I.SUGAR, I.EGG, I.SUGAR, I.WHEAT, I.WHEAT, I.WHEAT].map((id) => makeStack(id));
    expect(findRecipe(baked, 3, 3)?.result).toEqual({ id: I.CAKE, count: 1 });
  });

  it('sweet berries plant on grass or dirt, and a ripe bush drops a handful', () => {
    expect(getItem(I.SWEET_BERRIES).block).toBe(B.SWEET_BERRY_0);
    expect(getItem(I.SWEET_BERRIES).food).toEqual({ hunger: 2, saturation: 0.4 });
    expect(canStayAt(B.SWEET_BERRY_0, reader({ '1,0,1': B.GRASS }), 1, 1, 1)).toBe(true);
    expect(canStayAt(B.SWEET_BERRY_0, reader({ '1,0,1': B.DIRT }), 1, 1, 1)).toBe(true);
    expect(canStayAt(B.SWEET_BERRY_0, reader({ '1,0,1': B.STONE }), 1, 1, 1)).toBe(false);
    expect(blockDrops(BLOCKS[B.SWEET_BERRY_1], null)).toEqual([{ id: I.SWEET_BERRIES, count: 1 }]);
    expect(blockDrops(BLOCKS[B.SWEET_BERRY_3], null, () => 0)).toEqual([{ id: I.SWEET_BERRIES, count: 2 }]);
    expect(blockDrops(BLOCKS[B.SWEET_BERRY_3], null, () => 0.99)).toEqual([{ id: I.SWEET_BERRIES, count: 3 }]);
  });

  it('glow berries hang from a ceiling, and a vine with berries drops them', () => {
    expect(getItem(I.GLOW_BERRIES).block).toBe(B.CAVE_VINES);
    expect(getItem(I.GLOW_BERRIES).food).toEqual({ hunger: 2, saturation: 0.4 });
    expect(canStayAt(B.CAVE_VINES, reader({ '1,2,1': B.STONE }), 1, 1, 1)).toBe(true);
    expect(canStayAt(B.CAVE_VINES, reader({ '1,2,1': B.CAVE_VINES_BERRIES }), 1, 1, 1)).toBe(true);
    expect(canStayAt(B.CAVE_VINES, reader(), 1, 1, 1)).toBe(false);
    expect(placementFor(B.CAVE_VINES, 0, -1, 0)).toBe(B.CAVE_VINES);
    expect(placementFor(B.CAVE_VINES, 0, 1, 0)).toBeNull();
    expect(blockDrops(BLOCKS[B.CAVE_VINES], null)).toEqual([{ id: I.GLOW_BERRIES, count: 1 }]);
    expect(blockDrops(BLOCKS[B.CAVE_VINES_BERRIES], null)).toEqual([{ id: I.GLOW_BERRIES, count: 1 }]);
  });

  it('a melon breaks into slices, and a pumpkin bakes into a pie', () => {
    expect(blockDrops(BLOCKS[B.MELON], null, () => 0)).toEqual([{ id: I.MELON_SLICE, count: 3 }]);
    expect(blockDrops(BLOCKS[B.MELON], null, () => 0.99)).toEqual([{ id: I.MELON_SLICE, count: 7 }]);
    expect(blockDrop(BLOCKS[B.MELON], null, () => 0, { silk: true })).toEqual({ id: B.MELON, count: 1 });
    expect(getItem(I.MELON_SLICE).food).toEqual({ hunger: 2, saturation: 1.2 });
    const sugar = findRecipe([makeStack(B.SUGAR_CANE)], 1, 1);
    expect(sugar?.result).toEqual({ id: I.SUGAR, count: 1 });
    const pie = findRecipe([makeStack(B.PUMPKIN), makeStack(I.SUGAR), makeStack(I.EGG)], 3, 1);
    expect(pie?.result).toEqual({ id: I.PUMPKIN_PIE, count: 1 });
    expect(getItem(I.PUMPKIN_PIE).food).toEqual({ hunger: 8, saturation: 4.8 });
    expect(getItem(I.ROTTEN_FLESH).food?.sickness).toEqual({ chance: 0.8, seconds: 30 });
    expect(getItem(I.CHICKEN).food?.sickness).toEqual({ chance: 0.3, seconds: 30 });
    expect(getItem(I.SPIDER_EYE).food?.poison).toEqual({ chance: 1, seconds: 4 });
    expect(getItem(I.SPIDER_EYE).food?.always).toBeUndefined();
  });

  it('farmland drops dirt', () => {
    expect(blockDrop(BLOCKS[B.FARMLAND], null)).toEqual({ id: B.DIRT, count: 1 });
  });

  it('crafts hoes from every material, and bread from three wheat', () => {
    const hoe = findRecipe([makeStack(B.PLANKS), makeStack(B.PLANKS), null, makeStack(I.STICK), null, makeStack(I.STICK)], 2, 3);
    expect(hoe?.result.id).toBe(toolId('hoe', 'wood'));
    const mirrored = findRecipe([makeStack(I.DIAMOND), makeStack(I.DIAMOND), makeStack(I.STICK), null, makeStack(I.STICK), null], 2, 3);
    expect(mirrored?.result.id).toBe(toolId('hoe', 'diamond'));

    const bread = findRecipe([makeStack(I.WHEAT), makeStack(I.WHEAT), makeStack(I.WHEAT), null, null, null, null, null, null], 3, 3);
    expect(bread?.result).toEqual({ id: I.BREAD, count: 1 });
    expect(getItem(I.BREAD).food?.hunger).toBe(5);
  });

  it('keeps every tile index inside the atlas', () => {
    expect(ATLAS_TILES).toBe(ATLAS_COLS * ATLAS_ROWS);
    expect(ATLAS_TILES & (ATLAS_TILES - 1)).toBe(0);
    for (const item of allItems()) expect(item.tile).toBeLessThan(ATLAS_TILES);
    // The mesher keeps a block's tile in the low bits of a face key, wide enough for the whole atlas.
    for (const b of BLOCKS) for (const t of [b.tiles.top, b.tiles.bottom, b.tiles.side]) expect(t).toBeLessThan(ATLAS_TILES);
    expect(getItem(toolId('hoe', 'iron')).tool?.kind).toBe('hoe');
  });
});
