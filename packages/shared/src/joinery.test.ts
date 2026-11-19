import { describe, expect, it } from 'vitest';
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  B,
  BLOCK_COUNT,
  BLOCKS,
  GameSession,
  HeadlessWorld,
  I,
  ITEMS,
  JOINERY,
  JOINERY_NEXT,
  MASONRY_NEXT,
  TILE_NAMES,
  WorldGenerator,
  buttonInfo,
  collisionBoxes,
  doorId,
  doorInfo,
  doorKind,
  findRecipe,
  gateId,
  gateInfo,
  gateKind,
  idByName,
  isFence,
  makeStack,
  mulberry32,
  opensByHand,
  placementFor,
  plateInfo,
  strippedOf,
  toolId,
  trapdoorId,
  trapdoorInfo,
  trapdoorKind,
} from './index';

const birch = JOINERY.woods.find((w) => w.spec.name === 'birch')!;
const oak = JOINERY.woods.find((w) => w.spec.name === 'oak')!;

describe('the rest of each wood', () => {
  it('fits after the masonry and stays inside the block table', () => {
    expect(JOINERY.woods[0].wood).toBeGreaterThanOrEqual(MASONRY_NEXT);
    expect(JOINERY_NEXT).toBeLessThan(BLOCK_COUNT);
    const ids = new Set<number>();
    for (const id of [JOINERY.poplarLog, JOINERY.ironDoor, JOINERY.ironTrapdoor, JOINERY.heavyPlate, JOINERY.lightPlate]) {
      expect(BLOCKS[id].id, BLOCKS[id].name).toBe(id);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    const seen = new Set(TILE_NAMES);
    expect(seen.size).toBe(TILE_NAMES.length);
    expect(TILE_NAMES.length).toBeLessThanOrEqual(ATLAS_COLS * ATLAS_ROWS);
  });

  it('keeps the oak door and adds a birch one that still round-trips', () => {
    expect(doorInfo(doorId(true, true, 2))).toEqual({ upper: true, open: true, facing: 2 });
    expect(doorKind(doorId(false, false, 1))).toBe(0);
    for (const upper of [false, true]) {
      for (const open of [false, true]) {
        for (let f = 0; f < 4; f++) {
          const id = doorId(upper, open, f, birch.kind);
          expect(doorInfo(id)).toEqual({ upper, open, facing: f });
          expect(doorKind(id)).toBe(birch.kind);
          const trap = trapdoorId(upper, open, f, birch.kind);
          expect(trapdoorInfo(trap)).toEqual({ top: upper, open, facing: f });
          expect(trapdoorKind(trap)).toBe(birch.kind);
        }
      }
    }
    expect(gateInfo(gateId(true, 2, birch.kind))).toEqual({ open: true, facing: 2 });
    expect(gateKind(gateId(false, 0, birch.kind))).toBe(birch.kind);
    expect(isFence(birch.fence)).toBe(true);
    expect(isFence(B.FENCE)).toBe(true);
    expect(oak.door).toBe(0);
    expect(buttonInfo(birch.button)).toEqual({ face: 0, on: false });
    expect(plateInfo(birch.plate)).toEqual({ wood: true, on: false });
  });

  it('crafts from that wood, and an axe strips the log', () => {
    const planks = idByName('birch_planks');
    const grid = (ids: (number | null)[]) => ids.map((id) => (id ? makeStack(id, 1) : null));
    expect(findRecipe(grid([planks, planks, null, planks, planks, null, planks, planks, null]), 3, 3)?.result).toEqual({ id: birch.door, count: 3 });
    expect(findRecipe(grid([idByName('birch_log')]), 1, 1)?.result.id).toBe(planks);
    expect(strippedOf(idByName('birch_log'))).toBe(idByName('stripped_birch_log'));
    expect(strippedOf(idByName('birch_wood'))).toBe(idByName('stripped_birch_wood'));
    expect(findRecipe(grid([idByName('stripped_birch_log'), idByName('stripped_birch_log'), null, idByName('stripped_birch_log'), idByName('stripped_birch_log'), null, null, null, null]), 3, 3)?.result.id).toBe(idByName('stripped_birch_wood'));
    expect(ITEMS.get(birch.door)?.use).toBe('door');
    expect(opensByHand(JOINERY.ironDoor)).toBe(false);
    expect(opensByHand(birch.door)).toBe(true);
    expect(placementFor(birch.trapdoor, -1, 0, 0, 0, 0.9)).toBe(trapdoorId(true, false, 0, birch.kind));
  });

  it('strips a log in the hand and leaves an iron door shut', () => {
    const generator = new WorldGenerator(3);
    const world = new HeadlessWorld(generator);
    for (let x = 0; x <= 12; x++)
      for (let z = 0; z <= 12; z++) {
        for (let y = 101; y < 110; y++) world.setBlock(x, y, z, B.AIR);
        world.setBlock(x, 100, z, B.STONE);
      }
    const s = new GameSession({ seed: 3, world, generator, naturalSpawning: false, rand: mulberry32(3), mode: 'survival' });
    s.finishLoading();
    s.teleport(4.5, 101, 4.5, 0, 0);
    world.setBlock(6, 101, 4, idByName('spruce_log'));
    s.inventory.set(0, makeStack(toolId('axe', 'wood'), 1));
    expect(s.useOn(6, 101, 4, 0, 0, -1)).toBe(true);
    expect(world.getBlock(6, 101, 4)).toBe(idByName('stripped_spruce_log'));
    const iron = JOINERY.ironDoor;
    world.setBlock(8, 101, 4, iron);
    world.setBlock(8, 102, 4, doorId(true, false, 0, doorKind(iron)));
    expect(s.useBlock(8, 101, 4)).toBe(true);
    expect(doorInfo(world.getBlock(8, 101, 4))?.open).toBe(false);
    const boxes = collisionBoxes(birch.fence, () => B.AIR);
    expect(boxes.some((b) => b[4] === 1.5)).toBe(true);
  });
});
