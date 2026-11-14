/** Length of one in-game day in real seconds (20 minutes, like the original). */
export const DAY_LENGTH_SECONDS = 1200;

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Height of the sun: 1 at noon, -1 at midnight. `time` 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. */
export const sunHeight = (time: number): number => Math.sin(time * Math.PI * 2);

/**
 * Global light level, 0 (night) .. 1 (full day). `dim` is the weather's darkening and `flash` a
 * lightning strike. The renderer and the simulation (mob spawning and burning) share this formula.
 */
export function daylightAt(time: number, dim = 0, flash = 0): number {
  const base = (0.16 + 0.84 * smoothstep(-0.18, 0.28, sunHeight(time))) * (1 - dim);
  return flash > 0 ? Math.min(1, base + flash * 0.7) : base;
}
