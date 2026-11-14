import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { ShaderKeeper } from './shaderKeep';

/** A renderer as three.js keeps its programs: a list of them, and for each material the programs it has been drawn with. */
function fakeRenderer() {
  const programs: { type: string; name: string; usedTimes: number }[] = [];
  const drawn = new Map<object, { programs?: Map<string, (typeof programs)[number]> }>();
  const material = (): THREE.Material & { gone: boolean } => {
    const m = { gone: false, dispose: () => void (m.gone = true) };
    return m as unknown as THREE.Material & { gone: boolean };
  };
  /** Draw a material: it takes a share in the program of its kind, which is built if nobody has it. */
  const draw = (m: object, type: string, key = type): (typeof programs)[number] => {
    let p = programs.find((q) => q.name === key);
    if (p) p.usedTimes++;
    else programs.push((p = { type, name: key, usedTimes: 1 }));
    drawn.set(m, { programs: new Map([[key, p]]) });
    return p;
  };
  /** What three does when a material is disposed: give the share back, and free the program nobody holds. */
  const release = (p: (typeof programs)[number]): void => {
    if (--p.usedTimes === 0) programs.splice(programs.indexOf(p), 1);
  };
  return { programs, material, draw, release, source: { info: { programs }, properties: { get: (m: unknown) => drawn.get(m as object) ?? {} } } };
}

describe('ShaderKeeper', () => {
  it('holds a program of three.js once, so it outlives the last material that used it', () => {
    const r = fakeRenderer();
    const keeper = new ShaderKeeper(r.source);
    const p = r.draw(r.material(), 'MeshBasicMaterial');
    keeper.hold();
    keeper.hold();
    expect(p.usedTimes).toBe(2);
    expect(keeper.built).toBe(1);
    r.release(p);
    expect(r.programs).toContain(p);
    // The next material of the kind finds it: nothing is built.
    r.draw(r.material(), 'MeshBasicMaterial');
    keeper.hold();
    expect(keeper.built).toBe(1);
    expect(r.programs).toHaveLength(1);
  });

  it('says what was built in the frame, and only in that frame', () => {
    const r = fakeRenderer();
    const keeper = new ShaderKeeper(r.source);
    r.draw(r.material(), 'MeshBasicMaterial');
    r.draw(r.material(), 'SpriteMaterial');
    keeper.hold();
    expect(keeper.fresh).toEqual(['MeshBasicMaterial', 'SpriteMaterial']);
    keeper.hold();
    expect(keeper.fresh).toEqual([]);
  });

  it('does not hold a program of a material with its own shaders, and keeps the first such material instead', () => {
    const r = fakeRenderer();
    const keeper = new ShaderKeeper(r.source);
    const first = r.material();
    const second = r.material();
    const p = r.draw(first, 'ShaderMaterial');
    r.draw(second, 'ShaderMaterial');
    keeper.hold();
    expect(p.usedTimes).toBe(2);
    keeper.retire(first);
    keeper.retire(second);
    expect(first.gone).toBe(false);
    expect(second.gone).toBe(true);
    keeper.dispose();
    expect(first.gone).toBe(true);
  });

  it('disposes a retired material of three.js, and one that was never drawn', () => {
    const r = fakeRenderer();
    const keeper = new ShaderKeeper(r.source);
    const basic = r.material();
    const unseen = r.material();
    r.draw(basic, 'MeshBasicMaterial');
    keeper.hold();
    keeper.retire(basic);
    keeper.retire(unseen);
    expect(basic.gone).toBe(true);
    expect(unseen.gone).toBe(true);
  });
});
