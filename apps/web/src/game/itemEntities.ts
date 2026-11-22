import * as THREE from 'three';
import { ELEMENTS, dominantElement, makeStack, parseGear, tooltipLines, type ClassId, type ItemStack, type TipColor, type TipLine } from '@solrift/shared';
import type { DropLike } from './clientSession';
import type { ItemIcons } from './icons';
import type { EntityLight } from './entityLight';
import { addAura } from './enchantFx';

/** The colours of a tooltip line (the same as the hover tooltips in the menus). */
const TIP_COLOR: Record<TipColor, string> = {
  name: '#ffffff',
  rare: '#55ffff',
  kind: '#a58cff',
  stat: '#7f8fff',
  good: '#55ff55',
  dim: '#a8a8a8',
  ench: '#cfcfcf',
  warn: '#ff5555',
  uncommon: '#1eff00',
  superior: '#4aa3ff',
  epic: '#c36bff',
  jewel: '#ffd24a',
};

/** A name tag shows from this far away, fading in over the last couple of blocks. */
const LABEL_RANGE = 24;
const LABEL_FADE = 6;
/** Up to this far a tag is as big as it is in the world; farther off it grows with the distance, so it stays as big on the screen and can still be read. */
const LABEL_NEAR = 3.5;
/** World size of one canvas pixel of a tag. */
const TAG_SCALE = 0.0042;
const MAX_CACHED = 80;

interface Label {
  tex: THREE.CanvasTexture;
  /** Canvas size in pixels. */
  w: number;
  h: number;
}

/** A drop's body: what is spun, the materials that are its own (lit and then thrown away with it), and how high it hovers. */
interface Piece {
  obj: THREE.Object3D;
  mats: THREE.MeshBasicMaterial[];
  lift: number;
  /** The soft light round a drop that carries glyphs (it breathes with `sync`). */
  halo?: THREE.Sprite;
}

interface Tag {
  sprite: THREE.Sprite;
  lines: TipLine[];
  count: number;
  cls: ClassId | null | undefined;
  /** The key of the label now on the sprite. */
  shown: string;
}

/** Draws the session's dropped items as little spinning sprites, each with a name tag above it. The physics lives in `DropWorld`. */
export class ItemEntities {
  readonly group = new THREE.Group();
  private meshes = new Map<number, Piece>();
  /** One material per item id, holding the icon texture; every drop gets its own clone so it can have its own light. */
  private bases = new Map<number, THREE.MeshBasicMaterial>();
  private textures: THREE.Texture[] = [];
  private geo = new THREE.PlaneGeometry(0.42, 0.42);
  private brightness = 1;
  private env: EntityLight | null = null;
  private readonly tmp = new THREE.Color();
  private tags = new Map<number, Tag>();
  private labels = new Map<string, Label>();
  private readonly ctx = document.createElement('canvas').getContext('2d');

  /** `models` makes the solid model of an item (see `HeldItem.dropModel`); without one a drop is a flat picture. */
  constructor(
    private readonly icons: ItemIcons,
    private readonly models: ((id: number) => THREE.Object3D | null) | null = null,
  ) {
    // Tags drawn before the pixel font is ready would keep the fallback font: redraw them once it is.
    void document.fonts?.load('24px Monocraft').then(() => this.flushLabels());
  }

  setBrightness(b: number): void {
    this.brightness = b;
  }

  /** Light drops from the world (sky colour, caves, torches) instead of by the time of day alone. */
  setEnvironment(env: EntityLight): void {
    this.env = env;
  }

  private base(id: number): THREE.MeshBasicMaterial {
    let m = this.bases.get(id);
    if (!m) {
      const tex = new THREE.CanvasTexture(this.icons.canvas(id));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(tex);
      m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide });
      this.bases.set(id, m);
    }
    return m;
  }

  /** The body of a new drop: the item's solid model (with materials of its own, to be lit by itself), or its flat picture when there is none. */
  private make(d: DropLike): Piece {
    const piece = this.body(d);
    const el = d.stack.ench && d.stack.ench.length > 0 ? dominantElement(this.stackOf(d)) : null;
    if (el) {
      const color = ELEMENTS[el].color;
      addAura(piece.obj, color);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      halo.scale.setScalar(1.1);
      halo.renderOrder = 10;
      piece.obj.add(halo);
      piece.halo = halo;
    }
    return piece;
  }

  /** One soft round light, shared by every halo (tinted by each). */
  private haloTex: THREE.CanvasTexture | null = null;
  private haloTexture(): THREE.CanvasTexture {
    if (!this.haloTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.haloTex = new THREE.CanvasTexture(c);
      this.haloTex.colorSpace = THREE.SRGBColorSpace;
    }
    return this.haloTex;
  }

  private body(d: DropLike): Piece {
    const model = this.models?.(d.stack.id) ?? null;
    if (!model) {
      const mesh = new THREE.Mesh(this.geo, this.base(d.stack.id).clone());
      return { obj: mesh, mats: [mesh.material as THREE.MeshBasicMaterial], lift: 0.25 };
    }
    const mats: THREE.MeshBasicMaterial[] = [];
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const own = (o.material as THREE.MeshBasicMaterial).clone();
      o.material = own;
      mats.push(own);
    });
    // Turning about its own middle: the model sits inside a holder that is the one that spins.
    const holder = new THREE.Group();
    holder.add(model);
    return { obj: holder, mats, lift: 0.24 };
  }

  /** What the drop is, as a stack the tooltip code can describe. */
  private stackOf(d: DropLike): ItemStack {
    const s = makeStack(d.stack.id, d.stack.count ?? 1, d.stack.damage ?? 0, d.stack.ench ? d.stack.ench.map(([a, b]) => [a, b] as [number, number]) : undefined);
    if (d.stack.name) s.name = d.stack.name;
    const gear = parseGear(d.stack.gear, d.stack.id);
    if (gear) s.gear = gear;
    return s;
  }

  /** A canvas texture of a name tag (cached): a flat dark box with blocky text, like a name tag in the original. */
  private label(name: TipLine, count: number, key: string): Label | null {
    const hit = this.labels.get(key);
    if (hit) return hit;
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.labels.size >= MAX_CACHED) this.flushLabels();
    const font = `24px Monocraft, "Courier New", monospace`;
    const text = count > 1 ? `${name.text} x${count}` : name.text;
    ctx.font = font;
    const textW = Math.ceil(ctx.measureText(text).width);
    const pad = 6;
    const w = textW + pad * 2;
    const h = 24 + pad * 2;
    const canvas = ctx.canvas;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const y = h / 2 + 2;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillText(text, pad + 2, y + 2);
    ctx.fillStyle = TIP_COLOR[name.color];
    ctx.fillText(text, pad, y);
    // The canvas is reused, so the texture takes a copy.
    const copy = document.createElement('canvas');
    copy.width = w;
    copy.height = h;
    copy.getContext('2d')?.drawImage(canvas, 0, 0);
    const tex = new THREE.CanvasTexture(copy);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    const made: Label = { tex, w, h };
    this.labels.set(key, made);
    return made;
  }

  private flushLabels(): void {
    for (const l of this.labels.values()) l.tex.dispose();
    this.labels.clear();
    for (const t of this.tags.values()) t.shown = '';
  }

  /** Make the meshes match the session's drops. `eye` is where the player looks from: the name tags fade with the distance to it. */
  sync(drops: readonly DropLike[], eye?: THREE.Vector3, viewerClass?: ClassId | null): void {
    const live = new Set<number>();
    for (const d of drops) {
      live.add(d.id);
      let piece = this.meshes.get(d.id);
      if (!piece) {
        piece = this.make(d);
        this.meshes.set(d.id, piece);
        this.group.add(piece.obj);
      }
      piece.obj.position.set(d.x, d.y + piece.lift + Math.sin(d.age * 2.4 + d.phase) * 0.05, d.z);
      piece.obj.rotation.y = d.age * 1.6 + d.phase;
      if (piece.halo) {
        const breath = 0.5 + 0.5 * Math.sin(d.age * 3 + d.phase);
        piece.halo.scale.setScalar(0.9 + breath * 0.35);
        (piece.halo.material as THREE.SpriteMaterial).opacity = 0.55 + breath * 0.4;
      }
      if (this.env) {
        this.env.at(d.x, d.y, d.z, this.tmp);
        this.tmp.setRGB(Math.min(1, Math.max(0.25, this.tmp.r)), Math.min(1, Math.max(0.25, this.tmp.g)), Math.min(1, Math.max(0.25, this.tmp.b)));
      } else this.tmp.setScalar(Math.max(0.25, this.brightness));
      for (const m of piece.mats) m.color.copy(this.tmp);
      if (eye) this.tag(d, eye, viewerClass);
    }
    if (this.meshes.size !== live.size) {
      for (const [id, piece] of this.meshes) {
        if (live.has(id)) continue;
        this.group.remove(piece.obj);
        for (const m of piece.mats) m.dispose();
        piece.halo?.material.dispose();
        this.meshes.delete(id);
      }
    }
    for (const [id, tag] of this.tags) {
      if (live.has(id)) continue;
      this.group.remove(tag.sprite);
      tag.sprite.material.dispose();
      this.tags.delete(id);
    }
  }

  /** The name tag of a drop: its name and how many. */
  private tag(d: DropLike, eye: THREE.Vector3, viewerClass: ClassId | null | undefined): void {
    const dist = Math.hypot(d.x - eye.x, d.y - eye.y, d.z - eye.z);
    let tag = this.tags.get(d.id);
    if (dist > LABEL_RANGE) {
      if (tag) tag.sprite.visible = false;
      return;
    }
    const count = d.stack.count ?? 1;
    if (!tag || tag.cls !== viewerClass || tag.count !== count) {
      const lines = tooltipLines(this.stackOf(d), viewerClass);
      if (!tag) {
        const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false });
        const sprite = new THREE.Sprite(mat);
        sprite.center.set(0.5, 0);
        sprite.renderOrder = 20;
        this.group.add(sprite);
        tag = { sprite, lines, count, cls: viewerClass, shown: '' };
        this.tags.set(d.id, tag);
      } else {
        tag.lines = lines;
        tag.count = count;
        tag.cls = viewerClass;
        tag.shown = '';
      }
    }
    const lines = tag.lines;
    if (lines.length === 0) {
      tag.sprite.visible = false;
      return;
    }
    // The tag: "Name x3" in the colour of the item's name.
    const name = lines[0];
    const key = `${name.color}:${name.text}|${count}`;
    if (tag.shown !== key) {
      const lab = this.label(name, count, key);
      if (!lab) {
        tag.sprite.visible = false;
        return;
      }
      const mat = tag.sprite.material;
      mat.map = lab.tex;
      mat.needsUpdate = true;
      tag.sprite.userData.w = lab.w;
      tag.sprite.userData.h = lab.h;
      tag.shown = key;
    }
    const mat = tag.sprite.material;
    // Tags fade out with distance.
    const grow = Math.max(1, dist / LABEL_NEAR);
    tag.sprite.scale.set((tag.sprite.userData.w as number) * TAG_SCALE * grow, (tag.sprite.userData.h as number) * TAG_SCALE * grow, 1);
    mat.opacity = Math.min(1, Math.max(0, (LABEL_RANGE - dist) / LABEL_FADE));
    tag.sprite.visible = mat.opacity > 0.02;
    tag.sprite.position.set(d.x, d.y + 0.5 + Math.sin(d.age * 2.4 + d.phase) * 0.05, d.z);
  }

  dispose(): void {
    for (const piece of this.meshes.values()) {
      this.group.remove(piece.obj);
      for (const m of piece.mats) m.dispose();
      piece.halo?.material.dispose();
    }
    this.meshes.clear();
    this.haloTex?.dispose();
    for (const tag of this.tags.values()) {
      this.group.remove(tag.sprite);
      tag.sprite.material.dispose();
    }
    this.tags.clear();
    for (const l of this.labels.values()) l.tex.dispose();
    this.labels.clear();
    this.geo.dispose();
    for (const m of this.bases.values()) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
