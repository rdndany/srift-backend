// The long pieces of work in a browser trace (see TRACE in ability-cost.mjs), by process and thread, from the moment the ability
// key was pressed: what held the page's thread, and what held the graphics process (which the page cannot see for itself).
// Usage: node scripts/trace-long.mjs <trace file> [at least this many ms = 15]
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const min = Number(process.argv[3] ?? 15) * 1000;
const raw = JSON.parse(readFileSync(file, 'utf8'));
const events = Array.isArray(raw) ? raw : raw.traceEvents;
const proc = new Map();
const thread = new Map();
for (const e of events) {
  if (e.ph !== 'M') continue;
  if (e.name === 'process_name') proc.set(e.pid, e.args.name);
  if (e.name === 'thread_name') thread.set(`${e.pid}:${e.tid}`, e.args.name);
}
const mark = events.find((e) => e.name === 'ability-key');
const t0 = mark ? mark.ts : Math.min(...events.filter((e) => e.ts > 0).map((e) => e.ts));
console.log('key mark found:', !!mark, 'events:', events.length);
const long = events.filter((e) => e.ph === 'X' && e.dur >= min && e.ts >= t0 - 50_000).sort((a, b) => a.ts - b.ts);
for (const e of long) {
  const where = `${proc.get(e.pid) ?? e.pid} / ${thread.get(`${e.pid}:${e.tid}`) ?? e.tid}`;
  const extra = e.args && Object.keys(e.args).length ? ' ' + JSON.stringify(e.args).slice(0, 140) : '';
  console.log(`${((e.ts - t0) / 1000).toFixed(0).padStart(6)} ms  ${(e.dur / 1000).toFixed(1).padStart(7)} ms  ${where.padEnd(34)} ${e.name}${extra}`);
}
