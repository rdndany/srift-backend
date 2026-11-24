import { segmentsTouch, type LandPublicConfig, type LandPreview } from '@solrift/shared';

/**
 * The corners a player has marked with the Land Surveyor, before anything is asked of the server. This is only the player's own drawing:
 * the price, the verdict and the purchase are all the server's (see landService.ts). What is checked here is what can be seen at once
 * (two corners on one block, an edge too short, a boundary that crosses itself), so the shape turns red without a round trip.
 */
export type Corner = [number, number];

export type Rules = Pick<LandPublicConfig, 'minEdge' | 'minCorners' | 'maxCorners'>;

export interface Fault {
  /** What is wrong, in words for the player. */
  text: string;
  /** The corner it is at, when it is at one. */
  at?: number;
}

const cross = (a: Corner, b: Corner, c: Corner): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** The first thing wrong with a shape that is still drawn (an open shape is judged as it stands: its closing edge is not drawn yet), or null. */
export function localFault(pts: readonly Corner[], rules: Rules, closed: boolean): Fault | null {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pts[i][0] === pts[j][0] && pts[i][1] === pts[j][1]) return { text: 'Two corners are in the same place.', at: j };
    }
  }
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < rules.minEdge) return { text: 'The corners are too close together.', at: (i + 1) % n };
  }
  for (let i = 0; i < edges; i++) {
    for (let j = i + 1; j < edges; j++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const c = pts[j];
      const d = pts[(j + 1) % n];
      const adjacent = j === i + 1 || (closed && i === 0 && j === edges - 1);
      if (adjacent) {
        // Neighbours share a corner. They only do wrong by doubling back along each other.
        const shared = j === i + 1 ? b : a;
        const p = j === i + 1 ? a : b;
        const q = j === i + 1 ? d : c;
        if (cross(p, shared, q) === 0 && (shared[0] - p[0]) * (q[0] - shared[0]) + (shared[1] - p[1]) * (q[1] - shared[1]) < 0) return { text: 'An edge doubles back over another.', at: j };
        continue;
      }
      if (segmentsTouch(a, b, c, d)) return { text: 'The boundary crosses itself.', at: j };
    }
  }
  return null;
}

export type PlaceResult = 'added' | 'moved' | 'inserted' | 'full' | 'same' | 'closed';

/** How far (blocks) from an edge of a closed shape a click still takes hold of the edge to put a new corner in it. */
const EDGE_GRAB = 1.5;

function distToSegment(p: Corner, a: Corner, b: Corner): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** The corners being marked: placed, moved, taken back, closed. */
export class Markers {
  readonly corners: Corner[] = [];
  /** The shape is closed: the last corner joins the first, and the price is asked. */
  closed = false;
  /** The corner picked up to be put somewhere else, or -1. */
  grabbed = -1;
  /** The corner in hand was just put into an edge (not an old one picked up): taking it back removes it. */
  inserted = false;

  constructor(public rules: Rules) {}

  get count(): number {
    return this.corners.length;
  }

  /** The corner within `r` blocks of (x, z), the nearest, or -1. */
  nearest(x: number, z: number, r: number): number {
    let best = -1;
    let bestD = r * r;
    this.corners.forEach(([cx, cz], i) => {
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** A left click on the block (x, z): drops a corner picked up before, picks one up when the click is on it, or marks a new one. */
  place(x: number, z: number): PlaceResult {
    if (this.grabbed >= 0) {
      const i = this.grabbed;
      this.grabbed = -1;
      this.inserted = false;
      if (this.corners.some(([cx, cz], k) => k !== i && cx === x && cz === z)) return 'same';
      this.corners[i] = [x, z];
      return 'moved';
    }
    if (this.closed) {
      // A closed shape is reopened by taking a corner of it: this picks one up.
      const at = this.nearest(x, z, 0.5);
      if (at >= 0) {
        this.grabbed = at;
        return 'moved';
      }
      // A click on an edge puts a new corner in it (to grow a claim round a bend): it is picked up at once, to be dropped where it should be.
      if (this.corners.length < this.rules.maxCorners) {
        let edge = -1;
        let best = EDGE_GRAB;
        for (let i = 0; i < this.corners.length; i++) {
          const d = distToSegment([x, z], this.corners[i], this.corners[(i + 1) % this.corners.length]);
          if (d <= best) {
            best = d;
            edge = i;
          }
        }
        if (edge >= 0) {
          this.corners.splice(edge + 1, 0, [x, z]);
          this.grabbed = edge + 1;
          this.inserted = true;
          return 'inserted';
        }
      }
      return 'closed';
    }
    const at = this.nearest(x, z, 0.5);
    if (at >= 0) {
      this.grabbed = at;
      return 'moved';
    }
    if (this.corners.length >= this.rules.maxCorners) return 'full';
    this.corners.push([x, z]);
    return 'added';
  }

  /** A right click: the corner under the crosshair is taken away, or else the last one placed. A corner that is held is put back where it was. */
  undo(x?: number, z?: number): boolean {
    if (this.grabbed >= 0) {
      // A corner that was only just put into an edge goes away again; one that was picked up goes back where it was.
      if (this.inserted) this.corners.splice(this.grabbed, 1);
      this.grabbed = -1;
      this.inserted = false;
      return true;
    }
    if (this.corners.length === 0) return false;
    const at = x === undefined || z === undefined ? -1 : this.nearest(x, z, 0.5);
    this.corners.splice(at >= 0 ? at : this.corners.length - 1, 1);
    if (this.corners.length < this.rules.minCorners) this.closed = false;
    return true;
  }

  /** E: close the shape (when it has enough corners and none is wrong). */
  close(): boolean {
    if (this.closed) return true;
    if (this.corners.length < this.rules.minCorners || this.grabbed >= 0) return false;
    if (localFault(this.corners, this.rules, true)) return false;
    this.closed = true;
    return true;
  }

  reopen(): void {
    this.closed = false;
  }

  clear(): void {
    this.corners.length = 0;
    this.closed = false;
    this.grabbed = -1;
    this.inserted = false;
  }

  /** The shape as it would be sent, with the block the crosshair is on as one more corner while the shape is open (the live price). */
  shape(aim: Corner | null): Corner[] {
    const pts = this.corners.map((c): Corner => [c[0], c[1]]);
    if (this.grabbed >= 0 && aim) pts[this.grabbed] = aim;
    else if (!this.closed && aim && this.grabbed < 0 && pts.length < this.rules.maxCorners && !pts.some(([x, z]) => x === aim[0] && z === aim[1])) pts.push(aim);
    return pts;
  }
}

/**
 * How straight a shape is, for the marks that tell the player the corners are true: an edge is straight when it runs exactly along the
 * x or the z axis, a corner is square when a straight edge along x meets a straight edge along z. A closed shape with straight edges that turns four times is a
 * rectangle (a corner more along an edge does not change that) (a square when it is as wide as it is deep). This is only what is drawn; the server does not ask for it.
 */
export type StraightKind = 'square' | 'rectangle' | 'straight' | 'free';

/** A square corner: where it is, and the corners at the far end of the two edges that meet there. */
export interface RightAngle {
  at: Corner;
  a: Corner;
  b: Corner;
}

export interface Straightness {
  /** Edge i runs from corner i to corner i+1 (the last one back to the first when closed): true when it is straight. */
  edges: boolean[];
  /** The square corners (a corner of a shape that is still open has two edges only when it is not the first or the last). */
  ticks: RightAngle[];
  kind: StraightKind;
  /** The blocks across (x) and down (z) the box of the shape, the marked ones included (as the server counts them). */
  width: number;
  depth: number;
  /** How many edges are straight, of how many. */
  straight: number;
  total: number;
}

export function straightness(pts: readonly Corner[], closed: boolean): Straightness {
  const n = pts.length;
  const total = n < 2 ? 0 : closed ? n : n - 1;
  const horizontal = (a: Corner, b: Corner): boolean => a[1] === b[1] && a[0] !== b[0];
  const vertical = (a: Corner, b: Corner): boolean => a[0] === b[0] && a[1] !== b[1];
  const edges: boolean[] = [];
  for (let i = 0; i < total; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    edges.push(horizontal(a, b) || vertical(a, b));
  }
  const ticks: RightAngle[] = [];
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = pts[(i + n - 1) % n];
    const at = pts[i];
    const b = pts[(i + 1) % n];
    if ((horizontal(a, at) && vertical(at, b)) || (vertical(a, at) && horizontal(at, b))) ticks.push({ at, a, b });
  }
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const width = n ? x1 - x0 + 1 : 0;
  const depth = n ? z1 - z0 + 1 : 0;
  const straight = edges.filter(Boolean).length;
  let kind: StraightKind = 'free';
  if (closed && n >= 3 && straight === total) {
    kind = ticks.length === 4 ? (width === depth ? 'square' : 'rectangle') : 'straight';
  }
  return { edges, ticks, kind, width, depth, straight, total };
}

/** The corners that `at` is in line with: the ones on the same x (a line running along z) and on the same z (a line running along x). */
export function inLineWith(at: Corner, pts: readonly Corner[], skip = -1): number[] {
  const out: number[] = [];
  pts.forEach((p, i) => {
    if (i === skip) return;
    if ((p[0] === at[0]) !== (p[1] === at[1])) out.push(i);
  });
  return out;
}

/** A perfect shape: a rectangle or a square with every corner square. */
export const isPerfect = (s: Straightness): boolean => s.kind === 'rectangle' || s.kind === 'square';

/** What to tell the player of how straight the shape is (null: nothing worth saying). inLine are the corners the crosshair is in line with. */
export function straightText(s: Straightness, closed: boolean, inLine: readonly number[]): string | null {
  if (isPerfect(s)) return closed ? `Perfect ${s.kind}, ${s.width} x ${s.depth}` : `This corner makes a perfect ${s.kind}: ${s.width} x ${s.depth}`;
  if (inLine.length > 0) return `In line with corner ${inLine.slice(0, 2).map((i) => i + 1).join(' and ')}`;
  if (s.kind === 'straight') return 'Straight edges, square corners';
  if (s.total >= 3 && s.straight > 0) return `Straight edges: ${s.straight} of ${s.total}`;
  return null;
}

/** What colour a shape is drawn: green when the land can be bought, amber when it is fine but cannot be paid or has to wait, red when it cannot be claimed. */
export type Verdict = 'good' | 'warn' | 'bad' | 'idle';

export function verdictOf(fault: Fault | null, preview: LandPreview | null, count: number): Verdict {
  if (fault) return 'bad';
  if (count < 3) return 'idle';
  if (!preview) return 'warn';
  if (preview.ok) return 'good';
  return preview.status === 'funds' || preview.status === 'far' || preview.status === 'nosurveyor' ? 'warn' : 'bad';
}
