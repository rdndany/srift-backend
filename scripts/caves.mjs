// Counts what the caves of a seed are made of and where to find each kind, and optionally takes a screenshot of each.
//   node --import tsx scripts/caves.mjs [seed] [chunkRadius]            (prints the counts and a list of places)
//   node --import tsx scripts/caves.mjs [seed] [chunkRadius] shoot [url] (also screenshots them with Playwright)
import { mkdirSync } from 'node:fs';
import { B, CHUNK_SIZE, WORLD_HEIGHT, WorldGenerator, blockIndex } from '../packages/shared/src/index.ts';

const seed = Number(process.argv[2] ?? 1337);
const radius = Number(process.argv[3] ?? 10);
const shoot = process.argv[4] === 'shoot';
const url = process.argv[5] ?? 'http://localhost:3000';

const gen = new WorldGenerator(seed);
const NAMES = Object.fromEntries(Object.entries(B).map(([k, v]) => [v, k]));
const WATCH = [
  B.MOSS_BLOCK, B.CAVE_VINES, B.CAVE_VINES_BERRIES, B.FLOWERING_AZALEA, B.SPORE_BLOSSOM, B.CLAY, B.GLOW_LICHEN,
  B.DRIPSTONE_BLOCK, B.STALAGMITE_BASE, B.STALAGMITE_TIP, B.STALACTITE_BASE, B.STALACTITE_TIP,
  B.AMETHYST_BLOCK, B.BUDDING_AMETHYST, B.AMETHYST_CLUSTER, B.CALCITE, B.SMOOTH_BASALT, B.SCULK, B.CHEST, B.COBWEB,
  B.GOLD_ORE, B.DIAMOND_ORE, B.IRON_ORE, B.COAL_ORE, B.LAPIS_ORE, B.REDSTONE_ORE, B.EMERALD_ORE,
];
const counts = new Map();
let air = 0;
let rock = 0;
let seals = 0;
/** The first chunk-local spot of each kind: where to go and look. */
const spots = new Map();
const t0 = Date.now();
let chunks = 0;
for (let cz = -radius; cz <= radius; cz++) {
  for (let cx = -radius; cx <= radius; cx++) {
    const blocks = gen.generateChunk(cx, cz);
    chunks++;
    seals += gen.caveSeals(cx, cz).length;
    for (let y = 5; y < 60; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = blocks[blockIndex(lx, y, lz)];
          if (id === B.AIR) air++;
          else rock++;
          if (WATCH.includes(id)) {
            counts.set(id, (counts.get(id) ?? 0) + 1);
            const key = id;
            const kind = gen.caveKindAt(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz);
            if (!spots.has(`${key}`) || (id === B.CHEST && spots.size < 1000)) spots.set(`${key}`, { x: cx * CHUNK_SIZE + lx, y, z: cz * CHUNK_SIZE + lz, kind });
          }
        }
      }
    }
  }
}
const ms = Date.now() - t0;
console.log(`${chunks} chunks in ${ms} ms (${(ms / chunks).toFixed(1)} ms each), underground (y 5..59) air ${(100 * air / (air + rock)).toFixed(2)}%`);
console.log(`walls of rubble planned: ${seals}`);
for (const id of WATCH) console.log(String(NAMES[id]).padEnd(20), String(counts.get(id) ?? 0).padStart(8), spots.has(`${id}`) ? JSON.stringify(spots.get(`${id}`)) : '');

if (shoot) {
  const { chromium } = await import('playwright');
  mkdirSync('screenshots', { recursive: true });
  console.log('screenshots not wired in this script yet: see scripts/caveshots.mjs');
}
