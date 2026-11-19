import { describe, expect, it } from 'vitest';
import { STEP_ACTIONS, STEP_SURFACES, prepareStep } from './stepSounds';

describe('footstep samples', () => {
  it('builds every surface ahead of the first step', () => {
    expect(STEP_SURFACES.length).toBeGreaterThan(0);
    expect(STEP_ACTIONS).toEqual(['step', 'jump', 'land']);
    for (const kind of STEP_SURFACES) for (const action of STEP_ACTIONS) prepareStep(kind, action, 8000);
    const t0 = performance.now();
    prepareStep('grass', 'step', 8000);
    expect(performance.now() - t0).toBeLessThan(5);
  });
});
