import * as THREE from 'three';
import { CLASSES, MOUNTS, getItem } from '@solrift/shared';
import { BODY_SCALE, Character, SWING_TIME, disposeCharacterAssets, figureLoadout, layDown, standUp } from './character';
import { paletteOfCode } from './lookPalette';
import type { OtherPlayer } from './remote';
import type { EntityLight } from './entityLight';
import { followBodyYaw, wrapAngle } from './selfView';
import type { StepHandler } from './fenrir';
import { MountRig, RIDER_LIFT } from './mountRig';

/** Where the name tag floats above a figure's feet: a little over the top of the head. */
const NAME_Y = 2 * BODY_SCALE + 0.35;

/**
 * Level of detail, for crowded servers. Only the nearest few players are drawn as full articulated figures
 * (head, body, limbs, armor, held item); the rest are a single coloured block, and the far ones are skipped.
 * One hundred full figures would cost a thousand draw calls and most of a frame on a laptop.
 */
export const LOD = {
  /** At most this many full figures at once. */
  maxFull: 20,
  /** A player becomes a full figure inside this distance, and drops back to a block outside `fullOut`. */
  fullIn: 36,
  fullOut: 44,
  /** Beyond this the player is not drawn at all (the fog hides them anyway). */
  hideBeyond: 170,
  /** Name tags show inside this distance. */
  labelRange: 40,
  /** Far blocks refresh their lighting every this many frames. */
  relightEvery: 8,
};

/** One block, 1.8 tall like a person; a single draw call. Shared by every distant player. */
const BLOCK_GEO = new THREE.BoxGeometry(0.5, 1.8, 0.35).translate(0, 0.9, 0);

interface Figure {
  group: THREE.Group;
  /** Built the first time the player is near enough to deserve it. */
  character: Character | null;
  /** The pivot the character hangs from, and what puts it on a mount. */
  rider: THREE.Group | null;
  rig: MountRig | null;
  block: THREE.Mesh;
  blockColor: THREE.Color;
  label: THREE.Sprite | null;
  labelTex: THREE.CanvasTexture | null;
  /** What the tag shows now (class and level change while they play, and the tag is drawn again). */
  labelKey: string;
  name: string;
  look: number;
  /** The body's heading: it eases round to where the player looks; `turn` is how fast it is going (radians/s, positive to the left). */
  bodyYaw: number;
  turn: number;
  /** Their vertical speed (worked out from how they move, eased) and whether that says they are in the air. */
  lastY: number;
  vy: number;
  air: boolean;
  full: boolean;
  /** The block has been lit at least once since it last appeared. */
  blockLit: boolean;
  /** They were dead as of the last frame (the figure comes apart once, when that turns true). */
  dead: boolean;
}

export interface PlayerRenderStats {
  total: number;
  full: number;
  blocks: number;
  hidden: number;
  /** Time spent in the last `sync`, ms. */
  syncMs: number;
}

/** What their name tag shows besides the name: when it changes, the tag is drawn again. */
const tagKey = (p: OtherPlayer): string => `${p.cls ?? ''}:${p.clv ?? 0}:${p.gt ?? ''}`;

/** Draws the other players of an online game, with the armor they wear. */
export class PlayerRenderer {
  readonly group = new THREE.Group();
  private figures = new Map<number, Figure>();
  private brightness = 1;
  private env: EntityLight | null = null;
  private readonly tint = new THREE.Color();
  private readonly list: OtherPlayer[] = [];
  private readonly d2: number[] = [];
  private readonly order: number[] = [];
  private readonly rank: number[] = [];
  private frame = 0;
  private lastStats: PlayerRenderStats = { total: 0, full: 0, blocks: 0, hidden: 0, syncMs: 0 };

  /** `models` gives the model of a held item (null for an empty hand). */
  constructor(private readonly models: (id: number) => THREE.Object3D | null = () => null) {}

  stats(): PlayerRenderStats {
    return this.lastStats;
  }

  private makeFigure(p: OtherPlayer): Figure {
    const group = new THREE.Group();
    const palette = paletteOfCode(p.look);
    const blockColor = palette.shirt.clone();
    const block = new THREE.Mesh(BLOCK_GEO, new THREE.MeshBasicMaterial({ color: blockColor }));
    block.visible = false;
    group.add(block);
    this.group.add(group);
    return { group, character: null, rider: null, rig: null, block, blockColor, label: null, labelTex: null, labelKey: '', name: p.name, look: p.look, bodyYaw: p.yaw, turn: 0, lastY: p.y, vy: 0, air: false, full: false, blockLit: false, dead: !!p.dead };
  }

  private makeLabel(f: Figure, p: OtherPlayer): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const labelTex = new THREE.CanvasTexture(canvas);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false }));
    label.scale.set(1.6, 0.3, 1);
    label.position.y = NAME_Y;
    label.renderOrder = 10;
    f.group.add(label);
    f.label = label;
    f.labelTex = labelTex;
    this.paintLabel(f, p);
  }

  /** The tag: the level in the colour of the class, then the name. */
  private paintLabel(f: Figure, p: OtherPlayer): void {
    const tex = f.labelTex;
    if (!tex) return;
    f.labelKey = tagKey(p);
    const canvas = tex.image as HTMLCanvasElement;
    const g2 = canvas.getContext('2d')!;
    g2.clearRect(0, 0, canvas.width, canvas.height);
    g2.font = '22px Monocraft, monospace';
    g2.textBaseline = 'middle';
    g2.textAlign = 'left';
    const level = p.cls && p.clv ? `${p.clv} ` : '';
    const guild = p.gt ? ` <${p.gt}>` : '';
    const lw = g2.measureText(level).width;
    const gw = g2.measureText(guild).width;
    const nw = Math.min(g2.measureText(f.name).width, 240 - lw - gw);
    const total = Math.min(240, lw + nw + gw);
    const x0 = 128 - total / 2;
    g2.fillStyle = 'rgba(0,0,0,0.45)';
    g2.fillRect(x0 - 8, 4, total + 16, 40);
    if (level) {
      g2.fillStyle = CLASSES[p.cls!].color;
      g2.fillText(level, x0, 25);
    }
    g2.fillStyle = '#fff';
    g2.fillText(f.name, x0 + lw, 25, nw);
    if (guild) {
      g2.fillStyle = '#6bff8a';
      g2.fillText(guild, x0 + lw + nw, 25);
    }
    tex.needsUpdate = true;
  }
  setBrightness(b: number): void {
    this.brightness = b;
  }

  /** A figure died in view: the game breaks it into cubes (the character, where it stood, which way it faced). */
  onDeath: ((c: Character, x: number, y: number, z: number, yaw: number) => void) | null = null;

  /** A paw of someone's mount came down (where, and how hard): the game makes the thud and the dust. */
  onMountStep: StepHandler | null = null;

  /** A rider used a skill of their mount at (x, z): the nearest mount within a few blocks bites or howls. */
  mountAct(x: number, z: number, what: 'bite' | 'howl'): void {
    let best: Figure | null = null;
    let bestD = 6 * 6;
    for (const f of this.figures.values()) {
      if (!f.rig?.mounted) continue;
      const d = (f.group.position.x - x) ** 2 + (f.group.position.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    best?.rig?.act(what);
  }

  /** Light the players from the world (sky colour, caves, torches) instead of a single brightness. */
  setEnvironment(env: EntityLight | null): void {
    this.env = env;
  }

  /** Tells whether the cell at a point is water: a player with water at the feet and under them is swimming, not walking. */
  isWater: ((x: number, y: number, z: number) => boolean) | null = null;

  private light(f: Figure, p: OtherPlayer): void {
    if (f.character) {
      if (this.env) f.character.setLight(this.env.at(p.x, p.y, p.z, this.tint), this.env, f.group.rotation.y);
      else f.character.setBrightness(this.brightness);
    }
  }

  /** The block takes the shirt colour in the light that falls on the player. */
  private lightBlock(f: Figure, p: OtherPlayer): void {
    const t = this.env ? this.env.at(p.x, p.y, p.z, this.tint) : this.tint.setScalar(Math.max(0.3, this.brightness));
    const m = f.block.material as THREE.MeshBasicMaterial;
    m.color.setRGB(f.blockColor.r * t.r * 0.9, f.blockColor.g * t.g * 0.9, f.blockColor.b * t.b * 0.9);
  }

  /** `eye` is the camera: distance to it decides how much of each player is drawn. */
  sync(players: Iterable<OtherPlayer>, dt: number, eye?: THREE.Vector3): void {
    const t0 = performance.now();
    this.frame++;
    const list = this.list;
    list.length = 0;
    for (const p of players) list.push(p);
    const n = list.length;
    const d2 = this.d2;
    d2.length = n;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      if (eye) {
        const dx = p.x - eye.x;
        const dy = p.y - eye.y;
        const dz = p.z - eye.z;
        d2[i] = dx * dx + dy * dy + dz * dz;
      } else d2[i] = 0; // no camera given: everyone counts as close (the old behaviour)
    }
    // Rank by distance: only the closest `maxFull` may be full figures.
    const order = this.order;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    if (n > LOD.maxFull) order.sort((a, b) => d2[a] - d2[b]);
    const rank = this.rank;
    rank.length = n;
    for (let k = 0; k < n; k++) rank[order[k]] = k;

    const live = new Set<number>();
    let full = 0;
    let blocks = 0;
    let hidden = 0;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      live.add(p.id);
      let f = this.figures.get(p.id);
      if (!f) {
        f = this.makeFigure(p);
        this.figures.set(p.id, f);
      }
      const dist = Math.sqrt(d2[i]);
      const r = rank[i];
      // Hysteresis, so a player on the edge does not flicker between the two looks.
      const wantFull = f.full ? r < LOD.maxFull + 2 && dist < LOD.fullOut : r < LOD.maxFull && dist < LOD.fullIn;
      f.full = wantFull;
      const visible = wantFull || dist < LOD.hideBeyond;
      f.group.visible = visible;
      if (!visible) {
        hidden++;
        continue;
      }
      const showLabel = dist < LOD.labelRange;
      if (showLabel && !f.label) this.makeLabel(f, p);
      else if (showLabel && f.labelKey !== tagKey(p)) this.paintLabel(f, p);
      if (f.label) f.label.visible = showLabel;

      if (p.dead) {
        // Dead: it comes apart (once, and only for the ones drawn as figures), and nothing is left standing.
        if (!f.dead && f.character && wantFull && f.character.root.visible) this.onDeath?.(f.character, p.x, p.y, p.z, f.bodyYaw);
        f.dead = true;
        f.block.visible = false;
        if (f.character) f.character.root.visible = false;
        if (f.label) f.label.visible = false;
        f.lastY = p.y;
        f.vy = 0;
        continue;
      }
      f.dead = false;

      if (p.sleeping > 0) {
        layDown(f.group, p.x, p.y, p.z, p.sleeping);
        f.bodyYaw = p.yaw;
        f.turn = 0;
      }
      else {
        standUp(f.group);
        f.group.position.set(p.x, p.y - (p.sneaking ? 0.1 : 0), p.z);
        if (wantFull) {
          const before = f.bodyYaw;
          f.bodyYaw = followBodyYaw(f.bodyYaw, p.yaw, p.speed > 0.3, dt);
          if (dt > 0) f.turn += (wrapAngle(f.bodyYaw - before) / dt - f.turn) * (1 - Math.exp(-dt * 10));
        } else {
          f.bodyYaw = p.yaw; // far away nobody can tell
          f.turn = 0;
        }
        f.group.rotation.y = f.bodyYaw;
        f.group.scale.y = p.sneaking ? 0.92 : 1;
      }
      const lift = p.mount && p.sleeping === 0 ? RIDER_LIFT : 0;
      if (f.label) f.label.position.set(0, p.sleeping > 0 ? 0.9 : NAME_Y + lift, p.sleeping > 0 ? -1.2 : 0); // lying down, local -z is up

      if (!wantFull) {
        blocks++;
        f.lastY = p.y;
        f.vy = 0;
        f.block.visible = true;
        if (f.character) f.character.root.visible = false;
        f.rig?.update(dt, null, 0, 0, 0, false);
        if (!f.blockLit || (this.frame + p.id) % LOD.relightEvery === 0) {
          this.lightBlock(f, p);
          f.blockLit = true;
        }
        continue;
      }
      full++;
      f.block.visible = false;
      f.blockLit = false;
      if (!f.character) {
        f.character = new Character(paletteOfCode(f.look));
        f.rider = new THREE.Group();
        f.rider.add(f.character.root);
        f.group.add(f.rider);
        f.rig = new MountRig(f.group, f.rider, f.character);
      }
      const c = f.character;
      c.root.visible = true;
      // A mage's hat is tall: the name tag rides above it.
      const tallHat = p.armor[0] ? getItem(p.armor[0]).armor?.outfit === 'mage' : false;
      if (f.label) f.label.position.y = p.sleeping > 0 ? 0.9 : tallHat ? NAME_Y + 0.45 + lift : NAME_Y + lift;
      if (p.sleeping > 0) {
        f.rig?.update(dt, null, 0, 0, 0, false);
        c.settle();
        c.headPivot.rotation.set(0, 0, 0);
        c.pose(0, 1, false, false);
        c.setArmor(p.armor);
        c.setHeld(0, this.models);
        c.setShield(0, this.models);
        this.light(f, p);
        continue;
      }
      c.headPivot.rotation.x = p.pitch;
      c.headPivot.rotation.y = Math.max(-1.3, Math.min(1.3, wrapAngle(p.yaw - f.bodyYaw)));
      // A rider holds nothing: no weapon in the hand, no shield on the arm.
      const load = p.mount ? { hand: 0, shield: 0 } : figureLoadout(p.held, p.offhand);
      if (dt > 0) f.vy += ((p.y - f.lastY) / dt - f.vy) * (1 - Math.exp(-dt * 12));
      f.lastY = p.y;
      // In the air when they rise or fall fast (with a margin, so the pose does not flicker at the edge).
      f.air = Math.abs(f.vy) > (f.air ? 1.2 : 3);
      // In water that comes up to the chest or has none under the feet (floating at the surface): swimming, not wading, a leap or a fall.
      const afloat = !p.mount && !!this.isWater && this.isWater(p.x, p.y + 0.4, p.z) && (this.isWater(p.x, p.y + 1, p.z) || this.isWater(p.x, p.y - 0.5, p.z));
      if (afloat) f.air = false;
      c.afloat = afloat;
      if (f.rig) f.rig.onStep = this.onMountStep;
      f.rig?.update(dt, p.mount ? (MOUNTS[p.mount - 1]?.id ?? null) : null, p.speed, f.turn, f.vy, f.air, this.env ? this.env.at(p.x, p.y, p.z, this.tint) : this.tint.setScalar(Math.max(0.3, this.brightness)), eye);
      c.slamPhase = p.mount ? 0 : (p.slam ?? 0);
      c.bashAge = p.mount ? 9 : (p.bashT ?? 9);
      c.charging = !p.mount && !!p.charging;
      c.casting = p.mount ? 0 : (p.casting ?? 0);
      c.animate(dt, p.speed, f.turn, Math.min(1, (p.swingT ?? 9) / SWING_TIME), load.hand !== 0, p.blocking && !p.mount, f.vy, f.air, !!p.eating && !p.mount);
      c.setArmor(p.armor);
      c.setHeld(load.hand, this.models);
      c.setShield(load.shield, this.models);
      this.light(f, p);
    }
    for (const [id, f] of this.figures) {
      if (live.has(id)) continue;
      this.group.remove(f.group);
      this.disposeFigure(f);
      this.figures.delete(id);
    }
    this.lastStats = { total: n, full, blocks, hidden, syncMs: performance.now() - t0 };
  }

  private disposeFigure(f: Figure): void {
    f.rig?.dispose();
    if (f.character) {
      f.character.setHeld(0, this.models);
      f.character.setShield(0, this.models);
      f.character.dispose();
    }
    (f.block.material as THREE.Material).dispose();
    if (f.label) (f.label.material as THREE.SpriteMaterial).dispose();
    f.labelTex?.dispose();
  }

  dispose(): void {
    for (const f of this.figures.values()) {
      this.group.remove(f.group);
      this.disposeFigure(f);
    }
    this.figures.clear();
    disposeCharacterAssets();
  }
}
