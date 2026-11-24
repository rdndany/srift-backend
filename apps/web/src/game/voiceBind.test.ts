import { describe, expect, it } from 'vitest';
import { voiceKeyLabel, voiceKeyOk } from './voiceBind';

describe('the talk key', () => {
  it('keeps a free key and refuses one the game already uses', () => {
    expect(voiceKeyOk('Backquote')).toBe(true);
    expect(voiceKeyOk('KeyJ')).toBe(true);
    expect(voiceKeyOk('Numpad1')).toBe(true);
    for (const taken of ['KeyE', 'KeyW', 'KeyQ', 'Space', 'ShiftLeft', 'Digit1', 'F5', 'KeyZ', 'Escape', 'Tab']) {
      expect(voiceKeyOk(taken), taken).toBe(false);
    }
    expect(voiceKeyOk('')).toBe(false);
    expect(voiceKeyOk('Key E')).toBe(false);
  });

  it('prints the key the way it looks', () => {
    expect(voiceKeyLabel('Backquote')).toBe('`');
    expect(voiceKeyLabel('KeyJ')).toBe('J');
    expect(voiceKeyLabel('Numpad1')).toBe('Num 1');
  });
});
