// Look at the token outfits (the glowing sets) from several sides, fast: bundles the character model for the browser and saves pictures.
// Usage: node scripts/outfit-view.mjs [outDir] [ids=all|id,id|warrior|mage|ranger] [views=front,back,side,three] [bg=0x7d6aa8]
// Saves <outDir>/<id>-<view>.png ('run' is caught mid-stride, 'close' is the head and shoulders, 'top' looks down on the head).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/outfits';
const which = process.argv[3] ?? 'all';
const views = (process.argv[4] ?? 'front,back,side,three').split(',');
mkdirSync(outDir, { recursive: true });
const root = resolve('.').replace(/\\/g, '/');

const entry = `${root}/scripts/.outfit-entry.ts`;
writeFileSync(
  entry,
  `import * as THREE from 'three';
import { Character } from '${root}/apps/web/src/game/character';
import { OUTFITS } from '@solrift/shared';
const W = 520, H = 640;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4a4560);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x3f6a2c }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const ch = new Character();
scene.add(ch.root);
(window as any).ch = ch;
(window as any).ids = OUTFITS.map((o) => o.id + ':' + o.cls);
(window as any).wear = (id: string) => ch.setOutfit(OUTFITS.find((o) => o.id === id) ?? null);
// Z-fighting: faces of two blocks of one part that face the same way, lie in (nearly) one plane and overlap flicker as the camera moves.
(window as any).audit = () => {
  ch.root.updateMatrixWorld(true);
  const groups = new Map<THREE.Object3D, THREE.Mesh[]>();
  ch.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry || !m.geometry.getAttribute('position')) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
    const g = groups.get(m.parent!) ?? [];
    g.push(m);
    groups.set(m.parent!, g);
  });
  const setParts = new Set<THREE.Object3D>(((ch as any).dressed?.parts ?? []) as THREE.Object3D[]);
  const bias = (m: THREE.Mesh): number => { const mat: any = Array.isArray(m.material) ? m.material[0] : m.material; return mat && mat.polygonOffset ? mat.polygonOffsetFactor : 0; };
  const names: Record<string, any> = { torso: (ch as any).torso, head: (ch as any).headPivot, armL: (ch as any).armL, armR: (ch as any).armR, legL: (ch as any).legL, legR: (ch as any).legR };
  const label = (o: THREE.Object3D): string => { for (const k in names) if (names[k] === o) return k; return 'group' + o.id; };
  const out: string[] = [];
  let total = 0;
  for (const [parent, meshes] of groups) {
    type Tri = { p: THREE.Vector3[]; n: THREE.Vector3; d: number; mesh: number; bias: number; base: boolean };
    const tris: Tri[] = [];
    const body = meshes.filter((m) => !setParts.has(m));
    const vol = (m: THREE.Mesh): number => { m.geometry.computeBoundingBox(); const s = new THREE.Vector3(); m.geometry.boundingBox!.getSize(s); return s.x * s.y * s.z * m.scale.x * m.scale.y * m.scale.z; };
    body.sort((a, b) => vol(a) - vol(b));
    const baseMesh = body[0];
    meshes.forEach((m, mi) => {
      if (!setParts.has(m) && m !== baseMesh) return;
      m.updateMatrix();
      const pos = m.geometry.getAttribute('position');
      const idx = m.geometry.index;
      const count = idx ? idx.count : pos.count;
      for (let i = 0; i < count; i += 3) {
        const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrix));
        const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
        if (n.length() < 1e-9) continue;
        n.normalize();
        tris.push({ p, n, d: n.dot(p[0]), mesh: mi, bias: bias(m), base: m === baseMesh });
      }
    });
    const buckets = new Map<string, Tri[]>();
    for (const t of tris) {
      const k = [t.n.x, t.n.y, t.n.z].map((v) => Math.round(v * 20)).join(',');
      (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(t);
    }
    let found = 0;
    const sample: string[] = [];
    for (const list of buckets.values()) {
      list.sort((a, b) => a.d - b.d);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length && list[j].d - list[i].d < 0.0009; j++) {
          const a = list[i], b = list[j];
          if (a.base && b.base) continue;
          if (a.bias !== b.bias) continue;
          if (a.n.dot(b.n) < 0.995) continue;
          // 2D basis in the plane
          const u = Math.abs(a.n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
          const e1 = new THREE.Vector3().crossVectors(a.n, u).normalize();
          const e2 = new THREE.Vector3().crossVectors(a.n, e1);
          const pr = (t: Tri) => t.p.map((v) => [v.dot(e1), v.dot(e2)]);
          const A = pr(a), B = pr(b);
          let separate = false;
          for (const T of [A, B]) {
            for (let k = 0; k < 3 && !separate; k++) {
              const x = T[(k + 1) % 3][0] - T[k][0], y = T[(k + 1) % 3][1] - T[k][1];
              const ax = -y, ay = x, l = Math.hypot(ax, ay) || 1;
              const proj = (P: number[][]) => P.map((q) => (q[0] * ax + q[1] * ay) / l);
              const pa = proj(A), pb = proj(B);
              if (Math.min(...pa) >= Math.max(...pb) - 1e-4 || Math.min(...pb) >= Math.max(...pa) - 1e-4) separate = true;
            }
          }
          if (separate) continue;
          // the same face twice (a box merged twice) is not a fight we can fix by looking at it, count it all the same
          found++;
          if (sample.length < 3) sample.push('[' + a.p[0].toArray().map((v) => v.toFixed(3)).join(',') + '] n=' + a.n.toArray().map((v) => v.toFixed(2)).join(',') + ' d=' + a.d.toFixed(3) + '/' + b.d.toFixed(3));
        }
      }
    }
    if (found) { out.push(label(parent) + ': ' + found + ' ' + sample.join(' | ')); total += found; }
  }
  return { total, out };
};
(window as any).show = (view: string) => {
  ch.pose(0, 0, false);
  ch.root.rotation.y = 0;
  if (view === 'run') for (let i = 0; i < 37; i++) ch.animate(0.03, 8, 0, 0, false, false, 0, false);
  ch.updateSet(1.3, 0.016, view === 'run' ? 1 : 0);
  const yaw: Record<string, number> = { front: Math.PI, side: Math.PI / 2, back: 0, three: Math.PI * 0.8, close: Math.PI, run: Math.PI * 0.7, top: Math.PI, closeside: Math.PI / 2, closeback: 0, closethree: Math.PI * 0.8 };
  ch.root.rotation.y = yaw[view] ?? Math.PI;
  const lift = ch.setHeight;
  if (view.startsWith('close')) { cam.position.set(0, 2.4 + lift * 0.3, 3.9); cam.lookAt(0, 1.9 + lift * 0.3, 0); }
  else if (view === 'top') { cam.position.set(0, 5.4, 2.2); cam.lookAt(0, 1.9, 0); }
  else { cam.position.set(0, 1.7 + lift * 0.15, 4.6 + ch.setExtent * 1.8); cam.lookAt(0, 1.4 + lift * 0.1, 0); }
  ch.root.updateMatrixWorld(true);
  renderer.render(scene, cam);
};
`,
);
const out = `${root}/scripts/.outfit-bundle.js`;
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: out, platform: 'browser', nodePaths: [`${root}/apps/web/node_modules`, `${root}/node_modules`], logLevel: 'error' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 520, height: 640 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently/.test(m.text()) && console.log('[page]', m.text().slice(0, 300)));
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<body style="margin:0"></body>');
await page.addScriptTag({ path: out });
const all = await page.evaluate(() => window.ids);
const pick = which === 'all' ? all : which.split(',').flatMap((w) => (['warrior', 'mage', 'ranger'].includes(w) ? all.filter((a) => a.endsWith(':' + w)) : all.filter((a) => a.startsWith(w + ':'))));
for (const entry of pick) {
  const id = entry.split(':')[0];
  await page.evaluate((id) => window.wear(id), id);
  if (process.env.AUDIT) {
    const r = await page.evaluate(() => window.audit());
    console.log(id, 'z-fights:', r.total);
    for (const line of r.out) console.log('   ', line);
  }
  for (const v of views) {
    if (process.env.AUDIT && !process.env.SHOTS) break;
    await page.evaluate((v) => window.show(v), v);
    await page.locator('canvas').screenshot({ path: `${outDir}/${id}-${v}.png` });
  }
  console.log('saved', id);
}
await browser.close();
if (errors.length) console.log('errors', errors);
