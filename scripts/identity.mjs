// The character lobby (/game, after PLAY's dialog chose single player and a mode, or multiplayer): guest or Solana wallet,
// then name, character and class, and Play straight into the game. A guest keeps nothing; a wallet player keeps
// progress and character (here: the character and name, saved on the account, and used online).
// Usage: node scripts/identity.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
import { installWallet, openPlay } from './titleFlow.mjs';

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

/**
 * Make a character and play it. No name or class is suggested, so both are chosen (a name when the field is empty); the look is already set.
 * CREATE makes it (a wallet character is permanent, so the first click only asks and the second creates it), and PLAY is a click of its own.
 */
async function playAs(page, id = 'warrior', wallet = false, { play = true } = {}) {
  await page.waitForSelector('#class-cards');
  if (!(await page.inputValue('#char-name'))) await page.fill('#char-name', `Hero${Math.floor(Math.random() * 9000 + 1000)}`);
  await page.click(`#class-cards [data-class="${id}"]`);
  await page.click('#play-go');
  if (wallet) await page.click('#play-go');
  if (!play) return;
  await page.waitForSelector('#gp-name').catch(async (e) => {
    throw new Error(`the character was not made: ${(await page.textContent('#class-error').catch(() => null)) ?? (await page.textContent('#dest-sub').catch(() => '?'))} (${e.message.split('\n')[0]})`);
  });
  await page.click('#play-go');
}

async function newPage({ wallet = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  // The refusals this suite provokes (409 name taken or second character, 404 old route) show up in the console: expected.
  page.on('console', (m) => m.type() === 'error' && !/409|404/.test(m.text()) && errors.push(` (${m.location().url})`));
  page.on('pageerror', (e) => errors.push(e.message));
  const w = wallet ? await installWallet(page) : null;
  return { ctx, page, wallet: w };
}

const HOME = `${url}/?home&debug&nomobs`;
const ready = (page) => page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
/** The front page to the lobby on /game, through PLAY's dialog, once it knows which saved worlds there are. */
async function toPlay(page, way = 'single') {
  await openPlay(page, { way, timeout: 30000 });
  if (way === 'single') await page.waitForSelector('#single-panel[data-ready=true]', { timeout: 30000 });
}
/** The front page to the lobby with a new single-player survival world (a random seed when none is given). */
async function toWho(page, seed) {
  await toPlay(page);
  if (seed !== undefined) await page.fill('#seed-input', String(seed));
}
const account = async (page) => (await page.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()))).account;
const worldSeeds = (page) => page.$$eval('#home .lb-worlds li', (els) => els.map((e) => e.dataset.seed));
const SIZES = { skin: 8, hair: 12, style: 3, eyes: 6, shirt: 12, pants: 8 };
const ORDER = ['skin', 'hair', 'style', 'eyes', 'shirt', 'pants'];
/** The picks on screen, and the code the game makes of them. */
const picks = (page) =>
  page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.lb-row')].map((r) => [r.dataset.part, Number(r.querySelector('[aria-pressed="true"]')?.dataset.index)])));
const codeOf = (p) => ORDER.reduce((n, k) => n * SIZES[k] + p[k], 0);
/** Pick a look part. The looks sit in "Customise appearance", closed until it is opened. */
const pick = async (page, part, index) => {
  if (!(await page.isVisible(`.lb-row[data-part="${part}"]`))) await page.click('#look-more summary');
  await page.click(`.lb-row[data-part="${part}"] [data-index="${index}"]`);
};
/** What every SolRift database on this device holds: keys by "database/store". A wallet character has a database of its own. */
const idb = (page) =>
  page.evaluate(async () => {
    const dbs = (await indexedDB.databases()).filter((d) => d.name?.startsWith('solrift'));
    if (dbs.length === 0) return { exists: false };
    const out = { exists: true };
    for (const d of dbs) {
      await new Promise((resolve) => {
        const r = indexedDB.open(d.name);
        r.onsuccess = () => {
          const db = r.result;
          const names = [...db.objectStoreNames];
          if (names.length === 0) {
            db.close();
            return resolve();
          }
          const tx = db.transaction(names, 'readonly');
          let n = names.length;
          for (const s of names) {
            const q = tx.objectStore(s).getAllKeys();
            q.onsuccess = () => {
              out[`${d.name}/${s}`] = q.result.map(String);
              if (--n === 0) {
                db.close();
                resolve();
              }
            };
          }
        };
        r.onerror = () => resolve();
      });
    }
    return out;
  });
/** The databases whose keys include one that starts with this world id. */
const dbsWith = (stored, seed) => [...new Set(Object.entries(stored).filter(([, v]) => Array.isArray(v) && v.some((k) => k.startsWith(seed))).map(([k]) => k.split('/')[0]))];

// ---- 1. the choice ----------------------------------------------------------------------------
console.log('the choice');
const G = await newPage();
const gp = G.page;
await gp.goto(HOME, { waitUntil: 'load' });
await toPlay(gp);
check(new URL(gp.url()).pathname === '/game' && new URL(gp.url()).hash === '' && !gp.url().includes('way='), 'the lobby is the plain address /game');
check(await gp.isVisible('#who-guest') && await gp.isVisible('#who-wallet'), 'it offers a guest and a Solana wallet');
check((await gp.$$('#home .lb-worlds li')).length === 0, 'no saved worlds are offered to someone who is not signed in');
check((await gp.$$('.lb-continue')).length === 0, 'and nothing to continue');
await gp.fill('#seed-input', '5151');
const dest = await gp.textContent('#lb-how');
check(dest.includes('Single player') && dest.includes('Survival'), `the bar says where it leads (${dest})`);
const whoText = await gp.textContent('#lb-who');
check(whoText.includes('Guest') && whoText.includes('Solana wallet'), 'two ways in: guest and Solana wallet');
check(whoText.includes('Nothing is saved'), 'the guest says nothing is saved');
check(whoText.includes('Progress is saved'), 'the wallet says progress is saved');
await gp.screenshot({ path: `${outDir}/identity-choice.png` });

// ---- 2. guest: name and character -------------------------------------------------------------
console.log('guest character');
await gp.click('#who-guest');
await gp.waitForSelector('#char-name');
check((await gp.inputValue('#char-name')) === '', 'a guest starts with an empty name: none is suggested');
check((await gp.locator('#class-cards .lb-class.on').count()) === 0, 'no class is picked for them');
check(!((await gp.textContent('#look-more summary')) ?? '').includes('optional'), 'and the appearance is not optional');
check(await until(async () => (await gp.locator('#cc-stage canvas.char-preview').count()) === 1), 'the character is drawn in 3D, in the middle');
check((await gp.textContent('#who-save-note')).includes('forgotten'), 'the page says a guest character is forgotten');
check((await gp.locator('#class-cards .lb-class').count()) === 3, 'the three classes are offered');

await gp.fill('#char-name', 'x');
await gp.press('#char-name', 'Tab');
check(await gp.isDisabled('#play-go'), 'CREATE stays disabled (grey) until there is a name and a class');
check(await gp.isVisible('#name-problem'), 'a too-short name is refused with a reason');
check((await gp.locator('#home').count()) === 1, 'and the player stays in the lobby');
await gp.fill('#char-name', 'a<b>');
await gp.press('#char-name', 'Tab');
check((await gp.textContent('#name-problem')).includes('only'), 'odd characters in a name are refused');

await pick(gp, 'skin', 6);
await pick(gp, 'style', 2);
await pick(gp, 'hair', 10);
await pick(gp, 'eyes', 5);
await pick(gp, 'shirt', 7);
await pick(gp, 'pants', 5);
const chosen = await picks(gp);
check(chosen.skin === 6 && chosen.style === 2 && chosen.hair === 10 && chosen.eyes === 5 && chosen.shirt === 7 && chosen.pants === 5, `the picks are shown as chosen (${JSON.stringify(chosen)})`);
await gp.click('#cc-random');
const rnd = await picks(gp);
check(Object.keys(SIZES).every((k) => rnd[k] >= 0 && rnd[k] < SIZES[k]) && codeOf(rnd) !== codeOf(chosen), 'Randomise picks a different look');
for (const k of ORDER) await pick(gp, k, chosen[k]);
await gp.fill('#char-name', 'Scout');
await gp.click('#class-cards [data-class="ranger"]');
check((await gp.textContent('#gp-create')).includes('Create your character') && (await gp.inputValue('#char-name')) === 'Scout' && (await gp.textContent('#gp-hero')).includes('Ranger'), 'the page says a character is being created, with its name and class');
check((await gp.textContent('#char-slots')).includes('New character'), 'and the slot on the left is a new character, not an existing one');
await sleep(800);
await gp.locator('#cc-stage').screenshot({ path: `${outDir}/identity-creator-stage.png` });
await gp.screenshot({ path: `${outDir}/identity-creator-guest.png` });
const guestCode = codeOf(chosen);

// A reload of the tab keeps the guest's look (the session remembers it); the name and the class are made again, as nothing is suggested.
await gp.reload({ waitUntil: 'load' });
await gp.waitForSelector('#char-name');
check((await gp.inputValue('#char-name')) === '', 'reloading the tab suggests no name');
check(codeOf(await picks(gp)) === guestCode, 'but keeps the look');
check((await gp.locator('#class-cards .lb-class.on').count()) === 0, 'and no class');
await gp.fill('#seed-input', '5151');
await gp.fill('#char-name', 'Scout');
for (const k of ORDER) await pick(gp, k, chosen[k]);
// CREATE shows the character made, with what it carries and the clothes of its class; PLAY is the next click.
await gp.click('#class-cards [data-class="warrior"]');
check((await gp.locator('#char-sheet').count()) === 0, 'while a character is being made no bags are shown yet');
await gp.click('#play-go');
await gp.waitForSelector('#gp-name');
check((await gp.textContent('#gp-name')).includes('Scout') && (await gp.locator('#char-sheet[data-state="ready"]').count()) === 1, 'CREATE shows the character made, with what it carries');
check((await gp.locator('.gamepage').count()) === 1, 'and the lobby is still there: it does not play yet');
await gp.click('#play-go');

// ---- 3. guest in a single-player world: nothing is kept ---------------------------------------
console.log('guest world');
await ready(gp);
check((await gp.locator('#home').count()) === 0, 'Play goes straight into the world that was chosen');
check((await gp.evaluate(() => window.__solrift.isGuest())) === true, 'the game runs in guest mode');
check((await gp.evaluate(() => window.__solrift.myLook())) === guestCode, 'the body wears the chosen character');
check((await gp.textContent('#guest-pause-note')).includes('Scout'), 'the pause screen says who is playing and that nothing is saved');
check((await gp.locator('#overlay .world-tools').count()) === 0, 'and offers no world export, import or delete');
await gp.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.openMenu('inventory');
});
check(await until(async () => (await gp.locator('canvas.char-preview').count()) === 1), 'the inventory shows the character');
await sleep(700);
await gp.locator('.char-box').screenshot({ path: `${outDir}/identity-inventory.png` });
await gp.evaluate(() => window.__solrift.closeMenu());
await gp.evaluate(() => window.__solrift.setView(1));
await sleep(700);
await gp.screenshot({ path: `${outDir}/identity-third-person.png`, clip: { x: 390, y: 120, width: 500, height: 440 } });
await gp.evaluate(() => window.__solrift.save());
await sleep(500);
const stored = await idb(gp);
const kept = stored.exists ? Object.values(stored).flat().filter((k) => typeof k === 'string' && k.startsWith('5151')) : [];
check(kept.length === 0, `nothing of the guest world is written on this device (${JSON.stringify(kept)})`);
check((await gp.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('solrift-recipes')))).length === 0, 'no recipe book is kept either');
await gp.context().close();

// ---- 4. wallet: the character is made once and belongs to the account ---------------------------
console.log('wallet character');
const W = await newPage({ wallet: true });
const wp = W.page;
await wp.goto(HOME, { waitUntil: 'load' });
await toWho(wp, 7272);
await wp.click('#who-wallet');
await wp.waitForSelector('.wallet-pick');
check(true, 'the wallet panel lists the installed wallet');
await wp.screenshot({ path: `${outDir}/identity-wallet-pick.png` });
await wp.click('.wallet-pick');
await wp.waitForSelector('#char-name', { timeout: 20000 });
check(true, 'signing in a new account goes on to making its character, in the lobby');
check((await wp.inputValue('#char-name')) === '', 'the name is empty: none is suggested, not even the one of the account');
check((await wp.textContent('#who-save-note')).includes('Saved to your account'), 'the page says the character is saved to the account');
check((await wp.textContent('#permanent-note')).includes('permanent'), 'and warns that it is permanent: no edit or rename, only delete');

await wp.fill('#char-name', 'Aurelia');
await pick(wp, 'skin', 7);
await pick(wp, 'style', 1);
await pick(wp, 'hair', 11);
await pick(wp, 'eyes', 1);
await pick(wp, 'shirt', 4);
await pick(wp, 'pants', 2);
const walletPicks = await picks(wp);
const walletCode = codeOf(walletPicks);

// The class comes with the character. Making it for good takes a second, deliberate click, and any change takes the go-ahead back.
check((await wp.locator('#class-cards .lb-class').count()) === 3, 'the three classes are offered');
check(((await wp.textContent('#dest-sub')) ?? '').includes('Pick a class'), 'and Play says a class is needed first');
await wp.click('#class-cards [data-class="mage"]');
const mageHint = await wp.textContent('#class-hint');
await wp.click('#class-cards [data-class="warrior"]');
const warriorHint = await wp.textContent('#class-hint');
check(mageHint.length > 20 && warriorHint.length > 20 && mageHint !== warriorHint, 'picking a class says what it is, and switching switches it');
await wp.screenshot({ path: `${outDir}/identity-creator-wallet.png` });
await wp.click('#play-go');
check((await wp.textContent('#permanent-note')).includes('Last chance'), 'the first click only asks "are you sure"');
check(await wp.isVisible('#class-cards'), 'and nothing is created yet');
check((await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()))).account.look === null, 'the account still has no character');
await wp.click('#class-cards [data-class="ranger"]');
check(await until(async () => !(await wp.textContent('#permanent-note')).includes('Last chance'), 3000), 'changing the class takes the go-ahead back');
await playAs(wp, 'warrior', true);
await ready(wp);
check((await wp.locator('#home').count()) === 0, 'the second click makes the character, and PLAY then goes into the world');
check((await wp.evaluate(() => window.__solrift.isGuest())) === false, 'the game does not run in guest mode');
check((await wp.evaluate(() => window.__solrift.myLook())) === walletCode, 'the body wears the character that was made');
check((await wp.$('#guest-pause-note')) === null, 'a wallet player gets no guest warning');

const me = await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()));
check(me.account?.displayName === 'Aurelia' && me.account?.look === walletCode, `the account stores the name and character (${JSON.stringify(me.account)})`);
check(me.account?.class === 'warrior' && me.account?.characters?.[0]?.class === 'warrior', 'and its class, stored with the character');

// It cannot be edited or renamed through the API either (the name is taken by the character itself).
const again = await wp.evaluate(() =>
  fetch('/api/auth/character', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'aurelia', look: 5, class: 'warrior' }) }).then((r) => r.status),
);
check(again === 409, `asking for the same name again is refused (${again})`);
const oldRoute = await wp.evaluate(() =>
  fetch('/api/auth/profile', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Other', look: 5 }) }).then((r) => r.status),
);
check(oldRoute === 404, `there is no edit route any more (${oldRoute})`);
check((await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()))).account.displayName === 'Aurelia', 'the name is unchanged');

// The world it is in is kept on this device, so there is progress to lose later.
await wp.evaluate(() => window.__solrift.save());
await sleep(800);
const walletStored = await idb(wp);
const walletKept = walletStored.exists ? Object.values(walletStored).flat().filter((k) => typeof k === 'string' && k.startsWith('7272')) : [];
check(walletKept.length > 0, `the wallet world is saved on this device (${walletKept.length} entries)`);

// Coming back (a "new device" for the session) shows the character, with nothing to edit.
await wp.goto(HOME, { waitUntil: 'load' });
await toPlay(wp);
check(await until(async () => (await worldSeeds(wp)).join() === '7272', 5000), `coming back, the lobby lists the character's world (${await worldSeeds(wp)})`);
await wp.fill('#seed-input', '7272');
await wp.waitForSelector('#char-name-fixed', { timeout: 20000 });
check((await wp.textContent('#who-account')).includes('Aurelia'), 'the wallet panel shows the signed-in account and its saved name');
check((await wp.textContent('#char-name-fixed')) === 'Aurelia', 'the saved name is shown');
check((await wp.locator('#char-name').count()) === 0, 'in no box to rename it');
check((await wp.locator('.lb-row').count()) === 0 && (await wp.locator('#cc-random').count()) === 0, 'and no look to change');
check(await until(async () => (await wp.locator('#cc-stage canvas.char-preview').count()) === 1), 'the saved character stands in the middle, in 3D');
check((await wp.textContent('#gp-name')) === 'Aurelia', 'with its name under it');
await wp.screenshot({ path: `${outDir}/identity-character-saved.png` });

// Names are unique.
const W2 = await newPage({ wallet: true });
const w2 = W2.page;
await w2.goto(HOME, { waitUntil: 'load' });
await toWho(w2);
await w2.click('#who-wallet');
await w2.click('.wallet-pick');
await w2.waitForSelector('#char-name', { timeout: 20000 });
await w2.fill('#char-name', 'aurelia');
await playAs(w2, 'warrior', true, { play: false });
check(await until(async () => (await w2.isVisible('#class-error')) && (await w2.textContent('#class-error')).includes('taken')), 'a name another account has is refused');
check(await w2.isVisible('#class-cards'), 'and the player stays in the lobby, where the name can be changed');
await W2.ctx.close();

// The character continues into the game as it is.
await wp.click('#play-go');
await ready(wp);
check((await wp.evaluate(() => window.__solrift.myLook())) === walletCode && (await wp.evaluate(() => window.__solrift.isGuest())) === false, 'Play goes into the world with the saved character');

// ---- 5. online: others see the character you made ---------------------------------------------
console.log('online');
await wp.goto(`${url}/?online&debug&nomobs&noshadows`, { waitUntil: 'load' });
await ready(wp);
check((await wp.evaluate(() => window.__solrift.myLook())) === walletCode, 'online, the wallet player keeps the saved character');

const G2 = await newPage();
const gp2 = G2.page;
await gp2.goto(HOME, { waitUntil: 'load' });
await toPlay(gp2, 'multi');
check((await gp2.textContent('#dest-title')).includes('Multiplayer'), 'PLAY, then Multiplayer, opens the lobby for the realm');
check(await gp2.isVisible('#who-guest'), 'where a guest or a wallet is chosen');
await gp2.click('#who-guest');
await gp2.waitForSelector('#char-name');
await gp2.fill('#char-name', 'Wanderer');
await pick(gp2, 'skin', 1);
await pick(gp2, 'hair', 6);
await pick(gp2, 'style', 2);
await pick(gp2, 'shirt', 9);
const wandererCode = codeOf(await picks(gp2));
await playAs(gp2, 'warrior');
// Play joins the realm under the chosen name: the game opens on /play/Wanderer.
const joined = await gp2.waitForURL((u) => u.pathname === '/play/Wanderer', { timeout: 20000, waitUntil: 'commit' }).then(
  () => true,
  () => false,
);
check(joined, `a guest joins the realm under the chosen name, at /play/Wanderer (${new URL(gp2.url()).pathname})`);
// (the same address with the test hooks switched on)
await gp2.goto(`${url}/?online&debug&nomobs&noshadows&name=Wanderer`, { waitUntil: 'load' });
await ready(gp2);
check((await gp2.evaluate(() => window.__solrift.myLook())) === wandererCode, 'the guest carries the chosen character online');

check(await until(async () => (await wp.evaluate(() => window.__solrift.others())).some((o) => o.name === 'Wanderer')), 'the wallet player sees the guest');
const seen = (await wp.evaluate(() => window.__solrift.others())).find((o) => o.name === 'Wanderer');
check(seen?.look === wandererCode, `with the character the guest made (${seen?.look} vs ${wandererCode})`);
check(await until(async () => (await gp2.evaluate(() => window.__solrift.others())).some((o) => o.name === 'Aurelia' && o.look === walletCode)), 'and the guest sees the wallet player with theirs');

// Put them side by side for a picture.
for (const p of [wp, gp2]) {
  await p.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
    window.__solrift.forceLock();
  });
}
for (const p of [wp, gp2]) await p.evaluate(() => window.__solrift.chat('/gamemode creative'));
const pos = await wp.evaluate(() => window.__solrift.position());
await gp2.evaluate(([x, y, z]) => window.__solrift.chat(`/tp ${x - 0.9} ${y} ${z - 3.2}`), [pos.x, pos.y + 1, pos.z]);
await gp2.evaluate(() => window.__solrift.look(Math.PI, 0));
await wp.evaluate(() => window.__solrift.look(0, 0));
await sleep(3000);
await wp.screenshot({ path: `${outDir}/identity-online.png`, clip: { x: 340, y: 130, width: 600, height: 420 } });

// ---- 6. delete: the whole character goes, with all progress -------------------------------------
console.log('delete character');
const gone = await wp.evaluate(() =>
  fetch('/api/auth/character/delete', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'Aurelia' }) }).then(async (r) => ({ status: r.status, body: await r.json() })),
);
check(gone.status === 409 && /leave the game/i.test(gone.body.error ?? ''), `deleting is refused while the character is in the realm (${gone.status})`);
await wp.goto(HOME, { waitUntil: 'load' });
await toWho(wp);
await wp.waitForSelector('#delete-open', { timeout: 20000 });
check((await wp.locator('#delete-box').count()) === 0, 'nothing is deleted by accident: the button is tucked away');
await wp.click('#delete-open');
const warn = await wp.textContent('#delete-box');
check(warn.includes('Aurelia') && warn.includes('all its progress') && warn.includes('cannot be undone'), 'deleting explains that the character and all progress go for good');
check(await wp.isDisabled('#delete-go'), 'and cannot be confirmed yet');
await wp.fill('#delete-confirm', 'Aure');
check(await wp.isDisabled('#delete-go'), 'a wrong name keeps it locked');
await wp.screenshot({ path: `${outDir}/identity-delete.png` });
await wp.click('#delete-cancel');
check((await wp.locator('#char-name-fixed').count()) === 1 && (await wp.locator('#delete-box').count()) === 0, 'keeping it closes the box and changes nothing');
await wp.click('#delete-open');
await wp.fill('#delete-confirm', 'aurelia');
check(!(await wp.isDisabled('#delete-go')), 'typing the name unlocks it');
// The realm may take a moment to notice the player has left.
let deleted = false;
for (let i = 0; i < 20 && !deleted; i++) {
  await wp.click('#delete-go');
  deleted = await until(async () => (await wp.locator('#char-name').count()) === 1, 1500);
  if (!deleted && !(await wp.isVisible('#delete-box'))) break;
  if (!deleted) await sleep(500);
}
check(deleted, 'the character is deleted and the player is back at making a new one');
check((await wp.inputValue('#char-name')) === '', 'with an empty name to fill in: none is suggested');
const meAfter = await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()));
check(meAfter.account?.look === null && meAfter.account?.displayName !== 'Aurelia', 'the account has no character and the old name is gone');
const afterStored = await idb(wp);
const left = afterStored.exists ? Object.values(afterStored).flat().filter((k) => typeof k === 'string' && k.startsWith('7272')) : [];
check(left.length === 0, `every world on this device is gone (${left.length} left)`);
check((await wp.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('solrift-recipes')))).length === 0, 'with the recipe book');

// The name is free again, and a new character can be made.
const W3 = await newPage({ wallet: true });
const w3 = W3.page;
await w3.goto(HOME, { waitUntil: 'load' });
await toWho(w3);
await w3.click('#who-wallet');
await w3.click('.wallet-pick');
await w3.waitForSelector('#char-name', { timeout: 20000 });
await w3.fill('#char-name', 'Aurelia');
await playAs(w3, 'warrior', true);
await ready(w3);
const taken = await account(w3);
check(taken?.displayName === 'Aurelia' && taken.look !== null, 'the freed name can be taken by someone else');
await W3.ctx.close();
// A new character can be made again (and is permanent again).
await wp.fill('#char-name', 'Reborn');
await playAs(wp, 'warrior', true);
await ready(wp);
const meReborn = { account: await account(wp) };
check(meReborn.account?.displayName === 'Reborn' && meReborn.account?.look !== null, 'the same wallet starts over with a new character');

// ---- 7. several characters: up to three, each with its own progress ------------------------------
console.log('several characters');
// `seed` is the world the character then enters.
const toCharacters = async (seed) => {
  await wp.goto(HOME, { waitUntil: 'load' });
  await toWho(wp, seed);
  await wp.waitForSelector('#char-slots', { timeout: 20000 });
};
const slotNames = () => wp.$$eval('#char-slots .lb-slot[data-id]', (els) => els.map((e) => e.querySelector('.slot-name').textContent));
const slotClasses = () => wp.$$eval('#char-slots .lb-slot[data-id] .slot-class', (els) => els.map((e) => e.textContent));
const makeNew = async (name, skin) => {
  await wp.click('#char-new');
  await wp.waitForSelector('#char-name');
  await pick(wp, 'skin', skin);
  await wp.fill('#char-name', name);
  await playAs(wp, 'warrior', true);
  await ready(wp); // (into the world chosen in the lobby)
};
/** Keep the world the character is in. */
const saveWorld = async () => {
  await wp.evaluate(() => window.__solrift.save());
  await sleep(800);
};

await toCharacters(8181);
check(JSON.stringify(await slotNames()) === JSON.stringify(['Reborn']), "the lobby lists the wallet's characters");
check(await wp.isVisible('#char-new'), 'and offers a new one');
await wp.click('#char-new');
await wp.waitForSelector('#char-name');
check((await wp.textContent('#gp-hero')).includes('2 of 3'), 'the creator says it is the second of three');
check((await wp.inputValue('#char-name')) === '', "and starts with an empty name, not the other character's");
await wp.click('#cc-back');
await wp.waitForSelector('#char-name-fixed');
check((await wp.textContent('#char-name-fixed')) === 'Reborn', 'going back shows the character in play again');

await makeNew('Brom', 2);
check((await account(wp))?.displayName === 'Brom', 'the second character is made and played');
await saveWorld();
const bromId = (await account(wp)).id;
check(JSON.stringify(await dbsWith(await idb(wp), '8181')) === JSON.stringify([`solrift-${bromId}`]), 'its world is saved in a database of its own');

await toCharacters(9292);
check((await slotNames()).join() === 'Reborn,Brom', 'both characters are listed, the one played last is shown');
check((await slotClasses()).join() === 'Warrior,Warrior', 'each with its class');
check((await wp.textContent('#char-name-fixed')) === 'Brom', 'Brom is in play');
await wp.click('#char-slots .lb-slot:first-child');
await until(async () => (await wp.textContent('#char-name-fixed')) === 'Reborn');
check((await wp.textContent('#char-name-fixed')) === 'Reborn', 'picking the first one shows it, and still no way to edit');
check((await wp.textContent('#gp-name')) === 'Reborn', 'and it is the one standing in the middle');
await wp.click('#play-go');
await ready(wp);
check((await account(wp))?.displayName === 'Reborn', 'and plays it');
await saveWorld();
const stored2 = await idb(wp);
check(dbsWith(stored2, '8181').length === 1 && dbsWith(stored2, '9292').length === 1 && dbsWith(stored2, '8181')[0] !== dbsWith(stored2, '9292')[0], "each character's worlds are in their own database");

// The lobby lists the worlds of the character in play, and only those.
await wp.goto(HOME, { waitUntil: 'load' });
await toPlay(wp);
check(await until(async () => (await worldSeeds(wp)).includes('9292'), 5000), `Reborn's world is offered in the lobby (${await worldSeeds(wp)})`);
check(!(await worldSeeds(wp)).includes('8181'), "Reborn has none of Brom's worlds");
await wp.waitForSelector('#char-slots');
await wp.click('#char-slots .lb-slot[data-id]:nth-child(2)');
await until(async () => (await wp.textContent('#char-name-fixed')) === 'Brom');
check(await until(async () => (await worldSeeds(wp)).join() === '8181', 5000), `with Brom picked, the lobby offers Brom's world, not Reborn's (${await worldSeeds(wp)})`);

await toCharacters();
await makeNew('Cade', 5);
await toCharacters();
check((await slotNames()).length === 3, 'three characters');
check((await wp.locator('#char-new').count()) === 0 && (await wp.isVisible('#char-full')), 'a fourth cannot be started: the page says delete one first');
await wp.screenshot({ path: `${outDir}/identity-three-characters.png` });
const fourth = await wp.evaluate(() =>
  fetch('/api/auth/character', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Dax', look: 3, class: 'warrior' }) }).then((r) => r.status),
);
check(fourth === 409, `and the server refuses it too (${fourth})`);

// Deleting one wipes that character and nothing else.
await wp.click('#char-slots .lb-slot[data-id]:nth-child(2)');
await until(async () => (await wp.textContent('#char-name-fixed')) === 'Brom');
await wp.click('#delete-open');
await wp.fill('#delete-confirm', 'Brom');
let wiped = false;
for (let i = 0; i < 20 && !wiped; i++) {
  await wp.click('#delete-go');
  wiped = await until(async () => !(await slotNames()).includes('Brom'), 1500);
  if (!wiped) await sleep(500);
}
check(wiped, 'Brom is deleted and the other two remain');
check((await slotNames()).join() === 'Reborn,Cade', 'the wallet keeps Reborn and Cade');
check(await wp.isVisible('#char-new'), 'and there is a free slot again');
const stored3 = await idb(wp);
check(dbsWith(stored3, '8181').length === 0, "Brom's world is gone from this device");
check(dbsWith(stored3, '9292').length === 1, "Reborn's is still there");
const meNow = await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()));
check(meNow.account.characters.length === 2 && meNow.account.id !== bromId, 'the account lists two characters and is still signed in');

// ---- 8. choosing guest signs the wallet out ---------------------------------------------------
console.log('guest after wallet');
await wp.goto(HOME, { waitUntil: 'load' });
await toWho(wp);
await wp.waitForSelector('#who-account', { timeout: 20000 });
await wp.click('#who-guest');
await wp.waitForSelector('#char-name');
const after = await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()));
check(after.account === null, 'playing as a guest signs the wallet session out');
check((await wp.inputValue('#char-name')) !== 'Reborn', 'and the account name is not reused');
check((await wp.textContent('#who-save-note')).includes('forgotten'), 'the page says a guest character is forgotten');

await browser.close();
check(errors.length === 0, `no console errors${errors.length ? `: ${errors[0]}` : ''}`);
if (failures.length) {
  console.error(`\nidentity E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('identity E2E passed');
