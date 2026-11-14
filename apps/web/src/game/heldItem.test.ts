import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ATLAS_COLS, ATLAS_ROWS, B, I, TILE_PX, allItems, getItem } from '@solrift/shared';

/**
 * The first-person hand, without a browser. Every item of the game is put in it, shown to a figure and dropped on the ground, and
 * the hand is driven through a long made-up session of everything it does: nothing may throw, and everything stays where a
 * camera can see it. A new kind of held item (a file in `held/` and a line in `held/kinds.ts`) is covered here as soon as its
 * item is in the table.
 */

/** A canvas for a world without a browser: drawing does nothing, reading gives the pixels of `pixels` (or blank ones). */
function fakeCanvas(pixels?: (w: number, h: number) => Uint8ClampedArray): unknown {
  const canvas: Record<string, unknown> = { width: 0, height: 0, style: {} };
  const ctx = new Proxy(
    {},
    {
      get(_t, k) {
        if (k === 'canvas') return canvas;
        if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: pixels ? pixels(w, h) : new Uint8ClampedArray(w * h * 4), width: w, height: h });
        return () => undefined;
      },
      set: () => true,
    },
  );
  canvas.getContext = () => ctx;
  return canvas;
}

/** An atlas of made-up pictures: each tile a blob of opaque pixels, the same every time. */
function atlasPixels(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  let seed = 12345;
  const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const tx = (x % TILE_PX) - 7.5;
      const ty = (y % TILE_PX) - 7.5;
      px[o] = 60 + Math.floor(rnd() * 190);
      px[o + 1] = 60 + Math.floor(rnd() * 190);
      px[o + 2] = 60 + Math.floor(rnd() * 190);
      px[o + 3] = Math.abs(tx) + Math.abs(ty) * 0.8 < 5 + rnd() * 6 ? 255 : 0;
    }
  return px;
}

type Hand = import('./heldItem').HeldItem;
let HeldItem: new (c: HTMLCanvasElement, t: THREE.Texture) => Hand;
let MapSheet: typeof import('./heldMap').MapSheet;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).document = { createElement: () => fakeCanvas() };
  (globalThis as Record<string, unknown>).ImageData = class {
    constructor(
      readonly data: Uint8ClampedArray,
      readonly width: number,
      readonly height: number,
    ) {}
  };
  HeldItem = (await import('./heldItem')).HeldItem as unknown as typeof HeldItem;
  MapSheet = (await import('./heldMap')).MapSheet;
});

function makeHand(): Hand {
  const canvas = fakeCanvas(atlasPixels) as HTMLCanvasElement;
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const hand = new HeldItem(canvas, new THREE.Texture());
  hand.setMapSheet(new MapSheet());
  return hand;
}

/** The meshes under `root` that a camera would draw, and whether every object sits at a real place. */
function look(root: THREE.Object3D): { shown: number; sound: boolean; triangles: number } {
  root.updateMatrixWorld(true);
  let shown = 0;
  let triangles = 0;
  let sound = true;
  const walk = (o: THREE.Object3D, visible: boolean): void => {
    const vis = visible && o.visible;
    if (!o.matrixWorld.elements.every(Number.isFinite)) sound = false;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && vis) {
      shown++;
      const g = mesh.geometry;
      triangles += (g.getIndex()?.count ?? g.getAttribute('position')?.count ?? 0) / 3;
    }
    for (const c of o.children) walk(c, vis);
  };
  walk(root, true);
  return { shown, sound, triangles };
}

/** Hold `id` until the hand has finished changing to it. */
function settle(hand: Hand, id: number, off = 0): void {
  for (let i = 0; i < 90; i++) hand.update(1 / 60, id, 0, 16 / 9, off, false, 0);
}

describe('the first-person hand', () => {
  it('holds every item of the game, and the bare arm when there is none', () => {
    const hand = makeHand();
    settle(hand, 0);
    const bare = look(hand.scene);
    expect(bare.shown).toBeGreaterThan(0);
    for (const item of allItems()) {
      settle(hand, item.id);
      const seen = look(hand.scene);
      expect(seen.sound, item.name).toBe(true);
      expect(seen.shown, item.name).toBeGreaterThan(0);
      expect(seen.triangles, item.name).toBeGreaterThan(0);
    }
    hand.dispose();
  });

  it('gives every item a model for a figure to carry and one to lie on the ground', () => {
    const hand = makeHand();
    for (const item of allItems()) {
      const carried = hand.figureModel(item.id);
      const dropped = hand.dropModel(item.id);
      expect(carried, item.name).toBeTruthy();
      expect(dropped, item.name).toBeTruthy();
      for (const model of [carried!, dropped!]) {
        const seen = look(model);
        expect(seen.sound, item.name).toBe(true);
        expect(seen.shown, item.name).toBeGreaterThan(0);
      }
      expect(hand.crumbColors(item.id).length, item.name).toBeGreaterThan(0);
    }
    expect(hand.figureShield(I.SHIELD)).toBeTruthy();
    hand.dispose();
  });

  it('shows what is in the other hand beside it', () => {
    const hand = makeHand();
    const sword = allItems().find((i) => i.tool?.kind === 'sword')!.id;
    settle(hand, sword);
    const alone = look(hand.scene).shown;
    for (const off of allItems().filter((i) => i.offhand)) {
      settle(hand, sword, off.id);
      expect(look(hand.scene).shown, off.name).toBeGreaterThan(alone);
      settle(hand, sword, 0);
      expect(look(hand.scene).shown, off.name).toBe(alone);
    }
    hand.dispose();
  });

  it('raises the map in both hands to read it, and lowers it again', () => {
    const hand = makeHand();
    settle(hand, I.MAP);
    const low = look(hand.scene);
    hand.setMapUp(true);
    settle(hand, I.MAP);
    const up = look(hand.scene);
    expect(up.sound).toBe(true);
    expect(up.shown).toBeGreaterThan(0);
    hand.setMapUp(false);
    settle(hand, I.MAP);
    expect(look(hand.scene)).toEqual(low);
    hand.dispose();
  });

  it('goes through everything a hand does without losing its place', () => {
    const hand = makeHand();
    const items = allItems();
    const tool = (kind: string): number => items.find((i) => i.tool?.kind === kind)!.id;
    const food = items.find((i) => i.food)!.id;
    const lanterns = items.filter((i) => i.carry === 'hang').map((i) => i.id);
    const ids = [0, B.STONE, B.TORCH, ...lanterns, tool('sword'), tool('pickaxe'), tool('hoe'), I.GREATSWORD, 0, I.DAGGER, I.STAFF, 0, I.WAND, I.BOW, I.CROSSBOW, I.ORB, I.COMPASS, I.SHIELD, I.MAP, food, I.BUCKET];
    const offs = [0, 0, I.SHIELD, I.ORB, I.DAGGER, I.MAP, lanterns[0]];
    let seed = 99;
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
    let id = 0;
    let off = 0;
    let blocking = false;
    let eat = 0;
    let draw = 0;
    let drawing = false;
    let walk = 0;
    let slam = 0;
    for (let frame = 0; frame < 3000; frame++) {
      const dt = pick([1 / 60, 1 / 60, 1 / 144, 1 / 30, 0.05, 0.2]);
      if (frame % 120 === 0) id = ids[(frame / 120) % ids.length];
      if (rnd() < 0.006) off = pick(offs);
      if (rnd() < 0.03) hand.swing();
      if (rnd() < 0.05) hand.swingIfIdle();
      if (rnd() < 0.01) blocking = !blocking;
      if (rnd() < 0.006) hand.blockHit(rnd() < 0.5);
      if (rnd() < 0.004) hand.bash();
      if (rnd() < 0.006) hand.setStance(pick([0, 0, 0.3, 0.55, 1]));
      if (rnd() < 0.004 || slam > 0) {
        slam = slam === 0 ? 1 : rnd() < 0.08 ? (slam + 1) % 4 : slam;
        hand.setSlam(slam, slam === 2 ? (rnd() < 0.5 ? 6 : -9) : 0);
      }
      const aims = getItem(id).use === 'bow' || getItem(id).use === 'crossbow';
      if (rnd() < (aims ? 0.04 : 0.01)) drawing = !drawing;
      draw = drawing ? Math.min(1, draw + dt * 1.4) : 0;
      hand.setDraw(draw);
      if (rnd() < 0.008) eat = eat > 0 ? 0 : 0.4;
      if (rnd() < 0.01) hand.setMapUp(rnd() < 0.5);
      if (rnd() < 0.05) hand.setCompass(Math.floor(rnd() * 64) - 16);
      if (rnd() < 0.01) walk = pick([0, 0, 2, 4.3, 7]);
      if (rnd() < 0.01) hand.setLight(new THREE.Color(rnd() * 1.4, rnd() * 1.4, rnd() * 1.4));
      if (rnd() < 0.004) void hand.figureModel(pick(ids));
      hand.update(dt, id, walk, pick([16 / 9, 4 / 3, 21 / 9]), off, blocking, eat);
      const seen = look(hand.scene);
      if (!seen.sound) throw new Error(`frame ${frame}, holding ${getItem(id).name} (other hand ${off}): something is at no real place`);
    }
    hand.dispose();
  });
});
