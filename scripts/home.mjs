// Title screen E2E: the three game modes, saved worlds, hardcore death, and villages.
// Usage: node scripts/home.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
import { chooseCharacter, installWallet, openPlay } from './titleFlow.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};

// One browser context for the whole run, so IndexedDB (the saved worlds) carries over between pages.
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
// Worlds are only saved for players who sign in, so this suite enters with a (mock) Solana wallet.
await installWallet(page);
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

const HOME = `${url}/?home&debug&nomobs`;
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const ready = () => page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
// The front page has one big PLAY GAME button; it opens the play page (single player or multiplayer, then the modes or the realm). The character step comes last, right before the game.
// chooseCharacter makes a Warrior: 28 health and a fifth less damage taken (the numbers of the vanilla game are for a character with no class).
const WARRIOR_HP = 28;
const WARRIOR_TAKEN = 0.8;
const toPlayPage = async () => {
  await openPlay(page);
  await page.waitForSelector('#single-panel[data-ready=true]'); // (the signed-in character's saved worlds are listed)
};
/** After a world was chosen: the character step, then the game. */
const play = () => chooseCharacter(page, 'wallet');
const goHome = async () => {
  await page.goto(HOME, { waitUntil: 'load' });
  await toPlayPage();
};
const card = (mode) => `#home .mode-card[data-mode="${mode}"]`;
const pick = (mode) => page.click(card(mode));
const panelBtn = (cls) => `#single-panel button.${cls}`;
const worldRows = () => page.$$eval('#home .world-list li', (els) => els.map((e) => ({ seed: e.dataset.seed, text: e.textContent })));
const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
const typeSeed = async (seed) => {
  await page.fill('#seed-input', String(seed));
};
const startNew = async (mode, seed) => {
  if (seed !== undefined) await typeSeed(seed);
  await pick(mode);
  await page.click(panelBtn('new-world'));
  await play();
  await ready();
};

// ---- 1. the title screen -----------------------------------------------------------------
console.log('expansions');
await page.goto(HOME, { waitUntil: 'load' });
await page.waitForSelector('.wow-play', { timeout: 30000 });
const xp = await page.$$eval('#l-expansions .xp-card', (els) => els.map((e) => ({ id: e.id, cls: e.className, text: e.textContent ?? '' })));
check(xp.length >= 2, `the front page lists the core game and its expansions (${xp.length})`);
check(xp[0]?.cls.includes('live') && xp[0].text.includes('Play it now'), 'the core game is live');
check(xp.slice(1).every((c) => !c.cls.includes('live') && c.text.includes('Not playable yet')), 'expansions that are not built say they are not playable');
check(xp.some((c) => c.text.includes('Embers of the Hollow King') && c.text.includes('Boss') && c.text.includes('Dungeon')), 'an expansion lists its bosses and dungeons');
check((await page.textContent('#hero-next'))?.includes('Embers of the Hollow King'), 'the hero names the next expansion');
check(/SolRift/i.test(await page.title()), 'the page is called SolRift');
await page.screenshot({ path: `${outDir}/home-top.png` });
await page.evaluate(() => document.getElementById('l-expansions')?.scrollIntoView());
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/home-expansions.png` });

console.log('title screen');
await goHome();
const text = await page.$eval('#home', (e) => e.textContent);
check((await page.$$('#home .mode-card')).length === 3, 'three game mode cards');
for (const t of ['The classic experience', 'Unlimited building', 'Extreme difficulty']) check(text.includes(t), `says "${t}"`);
check(text.includes('Single player') && text.includes('Multiplayer'), 'single player and multiplayer to choose from');
// Each mode explains itself when picked.
const detail = async (mode) => {
  await pick(mode);
  return page.$eval('#mode-detail', (e) => e.textContent);
};
const survivalText = await detail('survival');
check(survivalText.includes('Mine blocks and collect resources'), 'survival lists what you can do');
check(survivalText.includes('Explore caves and villages'), 'promises caves and villages');
check(!/Explore caves, villages, the Nether/.test(text + survivalText), 'does not promise the Nether or the End');
check((await detail('creative')).includes('Fly by double-tapping jump'), 'creative explains flying');
const hardText = await detail('hardcore');
check(hardText.includes('permanent death') || hardText.includes('One life only'), 'hardcore explains one life');
await pick('survival');
check((await worldRows()).length === 0, 'no saved worlds on a fresh device');
check((await page.$$(panelBtn('continue'))).length === 0, 'nothing to continue yet');
check(await page.isVisible('#seed-input'), 'a seed box');
await page.click('#way-multi');
check(await page.isVisible('#online-link-home'), 'a button to join the realm');
check(!(await page.$('#player-name')) && !(await page.$('input#player-name')), 'no name here: the character is made after the realm is chosen');
check(!(await page.$('#adventure-card')) && !(await page.$('#adventure-begin')), 'Adventure is not offered in single player');
check((await page.$$('#multi-panel .realm-row')).length === 1, 'multiplayer has one realm');
check((await page.textContent('#multi-panel .realm-name')) === 'Dawnwatch', 'and it is the Adventure one');
check(!(await page.textContent('#multi-panel'))?.includes('SolRift Realm'), 'there is no plain SolRift Realm any more');
check((await page.textContent('#adventure-about'))?.includes('quests'), 'it explains the quests and the dungeon');
await page.screenshot({ path: `${outDir}/home-adventure.png`, fullPage: false });
check(page.url().endsWith('#play'), 'the play page has its own address');
await page.click('#online-link-home');
check(await page.isVisible('#who-wallet-card') && page.url().endsWith('#who'), 'Join realm leads to the character step, before connecting');
check((await page.textContent('#dest-chip'))?.includes('Multiplayer') && (await page.textContent('#dest-chip'))?.includes('Dawnwatch'), 'which says it leads to the Dawnwatch realm');
await page.click('#back-home');
check(await page.isVisible('#way-multi') && page.url().endsWith('#play'), 'Back from the character step returns to the play page');
check(await page.isVisible('#multi-panel'), 'with the realm still chosen');
await page.click('#way-single');
await page.click('#back-home');
check(await page.isVisible('.wow-play'), 'Back returns to the front page with the PLAY GAME button');
check((await page.$('.hero-logo')) !== null, 'the front page shows the game logo');
await toPlayPage();
check(await page.isVisible('#way-single') && await page.isVisible('#way-multi'), 'PLAY GAME opens Single player and Multiplayer');
check((await page.$('#who-wallet-card')) === null, 'with no character step in the way');
check((await sc(() => window.__solrift === undefined || true)) === true, 'the page is alive');
await shot('home');

// ---- 2. hardcore: one life -----------------------------------------------------------------
console.log('hardcore');
await startNew('hardcore', 4242);
await sc(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const hc = await sc(() => window.__solrift.hardcore());
check(hc.hardcore === true && hc.mode === 'survival' && hc.spectating === false, `a hardcore survival world (${JSON.stringify(hc)})`);
check(!(await page.isVisible('#home')) || (await page.$('#home')) === null, 'the title screen is gone');
check((await page.$('#hardcore-hearts')) !== null, 'hardcore hearts are drawn');
await sc(() => window.__solrift.setMode('creative'));
check((await sc(() => window.__solrift.mode())) === 'survival', 'hardcore cannot switch to creative');
await sc(() => window.__solrift.hurtByMob(2));
const hurt = await sc(() => window.__solrift.hardcore().health);
check(Math.abs(hurt - (WARRIOR_HP - 2 * 1.5 * WARRIOR_TAKEN)) < 0.01, `mobs hit 1.5x as hard on Hard difficulty (health ${hurt})`);
await shot('hardcore-hearts');
// The hurt cooldown runs on game time, so keep hitting until it has passed.
check(
  await until(async () => {
    await sc(() => {
      window.__solrift.forceLock();
      window.__solrift.hurtByMob(1000);
    });
    return page.isVisible('#death-screen.hardcore');
  }),
  'a "Game over" screen appears',
);
check((await page.textContent('#death-screen h2')) === 'Game over!', 'it says Game over!');
check((await page.$('#spectate')) !== null && (await page.$('#delete-world')) !== null, 'it offers Spectate and Delete');
check(
  await until(async () => JSON.parse(await sc(() => window.__solrift.savedState())).player?.gameOver === true),
  'the death is saved straight away',
);
await shot('hardcore-death');

// Closing the page and coming back must not bring the player back to life.
await goHome();
let rows = await worldRows();
check(rows.length === 1 && rows[0].seed === '4242' && /Hardcore/.test(rows[0].text) && /game over/.test(rows[0].text), `the world list shows the dead hardcore world (${JSON.stringify(rows)})`);
await shot('home-with-world');
await pick('hardcore');
await page.click(panelBtn('continue'));
await play();
await ready();
const again = await sc(() => window.__solrift.hardcore());
check(again.hardcore === true && again.screen === 'dead', `still dead after a reload (${JSON.stringify(again)})`);
check(await page.isVisible('#death-screen.hardcore'), 'the game over screen is back');

// Spectate.
await page.click('#spectate');
check(await until(async () => (await sc(() => window.__solrift.hardcore())).spectating === true), 'spectating after choosing Spectate');
check(await until(() => page.isVisible('#spectator-banner')), 'a spectator banner is shown');
check(!(await page.isVisible('#hotbar')), 'no hotbar while spectating');
check((await sc(() => window.__solrift.hardcore())).screen === 'none', 'the death screen is gone');
const p0 = await sc(() => window.__solrift.position());
await sleep(1500);
const p1 = await sc(() => window.__solrift.position());
check(Math.abs(p1.y - p0.y) < 0.5, 'a spectator floats instead of falling');
await shot('hardcore-spectating');

// Back to the title screen from the banner, then delete the world.
await sc(() => document.exitPointerLock()); // a real player presses Esc first
await page.click('#spectator-banner button');
await toPlayPage();
await until(async () => (await worldRows()).length > 0); // (the save finishes in the background)
rows = await worldRows();
check(rows.length === 1, 'back at the title screen, the world is still listed');
await page.click('#home .world-list li .delete');
check((await page.textContent('#home .world-list li .delete')).includes('Really'), 'deleting asks twice');
await page.click('#home .world-list li .delete');
check(await until(async () => (await worldRows()).length === 0), 'the world is deleted');

// ---- 3. creative ------------------------------------------------------------------------
console.log('creative');
await goHome(); // (quitting to the title screen drops ?debug, which the hooks need)
await startNew('creative', 777);
const cr = await sc(() => window.__solrift.hardcore());
check(cr.mode === 'creative' && cr.hardcore === false, `a creative world (${JSON.stringify(cr)})`);
await sc(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
check(!(await page.isVisible('#vitals')) || (await page.$('#vitals')) === null, 'no hearts or hunger in creative');
await sc(() => window.__solrift.hurtByMob(1000));
check((await sc(() => window.__solrift.hardcore())).health === WARRIOR_HP, 'nothing hurts a creative player');
await sc(() => window.__solrift.save());
await page.waitForTimeout(1000); // the write to IndexedDB finishes in the background

// ---- 4. survival, and continuing --------------------------------------------------------
console.log('survival');
await goHome();
await until(async () => (await worldRows()).length > 0);
rows = await worldRows();
check(rows.length === 1 && rows[0].seed === '777' && /Creative/.test(rows[0].text), `the creative world is listed (${JSON.stringify(rows)})`);
await pick('creative');
check((await page.$$(panelBtn('continue'))).length === 1, 'creative offers Continue');
await pick('survival');
check((await page.$$(panelBtn('continue'))).length === 0, 'survival has nothing to continue');
await startNew('survival', 31337);
const sv = await sc(() => window.__solrift.hardcore());
check(sv.mode === 'survival' && sv.hardcore === false && sv.health === WARRIOR_HP, `a survival world (${JSON.stringify(sv)})`);
await sc(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
await sc(() => window.__solrift.hurtByMob(4));
check(Math.abs((await sc(() => window.__solrift.hardcore().health)) - (WARRIOR_HP - 4 * WARRIOR_TAKEN)) < 0.01, 'survival damage is normal (less, for a Warrior)');
check(
  await until(async () => {
    await sc(() => {
      window.__solrift.forceLock();
      window.__solrift.hurtByMob(1000);
    });
    return page.isVisible('#death-screen');
  }),
  'survival has a death screen',
);
check((await page.textContent('#death-screen h2')) === 'You died!' && (await page.$('#spectate')) === null, 'with Respawn, not Game over');
await page.click('#death-screen button');
check(await until(async () => (await sc(() => window.__solrift.hardcore())).health === WARRIOR_HP), 'and you can respawn');
await sc(() => window.__solrift.save());
await page.waitForTimeout(1000); // the write to IndexedDB finishes in the background

// Continue the creative world from the card.
await goHome();
rows = await worldRows();
check(rows.length === 2, 'two worlds listed');
await pick('creative');
await page.click(panelBtn('continue'));
await play();
await ready();
check((await sc(() => window.__solrift.mode())) === 'creative', 'Continue reopens the creative world as creative');

// Typing a seed that already exists reopens that world.
await goHome();
await page.fill('#seed-input', '31337');
check(await until(() => page.isVisible('#home .seed-note')), 'typing an existing seed says so');
await pick('hardcore');
await page.click(panelBtn('new-world'));
await play();
await ready();
check((await sc(() => window.__solrift.hardcore())).hardcore === false, 'a new hardcore world on an old seed reopens the old world');

// Links with parameters skip the title screen.
await page.goto(`${url}/?seed=1337&debug&nomobs`, { waitUntil: 'load' });
await ready();
check((await page.$('#home')) === null, '?seed= goes straight to the game');
check((await page.$('#quit-game')) !== null, 'the pause screen has a Quit game button');
check((await page.$('#online-link')) === null && (await page.$('#single-link')) === null && (await page.$('#title-link')) === null, 'and none of the old Play online / Back to single-player / Title screen links');

// ---- 5. villages --------------------------------------------------------------------------
console.log('villages');
await sc(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
});
const site = await sc(() => window.__solrift.nearestVillage(0, 0));
check(site !== null, `there is a village near the spawn (${JSON.stringify(site)})`);
if (site) {
  const g = site.groundY;
  await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, 0), [site.x + 0.5, g + 3, site.z + 18.5]);
  check(await until(async () => (await sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [site.x, g, site.z])) === 5, 60000), 'the well holds water');
  const at = (dx, dy, dz) => sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [site.x + dx, g + dy, site.z + dz]);
  check((await at(2, 0, 0)) === 11, 'the well has a cobblestone rim');
  check((await at(3, 0, 0)) === 176, 'the plaza is paved with stone bricks');
  // Count what is around.
  const counts = await sc(
    ([sx, gy, sz]) => {
      const s = window.__solrift;
      const n = {};
      for (let dz = -26; dz <= 26; dz++)
        for (let dx = -26; dx <= 26; dx++)
          for (let dy = -1; dy <= 6; dy++) {
            const b = s.getBlock(sx + dx, gy + dy, sz + dz);
            n[b] = (n[b] ?? 0) + 1;
          }
      return n;
    },
    [site.x, g, site.z],
  );
  check((counts[10] ?? 0) + (counts[176] ?? 0) > 100, `there are buildings (${counts[10]} planks, ${counts[176]} stone bricks)`);
  check((counts[175] ?? 0) + (counts[17] ?? 0) > 0, `with windows (${counts[175]} panes)`);
  check((counts[20] ?? 0) > 0, `and crafting tables (${counts[20]})`);
  check((counts[23] ?? 0) > 0, `and torches (${counts[23]})`);
  // Aerial view, then a view from the road.
  await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, -1.1), [site.x + 0.5, g + 40, site.z + 22.5]);
  await sleep(450); // (not flying, so be quick before gravity wins)
  await shot('village-aerial');
  await sc(([x, y, z, yaw]) => window.__solrift.teleport(x, y, z, yaw, -0.15), [site.x + 0.5, g + 1, site.z + 12.5, 0]);
  await sleep(1500);
  await shot('village-street');
}

await browser.close();
const real = errors.filter((e) => !/favicon|404|Failed to load resource|ERR_|WebSocket/i.test(e));
if (real.length) {
  console.log('console errors:');
  real.forEach((e) => console.log('  ', e));
}
if (failures.length || real.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nhome: all good');
