/**
 * The admin bar: a strip of numbers at the top centre of the screen (F2) for whoever looks after the game. It answers
 * "is it running well, and if not, what is heavy": the frame rate and its hitches, what the frame draws, what the world
 * holds, memory and the connection. (Where the player is and what they look at is on the F3 screen.)
 */

/** The last frames' times, and what they add up to. */
export class FrameMeter {
  private readonly times: Float32Array;
  private readonly sorted: Float32Array;
  private next = 0;
  private count = 0;

  constructor(size = 240) {
    this.times = new Float32Array(size);
    this.sorted = new Float32Array(size);
  }

  get length(): number {
    return this.count;
  }

  push(ms: number): void {
    this.times[this.next] = ms;
    this.next = (this.next + 1) % this.times.length;
    if (this.count < this.times.length) this.count++;
  }

  /** The time of a frame, `back` frames ago (0 is the last one). */
  ago(back: number): number {
    const n = this.times.length;
    return this.times[(this.next - 1 - back + n * 2) % n];
  }

  /**
   * `fps` and `frame` (ms) are the mean of the last second and `worst` its longest frame; `low` is the frame rate of the
   * slowest hundredth of all the frames kept (the "1% low": what the hitches feel like).
   */
  summary(): { fps: number; frame: number; worst: number; low: number } {
    if (this.count === 0) return { fps: 0, frame: 0, worst: 0, low: 0 };
    let sum = 0;
    let frames = 0;
    let worst = 0;
    while (frames < this.count && sum < 1000) {
      const ms = this.ago(frames++);
      sum += ms;
      if (ms > worst) worst = ms;
    }
    const all = this.sorted.subarray(0, this.count);
    for (let i = 0; i < this.count; i++) all[i] = this.ago(i);
    all.sort();
    const slow = all[Math.min(this.count - 1, Math.floor(this.count * 0.99))];
    return { fps: sum > 0 ? (frames * 1000) / sum : 0, frame: sum / frames, worst, low: slow > 0 ? 1000 / slow : 0 };
  }
}

/** What the bar shows besides the frame itself; asked for only when the numbers are written (a few times a second). */
export interface AdminDetails {
  chunksMeshed: number;
  chunksLoaded: number;
  /** Chunks asked of the generator that have not come back yet. */
  chunksQueued: number;
  renderDistance: number;
  mobs: number;
  drops: number;
  /** Geometries, textures and shader programs the graphics card holds. */
  geometries: number;
  textures: number;
  programs: number;
  /** Shader programs built since the game started: each one stops the game for a moment, so it should stand still while playing. */
  programsBuilt: number;
  /** The last freeze and what it was made of (see `describeHitch`), or 'none'. */
  hitch: string;
  /** The size of the picture that is drawn, in real pixels. */
  width: number;
  height: number;
  /** How far the automatic quality has stepped down (0 = everything on). */
  quality: number;
  shadows: boolean;
  /** Online only: the round trip to the server in ms (null = no connection) and how many are playing. */
  net: { ping: number | null; players: number } | null;
}

type Tone = '' | 'good' | 'warn' | 'bad';

/** 1234 -> "1.2k", 1234567 -> "1.23M". */
export function short(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k`;
  return `${(n / 1e6).toFixed(2)}M`;
}

const GRAPH_W = 120;
const GRAPH_H = 26;
/** The frame time at the top of the graph. */
const GRAPH_MS = 50;

class Cell {
  private readonly value: HTMLElement;
  private text = '';
  private tone: Tone = '';
  readonly el: HTMLElement;

  constructor(parent: HTMLElement, label: string, title: string) {
    this.el = document.createElement('div');
    this.el.className = 'ab-cell';
    this.el.title = title;
    const k = document.createElement('span');
    k.className = 'ab-k';
    k.textContent = label;
    this.value = document.createElement('span');
    this.value.className = 'ab-v';
    this.el.append(k, this.value);
    parent.append(this.el);
  }

  set(text: string, tone: Tone = ''): void {
    if (text !== this.text) this.value.textContent = this.text = text;
    if (tone !== this.tone) this.value.className = (this.tone = tone) ? `ab-v ${tone}` : 'ab-v';
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }
}

export class AdminBar {
  readonly meter = new FrameMeter();
  private readonly cells: Record<'fps' | 'low' | 'frame' | 'worst' | 'hitch' | 'cpu' | 'draws' | 'tris' | 'shadows' | 'chunks' | 'things' | 'heap' | 'gpu' | 'ping' | 'players' | 'picture', Cell>;
  private readonly graph: CanvasRenderingContext2D | null;
  private on = false;
  private textWait = 0;
  private graphWait = 0;
  // Sums since the numbers were last written.
  private frames = 0;
  private cpu = 0;
  private calls = 0;
  private tris = 0;
  private shadowPeak = 0;

  constructor(private readonly root: HTMLElement, visible = false) {
    root.replaceChildren();
    const cell = (label: string, title: string): Cell => new Cell(root, label, title);
    const fps = cell('FPS', 'Frames a second, over the last second');
    const low = cell('1% LOW', 'The frame rate of the slowest frames in a hundred: what the hitches feel like');
    const frame = cell('FRAME', 'The mean time of a frame over the last second');
    const worst = cell('WORST', 'The longest frame of the last second');

    const canvas = document.createElement('canvas');
    canvas.width = GRAPH_W;
    canvas.height = GRAPH_H;
    canvas.className = 'ab-graph';
    canvas.title = `The time of each of the last ${GRAPH_W} frames (the lines are 60 and 30 frames a second)`;
    root.append(canvas);
    this.graph = canvas.getContext('2d');

    this.cells = {
      fps,
      low,
      frame,
      worst,
      cpu: cell('CPU', "The game's own work in a frame (the rest of the frame is the graphics card, or waiting)"),
      draws: cell('DRAWS', 'Draw calls in a frame: the world, the shadow maps, the effects and the hand'),
      tris: cell('TRIS', 'Triangles drawn in a frame'),
      shadows: cell('SHADOWS', 'The most triangles drawn into the shadow maps in one frame'),
      chunks: cell('CHUNKS', 'Chunks with a mesh / chunks loaded, the render distance, and how many are still being generated'),
      things: cell('MOBS / DROPS', 'Mobs and dropped items in the world'),
      heap: cell('MEMORY', 'Memory the page uses for its scripts'),
      gpu: cell('GPU', 'Geometries, textures and shader programs on the graphics card, and how many programs have been built since the game started'),
      ping: cell('PING', 'The round trip to the game server'),
      players: cell('PLAYERS', 'Players in this world'),
      picture: cell('PICTURE', 'The size the picture is drawn at, and how far the automatic quality has stepped down (q0 = everything on)'),
      hitch: cell(
        'LAST FREEZE',
        "The last time the picture stood still for 100 ms or more, and where that time went: the game's own work in the frame before (and its longest parts), other work of the page (the interface, a message from the server), and the rest, which is the browser and the graphics card; then the shaders built in that frame",
      ),
    };
    this.visible = visible;
  }

  get visible(): boolean {
    return this.on;
  }

  set visible(v: boolean) {
    this.on = v;
    this.root.classList.toggle('on', v);
    // The numbers start over: what went by while the bar was hidden is not known.
    this.frames = this.cpu = this.calls = this.tris = this.shadowPeak = 0;
    this.textWait = this.graphWait = 0;
  }

  /**
   * A frame went by (call it only while the bar is visible): `frameMs` since the one before, `cpuMs` of it spent in the
   * game's own code, with `calls` draw calls and `tris` triangles in all, `shadowTris` of them into the shadow maps.
   */
  frame(frameMs: number, cpuMs: number, calls: number, tris: number, shadowTris: number, details: () => AdminDetails): void {
    this.meter.push(frameMs);
    this.frames++;
    this.cpu += cpuMs;
    this.calls += calls;
    this.tris += tris;
    if (shadowTris > this.shadowPeak) this.shadowPeak = shadowTris;

    this.graphWait -= frameMs;
    if (this.graphWait <= 0) {
      this.graphWait = 100;
      this.drawGraph();
    }
    this.textWait -= frameMs;
    if (this.textWait > 0) return;
    this.textWait = 250;
    this.write(details());
    this.frames = this.cpu = this.calls = this.tris = this.shadowPeak = 0;
  }

  private write(d: AdminDetails): void {
    const c = this.cells;
    const s = this.meter.summary();
    const rate = (fps: number): Tone => (fps >= 55 ? 'good' : fps >= 30 ? 'warn' : 'bad');
    const time = (ms: number): Tone => (ms <= 20 ? 'good' : ms <= 34 ? 'warn' : 'bad');
    const fps = (v: number): string => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
    c.fps.set(fps(s.fps), rate(s.fps));
    c.low.set(fps(s.low), rate(s.low));
    c.frame.set(`${s.frame.toFixed(1)} ms`, time(s.frame));
    c.worst.set(`${s.worst.toFixed(0)} ms`, time(s.worst));

    const n = Math.max(1, this.frames);
    const cpu = this.cpu / n;
    c.cpu.set(`${cpu.toFixed(1)} ms`, cpu <= 8 ? 'good' : cpu <= 14 ? 'warn' : 'bad');
    c.draws.set(short(this.calls / n));
    c.tris.set(short(this.tris / n));
    c.shadows.set(d.shadows ? short(this.shadowPeak) : 'off');

    c.chunks.set(`${d.chunksMeshed}/${d.chunksLoaded} r${d.renderDistance}${d.chunksQueued ? ` +${d.chunksQueued}` : ''}`, d.chunksQueued || d.chunksMeshed < d.chunksLoaded ? 'warn' : '');
    c.things.set(`${d.mobs} / ${d.drops}`);

    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    c.heap.show(heap !== undefined);
    if (heap !== undefined) c.heap.set(`${Math.round(heap / 1048576)} MB`);
    c.gpu.set(`${short(d.geometries)} geo ${d.textures} tex ${d.programs} prog (${d.programsBuilt} built)`);
    c.hitch.set(d.hitch, d.hitch === 'none' ? '' : 'warn');

    c.ping.show(d.net !== null);
    c.players.show(d.net !== null);
    if (d.net) {
      const p = d.net.ping;
      c.ping.set(p === null ? 'offline' : `${p} ms`, p === null || p > 300 ? 'bad' : p > 150 ? 'warn' : 'good');
      c.players.set(String(d.net.players));
    }
    c.picture.set(`${d.width}x${d.height} q${d.quality}`, d.quality > 0 ? 'warn' : '');
  }

  /** A bar for each of the last frames, the newest on the right: a hitch stands out as a tall red one. */
  private drawGraph(): void {
    const g = this.graph;
    if (!g) return;
    g.clearRect(0, 0, GRAPH_W, GRAPH_H);
    const frames = Math.min(GRAPH_W, this.meter.length);
    for (let i = 0; i < frames; i++) {
      const ms = this.meter.ago(i);
      const h = Math.max(1, Math.min(GRAPH_H, Math.round((ms / GRAPH_MS) * GRAPH_H)));
      g.fillStyle = ms <= 20 ? '#5fd35f' : ms <= 34 ? '#ffd24a' : '#ff5a5a';
      g.fillRect(GRAPH_W - 1 - i, GRAPH_H - h, 1, h);
    }
    g.fillStyle = 'rgba(255, 255, 255, 0.28)';
    for (const ms of [1000 / 60, 1000 / 30]) g.fillRect(0, GRAPH_H - Math.round((ms / GRAPH_MS) * GRAPH_H), GRAPH_W, 1);
  }
}
