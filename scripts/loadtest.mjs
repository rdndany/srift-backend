// Load test: many simulated players against one game server.
//
//   node scripts/loadtest.mjs                         100 clients for 30 s against a server it starts itself
//   node scripts/loadtest.mjs --clients 150 --seconds 60
//   node scripts/loadtest.mjs --skills                every bot is a warrior, mage or ranger (level 30, every skill learned) and keeps using its skills
//   node scripts/loadtest.mjs --url ws://host:8787    test a server that is already running (needs
//                                                     MAX_PLAYERS and MAX_CONN_PER_IP raised, see below)
//
// Each client behaves like a browser: it sends 60 inputs per second (paced by the wall clock, in batches
// of at most 8), walks and turns at random, digs now and then, chats and changes hotbar slots. It never
// sends input faster than real time, so a healthy server must never kick it.
//
// The run fails (exit code 1) when the server's tick cannot keep up, clients are kicked or dropped,
// snapshots stop arriving, or the average bandwidth per player is above the budget.
import { spawn } from 'node:child_process';
import net from 'node:net';
import { WebSocket } from 'ws';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const CLIENTS = Number(opt('clients', 100));
const FIRST = Number(opt('first', 0)); // the number of the first bot (a second load test against the same server starts after the first one's)
const SECONDS = Number(opt('seconds', 30));
const EXTERNAL = opt('url', null);
const PORT = Number(opt('port', 8790));
const SKILLS = args.includes('--skills');
const PARTS = args.includes('--parts'); // also count the bytes of every tenth snapshot by part (costs the bots time)
const CLASS_IDS = ['warrior', 'mage', 'ranger'];
const RAMP_MS = Number(opt('ramp', 3000)); // spread the joins out so the server is not hit by one burst
// Budgets (what "healthy" means).
const MAX_TICK_AVG_MS = Number(opt('max-tick-ms', 25)); // half of the 50 ms tick
const MAX_OVERRUN_RATIO = Number(opt('max-overruns', 0.02));
const MAX_KBPS_PER_PLAYER = Number(opt('max-kbps', 100)); // the plan's budget: < 100 KB/s average

const wsUrl = EXTERNAL ?? `ws://127.0.0.1:${PORT}`;
const httpUrl = wsUrl.replace(/^ws/, 'http');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitForPort = async (port, timeoutMs = 30000) => {
  const start = Date.now();
  for (;;) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => (s.destroy(), resolve(true)));
      s.once('error', () => (s.destroy(), resolve(false)));
    });
    if (ok) return;
    if (Date.now() - start > timeoutMs) throw new Error(`port ${port} never opened`);
    await sleep(200);
  }
};

let server = null;
if (!EXTERNAL) {
  console.log(`> starting a server on :${PORT} (in-memory database, mobs on, ${CLIENTS + 10} seats)`);
  server = spawn(process.execPath, ['--import', 'tsx', SKILLS ? 'scripts/loadtest-skills-server.ts' : 'apps/server/src/index.ts'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PATH: ':memory:',
      WORLD_SEED: '1337',
      MAX_PLAYERS: String(CLIENTS + 10),
      MAX_CONN_PER_IP: String(CLIENTS + 10),
      CONNECTS_PER_MINUTE: '100000',
      ...(SKILLS ? { CHEATS: '1' } : {}),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverLog = '';
  server.stderr.on('data', (d) => (serverLog += d));
  process.on('exit', () => server.kill());
  await waitForPort(PORT);
  server.log = () => serverLog;
}

// ---- simulated clients ---------------------------------------------------------------------------

const totals = { connected: 0, joined: 0, kicked: 0, closedEarly: 0, errors: 0, snaps: 0, bytes: 0, messagesSent: 0, chatLines: 0, blocks: 0, casts: 0 };
const ackLatencies = []; // ms between sending an input and seeing it acknowledged
const kickReasons = new Map();
const types = new Map(); // what the server sent, by message type
const snapParts = new Map(); // bytes of every tenth snapshot, by part (--skills)
let running = true;

class Bot {
  constructor(index) {
    this.index = index;
    this.seq = 0;
    this.sentAt = new Map(); // seq -> time
    this.lastTick = 0;
    this.owed = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.turn = (Math.random() - 0.5) * 0.04;
    this.forward = 1;
    this.digging = false;
    this.nextDecision = 0;
    this.nextChat = Date.now() + 5000 + Math.random() * 10000;
    this.joined = false;
    this.snaps = 0;
    this.nextSkill = Date.now() + 4000 + Math.random() * 2000;
  }

  start() {
    const ws = (this.ws = new WebSocket(wsUrl));
    ws.on('open', () => {
      totals.connected++;
      ws.send(JSON.stringify({ t: 'join', name: `bot${this.index}`, ...(SKILLS ? { class: CLASS_IDS[this.index % 3] } : {}) }));
    });
    ws.on('message', (data) => {
      totals.bytes += data.length;
      let m;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return;
      }
      types.set(m.t, (types.get(m.t) ?? 0) + 1);
      if (m.t === 'events') for (const e of m.events) types.set(`${m.t}:${e.t}`, (types.get(`${m.t}:${e.t}`) ?? 0) + 1);
      switch (m.t) {
        case 'joined':
          this.joined = true;
          totals.joined++;
          this.lastTick = Date.now();
          if (SKILLS) this.send({ t: 'chat', text: '/xp 30L' });
          this.timer = setInterval(() => this.pump(), 33);
          break;
        case 'snap': {
          totals.snaps++;
          this.snaps++;
          if (PARTS && totals.snaps % 10 === 0) for (const k of Object.keys(m)) snapParts.set(k, (snapParts.get(k) ?? 0) + JSON.stringify(m[k]).length);
          const t = this.sentAt.get(m.ack);
          if (t !== undefined) ackLatencies.push(Date.now() - t);
          for (const s of this.sentAt.keys()) if (s <= m.ack) this.sentAt.delete(s);
          break;
        }
        case 'blocks':
          totals.blocks += m.blocks.length / 4;
          break;
        case 'chat':
          totals.chatLines++;
          break;
        case 'kicked':
          totals.kicked++;
          kickReasons.set(m.reason, (kickReasons.get(m.reason) ?? 0) + 1);
          break;
        default:
      }
    });
    ws.on('error', () => totals.errors++);
    ws.on('close', () => {
      clearInterval(this.timer);
      if (running && this.joined) totals.closedEarly++;
    });
  }

  /** Send the inputs the wall clock owes, like a browser at 60 fps would. */
  pump() {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    this.owed += ((now - this.lastTick) / 1000) * 60;
    this.lastTick = now;
    if (now > this.nextDecision) {
      this.nextDecision = now + 500 + Math.random() * 2500;
      this.turn = (Math.random() - 0.5) * 0.08;
      this.forward = Math.random() < 0.85 ? 1 : 0;
      this.digging = Math.random() < 0.25;
      if (Math.random() < 0.3) this.send({ t: 'cmd', c: { t: 'select', slot: Math.floor(Math.random() * 9) } });
    }
    if (SKILLS && now > this.nextSkill) {
      this.nextSkill = now + 400 + Math.random() * 900;
      this.send({ t: 'cmd', c: { t: 'ability', slot: Math.floor(Math.random() * 4) } });
      totals.casts++;
    }
    if (now > this.nextChat) {
      this.nextChat = now + 8000 + Math.random() * 12000;
      this.send({ t: 'chat', text: `hello from bot ${this.index}` });
    }
    const whole = Math.floor(this.owed);
    this.owed -= whole;
    const frames = [];
    for (let i = 0; i < whole; i++) {
      this.yaw += this.turn;
      const seq = ++this.seq;
      frames.push({
        seq,
        yaw: this.yaw,
        pitch: this.digging ? -0.6 : 0,
        forward: this.forward,
        strafe: 0,
        jump: Math.random() < 0.02,
        sprint: false,
        sneak: false,
        left: this.digging,
        right: false,
      });
      this.sentAt.set(seq, now);
    }
    for (let i = 0; i < frames.length; i += 8) this.send({ t: 'input', frames: frames.slice(i, i + 8) });
  }

  send(msg) {
    totals.messagesSent++;
    this.ws.send(JSON.stringify(msg));
  }

  stop() {
    clearInterval(this.timer);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
    else this.ws.terminate();
  }
}

// ---- run -----------------------------------------------------------------------------------------

const bots = Array.from({ length: CLIENTS }, (_, i) => new Bot(FIRST + i));
console.log(`> ${CLIENTS} clients joining over ${RAMP_MS} ms, then ${SECONDS} s of play (${wsUrl})`);
for (let i = 0; i < bots.length; i++) {
  bots[i].start();
  await sleep(RAMP_MS / CLIENTS);
}
await sleep(1000);
console.log(`  joined: ${totals.joined}/${CLIENTS}`);

const health = async () => {
  try {
    return await (await fetch(`${httpUrl}/health`)).json();
  } catch {
    return null;
  }
};
// Measure only the steady state: reset the "slowest tick" counter and the traffic counters now.
const first = await health();
const wireBytes = () => bots.reduce((n, b) => n + (b.ws?._socket?.bytesRead ?? 0), 0);
const base = { ...totals, wire: wireBytes() };
const baseOverruns = first?.room?.overruns ?? 0;
const baseTicks = first?.room?.ticks ?? 0;
const t0 = Date.now();
const samples = [];
for (let s = 0; s < SECONDS; s++) {
  await sleep(1000);
  const h = await health();
  if (h?.room) samples.push(h.room);
  if (s % 5 === 4 || s === SECONDS - 1) {
    console.log(`  t+${String(s + 1).padStart(3)}s  players ${h?.players ?? '?'}  tick avg ${h?.room?.tickMsAvg?.toFixed(2) ?? '?'} ms  mem ${h?.memoryMb ?? '?'} MB`);
  }
}
const elapsed = (Date.now() - t0) / 1000;
const last = (await health()) ?? first;
running = false;

// ---- report --------------------------------------------------------------------------------------

const pct = (arr, p) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const tickAvgs = samples.map((s) => s.tickMsAvg);
const maxTick = Math.max(0, ...samples.map((s) => s.tickMsMax));
const overruns = (last?.room?.overruns ?? 0) - baseOverruns;
const ticks = Math.max(1, (last?.room?.ticks ?? 0) - baseTicks);
const kbpsRaw = (totals.bytes - base.bytes) / elapsed / 1024 / Math.max(1, totals.joined);
// What actually crossed the network: compressed frames plus their headers.
const kbpsPerPlayer = (wireBytes() - base.wire) / elapsed / 1024 / Math.max(1, totals.joined);
const snapsPerSecond = (totals.snaps - base.snaps) / elapsed / Math.max(1, totals.joined);

console.log('\nresults');
console.log(`  players joined        ${totals.joined}/${CLIENTS}`);
console.log(`  server tick (avg)     ${(tickAvgs.reduce((a, b) => a + b, 0) / Math.max(1, tickAvgs.length)).toFixed(2)} ms  (budget ${MAX_TICK_AVG_MS}, tick is ${50} ms)`);
console.log(`  server tick (worst)   ${maxTick.toFixed(1)} ms`);
console.log(`  tick overruns         ${overruns}/${ticks} (${((overruns / ticks) * 100).toFixed(2)}%)`);
console.log(`  snapshots per player  ${snapsPerSecond.toFixed(1)} per second (server tick rate is 20)`);
console.log(`  bandwidth per player  ${kbpsPerPlayer.toFixed(1)} KB/s on the wire (budget ${MAX_KBPS_PER_PLAYER}; ${kbpsRaw.toFixed(1)} before compression)`);
console.log(`  input ack latency     p50 ${pct(ackLatencies, 50)} ms  p95 ${pct(ackLatencies, 95)} ms  p99 ${pct(ackLatencies, 99)} ms (local, so mostly tick wait)`);
console.log(`  server memory         ${last?.memoryMb ?? '?'} MB`);
console.log(`  block changes seen    ${totals.blocks - base.blocks}   chat lines ${totals.chatLines - base.chatLines}`);
if (SKILLS) console.log(`  skills used          ${totals.casts} presses (about ${(totals.casts / (SECONDS + 5) / CLIENTS).toFixed(1)} per player per second)`);
if (SKILLS) console.log(`  messages by type     ${[...types].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ')}`);
if (PARTS) console.log(`  snapshot bytes by part  ${[...snapParts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${Math.round(n / 1024)} KB`).join(', ')} (every tenth snapshot)`);
console.log(`  kicked ${totals.kicked}  dropped ${totals.closedEarly}  socket errors ${totals.errors}${kickReasons.size ? `  reasons: ${[...kickReasons].map(([r, n]) => `${r} x${n}`).join(', ')}` : ''}`);

const failures = [];
if (totals.joined < CLIENTS) failures.push(`only ${totals.joined}/${CLIENTS} clients joined`);
if (totals.kicked > 0) failures.push(`${totals.kicked} clients were kicked`);
if (totals.closedEarly > 0) failures.push(`${totals.closedEarly} clients were dropped`);
if (totals.errors > 0) failures.push(`${totals.errors} socket errors`);
if (tickAvgs.length === 0) failures.push('no /health samples');
else if (tickAvgs.reduce((a, b) => a + b, 0) / tickAvgs.length > MAX_TICK_AVG_MS) failures.push('average tick above budget');
if (overruns / ticks > MAX_OVERRUN_RATIO) failures.push('too many tick overruns');
if (snapsPerSecond < 15) failures.push(`snapshots too rare (${snapsPerSecond.toFixed(1)}/s)`);
if (kbpsPerPlayer > MAX_KBPS_PER_PLAYER) failures.push('bandwidth above budget');

for (const b of bots) b.stop();
await sleep(300);
if (server) {
  server.kill();
  const log = server.log();
  const warn = log.split('\n').filter((l) => /strike|KICK|Error|failed/i.test(l));
  if (warn.length) console.log(`\nserver log (${warn.length} notable lines):\n${warn.slice(0, 8).join('\n')}`);
}
if (failures.length) {
  console.log(`\nLOAD TEST FAILED: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nload test passed');
process.exit(0);
