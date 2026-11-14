import type * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { CubeBoltView, buildCubeHit, type BoltStyle, type HitStyle } from './arcaneCubes';
import type { Projectile } from './fireFx';
import type { FxEntry, SpellKit } from './spellFx';
import { pal } from './voxelFx';

/**
 * The Mage's wand: light and quick, white and blue shading to violet. A small white cube with a star of small ones round it and two
 * cubes circling it, a thin trail of cubes, and a small round pop where it bursts. (How it is drawn is in arcaneCubes.ts; the staff,
 * which is slow and heavy, has its own style in staffFx.ts.)
 */
const ARC = pal(0xffffff, 0xcfdcff, 0x9aaeff, 0x7a6cff, 0x5a3fd0, 0x36228a);
const SPARK = pal(0xffffff, 0xcfdcff, 0xb48cff);

export const WAND_BOLT: BoltStyle = {
  palette: ARC,
  spark: SPARK,
  core: 0.2,
  face: { reach: 0.2, size: 0.1 },
  corner: { reach: 0.22, size: 0.08 },
  beat: 18,
  orbit: { count: 2, radius: 0.3, size: 0.08, speed: 16 },
  trail: { step: 0.21, big: 0.15, small: 0.09, life: 0.4, max: 72 },
  sparks: { perBlock: 1.5, max: 28, life: [0.35, 0.7], size: [0.05, 0.085] },
  flash: { size: 0.34, life: 0.12, spoke: 0.12, reach: 0.3 },
  puffs: 14,
};

export const WAND_HIT: HitStyle = {
  palette: ARC,
  spark: SPARK,
  scale: 1,
  shake: 0.1,
  shell: { face: 0.17, corner: 0.13, edge: 0 },
  sparks: 24,
  motes: 8,
  echo: false,
};

/** The bolt of a wand in flight. `material` is the cubes' (see `voxelMaterial`), shared by the bolts; `dispose` frees what the bolt made. */
export class WandBoltView extends CubeBoltView {
  constructor(kit: Pick<SpellKit, 'voxel' | 'viewer'>, material: THREE.Material, p: Projectile) {
    super(kit, material, p, WAND_BOLT);
  }
}

/** The pop where a wand's bolt burst (a `wand_hit` mark). */
export const buildWandHit = (f: Fx, e: FxEntry, kit: SpellKit): FxEntry => buildCubeHit(f, e, kit, WAND_HIT);
