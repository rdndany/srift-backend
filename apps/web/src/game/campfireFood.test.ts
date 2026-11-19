import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { campfireId } from '@solrift/shared';
import { CampfireFood } from './campfireFood';

function piece(): THREE.Object3D {
  return new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.05), new THREE.MeshBasicMaterial());
}

describe('food on a campfire', () => {
  it('lays each piece on the logs, and takes it off when the place is empty', () => {
    const food = new CampfireFood(piece, () => campfireId(2, true));
    food.sync([{ x: 4, y: 10, z: 6, slots: [1, 0, 0, 3] }]);
    expect(food.group.children).toHaveLength(2);
    for (const child of food.group.children) {
      expect(child.position.y).toBeCloseTo(10.5);
      expect(child.position.x).toBeGreaterThan(4);
      expect(child.position.x).toBeLessThan(5);
      expect(child.position.z).toBeGreaterThan(6);
      expect(child.position.z).toBeLessThan(7);
    }
    food.sync([{ x: 4, y: 10, z: 6, slots: [1, 0, 0, 0] }]);
    expect(food.group.children).toHaveLength(1);
    food.sync([]);
    expect(food.group.children).toHaveLength(0);
    food.dispose();
  });
});
