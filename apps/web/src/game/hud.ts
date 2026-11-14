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
