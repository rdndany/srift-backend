import { describe, expect, it } from 'vitest';
import { mageLook } from './mageLook';
import { rangerLook } from './rangerLook';
import { NUDGE, NUDGE_FEET, U, type Piece } from './sculptGear';
import { warriorLook } from './warriorLook';

/**
 * Two faces that look the same way, lie on the same plane and share some area are drawn in the same place: they flicker as the figure moves
 * (z-fighting). Finds them between the blocks of a look and the boxes of the skin (the base layer, and the outer layer a hair's breadth bigger).
 */
type Face = { axis: 0 | 1 | 2; dir: 1 | -1; plane: number; a0: number; a1: number; b0: number; b1: number; what: string };

const PIVOT: Record<string, [number, number, number]> = {
  head: [0, 1.65, 0],
  torso: [0, 0, 0],
  armL: [-0.375, 1.5, 0],
  armR: [0.375, 1.5, 0],
  legL: [-0.125, 0.75, 0],
  legR: [0.125, 0.75, 0],
};
/** The skin boxes: centre and size in blocks, the same as in `Character`. */
const SKIN: [string, [number, number, number], [number, number, number]][] = [
  ['head', [0, 1.75, 0], [0.5, 0.5, 0.5]],
  ['body', [0, 1.125, 0], [0.5, 0.75, 0.25]],
  ['armL', [-0.375, 1.125, 0], [0.25, 0.75, 0.25]],
  ['armR', [0.375, 1.125, 0], [0.25, 0.75, 0.25]],
  ['legL', [-0.125, 0.375, 0], [0.25, 0.75, 0.25]],
  ['legR', [0.125, 0.375, 0], [0.25, 0.75, 0.25]],
];

function boxFaces(what: string, c: [number, number, number], s: [number, number, number]): Face[] {
  const out: Face[] = [];
  for (const axis of [0, 1, 2] as const) {
    const [u, v] = ([0, 1, 2] as const).filter((k) => k !== axis);
    for (const dir of [1, -1] as const) out.push({ axis, dir, plane: c[axis] + (dir * s[axis]) / 2, a0: c[u]! - s[u]! / 2, a1: c[u]! + s[u]! / 2, b0: c[v]! - s[v]! / 2, b1: c[v]! + s[v]! / 2, what });
  }
  return out;
}

function lookFaces(look: Piece[]): Face[] {
  const out: Face[] = [];
  for (const p of look) {
    if (p.slot === 'cape') continue;
    const piv = PIVOT[p.part as string]!;
    const n = NUDGE[p.part as string]!;
    const f = p.slot === 'feet' ? NUDGE_FEET : [0, 0, 0];
    const at = [piv[0] + n[0] + f[0]!, piv[1] + n[1] + f[1]!, piv[2] + n[2] + f[2]!];
    for (const b of p.bricks) {
      const mask = b[8] ?? 63;
      const c = [b[0]! + at[0]!, b[1]! + at[1]!, b[2]! + at[2]!] as [number, number, number];
      boxFaces(`${p.slot}/${String(p.part)}`, c, [U, U, U]).forEach((fc, i) => {
        // (the order of boxFaces is x+, x-, y+, y-, z+, z-: the same as the bits of the mask)
        if (mask & (1 << i)) out.push(fc);
      });
    }
  }
  return out;
}

function skinFaces(): Face[] {
  return SKIN.flatMap(([name, c, s]) => [...boxFaces(`skin ${name}`, c, s), ...boxFaces(`skin ${name} outer`, c, [s[0] + 0.0375, s[1] + 0.0375, s[2] + 0.0375])]);
}

/** The pairs of faces on one plane (closer than `eps`) that overlap by more than a sliver. */
function clashes(a: Face[], b: Face[], eps: number): string[] {
  const found = new Set<string>();
  const byKey = new Map<string, Face[]>();
  const key = (f: Face, q: number): string => `${f.axis}${f.dir}${q}`;
  for (const f of b) {
    const q = Math.round(f.plane / eps);
    const k = key(f, q);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(f);
  }
  for (const f of a) {
    const q = Math.round(f.plane / eps);
    for (const dq of [-1, 0, 1]) {
      for (const g of byKey.get(key(f, q + dq)) ?? []) {
        if (g === f || Math.abs(g.plane - f.plane) >= eps) continue;
        const area = Math.max(0, Math.min(f.a1, g.a1) - Math.max(f.a0, g.a0)) * Math.max(0, Math.min(f.b1, g.b1) - Math.max(f.b0, g.b0));
        if (area > U * U * 0.2) found.add(`${f.what} vs ${g.what}: axis ${f.axis} dir ${f.dir} plane ${f.plane.toFixed(4)}`);
      }
    }
  }
  return [...found];
}

describe.each([['Warrior', warriorLook], ['Mage', mageLook], ['Ranger', rangerLook]] as const)('the %s does not flicker', (_name, look) => {
  it('has no face on the plane of a face of the skin', () => {
    expect(clashes(lookFaces(look()), skinFaces(), 0.0006)).toEqual([]);
  });

  it('has no face on the plane of a face of another piece', () => {
    const faces = lookFaces(look());
    // (Faces of different pieces only: the cubes of one piece tile each other without overlapping.)
    expect(clashes(faces.filter((f) => !f.what.includes('cape')), faces.filter((f) => !f.what.includes('cape')), 0.0006).filter((c) => { const [x, y] = c.split(' vs '); return x!.split(':')[0] !== y!.split(':')[0]; })).toEqual([]);
  });

  it('does not put a block of the body into the head', () => {
    // The head, with its outer layer: a block of the torso, an arm or a leg that went into it would show through the hair and the face.
    const inside: string[] = [];
    for (const p of look()) {
      if (p.slot === 'cape' || p.part === 'head') continue;
      const piv = PIVOT[p.part as string]!;
      for (const b of p.bricks) {
        const x = b[0]! + piv[0];
        const y = b[1]! + piv[1];
        const z = b[2]! + piv[2];
        const h = U / 2 - 0.0005;
        if (Math.abs(x) < 0.26875 + h && Math.abs(z) < 0.26875 + h && y > 1.5 - h && y < 2.01875 + h) inside.push(`${p.slot}/${String(p.part)} ${(x / U).toFixed(1)},${(y / U).toFixed(1)},${(z / U).toFixed(1)}`);
      }
    }
    expect(inside).toEqual([]);
  });
});