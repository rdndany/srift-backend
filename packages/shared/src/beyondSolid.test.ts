import { describe, expect, it, vi } from 'vitest';
import { B, BLOCKS, BeyondWorldGenerator, CHUNK_SIZE, SEA_LEVEL, SIGNATURE, WORLD_HEIGHT, dropHovering, keepRooted, blockIndex } from './index';

vi.setConfig({ testTimeout: 180_000 });

// Nothing in the Beyond hangs in the air (the drifting islands of the Sky Islands and the Shattered Realm are meant to), and
// every building that is drawn stands whole.

describe('keepRooted', () => {
  it('keeps what touches the ground, by a corner too, and drops the rest', () => {
    const cells = [
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 2, z: 1 },
      { x: 2, y: 3, z: 2 },
      { x: 9, y: 9, z: 9 },
    ];
    expect(keepRooted(cells, (c) => c.y <= 1).map((c) => c.x)).toEqual([0, 1, 2]);
  });
});

describe('dropHovering', () => {
  const at = (x: number, y: number, z: number) => blockIndex(x, y, z);
  const ground = (): Uint16Array => {
    const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    for (let y = 0; y <= 20; y++) for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) blocks[at(x, y, z)] = B.STONE;
    return blocks;
  };

  it('removes a small piece in the air and keeps a tree standing on the ground', () => {
    const blocks = ground();
    blocks[at(8, 40, 8)] = B.STONE;
    blocks[at(8, 41, 8)] = B.STONE;
    for (let y = 21; y < 26; y++) blocks[at(5, y, 5)] = B.LOG;
    blocks[at(6, 25, 6)] = B.LEAVES; // joined by a corner
    expect(dropHovering(blocks, 600)).toBe(2);
    expect(blocks[at(8, 40, 8)]).toBe(B.AIR);
    expect(blocks[at(5, 25, 5)]).toBe(B.LOG);
    expect(blocks[at(6, 25, 6)]).toBe(B.LEAVES);
  });

  it('leaves a lily pad on the sea, but not a block on cave water', () => {
    const blocks = ground();
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) for (let y = 21; y <= SEA_LEVEL; y++) blocks[at(x, y, z)] = B.WATER;
    blocks[at(8, SEA_LEVEL + 1, 8)] = B.LILY_PAD;
    blocks[at(4, 30, 4)] = B.STONE; // in the water, far under the surface
    expect(dropHovering(blocks, 600)).toBe(1);
    expect(blocks[at(8, SEA_LEVEL + 1, 8)]).toBe(B.LILY_PAD);
    expect(blocks[at(4, 30, 4)]).toBe(B.WATER);
  });

  it('keeps a piece that runs over the edge of the chunk (the next chunk decides) and a big island', () => {
    const blocks = ground();
    blocks[at(15, 40, 8)] = B.STONE;
    for (let y = 60; y < 66; y++) for (let z = 3; z < 12; z++) for (let x = 3; x < 12; x++) blocks[at(x, y, z)] = B.GRASS;
    expect(dropHovering(blocks, 100)).toBe(0);
  });
});

/** Every floating block (not on a lily pad's water) of a square of chunks: whatever does not touch the ground or the edge of the square. */
function floatingIn(gen: BeyondWorldGenerator, cx0: number, cz0: number, size: number): { x: number; y: number; z: number; id: number }[] {
  const W = size * CHUNK_SIZE;
  const H = WORLD_HEIGHT;
  const solid = new Uint8Array(W * W * H);
  const ids = new Uint16Array(W * W * H);
  const idx = (x: number, y: number, z: number) => (y * W + z) * W + x;
  for (let cz = 0; cz < size; cz++) {
    for (let cx = 0; cx < size; cx++) {
      const chunk = gen.generateChunk(cx0 + cx, cz0 + cz);
      for (let y = 0; y < H; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const id = chunk[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
            const i = idx(cx * CHUNK_SIZE + x, y, cz * CHUNK_SIZE + z);
            ids[i] = id;
            if (id !== B.AIR && !BLOCKS[id].liquid) solid[i] = 1;
          }
        }
      }
    }
  }
  const seen = new Uint8Array(W * W * H);
  const stack: number[] = [];
  const push = (i: number) => {
    if (solid[i] && !seen[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) push(idx(x, 0, z));
  for (let y = 0; y < H; y++) {
    for (let k = 0; k < W; k++) {
      push(idx(0, y, k));
      push(idx(W - 1, y, k));
      push(idx(k, y, 0));
      push(idx(k, y, W - 1));
    }
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % W;
    const z = Math.floor(i / W) % W;
    const y = Math.floor(i / (W * W));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || ny < 0 || nx >= W || nz >= W || ny >= H) continue;
          push(idx(nx, ny, nz));
        }
      }
    }
  }
  const out: { x: number; y: number; z: number; id: number }[] = [];
  const ox = cx0 * CHUNK_SIZE;
  const oz = cz0 * CHUNK_SIZE;
  for (let i = 0; i < solid.length; i++) {
    if (!solid[i] || seen[i]) continue;
    const id = ids[i];
    if (id === B.LILY_PAD || BLOCKS[id].name === 'lily_pad') continue;
    out.push({ x: ox + (i % W), y: Math.floor(i / (W * W)), z: oz + (Math.floor(i / W) % W), id });
  }
  return out;
}

describe('the Beyond has nothing hanging in the air', () => {
  it('has no floating block on the surface round a building of every kind, or over a spread of country', () => {
    const gen = new BeyondWorldGenerator(1);
    const realm = (x: number, z: number) => {
      const sub = gen.columnAt(x, z).sub;
      return sub === SIGNATURE.SKY_ISLANDS || sub === SIGNATURE.SHATTERED_REALM;
    };
    const seen = new Set<string>();
    const spots: { name: string; cx: number; cz: number; size: number }[] = [];
    for (const p of gen.places.near(0, 0, 3000)) {
      if (seen.has(p.key) || realm(p.x, p.z)) continue;
      seen.add(p.key);
      const half = Math.ceil((p.info.radius + 20) / CHUNK_SIZE);
      spots.push({ name: p.key, cx: Math.floor(p.x / CHUNK_SIZE) - half, cz: Math.floor(p.z / CHUNK_SIZE) - half, size: half * 2 + 1 });
    }
    for (const [x, z] of [[0, 0], [600, 400], [-800, 300], [1200, -900], [-1400, -1500], [300, 1700], [-600, -2000]]) {
      spots.push({ name: `country ${x},${z}`, cx: Math.floor(x / CHUNK_SIZE) - 4, cz: Math.floor(z / CHUNK_SIZE) - 4, size: 9 });
    }
    expect(spots.length).toBeGreaterThan(20);
    const bad: string[] = [];
    for (const s of spots) {
      const floating = floatingIn(gen, s.cx, s.cz, s.size).filter((b) => b.y >= SEA_LEVEL - 4 && !realm(b.x, b.z));
      if (floating.length > 0) bad.push(`${s.name}: ${floating.length} at ${floating[0].x},${floating[0].y},${floating[0].z} (${BLOCKS[floating[0].id].name})`);
    }
    expect(bad).toEqual([]);
  });
});

describe('the buildings stand whole', () => {
  it('draws every kind of place with most of what was planned, and no two places run into each other', () => {
    for (const seed of [1, 2, 3]) {
      const gen = new BeyondWorldGenerator(seed);
      const places = gen.places.near(0, 0, 2400);
      expect(places.length).toBeGreaterThan(100);
      for (const p of places) {
        gen.places.settle(p);
        expect(p.drawn).toBeGreaterThan(0);
        // Ruins crumble, but a building does not lose most of itself to the pruning.
        expect(p.floating!.size / p.drawn, `${p.key} at ${p.x},${p.z} (seed ${seed})`).toBeLessThan(0.4);
      }
      for (let i = 0; i < places.length; i++) {
        for (let j = i + 1; j < places.length; j++) {
          const a = places[i];
          const b = places[j];
          const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
          expect(d, `${a.key} and ${b.key} at ${a.x},${a.z} (seed ${seed})`).toBeGreaterThanOrEqual(a.info.radius + b.info.radius);
        }
      }
    }
  });

  it('keeps a castle off a village', () => {
    for (const seed of [1, 2, 3]) {
      const gen = new BeyondWorldGenerator(seed);
      for (let rz = -8; rz <= 8; rz++) {
        for (let rx = -8; rx <= 8; rx++) {
          const c = gen.structures.castleInRegion(rx, rz);
          if (!c) continue;
          const v = gen.nearestVillage(c.x, c.z);
          if (v) expect(Math.max(Math.abs(v.x - c.x), Math.abs(v.z - c.z))).toBeGreaterThan(60);
        }
      }
    }
  });
});

