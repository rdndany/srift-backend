import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { clamp01, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, seeded, snap, srgb, steps, voxelMaterial } from './voxelFx';

/**
 * The Mage's Arcane Shield, as plain as a buff can be.
 *  - Seen from outside (someone else, or yourself in third person): two rings of small violet and white cubes circle the body at the hip and
 *    at the shoulder, turning against each other, each cube bobbing a little. They pop in one after another when it goes up and shrink away
 *    when it runs out. The cubes are placed from where the figure is drawn this frame (see `SpellKit.locate`), so they never trail behind it.
 *  - Seen from inside (first person): none of that, but a frame of small violet cubes round the edge of the view that twinkles while the
 *    shield holds (`GuardVeil` with the `ARCANE_VEIL` style, drawn in front of everything by the game).
 *  - Soaked up before its time: it breaks (`buildShieldShatter`, started by the game where the shield was): the cubes fly out from the
 *    body and fall, shrinking away.
 * The server decides when it goes up and when it ends (a `guard_arcane` mark that follows its owner); this only draws it.
 */

const VIOLETS = [srgb(0x8a7bff), srgb(0xb4a8ff), srgb(0xc8d0ff)];
const WHITE = srgb(0xffffff);
const FINE = 0.0625;
/** Two rings: how high they turn, which way, how fast (radians a second), and how many cubes each has. */
const RINGS = [
  { y: 0.6, dir: 1, speed: 1.5, n: 6, r: 0.78 },
  { y: 1.4, dir: -1, speed: 1.9, n: 6, r: 0.7 },
];

export function buildArcaneShield(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  g.position.set(f.x, f.y, f.z);
  const cubes = new Cubes(kit, voxelMaterial(e), 20, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const rng = seeded(f.id * 9973 + 11);
  const orbit = RINGS.flatMap((ring, k) =>
    Array.from({ length: ring.n }, (_, i) => ({
      ring,
      a: (i / ring.n) * Math.PI * 2 + k * 0.5,
      bob: rng() * Math.PI * 2,
      size: 0.13 + rng() * 0.07,
      tone: Math.floor(rng() * 4),
      /** When it pops in. */
      start: (k * ring.n + i) * 0.04,
    })),
  );

  const target = new THREE.Vector3(f.x, f.y, f.z);
  const eye = new THREE.Vector3();
  e.update = (m) => {
    target.set(m.x, m.y, m.z);
  };
  /** The camera is inside it (your own first-person view): the frame is drawn there, not these. */
  const inside = (): boolean => {
    if (!kit.viewer) return false;
    eye.set(g.position.x, g.position.y + 1.2, g.position.z);
    return eye.distanceTo(kit.viewer) < 2.2;
  };

  e.animate = (_t, age, dt) => {
    // where the figure is drawn now; if it cannot be found, where the server last said
    const at = kit.locate(f.by);
    if (at) g.position.set(at.x, at.y, at.z);
    else if (g.position.distanceToSquared(target) > 16) g.position.copy(target);
    else if (dt > 0) g.position.lerp(target, 1 - Math.exp(-dt * 22));
    cubes.reset();
    if (!inside()) {
      const out = clamp01((e.ttl - age) / 0.4);
      for (const c of orbit) {
        const grow = Math.min(steps((age - c.start) / 0.25, 3), steps(out, 3));
        const size = c.size * grow;
        if (size <= 0) continue;
        const a = c.a + c.ring.dir * c.ring.speed * age;
        const y = c.ring.y + Math.sin(age * 2.6 + c.bob) * 0.08;
        cubes.put(snap(Math.cos(a) * c.ring.r, FINE), snap(y, FINE), snap(Math.sin(a) * c.ring.r, FINE), size, size, size, c.tone === 3 ? WHITE : VIOLETS[c.tone], a);
      }
    }
    cubes.done();
  };
  return e;
}

const BITS = 28;

/**
 * The shield breaking, where it was (`e` is an effect of the game's own, about 0.9 s long, placed at the figure's feet): cubes fly out
 * from the body, fall, and shrink away in steps.
 */
export function buildShieldShatter(e: FxEntry, kit: SpellKit): void {
  const rng = seeded(0x5ad1e1d);
  const cubes = new Cubes(kit, voxelMaterial(e), BITS + 4, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const bits = Array.from({ length: BITS }, (_, i) => {
    const ny = 1 - (2 * (i + 0.5)) / BITS;
    const rad = Math.sqrt(1 - ny * ny);
    const a = i * 2.399963;
    return {
      nx: Math.cos(a) * rad,
      ny,
      nz: Math.sin(a) * rad,
      speed: 1.6 + rng() * 2.2,
      lift: 0.8 + rng() * 1.8,
      size: 0.1 + rng() * 0.1,
      life: 0.5 + rng() * 0.3,
      tone: Math.floor(rng() * 4),
    };
  });
  e.animate = (_t, age) => {
    cubes.reset();
    if (age < e.ttl) {
      const slide = (1 - Math.exp(-3 * age)) / 3;
      for (const b of bits) {
        if (age >= b.life) continue;
        const s = b.size * steps(1 - age / b.life, 3);
        const y = Math.max(0.05 + s / 2, 0.95 + b.ny * 0.7 + b.ny * b.speed * 0.4 * slide + b.lift * slide - 4 * age * age);
        cubes.put(snap(b.nx * (0.6 + b.speed * slide), FINE), snap(y, FINE), snap(b.nz * (0.6 + b.speed * slide), FINE), s, s, s, b.tone === 3 ? WHITE : VIOLETS[b.tone]);
      }
    }
    cubes.done();
  };
}
