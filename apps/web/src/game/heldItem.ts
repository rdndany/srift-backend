import * as THREE from 'three';
import { B, BLOCKS, I, getItem } from '@solrift/shared';
import { Character, type Palette } from './character';
import type { MapSheet } from './heldMap';
import { bareArm, poseBareHand } from './held/bareHand';
import { Casting } from './held/cast';
import { CompassView } from './held/compass';
import { Eating } from './held/eat';
import { StoneHeat } from './held/heat';
import { ItemFigures } from './held/figures';
import { ShieldMoves, type GuardHands } from './held/guard';
import { HeldViews } from './held/kinds';
import { MapHold } from './held/mapHold';
import { ItemModels } from './held/models';
import type { SwingStyle } from './held/swings';
import { AXIS_X, AXIS_Y, AXIS_Z, DEG, REST_DEFAULT, type HandFrame, type HeldKit, type HeldView } from './held/view';

/**
 * First-person hand. Rendered in its own pass on top of the world (depth is cleared), so it never
 * clips into walls. Blocks are real 3D cubes textured from the atlas; items, torches and plants are
 * little voxel models built from their pictures, the classic look for held tools.
 *
 * This class only runs the hand: the change of item, the swing, the walk, and the order things are laid over each other.
 * What each kind of item looks like and how it moves is in `held/` (see `held/view.ts` and `held/kinds.ts`).
 */

const Q = new THREE.Quaternion();

export class HeldItem {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.02, 10);
  visible = true;

  private readonly models: ItemModels;
  private readonly views: HeldViews;
  private readonly figures: ItemFigures;
  private readonly guard = new ShieldMoves();
  private readonly eating = new Eating();
  private readonly casting = new Casting();
  private readonly stoneHeat = new StoneHeat();
  private readonly map: MapHold;

  /** The main hand: its pivot (the grip), the holder the item sits in, the view of the item (null: the empty hand) and its id. */
  private pivot = new THREE.Group();
  private holder = new THREE.Group();
  private view: HeldView | null = null;
  private currentId = -1;
  /** The off hand: its own pivot on the left, with a copy of the item's model. */
  private offPivot = new THREE.Group();
  private offObj: THREE.Object3D | null = null;
  private offView: HeldView | null = null;
  private offId = 0;
  /** The empty hand: the arm of a character, laid forward from the shoulder. */
  private arm: THREE.Group;
  /** Every character whose arm is in the view (the bare hand's, a lantern's, the map's), dressed alike: the look and the armor of the player. */
  private chars: Character[] = [];
  private palette: Palette | null = null;
  private armorIds: readonly number[] = [];

  private swingT = 1; // 0..1 while swinging, 1 = idle
  /** The swing of the last item that was in the hand (null: the plain one), and which of its variants comes next. The empty hand keeps the timing of the item before it. */
  private style: SwingStyle | null = null;
  private swingVariant = 0;
  private frozenSwing: number | null = null;
  /** Where the item's pivot (its grip) rests, in camera space. */
  private rest = new THREE.Vector3(0.55, -0.42, -0.75);
  private baseYaw = -0.5;
  private equipT = 1;
  private switching = false;
  private bobPhase = 0;
  private bobAmp = 0;
  /** The use button held on a bow, 0..1. */
  private draw = 0;
  private shakeT = 0;
  private readonly frame: HandFrame;

  constructor(atlasCanvas: HTMLCanvasElement, atlasTexture: THREE.Texture) {
    this.models = new ItemModels(atlasCanvas, atlasTexture);
    const kit: HeldKit = { models: this.models, scene: this.scene, makeChar: () => this.makeChar() };
    this.views = new HeldViews(kit);
    this.figures = new ItemFigures(this.models, this.views);
    this.map = new MapHold(kit, (ch) => {
      this.chars.splice(this.chars.indexOf(ch), 1);
      ch.dispose();
    });
    this.pivot.add(this.holder);
    this.scene.add(this.pivot);
    this.scene.add(this.offPivot);
    this.arm = bareArm(this.makeChar());
    this.arm.visible = false;
    this.holder.add(this.arm);
    this.frame = {
      dt: 0,
      aspect: 16 / 9,
      pivot: this.pivot,
      rest: this.rest,
      baseYaw: this.baseYaw,
      s: 1,
      variant: 0,
      root: 0,
      sq: 0,
      lin: 0,
      lift: 0,
      bx: 0,
      by: 0,
      bobPhase: 0,
      bobAmp: 0,
      down: 0,
      switching: false,
      draw: 0,
      tremble: 0,
      shakeT: 0,
      scale: 1,
    };
  }

  /** A character for its arm, dressed like the player and lit like the hand. */
  private makeChar(): Character {
    const c = new Character();
    if (this.palette) c.setLook(this.palette);
    c.setArmor(this.armorIds);
    c.setTint(this.models.tint);
    this.chars.push(c);
    return c;
  }

  /** Dress the arms for the look the player chose. */
  setLook(palette: Palette): void {
    this.palette = palette;
    for (const c of this.chars) c.setLook(palette);
  }

  /** Put the armor (or a class's clothes) on the arms: item ids for [helmet, chestplate, leggings, boots]. */
  setArmor(ids: readonly number[]): void {
    this.armorIds = ids;
    for (const c of this.chars) c.setArmor(ids);
  }

  /** The light on the hand, as a colour: gold at dusk, blue at night, orange next to a torch. */
  setLight(c: THREE.Color): void {
    this.models.setLight(c);
    for (const ch of this.chars) ch.setTint(this.models.tint);
  }

  /** Hold the swing at one moment of it (0..1; null lets it play), for looking at a pose. */
  holdSwing(t: number | null, variant = 0): void {
    this.frozenSwing = t;
    this.swingVariant = variant;
  }

  /** A blow stopped by the raised shield (a parry thrusts it out first): it is jolted back, and settles. */
  blockHit(parry: boolean): void {
    this.guard.blockHit(parry);
  }

  /** Start a swing (attack or place). Ignored while one is already in its first half. */
  swing(): void {
    if (this.holdsMap()) return;
    const st = this.style;
    if (st) {
      if (this.swingT > st.again) {
        this.swingT = 0;
        this.swingVariant++;
      }
    } else if (this.swingT > 0.5) this.swingT = 0;
  }

  /** A Shield Bash: the shield is drawn back and driven forward (the warrior's own shield if they have one in hand, otherwise one is brought out for it). */
  bash(): void {
    this.guard.bash();
  }

  /** Hold the shield up ready (0.55 for Iron Defense) or right in front (1, the Charge): 0 puts it away. */
  setStance(v: number): void {
    this.guard.setStance(v);
  }

  /** A Ground Slam (0 none, 1 crouching, 2 in the air, 3 the blow) and the vertical speed: the weapon goes up out of the view, the shield comes forward and down. */
  setSlam(phase: number, vy: number): void {
    this.guard.setSlam(phase, vy);
  }

  /** Keep swinging while mining: only starts a new swing once the last one has finished. */
  swingIfIdle(): void {
    if (this.holdsMap()) return;
    if (this.swingT >= 1) this.swingT = 0;
  }

  /** The use button held on the item in hand, 0..1 (a bow's draw; a crossbow is wound to 1 and then waits). */
  setDraw(d: number): void {
    this.view?.drawn?.(this.draw, d, this.switching);
    this.draw = d;
  }

  /** `id` is the held item id (0 = empty hand), `offId` the off-hand item (a shield), `blocking` the raised shield, `eat` how far into a meal (0..1), `cast` how far into the Emberstone's cast (0..1). */
  update(dt: number, id: number, walkSpeed: number, aspect: number, offId = 0, blocking = false, eat = 0, cast = 0): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // Switching items: lower the old one, swap at the bottom, raise the new one.
    if (this.currentId === -1) {
      this.setItem(id);
    } else if (id !== this.currentId && !this.switching) {
      this.switching = true;
      this.equipT = 0;
    }
    this.equipT = Math.min(1, this.equipT + dt / 0.28);
    if (this.switching && this.equipT >= 0.5) {
      this.setItem(id);
      this.switching = false;
    }

    this.swingT = Math.min(1, this.swingT + dt / (this.style?.dur ?? 0.3));
    if (this.frozenSwing !== null) this.swingT = this.frozenSwing;
    const s = this.swingT;

    this.bobAmp += (Math.min(1, walkSpeed / 4.3) - this.bobAmp) * Math.min(1, dt * 8);
    this.bobPhase += dt * (4 + walkSpeed * 1.4);
    const bx = Math.sin(this.bobPhase) * 0.018 * this.bobAmp;
    const by = Math.abs(Math.cos(this.bobPhase)) * 0.022 * this.bobAmp;

    // Equip dip: 0..0.5 goes down, 0.5..1 comes back up.
    const dip = this.equipT < 1 ? Math.abs(Math.cos(this.equipT * Math.PI)) : 1;
    const down = (1 - dip) * 0.6;

    // The classic swing arc: the item sweeps toward the screen centre, turns edge-on and tilts forward.
    const root = s < 1 ? Math.sin(Math.sqrt(s) * Math.PI) : 0;
    const sq = s < 1 ? Math.sin(s * s * Math.PI) : 0;
    const lin = s < 1 ? Math.sin(s * Math.PI) : 0;
    const lift = s < 1 ? Math.sin(Math.sqrt(s) * Math.PI * 2) : 0;
    this.shakeT += dt * 38;
    const d = this.draw;
    const tremble = d > 0.9 ? Math.sin(this.shakeT) * 0.004 : 0;
    this.pivot.position.set(
      this.rest.x + bx - root * 0.4 - d * 0.12 + tremble,
      this.rest.y - by - down + lift * 0.2 + d * 0.03,
      this.rest.z - lin * 0.2 + d * 0.06,
    );
    this.pivot.quaternion
      .setFromAxisAngle(AXIS_Y, this.baseYaw - sq * 20 * DEG + d * 0.35)
      .multiply(Q.setFromAxisAngle(AXIS_Z, -root * 20 * DEG))
      .multiply(Q.setFromAxisAngle(AXIS_X, -root * 80 * DEG));

    // The item's own way of moving, over (or instead of) the plain pose.
    const f = this.frame;
    f.dt = dt;
    f.aspect = aspect;
    f.s = s;
    f.variant = this.swingVariant;
    f.root = root;
    f.sq = sq;
    f.lin = lin;
    f.lift = lift;
    f.bx = bx;
    f.by = by;
    f.bobPhase = this.bobPhase;
    f.bobAmp = this.bobAmp;
    f.down = down;
    f.switching = this.switching;
    f.draw = d;
    f.tremble = tremble;
    f.shakeT = this.shakeT;
    f.scale = 1;
    this.holder.rotation.set(0, 0, 0);
    if (this.view) this.view.pose?.(f);
    else poseBareHand(f);
    this.eating.drive(dt, eat > 0 && !this.switching && !!this.view && !blocking, this.pivot, this.baseYaw);
    // Casting the Emberstone (how far into the cast, 0 when not): the stone is held up in front of the face.
    this.casting.drive(dt, !this.switching && !!this.view ? cast : 0, this.pivot, this.baseYaw);
    // ... and it heats up from the middle as the cast goes on (see held/heat.ts).
    this.stoneHeat.apply(this.view?.object ?? null, !this.switching && this.currentId === I.EMBERSTONE ? cast : 0);

    // Shields, in either hand (one that is in neither is brought out for a bash, a charge or a guard), and the rest of the off hand.
    const mainShield = !!this.view?.shield;
    const off = this.guard.step(dt, blocking, offId, mainShield);
    if (this.offId !== off) this.setOff(off);
    const hands: GuardHands = {
      pivot: this.pivot,
      offPivot: this.offPivot,
      hasMain: !!this.view,
      mainShield,
      hasOff: !!this.offObj,
      offShield: !!this.offObj && !!this.offView?.shield,
      offFloat: !!this.offObj && !!this.offView?.float,
      camera: this.camera,
      aspect,
      bx,
      by,
      down,
      shakeT: this.shakeT,
      scale: f.scale,
    };
    this.guard.pose(hands);
    this.map.apply(dt, this.holdsMap() && !this.switching, this.pivot, this.offPivot, this.shakeT);
    this.view?.late?.(f);
  }

  /** The map item: the sheet is shared by two models (one for each hand), see MapModel. */
  setMapSheet(sheet: MapSheet): void {
    this.map.setSheet(sheet);
  }

  /** The map in the hand is open (brought up in both hands) or put down. The one in the off hand is only carried. */
  setMapUp(up: boolean): void {
    this.map.setUp(up);
  }

  /** Is the map the item in the hand? */
  private holdsMap(): boolean {
    return !!this.map.main && this.view === this.map.main;
  }

  private setOff(id: number): void {
    if (this.offObj) this.offPivot.remove(this.offObj);
    this.offObj = null;
    this.offView = null;
    this.offId = id;
    if (!id) return;
    if (getItem(id).use === 'map' && this.map.off) {
      this.offView = this.map.off;
      this.offObj = this.map.off.object;
      this.offPivot.add(this.offObj);
      return;
    }
    const view = this.views.get(id);
    this.offView = view;
    // A clone, so the same shield can also be the one in the main hand; geometry and materials are shared.
    this.offObj = view.object.clone();
    if (!getItem(id).shield) {
      // Held up in the left hand: smaller than in the right, and mirrored so a blade leans toward the middle.
      const o = view.off ?? { scale: 0.32, lean: -0.2 };
      this.offObj.scale.setScalar(o.scale);
      if (o.at) this.offObj.position.set(...o.at);
      this.offObj.rotation.set(0.05, -0.45, o.lean);
    }
    this.offPivot.add(this.offObj);
  }

  /** Turn the needle of the compass in hand to one of its pictures (0 = straight ahead, clockwise): the hand shows the item as it is. */
  setCompass(frame: number): void {
    if (this.view instanceof CompassView) this.view.setNeedle(frame);
  }

  private setItem(id: number): void {
    if (this.view) {
      this.holder.remove(this.view.object);
      this.view.leave?.();
    }
    this.view = null;
    this.currentId = id;
    this.arm.visible = id === 0;
    if (id === 0) return;
    const view = getItem(id).use === 'map' && this.map.main ? this.map.main : this.views.get(id);
    this.view = view;
    this.holder.add(view.object);
    this.rest.copy(view.rest ?? REST_DEFAULT);
    this.style = view.swing ?? null;
    this.swingT = 1;
  }

  /** The item as a blocky figure holds it in its right hand (grip at the origin, blade pointing forward). */
  figureModel(id: number): THREE.Object3D | null {
    return this.figures.figureModel(id);
  }

  /** The item as it lies and spins on the ground. The caller clones the materials to light it. */
  dropModel(id: number): THREE.Object3D | null {
    return this.figures.dropModel(id);
  }

  /** A shield as the figure carries it on the left arm: facing -z, upright, centred on the origin. */
  figureShield(id: number): THREE.Object3D | null {
    return this.figures.figureShield(id);
  }

  /** The colours (0xRRGGBB) of the opaque pixels of an item's picture, up to `max` of them picked from across it: crumbs of it look like it. */
  crumbColors(id: number, max = 12): number[] {
    return this.models.crumbColors(id, max);
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (!this.visible) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  /**
   * Build the shaders of everything the hand can show, once, while the game is loading. The graphics card builds a shader the
   * first time something that needs it is drawn, and the game stands still while it does: a player who comes in with a sword in
   * the hand has never been shown the empty arm, a block or the map, so the first time one of those came up the game froze.
   *
   * It is a real draw, in the hand's own pass (as `render` is), of one small copy of each thing behind the camera, where nothing
   * of it can be seen: the arm (skin, sleeve, armor, a class's clothes), the map with both its hands, a block and a flat item.
   * Call it where `render` is called, so the picture it is drawn to is the same.
   */
  warm(renderer: THREE.WebGLRenderer): void {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.position.set(0, 0, 1);
    group.scale.setScalar(0.001);
    scene.add(group);
    const seen = new Set<string>();
    const add = (mesh: THREE.Mesh): void => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // One of each material on each kind of geometry (what a mesh is made of decides the shader as much as the material does).
      const key = `${materials.map((m) => m.uuid).join()}:${Object.keys(mesh.geometry.attributes).sort().join()}`;
      if (seen.has(key)) return;
      seen.add(key);
      const copy = new THREE.Mesh(mesh.geometry, mesh.material);
      copy.frustumCulled = false;
      group.add(copy);
    };
    const take = (root: THREE.Object3D | undefined): void => root?.traverse((o) => o instanceof THREE.Mesh && add(o));
    take(this.arm);
    take(this.map.main?.object);
    take(this.map.off?.object);
    const samples = [this.models.cube(BLOCKS[B.STONE]), new THREE.Mesh(this.models.colorBox(1, 1, 1, 0xffffff), this.models.flat())];
    for (const s of samples) add(s);
    renderer.clearDepth();
    renderer.render(scene, this.camera);
    for (const s of samples) s.geometry.dispose();
  }

  dispose(): void {
    this.views.dispose();
    this.figures.dispose();
    this.map.dispose();
    for (const ch of this.chars) ch.dispose();
    this.models.dispose();
  }
}
