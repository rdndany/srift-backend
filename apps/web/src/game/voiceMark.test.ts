import { describe, expect, it } from 'vitest';
import { frameHasVoice, placeVoice, takeSend } from './voiceChat';

describe('the speaker mark above a name', () => {
  it('lights for a normal voice and stays dark for a quiet microphone', () => {
    const loud = new Int16Array(640);
    for (let i = 0; i < loud.length; i++) loud[i] = (i % 2 ? 1 : -1) * 4000;
    expect(frameHasVoice(loud)).toBe(true);
    const quiet = new Int16Array(640);
    for (let i = 0; i < quiet.length; i++) quiet[i] = (i % 2 ? 1 : -1) * 200;
    expect(frameHasVoice(quiet)).toBe(false);
  });
});

describe('microphone frames keep going', () => {
  it('lets a short pile leave, then keeps sending instead of going quiet for the rest of the second', () => {
    let tokens = 40;
    let sent = 0;
    for (let i = 0; i < 40; i++) {
      const step = takeSend(tokens, 0);
      tokens = step.tokens;
      if (step.send) sent++;
    }
    expect(sent).toBe(40);
    const blocked = takeSend(tokens, 0);
    expect(blocked.send).toBe(false);
    const again = takeSend(blocked.tokens, 0.04);
    expect(again.send).toBe(true);
  });

  it('plays the next frame straight after the last one, and drops a pile that is already too far ahead', () => {
    const lined = placeVoice(10.1, 10, 0.04);
    expect(lined?.at).toBeCloseTo(10.1);
    expect(lined?.next).toBeCloseTo(10.14);
    const late = placeVoice(0, 10, 0.04);
    expect(late?.at).toBeCloseTo(10.05);
    expect(late?.next).toBeCloseTo(10.09);
    expect(placeVoice(10.3, 10, 0.04)).toBeNull();
  });
});
