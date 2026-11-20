import { describe, expect, it } from 'vitest';
import { ARMOR_SLOTS, OUTFIT_CLASSES } from '@solrift/shared';
import { ICON_COLORS, OUTFIT_ICONS } from './outfitIcons';
import { spritePainter } from './sprites';

describe('the pictures of the class clothes', () => {
  it('has all four pieces of every class, each 16 across and 16 down, in the colours of its class', () => {
    for (const cls of OUTFIT_CLASSES) {
      for (const slot of ARMOR_SLOTS) {
        const rows = OUTFIT_ICONS[`${cls}_${slot}`];
        expect(rows, `${cls} ${slot}`).toBeDefined();
        expect(rows.length).toBe(16);
        for (const row of rows) {
          expect(row.length).toBe(16);
          for (const ch of row) if (ch !== '.') expect(ICON_COLORS[cls][ch], `${cls} ${slot}: no colour '${ch}'`).toBeDefined();
        }
      }
    }
  });

  it('are drawn: every sprite has pixels, and is outlined so it stands out from any slot', () => {
    for (const cls of OUTFIT_CLASSES) {
      for (const slot of ARMOR_SLOTS) {
        const paint = spritePainter(`outfit_${cls}_${slot}`)!;
        let filled = 0;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (paint(x, y)[3] > 0) filled++;
        expect(filled, `${cls} ${slot}`).toBeGreaterThan(60);
      }
    }
  });
});
