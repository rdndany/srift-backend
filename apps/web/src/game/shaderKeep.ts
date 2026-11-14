import type * as THREE from 'three';

/**
 * Keeps shader programs once they are built.
 *
 * three.js frees a program when the last material that uses it is disposed, and builds it again (a compile and a link, during
 * which the game stands still) for the next material of that kind. Things that come and go make and dispose their materials each
 * time (an ability's effect, a damage number, a dropped item, a mob), so the same few programs were built over and over: 3 to 9
 * of them at every use of an ability.
 *
 * `hold` (once a frame) takes a share in every program of three's own materials, so it is never freed. A material with shaders
 * of its own (a ShaderMaterial) cannot be held that way: when its last material goes, three forgets the shader text too and gives
 * the next one a new number, so the old program would never be found again. Those are kept by `retire`, which is called instead
 * of `dispose`: the first material of each such program stays alive, and with it the program.
 */

/** What three.js knows of a program (WebGLProgram): `type` is the material's type, `usedTimes` how many materials share it. */
interface Program {
  type?: string;
  name?: string;
  usedTimes: number;
}

/** The part of the renderer this needs (so it can be tested without a graphics card). */
export interface ProgramSource {
  info: { programs: unknown[] | null };
  properties: { get(material: unknown): unknown };
}

const own = (p: Program): boolean => p.type === 'ShaderMaterial' || p.type === 'RawShaderMaterial';

export class ShaderKeeper {
  private readonly seen = new WeakSet<object>();
  private readonly kept = new Map<object, THREE.Material>();
  /** Programs built since the game started (it stops climbing once everything has been seen once). */
  built = 0;
  /** The programs built in the frame `hold` was last called for: the type of material each is for. */
  readonly fresh: string[] = [];

  constructor(private readonly renderer: ProgramSource) {}

  /** Once a frame, after drawing: hold what was built in it. */
  hold(): void {
    if (this.fresh.length) this.fresh.length = 0;
    const list = this.renderer.info.programs as Program[] | null;
    if (!list) return;
    for (const p of list) {
      if (this.seen.has(p)) continue;
      this.seen.add(p);
      this.built++;
      this.fresh.push(p.name || p.type || '?');
      if (!own(p)) p.usedTimes++;
    }
  }

  /** Instead of `material.dispose()`, for a material with shaders of its own that is made anew each time. */
  retire(material: THREE.Material): void {
    const programs = (this.renderer.properties.get(material) as { programs?: Map<string, Program> }).programs;
    let keep = false;
    if (programs) {
      for (const p of programs.values()) {
        if (!own(p) || this.kept.has(p)) continue;
        this.kept.set(p, material);
        keep = true;
      }
    }
    if (!keep) material.dispose();
  }

  /** The game is over: let go of the materials that were kept (the programs go with the renderer). */
  dispose(): void {
    for (const m of new Set(this.kept.values())) m.dispose();
    this.kept.clear();
  }
}
