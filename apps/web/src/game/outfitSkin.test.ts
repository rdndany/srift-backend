import { describe, expect, it } from 'vitest';
import { OUTFITS } from '@solrift/shared';
import { outfitHead, outfitSole, paintOutfitSkin } from './outfitSkin';
import { paintSkin, partRects, type Look } from './skin';

const look: Look = { shirt: [40, 90, 200], pants: [120, 30, 50], skin: [200, 140, 110], hair: [150, 150, 160], eyes: [40, 120, 80], style: 0, seed: 3 };
const bare = paintSkin(look);

describe('token outfits painted on the skin', () => {
  it('paints every outfit without touching the skin it is given', () => {
    const copy = new Uint8ClampedArray(bare);
    for (const def of OUTFITS) {
      const out = paintOutfitSkin(bare, def);
      expect(out.length).toBe(bare.length);
      expect(out).not.toEqual(bare);
    }
    expect(bare).toEqual(copy);
  });

  it('gives different outfits different looks', () => {
    const seen = new Set<string>();
    for (const def of OUTFITS) seen.add(Buffer.from(paintOutfitSkin(bare, def)).toString('base64'));
    expect(seen.size).toBe(OUTFITS.length);
  });

  it('covers the body with outfit colours: the old shirt is gone from the front', () => {
    for (const def of OUTFITS) {
      const out = paintOutfitSkin(bare, def);
      const r = partRects('body', 'base').front;
      let old = 0;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * 64 + x) * 4;
          if (Math.abs(out[i]! - 40) + Math.abs(out[i + 1]! - 90) + Math.abs(out[i + 2]! - 200) < 8) old++;
        }
      expect(old, def.id).toBe(0);
    }
  });

  it('knows which outfits wear a helm or a hood, and gives each a sole colour', () => {
    for (const def of OUTFITS) {
      const head = outfitHead(def);
      expect(head === null || head === 'helm' || head === 'hood').toBe(true);
      expect(Number.isInteger(outfitSole(def))).toBe(true);
    }
    expect(OUTFITS.filter((d) => d.cls === 'warrior').every((d) => outfitHead(d) === 'helm')).toBe(true);
  });
});
