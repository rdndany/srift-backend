import { describe, expect, it } from 'vitest';
import { gamePath, isGamePath, isPlayPath, isUid, lobbyUrl, nameFromPath, newUid, paramsFor, playPath, prettyAddress, realmPath, siteUrl, titleAddress, uidFromPath, whereIs } from './route';

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

describe('the website and the game on their own hosts', () => {
  const uid = '3f2b8c1e-5a47-4d1b-9c0e-7a1d2e3f4a5b';

  it('tells the hosts apart', () => {
    expect(whereIs('solrift.io', 'solrift.io')).toBe('site');
    expect(whereIs('www.solrift.io', 'solrift.io')).toBe('site');
    expect(whereIs('play.solrift.io', 'solrift.io')).toBe('play');
    expect(whereIs('localhost', 'solrift.io')).toBe('local');
    expect(whereIs('app-git-main.vercel.app', 'solrift.io')).toBe('local');
    expect(whereIs('evil-solrift.io', 'solrift.io')).toBe('local');
  });

  it('makes ids that are ids', () => {
    expect(isUid(uid)).toBe(true);
    expect(isUid(newUid())).toBe(true);
    expect(isUid('rdNeu')).toBe(false);
    expect(isUid('')).toBe(false);
    expect(newUid()).not.toBe(newUid());
  });

  it('puts the realm at /<uid> on the game host and /play/<uid> elsewhere', () => {
    expect(realmPath(uid, 'play')).toBe(`/${uid}`);
    expect(realmPath(uid, 'local')).toBe(`/play/${uid}`);
    expect(uidFromPath(`/${uid}`, 'play')).toBe(uid);
    expect(uidFromPath(`/${uid}/`, 'play')).toBe(uid);
    expect(uidFromPath(`/play/${uid}`, 'play')).toBe(uid);
    expect(uidFromPath(`/play/${uid}`, 'local')).toBe(uid);
    expect(uidFromPath(`/${uid}`, 'local')).toBeNull();
    expect(uidFromPath('/market', 'play')).toBeNull();
    expect(uidFromPath('/play/rdNeu', 'play')).toBeNull();
  });

  it('counts the id address as the online realm, and the id is not a name', () => {
    expect(isPlayPath(`/${uid}`, 'play')).toBe(true);
    expect(isPlayPath(`/${uid}`, 'local')).toBe(false);
    expect(isPlayPath('/market', 'play')).toBe(false);
    expect(nameFromPath(`/play/${uid}`)).toBeNull();
    const p = paramsFor(at(`/${uid}`), 'play');
    expect(p.has('online')).toBe(true);
    expect(p.has('name')).toBe(false);
    expect(paramsFor(at(`/${uid}`), 'local').has('online')).toBe(false);
    expect(prettyAddress(at(`/${uid}`, '?online'), 'play')).toBeNull();
  });

  it('has the lobby at the root of the game host', () => {
    expect(isGamePath('/', 'play')).toBe(true);
    expect(isGamePath('/', 'site')).toBe(false);
    expect(isGamePath('/game', 'local')).toBe(true);
    expect(gamePath('', 'play')).toBe('/');
    expect(gamePath('?home', 'play')).toBe('/?home');
    expect(gamePath('', 'local')).toBe('/game');
  });

  it('links between the hosts with absolute addresses, and stays put locally', () => {
    expect(siteUrl('/market', 'play', 'solrift.io')).toBe('https://solrift.io/market');
    expect(siteUrl('/market', 'local')).toBe('/market');
    expect(lobbyUrl({ way: 'multi', mode: 'survival' }, 'site', 'solrift.io')).toBe('https://play.solrift.io/?way=multi&mode=survival');
    expect(lobbyUrl({}, 'site', 'solrift.io')).toBe('https://play.solrift.io/');
    expect(lobbyUrl({ way: 'multi' }, 'local')).toBe('/game');
    expect(titleAddress(`/${uid}`, 'play', 'solrift.io')).toBe('https://solrift.io/');
    expect(titleAddress('/', 'play', 'solrift.io')).toBe('https://solrift.io/');
  });
});