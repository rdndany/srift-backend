import type { BossFx, MobKind, MobSound, SoundKind } from '@solrift/shared';
import { Ambience, hallImpulse, type AmbientEnv } from './ambience';
import { bossLoudness, playBoss, playBossNamed, playGrunt, playYell, type BossPlay, type BossSoundName } from './bossSounds';
import { VoicePool, makeSink, type DarkSink } from './darkSounds';
import { deepMobSound, isDeepVoice } from './audioDeep';
import { DungeonAmbience, type DungeonEnv } from './dungeonAmbience';
import type { AmbientName } from './dungeonSounds';
import { playAbilitySound, type AbilitySound } from './abilitySounds';
import { STEP_ACTIONS, STEP_SURFACES, prepareStep, stepBuffers } from './stepSounds';

type Action = 'break' | 'place' | 'step' | 'hit' | 'land' | 'jump';

interface Voice {
  filter: BiquadFilterType;
  freq: number;
  q: number;
  /** noise burst length in seconds */
  dur: number;
  noise: number;
  /** optional tonal component */
  tone?: { type: OscillatorType; freq: number; gain: number; drop?: number };
}

/** Procedural sound effects; no audio assets required. */
const VOICES: Record<Exclude<SoundKind, 'none'>, Voice> = {
  stone: { filter: 'bandpass', freq: 1700, q: 0.9, dur: 0.16, noise: 0.9, tone: { type: 'triangle', freq: 150, gain: 0.35, drop: 0.5 } },
  dirt: { filter: 'lowpass', freq: 650, q: 0.7, dur: 0.15, noise: 1.0 },
  grass: { filter: 'bandpass', freq: 1500, q: 0.5, dur: 0.17, noise: 0.7 },
  sand: { filter: 'bandpass', freq: 2800, q: 0.35, dur: 0.17, noise: 0.55 },
  gravel: { filter: 'lowpass', freq: 2300, q: 0.6, dur: 0.2, noise: 0.9 },
  wood: { filter: 'bandpass', freq: 850, q: 1.1, dur: 0.14, noise: 0.5, tone: { type: 'sine', freq: 230, gain: 0.7, drop: 0.7 } },
  glass: { filter: 'highpass', freq: 3600, q: 0.8, dur: 0.28, noise: 0.45, tone: { type: 'sine', freq: 2400, gain: 0.25 } },
  leaves: { filter: 'highpass', freq: 2600, q: 0.5, dur: 0.12, noise: 0.35 },
  snow: { filter: 'bandpass', freq: 3600, q: 0.5, dur: 0.11, noise: 0.55 },
  water: { filter: 'lowpass', freq: 480, q: 0.6, dur: 0.28, noise: 0.7 },
};

const ACTION_GAIN: Record<Action, number> = { break: 0.55, place: 0.42, step: 0.16, hit: 0.2, land: 0.5, jump: 0.2 };
const ACTION_LEN: Record<Action, number> = { break: 1.15, place: 0.8, step: 0.6, hit: 0.5, land: 1.4, jump: 0.5 };
const ACTION_PITCH: Record<Action, number> = { break: 0.9, place: 1.15, step: 1.0, hit: 1.25, land: 0.7, jump: 1.0 };

/** The beds of the World Beyond's places (`Atmosphere.ambience`): a filter, a loudness, and how fast and how deep the swell is. */
export const BED_SOUNDS: Record<string, { type: BiquadFilterType; freq: number; q: number; gain: number; rate: number; depth: number }> = {
  forest: { type: 'bandpass', freq: 1200, q: 0.5, gain: 0.012, rate: 0.12, depth: 0.5 },
  jungle: { type: 'bandpass', freq: 3200, q: 2, gain: 0.02, rate: 0.6, depth: 0.45 },
  swamp: { type: 'lowpass', freq: 420, q: 0.7, gain: 0.03, rate: 0.25, depth: 0.5 },
  desert: { type: 'bandpass', freq: 900, q: 0.6, gain: 0.035, rate: 0.18, depth: 0.55 },
  wind: { type: 'bandpass', freq: 520, q: 0.6, gain: 0.05, rate: 0.14, depth: 0.6 },
  snow: { type: 'bandpass', freq: 760, q: 0.5, gain: 0.03, rate: 0.1, depth: 0.5 },
  sea: { type: 'lowpass', freq: 650, q: 0.5, gain: 0.06, rate: 0.11, depth: 0.7 },
  deep: { type: 'lowpass', freq: 210, q: 0.7, gain: 0.05, rate: 0.05, depth: 0.4 },
  river: { type: 'bandpass', freq: 2200, q: 0.8, gain: 0.03, rate: 0.5, depth: 0.15 },
  cave: { type: 'lowpass', freq: 170, q: 0.7, gain: 0.035, rate: 0.07, depth: 0.4 },
  magic: { type: 'bandpass', freq: 3000, q: 9, gain: 0.015, rate: 0.35, depth: 0.6 },
  storm: { type: 'bandpass', freq: 420, q: 0.5, gain: 0.08, rate: 0.3, depth: 0.7 },
  fire: { type: 'lowpass', freq: 320, q: 0.8, gain: 0.05, rate: 1.1, depth: 0.6 },
  night: { type: 'lowpass', freq: 130, q: 0.7, gain: 0.04, rate: 0.05, depth: 0.5 },
  hollow: { type: 'lowpass', freq: 260, q: 0.8, gain: 0.04, rate: 0.08, depth: 0.35 },
};

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastXp = 0;
  /** All the effects (not the music or the weather) go through here: one place to add the echo of a cave. */
  private sfx: GainNode | null = null;
  private caveSend: GainNode | null = null;
  /** Where the sound being made now comes from, -1 (left) .. 1 (right); 0 for centre. Set only for the length of one call. */
  private pan = 0;
  private foot = 0;
  private noise: AudioBuffer | null = null;
  private ambience: Ambience | null = null;
  /** The sound of the Hollow Deep, and of its boss (see dungeonAmbience.ts, bossSounds.ts). */
  private dungeon: DungeonAmbience | null = null;
  private dark: DarkSink | null = null;
  private readonly bossPool = new VoicePool(14);
  private lastRoar = -9;
  private lastGrunt = -9;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  /** Low-pass over the whole mix while the eyes are under water, and the quiet current that plays with them. */
  private waterFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
  private submerged = false;
  private bubbleIn = 0.8;
  /** The bed of a place (wind, sea, a storm...): one looping noise through a filter, with a slow swell on its level. */
  private bed: { filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; lfoDepth: GainNode } | null = null;
  /** The knob for everything that is heard (see `resume`), and the one for the weather and the places. */
  private main: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private levels = { master: 0.8, effects: 1, ambience: 1, muted: false };
  /** Footsteps still to synthesise while the world loads, and the noise bed copied in when sound starts. */
  private stepPlan: { kind: (typeof STEP_SURFACES)[number]; action: (typeof STEP_ACTIONS)[number]; rate: number }[] | null = null;
  private stepAt = 0;
  private beds = new Map<number, { noise: Float32Array; left: Float32Array; right: Float32Array }>();
  private static readonly RATES = [44100, 48000];

  /**
   * A slice of the sounds heard the first time the player walks, jumps or lands, and of the noise the weather uses.
   * Call it each frame while the world is loading. Returns true when nothing is left to build.
   */
  warm(budgetMs = 8): boolean {
    try {
      if (!this.stepPlan) {
        this.stepPlan = [];
        for (const rate of GameAudio.RATES) for (const kind of STEP_SURFACES) for (const action of STEP_ACTIONS) this.stepPlan.push({ kind, action, rate });
      }
      const t0 = performance.now();
      while (this.stepAt < this.stepPlan.length && performance.now() - t0 < budgetMs) {
        const job = this.stepPlan[this.stepAt++];
        prepareStep(job.kind, job.action, job.rate);
      }
      if (this.stepAt >= this.stepPlan.length) {
        for (const rate of GameAudio.RATES) {
          if (this.beds.has(rate)) continue;
          if (performance.now() - t0 >= budgetMs) return false;
          const noise = new Float32Array(rate);
          for (let i = 0; i < rate; i++) noise[i] = Math.random() * 2 - 1;
          const [left, right] = hallImpulse(rate);
          this.beds.set(rate, { noise, left, right });
        }
      }
      return this.stepAt >= this.stepPlan.length && this.beds.size === GameAudio.RATES.length;
    } catch {
      this.stepAt = this.stepPlan?.length ?? 0;
      return true;
    }
  }

  /** Must be called from a user gesture (e.g. the click that locks the pointer). */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      // The player's three volumes: `main` is the knob for everything, `master` the one for the effects (the name stayed, as
      // nearly everything that makes a sound is an effect), `ambBus` the one for the weather and the places.
      this.main = this.ctx.createGain();
      // Everything the world makes passes through here, so going under the water can muffle it in one place.
      this.waterFilter = this.ctx.createBiquadFilter();
      this.waterFilter.type = 'lowpass';
      this.waterFilter.frequency.value = 20000;
      this.waterFilter.Q.value = 0.6;
      this.main.connect(this.waterFilter);
      this.waterFilter.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.connect(this.main);
      this.ambBus = this.ctx.createGain();
      this.ambBus.connect(this.main);
      this.applyLevels(true);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      const bed = this.beds.get(len);
      if (bed) d.set(bed.noise);
      else for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      let impulse: AudioBuffer | undefined;
      if (bed) {
        impulse = this.ctx.createBuffer(2, bed.left.length, this.ctx.sampleRate);
        impulse.getChannelData(0).set(bed.left);
        impulse.getChannelData(1).set(bed.right);
      }
      this.ambience = new Ambience(this.ctx, this.ambBus, this.noise, impulse, this.main);
      this.dungeon = new DungeonAmbience(this.ctx, this.ambBus, this.darkSink()!);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** The context footsteps and weather already play through, or null before the first click. Voice uses this so it is not a second, silent context the browser suspends. */
  context(): AudioContext | null {
    return this.ctx;
  }

  /** The loudness the player chose (see settings.ts). Takes effect at once, or when sound starts. */
  setLevels(levels: Partial<{ master: number; effects: number; ambience: number; muted: boolean }>): void {
    this.levels = { ...this.levels, ...levels };
    this.applyLevels(false);
  }

  private applyLevels(now: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.main || !this.master || !this.ambBus) return;
    const set = (g: GainNode, v: number): void => {
      if (now) g.gain.value = v;
      else g.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
    };
    set(this.main, this.levels.muted ? 0 : this.levels.master);
    set(this.master, this.levels.effects);
    set(this.ambBus, this.levels.ambience);
  }

  /** A block sound; `pan` is -1 (left) .. 1 (right) for where it is heard from. */
  play(kind: SoundKind, action: Action, volume = 1, pan = 0): void {
    this.pan = pan;
    try {
      this.playNow(kind, action, volume);
    } finally {
      this.pan = 0;
    }
  }

  private playNow(kind: SoundKind, action: Action, volume: number): void {
    if (kind === 'none' || !this.ctx || !this.master || !this.noise) return;
    if (action === 'step' || action === 'jump' || action === 'land') {
      this.stepNow(kind, volume, action);
      return;
    }
    const v = VOICES[kind];
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = v.dur * ACTION_LEN[action];
    const pitch = ACTION_PITCH[action] * (0.9 + Math.random() * 0.2);
    const peak = ACTION_GAIN[action] * volume;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.dest());

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = v.filter;
    filter.frequency.value = v.freq * pitch;
    filter.Q.value = v.q;
    const ng = ctx.createGain();
    ng.gain.value = v.noise;
    src.connect(filter).connect(ng).connect(out);
    src.start(t, Math.random() * 0.5, dur + 0.05);

    if (v.tone) {
      const osc = ctx.createOscillator();
      osc.type = v.tone.type;
      osc.frequency.setValueAtTime(v.tone.freq * pitch, t);
      if (v.tone.drop) osc.frequency.exponentialRampToValueAtTime(v.tone.freq * pitch * v.tone.drop, t + dur);
      const og = ctx.createGain();
      og.gain.value = v.tone.gain;
      osc.connect(og).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  private lastStep = -1;

  /**
   * A footstep: one of several recorded-like variants of the surface (see stepSounds.ts), never the same twice in a row,
   * a little different in pitch and weight each time, left foot and right foot alternating.
   */
  private stepNow(kind: Exclude<SoundKind, 'none'>, volume: number, action: 'step' | 'jump' | 'land'): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const variants = stepBuffers(ctx, kind, action);
    let pick = Math.floor(Math.random() * variants.length);
    if (pick === this.lastStep) pick = (pick + 1 + Math.floor(Math.random() * (variants.length - 1))) % variants.length;
    this.lastStep = pick;
    if (action === 'step') this.foot ^= 1;
    const src = ctx.createBufferSource();
    src.buffer = variants[pick];
    src.playbackRate.value = (this.foot ? 0.95 : 1.04) * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = (this.foot ? 1 : 0.88) * (0.8 + Math.random() * 0.4) * volume;
    src.connect(g).connect(this.dest());
    src.start(ctx.currentTime + 0.005);
  }

  splash(volume = 1): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const bus = this.dest();
    // The body of the splash: water shoved aside, low and short.
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, t);
    body.gain.exponentialRampToValueAtTime(0.42 * volume, t + 0.012);
    body.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    body.connect(bus);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(380, t);
    low.frequency.exponentialRampToValueAtTime(140, t + 0.2);
    src.connect(low).connect(body);
    src.start(t, Math.random() * 0.4, 0.25);
    // Drops thrown up, each a small bright tick a moment apart.
    const drops = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < drops; i++) {
      const at = t + 0.03 + Math.random() * 0.16;
      const dur = 0.03 + Math.random() * 0.04;
      const drop = ctx.createGain();
      drop.gain.setValueAtTime(0.0001, at);
      drop.gain.exponentialRampToValueAtTime((0.08 + Math.random() * 0.1) * volume, at + 0.004);
      drop.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      drop.connect(bus);
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      n.playbackRate.value = 0.8 + Math.random() * 0.6;
      const hi = ctx.createBiquadFilter();
      hi.type = 'bandpass';
      hi.frequency.value = 1800 + Math.random() * 2200;
      hi.Q.value = 4;
      n.connect(hi).connect(drop);
      n.start(at, Math.random(), dur + 0.02);
    }
  }

  /** Short filtered-noise blip shared by the small effects below. */
  private blip(freq: number, q: number, dur: number, gain: number, type: BiquadFilterType, sweep = 1): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.dest());
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    src.connect(f).connect(out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  /** Fire: the scratch and whoosh of lighting one, the pops of burning, the hiss of water or rain putting it out. */
  fire(kind: 'ignite' | 'crackle' | 'hiss', volume = 1): void {
    if (kind === 'ignite') {
      this.blip(5200, 0.8, 0.07, 0.35 * volume, 'highpass');
      setTimeout(() => this.blip(500, 0.5, 0.45, 0.45 * volume, 'lowpass', 3), 60);
    } else if (kind === 'crackle') {
      const pops = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pops; i++) setTimeout(() => this.blip(2500 + Math.random() * 3000, 1.5, 0.03 + Math.random() * 0.03, 0.4 * volume, 'bandpass'), i * (40 + Math.random() * 60));
    } else {
      this.blip(4200, 0.6, 0.55, 0.35 * volume, 'highpass', 0.5);
    }
  }

  /**
   * Fishing: the whoosh of the cast, the plop of the float, the small bubbling of a fish coming, the sharp splash of the bite,
   * the flick of reeling in and the happy chirp of a catch. `volume` is 0..1 and already follows how far away it was.
   */
  fishing(what: 'cast' | 'splash' | 'lure' | 'bite' | 'escape' | 'reel' | 'catch', volume = 1): void {
    if (!this.ctx || volume <= 0.01) return;
    switch (what) {
      case 'cast':
        this.blip(900, 0.7, 0.28, 0.32 * volume, 'bandpass', 3.2);
        break;
      case 'reel':
        this.blip(2600, 0.9, 0.16, 0.3 * volume, 'bandpass', 0.35);
        setTimeout(() => this.blip(1800, 1.2, 0.04, 0.22 * volume, 'bandpass'), 90);
        break;
      case 'splash':
        this.splash(0.55 * volume);
        break;
      case 'lure':
        for (let i = 0; i < 4; i++) setTimeout(() => this.blip(700 + Math.random() * 700, 3, 0.05, 0.22 * volume, 'bandpass', 1.8), i * (60 + Math.random() * 70));
        break;
      case 'bite':
        this.splash(0.85 * volume);
        this.blip(320, 1.4, 0.12, 0.4 * volume, 'lowpass', 0.6);
        break;
      case 'escape':
        this.blip(1500, 0.8, 0.12, 0.18 * volume, 'bandpass', 0.5);
        break;
      case 'catch':
        this.pop();
        setTimeout(() => this.pop(), 90);
        break;
    }
  }

  /** Crunchy bites. */
  eat(): void {
    for (let i = 0; i < 3; i++) setTimeout(() => this.blip(900 + Math.random() * 500, 1.2, 0.07, 0.5, 'bandpass'), i * 110);
  }

  /** One bite of a meal: a short dry crunch. */
  munch(): void {
    this.blip(260 + Math.random() * 140, 1.4, 0.05, 0.45, 'bandpass');
    setTimeout(() => this.blip(1100 + Math.random() * 500, 1.2, 0.035, 0.3, 'bandpass'), 30);
  }

  /** A chest lid: a wooden knock and a short creak, higher as it opens. */
  chest(open: boolean): void {
    this.blip(open ? 210 : 160, 0.7, 0.05, 0.35, 'lowpass');
    setTimeout(() => this.blip(open ? 380 : 240, 1.4, 0.09, 0.22, 'bandpass', open ? 1.4 : 0.7), 35);
  }

  /** Item pickup pop. */
  pop(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(420 + Math.random() * 120, t);
    o.frequency.exponentialRampToValueAtTime(980, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** Armor going on: a short metallic clink. */
  equip(): void {
    for (let i = 0; i < 2; i++) setTimeout(() => this.blip(1500 + i * 700 + Math.random() * 200, 0.7, 0.09, 0.4, 'bandpass'), i * 70);
  }

  /**
   * The Runic Altar and the anvil. The anvil rings and clanks. The altar has its own sound, in the family of the jewels (bells
   * and glitter in a reverb) but a different spell: a rune charging (a low swell that rises and a thin tone that sweeps up), the
   * strike (a deep thump and a bell on the root with its fifth) and a rising run of notes that is the glyph's element:
   * ember crackles, tide bubbles, storm cracks, verdant is a soft rain of chimes, shadow is low and cold, radiant is bright and
   * high, arcane (and anything else) is a mystic whoosh. A higher rank is a longer run and a deeper thump. Erasing a glyph is
   * the opposite: the notes fall and the air goes out of it.
   */
  enchant(anvil = false, fx?: { element?: string; rank?: number; erase?: boolean; fail?: boolean }): void {
    if (anvil) {
      this.blip(1100, 5, 0.3, 0.5, 'bandpass');
      setTimeout(() => this.blip(320, 1.2, 0.2, 0.6, 'lowpass'), 60);
      return;
    }
    if (fx?.fail) return this.fizzle();
    if (fx?.erase) return this.unbind();
    this.inscribe(fx?.element ?? 'arcane', Math.max(1, Math.min(5, fx?.rank ?? 1)));
  }

  /**
   * A rift: it tears open (a low groan that sinks, with a cold bell), opens (a rush, a thump and glitter), sends a wave (two horn calls),
   * is sealed (a bright rising run of bells) or collapses (the notes fall). The higher its grade, the higher the pitch of it all.
   */
  rift(what: 'omen' | 'open' | 'wave' | 'sealed' | 'collapsed', grade: 'uncommon' | 'rare' | 'epic' = 'uncommon'): void {
    if (!this.ctx || !this.master) return;
    const k = grade === 'epic' ? 1.26 : grade === 'rare' ? 1.12 : 1;
    switch (what) {
      case 'omen':
        this.swell(130 * k, 'sawtooth', 0.12, 0.5, 1.6, 0, 55 * k, 0.5, 700);
        this.swell(65 * k, 'sine', 0.3, 0.3, 1.8, 0, 40, 0.2);
        this.fmBell(311 * k, 0.12, 2.2, 0.5, 1.41, 3, 0.7);
        this.fmBell(466 * k, 0.09, 2.4, 0.9, 1.41, 3, 0.7);
        this.blip(180, 1.5, 1.2, 0.14, 'lowpass', 0.3);
        break;
      case 'open':
        this.blip(300, 0.8, 0.9, 0.3, 'bandpass', 8);
        this.swell(55 * k, 'sine', 0.4, 0.01, 0.9, 0.05, 28, 0.2);
        this.swell(220 * k, 'triangle', 0.12, 0.05, 0.9, 0, 440 * k, 0.5, 2200);
        this.fmBell(523 * k, 0.16, 1.8, 0.1, 2.76, 4, 0.6);
        this.glitter(1200 * k, 8, 0.05, 0.15, 0.08);
        break;
      case 'wave':
        this.swell(196 * k, 'sawtooth', 0.1, 0.06, 0.45, 0, 0, 0.4, 1400);
        this.swell(294 * k, 'sawtooth', 0.09, 0.06, 0.6, 0.3, 0, 0.4, 1400);
        this.swell(49 * k, 'sine', 0.3, 0.01, 0.5, 0.3, 30, 0.15);
        break;
      case 'sealed':
        [523, 659, 784, 1047, 1319].forEach((hz, i) => this.fmBell(hz * k, 0.13 - i * 0.012, 1.6, i * 0.11, 2.76, 3, 0.6));
        this.swell(131 * k, 'triangle', 0.14, 0.2, 1.2, 0, 262 * k, 0.5, 1800);
        this.glitter(1800 * k, 10, 0.06, 0.5, 0.08);
        break;
      case 'collapsed':
        this.swell(330 * k, 'triangle', 0.12, 0.02, 1.2, 0, 70, 0.4, 1600);
        [880, 659, 494, 370].forEach((hz, i) => this.fmBell(hz * k, 0.09, 0.9, 0.05 + i * 0.14, 1.41, 2.5, 0.6));
        this.blip(160, 1.2, 1.0, 0.16, 'lowpass', 0.3);
        break;
    }
  }

  /**
   * The Gilded Tide: a warning (a rising brass call over a low drum), the tide breaking (a rush, a heavy thump and a gold glitter),
   * All golden creatures found (a bright run of bells and a glitter) or the tide fading (the notes fall). (`boss` is kept for old clients.)
   */
  invasion(what: 'omen' | 'open' | 'boss' | 'slain' | 'faded'): void {
    if (!this.ctx || !this.master) return;
    switch (what) {
      case 'omen':
        this.swell(220, 'sawtooth', 0.1, 0.15, 0.7, 0, 330, 0.5, 1500);
        this.swell(330, 'sawtooth', 0.09, 0.15, 0.9, 0.5, 440, 0.5, 1500);
        this.swell(110, 'sine', 0.3, 0.02, 1.0, 0.5, 60, 0.2);
        this.fmBell(784, 0.1, 1.6, 0.9, 2.76, 3, 0.6);
        break;
      case 'open':
        this.blip(260, 0.9, 1.0, 0.3, 'bandpass', 8);
        this.swell(50, 'sine', 0.45, 0.01, 1.2, 0.05, 26, 0.2);
        this.swell(165, 'sawtooth', 0.12, 0.08, 1.1, 0, 330, 0.5, 2000);
        this.swell(247, 'sawtooth', 0.1, 0.08, 1.1, 0.25, 495, 0.5, 2000);
        this.fmBell(1047, 0.12, 1.8, 0.3, 2.76, 4, 0.6);
        this.glitter(1500, 12, 0.06, 0.2, 0.08);
        break;
      case 'boss':
        this.swell(58, 'sawtooth', 0.22, 0.05, 2.0, 0, 34, 0.4, 500);
        this.swell(46, 'sine', 0.45, 0.02, 2.2, 0.05, 27, 0.2);
        this.swell(196, 'sawtooth', 0.1, 0.3, 1.6, 0.4, 98, 0.5, 1200);
        this.blip(140, 1.6, 1.4, 0.25, 'lowpass', 0.3);
        this.fmBell(392, 0.09, 2.2, 1.0, 1.41, 3, 0.7);
        break;
      case 'slain':
        [523, 659, 784, 1047, 1319, 1568].forEach((hz, i) => this.fmBell(hz, 0.13 - i * 0.01, 1.6, i * 0.1, 2.76, 3, 0.6));
        this.swell(131, 'triangle', 0.14, 0.2, 1.4, 0, 262, 0.5, 1800);
        this.glitter(2000, 14, 0.06, 0.5, 0.08);
        break;
      case 'faded':
        this.swell(330, 'triangle', 0.12, 0.02, 1.2, 0, 80, 0.4, 1600);
        [880, 659, 494, 370].forEach((hz, i) => this.fmBell(hz, 0.09, 0.9, 0.05 + i * 0.14, 1.41, 2.5, 0.6));
        break;
    }
  }

  /** One soft tone (sines and triangles) with a slow attack and an optional glide, a little of it sent through the reverb. */
  private swell(freq: number, type: OscillatorType, gain: number, attack: number, dur: number, delay = 0, glideTo = 0, wet = 0.5, cutoff = 0): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + attack);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.85);
    let node: AudioNode = osc;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff * 0.25, t);
      f.frequency.exponentialRampToValueAtTime(cutoff, t + attack);
      f.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + dur);
      osc.connect(f);
      node = f;
    }
    node.connect(out);
    out.connect(this.master);
    const tail = this.tail();
    if (tail && wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      out.connect(send).connect(tail);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private inscribe(element: string, rank: number): void {
    // Each element: a root note (Hz) and the steps of its run (semitones), an arcane minor-ish or a bright major one.
    const sets: Record<string, { root: number; steps: number[]; bell: number }> = {
      ember: { root: 196, steps: [0, 3, 7, 10, 12], bell: 3.5 },
      tide: { root: 220, steps: [0, 2, 7, 9, 14], bell: 2.76 },
      storm: { root: 233, steps: [0, 5, 7, 12, 17], bell: 5.07 },
      verdant: { root: 262, steps: [0, 4, 7, 9, 14], bell: 2.0 },
      shadow: { root: 147, steps: [0, 3, 6, 10, 15], bell: 1.41 },
      radiant: { root: 330, steps: [0, 4, 7, 12, 16], bell: 3.5 },
      arcane: { root: 247, steps: [0, 3, 7, 12, 15], bell: 3.5 },
    };
    const set = sets[element] ?? sets.arcane;
    const f = (semi: number, oct = 1): number => set.root * oct * Math.pow(2, semi / 12);
    const charge = 0.42;

    // The rune charging: a low swell and a thin tone sweeping up toward the strike.
    this.swell(set.root, 'triangle', 0.16, 0.34, 0.62, 0, set.root * 2, 0.5, 1800);
    this.swell(set.root * 1.5, 'sine', 0.08, 0.34, 0.6, 0, set.root * 3, 0.6);
    this.swell(set.root * 4, 'sine', 0.035, 0.38, 0.5, 0, set.root * 8, 0.8);
    this.blip(1500, 1.2, charge, 0.12, 'bandpass', 5);

    // The strike: a thump below, a bell on the root and its fifth.
    this.swell(set.root / 2, 'sine', 0.34 + rank * 0.03, 0.01, 0.55, charge, set.root / 4, 0.2);
    this.fmBell(f(0, 4), 0.26, 1.7, charge, set.bell, 4.5, 0.5);
    this.fmBell(f(7, 4), 0.12, 1.2, charge + 0.015, set.bell, 3, 0.5);
    this.blip(8500, 0.7, 0.07, 0.12, 'highpass');

    // The run of notes (longer with the rank) that climbs in the element's scale, ringing in the reverb.
    const n = 2 + rank;
    for (let i = 0; i < n; i++) {
      const oct = i >= set.steps.length ? 8 : 4;
      this.fmBell(f(set.steps[i % set.steps.length], oct), 0.13 - i * 0.012, 1.0 + (n - i) * 0.1, charge + 0.12 + i * 0.075, set.bell, 2.5, 0.7);
    }
    this.glitter(f(set.steps[2], 8), 5 + rank * 2, 0.05, charge + 0.2, 0.05, 2);

    // The mark of the element.
    const at = (ms: number, fn: () => void): void => void setTimeout(fn, ms);
    switch (element) {
      case 'ember':
        for (let i = 0; i < 6; i++) at(charge * 1000 + 60 + i * (50 + Math.random() * 60), () => this.blip(2200 + Math.random() * 3000, 1.6, 0.03 + Math.random() * 0.03, 0.3, 'bandpass'));
        this.blip(600, 0.5, 0.6, 0.22, 'lowpass', 3);
        break;
      case 'tide':
        for (let i = 0; i < 4; i++) this.swell(520 + i * 170, 'sine', 0.07, 0.01, 0.16, charge + 0.06 + i * 0.07, 1300 + i * 220, 0.5);
        this.blip(3500, 0.6, 0.7, 0.14, 'highpass', 0.4);
        break;
      case 'storm':
        this.blip(6500, 0.6, 0.22, 0.36, 'highpass', 0.4);
        this.swell(1400, 'sawtooth', 0.07, 0.005, 0.28, charge, 150, 0.3, 4000);
        at(charge * 1000 + 180, () => this.blip(90, 1, 0.5, 0.45, 'lowpass', 0.6));
        break;
      case 'verdant':
        for (let i = 0; i < 5; i++) this.swell(f(set.steps[i % 5], 8), 'sine', 0.05, 0.01, 0.7, charge + 0.1 + i * 0.09, 0, 0.7);
        this.blip(5200, 0.5, 0.8, 0.07, 'highpass', 0.7);
        break;
      case 'shadow':
        this.swell(set.root / 2, 'sine', 0.2, 0.3, 1.4, charge - 0.2, set.root / 3, 0.6, 400);
        this.fmBell(f(-12, 2), 0.2, 2.2, charge, 1.41, 5, 0.6);
        break;
      case 'radiant':
        this.fmBell(f(12, 4), 0.1, 1.6, charge + 0.05, 3.5, 3, 0.8);
        this.fmBell(f(19, 4), 0.07, 1.4, charge + 0.12, 3.5, 2.5, 0.8);
        this.blip(9500, 0.7, 0.4, 0.1, 'highpass');
        break;
      default:
        this.blip(900, 1.5, 0.6, 0.18, 'bandpass', 6);
        this.swell(f(0, 8), 'sine', 0.05, 0.02, 1.2, charge, f(12, 8), 0.9);
    }
  }

  /**
   * An inscription that failed: the same charge as the real one, then it goes wrong. The swell is a tone and a half step above it
   * (a sour pair), the strike is a dry crack of noise and a flat clunk instead of a bell, two cracked bells fall a tritone apart and
   * the air hisses out, with a low thud under it.
   */
  private fizzle(): void {
    const root = 247;
    this.swell(root, 'triangle', 0.14, 0.26, 0.5, 0, root * 1.9, 0.4, 1600);
    this.swell(root * 1.059, 'sawtooth', 0.04, 0.26, 0.5, 0, root * 2.0, 0.3, 1200);
    this.blip(1500, 1.2, 0.3, 0.1, 'bandpass', 5);
    const t = 0.34;
    setTimeout(() => this.blip(5200, 0.8, 0.12, 0.42, 'highpass', 0.4), t * 1000);
    setTimeout(() => this.blip(900, 1.4, 0.2, 0.3, 'bandpass', 0.3), t * 1000 + 20);
    this.swell(root / 2, 'sine', 0.3, 0.01, 0.4, t, root / 5, 0.15);
    this.fmBell(698, 0.14, 0.55, t + 0.02, 1.41, 7, 0.4);
    this.fmBell(494, 0.11, 0.6, t + 0.12, 1.41, 6, 0.4);
    setTimeout(() => this.blip(3500, 0.6, 0.7, 0.14, 'highpass', 0.25), t * 1000 + 60);
  }

  /** A glyph taken off: the notes fall, the air goes out of the rune and a dull bell settles. */
  private unbind(): void {
    this.swell(660, 'triangle', 0.14, 0.02, 0.7, 0, 130, 0.4, 2400);
    this.blip(4000, 0.8, 0.6, 0.16, 'bandpass', 0.15);
    [1319, 988, 740, 587].forEach((hz, i) => this.fmBell(hz, 0.11 - i * 0.015, 0.7, 0.04 + i * 0.09, 2.76, 2.5, 0.6));
    this.fmBell(220, 0.14, 1.0, 0.4, 1.41, 3, 0.4);
    this.swell(110, 'sine', 0.18, 0.01, 0.45, 0.42, 55, 0.1);
  }

  /** A short reverb tail (a decaying noise impulse) that the jewel sounds are sent through, so they ring in a space. */
  private reverb: ConvolverNode | null = null;
  private tail(): ConvolverNode | null {
    if (!this.ctx || !this.master) return null;
    if (!this.reverb) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * 1.4);
      const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = impulse.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      const conv = ctx.createConvolver();
      conv.buffer = impulse;
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      conv.connect(wet).connect(this.master);
      this.reverb = conv;
    }
    return this.reverb;
  }

  /**
   * A struck metal bell made by frequency modulation: a bright, glassy BING at the strike (the modulator is loud and fades
   * quickly) that settles into a pure ringing tone. It goes to the speakers and, a little, through the reverb.
   */
  private fmBell(freq: number, gain: number, decay: number, delay = 0, ratio = 3.5, index = 5, wet = 0.4): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    out.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    out.connect(this.master);
    const tail = this.tail();
    if (tail && wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      out.connect(send).connect(tail);
    }
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, t);
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * ratio, t);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(freq * index, t);
    depth.gain.exponentialRampToValueAtTime(freq * 0.05, t + Math.min(0.5, decay * 0.35));
    mod.connect(depth).connect(carrier.frequency);
    carrier.connect(out);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
  }

  /** A cascade of tiny high pings climbing from `from` (Hz) by `step` semitones each: the glitter that follows the bell. */
  private glitter(from: number, count: number, gap: number, delay: number, gain: number, step = 3): void {
    for (let i = 0; i < count; i++) {
      const f = from * Math.pow(2, (i * step + (Math.random() - 0.5) * 1.2) / 12);
      // They thin out and fade as they climb.
      this.fmBell(Math.min(f, 9000), gain * (1 - (i / count) * 0.6), 0.22 + (count - i) * 0.025, delay + i * gap, 2.76, 1.5, 0.7);
    }
  }

  /**
   * A jewel used on a piece of equipment, in the spirit of the old MMOs. When it takes: a bright metallic BING with a
   * sparkle that rushes up after it and rings out in the reverb. The Jewel of Dawn is the clean one, the Rift is deeper and
   * colder with a low bell under it, Bloom is higher with a longer shower of sparkles. When it fails the jewel shatters
   * like glass (the Rift's with a low crack under it, as it can cost a level).
   */
  jewel(ok: boolean, kind: 'dawn' | 'rift' | 'bloom' = 'dawn'): void {
    if (ok) {
      if (kind === 'dawn') {
        this.fmBell(1568, 0.3, 1.5);
        this.fmBell(2349, 0.1, 1.0, 0.012, 3.5, 3);
        this.blip(9000, 0.7, 0.06, 0.12, 'highpass');
        this.glitter(2637, 7, 0.045, 0.1, 0.07);
      } else if (kind === 'rift') {
        this.fmBell(1175, 0.28, 1.8, 0, 3.5, 5.5);
        this.fmBell(587, 0.16, 2.1, 0.01, 1.41, 3, 0.5);
        this.fmBell(1760, 0.09, 1.2, 0.07, 3.5, 3);
        this.blip(7000, 0.7, 0.5, 0.05, 'highpass', 0.5);
        this.glitter(2093, 6, 0.06, 0.12, 0.06, 2);
      } else {
        this.fmBell(2093, 0.26, 1.2);
        this.fmBell(3136, 0.14, 1.0, 0.07, 3.5, 3);
        this.blip(9500, 0.7, 0.06, 0.1, 'highpass');
        this.glitter(3136, 10, 0.04, 0.1, 0.06, 2);
      }
      return;
    }
    // Shatter: a bright burst of noise, a few falling glass chips, a cracked-metal ring and a dull thud.
    this.blip(7000, 0.7, 0.18, 0.5, 'highpass', 0.5);
    this.blip(3200, 1.2, 0.3, 0.3, 'bandpass', 0.6);
    this.fmBell(880, 0.14, 0.45, 0, 1.41, 6, 0.3);
    for (let i = 0; i < 5; i++) setTimeout(() => this.blip(2400 + Math.random() * 3800, 2, 0.04, 0.22, 'bandpass'), 70 + i * (45 + Math.random() * 40));
    this.blip(kind === 'rift' ? 120 : 190, 1.1, 0.3, 0.6, 'lowpass');
  }
  /**
   * A jewel falling out of a monster: a gem hitting the ground and bouncing (three quick glassy ticks that grow closer and
   * softer) and then a glint, a small rising chime that is the kind of the jewel (gold, violet or rose). Unmistakable among
   * the other drops, and short enough not to get in the way of the fight.
   */
  jewelDrop(kind: 'dawn' | 'rift' | 'bloom', volume = 1): void {
    const v = Math.max(0.15, Math.min(1, volume));
    const glint = { dawn: [1976, 2637], rift: [1480, 1976], bloom: [2349, 3136] }[kind];
    [0, 0.13, 0.22].forEach((d, i) => this.fmBell(3400 - i * 250, (0.17 - i * 0.04) * v, 0.12 + (2 - i) * 0.03, d, 5.07, 2.5, 0.35));
    this.blip(8500, 0.8, 0.04, 0.1 * v, 'highpass');
    this.fmBell(glint[0], 0.2 * v, 0.9, 0.3, 3.5, 3.5, 0.6);
    this.fmBell(glint[1], 0.16 * v, 1.1, 0.4, 3.5, 3, 0.6);
    this.glitter(glint[1], 4, 0.05, 0.42, 0.05 * v, 2);
  }

  /**
   * The forge at work (about 2.3 seconds, as long as the animation): hammer blows on metal that come faster and faster, each
   * a ring and a dull thud, with a thin tone rising under them. It stops just before the outcome is heard.
   */
  forge(craft = false): void {
    if (!this.ctx || !this.master) return;
    if (craft) return this.craft();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const hits = [0, 0.38, 0.7, 0.98, 1.22, 1.42, 1.6, 1.76, 1.9, 2.02, 2.13];
    hits.forEach((d, i) => {
      const k = i / (hits.length - 1);
      this.fmBell(760 + k * 520 + (i % 2) * 90, 0.1 + k * 0.1, 0.35 - k * 0.15, d, 2.76, 4, 0.3);
      setTimeout(() => this.blip(170 + k * 60, 1.1, 0.12, 0.35 + k * 0.2, 'lowpass'), d * 1000);
    });
    // The rising tone: a soft sawtooth sweeping up through a closing filter, swelling to the end.
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 2.25);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(5000, t + 2.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.07, t + 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.32);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 2.4);
  }

  /** A recipe being crafted (a little under a second): three quick taps of a tool on the bench, each a bit higher. */
  private craft(): void {
    [0, 0.25, 0.5].forEach((d, i) => {
      this.fmBell(620 + i * 140, 0.08 + i * 0.02, 0.18, d, 2.76, 3, 0.2);
      setTimeout(() => this.blip(260 + i * 40, 1.2, 0.09, 0.4, 'lowpass'), d * 1000);
    });
    this.blip(2400, 0.8, 0.6, 0.05, 'highpass', 2);
  }

  /**
   * A Codex of Aurelion opening. Pages turn, a warm gold chord rises, and the piece of gear arrives on a bright bell
   * with a short shower of sparks. Longer and lower than a jewel, so the two never sound like each other.
   */
  codex(): void {
    this.blip(1400, 0.45, 0.09, 0.16, 'bandpass');
    setTimeout(() => this.blip(700, 0.5, 0.16, 0.14, 'lowpass'), 50);
    this.fmBell(349, 0.1, 1.6, 0.06, 1.5, 2, 0.5);
    [523, 659, 784, 1047].forEach((hz, i) => this.fmBell(hz, 0.15 - i * 0.02, 1.55, 0.14 + i * 0.08, 2, 2.2, 0.62));
    this.fmBell(1568, 0.16, 1.9, 0.5, 3.5, 3, 0.72);
    this.glitter(2093, 6, 0.042, 0.56, 0.055, 2);
  }

  /** What was crafted is ready: a soft, bright ding with a few sparkles after it. */
  crafted(): void {
    this.fmBell(1319, 0.18, 0.9, 0, 3.5, 3.5, 0.5);
    this.fmBell(1976, 0.09, 0.7, 0.05, 3.5, 2.5, 0.5);
    this.glitter(2637, 4, 0.05, 0.08, 0.04, 3);
  }

  /** Experience orb pickup: a quick, bright, randomly pitched ping. */
  xp(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // A kill sends a dozen orbs in at once: one plink per orb would be a buzz, so they share a few.
    if (t - this.lastXp < 0.05) return;
    this.lastXp = t;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    const f = 700 + Math.random() * 500;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.16);
  }

  /** Coins: two bright metallic pings. */
  coin(): void {
    this.blip(2100, 0.6, 0.08, 0.35, 'bandpass');
    setTimeout(() => this.blip(2800, 0.6, 0.12, 0.35, 'bandpass'), 60);
  }

  /** A rising arpeggio when a level is gained. */
  /** Quest sounds: a quest taken up, a step moving, a quest ready to hand in, a quest handed in (the longest, like a fanfare). */
  quest(what: 'accept' | 'step' | 'ready' | 'done'): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const master = this.master;
    const notes = { accept: [392, 523.25], step: [659.25], ready: [523.25, 659.25, 783.99], done: [392, 523.25, 659.25, 783.99, 1046.5] }[what];
    const gain = what === 'step' ? 0.05 : 0.07;
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * (what === 'done' ? 0.11 : 0.1);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (what === 'done' && i === notes.length - 1 ? 0.7 : 0.26));
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.8);
    });
  }

  levelUp(volume = 1): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const master = this.master;
    // The rising fanfare...
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.09;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07 * volume, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.25);
    });
    // ...and under it, swelling with the column of light, a bright chord that rings on and a shimmer of high bells.
    const start = ctx.currentTime + 0.05;
    [261.63, 392, 523.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i < 2 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime((0.05 - i * 0.006) * volume, start + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 2.2);
      o.connect(g).connect(master);
      o.start(start);
      o.stop(start + 2.3);
    });
    for (let i = 0; i < 7; i++) {
      const t = start + 0.3 + i * 0.13 + Math.random() * 0.05;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1568 + Math.random() * 1500, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.028 * volume, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  /** A pitched voice sweeping f0 -> f1, optionally through a low-pass filter. */
  private voice(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, lowpass = 0, wobble = 0): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (lowpass > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      o.connect(f);
      node = f;
    }
    if (wobble > 0) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = wobble;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    node.connect(g).connect(this.dest());
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Procedural creature sounds. `volume` is 0..1 (already distance-attenuated). */
  mob(kind: MobKind, action: MobSound, volume = 1, pan = 0): void {
    this.pan = pan;
    try {
      this.mobNow(kind, action, volume);
    } finally {
      this.pan = 0;
    }
  }

  private mobNow(kind: MobKind, action: MobSound, volume: number): void {
    if (!this.ctx || volume <= 0.02) return;
    const v = volume;
    const r = 0.9 + Math.random() * 0.2;
    // The monsters of the Hollow Deep have voices of their own (audioDeep.ts).
    if (isDeepVoice(kind) && deepMobSound(kind, action, v, r, { voice: (...a) => this.voice(...a), blip: (...a) => this.blip(...a) })) return;
    if (action === 'teleport') {
      this.voice('sine', 1500 * r, 260, 0.22, 0.25 * v, 0, 40);
      this.voice('triangle', 300 * r, 900, 0.18, 0.12 * v);
      return;
    }
    if (action === 'hiss') {
      this.blip(5200, 0.6, 1.4, 0.35 * v, 'highpass', 0.6);
      return;
    }
    if (action === 'shoot') {
      // The string snapping: a hard pluck falling in pitch with a thump under it, the whip of the limbs, and the air of the arrow leaving.
      this.voice('triangle', 300 * r, 120, 0.1, 0.34 * v);
      this.voice('sine', 95 * r, 60, 0.16, 0.3 * v);
      this.blip(1800, 0.8, 0.07, 0.28 * v, 'bandpass', 1.5);
      this.blip(4200, 0.6, 0.18, 0.12 * v, 'highpass', 0.5);
      return;
    }
    if (action === 'yes') {
      this.voice('sawtooth', 200 * r, 300, 0.16, 0.2 * v, 1200, 12);
      setTimeout(() => this.voice('sawtooth', 260 * r, 340, 0.2, 0.2 * v, 1200, 12), 140);
      return;
    }
    if (action === 'no') {
      this.voice('sawtooth', 240 * r, 160, 0.2, 0.22 * v, 1000, 10);
      setTimeout(() => this.voice('sawtooth', 190 * r, 120, 0.28, 0.22 * v, 1000, 10), 170);
      return;
    }
    switch (kind) {
      case 'dummy':
      case 'armor_stand':
        // A dull thud of wood and straw.
        this.voice('triangle', 150 * r, 70, 0.14, 0.34 * v, 500);
        this.blip(1100, 0.8, 0.06, 0.22 * v, 'bandpass');
        break;
      case 'villager':
      case 'npc':
        if (action === 'say') this.voice('sawtooth', 210 * r, 250, 0.32, 0.2 * v, 1100, 14);
        else if (action === 'hurt') this.voice('sawtooth', 330 * r, 180, 0.22, 0.26 * v, 1300, 10);
        else this.voice('sawtooth', 230 * r, 90, 0.55, 0.28 * v, 900, 10);
        break;
      case 'pig':
        if (action === 'say') this.voice('sawtooth', 240 * r, 150, 0.28, 0.2 * v, 900, 25);
        else if (action === 'hurt') this.voice('sawtooth', 520 * r, 260, 0.2, 0.28 * v, 1400);
        else this.voice('sawtooth', 300 * r, 80, 0.5, 0.3 * v, 800);
        break;
      case 'cow':
        if (action === 'say') this.voice('sawtooth', 120 * r, 85, 0.7, 0.26 * v, 500, 6);
        else if (action === 'hurt') this.voice('sawtooth', 200 * r, 110, 0.3, 0.3 * v, 600);
        else this.voice('sawtooth', 160 * r, 55, 0.6, 0.3 * v, 500);
        break;
      case 'sheep':
        if (action === 'say') this.voice('sawtooth', 340 * r, 260, 0.55, 0.2 * v, 900, 28);
        else if (action === 'hurt') this.voice('sawtooth', 420 * r, 300, 0.25, 0.26 * v, 1000, 20);
        else this.voice('sawtooth', 300 * r, 120, 0.5, 0.28 * v, 800, 10);
        break;
      case 'chicken':
        if (action === 'say') {
          this.voice('square', 640 * r, 820, 0.07, 0.12 * v, 2200);
          setTimeout(() => this.voice('square', 700 * r, 560, 0.09, 0.1 * v, 2200), 90);
        } else if (action === 'hurt') this.voice('square', 900 * r, 600, 0.12, 0.16 * v, 2400);
        else this.voice('square', 700 * r, 200, 0.3, 0.16 * v, 1800);
        break;
      case 'rabbit':
        if (action !== 'say') this.voice('triangle', 1200 * r, 700, action === 'hurt' ? 0.14 : 0.3, 0.2 * v, 3000);
        break;
      case 'squid':
        if (action !== 'say') this.voice('sine', 220 * r, 520, action === 'hurt' ? 0.18 : 0.4, 0.22 * v, 900, 30);
        break;
      case 'bat':
        if (action === 'say') this.voice('triangle', 1900 * r, 2700, 0.07, 0.1 * v);
        else this.voice('triangle', 2400 * r, 1200, 0.16, 0.16 * v);
        break;
      case 'spider':
      case 'cave_spider':
        if (action === 'say') this.blip(3200, 1.2, 0.18, 0.3 * v, 'bandpass');
        else if (action === 'hurt') this.voice('sawtooth', 700 * r, 400, 0.14, 0.2 * v, 2200);
        else this.voice('sawtooth', 600 * r, 120, 0.4, 0.22 * v, 1800);
        break;
      case 'slime':
        if (action === 'say') this.voice('sine', 200 * r, 120, 0.12, 0.18 * v, 700);
        else this.voice('sine', 330 * r, 90, 0.28, 0.24 * v, 700, 25);
        break;
      case 'enderman':
        if (action === 'say') this.voice('sawtooth', 160 * r, 420, 0.5, 0.2 * v, 900, 14);
        else if (action === 'hurt') this.voice('sawtooth', 820 * r, 300, 0.3, 0.26 * v, 2000, 35);
        else this.voice('sawtooth', 600 * r, 70, 0.9, 0.28 * v, 1600, 30);
        break;
      case 'drowned':
        if (action === 'say') this.voice('sawtooth', 100 * r, 75, 0.8, 0.2 * v, 300, 14);
        else if (action === 'hurt') this.voice('sawtooth', 140 * r, 85, 0.25, 0.26 * v, 350);
        else this.voice('sawtooth', 100 * r, 40, 0.7, 0.28 * v, 300);
        break;
      case 'husk':
      case 'zombie':
        if (action === 'say') this.voice('sawtooth', 95 * r, 70, 0.9, 0.22 * v, 420, 9);
        else if (action === 'hurt') this.voice('sawtooth', 150 * r, 90, 0.25, 0.3 * v, 500);
        else this.voice('sawtooth', 110 * r, 40, 0.7, 0.32 * v, 400);
        break;
      case 'hollow_king':
        // Only the grunt is his here: his voice and his death come with the fight itself (the `bossFx` events).
        if (action === 'hurt') this.bossGrunt(v, this.pan);
        break;
      case 'stray':
      case 'skeleton':
        for (let i = 0; i < (action === 'say' ? 2 : 4); i++) {
          setTimeout(() => this.blip(2800 + Math.random() * 1200, 2.5, 0.05, 0.4 * v, 'bandpass'), i * 70);
        }
        break;
      case 'creeper':
        if (action === 'hurt') this.voice('square', 420 * r, 210, 0.16, 0.18 * v, 1500);
        else if (action === 'death') this.voice('square', 300 * r, 70, 0.4, 0.2 * v, 1000);
        break;
    }
  }

  /** Big low boom for explosions. */
  explode(volume = 1): void {
    if (!this.ctx || !this.master || !this.noise) return;
    this.blip(900, 0.5, 1.1, 0.9 * volume, 'lowpass', 0.1);
    this.voice('sine', 90, 28, 0.8, 0.8 * volume);
  }

  /** A class ability (see abilitySounds.ts). `volume` is 0..1, already attenuated by distance; `seconds` sets how long a long one lasts. */
  ability(kind: AbilitySound, volume = 1, seconds = 1, pan = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    this.pan = pan;
    try {
      playAbilitySound({ ctx: this.ctx, out: this.dest(), noise: this.noise }, kind, volume, seconds);
    } finally {
      this.pan = 0;
    }
  }

  /** Where effects go: the bus, through a panner if this one comes from a side. */
  private dest(): AudioNode {
    const bus: AudioNode = this.sfx ?? this.master!;
    if (!this.ctx || this.pan === 0) return bus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, this.pan));
    p.connect(bus);
    return p;
  }

  /**
   * How much of a cave is around the listener (0 in the open, 1 deep in rock): the effects get an echo that grows with it, early
   * reflections off the walls and then a long dark tail, so a pick on stone or a footstep rings in the dark.
   */
  setCave(amount: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.master) return;
    if (!this.caveSend) {
      if (amount < 0.02) return;
      const len = Math.floor(ctx.sampleRate * 2.6);
      const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = impulse.getChannelData(c);
        let low = 0;
        for (let i = 0; i < len; i++) {
          // A tail that darkens as it dies (the high end is soaked up by the rock first).
          const k = i / len;
          low += ((Math.random() * 2 - 1) - low) * (0.55 - 0.45 * k);
          d[i] = low * Math.pow(1 - k, 2.4) * 1.6;
        }
        // The first reflections, a little different on each side.
        for (const [at, g] of [[0.045, 0.7], [0.11, 0.55], [0.19, 0.4], [0.31, 0.3]] as const) {
          const i = Math.floor((at + (c ? 0.013 : 0)) * ctx.sampleRate);
          d[i] += g;
          d[i + 1] += g * 0.5;
        }
      }
      const conv = ctx.createConvolver();
      conv.buffer = impulse;
      const send = ctx.createGain();
      send.gain.value = 0;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      this.sfx.connect(send).connect(conv).connect(wet).connect(this.master);
      this.caveSend = send;
    }
    this.caveSend.gain.setTargetAtTime(Math.max(0, Math.min(1, amount)) * 0.9, ctx.currentTime, 0.6);
  }

  /** Taking damage. */
  hurt(): void {
    this.blip(500, 0.8, 0.22, 0.6, 'lowpass', 0.4);
  }

  /** 0..1 music loudness (0 = off). */
  get musicVolume(): number {
    return this.ambience?.musicVolume ?? this.pendingMusic;
  }

  set musicVolume(v: number) {
    this.pendingMusic = v;
    if (this.ambience) this.ambience.musicVolume = v;
  }

  private pendingMusic = 0.5;

  /**
   * The ears under the water. `on` is the eyes in water (not lava). `swim` is 0..1 how fast the body is moving, `depth` is
   * blocks below the surface. The whole mix goes dull, a low current takes over, and bubbles tick past — closer together while swimming.
   */
  setUnderwater(on: boolean, dt: number, swim = 0, depth = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.waterFilter) return;
    const t = ctx.currentTime;
    const sunk = Math.max(0, Math.min(1, depth / 20));
    this.waterFilter.frequency.setTargetAtTime(on ? 980 - 620 * sunk : 20000, t, on ? 0.1 : 0.18);
    if (on && !this.waterGain && this.noise && this.ambBus) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = 0.28;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.ambBus);
      src.start();
      this.waterGain = gain;
    }
    this.waterGain?.gain.setTargetAtTime(on ? 0.04 + 0.028 * sunk : 0, t, 0.3);
    if (on && !this.submerged) this.blip(160, 0.5, 0.5, 0.28, 'lowpass', 0.3);
    if (!on && this.submerged) this.splash(0.22);
    this.submerged = on;
    if (!on) {
      this.bubbleIn = 0.5;
      return;
    }
    this.bubbleIn -= dt;
    if (this.bubbleIn > 0) return;
    this.bubble(sunk > 0.45);
    this.bubbleIn = swim > 0.25 ? 0.16 + Math.random() * 0.28 : 0.85 + Math.random() * 1.7;
  }

  /** One dull pop, the kind you hear with your head under the water. */
  private bubble(deep: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.ambBus) return;
    const t = ctx.currentTime;
    const dur = 0.07 + Math.random() * 0.09;
    const out = ctx.createGain();
    const peak = deep ? 0.1 : 0.18;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.ambBus);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.5 + Math.random();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3.5;
    const freq = (deep ? 240 : 420) + Math.random() * 280;
    f.frequency.value = freq;
    src.connect(f).connect(out);
    src.start(t, Math.random(), dur + 0.02);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(peak * 0.7, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Music, birds and cave drones. Call every frame. */
  ambient(dt: number, env: AmbientEnv): void {
    if (!this.ambience) return;
    this.ambience.musicVolume = this.pendingMusic;
    this.ambience.update(dt, env);
  }

  /**
   * Rain bed: filtered noise that fades with the intensity. shelter (0..1) muffles it when the
   * player is under a roof or underground.
   */
  setRain(amount: number, shelter: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    if (!this.rainGain) {
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.55 + (Math.random() * 2 - 1) * 0.45; // a touch of low-pass: less hiss, more patter
        d[i] = last * 1.6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 350;
      this.rainFilter = ctx.createBiquadFilter();
      this.rainFilter.type = 'lowpass';
      this.rainFilter.frequency.value = 7000;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      src.connect(hp).connect(this.rainFilter).connect(this.rainGain).connect(this.ambBus ?? this.master);
      src.start();
    }
    const t = ctx.currentTime;
    // A soft bed under the other sounds (it was 0.32, which was too loud).
    this.rainGain.gain.setTargetAtTime(0.065 * amount * (1 - 0.6 * shelter), t, 0.4);
    this.rainFilter!.frequency.setTargetAtTime(6000 - 5200 * shelter, t, 0.4);
  }

  /**
   * The sound under a place: `name` is one of `BED_SOUNDS` (null or an unknown name fades it out), `level` 0..1 scales it
   * and `shelter` (0..1) muffles it under a roof. Cheap: one noise source, one filter and one slow oscillator for the swell,
   * re-tuned smoothly whenever the place changes.
   */
  setBed(name: string | null, level: number, shelter: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    if (!this.bed) {
      if (!name) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.1;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0;
      lfo.connect(lfoDepth).connect(gain.gain);
      src.connect(filter).connect(gain).connect(this.ambBus ?? this.master);
      src.start();
      lfo.start();
      this.bed = { filter, gain, lfo, lfoDepth };
    }
    const spec = name ? BED_SOUNDS[name] : undefined;
    const t = ctx.currentTime;
    const b = this.bed;
    if (!spec) {
      b.gain.gain.setTargetAtTime(0, t, 0.8);
      b.lfoDepth.gain.setTargetAtTime(0, t, 0.8);
      return;
    }
    const g = spec.gain * Math.max(0, Math.min(1, level)) * (1 - 0.6 * shelter);
    b.filter.type = spec.type;
    b.filter.frequency.setTargetAtTime(spec.freq * (1 - 0.6 * shelter), t, 0.8);
    b.filter.Q.setTargetAtTime(spec.q, t, 0.8);
    b.gain.gain.setTargetAtTime(g, t, 1.2);
    b.lfo.frequency.setTargetAtTime(spec.rate, t, 1.2);
    b.lfoDepth.gain.setTargetAtTime(g * spec.depth, t, 1.2);
  }

  /** Thunder: distance 0 (overhead) .. 1 (far). Far strikes arrive later and softer. */
  thunder(distance: number): void {
    if (!this.ctx) return;
    setTimeout(() => {
      const v = 1 - distance * 0.6;
      this.blip(520, 0.5, 3.2, 0.9 * v, 'lowpass', 0.12);
      this.voice('sine', 70, 26, 2.4, 0.7 * v);
      setTimeout(() => this.blip(380, 0.5, 2.2, 0.5 * v, 'lowpass', 0.15), 450 + Math.random() * 500);
    }, distance * 2200);
  }

  // ---- the Hollow Deep ------------------------------------------------------------------------------------

  /** The noise and tools of the dark sounds, made once the sound has started. */
  private darkSink(): DarkSink | null {
    if (!this.ctx || !this.noise) return null;
    this.dark ??= makeSink(this.ctx, this.noise);
    return this.dark;
  }

  /** The bed and the random sounds of the dungeon (see dungeonAmbience.ts). Call a few times a second; it fades out and frees itself when the player is not in one. */
  dungeonAmbient(dt: number, env: DungeonEnv): void {
    this.dungeon?.update(dt, env, !this.levels.muted && this.levels.ambience > 0.01 && this.levels.master > 0.01);
  }

  /** What the boss sounds are made of, or null when sound is off (not started, muted, or the effects turned down). */
  private bossPlay(): BossPlay | null {
    const sink = this.darkSink();
    if (!sink || !this.sfx || this.levels.muted || this.levels.effects < 0.01 || this.levels.master < 0.01) return null;
    return { sink, pool: this.bossPool, bus: this.sfx, wet: this.tail() };
  }

  /**
   * A sound of the boss fight (a `bossFx` event): `dist` blocks from the listener (it gets quieter and duller with it, but the big ones are
   * heard everywhere in the copy), `pan` the ear it comes from.
   */
  bossFx(e: BossFx, dist: number, pan: number): void {
    const p = this.bossPlay();
    if (!p || !this.ctx) return;
    if (e.what === 'wake' || e.what === 'phase' || e.what === 'down') this.lastRoar = this.ctx.currentTime;
    playBoss(e, p, bossLoudness(e.what, dist), pan);
  }

  /** The king spoke (a yell): a deep torn voice, a syllable for about every two words. Held back a moment if a roar has just begun. */
  bossYell(text: string): void {
    const p = this.bossPlay();
    if (!p || !this.ctx) return;
    const words = text.trim().split(/\s+/).length;
    playYell(p, Math.ceil(words / 2), this.ctx.currentTime - this.lastRoar < 0.6 ? 1.3 : 0);
  }

  /** A grunt of the king's, at most one in a second and a half. */
  bossGrunt(volume: number, pan: number): void {
    const p = this.bossPlay();
    if (!p || !this.ctx || this.ctx.currentTime - this.lastGrunt < 1.5) return;
    this.lastGrunt = this.ctx.currentTime;
    playGrunt(p, { vol: volume, far: Math.min(0.7, (1 - volume) * 0.7) }, pan);
  }

  /** For the debug hooks: one dark ambient sound, or one boss sound, by name, now. */
  debugDark(kind: 'ambient' | 'boss', name: string, opts: { depth?: number; pan?: number; dist?: number } = {}): boolean {
    this.resume();
    if (kind === 'ambient') return this.dungeon?.debugPlay(name as AmbientName, opts) ?? false;
    const p = this.bossPlay();
    if (!p) return false;
    playBossNamed(name as BossSoundName, p, opts.pan ?? 0, opts.dist ?? 0);
    return true;
  }

  /** For the debug hooks: how many sounds and sources the dark layers have going, and have made. */
  darkStats(): { dungeon: ReturnType<DungeonAmbience['stats']> | null; boss: ReturnType<VoicePool['stats']> } {
    return { dungeon: this.dungeon?.stats() ?? null, boss: this.bossPool.stats() };
  }

  dispose(): void {
    this.dungeon?.dispose();
    this.dungeon = null;
    this.dark = null;
    this.bossPool.fadeAll(0.05);
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.ambience = null;
    this.rainGain = null;
    this.rainFilter = null;
  }
}
