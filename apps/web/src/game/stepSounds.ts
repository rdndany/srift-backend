import type { SoundKind } from '@solrift/shared';

/**
 * Footsteps, made as recorded-like samples instead of live synthesis. A synthesised step (an oscillator and a filter) sounds
 * like a machine because every step is the same and it has a pitch; a real step has none: it is a soft, dull burst of noise
 * (the heel), a smaller one a moment later (the toe), and on loose ground a scatter of tiny crunches that never repeats.
 * So each surface gets several variants, each drawn from its own random numbers, and the player cycles through them.
 */

type Surface = Exclude<SoundKind, 'none'>;

interface Params {
  /** Overall loudness of the surface (steps are quiet sounds). */
  level: number;
  /** The heel: a band of noise (Hz; lo 0 = just low-passed) that dies away with time constant `tau` seconds. */
  heel: { lo: number; hi: number; tau: number; gain: number };
  /** The weight: noise below `fc` Hz, felt more than heard. */
  weight: { fc: number; tau: number; gain: number };
  /** The toe: how loud next to the heel, how long after, how much higher in tone. */
  toe: { gain: number; delay: number; bright: number };
  /** Loose ground: little crunches scattered over `span` seconds. */
  grains?: { count: number; lo: number; hi: number; span: number; gain: number; tau: number };
  /** A hollow material: a couple of damped, slightly detuned low resonances (wood). */
  knock?: { freq: number; gain: number; tau: number };
  /** How softly the sound comes in, seconds (default 4 ms) and how long the sample is (default 0.32 s). */
  attack?: number;
  length?: number;
}

const SURFACES: Record<Surface, Params> = {
  stone: {
    level: 0.075,
    heel: { lo: 700, hi: 3400, tau: 0.016, gain: 1 },
    weight: { fc: 220, tau: 0.03, gain: 0.7 },
    toe: { gain: 0.45, delay: 0.075, bright: 1.25 },
  },
  dirt: {
    level: 0.065,
    heel: { lo: 0, hi: 900, tau: 0.032, gain: 1 },
    weight: { fc: 140, tau: 0.05, gain: 0.8 },
    toe: { gain: 0.4, delay: 0.085, bright: 1.15 },
    grains: { count: 4, lo: 900, hi: 2600, span: 0.06, gain: 0.12, tau: 0.006 },
  },
  grass: {
    level: 0.055,
    heel: { lo: 500, hi: 2600, tau: 0.04, gain: 0.8 },
    weight: { fc: 160, tau: 0.045, gain: 0.55 },
    toe: { gain: 0.6, delay: 0.08, bright: 1.2 },
    grains: { count: 8, lo: 2500, hi: 7000, span: 0.14, gain: 0.1, tau: 0.01 },
  },
  sand: {
    level: 0.05,
    heel: { lo: 900, hi: 4200, tau: 0.05, gain: 0.7 },
    weight: { fc: 150, tau: 0.04, gain: 0.4 },
    toe: { gain: 0.65, delay: 0.085, bright: 1.15 },
    grains: { count: 14, lo: 3000, hi: 8000, span: 0.16, gain: 0.08, tau: 0.007 },
  },
  gravel: {
    level: 0.06,
    heel: { lo: 600, hi: 3200, tau: 0.03, gain: 0.7 },
    weight: { fc: 190, tau: 0.035, gain: 0.5 },
    toe: { gain: 0.7, delay: 0.08, bright: 1.2 },
    grains: { count: 20, lo: 1500, hi: 6500, span: 0.2, gain: 0.3, tau: 0.005 },
  },
  wood: {
    level: 0.07,
    heel: { lo: 300, hi: 1900, tau: 0.02, gain: 0.8 },
    weight: { fc: 260, tau: 0.035, gain: 0.9 },
    toe: { gain: 0.5, delay: 0.08, bright: 1.2 },
    knock: { freq: 190, gain: 0.5, tau: 0.045 },
  },
  glass: {
    level: 0.045,
    heel: { lo: 2500, hi: 8500, tau: 0.012, gain: 1 },
    weight: { fc: 300, tau: 0.02, gain: 0.3 },
    toe: { gain: 0.5, delay: 0.07, bright: 1.15 },
  },
  leaves: {
    level: 0.045,
    heel: { lo: 1800, hi: 7500, tau: 0.045, gain: 0.5 },
    weight: { fc: 170, tau: 0.04, gain: 0.3 },
    toe: { gain: 0.8, delay: 0.09, bright: 1.1 },
    grains: { count: 16, lo: 3500, hi: 9000, span: 0.2, gain: 0.16, tau: 0.008 },
  },
  snow: {
    level: 0.05,
    heel: { lo: 700, hi: 3800, tau: 0.05, gain: 0.7 },
    weight: { fc: 130, tau: 0.05, gain: 0.5 },
    toe: { gain: 0.65, delay: 0.09, bright: 1.1 },
    grains: { count: 10, lo: 3500, hi: 7500, span: 0.16, gain: 0.2, tau: 0.01 },
  },
};

export const STEP_VARIANTS = 6;
export type MoveSound = 'step' | 'jump' | 'land';
/** Everything is a little darker and much quieter than the first tries: a step is a sound you feel, not one you listen to. */
const TONE = 0.7;
const LEVEL = 0.5;

/** The push-off of a jump: the sole scuffing and leaving the ground, softer and slower than a step, with no toe coming down after it. */
function jumpOf(p: Params): Params {
  return {
    level: p.level * 0.85,
    heel: { lo: p.heel.lo, hi: p.heel.hi * 0.8, tau: p.heel.tau * 1.6, gain: p.heel.gain * 0.7 },
    weight: { fc: p.weight.fc, tau: p.weight.tau * 1.2, gain: p.weight.gain * 0.8 },
    toe: { gain: 0.25, delay: 0.05, bright: 1.4 },
    grains: p.grains ? { ...p.grains, count: Math.round(p.grains.count * 0.8), span: p.grains.span * 0.6 } : { count: 3, lo: 1500, hi: 4500, span: 0.07, gain: 0.07, tau: 0.008 },
    knock: p.knock ? { ...p.knock, gain: p.knock.gain * 0.5 } : undefined,
    attack: 0.012,
    length: 0.26,
  };
}

/** Landing: both feet at once, heavier and longer: a deep thump of the weight, the surface's crunch around it, and a second, softer settle. */
function landOf(p: Params): Params {
  return {
    level: p.level * 2.1,
    heel: { lo: p.heel.lo * 0.8, hi: p.heel.hi * 0.85, tau: p.heel.tau * 1.4, gain: p.heel.gain },
    weight: { fc: p.weight.fc * 0.8, tau: p.weight.tau * 2, gain: p.weight.gain * 2.4 },
    toe: { gain: 0.55, delay: 0.06, bright: 1 },
    grains: p.grains ? { ...p.grains, count: Math.round(p.grains.count * 1.6), span: p.grains.span * 1.3, gain: p.grains.gain * 1.2 } : { count: 4, lo: 1200, hi: 4000, span: 0.1, gain: 0.08, tau: 0.008 },
    knock: p.knock ? { ...p.knock, gain: p.knock.gain * 1.4 } : undefined,
    attack: 0.005,
    length: 0.42,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function render(sr: number, p: Params, rnd: () => number): Float32Array {
  const len = Math.floor(sr * (p.length ?? 0.32));
  const base = p.attack ?? 0.004;
  const out = new Float32Array(len);
  const coef = (hz: number) => (hz <= 0 ? 0 : 1 - Math.exp((-2 * Math.PI * hz) / sr));
  const jitter = (v: number, amount: number) => v * (1 + (rnd() * 2 - 1) * amount);

  /** A burst of noise between `lo` and `hi` Hz: it comes in softly (a few ms: no click) and fades out exponentially. */
  const burst = (start: number, amp: number, lo: number, hi: number, tau: number, attack = base): void => {
    const s0 = Math.floor(start * sr);
    const aHi = coef(hi * TONE);
    const aLo = coef(lo * TONE);
    let hiState = 0;
    let loState = 0;
    const n = Math.min(len, s0 + Math.floor(sr * tau * 7));
    for (let i = s0; i < n; i++) {
      const t = (i - s0) / sr;
      const x = rnd() * 2 - 1;
      hiState += aHi * (x - hiState);
      loState += aLo * (x - loState);
      // Two low-passes subtracted are a band; with lo = 0 it is simply a low-pass. The 1/(a) scaling keeps narrow bands audible.
      const band = (hiState - loState) * (1 + 3 * (1 - aHi));
      out[i] += amp * band * (1 - Math.exp(-t / (attack * 0.5))) * Math.exp(-t / tau);
    }
  };

  // The heel, then the toe: never at exactly the same weight or distance.
  const heelGain = jitter(1, 0.15);
  const toeAt = jitter(p.toe.delay, 0.2);
  burst(0, p.heel.gain * heelGain, jitter(p.heel.lo, 0.15), jitter(p.heel.hi, 0.15), jitter(p.heel.tau, 0.2));
  burst(0, p.weight.gain * heelGain * 1.8, 0, jitter(p.weight.fc, 0.15), jitter(p.weight.tau, 0.2), base * 1.5);
  const toeGain = p.toe.gain * jitter(1, 0.25);
  burst(toeAt, p.heel.gain * toeGain, jitter(p.heel.lo, 0.15) * p.toe.bright, jitter(p.heel.hi, 0.15) * p.toe.bright, jitter(p.heel.tau, 0.2) * 0.8);
  burst(toeAt, p.weight.gain * toeGain * 1.2, 0, jitter(p.weight.fc, 0.15) * 1.1, jitter(p.weight.tau, 0.2) * 0.7, 0.005);

  // Loose ground: crunches, mostly with the heel and toe, each a different size and tone.
  if (p.grains) {
    const g = p.grains;
    for (let i = 0; i < g.count; i++) {
      // Cluster around the heel and the toe: half near the start, half near the toe.
      const anchor = rnd() < 0.55 ? 0 : toeAt;
      const at = anchor + Math.pow(rnd(), 1.7) * g.span * (anchor === 0 ? 0.7 : 0.5);
      const f = g.lo + rnd() * (g.hi - g.lo) * 0.5;
      burst(at, g.gain * (0.25 + rnd() * 0.75) * (anchor === 0 ? 1 : 0.7), f, f * (1.5 + rnd()), jitter(g.tau, 0.5), 0.0015);
    }
  }

  // A hollow knock: a few damped resonances a little out of tune with each other, so it is wood and not a tone.
  if (p.knock) {
    const k = p.knock;
    for (const [ratio, amp] of [[1, 1], [1.62, 0.55], [2.4, 0.3]] as const) {
      const f = jitter(k.freq * ratio, 0.07);
      const ph = rnd() * Math.PI * 2;
      const tau = jitter(k.tau, 0.2) / ratio;
      for (let i = 0; i < Math.min(len, Math.floor(sr * tau * 6)); i++) {
        const t = i / sr;
        out[i] += k.gain * amp * Math.sin(2 * Math.PI * f * t + ph) * (1 - Math.exp(-t / 0.003)) * Math.exp(-t / tau);
      }
    }
  }

  // Normalise, then set the loudness of the surface; a short fade at the very end so the sample never clicks.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? (p.level * LEVEL) / peak : 0;
  const fade = Math.floor(sr * 0.03);
  for (let i = 0; i < len; i++) {
    const tail = Math.min(1, (len - i) / fade);
    out[i] *= scale * tail;
  }
  return out;
}

const cache = new Map<string, AudioBuffer[]>();

/** The variants of a surface's footstep (made once, the first time the surface is walked on). */
export function stepBuffers(ctx: BaseAudioContext, kind: Surface, action: MoveSound = 'step'): AudioBuffer[] {
  const key = `${ctx.sampleRate}:${kind}:${action}`;
  let list = cache.get(key);
  if (!list) {
    list = [];
    const names = Object.keys(SURFACES);
    for (let v = 0; v < STEP_VARIANTS; v++) {
      const params = action === 'jump' ? jumpOf(SURFACES[kind]) : action === 'land' ? landOf(SURFACES[kind]) : SURFACES[kind];
      const salt = action === 'jump' ? 31 : action === 'land' ? 57 : 0;
      const data = render(ctx.sampleRate, params, mulberry32((names.indexOf(kind) + 1) * 7919 + v * 104729 + salt * 1000003));
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.getChannelData(0).set(data);
      list.push(buf);
    }
    cache.set(key, list);
  }
  return list;
}
