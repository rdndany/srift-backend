// How the sun's shadows move, on the real graphics card at real speed: a flat floor with a few pillars, the camera still, and a piece
// of the picture read every frame. Out come, for each case:
//   -scene.png   the whole picture
//   -strip.png   the piece at eight moments, a tenth of a second apart
//   -flicker.png where the picture went one way and straight back (brighter then darker or the other way round): flicker, made stronger
//   -range.png   how much each pixel changed in all (where shadows moved)
//   -across.png  one line of the piece through time (time runs down, the floor's own pattern taken out): an edge that glides is a clean
//                slanted line, one that jumps is a staircase, one that fades between two places a ladder of bands
// Usage: node scripts/shadow-kymo.mjs outPrefix "<label>=<extra query>" ...    env: TIME=0.03 SECONDS=6 ROW=<line of the piece>
import { chromium } from 'playwright';
import sharp from 'sharp';

const [prefix, ...rest] = process.argv.slice(2);
const cases = rest.map((a) => {
  const i = a.indexOf('=');
  return [a.slice(0, i), a.slice(i + 1)];
});
const time = Number(process.env.TIME ?? 0.03);
const seconds = Number(process.env.SECONDS ?? 6);
const W = 1280;
const H = 720;
// The piece of the picture that is read (pixels from the top left).
const BOX = (process.env.BOX ?? '80,110,880,440').split(',').map(Number);
const ROW = Number(process.env.ROW ?? 298);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

for (const [label, extra] of cases) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  page.on('console', (m) => m.type() === 'error' && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && console.log('console:', m.text().slice(0, 300)));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&postfx${extra}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
  await page.evaluate((t) => {
    document.getElementById('overlay').style.display = 'none';
    const s = window.__solrift;
    s.forceLock();
    s.setMode('creative');
    s.setTime(t);
    s.teleport(100.5, 151, 100.5, 0, 0);
  }, time);
  await sleep(6000);
  await page.evaluate(() => {
    const s = window.__solrift;
    for (let x = 70; x <= 130; x++)
      for (let z = 70; z <= 130; z++) {
        for (let y = 151; y <= 163; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, 150, z, 1);
      }
    for (const [x, z, h] of [[97, 92, 3], [101, 90, 2], [105, 93, 4], [99, 96, 1], [103, 97, 2], [108, 89, 3], [94, 88, 2]]) for (let y = 151; y < 151 + h; y++) s.setBlock(x, y, z, 1);
    s.setFlying(true);
    s.setHandHidden(true);
  });
  await sleep(500);
  await page.evaluate(([t, yaw, pitch]) => {
    const s = window.__solrift;
    s.teleport(100.5, 157, 104.5, yaw, pitch);
    s.setTime(t);
  }, [time, Number(process.env.YAW ?? 0), Number(process.env.PITCH ?? -0.75)]);
  await sleep(5000);
  await page.evaluate((t) => window.__solrift.setTime(t), time);
  await sleep(2500);
  await page.screenshot({ path: `${prefix}-${label}-scene.png` });

  const r = await page.evaluate(
    ([ms, bx, by, bw, bh, row]) =>
      new Promise((done) => {
        const canvas = document.getElementById('game');
        const gl = canvas.getContext('webgl2');
        const n = bw * bh;
        const b64 = (u8) => {
          let s = '';
          for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          return btoa(s);
        };
        const lum = new Float32Array(n);
        const before = new Float32Array(n);
        const step = new Float32Array(n);
        const lo = new Float32Array(n).fill(1e9);
        const hi = new Float32Array(n).fill(-1e9);
        const flick = new Float32Array(n);
        const moved = new Float32Array(n);
        const shots = [];
        const lines = [];
        const perFrame = [];
        let frames = 0;
        const t0 = performance.now();
        const px = new Uint8Array(n * 4);
        const tick = () => {
          // (rows come bottom first)
          gl.readPixels(bx, canvas.height - by - bh, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let change = 0;
          for (let i = 0; i < n; i++) {
            const v = 0.3 * px[i * 4] + 0.6 * px[i * 4 + 1] + 0.1 * px[i * 4 + 2];
            if (frames > 0) {
              const d = v - before[i];
              change += Math.abs(d);
              moved[i] += Math.abs(d);
              // A change that undoes the one before it: the picture went there and back.
              if (frames > 1 && d * step[i] < 0) flick[i] += Math.min(Math.abs(d), Math.abs(step[i]));
              step[i] = d;
            }
            before[i] = v;
            lum[i] = v;
            if (v < lo[i]) lo[i] = v;
            if (v > hi[i]) hi[i] = v;
          }
          if (frames > 0) perFrame.push(change / n);
          if (frames % 6 === 0 && shots.length < 8) shots.push(b64(px));
          const line = new Uint8Array(bw);
          const base = (bh - 1 - row) * bw;
          for (let x = 0; x < bw; x++) line[x] = px[(base + x) * 4 + 1];
          lines.push(b64(line));
          frames++;
          const now = performance.now();
          if (now - t0 < ms) return void requestAnimationFrame(tick);
          const out = (a, k) => {
            const u = new Uint8Array(n);
            for (let i = 0; i < n; i++) u[i] = Math.max(0, Math.min(255, a[i] * k));
            return b64(u);
          };
          const range = new Float32Array(n);
          let flickSum = 0;
          let movedSum = 0;
          let flickPixels = 0;
          for (let i = 0; i < n; i++) {
            range[i] = hi[i] - lo[i];
            flickSum += flick[i];
            movedSum += moved[i];
            if (flick[i] > 12) flickPixels++;
          }
          done({ frames, ms: now - t0, shots, lines, perFrame, flicker: out(flick, 6), range: out(range, 4), flickSum: flickSum / n, movedSum: movedSum / n, flickPixels, stats: window.__solrift.shadowStats?.() ?? null });
        };
        requestAnimationFrame(tick);
      }),
    [seconds * 1000, ...BOX, ROW],
  );
  const [, , bw, bh] = BOX;
  const raw = (s) => Buffer.from(s, 'base64');
  const flip = (buf, channels) => {
    const out = Buffer.alloc(buf.length);
    const line = bw * channels;
    for (let y = 0; y < bh; y++) buf.copy(out, y * line, (bh - 1 - y) * line, (bh - y) * line);
    return out;
  };
  await sharp(flip(raw(r.flicker), 1), { raw: { width: bw, height: bh, channels: 1 } }).png().toFile(`${prefix}-${label}-flicker.png`);
  await sharp(flip(raw(r.range), 1), { raw: { width: bw, height: bh, channels: 1 } }).png().toFile(`${prefix}-${label}-range.png`);
  // Eight moments side by side, two rows of four, each at half size.
  const half = await Promise.all(r.shots.map((s) => sharp(flip(raw(s), 4), { raw: { width: bw, height: bh, channels: 4 } }).removeAlpha().resize({ width: bw / 2 }).png().toBuffer()));
  await sharp({ create: { width: bw * 2, height: bh, channels: 3, background: '#000' } })
    .composite(half.map((input, i) => ({ input, left: (i % 4) * (bw / 2), top: Math.floor(i / 4) * (bh / 2) })))
    .png()
    .toFile(`${prefix}-${label}-strip.png`);
  // The line through time, three rows to a frame.
  const tall = 3;
  const lines = r.lines.map(raw);
  const mean = new Float32Array(bw);
  for (let x = 0; x < bw; x++) mean[x] = lines.reduce((s, l) => s + l[x], 0) / lines.length;
  const ky = Buffer.alloc(bw * lines.length * tall);
  lines.forEach((l, f) => {
    for (let k = 0; k < tall; k++) for (let x = 0; x < bw; x++) ky[(f * tall + k) * bw + x] = Math.max(0, Math.min(255, 128 + (l[x] - mean[x]) * 8));
  });
  await sharp(ky, { raw: { width: bw, height: lines.length * tall, channels: 1 } }).png().toFile(`${prefix}-${label}-across.png`);

  const sorted = [...r.perFrame].sort((a, b) => a - b);
  console.log(
    `${label}: ${r.frames} frames at ${((r.frames - 1) / (r.ms / 1000)).toFixed(0)} fps` +
      `\n  change a frame ${(r.movedSum / (r.frames - 1)).toFixed(4)} (median ${sorted[Math.floor(sorted.length / 2)].toFixed(4)}, worst frame ${sorted[sorted.length - 1].toFixed(3)})` +
      `\n  flicker (there and back) ${r.flickSum.toFixed(3)} a pixel, ${((100 * r.flickSum) / Math.max(1e-9, r.movedSum)).toFixed(0)}% of all change; pixels that flicker a lot ${r.flickPixels}` +
      (r.stats ? `\n  drawings near ${r.stats.near} far ${r.stats.far}` : ''),
  );
  await page.close();
}
await browser.close();
