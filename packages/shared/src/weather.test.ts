import { describe, expect, it } from 'vitest';
import { mulberry32 } from './noise';
import { WEATHER_FADE_SECONDS, Weather } from './weather';

const run = (w: Weather, seconds: number, dt = 0.5): number => {
  let strikes = 0;
  for (let t = 0; t < seconds; t += dt) strikes += w.update(dt);
  return strikes;
};

describe('weather', () => {
  it('starts clear and stays clear until its timer ends', () => {
    const w = new Weather(mulberry32(1));
    expect(w.kind).toBe('clear');
    run(w, 300);
    expect(w.kind).toBe('clear');
    expect(w.rain).toBe(0);
  });

  it('eventually rains, then clears again', () => {
    const w = new Weather(mulberry32(2));
    const kinds = new Set<string>();
    for (let t = 0; t < 20000; t += 1) {
      w.update(1);
      kinds.add(w.kind);
    }
    expect(kinds.has('clear')).toBe(true);
    expect(kinds.has('rain') || kinds.has('thunder')).toBe(true);
  });

  it('fades rain in and out gradually instead of popping', () => {
    const w = new Weather(mulberry32(3));
    w.set('rain', 1000);
    run(w, WEATHER_FADE_SECONDS / 2, 0.1);
    expect(w.rain).toBeGreaterThan(0.3);
    expect(w.rain).toBeLessThan(0.7);
    run(w, WEATHER_FADE_SECONDS, 0.1);
    expect(w.rain).toBe(1);
    w.set('clear', 1000);
    run(w, WEATHER_FADE_SECONDS * 2, 0.1);
    expect(w.rain).toBe(0);
  });

  it('only thunderstorms strike lightning, and the flash decays', () => {
    const rain = new Weather(mulberry32(4));
    rain.set('rain', 5000);
    expect(run(rain, 1000)).toBe(0);

    const storm = new Weather(mulberry32(4));
    storm.set('thunder', 5000);
    expect(run(storm, 1000)).toBeGreaterThan(5);
    storm.flash = 1;
    storm.update(0.2);
    expect(storm.flash).toBeLessThan(1);
    run(storm, 1, 0.1);
    expect(storm.flash).toBeLessThanOrEqual(1);
  });

  it('darkens the sky more in a storm than in plain rain', () => {
    const a = new Weather(mulberry32(5));
    a.set('rain', 5000);
    run(a, 60);
    const b = new Weather(mulberry32(5));
    b.set('thunder', 5000);
    run(b, 60);
    expect(a.darkness).toBeGreaterThan(0.2);
    expect(b.darkness).toBeGreaterThan(a.darkness);
    expect(new Weather(mulberry32(5)).darkness).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const trace = (seed: number) => {
      const w = new Weather(mulberry32(seed));
      const out: string[] = [];
      for (let i = 0; i < 5000; i++) {
        w.update(1);
        if (i % 250 === 0) out.push(`${w.kind}:${Math.round(w.timer)}`);
      }
      return out.join(',');
    };
    expect(trace(9)).toBe(trace(9));
    expect(trace(9)).not.toBe(trace(10));
  });

  it('round-trips through JSON and ignores garbage', () => {
    const w = new Weather(mulberry32(6));
    w.set('thunder', 321);
    const copy = new Weather(mulberry32(7));
    copy.loadJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(copy.kind).toBe('thunder');
    expect(copy.timer).toBe(321);
    expect(copy.rain).toBe(1);
    expect(copy.storm).toBe(1);

    const other = new Weather(mulberry32(8));
    other.loadJSON({ kind: 'blizzard' as never, timer: 5 });
    other.loadJSON(null);
    expect(other.kind).toBe('clear');
  });
});
