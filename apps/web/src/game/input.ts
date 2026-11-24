import { blockBrowserKey, fullscreenNow, isTypingTarget, keyboardLockApi, wantKeyboardLock } from './keyGuard';

export class Input {
  readonly keys = new Set<string>();
  yaw = 0;
  pitch = 0;
  locked = false;
  /** Accumulated wheel ticks since last read (positive = scroll down). */
  wheel = 0;
  leftDown = false;
  rightDown = false;
  sensitivity = 0.0022;
  /** Moving the mouse up looks down (a setting). */
  invertY = false;

  private pressed = new Set<string>();
  /** Right-button presses not yet read by `consumeRightClick`. */
  private rightClicks = 0;
  /** Left-button presses not yet read by `consumeLeftClick` (the Land Surveyor marks a corner at each one). */
  private leftClicks = 0;
  /** Middle-button presses (mouse 3) not yet read by `consumeMiddleClick`. */
  private middleClicks = 0;
  /** The last decision about Keyboard Lock, so a lock that finishes late cannot grab the keys after the player has left. */
  private wantLock = false;
  /** When Escape was pressed. A later unlock is the pause screen; one the browser caused on its own is not. */
  private escapeAt = -1e9;

  /** All listeners are removed when `signal` aborts. */
  constructor(
    private readonly target: HTMLElement,
    signal: AbortSignal,
  ) {
    const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void) =>
      document.addEventListener(type, fn, { signal });

    on('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) this.releaseAll();
      this.syncKeyboard();
    });
    on('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
      const lim = Math.PI / 2 - 0.001;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
    on('keydown', (e) => {
      if (!this.locked) return;
      const typing = this.typing(e);
      if (blockBrowserKey(true, e.code, e.cancelable, typing)) e.preventDefault();
      if (typing) return;
      // With the keyboard locked, the browser no longer lets Escape go of the mouse. The pause screen is that release.
      if (e.code === 'Escape' && !e.repeat) {
        this.escapeAt = performance.now();
        if (document.pointerLockElement) document.exitPointerLock();
      }
      // A key held down repeats. The hold is one key; the press is counted once.
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    on('keyup', (e) => {
      if (this.locked && blockBrowserKey(true, e.code, e.cancelable, this.typing(e))) e.preventDefault();
      this.keys.delete(e.code);
    });
    on('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.leftDown = true;
        this.leftClicks++;
      }
      if (e.button === 2) {
        this.rightDown = true;
        this.rightClicks++;
      }
      if (e.button === 1) {
        e.preventDefault(); // no auto-scroll circle
        this.middleClicks++;
      }
    });
    on('mouseup', (e) => {
      if (e.button === 0) this.leftDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    document.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
        if (e.cancelable) e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { signal, passive: false },
    );
    on('contextmenu', (e) => e.preventDefault());
    on('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
      this.syncKeyboard();
    });
    on('fullscreenchange', () => this.onFullscreen());
    document.addEventListener('webkitfullscreenchange', () => this.onFullscreen(), { signal });
    window.addEventListener(
      'blur',
      () => {
        this.releaseAll();
        this.syncKeyboard();
      },
      { signal },
    );
    window.addEventListener('focus', () => this.syncKeyboard(), { signal });
  }

  private typing(e: KeyboardEvent): boolean {
    const el = e.target instanceof HTMLElement ? e.target : null;
    return isTypingTarget(el?.tagName ?? '', el?.isContentEditable === true);
  }

  /** Fullscreen ended: drop every held key, because the browser may have swallowed the matching key-up. */
  private onFullscreen(): void {
    if (!fullscreenNow(document)) this.releaseAll();
    this.syncKeyboard();
  }

  /**
   * Ask Chrome and Edge to keep the keyboard while the game is fullscreen. Anywhere else, or in Safari, this does
   * nothing and the key guard above is the whole protection. A refusal is ignored: play goes on.
   */
  private syncKeyboard(): void {
    const kb = keyboardLockApi(navigator);
    if (!kb) return;
    const want = wantKeyboardLock(this.locked, fullscreenNow(document), document.hasFocus(), document.hidden);
    this.wantLock = want;
    if (!want) {
      try {
        kb.unlock();
      } catch {
        // Already free.
      }
      return;
    }
    void kb.lock().then(
      () => {
        if (this.wantLock) return;
        try {
          kb.unlock();
        } catch {
          // Already free.
        }
      },
      () => undefined,
    );
  }

  private releaseAll(): void {
    this.keys.clear();
    this.pressed.clear();
    this.leftDown = false;
    this.rightDown = false;
    this.leftClicks = 0;
    this.rightClicks = 0;
    this.middleClicks = 0;
    this.wheel = 0;
  }

  /** Either side of Shift, Ctrl or Alt. */
  mod(which: 'shift' | 'ctrl' | 'alt'): boolean {
    if (which === 'shift') return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (which === 'ctrl') return this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    return this.keys.has('AltLeft') || this.keys.has('AltRight');
  }

  /** True when Escape was pressed a moment ago, so this loss of the mouse is the pause screen. */
  escapeJustNow(): boolean {
    return performance.now() - this.escapeAt < 500;
  }

  /** Ask for the mouse. Resolves true when it was given: a browser refuses without a recent click or key press. */
  lock(): Promise<boolean> {
    const granted = (): boolean => this.locked || document.pointerLockElement === this.target;
    try {
      const asked = this.target.requestPointerLock() as unknown;
      // A promise means the browser reports the real result. A second ask while one is waiting rejects, even if the first one got the mouse.
      if (asked && typeof (asked as Promise<unknown>).then === 'function') return (asked as Promise<unknown>).then(granted, granted);
    } catch {
      return Promise.resolve(granted());
    }
    // Older browsers return nothing and grant the mouse on the lock event.
    return Promise.resolve(true);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** True once per physical key press. */
  wasPressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** True once per press of the right mouse button. */
  consumeRightClick(): boolean {
    const was = this.rightClicks > 0;
    this.rightClicks = 0;
    return was;
  }

  /** True once per press of the left mouse button. */
  consumeLeftClick(): boolean {
    const was = this.leftClicks > 0;
    this.leftClicks = 0;
    return was;
  }

  /** True once per press of the middle mouse button (mouse 3). */
  consumeMiddleClick(): boolean {
    const was = this.middleClicks > 0;
    this.middleClicks = 0;
    return was;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
}
