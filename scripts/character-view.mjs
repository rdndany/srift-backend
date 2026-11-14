// Look at a class's figure from several sides, fast: bundles the character model for the browser and saves pictures.
// Usage: node scripts/character-view.mjs [outDir] [class=mage] [views=front,side,back,three,close] [held=none] [offhand=none] [armor=none|material[:h,c,l,b]]
// (held and offhand are item names as in `I`: wand, staff, orb, ...)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/character';
const cls = process.argv[3] ?? 'mage';
const views = (process.argv[4] ?? 'front,side,back,three,close').split(',');
const held = process.argv[5] ?? 'none';
const off = process.argv[6] ?? 'none';
const armor = process.argv[7] ?? 'none';
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');

const entry = `${root}/scripts/.character-entry.ts`;
writeFileSync(
  entry,
  `import * as THREE from 'three';
import { Character } from '${root}/apps/web/src/game/character';
import { getItem, I, armorId, allItems } from '@solrift/shared';
import { buildAtlas } from '${root}/apps/web/src/game/atlas';
import { HeldItem } from '${root}/apps/web/src/game/heldItem';
const atlas = buildAtlas();
const hand = new HeldItem(atlas.canvas, atlas.texture);
const figureOf = (id: number): THREE.Object3D | null => (getItem(id).shield ? hand.figureShield(id) : hand.figureModel(id));
const W = 640, H = 760;
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
(window as any).ch = ch;
(window as any).setup = (cls: string | null, held: string, off: string) => {
  if (cls) ch.setArmor(['hat', 'robe', 'skirt', 'boots'].map((p) => allItems().find((i) => i.name === cls + '_' + p)?.id ?? 0));
  const id = (n: string): number => (n && n !== 'none' ? (I as any)[n.toUpperCase()] : 0);
  ch.setHeld(id(held), figureOf);
  ch.setShield(id(off), figureOf);
  (window as any).holding = id(held) !== 0;
};
// armor: a material (leather, gold, iron, diamond) for all four pieces, or e.g. iron:1,1,0,1 for some of them
(window as any).armor = (spec: string) => {
  if (!spec || spec === 'none') return ch.setArmor([0, 0, 0, 0]);
  const [mat, which] = spec.split(':');
  const on = (which ?? '1,1,1,1').split(',').map((v) => v === '1');
  ch.setArmor([0, 1, 2, 3].map((i) => (on[i] ? armorId(i, mat as any) : 0)));
};
(window as any).show = (view: string) => {
  ch.setRiding(view === 'ride');
  // 'cast' is the figure at the top of a swing, seen from the side
  ch.pose(0, view === 'cast' ? 0.25 : 0, (window as any).holding);
  ch.root.rotation.y = 0;
  // 'walk' and 'run' are caught mid-stride, seen from the side and from behind and above
  if (view === 'walk' || view === 'run' || view === 'ride') for (let i = 0; i < (view === 'ride' ? 40 : 37); i++) ch.animate(0.03, view === 'run' ? 8 : view === 'ride' ? 9 : 5, 0, 0, (window as any).holding, false, 0, false);
  const yaw: Record<string, number> = { front: Math.PI, side: Math.PI / 2, back: 0, three: Math.PI * 0.8, close: Math.PI, cast: Math.PI / 2, walk: Math.PI * 0.7, run: Math.PI * 0.65, ride: Math.PI * 0.7 };
  ch.root.rotation.y = yaw[view] ?? Math.PI;
  if (view === 'close') { cam.position.set(0, 2.1, 3.6); cam.lookAt(0, 1.85, 0); }
  else { cam.position.set(0, 1.9, 7.4); cam.lookAt(0, 1.55, 0); }
  ch.root.updateMatrixWorld(true);
  renderer.render(scene, cam);
};
`,
);
const out = `${root}/scripts/.character-bundle.js`;
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: out, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 640, height: 760 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'log') && console.log('[page]', m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: out });
await page.evaluate(([c, h, o]) => window.setup(c === 'none' ? null : c, h, o), [cls, held, off]);
await page.evaluate((a) => window.armor(a), armor);
for (const v of views) {
  await page.evaluate((v) => window.show(v), v);
  await page.locator('canvas').screenshot({ path: `${outDir}/${cls}-${v}.png` });
  console.log('saved', v);
}
await browser.close();
if (errors.length) console.log('errors', errors);
