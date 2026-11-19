// Packs the pictures that apps/web/src/components/beyondShots.ts names into apps/web/public/beyond (1600x900 JPEG).
// npx tsx scripts/beyondpack.ts <dir> [<dir> ...]   (a picture is taken from the first dir that has it)
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { SHOTS } from '../apps/web/src/components/beyondShots';

const dirs = process.argv.slice(2);
const out = 'apps/web/public/beyond';
mkdirSync(out, { recursive: true });
const files = new Set<string>();
const add = (s: { file: string }) => files.add(s.file);
SHOTS.hero.forEach(add);
add(SHOTS.about);
SHOTS.biomes.forEach(add);
SHOTS.featured.forEach(add);
Object.values(SHOTS.realms).flat().forEach(add);
SHOTS.places.forEach(add);
Object.values(SHOTS.caves).forEach(add);
SHOTS.air.forEach(add);
add(SHOTS.codex);
let missing = 0;
for (const f of files) {
  const src = dirs.map((d) => `${d}/${f}.jpg`).find(existsSync);
  if (!src) {
    console.log('MISSING', f);
    missing++;
    continue;
  }
  await sharp(src).resize(1600, 900, { fit: 'cover' }).jpeg({ quality: 76, mozjpeg: true }).toFile(`${out}/${f}.jpg`);
}
console.log(files.size - missing, 'packed,', missing, 'missing');
