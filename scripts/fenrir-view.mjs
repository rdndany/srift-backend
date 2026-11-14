// Look at the Fenrir model alone, fast: bundles fenrir.ts for the browser, draws it from several sides and saves the pictures.
// Usage: node scripts/fenrir-view.mjs [outDir] [id=fenrir] [views=side,front,rear,head,top]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/fenrir';
const id = process.argv[3] ?? 'fenrir';
const wanted = (process.argv[4] ?? 'side,front,rear,head,fp,run').split(',');
mkdirSync(outDir, { recursive: true });
const root = resolve('.');

const entry = `${root}/scripts/.fenrir-entry.ts`;
writeFileSync(
  entry,
  `import * as THREE from 'three';
import { Fenrir, MOUNT_SCALE } from '${root.replace(/\\/g, '/')}/apps/web/src/game/fenrir';
import { MOUNTED_EYE } from '${root.replace(/\\/g, '/')}/packages/shared/src/mounts';
const W = 960, H = 600;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8cc0ff);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x5aa832 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const cam = new THREE.PerspectiveCamera(50, W / H, 0.05, 200);
let f: Fenrir | null = null;
(window as any).show = (id: string, view: string, act: string) => {
  if (f) { scene.remove(f.root); f.dispose(); }
  f = new Fenrir(id as any);
  scene.add(f.root);
  f.setTint(new THREE.Color(1, 1, 1));
  const run = view === 'run';
  // In the first-person views the camera is the rider's own eye: the lightning keeps off it.
  if (view.startsWith('fp')) f.setViewer(new THREE.Vector3(0, MOUNTED_EYE, 0), true);
  for (let i = 0; i < 60; i++) f.update(0.03, run ? 7 : 0, 0, 0, false);
  if (act === 'bite') { f.lunge(); for (let i = 0; i < 6; i++) f.update(0.03, 0, 0, 0, false); }
  if (act === 'roar') { f.roar(); for (let i = 0; i < 10; i++) f.update(0.03, 0, 0, 0, false); }
  const S = MOUNT_SCALE;
  const eye = [0, MOUNTED_EYE, 0];
  const v: Record<string, [number[], number[], number]> = {
    side: [[7 * 1, 1.6, 0], [0, 1.4, -0.2], 45],
    front: [[-3.2, 2.6, -6], [0, 1.6, 0], 45],
    rear: [[3.4, 2.6, 6], [0, 1.6, 0], 45],
    head: [[-1.6, 2.7, -4.6], [0, 2.4, -2.3], 42],
    run: [[6, 2, -3], [0, 1.4, 0], 45],
    fp: [eye, [eye[0], eye[1] - 0.12, eye[2] - 5], 70],
    top: [[0.01, 9, 0], [0, 0, 0], 40],
  };
  // First person as played: fp<up>_<forward>_<pitch in degrees looking down> from the rider's eye (the game's fov is 75).
  const m = /^fp(-?[\\d.]+)_(-?[\\d.]+)_(-?[\\d.]+)$/.exec(view);
  if (m) {
    const [up, fwd, deg] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const p0 = [0, MOUNTED_EYE + up, -fwd];
    const a = (-deg * Math.PI) / 180;
    v[view] = [p0, [0, p0[1] + Math.sin(a) * 20, p0[2] - Math.cos(a) * 20], 75];
  }
  const [p, l, fov] = v[view] ?? v.side;
  cam.fov = fov; cam.updateProjectionMatrix();
  cam.position.set(p[0], p[1], p[2]);
  cam.lookAt(l[0], l[1], l[2]);
  f.root.updateMatrixWorld(true);
  renderer.render(scene, cam);
  return f.root.children.length;
};
`,
);
const out = `${root}/scripts/.fenrir-bundle.js`;
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: out, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'log') && console.log('[page]', m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: out });
for (const view of wanted) {
  const [v, act] = view.split(':');
  const t0 = Date.now();
  await page.evaluate(([i, vw, a]) => window.show(i, vw, a ?? ''), [id, v, act]);
  await page.locator('canvas').screenshot({ path: `${outDir}/${id}-${view.replace(':', '-')}.png` });
  console.log('saved', view, `${Date.now() - t0}ms`);
}
await browser.close();
if (errors.length) console.log('errors', errors);
