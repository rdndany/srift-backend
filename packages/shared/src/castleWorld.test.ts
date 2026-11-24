import { describe, expect, it } from 'vitest';
import { B, CASTLE_GROUND, CASTLE_SPAWN, CHUNK_SIZE, GREYKEEP, IS_SOLID, WORLD_KINDS, blockIndex, isWorldKind, ladderInfo, makeGenerator, stairInfo } from './index';

describe('the castle world', () => {
  const gen = makeGenerator(1, 'castle');
  const blockAt = (x: number, y: number, z: number): number => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return gen.generateChunk(cx, cz)[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  };

  it('is a world kind of its own, and the same every time', () => {
    expect(isWorldKind('castle')).toBe(true);
    expect(WORLD_KINDS).toContain('castle');
    expect(gen.kind).toBe('castle');
    expect([...gen.generateChunk(0, -5)]).toEqual([...makeGenerator(1, 'castle').generateChunk(0, -5)]);
  });

  it('is an endless green plain: bedrock, stone, dirt and grass', () => {
    for (const [x, z] of [[100, 100], [-300, 40], [0, 0]]) {
      expect(blockAt(x, 0, z)).toBe(B.BEDROCK);
      expect(blockAt(x, CASTLE_GROUND, z)).toBe(B.GRASS);
      expect(blockAt(x, CASTLE_GROUND - 1, z)).toBe(B.DIRT);
      expect(blockAt(x, CASTLE_GROUND - 6, z)).toBe(B.STONE);
      expect(blockAt(x, CASTLE_GROUND + 1, z)).toBe(B.AIR);
    }
    expect(gen.columnAt(5, 5).height).toBe(CASTLE_GROUND);
  });

  it('arrives you on the grass in front of the bridge, and is no place for monsters', () => {
    const s = gen.findSpawn();
    expect(s.y).toBe(CASTLE_GROUND + 1);
    expect(s.z).toBe(CASTLE_SPAWN.z);
    expect(blockAt(Math.floor(s.x), CASTLE_GROUND, Math.floor(s.z))).toBe(B.GRASS);
    expect(gen.safeFromMonsters(0, 0)).toBe(true);
    expect(gen.safeFromMonsters(500, -700)).toBe(true);
  });

  it('knows the castle as a named place, and keeps its chests', () => {
    expect(gen.zoneAt(GREYKEEP.yard.x + 0.5, CASTLE_GROUND + 2, GREYKEEP.yard.z + 0.5)).toBe('greykeep');
    expect(gen.zoneAt(CASTLE_SPAWN.x, CASTLE_GROUND + 1, CASTLE_SPAWN.z)).toBeNull();
    // Some chest in the castle holds loot.
    let chests = 0;
    for (let z = GREYKEEP.z0; z <= GREYKEEP.z1; z++) for (let x = GREYKEEP.x0; x <= GREYKEEP.x1; x++) for (let y = CASTLE_GROUND; y < CASTLE_GROUND + 40; y++) if (gen.lootAt(x, y, z)) chests++;
    expect(chests).toBeGreaterThan(0);
  });

  it('raises Greykeep, with a gate, a long hall and a spire', () => {
    const g = CASTLE_GROUND;
    const { gate, yard, keep, nave, naveEnd, spire } = GREYKEEP;
    // The arch is open well over head height, and the stone closes it above.
    for (let dy = 1; dy <= 5; dy++) expect(blockAt(gate.x, g + dy, gate.z)).toBe(B.AIR);
    expect(IS_SOLID[blockAt(gate.x, g + 6, gate.z)]).toBe(1);
    // The curtain is stone, and the side passage is open ground with sky above it.
    expect(IS_SOLID[blockAt(-6, g + 2, gate.z)]).toBe(1);
    expect(IS_SOLID[blockAt(yard.x, g, yard.z)]).toBe(1);
    expect(blockAt(yard.x, g + 1, yard.z)).toBe(B.AIR);
    expect(blockAt(yard.x, g + 12, yard.z)).toBe(B.AIR);
    // The gatehouse is solid in its face, up where the dark notch is.
    expect(IS_SOLID[blockAt(keep.x, g + keep.dy, keep.z)]).toBe(1);
    // The hall runs north from the gate, and the back wall closes it.
    expect(blockAt(nave.x, g + 2, nave.z)).toBe(B.AIR);
    expect(blockAt(nave.x, g + 2, -63)).toBe(B.AIR);
    expect(IS_SOLID[blockAt(naveEnd.x, g + 2, naveEnd.z)]).toBe(1);
    // The spire stands above the hall roof.
    expect(IS_SOLID[blockAt(spire.x, g + spire.dy, spire.z)]).toBe(1);
    expect(gen.zoneAt(yard.x + 0.5, g + 2, yard.z + 0.5)).toBe('greykeep');
    expect(gen.safeFromMonsters(yard.x, yard.z)).toBe(true);
  });

  it('can be climbed: ladders up the towers, stairs to the wall walk, and a clear way onto both', () => {
    const g = CASTLE_GROUND;
    // The south-west tower: a ladder against its front wall from the floor to the deck, and clear air above it.
    for (let dy = 1; dy <= 15; dy++) expect(ladderInfo(blockAt(-27, g + dy, -61))?.facing, `ladder at height ${dy}`).toBe(2);
    expect(blockAt(-27, g + 16, -61)).toBe(B.AIR);
    expect(blockAt(-27, g + 17, -61)).toBe(B.AIR);
    // Stairs run up the inside of the front wall, one block per step, and the rail leaves a gap where they arrive.
    for (let i = 0; i < 10; i++) expect(stairInfo(blockAt(-8 - i, g + 1 + i, -65))?.dir, `step ${i}`).toBe(1);
    for (let x = -17; x <= -15; x++) expect(blockAt(x, g + 11, -64), `gap at ${x}`).toBe(B.AIR);
    // The walk itself is stone with two blocks of air above it, and runs into the tower.
    for (let x = -20; x <= -6; x++) {
      expect(IS_SOLID[blockAt(x, g + 10, -63)], `walk at ${x}`).toBe(1);
      expect(blockAt(x, g + 11, -63)).toBe(B.AIR);
      expect(blockAt(x, g + 12, -63)).toBe(B.AIR);
    }
    expect(blockAt(-21, g + 11, -63)).toBe(B.AIR);
    expect(blockAt(-21, g + 12, -63)).toBe(B.AIR);
    // The ground-floor door of the tower and the doors of the gatehouse hall.
    for (let dy = 1; dy <= 3; dy++) expect(blockAt(-21, g + dy, -68), `tower door at ${dy}`).toBe(B.AIR);
    for (const x of [-5, 5]) for (let dy = 11; dy <= 12; dy++) expect(blockAt(x, g + dy, -63), `hall door at ${x}, ${dy}`).toBe(B.AIR);
  });
});
