import { accessoryOfItem, companionOfItem, mountOfItem, wingOfItem } from './items';
import { mountDef } from './mounts';

/** A companion stays in the bag until the class (or the experience level, with no class) reaches this. */
export const COMPANION_LEVEL = 10;
/** Wings stay in the bag until this level. */
export const WING_LEVEL = 20;
/** Every ring, whichever material, asks for this level. */
export const RING_LEVEL = 10;
/** Every necklace asks for this level. */
export const NECKLACE_LEVEL = 10;

/** The level a companion, a pair of wings, a ring, a necklace or a mount horn asks for. 0 for anything else. */
export function equipLevel(id: number): number {
  if (companionOfItem(id)) return COMPANION_LEVEL;
  if (wingOfItem(id)) return WING_LEVEL;
  const jewelry = accessoryOfItem(id);
  if (jewelry) return jewelry.kind === 'ring' ? RING_LEVEL : NECKLACE_LEVEL;
  const mount = mountDef(mountOfItem(id));
  if (mount) return mount.level;
  return 0;
}

/** Why this hero cannot wear it yet, or null when the level is high enough (or the item asks for none). */
export function equipRefuse(id: number, level: number): string | null {
  const need = equipLevel(id);
  if (need <= 0 || level >= need) return null;
  return `Requires level ${need}.`;
}
