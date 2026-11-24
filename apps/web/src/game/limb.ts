import * as THREE from 'three';

/**
 * An arm or a leg that bends: the part of the figure hanging from the shoulder or the hip, with a lower part (`shin`: the forearm, the shin) that turns about
 * the elbow or the knee, half way down.
 *
 * Everything is written in the space of the whole limb (a leg is 0.75 long from the hip, a pivot at its top; the boot is at -0.7), as it was before the limb bent:
 * what is added to a limb below the joint (a boot, a vambrace, a ring at the wrist) is taken into the lower part, and a mesh that is made of many blocks
 * (a robe, an armor set) is cut at the joint, whole blocks to the side their middle is on (see `addToLimb`). So nothing that dresses a limb needs to know it bends.
 *
 * The hinge is on the edge of the limb where the bend opens a gap if it is at the middle: the knee turns about its front edge, the elbow about its back edge, so
 * the front of the knee and the back of the elbow stay closed and the other side folds into the upper part, where it is hidden.
 */

/** Where the joint is, below the pivot of the limb. */
export const JOINT_Y = -0.375;

/** A piece whose middle is this far below the joint belongs to the lower part (one across the joint stays with the upper one, which is the one that does not turn). */
const BELOW = 0.02;

export class Limb extends THREE.Group {
  /** The lower part: turn it about x to bend the joint. */
  readonly shin = new THREE.Group();

  /** `hinge` is the z of the edge the joint turns about (-0.125 for a leg: its front, +0.125 for an arm: its back). */
  constructor(readonly hinge: number) {
    super();
    this.shin.position.set(0, JOINT_Y, hinge);
    super.add(this.shin);
  }

  /** Whether something at `y` in the space of the whole limb is on the lower part. */
  below(y: number): boolean {
    return y < JOINT_Y - BELOW;
  }

  /** Put an object (already placed, in the space of the whole limb) on the lower part, keeping its place. */
  addLower(o: THREE.Object3D): void {
    o.position.y -= JOINT_Y;
    o.position.z -= this.hinge;
    this.shin.add(o);
  }

  /** Put an object on the upper part, whatever its place (a shield that is moved about in the space of the whole arm). */
  addUpper(o: THREE.Object3D): void {
    super.add(o);
  }

  /** Bend the joint: `a` radians, positive bends it the way a knee or an elbow goes (the leg folds back, the arm forward). */
  bend(a: number): void {
    this.shin.rotation.x = this.hinge < 0 ? -a : a;
  }

  override add(...objects: THREE.Object3D[]): this {
    for (const o of objects) {
      if (o !== this.shin && o.parent !== this && this.below(o.position.y)) this.addLower(o);
      else super.add(o);
    }
    return this;
  }

  override remove(...objects: THREE.Object3D[]): this {
    for (const o of objects) {
      if (o.parent === this.shin) this.shin.remove(o);
      else super.remove(o);
    }
    return this;
  }
}

/** A copy of the vertices of `geo` that `keep` says yes to, with the triangles that are made of them. */
function subset(geo: THREE.BufferGeometry, keep: Uint8Array): THREE.BufferGeometry {
  const count = geo.getAttribute('position').count;
  const remap = new Int32Array(count).fill(-1);
  let n = 0;
  for (let i = 0; i < count; i++) if (keep[i]) remap[i] = n++;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(name) as THREE.BufferAttribute;
    const size = attr.itemSize;
    const arr = new (attr.array.constructor as new (n: number) => THREE.TypedArray)(n * size);
    for (let i = 0; i < count; i++) {
      const to = remap[i];
      if (to < 0) continue;
      for (let k = 0; k < size; k++) arr[to * size + k] = attr.array[i * size + k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, attr.normalized));
  }
  const src = geo.index;
  const tris: number[] = [];
  const total = src ? src.count : count;
  for (let i = 0; i < total; i += 3) {
    const a = src ? src.getX(i) : i;
    const b = src ? src.getX(i + 1) : i + 1;
    const c = src ? src.getX(i + 2) : i + 2;
    if (remap[a] >= 0 && remap[b] >= 0 && remap[c] >= 0) tris.push(remap[a], remap[b], remap[c]);
  }
  out.setIndex(tris);
  out.computeBoundingSphere();
  return out;
}

/**
 * Cut a finished shape of blocks at the joint. A shape of boxes (24 vertices each) goes box by box, by the middle of each; a sculpture (cubes drawn face by
 * face, with a `base` colour) face by face; anything else (a shape with several materials, or of an unknown make) whole, by its own middle.
 * Returns what is above and what is below (null: nothing), the lower one already moved to the space of the lower part.
 */
export function splitAtJoint(limb: Limb, geo: THREE.BufferGeometry): { upper: THREE.BufferGeometry | null; lower: THREE.BufferGeometry | null } {
  const pos = geo.getAttribute('position');
  const count = pos.count;
  const unit = geo.getAttribute('base') ? 4 : geo.groups.length === 0 && count % 24 === 0 ? 24 : count;
  const low = new Uint8Array(count);
  let lower = 0;
  for (let u = 0; u < count; u += unit) {
    let y = 0;
    for (let i = u; i < u + unit; i++) y += pos.getY(i);
    if (limb.below(y / unit)) {
      low.fill(1, u, u + unit);
      lower += unit;
    }
  }
  const move = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(0, -JOINT_Y, -limb.hinge);
  if (lower === 0) return { upper: geo, lower: null };
  if (lower === count) return { upper: null, lower: move(geo) };
  const up = new Uint8Array(count);
  for (let i = 0; i < count; i++) up[i] = low[i] ? 0 : 1;
  const out = { upper: subset(geo, up), lower: move(subset(geo, low)) };
  geo.dispose();
  return out;
}

/**
 * Put a finished shape on a part of the body as meshes: on a limb it is cut at the joint (the lower part's mesh is the other's `userData.twin`, so whatever shows
 * or hides the one does the other), on any other part it is one mesh. Every mesh made is told to `made` (to take off again), and so is every shape (to free).
 * Returns the mesh to count as the shape's own (the upper one).
 */
export function addToLimb(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  made: (mesh: THREE.Mesh, geo: THREE.BufferGeometry) => void,
): THREE.Mesh {
  if (!(parent instanceof Limb)) {
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
    made(mesh, geo);
    return mesh;
  }
  const { upper, lower } = splitAtJoint(parent, geo);
  let first: THREE.Mesh | null = null;
  if (upper) {
    first = new THREE.Mesh(upper, mat);
    parent.add(first);
    made(first, upper);
  }
  if (lower) {
    const mesh = new THREE.Mesh(lower, mat);
    parent.shin.add(mesh);
    made(mesh, lower);
    if (first) first.userData.twin = mesh;
    else first = mesh;
  }
  return first!;
}
