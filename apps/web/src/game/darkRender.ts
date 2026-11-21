/**
 * Renders one of the dark sounds (an ambient one of dungeonSounds.ts, or one of the boss's of bossSounds.ts) off-line, into a buffer, and
 * measures it: the loudest sample, the RMS over time, whether anything came out wrong (NaN) and whether every voice and source was given
 * back afterwards. A way to hear with numbers what the browser cannot play in a headless test (see the debug hooks).
 */
import { BOSS_SOUND_NAMES, playBossNamed, type BossSoundName } from './bossSounds';
import { VoicePool, darkImpulse, makeSink } from './darkSounds';
import { AMBIENT_NAMES, playAmbient, type AmbientName } from './dungeonSounds';

export interface RenderReport {
  kind: 'ambient' | 'boss';
  name: string;
  seconds: number;
  /** Loudest sample, and RMS over the whole render. */
  peak: number;
  rms: number;
  /** RMS of each half second. */
  slices: number[];
  /** The second at which the sound is last louder than 0.01. */
  lastAudible: number;
  bad: number;
  /** After the render: voices and sources still held (0 and 0 when nothing leaked), and how many voices were made. */
  pool: { active: number; sources: number; started: number; refused: number };
  /** Were there any voices made at all. */
  made: boolean;
}

export const RENDERABLE = { ambient: AMBIENT_NAMES, boss: BOSS_SOUND_NAMES };

/** How long to render each by default: the longest sound plus the tail. */
function secondsFor(kind: 'ambient' | 'boss', name: string): number {
  if (kind === 'boss') return name === 'down' ? 14 : name === 'cast_rain' ? 7 : 5;
  return name === 'breath' ? 8 : name === 'groan' || name === 'glass' ? 7 : 6;
}

export async function renderDark(kind: 'ambient' | 'boss', name: string, seconds = secondsFor(kind, name), opts: { depth?: number } = {}): Promise<RenderReport> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.floor(rate * seconds), rate);
  const white = ctx.createBuffer(1, rate, rate);
  const d = white.getChannelData(0);
  for (let i = 0; i < rate; i++) d[i] = Math.random() * 2 - 1;
  const sink = makeSink(ctx, white);
  const pool = new VoicePool(16);
  // The same path as in the game: the dry sound to the output, and a send through a long dark reverb.
  const send = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = darkImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.9;
  send.connect(conv);
  conv.connect(wet);
  wet.connect(ctx.destination);
  let made = false;
  if (kind === 'ambient') {
    const v = playAmbient(name as AmbientName, sink, pool, { depth: opts.depth ?? 0.6, vol: 1, az: name === 'heartbeat' ? undefined : Math.PI / 2, dist: name === 'breath' ? 1 : 8, far: 0.1, bus: ctx.destination, wet: send, wetAmt: name === 'heartbeat' ? 0 : 0.5 });
    made = v !== null;
  } else {
    playBossNamed(name as BossSoundName, { sink, pool, bus: ctx.destination, wet: send }, 0.3, 0);
    made = pool.started > 0;
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  let sum = 0;
  let bad = 0;
  let lastAudible = 0;
  const slice = Math.floor(rate / 2);
  const slices: number[] = [];
  let acc = 0;
  for (let i = 0; i < L.length; i++) {
    const a = L[i];
    const b = R[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      bad++;
      continue;
    }
    const m = Math.max(Math.abs(a), Math.abs(b));
    peak = Math.max(peak, m);
    const e = (a * a + b * b) / 2;
    sum += e;
    acc += e;
    if (m > 0.01) lastAudible = i / rate;
    if ((i + 1) % slice === 0) {
      slices.push(Math.sqrt(acc / slice));
      acc = 0;
    }
  }
  // (The sources report that they ended just after the render: give those events a moment.)
  await new Promise((r) => setTimeout(r, 60));
  const st = pool.stats();
  return { kind, name, seconds, peak, rms: Math.sqrt(sum / L.length), slices, lastAudible, bad, pool: { active: st.active, sources: st.sources, started: st.started, refused: st.refused }, made };
}
