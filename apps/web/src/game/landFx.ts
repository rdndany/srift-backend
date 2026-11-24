import * as THREE from 'three';
import type { Corner, RightAngle, Verdict } from './landMarkers';

/**
 * What the Land Surveyor draws in the world: glowing stakes with a beam of light at every marked corner, and a wall of light along the
 * boundary that follows the ground. Everything here is made once, at the start, from a few materials that are only ever recoloured
 * (never replaced), and the whole group is in the scene from the first frame, so the loading screen's warm-up draws it with the
 * other things that are hidden: the first stake of the game costs no more than the hundredth.
 *
 * Nothing of it stays in the world when the Surveyor is put away: `frame` hides the group when it has nothing to show.
 */

/** Colours of what is drawn. */
export const LAND_COLORS = {
  good: new THREE.Color(0x4dff8f),
  warn: new THREE.Color(0xffc04a),
  bad: new THREE.Color(0xff4a4a),
  idle: new THREE.Color(0xbfe9ff),
  own: new THREE.Color(0x58f0a0),
  guild: new THREE.Color(0x5aa8ff),
  shared: new THREE.Color(0x4de8e0),
  other: new THREE.Color(0xff8a4a),
  gold: new THREE.Color(0xffd86a),
  /** The marks of a straight shape: white, so that they are never taken for a verdict. */
  guide: new THREE.Color(0xf4fbff),
} as const;

export type ClaimKind = 'mine' | 'guild' | 'shared' | 'other';

export const kindColor = (k: ClaimKind): THREE.Color => (k === 'mine' ? LAND_COLORS.own : k === 'guild' ? LAND_COLORS.guild : k === 'shared' ? LAND_COLORS.shared : LAND_COLORS.other);

const WALL_HEIGHT = 1.7;
const BEAM_HEIGHT = 46;
/** Most samples one ribbon holds (a shape of 16 corners across the widest claim, with room). */
const RIBBON_SAMPLES = 6000;

const WALL_VERT = /* glsl */ `
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const WALL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float fall = pow(1.0 - vUv.y, 1.7);
  float flow = 0.62 + 0.38 * sin(vUv.x * 1.7 - uTime * 3.2);
  float base = exp(-vUv.y * 16.0);
  float a = (fall * 0.5 * flow + base * 0.95) * vColor.a * uIntensity;
  gl_FragColor = vec4(vColor.rgb * (1.0 + base * 0.8), a);
}`;

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BEAM_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uPulse;
varying vec2 vUv;
void main() {
  float up = pow(1.0 - vUv.y, 1.35);
  float shimmer = 0.78 + 0.22 * sin(vUv.y * 38.0 - uTime * 5.0);
  gl_FragColor = vec4(uColor * 1.25, up * shimmer * 0.62 * uPulse);
}`;

function glowMaterial(vert: string, frag: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

/** One mesh of walls of light: strips of ground-following samples, rebuilt in place (its buffers never grow). */
class Ribbon {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly pos = new Float32Array(RIBBON_SAMPLES * 2 * 3);
  private readonly uv = new Float32Array(RIBBON_SAMPLES * 2 * 2);
  private readonly col = new Float32Array(RIBBON_SAMPLES * 2 * 4);
  private readonly idx = new Uint32Array(RIBBON_SAMPLES * 6);
  private samples = 0;
  private tris = 0;
  private readonly geo = new THREE.BufferGeometry();

  constructor(
    private readonly time: THREE.IUniform<number>,
    private readonly height = WALL_HEIGHT,
  ) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.material = glowMaterial(WALL_VERT, WALL_FRAG, { uTime: time, uIntensity: { value: 1 }, uHeight: { value: height } });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    // One empty triangle, so that the warm-up draws something and the program is built (it draws nothing: all its points are one).
    this.geo.setDrawRange(0, 3);
  }

  begin(): void {
    this.samples = 0;
    this.tris = 0;
  }

  /** A strip along `pts` (x, y of the ground, z), `closed` joining the last back to the first, in `color` at brightness `alpha`. */
  strip(pts: readonly (readonly [number, number, number])[], color: THREE.Color, alpha: number, closed: boolean): void {
    const n = pts.length;
    if (n < 2) return;
    const total = closed ? n + 1 : n;
    let u = 0;
    let first = -1;
    let prev: readonly [number, number, number] | null = null;
    for (let k = 0; k < total; k++) {
      const p = pts[k % n];
      if (this.samples >= RIBBON_SAMPLES) return;
      if (prev) u += Math.hypot(p[0] - prev[0], p[2] - prev[2]);
      prev = p;
      const s = this.samples++;
      const v = s * 2;
      for (let h = 0; h < 2; h++) {
        const o = v + h;
        this.pos[o * 3] = p[0];
        this.pos[o * 3 + 1] = p[1] + h * this.height;
        this.pos[o * 3 + 2] = p[2];
        this.uv[o * 2] = u;
        this.uv[o * 2 + 1] = h;
        this.col[o * 4] = color.r;
        this.col[o * 4 + 1] = color.g;
        this.col[o * 4 + 2] = color.b;
        this.col[o * 4 + 3] = alpha;
      }
      if (first < 0) first = s;
      else {
        const a = (s - 1) * 2;
        const b = s * 2;
        const t = this.tris * 3;
        this.idx[t] = a;
        this.idx[t + 1] = a + 1;
        this.idx[t + 2] = b;
        this.idx[t + 3] = a + 1;
        this.idx[t + 4] = b + 1;
        this.idx[t + 5] = b;
        this.tris += 2;
      }
    }
  }

  end(): void {
    const at = (name: string): THREE.BufferAttribute => this.geo.getAttribute(name) as THREE.BufferAttribute;
    for (const name of ['position', 'uv', 'aColor']) {
      const a = at(name);
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.samples * 2 * a.itemSize);
    }
    const ix = this.geo.getIndex()!;
    ix.needsUpdate = true;
    ix.clearUpdateRanges();
    ix.addUpdateRange(0, this.tris * 3);
    this.geo.setDrawRange(0, this.tris * 3);
  }

  get empty(): boolean {
    return this.tris === 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

/** One stake: a post, a gem that turns above it, and a beam of light. Its colour is one of a few materials made at the start. */
class Stake {
  readonly group = new THREE.Group();
  readonly post: THREE.Mesh;
  readonly gem: THREE.Mesh;
  readonly beam: THREE.Mesh;
  /** Seconds since it was put in the ground (it rises out of it). */
  age = 9;
  color: Verdict | 'grab' = 'idle';

  constructor(parts: { post: THREE.BufferGeometry; gem: THREE.BufferGeometry; beam: THREE.BufferGeometry }, mats: StakeMaterials) {
    this.post = new THREE.Mesh(parts.post, mats.post.idle);
    this.post.position.y = 0.75;
    this.gem = new THREE.Mesh(parts.gem, mats.gem.idle);
    this.gem.position.y = 1.85;
    this.beam = new THREE.Mesh(parts.beam, mats.beam.idle);
    this.beam.position.y = BEAM_HEIGHT / 2;
    this.beam.renderOrder = 7;
    this.gem.renderOrder = 8;
    this.group.add(this.post, this.gem, this.beam);
    this.group.visible = false;
  }
}

type Tone = Verdict | 'grab' | 'gold';
interface StakeMaterials {
  post: Record<Tone, THREE.MeshBasicMaterial>;
  gem: Record<Tone, THREE.MeshBasicMaterial>;
  beam: Record<Tone, THREE.ShaderMaterial>;
}

const TONES: Tone[] = ['good', 'warn', 'bad', 'idle', 'grab', 'gold'];
const toneColor = (t: Tone): THREE.Color => (t === 'grab' ? new THREE.Color(0xffffff) : LAND_COLORS[t]);

/** A shape to draw. */
export interface ShapeDraw {
  /** The corners placed (the dragged one already where it is going). */
  corners: readonly Corner[];
  /** Where the crosshair is: the rubber band reaches it. Null when the shape is closed or nothing is aimed at. */
  aim: Corner | null;
  closed: boolean;
  verdict: Verdict;
  /** The corner picked up, or -1. */
  grabbed: number;
  /** What shows that the corners are true (see straightness), or nothing. */
  straight?: StraightDraw;
}

/** The marks of a straight shape: a square tick at each square corner, lines to the corners the crosshair is in line with, a white edge when it is perfect. */
export interface StraightDraw {
  ticks: readonly RightAngle[];
  /** The corners the crosshair is in line with (a line is drawn to each). */
  guides: readonly Corner[];
  /** Where the crosshair is (the lines start there). */
  from: Corner | null;
  /** The shape is a perfect rectangle or square: its edge is drawn in white as well. */
  outline: readonly Corner[] | null;
}

/** A claim near enough to be drawn while the Surveyor is in the hand. */
export interface ClaimDraw {
  id: string;
  vertices: readonly Corner[];
  kind: ClaimKind;
  /** The one the crosshair is on: drawn brighter. */
  focus: boolean;
}

export interface FxHooks {
  /** The ground under a column: the y of the top block. */
  groundY(x: number, z: number): number;
  /** A speck of light: where, how it moves, its life (s), size and colour. */
  mote?(x: number, y: number, z: number, vx: number, vy: number, vz: number, fall: number, life: number, size: number, r: number, g: number, b: number): void;
}

export class LandFx {
  readonly root = new THREE.Group();
  private readonly time: THREE.IUniform<number> = { value: 0 };
  private readonly working: Ribbon;
  private readonly claims: Ribbon;
  private readonly guides: Ribbon;
  private readonly stakes: Stake[] = [];
  private readonly mats: StakeMaterials;
  private readonly geos: THREE.BufferGeometry[];
  private clock = 0;
  private workingKey = '';
  private claimsKey = '';
  /** (Not '' at the start: the first frame empties the ribbon, which hides it, as the others are.) */
  private guidesKey = '\0';
  private rebuiltAt = -9;
  private celebration: { t: number; pts: Corner[]; sparkAt: number } | null = null;
  private shown = 0;

  constructor(private readonly hooks: FxHooks, maxCorners: number) {
    const post = new THREE.BoxGeometry(0.16, 1.5, 0.16);
    const gem = new THREE.OctahedronGeometry(0.28, 0);
    const beam = new THREE.CylinderGeometry(0.1, 0.17, BEAM_HEIGHT, 8, 1, true);
    this.geos = [post, gem, beam];
    const mk = <T>(f: (t: Tone) => T): Record<Tone, T> => Object.fromEntries(TONES.map((t) => [t, f(t)])) as Record<Tone, T>;
    this.mats = {
      post: mk((t) => new THREE.MeshBasicMaterial({ color: toneColor(t).clone().multiplyScalar(0.62) })),
      gem: mk((t) => new THREE.MeshBasicMaterial({ color: toneColor(t), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })),
      beam: mk((t) => glowMaterial(BEAM_VERT, BEAM_FRAG, { uTime: this.time, uColor: { value: toneColor(t) }, uPulse: { value: 1 } })),
    };
    this.working = new Ribbon(this.time);
    this.claims = new Ribbon(this.time);
    // The marks of a straight shape lie low on the ground (their light is the same as a wall's, only short).
    this.guides = new Ribbon(this.time, 0.9);
    this.guides.material.uniforms.uIntensity.value = 1.7;
    this.root.add(this.claims.mesh, this.guides.mesh, this.working.mesh);
    // One stake more than the corners: the one that shows where the next corner would go.
    for (let i = 0; i < maxCorners + 1; i++) {
      const s = new Stake({ post, gem, beam }, this.mats);
      this.stakes.push(s);
      this.root.add(s.group);
    }
    // In the scene from the start, hidden, with every material of its own in it: the warm-up draws all of it once.
    this.root.visible = false;
    this.root.frustumCulled = false;
    this.root.traverse((o) => {
      o.frustumCulled = false;
    });
    // (Colours are uniforms and vertex colours, never new materials, so the three programs built by the warm-up are all there will ever be.)
  }

  /** The moment of a purchase: the boundary and the corners light up gold, and light rises from the land. */
  celebrate(vertices: readonly Corner[]): void {
    this.celebration = { t: 0, pts: vertices.map((v): Corner => [v[0], v[1]]), sparkAt: 0 };
  }

  get celebrating(): boolean {
    return this.celebration !== null;
  }

  /**
   * One frame. `shape` is the shape being drawn (null: none), `claims` the land to outline, `fade` how strongly (0..1) the land of others shows.
   * Hides the whole group when there is nothing to draw, so that nothing of it is left in the world when the Surveyor is put away.
   */
  frame(dt: number, shape: ShapeDraw | null, claims: readonly ClaimDraw[]): void {
    this.clock += dt;
    this.time.value = this.clock;
    const celebrating = this.celebration !== null;
    if (!shape && claims.length === 0 && !celebrating) {
      if (this.root.visible) {
        this.root.visible = false;
        this.workingKey = '';
        this.claimsKey = '';
        this.guidesKey = '\0';
      }
      return;
    }
    this.root.visible = true;
    const gold = LAND_COLORS.gold;
    // The land round: rebuilt when it changes, and now and then (the ground it follows loads in).
    const stale = this.clock - this.rebuiltAt > 1.5;
    const ck = claims.map((c) => `${c.id}${c.focus ? '*' : ''}:${c.vertices.length}`).join('|');
    if (ck !== this.claimsKey || (stale && claims.length > 0)) {
      this.claimsKey = ck;
      this.claims.begin();
      for (const c of claims) this.claims.strip(this.sample(c.vertices, true), kindColor(c.kind), c.focus ? 1 : 0.55, true);
      this.claims.end();
    }
    this.claims.mesh.visible = !this.claims.empty;

    // The shape being marked (or, for a moment after a purchase, the claim just made, in gold).
    const cel = this.celebration;
    if (shape || cel) {
      const closed = cel ? true : shape!.closed;
      const laidPts: readonly Corner[] = cel ? cel.pts : shape!.corners;
      const aim = cel || shape!.grabbed >= 0 ? null : shape!.aim;
      const tone = cel ? gold : LAND_COLORS[shape!.verdict];
      const wk = `${laidPts.map((p) => `${p[0]},${p[1]}`).join(';')}|${closed ? 1 : 0}|${aim ? `${aim[0]},${aim[1]}` : ''}|${cel ? 'gold' : shape!.verdict}`;
      if (wk !== this.workingKey || stale) {
        this.workingKey = wk;
        this.rebuiltAt = this.clock;
        this.working.begin();
        if (closed) this.working.strip(this.sample(laidPts, true), tone, 1, true);
        else {
          // The edges laid are solid; the rubber band (to the crosshair, and from it back to the first corner) is dimmer.
          const laid = laidPts.length;
          if (laid >= 2) this.working.strip(this.sample(laidPts, false), tone, 1, false);
          if (aim && laid >= 1) {
            this.working.strip(this.sample([laidPts[laid - 1], aim], false), tone, 0.7, false);
            if (laid >= 2) this.working.strip(this.sample([aim, laidPts[0]], false), tone, 0.28, false);
          }
        }
        this.working.end();
      }
      this.working.mesh.visible = !this.working.empty;
    } else {
      this.working.mesh.visible = false;
      this.workingKey = '';
    }

    this.drawGuides(cel ? undefined : shape?.straight, stale);

    // The celebration: gold ribbons (the claim's own corners) and a rain of light over the land.
    if (this.celebration) {
      const c = this.celebration;
      c.t += dt;
      const k = Math.min(1, c.t / 2.6);
      this.working.material.uniforms.uIntensity.value = 1 + 1.6 * Math.sin(k * Math.PI);
      if (c.t - c.sparkAt > 0.05 && this.hooks.mote) {
        c.sparkAt = c.t;
        for (let n = 0; n < 4; n++) {
          const i = Math.floor(Math.random() * c.pts.length);
          const a = c.pts[i];
          const b = c.pts[(i + 1) % c.pts.length];
          const t = Math.random();
          const x = a[0] + (b[0] - a[0]) * t + 0.5;
          const z = a[1] + (b[1] - a[1]) * t + 0.5;
          const y = this.hooks.groundY(Math.floor(x), Math.floor(z)) + 1.2;
          this.hooks.mote(x, y, z, (Math.random() - 0.5) * 0.4, 1.8 + Math.random() * 2.2, (Math.random() - 0.5) * 0.4, -0.3, 1.2 + Math.random() * 0.9, 0.09 + Math.random() * 0.07, gold.r, gold.g, gold.b);
        }
      }
      if (c.t >= 2.6) {
        this.celebration = null;
        this.working.material.uniforms.uIntensity.value = 1;
        this.workingKey = '';
      }
    } else if (this.working.material.uniforms.uIntensity.value !== 1) this.working.material.uniforms.uIntensity.value = 1;

    // The stakes: one at each corner, and one where the next would go.
    const list: { c: Corner; tone: Tone; ghost: boolean }[] = [];
    if (this.celebration) for (const p of this.celebration.pts) list.push({ c: p, tone: 'gold', ghost: false });
    else if (shape) {
      shape.corners.forEach((p, i) => list.push({ c: p, tone: shape.grabbed === i ? 'grab' : shape.verdict, ghost: false }));
      if (shape.aim && !shape.closed && shape.grabbed < 0) list.push({ c: shape.aim, tone: shape.verdict, ghost: true });
    }
    const pulse = this.celebration ? 1.6 : 1;
    for (let i = 0; i < this.stakes.length; i++) {
      const s = this.stakes[i];
      const e = list[i];
      if (!e) {
        if (s.group.visible) s.group.visible = false;
        s.age = 0;
        continue;
      }
      if (!s.group.visible) {
        s.group.visible = true;
        s.age = 0;
      }
      s.age += dt;
      const x = e.c[0] + 0.5;
      const z = e.c[1] + 0.5;
      const y = this.hooks.groundY(e.c[0], e.c[1]) + 1;
      // Rising out of the ground, then settled; the ghost is dimmer.
      const rise = Math.min(1, s.age / 0.22);
      const out = 1 - (1 - rise) ** 3;
      s.group.position.set(x, y - (1 - out) * 1.2, z);
      s.post.visible = !e.ghost;
      s.gem.position.y = 1.85 + Math.sin(this.clock * 2.4 + i) * 0.08;
      s.gem.rotation.y = this.clock * 1.6 + i;
      s.gem.scale.setScalar(e.ghost ? 0.7 : 1 + 0.08 * Math.sin(this.clock * 4 + i));
      if (s.color !== e.tone) {
        s.color = e.tone as Verdict | 'grab';
        s.post.material = this.mats.post[e.tone];
        s.gem.material = this.mats.gem[e.tone];
        s.beam.material = this.mats.beam[e.tone];
      }
      (s.beam.material as THREE.ShaderMaterial).uniforms.uPulse.value = (e.ghost ? 0.4 : 1) * pulse;
    }
    this.shown = list.length;
  }

  /** The marks of a straight shape (rebuilt when they change, and now and then, as the ground loads). */
  private drawGuides(sg: StraightDraw | undefined, stale: boolean): void {
    const key = sg ? JSON.stringify([sg.ticks, sg.guides, sg.from, sg.outline]) : '';
    if (key === this.guidesKey && !(stale && key)) return;
    this.guidesKey = key;
    this.guides.begin();
    if (sg) {
      const white = LAND_COLORS.guide;
      if (sg.outline) this.guides.strip(this.sample(sg.outline, true), white, 0.85, true);
      for (const t of sg.ticks) {
        // The tick is the square corner itself: along one edge, across, and back along the other.
        const step = (p: Corner): [number, number] => [Math.sign(p[0] - t.at[0]), Math.sign(p[1] - t.at[1])];
        const [ax, az] = step(t.a);
        const [bx, bz] = step(t.b);
        const len = Math.min(Math.abs(t.a[0] - t.at[0]) + Math.abs(t.a[1] - t.at[1]), Math.abs(t.b[0] - t.at[0]) + Math.abs(t.b[1] - t.at[1]));
        const leg = Math.min(2, len - 1);
        if (leg < 1) continue;
        const p0: Corner = [t.at[0] + ax * leg, t.at[1] + az * leg];
        const p1: Corner = [t.at[0] + ax * leg + bx * leg, t.at[1] + az * leg + bz * leg];
        const p2: Corner = [t.at[0] + bx * leg, t.at[1] + bz * leg];
        this.guides.strip(this.sample([p0, p1, p2], false), white, sg.outline ? 1 : 0.8, false);
      }
      if (sg.from) for (const g of sg.guides) this.guides.strip(this.sample([sg.from, g], false), white, 0.42, false);
    }
    this.guides.end();
    this.guides.mesh.visible = !this.guides.empty;
  }

  /** The points of a boundary: one every block along each edge, on the ground (the top of the block), as [x, y, z]. */
  private sample(pts: readonly Corner[], closed: boolean): [number, number, number][] {
    const out: [number, number, number][] = [];
    const n = pts.length;
    const edges = closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const steps = Math.max(1, Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])));
      for (let s = 0; s < steps; s++) {
        const x = a[0] + ((b[0] - a[0]) * s) / steps;
        const z = a[1] + ((b[1] - a[1]) * s) / steps;
        out.push([x + 0.5, this.hooks.groundY(Math.round(x), Math.round(z)) + 1.04, z + 0.5]);
      }
    }
    if (!closed && n > 0) {
      const l = pts[n - 1];
      out.push([l[0] + 0.5, this.hooks.groundY(l[0], l[1]) + 1.04, l[1] + 0.5]);
    }
    return out;
  }

  /** How many stakes are standing (for tests and the readout). */
  get stakesShown(): number {
    return this.shown;
  }

  dispose(): void {
    this.working.dispose();
    this.claims.dispose();
    this.guides.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of Object.values(this.mats)) for (const x of Object.values(m)) (x as THREE.Material).dispose();
  }
}
