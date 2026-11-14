// Look at what the Fenrir's two skills leave in the world, fast: bundles the effects for the browser, plays one at the times asked for
// and saves a picture of each moment.
// Usage: node scripts/fenrir-fx-view.mjs [outDir] [id=fenrir] [shots=bite:0.05,bite:0.14,warn:0.6,hit:0.12,hit:0.3,hit:0.7]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/fenrir-fx';
const id = process.argv[3] ?? 'fenrir';
const wanted = (process.argv[4] ?? 'bite:0.05,bite:0.14,warn:0.6,hit:0.12,hit:0.3,hit:0.7').split(',');
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');

const entry = `${root}/scripts/.fenrir-fx-entry.ts`;
writeFileSync(
  entry,
  `import * as THREE from 'three';
import { Fenrir } from '${root}/apps/web/src/game/fenrir';
import { AbilityFx } from '${root}/apps/web/src/game/abilityFx';
import { FireParticles } from '${root}/apps/web/src/game/fireFx';
const W = 960, H = 600;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const cam = new THREE.PerspectiveCamera(60, W / H, 0.05, 300);
(window as any).show = (id: string, what: string, at: number) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6d86b8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: 0x4f8f2c }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const fenrir = new Fenrir(id as any);
  fenrir.setTint(new THREE.Color(1, 1, 1));
  scene.add(fenrir.root);
  for (let i = 0; i < 60; i++) fenrir.update(0.03, 0, 0, 0, false);
  const fire = new FireParticles();
  scene.add(fire.group);
  const fx = new AbilityFx(fire);
  scene.add(fx.group);
  fx.setViewer(cam.position);
  const base = { id: 1, x: 0, y: 0, z: 0, r: 0, age: 0, ttl: 1, by: 'me', mount: id } as any;
  const list: any[] = [];
  if (what === 'bite' || what === 'bitef' || what === 'bitet') {
    list.push({ ...base, k: 'fang', r: 6, ttl: 0.7, x2: 0, y2: 0, z2: -6 });
    fenrir.lunge();
    // the side, from in front of it, and from above and behind (as the rider and the ones behind see it)
    if (what === 'bite') { cam.position.set(4.5, 2.4, -1.5); cam.lookAt(0, 1.2, -3.5); }
    else if (what === 'bitef') { cam.position.set(2, 2.2, -9.5); cam.lookAt(0, 1.2, -3); }
    else { cam.position.set(0, 5.5, 5.5); cam.lookAt(0, 0.5, -4); }
  } else if (what === 'cast' || what === 'castlow' || what === 'arrive' || what === 'arrivelow') {
    // the call and its answer: the beast is not there yet during the call, and grows out of the ground when it is answered
    if (what.startsWith('cast')) { fenrir.root.visible = false; fx.startSummon(id as any, 0, 0, 0); }
    else { fenrir.appear(); fx.arriveSummon(id as any, 0, 0, 0); }
    if (what.endsWith('low')) { cam.position.set(5, 1.6, 7); cam.lookAt(0, 1.8, 0); }
    else { cam.position.set(6, 5.5, 8.5); cam.lookAt(0, 2.5, 0); }
  } else if (what === 'warn') {
    list.push({ ...base, k: 'thunder_warn', z: -12, r: 4, ttl: 1.9 });
    fenrir.roar();
    cam.position.set(3.5, 4.2, 5); cam.lookAt(0, 1.8, -11);
  } else {
    list.push({ ...base, k: 'thunder_hit', z: -12, r: 4, ttl: 1.1 });
    cam.position.set(3.5, 4.2, 5); cam.lookAt(0, 3.5, -11);
  }
  const dt = 0.016;
  let t = 0;
  while (t < at) {
    const step = Math.min(dt, at - t);
    fenrir.update(step, 0, 0, 0, false);
    fx.sync(list, step);
    fire.update(step);
    t += step;
  }
  fenrir.root.updateMatrixWorld(true);
  renderer.render(scene, cam);
  fx.destroy();
  fire.dispose();
  fenrir.dispose();
};
`,
);
const out = `${root}/scripts/.fenrir-fx-bundle.js`;
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: out, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'log') && console.log('[page]', m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: out });
for (const shot of wanted) {
  const [what, at] = shot.split(':');
  await page.evaluate(([i, w, t]) => window.show(i, w, Number(t)), [id, what, at ?? '0.2']);
  await page.locator('canvas').screenshot({ path: `${outDir}/${id}-${what}-${at}.png` });
  console.log('saved', shot);
}
await browser.close();
if (errors.length) console.log('errors', errors);
