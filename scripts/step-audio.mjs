// Renders the footstep, jump and landing sounds of every surface offline (no speakers needed) and prints their levels.
// Usage: node scripts/step-audio.mjs [out.wav]. Needs the dev server on :3000. Per surface: step, step, jump, land (2 s each).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
const SURFACES = ['stone', 'dirt', 'grass', 'sand', 'gravel', 'wood', 'glass', 'leaves', 'snow'];
const EVENTS = [['step', 0, 0.8], ['step', 0.5, 0.8], ['jump', 1.0, 0.8], ['land', 1.5, 0.45]];
const RATE = 44100;
const SLOT = 2.2;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(
  ([rate, len]) => {
    window.__t = 0;
    window.__off = null;
    window.AudioContext = class extends OfflineAudioContext {
      constructor() {
        super(2, rate * len, rate);
        window.__off = this;
      }
      get currentTime() {
        return window.__t;
      }
      resume() {
        return Promise.resolve();
      }
    };
  },
  [RATE, SURFACES.length * SLOT + 1],
);
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
const samples = await page.evaluate(
  async ([surfaces, events, slot]) => {
    const s = window.__solrift;
    for (let i = 0; i < surfaces.length; i++) {
      for (const [action, at, vol] of events) {
        window.__t = i * slot + at;
        s.sound(surfaces[i], action, vol, 0);
      }
    }
    const buf = await window.__off.startRendering();
    return Array.from(buf.getChannelData(0));
  },
  [SURFACES, EVENTS, SLOT],
);
await browser.close();
const d = Float32Array.from(samples);
if (out) {
  const pcm = Buffer.alloc(44 + d.length * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + d.length * 2, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(RATE, 24); pcm.writeUInt32LE(RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(d.length * 2, 40);
  for (let i = 0; i < d.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, d[i])) * 32767), 44 + i * 2);
  writeFileSync(out, pcm);
}
const peakOf = (a, b) => {
  let p = 0;
  for (let j = Math.floor(a * RATE); j < Math.floor(b * RATE); j++) p = Math.max(p, Math.abs(d[j]));
  return p;
};
for (let i = 0; i < SURFACES.length; i++) {
  const base = i * SLOT;
  const row = EVENTS.map(([action, at], k) => `${action} ${peakOf(base + at, base + (EVENTS[k + 1]?.[1] ?? SLOT)).toFixed(3)}`);
  console.log(SURFACES[i].padEnd(7), row.join('  '));
}
console.log('errors', errors.slice(0, 5));
