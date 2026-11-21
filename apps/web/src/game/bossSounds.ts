/**
 * The Hollow King's voice and body, made of noise and oscillators (see darkSounds.ts): his roar when he wakes and at each phase, his yells,
 * the rising wind-up of each spell and its release (Ember Slam: a gathering rumble, then a boom; Molten Pillars: grinding, cracking rock, then
 * a crash; Rise, My Court: a necrotic choir and whispers, then a burst of the dead; Embers Unbound: an enraged howl and flames, then a blast;
 * Cinder Rain: hissing crackle, then drops that sizzle), his footsteps, his swing and its blow, a grunt when hurt, and his death: a long
 * collapse of rumble and crumbling rock under a falling roar and a rush of fire, and then silence and a relief chime.
 *
 * The server says what happened (`bossFx`, see sessionProtocol.ts) to everybody in the copy; here it is made loud or faint by how far the
 * listener is (`bossLoudness`) and put on the side it came from.
 */
import type { BossFx, BossFxKind, BossSpell } from '@solrift/shared';
import { Voice, VoicePool, clamp01, rnd, type DarkSink } from './darkSounds';
import { VOWELS } from './dungeonSounds';

/** How far (blocks) each kind of sound carries, and the least it is heard at anywhere in the copy (everybody in the fight hears the big ones). */
const RANGE: Record<BossFxKind, number> = { step: 55, swing: 55, cast: 80, release: 90, wake: 110, phase: 110, down: 130 };
const FLOOR: Record<BossFxKind, number> = { step: 0, swing: 0, cast: 0.12, release: 0.15, wake: 0.35, phase: 0.35, down: 0.4 };

/** How loud (0..1) and how muffled (0..1) a boss sound is for a listener `dist` blocks from it. */
export function bossLoudness(what: BossFxKind, dist: number): { vol: number; far: number } {
  const k = clamp01(dist / RANGE[what]);
  return { vol: Math.max(FLOOR[what], Math.pow(1 - k, 1.4)), far: Math.min(0.8, k * 0.9) };
}

export interface BossPlay {
  sink: DarkSink;
  pool: VoicePool;
  /** Where the sound goes (the effects bus), and the reverb that big ones are sent to (or null). */
  bus: AudioNode;
  wet: AudioNode | null;
}

/** How much of each sound goes to the reverb. */
const WET: Record<BossFxKind, number> = { step: 0.12, swing: 0.1, cast: 0.3, release: 0.35, wake: 0.4, phase: 0.4, down: 0.45 };

/** How loud each sound is made, so that the loudest of them (a roar, the fall) just stays under full scale at close range: worked out from enderDark's measures. */
const TRIM: Record<string, number> = {
  wake: 0.5,
  phase: 0.55,
  cast_slam: 1,
  cast_pillars: 1.1,
  cast_court: 1.3,
  cast_rain: 1.2,
  cast_unbound: 1,
  release_slam: 0.65,
  release_pillars: 1,
  release_court: 0.8,
  release_rain: 1.2,
  release_unbound: 0.75,
  step: 1.1,
  swing: 1.1,
  grunt: 1.8,
  yell: 0.9,
  down: 0.38,
};

/** The default length (seconds) of each spell's wind-up, when the server does not say. */
const CAST_SECONDS: Record<BossSpell, number> = { slam: 1.8, pillars: 1.3, court: 2.6, rain: 5.6, unbound: 2.2 };

// ---- the parts ---------------------------------------------------------------------------------------------

/** A boom: the sub drop, the burst of noise, the crack, and the debris that follows. */
function boom(v: Voice, at: number, power = 1): void {
  v.tone(at, 1.3 * power, { type: 'sine', f0: 85, f1: 24, gain: 0.95, attack: 0.006 });
  v.noise(at, 0.9 * power, { type: 'lowpass', f0: 1500, f1: 110, gain: 0.8, attack: 0.004 });
  v.noise(at, 0.07, { type: 'highpass', f0: 2500, gain: 0.35, attack: 0.002 });
  v.rubble(at + 0.05, 1.1 * power, { rate0: 40, rate1: 4, f0: 300, f1: 2400, gain: 0.35, decay: 0.07 });
}

/** Stone dragged and ground: a sweeping band of noise broken into rough little jerks that swells to the end. */
function grind(v: Voice, dur: number, f0: number, f1: number, peak: number): void {
  const t0 = v.s.ctx.currentTime;
  const src = v.noiseSrc(0, dur);
  const bp = v.filter('bandpass', f0, 2);
  bp.frequency.setValueAtTime(f0, t0);
  bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const rough = v.gain(0.5);
  for (let t = 0; t < dur; t += rnd(0.025, 0.07)) rough.gain.setTargetAtTime(rnd(0.15, 1), t0 + t, 0.015);
  const e = v.env(0, dur, peak, dur * 0.88);
  src.connect(bp).connect(rough).connect(e);
}

/** A big roar of a thing that is not a man: two growling voices (one an octave over the other), a sub, breath and falling stone. */
function roar(v: Voice, dur: number, pitch = 1, drive = 6): void {
  v.vocal(0, dur, {
    f0: 74 * pitch,
    fm: 95 * pitch,
    f1: 48 * pitch,
    v0: VOWELS.aw,
    v1: VOWELS.oo,
    gain: 0.8,
    attack: 0.35,
    release: dur * 0.55,
    drive,
    growl: 26,
    sub: 0.7,
    breath: 0.5,
    vib: [4, 3],
  });
  v.vocal(0.05, dur * 0.8, { f0: 148 * pitch, fm: 190 * pitch, f1: 96 * pitch, v0: VOWELS.ah, v1: VOWELS.aw, gain: 0.35, attack: 0.3, release: dur * 0.5, drive: drive - 1, growl: 30, breath: 0.6 });
  v.tone(0, 2.2, { type: 'sine', f0: 55, f1: 26, gain: 0.9, attack: 0.05 });
  v.noise(0, dur, { type: 'lowpass', f0: 1400, f1: 300, gain: 0.5, attack: 0.4, release: dur * 0.5 });
  v.rubble(0.2, Math.max(0.5, dur - 0.5), { rate0: 22, rate1: 3, f0: 250, f1: 2600, gain: 0.3, decay: 0.07 });
}

/** The wind-up of each spell: it rises through the cast and is loudest as it ends, where the release takes over. */
const CASTS: Record<BossSpell, (v: Voice, s: number) => void> = {
  slam(v, s) {
    v.noise(0, s, { type: 'lowpass', f0: 70, f1: 480, gain: 0.7, attack: s * 0.9, deep: true });
    v.tone(0, s, { type: 'sine', f0: 38, f1: 95, gain: 0.5, attack: s * 0.9 });
    v.tone(0, s, { type: 'sawtooth', f0: 55, f1: 120, gain: 0.22, attack: s * 0.9, lowpass: 150, lowpass1: 800 });
    v.rubble(0, s, { rate0: 3, rate1: 28, f0: 900, f1: 4500, gain: 0.25, decay: 0.03 });
  },
  pillars(v, s) {
    grind(v, s, 280, 1300, 0.9);
    v.rubble(0, s, { rate0: 1, rate1: 14, f0: 1500, f1: 5000, gain: 0.55, q: 3, decay: 0.04 });
    v.noise(0, s, { type: 'lowpass', f0: 90, f1: 300, gain: 0.55, attack: s * 0.9, deep: true });
    v.tone(0, s, { type: 'sine', f0: 45, f1: 70, gain: 0.4, attack: s * 0.9 });
  },
  court(v, s) {
    for (const f of [1500, 2600, 3700]) v.noise(0, s, { type: 'bandpass', f0: f, f1: f * 1.4, q: 8, gain: 0.9, attack: s * 0.8 });
    for (const f of [130.8, 155.6, 196, 233.1]) {
      v.vocal(0, s, { f0: f, f1: f * 1.02, v0: VOWELS.oh, v1: VOWELS.ah, gain: 0.14, attack: s * 0.85, vib: [5.5, f * 0.012], breath: 0.3, detune: 1.006 });
    }
    v.tone(0, s, { type: 'sine', f0: 49, f1: 55, gain: 0.5, attack: s * 0.9 });
  },
  unbound(v, s) {
    v.vocal(0, s, { f0: 110, fm: 220, f1: 330, v0: VOWELS.oh, v1: VOWELS.ah, gain: 0.55, attack: s * 0.85, drive: 6, growl: 24, sub: 0.6, breath: 0.4 });
    v.noise(0, s, { type: 'bandpass', f0: 500, f1: 3500, q: 0.8, gain: 0.5, attack: s * 0.9 });
    v.tone(0, s, { type: 'sine', f0: 40, f1: 120, gain: 0.6, attack: s * 0.9 });
    v.rubble(0, s, { rate0: 8, rate1: 40, f0: 1500, f1: 6000, gain: 0.3, decay: 0.03 });
  },
  rain(v, s) {
    v.noise(0, s, { type: 'bandpass', f0: 4500, q: 0.6, gain: 0.28, attack: s * 0.2, release: s * 0.2 });
    v.rubble(0, s, { rate0: 5, rate1: 18, f0: 2000, f1: 7000, gain: 0.3, q: 2, decay: 0.025 });
    v.noise(0, s, { type: 'lowpass', f0: 600, gain: 0.2, attack: s * 0.2, release: s * 0.2 });
    v.tone(0, s, { type: 'sine', f0: 60, f1: 70, gain: 0.25, attack: s * 0.3, release: s * 0.3 });
  },
};

/** What each spell does when it lands. */
const RELEASES: Record<BossSpell, (v: Voice) => void> = {
  slam(v) {
    boom(v, 0, 1);
    v.tone(0, 0.6, { type: 'triangle', f0: 150, f1: 40, gain: 0.4 });
  },
  pillars(v) {
    v.noise(0, 0.55, { type: 'bandpass', f0: 900, f1: 200, q: 1, gain: 0.8, attack: 0.004 });
    v.tone(0, 0.7, { type: 'sine', f0: 70, f1: 32, gain: 0.8, attack: 0.005 });
    v.rubble(0.03, 1.3, { rate0: 50, rate1: 4, f0: 200, f1: 3000, gain: 0.45, decay: 0.08 });
    v.noise(0, 0.06, { type: 'highpass', f0: 3500, gain: 0.4, attack: 0.002 });
  },
  court(v) {
    v.noise(0, 1.2, { type: 'bandpass', f0: 2500, f1: 800, q: 1.2, gain: 0.5, attack: 0.01 });
    v.tone(0, 1.4, { type: 'sine', f0: 70, f1: 30, gain: 0.8, attack: 0.008 });
    v.vocal(0, 1.1, { f0: 233, f1: 116, v0: VOWELS.ah, v1: VOWELS.oo, gain: 0.4, attack: 0.02, drive: 3, breath: 0.5, vib: [6, 5] });
    v.tone(0.05, 1.6, { type: 'sine', f0: 1760, f1: 1320, gain: 0.1, attack: 0.01 });
    v.tone(0.05, 1.6, { type: 'sine', f0: 2217, f1: 1660, gain: 0.07, attack: 0.01 });
  },
  unbound(v) {
    boom(v, 0, 1.4);
    v.noise(0, 1.6, { type: 'bandpass', f0: 300, f1: 3200, q: 0.8, gain: 0.7, attack: 0.15 });
    v.vocal(0.05, 1.8, { f0: 380, fm: 300, f1: 140, v0: VOWELS.aw, v1: VOWELS.oo, gain: 0.6, attack: 0.08, drive: 7, growl: 20, sub: 0.5, breath: 0.5 });
    v.rubble(0, 1.8, { rate0: 30, rate1: 5, f0: 1500, f1: 6000, gain: 0.3, decay: 0.03 });
  },
  rain(v) {
    v.noise(0, 0.22, { type: 'lowpass', f0: 700, f1: 150, gain: 0.7, attack: 0.003 });
    v.tone(0, 0.25, { type: 'sine', f0: 90, f1: 45, gain: 0.55, attack: 0.004 });
    v.rubble(0, 0.4, { rate0: 50, rate1: 10, f0: 2500, f1: 7000, gain: 0.2, decay: 0.025 });
  },
};

/** His death: the collapse, from the first blow to the last stone. Nine seconds; the relief chime is a voice of its own (see `relief`). */
function death(v: Voice): void {
  v.noise(0, 8, { type: 'lowpass', f0: 320, f1: 45, q: 0.7, gain: 0.9, attack: 0.25, deep: true });
  v.tone(0, 7, { type: 'sine', f0: 60, f1: 20, gain: 0.9, attack: 0.1 });
  v.rubble(0.15, 6.5, { rate0: 26, rate1: 2.5, f0: 180, f1: 2600, gain: 0.5, decay: 0.09 });
  [0, 0.9, 2.1, 3.6].forEach((at, i) => {
    v.tone(at, 0.8, { type: 'sine', f0: 75, f1: 28, gain: 0.75 - i * 0.12, attack: 0.006 });
    v.noise(at, 0.6, { type: 'lowpass', f0: 1100, f1: 140, gain: 0.6 - i * 0.1, attack: 0.004 });
  });
  v.vocal(0.1, 5, { f0: 125, fm: 100, f1: 34, v0: VOWELS.aw, v1: VOWELS.oo, gain: 0.8, attack: 0.15, release: 4, drive: 7, growl: 18, sub: 0.6, breath: 0.5, vib: [3, 2] });
  v.noise(1.2, 2.8, { type: 'bandpass', f0: 2500, f1: 280, q: 0.7, gain: 0.55, attack: 0.3 });
  v.rubble(1.2, 3, { rate0: 20, rate1: 3, f0: 1800, f1: 6000, gain: 0.2, decay: 0.03 });
}

/** Relief: a soft, bright rising chord of bells in the quiet after the collapse. */
function relief(v: Voice): void {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    v.tone(i * 0.32, 3.2 - i * 0.2, { type: 'sine', f0: f, gain: 0.22, attack: 0.01 });
    v.tone(i * 0.32, 2, { type: 'sine', f0: f * 2.001, gain: 0.05, attack: 0.01 });
  });
}

function footfall(v: Voice): void {
  v.tone(0, 0.38, { type: 'sine', f0: rnd(62, 78), f1: 32, gain: 0.95, attack: 0.005 });
  v.noise(0, 0.22, { type: 'lowpass', f0: 420, f1: 120, gain: 0.7, attack: 0.004 });
  v.noise(0.01, 0.05, { type: 'bandpass', f0: 1900, q: 1.2, gain: 0.35, attack: 0.002 });
  v.rubble(0.04, 0.28, { rate0: 60, rate1: 10, f0: 400, f1: 2500, gain: 0.2, decay: 0.03 });
}

/** A swing of his arm: the rush of air, and (at 0.3 s, as the blow lands) the thud. */
function swing(v: Voice): void {
  v.noise(0, 0.5, { type: 'bandpass', f0: 250, f1: 1300, q: 0.8, gain: 0.6, attack: 0.22 });
  v.tone(0, 0.45, { type: 'sine', f0: 110, f1: 70, gain: 0.3, attack: 0.2 });
  v.tone(0.3, 0.4, { type: 'sine', f0: 80, f1: 34, gain: 0.8, attack: 0.005 });
  v.noise(0.3, 0.18, { type: 'lowpass', f0: 700, f1: 150, gain: 0.6, attack: 0.004 });
  v.noise(0.3, 0.04, { type: 'bandpass', f0: 2200, q: 1, gain: 0.3, attack: 0.002 });
}

/** A heavy cracking roar for a new phase: the roar, shorter and torn, with stone splitting under it. */
function phaseRoar(v: Voice, phase: number): void {
  roar(v, 2.4, phase >= 3 ? 1.15 : 1, 7);
  for (let i = 0; i < 5; i++) {
    const at = rnd(0, 1.4);
    v.noise(at, 0.09, { type: 'bandpass', f0: rnd(1500, 3500), q: 2, gain: 0.6, attack: 0.002 });
    v.tone(at, 0.3, { type: 'sine', f0: 70, f1: 35, gain: 0.35, attack: 0.004 });
  }
  if (phase >= 3) v.noise(0.2, 2, { type: 'bandpass', f0: 400, f1: 3000, q: 0.8, gain: 0.4, attack: 0.3 });
}

// ---- playing -----------------------------------------------------------------------------------------------------

/** Run a recipe on a new voice (if the pool has room) and let the voice end when its parts do. */
function run(p: BossPlay, what: BossFxKind, loud: { vol: number; far: number }, pan: number, recipe: (v: Voice) => void, o: { key?: string; gain?: number; delay?: number; centre?: boolean; wet?: number } = {}): void {
  const v = Voice.open(p.sink, p.pool, p.bus, {
    vol: loud.vol * (o.gain ?? 1) * (TRIM[o.key ?? what] ?? 1),
    pan: o.centre ? 0 : pan,
    far: o.centre ? 0 : loud.far,
    wet: p.wet,
    wetAmt: o.wet ?? WET[what],
    delay: o.delay,
    urgent: what === 'wake' || what === 'phase' || what === 'down',
  });
  if (!v) return;
  try {
    recipe(v);
  } finally {
    v.seal();
  }
}

/** The sound of a `bossFx` event, `loud` for how far the listener is (see `bossLoudness`), `pan` for which ear. */
export function playBoss(e: Pick<BossFx, 'what' | 'spell' | 'phase' | 'seconds'>, p: BossPlay, loud: { vol: number; far: number }, pan: number): void {
  switch (e.what) {
    case 'wake':
      run(p, 'wake', loud, pan, (v) => roar(v, 3.8), { key: 'wake' });
      break;
    case 'phase':
      run(p, 'phase', loud, pan, (v) => phaseRoar(v, e.phase ?? 2), { key: 'phase' });
      break;
    case 'cast': {
      const spell = e.spell ?? 'slam';
      const s = e.seconds && e.seconds > 0.3 ? e.seconds : CAST_SECONDS[spell];
      run(p, 'cast', loud, pan, (v) => CASTS[spell](v, s), { key: `cast_${spell}`, gain: 0.9 });
      break;
    }
    case 'release':
      run(p, 'release', loud, pan, RELEASES[e.spell ?? 'slam'], { key: `release_${e.spell ?? 'slam'}` });
      break;
    case 'step':
      run(p, 'step', loud, pan, footfall, { key: 'step', gain: 0.85 });
      break;
    case 'swing':
      run(p, 'swing', loud, pan, swing, { key: 'swing', gain: 0.9 });
      break;
    case 'down':
      // What was winding up ends now; the collapse, and nine seconds on the bells.
      p.pool.fadeAll(0.25);
      run(p, 'down', loud, pan, death, { key: 'down' });
      run(p, 'down', loud, pan, relief, { key: 'relief', gain: 0.5, delay: 9.4, centre: true, wet: 0.5 });
      break;
  }
}

/** His yell, deep and torn: a few syllables, as many as the words (`syllables`), and `delay` seconds from now (after a roar). Heard everywhere in the fight. */
export function playYell(p: BossPlay, syllables: number, delay = 0): void {
  const n = Math.max(1, Math.min(4, syllables));
  run(p, 'wake', { vol: 0.8, far: 0 }, 0, (v) => {
    for (let i = 0; i < n; i++) {
      v.vocal(i * 0.36, 0.42, { f0: 110 * (1 - 0.05 * i), fm: 118 * (1 - 0.05 * i), f1: 62, v0: VOWELS.aw, v1: VOWELS.oo, gain: 0.7, attack: 0.06, release: 0.2, drive: 8, growl: 14 + i * 3, sub: 0.7, breath: 0.35, vib: [5, 3] });
    }
    v.tone(0, 0.9, { type: 'sine', f0: 70, f1: 38, gain: 0.6, attack: 0.01 });
  }, { key: 'yell', delay, centre: true, wet: 0.35 });
}

/** A grunt of pain, low and short (the game decides how often). */
export function playGrunt(p: BossPlay, loud: { vol: number; far: number }, pan: number): void {
  run(p, 'swing', loud, pan, (v) => {
    v.vocal(0, 0.45, { f0: 88, f1: 62, v0: VOWELS.uh, v1: VOWELS.oo, gain: 0.6, attack: 0.03, drive: 4, breath: 0.5, sub: 0.5, growl: 22 });
    v.noise(0, 0.2, { type: 'lowpass', f0: 500, gain: 0.3, attack: 0.01 });
  }, { key: 'grunt', gain: 0.9 });
}

/** The recipes by name, for the debug hooks and the tests. */
export const BOSS_SOUND_NAMES = ['wake', 'yell', 'phase2', 'phase3', 'cast_slam', 'cast_pillars', 'cast_court', 'cast_rain', 'cast_unbound', 'release_slam', 'release_pillars', 'release_court', 'release_rain', 'release_unbound', 'step', 'swing', 'grunt', 'down'] as const;
export type BossSoundName = (typeof BOSS_SOUND_NAMES)[number];

/** Play a boss sound by name at full loudness in front of the listener. */
export function playBossNamed(name: BossSoundName, p: BossPlay, pan = 0, dist = 0): void {
  const [kind, arg] = name.split('_') as [string, string | undefined];
  const loud = (what: BossFxKind): { vol: number; far: number } => bossLoudness(what, dist);
  switch (kind) {
    case 'wake':
      return playBoss({ what: 'wake' }, p, loud('wake'), pan);
    case 'yell':
      return playYell(p, 3);
    case 'phase2':
      return playBoss({ what: 'phase', phase: 2 }, p, loud('phase'), pan);
    case 'phase3':
      return playBoss({ what: 'phase', phase: 3 }, p, loud('phase'), pan);
    case 'cast':
      return playBoss({ what: 'cast', spell: arg as BossSpell }, p, loud('cast'), pan);
    case 'release':
      return playBoss({ what: 'release', spell: arg as BossSpell }, p, loud('release'), pan);
    case 'step':
      return playBoss({ what: 'step' }, p, loud('step'), pan);
    case 'swing':
      return playBoss({ what: 'swing' }, p, loud('swing'), pan);
    case 'grunt':
      return playGrunt(p, loud('swing'), pan);
    case 'down':
      return playBoss({ what: 'down' }, p, loud('down'), pan);
  }
}
