/**
 * The tools for the sound of the Hollow Deep and of its boss (see dungeonAmbience.ts and bossSounds.ts): every sound here is
 * made of oscillators and noise, like the rest of the game's sound, and none of it needs a file.
 *
 * A `Voice` is one sound being made: its own small graph (a gain, a darkening low-pass for distance, a panner, a send to the
 * reverb) that the recipe fills with sources. The sources are counted: when the last one has ended the voice disconnects
 * everything it made and gives its place back to the `VoicePool`, which is what keeps the number of sounds at once bounded
 * (a sound asked for when the pool is full is simply not made) and the graph free of leftovers.
 */

export interface DarkSink {
  ctx: BaseAudioContext;
  /** One second of white noise (mono): the hiss, the cracks, the breath. */
  noise: AudioBuffer;
  /** Five seconds of dark (brown-ish) noise, for the rumbles that run longer than a loop of the white one could hide. */
  deep: AudioBuffer;
}

export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
export { pick };

/** The noise the recipes use, made once for a context: the white one is given (the game has one), the deep one is made here. */
export function makeSink(ctx: BaseAudioContext, noise: AudioBuffer): DarkSink {
  const len = Math.floor(ctx.sampleRate * 5);
  const deep = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = deep.getChannelData(0);
  let a = 0;
  let b = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    a += (w - a) * 0.08; // a leaky sum: the low end of the noise, grumbling
    b += (a - b) * 0.2;
    d[i] = b * 6;
  }
  return { ctx, noise, deep };
}

/** A hall of stone and dark: a long decaying noise that loses its high end as it dies, with a few early reflections. */
export function darkImpulse(ctx: BaseAudioContext, seconds = 4.6): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let low = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      low += ((Math.random() * 2 - 1) - low) * (0.5 - 0.44 * k);
      d[i] = low * Math.pow(1 - k, 2.2) * 1.9;
    }
    for (const [at, g] of [[0.07, 0.6], [0.16, 0.5], [0.29, 0.4], [0.47, 0.3]] as const) {
      const i = Math.floor((at + (c ? 0.019 : 0)) * ctx.sampleRate);
      d[i] += g;
      d[i + 1] += g * 0.4;
    }
  }
  return buf;
}

/** A soft clipping curve: the more `k`, the more the sound is torn. */
const curves = new Map<number, Float32Array>();
function driveCurve(k: number): Float32Array {
  let c = curves.get(k);
  if (!c) {
    c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    curves.set(k, c);
  }
  return c;
}

let limiter: Float32Array | null = null;
/** Straight up to 0.7, then bending over to 0.93 at full scale (anything louder is held there). */
function limiterCurve(): Float32Array {
  if (limiter) return limiter;
  const n = 1025;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
  }
  return (limiter = c);
}

/** How many voices may sound at once, and a count of what has happened (for the tests and the debug hooks). */
export class VoicePool {
  active = 0;
  peak = 0;
  started = 0;
  refused = 0;
  /** Sources (oscillators, noise) that are scheduled or sounding. */
  sources = 0;
  readonly live = new Set<Voice>();
  /** Places beyond `max` that only an urgent sound (a roar, the king's fall) may take: a crowd of small ones can never shut it out. */
  readonly reserve = 3;
  constructor(readonly max: number) {}

  /** Let them all fade over `seconds` and end. */
  fadeAll(seconds: number): void {
    for (const v of [...this.live]) v.fade(seconds);
  }

  stats(): { active: number; peak: number; started: number; refused: number; sources: number } {
    return { active: this.active, peak: this.peak, started: this.started, refused: this.refused, sources: this.sources };
  }
}

export interface VoiceOpts {
  /** The voice's loudness. */
  vol: number;
  /** Stereo position, -1 left .. 1 right. */
  pan?: number;
  /** Or a place around the listener (who faces 0): `az` radians clockwise from straight ahead (PI is behind), `dist` blocks. Heard in 3D (HRTF) with headphones. */
  az?: number;
  dist?: number;
  /** 0 (near, clear) .. 1 (far, muffled): how closed the low-pass is. */
  far?: number;
  /** Where the reverb send goes (a node that leads to a convolver), and how much of the voice goes there. */
  wet?: AudioNode | null;
  wetAmt?: number;
  /** Seconds from now that everything in the voice is shifted by (a beat placed exactly in time). */
  delay?: number;
  /** May take one of the pool's reserved places when it is full. */
  urgent?: boolean;
}

export interface NoiseOpts {
  type: BiquadFilterType;
  f0: number;
  /** The filter ends here (a sweep); leave out for a steady filter. */
  f1?: number;
  q?: number;
  gain: number;
  attack?: number;
  /** Seconds at the end of the sound over which it fades (the rest, after the attack, holds): leave out for a plain decay. */
  release?: number;
  /** The deep noise instead of the white one. */
  deep?: boolean;
}

export interface ToneOpts {
  type: OscillatorType;
  f0: number;
  f1?: number;
  gain: number;
  attack?: number;
  release?: number;
  /** A low-pass over it, with its own sweep. */
  lowpass?: number;
  lowpass1?: number;
}

export interface VocalOpts {
  /** The pitch at the start, at `mid` (a share of the length, 0.35 by default) and at the end. */
  f0: number;
  f1: number;
  fm?: number;
  /** The vowel at the start and at the end: [centre Hz, Q, gain] of each formant. */
  v0: readonly (readonly [number, number, number])[];
  v1?: readonly (readonly [number, number, number])[];
  gain: number;
  attack?: number;
  release?: number;
  /** Vibrato: rate in Hz, depth in Hz. */
  vib?: readonly [number, number];
  /** How much breath (noise) goes through the vowel, 0..1. */
  breath?: number;
  /** Tearing, 0 (clean) .. ~8 (a growl). */
  drive?: number;
  /** A voice an octave below, 0..1. */
  sub?: number;
  /** Growl: a quick tremble of the loudness, in Hz. */
  growl?: number;
  /** How far the second, detuned saw is from the first (a ratio, default 1.011). */
  detune?: number;
}

export class Voice {
  readonly out: GainNode;
  private pre: AudioNode;
  private panner: PannerNode | null = null;
  private readonly nodes: AudioNode[] = [];
  private readonly srcs = new Set<AudioScheduledSourceNode>();
  private sealed = false;
  private done = false;
  private slotFree = false;
  private failsafe = 0;
  private readonly delay: number;

  /** Opens a voice, or null when the pool is full. */
  static open(s: DarkSink, pool: VoicePool, bus: AudioNode, o: VoiceOpts): Voice | null {
    if (pool.active >= pool.max + (o.urgent ? pool.reserve : 0)) {
      pool.refused++;
      return null;
    }
    return new Voice(s, pool, bus, o);
  }

  private constructor(
    readonly s: DarkSink,
    private readonly pool: VoicePool,
    bus: AudioNode,
    o: VoiceOpts,
  ) {
    const ctx = s.ctx;
    this.delay = o.delay ?? 0;
    pool.active++;
    pool.started++;
    pool.peak = Math.max(pool.peak, pool.active);
    pool.live.add(this);
    this.out = ctx.createGain();
    this.out.gain.value = Math.max(0, o.vol);
    this.nodes.push(this.out);
    // A soft limiter: random recipes now and then pile up past full scale; this rounds that off (nothing below 0.7 is touched).
    const lim = ctx.createWaveShaper();
    lim.curve = limiterCurve() as Float32Array<ArrayBuffer>;
    this.out.connect(lim);
    this.nodes.push(lim);
    let tail: AudioNode = lim;
    const far = clamp01(o.far ?? 0);
    if (far > 0.02) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 14000 * Math.pow(0.04, far);
      lp.Q.value = 0.5;
      tail.connect(lp);
      this.nodes.push(lp);
      tail = lp;
    }
    this.pre = tail;
    if (o.az !== undefined) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1;
      p.rolloffFactor = 0; // the loudness is the recipe's business
      this.panner = p;
      this.place(o.az, o.dist ?? 6);
      tail.connect(p);
      p.connect(bus);
      this.nodes.push(p);
    } else if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      tail.connect(p);
      p.connect(bus);
      this.nodes.push(p);
    } else {
      tail.connect(bus);
    }
    if (o.wet && (o.wetAmt ?? 0) > 0.001) {
      const send = ctx.createGain();
      send.gain.value = o.wetAmt!;
      this.pre.connect(send);
      send.connect(o.wet);
      this.nodes.push(send);
    }
  }

  // ---- placing ---------------------------------------------------------------------------------------

  /** Put the sound at `az` (radians clockwise from ahead) and `dist` blocks from the listener (only for a voice opened with `az`). */
  place(az: number, dist: number, over = 0): void {
    const p = this.panner;
    if (!p) return;
    const x = Math.sin(az) * dist;
    const z = -Math.cos(az) * dist;
    const t = this.s.ctx.currentTime;
    if (p.positionX) {
      if (over > 0) {
        p.positionX.linearRampToValueAtTime(x, t + over);
        p.positionZ.linearRampToValueAtTime(z, t + over);
      } else {
        p.positionX.value = x;
        p.positionY.value = 0;
        p.positionZ.value = z;
      }
    } else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, 0, z);
  }

  // ---- the parts -------------------------------------------------------------------------------------

  private track(src: AudioScheduledSourceNode): void {
    this.srcs.add(src);
    this.pool.sources++;
    src.onended = () => {
      if (!this.srcs.delete(src)) return;
      this.pool.sources--;
      try {
        src.disconnect();
      } catch {
        /* already gone */
      }
      if (this.sealed && this.srcs.size === 0) this.finish();
    };
  }

  /** Call when the recipe is done adding parts: the voice may end once the parts have. */
  seal(): void {
    this.sealed = true;
    if (this.srcs.size === 0) this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    clearTimeout(this.failsafe);
    for (const s of this.srcs) {
      this.pool.sources--;
      try {
        s.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.srcs.clear();
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.nodes.length = 0;
    this.freeSlot();
  }

  /** Give the voice's place in the pool back (once): when it ends, or as soon as it is told to fade (it is silent from then on). */
  private freeSlot(): void {
    if (this.slotFree) return;
    this.slotFree = true;
    this.pool.active--;
    this.pool.live.delete(this);
  }

  /** Fade out over `seconds` and end (the parts are stopped; a timer makes sure the voice is given back even if the context never says they ended). */
  fade(seconds: number): void {
    if (this.done) return;
    const ctx = this.s.ctx;
    const t = ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, Math.max(0.01, seconds / 4));
    for (const src of this.srcs) {
      try {
        src.stop(t + seconds + 0.05);
      } catch {
        /* not started */
      }
    }
    this.sealed = true;
    this.freeSlot();
    clearTimeout(this.failsafe);
    this.failsafe = setTimeout(() => this.finish(), (seconds + 0.6) * 1000) as unknown as number;
  }

  private startAt(at: number): number {
    return this.s.ctx.currentTime + this.delay + Math.max(0, at);
  }

  /** A filter. */
  filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const n = this.s.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    this.nodes.push(n);
    return n;
  }

  gain(v: number, to?: AudioNode): GainNode {
    const g = this.s.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    if (to) g.connect(to);
    return g;
  }

  shaper(k: number, to?: AudioNode): WaveShaperNode {
    const w = this.s.ctx.createWaveShaper();
    w.curve = driveCurve(k) as Float32Array<ArrayBuffer>;
    w.oversample = '2x';
    this.nodes.push(w);
    if (to) w.connect(to);
    return w;
  }

  /** A looping noise source, sounding from `at` for `dur` seconds. */
  noiseSrc(at: number, dur: number, deep = false): AudioBufferSourceNode {
    const ctx = this.s.ctx;
    const src = ctx.createBufferSource();
    src.buffer = deep ? this.s.deep : this.s.noise;
    src.loop = true;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    this.track(src);
    src.start(this.startAt(at), Math.random() * (deep ? 3 : 0.5), dur + 0.05);
    return src;
  }

  osc(type: OscillatorType, at: number, dur: number, f0: number, f1?: number): OscillatorNode {
    const ctx = this.s.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    const t = this.startAt(at);
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.track(o);
    o.start(t);
    o.stop(t + dur + 0.04);
    return o;
  }

  /** An envelope: up to `peak` in `attack`, held until `release` seconds before the end if one is given, then down. */
  env(at: number, dur: number, peak: number, attack = 0.01, release?: number, to?: AudioNode): GainNode {
    const g = this.s.ctx.createGain();
    const t = this.startAt(at);
    const a = Math.min(Math.max(0.003, attack), dur * 0.95);
    const p = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + a);
    if (release !== undefined && release < dur - a) g.gain.setValueAtTime(p, t + dur - release);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(to ?? this.out);
    this.nodes.push(g);
    return g;
  }

  /** A burst or swell of filtered noise. Returns the envelope (to the voice's output unless `to` says otherwise). */
  noise(at: number, dur: number, o: NoiseOpts, to?: AudioNode): GainNode {
    const t = this.startAt(at);
    const src = this.noiseSrc(at, dur, o.deep);
    const f = this.filter(o.type, o.f0, o.q ?? 0.7);
    if (o.f1 !== undefined) {
      f.frequency.setValueAtTime(o.f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    }
    const e = this.env(at, dur, o.gain, o.attack ?? 0.01, o.release, to);
    src.connect(f).connect(e);
    return e;
  }

  tone(at: number, dur: number, o: ToneOpts, to?: AudioNode): GainNode {
    const t = this.startAt(at);
    const osc = this.osc(o.type, at, dur, o.f0, o.f1);
    const e = this.env(at, dur, o.gain, o.attack ?? 0.01, o.release, to);
    if (o.lowpass) {
      const f = this.filter('lowpass', o.lowpass);
      if (o.lowpass1 !== undefined) {
        f.frequency.setValueAtTime(o.lowpass, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(20, o.lowpass1), t + dur);
      }
      osc.connect(f).connect(e);
    } else osc.connect(e);
    return e;
  }

  /**
   * A voice that is not a person's: a pair of saws through a few formant filters (the vowel, which may change from the start to the end of
   * the sound), with vibrato, breath, a voice below, a growl and tearing as asked.
   */
  vocal(at: number, dur: number, o: VocalOpts, to?: AudioNode): GainNode {
    const t = this.startAt(at);
    const env = this.env(at, dur, o.gain, o.attack ?? dur * 0.3, o.release, to);
    let into: AudioNode = env;
    if (o.growl) {
      const g = this.gain(0.7, env);
      const lfo = this.osc('sine', at, dur, o.growl);
      const depth = this.gain(0.3);
      lfo.connect(depth).connect(g.gain);
      into = g;
    }
    // The source: two saws a hair apart (a thicker voice), through the tearing if there is any.
    const src = this.gain(1);
    const pitch = (f: number): number => Math.max(20, f);
    const mid = o.fm ?? (o.f0 + o.f1) / 2;
    const saws: OscillatorNode[] = [];
    for (const ratio of [1, o.detune ?? 1.011]) {
      const s = this.osc('sawtooth', at, dur, pitch(o.f0 * ratio));
      s.frequency.exponentialRampToValueAtTime(pitch(mid * ratio), t + dur * 0.35);
      s.frequency.exponentialRampToValueAtTime(pitch(o.f1 * ratio), t + dur);
      s.connect(src);
      saws.push(s);
    }
    if (o.sub) {
      const s = this.osc('sine', at, dur, pitch(o.f0 / 2));
      s.frequency.exponentialRampToValueAtTime(pitch(mid / 2), t + dur * 0.35);
      s.frequency.exponentialRampToValueAtTime(pitch(o.f1 / 2), t + dur);
      s.connect(this.gain(o.sub * 2.5)).connect(src);
    }
    if (o.vib) {
      const lfo = this.osc('sine', at, dur, o.vib[0]);
      const depth = this.gain(o.vib[1]);
      lfo.connect(depth);
      for (const s of saws) depth.connect(s.frequency);
    }
    let voiced: AudioNode = src;
    if (o.drive) {
      const w = this.shaper(o.drive);
      src.connect(w);
      voiced = w;
    }
    const vowel1 = o.v1 ?? o.v0;
    const mix = this.gain(1, into);
    o.v0.forEach(([f, q, g], i) => {
      const bp = this.filter('bandpass', f, q);
      const [f1] = vowel1[Math.min(i, vowel1.length - 1)];
      if (f1 !== f) {
        bp.frequency.setValueAtTime(f, t);
        bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      }
      voiced.connect(bp);
      bp.connect(this.gain(g * 3, mix));
      if (o.breath) {
        const n = this.noiseSrc(at, dur);
        const nb = this.filter('bandpass', f, q);
        if (f1 !== f) {
          nb.frequency.setValueAtTime(f, t);
          nb.frequency.exponentialRampToValueAtTime(f1, t + dur);
        }
        n.connect(nb).connect(this.gain(g * o.breath * 3, mix));
      }
    });
    return env;
  }

  /**
   * Little random ticks of filtered noise (embers popping, rubble falling) from `at` for `dur` seconds, from `rate0` a second down or up to `rate1`,
   * each at a pitch between `f0` and `f1`. All of them come out of one source.
   */
  rubble(at: number, dur: number, o: { rate0: number; rate1: number; f0: number; f1: number; gain: number; q?: number; type?: BiquadFilterType; decay?: number }, to?: AudioNode): void {
    const t0 = this.startAt(at);
    const src = this.noiseSrc(at, dur);
    const f = this.filter(o.type ?? 'bandpass', o.f0, o.q ?? 1.3);
    const g = this.gain(0.0001, to ?? this.out);
    g.gain.setValueAtTime(0.0001, t0);
    src.connect(f).connect(g);
    let t = 0;
    while (t < dur - 0.02) {
      const k = t / dur;
      const rate = Math.max(0.1, o.rate0 + (o.rate1 - o.rate0) * k);
      const gap = Math.max(0.014, -Math.log(1 - Math.random()) / rate);
      const d = Math.min(o.decay ?? 0.05, gap * 0.9);
      const tt = t0 + t;
      f.frequency.setValueAtTime(o.f0 * Math.pow(o.f1 / o.f0, Math.random()), tt);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0003, o.gain * (0.25 + 0.75 * Math.random())), tt + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      t += gap;
    }
  }
}
