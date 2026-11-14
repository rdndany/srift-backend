/**
 * Procedural background audio: sparse piano-like music, birdsong by day, cave drones underground.
 * Everything is synthesised with WebAudio, so there are no audio assets (and nothing to license).
 */

export interface AmbientEnv {
  /** No sky above the player (caves, tunnels). */
  underground: boolean;
  /** 0..1 daylight (1 = noon). */
  day: number;
  /** 0..1 rain intensity. */
  rain: number;
}

const ROOTS = [48, 50, 53, 55, 57]; // C2 D2 F2 G2 A2 (midi)
const SCALE = [0, 2, 4, 7, 9]; // major pentatonic: nothing ever sounds wrong

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class Ambience {
  private readonly music: GainNode;
  private readonly wet: GainNode;
  private readonly conv: ConvolverNode;
  private nextMusic = rnd(25, 50);
  private nextBird = rnd(4, 12);
  private nextCave = rnd(25, 60);
  /** 0..1 user setting. */
  musicVolume = 0.5;
  private playingUntil = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly dest: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.music = ctx.createGain();
    this.music.gain.value = 0.3;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.conv = ctx.createConvolver();
    this.conv.buffer = this.impulse(2.8);
    this.music.connect(dest);
    this.music.connect(this.conv);
    this.conv.connect(this.wet).connect(dest);
  }

  /** A synthetic hall: exponentially decaying noise. */
  private impulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  /** Is a music piece currently sounding? */
  get musicPlaying(): boolean {
    return this.ctx.currentTime < this.playingUntil;
  }

  update(dt: number, env: AmbientEnv): void {
    this.music.gain.setTargetAtTime(0.3 * this.musicVolume, this.ctx.currentTime, 0.2);

    if (this.musicVolume > 0.01 && !this.musicPlaying) {
      this.nextMusic -= dt;
      if (this.nextMusic <= 0) {
        this.nextMusic = rnd(70, 200);
        this.playPiece();
      }
    }

    if (!env.underground && env.day > 0.55 && env.rain < 0.1) {
      this.nextBird -= dt;
      if (this.nextBird <= 0) {
        this.nextBird = rnd(6, 20);
        this.chirp();
      }
    }

    if (env.underground) {
      this.nextCave -= dt;
      if (this.nextCave <= 0) {
        this.nextCave = rnd(40, 110);
        this.cave();
      }
    }
  }

  /** A slow, reflective piece: arpeggiated pentatonic melody over a drifting bass. */
  playPiece(): void {
    const t0 = this.ctx.currentTime + 0.1;
    const root = ROOTS[Math.floor(Math.random() * ROOTS.length)];
    let deg = Math.floor(Math.random() * SCALE.length);
    let t = 0;
    const notes = 10 + Math.floor(Math.random() * 10);
    for (let i = 0; i < notes; i++) {
      const octave = 24 + (Math.random() < 0.3 ? 12 : 0);
      const step = Math.floor(Math.random() * 3) - 1;
      deg = Math.max(0, Math.min(SCALE.length * 2 - 1, deg + step * (Math.random() < 0.6 ? 1 : 2)));
      const n = root + octave + SCALE[deg % SCALE.length] + (deg >= SCALE.length ? 12 : 0);
      this.note(midi(n), t0 + t, rnd(0.05, 0.14), 3.2);
      if (i % 4 === 0) this.note(midi(root + (i % 8 === 0 ? 0 : 7)), t0 + t, 0.12, 5);
      t += Math.random() < 0.2 ? rnd(1.6, 3) : rnd(0.55, 1.3);
    }
    this.playingUntil = t0 + t + 5;
  }

  private note(freq: number, at: number, gain: number, decay: number): void {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    out.connect(this.music);
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.value = freq;
    const bell = ctx.createOscillator();
    bell.type = 'triangle';
    bell.frequency.value = freq * 2.003;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.25, at);
    bg.gain.exponentialRampToValueAtTime(0.0005, at + decay * 0.35);
    body.connect(out);
    bell.connect(bg).connect(out);
    for (const o of [body, bell]) {
      o.start(at);
      o.stop(at + decay + 0.05);
    }
  }

  /** Two or three quick rising/falling chirps. */
  private chirp(): void {
    const ctx = this.ctx;
    const base = rnd(2600, 4200);
    const count = 2 + Math.floor(Math.random() * 3);
    const vol = rnd(0.015, 0.035);
    for (let i = 0; i < count; i++) {
      const at = ctx.currentTime + i * rnd(0.09, 0.15);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      const up = Math.random() < 0.5;
      o.frequency.setValueAtTime(base * (up ? 0.8 : 1.15), at);
      o.frequency.exponentialRampToValueAtTime(base * (up ? 1.2 : 0.85), at + 0.07);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      o.connect(g).connect(this.dest);
      o.start(at);
      o.stop(at + 0.12);
    }
  }

  /** A distant, uneasy rumble. */
  private cave(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = rnd(2.5, 4.5);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(rnd(0.12, 0.22), t + dur * 0.4);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.dest);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(rnd(140, 260), t);
    f.frequency.exponentialRampToValueAtTime(70, t + dur);
    src.connect(f).connect(out);
    src.start(t);
    src.stop(t + dur + 0.1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(rnd(55, 85), t);
    o.frequency.exponentialRampToValueAtTime(34, t + dur);
    const og = ctx.createGain();
    og.gain.value = 0.5;
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}
