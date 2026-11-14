// Renders the biome map of the generated land to screenshots/worldmap-*.png and prints how much of the world each biome takes.
//   node --import tsx scripts/worldmap.mjs [seed] [centreX] [centreZ] [sizeInBlocks] [blocksPerPixel]
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Biome, BIOME_NAMES } from '../packages/shared/src/biomes.ts';
import { Terrain, newColumnData } from '../packages/shared/src/terrain.ts';
import { SEA_LEVEL } from '../packages/shared/src/chunk.ts';

const seed = Number(process.argv[2] ?? 1337);
const cx = Number(process.argv[3] ?? 0);
const cz = Number(process.argv[4] ?? 0);
const size = Number(process.argv[5] ?? 4096);
const step = Number(process.argv[6] ?? 4);

const COLORS = {
  [Biome.OCEAN]: [38, 84, 190],
  [Biome.DEEP_OCEAN]: [24, 52, 140],
  [Biome.FROZEN_OCEAN]: [140, 176, 226],
  [Biome.WARM_OCEAN]: [30, 160, 214],
  [Biome.RIVER]: [70, 120, 220],
  [Biome.FROZEN_RIVER]: [170, 200, 240],
  [Biome.BEACH]: [238, 222, 160],
  [Biome.SNOWY_BEACH]: [226, 230, 236],
  [Biome.STONY_SHORE]: [140, 140, 138],
  [Biome.PLAINS]: [128, 190, 76],
  [Biome.FOREST]: [58, 136, 54],
  [Biome.BIRCH_FOREST]: [100, 160, 80],
  [Biome.DARK_FOREST]: [30, 82, 38],
  [Biome.FLOWER_FOREST]: [186, 120, 190],
  [Biome.SWAMP]: [86, 100, 58],
  [Biome.SAVANNA]: [190, 176, 80],
  [Biome.JUNGLE]: [24, 150, 40],
  [Biome.DESERT]: [232, 210, 130],
  [Biome.BADLANDS]: [200, 108, 56],
  [Biome.SNOW]: [244, 248, 252],
  [Biome.SNOWY_TAIGA]: [190, 214, 214],
  [Biome.ICE_SPIKES]: [150, 220, 250],
  [Biome.TAIGA]: [64, 112, 96],
  [Biome.OLD_TAIGA]: [92, 88, 56],
  [Biome.WINDSWEPT_HILLS]: [130, 140, 126],
  [Biome.MOUNTAIN]: [200, 204, 210],
  [Biome.STONY_PEAKS]: [120, 112, 108],
  [Biome.MEADOW]: [160, 220, 120],
  [Biome.CHERRY_GROVE]: [250, 170, 200],
  [Biome.MUSHROOM_FIELDS]: [180, 100, 120],
};

const terrain = new Terrain(seed);
const o = newColumnData();
const n = Math.floor(size / step);
const raw = Buffer.alloc((n * 3 + 1) * n);
const count = {};
let total = 0;
let land = 0;
for (let j = 0; j < n; j++) {
  raw[j * (n * 3 + 1)] = 0;
  for (let i = 0; i < n; i++) {
    const x = cx - size / 2 + i * step;
    const z = cz - size / 2 + j * step;
    terrain.sample(x, z, o);
    count[o.biome] = (count[o.biome] ?? 0) + 1;
    total++;
    if (o.height >= SEA_LEVEL) land++;
    const base = COLORS[o.biome] ?? [255, 0, 255];
    const shade = o.height >= SEA_LEVEL ? 0.82 + Math.min(0.3, (o.height - SEA_LEVEL) / 260) : 1;
    const p = j * (n * 3 + 1) + 1 + i * 3;
    raw[p] = Math.min(255, base[0] * shade);
    raw[p + 1] = Math.min(255, base[1] * shade);
    raw[p + 2] = Math.min(255, base[2] * shade);
  }
}

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(n, 0);
ihdr.writeUInt32BE(n, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
mkdirSync('screenshots', { recursive: true });
const file = `screenshots/worldmap-${seed}-${cx}-${cz}.png`;
writeFileSync(file, png);
console.log(`wrote ${file} (${n}x${n}, ${step} blocks/pixel); land ${((land / total) * 100).toFixed(1)}%`);
for (const [id, k] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`${(BIOME_NAMES[id] ?? id).padEnd(18)} ${((k / total) * 100).toFixed(1)}%`);
