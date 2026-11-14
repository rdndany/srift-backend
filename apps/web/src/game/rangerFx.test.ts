import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Fx } from '@solrift/shared';
import { buildPiercingShot } from './piercingFx';
import { buildEvasiveRoll } from './rollFx';
import { buildBearTrapSet, buildBearTrapSnap } from './trapFx';
import { buildRainHit, buildRainMark } from './rainFx';
import type { FxEntry, SpellKit } from './spellFx';

const voxel = new THREE.BoxGeometry(1, 1, 1);
const makeKit = () => {
  const impact = vi.fn();
  return { kit: { voxel, viewer: null, impact, locate: () => null } as unknown as SpellKit, impact };
};
const mark = (k: string, over: Partial<Fx> = {}): Fx => ({ id: 1, k, x: 0, y: 0, z: 0, r: 1, age: 0, ttl: 1, by: 'me', ...over }) as Fx;
const entry = (ttl: number): FxEntry => ({ group: new THREE.Group(), age: 0, ttl, materials: [], extra: [], animate: () => undefined });
const meshOf = (e: FxEntry): THREE.InstancedMesh => e.group.children[0] as THREE.InstancedMesh;
interface Cube {
  x: number;
  y: number;
  z: number;
  size: number;
}
const cubes = (e: FxEntry): Cube[] => {
  const m = meshOf(e).instanceMatrix.array;
  return Array.from({ length: meshOf(e).count }, (_, i) => ({ x: m[i * 16 + 12], y: m[i * 16 + 13], z: m[i * 16 + 14], size: m[i * 16 + 5] }));
};

describe('the piercing shot', () => {
  const line = (z2: number, ttl = 0.5) => mark('pierce', { x: 0, y: 1.5, z: -0.6, x2: 0, y2: 1.5, z2, ttl });
  const play = (z2: number, age: number): FxEntry => {
    const e = buildPiercingShot(line(z2), entry(0.5), makeKit().kit);
    e.animate(age / 0.5, age, 0.016);
    return e;
  };

  it('leaves a tracer of cubes along the line, from the bow end to the far end', () => {
    const list = cubes(play(-31, 0.12)).filter((c) => c.size > 0.08);
    const reach = Math.max(...list.map((c) => -c.z));
    expect(list.length).toBeGreaterThan(40);
    expect(reach).toBeGreaterThan(25);
  });

  it('goes out from the bow end first', () => {
    const late = cubes(play(-31, 0.3)).filter((c) => Math.abs(c.x) < 0.05 && c.size > 0.08);
    const near = late.filter((c) => -c.z < 8).length;
    const far = late.filter((c) => -c.z > 20).length;
    expect(far).toBeGreaterThan(near);
  });

  it('keeps the first blocks by the bow clear', () => {
    for (const c of cubes(play(-31, 0.12))) expect(-c.z).toBeGreaterThan(1.3);
  });

  it('throws sparks where it struck, and not when it ran its whole length', () => {
    // (cubes are laid out from the bow end: the far end of a line to z = -10 is 9.4 blocks along)
    const flash = (e: FxEntry): boolean => cubes(e).some((c) => c.size > 0.3);
    expect(flash(play(-10, 0.12))).toBe(true);
    expect(flash(play(-32.2, 0.12))).toBe(false);
    // sparks scatter round the end of it
    const scattered = (e: FxEntry, end: number): boolean => cubes(e).some((c) => Math.abs(-c.z - end) < 1 && Math.abs(c.x) > 0.05 && c.size < 0.12);
    expect(scattered(play(-10, 0.16), 9.4)).toBe(true);
    expect(scattered(play(-32.2, 0.16), 31.6)).toBe(false);
  });

  it('is gone at the end', () => {
    expect(meshOf(play(-31, 0.5)).count).toBe(0);
  });
});

describe('the evasive roll', () => {
  const roll = (age: number): FxEntry => {
    const e = buildEvasiveRoll(mark('roll', { x: 0, y: 0.9, z: -6, x2: 0, y2: 0.9, z2: -12.5, ttl: 0.86 }), entry(0.86), makeKit().kit);
    e.animate(age / 0.86, age, 0.016);
    return e;
  };

  it('shakes green leaves loose along the way as the ranger passes', () => {
    const early = cubes(roll(0.1)).length;
    const later = cubes(roll(0.3)).length;
    expect(later).toBeGreaterThan(early);
    const list = cubes(roll(0.3));
    // (the effect stands at the start: the way runs to -6.5 from it)
    expect(Math.min(...list.map((c) => c.z))).toBeLessThan(-3);
    expect(Math.max(...list.map((c) => c.z))).toBeLessThan(1);
  });

  it('keeps its leaves within reach of the body', () => {
    for (const c of cubes(roll(0.3)).filter((c) => c.size < 0.3)) {
      expect(c.y).toBeGreaterThan(-0.1);
      expect(c.y).toBeLessThan(2.5);
      expect(Math.abs(c.x)).toBeLessThan(1.5);
    }
  });

  it('is gone at the end', () => {
    expect(meshOf(roll(0.86)).count).toBe(0);
  });
});

describe('the bear trap', () => {
  const set = (age: number, from = true) => {
    const k = makeKit();
    const m = mark('trap_set', from ? { r: 1.3, ttl: 90, x2: 4, y2: 1.4, z2: 3 } : { r: 1.3, ttl: 90 });
    const e = buildBearTrapSet(m, entry(90), k.kit);
    e.animate(age / 90, age, 0.016);
    return { e, ...k };
  };

  it('is thrown in an arc, shut, from the thrower end', () => {
    const start = cubes(set(0.01).e);
    expect(Math.max(...start.map((c) => c.x))).toBeGreaterThan(2);
    const mid = cubes(set(0.13).e);
    const heights = mid.map((c) => c.y);
    expect(Math.max(...heights)).toBeGreaterThan(1);
  });

  it('lies flat on the ground with its jaws open once it has landed', () => {
    const list = cubes(set(2).e).filter((c) => c.size > 0.05);
    expect(Math.max(...list.map((c) => c.y))).toBeLessThan(0.5);
    expect(Math.max(...list.map((c) => Math.hypot(c.x, c.z)))).toBeGreaterThan(0.5);
  });

  it('knocks the screen a little as it lands, once, and not when it is only seen later', () => {
    const k = makeKit();
    const e = buildBearTrapSet(mark('trap_set', { r: 1.3, ttl: 90, x2: 4, y2: 1.4, z2: 3 }), entry(90), k.kit);
    e.animate(0, 0, 0);
    e.animate(0.1, 0.1, 0.1);
    expect(k.impact).not.toHaveBeenCalled();
    e.animate(0.2, 0.5, 0.4);
    e.animate(0.21, 0.6, 0.1);
    expect(k.impact).toHaveBeenCalledTimes(1);
    const late = makeKit();
    const l = buildBearTrapSet(mark('trap_set', { r: 1.3, ttl: 90, x2: 4, y2: 1.4, z2: 3, age: 5 }), entry(90), late.kit);
    l.animate(0, 5, 0);
    expect(late.impact).not.toHaveBeenCalled();
  });

  it('shrinks away in the last seconds', () => {
    const k = makeKit();
    const e = buildBearTrapSet(mark('trap_set', { r: 1.3, ttl: 90 }), entry(90), k.kit);
    e.animate(0.5, 40, 0.016);
    const full = Math.max(...cubes(e).map((c) => c.size));
    e.animate(0.99, 89.5, 0.016);
    expect(Math.max(...cubes(e).map((c) => c.size))).toBeLessThan(full);
  });

  const snap = (age: number): FxEntry => {
    const e = buildBearTrapSnap(mark('trap_snap', { r: 1.3, ttl: 0.8 }), entry(0.8), makeKit().kit);
    e.animate(age / 0.8, age, 0.016);
    return e;
  };

  it('slams shut: the jaws stand up and meet', () => {
    const open = cubes(snap(0)).filter((c) => c.size > 0.08 && c.size < 0.2);
    const shut = cubes(snap(0.25)).filter((c) => c.size > 0.08 && c.size < 0.2);
    expect(Math.max(...shut.map((c) => c.y))).toBeGreaterThan(Math.max(...open.map((c) => c.y)) + 0.4);
  });

  it('is gone at the end', () => {
    expect(meshOf(snap(0.8)).count).toBe(0);
  });
});

describe('the rain of arrows', () => {
  const rain = (age: number, r = 4, ttl = 4.2): FxEntry => {
    const e = buildRainMark(mark('rain_mark', { r, ttl }), entry(ttl), makeKit().kit);
    e.animate(age / ttl, age, 0.016);
    return e;
  };

  it('sweeps its ring round as it opens', () => {
    const ring = (e: FxEntry): number => cubes(e).filter((c) => c.y < 0.1 && Math.abs(Math.hypot(c.x, c.z) - 4) < 0.15).length;
    expect(ring(rain(0.1))).toBeGreaterThan(0);
    expect(ring(rain(0.5))).toBeGreaterThan(ring(rain(0.1)));
  });

  it('has arrows falling out of the sky just before a volley', () => {
    expect(Math.max(...cubes(rain(0.4)).map((c) => c.y))).toBeGreaterThan(5);
  });

  it('leaves the landed arrows standing in the ground, more with every volley', () => {
    const stuck = (e: FxEntry): number => cubes(e).filter((c) => c.y > 0.1 && c.y < 0.7 && Math.hypot(c.x, c.z) < 4.2).length;
    expect(stuck(rain(3.6))).toBeGreaterThan(stuck(rain(1.4)));
    expect(Math.max(...cubes(rain(4)).map((c) => c.y))).toBeLessThan(1);
  });

  it('keeps the arrows within the circle', () => {
    for (const c of cubes(rain(3.6)).filter((c) => c.y > 0.1 && c.y < 0.7)) expect(Math.hypot(c.x, c.z)).toBeLessThan(4.6);
  });

  it('stays within its cube pool at every moment', () => {
    const e = buildRainMark(mark('rain_mark', { r: 8, ttl: 7.5 }), entry(7.5), makeKit().kit);
    for (let age = 0; age < 7.5; age += 0.1) {
      e.animate(age / 7.5, age, 0.1);
      expect(meshOf(e).count).toBeLessThanOrEqual(900);
    }
  });

  it('is gone at the end', () => {
    expect(meshOf(rain(4.2)).count).toBe(0);
  });

  const hit = (age: number, r = 4): FxEntry => {
    const e = buildRainHit(mark('rain_hit', { r, ttl: 0.5 }), entry(0.5), makeKit().kit);
    e.animate(age / 0.5, age, 0.016);
    return e;
  };

  it('ripples out across the ground', () => {
    const far = (e: FxEntry): number => Math.max(...cubes(e).filter((c) => Math.abs(c.y - 0.1) < 0.001).map((c) => Math.hypot(c.x, c.z)));
    expect(far(hit(0.2))).toBeGreaterThan(far(hit(0.03)) + 1);
    expect(meshOf(hit(0.5)).count).toBe(0);
  });
});
