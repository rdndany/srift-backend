import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import type { FxEntry, SpellKit } from './spellFx';
import { Cubes, DUST, EARTH, PALE, STONE, drawChunks, drawPuffs, makeChunks, makePuffs, seeded, snap, srgb, steps, voxelMaterial } from './voxelFx';

/**
 * An arrow of a bow that stuck in a wall or the ground, built of cubes: a bit of shaft and the fletching standing out of the surface, shivering
 * for a moment as it lands, a puff of dust and a few crumbs knocked out of the block. It stays until the mark goes (a few seconds), then
 * shrinks away in steps. The mark gives where the arrow went in and the way it was flying (`x2..z2` is a point along that way).
 */

const WOOD = srgb(0xb08a55);
const WOOD_DARK = srgb(0x8c6a3c);
const FLETCH = [srgb(0xd8483a), srgb(0xeef2e8)];
const FINE = 0.0625;
/** The arrow comes out of the surface this far (blocks); the tip is inside the block, where it cannot be seen. */
const OUT = 0.7;
const SHAFT_CUBES = 5;

const UP = new THREE.Vector3(0, 1, 0);

export function buildArrowStick(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const d = new THREE.Vector3((f.x2 ?? f.x) - f.x, (f.y2 ?? f.y) - f.y, (f.z2 ?? f.z) - f.z);
  if (d.lengthSq() < 1e-6) d.set(0, -1, 0);
  d.normalize();
  // across the arrow, for the shiver
  const side = new THREE.Vector3().crossVectors(d, UP);
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
  side.normalize();

  const cubes = new Cubes(kit, voxelMaterial(e), 96, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();

  const rng = seeded(Math.abs(f.id) * 9173 + 5);
  const flat = Math.hypot(d.x, d.z);
  const toGround = d.y < -0.6;
  const way: [number, number] | undefined = flat > 0.3 ? [Math.atan2(-d.z, -d.x), 1.0] : undefined;
  const dust = makePuffs(rng, { count: 5, spread: 0.12, speed: [0.5, 1.4], up: [0.3, 0.8], size: [0.07, 0.15], life: [0.25, 0.45], delay: [0, 0.03], y0: -0.04, way });
  const crumbs = makeChunks(rng, {
    count: 4,
    radius: 0.08,
    speed: [0.8, 2.2],
    up: [0.6, 1.8],
    size: [0.04, 0.075],
    life: [0.3, 0.5],
    colors: toGround ? EARTH : STONE,
    y0: 0,
    floor: toGround ? 0 : -1.2,
    way,
  });
  const tone = Math.abs(f.id) % 2;

  e.animate = (_t, age) => {
    cubes.reset();
    if (age >= e.ttl) {
      cubes.done();
      return;
    }
    const left = steps((e.ttl - age) / 0.5, 3);
    // a flash where it struck, and the shaft shivering across itself as it settles (the end farthest from the surface moves most)
    if (age < 0.08) cubes.put(0, 0, 0, 0.2, 0.2, 0.2, PALE);
    const shake = 0.06 * Math.exp(-age * 11) * Math.sin(age * 62);
    for (let i = 0; i < SHAFT_CUBES; i++) {
      const k = 0.04 + (OUT * 0.8 * i) / SHAFT_CUBES;
      const s = 0.075 * left;
      const w = shake * (k / OUT);
      cubes.put(snap(-d.x * k + side.x * w, FINE), snap(-d.y * k + side.y * w, FINE), snap(-d.z * k + side.z * w, FINE), s, s, s, i % 2 ? WOOD_DARK : WOOD);
    }
    // the fletching: two feathers at the end
    for (let i = 0; i < 2; i++) {
      const k = OUT * (0.84 + 0.16 * i);
      const w = shake * (k / OUT);
      const s = (0.13 - 0.03 * i) * left;
      cubes.put(snap(-d.x * k + side.x * w, FINE), snap(-d.y * k + side.y * w, FINE), snap(-d.z * k + side.z * w, FINE), s, s, s, FLETCH[(tone + i) % 2]);
    }
    drawPuffs(cubes, dust, age, DUST);
    drawChunks(cubes, crumbs, age);
    cubes.done();
  };
  return e;
}
