// Look at the light of an Emberstone cast (ring, column, embers) as the cast goes on: bundles EmberFx for a browser, plays a cast from 0
// seconds and saves a picture at each time asked for.
// Usage: node scripts/ember-light-view.mjs [outDir] [times=0.3,1.5,3,4.8]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/ember-light';
const times = (process.argv[3] ?? '0.3,1.5,3,4.8').split(',').map(Number);
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');
const work = join(tmpdir(), 'solrift-ember-light');
mkdirSync(work, { recursive: true });
const entry = join(work, 'entry.ts').replace(/\\/g, '/');
const bundle = join(work, 'bundle.js');

writeFileSync(
  entry,
  `import * as THREE from 'three';
import { EmberFx } from '${root}/apps/web/src/game/emberFx';
const W = 640, H = 600;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24304a);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x3f6a26 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
(window as any).show = (at: number) => {
  const fx = new EmberFx();
  scene.add(fx.group);
  fx.viewer = new THREE.Vector3(0, 1.8, 7);
  fx.start(0, 0, 0);
  const step = 1 / 60;
  for (let t = 0; t < at; t += step) fx.update(step, t);
  cam.position.set(0, 2.4, 6.5);
  cam.lookAt(0, 1.5, 0);
  renderer.render(scene, cam);
  fx.destroy();
};
`,
);
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: bundle, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 640, height: 600 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'log') && console.log('[page]', m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: bundle });
for (const at of times) {
  await page.evaluate((t) => window.show(t), at);
  await page.locator('canvas').screenshot({ path: `${outDir}/light-${at}.png` });
  console.log('saved', at);
}
await browser.close();
rmSync(work, { recursive: true, force: true });
if (errors.length) console.log('errors', errors);
