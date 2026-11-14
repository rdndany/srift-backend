// Zoom into part of a screenshot: node scripts/crop.mjs in.png out.png x y w h [scale]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const [inp, out, x, y, w, h, scale = '4'] = process.argv.slice(2);
const b64 = readFileSync(inp).toString('base64');
const s = Number(scale);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Math.round(w * s), height: Math.round(h * s) } });
await page.setContent(`<body style="margin:0;overflow:hidden"><div style="width:${w * s}px;height:${h * s}px;overflow:hidden;position:relative"><img src="data:image/png;base64,${b64}" style="image-rendering:pixelated;position:absolute;left:${-x * s}px;top:${-y * s}px;width:auto;transform-origin:0 0;transform:scale(${s})"></div></body>`);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
