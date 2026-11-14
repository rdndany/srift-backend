// Times chunk meshing on real terrain, phase by phase. Usage: npx tsx scripts/mesh-bench.ts [chunks=6]
import { WorldGenerator, computeLight, WORLD_HEIGHT } from '@solrift/shared';
import { REGION, assembleRegion, meshChunk } from '../apps/web/src/game/mesher';

const n = Number(process.argv[2] ?? 6);
const gen = new WorldGenerator(1337);
const cache = new Map<string, Uint16Array>();
const get = (cx: number, cz: number): Uint16Array => {
  const k = `${cx},${cz}`;
  let c = cache.get(k);
  if (!c) cache.set(k, (c = gen.generateChunk(cx, cz)));
  return c;
};
// Warm everything up first (generation is not what is being measured).
for (let cx = -n - 1; cx <= n + 1; cx++) for (let cz = -n - 1; cz <= n + 1; cz++) get(cx, cz);

let tAsm = 0;
let tLight = 0;
let tMesh = 0;
let verts = 0;
let count = 0;
const regions: Uint16Array[] = [];
for (let pass = 0; pass < 2; pass++) {
  for (let cx = -n; cx <= n; cx++) {
    for (let cz = -n; cz <= n; cz++) {
      let t = performance.now();
      const region = assembleRegion(get, cx, cz);
      const asm = performance.now() - t;
      t = performance.now();
      const r = meshChunk(region);
      const mesh = performance.now() - t;
      if (pass === 0) continue; // the first pass warms the JIT
      tAsm += asm;
      tMesh += mesh;
      count++;
      verts += (r.opaque?.positions.length ?? 0) / 3 + (r.translucent?.positions.length ?? 0) / 3;
      if (regions.length < 12) regions.push(region);
    }
  }
}
// The lighting alone, on the same regions.
for (const region of regions) {
  const t = performance.now();
  computeLight(region, REGION, WORLD_HEIGHT, REGION);
  tLight += performance.now() - t;
}
console.log(`chunks ${count}: assemble ${(tAsm / count).toFixed(2)} ms, mesh (incl. light) ${(tMesh / count).toFixed(2)} ms, ${(verts / count).toFixed(0)} vertices each`);
console.log(`light alone on full-height regions: ${(tLight / regions.length).toFixed(2)} ms`);
