import { describe, expect, it } from 'vitest';
import type { LandPreview } from '@solrift/shared';
import { Markers, inLineWith, isPerfect, localFault, straightText, straightness, verdictOf, type Corner } from './landMarkers';

const rules = { minEdge: 3, minCorners: 3, maxCorners: 12 };
const rect = (x0: number, z0: number, x1: number, z1: number): Corner[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

describe('the corners marked with the Surveyor', () => {
  it('takes corners one at a time, up to the most the server allows', () => {
    const m = new Markers({ ...rules, maxCorners: 4 });
    expect(m.place(0, 0)).toBe('added');
    expect(m.place(10, 0)).toBe('added');
    expect(m.place(10, 10)).toBe('added');
    expect(m.place(0, 10)).toBe('added');
    expect(m.place(5, 5)).toBe('full');
    expect(m.count).toBe(4);
  });

  it('takes the last corner back with a right click, or the one under the crosshair', () => {
    const m = new Markers(rules);
    for (const [x, z] of rect(0, 0, 10, 10)) m.place(x, z);
    expect(m.undo()).toBe(true);
    expect(m.corners).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(m.undo(10, 0)).toBe(true);
    expect(m.corners).toEqual([[0, 0], [10, 10]]);
    m.undo();
    m.undo();
    expect(m.undo()).toBe(false);
  });

  it('closes only a shape that has enough corners and nothing wrong with it', () => {
    const m = new Markers(rules);
    m.place(0, 0);
    m.place(10, 0);
    expect(m.close()).toBe(false);
    m.place(10, 10);
    expect(m.close()).toBe(true);
    expect(m.closed).toBe(true);
    // A crossed bow-tie cannot be closed.
    const x = new Markers(rules);
    for (const [px, pz] of [[0, 0], [10, 10], [10, 0], [0, 10]] as Corner[]) x.place(px, pz);
    expect(x.close()).toBe(false);
  });

  it('picks a corner up with a click on it and puts it down with the next one', () => {
    const m = new Markers(rules);
    for (const [x, z] of rect(0, 0, 10, 10)) m.place(x, z);
    m.close();
    expect(m.place(10, 10)).toBe('moved');
    expect(m.grabbed).toBe(2);
    expect(m.shape([14, 14])[2]).toEqual([14, 14]);
    expect(m.place(14, 14)).toBe('moved');
    expect(m.grabbed).toBe(-1);
    expect(m.corners[2]).toEqual([14, 14]);
    expect(m.closed).toBe(true);
    // A corner put down on another one is refused, and stays where it was.
    m.place(14, 14);
    expect(m.place(0, 0)).toBe('same');
    expect(m.corners[2]).toEqual([14, 14]);
  });

  it('puts a corner back where it was when the right button is pressed while it is held', () => {
    const m = new Markers(rules);
    for (const [x, z] of rect(0, 0, 10, 10)) m.place(x, z);
    m.place(0, 10);
    expect(m.grabbed).toBe(3);
    expect(m.undo()).toBe(true);
    expect(m.grabbed).toBe(-1);
    expect(m.count).toBe(4);
  });

  it('puts a new corner into an edge of a closed shape, in its place in the order, and lets it be dropped where it should be', () => {
    const m = new Markers(rules);
    for (const [x, z] of rect(0, 0, 10, 10)) m.place(x, z);
    m.close();
    expect(m.place(5, 1)).toBe('inserted');
    expect(m.corners).toEqual([[0, 0], [5, 1], [10, 0], [10, 10], [0, 10]]);
    expect(m.grabbed).toBe(1);
    expect(m.shape([5, -6])[1]).toEqual([5, -6]);
    expect(m.place(5, -6)).toBe('moved');
    expect(m.corners[1]).toEqual([5, -6]);
    expect(m.grabbed).toBe(-1);
    expect(m.closed).toBe(true);
    // The closing edge works too, and far from every edge nothing is added.
    expect(m.place(0, 4)).toBe('inserted');
    expect(m.corners[m.grabbed]).toEqual([0, 4]);
    expect(m.corners.at(-1)).toEqual([0, 4]);
    m.undo();
    expect(m.place(30, 30)).toBe('closed');
  });

  it('takes a corner that was only just put into an edge away again with the right button, and respects the most corners', () => {
    const m = new Markers({ ...rules, maxCorners: 4 });
    for (const [x, z] of rect(0, 0, 10, 10)) m.place(x, z);
    m.close();
    expect(m.place(5, 0)).toBe('closed');
    const n = new Markers(rules);
    for (const [x, z] of rect(0, 0, 10, 10)) n.place(x, z);
    n.close();
    n.place(5, 0);
    expect(n.count).toBe(5);
    expect(n.undo()).toBe(true);
    expect(n.count).toBe(4);
    expect(n.corners).toEqual(rect(0, 0, 10, 10));
    expect(n.grabbed).toBe(-1);
  });

  it('shows the shape as it would be bought, with the crosshair as one more corner while it is open', () => {
    const m = new Markers(rules);
    m.place(0, 0);
    m.place(10, 0);
    expect(m.shape([10, 10])).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(m.shape(null)).toEqual([[0, 0], [10, 0]]);
    // ...unless the crosshair is on a corner already.
    expect(m.shape([10, 0])).toEqual([[0, 0], [10, 0]]);
  });

  it('never keeps a corner after the shape is thrown away', () => {
    const m = new Markers(rules);
    for (const [x, z] of rect(0, 0, 10, 10)) m.place(x, z);
    m.close();
    m.clear();
    expect(m.count).toBe(0);
    expect(m.closed).toBe(false);
    expect(m.grabbed).toBe(-1);
  });
});

describe('what can be seen at once about a shape', () => {
  it('accepts a rectangle, a triangle and a concave polygon', () => {
    expect(localFault(rect(0, 0, 10, 10), rules, true)).toBeNull();
    expect(localFault([[0, 0], [12, 0], [6, 10]], rules, true)).toBeNull();
    // An L.
    expect(localFault([[0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20]], rules, true)).toBeNull();
  });

  it('refuses two corners on one block, a short edge, and a boundary that crosses itself', () => {
    expect(localFault([[0, 0], [10, 0], [0, 0]], rules, false)?.text).toBe('Two corners are in the same place.');
    expect(localFault([[0, 0], [1, 0], [10, 10]], rules, true)?.text).toBe('The corners are too close together.');
    expect(localFault([[0, 0], [10, 10], [10, 0], [0, 10]], rules, true)?.text).toBe('The boundary crosses itself.');
  });

  it('refuses an edge that doubles back over the one before it', () => {
    expect(localFault([[0, 0], [10, 0], [5, 0]], rules, false)?.text).toBe('An edge doubles back over another.');
  });

  it('does not judge the edge that is not drawn yet in a shape that is still open', () => {
    // 0,0 -> 10,0 -> 10,10 -> 5,5 crosses nothing yet; closing it back to 0,0 is not drawn.
    expect(localFault([[0, 0], [10, 0], [10, 10]], rules, false)).toBeNull();
  });
});

describe('the colour of a shape', () => {
  const ok = { ok: true, status: 'available' } as LandPreview;
  it('is red for a fault, amber while waiting or short of Auren, green when it can be bought', () => {
    expect(verdictOf({ text: 'x' }, ok, 4)).toBe('bad');
    expect(verdictOf(null, null, 2)).toBe('idle');
    expect(verdictOf(null, null, 4)).toBe('warn');
    expect(verdictOf(null, { ok: false, status: 'funds' } as LandPreview, 4)).toBe('warn');
    expect(verdictOf(null, { ok: false, status: 'overlap' } as LandPreview, 4)).toBe('bad');
    expect(verdictOf(null, { ok: false, status: 'protected' } as LandPreview, 4)).toBe('bad');
    expect(verdictOf(null, ok, 4)).toBe('good');
  });
});

describe('how straight the corners are', () => {
  it('knows a rectangle: four square corners, each with a tick, and its size as the server counts it', () => {
    const s = straightness(rect(0, 0, 19, 13), true);
    expect(s.kind).toBe('rectangle');
    expect(s.ticks).toHaveLength(4);
    expect(s.straight).toBe(4);
    expect([s.width, s.depth]).toEqual([20, 14]);
    expect(isPerfect(s)).toBe(true);
    expect(straightText(s, true, [])).toBe('Perfect rectangle, 20 x 14');
  });

  it('calls it a square when it is as wide as it is deep', () => {
    const s = straightness(rect(5, 5, 20, 20), true);
    expect(s.kind).toBe('square');
    expect(straightText(s, true, [])).toBe('Perfect square, 16 x 16');
    expect(straightText(s, false, [])).toBe('This corner makes a perfect square: 16 x 16');
  });

  it('is not perfect when one corner is a block off, and says how many edges are still straight', () => {
    const s = straightness([[0, 0], [19, 0], [19, 13], [1, 13]], true);
    expect(s.kind).toBe('free');
    expect(s.ticks).toHaveLength(2);
    expect(s.edges).toEqual([true, true, true, false]);
    expect(isPerfect(s)).toBe(false);
    expect(straightText(s, true, [])).toBe('Straight edges: 3 of 4');
  });

  it('gives no tick to a corner that turns a diagonal, nor to one where two edges go on the same way', () => {
    expect(straightness([[0, 0], [10, 10], [20, 0]], true).ticks).toHaveLength(0);
    const s = straightness([[0, 0], [10, 0], [20, 0], [20, 10], [0, 10]], true);
    expect(s.ticks.map((t) => t.at)).toEqual([[0, 0], [20, 0], [20, 10], [0, 10]]);
    // (A corner more along an edge does not make it any less a rectangle.)
    expect(s.kind).toBe('rectangle');
  });

  it('calls an L straight, but not perfect', () => {
    const l: Corner[] = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
    const s = straightness(l, true);
    expect(s.kind).toBe('straight');
    expect(s.ticks).toHaveLength(6);
    expect(isPerfect(s)).toBe(false);
    expect(straightText(s, true, [])).toBe('Straight edges, square corners');
  });

  it('gives a corner of an open shape no tick at its ends', () => {
    expect(straightness([[0, 0], [10, 0], [10, 10]], false).ticks).toHaveLength(1);
    expect(straightness([[0, 0], [10, 0]], false).ticks).toHaveLength(0);
  });

  it('finds the corners the crosshair is in line with, not the ones it is on or off', () => {
    const pts: Corner[] = [[0, 0], [20, 0], [20, 12]];
    expect(inLineWith([0, 12], pts)).toEqual([0, 2]);
    expect(inLineWith([20, 12], pts, 2)).toEqual([1]);
    expect(inLineWith([7, 7], pts)).toEqual([]);
    expect(straightText(straightness([[0, 0], [20, 0]], false), false, [0])).toBe('In line with corner 1');
  });
});