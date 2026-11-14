import { MOUNT_CAST, type MountId } from '@solrift/shared';
import type { FxLook } from './emberFx';

/**
 * The light of a mount being called and sent away: the same cubes, rings and sparks as the Emberstone's (see `EmberFx`) with the sounds of a
 * drum, a howl and a horn instead of bells. Every mount has the same effects; what is its own is the colour of the light. The Fenrir's is the
 * violet of its eyes rising to white; the others are the colour of their own lightning.
 */
const SOUNDS = { tick: 'mount_tick', fizzle: 'mount_fizzle', depart: 'mount_on', arrive: 'mount_on', puff: 'mount_off' } as const;

export const MOUNT_LOOK: FxLook = {
  palette: [
    [0.62, 0.22, 1],
    [0.78, 0.4, 1],
    [0.92, 0.7, 1],
    [1, 0.94, 1],
    [1, 0.84, 0.36],
  ],
  dim: [0.32, 0.14, 0.5],
  column: [0.66, 0.3, 1],
  runeLo: [170, 90, 255],
  runeHi: [235, 190, 255],
  castTime: MOUNT_CAST,
  sounds: SOUNDS,
};

/** The same light in another colour: five sparks, deepest to palest and one gold-white accent, and the colour of the runes (0..255). */
const tinted = (palette: FxLook['palette'], dim: FxLook['dim'], column: FxLook['column'], runeLo: FxLook['runeLo'], runeHi: FxLook['runeHi']): FxLook => ({
  palette,
  dim,
  column,
  runeLo,
  runeHi,
  castTime: MOUNT_CAST,
  sounds: SOUNDS,
});

const LOOKS: Record<MountId, FxLook> = {
  fenrir: MOUNT_LOOK,
  // red and ember
  fenrir_black: tinted(
    [
      [1, 0.16, 0.1],
      [1, 0.38, 0.22],
      [1, 0.68, 0.5],
      [1, 0.94, 0.88],
      [1, 0.84, 0.36],
    ],
    [0.5, 0.12, 0.08],
    [1, 0.3, 0.18],
    [255, 80, 60],
    [255, 190, 160],
  ),
  // ice blue
  fenrir_blue: tinted(
    [
      [0.1, 0.46, 1],
      [0.3, 0.68, 1],
      [0.6, 0.88, 1],
      [0.94, 1, 1],
      [1, 0.96, 0.7],
    ],
    [0.1, 0.26, 0.5],
    [0.25, 0.62, 1],
    [70, 160, 255],
    [190, 235, 255],
  ),
  // gold
  fenrir_gold: tinted(
    [
      [1, 0.6, 0.08],
      [1, 0.78, 0.22],
      [1, 0.9, 0.52],
      [1, 0.98, 0.84],
      [1, 1, 1],
    ],
    [0.5, 0.32, 0.08],
    [1, 0.74, 0.2],
    [255, 190, 60],
    [255, 240, 170],
  ),
};

/** The light of a mount (the Fenrir's when it is not known). */
export const mountLook = (id: MountId): FxLook => LOOKS[id] ?? MOUNT_LOOK;
