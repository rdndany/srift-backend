import * as THREE from 'three';
import { B, I, MOUNTS, OUTFIT_CLASSES, allItems, armorId, outfitItems } from '@solrift/shared';
import { Character } from './character';
import { Fenrir } from './fenrir';

/** Where the warm-up figures stand: far below anything the view reaches (see `abilityFx.warm`). */
const WARM_DEPTH = -4000;
const WHITE = new THREE.Color(1, 1, 1);

/**
 * Everything that only comes into the world later is built once, out of sight, while the game loads, and drawn for a few frames
 * the way the world is drawn. The graphics card builds a shader the first time something that needs it is drawn, and the game
 * stands still while it does (on a busy card for seconds): a body in a new kind of gear, the mount, or the outline of the block
 * under the crosshair would each freeze the game the first time they appeared. Once built, `ShaderKeeper` keeps the shaders.
 *
 * What the world already has but keeps hidden (the outline, the cracks, the rain, your own body in first person) is not built
 * again: `show` switches it on for the frames of the warm-up and `hide` puts it back (see `main.ts`).
 */
export interface FigureWarmParts {
  /** Makes the model of a held item or a shield (see `HeldItem.figureModel`). */
  figure: (id: number) => THREE.Object3D | null;
  /** One of every mob (see `MobRenderer.warm`). */
  mobs: () => { group: THREE.Group; free: () => void };
  /** Builds the shaders of the inventory figure (see `warmPreview`). */
  inventory: () => void;
  /** Draws the entity shadows once (see `SunShadows.warmEntities`). */
  shadows: () => void;
}

interface Stage {
  /** What the loading screen calls it: "Preparing <name>...". */
  name: string;
  /** The frames it is drawn for. */
  frames: number;
  /** Everything of the world that is hidden is also drawn in this one. */
  world?: boolean;
  run: () => void;
}

/**
 * The warm-up goes in steps, one group of things at a time, and each step is a frame of its own, so that the loading screen can
 * say what it is doing and fill its bar (`status`). Per frame: `begin`, then `show`, draw the scene, then `hide`.
 */
export class FigureWarm {
  readonly group = new THREE.Group();
  private readonly characters: Character[] = [];
  private fenrir: Fenrir | null = null;
  private readonly hidden: { o: THREE.Object3D; visible: boolean; culled: boolean; count: number }[] = [];
  private free: (() => void) | null = null;
  private bits: THREE.InstancedMesh | null = null;
  private readonly stages: Stage[];
  private index = -1;
  private left = 0;

  constructor(private readonly parts: FigureWarmParts) {
    this.group.position.y = WARM_DEPTH;
    this.stages = [
      { name: 'characters', frames: 1, run: () => this.buildCharacters() },
      { name: 'the inventory', frames: 1, run: () => this.parts.inventory() },
      { name: 'the mount', frames: 1, run: () => this.buildMount() },
      { name: 'creatures', frames: 1, run: () => this.buildCreatures() },
      { name: 'effects', frames: 3, world: true, run: () => this.parts.shadows() },
    ];
  }

  /** Every part, also the ones that only show later; and drawn although it is nowhere near the view. */
  private open(o: THREE.Object3D): void {
    this.group.add(o);
    o.traverse((n) => {
      n.visible = true;
      n.frustumCulled = false;
    });
  }

  private buildCharacters(): void {
    const figure = this.parts.figure;
    // The clothes of every class on one body, plate armor with a helmet on another; a sword, a block and a shield in the hands.
    const gear: { armor: number[]; held: number; off: number }[] = [
      { armor: [outfitItems('mage')[0], outfitItems('warrior')[1], outfitItems('ranger')[2], outfitItems('warrior')[3]], held: allItems().find((i) => i.name === 'stone_sword')?.id ?? 0, off: I.SHIELD },
      { armor: [0, 1, 2, 3].map((slot) => armorId(slot, 'iron')), held: allItems().find((i) => i.block === B.STONE)?.id ?? 0, off: I.SHIELD },
      { armor: OUTFIT_CLASSES.map((c) => outfitItems(c)[0]), held: 0, off: 0 },
    ];
    gear.forEach((g, i) => {
      const c = new Character();
      c.setArmor(g.armor);
      c.setHeld(g.held, figure);
      c.setShield(g.off, figure);
      c.root.position.x = i * 3;
      this.open(c.root);
      this.characters.push(c);
    });
  }

  /** The mount, with its lightning (the part of it that only shows when it runs or howls is drawn too). */
  private buildMount(): void {
    // The shapes of every mount are poured now (a tenth of a second each): the first one that is summoned would stand the game still for it.
    for (const m of MOUNTS) Fenrir.prepare(m.id);
    const f = new Fenrir('fenrir');
    f.appear();
    f.root.position.x = -4;
    for (let i = 0; i < 4; i++) f.update(0.1, 6, 0, 0, false);
    this.open(f.root);
    this.fenrir = f;
  }

  private buildCreatures(): void {
    const mobs = this.parts.mobs();
    mobs.group.position.z = 12;
    this.open(mobs.group);
    this.free = mobs.free;
    // The cubes a dying figure falls apart into (DeathFx): their shader is a different one, they are the first of their kind.
    const bits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ vertexColors: true }), 1);
    bits.setColorAt(0, WHITE);
    bits.setMatrixAt(0, new THREE.Matrix4());
    this.open(bits);
    this.bits = bits;
  }

  /** The next step is made ready (the one before it has had its frames). Call once per frame, before drawing. */
  begin(): void {
    if (this.left > 0) return;
    this.index++;
    const stage = this.stages[this.index];
    stage.run();
    this.left = stage.frames;
  }

  /** Whether the step in this frame draws the hidden things of the world too (and the blur of a menu, the sun rays). */
  get world(): boolean {
    return this.left > 0 && !!this.stages[this.index]?.world;
  }

  /** What the loading screen says: the step that comes next (it is put up before the step runs, the picture cannot change during it) and how far it is, 0..1. */
  status(): { label: string; fraction: number } {
    const next = Math.min(this.stages.length - 1, this.left > 0 ? this.index : this.index + 1);
    return { label: `Preparing ${this.stages[next].name}...`, fraction: (this.left > 0 ? this.index : this.index + 1) / this.stages.length };
  }
  /** Before the picture is drawn: everything of the world that is hidden is shown, and drawn although it is nowhere near the view. */
  show(scene: THREE.Object3D): void {
    this.hidden.length = 0;
    if (!this.world) return;
    scene.traverse((o) => {
      if (o === scene) return;
      // Hidden things, and instanced things with no instance yet (orbs, sparks: nothing of them is drawn, and nothing is built either).
      const empty = o instanceof THREE.InstancedMesh && o.count === 0;
      if (o.visible && !empty) return;
      this.hidden.push({ o, visible: o.visible, culled: o.frustumCulled, count: empty ? 0 : -1 });
      o.visible = true;
      o.frustumCulled = false;
        if (empty) {
          const im = o as THREE.InstancedMesh;
          im.count = 1;
          // The colour per instance is part of the shader; the first real colour would build another one.
          if (!im.instanceColor && (im.material as THREE.Material & { vertexColors?: boolean }).vertexColors !== undefined) im.setColorAt(0, WHITE);
        }
    });
  }

  /** After the picture is drawn: what was hidden is hidden again. Returns true when the warm-up is over (take the group away, `dispose`). */
  hide(): boolean {
    for (const h of this.hidden) {
      h.o.visible = h.visible;
      h.o.frustumCulled = h.culled;
      if (h.count >= 0) (h.o as THREE.InstancedMesh).count = h.count;
    }
    this.hidden.length = 0;
    this.left--;
    return this.left <= 0 && this.index >= this.stages.length - 1;
  }

  dispose(): void {
    for (const c of this.characters) c.dispose();
    this.characters.length = 0;
    this.fenrir?.dispose();
    this.fenrir = null;
    this.free?.();
    this.free = null;
    if (this.bits) {
      this.bits.geometry.dispose();
      (this.bits.material as THREE.Material).dispose();
      this.bits.dispose();
      this.bits = null;
    }
    this.group.clear();
  }
}
