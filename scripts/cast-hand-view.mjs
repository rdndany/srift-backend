// Look at the first-person hand while casting the Emberstone, moment by moment: bundles the hand for a browser, plays the cast from 0 seconds
// (five seconds in all) and saves a picture of the view at each time asked for.
// Usage: node scripts/cast-hand-view.mjs [outDir] [times=0,0.3,1.5,3,4.8]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/cast-hand';
const times = (process.argv[3] ?? '0,0.3,1.5,3,4.8').split(',').map(Number);
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');
const work = join(tmpdir(), 'solrift-cast-hand');
mkdirSync(work, { recursive: true });
const entry = join(work, 'entry.ts').replace(/\\/g, '/');
const bundle = join(work, 'bundle.js');

writeFileSync(
  entry,
  `import * as THREE from 'three';
import { I } from '@solrift/shared';
import { buildAtlas } from '${root}/apps/web/src/game/atlas';
import { HeldItem } from '${root}/apps/web/src/game/heldItem';
const atlas = buildAtlas();
const W = 960, H = 540;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x87a6d8);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
(window as any).show = (at: number) => {
  const hand = new HeldItem(atlas.canvas, atlas.texture);
  const step = 1 / 60;
  let t = 0;
  // the stone is raised first, as it is when it is chosen, and then the cast begins
  for (let i = 0; i < 40; i++) hand.update(step, I.EMBERSTONE, 0, W / H, 0, false, 0, 0);
  while (t <= at + 1e-6) {
    hand.update(step, I.EMBERSTONE, 0, W / H, 0, false, 0, Math.max(0.01, t / 5));
    t += step;
  }
  renderer.clear();
  hand.render(renderer);
};
`,
);
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: bundle, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'log') && console.log('[page]', m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: bundle });
for (const at of times) {
  await page.evaluate((t) => window.show(t), at);
  await page.locator('canvas').screenshot({ path: `${outDir}/cast-hand-${at}.png` });
  console.log('saved', at);
}
await browser.close();
rmSync(work, { recursive: true, force: true });
if (errors.length) console.log('errors', errors);
