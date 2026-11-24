// A walk or a run as a strip of frames, seen from the side (or the front, or the back), to judge how a gait looks.
// Usage: node scripts/gait-strip.mjs [out.png] [class=warrior] [speed=4.3] [view=side|front|back|three] [frames=8] [span=0.8 seconds] [held=none]
//        [outfit=none|id] [armor=none|iron|leather|gold|diamond|class:warrior] [mode=walk|jump|fall|swing|blow|block|arc] [moveF=1] [moveR=0] [turn=0 rad/s] [wings=0: a number of WINGS, with mode=fly] [offhand=none|torch|orb|dagger|shield|...]   (speed 4.3 is a walk, 5.9 a run)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';

const outFile = process.argv[2] ?? 'screenshots/gait/strip.png';
const cls = process.argv[3] ?? 'warrior';
const speed = Number(process.argv[4] ?? 4.3);
const view = process.argv[5] ?? 'side';
const frames = Number(process.argv[6] ?? 8);
const span = Number(process.argv[7] ?? 0.8);
const held = process.argv[8] ?? 'none';
const outfit = process.argv[9] ?? 'none';
const armor = process.argv[10] ?? 'none';
mkdirSync(dirname(outFile), { recursive: true });
const root = resolve('.').replace(/\\/g, '/');

const entry = `${root}/scripts/.gait-entry.ts`;
writeFileSync(
  entry,
  `import * as THREE from 'three';
import { Character } from '${root}/apps/web/src/game/character';
import { I, B, OUTFITS, armorId, allItems, getItem } from '@solrift/shared';
import { buildAtlas } from '${root}/apps/web/src/game/atlas';
import { HeldItem } from '${root}/apps/web/src/game/heldItem';
const atlas = buildAtlas();
const hand = new HeldItem(atlas.canvas, atlas.texture);
const figureOf = (id: number): THREE.Object3D | null => (getItem(id).shield ? hand.figureShield(id) : hand.figureModel(id));
const itemId = (name: string): number => (name.toLowerCase() === 'torch' ? B.TORCH : (I as any)[name.toUpperCase()] ?? allItems().find((i) => i.name === name)?.id ?? 0);
const W = 300, H = 420;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8f9bb3);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x4f7f2c }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const ch = new Character();
scene.add(ch.root);
(window as any).ch = ch;
(window as any).setup = (cls: string, held: string, speed: number, wings = 0) => {
  if (wings) { ch.setWings(wings); ch.wingFlying = true; }
  ch.setMotionClass(cls as any);
  const id = held && held !== 'none' ? itemId(held) : 0;
  if (id) ch.setHeld(id, figureOf);
  const off = (window as any).offName && (window as any).offName !== 'none' ? itemId((window as any).offName) : 0;
  if (off) ch.setShield(off, figureOf);
  (window as any).holding = !!id;
  for (let i = 0; i < 90; i++) { ch.headPivot.rotation.set(0, 0, 0); ch.animate(0.016, speed, 0, 1, (window as any).holding, false, 0, false); }
};
(window as any).dress = (outfit: string, armor: string) => {
  if (outfit !== 'none') ch.setOutfit(OUTFITS.find((o) => o.id === outfit) ?? null);
  if (armor.startsWith('class:')) ch.setArmor(['hat', 'robe', 'skirt', 'boots'].map((p) => allItems().find((i) => i.name === armor.slice(6) + '_' + p)?.id ?? 0));
  else if (armor !== 'none') ch.setArmor([0, 1, 2, 3].map((i) => armorId(i, armor as any)));
};
(window as any).mode = 'walk';
(window as any).step = (n: number, dt: number, speed: number) => {
  const m = (window as any).mode as string;
  for (let i = 0; i < n; i++) {
    ch.headPivot.rotation.set(0, 0, 0);
    // 'jump': rising, 'fall': dropping, 'swing': caught part way through a blow, 'block': guarding
    // 'arc': a whole jump: up at 7 blocks/s, back to the ground after about 0.64 seconds
    const w = window as any;
    w.t = (w.t ?? 0) + dt;
    const vy = m === 'fly' ? 0 : m === 'arc' ? 7 - 22 * w.t : m === 'jump' ? 4 : m === 'fall' ? -6 : 0;
    ch.animate(dt, speed, m === 'arc' || m === 'fly' ? w.turn ?? 0 : 0, m === 'swing' ? 0.35 : m === 'blow' ? Math.min(0.999, w.t / (w.span || 0.3)) : 1, w.holding, m === 'block', vy, m === 'jump' || m === 'fall' || m === 'fly' || (m === 'arc' && w.t < 0.64));
  }
};
(window as any).dir = (f: number, r: number, turn: number) => { ch.moveF = f; ch.moveR = r; (window as any).turn = turn; };
(window as any).shot = (view: string) => {
  const yaw: Record<string, number> = { side: Math.PI / 2, front: Math.PI, back: 0, three: Math.PI * 0.75 };
  ch.root.rotation.y = yaw[view] ?? Math.PI / 2;
  cam.position.set(0, 1.1, 6.0 / ((window as any).zoom || 1));
  cam.lookAt(0, 1.0, 0);
  ch.root.updateMatrixWorld(true);
  renderer.render(scene, cam);
};
`,
);
const out = `${root}/scripts/.gait-bundle.js`;
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: out, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 300, height: 420 } });
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently/.test(m.text()) && console.log('[page]', m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[error]', e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: out });
await page.evaluate(([o, a]) => window.dress(o, a), [outfit, armor]);
// (the way it goes against the way it faces, and how fast it turns: forward 1 / right 0 / turn 0; e.g. 0 1 0 is a jump to the right)
const [moveF, moveR, turn] = [Number(process.argv[12] ?? 1), Number(process.argv[13] ?? 0), Number(process.argv[14] ?? 0)];
await page.evaluate(([f, r, t]) => window.dir(f, r, t), [moveF, moveR, turn]);
await page.evaluate((n) => (window.offName = n), process.argv[16] ?? 'none');
await page.evaluate(([c, h, s, wg]) => window.setup(c, h, s, wg), [cls, held, speed, Number(process.argv[15] ?? 0)]);
await page.evaluate((m) => (window.mode = m), process.argv[11] ?? 'walk');
await page.evaluate((s) => (window.span = s), span);
await page.evaluate((z) => (window.zoom = z), Number(process.argv[17] ?? 1));
if (Number(process.argv[15] ?? 0)) console.log('wings', await page.evaluate(() => [window.ch.wingNo, !!window.ch.wingRig, window.ch.wingW]));
const bufs = [];
const dt = span / frames;
for (let i = 0; i < frames; i++) {
  await page.evaluate(([n, dt, s]) => window.step(n, dt, s), [i === 0 ? 0 : Math.max(1, Math.round(dt / 0.016)), 0.016, speed]);
  await page.evaluate((v) => window.shot(v), view);
  bufs.push(await page.locator('canvas').screenshot());
}
// (What is held in the off hand must not turn more every frame: after all those frames it is still within a turn of the arm.)
console.log('off hand turned', await page.evaluate(() => Math.round(window.ch.offMount.rotation.x * 1000) / 1000), 'rad');
await browser.close();
const cols = Math.min(frames, 8);
const rows = Math.ceil(frames / cols);
await sharp({ create: { width: 300 * cols, height: 420 * rows, channels: 3, background: '#000' } })
  .composite(bufs.map((b, i) => ({ input: b, left: (i % cols) * 300, top: Math.floor(i / cols) * 420 })))
  .png()
  .toFile(outFile);
console.log('saved', outFile);




