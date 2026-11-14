/**
 * What a freeze was made of. The admin bar's WORST says how long the picture stood still; this says where that time went:
 * the game's own work in the frame before it (and which part of it), other work on the page (the interface drawing itself,
 * a message from the server), and the rest, which is the browser and the graphics card (a shader being compiled, the page's
 * layers being put together). The game shows the last one on the admin bar and writes each to the console.
 */
export interface Hitch {
  /** How long the picture stood still, and when it moved again (on the clock of `performance.now()`), in ms. */
  ms: number;
  at: number;
  /** The game's own work in the frame before it, and its parts from the longest down. */
  game: number;
  parts: [name: string, ms: number][];
  /** Other work on the page's thread in that time, counted when it held the thread for 50 ms or more. */
  page: number;
  /** What is left: not the page's doing, as far as the page can tell. */
  rest: number;
  /** The shader programs built in that frame (the type of material each is for). */
  shaders: string[];
}

interface Frame {
  start: number;
  end: number;
  parts: Map<string, number>;
  shaders: string[];
}

/** How long after a freeze it is told of (ms): the browser reports the page's long tasks a moment after they end. */
const SETTLE = 250;

export class HitchLog {
  private frame: Frame | null = null;
  private mark = 0;
  private tasks: { at: number; ms: number }[] = [];
  private readonly observer: PerformanceObserver | null = null;

  /** `threshold`: how long the picture has to stand still to count (ms). */
  constructor(
    private readonly threshold = 100,
    private readonly now: () => number = () => performance.now(),
  ) {
    try {
      // The browser tells of every stretch of 50 ms or more in which the page's thread was busy.
      this.observer = new PerformanceObserver((list) => this.take(list.getEntries()));
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // (A browser that does not tell: the page's other work is counted with the rest.)
      this.observer = null;
    }
  }

  private take(entries: PerformanceEntryList): void {
    for (const e of entries) this.task(e.startTime, e.duration);
  }

  /** The page's thread was busy for `ms` from `at` (the browser's report of a long task). */
  task(at: number, ms: number): void {
    this.tasks.push({ at, ms });
    if (this.tasks.length > 64) this.tasks.shift();
  }

  /** A freeze that is not told of yet, with the frame before it: the browser's word on what else the page did comes a little later. */
  private pending: { hitch: Hitch; frame: Frame } | null = null;

  /**
   * A frame begins: `stamp` is the time the browser gives it (when it was due, which is what the picture shows; a busy
   * page gets to it later) and `gap` the ms since the stamp of the one before. Returns a freeze once it is known what it was
   * made of: a quarter of a second after it (or at the next one, if that comes sooner).
   */
  begin(stamp: number, gap: number): Hitch | null {
    const now = this.now();
    const before = this.frame;
    this.frame = { start: now, end: now, parts: new Map(), shaders: [] };
    this.mark = now;
    const frozen = gap >= this.threshold ? before : null;
    let told: Hitch | null = null;
    const p = this.pending;
    if (p && (frozen || now - p.hitch.at >= SETTLE)) {
      if (this.observer) this.take(this.observer.takeRecords());
      const h = p.hitch;
      // Whatever held the page's thread between the two stamps; the frame's own work is such a task too, and is the game's.
      for (const t of this.tasks) {
        const overlap = Math.min(t.at + t.ms, h.at) - Math.max(t.at, h.at - h.ms);
        const own = t.at <= p.frame.start && t.at + t.ms >= p.frame.end - 1;
        h.page += Math.max(0, overlap - (own ? h.game : 0));
      }
      h.rest = Math.max(0, h.ms - h.game - h.page);
      told = h;
      this.pending = null;
    }
    if (frozen) {
      const game = frozen.end - frozen.start;
      const parts = [...frozen.parts.entries()].sort((a, b) => b[1] - a[1]);
      this.pending = { hitch: { ms: gap, at: stamp, game, parts, page: 0, rest: 0, shaders: frozen.shaders }, frame: frozen };
    }
    return told;
  }

  /** A part of the frame is done: the time since the last one (or since the frame began) is put under `name`. */
  lap(name: string): void {
    const f = this.frame;
    if (!f) return;
    const now = this.now();
    f.parts.set(name, (f.parts.get(name) ?? 0) + now - this.mark);
    this.mark = now;
  }

  /** The frame's work is done; `shaders` are the programs built in it. */
  end(shaders: readonly string[]): void {
    const f = this.frame;
    if (!f) return;
    f.end = this.now();
    if (shaders.length) f.shaders = [...shaders];
  }

  dispose(): void {
    this.observer?.disconnect();
  }
}

/** "1145 ms: game 62 (draw 40, effects 15), page 0, rest 1083, 7 shaders". */
export function describeHitch(h: Hitch, parts = 2): string {
  const top = h.parts
    .filter(([, ms]) => ms >= 1)
    .slice(0, parts)
    .map(([name, ms]) => `${name} ${ms.toFixed(0)}`)
    .join(', ');
  return `${h.ms.toFixed(0)} ms: game ${h.game.toFixed(0)}${top ? ` (${top})` : ''}, page ${h.page.toFixed(0)}, rest ${h.rest.toFixed(0)}${h.shaders.length ? `, ${h.shaders.length} shader${h.shaders.length > 1 ? 's' : ''}` : ''}`;
}

/** Which shaders were built in the frame of a freeze, to go after `describeHitch`: " (MeshBasicMaterial x3, ShaderMaterial)", or nothing. */
export function hitchShaders(h: Hitch): string {
  const counts = new Map<string, number>();
  for (const s of h.shaders) counts.set(s, (counts.get(s) ?? 0) + 1);
  const names = [...counts].map(([name, n]) => (n > 1 ? `${name} x${n}` : name));
  return names.length ? ` (${names.join(', ')})` : '';
}
