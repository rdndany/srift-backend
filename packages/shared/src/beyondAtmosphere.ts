import { ATMOSPHERES, type Atmosphere, type AtmosphereKey, type ParticleKey } from './beyondBiomes';

/**
 * What the air is doing at a place, from the biome's climate and the weather the game is having. A pure function of its
 * inputs: the client turns it into fog, rain or snow, particles and sound; tests check that it is consistent (a desert
 * never rains, a tundra snows, a storm belongs to its own country).
 */
export interface Sky {
  /** 0..1 haze: the client scales the fog distance by it. */
  fog: number;
  fogColor: readonly [number, number, number] | null;
  skyTint: readonly [number, number, number] | null;
  /** 0..1 sunlight under this sky. */
  light: number;
  wind: number;
  /** Rain or snow falling now (0..1) and which. */
  precip: number;
  snow: boolean;
  /** An active special storm: thunder, sandstorm, ash storm or blizzard. */
  storm: Atmosphere['storm'];
  particles: ParticleKey;
  /** The bed of sound under the place. */
  bed: Atmosphere['ambience'];
}

/** The game's weather: `rain` 0..1 and `storm` 0..1 (thunder). */
export interface WeatherNow {
  rain: number;
  storm: number;
}

export function skyOf(key: AtmosphereKey, weather: WeatherNow): Sky {
  const a = ATMOSPHERES[key];
  // Rain or snow falls only where the climate allows it: wet is the share of the weather that reaches here.
  const precip = a.precip === 'none' ? 0 : Math.min(1, weather.rain * a.wet);
  // A storm kind needs the weather to be stormy; the dry storms (sand, ash, blizzard) blow whenever it is rough.
  const rough = Math.max(weather.storm, weather.rain > 0.6 ? 0.6 : 0);
  const stormy = a.storm !== 'none' && rough > 0.5;
  const dry = a.storm === 'sand' || a.storm === 'ash' || a.storm === 'blizzard';
  return {
    fog: Math.min(1, a.fog + (stormy && dry ? 0.35 : 0) + (precip > 0 ? 0.08 * precip : 0)),
    fogColor: a.fogColor,
    skyTint: a.sky,
    light: a.light * (1 - 0.25 * precip) * (stormy ? 0.8 : 1),
    wind: Math.min(1, a.wind + (stormy ? 0.4 : 0)),
    precip,
    snow: a.precip === 'snow',
    storm: stormy ? a.storm : 'none',
    particles: a.particles,
    bed: a.ambience,
  };
}
