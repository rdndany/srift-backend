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
  private lastVeil = -1;
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

  /**
   * The wash over the picture while the camera is in a fluid. `wash` is the biome's water colour and
   * how strong the veil is. Lava ignores the colour and paints the screen orange.
   */
  setUnderwater(v: boolean, lava = false, wash?: { r: number; g: number; b: number; veil: number }): void {
    this.underwater.classList.toggle('warp', v && !lava);
    this.underwater.style.display = v ? 'block' : 'none';
    if (!v) return;
    if (lava) {
      this.underwater.style.background = 'rgba(220, 80, 10, 0.55)';
      this.underwater.style.opacity = '1';
      this.lastVeil = -1;
      return;
    }
    const r = Math.round((wash?.r ?? 0.08) * 255);
    const g = Math.round((wash?.g ?? 0.28) * 255);
    const b = Math.round((wash?.b ?? 0.62) * 255);
    const veil = Math.round((wash?.veil ?? 0.4) * 40) / 40;
    const key = veil + r * 0.001 + g * 0.0001;
    if (key === this.lastVeil) return;
    this.lastVeil = key;
    const edge = Math.min(0.28, 0.08 + veil * 0.35);
    this.underwater.style.background = `radial-gradient(ellipse at 50% 42%, rgba(${r}, ${g}, ${b}, 0.04) 34%, rgba(${Math.round(r * 0.55)}, ${Math.round(g * 0.62)}, ${Math.round(b * 0.7)}, ${edge}) 100%)`;
    this.underwater.style.opacity = '1';
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
