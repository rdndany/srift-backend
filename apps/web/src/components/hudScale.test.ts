import { describe, expect, it } from 'vitest';
import { hudScale } from './HudScale';

describe('hudScale', () => {
  it('keeps the HUD at its drawn size on a 1280 x 720 screen or bigger', () => {
    expect(hudScale(1280, 720)).toBe(1);
    expect(hudScale(1920, 1080)).toBe(1);
    expect(hudScale(3840, 2160)).toBe(1);
  });

  it('shrinks it with the smaller side (the width or the height)', () => {
    expect(hudScale(980, 540)).toBe(0.75);
    expect(hudScale(1920, 540)).toBe(0.75); // a wide, short window
    expect(hudScale(768, 1080)).toBe(0.6); // a narrow, tall one
  });

  it('stops where the letters would be too small to read', () => {
    expect(hudScale(320, 240)).toBe(0.55);
  });

  it('moves in steps of 5%, so the pixel art is not drawn at odd sizes', () => {
    for (let w = 300; w < 1400; w += 37) {
      const s = hudScale(w, 700);
      expect(Math.round(s * 20) / 20).toBe(s);
    }
  });
});
