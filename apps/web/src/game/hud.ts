/**
 * Imperative bits of the HUD that update every frame (debug text, break bar,
 * damage flash). Hotbar, vitals and inventory screens live in React.
 */
export class Hud {
  private debugEl = document.getElementById('debug')!;
  private breakEl = document.getElementById('break-progress') as HTMLElement;
  private breakFill = this.breakEl.firstElementChild as HTMLElement;
  private nameEl = document.getElementById('item-name')!;
  private underwater = document.getElementById('underwater')!;
  private damageEl = document.getElementById('damage')!;
  private netEl = document.getElementById('net')!;
  private hitEl = document.getElementById('hitmarker');
  private crossEl = document.getElementById('crosshair');
  private nameTimer = 0;
  private lastFlash = -1;
  debugVisible = false;

  /** Show a message above the hotbar for a couple of seconds. */
  toast(text: string): void {
    this.nameEl.textContent = text.replace(/_/g, ' ');
    this.nameEl.style.opacity = '1';
    this.nameTimer = 2;
  }

  setBreakProgress(p: number): void {
    this.breakEl.style.display = p > 0 ? 'block' : 'none';
    this.breakFill.style.width = `${Math.round(p * 100)}%`;
  }

  setUnderwater(v: boolean, lava = false): void {
    this.underwater.style.display = v ? 'block' : 'none';
    this.underwater.style.background = lava ? 'rgba(220, 80, 10, 0.55)' : '';
  }

  /** 0..1 red screen flash after taking damage. */
  setDamageFlash(v: number): void {
    const q = Math.round(v * 50) / 50;
    if (q === this.lastFlash) return;
    this.lastFlash = q;
    this.damageEl.style.opacity = String(q * 0.55);
  }

  /** A hit of yours landed: four ticks flash round the crosshair (white; orange for a critical hit, red for a headshot). */
  hitMarker(kind: 'hit' | 'crit' | 'head'): void {
    const el = this.hitEl;
    if (!el || typeof el.animate !== 'function') return;
    el.style.setProperty('--hm', kind === 'head' ? '#ff5a3c' : kind === 'crit' ? '#ffb347' : '#ffffff');
    const big = kind === 'hit' ? 1 : 1.3;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [
        { opacity: 1, transform: `translate(-50%, -50%) scale(${0.75 * big})` },
        { opacity: 1, transform: `translate(-50%, -50%) scale(${1.1 * big})`, offset: 0.35 },
        { opacity: 0, transform: `translate(-50%, -50%) scale(${1.25 * big})` },
      ],
      { duration: kind === 'hit' ? 220 : 340, easing: 'ease-out' },
    );
  }

  /** The crosshair pulses once (a bow at full draw). */
  crosshairPulse(): void {
    const el = this.crossEl;
    if (!el || typeof el.animate !== 'function') return;
    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ],
      { duration: 180, easing: 'ease-out' },
    );
  }

  setNet(text: string, ok: boolean): void {
    this.netEl.textContent = text;
    this.netEl.className = ok ? 'ok' : 'off';
  }

  tick(dt: number, debugText: string): void {
    if (this.nameTimer > 0) {
      this.nameTimer -= dt;
      if (this.nameTimer <= 0) this.nameEl.style.opacity = '0';
    }
    this.debugEl.style.display = this.debugVisible ? 'block' : 'none';
    if (this.debugVisible) this.debugEl.textContent = debugText;
  }
}
