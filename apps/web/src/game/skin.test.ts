import { describe, expect, it } from 'vitest';
import { HAIR_STYLES, PART_NAMES, PARTS, SKIN_SIZE, THREE_FACE_ORDER, boxRects, isSkinSize, legacyToModern, paintSkin, partRects, type Look, type Rect } from './skin';

const look = (over: Partial<Look> = {}): Look => ({
  shirt: [200, 85, 61],
  pants: [54, 66, 94],
  skin: [217, 162, 115],
  hair: [58, 42, 30],
  eyes: [59, 106, 168],
  style: 0,
  seed: 1,
  ...over,
});

const alphaAt = (data: Uint8ClampedArray, x: number, y: number): number => data[(y * SKIN_SIZE + x) * 4 + 3];
const rgbAt = (data: Uint8ClampedArray, x: number, y: number): number[] => [...data.slice((y * SKIN_SIZE + x) * 4, (y * SKIN_SIZE + x) * 4 + 3)];
const cells = (r: Rect): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
};

describe('skin layout', () => {
  it('lays a box out like the standard skin', () => {
    const r = boxRects(0, 0, 8, 8, 8);
    expect(r.front).toEqual({ x: 8, y: 8, w: 8, h: 8 });
    expect(r.right).toEqual({ x: 0, y: 8, w: 8, h: 8 });
    expect(r.left).toEqual({ x: 16, y: 8, w: 8, h: 8 });
    expect(r.back).toEqual({ x: 24, y: 8, w: 8, h: 8 });
    expect(r.top).toEqual({ x: 8, y: 0, w: 8, h: 8 });
    expect(r.bottom).toEqual({ x: 16, y: 0, w: 8, h: 8 });
    expect(boxRects(16, 16, 8, 12, 4).front).toEqual({ x: 20, y: 20, w: 8, h: 12 });
    expect(partRects('armR', 'base').front).toEqual({ x: 44, y: 20, w: 4, h: 12 });
    expect(partRects('legL', 'base').front).toEqual({ x: 20, y: 52, w: 4, h: 12 });
  });

  it('keeps every face inside the picture and no two faces share a pixel', () => {
    const seen = new Map<string, string>();
    for (const part of PART_NAMES) {
      for (const layer of ['base', 'over'] as const) {
        const rects = partRects(part, layer);
        for (const face of THREE_FACE_ORDER) {
          for (const [x, y] of cells(rects[face])) {
            expect(x >= 0 && y >= 0 && x < SKIN_SIZE && y < SKIN_SIZE).toBe(true);
            const key = `${x},${y}`;
            expect(seen.get(key), `${part} ${layer} ${face} overlaps ${seen.get(key)}`).toBeUndefined();
            seen.set(key, `${part} ${layer} ${face}`);
          }
        }
      }
    }
  });

  it('numbers the faces the way three.js does', () => {
    expect([...THREE_FACE_ORDER]).toEqual(['right', 'left', 'top', 'bottom', 'back', 'front']);
  });

  it('accepts the two skin sizes', () => {
    expect(isSkinSize(64, 64)).toBe(true);
    expect(isSkinSize(64, 32)).toBe(true);
    expect(isSkinSize(128, 128)).toBe(false);
    expect(isSkinSize(32, 32)).toBe(false);
  });
});

describe('default skin', () => {
  it('covers every face of the base layer', () => {
    const data = paintSkin(look());
    for (const part of PART_NAMES) {
      const rects = partRects(part, 'base');
      for (const face of THREE_FACE_ORDER) {
        for (const [x, y] of cells(rects[face])) expect(alphaAt(data, x, y), `${part} ${face} ${x},${y}`).toBe(255);
      }
    }
  });

  it('leaves the outer layer partly open so the base shows through', () => {
    const data = paintSkin(look());
    for (const part of PART_NAMES) {
      let solid = 0;
      let open = 0;
      const rects = partRects(part, 'over');
      for (const face of THREE_FACE_ORDER) {
        for (const [x, y] of cells(rects[face])) {
          if (alphaAt(data, x, y) === 255) solid++;
          else open++;
        }
      }
      expect(solid, `${part} has an outer layer`).toBeGreaterThan(0);
      expect(open, `${part} outer layer is not a second coat of everything`).toBeGreaterThan(solid / 4);
    }
  });

  it('draws the eyes and the mouth on the front of the head', () => {
    const data = paintSkin(look());
    const f = partRects('head', 'base').front;
    expect(rgbAt(data, f.x + 2, f.y + 4)).not.toEqual(rgbAt(data, f.x + 3, f.y + 4));
    // The pupil is bluish for these eyes, the white is not.
    const [r, , b] = rgbAt(data, f.x + 2, f.y + 4);
    expect(b).toBeGreaterThan(r);
    expect(rgbAt(data, f.x + 1, f.y + 4).every((v) => v > 200)).toBe(true);
    // The face is mirrored: the other eye has its white on the outside too.
    expect(rgbAt(data, f.x + 6, f.y + 4).every((v) => v > 200)).toBe(true);
    // The mouth is redder than the skin around it.
    const lip = rgbAt(data, f.x + 3, f.y + 6);
    const cheek = rgbAt(data, f.x + 3, f.y + 7);
    expect(lip[0] - lip[2]).toBeGreaterThan(cheek[0] - cheek[2] - 30);
  });

  it('wears the colours it is given', () => {
    const green = paintSkin(look({ shirt: [40, 180, 60] }));
    const body = partRects('body', 'base').front;
    const [r, g] = rgbAt(green, body.x + 3, body.y + 7);
    expect(g).toBeGreaterThan(r);
    const gold = paintSkin(look({ hair: [220, 180, 90], style: 1 }));
    const top = partRects('head', 'base').top;
    const [hr, , hb] = rgbAt(gold, top.x + 4, top.y + 4);
    expect(hr).toBeGreaterThan(hb);
  });

  it('is the same every time and differs between players', () => {
    expect(paintSkin(look())).toEqual(paintSkin(look()));
    expect(paintSkin(look({ seed: 2 }))).not.toEqual(paintSkin(look()));
    for (let s = 0; s < HAIR_STYLES; s++) {
      for (let t = s + 1; t < HAIR_STYLES; t++) expect(paintSkin(look({ style: s }))).not.toEqual(paintSkin(look({ style: t })));
    }
  });

  it('keeps long hair down the back of the head and short hair off the nape', () => {
    const back = partRects('head', 'base').back;
    const long = paintSkin(look({ style: 2 }));
    const short = paintSkin(look({ style: 0 }));
    const hair = [58, 42, 30];
    const near = (c: number[]): boolean => c.every((v, i) => Math.abs(v - hair[i]) < 30);
    expect(near(rgbAt(long, back.x + 3, back.y + 7))).toBe(true);
    expect(near(rgbAt(short, back.x + 3, back.y + 7))).toBe(false);
  });
});

describe('old 64x32 skins', () => {
  it('mirror the right arm and leg onto the left', () => {
    const old = new Uint8ClampedArray(64 * 32 * 4);
    const set = (x: number, y: number, v: number): void => {
      const i = (y * 64 + x) * 4;
      old[i] = v;
      old[i + 1] = v;
      old[i + 2] = v;
      old[i + 3] = 255;
    };
    // Mark the right leg's right face (x 0..3) and front (x 4..7) on one row each.
    const rl = partRects('legR', 'base');
    set(rl.right.x, rl.right.y, 11);
    set(rl.front.x, rl.front.y, 22);
    const out = legacyToModern(old);
    expect(out.length).toBe(64 * 64 * 4);
    // The original stays where it was.
    expect(rgbAt(out, rl.right.x, rl.right.y)[0]).toBe(11);
    const ll = partRects('legL', 'base');
    // The left leg's left face is the mirror of the right leg's right face: the marked column is now on the far side.
    expect(rgbAt(out, ll.left.x + ll.left.w - 1, ll.left.y)[0]).toBe(11);
    expect(rgbAt(out, ll.front.x + ll.front.w - 1, ll.front.y)[0]).toBe(22);
    expect(alphaAt(out, ll.front.x, ll.front.y)).toBe(0);
  });

  it('refuse other sizes', () => {
    expect(() => legacyToModern(new Uint8ClampedArray(10))).toThrow();
  });
});

describe('parts', () => {
  it('make a person 32 pixels tall and 16 wide at the shoulders', () => {
    expect(PARTS.head.h + PARTS.body.h + PARTS.legR.h).toBe(32);
    expect(PARTS.armL.w * 2 + PARTS.body.w).toBe(16);
  });
});

describe('an outfit trim', () => {
  const BRASS = [232, 190, 74];
  const brassCount = (data: Uint8ClampedArray): number => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && Math.abs(data[i] - BRASS[0]) < 2 && Math.abs(data[i + 1] - BRASS[1]) < 2 && Math.abs(data[i + 2] - BRASS[2]) < 2) n++;
    return n;
  };
  const colourCount = (data: Uint8ClampedArray, c: number[]): number => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i] === c[0] && data[i + 1] === c[1] && data[i + 2] === c[2]) n++;
    return n;
  };

  it('takes the place of the brass of the buckles and the badge, and nothing else changes shape', () => {
    const plain = paintSkin(look());
    const dressed = paintSkin(look({ trim: [255, 63, 208] }));
    expect(brassCount(plain)).toBeGreaterThan(0);
    expect(brassCount(dressed)).toBe(0);
    expect(colourCount(dressed, [255, 63, 208])).toBeGreaterThanOrEqual(brassCount(plain) / 2);
    let differ = 0;
    for (let i = 0; i < plain.length; i += 4) {
      expect(dressed[i + 3]).toBe(plain[i + 3]); // (the same shape)
      if (dressed[i] !== plain[i] || dressed[i + 1] !== plain[i + 1] || dressed[i + 2] !== plain[i + 2]) differ++;
    }
    expect(differ).toBeGreaterThan(0);
    expect(differ).toBeLessThan(40);
  });
});
