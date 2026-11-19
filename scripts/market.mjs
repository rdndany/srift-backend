// The Market page (/market): the Auction House of the game on the website. Reads the live list (search, shelves, sorting),
// shows the sign-in note for the pages that are for accounts, and is reached from the navbar of every site page.
// Needs a server with some auctions up (the test seeds them: see scripts/_marketseed.ts) behind the web server's /api proxy.
// Usage: node scripts/market.mjs [url] [outDir]
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

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

console.log('the page');
await page.goto(`${url}/market`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid^="market-row-"]', { timeout: 20000 });
const names = async () => page.$$eval('[data-testid="market-list"] [data-testid^="market-row-"]', (els) => els.map((e) => e.getAttribute('data-name')));
const all = await names();
check(all.length >= 4, `the board lists the auctions up (${all.length})`);
check(/\d+ auctions? up/.test(await page.textContent('[data-testid="market-count"]')), 'the top counts them');
check((await page.$$('[data-testid="market-error"]')).length === 0, 'no error is shown while the server answers');
check((await page.textContent('.mk-live')).includes('Live'), 'the board says it is live');
await page.screenshot({ path: `${outDir}/market-top.png` });
await page.locator('#mk-board').scrollIntoViewIfNeeded();
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/market-board.png` });

console.log('item pictures and hover');
check((await page.$$('[data-testid="market-list"] canvas.cs-icon')).length === all.length, 'every row draws the game\'s picture of its item');
await page.hover('[data-testid="market-list"] .mk-item');
check((await page.$$('.tooltip .tip-line')).length > 0, 'hovering an item shows its tooltip');
await page.mouse.move(5, 5);

console.log('search and shelves');
await page.fill('[data-testid="market-search"]', 'diamond');
await page.click('[data-testid="market-search-go"]');
await page.waitForFunction(() => document.querySelectorAll('[data-testid="market-list"] [data-testid^="market-row-"]').length > 0 && [...document.querySelectorAll('[data-testid="market-list"] [data-testid^="market-row-"]')].every((e) => /diamond/i.test(e.getAttribute('data-name') ?? '')));
check((await names()).every((n) => /diamond/i.test(n ?? '')), `search keeps only what matches (${(await names()).join(', ')})`);
await page.fill('[data-testid="market-search"]', 'zzzzzz');
await page.click('[data-testid="market-search-go"]');
await page.waitForSelector('.mk-empty');
check((await page.textContent('.mk-empty')).includes('Nothing for sale matches'), 'a search with no match says so');
await page.fill('[data-testid="market-search"]', '');
await page.click('[data-testid="market-search-go"]');
await page.waitForFunction((n) => document.querySelectorAll('[data-testid="market-list"] [data-testid^="market-row-"]').length >= n, all.length);
await page.click('[data-testid="market-cat-food"]');
await page.waitForFunction(() => document.querySelectorAll('[data-testid="market-list"] [data-testid^="market-row-"]').length > 0 && document.querySelectorAll('[data-testid="market-list"] [data-testid^="market-row-"]').length < 6);
const food = await names();
check(food.length > 0 && food.every((n) => /apple|bread/i.test(n ?? '')), `the Food shelf shows only food (${food.join(', ')})`);
await page.click('[data-testid="market-cat-all"]');
await page.waitForFunction((n) => document.querySelectorAll('[data-testid="market-list"] [data-testid^="market-row-"]').length >= n, all.length);

console.log('sorting');
await page.click('[data-testid="market-sort-name"]');
await page.waitForTimeout(500);
const asc = await names();
check(JSON.stringify(asc) === JSON.stringify([...asc].sort((a, b) => a.localeCompare(b))), 'Item sorts by name');
await page.click('[data-testid="market-sort-name"]');
await page.waitForTimeout(500);
const desc = await names();
check(JSON.stringify(desc) === JSON.stringify([...asc].reverse()), 'a second click turns the order round');

console.log('the accounts\' tabs');
await page.click('[data-testid="market-tab-auctions"]');
check((await page.$$('[data-testid="market-signin"]')).length === 1, 'a signed-out visitor is asked to sign in for My auctions');
await page.click('[data-testid="market-tab-mail"]');
check((await page.$$('[data-testid="market-signin"]')).length === 1, '... and for the mail');
await page.click('[data-testid="market-tab-browse"]');

console.log('the navbar');
const marketButton = async (path) => {
  await page.goto(`${url}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.site-nav');
  const btn = page.locator('.site-nav button', { hasText: 'Market' });
  check((await btn.count()) === 1, `${path}: the navbar has a Market button`);
  await btn.click();
  await page.waitForURL(`**/market`, { timeout: 15000 });
  check(page.url().endsWith('/market'), `${path}: it opens the market page`);
};
await marketButton('/');
await marketButton('/game');
await marketButton('/beyond');
await marketButton('/classes/warrior');
await page.waitForSelector('.mk');
check((await page.getAttribute('.site-nav button[aria-current="page"]', 'aria-current')) === 'page', 'the market page marks its own button');

console.log('a narrow screen');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${url}/market`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid^="market-row-"]');
check(await page.evaluate(() => document.getElementById('home-layer').scrollWidth <= window.innerWidth + 1), 'nothing runs off the side of a phone screen');
await page.locator('#mk-board').scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/market-phone.png` });

console.log('the server being away');
await page.setViewportSize({ width: 1440, height: 900 });
await page.route('**/api/market*', (r) => r.abort());
await page.goto(`${url}/market`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="market-error"]', { timeout: 15000 });
check((await page.textContent('[data-testid="market-error"]')).includes('cannot be reached'), 'an unreachable server is said so, not left as a blank board');

const real = errors.filter((e) => !/Failed to load resource|ERR_FAILED|net::ERR/.test(e));
check(real.length === 0, `no errors on the page${real.length ? `: ${real.join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} FAILED`);
  process.exit(1);
}
console.log('\nall good');
