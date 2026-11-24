import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ATLAS_COLS, ATLAS_ROWS, B, I, TILE_PX, allItems, getItem, toolId as toolIdOf } from '@solrift/shared';

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

  it('swings as fast as the attack speed of the weapon says, and a mined swing at the usual pace', () => {
    const hand = makeHand();
    const sword = getItem(toolIdOf('sword', 'iron')).id;
    settle(hand, sword);
    const frames = (rate?: number): number => {
      const h = hand as unknown as { swingT: number };
      hand.swing(rate);
      let n = 0;
      while (h.swingT < 1 && n < 600) {
        hand.update(1 / 60, sword, 0, 16 / 9, 0, false, 0);
        n++;
      }
      // (let a swing that is still in its first half finish before the next one is asked for)
      for (let i = 0; i < 30; i++) hand.update(1 / 60, sword, 0, 16 / 9, 0, false, 0);
      return n;
    };
    const usual = frames();
    const quick = frames(1.44);
    const slow = frames(0.5);
    expect(usual).toBeGreaterThan(5);
    expect(quick).toBeLessThan(usual * 0.8);
    expect(slow).toBeGreaterThan(usual * 1.5);
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

  it('puts a flame on a torch in the hand and in a figure\'s hand', () => {
    const hand = makeHand();
    const flames = (root: THREE.Object3D): number => {
      let n = 0;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && (mesh.material as THREE.Material).side === THREE.DoubleSide) n++;
      });
      return n;
    };
    settle(hand, B.TORCH);
    expect(flames(hand.scene)).toBe(2);
    expect(flames(hand.figureModel(B.TORCH)!)).toBe(2);
    settle(hand, B.RTORCH_BASE + 1);
    expect(flames(hand.scene)).toBe(0);
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
    const ids = [0, B.STONE, B.TORCH, ...lanterns, tool('sword'), tool('pickaxe'), tool('hoe'), I.GREATSWORD, 0, I.DAGGER, I.STAFF, 0, I.WAND, I.BOW, I.CROSSBOW, I.ORB, I.COMPASS, I.LAND_SURVEYOR, I.SHIELD, I.MAP, food, I.BUCKET];
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
      if (rnd() < 0.02) hand.surveyor.surveying = !hand.surveyor.surveying;
      if (rnd() < 0.03) hand.surveyor.tone = pick(['idle', 'good', 'warn', 'bad'] as const);
      if (rnd() < 0.05) hand.surveyor.push(pick(['plant', 'pluck', 'seal', 'claim'] as const));
      if (rnd() < 0.01) walk = pick([0, 0, 2, 4.3, 7]);
      if (rnd() < 0.01) hand.setLight(new THREE.Color(rnd() * 1.4, rnd() * 1.4, rnd() * 1.4));
      if (rnd() < 0.004) void hand.figureModel(pick(ids));
      hand.update(dt, id, walk, pick([16 / 9, 4 / 3, 21 / 9]), off, blocking, eat);
      const seen = look(hand.scene);
      if (!seen.sound) throw new Error(`frame ${frame}, holding ${getItem(id).name} (other hand ${off}): something is at no real place`);
    }
    hand.dispose();
  });

  describe('the Land Surveyor', () => {
    const pivotOf = (hand: Hand): THREE.Group => (hand as unknown as { pivot: THREE.Group }).pivot;
    const halo = (hand: Hand): THREE.Mesh => {
      let found: THREE.Mesh | undefined;
      hand.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.Material).blending === THREE.AdditiveBlending) found = m;
      });
      return found as unknown as THREE.Mesh;
    };
    const run = (hand: Hand, frames: number): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < frames; i++) {
        hand.update(1 / 60, I.LAND_SURVEYOR, 0, 16 / 9, 0, false, 0);
        out.push(pivotOf(hand).position.clone());
      }
      return out;
    };

    it('is driven into the ground at a corner: the hand goes forward and down, then comes back to where it rests', () => {
      const hand = makeHand();
      settle(hand, I.LAND_SURVEYOR);
      hand.surveyor.surveying = true;
      run(hand, 60);
      const still = run(hand, 1)[0];
      hand.surveyor.push('plant');
      const path = run(hand, 40);
      const low = Math.min(...path.map((p) => p.y));
      const far = Math.min(...path.map((p) => p.z));
      expect(low).toBeLessThan(still.y - 0.1);
      expect(far).toBeLessThan(still.z - 0.07);
      // ...and it was lifted first (the wind-up).
      expect(Math.max(...path.map((p) => p.y))).toBeGreaterThan(still.y + 0.03);
      const after = run(hand, 40).at(-1)!;
      expect(Math.abs(after.y - still.y)).toBeLessThan(0.03);
      expect(Math.abs(after.z - still.z)).toBeLessThan(0.03);
      hand.dispose();
    });

    it('leans out toward the crosshair while a shape is marked, and settles when it is not', () => {
      const hand = makeHand();
      settle(hand, I.LAND_SURVEYOR);
      const idle = run(hand, 60).at(-1)!;
      hand.surveyor.surveying = true;
      const aimed = run(hand, 90).at(-1)!;
      expect(aimed.x).toBeLessThan(idle.x - 0.04);
      expect(aimed.z).toBeLessThan(idle.z - 0.02);
      hand.surveyor.surveying = false;
      const back = run(hand, 120).at(-1)!;
      expect(Math.abs(back.x - idle.x)).toBeLessThan(0.01);
      hand.dispose();
    });

    it('glows the colour of what the server said of the shape, and gold at the purchase', () => {
      const hand = makeHand();
      settle(hand, I.LAND_SURVEYOR);
      hand.surveyor.surveying = true;
      const color = (): THREE.Color => ((halo(hand).material as THREE.MeshBasicMaterial).color).clone();
      const hue = (c: THREE.Color): number => c.getHSL({ h: 0, s: 0, l: 0 }).h;
      const tones: Record<string, number> = { good: 0.4, warn: 0.11, bad: 0 };
      for (const [tone, h] of Object.entries(tones)) {
        hand.surveyor.tone = tone as 'good' | 'warn' | 'bad';
        run(hand, 60);
        const got = hue(color());
        expect(Math.min(Math.abs(got - h), 1 - Math.abs(got - h)), tone).toBeLessThan(0.08);
      }
      hand.surveyor.push('claim');
      run(hand, 40);
      expect(hue(color())).toBeGreaterThan(0.1);
      expect(hue(color())).toBeLessThan(0.16);
      hand.dispose();
    });

    it('raises the staff for a purchase, turns it once to close a shape, and plays a purchase before the corners that waited', () => {
      const hand = makeHand();
      settle(hand, I.LAND_SURVEYOR);
      hand.surveyor.surveying = true;
      const still = run(hand, 60).at(-1)!;
      hand.surveyor.push('claim');
      const high = Math.max(...run(hand, 80).map((p) => p.y));
      expect(high).toBeGreaterThan(still.y + 0.1);
      run(hand, 120);
      hand.surveyor.push('seal');
      const view = (hand as unknown as { view: { object: THREE.Object3D } }).view;
      let turned = 0;
      let last = view.object.rotation.y;
      for (let i = 0; i < 50; i++) {
        hand.update(1 / 60, I.LAND_SURVEYOR, 0, 16 / 9, 0, false, 0);
        turned += Math.abs(view.object.rotation.y - last);
        last = view.object.rotation.y;
      }
      expect(turned).toBeGreaterThan(Math.PI);
      // A purchase cuts in at once and empties the queue of corners behind it.
      hand.surveyor.push('plant');
      hand.surveyor.push('pluck');
      hand.surveyor.push('claim');
      expect(hand.surveyor.pending).toBe(1);
      hand.dispose();
    });

    it('holds nothing of its own once put away, and is plain on a figure and in the other hand', () => {
      const hand = makeHand();
      settle(hand, I.LAND_SURVEYOR);
      hand.surveyor.surveying = true;
      run(hand, 30);
      expect(halo(hand).visible).toBe(true);
      const shown = (root: THREE.Object3D): number => {
        let n = 0;
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && (m.material as THREE.Material).blending === THREE.AdditiveBlending && m.visible) n++;
        });
        return n;
      };
      expect(shown(hand.figureModel(I.LAND_SURVEYOR)!)).toBe(0);
      expect(look(hand.figureModel(I.LAND_SURVEYOR)!).shown).toBeGreaterThan(0);
      settle(hand, 0);
      // (nothing of it is in the hand's scene any more, and its glow is off for the next time it is carried as a plain picture)
      expect(halo(hand)).toBeUndefined();
      hand.dispose();
    });
  });});
