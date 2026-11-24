import { describe, expect, it } from 'vitest';
import { paintClassSkin } from './classSkin';
import { paintSkin, partRects, SKIN_SIZE, type Look } from './skin';

const look: Look = { shirt: [40, 90, 200], pants: [120, 30, 50], skin: [200, 140, 110], hair: [150, 150, 160], eyes: [40, 120, 80], style: 0, seed: 3 };
const bare = paintSkin(look);
const at = (data: Uint8ClampedArray, x: number, y: number): number[] => [...data.slice((y * SKIN_SIZE + x) * 4, (y * SKIN_SIZE + x) * 4 + 4)];

describe('clothes painted on the skin', () => {
  it('leaves the skin alone when nothing painted is worn', () => {
    expect(paintClassSkin(bare, [null, null, null, null])).toEqual(bare);
    expect(paintClassSkin(bare, ['druid', 'druid', 'druid', 'druid'])).toEqual(bare);
  });

  it('never changes the skin it is given', () => {
    const copy = new Uint8ClampedArray(bare);
    paintClassSkin(bare, ['warrior', 'warrior', 'warrior', 'warrior']);
    expect(bare).toEqual(copy);
  });

  it('paints a Warrior gray: every pixel of the body, arms and legs has the same hue, none is left of the old colours', () => {
    const out = paintClassSkin(bare, [null, 'warrior', 'warrior', 'warrior']);
    for (const part of ['body', 'armL', 'armR', 'legL', 'legR'] as const) {
      const f = partRects(part, 'base');
      for (const name of ['front', 'back', 'right', 'left', 'top', 'bottom'] as const) {
        const r = f[name];
        for (let y = r.y; y < r.y + r.h; y++)
          for (let x = r.x; x < r.x + r.w; x++) {
            const [R, G, B, A] = at(out, x, y) as [number, number, number, number];
            expect(A).toBe(255);
            expect(Math.max(R, G, B) - Math.min(R, G, B)).toBeLessThan(24); // gray: the channels are close
          }
      }
    }
  });

  it('clears the outer layer where it paints, and keeps the head as it was', () => {
    const out = paintClassSkin(bare, ['warrior', 'warrior', 'warrior', 'warrior']);
    const o = partRects('body', 'over').front;
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) expect(at(out, x, y)[3]).toBe(0);
    const h = partRects('head', 'base').front;
    expect(at(out, h.x + 2, h.y + 4)).toEqual(at(bare, h.x + 2, h.y + 4));
  });

  it('paints a steel helm over the hair and leaves the face as it is', () => {
    const out = paintClassSkin(bare, ['warrior', null, null, null]);
    const f = partRects('head', 'base').front;
    const over = partRects('head', 'over');
    for (const x of [0, 3, 7]) {
      const [R, G, B] = at(out, f.x + x, f.y) as [number, number, number];
      expect(Math.max(R, G, B) - Math.min(R, G, B)).toBeLessThan(24);
    }
    for (const name of ['front', 'back', 'right', 'left', 'top'] as const) {
      const r = over[name];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) expect(at(out, x, y)[3]).toBe(0);
    }
    for (let y = 3; y < 8; y++) for (let x = 1; x < 7; x++) expect(at(out, f.x + x, f.y + y)).toEqual(at(bare, f.x + x, f.y + y));
    const body = partRects('body', 'base').front;
    expect(at(out, body.x + 1, body.y + 3)).toEqual(at(bare, body.x + 1, body.y + 3));
  });

  it('paints a Mage violet and leaves the hands bare', () => {
    const out = paintClassSkin(bare, [null, 'mage', 'mage', 'mage']);
    const front = partRects('body', 'base').front;
    const [R, G, B] = at(out, front.x + 5, front.y + 6) as [number, number, number];
    expect(B).toBeGreaterThan(R);
    expect(R).toBeGreaterThan(G);
    const arm = partRects('armR', 'base').front;
    expect(at(out, arm.x + 1, arm.y + 11)).toEqual(at(bare, arm.x + 1, arm.y + 11));
    expect(at(out, arm.x + 1, arm.y + 4)).not.toEqual(at(bare, arm.x + 1, arm.y + 4));
    const head = partRects('head', 'base').front;
    expect(at(out, head.x + 3, head.y)).toEqual(at(bare, head.x + 3, head.y));
  });

  it('paints the thighs with the legs and the greaves with the boots', () => {
    const legs = paintClassSkin(bare, [null, null, 'warrior', null]);
    const feet = paintClassSkin(bare, [null, null, null, 'warrior']);
    const f = partRects('legR', 'base').front;
    expect(at(legs, f.x + 1, f.y + 1)).not.toEqual(at(bare, f.x + 1, f.y + 1));
    expect(at(legs, f.x + 1, f.y + 9)).toEqual(at(bare, f.x + 1, f.y + 9));
    expect(at(feet, f.x + 1, f.y + 1)).toEqual(at(bare, f.x + 1, f.y + 1));
    expect(at(feet, f.x + 1, f.y + 9)).not.toEqual(at(bare, f.x + 1, f.y + 9));
  });

  it('paints the leather set brown, leaves the hands and the face bare and clears what it covers', () => {
    const out = paintClassSkin(bare, ['leather', 'leather', 'leather', 'leather']);
    const front = partRects('body', 'base').front;
    const [R, G, B] = at(out, front.x + 1, front.y + 6) as [number, number, number];
    expect(R).toBeGreaterThan(G);
    expect(G).toBeGreaterThan(B);
    const arm = partRects('armR', 'base').front;
    expect(at(out, arm.x + 1, arm.y + 11)).toEqual(at(bare, arm.x + 1, arm.y + 11));
    expect(at(out, arm.x + 1, arm.y + 4)).not.toEqual(at(bare, arm.x + 1, arm.y + 4));
    const head = partRects('head', 'base').front;
    expect(at(out, head.x + 3, head.y)).not.toEqual(at(bare, head.x + 3, head.y));
    for (let y = 3; y < 8; y++) for (let x = 1; x < 7; x++) expect(at(out, head.x + x, head.y + y)).toEqual(at(bare, head.x + x, head.y + y));
    const o = partRects('body', 'over').front;
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) expect(at(out, x, y)[3]).toBe(0);
  });

  it('paints the gold set yellow with a stone in the breast and leaves the hands bare', () => {
    const out = paintClassSkin(bare, ['gold', 'gold', 'gold', 'gold']);
    const front = partRects('body', 'base').front;
    const [R, G, B] = at(out, front.x + 1, front.y + 6) as [number, number, number];
    expect(R).toBeGreaterThan(G);
    expect(G).toBeGreaterThan(B);
    const stone = at(out, front.x + 3, front.y + 3) as number[];
    expect(stone[2]).toBeGreaterThan(stone[0]);
    const arm = partRects('armR', 'base').front;
    expect(at(out, arm.x + 1, arm.y + 11)).toEqual(at(bare, arm.x + 1, arm.y + 11));
    expect(at(out, arm.x + 1, arm.y + 4)).not.toEqual(at(bare, arm.x + 1, arm.y + 4));
  });

  it('paints the diamond set teal, cut in facets, and leaves the hands bare', () => {
    const out = paintClassSkin(bare, ['diamond', 'diamond', 'diamond', 'diamond']);
    const front = partRects('body', 'base').front;
    const a = at(out, front.x + 1, front.y + 6) as number[];
    const b = at(out, front.x + 1, front.y + 7) as number[];
    expect(a[1]).toBeGreaterThan(a[0]);
    expect(a[2]).toBeGreaterThan(a[0]);
    expect(a).not.toEqual(b); // neighbouring facets differ
    const arm = partRects('armL', 'base').front;
    expect(at(out, arm.x + 1, arm.y + 11)).toEqual(at(bare, arm.x + 1, arm.y + 11));
  });

  it('paints the iron set bluish gray, leaves the hands and the face bare and clears what it covers', () => {
    const out = paintClassSkin(bare, ['iron', 'iron', 'iron', 'iron']);
    const front = partRects('body', 'base').front;
    const [R, G, B] = at(out, front.x + 1, front.y + 6) as [number, number, number];
    expect(B).toBeGreaterThan(R);
    expect(B - R).toBeLessThan(40);
    const arm = partRects('armL', 'base').front;
    expect(at(out, arm.x + 1, arm.y + 11)).toEqual(at(bare, arm.x + 1, arm.y + 11));
    expect(at(out, arm.x + 1, arm.y + 4)).not.toEqual(at(bare, arm.x + 1, arm.y + 4));
    const head = partRects('head', 'base').front;
    expect(at(out, head.x + 3, head.y)).not.toEqual(at(bare, head.x + 3, head.y));
    for (let y = 3; y < 8; y++) for (let x = 1; x < 7; x++) expect(at(out, head.x + x, head.y + y)).toEqual(at(bare, head.x + x, head.y + y));
    const o = partRects('armL', 'over').front;
    for (let y = o.y; y < o.y + 12; y++) for (let x = o.x; x < o.x + o.w; x++) expect(at(out, x, y)[3]).toBe(0);
  });
});
