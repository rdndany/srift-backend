/**
 * The sound of being in the Hollow Deep: dark, layered and sparse, nothing like the open caves above.
 *
 *  - a bed that never stops: a sub-bass drone that slowly changes its notes (and swells and ebbs), a dark pad that comes in as the player
 *    goes down, a breath of air in the rock, and (near lava) a low rumble;
 *  - a sparse run of sounds at random times, from random directions around the listener: moans, whispers, stone scraping, rocks falling,
 *    chains, a far scream, breathing close behind, and very rarely a low sting;
 *  - slow irregular drops of water in a long reverb (more of them, and wetter, in the lush levels), the glass of amethyst, the pops of lava;
 *  - a heart that fades in when something hostile is near or when health is low.
 *
 * Everything is darker, lower and more frequent the deeper the player is. It all goes through one gain (so that it fades out cleanly when the
 * player leaves, and is taken apart a moment later), the number of sounds at once is bounded by pools, and it sits on the ambience bus, so
 * the player's master, ambience and mute settings rule it.
 */
import { B } from '@solrift/shared';
import { VoicePool, clamp01, darkImpulse, pick, rnd, type DarkSink } from './darkSounds';
import { playAmbient, type AmbientName } from './dungeonSounds';

export interface DungeonEnv {
  /** The player is inside a dungeon copy. */
  active: boolean;
  /** 0 at the camp .. 1 at the boss's floor. */
  depth: number;
  /** Health, 0..1. */
  hp: number;
  /** 0..1: how close hostile monsters are. */
  threat: number;
  /** 0..1: how much lava, water (and vines) and amethyst is around. */
  lava: number;
  water: number;
  amethyst: number;
  /** A boss fight is on: the random sounds are left out, the boss makes the noise. */
  fight: boolean;
}

export const NO_DUNGEON: DungeonEnv = { active: false, depth: 0, hp: 1, threat: 0, lava: 0, water: 0, amethyst: 0, fight: false };

/** How deep the player is in a dungeon whose camp floor is at `floor`: 0 at the camp, 1 at 72 blocks below it (the boss's floor). */
export function dungeonDepth(y: number, floor: number): number {
  return clamp01((floor - y) / 72);
}

/** How near the hostile things are (0..1), given where they are: full inside 5 blocks, nothing beyond 23. */
export function hostileThreat(near: readonly { dist: number }[]): number {
  let best = 0;
  let count = 0;
  for (const m of near) {
    best = Math.max(best, clamp01(1 - (m.dist - 5) / 18));
    if (m.dist < 16) count++;
  }
  return clamp01(best + Math.max(0, count - 1) * 0.06);
}

/** How strong the heart is: the nearness of danger, or health below four tenths. */
export function heartLevel(threat: number, hp: number): number {
  const low = hp < 0.4 ? clamp01((0.4 - hp) / 0.3) : 0;
  return Math.max(threat * 0.9, low);
}

const LAVA = new Set<number>([B.LAVA, B.LAVA_1, B.LAVA_2, B.LAVA_3, B.LAVA_FALL]);
const WET = new Set<number>([B.WATER, B.WATER_1, B.WATER_2, B.WATER_3, B.WATER_4, B.WATER_5, B.WATER_6, B.WATER_7, B.WATER_FALL, B.CAVE_VINES, B.CAVE_VINES_BERRIES, B.MOSS_BLOCK]);
const AMETHYST = new Set<number>([B.AMETHYST_BLOCK, B.BUDDING_AMETHYST, B.AMETHYST_CLUSTER]);

/**
 * What is around (lava within 12 blocks, water and amethyst within 10): a random sample of the blocks nearby, each counting more the closer
 * it is. Cheap enough to do a few times a second; the engine smooths what it says.
 */
export function scanSurroundings(getBlock: (x: number, y: number, z: number) => number, x: number, y: number, z: number, samples = 260): { lava: number; water: number; amethyst: number } {
  let l = 0;
  let w = 0;
  let a = 0;
  for (let i = 0; i < samples; i++) {
    const dx = (Math.random() * 2 - 1) * 12;
    const dy = (Math.random() * 2 - 1) * 12;
    const dz = (Math.random() * 2 - 1) * 12;
    const d = Math.hypot(dx, dy, dz);
    if (d > 12) continue;
    const id = getBlock(Math.floor(x + dx), Math.floor(y + dy), Math.floor(z + dz));
    if (id === 0) continue;
    if (LAVA.has(id)) l += 1 - d / 12;
    else if (d <= 10) {
      if (WET.has(id)) w += 1 - d / 10;
      else if (AMETHYST.has(id)) a += 1 - d / 10;
    }
  }
  return { lava: clamp01(l / 5), water: clamp01(w / 6), amethyst: clamp01(a / 3) };
}

/** The notes the drone wanders between (Hz): the bottom of the range of hearing, all of them dark. */
const ROOTS = [32.7, 36.71, 38.89, 41.2, 43.65, 46.25];

interface Shot {
  name: AmbientName;
  /** Chance weight, the least seconds between two of them, and how loud (at 1). */
  w: number;
  cd: number;
  vol: number;
  /** The least depth at which it is heard. */
  min?: number;
  /** How far away it is (blocks), and whether it is put behind the listener. */
  dist: readonly [number, number];
  behind?: boolean;
  far?: number;
}

const SHOTS: readonly Shot[] = [
  { name: 'groan', w: 3, cd: 22, vol: 0.7, dist: [10, 28] },
  { name: 'whisper', w: 3, cd: 15, vol: 0.45, dist: [2, 9] },
  { name: 'scrape', w: 2, cd: 28, vol: 0.6, dist: [8, 24] },
  { name: 'rockfall', w: 1.3, cd: 45, vol: 0.65, dist: [14, 32] },
  { name: 'chains', w: 2, cd: 32, vol: 0.5, dist: [6, 20] },
  { name: 'scream', w: 0.45, cd: 130, vol: 0.7, min: 0.12, dist: [26, 40], far: 0.3 },
  { name: 'breath', w: 0.8, cd: 70, vol: 0.45, min: 0.08, dist: [0.8, 1.4], behind: true },
];

interface Bed {
  master: GainNode;
  send: GainNode;
  conv: ConvolverNode;
  wet: GainNode;
  drone: GainNode;
  droneLP: BiquadFilterNode;
  droneLfoDepth: GainNode;
  tones: OscillatorNode[];
  pad: GainNode;
  padTones: OscillatorNode[];
  air: GainNode;
  airLP: BiquadFilterNode;
  airLfoDepth: GainNode;
  lava: GainNode;
  lavaLP: BiquadFilterNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

export class DungeonAmbience {
  private bed: Bed | null = null;
  private impulse: AudioBuffer | null = null;
  /** Seconds since the dungeon stopped being wanted (the bed is taken apart after a moment), and a debug hold that keeps it up. */
  private leaving = 0;
  private hold = 0;
  private readonly pools = { shots: new VoicePool(5), drips: new VoicePool(3), heart: new VoicePool(3), fx: new VoicePool(2) };
  private depth = 0;
  private heart = 0;
  private lava = 0;
  private water = 0;
  private amethyst = 0;
  private droneIn = 0;
  private root = ROOTS[2];
  private shotIn = rnd(5, 9);
  private dripIn = rnd(3, 8);
  private glassIn = rnd(4, 9);
  private lavaIn = 0;
  private stingIn = rnd(150, 320);
  private beatAt = 0;
  private readonly cd = new Map<string, number>();
  /** What was made, by name (for the tests and the debug hooks). */
  readonly played: Record<string, number> = {};

  constructor(
    private readonly ctx: AudioContext,
    /** The ambience bus. */
    private readonly bus: AudioNode,
    /** The noise and the tools the recipes make their sounds from (see makeSink). */
    private readonly sink: DarkSink,
  ) {}

  get built(): boolean {
    return this.bed !== null;
  }

  stats(): { built: boolean; bedSources: number; bedNodes: number; pools: Record<string, ReturnType<VoicePool['stats']>>; played: Record<string, number> } {
    const p = this.pools;
    return {
      built: this.bed !== null,
      bedSources: this.bed?.sources.length ?? 0,
      bedNodes: this.bed?.nodes.length ?? 0,
      pools: { shots: p.shots.stats(), drips: p.drips.stats(), heart: p.heart.stats(), fx: p.fx.stats() },
      played: { ...this.played },
    };
  }

  // ---- the bed -----------------------------------------------------------------------------------------

  private build(): Bed {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const gain = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      nodes.push(g);
      return g;
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      nodes.push(n);
      return n;
    };
    const osc = (type: OscillatorType, f: number): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      sources.push(o);
      o.start();
      return o;
    };
    const loop = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = this.sink.deep;
      s.loop = true;
      s.playbackRate.value = rnd(0.9, 1.1);
      sources.push(s);
      s.start(0, Math.random() * 3);
      return s;
    };

    const master = gain(0);
    master.connect(this.bus);
    // The reverb every wet sound is sent to: a long dark hall.
    const send = gain(1);
    const conv = ctx.createConvolver();
    this.impulse ??= darkImpulse(ctx);
    conv.buffer = this.impulse;
    nodes.push(conv);
    const wet = gain(0.9);
    send.connect(conv);
    conv.connect(wet);
    wet.connect(master);

    // The drone: two triangles a semitone or so apart (they beat), and a sine an octave up, under a slow swell.
    const drone = gain(0);
    const droneLP = filter('lowpass', 500);
    drone.connect(droneLP);
    droneLP.connect(master);
    const r = this.root;
    const tones = [osc('triangle', r), osc('sine', r * 2), osc('triangle', r * 1.0595)];
    for (const t of tones) t.connect(drone);
    const droneLfo = osc('sine', 0.06);
    const droneLfoDepth = gain(0);
    droneLfo.connect(droneLfoDepth);
    droneLfoDepth.connect(drone.gain);

    // The pad: three saws under a low-pass, a cold chord that only comes in with depth.
    const pad = gain(0);
    const padLP = filter('lowpass', 300);
    padLP.connect(pad);
    pad.connect(master);
    const padTones = [osc('sawtooth', r * 4), osc('sawtooth', r * 4 * 1.0595), osc('sawtooth', r * 6)];
    for (const t of padTones) t.connect(padLP);

    // The air in the rock.
    const air = gain(0);
    const airLP = filter('lowpass', 320);
    const airSrc = loop();
    airSrc.connect(airLP);
    airLP.connect(air);
    air.connect(master);
    const airLfo = osc('sine', 0.05);
    const airLfoDepth = gain(0);
    airLfo.connect(airLfoDepth);
    airLfoDepth.connect(air.gain);

    // Lava, when there is any near: a low grumble.
    const lava = gain(0);
    const lavaLP = filter('lowpass', 110);
    const lavaSrc = loop();
    lavaSrc.connect(lavaLP);
    lavaLP.connect(lava);
    lava.connect(master);

    this.droneIn = rnd(14, 30);
    return { master, send, conv, wet, drone, droneLP, droneLfoDepth, tones, pad, padTones, air, airLP, airLfoDepth, lava, lavaLP, sources, nodes };
  }

  /** Stop and take apart everything: the bed, the voices still sounding, the reverb. */
  private teardown(): void {
    const b = this.bed;
    for (const p of Object.values(this.pools)) p.fadeAll(0.1);
    if (!b) return;
    this.bed = null;
    for (const s of b.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    for (const n of b.nodes) n.disconnect();
    this.beatAt = 0;
    this.heart = 0;
  }

  dispose(): void {
    this.teardown();
  }

  // ---- every tenth of a second -----------------------------------------------------------------------------

  /** Call a few times a second with how long since the last call. `audible`: false when the player has muted sound or the ambience. */
  update(dt: number, env: DungeonEnv, audible: boolean): void {
    this.hold = Math.max(0, this.hold - dt);
    const want = audible && (env.active || this.hold > 0) && this.ctx.state === 'running';
    if (want) {
      this.leaving = 0;
      this.bed ??= this.build();
    } else if (this.bed) {
      this.leaving += dt;
      this.bed.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.35);
      if (this.leaving > 2.4) this.teardown();
      return;
    } else return;
    const b = this.bed!;
    const t = this.ctx.currentTime;
    b.master.gain.setTargetAtTime(1, t, 0.8);

    const ease = (cur: number, to: number, rate: number): number => cur + (to - cur) * (1 - Math.exp(-dt * rate));
    this.depth = ease(this.depth, env.depth, 0.8);
    this.lava = ease(this.lava, env.lava, 1.5);
    this.water = ease(this.water, env.water, 1.5);
    this.amethyst = ease(this.amethyst, env.amethyst, 1.5);
    const heartTo = heartLevel(env.threat, env.hp);
    this.heart = ease(this.heart, heartTo, heartTo > this.heart ? 1.0 : 0.35);
    const k = this.depth;

    // The bed: darker and heavier with depth.
    const dg = 0.07 + 0.1 * k;
    b.drone.gain.setTargetAtTime(dg, t, 1.5);
    b.droneLfoDepth.gain.setTargetAtTime(dg * 0.35, t, 1.5);
    b.droneLP.frequency.setTargetAtTime(650 - 420 * k, t, 1.5);
    b.pad.gain.setTargetAtTime(0.002 + 0.045 * clamp01((k - 0.2) / 0.5), t, 2);
    const ag = 0.04 + 0.05 * k;
    b.air.gain.setTargetAtTime(ag, t, 1.5);
    b.airLfoDepth.gain.setTargetAtTime(ag * 0.5, t, 1.5);
    b.airLP.frequency.setTargetAtTime(380 - 200 * k, t, 1.5);
    b.lava.gain.setTargetAtTime(0.16 * this.lava, t, 1);
    b.lavaLP.frequency.setTargetAtTime(90 + 60 * this.lava, t, 1);

    // The drone changes its notes now and then, slowly.
    this.droneIn -= dt;
    if (this.droneIn <= 0) {
      this.droneIn = rnd(14, 30);
      const root = pick(ROOTS.filter((n) => n !== this.root));
      this.root = root;
      b.tones[0].frequency.setTargetAtTime(root, t, 4);
      b.tones[1].frequency.setTargetAtTime(root * 2 * rnd(0.997, 1.004), t, 4);
      b.tones[2].frequency.setTargetAtTime(root * pick([1.0595, 1.189, 1.414]), t, 5);
      b.padTones[0].frequency.setTargetAtTime(root * 4, t, 6);
      b.padTones[1].frequency.setTargetAtTime(root * 4 * pick([1.0595, 1.122]), t, 6);
      b.padTones[2].frequency.setTargetAtTime(root * 6, t, 6);
    }

    for (const [name, left] of this.cd) this.cd.set(name, Math.max(0, left - dt));
    if (!env.fight) {
      this.shots(dt, k);
      this.drips(dt, k);
      this.stings(dt, env, k);
    }
    this.flavour(dt);
    this.beats();
  }

  private spot(dist: readonly [number, number], behind = false): { az: number; dist: number } {
    const az = behind ? Math.PI + rnd(-0.5, 0.5) : Math.random() * Math.PI * 2;
    return { az, dist: rnd(dist[0], dist[1]) };
  }

  private make(name: AmbientName, o: { pool: keyof DungeonAmbience['pools']; vol: number; depth: number; az?: number; dist: number; far?: number; wetAmt: number; delay?: number }): boolean {
    const b = this.bed;
    if (!b) return false;
    const v = playAmbient(name, this.sink, this.pools[o.pool], { depth: o.depth, vol: o.vol, az: o.az, dist: o.dist, far: o.far, bus: b.master, wet: b.send, wetAmt: o.wetAmt, delay: o.delay });
    if (v) this.played[name] = (this.played[name] ?? 0) + 1;
    return v !== null;
  }

  /** The sparse sounds at random: one every so often, never the same kind too soon, none while the pool is busy. */
  private shots(dt: number, k: number): void {
    this.shotIn -= dt * (0.85 + 0.7 * k);
    if (this.shotIn > 0) return;
    this.shotIn = rnd(6, 16);
    if (this.pools.shots.active >= this.pools.shots.max - 1) return;
    const ready = SHOTS.filter((s) => (this.cd.get(s.name) ?? 0) <= 0 && k >= (s.min ?? 0));
    const total = ready.reduce((n, s) => n + s.w, 0);
    if (total <= 0) return;
    let r = Math.random() * total;
    const shot = ready.find((s) => (r -= s.w) <= 0) ?? ready[0];
    const at = this.spot(shot.dist, shot.behind);
    if (this.make(shot.name, { pool: 'shots', vol: shot.vol * (1 - 0.25 * (at.dist / 40)) * (0.85 + 0.3 * k), depth: k, az: at.az, dist: at.dist, far: (shot.far ?? 0) + 0.15 * k, wetAmt: shot.name === 'breath' ? 0.1 : 0.5 + 0.2 * k })) {
      this.cd.set(shot.name, shot.cd);
    }
  }

  /** Drops of water, slow and irregular, a long way off in a big space; more, and wetter, where it is wet. */
  private drips(dt: number, k: number): void {
    this.dripIn -= dt;
    if (this.dripIn > 0) return;
    this.dripIn = rnd(2.5, 9) / (1 + 2.5 * this.water);
    const at = this.spot([4, 18]);
    this.make(Math.random() < this.water ? 'drip_lush' : 'drip', { pool: 'drips', vol: rnd(0.3, 0.5), depth: k, az: at.az, dist: at.dist, far: 0.1 + 0.2 * k, wetAmt: 1 });
  }

  /** The very rare low sting: not in a fight, not with a monster at your back, and never at the camp. */
  private stings(dt: number, env: DungeonEnv, k: number): void {
    this.stingIn -= dt;
    if (this.stingIn > 0) return;
    if (k < 0.15 || env.threat > 0.3) {
      this.stingIn = rnd(20, 40);
      return;
    }
    this.stingIn = rnd(240, 480);
    this.make('sting', { pool: 'shots', vol: 0.9, depth: k, dist: 5, far: 0.1, wetAmt: 0.6 });
  }

  /** What belongs to the place: the glass of amethyst, and the pops and bubbles of lava. */
  private flavour(dt: number): void {
    const k = this.depth;
    if (this.amethyst > 0.2) {
      this.glassIn -= dt;
      if (this.glassIn <= 0) {
        this.glassIn = rnd(7, 16) / (0.6 + this.amethyst);
        const at = this.spot([5, 14]);
        this.make('glass', { pool: 'fx', vol: 0.45, depth: k, az: at.az, dist: at.dist, far: 0.1, wetAmt: 0.9 });
      }
    }
    if (this.lava > 0.05) {
      this.lavaIn -= dt;
      if (this.lavaIn <= 0) {
        this.lavaIn = 1;
        const at = this.spot([4, 10]);
        this.make('crackle', { pool: 'fx', vol: 0.1 + 0.4 * this.lava, depth: this.lava, az: at.az, dist: at.dist, far: 0.05, wetAmt: 0.2 });
      }
    }
  }

  /** The heart: beats placed exactly in time, a little ahead, faster and louder as it grows. */
  private beats(): void {
    const ctx = this.ctx;
    if (this.heart < 0.06) {
      this.beatAt = 0;
      return;
    }
    const now = ctx.currentTime;
    if (this.beatAt < now) this.beatAt = now + 0.05;
    const bpm = 56 + 74 * this.heart;
    while (this.beatAt < now + 0.25) {
      this.make('heartbeat', { pool: 'heart', vol: (0.25 + 0.75 * this.heart) * 0.9, depth: this.depth, dist: 1, wetAmt: 0, delay: this.beatAt - now });
      this.beatAt += 60 / bpm;
    }
  }

  // ---- for the tests -----------------------------------------------------------------------------------------

  /** Play one by name now (the bed is kept up for twelve seconds so that its reverb is there). */
  debugPlay(name: AmbientName, o: { depth?: number; az?: number; dist?: number } = {}): boolean {
    if (this.ctx.state !== 'running') void this.ctx.resume();
    this.hold = 12;
    this.leaving = 0;
    this.bed ??= this.build();
    this.bed.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
    const pool = name === 'heartbeat' ? 'heart' : name === 'drip' || name === 'drip_lush' ? 'drips' : name === 'glass' || name === 'crackle' ? 'fx' : 'shots';
    const shot = SHOTS.find((s) => s.name === name);
    const dist = o.dist ?? (shot ? (shot.dist[0] + shot.dist[1]) / 2 : 6);
    return this.make(name, { pool, vol: shot?.vol ?? 0.5, depth: o.depth ?? 0.6, az: name === 'heartbeat' ? undefined : (o.az ?? (name === 'breath' ? Math.PI : Math.PI / 2)), dist, far: 0.1, wetAmt: name === 'heartbeat' ? 0 : 0.6 });
  }
}
