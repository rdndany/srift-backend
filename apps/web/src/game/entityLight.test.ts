import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EntityLight } from './entityLight';

const out = () => new THREE.Color();

describe('EntityLight', () => {
  it('keeps a body in the open at daylight, and drops one under a roof to the dark of the blocks', () => {
    // x = 0 is open ground at y 10. Any other column has stone overhead at y 40.
    const light = new EntityLight((x) => (x === 0 ? 10 : 40));
    const open = light.at(0.5, 11, 0.5, out());
    expect(open.r).toBeGreaterThan(0.5);

    const cave = light.at(1.5, 11, 0.5, out());
    expect(cave.r).toBeLessThan(0.06);
    expect(cave.g).toBeLessThan(0.06);
    expect(cave.b).toBeLessThan(0.06);
  });

  it('a carried lantern lights a body in that dark, and not one far from it', () => {
    const light = new EntityLight(() => 40);
    light.setHeld([{ x: 5, y: 12, z: 5, r: 1, g: 0.7, b: 0.3, range: 14 }]);
    expect(light.at(5, 11, 5, out()).r).toBeGreaterThan(0.5);
    expect(light.at(5, 11, 30, out()).r).toBeLessThan(0.06);
  });
});
