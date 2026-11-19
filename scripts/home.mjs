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
// The front page has one big PLAY GAME button; it opens the game page, /game: PLAY asks single player or multiplayer (and the mode) in a dialog, then /game is the character lobby with one Play button.
// chooseCharacter makes a Warrior: 28 health and a fifth less damage taken (the numbers of the vanilla game are for a character with no class).
const WARRIOR_HP = 28;
const WARRIOR_TAKEN = 0.8;
const toPlayPage = async (mode = 'survival', way = 'single') => {
  await openPlay(page, { mode, way });
  if (way === 'single') await page.waitForSelector('#single-panel[data-ready=true]'); // (the signed-in character's saved worlds are listed)
};
/** Who plays (a wallet, signing in and making its character the first time), then Play. */
const play = () => chooseCharacter(page, 'wallet');
const goHome = async (mode = 'survival', way = 'single') => {
  await page.goto(HOME, { waitUntil: 'load' });
  await toPlayPage(mode, way);
};
// (The mode is chosen in PLAY's dialog, so picking one opens the lobby again with it.)
const pick = (mode) => goHome(mode);
const panelBtn = (cls) => (cls === 'continue' ? '.lb-continue' : '#play-go');
const worldRows = () => page.$$eval('#home .lb-worlds li', (els) => els.map((e) => ({ seed: e.dataset.seed, text: e.textContent })));
const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
const typeSeed = async (seed) => {
  await page.fill('#seed-input', String(seed));
};
const startNew = async (mode, seed) => {
  await pick(mode);
  if (seed !== undefined) await typeSeed(seed);
  await play();
  await ready();
};

// ---- 1. the title screen -----------------------------------------------------------------
console.log('front page');
await page.goto(HOME, { waitUntil: 'load' });
await page.waitForSelector('.wow-play', { timeout: 30000 });
check((await page.$('#l-expansions')) !== null, 'the front page has an expansions section');
check((await page.$('.site-portrait .char-preview')) === null, 'with no wallet character, the portrait is empty');
check((await page.textContent('.site-nav'))?.includes('Play'), 'the menu names Play');
check(/SolRift/i.test(await page.title()), 'the page is called SolRift');
await page.screenshot({ path: `${outDir}/home-top.png` });

console.log('title screen');
await page.goto(HOME, { waitUntil: 'load' });
await page.waitForSelector('.wow-play');
await page.click('.wow-play');
await page.waitForSelector('#way-dialog');
check(await page.isVisible('#pick-single') && await page.isVisible('#pick-multi'), 'PLAY GAME opens a dialog with Single player and Multiplayer');
await page.keyboard.press('Escape');
check(!(await page.isVisible('#way-dialog')), 'Escape closes it');
await page.click('.wow-play');
await page.click('#pick-single');
await page.waitForSelector('#pick-mode-survival');
const dlgText = await page.$eval('#way-dialog', (e) => e.textContent);
check((await page.$$('#way-dialog [data-mode]')).length === 3, 'single player asks for the game mode: three cards');
for (const t of ['The classic experience', 'Unlimited building', 'Extreme difficulty']) check(dlgText.includes(t), `the dialog says "${t}"`);
check(new URL(page.url()).pathname === '/', 'nothing has left the front page yet');
await page.click('#way-back');
check(await page.isVisible('#pick-multi'), 'Back returns to single player or multiplayer');
await page.click('#pick-single');
await page.click('#pick-mode-survival');
await page.waitForSelector('#play-go');
check(new URL(page.url()).pathname === '/game' && new URL(page.url()).hash === '' && !page.url().includes('way=') && !page.url().includes('pick='), 'then the plain game address: /game, no steps and no hash');
check((await page.$('#way-dialog')) === null, 'with no dialog on it');
check(await page.isVisible('#who-guest') && await page.isVisible('#who-wallet'), 'the lobby offers guest or Solana wallet');
check((await page.$$('#cc-stage canvas.char-preview')).length === 1, 'with the character in the middle');
check((await page.textContent('#dest-title')) === 'Single player' && (await page.textContent('#lb-how')).includes('Survival'), 'and says what is being played');
check(await page.isVisible('#play-go'), 'with one Play button');
// Each mode explains itself (the mode is what the dialog chose).
const detail = async (mode) => {
  await pick(mode);
  return page.$eval('#lb-how', (e) => e.textContent);
};
const survivalText = await detail('survival');
check(survivalText.includes('collect resources'), 'survival explains itself');
const text = survivalText;
check(!/Explore caves, villages, the Nether/.test(text), 'does not promise the Nether or the End');
check((await detail('creative')).includes('every block and item'), 'creative explains itself');
const hardText = await detail('hardcore');
check(hardText.includes('permanent death') || hardText.includes('One life only'), 'hardcore explains one life');
await pick('survival');
check((await worldRows()).length === 0, 'no saved worlds on a fresh device');
check((await page.$$(panelBtn('continue'))).length === 0, 'nothing to continue yet');
check(await page.isVisible('#seed-input'), 'a seed box');
await goHome('survival', 'multi');
check(await page.isVisible('#multi-panel') && await page.isVisible('#who-guest'), 'multiplayer shows its realm, and still who plays');
check(!(await page.$('#adventure-card')) && !(await page.$('#adventure-begin')), 'Adventure is not offered in single player');
check((await page.textContent('#multi-panel h3')) === 'Dawnwatch', 'the one realm is the Adventure one');
check(!(await page.textContent('#multi-panel'))?.includes('SolRift Realm'), 'there is no plain SolRift Realm any more');
check((await page.textContent('#adventure-about'))?.includes('quests'), 'it explains the quests and the dungeon');
check((await page.textContent('#dest-title'))?.includes('Multiplayer'), 'the lobby says it leads to multiplayer');
await page.screenshot({ path: `${outDir}/home-adventure.png`, fullPage: false });
await page.click('#back-home');
await page.waitForSelector('.wow-play');
check(new URL(page.url()).pathname === '/', 'Back returns to the front page');
check((await page.$('.hero-logo')) !== null, 'the front page shows the game logo');
// A mode badge on the front page lights its mode in the dialog.
await page.click('#home .fp-badge >> text=Hardcore');
await page.click('#pick-single');
check((await page.getAttribute('#pick-mode-hardcore', 'class'))?.includes('lit') === true, 'a mode badge lights its mode in the dialog');
await page.click('#pick-mode-hardcore');
await page.waitForSelector('#single-panel[data-ready=true]');
check((await page.getAttribute('#single-panel', 'data-mode')) === 'hardcore', 'and the lobby plays that mode');
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
await page.click('.gp-worlds summary'); // (the list opens from "Your worlds")
await page.click('#home .lb-worlds li .delete');
check((await page.textContent('#home .lb-worlds li .delete')).includes('Sure'), 'deleting asks twice');
await page.click('#home .lb-worlds li .delete');
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
await ready();
check((await sc(() => window.__solrift.mode())) === 'creative', 'Continue reopens the creative world as creative');

// Typing a seed that already exists reopens that world.
await goHome('hardcore');
await page.fill('#seed-input', '31337');
check(await until(() => page.isVisible('#home .lb-hint:has-text("already have")')), 'typing an existing seed says so');
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
