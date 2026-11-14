// Adventure mode E2E: the village of Dawnwatch, its quest givers, the dialog, the quest log and tracker, rewards,
// and a look at the dungeon. Saves `adventure-*.png`. Usage: node scripts/adventure.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

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
const until = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 600) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/adventure-${name}.png` });
  console.log('saved', name);
};
const screen = () => sc(() => window.__solrift.screen());
const log = () => sc(() => window.__solrift.questLog());
const npcs = () => sc(() => window.__solrift.mobs().filter((m) => m.kind === 'npc'));

await page.goto(`${url}/?world=adventure&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', null, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});

const count = (name) => sc((n) => window.__solrift.countOf(window.__solrift.itemId(n)), name);
const dialogText = () => sc(() => document.querySelector('[data-testid=quest-dialog]')?.textContent ?? '');
const trackerText = () => sc(() => document.querySelector('[data-testid=quest-tracker]')?.textContent ?? '');
// (the name only: the Undercroft's second line says "under Dawnwatch")
const banner = () => sc(() => document.querySelector('[data-testid=zone-banner] .zone-name')?.textContent ?? '');
const relock = () => sc(() => { document.getElementById('overlay').style.display = 'none'; window.__solrift.forceLock(); });
const FIRST = 'out_of_the_dark';

// ---- everyone wakes in the Undercroft, the cave under the village, with nothing
const p = await sc(() => window.__solrift.position());
const ground = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [p.x, p.z]);
check(p.y < ground - 3, `woke underground, under the village (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}; the ground above is at ${ground})`);
check(await until(async () => (await banner()).includes('Undercroft'), 8000), `the place banner says The Undercroft (${await banner()})`);
check(await sc(() => window.__solrift.inventory().every((s) => !s)), 'with nothing at all in the bag');
check(!(await sc(() => !!document.querySelector('[data-testid=minimap]'))), 'and no minimap: there is no map yet');
check(await sc(() => !!document.querySelector('[data-testid=quest-tracker]')), 'the quest tracker is on screen');
check((await trackerText()) === '' && (await log()).a.length === 0, 'empty: no quest is under way yet');
await shot('undercroft', 400);

// ---- the healer beside the cot has the first quest
check(await until(async () => (await npcs()).some((n) => n.variant === 9), 10000), 'Healer Mirel is in the cave');
const mirel = (await npcs()).find((n) => n.variant === 9);
check(!!mirel && Math.hypot(mirel.x - p.x, mirel.z - p.z) < 6 && Math.abs(mirel.y - p.y) < 2, 'beside the cot');
await sc((id) => window.__solrift.talkToMob(id), mirel.id);
check(await until(async () => (await screen()) === 'dialog', 3000), 'talking to her opens the dialog');
check(await sc(() => !!document.querySelector('[data-testid=quest-dialog]')), 'the dialog is drawn');
check((await dialogText()).includes('Out of the Dark'), 'she offers "Out of the Dark"');
await shot('dialog-offer', 300);
await page.click(`[data-quest=${FIRST}] [data-testid=quest-accept]`);
check(await until(async () => (await log()).a.some(([id]) => id === FIRST), 3000), 'accepting puts the quest in the log');
check(await until(async () => (await trackerText()).includes('Out of the Dark'), 3000), 'and in the tracker');
await page.keyboard.press('Escape');
check(await until(async () => (await screen()) === 'none', 3000), 'Escape ends the conversation');

// ---- the quest log (L)
await relock();
await page.keyboard.press('KeyL');
check(await until(() => sc(() => !!document.querySelector('[data-testid=quest-log]')), 3000), 'L opens the quest log');
check((await sc(() => document.querySelector('[data-testid=quest-log]')?.textContent ?? '')).includes('Out of the Dark'), 'it lists the quest');
await shot('quest-log', 300);
await page.keyboard.press('Escape');
check(await until(() => sc(() => !document.querySelector('[data-testid=quest-log]')), 3000), 'Escape closes it');
await relock();

// ---- up into the village (the stair climbs out of the cave; the test steps straight to the plaza)
const plazaY = await sc(() => window.__solrift.surfaceY(2, 6));
await sc((y) => window.__solrift.teleport(2.5, y + 0.1, 6.5, 0, 0), plazaY);
check(await until(async () => (await banner()) === 'Dawnwatch', 8000), `coming up, the place banner says Dawnwatch (${await banner()})`);
check(await until(async () => (await log()).a.some(([id, prog]) => id === FIRST && prog[0] >= 1), 4000), 'which is what the quest asked for');
check(await until(async () => (await trackerText()).includes('Ready to turn in: Elder Maren'), 3000), 'the tracker sends us to Elder Maren');
await shot('landing', 400);

// ---- the people of the village
await sleep(1500);
const stationed = await npcs();
console.log('  npcs near the well:', stationed.map((n) => `${n.variant}@${n.x.toFixed(1)},${n.z.toFixed(1)}`).join(' '));
const maren = stationed.find((n) => n.variant === 0);
check(!!maren, 'Elder Maren is there');
check(!!maren && Math.abs(maren.x - 2.5) < 1 && Math.abs(maren.z + 10.5) < 1, 'and stands where she should');

// ---- hand the first quest in to Maren: she gives the map and the compass, and has two more
const standBy = async (npc, dz = 1.8) => {
  const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [npc.x, npc.z + dz]);
  await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, 0), [npc.x, gy + 0.1, npc.z + dz]);
  await sleep(600);
};
await standBy(maren);
await shot('maren', 500);
await sc((id) => window.__solrift.talkToMob(id), maren.id);
check(await until(async () => (await screen()) === 'dialog', 3000), 'Maren talks');
check(await sc((q) => !!document.querySelector(`[data-quest=${q}] [data-testid=quest-complete]`), FIRST), 'she takes the first quest in');
await shot('dialog-complete', 300);
await page.click(`[data-quest=${FIRST}] [data-testid=quest-complete]`);
check(await until(async () => (await log()).d.includes(FIRST), 3000), 'the quest is handed in');
check((await count('map')) === 1, 'the reward arrived: the map of the lands');
check((await count('compass')) === 1, 'and a compass');
check(await until(() => sc(() => !!document.querySelector('[data-testid=minimap]')), 3000), 'with the map carried, the minimap is in the corner');
check(
  await until(() => sc(() => !!document.querySelector('[data-quest=welcome]') && !!document.querySelector('[data-quest=a_blade_for_the_road]')), 3000),
  'Maren now offers "Welcome to Dawnwatch" and "A Blade for the Road"',
);
await shot('dialog-two-offers', 300);
await page.click('[data-quest=welcome] [data-testid=quest-accept]');
check(await until(async () => (await log()).a.some(([id]) => id === 'welcome'), 3000), 'accepted "Welcome to Dawnwatch"');
await page.click('[data-quest=a_blade_for_the_road] [data-testid=quest-accept]');
check(await until(async () => (await log()).a.some(([id]) => id === 'a_blade_for_the_road'), 3000), 'and "A Blade for the Road"');
check(await until(async () => (await trackerText()).includes('Welcome to Dawnwatch') && (await trackerText()).includes('A Blade for the Road'), 3000), 'both are in the tracker');
await page.keyboard.press('Escape');
await until(async () => (await screen()) === 'none', 3000);
await relock();

// ---- the weaponsmith hands over a first weapon
const garrick = (await npcs()).find((n) => n.variant === 6) ?? null;
check(!!garrick, 'Garrick Bladesworn is at his stall');
if (garrick) {
  await standBy(garrick, -1.8);
  await sc((id) => window.__solrift.talkToMob(id), garrick.id);
  check(await until(async () => (await screen()) === 'dialog', 3000), 'Garrick talks');
  check(await until(() => sc(() => !!document.querySelector('[data-quest=a_blade_for_the_road] [data-testid=quest-complete]')), 3000), 'he has the quest to hand in, before any wares');
  await page.click('[data-quest=a_blade_for_the_road] [data-testid=quest-complete]');
  check(await until(async () => (await log()).d.includes('a_blade_for_the_road'), 3000), 'handed in "A Blade for the Road"');
  check((await count('stone_sword')) === 1, 'a stone sword came with it');
  await page.keyboard.press('Escape');
  await until(async () => (await screen()) === 'none', 3000);
  await relock();
}

// ---- hand "Welcome to Dawnwatch" in to Brannoc, who then has work for us
const brannoc = (await npcs()).find((n) => n.variant === 1) ?? null;
check(!!brannoc, 'Smith Brannoc is there');
if (brannoc) {
  await standBy(brannoc);
  await sc((id) => window.__solrift.talkToMob(id), brannoc.id);
  check(await until(async () => (await screen()) === 'dialog', 3000), 'Brannoc talks');
  check(await sc(() => !!document.querySelector('[data-quest=welcome] [data-testid=quest-complete]')), 'he takes the quest in');
  const breadBefore = await count('bread');
  await page.click('[data-quest=welcome] [data-testid=quest-complete]');
  check(await until(async () => (await log()).d.includes('welcome'), 3000), 'the quest is handed in');
  check((await count('bread')) >= breadBefore + 3, 'the reward (3 bread) arrived');
  check((await count('emberstone')) === 1, 'and the Emberstone, to come home with');
  check((await count('small_pouch')) === 1, 'and a small pouch');
  check(await until(() => sc(() => !!document.querySelector('[data-quest=first_timber]')), 3000), 'Brannoc now offers "First Timber"');
  await page.click('[data-quest=first_timber] [data-testid=quest-accept]');
  check(await until(async () => (await log()).a.some(([id]) => id === 'first_timber'), 3000), 'accepted "First Timber"');
  await page.keyboard.press('Escape');
  await until(async () => (await screen()) === 'none', 3000);

  // Gather the logs: the tracker follows what is carried, and the quest becomes ready to hand in.
  await sc(() => window.__solrift.give(6, 5));
  check(
    await until(async () => (await log()).a.some(([id, prog]) => id === 'first_timber' && prog[0] >= 5), 4000),
    'five logs in the bag finish the objective',
  );
  check(await sc(() => document.querySelector('[data-testid=quest-tracker]')?.textContent?.includes('Ready to turn in')), 'the tracker says it is ready');
  await shot('tracker-ready', 300);
  await sc(() => { document.getElementById('overlay').style.display = 'none'; window.__solrift.forceLock(); });
  await sc((id) => window.__solrift.talkToMob(id), brannoc.id);
  await until(async () => (await screen()) === 'dialog', 3000);
  const logsBefore = await sc(() => window.__solrift.countOf(6));
  await page.click('[data-testid=quest-complete]');
  check(await until(async () => (await log()).d.includes('first_timber'), 3000), 'handed in "First Timber"');
  check(logsBefore >= 5 && (await sc(() => window.__solrift.countOf(6))) === logsBefore - 5, 'the five logs were taken');
  check(await sc(() => window.__solrift.countOf(23)) >= 6, 'six torches came back');
  await page.keyboard.press('Escape');
  await until(async () => (await screen()) === 'none', 3000);
}

// ---- coins: the quests paid some, and Merchant Tobin buys and sells for them
const coinsNow = () => sc(() => window.__solrift.coins());
const paid = await coinsNow();
check(paid > 0, `the quests paid coins (${paid})`);
check(!(await sc(() => !!document.querySelector('[data-testid=coin-purse]'))), 'there is no coin counter over the game view');
await sc(() => window.__solrift.openMenu('inventory'));
check(await until(() => sc(() => !!document.querySelector('#menu-screen [data-testid=coin-purse]')), 3000), 'the coins show in the inventory');
check((await sc(() => Number(document.querySelector('#menu-screen [data-testid=coin-purse]')?.getAttribute('data-coins')))) === paid, 'and are the amount paid');
await shot('inventory-coins', 300);
await page.keyboard.press('Escape');
await until(async () => (await screen()) === 'none', 3000);
await sc(() => { document.getElementById('overlay').style.display = 'none'; window.__solrift.forceLock(); });
const tobin = (await npcs()).find((n) => n.variant === 4) ?? null;
check(!!tobin, 'Merchant Tobin keeps his stall');
if (tobin) {
  await sc(() => window.__solrift.addCoins(500));
  await standBy(tobin, -1.8);
  await sc((id) => window.__solrift.talkToMob(id), tobin.id);
  check(await until(async () => (await screen()) === 'dialog', 3000), 'Tobin talks');
  check(await until(() => sc(() => !!document.querySelector('[data-testid=shop-panel]')), 2000), 'the shop opens at once, with no button to click');
  check(await sc(() => (document.querySelector('[data-testid=shop-line]')?.textContent ?? '').length > 10), 'and his words are in the window');
  await shot('shop', 300);
  const before = await coinsNow();
  const bread = await sc(() => window.__solrift.countOf(window.__solrift.itemId('bread')));
  await page.click('[data-testid=shop-buy-0]');
  check(await until(async () => (await coinsNow()) < before, 3000), 'buying takes coins');
  check((await sc(() => window.__solrift.countOf(window.__solrift.itemId('bread')))) > bread, 'and gives the bread');
  check(await until(() => sc(() => document.querySelector('[data-testid=shop-coins]')?.textContent?.includes('You carry')), 1000), 'the shop shows what you carry');
  await sc(() => window.__solrift.give(260, 2)); // two diamonds
  const slot = await sc(() => window.__solrift.inventory().findIndex((s) => s && s[0] === 260));
  const rich = await coinsNow();
  await until(() => sc((i) => !document.querySelector(`[data-testid=shop-sell-${i}]`)?.disabled, slot), 2000);
  await page.click(`[data-testid=shop-sell-${slot}]`);
  check(await until(async () => (await coinsNow()) > rich, 3000), 'selling a diamond pays coins');
  check((await sc(() => window.__solrift.countOf(260))) === 1, 'and takes one diamond');
  await page.keyboard.press('Escape');
  await until(async () => (await screen()) === 'none', 3000);
}

// ---- and the other merchants, one trade each
const trades = { 5: ['Hilda Ironwall', 'Armorer', /leather helmet/i], 6: ['Garrick Bladesworn', 'Weaponsmith', /iron sword/i], 7: ['Fenna Longbow', 'Ranger Quartermaster', /crossbow/i], 8: ['Lysa Moonweaver', 'Arcanist', /wand/i] };
const stocks = new Set();
for (const [variant, [name, title, wanted]] of Object.entries(trades)) {
  const keeper = (await npcs()).find((n) => n.variant === Number(variant)) ?? null;
  check(!!keeper, `${name} (${title}) keeps a stall`);
  if (!keeper) continue;
  await standBy(keeper, -1.8);
  await sc((id) => window.__solrift.talkToMob(id), keeper.id);
  await until(async () => (await screen()) === 'dialog', 3000);
  check((await sc(() => document.querySelector('[data-testid=quest-dialog]')?.textContent ?? '')).includes(title), `${name} is the ${title}`);
  await until(() => sc(() => !!document.querySelector('[data-testid=shop-panel]')), 2000);
  const wares = await sc(() => [...document.querySelectorAll('[data-testid^=shop-buy-]')].map((e) => e.getAttribute('data-name')));
  check(wares.some((w) => wanted.test(w)), `${title} sells ${wanted}`);
  check(!wares.some((w) => /bread/i.test(w)), `${title} is not a general store`);
  stocks.add(wares.join('|'));
  if (variant === '5') await shot('shop-armorer', 300);
  await page.keyboard.press('Escape');
  await until(async () => (await screen()) === 'none', 3000);
}
check(stocks.size === 4, 'every merchant has different wares');

// ---- a look around: the village from the air, the road, the ruin
await sc(() => window.__solrift.setMode('creative'));
await sc(() => window.__solrift.setFlying(true));
await sc(() => { document.getElementById('overlay').style.display = 'none'; window.__solrift.forceLock(); });
await sc(() => window.__solrift.teleport(0.5, 92, 52, 0, -0.55));
await shot('village-air', 2500);
await sc(() => window.__solrift.teleport(92.5, 95, 26.5, 0, -0.45));
await shot('ruin', 3500);

// ---- the chapel's portal (the way into the dungeon), then the dungeon itself: a separate map far to the east.
// Offline (debug) there is no realm to carry us through the portal, so we step to where it would put us.
const chapelY = await sc(() => window.__solrift.surfaceY(86.5, 0.5));
await sc((y) => window.__solrift.teleport(86.5, y + 2.5, 0.5, -Math.PI / 2, -0.1), chapelY);
await shot('chapel-portal', 3000);
await sc(() => window.__solrift.setFlying(false));
// Step into the portal's cell: the realm carries us to our own copy of the dungeon.
// (the portal's height depends on the land, so try a few floors until one is in the doorway)
let carried = false;
for (let y = chapelY - 6; y <= chapelY && !carried; y++) {
  await sc((yy) => window.__solrift.teleport(92.5, yy, 0.5, -Math.PI / 2, 0), y);
  carried = await until(() => sc(() => window.__solrift.position().x > 4000), 600);
}
check(carried, 'stepping into the chapel portal carries us to the dungeon');
console.log('  position in the dungeon:', JSON.stringify(await sc(() => window.__solrift.position())));
check(
  await until(() => sc(() => document.querySelector('[data-testid=zone-banner]')?.textContent?.includes('Hollow Cellar') ?? false), 10000),
  'the Hollow Cellar banner shows on entering',
);
await shot('cellar-banner', 800);
await sc(() => window.__solrift.setFlying(true));
await sc(() => window.__solrift.teleport(4106.5, 63.5, 4120.5, -Math.PI / 2, 0.1));
await shot('cellar-hall', 3000);
await sc(() => window.__solrift.teleport(4128.5, 64, 4120.5, -Math.PI / 2, 0.15));
await shot('cellar-crypt', 3000);
await sc(() => window.__solrift.teleport(4146.5, 63.5, 4120.5, -Math.PI / 2, 0.1));
await shot('cellar-vault', 3000);

// ---- the map in the dungeon shows the dungeon alone, not the land around it
// (the map Maren gave is still carried)
await sc(() => window.__solrift.select(window.__solrift.inventory().findIndex((s) => s && s[0] === 390)));
await sleep(500);
await sc(() => window.__solrift.setMapUp(true));
await sleep(1500);
const dm = await sc(() => window.__solrift.mapState());
check(dm.up && dm.underground && dm.inside, 'in the dungeon the map shows its level, not the land above, and only the dungeon');
await shot('cellar-map', 300);
await sc(() => window.__solrift.setMapUp(false));

// ---- online only: the title screen has no single-player Adventure, and the game refuses it without ?debug
const solo = await ctx.newPage();
solo.on('pageerror', () => undefined);
await solo.goto(`${url}/?world=adventure`, { waitUntil: 'load' });
await solo.waitForTimeout(3000);
check(!(await solo.$('[data-testid=quest-tracker]')), 'Adventure does not open offline');
await solo.close();

// ---- join the Adventure realm (the multiplayer server)
if (process.env.E2E_ADVENTURE_PORT) {
  const online = await ctx.newPage();
  online.on('pageerror', (e) => errors.push(e.message));
  await online.goto(`${url}/?online&server=ws://localhost:${process.env.E2E_ADVENTURE_PORT}&name=Wanderer`, { waitUntil: 'load' });
  // (A new character has no quest yet, so the tracker is there but empty: wait for it to exist, not to be seen.)
  const joined = await online.waitForSelector('[data-testid=quest-tracker]', { timeout: 120000, state: 'attached' }).then(() => true, () => false);
  check(joined, 'joining the multiplayer server brings the quest tracker');
  check(
    await until(() => online.evaluate(() => document.querySelector('[data-testid=zone-banner] .zone-name')?.textContent === 'The Undercroft'), 20000),
    'and a new character wakes in the Undercroft there too',
  );
  await online.screenshot({ path: `${outDir}/adventure-online.png` });

  // The friendly address: /play/<name> is the same as ?online&name=<name>.
  const nice = await ctx.newPage();
  nice.on('pageerror', (e) => errors.push(e.message));
  await nice.goto(`${url}/play/Pathfinder?server=ws://localhost:${process.env.E2E_ADVENTURE_PORT}&debug`, { waitUntil: 'load' });
  check(await nice.waitForSelector('[data-testid=quest-tracker]', { timeout: 120000, state: 'attached' }).then(() => true, () => false), '/play/<name> joins the realm');
  check(new URL(nice.url()).pathname === '/play/Pathfinder', 'and the address stays as it is');
  check(await until(() => nice.evaluate(() => window.__solrift?.online?.() === true), 10000), 'and it is the online game');

  // ---- the party on screen: invite from the window (P), answer with a button, then with the Y key
  const mate = await ctx.newPage();
  mate.on('pageerror', (e) => errors.push(e.message));
  await mate.goto(`${url}/play/Scout?server=ws://localhost:${process.env.E2E_ADVENTURE_PORT}&debug`, { waitUntil: 'load' });
  await mate.waitForSelector('[data-testid=quest-tracker]', { timeout: 120000, state: 'attached' });
  await mate.waitForFunction(() => window.__solrift?.isReady?.(), null, { timeout: 120000 }); // the world has to be in before anything is said to them
  for (const pg of [nice, mate]) await pg.evaluate(() => { document.getElementById('overlay').style.display = 'none'; window.__solrift.forceLock(); });
  await nice.keyboard.press('KeyP');
  check(await until(() => nice.evaluate(() => !!document.querySelector('[data-testid=party-window]')), 4000), 'P opens the party window');
  await nice.fill('#party-name', 'Scout');
  await nice.click('[data-testid=party-send]');
  check(await until(() => mate.evaluate(() => !!document.querySelector('[data-testid=party-invite]')), 20000), 'the invited player sees an invitation');
  check((await mate.textContent('[data-testid=party-invite]')).includes('Pathfinder'), 'it says who is asking');
  check(await mate.isVisible('[data-testid=party-accept]'), 'with an Accept button on it');
  await sleep(700);
  await mate.screenshot({ path: `${outDir}/adventure-party-invite.png` });
  await mate.click('[data-testid=party-accept]');
  check(await until(() => mate.evaluate(() => !!document.querySelector('[data-testid=party-frame]')), 6000), 'accepting shows the party frame');
  check(await until(() => nice.evaluate(() => document.querySelectorAll('[data-testid=party-frame] .party-member').length === 2), 6000), 'the leader sees both members');
  check(!(await mate.$('[data-testid=party-invite]')), 'the invitation is gone');
  await nice.keyboard.press('Escape');
  await nice.screenshot({ path: `${outDir}/adventure-party-frame.png` });

  // Leave, be asked again, and answer with the Y key.
  await mate.evaluate(() => window.__solrift.forceLock());
  await mate.keyboard.press('KeyP');
  await mate.click('[data-testid=party-leave]');
  check(await until(() => mate.evaluate(() => !document.querySelector('[data-testid=party-frame]')), 6000), 'leaving takes the frame away');
  await mate.keyboard.press('Escape');
  await nice.keyboard.press('KeyP');
  await nice.fill('#party-name', 'Scout');
  await nice.click('[data-testid=party-send]');
  await nice.keyboard.press('Escape');
  check(await until(() => mate.evaluate(() => !!document.querySelector('[data-testid=party-invite]')), 6000), 'a second invitation arrives');
  await mate.evaluate(() => { document.getElementById('overlay').style.display = 'none'; window.__solrift.forceLock(); });
  await mate.keyboard.press('KeyY');
  check(await until(() => mate.evaluate(() => !!document.querySelector('[data-testid=party-frame]')), 6000), 'Y accepts it');
  await mate.close();
  await nice.close();
}

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall adventure checks passed');
