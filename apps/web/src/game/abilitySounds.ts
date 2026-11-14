/**
 * Procedural sounds for class abilities (no audio files, like the rest of the game's sound): each ability is a short
 * recipe of filtered noise and a few oscillators. `GameAudio.ability` runs them, the game decides when (a cast, or the
 * mark an ability leaves in the world, so the players near it hear it too) and how loud (the distance).
 *
 * Mage is done here. The others (warrior, ranger) add their recipes to `RECIPES`.
 */

export type AbilitySound =
  | 'fireball_cast'
  | 'fireball_burst'
  | 'frost_nova'
  | 'meteor_fall'
  | 'meteor_hit'
  | 'arcane_shield'
  | 'arcane_break'
  | 'learn'
  | 'wand_cast'
  | 'staff_cast'
  | 'spellbook_cast'
  | 'arcane_hit'
  | 'staff_hit'
  | 'slam_leap'
  | 'ground_slam'
  | 'shield_bash'
  | 'charge'
  | 'iron_defense'
  | 'iron_end'
  | 'shield_block'
  | 'shield_break'
  | 'shield_parry'
  | 'ember_tick'
  | 'ember_depart'
  | 'ember_arrive'
  | 'ember_fizzle'
  | 'mount_tick'
  | 'mount_on'
  | 'mount_off'
  | 'mount_fizzle'
  | 'mount_bite'
  | 'mount_howl'
  | 'mount_gather'
  | 'mount_strike'
  | 'mount_step'
  | 'mount_learn'
  | 'bow_draw'
  | 'bow_full'
  | 'arrow_hit'
  | 'arrow_head'
  | 'arrow_thunk'
  | 'dagger_swish'
  | 'dagger_hit'
  | 'dagger_finish';

/** Everything a recipe needs: the audio context, where to send the sound, and a second of white noise. */
export interface SynthTarget {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

interface NoiseOpts {
  filter: BiquadFilterType;
  f0: number;
  /** The filter ends here (a sweep); leave out for a steady filter. */
  f1?: number;
  q?: number;
  gain: number;
  /** Seconds to reach full volume (a long one is a swell, a short one a hit). */
  attack?: number;
}

interface ToneOpts {
  type: OscillatorType;
  f0: number;
  f1?: number;
  gain: number;
  attack?: number;
  /** A low-pass over the tone, to take the edge off a saw or a square. */
  lowpass?: number;
}

/** Small builder over the audio graph. `at` is a delay in seconds from now, `dur` the length; `v` scales every gain. */
class Synth {
  constructor(
    private readonly s: SynthTarget,
    private readonly v: number,
  ) {}

  private envelope(at: number, dur: number, peak: number, attack: number): GainNode {
    const g = this.s.ctx.createGain();
    const t = this.s.ctx.currentTime + at;
    const p = Math.max(0.0002, peak * this.v);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + Math.min(Math.max(0.003, attack), dur * 0.95));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.s.out);
    return g;
  }

  noise(at: number, dur: number, o: NoiseOpts): void {
    const { ctx, noise } = this.s;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true; // the buffer is one second long; a long sound (a falling meteor) keeps going round it
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    src.connect(f).connect(this.envelope(at, dur, o.gain, o.attack ?? 0.01));
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  tone(at: number, dur: number, o: ToneOpts): void {
    const { ctx } = this.s;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    const env = this.envelope(at, dur, o.gain, o.attack ?? 0.01);
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      osc.connect(f).connect(env);
    } else osc.connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** A few random pops between `from` and `to` seconds: embers, debris, cracking ice. */
  crackle(from: number, to: number, count: number, f0: number, f1: number, gain: number, filter: BiquadFilterType = 'bandpass'): void {
    for (let i = 0; i < count; i++) {
      const f = f0 + Math.random() * (f1 - f0);
      this.noise(from + Math.random() * (to - from), 0.025 + Math.random() * 0.04, { filter, f0: f, q: 1.4, gain: gain * (0.5 + Math.random() * 0.5) });
    }
  }
}

type Recipe = (s: Synth, seconds: number) => void;

const RECIPES: Record<AbilitySound, Recipe> = {
  // A rush of air rising as the ball leaves the hand, a low roar of flame under it, a few sparks.
  fireball_cast: (s) => {
    s.noise(0, 0.42, { filter: 'bandpass', f0: 400, f1: 2400, q: 1.1, gain: 0.34, attack: 0.07 });
    s.noise(0, 0.38, { filter: 'lowpass', f0: 700, f1: 220, gain: 0.4, attack: 0.04 });
    s.tone(0, 0.28, { type: 'triangle', f0: 220, f1: 700, gain: 0.07, attack: 0.05 });
    s.crackle(0.04, 0.32, 4, 3000, 6500, 0.22, 'highpass');
  },

  // A thump you feel, the crack of the blast, a roar dying down, and embers popping afterwards.
  fireball_burst: (s) => {
    s.tone(0, 0.6, { type: 'sine', f0: 150, f1: 38, gain: 0.7, attack: 0.005 });
    s.noise(0, 0.85, { filter: 'lowpass', f0: 3200, f1: 180, gain: 0.6, attack: 0.004 });
    s.noise(0, 0.22, { filter: 'bandpass', f0: 1600, q: 0.6, gain: 0.32, attack: 0.003 });
    s.crackle(0.12, 0.75, 6, 1800, 5200, 0.24);
  },

  // A cold hiss sweeping down, a soft low whump, and ice bells ringing above it as the frost cracks over the ground.
  frost_nova: (s) => {
    s.noise(0, 0.55, { filter: 'highpass', f0: 5200, f1: 1500, q: 0.7, gain: 0.3, attack: 0.02 });
    s.tone(0, 0.45, { type: 'sine', f0: 120, f1: 55, gain: 0.38, attack: 0.01 });
    [2637, 3136, 3951, 3322, 4699].forEach((f, i) => s.tone(0.04 + i * 0.055, 0.55, { type: 'sine', f0: f, f1: f * 0.995, gain: 0.1, attack: 0.004 }));
    s.noise(0.05, 0.7, { filter: 'bandpass', f0: 7200, q: 8, gain: 0.1, attack: 0.05 });
    s.crackle(0.22, 0.75, 5, 3500, 7500, 0.2, 'highpass');
  },

  // The meteor coming down: a whistle falling in pitch and a rumble that swells until the moment it lands.
  meteor_fall: (s, seconds) => {
    const d = Math.max(0.35, seconds);
    s.tone(0, d, { type: 'sawtooth', f0: 1000, f1: 130, gain: 0.1, attack: d * 0.92, lowpass: 1400 });
    s.noise(0, d, { filter: 'bandpass', f0: 3200, f1: 320, q: 1.4, gain: 0.3, attack: d * 0.92 });
    s.noise(0, d, { filter: 'lowpass', f0: 240, f1: 420, gain: 0.4, attack: d * 0.92 });
  },

  // The impact: a deep boom, a wall of noise, the crack, and rock and fire falling around it.
  meteor_hit: (s) => {
    s.tone(0, 1.1, { type: 'sine', f0: 95, f1: 24, gain: 0.95, attack: 0.005 });
    s.noise(0, 1.5, { filter: 'lowpass', f0: 2600, f1: 110, gain: 0.8, attack: 0.004 });
    s.noise(0, 0.3, { filter: 'bandpass', f0: 900, q: 0.5, gain: 0.42, attack: 0.003 });
    s.crackle(0.1, 1.1, 9, 400, 2800, 0.26);
  },

  // A protective hum and a bright chord rising together.
  arcane_shield: (s) => {
    [392, 523.25, 783.99].forEach((f, i) => s.tone(i * 0.07, 0.75, { type: 'sine', f0: f, f1: f * 1.03, gain: 0.12, attack: 0.05 }));
    s.tone(0, 0.65, { type: 'sine', f0: 110, f1: 170, gain: 0.2, attack: 0.08 });
    s.noise(0.05, 0.55, { filter: 'bandpass', f0: 6000, f1: 9000, q: 5, gain: 0.12, attack: 0.1 });
  },

  // The shield soaked up what it could take: glass breaking, and the hum falling away.
  arcane_break: (s) => {
    s.noise(0, 0.35, { filter: 'highpass', f0: 4200, f1: 2600, q: 0.8, gain: 0.45, attack: 0.003 });
    s.tone(0, 0.32, { type: 'sine', f0: 1800, f1: 300, gain: 0.2, attack: 0.004 });
    s.tone(0, 0.3, { type: 'triangle', f0: 392, f1: 130, gain: 0.14, attack: 0.01 });
    s.crackle(0.05, 0.4, 6, 4500, 9000, 0.22, 'highpass');
  },

  // Learning an ability from its book: the rustle of a page turning, then a bright rising chime (C major, up the
  // octave) that settles into a warm held chord with a sparkle over it, and a soft swell underneath.
  learn: (s) => {
    s.noise(0, 0.16, { filter: 'bandpass', f0: 1800, f1: 5200, q: 0.8, gain: 0.16, attack: 0.05 });
    s.noise(0.09, 0.12, { filter: 'highpass', f0: 3500, q: 0.6, gain: 0.1, attack: 0.03 });
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      const at = 0.2 + i * 0.085;
      s.tone(at, 0.9, { type: 'sine', f0: f, f1: f * 1.002, gain: 0.17, attack: 0.006 });
      s.tone(at, 0.45, { type: 'triangle', f0: f * 2, gain: 0.05, attack: 0.004 }); // the bell's upper ring
    });
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => s.tone(0.62, 1.1, { type: 'sine', f0: f, gain: 0.09, attack: 0.08 })); // the chord that stays
    s.tone(0.15, 1.3, { type: 'sine', f0: 130.8, f1: 196, gain: 0.16, attack: 0.35 });
    s.noise(0.5, 0.9, { filter: 'bandpass', f0: 7000, f1: 10000, q: 6, gain: 0.08, attack: 0.15 });
    s.crackle(0.5, 1.2, 6, 5000, 9500, 0.12, 'highpass');
  },

  // The wand: a quick bright zap that falls away, with a rising twinkle of two bell notes and a flicker of sparks.
  // It is short and light, because a wand is cast over and over.
  wand_cast: (s) => {
    s.tone(0, 0.16, { type: 'sine', f0: 2600, f1: 900, gain: 0.2, attack: 0.004 });
    s.tone(0, 0.12, { type: 'triangle', f0: 1300, f1: 450, gain: 0.08, attack: 0.004 });
    s.noise(0, 0.1, { filter: 'highpass', f0: 4500, f1: 7500, q: 0.7, gain: 0.16, attack: 0.004 });
    s.noise(0.02, 0.28, { filter: 'bandpass', f0: 3000, f1: 6500, q: 3, gain: 0.1, attack: 0.04 });
    [2093, 2637].forEach((f, i) => s.tone(0.05 + i * 0.07, 0.3, { type: 'sine', f0: f, f1: f * 1.004, gain: 0.09, attack: 0.004 }));
    s.crackle(0.06, 0.25, 3, 5000, 9000, 0.1, 'highpass');
  },

  // The staff: slower and deeper: a swelling whoosh, a round low note lifting, and one bright ring at the end.
  staff_cast: (s) => {
    s.noise(0, 0.45, { filter: 'bandpass', f0: 500, f1: 2200, q: 1, gain: 0.3, attack: 0.12 });
    s.tone(0, 0.5, { type: 'triangle', f0: 196, f1: 392, gain: 0.16, attack: 0.1 });
    s.tone(0.02, 0.35, { type: 'sine', f0: 600, f1: 220, gain: 0.18, attack: 0.01 });
    s.tone(0.18, 0.4, { type: 'sine', f0: 1175, f1: 1180, gain: 0.1, attack: 0.005 });
    s.crackle(0.1, 0.4, 3, 2500, 6000, 0.14, 'highpass');
  },

  // The spellbook: a page flicking over, a soft hum swelling under a quiet chime, and a shimmer.
  spellbook_cast: (s) => {
    s.noise(0, 0.12, { filter: 'bandpass', f0: 1800, f1: 4800, q: 0.8, gain: 0.14, attack: 0.04 });
    s.tone(0.05, 0.6, { type: 'sine', f0: 146.8, f1: 220, gain: 0.2, attack: 0.18 });
    [587.33, 880].forEach((f, i) => s.tone(0.14 + i * 0.09, 0.5, { type: 'sine', f0: f, gain: 0.1, attack: 0.01 }));
    s.noise(0.1, 0.5, { filter: 'bandpass', f0: 6500, f1: 9000, q: 6, gain: 0.08, attack: 0.1 });
  },

  // A bolt of arcane power bursting: a soft pop and a tink with a few sparks. Light, as wands fire often.
  arcane_hit: (s) => {
    s.noise(0, 0.12, { filter: 'highpass', f0: 3200, f1: 1800, q: 0.7, gain: 0.22, attack: 0.003 });
    s.tone(0, 0.14, { type: 'sine', f0: 1700, f1: 520, gain: 0.16, attack: 0.003 });
    [3136, 4186].forEach((f, i) => s.tone(0.03 + i * 0.05, 0.25, { type: 'sine', f0: f, gain: 0.07, attack: 0.003 }));
    s.crackle(0.04, 0.22, 3, 4500, 9000, 0.1, 'highpass');
  },

  // A staff's bolt bursting: a low thump, a rush of air and two bright rings on top, longer than a wand's pop and as heavy as the staff.
  staff_hit: (s) => {
    s.tone(0, 0.3, { type: 'sine', f0: 230, f1: 70, gain: 0.4, attack: 0.004 });
    s.noise(0, 0.22, { filter: 'lowpass', f0: 2400, f1: 300, gain: 0.25, attack: 0.003 });
    s.noise(0, 0.14, { filter: 'highpass', f0: 3200, f1: 1800, q: 0.7, gain: 0.14, attack: 0.003 });
    [1568, 2349].forEach((f, i) => s.tone(0.04 + i * 0.07, 0.45, { type: 'sine', f0: f, gain: 0.08, attack: 0.003 }));
    s.crackle(0.05, 0.3, 4, 3000, 8000, 0.1, 'highpass');
  },

  // ---- Warrior: weight and steel ----

  // Ground Slam, the jump: a hard kick off the ground, air rushing up past the armour, a rattle of plate.
  slam_leap: (s) => {
    s.tone(0, 0.14, { type: 'sine', f0: 140, f1: 55, gain: 0.55, attack: 0.004 });
    s.noise(0, 0.14, { filter: 'lowpass', f0: 1500, f1: 300, gain: 0.35, attack: 0.004 });
    s.noise(0.04, 0.5, { filter: 'bandpass', f0: 300, f1: 1500, q: 0.9, gain: 0.3, attack: 0.15 });
    s.tone(0.04, 0.4, { type: 'triangle', f0: 110, f1: 260, gain: 0.1, attack: 0.1 });
    s.crackle(0.02, 0.3, 3, 1800, 3600, 0.16);
  },

  // Ground Slam, the landing: a crushing boom, the ground splitting, stone thrown out and the plate ringing.
  ground_slam: (s) => {
    s.tone(0, 0.8, { type: 'sine', f0: 85, f1: 26, gain: 0.95, attack: 0.004 });
    s.noise(0, 1.0, { filter: 'lowpass', f0: 2000, f1: 90, gain: 0.8, attack: 0.003 });
    s.noise(0, 0.22, { filter: 'bandpass', f0: 750, q: 0.6, gain: 0.45, attack: 0.003 });
    s.noise(0.05, 0.45, { filter: 'bandpass', f0: 2600, f1: 900, q: 1.2, gain: 0.2, attack: 0.004 }); // the crack running outwards
    s.tone(0.02, 0.6, { type: 'triangle', f0: 1250, f1: 1230, gain: 0.07, attack: 0.003 }); // the armour ringing
    s.crackle(0.1, 0.9, 8, 300, 2200, 0.28);
  },

  // Shield Bash: a whoosh, then a wooden thud with a ring of metal on it.
  shield_bash: (s) => {
    s.noise(0, 0.12, { filter: 'bandpass', f0: 500, f1: 1600, q: 0.9, gain: 0.22, attack: 0.05 });
    s.tone(0.08, 0.2, { type: 'sine', f0: 210, f1: 80, gain: 0.8, attack: 0.003 });
    s.noise(0.08, 0.14, { filter: 'bandpass', f0: 420, q: 1.3, gain: 0.55, attack: 0.003 });
    [1250, 1890, 2650].forEach((f, i) => s.tone(0.08, 0.7 - i * 0.15, { type: 'sine', f0: f, gain: 0.14 - i * 0.03, attack: 0.002 }));
    s.noise(0.08, 0.3, { filter: 'bandpass', f0: 2100, q: 6, gain: 0.3, attack: 0.003 });
  },

  // Charge: a swelling rush of air, the heavy footfalls of a body at a run for as long as it lasts, and a skid at the end.
  charge: (s, seconds) => {
    const d = Math.max(0.3, seconds);
    s.noise(0, d, { filter: 'bandpass', f0: 300, f1: 1900, q: 0.9, gain: 0.3, attack: d * 0.7 });
    s.noise(0, d, { filter: 'lowpass', f0: 300, f1: 500, gain: 0.25, attack: d * 0.5 });
    const step = 0.105;
    for (let t = 0.03, i = 0; t < d; t += step, i++) {
      s.tone(t, 0.12, { type: 'sine', f0: 100 - (i % 2) * 12, f1: 48, gain: 0.4, attack: 0.003 });
      s.noise(t, 0.07, { filter: 'lowpass', f0: 900, f1: 250, gain: 0.3, attack: 0.003 });
      s.noise(t + 0.02, 0.06, { filter: 'bandpass', f0: 2200 + (i % 3) * 500, q: 4, gain: 0.06, attack: 0.004 }); // plate rattling
    }
    s.noise(d, 0.22, { filter: 'bandpass', f0: 2400, f1: 700, q: 0.8, gain: 0.25, attack: 0.01 }); // the skid
  },

  // Iron Defense: steel plates sliding into place with a bright shing, a solid clang, and a deep thump of weight.
  iron_defense: (s) => {
    s.noise(0, 0.3, { filter: 'highpass', f0: 3000, f1: 7500, q: 0.8, gain: 0.26, attack: 0.04 });
    [820, 1230, 1930, 2790].forEach((f, i) => s.tone(0.12 + i * 0.02, 0.9 - i * 0.15, { type: 'sine', f0: f, gain: 0.15 - i * 0.025, attack: 0.002 }));
    s.noise(0.12, 0.3, { filter: 'bandpass', f0: 1900, q: 6, gain: 0.3, attack: 0.003 });
    s.tone(0.12, 0.45, { type: 'sine', f0: 105, f1: 52, gain: 0.7, attack: 0.004 });
    s.tone(0.1, 0.8, { type: 'triangle', f0: 98, f1: 110, gain: 0.1, attack: 0.25 });
  },

  // Iron Defense ending: the plates fall away with a clatter and a last dull clang.
  iron_end: (s) => {
    s.crackle(0, 0.5, 9, 1500, 4200, 0.3);
    s.noise(0.05, 0.35, { filter: 'bandpass', f0: 1400, f1: 800, q: 2, gain: 0.22, attack: 0.004 });
    s.tone(0.18, 0.4, { type: 'sine', f0: 640, f1: 600, gain: 0.12, attack: 0.002 });
    s.tone(0.05, 0.25, { type: 'sine', f0: 120, f1: 60, gain: 0.35, attack: 0.004 });
  },

  // ---- The shield ----

  // A block: the hit lands on wood and iron, a dull heavy thud with a short ring on it.
  shield_block: (s) => {
    s.tone(0, 0.2, { type: 'sine', f0: 190, f1: 70, gain: 0.85, attack: 0.003 });
    s.noise(0, 0.16, { filter: 'bandpass', f0: 460, q: 1.2, gain: 0.55, attack: 0.003 });
    s.noise(0, 0.07, { filter: 'highpass', f0: 2500, gain: 0.2, attack: 0.002 });
    [1180, 1760].forEach((f, i) => s.tone(0.005, 0.3 - i * 0.08, { type: 'sine', f0: f, gain: 0.1 - i * 0.03, attack: 0.002 }));
    s.noise(0.005, 0.22, { filter: 'bandpass', f0: 2100, q: 6, gain: 0.22, attack: 0.003 });
  },

  // A shield that gives way: the block, then wood splitting, iron bending and the pieces falling.
  shield_break: (s) => {
    RECIPES.shield_block(s, 1);
    s.noise(0.08, 0.45, { filter: 'lowpass', f0: 1200, f1: 200, gain: 0.55, attack: 0.004 });
    s.tone(0.09, 0.4, { type: 'sawtooth', f0: 330, f1: 90, gain: 0.12, attack: 0.005, lowpass: 900 });
    s.crackle(0.1, 0.5, 7, 500, 2600, 0.3);
    s.tone(0.28, 0.3, { type: 'sine', f0: 700, f1: 640, gain: 0.1, attack: 0.002 });
  },

  // A parry: a sharp, bright strike of steel, a clean ringing ping that rings on, and sparks flying. It sounds like skill.
  shield_parry: (s) => {
    s.noise(0, 0.05, { filter: 'highpass', f0: 3500, gain: 0.5, attack: 0.001 });
    s.tone(0, 0.09, { type: 'sine', f0: 240, f1: 110, gain: 0.55, attack: 0.002 });
    [1568, 2349, 3136, 4699].forEach((f, i) => s.tone(0, 0.95 - i * 0.18, { type: 'sine', f0: f, f1: f * 0.998, gain: 0.2 - i * 0.04, attack: 0.001 }));
    s.noise(0, 0.5, { filter: 'bandpass', f0: 3800, f1: 3000, q: 9, gain: 0.2, attack: 0.002 });
    s.noise(0.02, 0.2, { filter: 'bandpass', f0: 1800, f1: 5200, q: 1.5, gain: 0.18, attack: 0.01 }); // the scrape of the blade sliding off
    s.crackle(0.03, 0.35, 6, 5000, 10000, 0.2, 'highpass');
  },

  // One beat of the Emberstone's casting, every half second: a bell of the pentatonic scale, each higher than the last
  // (seconds carries how far the cast has got, 0 to 1, for this sound), over a warm hum that swells and a shimmer of air.
  ember_tick: (s, progress) => {
    const p = Math.min(1, Math.max(0, progress));
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
    const f = scale[Math.min(scale.length - 1, Math.floor(p * scale.length))];
    s.tone(0, 0.8, { type: 'sine', f0: f, f1: f * 0.998, gain: 0.11, attack: 0.004 });
    s.tone(0, 0.45, { type: 'sine', f0: f * 2, gain: 0.04, attack: 0.003 });
    s.tone(0, 0.6, { type: 'triangle', f0: 110 + p * 70, f1: 120 + p * 80, gain: 0.07 + p * 0.05, attack: 0.1, lowpass: 600 });
    s.noise(0, 0.5, { filter: 'bandpass', f0: 2500 + p * 4000, q: 3, gain: 0.03 + p * 0.07, attack: 0.15 });
  },

  // The moment it takes hold: a bright upward rush with a chord ringing out of it, and sparks.
  ember_depart: (s) => {
    s.noise(0, 0.55, { filter: 'bandpass', f0: 500, f1: 7000, q: 1.2, gain: 0.34, attack: 0.1 });
    s.tone(0, 0.45, { type: 'sine', f0: 280, f1: 2100, gain: 0.16, attack: 0.15 });
    [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => s.tone(0.22 + i * 0.04, 1.1 - i * 0.12, { type: 'sine', f0: f, f1: f * 0.997, gain: 0.12 - i * 0.015, attack: 0.004 }));
    s.tone(0.2, 0.7, { type: 'sine', f0: 130, f1: 65, gain: 0.3, attack: 0.01 });
    s.crackle(0.25, 0.9, 7, 4500, 9500, 0.16, 'highpass');
  },

  // Coming home: a soft landing out of the air, a warm low note and a resolving chime, with embers drifting down.
  ember_arrive: (s) => {
    s.noise(0, 0.5, { filter: 'bandpass', f0: 6500, f1: 500, q: 1, gain: 0.26, attack: 0.04 });
    s.tone(0, 0.4, { type: 'sine', f0: 1900, f1: 330, gain: 0.12, attack: 0.02 });
    s.tone(0.12, 0.65, { type: 'sine', f0: 170, f1: 70, gain: 0.45, attack: 0.008 });
    [784, 1046.5, 1318.51].forEach((f, i) => s.tone(0.18 + i * 0.09, 1.0 - i * 0.1, { type: 'sine', f0: f, f1: f * 0.998, gain: 0.12, attack: 0.004 }));
    [262, 330].forEach((f) => s.tone(0.2, 0.9, { type: 'triangle', f0: f, gain: 0.08, attack: 0.05, lowpass: 900 }));
    s.crackle(0.3, 0.9, 5, 3500, 8000, 0.14, 'highpass');
  },

  // A cast that was lost: the bells fall flat, with a rasp of air going out.
  ember_fizzle: (s) => {
    s.tone(0, 0.4, { type: 'sawtooth', f0: 520, f1: 90, gain: 0.1, attack: 0.01, lowpass: 900 });
    s.tone(0, 0.3, { type: 'sine', f0: 880, f1: 200, gain: 0.1, attack: 0.005 });
    s.noise(0, 0.35, { filter: 'lowpass', f0: 1800, f1: 200, gain: 0.3, attack: 0.01 });
    s.crackle(0.03, 0.3, 4, 600, 2200, 0.14);
  },

  // One beat of a mount being summoned, every half second: a low drum that quickens, a violet bell and a hush of wind (progress is 0 to 1).
  mount_tick: (s, progress) => {
    const p = Math.min(1, Math.max(0, progress));
    const scale = [392, 440, 523.25, 587.33, 659.25, 783.99];
    const f = scale[Math.min(scale.length - 1, Math.floor(p * scale.length))];
    s.tone(0, 0.18, { type: 'sine', f0: 96 + p * 30, f1: 52, gain: 0.34, attack: 0.004 });
    s.tone(0, 0.7, { type: 'sine', f0: f, f1: f * 0.997, gain: 0.09, attack: 0.004 });
    s.tone(0, 0.5, { type: 'triangle', f0: f * 1.5, gain: 0.03, attack: 0.01 });
    s.noise(0, 0.5, { filter: 'bandpass', f0: 900 + p * 1800, q: 2.2, gain: 0.04 + p * 0.06, attack: 0.15 });
  },

  // It arrives: a gust, a thump of paws and a long howl that rises and falls away, with a ring of bells behind it.
  mount_on: (s) => {
    s.noise(0, 0.5, { filter: 'bandpass', f0: 400, f1: 5200, q: 1.1, gain: 0.3, attack: 0.08 });
    s.tone(0.12, 0.2, { type: 'sine', f0: 150, f1: 48, gain: 0.5, attack: 0.004 });
    s.tone(0.2, 0.55, { type: 'sawtooth', f0: 250, f1: 610, gain: 0.1, attack: 0.12, lowpass: 1500 });
    s.tone(0.2, 0.55, { type: 'sine', f0: 250, f1: 610, gain: 0.12, attack: 0.12 });
    s.tone(0.75, 0.85, { type: 'sawtooth', f0: 610, f1: 330, gain: 0.09, attack: 0.02, lowpass: 1300 });
    s.tone(0.75, 0.85, { type: 'sine', f0: 610, f1: 330, gain: 0.1, attack: 0.02 });
    [784, 1046.5, 1318.51].forEach((f, i) => s.tone(0.16 + i * 0.07, 0.9 - i * 0.1, { type: 'sine', f0: f, f1: f * 0.998, gain: 0.09, attack: 0.004 }));
    s.crackle(0.2, 0.8, 5, 4000, 9000, 0.12, 'highpass');
  },

  // Getting off: the thud of a heavy animal settling and a puff of dust.
  mount_off: (s) => {
    s.tone(0, 0.22, { type: 'sine', f0: 130, f1: 50, gain: 0.4, attack: 0.004 });
    s.noise(0, 0.3, { filter: 'lowpass', f0: 1400, f1: 250, gain: 0.26, attack: 0.01 });
    s.tone(0.04, 0.35, { type: 'sawtooth', f0: 300, f1: 190, gain: 0.05, attack: 0.03, lowpass: 900 });
  },

  // The summoning was lost: the bells go flat.
  mount_fizzle: (s) => {
    s.tone(0, 0.35, { type: 'sawtooth', f0: 400, f1: 80, gain: 0.09, attack: 0.01, lowpass: 800 });
    s.tone(0, 0.3, { type: 'sine', f0: 660, f1: 160, gain: 0.09, attack: 0.005 });
    s.noise(0, 0.3, { filter: 'lowpass', f0: 1500, f1: 200, gain: 0.25, attack: 0.01 });
  },

  // The bite: a short snarl, the clack of the jaws shutting, a heavy thud of the lunge and the snap of lightning on the teeth.
  mount_bite: (s) => {
    s.tone(0, 0.3, { type: 'sawtooth', f0: 200, f1: 90, gain: 0.17, attack: 0.02, lowpass: 650 });
    s.noise(0, 0.22, { filter: 'bandpass', f0: 500, f1: 260, q: 1.4, gain: 0.2, attack: 0.03 });
    s.noise(0.09, 0.07, { filter: 'bandpass', f0: 2400, f1: 1300, q: 2.8, gain: 0.4, attack: 0.002 });
    s.tone(0.09, 0.22, { type: 'sine', f0: 150, f1: 48, gain: 0.46, attack: 0.003 });
    s.noise(0.1, 0.18, { filter: 'highpass', f0: 7000, f1: 2500, gain: 0.3, attack: 0.002 });
    s.crackle(0.1, 0.35, 5, 3500, 9000, 0.16, 'highpass');
  },

  // The howl: a long wolf's call that climbs, holds and falls away (two voices a hair apart, so it wavers), breath under it and thunder rolling in.
  mount_howl: (s) => {
    s.tone(0, 0.6, { type: 'sawtooth', f0: 190, f1: 470, gain: 0.13, attack: 0.16, lowpass: 1000 });
    s.tone(0, 0.6, { type: 'sine', f0: 193, f1: 478, gain: 0.12, attack: 0.16 });
    s.tone(0.55, 0.7, { type: 'sawtooth', f0: 470, f1: 500, gain: 0.13, attack: 0.02, lowpass: 1100 });
    s.tone(0.55, 0.7, { type: 'sine', f0: 478, f1: 492, gain: 0.12, attack: 0.02 });
    s.tone(1.2, 0.9, { type: 'sawtooth', f0: 500, f1: 230, gain: 0.12, attack: 0.02, lowpass: 900 });
    s.tone(1.2, 0.9, { type: 'sine', f0: 492, f1: 236, gain: 0.1, attack: 0.02 });
    s.noise(0, 1.9, { filter: 'bandpass', f0: 900, f1: 600, q: 0.9, gain: 0.08, attack: 0.3 });
    s.noise(0.2, 1.8, { filter: 'lowpass', f0: 160, f1: 70, gain: 0.3, attack: 0.5 });
    s.crackle(0.5, 1.6, 6, 3000, 8000, 0.12, 'highpass');
  },

  // The ground where the storm will strike: a charge building, a hum that rises and a spit of static.
  mount_gather: (s, seconds) => {
    const d = Math.max(0.4, Math.min(2.2, seconds));
    s.tone(0, d, { type: 'sawtooth', f0: 70, f1: 210, gain: 0.1, attack: d * 0.6, lowpass: 500 });
    s.tone(0, d, { type: 'sine', f0: 900, f1: 2600, gain: 0.04, attack: d * 0.7 });
    s.noise(0, d, { filter: 'highpass', f0: 3000, f1: 7000, gain: 0.1, attack: d * 0.7 });
    s.crackle(0.05, d, Math.round(4 + d * 5), 3500, 9000, 0.1, 'highpass');
  },

  // A strike: the crack, a boom you feel in the chest and the thunder rolling away.
  mount_strike: (s) => {
    s.noise(0, 0.14, { filter: 'highpass', f0: 7500, f1: 900, gain: 0.55, attack: 0.001 });
    s.tone(0, 0.7, { type: 'sine', f0: 110, f1: 32, gain: 0.7, attack: 0.004 });
    s.noise(0.02, 1.1, { filter: 'lowpass', f0: 1100, f1: 110, gain: 0.45, attack: 0.02 });
    s.tone(0.05, 0.5, { type: 'square', f0: 260, f1: 60, gain: 0.07, attack: 0.005, lowpass: 900 });
    s.crackle(0.03, 0.6, 6, 2500, 8000, 0.2, 'highpass');
  },

  // A paw coming down: the thud of it and a little rattle of armour.
  mount_step: (s) => {
    s.tone(0, 0.14, { type: 'sine', f0: 120, f1: 46, gain: 0.55, attack: 0.003 });
    s.noise(0, 0.12, { filter: 'lowpass', f0: 1000, f1: 220, gain: 0.3, attack: 0.004 });
    s.noise(0.01, 0.06, { filter: 'bandpass', f0: 3800, q: 2, gain: 0.06, attack: 0.003 });
  },

  // Learning a mount from its horn: two long horn calls, the second a fifth higher, and a shimmer.
  mount_learn: (s) => {
    s.tone(0, 0.55, { type: 'sawtooth', f0: 196, f1: 198, gain: 0.14, attack: 0.05, lowpass: 900 });
    s.tone(0.5, 0.9, { type: 'sawtooth', f0: 294, f1: 296, gain: 0.15, attack: 0.04, lowpass: 1100 });
    s.tone(0.5, 0.9, { type: 'sine', f0: 588, gain: 0.05, attack: 0.04 });
    [1046.5, 1568, 2093].forEach((f, i) => s.tone(0.6 + i * 0.1, 1.0 - i * 0.15, { type: 'sine', f0: f, f1: f * 0.998, gain: 0.08, attack: 0.004 }));
    s.crackle(0.6, 1.3, 6, 5000, 10000, 0.1, 'highpass');
  },

  // Drawing a bow: the wood and the string creaking under the strain, a low groan rising as it comes back. `seconds` is how long the draw takes.
  bow_draw: (s, seconds) => {
    const d = Math.max(0.3, Math.min(1.4, seconds));
    s.tone(0, d, { type: 'sawtooth', f0: 70, f1: 150, gain: 0.07, attack: d * 0.6, lowpass: 380 });
    s.noise(0, d, { filter: 'bandpass', f0: 380, f1: 1500, q: 3, gain: 0.07, attack: d * 0.55 });
    s.crackle(0.02, d, 4, 220, 900, 0.08);
  },

  // Full draw: a small tight tick of the string settling.
  bow_full: (s) => {
    s.tone(0, 0.07, { type: 'triangle', f0: 1900, f1: 1500, gain: 0.12, attack: 0.002 });
    s.noise(0, 0.04, { filter: 'highpass', f0: 4200, q: 0.7, gain: 0.1, attack: 0.002 });
  },

  // An arrow into flesh: a dull thwack with a low thump under it.
  arrow_hit: (s) => {
    s.tone(0, 0.16, { type: 'sine', f0: 230, f1: 70, gain: 0.5, attack: 0.003 });
    s.noise(0, 0.09, { filter: 'bandpass', f0: 1300, q: 0.8, gain: 0.3, attack: 0.002 });
    s.noise(0.01, 0.05, { filter: 'highpass', f0: 3800, q: 0.7, gain: 0.07, attack: 0.002 });
  },

  // A headshot: the same, with a bright ring over it.
  arrow_head: (s) => {
    s.tone(0, 0.2, { type: 'sine', f0: 260, f1: 60, gain: 0.55, attack: 0.003 });
    s.noise(0, 0.1, { filter: 'bandpass', f0: 1500, q: 0.8, gain: 0.34, attack: 0.002 });
    [1568, 2349].forEach((f, i) => s.tone(0.015 + i * 0.03, 0.3, { type: 'sine', f0: f, f1: f * 0.997, gain: 0.11, attack: 0.003 }));
  },

  // An arrow into wood, earth or stone: a short knock and the shaft humming for a moment.
  arrow_thunk: (s) => {
    s.tone(0, 0.12, { type: 'sine', f0: 180, f1: 75, gain: 0.4, attack: 0.002 });
    s.noise(0, 0.06, { filter: 'lowpass', f0: 1100, f1: 400, gain: 0.26, attack: 0.002 });
    s.tone(0.01, 0.22, { type: 'triangle', f0: 760, f1: 700, gain: 0.05, attack: 0.002 });
  },

  // A dagger through the air: a thin quick hiss.
  dagger_swish: (s) => {
    s.noise(0, 0.12, { filter: 'bandpass', f0: 2600, f1: 6800, q: 1.2, gain: 0.15, attack: 0.03 });
  },

  // A dagger landing: a short metallic shink and a small thump.
  dagger_hit: (s) => {
    s.noise(0, 0.12, { filter: 'highpass', f0: 3600, f1: 5200, q: 0.8, gain: 0.22, attack: 0.002 });
    s.tone(0, 0.1, { type: 'sine', f0: 2500, f1: 1900, gain: 0.08, attack: 0.002 });
    s.tone(0, 0.1, { type: 'sine', f0: 150, f1: 70, gain: 0.32, attack: 0.002 });
  },

  // The last stab of three: a heavier thud, the shink with a ring, and a few sparks.
  dagger_finish: (s) => {
    s.tone(0, 0.26, { type: 'sine', f0: 110, f1: 40, gain: 0.55, attack: 0.003 });
    s.noise(0, 0.2, { filter: 'highpass', f0: 3200, f1: 5600, q: 0.8, gain: 0.26, attack: 0.002 });
    [1318, 1976].forEach((f, i) => s.tone(0.01 + i * 0.025, 0.4, { type: 'sine', f0: f, f1: f * 0.996, gain: 0.1, attack: 0.003 }));
    s.crackle(0.03, 0.2, 4, 4500, 9000, 0.14, 'highpass');
  },
};

/** Play one ability sound. `volume` is 0..1 (already attenuated by distance); `seconds` is how long a long sound should last. */
export function playAbilitySound(target: SynthTarget, kind: AbilitySound, volume: number, seconds = 1): void {
  if (volume <= 0.02) return;
  RECIPES[kind](new Synth(target, Math.min(1, volume)), seconds);
}
