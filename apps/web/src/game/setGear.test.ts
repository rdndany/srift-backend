import { CLASS_IDS, OUTFITS } from '@solrift/shared';
import { describe, expect, it } from 'vitest';
import { SET_STYLE_IDS } from './setGear';

describe('the sets of armor', () => {
  it('has a way to dress every outfit of the shop in the style of its class, and none that is not in it', () => {
    for (const cls of CLASS_IDS) {
      expect([...SET_STYLE_IDS[cls]].sort()).toEqual(OUTFITS.filter((o) => o.cls === cls).map((o) => o.id).sort());
    }
  });
});
