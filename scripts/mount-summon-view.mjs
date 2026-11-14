// Look at a mount being called (the paw prints and bolts of cubes), arriving, losing the call, or being sent away (the pink puff), in the colour of any
// mount, without starting the game: bundles the effects for a browser, plays one at the times asked for and saves a picture of each moment.
// Usage: node scripts/mount-summon-view.mjs [outDir] [shots=what:mount:view:seconds, with what cast|arrive|fizzle|puff (the light of the call and the dismount) or bite|warn|hit (the bite, the ground the howl will strike and a strike of it) and view side|three|close (the bite, from beside it)|low|top;
//   default cast:fenrir:three:0.5,cast:fenrir:three:1.4,arrive:fenrir:three:0.1,arrive:fenrir:three:0.5,arrive:fenrir:three:1.2,puff:fenrir:three:0.3]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/mount-summon';
const wanted = (process.argv[3] ?? 'cast:fenrir:three:0.5,cast:fenrir:three:1.4,arrive:fenrir:three:0.1,arrive:fenrir:three:0.5,arrive:fenrir:three:1.2,puff:fenrir:three:0.3').split(',');
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');
const work = join(tmpdir(), 'solrift-mount-view');
mkdirSync(work, { recursive: true });
const entry = join(work, 'entry.ts').replace(/\\/g, '/');
const bundle = join(work, 'bundle.js');

writeFileSync(
  entry,
  `import * as THREE from 'three';
import { AbilityFx } from '${root}/apps/web/src/game/abilityFx';
import { EmberFx } from '${root}/apps/web/src/game/emberFx';
import { FireParticles } from '${root}/apps/web/src/game/fireFx';
import { MOUNT_LOOK, mountLook } from '${root}/apps/web/src/game/mountFx';
const W = 960, H = 600;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const cam = new THREE.PerspectiveCamera(60, W / H, 0.05, 300);
(window as any).show = (what: string, mount: string, view: string, at: number) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a6d8);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), new THREE.MeshBasicMaterial({ color: 0x5a8f3a }));
  ground.position.y = -0.5;
  scene.add(ground);
  // a stand-in for the rider
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), new THREE.MeshBasicMaterial({ color: 0x8a8f99 }));
  body.position.set(0, 0.9, 0);
  scene.add(body);
  const fire = new FireParticles();
  scene.add(fire.group);
  const fx = new AbilityFx(fire);
  scene.add(fx.group);
  fx.setViewer(cam.position);
  const light = new EmberFx(MOUNT_LOOK);
  scene.add(light.group);
  light.viewer = cam.position;
  if (view === 'side') { cam.position.set(0, 3.2, 8.5); cam.lookAt(0, 1.1, 0); }
  else if (view === 'three') { cam.position.set(4.6, 3.4, 5.4); cam.lookAt(0, 0.9, 0); }
  else if (view === 'low') { cam.position.set(0, 1.62, 0.2); body.visible = false; cam.lookAt(0, 0.9, -3); }
  else { cam.position.set(0, 11, 4); cam.lookAt(0, 0, 0); }
  const marks: any[] = [];
  if (what === 'bite') marks.push({ id: 1, k: 'fang', x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: -6, r: 5, age: 0, ttl: 0.7, by: 'me', mount });
  if (what === 'warn') marks.push({ id: 1, k: 'thunder_warn', x: 0, y: 0, z: 0, r: 4, age: 0, ttl: 1.6, by: 'me', mount });
  if (what === 'hit') marks.push({ id: 1, k: 'thunder_hit', x: 0, y: 0, z: 0, r: 4, age: 0, ttl: 1.2, by: 'me', mount });
  if (marks.length && view === 'close') { cam.position.set(2.6, 1.9, -0.6); cam.lookAt(0, 1.0, -3); }
  if (marks.length && view === 'three') { cam.position.set(4.6, 3.4, 5.4); cam.lookAt(0, 0.9, what === 'bite' ? -2.4 : 0); }
  if (what === 'cast') fx.startSummon(mount as any, 0, 0, 0);
  else if (what === 'arrive') fx.arriveSummon(mount as any, 0, 0, 0);
  else if (what === 'fizzle') { fx.startSummon(mount as any, 0, 0, 0); }
  else if (what === 'puff') light.puff(0, 0, 0, mountLook(mount as any));
  let t = 0;
  let stopped = false;
  while (t < at) {
    const step = Math.min(0.016, at - t);
    if (what === 'fizzle' && !stopped && t >= 0.6) { fx.stopSummon(0, 0); stopped = true; }
    fx.sync(marks, step);
    light.update(step, t);
    fire.update(step);
    t += step;
  }
  renderer.render(scene, cam);
  fx.destroy();
  light.destroy();
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
  const [what, mount, view, at] = shot.split(':');
  await page.evaluate(([w, m, v, t]) => window.show(w, m, v, Number(t)), [what, mount, view, at ?? '0.5']);
  await page.locator('canvas').screenshot({ path: `${outDir}/${what}-${mount}-${view}-${at}.png` });
  console.log('saved', shot);
}
await browser.close();
rmSync(work, { recursive: true, force: true });
if (errors.length) console.log('errors', errors);
