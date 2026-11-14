import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SHADOW_LAYER, SunShadows, farEvery, nearEvery, type ShadowSink } from './shadows';

/** A day is 1200 seconds: the sun as the sky has it at `time` (0 sunrise, 0.25 noon). */
const sunAt = (time: number): THREE.Vector3 => new THREE.Vector3(Math.cos(time * Math.PI * 2), Math.sin(time * Math.PI * 2), 40 / 300).normalize();

/** Triangles in a chunk of the made-up terrain (about what a real one has). */
const CHUNK_TRIS = 6700;

/** A renderer that draws nothing and writes down what it was asked to draw: for each call, how wide the view was and how many meshes it was handed. */
function fakeRenderer() {
  const draws: { width: number; meshes: number; frame: number }[] = [];
  const r = {
    frame: 0,
    draws,
    info: { render: { calls: 0, triangles: 0 } },
    getRenderTarget: () => null,
    setRenderTarget: () => undefined,
    clear: () => undefined,
    render(scene: THREE.Object3D, cam: THREE.OrthographicCamera) {
      let meshes = 0;
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.layers.test(cam.layers)) meshes++;
      });
      r.info.render.calls = meshes;
      r.info.render.triangles = meshes * CHUNK_TRIS;
      draws.push({ width: Math.round(cam.right - cam.left), meshes, frame: r.frame });
    },
  };
  return r;
}

function fakeSink() {
  const s = {
    blend: 1,
    farBlend: 1,
    on: false,
    entities: false,
    depth: new THREE.ShaderMaterial(),
    setShadow: (map: THREE.Texture | null) => void (s.on = !!map),
    setShadowBefore: (map: THREE.Texture | null, _m: THREE.Matrix4, blend: number) => void (s.blend = map ? blend : 1),
    setShadowFar: () => undefined,
    setShadowFarBefore: (map: THREE.Texture | null, _m: THREE.Matrix4, blend: number) => void (s.farBlend = map ? blend : 1),
    setShadowEntities: (map: THREE.Texture | null) => void (s.entities = !!map),
  };
  return s satisfies ShadowSink;
}

/** Chunks as the world makes them: 17 x 17 columns of 16 blocks round the origin, each a mesh placed by its position, the ground between 60 and 110. */
function terrain(): THREE.Group {
  const group = new THREE.Group();
  const g = new THREE.BoxGeometry(16, 50, 16).translate(8, 85, 8);
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(CHUNK_TRIS * 3), 1));
  g.computeBoundingBox();
  const material = new THREE.MeshBasicMaterial();
  for (let cx = -8; cx <= 8; cx++)
    for (let cz = -8; cz <= 8; cz++) {
      const mesh = new THREE.Mesh(g, material);
      mesh.position.set(cx * 16, 0, cz * 16);
      mesh.layers.enable(SHADOW_LAYER);
      group.add(mesh);
    }
  return group;
}

/** Run the shadows at 60 frames a second from `time` of the day for `seconds`, the player standing (or walking at `speed` blocks a second). */
function run(time: number, seconds: number, speed = 0, each?: (t: number, s: SunShadows) => void) {
  const renderer = fakeRenderer();
  const sink = fakeSink();
  const shadows = new SunShadows(sink);
  const ground = terrain();
  shadows.setTerrain(ground);
  const scene = new THREE.Scene();
  scene.add(ground);
  const focus = new THREE.Vector3(3, 90, 5);
  const blends: number[] = [];
  /** Drawings of the near map shown so far, frame by frame. */
  const shown: number[] = [];
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    const t = i / 60;
    renderer.frame = i;
    focus.x = 3 + speed * t;
    const day = time + t / 1200;
    each?.(t, shadows);
    shadows.update(renderer as unknown as THREE.WebGLRenderer, scene, focus, sunAt(day), Math.sin(day * Math.PI * 2), 100 + t);
    blends.push(sink.blend);
    shown.push(shadows.stats.near);
  }
  /** Meshes drawn into the maps in each frame. */
  const perFrame = new Array<number>(frames).fill(0);
  for (const d of renderer.draws) perFrame[d.frame] += d.meshes;
  const worst = (from: number): number => Math.max(0, ...perFrame.slice(Math.round(from * 60)));
  return {
    shadows,
    sink,
    renderer,
    blends,
    shown,
    perFrame,
    worst,
    near: renderer.draws.filter((d) => d.width === 128),
    far: renderer.draws.filter((d) => d.width === 512),
    nearPerSecond: shadows.stats.near / seconds,
    farPerSecond: shadows.stats.far / seconds,
    /** The share of the frames (after the first) in which something was drawn into a map. */
    busy: perFrame.slice(1).filter((n) => n > 0).length / (frames - 1),
  };
}

describe('the clock the shadow maps are drawn by', () => {
  it('is slow at noon and quicker when the sun is low, within bounds', () => {
    expect(nearEvery(1)).toBe(2);
    expect(nearEvery(0.1)).toBe(0.6);
    expect(nearEvery(0.4)).toBeGreaterThan(nearEvery(0.3));
    expect(farEvery(1)).toBe(4);
    expect(farEvery(0.1)).toBe(1.2);
    for (const h of [0.05, 0.2, 0.5, 1]) expect(farEvery(h)).toBeGreaterThanOrEqual(nearEvery(h));
  });
});

describe('SunShadows', () => {
  it('draws both maps whole the first time, so the shadows are there from the first frame', () => {
    const r = run(0.03, 0.1);
    expect(r.sink.on).toBe(true);
    const zero = r.renderer.draws.filter((d) => d.frame === 0);
    expect(zero.map((d) => d.width).sort((a, b) => a - b)).toEqual([128, 512]);
    // (the wide map shows all of the made-up world, the near one the chunks in the sun's way to it)
    expect(zero.find((d) => d.width === 512)!.meshes).toBe(289);
  });

  it('at sunrise keeps to its clock with a few chunks a frame: no frame carries a drawing, or a big part of one', () => {
    const r = run(0.03, 30);
    // (the sun is at 11 degrees: a drawing of the near map every 0.6 s, of the wide one every 1.2 s)
    expect(r.nearPerSecond).toBeGreaterThan(1.4);
    expect(r.nearPerSecond).toBeLessThanOrEqual(1 / 0.6);
    expect(r.farPerSecond).toBeGreaterThan(0.7);
    expect(r.farPerSecond).toBeLessThanOrEqual(1 / 1.2);
    // The first drawings after the whole one hurry (there is no fade yet to spread them over); then it is a trickle. A drawing of
    // either map is a hundred chunks and more.
    expect(r.worst(0.02)).toBeLessThanOrEqual(24);
    expect(r.worst(3)).toBeLessThanOrEqual(14);
    expect(Math.max(...r.near.filter((d) => d.frame > 0).map((d) => d.meshes))).toBeLessThanOrEqual(14);
    // ... and it is spread over nearly all the frames, not bunched up in a few.
    expect(r.busy).toBeGreaterThan(0.85);
  });

  it('at noon redraws far less: a chunk or two a frame, and only the chunks under the map', () => {
    const r = run(0.25, 30);
    expect(r.nearPerSecond).toBeLessThan(0.55);
    expect(r.farPerSecond).toBeLessThanOrEqual(0.3);
    expect(r.worst(6)).toBeLessThanOrEqual(8);
    // The near map is 128 blocks across: 8 or 9 chunks each way (the renderer's spheres would let all 289 through).
    const first = r.near.find((d) => d.frame === 0)!;
    expect(first.meshes).toBeLessThan(150);
    expect(first.meshes).toBeGreaterThanOrEqual(64);
    const perDrawing = r.near.filter((d) => d.frame > 0).reduce((a, d) => a + d.meshes, 0) / r.shadows.stats.near;
    expect(perDrawing).toBeLessThan(160);
  });

  it('fades each drawing in over the one before without a jump: the fade runs from 0 to 1 and only then does the next come in', () => {
    const r = run(0.03, 20);
    let fades = 0;
    let waits = 0;
    for (let i = 1; i < r.blends.length; i++) {
      const a = r.blends[i - 1];
      const b = r.blends[i];
      if (b < a) {
        // A new drawing came in: the one before had come in all the way.
        expect(a).toBeGreaterThan(0.95);
        expect(b).toBeLessThan(0.05);
        fades++;
      } else {
        expect(b - a).toBeLessThan(0.05);
        if (a === 1 && b === 1) waits++;
      }
    }
    expect(fades).toBeGreaterThan(25);
    // The next drawing is ready as the fade ends: the shadows do not stand still between one fade and the next (a frame or two at most).
    expect(waits / fades).toBeLessThan(2.5);
  });

  it('leaves the near map alone when terrain far from it is meshed, and redraws it in a hurry for a block placed under it', () => {
    // Noon, so the sun's own clock is slow; chunks at the edge of the loaded world are meshed all the while.
    const quiet = run(0.25, 10);
    const edge = run(0.25, 10, 0, (_t, s) => s.terrainChanged(112, 60, -16, 128, 110, 0));
    expect(edge.shadows.stats.near).toBe(quiet.shadows.stats.near);
    // A block by the player, 3.2 s in.
    let at = -1;
    const placed = run(0.25, 10, 0, (t, s) => {
      if (at < 0 && t >= 3.2) {
        s.terrainChanged(0, 88, 0, 16, 92, 16);
        at = Math.round(t * 60);
      }
    });
    // The map is begun again at once and is shown a quarter of a second later, without a frame that draws it all.
    const before = placed.shown[at - 1];
    const frame = placed.shown.findIndex((n, i) => i >= at && n > before);
    expect(frame - at).toBeGreaterThan(2);
    expect(frame - at).toBeLessThanOrEqual(15);
    expect(Math.max(...placed.perFrame.slice(at, frame + 1))).toBeLessThanOrEqual(24);
    expect(placed.blends[frame]).toBeLessThan(0.2);
  });

  it('follows a running player', () => {
    const r = run(0.25, 20, 5.6);
    // Six blocks a step at 5.6 blocks a second: a drawing every second or two, not one for every block.
    expect(r.nearPerSecond).toBeGreaterThan(0.4);
    expect(r.nearPerSecond).toBeLessThan(1.6);
    expect(r.worst(0.02)).toBeLessThanOrEqual(24);
  });

  it('draws into the map of figures only those whose shadow can be seen, and has the terrain shader skip the map when there are none', () => {
    const renderer = fakeRenderer();
    const sink = fakeSink();
    const shadows = new SunShadows(sink);
    const scene = new THREE.Scene();
    const people = new THREE.Group();
    scene.add(people);
    shadows.setCasters(people);
    const eye = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
    eye.position.set(0, 90, 0); // (looking along -z)
    const go = (now: number): void => shadows.update(renderer as unknown as THREE.WebGLRenderer, scene, eye.position, sunAt(0.25), Math.sin(0.25 * Math.PI * 2), now);
    const figures = (): number => renderer.draws.filter((d) => d.width === 64).reduce((a, d) => a + d.meshes, 0);
    go(1);
    expect(sink.entities).toBe(false);
    const figure = (x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
      m.position.set(x, y, z);
      people.add(m);
      return m;
    };
    figure(0, 88, -10); // in front
    figure(0, 88, 12); // behind
    figure(0, 88, -90); // in front, beyond the map
    go(1.3);
    renderer.draws.length = 0;
    go(1.32);
    expect(sink.entities).toBe(true);
    // Without knowing where the player looks, all that the map shows are drawn; with it, only the one in front.
    expect(figures()).toBe(2);
    shadows.setView(eye);
    renderer.draws.length = 0;
    go(1.34);
    expect(figures()).toBe(1);
    people.clear();
    renderer.draws.length = 0;
    go(1.36);
    expect(sink.entities).toBe(false);
    expect(figures()).toBe(0);
  });

  it('keeps its maps while the player is under water or in a cave, and shows them again at once', () => {
    let wet = false;
    const sink = fakeSink();
    const renderer = fakeRenderer();
    const shadows = new SunShadows(sink);
    const ground = terrain();
    shadows.setTerrain(ground);
    const scene = new THREE.Scene();
    scene.add(ground);
    const at = new THREE.Vector3(3, 90, 5);
    const frame = (i: number): void => {
      renderer.frame = i;
      const day = 0.25 + i / 60 / 1200;
      if (wet) shadows.suspend();
      else shadows.update(renderer as unknown as THREE.WebGLRenderer, scene, at, sunAt(day), Math.sin(day * Math.PI * 2), 100 + i / 60);
    };
    for (let i = 0; i < 120; i++) frame(i);
    wet = true;
    for (let i = 120; i < 240; i++) frame(i);
    expect(shadows.active).toBe(false);
    expect(sink.on).toBe(false);
    wet = false;
    frame(240);
    expect(shadows.active).toBe(true);
    expect(sink.on).toBe(true);
    for (let i = 241; i < 400; i++) frame(i);
    const after = new Array<number>(400).fill(0);
    for (const d of renderer.draws) after[d.frame] += d.meshes;
    expect(Math.max(...after.slice(240))).toBeLessThanOrEqual(24);
  });

  it('stops when the sun is down, and comes back in a hurry (not in one frame) when it is up again somewhere else in the sky', () => {
    const sink = fakeSink();
    const renderer = fakeRenderer();
    const shadows = new SunShadows(sink);
    const ground = terrain();
    shadows.setTerrain(ground);
    const scene = new THREE.Scene();
    scene.add(ground);
    const at = new THREE.Vector3(3, 90, 5);
    shadows.update(renderer as unknown as THREE.WebGLRenderer, scene, at, sunAt(0.1), 0.6, 1);
    expect(shadows.active).toBe(true);
    shadows.update(renderer as unknown as THREE.WebGLRenderer, scene, at, sunAt(0.001), 0.01, 2);
    expect(shadows.active).toBe(false);
    expect(sink.on).toBe(false);
    renderer.draws.length = 0;
    let on = -1;
    for (let i = 0; i < 120; i++) {
      renderer.frame = i;
      shadows.update(renderer as unknown as THREE.WebGLRenderer, scene, at, sunAt(0.3), 0.6, 3 + i / 60);
      if (on < 0 && sink.on) on = i;
    }
    expect(on).toBeGreaterThan(3);
    expect(on).toBeLessThan(30);
    const per = new Array<number>(120).fill(0);
    for (const d of renderer.draws) per[d.frame] += d.meshes;
    expect(Math.max(...per)).toBeLessThanOrEqual(24);
  });
});
