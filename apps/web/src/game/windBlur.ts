interface Streak {
  /** Where it is, as a share of the screen (0..1), and which side of the middle it flies off to (-1 left, 1 right). */
  x: number;
  y: number;
  side: number;
  speed: number;
  length: number;
  width: number;
  age: number;
  life: number;
  tint: number;
}

/**
 * The wind of a fast dash, on the screen: the sides of the picture blur and fade to a pale haze, and streaks of air race
 * out past the edges (leaning the way the player is going: a dash to the right pulls them to the left). The middle of the
 * view stays sharp so the player can still aim. Only the picture changes, nothing here affects the game.
 */
export class WindBlur {
  private readonly root = document.createElement('div');
  private readonly blur = document.createElement('div');
  private readonly haze = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly streaks: Streak[] = [];
  private k = 0;
  private spawn = 0;
  private cw = 0;
  private ch = 0;

  constructor() {
    const r = this.root.style;
    r.position = 'fixed';
    r.inset = '0';
    r.pointerEvents = 'none';
    r.zIndex = '2';
    r.display = 'none';
    r.overflow = 'hidden';
    // The blur: everything behind it is smeared, but only towards the edges (a mask keeps the middle clear).
    const edge = 'radial-gradient(ellipse 62% 78% at 50% 50%, transparent 38%, rgba(0,0,0,0.55) 68%, #000 100%)';
    const b = this.blur.style;
    b.position = 'absolute';
    b.inset = '0';
    b.backdropFilter = 'blur(9px) saturate(1.15)';
    b.setProperty('-webkit-backdrop-filter', 'blur(9px) saturate(1.15)');
    b.maskImage = edge;
    b.setProperty('-webkit-mask-image', edge);
    // A pale haze on top of the blur, cooler and brighter at the very edge.
    const h = this.haze.style;
    h.position = 'absolute';
    h.inset = '0';
    h.background = 'radial-gradient(ellipse 66% 82% at 50% 50%, rgba(220,245,255,0) 45%, rgba(200,232,255,0.16) 78%, rgba(235,250,255,0.34) 100%)';
    // The streaks, drawn on a canvas (softened by the browser's own blur).
    const c = this.canvas.style;
    c.position = 'absolute';
    c.inset = '0';
    c.width = '100%';
    c.height = '100%';
    c.filter = 'blur(1.4px)';
    this.root.append(this.blur, this.haze, this.canvas);
    document.body.appendChild(this.root);
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * `target` is how strong the wind should be (0 none, 1 full); `lateral` is how much the player is going to the side of
   * where they look (-1 left, 1 right), which tilts the streaks.
   */
  update(dt: number, target: number, lateral: number): void {
    this.k += (target - this.k) * Math.min(1, dt * (target > this.k ? 16 : 6));
    if (this.k < 0.012 && target === 0) {
      if (this.root.style.display !== 'none') {
        this.root.style.display = 'none';
        this.streaks.length = 0;
      }
      return;
    }
    if (this.root.style.display === 'none') this.root.style.display = 'block';
    this.blur.style.opacity = String(Math.min(1, this.k * 1.1));
    this.haze.style.opacity = String(this.k);
    this.canvas.style.opacity = String(Math.min(1, this.k * 1.3));
    const ctx = this.ctx;
    if (!ctx) return;
    const w = Math.max(2, Math.round(window.innerWidth / 2));
    const h = Math.max(2, Math.round(window.innerHeight / 2));
    if (w !== this.cw || h !== this.ch) {
      this.cw = this.canvas.width = w;
      this.ch = this.canvas.height = h;
    }
    // new streaks, mostly at the sides
    this.spawn += dt * 95 * this.k;
    while (this.spawn >= 1 && this.streaks.length < 90) {
      this.spawn -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.streaks.push({
        x: 0.5 + side * (0.2 + Math.random() * 0.32),
        y: 0.04 + Math.random() * 0.92,
        side,
        speed: 1.5 + Math.random() * 2.2,
        length: 0.1 + Math.random() * 0.24,
        width: 0.8 + Math.random() * 1.9,
        age: 0,
        life: 0.22 + Math.random() * 0.28,
        tint: Math.random(),
      });
    }
    this.spawn = Math.min(this.spawn, 2);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.streaks.splice(i, 1);
        continue;
      }
      // out towards the edge and a little away from the middle line, pulled the opposite way to where the player goes
      const dir = s.side * 1 - lateral * 1.1;
      s.x += dir * s.speed * dt;
      s.y += (s.y - 0.5) * 0.35 * s.side * s.speed * dt;
      const u = s.age / s.life;
      const a = Math.sin(Math.PI * Math.min(1, u)) * 0.85 * Math.min(1, this.k * 1.2);
      const len = s.length * (0.6 + 0.8 * Math.min(1, this.k));
      const x1 = s.x * w;
      const y1 = s.y * h;
      const x2 = (s.x - Math.sign(dir) * len) * w;
      const y2 = (s.y - (s.y - 0.5) * 0.1 * s.side) * h;
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      const col = s.tint < 0.7 ? '240,250,255' : '205,238,255';
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
