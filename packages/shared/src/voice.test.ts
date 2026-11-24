import { describe, expect, it } from 'vitest';
import { parseNetClientMessage } from './netProtocol';

const sdp = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';

describe('voice messages', () => {
  it('keeps an offer, an answer and a network candidate for one other player', () => {
    expect(parseNetClientMessage({ t: 'voice', to: 4, sig: { k: 'offer', sdp } })).toEqual({ t: 'voice', to: 4, sig: { k: 'offer', sdp } });
    expect(parseNetClientMessage({ t: 'voice', to: 4, sig: { k: 'answer', sdp } })).toEqual({ t: 'voice', to: 4, sig: { k: 'answer', sdp } });
    expect(parseNetClientMessage({ t: 'voice', to: 4, sig: { k: 'ice', c: 'candidate:1' } })).toEqual({ t: 'voice', to: 4, sig: { k: 'ice', c: 'candidate:1' } });
  });

  it('keeps one frame of a microphone and drops a frame that is not sound', () => {
    const frame = btoa('hello!!!');
    expect(parseNetClientMessage({ t: 'talk', d: frame })).toEqual({ t: 'talk', d: frame });
    expect(parseNetClientMessage({ t: 'talk', d: 'short' })).toBeNull();
    expect(parseNetClientMessage({ t: 'talk', d: 'not sound!' })).toBeNull();
    expect(parseNetClientMessage({ t: 'talk', d: 5 })).toBeNull();
  });

  it('drops a voice message that is not a real call setup', () => {
    expect(parseNetClientMessage({ t: 'voice', to: 0, sig: { k: 'offer', sdp } })).toBeNull();
    expect(parseNetClientMessage({ t: 'voice', to: 4, sig: { k: 'offer', sdp: 'hello' } })).toBeNull();
    expect(parseNetClientMessage({ t: 'voice', to: 4, sig: { k: 'ice', c: '' } })).toBeNull();
    expect(parseNetClientMessage({ t: 'voice', to: 4, sig: { k: 'nope' } })).toBeNull();
  });
});
