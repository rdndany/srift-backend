// The first-person hand through a weapon's swing, as a sheet: one row per variant of the swing (a slash, a backhand), a column per moment.
// Usage: node scripts/sword-hand-view.mjs [out.png] [item=iron_sword] [times=0,0.15,0.3,0.45,0.55,0.7] [variants=2]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';

const outFile = process.argv[2] ?? 'screenshots/sword-hand/sheet.png';
const item = process.argv[3] ?? 'iron_sword';
const times = (process.argv[4] ?? '0,0.15,0.3,0.45,0.55,0.7').split(',').map(Number);
const cols = times.length;
const perRow = Math.min(cols, Number(process.argv[6] ?? 3));
const variants = Number(process.argv[5] ?? 2);
mkdirSync(dirname(outFile), { recursive: true });
const root = resolve('.').replace(/\\/g, '/');
const work = join(tmpdir(), 'solrift-sword-hand');
mkdirSync(work, { recursive: true });
const entry = join(work, 'entry.ts').replace(/\\/g, '/');
const bundle = join(work, 'bundle.js');
const W = 480;
const H = 270;

writeFileSync(
  entry,
  `import * as THREE from 'three';
import { I, allItems } from '@solrift/shared';
import { buildAtlas } from '${root}/apps/web/src/game/atlas';
import { HeldItem } from '${root}/apps/web/src/game/heldItem';
const atlas = buildAtlas();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(${W}, ${H});
renderer.setClearColor(0x87a6d8);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
const idOf = (n: string): number => (I as any)[n.toUpperCase()] ?? allItems().find((i) => i.name === n)?.id ?? 0;
(window as any).show = (t: number, variant: number) => {
  const hand = new HeldItem(atlas.canvas, atlas.texture);
  const id = idOf('${item}');
  for (let i = 0; i < 40; i++) hand.update(1 / 60, id, 0, ${W} / ${H}, 0, false, 0, 0);
  hand.holdSwing(t, variant);
  hand.update(1 / 60, id, 0, ${W} / ${H}, 0, false, 0, 0);
  renderer.clear();
  hand.render(renderer);
};
`,
);
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: bundle, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[error]', e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: bundle });
const bufs = [];
for (let v = 0; v < variants; v++) {
  for (let c = 0; c < cols; c++) {
    await page.evaluate(([t, vv]) => window.show(t, vv), [times[c], v]);
    bufs.push(await page.locator('canvas').screenshot());
  }
}
await browser.close();
rmSync(work, { recursive: true, force: true });
await sharp({ create: { width: W * perRow, height: H * Math.ceil((cols * variants) / perRow), channels: 3, background: '#000' } })
  .composite(bufs.map((b, i) => ({ input: b, left: (i % perRow) * W, top: Math.floor(i / perRow) * H })))
  .png()
  .toFile(outFile);
console.log('saved', outFile);
