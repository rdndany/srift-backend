/**
 * The one-shot sounds of the Hollow Deep (the engine that decides when is dungeonAmbience.ts): groans and moans, whispers,
 * stone scraping, rocks falling, chains, drops of water, a far scream, breathing, a low sting, the glass of amethyst, the
 * heart, the crackle of lava. Each is a recipe on a `Voice` (see darkSounds.ts); `k` is how deep the player is, 0..1, and
 * a deeper player gets lower, longer, heavier sounds.
 */
import { VoicePool, Voice, pick, rnd, type DarkSink, type VocalOpts } from './darkSounds';

export type AmbientName = 'groan' | 'whisper' | 'scrape' | 'rockfall' | 'chains' | 'drip' | 'drip_lush' | 'scream' | 'breath' | 'sting' | 'glass' | 'heartbeat' | 'crackle';

export const AMBIENT_NAMES: readonly AmbientName[] = ['groan', 'whisper', 'scrape', 'rockfall', 'chains', 'drip', 'drip_lush', 'scream', 'breath', 'sting', 'glass', 'heartbeat', 'crackle'];

type Vowel = VocalOpts['v0'];
/** Vowels as formants: [centre Hz, Q, gain]. */
export const VOWELS: Record<'oh' | 'uh' | 'ah' | 'aw' | 'ee' | 'oo', Vowel> = {
  oh: [[420, 5, 1], [780, 6, 0.6], [2300, 8, 0.15]],
  uh: [[340, 5, 1], [620, 6, 0.5], [2000, 8, 0.1]],
  ah: [[800, 6, 1], [1250, 7, 0.7], [2600, 9, 0.3]],
  aw: [[600, 5, 1], [1000, 6, 0.7], [2400, 8, 0.2]],
  ee: [[300, 5, 1], [2300, 8, 0.8], [3000, 9, 0.4]],
  oo: [[300, 5, 1], [800, 6, 0.4], [2200, 8, 0.1]],
};

/** Where a recipe puts the sound, around the listener (see `VoiceOpts`). */
export interface Place {
  az: number;
  dist: number;
}

type Recipe = (v: Voice, k: number, at: Place) => void;

/** How loud each is when asked for at 1 (worked out by listening to what they make: see `renderDark` in the debug hooks). */
export const TRIM: Record<AmbientName, number> = {
  groan: 0.4,
  whisper: 0.3,
  scrape: 1.1,
  rockfall: 0.75,
  chains: 2.2,
  drip: 1.4,
  drip_lush: 1.1,
  scream: 0.17,
  breath: 1,
  sting: 0.5,
  glass: 1.3,
  heartbeat: 1,
  crackle: 2,
};

const RECIPES: Record<AmbientName, Recipe> = {
  /** A distant, hollow moan: two low voices a fourth apart, slow to rise, sinking. */
  groan(v, k) {
    const dur = rnd(3.4, 5.4);
    const f0 = rnd(92, 130) * (1 - 0.28 * k);
    const moan = (at: number, ratio: number, gain: number): void => {
      v.vocal(at, dur, {
        f0: f0 * ratio,
        f1: f0 * ratio * rnd(0.55, 0.72),
        fm: f0 * ratio * rnd(1.0, 1.12),
        v0: VOWELS.oh,
        v1: VOWELS.uh,
        gain,
        attack: dur * 0.4,
        release: dur * 0.45,
        vib: [rnd(3.6, 5), f0 * ratio * 0.02],
        breath: 0.5,
        drive: 1.6,
        sub: 0.5,
      });
    };
    moan(0, 1, 0.5);
    moan(0.14, 0.75, 0.3);
  },

  /** Whispers: breath through three narrow bands that change from one syllable to the next, wandering round the listener. */
  whisper(v, _k, at) {
    const dur = rnd(2.4, 4);
    const ctx = v.s.ctx;
    const t0 = ctx.currentTime;
    const src = v.noiseSrc(0, dur);
    const sg = v.gain(0.0001, v.out);
    const bands = [0, 1, 2].map(() => v.filter('bandpass', 2000, 7));
    for (const b of bands) {
      src.connect(b);
      b.connect(v.gain(2.6, sg));
    }
    const sets = [[1800, 2900, 3800], [1400, 2400, 3500], [2100, 3100, 4200], [1100, 2000, 3000], [900, 1700, 2800]];
    const syll = 4 + Math.floor(Math.random() * 5);
    const slot = (dur - 0.3) / syll;
    for (let i = 0; i < syll; i++) {
      const t = t0 + 0.1 + i * slot + rnd(0, 0.05);
      const d = slot * rnd(0.55, 0.85);
      const set = pick(sets);
      bands.forEach((b, n) => b.frequency.setValueAtTime(set[n] * rnd(0.95, 1.05), t));
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.linearRampToValueAtTime(rnd(0.5, 1), t + d * 0.35);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + d);
    }
    v.place(at.az + rnd(-1, 1), at.dist, dur);
  },

  /** Stone dragged over stone: a band of noise that sweeps, broken up into rough little jerks, with a groan of weight under it. */
  scrape(v) {
    const dur = rnd(1.3, 2.8);
    const t0 = v.s.ctx.currentTime;
    const up = Math.random() < 0.5;
    const src = v.noiseSrc(0, dur);
    const bp = v.filter('bandpass', up ? 450 : 1300, 1.6);
    bp.frequency.setValueAtTime(up ? 450 : 1300, t0);
    bp.frequency.exponentialRampToValueAtTime(up ? 1400 : 420, t0 + dur);
    const lp = v.filter('lowpass', 3200);
    const rough = v.gain(0.5);
    for (let t = 0; t < dur; t += rnd(0.025, 0.08)) rough.gain.setTargetAtTime(rnd(0.15, 1), t0 + t, 0.015);
    const e = v.env(0, dur, 0.9, dur * 0.3, dur * 0.45);
    src.connect(bp).connect(lp).connect(rough).connect(e);
    v.tone(0, dur, { type: 'sawtooth', f0: 62, f1: 46, gain: 0.1, attack: dur * 0.3, release: dur * 0.4, lowpass: 240 });
  },

  /** Rocks coming down somewhere in the dark: a rumble, a patter of stones that thins out, and a few heavy ones. */
  rockfall(v, k) {
    const dur = rnd(2.4, 3.8);
    v.noise(0, dur, { type: 'lowpass', f0: 260 - 80 * k, f1: 80, q: 0.7, gain: 0.55, attack: 0.5, deep: true });
    v.rubble(0.1, dur - 0.2, { rate0: 14, rate1: 2, f0: 200, f1: 1400, gain: 0.5, q: 1, decay: 0.09 });
    for (let i = 0; i < 3; i++) v.tone(rnd(0, dur * 0.7), 0.5, { type: 'sine', f0: rnd(70, 110), f1: 38, gain: 0.55 });
  },

  /** A chain rattling: a handful of metal clinks, ringing at different pitches, that come quick and then straggle. */
  chains(v) {
    const t0 = v.s.ctx.currentTime;
    const n = 9 + Math.floor(Math.random() * 8);
    const times: number[] = [];
    let t = 0;
    for (let i = 0; i < n; i++) {
      t += rnd(0.06, 0.3) * (1 + i * 0.08);
      times.push(t);
    }
    const dur = times[times.length - 1] + 0.4;
    const hit = v.gain(0.0001, v.out);
    const src = v.noiseSrc(0, dur);
    const bp = v.filter('bandpass', 3000, 16);
    src.connect(bp).connect(hit);
    const ring = v.osc('sine', 0, dur, 1850);
    ring.connect(v.gain(0.35, hit));
    const ring2 = v.osc('sine', 0, dur, 4900);
    ring2.connect(v.gain(0.12, hit));
    times.forEach((ti, i) => {
      const gap = (times[i + 1] ?? ti + 0.3) - ti;
      const d = Math.min(0.14, gap * 0.9);
      const at = t0 + ti;
      bp.frequency.setValueAtTime(pick([2400, 3100, 3900, 5200]), at);
      ring.frequency.setValueAtTime(pick([1450, 1850, 2300, 2900]), at);
      ring2.frequency.setValueAtTime(pick([3900, 4900, 6100]), at);
      hit.gain.setValueAtTime(0.0001, at);
      hit.gain.exponentialRampToValueAtTime(0.5 * rnd(0.4, 1) * (1 - (i / n) * 0.7), at + 0.002);
      hit.gain.exponentialRampToValueAtTime(0.0001, at + d);
    });
  },

  /** A drop of water falling into a pool, far off in a big space: a small bright sine that jumps up, and often a second, softer one. */
  drip(v) {
    const f = rnd(700, 1300);
    v.tone(0, 0.16, { type: 'sine', f0: f, f1: f * 2.1, gain: 0.5, attack: 0.004 });
    v.noise(0, 0.03, { type: 'bandpass', f0: 3200, q: 2, gain: 0.15 });
    if (Math.random() < 0.5) v.tone(rnd(0.18, 0.4), 0.14, { type: 'sine', f0: f * 0.9, f1: f * 1.8, gain: 0.22 });
  },

  /** The same, in a wet cave: lower, with a bubble in it and a little run of drops after. */
  drip_lush(v) {
    const f = rnd(520, 900);
    v.tone(0, 0.18, { type: 'sine', f0: f, f1: f * 2, gain: 0.5, attack: 0.004 });
    v.tone(0.03, 0.12, { type: 'sine', f0: 300, f1: 640, gain: 0.25, attack: 0.005 });
    v.noise(0, 0.04, { type: 'bandpass', f0: 2400, q: 1.5, gain: 0.14 });
    for (let i = 0, t = rnd(0.2, 0.45); i < 3 && Math.random() < 0.7; i++, t += rnd(0.15, 0.4)) v.tone(t, 0.12, { type: 'sine', f0: f * rnd(0.8, 1.1), f1: f * 1.7, gain: 0.2 / (i + 1) });
  },

  /** A scream or a howl from very far away: a thin human voice that rises, quavers and falls, muffled by the miles of rock. */
  scream(v) {
    const dur = rnd(2.2, 3.2);
    v.vocal(0, dur, {
      f0: rnd(330, 430),
      fm: rnd(520, 640),
      f1: rnd(280, 350),
      v0: VOWELS.ah,
      v1: VOWELS.ee,
      gain: 0.55,
      attack: 0.5,
      release: dur * 0.5,
      vib: [6.5, 14],
      breath: 0.6,
      drive: 2.5,
    });
  },

  /** Breathing close behind you: an in-breath, a pause and a long rasping out-breath. */
  breath(v) {
    const t0 = v.s.ctx.currentTime;
    const piece = (at: number, dur: number, f0: number, f1: number, peak: number): void => {
      const src = v.noiseSrc(at, dur);
      const bp = v.filter('bandpass', f0, 0.9);
      bp.frequency.setValueAtTime(f0, t0 + at);
      bp.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur);
      const hp = v.filter('highpass', 250);
      const rasp = v.gain(0.7);
      const lfo = v.osc('sine', at, dur, rnd(30, 55));
      lfo.connect(v.gain(0.3)).connect(rasp.gain);
      const e = v.env(at, dur, peak, dur * 0.55, dur * 0.3);
      src.connect(bp).connect(hp).connect(rasp).connect(e);
    };
    piece(0, 1.0, 700, 1500, 1);
    piece(1.35, 1.5, 1600, 600, 0.9);
    if (Math.random() < 0.5) {
      piece(3.3, 0.9, 700, 1400, 0.7);
      piece(4.5, 1.3, 1500, 550, 0.65);
    }
  },

  /** A sudden low sting: a boom with a sour cluster of notes sinking under it, and a crack. */
  sting(v) {
    v.tone(0, 2.2, { type: 'sine', f0: 64, f1: 30, gain: 0.9, attack: 0.006 });
    for (const f of [110, 116.5, 155.6]) v.tone(0, 2.4, { type: 'sawtooth', f0: f, f1: f * 0.9, gain: 0.16, attack: 0.02, lowpass: 900, lowpass1: 160 });
    v.noise(0, 0.7, { type: 'lowpass', f0: 1600, f1: 90, gain: 0.7, attack: 0.004 });
    v.noise(0, 0.08, { type: 'highpass', f0: 3000, gain: 0.25, attack: 0.002 });
  },

  /** Amethyst singing to itself: a few glassy notes of a diminished chord, blooming slowly, each with a detuned twin that beats against it. */
  glass(v) {
    const notes = [1046.5, 1244.5, 1480, 1760, 2093];
    const count = 2 + Math.floor(Math.random() * 2);
    let at = 0;
    for (let i = 0; i < count; i++) {
      const f = pick(notes) * rnd(0.995, 1.005);
      const dur = rnd(2.4, 3.6);
      v.tone(at, dur, { type: 'sine', f0: f, gain: 0.22, attack: 0.18 });
      v.tone(at, dur * 0.8, { type: 'sine', f0: f * 1.003, gain: 0.16, attack: 0.18 });
      v.tone(at, dur * 0.35, { type: 'sine', f0: f * 2.76, gain: 0.05, attack: 0.18 });
      at += rnd(0.5, 1.1);
    }
  },

  /** One beat of a heart: the lub and, a moment after, the softer dub. */
  heartbeat(v) {
    v.tone(0, 0.2, { type: 'sine', f0: 62, f1: 40, gain: 0.95, attack: 0.008 });
    v.noise(0, 0.07, { type: 'lowpass', f0: 180, gain: 0.35, attack: 0.004 });
    v.tone(0.17, 0.2, { type: 'sine', f0: 52, f1: 36, gain: 0.6, attack: 0.008 });
    v.noise(0.17, 0.06, { type: 'lowpass', f0: 160, gain: 0.2, attack: 0.004 });
  },

  /** A second of lava: sharp little pops and now and then a deep bubble. */
  crackle(v, k) {
    v.rubble(0, 1.1, { rate0: 3 + 6 * k, rate1: 3 + 6 * k, f0: 1800, f1: 6500, gain: 0.3, q: 1.5, decay: 0.03 });
    if (Math.random() < 0.6) v.tone(rnd(0, 0.9), 0.22, { type: 'sine', f0: rnd(110, 170), f1: 60, gain: 0.35, attack: 0.01 });
  },
};

export interface PlayOpts {
  /** 0..1: how deep the player is. */
  depth: number;
  /** Loudness. */
  vol: number;
  /** Where it comes from (radians clockwise from ahead) and how far. */
  az?: number;
  dist: number;
  /** Extra darkness, 0..1, on top of what the distance gives. */
  far?: number;
  /** Where the dry sound goes, and the send to the reverb. */
  bus: AudioNode;
  wet: AudioNode | null;
  wetAmt: number;
  /** Seconds from now (for a sound that has to land on an exact moment). */
  delay?: number;
}

/** Make one ambient sound, if the pool has room for it. Returns the voice (or null). */
export function playAmbient(name: AmbientName, s: DarkSink, pool: VoicePool, o: PlayOpts): Voice | null {
  const farBase = Math.min(0.95, 0.12 + (o.dist / 26) * 0.5 + (o.far ?? 0));
  const v = Voice.open(s, pool, o.bus, { vol: o.vol * TRIM[name], az: o.az, dist: o.dist, far: name === 'heartbeat' || name === 'crackle' ? (o.far ?? 0) : farBase, wet: o.wet, wetAmt: o.wetAmt, delay: o.delay });
  if (!v) return null;
  try {
    RECIPES[name](v, o.depth, { az: o.az ?? 0, dist: o.dist });
  } finally {
    v.seal();
  }
  return v;
}
