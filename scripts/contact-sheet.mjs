// Lay a folder's pictures out in one grid picture, to see a lot of frames at once.
// Usage: node scripts/contact-sheet.mjs <dir> <out.jpg> [cols=3] [cellWidth=640] [first=0] [max=9]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [dir, out, colsArg = '3', cellArg = '640', firstArg = '0', maxArg = '9'] = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => /\.(jpg|png)$/.test(f))
  .sort()
  .slice(Number(firstArg), Number(firstArg) + Number(maxArg));
const imgs = files.map((f) => `data:image/${f.endsWith('png') ? 'png' : 'jpeg'};base64,${readFileSync(`${dir}/${f}`).toString('base64')}`);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const data = await page.evaluate(
  async ([imgs, names, cols, cell]) => {
    const loaded = await Promise.all(imgs.map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; })));
    const ch = Math.round((cell * loaded[0].height) / loaded[0].width);
    const rows = Math.ceil(loaded.length / cols);
    const c = document.createElement('canvas');
    c.width = cell * cols;
    c.height = ch * rows;
    const g = c.getContext('2d');
    g.font = '20px sans-serif';
    loaded.forEach((im, i) => {
      const x = (i % cols) * cell;
      const y = Math.floor(i / cols) * ch;
      g.drawImage(im, x, y, cell, ch);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x, y, 150, 28);
      g.fillStyle = '#fff';
      g.fillText(names[i].replace(/^f\d+-|\.jpg|\.png/g, ''), x + 6, y + 21);
    });
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  },
  [imgs, files, Number(colsArg), Number(cellArg)],
);
writeFileSync(out, Buffer.from(data, 'base64'));
console.log('saved', out, files.length);
await browser.close();
