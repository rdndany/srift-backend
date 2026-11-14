// Look at the Warrior's Ground Slam (and the leap that starts it), Shield Bash or Charge without starting the game: bundles the effects for a browser, plays one
// at the times asked for, from the side, from low (as the warrior's own eyes see it) or from above, and saves a picture of each moment.
// Usage: node scripts/slam-fx-view.mjs [outDir] [shots=what:view:seconds, with what slam|leap|bash|charge|guard|veil (the first-person mask of Iron Defense; use the low view) and view side|three|front|low|top; default slam:side:0.06,slam:side:0.2,slam:side:0.5,slam:side:1.0,leap:side:0.1,leap:side:0.3]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/slam-fx';
const wanted = (process.argv[3] ?? 'slam:side:0.06,slam:side:0.2,slam:side:0.5,slam:side:1.0,leap:side:0.1,leap:side:0.3').split(',');
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');
const work = join(tmpdir(), 'solrift-slam-view');
mkdirSync(work, { recursive: true });
const entry = join(work, 'entry.ts').replace(/\\/g, '/');
const bundle = join(work, 'bundle.js');

writeFileSync(
  entry,
  `import * as THREE from 'three';
import { AbilityFx } from '${root}/apps/web/src/game/abilityFx';
import { FireParticles } from '${root}/apps/web/src/game/fireFx';
import { GuardVeil } from '${root}/apps/web/src/game/guardFx';
const W = 960, H = 600;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const cam = new THREE.PerspectiveCamera(70, W / H, 0.05, 300);
(window as any).show = (what: string, view: string, at: number) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a6d8);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), new THREE.MeshBasicMaterial({ color: 0x5a8f3a }));
  ground.position.y = -0.5;
  scene.add(ground);
  // a stand-in for the warrior: a block of the right size
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), new THREE.MeshBasicMaterial({ color: 0x8a8f99 }));
  body.position.set(0, what === 'slam' ? 0.9 : 0.9, 0);
  scene.add(body);
  const fire = new FireParticles();
  scene.add(fire.group);
  const fx = new AbilityFx(fire);
  scene.add(fx.group);
  fx.setViewer(cam.position);
  if (view === 'side') { cam.position.set(0, 3.2, 8.5); cam.lookAt(0, 1.1, 0); }
  else if (view === 'three') { cam.position.set(5, 2.6, 4.5); cam.lookAt(0, 0.5, -2); }
  else if (view === 'front') { cam.position.set(3, 2.2, -8); cam.lookAt(0, 0.9, -1.5); }
  else if (view === 'low') { cam.position.set(0, 1.62, 0.2); body.visible = false; cam.lookAt(0, 0.9, -3); }
  else { cam.position.set(0, 11, 4); cam.lookAt(0, 0, 0); }
  const list = [what === 'guard' || what === 'veil' ? { id: 1, k: 'guard_iron', x: 0, y: 0, z: 0, r: 1.2, age: 0, ttl: 6.5, by: 'me' } : what === 'charge' ? { id: 1, k: 'charge', x: 0, y: 0, z: 0, r: 1.2, age: 0, ttl: 0.86, by: 'me' } : what === 'bash' ? { id: 1, k: 'bash', x: 0, y: 0.9, z: -1.2, r: 1.6, age: 0, ttl: 0.7, by: 'me', x2: 0, y2: 0.9, z2: -3.2 } : what === 'slam' ? { id: 1, k: 'slam', x: 0, y: 0, z: 0, r: 3.8, age: 0, ttl: 1.4, by: 'me' } : { id: 1, k: 'leap', x: 0, y: 0, z: 0, r: 1.4, age: 0, ttl: 0.6, by: 'me' }] as any[];
  const veil = new GuardVeil();
  scene.add(veil.group);
  if (what === 'veil') list.length = 0;
  let t = 0;
  while (t < at) {
    const step = Math.min(0.016, at - t);
    if (what === 'charge') { list[0].z = -Math.min(8, 22 * (t + step)); if (t + step > 0.36) list[0].ttl = Math.min(list[0].ttl, 0.36 + 0.6); }
    if (what === 'charge' && view === 'low') cam.position.set(0, 1.62, list[0].z + 0.2);
    fx.sync(list, step);
    veil.update(step, what === 'veil', cam);
    fire.update(step);
    t += step;
  }
  if (what === 'charge') {
    const cz = list[0].z;
    body.position.set(0, 0.9, cz);
    if (view === 'side') { cam.position.set(7, 2.4, cz + 0.5); cam.lookAt(0, 1, cz - 0.5); }
    else if (view === 'three') { cam.position.set(3.5, 2.4, cz + 5.5); cam.lookAt(0, 0.9, cz - 1); }
    else if (view === 'front') { cam.position.set(2.5, 1.8, cz - 6); cam.lookAt(0, 1, cz); }
    else if (view === 'low') { cam.position.set(0, 1.62, cz + 0.2); cam.lookAt(0, 1.2, cz - 3); }
    else { cam.position.set(0, 11, cz + 3); cam.lookAt(0, 0, cz - 1); }
  }
  renderer.render(scene, cam);
  fx.destroy();
  fire.dispose();
};
`,
);
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: bundle, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'log') && console.log('[page]', m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: bundle });
for (const shot of wanted) {
  const [what, view, at] = shot.split(':');
  await page.evaluate(([w, v, t]) => window.show(w, v, Number(t)), [what, view, at ?? '0.2']);
  await page.locator('canvas').screenshot({ path: `${outDir}/${what}-${view}-${at}.png` });
  console.log('saved', shot);
}
await browser.close();
rmSync(work, { recursive: true, force: true });
if (errors.length) console.log('errors', errors);
