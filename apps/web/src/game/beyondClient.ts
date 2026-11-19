import {
  BEYOND_BIOMES,
  BeyondWorldGenerator,
  DiscoveryLog,
  skyOf,
  type Achievement,
  type CaveEco,
  type Discovery,
  type ParticleKey,
  type Sky,
  type WeatherNow,
} from '@solrift/shared';
import type { Particles } from './particles';

/** How one kind of airborne speck looks and moves (`Sky.particles`). Speeds are blocks a second; `fall` is gravity (negative rises). */
interface MoteSpec {
  /** Specks a second at full density. */
  rate: number;
  rgb: readonly [number, number, number];
  size: readonly [number, number];
  life: readonly [number, number];
  /** Drift sideways, plus the share of the wind added to it. */
  drift: number;
  rise: number;
  fall: number;
  /** Only when the light is below / above this (fireflies come out at dusk). */
  night?: boolean;
  day?: boolean;
}

export const MOTES: Record<Exclude<ParticleKey, 'none' | 'snow' | 'bubbles'>, MoteSpec> = {
  pollen: { rate: 6, rgb: [1, 0.95, 0.6], size: [0.04, 0.07], life: [3, 5], drift: 0.25, rise: 0.05, fall: 0, day: true },
  petals: { rate: 7, rgb: [1, 0.72, 0.84], size: [0.06, 0.09], life: [4, 7], drift: 0.5, rise: 0, fall: 0.6 },
  leaves: { rate: 5, rgb: [0.78, 0.5, 0.2], size: [0.07, 0.1], life: [4, 7], drift: 0.7, rise: 0, fall: 0.9 },
  fireflies: { rate: 4, rgb: [0.85, 1, 0.35], size: [0.05, 0.08], life: [3, 6], drift: 0.3, rise: 0.08, fall: 0, night: true },
  spores: { rate: 7, rgb: [0.55, 0.95, 0.85], size: [0.04, 0.07], life: [4, 7], drift: 0.2, rise: 0.25, fall: 0 },
  sand: { rate: 22, rgb: [0.86, 0.74, 0.5], size: [0.05, 0.08], life: [1.2, 2], drift: 3.2, rise: 0, fall: 0.5 },
  ash: { rate: 14, rgb: [0.42, 0.4, 0.4], size: [0.05, 0.09], life: [3, 5], drift: 0.6, rise: 0, fall: 0.7 },
  embers: { rate: 9, rgb: [1, 0.5, 0.12], size: [0.04, 0.07], life: [1.6, 3], drift: 0.5, rise: 1.2, fall: 0 },
  crystal: { rate: 5, rgb: [0.7, 0.9, 1], size: [0.04, 0.07], life: [2, 4], drift: 0.15, rise: 0.15, fall: 0 },
  motes: { rate: 6, rgb: [0.95, 0.85, 1], size: [0.04, 0.07], life: [4, 7], drift: 0.2, rise: 0.1, fall: 0 },
  sparks: { rate: 6, rgb: [1, 0.78, 0.3], size: [0.04, 0.06], life: [0.8, 1.6], drift: 0.8, rise: 1.4, fall: 0 },
  mist: { rate: 3, rgb: [0.92, 0.95, 0.97], size: [0.18, 0.3], life: [4, 7], drift: 0.2, rise: 0.03, fall: 0 },
};

/** What the traveller sees and hears of the World Beyond right now, smoothed so a border is a change of mood and not a jump. */
export interface BeyondFeel {
  /** 0..1: scales the fog distance down. */
  fog: number;
  fogColor: readonly [number, number, number] | null;
  /** The share of the colour to take (0 none .. 1 all). */
  fogMix: number;
  light: number;
  precip: number;
  snow: boolean;
  bed: Sky['bed'];
  wind: number;
}

export interface BeyondHooks {
  /** A discovery was made: a notification. */
  onDiscover(d: Discovery): void;
  onAchievement(a: Achievement): void;
  /** The codex changed (a find, or the traveller crossed into another biome): the window reads from the log. */
  onChange(log: DiscoveryLog, here: number): void;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The client side of the World Beyond: atmosphere, ambient particles and the discovery log. */
export class BeyondClient {
  readonly log: DiscoveryLog;
  here = 1;
  readonly feel: BeyondFeel = { fog: 0, fogColor: null, fogMix: 0, light: 1, precip: 0, snow: false, bed: 'meadow', wind: 0.2 };
  private readonly gen: BeyondWorldGenerator | null;
  private scan = 0;
  private emit = 0;
  private lastCave: CaveEco = 'none';
  private readonly saveKey: string;

  constructor(
    generator: object,
    worldId: string,
    private readonly hooks: BeyondHooks,
  ) {
    this.gen = generator instanceof BeyondWorldGenerator ? generator : null;
    this.saveKey = `solrift-codex-${worldId}`;
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(this.saveKey) ?? 'null');
    } catch {
      /* no storage, or a damaged entry: start a new book */
    }
    this.log = DiscoveryLog.from(saved);
  }

  get active(): boolean {
    return this.gen !== null;
  }

  private persist(): void {
    try {
      localStorage.setItem(this.saveKey, JSON.stringify(this.log));
    } catch {
      /* the book then lasts until the page closes */
    }
  }

  private note(found: Discovery | null): void {
    if (!found) return;
    this.hooks.onDiscover(found);
    for (const a of this.log.takeUnlocked()) this.hooks.onAchievement(a);
    this.persist();
    this.hooks.onChange(this.log, this.here);
  }

  /** Once a frame: ease the atmosphere, scatter specks, and twice a second look at where the traveller is. */
  update(dt: number, x: number, y: number, z: number, underground: boolean, weather: WeatherNow, brightness: number, particles: Particles | null, submerged: boolean): void {
    const gen = this.gen;
    if (!gen) return;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.5;
      this.look(gen, x, y, z, underground);
    }
    const sky = skyOf(BEYOND_BIOMES[this.here].atmosphere, weather);
    this.ease(sky, underground, dt);
    if (particles && !submerged && !underground) this.scatter(sky, dt, x, y, z, brightness, particles);
  }

  private look(gen: BeyondWorldGenerator, x: number, y: number, z: number, underground: boolean): void {
    const px = Math.floor(x);
    const pz = Math.floor(z);
    const biome = gen.biomeAt(px, pz);
    const moved = biome.id !== this.here;
    this.here = biome.id;
    this.note(this.log.findBiome(biome.id));
    if (moved) this.hooks.onChange(this.log, this.here);
    for (const p of gen.places.near(px, pz, 40)) {
      if (Math.hypot(p.x - px, p.z - pz) < p.info.radius + 6) this.note(this.log.findStructure(p.key));
    }
    if (underground) {
      const eco = gen.caveEcoAt(px, Math.floor(y), pz);
      if (eco !== 'none' && eco !== this.lastCave) this.note(this.log.findCave(eco));
      this.lastCave = eco;
    } else this.lastCave = 'none';
  }

  private ease(sky: Sky, underground: boolean, dt: number): void {
    const f = this.feel;
    const k = Math.min(1, dt * 0.8);
    f.fog = lerp(f.fog, underground ? 0 : sky.fog, k);
    f.light = lerp(f.light, underground ? 1 : sky.light, k);
    f.precip = lerp(f.precip, sky.precip, Math.min(1, dt * 0.6));
    f.wind = lerp(f.wind, sky.wind, k);
    f.snow = sky.snow;
    f.bed = sky.bed;
    const col = underground ? null : sky.fogColor;
    f.fogMix = lerp(f.fogMix, col ? 0.75 : 0, k);
    if (col) {
      const c = f.fogColor ?? col;
      f.fogColor = [lerp(c[0], col[0], k), lerp(c[1], col[1], k), lerp(c[2], col[2], k)];
    }
  }

  private scatter(sky: Sky, dt: number, x: number, y: number, z: number, brightness: number, particles: Particles): void {
    if (sky.particles === 'none' || sky.particles === 'snow' || sky.particles === 'bubbles') return;
    const spec = MOTES[sky.particles];
    if (!spec || (spec.night && brightness > 0.5) || (spec.day && brightness < 0.4)) return;
    // The speck count follows the frame time so a slow frame does not make a burst.
    this.emit += Math.min(dt, 0.1) * spec.rate;
    const wind = this.feel.wind;
    while (this.emit >= 1) {
      this.emit -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 11;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const drift = spec.drift * (0.5 + wind * 1.5);
      const ang = a + Math.PI * 0.5 * (Math.random() - 0.5);
      particles.mote(
        x + dx * r,
        y - 1 + Math.random() * 6,
        z + dz * r,
        Math.cos(ang) * drift * Math.random(),
        spec.rise * (0.5 + Math.random()),
        Math.sin(ang) * drift * Math.random(),
        spec.fall,
        lerp(spec.life[0], spec.life[1], Math.random()),
        lerp(spec.size[0], spec.size[1], Math.random()),
        spec.rgb[0],
        spec.rgb[1],
        spec.rgb[2],
      );
    }
  }
}
