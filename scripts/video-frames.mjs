// Pull still frames out of a video (no ffmpeg needed: the installed Edge decodes it and a canvas grabs the frames).
// Usage: node scripts/video-frames.mjs <video> <outDir> [count=24] [width=960] [from=0] [to=duration]
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [video, outDir = 'frames', countArg = '24', widthArg = '960', fromArg, toArg] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
// A tiny server for the file (a page cannot open a file:// video from about:blank), with the range requests a video asks for.
const file = resolve(video);
const size = statSync(file).size;
const server = createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('content-type', 'text/html');
    res.end('<body></body>');
    return;
  }
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = m && m[2] ? Number(m[2]) : size - 1;
  res.writeHead(m ? 206 : 200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': end - start + 1, ...(m ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) });
  createReadStream(file, { start, end }).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ channel: 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
const url = `http://127.0.0.1:${port}/video.mp4`;
const info = await page.evaluate(async (url) => {
  const v = document.createElement('video');
  v.muted = true;
  v.src = url;
  v.preload = 'auto';
  document.body.appendChild(v);
  window.__v = v;
  await new Promise((res, rej) => {
    v.onloadedmetadata = res;
    v.onerror = () => rej(new Error('video error ' + (v.error && v.error.message)));
  });
  return { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
}, url);
console.log(info);
const count = Number(countArg);
const from = fromArg ? Number(fromArg) : 0;
const to = toArg ? Number(toArg) : info.duration;
for (let i = 0; i < count; i++) {
  const t = count === 1 ? from : from + ((to - from) * i) / (count - 1);
  const data = await page.evaluate(
    async ([t, width]) => {
      const v = window.__v;
      await new Promise((res) => {
        v.onseeked = res;
        v.currentTime = Math.min(t, v.duration - 0.05);
      });
      const c = document.createElement('canvas');
      c.width = width;
      c.height = Math.round((width * v.videoHeight) / v.videoWidth);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85).split(',')[1];
    },
    [t, Number(widthArg)],
  );
  const name = `${outDir}/f${String(i).padStart(2, '0')}-${t.toFixed(1)}s.jpg`;
  writeFileSync(name, Buffer.from(data, 'base64'));
  console.log('saved', name);
}
await browser.close();
server.close();
