/**
 * What the browser is allowed to do with a key while the player is in the world.
 * Escape still leaves the mouse (the pause screen). F11 is the browser's own fullscreen key, and this game does not
 * take it. Everything else that the browser says can be cancelled is kept here, so a chord such as Ctrl+Shift+Space
 * does not scroll the page or run a shortcut. A shortcut the browser or the operating system refuses to hand over
 * still happens: this only asks.
 */

const PASS = new Set(['Escape', 'F11']);

/** A field the player is typing in. Those keystrokes belong to the field. */
export function isTypingTarget(tag: string, editable = false): boolean {
  return editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * True when this keydown should be kept from the browser. Only while playing, only when the event can be cancelled,
 * and never for a text field.
 */
export function blockBrowserKey(playing: boolean, code: string, cancelable: boolean, typing: boolean): boolean {
  if (!playing || typing || !cancelable) return false;
  return !PASS.has(code);
}

/** Fullscreen, by the standard element or Safari's older name. */
export function fullscreenNow(doc: { fullscreenElement: Element | null; webkitFullscreenElement?: Element | null }): boolean {
  return (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) != null;
}

/**
 * Ask for fullscreen when the player goes in from a windowed page, and keep asking until it takes.
 * Once it has, leave it: F11 can step back out without the next click forcing it on again.
 * A page that was already fullscreen is left as the player had it.
 */
export function shouldEnterFullscreen(priorFullscreen: boolean | null, isFullscreen: boolean, secured: boolean): boolean {
  if (secured || isFullscreen || priorFullscreen === true) return false;
  return true;
}

/** Leave fullscreen only when this visit turned it on and it is still on. */
export function shouldRestoreWindow(priorFullscreen: boolean | null, isFullscreen: boolean): boolean {
  return priorFullscreen === false && isFullscreen;
}

export interface FullscreenHost {
  fullscreenElement: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
  documentElement: {
    requestFullscreen?: () => Promise<void> | void;
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
}

/** The whole page, so the bars and the menus are inside it too. A browser that refuses (no click yet, or no such feature) rejects. */
export function requestPageFullscreen(doc: FullscreenHost): Promise<void> {
  if (fullscreenNow(doc)) return Promise.resolve();
  const el = doc.documentElement;
  const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!req) return Promise.reject(new Error('no fullscreen'));
  try {
    return Promise.resolve(req.call(el)).then(() => undefined);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('fullscreen refused'));
  }
}

/** Back to the window the player had before. Does nothing when the page is already windowed. */
export function exitPageFullscreen(doc: FullscreenHost): Promise<void> {
  if (!fullscreenNow(doc)) return Promise.resolve();
  const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
  if (!exit) return Promise.resolve();
  try {
    return Promise.resolve(exit.call(doc)).then(() => undefined);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('fullscreen exit refused'));
  }
}

/**
 * Keyboard Lock is asked for only in fullscreen, with the mouse captured, while the tab is the one in front.
 * Leaving any of those releases it. The browser may still refuse; play continues either way.
 */
export function wantKeyboardLock(playing: boolean, fullscreen: boolean, focused: boolean, hidden: boolean): boolean {
  return playing && fullscreen && focused && !hidden;
}

/**
 * What to do with Keyboard Lock. A held Escape keeps the lock until the key comes up: dropping it on the way down
 * makes that same tap leave fullscreen, and Escape then stops reaching the game.
 */
export function keyboardLockAction(want: boolean, escapeHeld: boolean): 'lock' | 'unlock' | 'hold' {
  if (want) return 'lock';
  if (escapeHeld) return 'hold';
  return 'unlock';
}

/** F11 is about to leave fullscreen. The lock has to be dropped first, or Escape stays captured once the window is back. */
export function unlockKeyboardForKey(code: string, fullscreen: boolean): boolean {
  return code === 'F11' && fullscreen;
}

/**
 * Fullscreen just ended. 'release' asks the browser to drop the mouse. 'reset' means it already dropped the mouse
 * and never said so, so the game still thinks it has it and a later Escape does nothing.
 */
export function mouseAfterFullscreen(fullscreen: boolean, pointerHeld: boolean, thinkHeld: boolean): 'release' | 'reset' | 'keep' {
  if (fullscreen) return 'keep';
  if (pointerHeld) return 'release';
  if (thinkHeld) return 'reset';
  return 'keep';
}

export interface KeyboardLock {
  lock(): Promise<void>;
  unlock(): void;
}

/** The Keyboard Lock API when this browser has it (Chrome and Edge). Safari and the rest get null, and the key guard stands alone. */
export function keyboardLockApi(nav: object): KeyboardLock | null {
  const k = (nav as { keyboard?: { lock?: unknown; unlock?: unknown } | null }).keyboard;
  if (!k || typeof k.lock !== 'function' || typeof k.unlock !== 'function') return null;
  return k as KeyboardLock;
}
