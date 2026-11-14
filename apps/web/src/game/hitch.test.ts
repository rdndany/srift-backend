import { describe, expect, it } from 'vitest';
import { HitchLog, describeHitch, hitchShaders, type Hitch } from './hitch';

/** A log on a clock the test moves. */
function make(threshold = 100) {
  const clock = { t: 0 };
  const log = new HitchLog(threshold, () => clock.t);
  /** The work of the frame before, which the clock has already moved by. */
  let spent = 0;
  /** A frame that begins `gap` ms after the last, with these parts of work (ms each). Returns what the log tells of at its start. */
  const frame = (gap: number, parts: Record<string, number> = {}, shaders: string[] = []) => {
    clock.t += gap - spent;
    const hitch = log.begin(clock.t, gap);
    spent = 0;
    for (const [name, ms] of Object.entries(parts)) {
      clock.t += ms;
      spent += ms;
      log.lap(name);
    }
    log.end(shaders);
    return hitch;
  };
  /** Frames on time until the log tells of a freeze (it waits a moment for the browser's word on the page's other work). */
  const told = (): Hitch | null => {
    for (let i = 0; i < 30; i++) {
      const h = frame(16, { draw: 4 });
      if (h) return h;
    }
    return null;
  };
  return { clock, log, frame, told };
}

describe('HitchLog', () => {
  it('says nothing while the frames come on time', () => {
    const { frame, told } = make();
    for (let i = 0; i < 5; i++) expect(frame(16, { draw: 4 })).toBeNull();
    // (One just under the mark is not a freeze either.)
    expect(frame(99, { draw: 4 })).toBeNull();
    expect(told()).toBeNull();
  });

  it('puts a freeze down to the work of the frame before it, part by part', () => {
    const { frame, told } = make();
    frame(16, { draw: 4 });
    frame(16, { input: 2, effects: 70, draw: 130 }, ['MeshBasicMaterial', 'SpriteMaterial']);
    // Not at once: a quarter of a second later.
    expect(frame(210, { draw: 4 })).toBeNull();
    const h = told()!;
    expect(h.ms).toBe(210);
    expect(h.game).toBe(202);
    expect(h.parts).toEqual([
      ['draw', 130],
      ['effects', 70],
      ['input', 2],
    ]);
    expect(h.rest).toBe(8);
    expect(h.shaders).toEqual(['MeshBasicMaterial', 'SpriteMaterial']);
    expect(describeHitch(h)).toBe('210 ms: game 202 (draw 130, effects 70), page 0, rest 8, 2 shaders');
    expect(hitchShaders(h)).toBe(' (MeshBasicMaterial, SpriteMaterial)');
    // Told once.
    expect(told()).toBeNull();
  });

  it('names the shaders built in the frame, each kind once with how many', () => {
    const hitch = (shaders: string[]): Hitch => ({ ms: 200, at: 0, game: 190, parts: [], page: 0, rest: 10, shaders });
    expect(hitchShaders(hitch([]))).toBe('');
    expect(hitchShaders(hitch(['MeshBasicMaterial', 'ShaderMaterial', 'MeshBasicMaterial', 'MeshBasicMaterial']))).toBe(' (MeshBasicMaterial x3, ShaderMaterial)');
  });

  it('adds up a part that is come back to', () => {
    const { log, clock, frame, told } = make();
    frame(16);
    clock.t += 16;
    log.begin(clock.t, 16);
    for (const [name, ms] of [['things', 3], ['effects', 5], ['things', 4]] as const) {
      clock.t += ms;
      log.lap(name);
    }
    log.end([]);
    clock.t += 300 - 12;
    log.begin(clock.t, 300);
    log.end([]);
    expect(told()!.parts).toEqual([
      ['things', 7],
      ['effects', 5],
    ]);
  });

  it('tells the page’s other work from what neither the game nor the page did, also when the browser reports it late', () => {
    const { log, clock, frame, told } = make();
    frame(16, { draw: 4 });
    frame(16, { draw: 6 });
    const after = clock.t;
    frame(1000, { draw: 4 });
    // The frame itself (a long task when it is long) is not other work; one that began after it is; one after the freeze is not.
    log.task(after - 6, 6);
    log.task(after + 20, 400);
    log.task(clock.t + 5, 80);
    const h = told()!;
    expect(h.game).toBe(6);
    expect(h.page).toBe(400);
    expect(h.rest).toBe(594);
    expect(describeHitch(h)).toBe('1000 ms: game 6 (draw 6), page 400, rest 594');
  });

  it('counts other work that kept the frame before from starting on time', () => {
    const { log, clock, frame, told } = make();
    frame(16, { draw: 4 });
    // The next frame is due at 32, but something holds the page from 30 to 330: it only gets its turn then.
    log.task(30, 300);
    clock.t = 330;
    expect(log.begin(32, 16)).toBeNull();
    clock.t += 4;
    log.lap('draw');
    log.end([]);
    // The one after is due at 348: that is where the picture is seen to have stood still.
    clock.t = 348;
    expect(log.begin(348, 316)).toBeNull();
    log.end([]);
    const h = told()!;
    expect(h.ms).toBe(316);
    expect(h.game).toBe(4);
    expect(h.page).toBe(298);
    expect(h.rest).toBe(14);
  });

  it('tells of a freeze at once when the next one comes before the wait is over', () => {
    const { frame, told } = make();
    frame(16, { draw: 4 });
    frame(16, { draw: 4 });
    expect(frame(150, { draw: 4 })).toBeNull();
    expect(frame(120, { draw: 4 })!.ms).toBe(150);
    expect(told()!.ms).toBe(120);
  });
});
