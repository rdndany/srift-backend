import { describe, expect, it } from 'vitest';
import { DEFAULT_LAND_CONFIG, analyzePolygon, eachCell, pointInPolygon, polygonContains, polygonHas, polygonNear, segmentsTouch, type Pt } from './index';

const cfg = DEFAULT_LAND_CONFIG;
const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const ok = (pts: unknown) => {
  const r = analyzePolygon(pts, cfg);
  if (!r.ok) throw new Error(`expected a claim, got ${r.fault}`);
  return r.polygon;
};
const fault = (pts: unknown, maxArea?: number) => {
  const r = analyzePolygon(pts, cfg, maxArea);
  return r.ok ? null : r.fault;
};

describe('the shape of a claim', () => {
  it('claims every block of a rectangle, the marked ones included', () => {
    const p = ok(rect(0, 0, 9, 9));
    expect(p.area).toBe(100);
    expect(polygonHas(p, 0, 0)).toBe(true);
    expect(polygonHas(p, 9, 9)).toBe(true);
    expect(polygonHas(p, 10, 5)).toBe(false);
    expect(polygonHas(p, -1, 5)).toBe(false);
  });

  it('works for a triangle', () => {
    const p = ok([
      [0, 0],
      [20, 0],
      [0, 20],
    ]);
    // Blocks on or under the slanting edge.
    expect(polygonHas(p, 0, 0)).toBe(true);
    expect(polygonHas(p, 10, 10)).toBe(true);
    expect(polygonHas(p, 11, 10)).toBe(false);
    expect(polygonHas(p, 19, 19)).toBe(false);
    expect(p.area).toBe(231);
  });

  it('works for a concave polygon, and leaves the notch out', () => {
    // An L: 20 x 20 with the top right 10 x 10 cut out.
    const p = ok([
      [0, 0],
      [19, 0],
      [19, 9],
      [9, 9],
      [9, 19],
      [0, 19],
    ]);
    expect(polygonHas(p, 5, 15)).toBe(true);
    expect(polygonHas(p, 15, 5)).toBe(true);
    expect(polygonHas(p, 15, 15)).toBe(false);
    expect(p.area).toBe(20 * 10 + 10 * 10 - 0 /* the corner block is counted once */ - 0 + 0 - 0);
  });

  it('works for an irregular polygon with many corners', () => {
    const p = ok([
      [0, 0],
      [10, -3],
      [22, 2],
      [26, 12],
      [18, 22],
      [6, 24],
      [-4, 14],
    ]);
    expect(polygonHas(p, 12, 10)).toBe(true);
    expect(polygonHas(p, 40, 10)).toBe(false);
    expect(p.area).toBeGreaterThan(300);
  });

  it('counts the same blocks wherever it stands, and across chunk borders', () => {
    const a = ok(rect(0, 0, 14, 14));
    const b = ok(rect(-8, -8, 6, 6)); // crosses four chunks
    const c = ok(rect(100_000, -100_000, 100_014, -99_986));
    expect(a.area).toBe(225);
    expect(b.area).toBe(225);
    expect(c.area).toBe(225);
    let n = 0;
    eachCell(b, () => n++);
    expect(n).toBe(225);
  });

  it('is exact on the edge: a block on the boundary of a slanting edge is in, the one beside it is out', () => {
    const tri: Pt[] = [
      [0, 0],
      [12, 0],
      [0, 12],
    ];
    expect(pointInPolygon(tri, 6, 6)).toBe(true);
    expect(pointInPolygon(tri, 7, 6)).toBe(false);
    expect(pointInPolygon(tri, 0, 12)).toBe(true);
    expect(pointInPolygon(tri, 0, 13)).toBe(false);
  });
});

describe('what is refused', () => {
  it('fewer than 3 corners, more than the limit, and things that are not corners', () => {
    expect(fault([[0, 0], [10, 0]])).toBe('count');
    expect(fault(Array.from({ length: cfg.maxCorners + 1 }, (_, i) => [i * 5, (i % 2) * 5]))).toBe('count');
    expect(fault('hello')).toBe('format');
    expect(fault(null)).toBe('format');
    expect(fault([[0, 0], [10, 0], 'x'])).toBe('format');
    expect(fault([[0, 0], [10, 0], [10]])).toBe('format');
  });

  it('coordinates that are not whole numbers, or are out of range', () => {
    expect(fault([[0, 0], [10.5, 0], [10, 10], [0, 10]])).toBe('coords');
    expect(fault([[0, 0], [NaN, 0], [10, 10], [0, 10]])).toBe('coords');
    expect(fault([[0, 0], [Infinity, 0], [10, 10], [0, 10]])).toBe('coords');
    expect(fault([[0, 0], [10, 0], [10, 10], [0, '10']])).toBe('coords');
    expect(fault(rect(cfg.coordLimit, 0, cfg.coordLimit + 10, 10))).toBe('coords');
    expect(fault(rect(0, 0, 9, 9))).toBeNull();
  });

  it('duplicate corners', () => {
    expect(fault([[0, 0], [10, 0], [10, 10], [10, 0], [0, 10]])).toBe('duplicate');
  });

  it('corners that are too close, so tiny edges cannot be used to cheat', () => {
    expect(fault([[0, 0], [1, 0], [10, 10], [0, 10]])).toBe('short_edge');
    expect(fault([[0, 0], [20, 0], [20, 1], [0, 10]])).toBe('short_edge');
  });

  it('a boundary that crosses itself (a bow tie), touches itself, or doubles back', () => {
    expect(fault([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe('self_intersect');
    // A corner that lands on an edge that is not its own.
    expect(fault([[0, 0], [20, 0], [20, 20], [10, 0], [0, 20]])).toBe('self_intersect');
    // An edge that runs back over the one before it.
    expect(fault([[0, 0], [20, 0], [10, 0], [10, 10]])).toBe('fold');
  });

  it('corners in a line, and shapes with no area', () => {
    expect(fault([[0, 0], [10, 10], [20, 20]])).not.toBeNull();
    expect(fault([[0, 0], [10, 0], [20, 0], [30, 0]])).not.toBeNull();
  });

  it('too small, too spread out, and too large for the limit', () => {
    expect(fault(rect(0, 0, 4, 4))).toBe('too_small');
    expect(fault(rect(0, 0, cfg.maxSpan, 10))).toBe('too_wide');
    expect(fault(rect(0, 0, 59, 59))).toBe('too_large');
    expect(fault(rect(0, 0, 59, 59), 4000)).toBeNull();
    expect(fault(rect(0, 0, 19, 19), 100)).toBe('too_large');
  });

  it('narrow strips, straight and slanting, which would wall off a road', () => {
    expect(fault(rect(0, 0, 3, 60))).toBe('narrow');
    expect(fault(rect(0, 0, 60, 3))).toBe('narrow');
    expect(fault([[0, 0], [4, 0], [60, 56], [56, 60]])).toBe('narrow');
    // Five blocks wide is the least that is accepted.
    expect(fault(rect(0, 0, 4, 40))).toBeNull();
  });

  it('a thin sliver sticking out of a good claim does not hide behind the good part', () => {
    const shape: Pt[] = [
      [0, 0],
      [9, 0],
      [9, 4],
      [90, 4],
      [90, 7],
      [9, 7],
      [9, 10],
      [0, 10],
    ];
    expect(fault(shape)).toBe('narrow');
  });
});

describe('asking about a claim', () => {
  const p = ok(rect(10, 10, 29, 29));
  it('answers in constant time from the mask', () => {
    expect(polygonHas(p, 10, 10)).toBe(true);
    expect(polygonHas(p, 9, 10)).toBe(false);
    expect(polygonHas(p, 1_000_000, -1_000_000)).toBe(false);
  });
  it('knows what is near it', () => {
    expect(polygonNear(p, 8, 20, 2)).toBe(true);
    expect(polygonNear(p, 7, 20, 2)).toBe(false);
    expect(polygonNear(p, 20, 20, 0)).toBe(true);
  });
  it('tells whether one claim holds another (an expansion has to)', () => {
    expect(polygonContains(ok(rect(5, 5, 35, 35)), p)).toBe(true);
    expect(polygonContains(ok(rect(12, 12, 35, 35)), p)).toBe(false);
  });
  it('tells which segments touch', () => {
    expect(segmentsTouch([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    expect(segmentsTouch([0, 0], [10, 0], [0, 1], [10, 1])).toBe(false);
    expect(segmentsTouch([0, 0], [10, 0], [10, 0], [10, 10])).toBe(true);
    expect(segmentsTouch([0, 0], [10, 0], [5, 0], [15, 0])).toBe(true);
  });
});
