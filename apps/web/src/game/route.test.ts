import { describe, expect, it } from 'vitest';
import { gamePath, isGamePath, isPlayPath, nameFromPath, paramsFor, playPath, prettyAddress, titleAddress } from './route';

const at = (pathname: string, search = '') => ({ pathname, search });

describe('friendly addresses', () => {
  it('makes the path of the realm from a name', () => {
    expect(playPath('rdNeu')).toBe('/play/rdNeu');
    expect(playPath('')).toBe('/play');
    expect(playPath('  ')).toBe('/play');
    expect(playPath('Sir Bob')).toBe('/play/Sir%20Bob');
    expect(playPath('a<b>c/d')).toBe('/play/abcd');
    expect(playPath('x'.repeat(40))).toBe(`/play/${'x'.repeat(16)}`);
  });

  it('reads the name back from the path', () => {
    expect(nameFromPath('/play/rdNeu')).toBe('rdNeu');
    expect(nameFromPath('/play/rdNeu/')).toBe('rdNeu');
    expect(nameFromPath('/play/Sir%20Bob')).toBe('Sir Bob');
    expect(nameFromPath('/play')).toBeNull();
    expect(nameFromPath('/play/%E0%A4%A')).toBeNull();
    expect(nameFromPath('/play/%3Cb%3E')).toBe('b');
    expect(nameFromPath('/')).toBeNull();
  });

  it('knows which addresses are play addresses', () => {
    for (const p of ['/play', '/play/', '/play/rdNeu']) expect(isPlayPath(p)).toBe(true);
    for (const p of ['/', '/playground', '/play/a/b', '/other']) expect(isPlayPath(p)).toBe(false);
  });

  it('gives the game the same parameters as the long address', () => {
    const p = paramsFor(at('/play/rdNeu'));
    expect(p.has('online')).toBe(true);
    expect(p.get('name')).toBe('rdNeu');
    expect(paramsFor(at('/play')).has('name')).toBe(false);
    expect(paramsFor(at('/play')).has('online')).toBe(true);
    // Extra parameters (debugging) still count, and an explicit name wins.
    const q = paramsFor(at('/play/rdNeu', '?debug&name=other'));
    expect(q.has('debug')).toBe(true);
    expect(q.get('name')).toBe('other');
    // The old form is untouched.
    const old = paramsFor(at('/', '?online&name=rdNeu'));
    expect(old.has('online')).toBe(true);
    expect(old.get('name')).toBe('rdNeu');
    expect(paramsFor(at('/')).has('online')).toBe(false);
  });

  it('shows the old long address in the nice form, but leaves every other one alone', () => {
    expect(prettyAddress(at('/', '?online&name=rdNeu'))).toBe('/play/rdNeu');
    expect(prettyAddress(at('/', '?online'))).toBe('/play');
    expect(prettyAddress(at('/', '?online&debug&name=x'))).toBeNull();
    expect(prettyAddress(at('/', '?online&server=ws://localhost:1&name=x'))).toBeNull();
    expect(prettyAddress(at('/', '?seed=5'))).toBeNull();
    expect(prettyAddress(at('/play/rdNeu'))).toBeNull();
  });

  it('goes back to the front page from a play address', () => {
    expect(titleAddress('/play/rdNeu')).toBe('/');
    expect(titleAddress('/')).toBe('/');
    expect(titleAddress('/game')).toBe('/');
  });

  it('knows the game page, and keeps the other parameters on the way there', () => {
    expect(isGamePath('/game')).toBe(true);
    expect(isGamePath('/game/')).toBe(true);
    expect(isGamePath('/games')).toBe(false);
    expect(isGamePath('/')).toBe(false);
    expect(gamePath('')).toBe('/game');
    expect(gamePath('?home&debug')).toBe('/game?home&debug');
  });
});
