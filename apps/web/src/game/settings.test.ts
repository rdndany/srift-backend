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
    expect(s.voice).toBe(DEFAULT_SETTINGS.voice);
    expect(s.micDevice).toBe('');
    expect(s.pushToTalk).toBe(false);
    expect(s.voiceKey).toBe('Backquote');
  });

  it('round the view numbers to whole ones', () => {
    const s = parseSettings({ fov: 80.6, renderDistance: 9.4 });
    expect(s.fov).toBe(81);
    expect(s.renderDistance).toBe(9);
  });

  it('keeps a microphone and holds how loud voices are', () => {
    const s = parseSettings({ voice: 4, micDevice: 'desk-mic' });
    expect(s.voice).toBe(1);
    expect(s.micDevice).toBe('desk-mic');
    expect(parseSettings({ voice: -2, micDevice: 3 }).voice).toBe(0);
    expect(parseSettings({ micDevice: 3 }).micDevice).toBe('');
    expect(parseSettings({ pushToTalk: true, voiceKey: 'KeyJ' }).pushToTalk).toBe(true);
    expect(parseSettings({ voiceKey: 'KeyJ' }).voiceKey).toBe('KeyJ');
    expect(parseSettings({ voiceKey: 'KeyE' }).voiceKey).toBe('Backquote');
    expect(parseSettings({ voiceKey: 'F5' }).voiceKey).toBe('Backquote');
    expect(parseSettings({ voiceKey: 4 }).voiceKey).toBe('Backquote');
  });
});
