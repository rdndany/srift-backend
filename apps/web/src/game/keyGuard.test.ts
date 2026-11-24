import { describe, expect, it } from 'vitest';
import { blockBrowserKey, exitPageFullscreen, fullscreenNow, isTypingTarget, keyboardLockApi, requestPageFullscreen, shouldEnterFullscreen, shouldRestoreWindow, wantKeyboardLock, type FullscreenHost } from './keyGuard';

describe('keys kept from the browser while playing', () => {
  const block = (code: string, over: Partial<{ playing: boolean; cancelable: boolean; typing: boolean }> = {}) =>
    blockBrowserKey(over.playing ?? true, code, over.cancelable ?? true, over.typing ?? false);

  it('stops Ctrl+Shift+Space, and both sides of Ctrl, Shift and Alt', () => {
    expect(block('Space')).toBe(true);
    for (const code of ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight']) {
      expect(block(code), code).toBe(true);
    }
  });

  it('stops movement and action keys together, and a repeated Shift', () => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyQ', 'ShiftLeft']) expect(block(code)).toBe(true);
    expect(block('ShiftLeft')).toBe(true);
  });

  it('leaves Escape and F11 to the browser, so pause and fullscreen still work', () => {
    expect(block('Escape')).toBe(false);
    expect(block('F11')).toBe(false);
  });

  it('does nothing while a menu, the chat, or a login field has the keys', () => {
    expect(block('Space', { playing: false })).toBe(false);
    expect(block('KeyT', { typing: true })).toBe(false);
    expect(isTypingTarget('INPUT')).toBe(true);
    expect(isTypingTarget('TEXTAREA')).toBe(true);
    expect(isTypingTarget('SELECT')).toBe(true);
    expect(isTypingTarget('DIV', true)).toBe(true);
    expect(isTypingTarget('DIV')).toBe(false);
  });

  it('does not call preventDefault on a key the browser will not cancel', () => {
    expect(block('KeyW', { cancelable: false })).toBe(false);
  });
});

describe('fullscreen for a visit', () => {
  const host = (full: boolean): FullscreenHost & { entered: number; left: number } => ({
    fullscreenElement: full ? ({} as Element) : null,
    documentElement: {
      requestFullscreen() {
        hostNow.entered++;
        hostNow.fullscreenElement = {} as Element;
      },
    },
    exitFullscreen() {
      hostNow.left++;
      hostNow.fullscreenElement = null;
    },
    entered: 0,
    left: 0,
  });
  let hostNow: ReturnType<typeof host>;

  it('asks when the player comes in from a window, and not again after it has taken', () => {
    expect(shouldEnterFullscreen(null, false, false)).toBe(true);
    expect(shouldEnterFullscreen(false, false, false)).toBe(true);
    expect(shouldEnterFullscreen(false, false, true)).toBe(false);
    expect(shouldEnterFullscreen(false, true, false)).toBe(false);
    expect(shouldEnterFullscreen(true, false, false)).toBe(false);
  });

  it('steps back out only when this visit turned fullscreen on', () => {
    expect(shouldRestoreWindow(false, true)).toBe(true);
    expect(shouldRestoreWindow(false, false)).toBe(false);
    expect(shouldRestoreWindow(true, true)).toBe(false);
    expect(shouldRestoreWindow(null, true)).toBe(false);
  });

  it('uses the standard request, and Safari’s older name, and ignores a page that is already fullscreen', async () => {
    hostNow = host(false);
    await requestPageFullscreen(hostNow);
    expect(hostNow.entered).toBe(1);
    await requestPageFullscreen(hostNow);
    expect(hostNow.entered).toBe(1);
    const webkit = {
      fullscreenElement: null,
      documentElement: { webkitRequestFullscreen: () => undefined },
    };
    await expect(requestPageFullscreen(webkit)).resolves.toBeUndefined();
    await expect(requestPageFullscreen({ fullscreenElement: null, documentElement: {} })).rejects.toThrow('no fullscreen');
  });

  it('leaves fullscreen through whichever exit the browser has', async () => {
    hostNow = host(true);
    await exitPageFullscreen(hostNow);
    expect(hostNow.left).toBe(1);
    await exitPageFullscreen(hostNow);
    expect(hostNow.left).toBe(1);
  });
});

describe('keyboard lock', () => {
  it('is wanted only in fullscreen, while playing, with the tab in front', () => {
    expect(wantKeyboardLock(true, true, true, false)).toBe(true);
    expect(wantKeyboardLock(true, false, true, false)).toBe(false);
    expect(wantKeyboardLock(false, true, true, false)).toBe(false);
    expect(wantKeyboardLock(true, true, false, false)).toBe(false);
    expect(wantKeyboardLock(true, true, true, true)).toBe(false);
  });

  it('sees Safari fullscreen under its older name', () => {
    expect(fullscreenNow({ fullscreenElement: null, webkitFullscreenElement: {} as Element })).toBe(true);
    expect(fullscreenNow({ fullscreenElement: null })).toBe(false);
  });

  it('uses the API only when lock and unlock are both there, so a missing or refused one is ignored', () => {
    expect(keyboardLockApi({})).toBeNull();
    expect(keyboardLockApi({ keyboard: null })).toBeNull();
    expect(keyboardLockApi({ keyboard: { lock() { return Promise.resolve(); } } })).toBeNull();
    const api = { lock: () => Promise.resolve(), unlock: () => undefined };
    expect(keyboardLockApi({ keyboard: api })).toBe(api);
  });
});
