import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTING_RANGE, parseSettings } from './settings';

describe('settings', () => {
  it('are the defaults when nothing usable was stored', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}]) expect(parseSettings(bad)).toEqual(DEFAULT_SETTINGS);
  });

  it('keep what is stored, held to what each one may be', () => {
    const s = parseSettings({ master: 7, effects: -1, music: 0.25, fov: 500, renderDistance: 1, sensitivity: 'fast', muted: true, invertY: true });
    expect(s.master).toBe(SETTING_RANGE.master[1]);
    expect(s.effects).toBe(SETTING_RANGE.effects[0]);
    expect(s.music).toBe(0.25);
    expect(s.fov).toBe(SETTING_RANGE.fov[1]);
    expect(s.renderDistance).toBe(SETTING_RANGE.renderDistance[0]);
    expect(s.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
    expect(s.muted).toBe(true);
    expect(s.invertY).toBe(true);
  });

  it('round the view numbers to whole ones', () => {
    const s = parseSettings({ fov: 80.6, renderDistance: 9.4 });
    expect(s.fov).toBe(81);
    expect(s.renderDistance).toBe(9);
  });
});
