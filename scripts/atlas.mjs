// Dump the procedural atlas, magnified, to a PNG. Usage: node scripts/atlas.mjs [out.png] [scale] [url]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'tmp-shots/atlas.png';
const scale = Number(process.argv[3] ?? 4);
const url = process.argv[4] ?? 'http://localhost:3000';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}/?seed=1&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.atlasPng, undefined, { timeout: 180000 });
const png = await page.evaluate(() => window.__solrift.atlasPng());
// Magnify on a light-grey checkerboard so transparent texels are visible.
const view = await browser.newPage({ viewport: { width: 256 * scale, height: 512 * scale } });
await view.setContent(`<body style="margin:0;background:#8a8a8a"><img src="${png}" style="image-rendering:pixelated;width:${256 * scale}px;height:${512 * scale}px"></body>`);
await view.waitForTimeout(300);
await view.screenshot({ path: out });
await browser.close();
console.log('saved', out);
