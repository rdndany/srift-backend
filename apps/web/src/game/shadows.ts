import * as THREE from 'three';
import type { ChunkMaterials } from './chunkMaterial';

/** Terrain meshes that cast shadows are on this layer as well as the default one. */
export const SHADOW_LAYER = 1;
/** Figures, mobs and vehicles that cast shadows are on this layer as well as the default one (see SunShadows.setCasters). */
export const ENTITY_SHADOW_LAYER = 2;

/** What the shadows need of the terrain's materials: the depth pass, and where to hand the maps over. */
export type ShadowSink = Pick<ChunkMaterials, 'depth' | 'setShadow' | 'setShadowBefore' | 'setShadowFar' | 'setShadowFarBefore' | 'setShadowEntities'>;

/** How finely the map of what moves follows the sun (its direction is rounded to 1/N, so the figures' shadows do not shimmer every frame). */
const ENTITY_NOTCHES = 160;
/** The sun has moved once its direction has turned by more than this (1 - the cosine of a hundredth of a degree). */
const SUN_MOVED = 1.5e-8;
/** A map left alone for a while (see `suspend`) is no good any more once the sun has turned by more than this (1 - the cosine of 8 degrees). */
const SUN_FAR = 0.01;

/**
 * How a drawing of a map is spread over the frames. A drawing is all the terrain the map shows (about a million triangles) and it is
 * never made in one frame, nor in a few: it trickles in, a few chunks a frame, over the whole time the drawing before it takes to fade
 * in. A frame's share is then a twentieth of what the frame draws anyway, every frame alike, and no frame is longer than the others.
 */
/** Triangles a second for a drawing that cannot wait (a block was placed, the player ran ahead, or the drawing is late). */
const HURRY_TRIS = 5_000_000;
/** Fewer triangles than this wait for the next frame (turning to a map has a cost of its own), unless they are the last of a drawing. */
const MIN_BATCH = 16_000;
/** The most triangles that go into a map in one frame. */
const MAX_BATCH = 150_000;

/**
 * Seconds from one drawing of a map to the next as the sun goes round, by the sine of the sun's height. A shadow's tip runs over the
 * ground as 1 / height^2: slowly at noon, quickly when the sun is low. So the maps are drawn seldom at noon and more often at the ends
 * of the day; each drawing fades in over the one before for as long as this, so the shadows glide all the same.
 */
export const nearEvery = (sunHeight: number): number => Math.min(2, Math.max(0.6, 8 * sunHeight * sunHeight));
export const farEvery = (sunHeight: number): number => Math.min(4, Math.max(1.2, 20 * sunHeight * sunHeight));

/** One orthographic depth render of the terrain around a point, seen from the sun. */
class Cascade {
  readonly target: THREE.WebGLRenderTarget;
  readonly camera: THREE.OrthographicCamera;
  readonly matrix = new THREE.Matrix4();
  /** The view it was drawn with: the way to the sun, the axes across the map and into it, and the middle of the map. */
  readonly dir = new THREE.Vector3(0, 1, 0);
  readonly right = new THREE.Vector3(1, 0, 0);
  readonly up = new THREE.Vector3(0, 0, 1);
  readonly fwd = new THREE.Vector3(0, -1, 0);
  readonly center = new THREE.Vector3();
  /** The middle, counted in steps along the map's own axes (the view moves a whole step at a time). */
  sx = 0;
  sy = 0;
  sz = 0;
  /** When its drawing began, and whether it holds a finished drawing. */
  lastDraw = 0;
  on = false;

  constructor(
    readonly size: number,
    readonly radius: number,
  ) {
    const depthTexture = new THREE.DepthTexture(size, size);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;
    this.target = new THREE.WebGLRenderTarget(size, size, {
      depthTexture,
      depthBuffer: true,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    this.camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 10, 660);
    this.camera.layers.set(SHADOW_LAYER);
  }

  get texel(): number {
    return (2 * this.radius) / this.size;
  }

  /** Look along the sun (`dir` points at it) at the map's middle. */
  aim(dir: THREE.Vector3): void {
    this.dir.copy(dir).normalize();
    const f = this.fwd.copy(this.dir).negate();
    const up = Math.abs(f.y) > 0.99 ? this.up.set(0, 0, 1) : this.up.set(0, 1, 0);
    this.right.crossVectors(f, up).normalize();
    this.up.crossVectors(this.right, f).normalize();
  }

  /** Put the middle of the map at `focus`, rounded to whole steps of `step` blocks across the map (and 16 into it). */
  place(focus: THREE.Vector3, step: number): void {
    this.sx = Math.round(focus.dot(this.right) / step);
    this.sy = Math.round(focus.dot(this.up) / step);
    this.sz = Math.round(focus.dot(this.fwd) / 16);
    this.center
      .set(0, 0, 0)
      .addScaledVector(this.right, this.sx * step)
      .addScaledVector(this.up, this.sy * step)
      .addScaledVector(this.fwd, this.sz * 16);
    const cam = this.camera;
    cam.position.copy(this.center).addScaledVector(this.dir, 320);
    cam.up.copy(this.up);
    cam.lookAt(this.center);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    this.matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }

  /** How many steps `focus` is from the middle the map was drawn about (the larger of the two ways across; 1 at least when it is too far into it). */
  stepsFrom(focus: THREE.Vector3, step: number): number {
    const across = Math.max(Math.abs(Math.round(focus.dot(this.right) / step) - this.sx), Math.abs(Math.round(focus.dot(this.up) / step) - this.sy));
    return Math.max(across, Math.round(focus.dot(this.fwd) / 16) !== this.sz ? 1 : 0);
  }

  /**
   * Whether a box in the world (given by its middle and half its size) is seen in the map: the box is laid on the map's two axes,
   * which is exact for what the map shows of it.
   */
  sees(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): boolean {
    const dx = cx - this.center.x;
    const dy = cy - this.center.y;
    const dz = cz - this.center.z;
    const r = this.right;
    const u = this.up;
    const pr = dx * r.x + dy * r.y + dz * r.z;
    const rr = hx * Math.abs(r.x) + hy * Math.abs(r.y) + hz * Math.abs(r.z);
    if (pr + rr < -this.radius || pr - rr > this.radius) return false;
    const pu = dx * u.x + dy * u.y + dz * u.z;
    const ru = hx * Math.abs(u.x) + hy * Math.abs(u.y) + hz * Math.abs(u.z);
    return pu + ru >= -this.radius && pu - ru <= this.radius;
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
  }
}

/** No drawing going on; one trickling into the spare copy; one finished there and waiting for the fade that is shown to end. */
const IDLE = 0;
const DRAWING = 1;
const READY = 2;

/**
 * A shadow map that is kept three times over: the newest finished drawing, the one before it (which the newest fades in over), and a
 * spare that the next drawing trickles into meanwhile, a few chunks a frame. The spare is ready as the fade ends and takes its turn.
 */
class FadingMap {
  readonly bufs: [Cascade, Cascade, Cascade];
  /** Which of the three is the newest finished drawing, and which the one before it. */
  shown = 0;
  prev = 1;
  /** How far the newest has faded in over the one before (1: all of it), and how long that fade takes. */
  blend = 1;
  fade = 0.3;
  state: typeof IDLE | typeof DRAWING | typeof READY = IDLE;
  /** The drawing going on: the chunks to draw and their triangles, how far it has got, and the triangles still to come. */
  readonly queue: THREE.Mesh[] = [];
  readonly weights: number[] = [];
  next = 0;
  left = 0;
  /** Triangles it may draw that it has not drawn yet (a frame's share is saved up until it is worth a batch). */
  credit = 0;
  cleared = false;
  /** It cannot wait: it is drawn as fast as is fair and shown as soon as it is done. `whole`: all in one frame (nothing is shown yet). */
  urgent = false;
  whole = false;
  /** Whether it has ever been drawn. */
  begun = false;
  /** The fade it will come in with. */
  nextFade = 0.3;
  /** Terrain that the map shows was meshed again since its last drawing began. */
  dirty = false;

  constructor(
    readonly size: number,
    readonly radius: number,
    /** How far the view moves (in texels) before the map is drawn again. */
    readonly stepTexels: number,
    /** The soonest remeshed terrain may make the map redraw, in seconds, and the seconds such a drawing takes to fade in. */
    readonly remeshEvery: number,
    readonly quickFade: number,
    /** Seconds between drawings as the sun moves, by its height. */
    readonly every: (sunHeight: number) => number,
  ) {
    this.bufs = [new Cascade(size, radius), new Cascade(size, radius), new Cascade(size, radius)];
  }

  get cur(): Cascade {
    return this.bufs[this.shown];
  }
  get old(): Cascade {
    return this.bufs[this.prev];
  }
  get spare(): Cascade {
    return this.bufs[3 - this.shown - this.prev];
  }
  get step(): number {
    return this.cur.texel * this.stepTexels;
  }

  reset(): void {
    for (const b of this.bufs) b.on = false;
    this.blend = 1;
    this.state = IDLE;
    this.queue.length = 0;
    this.weights.length = 0;
    this.dirty = false;
  }

  dispose(): void {
    for (const b of this.bufs) b.dispose();
  }
}

/** What the maps have cost, for the admin bar and scripts/shadow-cost.mjs: drawings, the batches they came in, draw calls and triangles; and the worst single frame. */
export interface ShadowStats {
  frames: number;
  near: number;
  nearBatches: number;
  nearCalls: number;
  nearTris: number;
  far: number;
  farBatches: number;
  farCalls: number;
  farTris: number;
  entities: number;
  entCalls: number;
  /** Frames in which the near map was read twice (a fade going on), and the far one. */
  blendFrames: number;
  farBlendFrames: number;
  worstCalls: number;
  worstTris: number;
}

/**
 * The sun's shadow maps: two orthographic depth renders of the terrain seen from the sun. The near one is fine (a texel is a sixteenth of a
 * block, so shadows follow the pixels of the blocks) and covers the 64 blocks around the player; the far one is coarser and reaches 256, so a
 * mountain's shadow on the plain below is still there instead of ending at a line. The terrain shader reads the near one where it can and
 * melts into the far one at its edge.
 *
 * Drawing a map means drawing the terrain again (about a million triangles for either map), so it is done as seldom and as thinly spread as
 * the eye allows:
 *  - For the sun a map is redrawn on a clock (see `nearEvery`), and each drawing fades in over the one before it for as long as the clock's
 *    tick: the shadows glide with the sun and never jump.
 *  - The next drawing is made meanwhile in a spare copy of the map, a few chunks a frame (see `HURRY_TRIS` and its neighbours): it is spread
 *    over the whole fade, so every frame carries the same small share and none stands out. Only the chunks the map shows are drawn (by
 *    their boxes, not the wide spheres the renderer would cull by).
 *  - What cannot wait (a block placed under the map, a player who has run ahead of it) is drawn faster, but still over several frames.
 *    Terrain meshed outside a map (most of it is, at the edge of what is loaded) does not touch it.
 */
export class SunShadows {
  private readonly near: FadingMap;
  private readonly far: FadingMap | null;
  private lastNow = 0;
  /** Not shading for now (see `suspend`): the maps wait as they are. */
  private paused = false;
  private readonly dir = new THREE.Vector3();
  /** What casts shadows besides the terrain: figures, mobs, vehicles. They move all the time, so they have a small map of their own, redrawn every frame. */
  private readonly entities: Cascade;
  private readonly casters: THREE.Object3D[] = [];
  private readonly casterPass = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  private lastScan = -1;
  private entitiesOn = false;
  /** The group whose children are the terrain's meshes (see `setTerrain`). */
  private terrain: THREE.Object3D | null = null;
  /** The camera the world is seen through (see `setView`). */
  private view: THREE.Camera | null = null;
  /** A scene of its own for the depth passes: it is handed just the things to draw, so the renderer does not walk the whole world for them. */
  private readonly stage = new THREE.Scene();
  private readonly list: THREE.Object3D[] = [];
  private readonly none: THREE.Object3D[] = [];
  private readonly mid = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly ball = new THREE.Sphere();
  private frameCalls = 0;
  private frameTris = 0;
  readonly stats: ShadowStats = { frames: 0, near: 0, nearBatches: 0, nearCalls: 0, nearTris: 0, far: 0, farBatches: 0, farCalls: 0, farTris: 0, entities: 0, entCalls: 0, blendFrames: 0, farBlendFrames: 0, worstCalls: 0, worstTris: 0 };

  constructor(
    private readonly materials: ShadowSink,
    size = 2048,
    radius = 64,
    farRadius = 256,
  ) {
    // The near map follows the player in steps of six blocks, the wide one in steps of sixteen.
    this.near = new FadingMap(size, radius, 96, 0.3, 0.2, nearEvery);
    this.far = farRadius > radius ? new FadingMap(2048, farRadius, 64, 4, 0.6, farEvery) : null;
    this.entities = new Cascade(1024, 32);
    this.entities.camera.layers.set(ENTITY_SHADOW_LAYER);
  }

  /**
   * The groups whose solid meshes cast shadows (the ones that are visible, and not see-through: labels, ghosts and trails do not).
   * Each thing that casts is a child of one of them, standing where the thing is.
   */
  setCasters(...roots: THREE.Object3D[]): void {
    this.casters.length = 0;
    this.casters.push(...roots);
    this.lastScan = -1;
  }

  /**
   * The group the terrain's meshes hang from (each a child of it, placed by its position alone). With it only the chunks a map shows are
   * drawn into it, a few a frame; without it the whole scene is handed to the renderer to pick from, in one go.
   */
  setTerrain(root: THREE.Object3D | null): void {
    this.terrain = root;
  }

  /** The camera the world is seen through: a figure whose shadow cannot fall in its view is not drawn into the map of figures. */
  setView(camera: THREE.Camera | null): void {
    this.view = camera;
  }

  /**
   * Terrain in this box of the world was meshed again. A map that shows it is drawn again soon; one that does not (most of what is
   * meshed is far off, at the edge of what is loaded) is left alone.
   */
  terrainChanged(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cz = (z0 + z1) / 2;
    const hx = (x1 - x0) / 2;
    const hy = (y1 - y0) / 2;
    const hz = (z1 - z0) / 2;
    for (const m of [this.near, this.far]) {
      if (!m || m.dirty) continue;
      // (a drawing that is going on may have passed the place already: it counts as well as the one shown)
      if (m.cur.sees(cx, cy, cz, hx, hy, hz) || (m.state !== IDLE && m.spare.sees(cx, cy, cz, hx, hy, hz))) m.dirty = true;
    }
  }

  /** Put the meshes that came since the last look on the caster layer. */
  private scan(now: number): void {
    if (now - this.lastScan < 0.25) return;
    this.lastScan = now;
    const mark = (o: THREE.Object3D): void => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.shadowChecked) return;
      m.userData.shadowChecked = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.every((x) => !x.transparent)) m.layers.enable(ENTITY_SHADOW_LAYER);
    };
    for (const root of this.casters) root.traverse(mark);
  }

  /**
   * Bring the maps up to date. `sunDir` points at the sun and `sunHeight` is its sine above the horizon; with the sun
   * down there is nothing to shadow and the shader skips the maps. `now` is in seconds.
   */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, focus: THREE.Vector3, sunDir: THREE.Vector3, sunHeight: number, now: number): void {
    if (sunHeight < 0.05) {
      this.suspend();
      return;
    }
    const dt = this.lastNow > 0 ? Math.min(0.1, Math.max(0, now - this.lastNow)) : 0;
    this.lastNow = now;
    this.frameCalls = 0;
    this.frameTris = 0;
    this.dir.copy(sunDir).normalize();

    const near = this.near;
    const far = this.far;
    if (this.paused) {
      // Back from a cave or from under water: the maps are as they were left, and good to show again if the sun and the player have
      // not gone far meanwhile (they catch up as any map does). Otherwise they start over.
      this.paused = false;
      for (const m of [near, far]) if (m && m.cur.on && (1 - m.cur.dir.dot(this.dir) > SUN_FAR || m.cur.stepsFrom(focus, m.step) > 3)) m.reset();
    }
    this.plan(near, focus, sunHeight, now, dt);
    if (far) this.plan(far, focus, sunHeight, now, dt);
    this.feed(near, renderer, scene, dt);
    if (far) this.feed(far, renderer, scene, dt);

    const nc = near.cur;
    this.materials.setShadow(nc.on ? nc.target.depthTexture! : null, nc.matrix, 1 / nc.size, nc.camera.far - nc.camera.near);
    this.materials.setShadowBefore(near.blend < 1 && near.old.on ? near.old.target.depthTexture! : null, near.old.matrix, near.blend);
    if (far) {
      const fc = far.cur;
      this.materials.setShadowFar(fc.on ? fc.target.depthTexture! : null, fc.matrix, 1 / fc.size, fc.texel / nc.texel);
      this.materials.setShadowFarBefore(far.blend < 1 && far.old.on ? far.old.target.depthTexture! : null, far.old.matrix, far.blend);
      if (far.blend < 1) this.stats.farBlendFrames++;
    }
    if (this.casters.length) this.drawEntities(renderer, focus, sunDir, sunHeight, now);

    const st = this.stats;
    st.frames++;
    if (near.blend < 1) st.blendFrames++;
    st.worstCalls = Math.max(st.worstCalls, this.frameCalls);
    st.worstTris = Math.max(st.worstTris, this.frameTris);
  }

  /** A frame of a map: carry its fade on, and begin a new drawing if one is due. */
  private plan(m: FadingMap, focus: THREE.Vector3, sunHeight: number, now: number, dt: number): void {
    if (m.blend < 1) m.blend = Math.min(1, m.blend + dt / m.fade);
    const cur = m.cur;
    if (!cur.on) {
      // A map that shows nothing: the very first time it is drawn whole, at once (the game is still behind its loading screen, and the
      // shadows are there from the first frame). Later (the sun is up again, the player is out of a long cave) it is drawn in a hurry
      // but not in one frame: the light is dim at those moments, and shadows that come a quarter of a second late are not missed.
      if (m.state === IDLE) this.begin(m, focus, now, m.fade, true, !m.begun);
      return;
    }
    if (m.state === READY) return;
    const every = m.every(sunHeight);
    const drawing = m.state === DRAWING;
    // What cannot wait: terrain changed under the map (a block was placed: its shadow is due), or the player has got well ahead of it.
    const ahead = cur.stepsFrom(focus, m.step) >= 2 && (!drawing || m.spare.stepsFrom(focus, m.step) >= 2);
    const urgent = (m.dirty && now - (drawing ? m.spare : cur).lastDraw >= m.remeshEvery) || ahead;
    if (drawing) {
      // (a drawing on its slow way is begun again in a hurry; one that hurries already is let finish)
      if (urgent && !m.urgent) this.begin(m, focus, now, m.dirty ? m.quickFade : Math.min(every, 0.5), true, false);
      return;
    }
    if (urgent) this.begin(m, focus, now, m.dirty ? m.quickFade : Math.min(every, 0.5), true, false);
    // The sun's turn: as one drawing begins to fade in, the next begins to be drawn, and it has until the fade is over.
    else if (cur.stepsFrom(focus, m.step) >= 1 || 1 - cur.dir.dot(this.dir) > SUN_MOVED) this.begin(m, focus, now, every, false, false);
  }

  /** Begin a drawing in the spare copy: from the sun as it stands now, about where the player is now. */
  private begin(m: FadingMap, focus: THREE.Vector3, now: number, fade: number, urgent: boolean, whole: boolean): void {
    const b = m.spare;
    b.aim(this.dir);
    b.place(focus, m.step);
    b.lastDraw = now;
    b.on = false;
    m.dirty = false;
    m.begun = true;
    m.state = DRAWING;
    m.urgent = urgent;
    m.whole = whole;
    m.nextFade = fade;
    m.cleared = false;
    m.credit = 0;
    m.next = 0;
    m.left = 0;
    m.queue.length = 0;
    m.weights.length = 0;
    const root = this.terrain;
    if (!root) return;
    for (const o of root.children) {
      const mesh = this.caster(o);
      if (!mesh || !this.seen(b, mesh)) continue;
      const g = mesh.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      m.queue.push(mesh);
      m.weights.push(tris);
      m.left += tris;
    }
  }

  /** A frame of a drawing: its share of the chunks goes into the spare copy, and when it is done (and due) it is shown. */
  private feed(m: FadingMap, renderer: THREE.WebGLRenderer, scene: THREE.Scene, dt: number): void {
    if (m.state === DRAWING) {
      // (the wide map hurries at half the pace: it is the less pressing of the two, and both may hurry at once)
      const hurry = (m === this.near ? HURRY_TRIS : HURRY_TRIS / 2) * Math.max(dt, 0.004);
      let share = hurry;
      if (m.whole || !this.terrain) share = Infinity;
      else if (!m.urgent) {
        // It is to be ready as the fade that is shown ends: what is left of it, over the frames that are left until then.
        const until = (1 - m.blend) * m.fade;
        if (until > dt) share = Math.min(hurry, (m.left * dt) / until);
      }
      m.credit += share;
      if (m.credit >= Math.min(MIN_BATCH, m.left)) this.batch(m, renderer, scene);
      if (m.cleared && m.next >= m.queue.length) m.state = READY;
    }
    if (m.state === READY && (m.urgent || m.blend >= 1 || !m.cur.on)) this.show(m);
  }

  /** The drawing in the spare copy is done: it is the one shown from now, coming in over the one that was. */
  private show(m: FadingMap): void {
    const spare = 3 - m.shown - m.prev;
    // (a drawing in a hurry may come while a fade is going on: the fade is cut short, to whichever of its two drawings shows more by
    // now; they are a fraction of a second of the sun apart, so this is not seen)
    const keep = m.blend < 0.5 && m.old.on ? m.prev : m.shown;
    const had = m.bufs[keep].on;
    m.bufs[spare].on = true;
    m.prev = keep;
    m.shown = spare;
    m.blend = had ? 0 : 1;
    m.fade = Math.max(0.05, m.nextFade);
    m.state = IDLE;
    if (m === this.near) this.stats.near++;
    else this.stats.far++;
  }

  /** A thing of the terrain group as a mesh that casts shadows, or null if it is not one. */
  private caster(o: THREE.Object3D): THREE.Mesh | null {
    const mesh = o as THREE.Mesh;
    return mesh.isMesh && mesh.visible && (mesh.layers.mask & (1 << SHADOW_LAYER)) !== 0 ? mesh : null;
  }

  /** Whether a chunk's mesh shows in a map. */
  private seen(c: Cascade, mesh: THREE.Mesh): boolean {
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox!;
    const p = mesh.position;
    const hx = (b.max.x - b.min.x) / 2;
    const hy = (b.max.y - b.min.y) / 2;
    const hz = (b.max.z - b.min.z) / 2;
    return c.sees(p.x + b.min.x + hx, p.y + b.min.y + hy, p.z + b.min.z + hz, hx, hy, hz);
  }

  /** Draw the next chunks of a drawing into the spare copy, on top of what is there of it already: as many as it has credit for. */
  private batch(m: FadingMap, renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    const c = m.spare;
    const root = this.terrain;
    const list = this.list;
    list.length = 0;
    const most = m.whole ? Infinity : MAX_BATCH;
    let tris = 0;
    while (m.next < m.queue.length && m.credit > 0 && tris < most) {
      const mesh = m.queue[m.next];
      const w = m.weights[m.next++];
      m.left -= w;
      m.credit -= w;
      // (a chunk that was unloaded or meshed again since the drawing began is gone: the map is drawn again for it soon)
      if (mesh.parent !== root || !mesh.visible) continue;
      list.push(mesh);
      tris += w;
    }
    if (m.next >= m.queue.length) m.credit = 0;

    const stage = root ? this.stage : scene;
    if (root) stage.children = list;
    const prevTarget = renderer.getRenderTarget();
    const prevOverride = stage.overrideMaterial;
    const prevBackground = stage.background;
    const prevAuto = renderer.autoClear;
    renderer.setRenderTarget(c.target);
    if (!m.cleared) {
      renderer.clear(true, true, false);
      m.cleared = true;
    }
    // (the game counts a whole frame's renders together: what this one drew is what it added)
    const kept = renderer.info.autoReset === false;
    const calls0 = kept ? renderer.info.render.calls : 0;
    const tris0 = kept ? renderer.info.render.triangles : 0;
    let calls = 0;
    let drawn = 0;
    if (!root || list.length) {
      stage.overrideMaterial = this.materials.depth;
      stage.background = null;
      // The chunks of a drawing come in over many frames: each batch is added to the ones before it.
      renderer.autoClear = false;
      renderer.render(stage, c.camera);
      renderer.autoClear = prevAuto;
      stage.overrideMaterial = prevOverride;
      stage.background = prevBackground;
      calls = renderer.info.render.calls - calls0;
      drawn = renderer.info.render.triangles - tris0;
    }
    renderer.setRenderTarget(prevTarget);
    if (root) {
      this.stage.children = this.none;
      list.length = 0;
    }

    const st = this.stats;
    if (m === this.near) {
      st.nearBatches++;
      st.nearCalls += calls;
      st.nearTris += drawn;
    } else {
      st.farBatches++;
      st.farCalls += calls;
      st.farTris += drawn;
    }
    this.frameCalls += calls;
    this.frameTris += drawn;
  }

  /** Draw what moves into its own map, every frame: the view snaps to one texel, so the shadows do not crawl as the player walks. */
  private drawEntities(renderer: THREE.WebGLRenderer, focus: THREE.Vector3, sunDir: THREE.Vector3, sunHeight: number, now: number): void {
    this.scan(now);
    const c = this.entities;
    const n = ENTITY_NOTCHES;
    c.aim(this.dir.set(Math.round(sunDir.x * n) / n, Math.round(sunDir.y * n) / n, Math.round(sunDir.z * n) / n));
    this.dir.copy(sunDir).normalize();
    c.place(focus, c.texel);

    // Only what can matter is handed to the renderer (not the scene, with all its terrain to walk past): the things the map shows whose
    // shadow can fall where the player is looking. A mob is a few dozen boxes, and a herd behind the player's back is hundreds of draw
    // calls a frame for shadows nobody sees. (A shadow is as long as the thing is tall over the sun's height: long when the sun is low.)
    const view = this.view;
    if (view) {
      view.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(this.viewProj.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse.copy(view.matrixWorld).invert()));
    }
    const ball = this.ball;
    ball.radius = 3 + Math.min(16, (2.5 * Math.sqrt(Math.max(0, 1 - sunHeight * sunHeight))) / Math.max(0.05, sunHeight));
    const picked = this.list;
    picked.length = 0;
    for (const root of this.casters) {
      if (!root.visible) continue;
      for (const o of root.children) {
        if (!o.visible) continue;
        o.updateWorldMatrix(true, false);
        const e = o.matrixWorld.elements;
        if (!c.sees(e[12], e[13] + 1, e[14], 4, 4, 4)) continue;
        ball.center.set(e[12], e[13] + 1, e[14]);
        if (view && !this.frustum.intersectsSphere(ball)) continue;
        picked.push(o);
      }
    }

    let calls = 0;
    if (picked.length) {
      const stage = this.stage;
      stage.children = picked;
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(c.target);
      renderer.clear(true, true, false);
      stage.overrideMaterial = this.casterPass;
      const calls0 = renderer.info.autoReset === false ? renderer.info.render.calls : 0;
      renderer.render(stage, c.camera);
      stage.overrideMaterial = null;
      stage.children = this.none;
      renderer.setRenderTarget(prevTarget);
      calls = renderer.info.render.calls - calls0;
      picked.length = 0;
    }

    this.stats.entities++;
    this.stats.entCalls += calls;
    this.frameCalls += calls;
    // With nobody about (alone, in first person) there is nothing in the map: the terrain shader is told not to read it at all.
    const any = calls > 0;
    if (any || this.entitiesOn) this.materials.setShadowEntities(any ? c.target.depthTexture! : null, c.matrix, 1 / c.size);
    this.entitiesOn = any;
  }

  get active(): boolean {
    return !this.paused && this.near.cur.on;
  }

  /**
   * Draw one tiny thing into the map of the figures, so that its shader is built while the game loads. Otherwise it is built the
   * first time a figure is near in daylight (your own body in third person, the first mob, the first other player), and the game
   * stands still while it is.
   */
  warmEntities(renderer: THREE.WebGLRenderer): void {
    const c = this.entities;
    const dummy = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial());
    dummy.frustumCulled = false;
    // (The camera of this map only sees what is on the layer of the casters.)
    dummy.layers.enable(ENTITY_SHADOW_LAYER);
    const stage = this.stage;
    const prevTarget = renderer.getRenderTarget();
    stage.children = [dummy];
    renderer.setRenderTarget(c.target);
    stage.overrideMaterial = this.casterPass;
    renderer.render(stage, c.camera);
    stage.overrideMaterial = null;
    stage.children = this.none;
    renderer.setRenderTarget(prevTarget);
    dummy.geometry.dispose();
    dummy.material.dispose();
  }

  /**
   * The same for the terrain's depth shader: it is built when the first chunks are drawn into a map, which is when the loading is
   * nearly over and the sun or the moon is up (a freeze of a second or more, right before "Click to enter the world"). One tiny
   * box is drawn with it into each map (the ones the terrain goes into) while nothing else is.
   */
  warmTerrain(renderer: THREE.WebGLRenderer): void {
    const dummy = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01));
    dummy.frustumCulled = false;
    const stage = this.stage;
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    stage.children = [dummy];
    stage.overrideMaterial = this.materials.depth;
    renderer.autoClear = false;
    for (const m of [this.near, this.far]) {
      if (!m) continue;
      renderer.setRenderTarget(m.cur.target);
      renderer.render(stage, m.cur.camera);
    }
    renderer.autoClear = prevAuto;
    stage.overrideMaterial = null;
    stage.children = this.none;
    renderer.setRenderTarget(prevTarget);
    dummy.geometry.dispose();
  }

  /**
   * Stop shading with the maps (the sun is down, or the player is underground or underwater). The maps themselves are kept: a swimmer's
   * head goes under and comes up all the time, and drawing both maps whole each time it comes up would be a jolt each time.
   */
  suspend(): void {
    if (this.paused) return;
    this.paused = true;
    const c = this.near.cur;
    this.entitiesOn = false;
    this.lastNow = 0;
    this.materials.setShadow(null, c.matrix, 1 / c.size, 1);
    this.materials.setShadowBefore(null, c.matrix, 1);
    this.materials.setShadowFar(null, c.matrix, 1, 1);
    this.materials.setShadowFarBefore(null, c.matrix, 1);
    this.materials.setShadowEntities(null, c.matrix, 1);
  }

  dispose(): void {
    this.near.dispose();
    this.far?.dispose();
    this.entities.dispose();
    this.casterPass.dispose();
  }
}
