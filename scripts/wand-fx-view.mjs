// Look at the Mage's wand without starting the game: bundles the bolt (in flight) and its burst for a browser, plays one at the times asked for,
// from the side, from behind (as the caster's own eyes see it) or from the front, and saves a picture of each moment.
// Usage: node scripts/wand-fx-view.mjs [outDir] [shots=what:view:seconds, with what bolt|hit (the wand), staffbolt|staffhit fireball|fireballhit meteorwarn|meteorhit or frostnova (view wide|ground|high|eye) and view side|eye|front|close; default bolt:side:0.05,bolt:side:0.2,bolt:eye:0.12,hit:close:0.04,hit:close:0.12,hit:close:0.3]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/wand-fx';
const wanted = (process.argv[3] ?? 'bolt:side:0.05,bolt:side:0.2,bolt:eye:0.12,hit:close:0.04,hit:close:0.12,hit:close:0.3').split(',');
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');
const work = join(tmpdir(), 'solrift-wand-view');
mkdirSync(work, { recursive: true });
const entry = join(work, 'entry.ts').replace(/\\/g, '/');
const bundle = join(work, 'bundle.js');

writeFileSync(
  entry,
  `import * as THREE from 'three';
import { AbilityFx } from '${root}/apps/web/src/game/abilityFx';
import { FireParticles } from '${root}/apps/web/src/game/fireFx';
import { WandBoltView } from '${root}/apps/web/src/game/wandFx';
import { StaffBoltView } from '${root}/apps/web/src/game/staffFx';
import { FireballBoltView } from '${root}/apps/web/src/game/fireballFx';
const W = 960, H = 600;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const cam = new THREE.PerspectiveCamera(70, W / H, 0.05, 300);
const SPEED = 28;
(window as any).show = (what: string, view: string, at: number) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a6d8);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), new THREE.MeshBasicMaterial({ color: 0x5a8f3a }));
  ground.position.y = -0.5;
  scene.add(ground);
  // a wall to hit, 10 blocks ahead
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 1), new THREE.MeshBasicMaterial({ color: 0x8a8378 }));
  wall.position.set(0, 2, -10.5);
  scene.add(wall);
  const fire = new FireParticles();
  scene.add(fire.group);
  const fx = new AbilityFx(fire);
  scene.add(fx.group);
  fx.setViewer(cam.position);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const group = new THREE.Group();
  scene.add(group);
  const step = 1 / 60;
  const staff = what.startsWith('staff');
  const fireball = what.startsWith('fireball');
  const meteor = what.startsWith('meteor');
  const frost = what === 'frostnova';
  const RANGER = {
    pierce: { k: 'pierce', x: 0.3, y: 1.45, z: -0.6, x2: 0, y2: 1.6, z2: -10.3, r: 0.9, ttl: 0.5 },
    roll: { k: 'roll', x: 0, y: 0.9, z: -6, x2: 0, y2: 0.9, z2: -12.5, r: 1, ttl: 0.86 },
    trapset: { k: 'trap_set', x: 0, y: 0, z: -9, x2: 2.5, y2: 1.4, z2: -5, r: 1.3, ttl: 90 },
    trapsnap: { k: 'trap_snap', x: 0, y: 0, z: -9, r: 1.3, ttl: 0.8 },
    rainmark: { k: 'rain_mark', x: 0, y: 0, z: -9, r: 4, ttl: 4.2 },
    rainhit: { k: 'rain_hit', x: 0, y: 0, z: -9, r: 4, ttl: 0.5 },
    // an arrow that stuck in the wall (its face is at z = -10), flying slightly down and to the right
    arrowstick: { k: 'arrow_stick', x: 0.5, y: 1.8, z: -10, x2: 0.62, y2: 1.74, z2: -11, r: 0, ttl: 5 },
  };
  if (RANGER[what]) {
    wall.visible = what === 'pierce' || what === 'arrowstick';
    const list = [{ id: 1, age: 0, by: 'me', ...RANGER[what] }];
    // the camera first, for what is laid out near it
    if (view === 'eye') { cam.position.set(0, 1.62, 0.2); cam.lookAt(0, 1.2, -9); }
    else if (view === 'high') { cam.position.set(0, 13, -5); cam.lookAt(0, 0, -9); }
    else if (view === 'stuck') { cam.position.set(2.4, 2.0, -7.6); cam.lookAt(0.5, 1.8, -10); }
    else if (view === 'close') { cam.position.set(3.5, 1.8, -6); cam.lookAt(0, 0.4, -9); }
    else if (view === 'side') { cam.position.set(6, 2.4, -5); cam.lookAt(0, 1.4, -8); }
    else { cam.position.set(9, 5, -3); cam.lookAt(0, 0.5, -9); }
    let t = 0;
    while (t < at) {
      const s = Math.min(0.016, at - t);
      fx.sync(list, s);
      fire.update(s);
      t += s;
    }
  } else if (what === 'arcaneshield' || what === 'shieldbreak') {
    // a figure the size of a player stands in it; a shield that breaks is soaked up 1.5 s after it goes up (the shot time counts from the start)
    wall.visible = false;
    const figure = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), new THREE.MeshBasicMaterial({ color: 0x6b4a8a }));
    figure.position.set(0, 0.9, -9);
    scene.add(figure);
    if (view === 'eye') { cam.position.set(0, 1.62, -9); cam.lookAt(0, 1.5, -15); figure.visible = false; }
    else if (view === 'high') { cam.position.set(0, 9, -6); cam.lookAt(0, 0, -9); }
    else if (view === 'close') { cam.position.set(3.2, 1.8, -6.5); cam.lookAt(0, 1, -9); }
    else { cam.position.set(6, 2.6, -4.5); cam.lookAt(0, 1, -9); }
    const list = [{ id: 1, k: 'guard_arcane', x: 0, y: 0, z: -9, r: 1, age: 0, ttl: 6, by: 'me' }] as any[];
    let t = 0;
    while (t < at) {
      const s = Math.min(0.016, at - t);
      fx.sync(what === 'shieldbreak' && t >= 1.5 ? [] : list, s);
      fire.update(s);
      t += s;
    }
  } else if (frost) {
    // the mage stands in the middle of it, 9 blocks ahead of where the camera usually is
    wall.visible = false;
    const list = [{ id: 1, k: 'frost_nova', x: 0, y: 0, z: -9, r: 5, age: 0, ttl: 2.5, by: 'me' }] as any[];
    let t = 0;
    while (t < at) {
      const s = Math.min(0.016, at - t);
      fx.sync(list, s);
      fire.update(s);
      t += s;
    }
    if (view === 'high') { cam.position.set(0, 13, -4.5); cam.lookAt(0, 0, -9); }
    else if (view === 'eye') { cam.position.set(0, 1.62, -9); cam.lookAt(0, 1, -15); }
    else if (view === 'wide') { cam.position.set(-12, 7, -1); cam.lookAt(0, 1, -9); }
    else { cam.position.set(8, 3.5, -3); cam.lookAt(0, 0.5, -9); }
  } else if (meteor) {
    wall.visible = false;
    const hit = what === 'meteorhit';
    const list = [{ id: 1, k: hit ? 'meteor_hit' : 'meteor_warn', x: 0, y: 0, z: -12, r: 4, age: 0, ttl: hit ? 1.8 : 1.7, by: 'me' }] as any[];
    let t = 0;
    while (t < at) {
      const s = Math.min(0.016, at - t);
      fx.sync(list, s);
      fire.update(s);
      t += s;
    }
    if (view === 'wide') { cam.position.set(-16, 9, 2); cam.lookAt(3, 9, -10); }
    else if (view === 'eye') { cam.position.set(0, 1.62, 0.2); cam.lookAt(0, 1.5, -12); }
    else { cam.position.set(7, 4, -4); cam.lookAt(0, 1, -12); }
  } else if (what === 'bolt' || what === 'staffbolt' || what === 'fireball') {
    const speed = fireball ? 22 : staff ? 24 : SPEED;
    const p = { x: 0.3, y: 1.45, z: -0.6, vx: 0, vy: 0, vz: -speed };
    const bolt = fireball ? new FireballBoltView(fx.voxelKit!, mat, p) : staff ? new StaffBoltView(fx.voxelKit!, mat, p) : new WandBoltView(fx.voxelKit!, mat, p);
    group.add(bolt.group);
    let t = 0;
    while (t < at) {
      p.z -= speed * step;
      t += step;
      bolt.update(p, t, step);
    }
    if (view === 'side') { cam.position.set(4.5, 1.9, p.z + 1.5); cam.lookAt(0.3, 1.45, p.z - 0.4); }
    else if (view === 'eye') { cam.position.set(0, 1.62, 0.2); cam.lookAt(0, 1.45, -8); }
    else if (view === 'front') { cam.position.set(1.5, 1.7, p.z - 4); cam.lookAt(0.3, 1.45, p.z); }
    else { cam.position.set(1.8, 1.7, p.z + 2.2); cam.lookAt(0.3, 1.45, p.z - 0.5); }
  } else {
    const list = [fireball ? { id: 1, k: 'fireball_burst', x: 0, y: 1.6, z: -9.9, r: 2, age: 0, ttl: 1, by: 'me' } : { id: 1, k: staff ? 'staff_hit' : 'wand_hit', x: 0, y: 1.6, z: -9.9, r: 0.8, age: 0, ttl: 0.6, by: 'me' }] as any[];
    let t = 0;
    while (t < at) {
      const s = Math.min(0.016, at - t);
      fx.sync(list, s);
      fire.update(s);
      t += s;
    }
    if (view === 'close') { cam.position.set(2.4, 2.0, -7.2); cam.lookAt(0, 1.6, -9.9); }
    else if (view === 'eye') { cam.position.set(0, 1.62, 0.2); cam.lookAt(0, 1.6, -9.9); }
    else if (view === 'side') { cam.position.set(6, 2.4, -6); cam.lookAt(0, 1.6, -9.9); }
    else { cam.position.set(0, 1.8, -14); cam.lookAt(0, 1.6, -9.9); }
  }
  renderer.render(scene, cam);
  fx.destroy();
  fire.dispose();
  mat.dispose();
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
