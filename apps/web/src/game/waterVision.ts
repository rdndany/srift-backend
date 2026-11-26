/**
 * What the eyes do in water, the way Minecraft's do.
 *
 * Above water the look is unchanged. Under water the field of view stays the one from land, so the
 * moon and the ocean floor keep their size. A dive already sees most of the water, and the eyes
 * open the rest over thirty seconds. The near floor stays clear, the way it looks from above the
 * surface, and the blue is only the distance. Depth darkens the light. It does not change how far
 * you see. A swamp stays shorter than open sea. Night Vision or Conduit Power (`clear`) sees
 * further at once. Leaving the water drops the look at once.
 *
 * The caller supplies the biome colour, how deep the camera is, and whether the water is open to
 * the sky. This only decides the numbers. Fog, the lens, the tint and the wobble are applied outside.
 */

/**
 * How far the eyes have opened, the way Java Edition does it.
 * Shut for the first five seconds, then the square of the remaining climb, full at thirty.
 */
export function eyeAdjust(seconds: number): number {
  if (seconds <= 5) return 0;
  if (seconds >= 30) return 1;
  const h = (seconds - 5) / 25;
  return h * h;
}

/** Java Edition's water fog ends at 96 blocks once the eyes have adjusted. */
const WATER_FOG = 96;
/** A fresh dive already sees this share of that distance, so the kelp is there from the first moment. */
const WATER_FLOOR = 0.65;

/** Swamp, mangrove and the wetlands that should stay murky even after the eyes have adjusted. */
const MURKY_GROUND = new Set(['swamp', 'bog', 'toxic', 'marsh', 'mangrove']);
const MURKY_FLORA = new Set(['swamp', 'mangrove', 'mangrove_swamp', 'mangrove_coast', 'dark_swamp', 'cypress', 'bog', 'toxic', 'misty', 'sunken_forest']);

export function murkyClimate(place: { atmosphere?: string; ground?: string; flora?: string } | null, legacySwamp: boolean): boolean {
  if (legacySwamp) return true;
  if (!place) return false;
  if (place.atmosphere === 'swamp' || place.atmosphere === 'toxic') return true;
  if (place.ground && MURKY_GROUND.has(place.ground)) return true;
  return !!place.flora && MURKY_FLORA.has(place.flora);
}

export interface WaterSample {
  /** The camera is inside water this frame. */
  submerged: boolean;
  /** Blocks of water above the camera. 0 is the surface. */
  depth: number;
  /** Nothing solid between the camera and the sky. */
  open: boolean;
  /** This biome's water, 0..255. */
  color: readonly [number, number, number];
  /** Swamp or mangrove: the fog stays short. */
  murky: boolean;
  /** How far the world is drawn on land, in blocks. The clearest water still stops inside this. */
  viewDistance: number;
  /** Night Vision or Conduit Power. */
  clear: boolean;
  /** Sprint-swimming: the view rolls with the stroke. */
  sprint: boolean;
  /** Seconds since the last call. */
  dt: number;
}

export interface WaterLook {
  /** 0 in air, 1 while the underwater look is fully on. Falls off just after leaving. */
  blend: number;
  /** 0 on entry, 1 after the eyes have adjusted. */
  adjusted: number;
  /** Fog colour, 0..1, already darkened by depth. */
  fog: readonly [number, number, number];
  near: number;
  far: number;
  /** 0 hides the sky and the sun, 1 is a bright surface. */
  sky: number;
  /** Multiply the scene lights by this. */
  light: number;
  /** Share of the normal field of view. Stays 1, so the moon does not grow as the eyes go under. */
  fovScale: number;
  /** Strength of the coloured wash on the screen, 0..1. */
  veil: number;
  /** How hard the picture wobbles, 0..1. */
  distort: number;
  /** Camera roll in radians while sprint-swimming. */
  roll: number;
}

const AIR: WaterLook = {
  blend: 0,
  adjusted: 0,
  fog: [0, 0, 0],
  near: 0,
  far: 0,
  sky: 1,
  light: 1,
  fovScale: 1,
  veil: 0,
  distort: 0,
  roll: 0,
};

export class WaterVision {
  private blend = 0;
  private roll = 0;
  private stroke = 0;
  /** Seconds the eyes have been under on this dive. */
  private time = 0;

  step(s: WaterSample): WaterLook {
    const dt = Math.max(0, s.dt);
    if (s.submerged) {
      this.blend = 1;
      this.time = Math.min(30, this.time + dt);
    } else {
      // The moment the eyes clear the surface the air look is back. A fade left the world
      // looking underwater for a moment after the eyes were already out.
      this.blend = 0;
      this.time = 0;
    }
    this.stroke += s.sprint && s.submerged ? dt : 0;
    const lean = s.sprint && s.submerged ? Math.sin(this.stroke * 3.4) * 0.2 : 0;
    this.roll += (lean - this.roll) * Math.min(1, dt * 8);

    if (this.blend <= 0) return { ...AIR, roll: this.roll };

    const adjusted = s.clear ? 1 : eyeAdjust(this.time);
    const reach = Math.max(16, s.viewDistance);
    // A fresh dive already sees most of the water. The eyes open the rest of the 96.
    const vision = Math.max(WATER_FLOOR, adjusted);
    const span = s.clear ? reach * 0.9 : WATER_FOG * (s.murky ? 0.4 : 1);
    const far = Math.min(reach, span * vision);
    // The floor in front of you stays its own colour. From above the surface that floor is not lost
    // in fog, so going under should not repaint it either. The blue begins further out.
    const near = far * (s.clear ? 0.5 : 0.55);
    // One block of water takes a little light. The first blocks are almost the surface, and the
    // drop eases the deeper you already are, so it never snaps to dark.
    const length = s.clear ? 26 : s.murky ? 12 : 18;
    const down = Math.exp(-Math.max(0, s.depth) / length);
    const dim = 0.32 + 0.5 * down;
    const fog: [number, number, number] = [
      Math.max(0.02, s.color[0] / 255 * dim),
      Math.max(0.06, s.color[1] / 255 * dim),
      Math.max(0.14, s.color[2] / 255 * dim),
    ];
    // A block overhead does not push the sky away. Depth does that, one block at a time.
    const sky = down;
    const light = s.clear ? Math.max(0.4, 0.22 + 0.6 * down) : Math.max(0.16, 0.15 + 0.7 * down);
    return {
      blend: this.blend,
      adjusted,
      fog,
      near,
      far,
      sky,
      light,
      fovScale: 1,
      veil: this.blend * (s.clear ? 0.04 : 0.05),
      distort: this.blend * (s.clear ? 0.06 : 0.08),
      roll: this.roll,
    };
  }
}
