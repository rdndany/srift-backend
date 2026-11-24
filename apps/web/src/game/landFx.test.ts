import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LandFx, type ClaimDraw, type ShapeDraw } from './landFx';
import type { Corner } from './landMarkers';

const flat = { groundY: () => 9 };
const rect = (x0: number, z0: number, x1: number, z1: number): Corner[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const shape = (over: Partial<ShapeDraw> = {}): ShapeDraw => ({ corners: rect(0, 0, 20, 20), aim: null, closed: true, verdict: 'good', grabbed: -1, ...over });

/** The meshes of the group that are shown right now. */
const shown = (fx: LandFx): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  fx.root.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};
const materialsOf = (fx: LandFx): Set<THREE.Material> => {
  const set = new Set<THREE.Material>();
  fx.root.traverse((o) => {
    if (o instanceof THREE.Mesh) set.add(o.material as THREE.Material);
  });
  return set;
};
const count = (fx: LandFx, name: 'position' | 'aColor'): number => {
  let n = 0;
  fx.root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry.getAttribute(name) && o.geometry.getAttribute('aColor')) n += o.geometry.drawRange.count;
  });
  return n;
};

describe('what the Land Surveyor draws', () => {
  it('is in the scene from the start but shows nothing', () => {
    const fx = new LandFx(flat, 16);
    expect(fx.root.visible).toBe(false);
    expect(shown(fx)).toHaveLength(0);
  });

  it('stands a stake at each corner, and one more where the next would go', () => {
    const fx = new LandFx(flat, 16);
    fx.frame(0.05, shape({ corners: rect(0, 0, 20, 20).slice(0, 3), closed: false, aim: [0, 20] }), []);
    expect(fx.root.visible).toBe(true);
    expect(fx.stakesShown).toBe(4);
    fx.frame(0.05, shape(), []);
    expect(fx.stakesShown).toBe(4);
    fx.frame(0.05, shape({ corners: rect(0, 0, 20, 20).slice(0, 2), closed: false, aim: null }), []);
    expect(fx.stakesShown).toBe(2);
  });

  it('marks the square corners and the lines the crosshair is in line with, low on the ground, and takes the marks away with them', () => {
    const fx = new LandFx(flat, 16);
    const guides = (): THREE.Mesh | undefined => shown(fx).find((m) => m.geometry.getAttribute('aColor') && (m.material as THREE.ShaderMaterial).uniforms.uHeight.value < 1);
    fx.frame(0.05, shape(), []);
    expect(guides()).toBeUndefined();
    const ticks = rect(0, 0, 20, 20).map((at, i, c) => ({ at, a: c[(i + 3) % 4], b: c[(i + 1) % 4] }));
    fx.frame(0.05, shape({ straight: { ticks, guides: [], from: null, outline: null } }), []);
    // Four ticks of three points each (two blocks a leg, and the last point of each of its two edges), two triangles to a block.
    const g = guides()!;
    expect(g).toBeDefined();
    expect(g.geometry.drawRange.count).toBeGreaterThan(0);
    const plain = g.geometry.drawRange.count;
    // A perfect shape has a white edge as well; the lines to the corners it is in line with are drawn from the crosshair.
    fx.frame(0.05, shape({ straight: { ticks, guides: [[0, 0]], from: [0, 12], outline: rect(0, 0, 20, 20) } }), []);
    expect(guides()!.geometry.drawRange.count).toBeGreaterThan(plain + 80 * 6);
    // The marks follow the ground.
    const pos = guides()!.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.getY(0)).toBeCloseTo(10.04, 2);
    expect(pos.getY(1) - pos.getY(0)).toBeLessThan(1);
    fx.frame(0.05, shape(), []);
    expect(guides()).toBeUndefined();
    fx.frame(0.05, null, []);
    expect(shown(fx)).toHaveLength(0);
  });

  it('leaves nothing standing when there is nothing to show', () => {
    const fx = new LandFx(flat, 16);
    fx.frame(0.05, shape(), []);
    expect(shown(fx).length).toBeGreaterThan(0);
    fx.frame(0.05, null, []);
    expect(fx.root.visible).toBe(false);
    expect(shown(fx)).toHaveLength(0);
  });

  it('draws the boundary along the ground, one sample for each block of it', () => {
    const fx = new LandFx(flat, 16);
    fx.frame(0.05, shape(), []);
    // 20 x 4 blocks of boundary (+ the one that closes it), two points (the foot and the top of the wall) at each.
    expect(count(fx, 'position')).toBeGreaterThan(0);
    const wall = shown(fx).find((m) => m.geometry.getAttribute('aColor'))!;
    const pos = wall.geometry.getAttribute('position') as THREE.BufferAttribute;
    // 81 samples (80 blocks of boundary and the one that closes it): 80 strips of two triangles.
    expect(wall.geometry.drawRange.count).toBe(80 * 6);
    // Each sample's foot is on the ground (the top of block 9, plus a hair), the top above it.
    expect(pos.getY(0)).toBeCloseTo(10.04, 2);
    expect(pos.getY(1)).toBeGreaterThan(pos.getY(0) + 1);
  });

  it('follows the ground up and down', () => {
    const hilly = new LandFx({ groundY: (x) => 9 + Math.floor(x / 5) }, 16);
    hilly.frame(0.05, shape({ corners: [[0, 0], [20, 0], [20, 20]], closed: true }), []);
    const wall = shown(hilly).find((m) => m.geometry.getAttribute('aColor'))!;
    const pos = wall.geometry.getAttribute('position') as THREE.BufferAttribute;
    const feet = new Set<number>();
    for (let i = 0; i < wall.geometry.drawRange.count; i++) feet.add(Math.round(pos.getY(wall.geometry.getIndex()!.getX(i)) * 10));
    expect(feet.size).toBeGreaterThan(3);
  });

  it('outlines the claims round it in the colour of whose they are', () => {
    const fx = new LandFx(flat, 16);
    const claims: ClaimDraw[] = [
      { id: 'a.1', vertices: rect(0, 0, 10, 10), kind: 'mine', focus: false },
      { id: 'b.1', vertices: rect(30, 0, 40, 10), kind: 'other', focus: true },
    ];
    fx.frame(0.05, null, claims);
    expect(fx.root.visible).toBe(true);
    const wall = shown(fx).find((m) => m.geometry.getAttribute('aColor'))!;
    const col = wall.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const colours = new Set<string>();
    for (let i = 0; i < 100; i++) colours.add(`${col.getX(i * 2).toFixed(2)},${col.getY(i * 2).toFixed(2)}`);
    expect(colours.size).toBeGreaterThanOrEqual(2);
    // The one the crosshair is on is brighter.
    const alphas = new Set<number>();
    for (let i = 0; i < 200; i++) alphas.add(Number(col.getW(i * 2).toFixed(2)));
    expect(alphas.has(1)).toBe(true);
    expect(alphas.has(0.55)).toBe(true);
  });

  it('never makes a material or a program after it is built: the first stake costs what the hundredth does', () => {
    const fx = new LandFx(flat, 16);
    // Every material there will ever be: the stakes' (one set for each colour) and the two walls'.
    const pool = new Set<THREE.Material>();
    const mats = (fx as unknown as { mats: Record<string, Record<string, THREE.Material>> }).mats;
    for (const set of Object.values(mats)) for (const m of Object.values(set)) pool.add(m);
    fx.root.traverse((o) => {
      if (o instanceof THREE.Mesh) pool.add(o.material as THREE.Material);
    });
    for (let k = 0; k < 30; k++) {
      fx.frame(0.05, shape({ verdict: (['good', 'warn', 'bad', 'idle'] as const)[k % 4], grabbed: k % 5 === 0 ? 1 : -1 }), k % 2 ? [{ id: `c${k}.1`, vertices: rect(40, 40, 60, 60), kind: 'guild', focus: false }] : []);
    }
    fx.celebrate(rect(0, 0, 20, 20));
    for (let k = 0; k < 10; k++) fx.frame(0.3, null, []);
    const after = materialsOf(fx);
    for (const m of after) expect(pool.has(m)).toBe(true);
    // The shaders are two programs' worth of source: the wall of a claim and the beam, whatever the colours.
    const programs = new Set<string>();
    for (const m of after) if (m instanceof THREE.ShaderMaterial) programs.add(m.fragmentShader);
    expect(programs.size).toBe(2);
  });

  it('keeps its buffers when the boundary is as long as it can be', () => {
    const fx = new LandFx(flat, 16);
    const huge: Corner[] = [[0, 0], [3000, 0], [3000, 3000], [0, 3000]];
    expect(() => fx.frame(0.05, shape({ corners: huge }), [])).not.toThrow();
    const wall = shown(fx).find((m) => m.geometry.getAttribute('aColor'))!;
    expect(wall.geometry.drawRange.count).toBeLessThanOrEqual(wall.geometry.getIndex()!.count);
  });

  it('plays a celebration for a moment and then is quiet', () => {
    const motes: number[] = [];
    const fx = new LandFx({ groundY: () => 9, mote: () => motes.push(1) }, 16);
    fx.celebrate(rect(0, 0, 20, 20));
    expect(fx.celebrating).toBe(true);
    for (let k = 0; k < 20; k++) fx.frame(0.1, null, []);
    expect(motes.length).toBeGreaterThan(10);
    for (let k = 0; k < 20; k++) fx.frame(0.1, null, []);
    expect(fx.celebrating).toBe(false);
    expect(fx.root.visible).toBe(false);
  });
});
