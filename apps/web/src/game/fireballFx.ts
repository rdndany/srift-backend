import type * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { CubeBoltView, buildCubeHit, type BoltStyle, type HitStyle } from './arcaneCubes';
import type { Projectile } from './fireFx';
import type { FxEntry, SpellKit } from './spellFx';
import { SPARKS, pal } from './voxelFx';

/**
 * The Mage's Fireball, built of cubes like the Warrior's skills: a ball of fire that is a big yellow cube with a star of orange ones
 * blinking round it and three cubes tumbling round that, a trail of big cubes that drift up as they burn out (yellow, orange, red, dark),
 * embers thrown up and falling, and a blast of cubes where it lands: a body of fire cubes and a shell round it the size of its blast (it hurts everything inside),
 * a second wave after it, flames rising, and a cloud of dark cubes that swells out of it and drifts up. (How it is drawn is in
 * arcaneCubes.ts; the server only says where the ball is and where it burst.)
 */
const FIRE = pal(0xfff6c8, 0xffd860, 0xff9a2a, 0xe0561a, 0x9a2a12, 0x4a1c14);
const SMOKE = pal(0x80726a, 0x63564f, 0x4a403c);

export const FIREBALL_BOLT: BoltStyle = {
  palette: FIRE,
  spark: SPARKS,
  core: 0.36,
  face: { reach: 0.32, size: 0.17 },
  corner: { reach: 0.36, size: 0.14 },
  beat: 14,
  orbit: { count: 3, radius: 0.44, size: 0.12, speed: -12 },
  trail: { step: 0.26, big: 0.26, small: 0.16, life: 0.55, max: 64, rise: 1.1 },
  sparks: { perBlock: 2.6, max: 36, life: [0.4, 0.9], size: [0.05, 0.1], lift: 1.2 },
  flash: { size: 0.6, life: 0.16, spoke: 0.2, reach: 0.5 },
  puffs: 20,
};

export const FIREBALL_HIT: HitStyle = {
  palette: FIRE,
  spark: SPARKS,
  scale: 1.2,
  shake: 0.3,
  shell: { face: 0.3, corner: 0.24, edge: 0.18 },
  sparks: 50,
  motes: 16,
  echo: true,
  moteRise: 1.8,
  blob: { count: 30, life: 0.5 },
  smoke: { count: 14, colors: SMOKE, life: 0.85 },
};

/** The ball of a fireball in flight. `material` is the cubes' (see `voxelMaterial`), shared by the bolts; `dispose` frees what the bolt made. */
export class FireballBoltView extends CubeBoltView {
  constructor(kit: Pick<SpellKit, 'voxel' | 'viewer'>, material: THREE.Material, p: Projectile) {
    super(kit, material, p, FIREBALL_BOLT);
  }
}

/** The blast where a fireball burst (a `fireball_burst` mark; its radius is the blast's). */
export const buildFireballHit = (f: Fx, e: FxEntry, kit: SpellKit): FxEntry => buildCubeHit(f, e, kit, FIREBALL_HIT);
