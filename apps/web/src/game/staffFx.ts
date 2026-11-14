import type * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { CubeBoltView, buildCubeHit, type BoltStyle, type HitStyle } from './arcaneCubes';
import type { Projectile } from './fireFx';
import type { FxEntry, SpellKit } from './spellFx';
import { pal } from './voxelFx';

/**
 * The Mage's staff: slow and heavy where the wand is light, and violet and gold (the colours of its head) where the wand is white and
 * blue. A big white cube with a star of larger ones round it and four cubes circling it, a thick trail of big cubes that lingers, gold
 * and violet sparks, a bigger flash at the staff, and a burst that is a full shell (faces, corners and edges of a cube) with a second one
 * following and a harder knock on the screen. (How it is drawn is in arcaneCubes.ts.)
 */
const ARC = pal(0xffffff, 0xfff0c0, 0xd0a0ff, 0x9a5cff, 0x6a2fd0, 0x3a1a8a);
const SPARK = pal(0xffffff, 0xffd96a, 0xc9a0ff);

export const STAFF_BOLT: BoltStyle = {
  palette: ARC,
  spark: SPARK,
  core: 0.3,
  face: { reach: 0.3, size: 0.15 },
  corner: { reach: 0.32, size: 0.12 },
  beat: 10,
  orbit: { count: 4, radius: 0.46, size: 0.11, speed: 9 },
  trail: { step: 0.3, big: 0.22, small: 0.13, life: 0.6, max: 64 },
  sparks: { perBlock: 2.4, max: 36, life: [0.45, 0.9], size: [0.06, 0.11] },
  flash: { size: 0.55, life: 0.18, spoke: 0.18, reach: 0.45 },
  puffs: 22,
};

export const STAFF_HIT: HitStyle = {
  palette: ARC,
  spark: SPARK,
  scale: 1.5,
  shake: 0.22,
  shell: { face: 0.2, corner: 0.16, edge: 0.13 },
  sparks: 40,
  motes: 12,
  echo: true,
};

/** The bolt of a staff in flight. `material` is the cubes' (see `voxelMaterial`), shared by the bolts; `dispose` frees what the bolt made. */
export class StaffBoltView extends CubeBoltView {
  constructor(kit: Pick<SpellKit, 'voxel' | 'viewer'>, material: THREE.Material, p: Projectile) {
    super(kit, material, p, STAFF_BOLT);
  }
}

/** The burst where a staff's bolt landed (a `staff_hit` mark). */
export const buildStaffHit = (f: Fx, e: FxEntry, kit: SpellKit): FxEntry => buildCubeHit(f, e, kit, STAFF_HIT);
