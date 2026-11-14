// Look at the Warrior's figure during a Shield Bash, moment by moment, from the side and from three quarters: bundles the character for a
// browser, plays the bash from 0 seconds, and saves a picture at each time asked for.
// Usage: node scripts/bash-pose-view.mjs [outDir] [times=0,0.05,0.09,0.13,0.18,0.25,0.4] [views=side,three]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/bash-pose';
const times = (process.argv[3] ?? '0,0.05,0.09,0.13,0.18,0.25,0.4').split(',').map(Number);
const views = (process.argv[4] ?? 'side,three').split(',');
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');
const work = join(tmpdir(), 'solrift-bash-pose');
mkdirSync(work, { recursive: true });
const entry = join(work, 'entry.ts').replace(/\\/g, '/');
const bundle = join(work, 'bundle.js');

writeFileSync(
  entry,
  `import * as THREE from 'three';
import { Character } from '${root}/apps/web/src/game/character';
import { getItem, I, armorId } from '@solrift/shared';
import { buildAtlas } from '${root}/apps/web/src/game/atlas';
import { HeldItem } from '${root}/apps/web/src/game/heldItem';
const atlas = buildAtlas();
const hand = new HeldItem(atlas.canvas, atlas.texture);
const figureOf = (id: number): THREE.Object3D | null => (getItem(id).shield ? hand.figureShield(id) : hand.figureModel(id));
const W = 640, H = 600;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7d6aa8);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x4f7f2c }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const ch = new Character();
scene.add(ch.root);
ch.setArmor([0, 1, 2, 3].map((i) => armorId(i, 'iron' as any)));
ch.setHeld(I.GREATSWORD, figureOf);
ch.setShield(I.SHIELD, figureOf);
(window as any).show = (view: string, at: number) => {
  // a figure standing still, then the bash played in steps of a frame up to the moment asked for
  for (let i = 0; i < 20; i++) ch.animate(0.03, 0, 0, 1, true, false, 0, false);
  const step = 1 / 60;
  let t = 0;
  while (t <= at + 1e-6) {
    ch.bashAge = t;
    ch.animate(step, 0, 0, 1, true, false, 0, false);
    t += step;
  }
  ch.bashAge = 9;
  // facing to the right of the picture from the side
  ch.root.rotation.y = view === 'three' ? Math.PI * 0.8 : Math.PI / 2;
  cam.position.set(0, 1.9, 7.4);
  cam.lookAt(0, 1.45, 0);
  ch.root.updateMatrixWorld(true);
  renderer.render(scene, cam);
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
for (const view of views) {
  for (const at of times) {
    await page.evaluate(([v, t]) => window.show(v, t), [view, at]);
    await page.locator('canvas').screenshot({ path: `${outDir}/bash-${view}-${at}.png` });
    console.log('saved', view, at);
  }
}
await browser.close();
rmSync(work, { recursive: true, force: true });
if (errors.length) console.log('errors', errors);
