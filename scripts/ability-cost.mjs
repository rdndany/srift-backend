// What using an ability costs on the real graphics card: the longest frame after each use, how much of it went into compiling
// shaders, whether the page's own thread was held up, and which shader programs were built.
// Usage: node scripts/ability-cost.mjs [class=warrior] [extra query, e.g. "&postfx"]   (the dev server must be running)
// Switches (environment): ROUNDS=3 uses of each ability; KILL=1 the mobs around die of it (deaths, drops, numbers);
//   HEADED=1 in a real window, off the screen (CHROME=1: the installed Chrome; WINDOW_AT=x,y: where); NOWIND=1 without the
//   wind layer of a dash; VILLAGE=1 in a village; PROFILE=1 where the script time went; TRACE=<file> what every process of the
//   browser did during the first use (read it with scripts/trace-long.mjs); SETTLE, COOLDOWN in ms.
import { chromium } from 'playwright';

const cls = process.argv[2] ?? 'warrior';
const extra = process.argv[3] ?? '';
const rounds = Number(process.env.ROUNDS ?? 3);
const BOOKS = {
  warrior: ['skill_book_ground_slam', 'skill_book_shield_bash', 'skill_book_charge', 'skill_book_iron_defense'],
  mage: ['skill_book_fireball', 'skill_book_frost_nova', 'skill_book_meteor', 'skill_book_arcane_shield'],
  ranger: ['skill_book_piercing_shot', 'skill_book_evasive_roll', 'skill_book_bear_trap', 'skill_book_rain_of_arrows'],
}[cls];
const KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyG'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// HEADED=1: in a real window (put off the screen), where the browser has to hand the picture to Windows as a player's does.
const headed = !!process.env.HEADED;
const browser = await chromium.launch({
  headless: !headed,
  ...(process.env.CHROME ? { channel: 'chrome' } : {}),
  args: headed
    ? ['--window-position=' + (process.env.WINDOW_AT ?? '-3000,-3000'), '--window-size=1340,1400', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await browser.newContext({ viewport: { width: 1305, height: 1270 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));

// Every call that can make the graphics driver build a shader is timed, and the frames are timed from the first.
await page.addInitScript(() => {
  const P = WebGL2RenderingContext.prototype;
  const gl = (window.__gl = { ms: {}, n: {}, frames: [], on: false, linked: [], total: 0 });
  // Which shader a program is made of: three.js writes its name and switches at the top of the source.
  const sources = new WeakMap();
  const attached = new WeakMap();
  const realSource = P.shaderSource;
  P.shaderSource = function (shader, src) {
    sources.set(shader, src);
    return realSource.call(this, shader, src);
  };
  const realAttach = P.attachShader;
  P.attachShader = function (program, shader) {
    attached.set(program, [...(attached.get(program) ?? []), sources.get(shader) ?? '']);
    return realAttach.call(this, program, shader);
  };
  const realLink = P.linkProgram;
  P.linkProgram = function (program) {
    const src = (attached.get(program) ?? []).join('\n');
    const name = /#define SHADER_NAME (\S+)/.exec(src)?.[1] ?? /#define SHADER_TYPE (\S+)/.exec(src)?.[1] ?? '?';
    const type = /#define SHADER_TYPE (\S+)/.exec(src)?.[1] ?? '';
    const flags = [...new Set([...src.matchAll(/^#define (USE_\w+|\w*FOG\w*|TONE_MAPPING|DOUBLE_SIDED|FLIP_SIDED|OPAQUE|PREMULTIPLIED_ALPHA|ALPHATEST|DITHERING|\w*COLOR_SPACE\w*)\b/gm)].map((m) => m[1]))].join(' ');
    gl.total++;
    gl.linked.push(`${name} (${type}) ${src.length} chars [${flags}]`);
    return realLink.call(this, program);
  };
  const timed = ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getUniformLocation', 'getActiveUniform', 'getActiveAttrib', 'useProgram', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'bufferData', 'texImage2D', 'texSubImage2D', 'texStorage2D', 'generateMipmap', 'readPixels', 'clientWaitSync', 'getSyncParameter', 'finish'];
  for (const name of timed) {
    const real = P[name];
    if (!real) continue;
    gl.ms[name] = 0;
    gl.n[name] = 0;
    P[name] = function (...a) {
      const t0 = performance.now();
      const r = real.apply(this, a);
      gl.ms[name] += performance.now() - t0;
      gl.n[name]++;
      return r;
    };
  }
  // Stretches of 50 ms and more in which the page's own thread did not come up for air (script, or a call that waited for the driver).
  gl.tasks = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) gl.tasks.push({ at: e.startTime, ms: e.duration });
  }).observe({ entryTypes: ['longtask'] });
  let last = performance.now();
  let before = { ...gl.ms };
  let calls = { ...gl.n };
  const tick = (now) => {
    if (gl.on) {
      const spent = {};
      for (const k in gl.ms) {
        const d = gl.ms[k] - before[k];
        if (d > 0.5) spent[k] = [Math.round(d * 10) / 10, gl.n[k] - calls[k]];
      }
      gl.frames.push({ at: now, dt: now - last, spent, linked: gl.linked.splice(0) });
    }
    before = { ...gl.ms };
    calls = { ...gl.n };
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// (Single-player only: the hooks that hand out the skill books and the mobs reach into the game, which online is the server's.)
await page.goto(`http://localhost:3000/?seed=1337&debug&class=${cls}${extra}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(0.3);
  // With the sound on, as a player has it.
  s.sound('stone', 'step', 0.2);
});
if (process.env.NOWIND) {
  // Without the wind of a dash (the page layer that blurs the sides of the picture): take it out of the page.
  const gone = await page.evaluate(() => {
    const layer = [...document.body.children].find((d) => d instanceof HTMLDivElement && d.style.position === 'fixed' && [...d.children].some((c) => c.style.backdropFilter));
    layer?.remove();
    return !!layer;
  });
  console.log('wind layer removed:', gone);
}
if (process.env.VILLAGE) {
  // In the middle of a village: houses, villagers, lanterns, the lot.
  await page.evaluate(() => {
    const s = window.__solrift;
    const p = s.position();
    const v = s.nearestVillage(p.x, p.z);
    const x = v.x ?? v.cx ?? v[0];
    const z = v.z ?? v.cz ?? v[1];
    s.teleport(x + 0.5, s.surfaceY(Math.floor(x), Math.floor(z)) + 1, z + 0.5, 0, 0);
  });
}
await sleep(Number(process.env.SETTLE ?? 8000));
// Learn the four abilities, and be of a level that has them.
await page.evaluate((books) => {
  const s = window.__solrift;
  const tries = [() => s.addClassXp(5_000_000), () => s.clearInventory(), ...books.map((b) => () => s.give(s.itemId(b), 1))];
  window.__failed = [];
  for (const t of tries) {
    try {
      t();
    } catch (e) {
      window.__failed.push(String(e).slice(0, 80));
    }
  }
}, BOOKS);
for (let i = 0; i < BOOKS.length; i++) {
  await page.evaluate((i) => window.__solrift.select(i), i);
  await sleep(250);
  await page.evaluate(() => window.__solrift.setRight(true));
  await sleep(250);
  await page.evaluate(() => window.__solrift.setRight(false));
  await sleep(250);
}
await page.evaluate(() => {
  const s = window.__solrift;
  try {
    s.give(s.itemId('iron_sword'), 1);
    s.setOffhand(s.itemId('shield'));
  } catch (e) {
    window.__failed.push(String(e).slice(0, 80));
  }
  s.select(0);
});
await sleep(3000);
const view = await page.evaluate(() => JSON.stringify(window.__solrift.classView?.() ?? null));
console.log('class', view.slice(0, 400), await page.evaluate(() => window.__failed));

const cdp = process.env.PROFILE ? await page.context().newCDPSession(page) : null;
const stats = () => page.evaluate(() => ({ programs: window.__solrift.stats?.().programs, frames: window.__gl.frames.length }));
const info = () => page.evaluate(() => {
  const r = window.__solrift.rendererInfo?.();
  return r ?? null;
});
console.log('renderer', JSON.stringify(await info()));

for (let round = 1; round <= rounds; round++) {
  for (let slot = 0; slot < KEYS.length; slot++) {
    await page.evaluate(() => {
      window.__gl.frames.length = 0;
      window.__gl.linked.length = 0;
      window.__gl.tasks.length = 0;
      window.__gl.on = true;
      // Something to hit, as in a fight.
      const s = window.__solrift;
      const p = s.position();
      s.setHealth(40);
      for (let i = 0; i < 4; i++) s.spawnMob('zombie', p.x + Math.cos(i * 1.6) * 2.5, p.y, p.z + Math.sin(i * 1.6) * 2.5);
    });
    await sleep(400);
    if (cdp && round === 1) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    // TRACE=<file>: what every process of the browser (the graphics one too) did during the first use of the first ability.
    const tracing = process.env.TRACE && round === 1 && slot === Number(process.env.TRACE_SLOT ?? 0);
    if (tracing) {
      await browser.startTracing(page, {
        categories: ['toplevel', 'blink.user_timing', 'gpu', 'viz', 'cc', 'blink', 'skia', 'gpu.angle', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder', 'disabled-by-default-skia.shaders', 'disabled-by-default-skia.gpu'],
      });
      await page.evaluate(() => performance.mark('ability-key'));
    }
    const pressed = await page.evaluate(() => performance.now());
    await page.keyboard.press(KEYS[slot]);
    if (tracing) {
      await sleep(3500);
      const buf = await browser.stopTracing();
      (await import('node:fs')).writeFileSync(process.env.TRACE, buf);
      console.log('trace written', process.env.TRACE, buf.length);
    } else
    if (process.env.KILL) {
      // The ability's victims die of it, as a strong character's do: deaths, drops and numbers all in one moment.
      await sleep(700);
      await page.evaluate(() => {
        const s = window.__solrift;
        for (const m of s.mobs()) if (!m.dead) s.damageMob(m.id, 9999);
      });
      await sleep(2800);
    } else await sleep(3500);
    let top = '';
    if (cdp && round === 1) {
      const { profile } = await cdp.send('Profiler.stop');
      const self = new Map();
      const dt = profile.timeDeltas;
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      profile.samples.forEach((id, i) => {
        const n = byId.get(id);
        const key = `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.split('/').pop()?.split('?')[0] ?? ''}:${n.callFrame.lineNumber}`;
        self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
      });
      top = [...self.entries()]
        .filter(([k]) => !/^\(idle\)|^\(program\)/.test(k))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `        ${v.toFixed(1).padStart(7)} ms  ${k}`)
        .join('\n');
    }
    const r = await page.evaluate((pressed) => {
      window.__gl.on = false;
      const all = window.__gl.frames;
      const calm = all.filter((f) => f.at < pressed).map((f) => f.dt).sort((a, b) => a - b);
      const after = all.filter((f) => f.at >= pressed);
      const worst = after.reduce((w, f) => (f.dt > w.dt ? f : w), { dt: 0, spent: {}, at: pressed });
      const late = after.filter((f) => f.dt > 25);
      const sum = {};
      for (const f of after) for (const k in f.spent) sum[k] = (sum[k] ?? 0) + f.spent[k][0];
      const linked = after.flatMap((f) => f.linked.map((l) => `${(f.at - pressed).toFixed(0)} ms: ${l}`));
      const tasks = window.__gl.tasks.filter((t) => t.at >= pressed - 20).map((t) => `${t.ms.toFixed(0)}@${(t.at - pressed).toFixed(0)}`);
      return { median: calm[Math.floor(calm.length / 2)] ?? 0, worst, late: late.map((f) => `${f.dt.toFixed(0)}@${(f.at - pressed).toFixed(0)}`), sum, linked, tasks, total: window.__gl.total };
    }, pressed);
    const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${Array.isArray(v) ? `${v[0]} ms/${v[1]}` : `${v.toFixed(1)} ms`}`).join(', ') || '-';
    console.log(
      `round ${round} ${KEYS[slot]}: usual frame ${r.median.toFixed(1)} ms, worst after ${r.worst.dt.toFixed(0)} ms (${(r.worst.at - pressed).toFixed(0)} ms after the key)\n` +
        `      in the worst frame: ${fmt(r.worst.spent)}\n      late frames (ms@ms after key): ${r.late.join(' ') || 'none'}\n      graphics calls over the 3.5 s: ${fmt(r.sum)}` +
        `\n      main thread held up (ms@ms after key): ${r.tasks.join(' ') || 'never'}` +
        `\n      programs built (${r.linked.length}, ${r.total} since the page opened):${r.linked.map((l) => `\n        ${l.slice(0, 230)}`).join('')}` +
        (top ? `\n      script time over the 3.5 s:\n${top}` : ''),
    );
  }
  // Let the cooldowns run out.
  if (round < rounds) await sleep(Number(process.env.COOLDOWN ?? 14000));
}
await browser.close();
console.log('messages', msgs.slice(0, 6));
