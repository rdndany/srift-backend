/**
 * Weapon swings, as keyframes of offsets from the resting pose: [time 0..1, x, y, z (camera space), yaw, roll, pitch (degrees,
 * pitch negative = tip forward), blade (extra turn of the sprite in the picture plane, degrees), how the move into this key eases].
 * Every swing starts and ends at the resting pose, winds up first, then strikes fast and follows through before it settles.
 */
export type Key = [t: number, x: number, y: number, z: number, yaw: number, roll: number, pitch: number, blade: number, ease?: 'out' | 'in'];
export interface SwingStyle {
  /** Seconds, and how far into it a new swing may start (the pose is close to resting again by then). */
  dur: number;
  again: number;
  /** One variant per swing, taken in turn: a slash from the right, then a backhand, and so on. */
  variants: Key[][];
}
export const SWING_STYLES: Record<string, SwingStyle> = {
  // A diagonal cut from the upper right down across the view, then a rising backhand.
  sword: {
    dur: 0.27,
    again: 0.72,
    variants: [
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0.22, 0.08, 0.3, 0.1, 12, -12, 18, -2],
        [0.46, -0.4, 0.16, -0.2, -14, 20, -34, 62, 'out'],
        [0.64, -0.47, 0.1, -0.22, -16, 24, -38, 78],
        [1, 0, 0, 0, 0, 0, 0, 0],
      ],
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0.22, -0.2, 0.0, 0.08, -10, 24, -6, 66],
        [0.46, 0.14, 0.24, -0.24, 14, -24, -30, -18, 'out'],
        [0.64, 0.18, 0.28, -0.26, 16, -28, -34, -28],
        [1, 0, 0, 0, 0, 0, 0, 0],
      ],
    ],
  },
  // A big, slow overhead chop.
  heavy: {
    dur: 0.42,
    again: 0.78,
    variants: [
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0.3, 0.12, 0.5, 0.08, 10, -16, 20, -8],
        [0.52, -0.28, 0.12, -0.32, -12, 14, -52, 30, 'out'],
        [0.74, -0.32, 0.06, -0.34, -14, 16, -58, 36],
        [1, 0, 0, 0, 0, 0, 0, 0],
      ],
    ],
  },
  // A quick jab with the tip leading, then a short low slash.
  dagger: {
    dur: 0.22,
    again: 0.75,
    variants: [
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0.22, 0.06, 0.0, 0.14, 6, -6, 8, -10],
        [0.45, -0.28, 0.2, -0.36, -12, 8, -66, 40, 'out'],
        [0.62, -0.3, 0.21, -0.38, -12, 8, -70, 42],
        [1, 0, 0, 0, 0, 0, 0, 0],
      ],
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0.22, -0.18, -0.08, 0.06, -10, 20, -10, 30],
        [0.45, 0.08, 0.16, -0.32, 12, -24, -56, 14, 'out'],
        [0.62, 0.1, 0.17, -0.34, 12, -26, -60, 12],
        [1, 0, 0, 0, 0, 0, 0, 0],
      ],
    ],
  },
  // The tall staff: a small lift, then the head tipped toward the middle of the view as the spell leaves it (a wand's big flick would swing
  // a whole staff into the camera).
  staff: {
    dur: 0.46,
    again: 0.8,
    variants: [
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0.26, 0.0, 0.04, 0.02, 3, -4, 4, -6],
        [0.46, -0.08, -0.02, -0.08, -6, 3, -20, 8, 'out'],
        [0.58, -0.07, -0.01, -0.07, -5, 2, -17, 6],
        [0.72, -0.07, -0.01, -0.07, -5, 2, -17, 6],
        [1, 0, 0, 0, 0, 0, 0, 0],
      ],
    ],
  },
  // Raised, then flicked toward the middle of the view as the spell leaves the tip, with a little kick back.
  cast: {
    dur: 0.42,
    again: 0.8,
    variants: [
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0.26, 0.04, 0.26, 0.04, 6, -8, 10, -16],
        [0.44, -0.26, 0.04, -0.3, -16, 6, -62, 22, 'out'],
        [0.54, -0.22, 0.06, -0.24, -12, 4, -52, 16],
        [0.7, -0.24, 0.05, -0.27, -14, 5, -58, 20],
        [1, 0, 0, 0, 0, 0, 0, 0],
      ],
    ],
  },
};
/** The pose a swing was last sampled into: x, y, z, yaw, roll, pitch, blade. */
export const POSE: number[] = [0, 0, 0, 0, 0, 0, 0];

/** The pose of a swing `s` (0..1) into POSE: x, y, z, yaw, roll, pitch, blade. */
export function sampleSwing(keys: Key[], s: number): void {
  let i = 1;
  while (i < keys.length - 1 && s > keys[i][0]) i++;
  const a = keys[i - 1];
  const b = keys[i];
  let u = Math.max(0, Math.min(1, (s - a[0]) / (b[0] - a[0])));
  u = b[8] === 'out' ? 1 - (1 - u) * (1 - u) * (1 - u) : b[8] === 'in' ? u * u * u : u * u * (3 - 2 * u);
  for (let k = 0; k < 7; k++) POSE[k] = (a[k + 1] as number) + ((b[k + 1] as number) - (a[k + 1] as number)) * u;
}
