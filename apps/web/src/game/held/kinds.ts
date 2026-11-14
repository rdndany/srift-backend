import * as THREE from 'three';
import { BLOCKS, I, getItem, lanternInfo, type ItemDef } from '@solrift/shared';
import { aimBuilders } from './aim';
import { cubeView, orbView, plainView, shieldView, toolView } from './basic';
import { CompassView } from './compass';
import { lanternBuilder } from './lantern';
import type { HeldBuilder, HeldKit, HeldView } from './view';
import { weaponKind, weaponView } from './weapon';

/**
 * Which item is held which way. This is the one list to add to when an item gets a way of its own in the hand:
 * the first line that matches an item makes its view.
 */
function builderFor(item: ItemDef, own: { lantern: HeldBuilder; aim: Record<number, HeldBuilder> }): HeldBuilder {
  if (item.block !== null && BLOCKS[item.block].shape === 'cube') return cubeView;
  if (item.block !== null && lanternInfo(item.block)) return own.lantern;
  const weapon = weaponKind(item);
  if (weapon) return (i, kit) => weaponView(i, weapon, kit);
  if (item.tool) return toolView;
  if (own.aim[item.id]) return own.aim[item.id];
  if (item.id === I.ORB) return orbView;
  if (item.id === I.COMPASS) return (i, kit) => new CompassView(i, kit);
  if (item.shield) return shieldView;
  return plainView;
}

/** The views of one hand, made as they are first asked for and kept. */
export class HeldViews {
  private readonly cache = new Map<number, HeldView>();
  private readonly own = { lantern: lanternBuilder(), aim: aimBuilders() };

  constructor(private readonly kit: HeldKit) {}

  get(id: number): HeldView {
    let view = this.cache.get(id);
    if (!view) {
      const item = getItem(id);
      view = builderFor(item, this.own)(item, this.kit);
      this.cache.set(id, view);
    }
    return view;
  }

  dispose(): void {
    for (const view of this.cache.values()) {
      view.object.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      view.dispose?.();
    }
    this.cache.clear();
  }
}
