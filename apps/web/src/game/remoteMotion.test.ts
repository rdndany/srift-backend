import { describe, expect, it } from 'vitest';
import { remoteSpeed, takeSwing } from './remote';

describe('other players', () => {
  it('times the walk to the step the body takes, not the distance still left', () => {
    const dt = 1 / 60;
    const k = 1 - Math.exp(-dt * 16);
    const pace = 5.9;
    // Settled behind a player who moves at `pace`: the gap is what the next step closes.
    const lag = (pace * dt) / k;
    const speed = remoteSpeed(lag * k, 0, dt);
    expect(speed).toBeCloseTo(pace, 5);
    // The old clock treated that whole gap as one frame of movement.
    expect(lag / dt).toBeGreaterThan(pace * 3);
  });

  it('plays a sword swing through instead of restarting it on every update', () => {
    expect(takeSwing(9, 0)).toBe(0);
    // The same blow, a later word that it has barely started: the arm is not pulled back.
    expect(takeSwing(0.08, 0)).toBe(0.08);
    expect(takeSwing(0.1, 0.05)).toBe(0.1);
    // The next blow, or the next stroke of mining, starts again.
    expect(takeSwing(0.4, 0)).toBe(0);
    expect(takeSwing(0.2, undefined)).toBe(0.2);
  });
});
