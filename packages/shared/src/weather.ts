/**
 * Weather state machine. Pure and deterministic given its random source, so the future
 * multiplayer server can run the one authoritative copy and broadcast `kind` + `timer`.
 */

export type WeatherKind = 'clear' | 'rain' | 'thunder';

export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'rain', 'thunder'];

/** Seconds a front takes to fade in or out. */
export const WEATHER_FADE_SECONDS = 15;

const CLEAR_RANGE: [number, number] = [600, 1500];
const RAIN_RANGE: [number, number] = [180, 600];
const THUNDER_CHANCE = 0.25;
const STRIKE_RANGE: [number, number] = [7, 22];

export interface WeatherSave {
  kind: WeatherKind;
  timer: number;
}

export class Weather {
  kind: WeatherKind = 'clear';
  /** Seconds until the next change of `kind`. */
  timer: number;
  /** Smoothed 0..1: how hard it is raining right now. */
  rain = 0;
  /** Smoothed 0..1: how stormy (extra darkness) it is right now. */
  storm = 0;
  /** 1 right after a lightning strike, decaying to 0. Drives the sky flash. */
  flash = 0;
  private strikeTimer = 0;

  constructor(private readonly rand: () => number = Math.random) {
    this.timer = this.range(CLEAR_RANGE);
  }

  private range([a, b]: [number, number]): number {
    return a + this.rand() * (b - a);
  }

  /** Force a weather type (used by the /weather debug command and by saves). */
  set(kind: WeatherKind, seconds?: number): void {
    this.kind = kind;
    this.timer = seconds ?? this.range(kind === 'clear' ? CLEAR_RANGE : RAIN_RANGE);
    this.strikeTimer = this.range(STRIKE_RANGE);
  }

  /** How much the sky should be dimmed (0 = none). */
  get darkness(): number {
    return 0.32 * this.rain + 0.22 * this.storm;
  }

  /** Advances the weather. Returns the number of lightning strikes that happened (0 or 1). */
  update(dt: number): number {
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.kind === 'clear') this.set(this.rand() < THUNDER_CHANCE ? 'thunder' : 'rain');
      else this.set('clear');
    }

    const target = this.kind === 'clear' ? 0 : 1;
    const stormTarget = this.kind === 'thunder' ? 1 : 0;
    const step = dt / WEATHER_FADE_SECONDS;
    this.rain += Math.max(-step, Math.min(step, target - this.rain));
    this.storm += Math.max(-step, Math.min(step, stormTarget - this.storm));
    this.flash = Math.max(0, this.flash - dt * 2.5);

    let strikes = 0;
    if (this.kind === 'thunder' && this.storm > 0.5) {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        this.strikeTimer = this.range(STRIKE_RANGE);
        this.flash = 1;
        strikes = 1;
      }
    }
    return strikes;
  }

  toJSON(): WeatherSave {
    return { kind: this.kind, timer: this.timer };
  }

  loadJSON(s: Partial<WeatherSave> | null | undefined): void {
    if (!s || !WEATHER_KINDS.includes(s.kind as WeatherKind)) return;
    this.kind = s.kind as WeatherKind;
    this.timer = Number.isFinite(s.timer) ? Math.max(1, s.timer as number) : this.range(CLEAR_RANGE);
    // A restored storm should already be in full swing rather than fade in again.
    this.rain = this.kind === 'clear' ? 0 : 1;
    this.storm = this.kind === 'thunder' ? 1 : 0;
    this.strikeTimer = this.range(STRIKE_RANGE);
  }
}
