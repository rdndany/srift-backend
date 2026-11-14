// Nature E2E: flowing water and lava (and what they make together), buckets, birch and spruce
// trees, ponds, biome-tinted grass and water, desert temples, rails and webs in mineshafts, and
// the new animals and monsters (rendering, drops, water mobs).
// Usage: node scripts/nature.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const B = {
  AIR: 0, STONE: 1, DIRT: 2, GRASS: 3, SAND: 4, WATER: 5, COBBLE: 11, GLASS: 17, LAVA: 37, SANDSTONE: 42,
  OBSIDIAN: 46, COBWEB: 47, RAIL_X: 48, RAIL_Z: 49, BIRCH_LOG: 50, SPRUCE_LOG: 52, WOOL: 56, CHISELED_SANDSTONE: 57,
  ICE: 58, WATER_1: 60, WATER_7: 66, WATER_FALL: 67,
};
const I = { BUCKET: 330, WATER_BUCKET: 331, LAVA_BUCKET: 332, FEATHER: 333, MUTTON: 334, CHICKEN: 336, SLIMEBALL: 341 };
const isWater = (id) => id === B.WATER || (id >= B.WATER_1 && id <= B.WATER_FALL);

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};

await page.goto(url + '/?seed=1337&debug&nomobs', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
});

const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 900) => {
  await page.waitForTimeout(wait);
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
  });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
const at = (x, y, z) => sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);
/** Run the simulation (an open screen keeps it ticking) until `fn` is truthy in the page. */
const simulateUntil = async (fn, arg, timeout = 30000) => {
  await sc(() => window.__solrift.openMenu('inventory'));
  try {
    await page.waitForFunction(fn, arg, { timeout });
    return true;
  } catch {
    return false;
  } finally {
    await sc(() => window.__solrift.closeMenu());
  }
};
const simulate = async (ms) => {
  await sc(() => window.__solrift.openMenu('inventory'));
  await page.waitForTimeout(ms);
  await sc(() => window.__solrift.closeMenu());
};
/** Visit a column first from above so its chunks are streamed in, then go to the real spot. */
async function goTo(x, y, z, yaw = 0, pitch = 0) {
  await sc(([x, z]) => window.__solrift.teleport(x + 0.5, 230, z + 0.5), [x, z]);
  await page.waitForTimeout(2500);
  await sc(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [x, y, z, yaw, pitch]);
  await page.waitForTimeout(800);
}

await sc(() => window.__solrift.setMode('creative'));

// ---- a flat arena far from the spawn, so nothing natural gets in the way ----
const AX = 900;
const AZ = 900;
await goTo(AX, 0, AZ);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [AX, AZ]);
const FLOOR = gy + 20; // a stone platform in the air: liquids can only go where we let them
const arena = async () => {
  await sc(
    ([AX, AZ, FLOOR]) => {
      const s = window.__solrift;
      for (let x = AX - 12; x <= AX + 12; x++)
        for (let z = AZ - 12; z <= AZ + 12; z++) {
          for (let y = FLOOR + 1; y <= FLOOR + 10; y++) s.setBlock(x, y, z, 0);
          s.setBlock(x, FLOOR, z, 1);
        }
      s.setTime(0.3);
      s.teleport(AX + 0.5, FLOOR + 1, AZ - 8.5, Math.PI, -0.3);
    },
    [AX, AZ, FLOOR],
  );
  await page.waitForTimeout(600);
};
await arena();

console.log('flowing water');
await sc(([x, y, z]) => window.__solrift.setBlock(x, y, z, 5), [AX, FLOOR + 1, AZ]);
const spread = await simulateUntil(([x, y, z]) => {
  const g = window.__solrift.getBlock;
  return [1, 2, 3].every((d) => g(x + d, y, z) >= 60 && g(x + d, y, z) <= 66) && g(x + 8, y, z) === 0;
}, [AX, FLOOR + 1, AZ]);
check(spread, 'a water source spreads out in levels, and no further than seven blocks');
const levels = [];
for (let d = 1; d <= 8; d++) levels.push(await at(AX + d, FLOOR + 1, AZ));
check(levels.slice(0, 3).every((id, i, a) => i === 0 || id >= a[i - 1]), `each step away is a shallower level (${levels.join(',')})`);
await sc(([x, y, z]) => window.__solrift.setBlock(x, y, z, 0), [AX, FLOOR + 1, AZ]);
const dried = await simulateUntil(([x, y, z]) => window.__solrift.getBlock(x + 1, y, z) === 0, [AX, FLOOR + 1, AZ], 40000);
check(dried, 'take the source away and the flow dries up');

console.log('waterfall and pool');
await arena();
await sc(
  ([x, y, z]) => {
    const s = window.__solrift;
    // A stone ledge two high, with a water source on top of it at the edge.
    for (let dx = -2; dx <= 0; dx++) for (let dy = 1; dy <= 3; dy++) s.setBlock(x + dx, y + dy, z, 1);
    s.setBlock(x, y + 4, z, 5);
  },
  [AX, FLOOR, AZ],
);
const fell = await simulateUntil(([x, y, z]) => {
  const g = window.__solrift.getBlock;
  return g(x + 1, y + 4, z) > 0 && g(x + 1, y + 3, z) > 0 && g(x + 1, y + 1, z) > 0;
}, [AX, FLOOR, AZ]);
check(fell, 'water pours off the ledge and falls down the side');
await sc(([x, y, z]) => window.__solrift.teleport(x + 0.5, y + 1, z - 7.5, Math.PI, -0.2), [AX, FLOOR, AZ]);
await shot('nature-waterfall', 1200);

console.log('lava and water');
await arena();
await sc(
  ([x, y, z]) => {
    const s = window.__solrift;
    s.setBlock(x, y + 1, z, 37); // lava source...
    s.setBlock(x + 1, y + 1, z, 5); // ...touching a water source: obsidian
    s.setBlock(x - 6, y + 1, z + 4, 37); // lava on its own flows
    s.setBlock(x + 5, y + 2, z - 3, 5);
    s.setBlock(x + 5, y + 1, z - 3, 37); // water above a lava source: it becomes cobblestone? (flowing lava)
  },
  [AX, FLOOR, AZ],
);
const made = await simulateUntil(([x, y, z]) => window.__solrift.getBlock(x, y + 1, z) === 46, [AX, FLOOR, AZ]);
check(made, 'a lava source meeting water turns to obsidian');
const lavaSpread = await simulateUntil(([x, y, z]) => window.__solrift.getBlock(x - 5, y + 1, z + 4) === 38 || window.__solrift.getBlock(x - 5, y + 1, z + 4) === 68, [AX, FLOOR, AZ], 15000);
check(lavaSpread || (await at(AX - 5, FLOOR + 1, AZ + 4)) !== 0, 'lava spreads, slowly and not far');
const farLava = await at(AX - 6 + 5, FLOOR + 1, AZ + 4);
check(farLava === 0, 'it does not get further than three blocks');
await sc(([x, y, z]) => window.__solrift.teleport(x + 0.5, y + 1, z - 7.5, Math.PI, -0.3), [AX, FLOOR, AZ]);
await shot('nature-lava-obsidian', 1000);

console.log('buckets');
await arena();
await sc(
  ([x, y, z]) => {
    const s = window.__solrift;
    s.setMode('survival');
    s.clearInventory();
    s.give(330, 1);
    s.select(0);
    s.setBlock(x, y, z, 0); // a one-block pit in the platform...
    s.setBlock(x, y - 1, z, 1);
    s.setBlock(x, y, z, 5); // ...holding a water source (replacing the platform block)
    s.teleport(x + 0.5, y + 1, z - 1.5, Math.PI, -0.7);
  },
  [AX, FLOOR, AZ],
);
await page.waitForTimeout(500);
const scooped = await sc(() => window.__solrift.useBucket());
console.log('   scoop returned', scooped, JSON.stringify(await sc(() => ({ p: window.__solrift.position(), inv: window.__solrift.inventory(), mode: window.__solrift.mode() }))).slice(0, 300), await at(AX, FLOOR, AZ));
check((await sc(() => window.__solrift.countOf(331))) === 1, 'right-clicking water with a bucket fills it');
check(!isWater(await at(AX, FLOOR, AZ)), 'and the source is gone');
await sc(() => window.__solrift.useBucket());
check((await sc(() => window.__solrift.countOf(330))) === 1, 'right-clicking again pours it out and leaves an empty bucket');
check(isWater(await at(AX, FLOOR, AZ)) || isWater(await at(AX, FLOOR + 1, AZ + 0)) || isWater(await at(AX, FLOOR + 1, AZ - 1)), 'the water is back in the world');
await sc(() => window.__solrift.setMode('creative'));

console.log('trees and ponds');
await goTo(0, 0, 0);
const spawn = await sc(() => window.__solrift.position());
const trees = await sc(
  ([sx, sz]) => {
    const s = window.__solrift;
    const found = { birch: 0, spruce: 0, oak: 0 };
    for (let x = sx - 70; x <= sx + 70; x += 1)
      for (let z = sz - 70; z <= sz + 70; z += 1) {
        const top = s.surfaceY(x, z);
        if (top < 0) continue;
        for (let y = top; y > top - 14; y--) {
          const id = s.getBlock(x, y, z);
          if (id === 50) found.birch++;
          else if (id === 52) found.spruce++;
          else if (id === 6) found.oak++;
        }
      }
    return found;
  },
  [Math.floor(spawn.x), Math.floor(spawn.z)],
);
console.log('   trunks near spawn', JSON.stringify(trees));
check(trees.oak > 0, 'oak trees grow near the spawn');

// Find the biomes the world offers: look for birch and spruce further out if the spawn has none.
let birchAt = null;
let spruceAt = null;
for (const [x, z] of [[0, 0], [240, 0], [-240, 0], [0, 240], [0, -240], [240, 240], [-240, -240], [240, -240], [-240, 240], [480, 0], [-480, 0], [0, 480], [0, -480]]) {
  if (birchAt && spruceAt) break;
  await sc(([x, z]) => window.__solrift.teleport(x + 0.5, 230, z + 0.5), [x, z]);
  await page.waitForTimeout(2200);
  const f = await sc(
    ([sx, sz]) => {
      const s = window.__solrift;
      const out = { birch: null, spruce: null };
      for (let x = sx - 60; x <= sx + 60; x += 2)
        for (let z = sz - 60; z <= sz + 60; z += 2) {
          const top = s.surfaceY(x, z);
          if (top < 0) continue;
          for (let y = top; y > top - 14; y--) {
            const id = s.getBlock(x, y, z);
            if (id === 50 && !out.birch) out.birch = { x, y, z };
            if (id === 52 && !out.spruce) out.spruce = { x, y, z };
          }
        }
      return out;
    },
    [x, z],
  );
  birchAt = birchAt ?? f.birch;
  spruceAt = spruceAt ?? f.spruce;
}
check(!!birchAt, `birch trees exist (${JSON.stringify(birchAt)})`);
check(!!spruceAt, `spruce trees exist (${JSON.stringify(spruceAt)})`);
if (birchAt) {
  await goTo(birchAt.x - 6, birchAt.y + 3, birchAt.z, -Math.PI / 2, -0.1);
  await shot('nature-birch', 1200);
}
if (spruceAt) {
  await goTo(spruceAt.x - 7, spruceAt.y + 4, spruceAt.z, -Math.PI / 2, 0.05);
  await shot('nature-spruce', 1200);
}

// Ponds need flat ground, so they can be far apart: the nearest is looked for 40 chunks out (as the unit tests do).
const lake = await sc(() => window.__solrift.nearestLake(0, 0, 40));
check(lake !== null, `a pond exists within 640 blocks of the origin (${JSON.stringify(lake)})`);
if (lake) {
  await goTo(lake.x, 0, lake.z);
  await page.waitForTimeout(1000);
  check(isWater(await at(lake.x, lake.level, lake.z)) || (await at(lake.x, lake.level, lake.z)) === B.ICE, 'its middle holds still water at the pond level');
  check((await at(lake.x, lake.level + 1, lake.z)) === B.AIR || (await at(lake.x, lake.level + 1, lake.z)) === B.ICE, 'with open air above');
  await sc(([x, y, z]) => window.__solrift.teleport(x + 0.5 - 9, y + 5, z + 0.5 - 9, -Math.PI / 4, -0.35), [lake.x, lake.level, lake.z]);
  await shot('nature-lake', 1500);
}

console.log('desert temple');
const temple = await sc(() => window.__solrift.nearestStructure('temple', 0, 0));
check(temple !== null, `a desert temple exists (${JSON.stringify(temple && { x: temple.x, y: temple.y, z: temple.z, chests: temple.chests.length })})`);
if (temple) {
  await goTo(temple.x, 0, temple.z);
  await page.waitForTimeout(1500);
  const counts = await sc(
    ([tx, tz]) => {
      const s = window.__solrift;
      const c = { chiseled: 0, sandstone: 0 };
      for (let x = tx - 8; x <= tx + 8; x++)
        for (let z = tz - 8; z <= tz + 8; z++)
          for (let y = 30; y < 110; y++) {
            const id = s.getBlock(x, y, z);
            if (id === 57) c.chiseled++;
            else if (id === 42) c.sandstone++;
          }
      return c;
    },
    [temple.x, temple.z],
  );
  check(counts.sandstone > 200 && counts.chiseled > 5, `it is built of sandstone with chiselled bands (${JSON.stringify(counts)})`);
  check(temple.chests.length >= 4, `with ${temple.chests.length} chests in the chamber`);
  const topY = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [temple.x, temple.z]);
  await sc(([x, y, z]) => window.__solrift.teleport(x + 0.5 - 17, y + 6, z + 0.5 - 17, -Math.PI * 0.75, -0.3), [temple.x, topY, temple.z]);
  await shot('nature-temple', 1800);
  const [cx, cy, cz] = temple.chests[0].split(',').map(Number);
  const loot = await sc(([x, y, z]) => window.__solrift.chestContents(x, y, z), [cx, cy, cz]);
  check(JSON.stringify(loot).length > 20, 'a temple chest holds loot');
}

console.log('mineshaft rails and webs');
const shaft = await sc(() => window.__solrift.nearestStructure('mineshaft', 0, 0));
check(shaft !== null, 'a mineshaft exists');
if (shaft) {
  await goTo(shaft.x, 0, shaft.z);
  await page.waitForTimeout(2000);
  const found = await sc(
    ([mx, my, mz]) => {
      const s = window.__solrift;
      const c = { rails: 0, webs: 0, spawner: null };
      for (let x = mx - 40; x <= mx + 40; x++)
        for (let z = mz - 40; z <= mz + 40; z++)
          for (let y = my - 1; y <= my + 4; y++) {
            const id = s.getBlock(x, y, z);
            if (id === 48 || id === 49) c.rails++;
            else if (id === 47) c.webs++;
          }
      return c;
    },
    [shaft.x, shaft.y, shaft.z],
  );
  check(found.rails > 10, `rails run down the corridors (${found.rails})`);
  check(found.webs > 0, `with cobwebs hanging in them (${found.webs})`);
  // Stand on the first rail and look down the track.
  const rail = await sc(
    ([mx, my, mz]) => {
      const s = window.__solrift;
      for (let i = 0; i < 40; i++) for (const [dx, dz] of [[i, 0], [-i, 0], [0, i], [0, -i]]) if ([48, 49].includes(s.getBlock(mx + dx, my, mz + dz))) return { x: mx + dx, y: my, z: mz + dz, alongX: s.getBlock(mx + dx, my, mz + dz) === 48 };
      return null;
    },
    [shaft.x, shaft.y, shaft.z],
  );
  if (rail) {
    await sc(([r]) => {
      const s = window.__solrift;
      for (const dz of [-2, -1, 0, 1, 2]) for (const dx of [-2, -1, 0, 1, 2]) if (s.getBlock(r.x + dx, r.y + 1, r.z + dz) === 0 && false) s.setBlock(r.x + dx, r.y + 1, r.z + dz, 0);
      s.setBlock(r.x + (r.alongX ? 1 : 0), r.y + 1, r.z + (r.alongX ? 0 : 1), 23);
      s.teleport(r.x + 0.5, r.y, r.z + 0.5, r.alongX ? -Math.PI / 2 : 0, -0.15);
    }, [rail]);
    await shot('nature-rails', 1500);
  }
}

console.log('animals and monsters');
await arena();
const KINDS = ['pig', 'cow', 'sheep', 'chicken', 'rabbit', 'bat', 'spider', 'cave_spider', 'slime', 'enderman', 'husk', 'stray', 'drowned', 'creeper', 'zombie', 'skeleton'];
await sc(
  ([AX, AZ, FLOOR, KINDS]) => {
    const s = window.__solrift;
    s.clearMobs();
    s.setTime(0.3);
    KINDS.forEach((k, i) => s.spawnMob(k, AX - 7 + (i % 8) * 2, FLOOR + 1, AZ + 3 + Math.floor(i / 8) * 3));
    s.teleport(AX + 0.5, FLOOR + 1, AZ - 4.5, Math.PI, -0.05);
  },
  [AX, AZ, FLOOR, KINDS],
);
await page.waitForTimeout(500);
const alive = await sc(() => window.__solrift.mobs().map((m) => m.kind));
check(KINDS.every((k) => alive.includes(k)), `every kind spawns and renders (${alive.length} mobs)`);
await shot('nature-mobs', 1500);

const sheepDrop = await sc(
  async ([AX, AZ, FLOOR]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.setMode('survival');
    s.clearMobs();
    s.teleport(AX + 0.5, FLOOR + 1, AZ + 0.5, 0, 0);
    s.spawnMob('sheep', AX + 0.5, FLOOR + 1, AZ + 1.5);
    const m = s.mobs().find((x) => x.kind === 'sheep');
    s.damageMob(m.id, 100);
    s.tickDrops(3);

    s.gatherDrops();
    return { wool: s.countOf(56), mutton: s.countOf(334) };
  },
  [AX, AZ, FLOOR],
);
check(sheepDrop.wool >= 1, 'a sheep drops wool');
const chickenDrop = await sc(
  ([AX, AZ, FLOOR]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.clearMobs();
    s.spawnMob('chicken', AX + 0.5, FLOOR + 1, AZ + 1.5);
    s.damageMob(s.mobs().find((x) => x.kind === 'chicken').id, 100);
    s.tickDrops(3);

    s.gatherDrops();
    return s.countOf(336);
  },
  [AX, AZ, FLOOR],
);
check(chickenDrop >= 1, 'a chicken drops raw chicken');
await sc(() => window.__solrift.setMode('creative'));

console.log('water mobs');
await arena();
await sc(
  ([AX, AZ, FLOOR]) => {
    const s = window.__solrift;
    s.clearMobs();
    // A glass-walled tank, 7 x 7 and 5 deep, on the platform.
    for (let x = AX - 3; x <= AX + 3; x++)
      for (let z = AZ - 3; z <= AZ + 3; z++)
        for (let y = FLOOR + 1; y <= FLOOR + 5; y++) {
          const wall = Math.abs(x - AX) === 3 || Math.abs(z - AZ) === 3;
          s.setBlock(x, y, z, wall ? 17 : y <= FLOOR + 4 ? 5 : 0);
        }
    for (let i = 0; i < 3; i++) s.spawnMob('squid', AX - 1 + i, FLOOR + 3, AZ);
    s.teleport(AX + 0.5, FLOOR + 3, AZ - 6.5, Math.PI, 0);
  },
  [AX, AZ, FLOOR],
);
await simulate(4000);
const squids = await sc(() => window.__solrift.mobs().filter((m) => m.kind === 'squid'));
check(squids.length === 3 && squids.every((m) => !m.dead), 'squid swim about in their tank');
check(squids.every((m) => m.y > FLOOR + 1 && m.y < FLOOR + 5), `and stay in the water (y ${squids.map((m) => m.y.toFixed(1)).join(', ')})`);
await shot('nature-squid', 800);

check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('NATURE E2E passed');
