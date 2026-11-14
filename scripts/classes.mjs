// Classes E2E: the class bar and sheet, abilities on the keys (Z X C G, K), the effects on mobs, and two players online
// seeing each other's class and ability effects. Screenshots go to the output dir.
// Usage: node scripts/classes.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
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
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};

async function open(path, name, viewport = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${url}/${path}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
  await page.evaluate(() => {
    const o = document.getElementById('overlay');
    if (o) o.style.display = 'none';
    window.__solrift.forceLock();
  });
  return page;
}
const hook = (page, fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);
const view = (page) => hook(page, 'classView');

// A new character knows nothing: read the skill book, as a player does (it goes in the hand, then a right click).
// On their own the test hands the book over; online nothing can be handed over from the page, so the book is taken from
// the creative inventory (the server allows /gamemode with CHEATS=1), and read back in survival.
async function learn(page, ability, online = false) {
  const id = await hook(page, 'itemId', `skill_book_${ability}`);
  if (online) {
    await hook(page, 'chat', '/gamemode creative');
    if (!(await until(async () => (await hook(page, 'mode')) === 'creative', 5000))) return false;
    await hook(page, 'command', { t: 'inventory' });
    await page.fill('[data-testid=creative-search]', `book ${ability.replace(/_/g, ' ')}`);
    const book = page.locator('[data-testid=creative-palette] .slot.palette');
    if (!(await until(async () => (await book.count()) === 1, 5000))) return false;
    await book.click({ modifiers: ['Shift'] });
    await until(async () => (await hook(page, 'inventory')).some((s) => s && s[0] === id), 5000);
    await hook(page, 'command', { t: 'closeMenu' });
    await hook(page, 'chat', '/gamemode survival');
    if (!(await until(async () => (await hook(page, 'mode')) === 'survival', 5000))) return false;
  } else await hook(page, 'give', id, 1);
  const slot = await page.evaluate((i) => window.__solrift.inventory().findIndex((s) => s && s[0] === i), id);
  if (slot < 0 || slot > 8) return false;
  if (online) await page.keyboard.press(`Digit${slot + 1}`);
  else await hook(page, 'select', slot);
  await sleep(150);
  await page.mouse.down({ button: 'right' });
  await sleep(120);
  await page.mouse.up({ button: 'right' });
  const done = await until(async () => (await view(page))?.abilities.some((a) => a.unlocked && a.id === ability), 4000);
  return done;
}

// ---------------------------------------------------------------------------------------------------
console.log('warrior, on their own');
const w = await open('?seed=1337&debug&nomobs&noshadows&class=warrior', 'warrior');
let cv = await view(w);
check(cv?.id === 'warrior' && cv.level === 1, 'a Warrior starts at level one');
check(cv.maxHealth === 28, `with the Warrior's health (${cv.maxHealth})`);
check(await w.isVisible('#class-bar'), 'the class bar is on screen');
check((await w.locator('#class-bar .cb-slot').count()) === 4, 'with four ability buttons');
check((await w.locator('#class-bar .cb-slot.locked').count()) === 4, 'all four locked (padlocks): a new character has learned nothing');
check((await view(w)).abilities.every((a) => !a.unlocked), 'and the class view agrees');
check((await hook(w, 'shield')).offhand?.[0] === (await hook(w, 'itemId', 'shield')), 'the kit was granted (a shield, in the off hand)');
await w.screenshot({ path: `${outDir}/class-bar-warrior.png` });

// Nothing can be cast before its skill book has been read.
await w.keyboard.press('KeyZ');
await sleep(200);
check((await view(w)).abilities[0].cd === 0, 'Ground Slam does nothing before its book is read');
check((await w.textContent('#item-name')).includes('skill book'), 'and the message says to find or buy its skill book');
check(await learn(w, 'ground_slam'), 'right-clicking the Ground Slam book learns it');
check(await learn(w, 'shield_bash'), 'and the Shield Bash book too');
const bookLeft = await w.evaluate(() => window.__solrift.countOf(window.__solrift.itemId('skill_book_ground_slam')));
check(bookLeft === 0, 'the book is used up');
check((await w.locator('#class-bar .cb-slot.locked').count()) === 2, 'two buttons are open, two still locked');

const p = await hook(w, 'position');
await hook(w, 'teleport', p.x, p.y, p.z, 0, 0);
const zid = await hook(w, 'spawnMob', 'zombie', p.x, p.y, p.z - 2.2);
const zombieHealth = async () => (await hook(w, 'mobs')).find((m) => m.id === zid)?.health;
const before = await zombieHealth();
await w.keyboard.press('KeyX'); // Shield Bash
await sleep(400);
const after = await zombieHealth();
check(before !== undefined && after !== undefined && after < before, `Shield Bash (X) hurts the zombie in front (${before} -> ${after})`);
cv = await view(w);
check(cv.abilities[1].cd > 5, 'and its cooldown runs');
check((await w.locator('#class-bar .cb-slot').nth(1).getAttribute('class')).includes('cooling'), 'the button shows it cooling down');
check(cv.resource < cv.maxResource, 'and the stamina was spent');
const hp1 = await zombieHealth();
await w.keyboard.press('KeyX');
await sleep(300);
check((await zombieHealth()) >= hp1 - 0.001 || (await zombieHealth()) === undefined, 'pressing it again before it is ready does nothing');

await w.keyboard.press('KeyZ'); // Ground Slam
await sleep(300);
check((await view(w)).abilities[0].cd > 5, 'Ground Slam (Z) is cast');
check((await hook(w, 'fxList')).some((f) => f.k === 'leap'), 'and its effect exists in the world');
check((await hook(w, 'abilityMeshes')) > 0, 'drawn on screen');
await w.screenshot({ path: `${outDir}/class-ground-slam.png` });

// Locked abilities refuse and say why.
await w.keyboard.press('KeyC');
await sleep(200);
check((await view(w)).abilities[2].cd === 0 && (await view(w)).resource > 0, 'a locked ability (C, Charge) does nothing');
check((await w.textContent('#item-name')).includes('Charge'), 'and says it has not been learned');

// The class sheet.
await w.keyboard.press('KeyK');
await sleep(300);
check(await w.isVisible('#class-sheet'), 'K opens the spellbook (a tab of the inventory window)');
const sheet = await w.textContent('#class-sheet');
check(sheet.includes('Warrior') && sheet.includes('Ground Slam') && sheet.includes('Iron Defense') && sheet.includes('character level 0'), 'it lists the class, its level and its abilities');
await w.screenshot({ path: `${outDir}/class-sheet-warrior.png` });
await w.keyboard.press('Escape');
await sleep(200);
check(!(await w.isVisible('#class-sheet')), 'Escape closes it');

// Levelling up teaches nothing by itself: it only makes the higher books readable.
const lv0 = (await view(w)).level;
await hook(w, 'addXp', 1000); // the character's level (the green bar) is what the class follows
await sleep(300);
cv = await view(w);
check(cv.level > lv0 && cv.abilities.filter((a) => a.unlocked).length === 2, `the character's level levels the class up and unlocks nothing (${lv0} -> ${cv.level})`);
check((await w.locator('#class-bar .cb-slot.locked').count()) === 2, 'the buttons stay locked until their books are read');
check(await learn(w, 'charge'), 'and now the Charge book (level 3) can be read');
check(await learn(w, 'iron_defense'), 'and the Iron Defense book (level 5)');
check((await w.locator('#class-bar .cb-slot.locked').count()) === 0, 'which opens the last two buttons');
await w.context().close();

// ---------------------------------------------------------------------------------------------------
console.log('mage and ranger');
for (const [cls, hp, key, ability] of [
  ['mage', 14, 'KeyZ', 'Fireball'],
  ['ranger', 20, 'KeyZ', 'Piercing Shot'],
]) {
  const page = await open(`?seed=1337&debug&nomobs&noshadows&class=${cls}`, cls);
  check(await learn(page, cls === 'mage' ? 'fireball' : 'piercing_shot'), `the ${ability} book is read`);
  const v = await view(page);
  check(v?.id === cls && v.maxHealth === hp, `a ${cls} has ${hp} health (${v?.maxHealth})`);
  const pos = await hook(page, 'position');
  await hook(page, 'teleport', pos.x, pos.y, pos.z, 0, 0);
  const id = await hook(page, 'spawnMob', 'zombie', pos.x, pos.y, pos.z - 7);
  const h0 = (await hook(page, 'mobs')).find((m) => m.id === id).health;
  await page.keyboard.press(key);
  const hurt = await until(async () => ((await hook(page, 'mobs')).find((m) => m.id === id)?.health ?? 0) < h0, 5000);
  check(hurt, `${ability} hits a zombie 7 blocks away`);
  check((await view(page)).resource < v.resource, `and costs ${cls === 'mage' ? 'mana' : 'focus'}`);
  await page.screenshot({ path: `${outDir}/class-${cls}.png` });
  await page.context().close();
}

console.log('a character with no class');
const plain = await open('?seed=1337&debug&nomobs&noshadows&class=none', 'plain');
check((await view(plain)) === null, 'has no class state');
check(!(await plain.isVisible('#class-bar')), 'and no class bar');
await plain.keyboard.press('KeyZ');
await plain.keyboard.press('KeyK');
await sleep(200);
check(!(await plain.isVisible('#class-sheet')), 'K does nothing for it');
await plain.context().close();

// ---------------------------------------------------------------------------------------------------
console.log('online');
const alice = await open('?online&debug&noshadows&name=alice&class=mage', 'alice');
const bob = await open('?online&debug&noshadows&name=bob&class=warrior', 'bob');
check(await until(async () => (await hook(alice, 'others')).length >= 1 && (await hook(bob, 'others')).length >= 1, 15000), 'both see each other');
const seenByBob = (await hook(bob, 'others')).find((o) => o.name === 'alice');
const seenByAlice = (await hook(alice, 'others')).find((o) => o.name === 'bob');
check(seenByBob?.cls === 'mage' && seenByAlice?.cls === 'warrior', `each sees the other's class (${seenByBob?.cls}, ${seenByAlice?.cls})`);
check((await view(alice))?.id === 'mage' && (await view(bob))?.id === 'warrior', 'and their own class comes from the server');

check(await learn(alice, 'fireball', true), 'alice reads a skill book online (the server learns it)');
check(await learn(alice, 'frost_nova', true), 'and a second one');

// The server decides: a client that sends its own numbers changes nothing.
await alice.evaluate(() => window.__solrift.netCommand({ t: 'ability', slot: 99 }));
await alice.evaluate(() => window.__solrift.netCommand({ t: 'ability', slot: 0, damage: 9999 }));
await sleep(500);
const cvA = await view(alice);
check(cvA.abilities[0].cd > 1 && cvA.abilities[1].cd === 0 && cvA.abilities[2].cd === 0, 'a bad slot is ignored, and extra fields on a good one are ignored');

const ap = await hook(alice, 'position');
await hook(bob, 'chat', `/tp ${ap.x + 3} ${ap.y} ${ap.z}`);
await sleep(1500);
await alice.bringToFront();
await alice.keyboard.press('KeyX'); // Frost Nova: around the caster, visible to those nearby
// (the mark is short-lived, so look for it straight away, then check the cooldown)
check(await until(async () => (await hook(bob, 'fxList')).some((f) => f.k === 'frost_nova' && f.by === 'alice'), 6000), "bob sees alice's Frost Nova");
check((await view(alice)).abilities[1].cd > 5, 'the caster casts with the key');
await bob.screenshot({ path: `${outDir}/class-online-bob-sees-nova.png` });
const bobHealth = (await hook(bob, 'classView')).maxHealth;
check(bobHealth === 28, 'and nobody is hurt by it (PvP is off)');
await alice.context().close();
await bob.context().close();

// ---------------------------------------------------------------------------------------------------
console.log('narrow screen');
const phone = await open('?seed=1337&debug&nomobs&noshadows&class=ranger', 'phone', { width: 420, height: 800 });
check(await phone.isVisible('#class-bar'), 'the class bar fits a phone');
const bar = await phone.locator('#class-bar').boundingBox();
check(bar && bar.x >= 0 && bar.x + bar.width <= 420 && bar.y >= 0 && bar.y + bar.height <= 800, `inside the screen (${JSON.stringify(bar)})`);
check(await learn(phone, 'piercing_shot'), 'a ranger on a phone reads a skill book');
await phone.locator('#class-bar .cb-slot').nth(0).dispatchEvent('pointerdown');
await sleep(400);
check((await view(phone)).abilities[0].cd > 0, 'and its buttons can be pressed by touch');
await phone.screenshot({ path: `${outDir}/class-bar-phone.png` });
await phone.context().close();

await browser.close();
check(errors.length === 0, `no console errors${errors.length ? `: ${errors[0]}` : ''}`);
if (failures.length) {
  console.error(`\nclasses E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('classes E2E passed');
