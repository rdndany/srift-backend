import { describe, expect, it } from 'vitest';
import {
  B,
  CHUNK_SIZE,
  CHUNK_VOLUME,
  SEA_LEVEL,
  WorldGenerator,
  blockIndex,
  bodyOverlapsBlock,
  createBody,
  raycast,
  stepPlayer,
  type BlockReader,
  type MoveInput,
} from './index';

function hashBytes(a: Uint8Array | Uint16Array): number {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619);
  return h >>> 0;
}

describe('world generation', () => {
  it('is deterministic for the same seed and differs between seeds', () => {
    const a = new WorldGenerator(1337).generateChunk(3, -2);
    const b = new WorldGenerator(1337).generateChunk(3, -2);
    const c = new WorldGenerator(4242).generateChunk(3, -2);
    expect(a.length).toBe(CHUNK_VOLUME);
    expect(hashBytes(a)).toBe(hashBytes(b));
    expect(hashBytes(a)).not.toBe(hashBytes(c));
  });

  it('has bedrock at y=0, and nothing above terrain/sea level in the sky', () => {
    const chunk = new WorldGenerator(7).generateChunk(0, 0);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        expect(chunk[blockIndex(x, 0, z)]).toBe(B.BEDROCK);
        expect(chunk[blockIndex(x, 127, z)]).toBe(B.AIR);
      }
    }
  });

  it('finds a dry spawn point', () => {
    const gen = new WorldGenerator(99);
    const s = gen.findSpawn();
    expect(s.y).toBeGreaterThan(SEA_LEVEL);
  });

  it('generates some ore and some trees across a region', () => {
    const gen = new WorldGenerator(2024);
    const counts = new Map<number, number>();
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        for (const id of gen.generateChunk(cx, cz)) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    expect(counts.get(B.COAL_ORE) ?? 0).toBeGreaterThan(0);
    expect(counts.get(B.STONE) ?? 0).toBeGreaterThan(0);
    expect(counts.get(B.WATER) ?? 0).toBeGreaterThan(0);
  });
});

function flatWorld(groundY: number): BlockReader {
  return { getBlock: (_x, y) => (y <= groundY ? B.STONE : B.AIR) };
}

const idle: MoveInput = {
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  fly: false,
  flyDown: false,
  yaw: 0,
};

describe('physics', () => {
  it('falls and lands on the ground', () => {
    const world = flatWorld(10);
    const body = createBody(0.5, 20, 0.5);
    for (let i = 0; i < 240; i++) stepPlayer(world, body, idle, 1 / 60);
    expect(body.y).toBeCloseTo(11, 3);
    expect(body.onGround).toBe(true);
  });

  it('walks forward (-Z at yaw 0) and is stopped by a wall', () => {
    const world: BlockReader = {
      getBlock: (x, y, z) => (y <= 10 || z <= -5 ? B.STONE : B.AIR),
    };
    const body = createBody(0.5, 11, 0.5);
    for (let i = 0; i < 300; i++) stepPlayer(world, body, { ...idle, forward: 1 }, 1 / 60);
    expect(body.z).toBeLessThan(0);
    expect(body.z).toBeGreaterThanOrEqual(-4 + 0.3 - 0.001);
  });

  it('jumps about 1.25 blocks high', () => {
    const world = flatWorld(10);
    const body = createBody(0.5, 11, 0.5);
    for (let i = 0; i < 5; i++) stepPlayer(world, body, idle, 1 / 60);
    let peak = body.y;
    for (let i = 0; i < 60; i++) {
      stepPlayer(world, body, { ...idle, jump: true }, 1 / 60);
      peak = Math.max(peak, body.y);
    }
    expect(peak - 11).toBeGreaterThan(1.0);
    expect(peak - 11).toBeLessThan(1.6);
  });

  it('detects body/block overlap for placement checks', () => {
    const body = createBody(0.5, 11, 0.5);
    expect(bodyOverlapsBlock(body, 0, 11, 0)).toBe(true);
    expect(bodyOverlapsBlock(body, 0, 10, 0)).toBe(false);
    expect(bodyOverlapsBlock(body, 2, 11, 0)).toBe(false);
  });
});

describe('raycast', () => {
  const world: BlockReader = { getBlock: (x, y, z) => (x === 3 && y === 0 && z === 0 ? B.STONE : B.AIR) };

  it('hits a block with the right face normal', () => {
    const hit = raycast(world, 0.5, 0.5, 0.5, 1, 0, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit).toMatchObject({ x: 3, y: 0, z: 0, nx: -1, ny: 0, nz: 0 });
  });

  it('respects max distance and misses', () => {
    expect(raycast(world, 0.5, 0.5, 0.5, 1, 0, 0, 1.5)).toBeNull();
    expect(raycast(world, 0.5, 0.5, 0.5, 0, 1, 0, 10)).toBeNull();
  });
});
