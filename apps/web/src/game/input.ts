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

  private pressed = new Set<string>();
  /** Right-button presses not yet read by `consumeRightClick`. */
  private rightClicks = 0;
  /** Middle-button presses (mouse 3) not yet read by `consumeMiddleClick`. */
  private middleClicks = 0;

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
    });
    on('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const lim = Math.PI / 2 - 0.001;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
    on('keydown', (e) => {
      if (!this.locked) return;
      if (/^F\d+$/.test(e.code) || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    on('keyup', (e) => this.keys.delete(e.code));
    on('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.leftDown = true;
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
    on('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    });
    on('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll(), { signal });
  }

  private releaseAll(): void {
    this.keys.clear();
    this.leftDown = false;
    this.rightDown = false;
  }

  /** Ask for the mouse. Resolves true when it was given: a browser refuses without a recent click or key press. */
  lock(): Promise<boolean> {
    // Older browsers return undefined; newer ones a promise that rejects if the lock is refused.
    return Promise.resolve(this.target.requestPointerLock() as unknown).then(
      () => true,
      () => false,
    );
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
