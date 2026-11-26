/**
 * What the eyes do in water, the way Minecraft's do.
 *
 * Above water the look is unchanged. The moment the camera is in a water block the fog goes
 * almost solid, in the colour of this biome's water, and the lens narrows. The longer the eyes
 * stay under, the further the fog draws back: clearly better after about five seconds, as far as
 * it will go after about thirty. A swamp or a mangrove never clears as far as open sea. Night
 * Vision or Conduit Power (`clear`) lifts the fog at once. Leaving the water drops the whole
 * look in a fraction of a second, and the next dive starts thick again.
 *
 * The caller supplies the biome colour, how deep the camera is, and whether the water is open to
 * the sky. This only decides the numbers. Fog, the lens, the tint and the wobble are applied outside.
 */

/** How far the eyes have opened, 0 the instant they go under, 1 after thirty seconds. */
export function eyeAdjust(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds >= 30) return 1;
  if (seconds <= 5) return (seconds / 5) * 0.45;
  return 0.45 + ((seconds - 5) / 25) * 0.55;
}

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
  /** Share of the normal field of view. 0.9 under water. */
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
  private time = 0;
  private blend = 0;
  private roll = 0;
  private stroke = 0;

  step(s: WaterSample): WaterLook {
    const dt = Math.max(0, s.dt);
    if (s.submerged) {
      this.time += dt;
      this.blend = Math.min(1, this.blend + dt * 16);
    } else {
      this.blend = Math.max(0, this.blend - dt * 8);
      if (this.blend <= 0) this.time = 0;
    }
    this.stroke += s.sprint && s.submerged ? dt : 0;
    const lean = s.sprint && s.submerged ? Math.sin(this.stroke * 3.4) * 0.2 : 0;
    this.roll += (lean - this.roll) * Math.min(1, dt * 8);

    if (this.blend <= 0) return { ...AIR, roll: this.roll };

    const adjusted = s.clear ? 1 : eyeAdjust(this.time);
    const reach = Math.max(16, s.viewDistance);
    const span = s.clear ? reach * 0.9 : reach * 0.55 * (s.murky ? 0.4 : 1);
    // The water is a haze you can see through, not a wall a few blocks away.
    const entry = s.murky ? 18 : 28;
    const far = s.clear ? span : entry + (span - entry) * adjusted;
    const near = Math.max(0.8, far * (s.clear ? 0.35 : 0.12 + 0.2 * adjusted));
    // One block of water takes a little light. The first blocks are almost the surface, and the
    // drop eases the deeper you already are, so it never snaps to dark.
    const length = s.clear ? 26 : s.murky ? 12 : 18;
    const down = Math.exp(-Math.max(0, s.depth) / length);
    const deep = 1 - down;
    const dim = (0.32 + 0.5 * down) * (s.clear ? 1 : 0.75 + 0.25 * adjusted);
    const fog: [number, number, number] = [
      Math.max(0.02, s.color[0] / 255 * dim),
      Math.max(0.06, s.color[1] / 255 * dim),
      Math.max(0.14, s.color[2] / 255 * dim),
    ];
    // A block overhead does not push the sky away. Depth does that, one block at a time.
    const sky = down;
    const light = s.clear
      ? Math.max(0.4, 0.22 + 0.6 * down)
      : Math.max(0.16, (0.15 + 0.7 * down) * (0.65 + 0.35 * adjusted));
    return {
      blend: this.blend,
      adjusted,
      fog,
      near,
      far,
      sky,
      light,
      fovScale: 1 - 0.1 * this.blend,
      veil: this.blend * (s.clear ? 0.08 : 0.12 + 0.1 * (1 - adjusted) + 0.08 * deep),
      distort: this.blend * (s.clear ? 0.12 : 0.28 + 0.18 * (1 - adjusted)),
      roll: this.roll,
    };
  }
}
