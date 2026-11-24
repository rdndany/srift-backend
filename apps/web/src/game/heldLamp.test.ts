import { describe, expect, it } from 'vitest';
import { B, I } from '@solrift/shared';
import { heldLamp } from './character';

describe('heldLamp', () => {
  it('puts a torch or a lantern in the right hand, and the main hand wins', () => {
    const torch = heldLamp(B.TORCH, 0);
    expect(torch).toMatchObject({ left: false, hang: false });
    expect(torch!.light.level).toBeGreaterThan(10);

    const lantern = heldLamp(B.LANTERN, B.TORCH);
    expect(lantern).toMatchObject({ left: false, hang: true });
    expect(lantern!.light.b).toBeLessThan(lantern!.light.r);
  });

  it('puts an off-hand torch in the left hand, unless a shield in the main hand has taken that hand', () => {
    expect(heldLamp(0, B.TORCH)).toMatchObject({ left: true, hang: false });
    expect(heldLamp(I.SHIELD, B.TORCH)).toMatchObject({ left: false, hang: false });
  });

  it('is nothing when neither hand gives light', () => {
    expect(heldLamp(0, 0)).toBeNull();
    expect(heldLamp(I.SHIELD, 0)).toBeNull();
  });
});
