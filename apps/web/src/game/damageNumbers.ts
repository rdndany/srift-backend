import * as THREE from 'three';

/** How a number looks: the fill and the edge colour, and its size. */
interface Look {
  fill: string;
  edge: string;
  size: number;
  font?: number;
}

const LOOKS = {
  dealt: { fill: '#fff6d8', edge: '#6b4a10', size: 1 },
  crit: { fill: '#ffb347', edge: '#7a2200', size: 1.45 },
  taken: { fill: '#ff6a5c', edge: '#4a0a08', size: 1.1 },
  guarded: { fill: '#a8d8ff', edge: '#0d3358', size: 1.1 },
  total: { fill: '#9be7ff', edge: '#0d2e44', size: 0.85, font: 54 },
  xp: { fill: '#9dff72', edge: '#0d3a08', size: 0.8, font: 54 },
  coins: { fill: '#ffd84a', edge: '#5a3a00', size: 0.8, font: 54 },
  block: { fill: '#d6e6ff', edge: '#1a3a66', size: 1.25, font: 56 },
  parry: { fill: '#ffe45c', edge: '#7a3a00', size: 1.6, font: 56 },
  dodge: { fill: '#8cf0c8', edge: '#07402e', size: 1.5, font: 56 },
  head: { fill: '#ff6a4a', edge: '#3a0a00', size: 1.15, font: 50 },
  combo: { fill: '#ffe45c', edge: '#5a2a00', size: 1.15, font: 50 },
} satisfies Record<string, Look>;

type Kind = keyof typeof LOOKS;

interface Num {
  sprite: THREE.Sprite;
  age: number;
  ttl: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  /** Follow the camera (a number over the player's own view) instead of staying where it was made. */
  hud: boolean;
  /** Hangs in place (a running total) instead of floating up. */
  still?: boolean;
}

const fmt = (amount: number): string => (Number.isInteger(amount) ? String(amount) : amount.toFixed(1));

/**
 * Damage numbers that float up and fade: white over the mobs the player hurt (orange and larger for a critical),
 * red in front of the view for damage the player took, blue when a guard ability was cutting it down.
 */
export class DamageNumbers {
  readonly group = new THREE.Group();
  private readonly live: Num[] = [];
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private readonly materials = new Map<string, THREE.SpriteMaterial>();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private totalNum: Num | null = null;
  private dummy: THREE.Sprite | null = null;

  /**
   * Draw the letters a floating number uses, and one sprite, so the first hit does not build them.
   * `release` takes the spare sprite away once the loading screen has drawn it.
   */
  warm(): void {
    if (this.dummy) return;
    const samples: [string, Kind][] = [
      ['8', 'dealt'],
      ['8!', 'crit'],
      ['-8', 'taken'],
      ['-8', 'guarded'],
      ['+8 XP', 'xp'],
      ['+8 Auren', 'coins'],
      ['BLOCK', 'block'],
      ['PARRY!', 'parry'],
      ['DODGE!', 'dodge'],
      ['HEADSHOT', 'head'],
      ['FINISHER', 'combo'],
      ['\u03A3 8', 'total'],
    ];
    for (const [text, kind] of samples) this.material(text, kind);
    this.dummy = new THREE.Sprite(this.material('8', 'dealt'));
    this.dummy.frustumCulled = false;
    this.dummy.position.set(0, -4000, 0);
    this.dummy.scale.set(0.01, 0.01, 0.01);
    this.group.add(this.dummy);
  }

  release(): void {
    if (!this.dummy) return;
    this.group.remove(this.dummy);
    this.dummy = null;
  }

  private material(text: string, kind: Kind): THREE.SpriteMaterial {
    const key = `${kind}:${text}`;
    let m = this.materials.get(key);
    if (m) return m;
    if (this.materials.size > 160) this.clearCache();
    const look: Look = LOOKS[kind];
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const g = canvas.getContext('2d')!;
    g.font = `bold ${look.font ?? 64}px "Trebuchet MS", Verdana, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 12;
    g.strokeStyle = look.edge;
    g.strokeText(text, 128, 50);
    g.fillStyle = look.fill;
    g.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.materials.set(key, m);
    return m;
  }

  private clearCache(): void {
    for (const t of this.textures.values()) t.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.textures.clear();
    this.materials.clear();
  }

  /** A number where a mob was hurt (`tag`: a word over it: a headshot, the last stab of a dagger's combo). */
  dealt(x: number, y: number, z: number, amount: number, crit: boolean, total?: number, tag?: 'head' | 'combo'): void {
    this.add(x, y, z, fmt(amount) + (crit ? '!' : ''), crit ? 'crit' : 'dealt', false);
    if (tag) this.add(x, y + 0.6, z, tag === 'head' ? 'HEADSHOT' : 'FINISHER', tag, false);
    if (total === undefined) return;
    // A training dummy keeps a running count above the numbers: one at a time, in place.
    if (this.totalNum) {
      const i = this.live.indexOf(this.totalNum);
      if (i >= 0) this.remove(i);
    }
    this.add(x, y + 0.45, z, '\u03A3 ' + Math.round(total), 'total', false);
    this.totalNum = this.live[this.live.length - 1];
    this.totalNum.still = true;
  }

  /** A number in front of the camera for damage the player took. */
  taken(amount: number, guarded: boolean, camera: THREE.Camera): void {
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const p = camera.position;
    const side = (Math.random() - 0.5) * 0.9;
    this.add(p.x + this.fwd.x * 1.7 + this.right.x * side, p.y + this.fwd.y * 1.7 - 0.42, p.z + this.fwd.z * 1.7 + this.right.z * side, '-' + fmt(amount), guarded ? 'guarded' : 'taken', true);
  }

  /** A "+N XP" in front of the camera for experience that came to the player (it has no orbs: it is simply theirs). */
  xp(amount: number, camera: THREE.Camera): void {
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const p = camera.position;
    this.add(p.x + this.fwd.x * 1.7 + this.right.x * 0.55, p.y + this.fwd.y * 1.7 - 0.12, p.z + this.fwd.z * 1.7 + this.right.z * 0.55, '+' + fmt(amount) + ' XP', 'xp', true);
  }

  /** A gold "+N Auren" in front of the camera, on the other side from the experience, for coins that came to the player. */
  coins(amount: number, camera: THREE.Camera): void {
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const p = camera.position;
    this.add(p.x + this.fwd.x * 1.7 - this.right.x * 0.55, p.y + this.fwd.y * 1.7 - 0.12, p.z + this.fwd.z * 1.7 - this.right.z * 0.55, '+' + fmt(amount) + ' Auren', 'coins', true);
  }

  /** "BLOCK" or "PARRY!" a little above the middle of the view when the player's shield stopped a hit. */
  guard(what: 'block' | 'parry' | 'dodge', camera: THREE.Camera): void {
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const p = camera.position;
    this.add(p.x + this.fwd.x * 1.7, p.y + this.fwd.y * 1.7 + 0.12, p.z + this.fwd.z * 1.7, what === 'parry' ? 'PARRY!' : what === 'dodge' ? 'DODGE!' : 'BLOCK', what, true);
  }

  private add(x: number, y: number, z: number, text: string, kind: Kind, hud: boolean): void {
    if (this.live.length > 40) this.remove(0);
    const sprite = new THREE.Sprite(this.material(text, kind).clone());
    sprite.renderOrder = 999;
    sprite.frustumCulled = false;
    sprite.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
    this.group.add(sprite);
    this.live.push({
      sprite,
      age: 0,
      ttl: kind === 'total' ? 2.6 : kind === 'crit' ? 1.1 : kind === 'xp' || kind === 'coins' ? 1.3 : kind === 'block' || kind === 'parry' || kind === 'dodge' ? 1.0 : 0.9,
      vx: kind === 'total' || kind === 'block' || kind === 'parry' || kind === 'dodge' ? 0 : (Math.random() - 0.5) * 0.8,
      vy: kind === 'total' ? 0 : kind === 'crit' ? 2.4 : kind === 'block' || kind === 'parry' || kind === 'dodge' ? 1.1 : 1.8,
      vz: kind === 'total' || kind === 'block' || kind === 'parry' || kind === 'dodge' ? 0 : (Math.random() - 0.5) * 0.8,
      size: LOOKS[kind].size,
      hud,
    });
  }

  private remove(i: number): void {
    const n = this.live[i];
    this.group.remove(n.sprite);
    n.sprite.material.dispose(); // the clone only; the textures are cached
    this.live.splice(i, 1);
  }

  update(dt: number, camera: THREE.Camera): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      n.age += dt;
      if (n.age >= n.ttl) {
        this.remove(i);
        continue;
      }
      const k = n.age / n.ttl;
      if (!n.still) n.vy -= dt * (n.hud ? 1.2 : 2.6);
      n.sprite.position.x += n.vx * dt;
      n.sprite.position.y += n.vy * dt;
      n.sprite.position.z += n.vz * dt;
      // Readable from far away: the size follows the distance a little, and pops in.
      const dist = n.hud ? 1.7 : Math.max(2, n.sprite.position.distanceTo(camera.position));
      const pop = n.still ? 1 : k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : 1.15 - Math.min(0.15, (k - 0.12) * 0.4);
      const h = (n.hud ? 0.2 : 0.16 + dist * 0.045) * n.size * pop;
      n.sprite.scale.set(h * (8 / 3), h, 1);
      n.sprite.material.opacity = k < (n.still ? 0.8 : 0.6) ? 1 : 1 - (k - (n.still ? 0.8 : 0.6)) / (n.still ? 0.2 : 0.4);
    }
  }

  dispose(): void {
    while (this.live.length) this.remove(0);
    this.totalNum = null;
    this.clearCache();
  }
}
