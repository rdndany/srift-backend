import * as THREE from 'three';
import type { MapData } from './mapData';

/**
 * The map item as it is held: a flat sheet of paper, a voxel block, with the lands around the player painted on
 * it as they are (one square of the picture to every 1/2 block or so, the way Minecraft's map is made of big squares). The picture is
 * repainted a few times a second while the map is in a hand; the sheet is held low and small in the right or left hand, and brought up in
 * both hands, big, in front of the face when it is opened (see `HeldItem`).
 */

/** The picture on the sheet: SHEET_PX squares across, PAD of them on every side the paper's margin, the rest the ground. */
export const SHEET_PX = 160;
const PAD = 10;
const AREA = SHEET_PX - PAD * 2;
/** The zooms of the map: how many times the 0.5 square to a block it is magnified. */
const ZOOMS = [1, 2, 4];

const FRAME_A = '#9a7440';
const FRAME_B = '#7a5a30';
const PAPER = '#cdb67f';
const INK = '#1b1208';

/** A 3x5 glyph, one string a row. */
const GLYPHS: Record<string, string[]> = {
  '!': ['010', '010', '010', '000', '010'],
  '?': ['110', '001', '010', '000', '010'],
  N: ['101', '111', '111', '101', '101'],
};

/** Is (x, y) inside the polygon? (Even-odd rule.) */
function inside(poly: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const ARROW: readonly (readonly [number, number])[] = [
  [0, -1],
  [0.7, 0.8],
  [0, 0.4],
  [-0.7, 0.8],
];

/** The painted picture, and the texture it is. */
export class MapSheet {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private cut: HTMLCanvasElement | null = null;

  constructor() {
    this.canvas.width = this.canvas.height = SHEET_PX;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.paint(null, 1);
  }

  private glyph(ch: string, x: number, y: number, color: string, size = 1): void {
    const rows = GLYPHS[ch];
    this.g.fillStyle = color;
    rows.forEach((row, j) => [...row].forEach((on, i) => on === '1' && this.g.fillRect(x + i * size, y + j * size, size, size)));
  }

  /** A marker: a square with a mark in it. */
  private badge(x: number, y: number, ch: string, fill: string, ink: string): void {
    const g = this.g;
    x = Math.round(x);
    y = Math.round(y);
    g.fillStyle = INK;
    g.fillRect(x - 5, y - 5, 11, 11);
    g.fillStyle = fill;
    g.fillRect(x - 4, y - 4, 9, 9);
    this.glyph(ch, x - 1, y - 2, ink);
  }

  /** Your own land: a little gold house (a roof over a wall with a door), so it can be told from a quest or a friend. */
  private house(x: number, y: number): void {
    const g = this.g;
    x = Math.round(x);
    y = Math.round(y);
    g.fillStyle = INK;
    g.fillRect(x - 5, y - 1, 11, 7); // the walls' outline
    g.fillRect(x - 3, y - 4, 7, 3); // the roof's
    g.fillRect(x - 1, y - 5, 3, 1);
    g.fillStyle = '#ffd34d';
    g.fillRect(x - 4, y, 9, 5); // the walls
    g.fillStyle = '#e0702f';
    g.fillRect(x - 2, y - 3, 5, 2); // the roof
    g.fillRect(x - 1, y - 4, 3, 1);
    g.fillStyle = '#4a2a00';
    g.fillRect(x, y + 2, 1, 3); // the door
  }

  /** A party member: a green square with a pale one in it. */
  private friend(x: number, y: number): void {
    const g = this.g;
    x = Math.round(x);
    y = Math.round(y);
    g.fillStyle = '#06260e';
    g.fillRect(x - 3, y - 3, 7, 7);
    g.fillStyle = '#62e07a';
    g.fillRect(x - 2, y - 2, 5, 5);
    g.fillStyle = '#d8ffe0';
    g.fillRect(x - 1, y - 1, 3, 3);
  }

  /** The arrow of the player, turned to where they look (yaw 0 is north, up the map), in squares like the rest. */
  private arrow(cx: number, cy: number, yaw: number): void {
    const g = this.g;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const size = 6.5;
    for (let j = -9; j <= 9; j++) {
      for (let i = -9; i <= 9; i++) {
        // The square's place in the arrow's own space (the arrow turns by -yaw on the picture, so the square turns by +yaw).
        const u = (i * c - j * s) / size;
        const v = (i * s + j * c) / size;
        if (inside(ARROW, u, v)) g.fillStyle = '#fff6d2';
        else if (inside(ARROW, u * 0.78, v * 0.78)) g.fillStyle = INK;
        else continue;
        g.fillRect(Math.round(cx) + i, Math.round(cy) + j, 1, 1);
      }
    }
  }

  /** The ground, the people, the quest givers and the player, on the paper. `zoom` is one of 1, 2, 4. */
  paint(map: MapData | null, zoom: number): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    // The frame is one row of big blocks all the way round (a block is PAD squares), two woods taking turns, so it is as chunky as the
    // rest of what is held; the paper is inside it.
    const cells = SHEET_PX / PAD;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        if (i > 0 && j > 0 && i < cells - 1 && j < cells - 1) continue;
        g.fillStyle = (i + j) % 2 ? FRAME_A : FRAME_B;
        g.fillRect(i * PAD, j * PAD, PAD, PAD);
      }
    }
    g.fillStyle = PAPER;
    g.fillRect(PAD, PAD, AREA, AREA);
    // The north mark on the top block, and which zoom: three blocks on the bottom one, the one in use lit.
    this.glyph('N', Math.floor(SHEET_PX / 2) - 3, 0, '#f1e2b0', 2);
    ZOOMS.forEach((z, i) => {
      g.fillStyle = z === zoom ? '#ffd34d' : '#4a3318';
      g.fillRect(SHEET_PX - 24 + i * 7, SHEET_PX - 8, 5, 5);
    });
    if (map) {
      const scale = zoom * 0.5;
      g.save();
      g.beginPath();
      g.rect(PAD, PAD, AREA, AREA);
      g.clip();
      g.translate(PAD, PAD);
      let per = scale;
      if (map.inside) {
        // In a dungeon the map is that place alone, its level cut at head height.
        const blocks = Math.round(AREA / scale);
        per = AREA / blocks;
        const image = map.levelSlice(blocks);
        this.cut ??= document.createElement('canvas');
        this.cut.width = image.width;
        this.cut.height = image.height;
        this.cut.getContext('2d')!.putImageData(image, 0, 0);
        g.drawImage(this.cut, 0, 0, AREA, AREA);
      } else map.draw(g, map.x, map.z, scale, AREA, AREA);
      g.restore();

      const mid = PAD + AREA / 2;
      const reach = AREA / 2 - 6;
      for (const o of map.others) {
        const dx = (o.x - map.x) * per;
        const dy = (o.z - map.z) * per;
        if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
        const x = Math.round(mid + dx);
        const y = Math.round(mid + dy);
        g.fillStyle = INK;
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle = '#6fd3ff';
        g.fillRect(x - 1, y - 1, 3, 3);
      }
      // The quests first, so that the more urgent pins are on top of them; party members stay on the edge when they are out of view.
      const order: Record<string, number> = { waiting: 0, offer: 1, ready: 2, land: 3, party: 4 };
      for (const p of [...map.pins].sort((a, b) => order[a.kind] - order[b.kind])) {
        let dx = (p.x - map.x) * per;
        let dy = (p.z - map.z) * per;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (dist > reach) {
          if (p.kind !== 'party' && p.kind !== 'land') continue;
          dx *= reach / dist;
          dy *= reach / dist;
        }
        if (p.kind === 'offer') this.badge(mid + dx, mid + dy, '!', '#ffd34d', '#4a2a00');
        else if (p.kind === 'ready') this.badge(mid + dx, mid + dy, '?', '#ffd34d', '#4a2a00');
        else if (p.kind === 'waiting') this.badge(mid + dx, mid + dy, '?', '#aeb2bb', '#2b2f38');
        else if (p.kind === 'land') this.house(mid + dx, mid + dy);
        else this.friend(mid + dx, mid + dy);
      }
      this.arrow(mid, mid, map.yaw);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** How light each face of a box is (+x -x +y -y +z -z), so a box reads as a block. */
const FACE_SHADE = [0.8, 0.8, 1, 0.5, 0.9, 0.9];

/** Colour a box's vertices (the colour in linear light, or white) with each face's shade. */
function shaded(geo: THREE.BufferGeometry, hex?: number): THREE.BufferGeometry {
  const c = hex === undefined ? new THREE.Color(1, 1, 1) : new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const colors = new Float32Array(24 * 3);
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) colors.set([c.r * FACE_SHADE[f], c.g * FACE_SHADE[f], c.b * FACE_SHADE[f]], (f * 4 + k) * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Where the sheet is in a hand that is not reading it (in the units of the pivot of the hand): turned toward the middle, tipped back. */
const IDLE = {
  right: { at: new THREE.Vector3(0, 0, 0), turn: new THREE.Euler(-0.32, 0.12, 0.04) },
  left: { at: new THREE.Vector3(0.1, 0.1, 0.02), turn: new THREE.Euler(-0.32, -0.12, -0.04) },
};
/** How big the sheet is (its width) in the view when it is held low in one hand. */
export const SHEET_SCALE = 0.34;
/** How big the character's arm is (1 = as in the body: a quarter of a block thick) beside the sheet, held low in the hand and held open. */
const ARM_IDLE = 1.6;
const ARM_OPEN = 1.04;

/**
 * The map in 3D: a sheet, an arm on each side coming up to it, like the empty hand's. The sheet is 1 wide; the group
 * is scaled to `SHEET_SCALE` and `HeldItem` moves it. One model per hand (a model has only one place to be).
 */
export class MapModel {
  readonly group = new THREE.Group();
  private readonly hands: Record<'left' | 'right', THREE.Group>;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly front: THREE.MeshBasicMaterial;

  /**
   * `texture` is the picture, `arms` the arms of a character (the same ones the body has, see `Character`), `flat` makes the material for plain coloured boxes (`HeldItem`
   * tints these with the light; the picture is not tinted, it is a lit page).
   */
  constructor(
    texture: THREE.Texture,
    arms: { left: THREE.Object3D; right: THREE.Object3D },
    flat: () => THREE.MeshBasicMaterial,
    private readonly side: 'left' | 'right',
  ) {
    const mat = flat();
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      this.geos.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const T = 0.045;
    // The sheet: a thin block of paper and the picture on its face.
    add(this.group, shaded(new THREE.BoxGeometry(1, 1, T), 0xcdb67f), mat, 0, 0, 0);
    this.front = new THREE.MeshBasicMaterial({ map: texture });
    add(this.group, new THREE.PlaneGeometry(1, 1), this.front, 0, 0, T / 2 + 0.0008);
    // The hands: the character's own arms (skin, sleeve, armor and all), the hand end at the paper and the arm coming from the bottom of the
    // view. The hand that holds the map is always there; the other one slides in along its own arm when the map is opened.
    const hand = (s: -1 | 1): THREE.Group => {
      const h = new THREE.Group();
      this.group.add(h);
      const dir = new THREE.Vector3(s * 0.34, -0.5, 0.8).normalize();
      const arm = s < 0 ? arms.left : arms.right;
      // The arm hangs down from its shoulder in the character's space: its up is turned to point back along the arm toward the viewer.
      arm.position.set(0, 0, 0);
      arm.rotation.set(0, 0, 0);
      const wrap = new THREE.Group();
      wrap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      wrap.add(arm);
      h.add(wrap);
      h.position.set(s * 0.51, -0.38, -0.02);
      h.userData.at = h.position.clone();
      h.userData.dir = dir;
      h.userData.wrap = wrap;
      return h;
    };
    this.hands = { left: hand(-1), right: hand(1) };    this.group.scale.setScalar(SHEET_SCALE);
    this.group.userData.map = true;
    this.pose(0);
  }

  /** `open` (0..1): how far the map is brought up from the one hand to the two. */
  pose(open: number): void {
    const idle = IDLE[this.side];
    const rest = 1 - open;
    this.group.position.copy(idle.at).multiplyScalar(rest);
    this.group.rotation.set(idle.turn.x * rest, idle.turn.y * rest, idle.turn.z * rest);
    // The hand that does not hold the map comes in a little after the map starts to rise, along its arm from out of the view.
    const late = Math.min(1, Math.max(0, (open - 0.2) / 0.8));
    const slide = 1 - late * late * (3 - 2 * late);
    // The arms are as thick as the empty hand's arm is: that is a bigger share of the sheet while it is small in the hand than when it is open.
    const k = ARM_IDLE + (ARM_OPEN - ARM_IDLE) * open;
    for (const side of ['left', 'right'] as const) {
      const h = this.hands[side];
      const away = side === this.side ? 0 : slide;
      h.position.copy(h.userData.at as THREE.Vector3).addScaledVector(h.userData.dir as THREE.Vector3, away * 2.2);
      h.visible = away < 0.98;
      const wrap = h.userData.wrap as THREE.Object3D;
      wrap.scale.setScalar(k);
      wrap.position.copy(h.userData.dir as THREE.Vector3).multiplyScalar(0.75 * k - 0.06);
    }
  }
  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.front.dispose();
  }
}
