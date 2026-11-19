// Marketing screenshots of the Adventure interface for the home page: HUD, gear, quest log, spellbook, recipe book.
// 1600x900 JPEGs. Usage: node scripts/uishots.mjs [url] [outDir] [shot,shot...]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots/ui';
const only = process.argv[4]?.split(',');
mkdirSync(outDir, { recursive: true });
const want = (n) => !only || only.includes(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}/?world=adventure&debug&nomobs&class=mage&shadows=4096&postfx`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', undefined, { timeout: 240000 });
const sc = (fn, a) => page.evaluate(fn, a);
const lock = () => sc(() => {
  document.getElementById('overlay').style.display = 'none';
  const st = document.getElementById('hide-next') ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: 'hide-next', textContent: 'nextjs-portal{display:none!important}' }));
  window.__solrift.forceLock();
});
const snap = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 86 });
  console.log('saved', name);
};
await lock();
await sleep(3000);

// A character with some kit and some money.
await sc(() => {
  const s = window.__solrift;
  s.addXp(900);
  s.addCoins(340);
  s.clearInventory();
  ['diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots'].forEach((n, i) => s.setArmorSlot(i, s.itemId(n)));
});
await sc(() => {
  const s = window.__solrift;
  s.give(s.itemId('staff')); // (the first free hotbar slot: it is the one in the hand)
  s.select(0);
  for (const [n, c] of [['iron_sword', 1], ['bow', 1], ['arrow', 40], ['bread', 12], ['torch', 16], ['oak_planks', 48], ['cobblestone', 64], ['iron_ingot', 14], ['coal', 20], ['diamond', 3], ['crafting_table', 1], ['furnace', 1], ['iron_pickaxe', 1], ['stick', 24], ['apple', 6], ['gold_ingot', 9], ['redstone', 30], ['glass', 20], ['oak_log', 32]]) {
    try { s.give(s.itemId(n), c); } catch {}
  }
  // The Mage's own tools and spells: a staff in the hand, and all four abilities learned (their skill books are not needed to look).
  for (const a of ['fireball', 'frost_nova', 'meteor', 'arcane_shield']) s.unlockAbility(a);
});

// Talk to the people of the village and take up what they offer.
const standBy = async (npc) => {
  const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [npc.x, npc.z + 1.8]);
  await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, 0), [npc.x, gy + 0.1, npc.z + 1.8]);
  await sleep(500);
};
await sc(() => window.__solrift.teleport(2.5, 70, 6.5, 0, 0));
await sleep(2500);
for (let round = 0; round < (want('hud') || want('quests') ? 3 : 0); round++) {
  const npcs = await sc(() => window.__solrift.mobs().filter((m) => m.kind === 'npc'));
  for (const npc of npcs) {
    await standBy(npc);
    await sc((id) => window.__solrift.talkToMob(id), npc.id);
    await sleep(500);
    for (const t of ['quest-complete', 'quest-accept']) {
      const b = page.locator(`[data-testid=${t}]`).first();
      if (await b.count()) {
        await b.click().catch(() => {});
        await sleep(400);
      }
    }
    await page.keyboard.press('Escape');
    await sleep(300);
    await lock();
  }
}

// Back to the square at sunset, the sun low and the long shadows out (the windows are drawn over this view).
const maren = (await sc(() => window.__solrift.mobs().filter((m) => m.kind === 'npc'))).find((n) => n.variant === 0);
await sc(() => window.__solrift.setTime(0.48));
await sc(() => window.__solrift.teleport(0.5, 76, 26.5, 0.9, 0.02));
await lock();
if (want('hud')) {
  await sleep(6000);
  await snap('adv-hud');
}
// (The windows are drawn over the view: the staff in the hand would only be in the way.)
await sc(() => window.__solrift.setHandHidden(true));

const open = async (kind) => {
  await sc((k) => window.__solrift.openMenu(k), kind);
  await sleep(1200);
};
const close = async () => {
  await page.keyboard.press('Escape');
  await sleep(500);
  await lock();
};
if (want('inventory')) {
  await open('inventory');
  await snap('adv-inventory');
  if (want('spellbook')) {
    await page.locator('.wow-tab', { hasText: /spell/i }).first().click().catch(() => console.log('no spellbook tab'));
    await sleep(800);
    await snap('adv-spellbook');
  }
  await close();
} else if (want('spellbook')) {
  await open('inventory');
  await page.locator('.wow-tab', { hasText: /spell/i }).first().click().catch(() => console.log('no spellbook tab'));
  await sleep(800);
  await snap('adv-spellbook');
  await close();
}
if (want('recipes')) {
  await open('crafting');
  await page.locator('[data-testid=book-button]').first().dispatchEvent('mousedown');
  await sleep(1200);
  await snap('adv-recipes');
  await close();
}
if (want('quests')) {
  await page.keyboard.press('KeyL');
  await sleep(1000);
  await snap('adv-quests');
  await page.keyboard.press('Escape');
  await sleep(400);
}
console.log('npc sample', maren ? 'ok' : 'none');
await browser.close();
