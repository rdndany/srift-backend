import * as THREE from 'three';
import { CLASSES, I, OUTFIT_CLASSES, armorId, outfitItems } from '@solrift/shared';
import { Character, type Palette } from './character';
import { CompanionFollowers } from './companionRenderer';
import { lobbyFigure } from './lobbyFigures';
import { ShaderKeeper } from './shaderKeep';

/** A soft round shadow for the figure to stand on. */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * The one renderer every figure in a menu is drawn with. A renderer of its own for each screen meant a new graphics context
 * every time the inventory was opened, and every shader of the figure built again (on a busy card, for seconds, at every
 * opening). This one lives as long as the page does and keeps its shaders; each figure is drawn on it and copied to its own canvas.
 */
interface Shared {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  keeper: ShaderKeeper;
  w: number;
  h: number;
  ratio: number;
}
let shared: Shared | null = null;

function sharedRenderer(): Shared {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  shared = { renderer, canvas, keeper: new ShaderKeeper(renderer), w: 0, h: 0, ratio: 0 };
  return shared;
}

/**
 * The figure in the inventory screen: it wears whatever armor you have on, looks at the mouse, breathes,
 * and turns when you drag it. It is drawn on the shared renderer and copied to its canvas; while the screen is open it draws
 * about thirty times a second (it is one small canvas), and not at all when the tab is hidden.
 */
export class CharacterPreview {
  private readonly target: CanvasRenderingContext2D;
  private width = 170;
  private height = 230;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  private pivot = new THREE.Group();
  private character = new Character();
  private shadow: THREE.Mesh;
  private yaw = 0;
  private pitch = 0;
  /** The turn the player gave the figure by dragging it, easing back to nothing once let go. */
  private spin = 0;
  private spinNow = 0;
  private dragging = false;
  private turntable = false;
  private auto = 0;
  private raf = 0;
  private last = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    sharedRenderer(); // (throws where there is no WebGL: the screen then goes without the picture)
    const target = canvas.getContext('2d');
    if (!target) throw new Error('no 2d canvas');
    this.target = target;
    // The figure faces -z; turn it to face the camera.
    this.character.root.rotation.y = Math.PI;
    this.character.showSetHalo(false); // (the figure is copied onto the page: the edge of the halo would show; the stage has a glow of its own)
    this.pivot.add(this.character.root);
    this.pivot.position.y = -1.0;
    this.scene.add(this.pivot);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.position.y = -0.995;
    this.scene.add(this.shadow);
    this.camera.position.set(0, 0.05, 4.9);
    this.camera.lookAt(0, 0.0, 0);
    this.resize();
    this.loop(performance.now());
  }

  resize(): void {
    const w = this.canvas.clientWidth || 170;
    const h = this.canvas.clientHeight || 230;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * ratio);
    this.canvas.height = Math.floor(h * ratio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Repaint the figure for another look (skin tone, hair, eyes, clothes). */
  setLook(palette: Palette): void {
    this.character.setLook(palette);
    this.frame();
  }

  /** Wear armor and clothes (item ids). The figure keeps its size whatever it wears: a tall hat may reach out of the picture. */
  setArmor(ids: readonly number[]): void {
    this.character.setArmor(ids);
    this.frame();
  }

  /** Wear a pair of wings (the number the wire gives, 0: none). */
  setWings(no: number): void {
    this.character.setWings(no);
    this.winged = no > 0;
    this.frame();
  }

  private companions: CompanionFollowers | null = null;

  /** Keep a companion at the figure's shoulder (1 + its place in COMPANIONS, 0: none). It is drawn as it is in the game: it bobs, beats its wings and glows. */
  setCompanion(pet: number): void {
    if (pet === this.pet) return;
    this.pet = pet;
    if (pet > 0 && !this.companions) {
      this.companions = new CompanionFollowers();
      this.scene.add(this.companions.group);
    }
    this.frame();
  }

  private pet = 0; // 1 + the place of the companion in COMPANIONS (0: none)
  private winged = false; // wings are as wide as the figure is tall: the camera is pulled back so they show
  private grounded = false;
  /** The lobby stage: the picture is taller than the body, so a tall helm stays in frame and can pass under the chat. */
  private stage = false;

  /** Stand the figure on the bottom edge of the picture, as large as the picture is tall (a character-select screen), instead of floating in the middle. */
  setGrounded(on: boolean): void {
    this.grounded = on;
    this.frame();
  }

  setStage(on: boolean): void {
    this.stage = on;
    this.frame();
  }

  private frame(): void {
    // The body stays the same size with a set, a hat, wings or a companion. On the lobby stage the picture continues above the head,
    // so a tall helm is not cut off and can sit behind the chat.
    if (this.grounded) {
      const body = 3.1; // world units from the soles up, to a little above an ordinary head
      const span = this.stage ? body * (82 / 62) : body;
      const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const y = -1.07 + span / 2; // the feet stay on the bottom edge; the extra span is sky above the head
      this.camera.position.set(0, y, dist);
      this.camera.lookAt(0, y, 0);
      return;
    }
    const back = (this.winged ? 1.25 : 1) * (this.pet ? 1.12 : 1);
    const up = this.winged ? 0.3 : 0; // (the figure floats, and the wings rise to its head)
    this.camera.position.set(0, 0.05 + up, 4.9 * back);
    this.camera.lookAt(0, 0 + up, 0);
  }

  /** Turn the figure slowly all the way round (so the back, where a cape hangs, shows too). */
  setTurntable(on: boolean): void {
    this.turntable = on;
  }

  /** Hold an item in the main hand (id 0 = none). The model is the one a figure carries in the world. */
  setHeld(id: number): void {
    this.character.setHeld(id, lobbyFigure);
  }

  /** Carry what the off hand holds (id 0 = none): a shield on the arm, anything else in the hand, as in the world. */
  setShield(id: number): void {
    this.character.setShield(id, lobbyFigure);
  }

  /** Wear another skin (64x64, or the old 64x32): see `Character.setSkin`. */
  setSkin(source: HTMLCanvasElement | HTMLImageElement | ImageBitmap): boolean {
    return this.character.setSkin(source);
  }

  /** The mouse is `dx`, `dy` pixels from the figure's head: look that way. */
  look(dx: number, dy: number): void {
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    this.yaw = clamp(dx / 260, 1) * 0.9;
    this.pitch = clamp(-dy / 260, 1) * 0.55;
  }

  /** Dragging turns the figure round; `dx` is how far the pointer moved, in pixels. */
  dragBy(dx: number): void {
    this.dragging = true;
    this.spin += dx * 0.012;
  }

  release(): void {
    this.dragging = false;
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden || now - this.last < 30) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.render(now / 1000, dt);
  };

  render(t = performance.now() / 1000, dt = 1 / 30): void {
    if (!this.dragging) this.spin *= Math.pow(0.002, dt); // ease back to facing front
    this.spinNow += (this.spin - this.spinNow) * Math.min(1, dt * 18);
    const breath = Math.sin(t * 1.9);
    if (this.turntable && !this.dragging) this.auto += dt * 0.7;
    this.pivot.rotation.y = this.yaw * 0.55 + this.spinNow + this.auto;
    this.character.headPivot.rotation.y = this.yaw * 0.45;
    this.character.headPivot.rotation.x = this.pitch + breath * 0.012;
    this.character.pose(0);
    this.character.updateSet(t, dt);
    this.character.updateWings(t, dt);
    // The companion keeps to the stage, not to the turning figure: it hovers at the shoulder that faces the camera.
    this.companions?.sync(this.pet > 0 ? [{ key: 0, pet: this.pet, x: 0, y: this.pivot.position.y, z: 0, yaw: Math.PI }] : [], dt);
    // Breathing: the arms hang a touch out and in again, the chest and head rise by a hair.
    this.character.armL.rotation.z = -0.03 - breath * 0.012;
    this.character.armR.rotation.z = 0.03 + breath * 0.012;
    this.character.torso.position.y = breath * 0.004;
    this.character.headPivot.position.y = 1.65 + breath * 0.004;
    const s = sharedRenderer();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (s.w !== this.width || s.h !== this.height || s.ratio !== ratio) {
      // (Only when the size changes: setting it clears the picture and reallocates it.)
      s.w = this.width;
      s.h = this.height;
      s.ratio = ratio;
      s.renderer.setPixelRatio(ratio);
      s.renderer.setSize(this.width, this.height, false);
    }
    s.renderer.render(this.scene, this.camera);
    s.keeper.hold();
    // Straight away, while the picture is still there (it is not kept).
    this.target.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.target.drawImage(s.canvas, 0, 0, this.canvas.width, this.canvas.height);
  }

  /** For warmPreview: every part of the figure is drawn, also the clothes that only show with another piece worn. */
  showAll(): void {
    this.scene.traverse((o) => {
      o.visible = true;
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.setShield(0);
    this.setHeld(0);
    this.character.dispose();
    this.companions?.dispose();
    (this.shadow.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.shadow.geometry.dispose();
  }
}

/**
 * Build every shader the figure in a menu needs, once, while the game loads: a figure in plate armor, in the clothes of every class,
 * with a weapon and a shield. After this opening the inventory builds nothing (see Shared).
 */
export function warmPreview(): void {
  const sets = [
    { armor: [0, 1, 2, 3].map((slot) => armorId(slot, 'iron')), held: CLASSES.warrior.startingWeapon, shield: I.SHIELD },
    { armor: [outfitItems('mage')[0], outfitItems('warrior')[1], outfitItems('ranger')[2], outfitItems('warrior')[3]], held: CLASSES.mage.startingWeapon, shield: CLASSES.mage.startingOffhand },
    { armor: OUTFIT_CLASSES.map((c) => outfitItems(c)[0]), held: CLASSES.ranger.startingWeapon, shield: CLASSES.ranger.startingOffhand },
  ];
  for (const set of sets) {
    const canvas = document.createElement('canvas');
    // The same size as the box in the inventory, so the first time it opens the picture is not built again at a new size.
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;width:168px;height:208px;';
    host.appendChild(canvas);
    document.body.appendChild(host);
    const p = new CharacterPreview(canvas);
    p.setArmor(set.armor);
    p.setHeld(set.held);
    p.setShield(set.shield);
    p.showAll();
    p.render();
    p.dispose();
    host.remove();
  }
}
