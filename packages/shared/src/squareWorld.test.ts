import { describe, expect, it } from 'vitest';
import { B, CHUNK_SIZE, GameSession, HeadlessWorld, SQUARE_HALF, SQUARE_TOP, blockIndex, isWorldKind, makeGenerator, mulberry32, type InputFrame } from './index';

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

describe('the square world', () => {
  const gen = makeGenerator(1337, 'square');
  const at = (x: number, y: number, z: number): number => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return gen.generateChunk(cx, cz)[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  };

  it('is a 64 x 64 slab with a stone-brick border and nothing around it', () => {
    expect(gen.kind).toBe('square');
    expect(makeGenerator(1337).kind).toBe('overworld');
    expect(at(0, SQUARE_TOP, 0)).toBe(B.STONE);
    expect(at(0, SQUARE_TOP + 1, 0)).toBe(B.AIR);
    expect(at(0, 0, 0)).toBe(B.BEDROCK);
    expect(at(0, SQUARE_TOP - 1, 0)).toBe(B.STONE);
    for (const [x, z] of [[-SQUARE_HALF, 0], [SQUARE_HALF - 1, 5], [3, -SQUARE_HALF], [-7, SQUARE_HALF - 1]]) expect(at(x, SQUARE_TOP, z)).toBe(B.STONE_BRICKS);
    for (const [x, z] of [[-SQUARE_HALF - 1, 0], [SQUARE_HALF, 0], [0, SQUARE_HALF], [0, -SQUARE_HALF - 1], [100, 100]]) {
      for (const y of [0, 1, SQUARE_TOP]) expect(at(x, y, z)).toBe(B.AIR);
    }
  });

  it('is the same for every call, and the player starts on top of it', () => {
    expect([...gen.generateChunk(-1, -1)]).toEqual([...makeGenerator(1337, 'square').generateChunk(-1, -1)]);
    const s = gen.findSpawn();
    expect(s.y).toBe(SQUARE_TOP + 1);
    expect(gen.columnAt(s.x, s.z).height).toBe(SQUARE_TOP);
  });

  it('keeps its own blocks, and drops a player who walks off the edge out of the world', () => {
    const world = new HeadlessWorld(gen);
    const s = new GameSession({ seed: 1337, world, generator: gen, naturalSpawning: false, rand: mulberry32(1) });
    s.finishLoading();
    expect(s.body.y).toBeCloseTo(SQUARE_TOP + 1, 1);
    s.teleport(SQUARE_HALF + 4.5, SQUARE_TOP + 1, 0.5);
    for (let i = 0; i < 400 && !s.vitals.dead; i++) s.tick(idle());
    expect(s.vitals.dead).toBe(true);
    // The overworld's chunk at the same place is not the platform.
    const over = makeGenerator(1337).generateChunk(0, 0);
    expect(over[blockIndex(0, SQUARE_TOP, 0)]).not.toBe(B.STONE_BRICKS);
  });

  it('knows the two kinds by name', () => {
    expect(isWorldKind('square')).toBe(true);
    expect(isWorldKind('overworld')).toBe(true);
    expect(isWorldKind('nether')).toBe(false);
    expect(isWorldKind(null)).toBe(false);
  });
});
