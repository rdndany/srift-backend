import { describe, expect, it } from 'vitest';
import { MOUNT_EYE_LIFT } from '@solrift/shared';
import { RIDER_LIFT } from './mountRig';

describe('the eye of a rider', () => {
  it('is the one value the camera, the aim and the other players share, a little above the head of the figure on the saddle', () => {
    // RIDER_LIFT is how high the figure sits above a person on foot: its eyes are there. The rider's eye is above them, never below.
    expect(MOUNT_EYE_LIFT).toBeGreaterThanOrEqual(RIDER_LIFT);
    expect(MOUNT_EYE_LIFT - RIDER_LIFT).toBeLessThan(0.4);
  });
});
