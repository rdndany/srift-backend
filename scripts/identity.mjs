// Right before the world (after the play page: single player or multiplayer, a mode and a seed, or the realm): guest or
// Solana wallet, then name, character and class, and straight into the game. A guest keeps nothing; a wallet player
// keeps progress and character (here: the character and name, saved on the account, and used online).
// Usage: node scripts/identity.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
import { installWallet } from './titleFlow.mjs';

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

/** The class step: pick a card and confirm (a wallet character is permanent, so it asks twice). */
async function chooseClass(page, id = 'warrior', wallet = false) {
  await page.waitForSelector('#class-cards');
  await page.click('.cls-card[data-class="' + id + '"]');
  await page.click('#class-confirm');
  if (wallet) await page.click('#class-confirm');
}

async function newPage({ wallet = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  // The refusals this suite provokes (409 name taken or second character, 404 old route) show up in the console: expected.
  page.on('console', (m) => m.type() === 'error' && !/409|404/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const w = wallet ? await installWallet(page) : null;
  return { ctx, page, wallet: w };
}

const HOME = `${url}/?home&debug&nomobs`;
const ready = (page) => page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
/** The front page to the play page (PLAY GAME), once it knows which saved worlds there are. */
async function toPlay(page) {
  await page.waitForSelector('.wow-play', { timeout: 30000 });
  await page.click('.wow-play');
  await page.waitForSelector('#single-panel[data-ready=true]', { timeout: 30000 });
}
/** The front page to the character step: a new single-player survival world (a random seed when none is given). */
async function toWho(page, seed) {
  await toPlay(page);
  if (seed !== undefined) await page.fill('#seed-input', String(seed));
  await page.click('.mode-card[data-mode="survival"]');
  await page.click('#single-panel button.new-world');
}
const account = async (page) => (await page.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()))).account;
const worldSeeds = (page) => page.$$eval('#home .world-list li', (els) => els.map((e) => e.dataset.seed));
const SIZES = { skin: 8, hair: 12, style: 3, eyes: 6, shirt: 12, pants: 8 };
const ORDER = ['skin', 'hair', 'style', 'eyes', 'shirt', 'pants'];
/** The picks on screen, and the code the game makes of them. */
const picks = (page) =>
  page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.cc-row')].map((r) => [r.dataset.part, Number(r.querySelector('[aria-pressed="true"]')?.dataset.index)])));
const codeOf = (p) => ORDER.reduce((n, k) => n * SIZES[k] + p[k], 0);
const pick = (page, part, index) => page.click(`.cc-row[data-part="${part}"] [data-index="${index}"]`);
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
check((await gp.locator('#who-guest').count()) === 0, 'the play page comes first: nobody is asked who they are yet');
check((await gp.textContent('#way-single')).includes("a guest's are not"), 'single player says guest worlds are not saved');
check((await gp.$$('#home .world-list li')).length === 0, 'no saved worlds are offered to someone who is not signed in');
check((await gp.$$('#single-panel button.continue')).length === 0, 'and nothing to continue');
await gp.fill('#seed-input', '5151');
await gp.click('.mode-card[data-mode="survival"]');
await gp.click('#single-panel button.new-world');
await gp.waitForSelector('#who-guest');
check(gp.url().endsWith('#who'), 'the identity step has its own address');
const dest = await gp.textContent('#dest-chip');
check(dest.includes('Single player') && dest.includes('Survival') && dest.includes('5151'), `and says where it leads (${dest})`);
const whoText = await gp.textContent('#home');
check(whoText.includes('Play as guest') && whoText.includes('Solana wallet'), 'two ways in: guest and Solana wallet');
check(whoText.includes('Nothing is saved'), 'the guest card says nothing is saved');
check(whoText.includes('progress and your character are saved'), 'the wallet card says progress and character are saved');
check(!(await gp.isVisible('#char-name')), 'no name box before the choice is made');
await gp.screenshot({ path: `${outDir}/identity-choice.png` });

// ---- 2. guest: name and character -------------------------------------------------------------
console.log('guest character');
await gp.click('#who-guest');
await gp.waitForSelector('#char-name');
const suggested = await gp.inputValue('#char-name');
check(/^Player\d{3}$/.test(suggested), `a guest starts with a suggested name (${suggested})`);
check(await until(async () => (await gp.locator('#cc-stage canvas.char-preview').count()) === 1), 'the character is drawn in 3D');
check((await gp.textContent('#who-save-note')).includes('forgotten'), 'the page says a guest character is forgotten');

await gp.fill('#char-name', 'x');
await gp.click('#who-continue');
check(await gp.isVisible('#name-problem'), 'a too-short name is refused with a reason');
check(await gp.isVisible('#cc-stage'), 'and the player stays on this step');
await gp.fill('#char-name', 'a<b>');
await gp.click('#who-continue');
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
await sleep(800);
await gp.locator('#cc-stage').screenshot({ path: `${outDir}/identity-creator-stage.png` });
await gp.screenshot({ path: `${outDir}/identity-creator-guest.png` });
const guestCode = codeOf(chosen);

await gp.click('#who-continue');
await gp.waitForSelector('#class-cards');
check((await gp.textContent('#home')).includes('Choose your class'), 'the class comes after the name and the look');

// Back and forth keeps the choice: from the class to the look, to the first choice, to the play page, and forward again.
await gp.click('#class-back');
await gp.waitForSelector('#char-name');
check((await gp.inputValue('#char-name')) === 'Scout', 'going back from the class keeps the name');
check(codeOf(await picks(gp)) === guestCode, 'and the character');
await gp.click('#cc-back');
await gp.waitForSelector('#who-guest');
await gp.click('#back-home');
await gp.waitForSelector('#single-panel[data-ready=true]');
check(gp.url().endsWith('#play') && (await gp.inputValue('#seed-input')) === '5151', 'Back from the first choice returns to the play page, with the seed still there');
await gp.click('#single-panel button.new-world');
await gp.waitForSelector('#who-guest');
await gp.click('#who-guest');
await gp.waitForSelector('#char-name');
check((await gp.inputValue('#char-name')) === 'Scout', 'coming forward again, the name is still there');
check(codeOf(await picks(gp)) === guestCode, 'and the character');
await gp.click('#who-continue');
await chooseClass(gp, 'warrior');

// ---- 3. guest in a single-player world: nothing is kept ---------------------------------------
console.log('guest world');
await ready(gp);
check((await gp.locator('#home').count()) === 0, 'confirming the class goes straight into the world that was chosen');
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
await wp.waitForSelector('#who-wallet');
await wp.click('#who-wallet');
check(await wp.isVisible('.wallet-pick'), 'the wallet card lists the installed wallet');
await wp.screenshot({ path: `${outDir}/identity-wallet-pick.png` });
await wp.click('.wallet-pick');
await wp.waitForSelector('#char-name', { timeout: 20000 });
check(true, 'signing in a new account takes the player on to the character step');
const accName = await wp.inputValue('#char-name');
check(/^Player[0-9a-f]{6}$/.test(accName), `the account name is the starting name (${accName})`);
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
await wp.screenshot({ path: `${outDir}/identity-creator-wallet.png` });

// The look is chosen first, then the class. Making it for good takes a second, deliberate click, and any change takes the go-ahead back.
await wp.click('#who-continue');
await wp.waitForSelector('#class-cards');
check((await wp.locator('.cls-card').count()) === 3, 'the class step offers the three classes');
check(await wp.isDisabled('#class-confirm'), 'and nothing can be confirmed before a class is picked');
await wp.click('.cls-card[data-class="mage"]');
check(await wp.isVisible('#class-details'), 'picking a class shows what it is: description, strengths, weaknesses, stats, weapon, abilities');
const details = await wp.textContent('#class-details');
check(details.includes('Mage') && details.includes('Fireball') && details.includes('Meteor') && details.includes('Frost Nova') && details.includes('Arcane Shield'), 'the Mage details name its four abilities');
check((await wp.locator('#class-abilities .cls-ability').count()) === 4, 'four abilities are listed');
check((await wp.textContent('#class-weapon')).length > 0, 'and the starting weapon');
await wp.screenshot({ path: `${outDir}/identity-class-wallet.png` });
await wp.click('.cls-card[data-class="ranger"]');
await wp.click('.cls-card[data-class="warrior"]');
check((await wp.textContent('#class-details')).includes('Ground Slam'), 'switching class switches the details');
await wp.click('#class-confirm');
check((await wp.textContent('#class-permanent-note')).includes('Last chance'), 'the first click only asks "are you sure"');
check(await wp.isVisible('#class-cards'), 'and nothing is created yet');
check((await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()))).account.look === null, 'the account still has no character');
await wp.click('.cls-card[data-class="ranger"]');
check(await until(async () => !(await wp.textContent('#class-permanent-note')).includes('Last chance'), 3000), 'changing the class takes the go-ahead back');
await wp.click('#class-back');
await wp.waitForSelector('#char-name');
check((await wp.inputValue('#char-name')) === 'Aurelia', 'Back returns to the name and look, which are kept');
await wp.click('#who-continue');
await chooseClass(wp, 'warrior', true);
await ready(wp);
check((await wp.locator('#home').count()) === 0, 'the second click makes the character and goes straight into the world');
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
check(await until(async () => (await worldSeeds(wp)).join() === '7272', 5000), `coming back, the play page lists the character's world (${await worldSeeds(wp)})`);
await wp.fill('#seed-input', '7272');
await wp.click('#single-panel button.new-world');
await wp.waitForSelector('#who-wallet-continue', { timeout: 20000 });
check((await wp.textContent('#who-account')).includes('Aurelia'), 'the wallet card shows the signed-in account and its saved name');
await wp.click('#who-wallet-continue');
await wp.waitForSelector('#char-name-fixed');
check((await wp.textContent('#char-name-fixed')) === 'Aurelia', 'the saved name is shown');
check((await wp.locator('#char-name').count()) === 0, 'in no box to rename it');
check((await wp.locator('.cc-row').count()) === 0 && (await wp.locator('#cc-random').count()) === 0, 'and no look to change');
check(await until(async () => (await wp.locator('#cc-stage canvas.char-preview').count()) === 1), 'the saved character is drawn in 3D');
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
await w2.click('#who-continue');
await chooseClass(w2, 'warrior', true);
check(await until(async () => (await w2.isVisible('#class-error')) && (await w2.textContent('#class-error')).includes('taken')), 'a name another account has is refused');
check(await w2.isVisible('#class-cards'), 'and the player stays on the class step, where Back returns to the name');
await W2.ctx.close();

// The character continues into the game as it is.
await wp.click('#who-continue');
await ready(wp);
check((await wp.evaluate(() => window.__solrift.myLook())) === walletCode && (await wp.evaluate(() => window.__solrift.isGuest())) === false, 'Continue goes into the world with the saved character');
// ---- 5. online: others see the character you made ---------------------------------------------
console.log('online');
await wp.goto(`${url}/?online&debug&nomobs&noshadows`, { waitUntil: 'load' });
await ready(wp);
check((await wp.evaluate(() => window.__solrift.myLook())) === walletCode, 'online, the wallet player keeps the saved character');

const G2 = await newPage();
const gp2 = G2.page;
await gp2.goto(HOME, { waitUntil: 'load' });
await toPlay(gp2);
await gp2.click('#way-multi');
check((await gp2.textContent('#multi-panel')).includes('a guest (nothing saved)'), 'the realm panel says a guest keeps nothing');
await gp2.click('#online-link-home');
await gp2.waitForSelector('#who-guest');
check((await gp2.textContent('#dest-chip')).includes('Multiplayer'), 'Join realm leads to the character step first');
await gp2.click('#who-guest');
await gp2.waitForSelector('#char-name');
await gp2.fill('#char-name', 'Wanderer');
await pick(gp2, 'skin', 1);
await pick(gp2, 'hair', 6);
await pick(gp2, 'style', 2);
await pick(gp2, 'shirt', 9);
const wandererCode = codeOf(await picks(gp2));
await gp2.click('#who-continue');
await chooseClass(gp2, 'warrior');
// Confirming the class joins the realm under the chosen name: the game opens on /play/Wanderer.
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
await wp.waitForSelector('#who-wallet-continue', { timeout: 20000 });
await wp.click('#who-wallet-continue');
await wp.waitForSelector('#delete-open');
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
const fresh = await wp.inputValue('#char-name');
check(/^Player[0-9a-f]{6}$/.test(fresh) && fresh !== 'Aurelia', `with a new starting name (${fresh})`);
const meAfter = await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()));
check(meAfter.account?.look === null && meAfter.account?.displayName === fresh, 'the account has no character and the old name is gone');
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
await w3.click('#who-continue');
await chooseClass(w3, 'warrior', true);
await ready(w3);
const taken = await account(w3);
check(taken?.displayName === 'Aurelia' && taken.look !== null, 'the freed name can be taken by someone else');
await W3.ctx.close();
// A new character can be made again (and is permanent again).
await wp.fill('#char-name', 'Reborn');
await wp.click('#who-continue');
await chooseClass(wp, 'warrior', true);
await ready(wp);
const meReborn = { account: await account(wp) };
check(meReborn.account?.displayName === 'Reborn' && meReborn.account?.look !== null, 'the same wallet starts over with a new character');
// ---- 7. several characters: up to three, each with its own progress ------------------------------
console.log('several characters');
// The world is chosen first (the play page), the character after it: `seed` is the world the character then enters.
const toCharacters = async (seed) => {
  await wp.goto(HOME, { waitUntil: 'load' });
  await toWho(wp, seed);
  await wp.waitForSelector('#who-wallet-continue', { timeout: 20000 });
  await wp.click('#who-wallet-continue');
  await wp.waitForSelector('#char-slots');
};
const slotNames = () => wp.$$eval('#char-slots .char-slot[data-id]', (els) => els.map((e) => e.firstChild.textContent));
const slotClasses = () => wp.$$eval('#char-slots .char-slot[data-id] .slot-class', (els) => els.map((e) => e.textContent));
const makeNew = async (name, skin) => {
  await wp.click('#char-new');
  await wp.waitForSelector('#char-name');
  await pick(wp, 'skin', skin);
  await wp.fill('#char-name', name);
  await wp.click('#who-continue');
  await chooseClass(wp, 'warrior', true);
  await ready(wp); // (straight into the world chosen on the play page)
};
/** Keep the world the character is in. */
const saveWorld = async () => {
  await wp.evaluate(() => window.__solrift.save());
  await sleep(800);
};

await toCharacters(8181);
check(JSON.stringify(await slotNames()) === JSON.stringify(['Reborn']), 'the character step lists the wallet\'s characters');
check(await wp.isVisible('#char-new'), 'and offers a new one');
await wp.click('#char-new');
await wp.waitForSelector('#char-name');
check((await wp.textContent('#home h2.step')).includes('2 of 3'), 'the creator says it is the second of three');
check(/^Player\d{3}$/.test(await wp.inputValue('#char-name')), 'and starts from a fresh name, not the other character\'s');
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
await wp.click('#char-slots .char-slot:first-child');
await until(async () => (await wp.textContent('#char-name-fixed')) === 'Reborn');
check((await wp.textContent('#char-name-fixed')) === 'Reborn', 'picking the first one shows it, and still no way to edit');
await wp.click('#who-continue');
await ready(wp);
check((await account(wp))?.displayName === 'Reborn', 'and plays it');
await saveWorld();
const stored2 = await idb(wp);
check(dbsWith(stored2, '8181').length === 1 && dbsWith(stored2, '9292').length === 1 && dbsWith(stored2, '8181')[0] !== dbsWith(stored2, '9292')[0], 'each character\'s worlds are in their own database');

// The play page lists the worlds of the character in play, and only those.
await wp.goto(HOME, { waitUntil: 'load' });
await toPlay(wp);
check(await until(async () => (await worldSeeds(wp)).includes('9292'), 5000), `Reborn's world is offered on the play page (${await worldSeeds(wp)})`);
check(!(await worldSeeds(wp)).includes('8181'), 'Reborn has none of Brom\'s worlds');
await wp.click('#single-panel button.new-world');
await wp.waitForSelector('#who-wallet-continue', { timeout: 20000 });
await wp.click('#who-wallet-continue');
await wp.waitForSelector('#char-slots');
await wp.click('#char-slots .char-slot[data-id]:nth-child(2)');
await until(async () => (await wp.textContent('#char-name-fixed')) === 'Brom');
await wp.click('#back-home');
await wp.waitForSelector('#single-panel[data-ready=true]');
check(await until(async () => (await worldSeeds(wp)).join() === '8181', 5000), `with Brom picked, the play page offers Brom's world, not Reborn's (${await worldSeeds(wp)})`);

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
await wp.click('#char-slots .char-slot[data-id]:nth-child(2)');
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
check(dbsWith(stored3, '8181').length === 0, 'Brom\'s world is gone from this device');
check(dbsWith(stored3, '9292').length === 1, 'Reborn\'s is still there');
const meNow = await wp.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()));
check(meNow.account.characters.length === 2 && meNow.account.id !== bromId, 'the account lists two characters and is still signed in');
// ---- 8. choosing guest signs the wallet out ---------------------------------------------------
console.log('guest after wallet');
await wp.goto(HOME, { waitUntil: 'load' });
await toWho(wp);
await wp.waitForSelector('#who-wallet-continue', { timeout: 20000 });
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
