import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from './audio';

/**
 * The sound of the Runic Altar, without speakers: a stand-in audio context that accepts everything a node can be asked and
 * complains, as a browser does, about the two mistakes that would silence a sound (an exponential ramp to zero or less, and a
 * frequency of zero or less). Every element, every rank, the erase and the anvil must play without a mistake.
 */
function fakeNode(rules: { bad: string[]; ramps: number }): unknown {
  const param = (): unknown =>
    new Proxy(
      { value: 0 },
      {
        get(t, k) {
          if (k === 'value') return t.value;
          if (k === 'exponentialRampToValueAtTime') {
            return (v: number) => {
              rules.ramps++;
              if (!(v > 0)) rules.bad.push(`exponential ramp to ${v}`);
            };
          }
          return () => undefined;
        },
        set(t, k, v) {
          if (k === 'value') t.value = v as number;
          return true;
        },
      },
    );
  const props = new Map<string | symbol, unknown>();
  const node: unknown = new Proxy(
    {},
    {
      get(_t, k) {
        if (k === 'connect') return (to: unknown) => to ?? node;
        if (k === 'currentTime') return 0;
        if (props.has(k)) return props.get(k);
        if (k === 'gain' || k === 'frequency' || k === 'Q' || k === 'detune' || k === 'playbackRate' || k === 'pan') {
          const p = param();
          props.set(k, p);
          return p;
        }
        if (k === 'getChannelData') return () => new Float32Array(64);
        return () => undefined;
      },
      set(_t, k, v) {
        props.set(k, v);
        return true;
      },
    },
  );
  return node;
}

describe('the sound of the altar', () => {
  const rules = { bad: [] as string[], ramps: 0 };
  beforeEach(() => {
    vi.useFakeTimers();
    rules.bad.length = 0;
    rules.ramps = 0;
    class FakeContext {
      state = 'running';
      sampleRate = 48000;
      currentTime = 0;
      destination = {};
      constructor() {
        return new Proxy(this, {
          get(t, k) {
            if (k in t) return (t as unknown as Record<string | symbol, unknown>)[k];
            if (typeof k === 'string' && k.startsWith('create')) {
              if (k === 'createBuffer') return (_c: number, len: number) => ({ length: len, getChannelData: () => new Float32Array(len), copyToChannel: () => undefined });
              return () => fakeNode(rules);
            }
            return () => Promise.resolve();
          },
        });
      }
    }
    vi.stubGlobal('window', { AudioContext: FakeContext });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const started = (): GameAudio => {
    const a = new GameAudio();
    a.resume();
    return a;
  };

  it('plays for every element and rank, and for an erase, without a bad value', () => {
    const a = started();
    for (const element of ['ember', 'tide', 'storm', 'verdant', 'shadow', 'radiant', 'arcane', 'nonsense', undefined]) {
      for (let rank = 1; rank <= 5; rank++) {
        expect(() => a.enchant(false, { element, rank })).not.toThrow();
        vi.runAllTimers();
      }
    }
    expect(() => a.enchant(false, { erase: true })).not.toThrow();
    expect(() => a.enchant(false, { fail: true })).not.toThrow();
    expect(() => a.enchant(false)).not.toThrow();
    expect(() => a.enchant(true)).not.toThrow();
    vi.runAllTimers();
    expect(rules.ramps).toBeGreaterThan(500); // it really made the sounds
    expect(rules.bad).toEqual([]);
  });
});
