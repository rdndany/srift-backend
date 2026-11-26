import { describe, expect, it } from 'vitest';
import { B, computeLight } from './index';

const W = 24;
const H = 32;
const D = 24;
const idx = (x: number, y: number, z: number) => (y * D + z) * W + x;
const sky = (l: Uint8Array, x: number, y: number, z: number) => l[idx(x, y, z)] >> 4;
const blk = (l: Uint8Array, x: number, y: number, z: number) => l[idx(x, y, z)] & 0xf;

function world(fn: (x: number, y: number, z: number) => number): Uint16Array {
  const b = new Uint16Array(W * H * D);
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) b[idx(x, y, z)] = fn(x, y, z);
  return b;
}

describe('computeLight', () => {
  it('lights open sky fully and leaves solid ground dark', () => {
    const l = computeLight(world((_x, y) => (y <= 10 ? B.STONE : B.AIR)), W, H, D);
    expect(sky(l, 5, 11, 5)).toBe(15);
    expect(sky(l, 5, 31, 5)).toBe(15);
    expect(sky(l, 5, 5, 5)).toBe(0);
  });

  it('spills sky light sideways under an overhang, losing 1 per block', () => {
    // Roof at y=12 covering x >= 10; open sky for x < 10.
    const b = world((x, y) => (y <= 5 ? B.STONE : y === 12 && x >= 10 ? B.STONE : B.AIR));
    const l = computeLight(b, W, H, D);
    expect(sky(l, 9, 8, 5)).toBe(15);
    expect(sky(l, 10, 8, 5)).toBe(14);
    expect(sky(l, 12, 8, 5)).toBe(12);
    expect(sky(l, 23, 8, 5)).toBe(15 - 14);
  });

  it('propagates block light from emitters with distance falloff', () => {
    // Fully enclosed so sky light does not interfere.
    const b = world((x, y, z) => (x === 12 && y === 15 && z === 12 ? B.GLOWSTONE : B.STONE));
    // Carve a cavity around the source.
    for (let x = 4; x <= 20; x++) b[idx(x, 15, 12)] = x === 12 ? B.GLOWSTONE : B.AIR;
    const l = computeLight(b, W, H, D);
    expect(blk(l, 12, 15, 12)).toBe(15);
    expect(blk(l, 13, 15, 12)).toBe(14);
    expect(blk(l, 16, 15, 12)).toBe(11);
    expect(blk(l, 4, 15, 12)).toBe(7);
    expect(blk(l, 12, 16, 12)).toBe(0); // solid stone stays dark
    expect(sky(l, 13, 15, 12)).toBe(0);
  });

  it('loses one sky level for every water block in the column', () => {
    const b = world((_x, y) => (y < 10 ? B.STONE : y < 26 ? B.WATER : B.AIR));
    const l = computeLight(b, W, H, D);
    expect(sky(l, 5, 30, 5)).toBe(15);
    expect(sky(l, 5, 25, 5)).toBe(14);
    expect(sky(l, 5, 24, 5)).toBe(13);
    expect(sky(l, 5, 12, 5)).toBe(1);
  });

  it('is not blocked by transparent blocks like glass and leaves', () => {
    const b = world((_x, y) => (y <= 5 ? B.STONE : y === 8 ? B.GLASS : B.AIR));
    const l = computeLight(b, W, H, D);
    expect(sky(l, 3, 7, 3)).toBe(15);
  });
});
