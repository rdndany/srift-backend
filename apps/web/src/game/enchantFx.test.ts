import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { I, toolId } from '@solrift/shared';
import { figureGlows } from './character';
import { addAura, stripAura } from './enchantFx';

/** A little voxel-like model: one lit mesh under a group, the way a held item is built. */
function model(): THREE.Group {
  const root = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  blade.position.y = 2;
  root.add(blade);
  return root;
}

const auras = (root: THREE.Object3D): THREE.Object3D[] => {
  const found: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.aura) found.push(o);
  });
  return found;
};

describe('the glow of an enchanted piece', () => {
  it('lays a tint, a glow and sparks over the model without touching the model', () => {
    const root = model();
    const before = root.children.length;
    addAura(root, '#ff7a30');
    const found = auras(root);
    expect(found.filter((o) => o instanceof THREE.Mesh)).toHaveLength(2);
    expect(found.filter((o) => o instanceof THREE.Points)).toHaveLength(1);
    expect(root.children.length).toBeGreaterThan(before);
    expect((root.children[0] as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('is laid once, however many times it is asked for', () => {
    const root = model();
    addAura(root, '#ff7a30');
    const n = auras(root).length;
    addAura(root, '#40a0ff');
    expect(auras(root)).toHaveLength(n);
  });

  it('is taken off again completely, and a clone made after that carries none', () => {
    const root = model();
    addAura(root, '#ff7a30');
    stripAura(root);
    expect(auras(root)).toHaveLength(0);
    expect(auras(root.clone())).toHaveLength(0);
  });

  it('can be stripped from a clone without touching the original', () => {
    const root = model();
    addAura(root, '#ff7a30');
    const n = auras(root).length;
    const copy = root.clone();
    stripAura(copy);
    expect(auras(copy)).toHaveLength(0);
    expect(auras(root)).toHaveLength(n);
  });

  it('leaves a model of several materials alone', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]));
    addAura(root, '#ff7a30');
    expect(auras(root).filter((o) => o instanceof THREE.Mesh)).toHaveLength(0);
  });
});

describe('what a figure carries glows', () => {
  it('sends a glow to the shield arm for a shield in either hand, and to the hand for the rest', () => {
    const shield = I.SHIELD;
    const sword = toolId('sword', 'iron');
    // main hand sword, shield in the off hand: each keeps its own glow
    expect(figureGlows(sword, shield, 'a', 'b')).toEqual({ hand: 'a', shield: 'b' });
    // a shield in the main hand goes on the arm; the off-hand item (not a shield) takes the hand
    expect(figureGlows(shield, sword, 'a', 'b')).toEqual({ hand: 'b', shield: 'a' });
    expect(figureGlows(shield, 0, 'a', null)).toEqual({ hand: null, shield: 'a' });
    expect(figureGlows(shield, shield, 'a', 'b')).toEqual({ hand: null, shield: 'a' });
  });
});
