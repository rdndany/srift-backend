import * as THREE from 'three';

/**
 * Fire for the Mage's Fireball: a soft particle system (embers, flames, smoke, flashes), the fireball in
 * flight (a hot core, glow, a comet tail and a trail it sheds), the muzzle flash and the explosion where it lands.
 * Everything here is drawn by the client from what the server already tells it (a spell projectile, a
 * `fireball_burst` mark); nothing in this file affects the game.
 */

/** What a particle is: it picks the colour ramp over its life. */
const FLAME = 0;
const SPARK = 1;
const FLASH = 2;
const SMOKE = 3;
/** The wand's arcane bolt: twinkling sparkles, violet mist and a blue-white flash. */
const GLINT = 4;
const MIST = 5;
const ARCFLASH = 6;
/** Frost: icy sparkles, cold mist and a pale flash; and a dark chunk of rock thrown up by a meteor. */
const FROST = 7;
const CHILL = 8;
const ICEFLASH = 9;
const ROCK = 10;
/** A Warrior's Shield Bash and Charge: tan dust that hangs in the air and cold chunks of broken ground. */
const DUST = 11;
const PEBBLE = 12;
/** The Ranger's: a green leaf that tumbles down, and a bright lime sparkle of wind. */
const LEAF = 13;
const WIND = 14;
/** A mount's lightning: a twinkling spark and a flash, both in the colour the particle was given (see `Layer.add`). */
const BOLT = 15;
const BOLTFLASH = 16;

const FIRE_MAX = 2200;
const SMOKE_MAX = 720;

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
attribute float aStar;
uniform float uScale;
varying vec4 vColor;
varying float vStar;
void main() {
  vColor = aColor;
  vStar = aStar;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSize * uScale / max(0.15, -mv.z), 220.0);
}
`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying float vStar;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float a = pow(1.0 - d, 1.7);
  // a four-pointed twinkle for the sparkles: a bright centre and thin arms along the axes
  float arms = max(0.0, 1.0 - abs(p.x) * 7.0) * max(0.0, 1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 7.0) * max(0.0, 1.0 - abs(p.x));
  a = mix(a, min(1.0, arms * arms + a * 0.9), vStar);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}
`;

/** One pool of soft round particles drawn as points in a single draw call. */
class Layer {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly siz: Float32Array;
  private readonly star: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly kind: Uint8Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly shade: Float32Array;
  /** The colour a BOLT or BOLTFLASH particle was given. */
  private readonly tint: Float32Array;
  private next = 0;
  private readonly uniforms = { uScale: { value: 600 } };
  private readonly size = new THREE.Vector2();
  private dirty = false;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor(n: number, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.siz = new Float32Array(n);
    this.star = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.shade = new Float32Array(n);
    this.tint = new Float32Array(n * 3).fill(1);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aStar', new THREE.BufferAttribute(this.star, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    // Points are sized in pixels: the scale that makes `size` a size in blocks comes from the camera that draws them.
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      const h = renderer.getDrawingBufferSize(this.size).y;
      const m = (camera as THREE.PerspectiveCamera).projectionMatrix.elements;
      this.uniforms.uScale.value = h * 0.5 * m[5];
    };
  }

  add(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, drag: number, grav: number, rgb?: readonly [number, number, number]): void {
    const i = this.next++ % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = Math.max(0.02, life);
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.kind[i] = kind;
    this.star[i] = kind === GLINT || kind === FROST || kind === WIND || kind === BOLT ? 1 : 0;
    if (rgb) {
      this.tint[i * 3] = rgb[0];
      this.tint[i * 3 + 1] = rgb[1];
      this.tint[i * 3 + 2] = rgb[2];
    }
    (this.geometry.attributes.aStar as THREE.BufferAttribute).needsUpdate = true;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.shade[i] = 0.75 + Math.random() * 0.25;
  }

  update(dt: number): void {
    let alive = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.siz[i] = 0;
        continue;
      }
      alive = true;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.siz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.ramp(i, t);
    }
    if (!alive && !this.dirty) return;
    this.dirty = alive;
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  /** The colour of particle `i` a fraction `t` through its life. */
  private ramp(i: number, t: number): void {
    const c = this.col;
    const o = i * 4;
    const sh = this.shade[i];
    switch (this.kind[i]) {
      case FLAME: {
        // white-yellow -> orange -> deep red, thinning out
        const r = 1;
        const g = t < 0.2 ? 0.95 - t * 1.5 : t < 0.65 ? 0.65 - (t - 0.2) * 0.9 : 0.25 - (t - 0.65) * 0.5;
        const b = t < 0.15 ? 0.55 - t * 3 : Math.max(0, 0.1 - (t - 0.15) * 0.2);
        c[o] = r * (t > 0.7 ? 0.9 - (t - 0.7) * 1.2 : 1);
        c[o + 1] = Math.max(0, g) * sh;
        c[o + 2] = Math.max(0, b);
        c[o + 3] = Math.min(1, t * 14) * Math.pow(1 - t, 0.9) * 0.9;
        break;
      }
      case SPARK: {
        c[o] = 1;
        c[o + 1] = Math.max(0.15, 0.9 - t * 0.75) * sh;
        c[o + 2] = Math.max(0, 0.45 - t * 0.7);
        c[o + 3] = t > 0.7 ? (1 - t) / 0.3 : 1;
        break;
      }
      case FLASH: {
        c[o] = 1;
        c[o + 1] = 0.9 - t * 0.5;
        c[o + 2] = 0.55 - t * 0.5;
        c[o + 3] = Math.pow(1 - t, 2);
        break;
      }
      case GLINT: {
        // an arcane sparkle: white-blue turning violet, twinkling
        c[o] = 0.85 - t * 0.3;
        c[o + 1] = 0.92 - t * 0.5;
        c[o + 2] = 1;
        c[o + 3] = (t > 0.65 ? (1 - t) / 0.35 : 1) * (0.65 + 0.35 * Math.sin(t * 38 + sh * 12));
        break;
      }
      case MIST: {
        c[o] = 0.5 * (1 - t * 0.4) * sh;
        c[o + 1] = 0.34 * (1 - t * 0.4) * sh;
        c[o + 2] = 1 * (1 - t * 0.3);
        c[o + 3] = Math.min(1, t * 10) * (1 - t) * 0.7;
        break;
      }
      case ARCFLASH: {
        c[o] = 0.82 - t * 0.3;
        c[o + 1] = 0.88 - t * 0.4;
        c[o + 2] = 1;
        c[o + 3] = Math.pow(1 - t, 2);
        break;
      }
      case FROST: {
        c[o] = 0.78 + t * 0.15;
        c[o + 1] = 0.95;
        c[o + 2] = 1;
        c[o + 3] = (t > 0.6 ? (1 - t) / 0.4 : 1) * (0.7 + 0.3 * Math.sin(t * 30 + sh * 14));
        break;
      }
      case CHILL: {
        c[o] = 0.55 * sh;
        c[o + 1] = 0.82 * sh;
        c[o + 2] = 1 * sh;
        c[o + 3] = Math.min(1, t * 9) * (1 - t) * 0.5;
        break;
      }
      case ICEFLASH: {
        c[o] = 0.72;
        c[o + 1] = 0.94;
        c[o + 2] = 1;
        c[o + 3] = Math.pow(1 - t, 2);
        break;
      }
      case ROCK: {
        // a lump of rock, glowing from the heat for the first instant
        const hot = Math.max(0, 1 - t * 5);
        c[o] = 0.2 * sh + hot * 0.8;
        c[o + 1] = 0.15 * sh + hot * 0.32;
        c[o + 2] = 0.12 * sh + hot * 0.06;
        c[o + 3] = t > 0.85 ? (1 - t) / 0.15 : 0.95;
        break;
      }
      case DUST: {
        c[o] = 0.62 * sh;
        c[o + 1] = 0.52 * sh;
        c[o + 2] = 0.4 * sh;
        c[o + 3] = Math.min(1, t * 9) * Math.pow(1 - t, 1.3) * 0.62;
        break;
      }
      case LEAF: {
        c[o] = (0.2 + 0.28 * sh) * (1 - t * 0.3);
        c[o + 1] = (0.5 + 0.32 * sh) * (1 - t * 0.25);
        c[o + 2] = 0.12 + 0.1 * sh;
        c[o + 3] = Math.min(1, t * 12) * (t > 0.7 ? (1 - t) / 0.3 : 1);
        break;
      }
      case WIND: {
        c[o] = 0.72 + 0.2 * t;
        c[o + 1] = 1;
        c[o + 2] = 0.6 + 0.2 * (1 - t);
        c[o + 3] = (t > 0.6 ? (1 - t) / 0.4 : 1) * (0.7 + 0.3 * Math.sin(t * 34 + sh * 12));
        break;
      }
      case BOLT: {
        // a spark of the mount's lightning: white-hot, then its own colour, twinkling
        const w = Math.max(0, 1 - t * 2.5);
        c[o] = this.tint[i * 3] + (1 - this.tint[i * 3]) * w;
        c[o + 1] = this.tint[i * 3 + 1] + (1 - this.tint[i * 3 + 1]) * w;
        c[o + 2] = this.tint[i * 3 + 2] + (1 - this.tint[i * 3 + 2]) * w;
        c[o + 3] = (t > 0.65 ? (1 - t) / 0.35 : 1) * (0.7 + 0.3 * Math.sin(t * 38 + sh * 12));
        break;
      }
      case BOLTFLASH: {
        const w = Math.max(0, 1 - t * 4);
        c[o] = this.tint[i * 3] + (1 - this.tint[i * 3]) * w;
        c[o + 1] = this.tint[i * 3 + 1] + (1 - this.tint[i * 3 + 1]) * w;
        c[o + 2] = this.tint[i * 3 + 2] + (1 - this.tint[i * 3 + 2]) * w;
        c[o + 3] = Math.pow(1 - t, 2);
        break;
      }
      case PEBBLE: {
        c[o] = 0.38 * sh;
        c[o + 1] = 0.32 * sh;
        c[o + 2] = 0.25 * sh;
        c[o + 3] = t > 0.8 ? (1 - t) / 0.2 : 1;
        break;
      }
      default: {
        // smoke: warm for a moment from the fire under it, then grey
        const warm = Math.max(0, 1 - t * 4);
        const base = 0.16 * sh;
        c[o] = base + warm * 0.35;
        c[o + 1] = base + warm * 0.12;
        c[o + 2] = base;
        c[o + 3] = Math.min(1, t * 8) * (1 - t) * 0.55;
      }
    }
  }

  clear(): void {
    this.life.fill(0);
    this.siz.fill(0);
    this.dirty = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

const SOFT_VERT = /* glsl */ `
uniform float uTime;
uniform float uWobble;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec3 p = position;
  float w = sin(p.x * 7.0 + uTime * 9.0) * sin(p.y * 6.0 - uTime * 7.0) * sin(p.z * 8.0 + uTime * 5.0);
  p *= 1.0 + uWobble * w;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const SOFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPower;
uniform float uInvert;
varying vec3 vN;
varying vec3 vView;
void main() {
  float f = abs(dot(normalize(vN), normalize(vView)));
  // uInvert 1: a bubble, bright at the rim and clear in the middle
  float g = mix(f, 1.0 - f, uInvert);
  gl_FragColor = vec4(uColor * (0.65 + 0.35 * g), pow(g, uPower) * uOpacity);
}
`;

/** Time for the wobble of every soft ball: one clock, advanced by FireParticles.update. */
const softTime = { value: 0 };

/**
 * A ball of fire without a hard edge: bright where you look straight at it, fading to nothing at the rim, and
 * its surface churning. uOpacity is the one to animate.
 */
export function softBall(color: number, opacity: number, power = 1.5, wobble = 0.12, invert = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uPower: { value: power }, uWobble: { value: wobble }, uInvert: { value: invert ? 1 : 0 }, uTime: softTime },
    vertexShader: SOFT_VERT,
    fragmentShader: SOFT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // a bubble is seen from inside as well (the caster stands in the middle of it)
    side: invert ? THREE.DoubleSide : THREE.FrontSide,
  });
}

/** A soft round gradient: white in the middle, nothing at the edge. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A drawing on a transparent canvas, white so that a material's colour tints it. */
function drawTexture(size: number, draw: (g: CanvasRenderingContext2D, c: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.translate(size / 2, size / 2);
  draw(g, size / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A magic circle: two rings, a band of marks, a hexagram and a ring of small glyphs. */
function runeTexture(): THREE.CanvasTexture {
  return drawTexture(256, (g, c) => {
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineCap = 'round';
    const ring = (r: number, w: number, a = 1) => {
      g.globalAlpha = a;
      g.lineWidth = w;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    };
    ring(c * 0.96, 4);
    ring(c * 0.88, 2, 0.8);
    ring(c * 0.62, 3);
    ring(c * 0.2, 2, 0.8);
    // ticks on the outer band
    g.globalAlpha = 0.9;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r0 = c * 0.88;
      const r1 = c * (i % 4 === 0 ? 0.96 : 0.92);
      g.lineWidth = i % 4 === 0 ? 3 : 1.5;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.stroke();
    }
    // a hexagram inside the inner ring
    g.globalAlpha = 1;
    g.lineWidth = 3;
    for (let t = 0; t < 2; t++) {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + (t ? Math.PI / 3 : 0) - Math.PI / 2;
        const x = Math.cos(a) * c * 0.62;
        const y = Math.sin(a) * c * 0.62;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.stroke();
    }
    // little glyphs between the two outer rings: short strokes in a fixed pattern
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      g.save();
      g.rotate(a);
      g.translate(c * 0.75, 0);
      g.beginPath();
      g.moveTo(-6, -8);
      g.lineTo(6, -8);
      g.moveTo(0, -8);
      g.lineTo(0, 8);
      g.moveTo(-5, 3 + (i % 3) * 2);
      g.lineTo(5, 3 - (i % 3) * 2);
      g.stroke();
      g.restore();
    }
    // a soft glow in the middle
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, c * 0.2);
    grad.addColorStop(0, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 1;
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, c * 0.2, 0, Math.PI * 2);
    g.fill();
  });
}

export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * The shared fire: particle pools plus the textures, geometry and materials every fireball in flight uses.
 * Add `group` to the scene once and call `update` every frame.
 */
export class FireParticles {
  readonly group = new THREE.Group();
  readonly glow = glowTexture();
  /** A magic circle and a patch of frost, for the marks on the ground. */
  readonly rune = runeTexture();
  private readonly fire = new Layer(FIRE_MAX, true);
  private readonly smoke = new Layer(SMOKE_MAX, false);
  /** A rough sphere for the body of a fireball and the blast. */
  readonly sphere = new THREE.IcosahedronGeometry(1, 3);

  readonly coreMat = new THREE.SpriteMaterial({ map: this.glow, color: 0xfff1b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  readonly glowMat = new THREE.SpriteMaterial({ map: this.glow, color: 0xff8a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, fog: false });
  readonly haloMat = new THREE.SpriteMaterial({ map: this.glow, color: 0xff3a08, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45, fog: false });
  readonly bodyMat = softBall(0xff7a14, 1, 1.1, 0.14);
  readonly heartMat = softBall(0xffe6a0, 1.6, 0.8, 0.08);
  readonly tailMat = softBall(0xff6a10, 0.8, 1.4, 0.2);
  readonly tailHeartMat = softBall(0xffc860, 0.9, 1.2, 0.15);

  // The arcane bolt (a wand or staff): blue-white at the heart, violet around it.
  readonly arcCoreMat = new THREE.SpriteMaterial({ map: this.glow, color: 0xe8eeff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  readonly arcGlowMat = new THREE.SpriteMaterial({ map: this.glow, color: 0x8a7bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, fog: false });
  readonly arcHaloMat = new THREE.SpriteMaterial({ map: this.glow, color: 0x4a3cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.42, fog: false });
  readonly arcOrbMat = new THREE.SpriteMaterial({ map: this.glow, color: 0xc4ceff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95, fog: false });
  readonly arcBodyMat = softBall(0x6f7dff, 1, 1.1, 0.12);
  readonly arcHeartMat = softBall(0xf2f5ff, 1.6, 0.8, 0.06);
  readonly arcTailMat = softBall(0x6a5cff, 0.75, 1.4, 0.2);
  readonly arcTailHeartMat = softBall(0xbcc8ff, 0.9, 1.2, 0.15);

  constructor() {
    this.group.add(this.smoke.points, this.fire.points);
  }

  /** The trail a fireball sheds between two frames: flames that cool, a few embers, and smoke behind them. */
  trail(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, dirX: number, dirY: number, dirZ: number, flames: number, embers: number, puffs: number): void {
    for (let i = 0; i < flames; i++) {
      const k = Math.random();
      const x = fromX + (toX - fromX) * k;
      const y = fromY + (toY - fromY) * k;
      const z = fromZ + (toZ - fromZ) * k;
      const s = rnd(0.5, 1);
      this.fire.add(
        FLAME,
        x + rnd(-0.07, 0.07),
        y + rnd(-0.07, 0.07),
        z + rnd(-0.07, 0.07),
        -dirX * rnd(0.4, 1.6) + rnd(-0.5, 0.5),
        -dirY * rnd(0.4, 1.6) + rnd(0.2, 1.0),
        -dirZ * rnd(0.4, 1.6) + rnd(-0.5, 0.5),
        rnd(0.28, 0.55),
        0.46 * s,
        0.05,
        2.5,
        0.6,
      );
    }
    for (let i = 0; i < embers; i++) {
      const k = Math.random();
      this.fire.add(
        SPARK,
        fromX + (toX - fromX) * k,
        fromY + (toY - fromY) * k,
        fromZ + (toZ - fromZ) * k,
        rnd(-1.4, 1.4) - dirX * 1.2,
        rnd(-0.4, 1.8),
        rnd(-1.4, 1.4) - dirZ * 1.2,
        rnd(0.45, 1.0),
        0.075,
        0.02,
        0.8,
        -5.5,
      );
    }
    for (let i = 0; i < puffs; i++) {
      const k = Math.random();
      this.smoke.add(SMOKE, fromX + (toX - fromX) * k, fromY + (toY - fromY) * k, fromZ + (toZ - fromZ) * k, rnd(-0.3, 0.3), rnd(0.3, 0.9), rnd(-0.3, 0.3), rnd(0.7, 1.2), 0.25, 0.85, 1.2, 0.2);
    }
  }

  /** The flash and the spray of sparks where the spell leaves the caster. */
  muzzle(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    this.fire.add(FLASH, x + dx * 0.15, y + dy * 0.15, z + dz * 0.15, 0, 0, 0, 0.16, 0.5, 0.9, 0, 0);
    for (let i = 0; i < 16; i++) {
      const sp = rnd(2.5, 7);
      this.fire.add(SPARK, x, y, z, dx * sp + rnd(-1.6, 1.6), dy * sp + rnd(-1.2, 1.6), dz * sp + rnd(-1.6, 1.6), rnd(0.25, 0.6), 0.07, 0.02, 1.6, -4);
    }
    for (let i = 0; i < 9; i++) {
      const sp = rnd(1, 3.5);
      this.fire.add(FLAME, x, y, z, dx * sp + rnd(-0.8, 0.8), dy * sp + rnd(-0.6, 0.8), dz * sp + rnd(-0.8, 0.8), rnd(0.25, 0.45), 0.4, 0.06, 3, 0.8);
    }
  }

  /** A fireball bursting: a white flash, a ball of flame, fast sparks, falling embers and a column of smoke. `r` is the blast radius. */
  explosion(x: number, y: number, z: number, r: number): void {
    const k = Math.max(0.6, r);
    this.fire.add(FLASH, x, y + 0.1, z, 0, 0, 0, 0.22, 1.2 * k, 2.6 * k, 0, 0);
    this.fire.add(FLASH, x, y + 0.1, z, 0, 0, 0, 0.34, 0.9 * k, 1.9 * k, 0, 0);
    // the ball of flame: bursts out in every direction and slows quickly
    for (let i = 0; i < 46; i++) {
      const a = rnd(0, Math.PI * 2);
      const e = Math.acos(rnd(-0.35, 1)); // mostly upward, some sideways, a little down
      const sp = rnd(0.8, 4.2) * (k / 2 + 0.5);
      this.fire.add(
        FLAME,
        x + rnd(-0.2, 0.2),
        y + rnd(0, 0.3),
        z + rnd(-0.2, 0.2),
        Math.cos(a) * Math.sin(e) * sp,
        Math.cos(e) * sp * 0.9 + 0.4,
        Math.sin(a) * Math.sin(e) * sp,
        rnd(0.45, 0.95),
        rnd(0.7, 1.15) * k * 0.55,
        0.12,
        3.2,
        1.4,
      );
    }
    // a ring of flame racing along the ground
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rnd(-0.1, 0.1);
      const sp = rnd(3.2, 5.2) * (k / 2 + 0.4);
      this.fire.add(FLAME, x, y + 0.15, z, Math.cos(a) * sp, rnd(0, 0.5), Math.sin(a) * sp, rnd(0.3, 0.55), 0.55 * k * 0.5, 0.1, 4.2, 0);
    }
    // sparks that fly far and fall
    for (let i = 0; i < 44; i++) {
      const a = rnd(0, Math.PI * 2);
      const up = rnd(-0.1, 1);
      const sp = rnd(3.5, 10) * (k / 2 + 0.4);
      const flat = Math.sqrt(1 - up * up);
      this.fire.add(SPARK, x, y + 0.2, z, Math.cos(a) * flat * sp, up * sp * 0.9 + 1, Math.sin(a) * flat * sp, rnd(0.55, 1.4), rnd(0.06, 0.12), 0.02, 0.5, -11);
    }
    // smoke rises from the middle and lingers
    for (let i = 0; i < 16; i++) {
      this.smoke.add(
        SMOKE,
        x + rnd(-0.5, 0.5) * k * 0.5,
        y + rnd(0.1, 0.6),
        z + rnd(-0.5, 0.5) * k * 0.5,
        rnd(-0.7, 0.7),
        rnd(0.9, 2.4),
        rnd(-0.7, 0.7),
        rnd(1.0, 1.8),
        0.7 * k * 0.5,
        2.0 * k * 0.5,
        1.4,
        0.3,
      );
    }
  }

  /** What the arcane bolt leaves between two frames: sparkles that hang in the air and a faint violet mist. */
  arcTrail(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, glints: number, mist: number): void {
    for (let i = 0; i < glints; i++) {
      const k = Math.random();
      this.fire.add(
        GLINT,
        fromX + (toX - fromX) * k + rnd(-0.08, 0.08),
        fromY + (toY - fromY) * k + rnd(-0.08, 0.08),
        fromZ + (toZ - fromZ) * k + rnd(-0.08, 0.08),
        rnd(-0.7, 0.7),
        rnd(-0.3, 0.9),
        rnd(-0.7, 0.7),
        rnd(0.45, 1.0),
        rnd(0.07, 0.13),
        0.01,
        1.5,
        -0.4,
      );
    }
    for (let i = 0; i < mist; i++) {
      const k = Math.random();
      this.fire.add(
        MIST,
        fromX + (toX - fromX) * k,
        fromY + (toY - fromY) * k,
        fromZ + (toZ - fromZ) * k,
        rnd(-0.25, 0.25),
        rnd(-0.1, 0.4),
        rnd(-0.25, 0.25),
        rnd(0.3, 0.55),
        rnd(0.28, 0.4),
        0.05,
        2.2,
        0,
      );
    }
  }

  /** One mote of the swirl around the bolt. */
  mote(x: number, y: number, z: number): void {
    this.fire.add(MIST, x, y, z, rnd(-0.15, 0.15), rnd(-0.1, 0.25), rnd(-0.15, 0.15), rnd(0.18, 0.32), 0.2, 0.03, 1.5, 0);
  }

  /** The flash and the burst of sparkles where the bolt leaves the wand. */
  arcMuzzle(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    this.fire.add(ARCFLASH, x + dx * 0.15, y + dy * 0.15, z + dz * 0.15, 0, 0, 0, 0.15, 0.4, 0.8, 0, 0);
    for (let i = 0; i < 14; i++) {
      const sp = rnd(1.5, 5.5);
      this.fire.add(GLINT, x, y, z, dx * sp + rnd(-1.4, 1.4), dy * sp + rnd(-1.2, 1.4), dz * sp + rnd(-1.4, 1.4), rnd(0.3, 0.8), rnd(0.08, 0.14), 0.01, 2.2, -0.5);
    }
    for (let i = 0; i < 6; i++) {
      const sp = rnd(0.6, 2);
      this.fire.add(MIST, x, y, z, dx * sp + rnd(-0.5, 0.5), dy * sp + rnd(-0.4, 0.5), dz * sp + rnd(-0.5, 0.5), rnd(0.2, 0.4), 0.3, 0.06, 3, 0);
    }
  }

  /** The bolt bursting: a blue-white flash, sparkles thrown out and a violet mist. `r` is its blast radius. */
  arcBurst(x: number, y: number, z: number, r: number): void {
    const k = Math.max(0.5, r);
    this.fire.add(ARCFLASH, x, y + 0.1, z, 0, 0, 0, 0.2, 0.8 * k, 1.9 * k, 0, 0);
    this.fire.add(ARCFLASH, x, y + 0.1, z, 0, 0, 0, 0.32, 0.6 * k, 1.4 * k, 0, 0);
    for (let i = 0; i < 34; i++) {
      const a = rnd(0, Math.PI * 2);
      const up = rnd(-0.2, 1);
      const flat = Math.sqrt(1 - up * up);
      const sp = rnd(1.5, 6.5) * (k / 2 + 0.55);
      this.fire.add(GLINT, x, y + 0.15, z, Math.cos(a) * flat * sp, up * sp + 0.5, Math.sin(a) * flat * sp, rnd(0.45, 1.1), rnd(0.08, 0.15), 0.01, 2.4, -2.2);
    }
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(0.6, 2.6) * (k / 2 + 0.5);
      this.fire.add(MIST, x, y + 0.2, z, Math.cos(a) * sp, rnd(0, 1.1), Math.sin(a) * sp, rnd(0.4, 0.8), rnd(0.35, 0.6) * k, 0.1, 2.6, 0.2);
    }
  }

  /**
   * A paw of a mount coming down at (x, y, z), the mount going the way (dx, dz): dust kicked up behind and to the sides, and on a hard one
   * (a landing) stones as well. `power` is 0..1, more for a landing.
   */
  pawDust(x: number, y: number, z: number, dx: number, dz: number, power: number): void {
    const n = 2 + Math.round(power * 4);
    for (let i = 0; i < n; i++) {
      const sp = rnd(0.8, 2.6) * (0.6 + power * 0.6);
      const side = rnd(-1.4, 1.4);
      this.smoke.add(DUST, x + rnd(-0.15, 0.15), y + 0.12, z + rnd(-0.15, 0.15), -dx * sp - dz * side, rnd(0.3, 1.1) * (0.6 + power * 0.5), -dz * sp + dx * side, rnd(0.35, 0.7), rnd(0.14, 0.24) * (0.7 + power * 0.4), rnd(0.5, 0.9) * (0.8 + power * 0.4), 2.6, 0.2);
    }
    if (power > 0.9) {
      for (let i = 0; i < 5; i++) this.smoke.add(PEBBLE, x, y + 0.15, z, rnd(-2, 2), rnd(2, 4), rnd(-2, 2), rnd(0.4, 0.7), rnd(0.07, 0.12), 0.05, 0.1, -20);
    }
  }

  update(dt: number): void {
    softTime.value += dt;
    this.fire.update(dt);
    this.smoke.update(dt);
  }

  clear(): void {
    this.fire.clear();
    this.smoke.clear();
  }

  dispose(): void {
    this.fire.dispose();
    this.smoke.dispose();
    this.sphere.dispose();
    this.glow.dispose();
    this.rune.dispose();
    const mats: THREE.Material[] = [this.coreMat, this.glowMat, this.haloMat, this.bodyMat, this.heartMat, this.tailMat, this.tailHeartMat];
    mats.push(this.arcCoreMat, this.arcGlowMat, this.arcHaloMat, this.arcOrbMat, this.arcBodyMat, this.arcHeartMat, this.arcTailMat, this.arcTailHeartMat);
    for (const m of mats) m.dispose();
  }
}

/** One fireball in flight: a hot core in a glow, a comet tail along its path, and the flames and embers it sheds. */
export class FireballView implements SpellView {
  readonly group = new THREE.Group();
  private readonly aim = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly heart: THREE.Mesh;
  private readonly core: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly glowSprite: THREE.Sprite;
  private readonly tail: THREE.Mesh;
  private readonly tailHeart: THREE.Mesh;
  private readonly seed = Math.random() * 100;
  private age = 0;
  private lastX: number;
  private lastY: number;
  private lastZ: number;
  private flameAcc = 0;
  private emberAcc = 0;
  private puffAcc = 0;
  private readonly target = new THREE.Vector3();

  constructor(
    private readonly fire: FireParticles,
    p: Projectile,
  ) {
    this.body = new THREE.Mesh(fire.sphere, fire.bodyMat);
    this.heart = new THREE.Mesh(fire.sphere, fire.heartMat);
    this.tail = new THREE.Mesh(fire.sphere, fire.tailMat);
    this.tailHeart = new THREE.Mesh(fire.sphere, fire.tailHeartMat);
    this.tail.position.z = -0.55;
    this.tailHeart.position.z = -0.4;
    this.aim.add(this.tail, this.tailHeart);
    this.core = new THREE.Sprite(fire.coreMat);
    this.glowSprite = new THREE.Sprite(fire.glowMat);
    this.halo = new THREE.Sprite(fire.haloMat);
    for (const s of [this.core, this.glowSprite, this.halo]) s.renderOrder = 6;
    this.group.add(this.halo, this.glowSprite, this.aim, this.body, this.heart, this.core);
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastZ = p.z;
    this.group.position.set(p.x, p.y, p.z);
    const len = Math.hypot(p.vx, p.vy, p.vz) || 1;
    // The flash of leaving the caster's hand.
    fire.muzzle(p.x, p.y, p.z, p.vx / len, p.vy / len, p.vz / len);
    this.update(p, 0, 0);
  }

  update(p: Projectile, time: number, dt: number): void {
    this.age += dt;
    const flick = 1 + 0.12 * Math.sin(time * 41 + this.seed) + 0.08 * Math.sin(time * 23 + this.seed * 2.3) + 0.05 * Math.sin(time * 67 + this.seed * 5);
    this.group.position.set(p.x, p.y, p.z);
    const len = Math.hypot(p.vx, p.vy, p.vz) || 1;
    const dx = p.vx / len;
    const dy = p.vy / len;
    const dz = p.vz / len;
    this.target.set(p.x + dx, p.y + dy, p.z + dz);
    this.aim.lookAt(this.target);

    // The ball of flame tumbles and breathes; the white-hot heart inside it flickers faster.
    this.body.rotation.set(time * 3.1 + this.seed, time * 4.3, time * 2.2);
    this.body.scale.set(0.27 * flick, 0.25 * flick, 0.29 * flick);
    this.heart.rotation.set(-time * 5.3, time * 3.7 + this.seed, 0);
    this.heart.scale.setScalar(0.16 * (1.05 + 0.15 * Math.sin(time * 53 + this.seed)));
    this.core.scale.setScalar(0.62 * flick);
    this.glowSprite.scale.setScalar(1.45 * flick);
    this.halo.scale.setScalar(2.5 * (1 + 0.08 * Math.sin(time * 17 + this.seed)));

    // The comet tail: it swells with the speed of the flight and wavers.
    const w = 1 + 0.1 * Math.sin(time * 37 + this.seed);
    this.tail.scale.set(0.21 * w, 0.21 * w, 0.75 * w);
    this.tailHeart.scale.set(0.12 * w, 0.12 * w, 0.5 * w);

    // A slot handed to a different fireball (or a lag spike) jumps far: start the trail afresh rather than draw a line across.
    if (Math.hypot(p.x - this.lastX, p.y - this.lastY, p.z - this.lastZ) > 4) {
      this.lastX = p.x;
      this.lastY = p.y;
      this.lastZ = p.z;
    }
    if (dt > 0) {
      this.flameAcc += dt * 150;
      this.emberAcc += dt * 34;
      this.puffAcc += dt * 26;
      const flames = Math.floor(this.flameAcc);
      const embers = Math.floor(this.emberAcc);
      const puffs = Math.floor(this.puffAcc);
      this.flameAcc -= flames;
      this.emberAcc -= embers;
      this.puffAcc -= puffs;
      // Shed from the path travelled since the last frame, so a fast ball leaves a continuous line.
      this.fire.trail(this.lastX, this.lastY, this.lastZ, p.x, p.y, p.z, dx, dy, dz, flames, embers, puffs);
    }
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastZ = p.z;
  }
}

/** What the renderer needs of a spell in flight. */
export interface SpellView {
  readonly group: THREE.Group;
  update(p: Projectile, time: number, dt: number): void;
  /** Frees what the view made itself (not what it shares), when the spell is over. */
  dispose?(): void;
}

/**
 * The bolt of a wand or staff: a white-blue heart in a violet glow, two motes orbiting it in a spiral, a thin
 * comet tail, and sparkles that hang in the air behind it.
 */
export class ArcaneBoltView implements SpellView {
  readonly group = new THREE.Group();
  private readonly aim = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly heart: THREE.Mesh;
  private readonly tail: THREE.Mesh;
  private readonly tailHeart: THREE.Mesh;
  private readonly core: THREE.Sprite;
  private readonly glow: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly orbs: THREE.Sprite[] = [];
  private readonly seed = Math.random() * 100;
  private lastX: number;
  private lastY: number;
  private lastZ: number;
  private glintAcc = 0;
  private mistAcc = 0;
  private moteAcc = 0;
  private readonly target = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(
    private readonly fire: FireParticles,
    p: Projectile,
  ) {
    this.body = new THREE.Mesh(fire.sphere, fire.arcBodyMat);
    this.heart = new THREE.Mesh(fire.sphere, fire.arcHeartMat);
    this.tail = new THREE.Mesh(fire.sphere, fire.arcTailMat);
    this.tailHeart = new THREE.Mesh(fire.sphere, fire.arcTailHeartMat);
    this.tail.position.z = -0.5;
    this.tailHeart.position.z = -0.36;
    this.aim.add(this.tail, this.tailHeart);
    this.core = new THREE.Sprite(fire.arcCoreMat);
    this.glow = new THREE.Sprite(fire.arcGlowMat);
    this.halo = new THREE.Sprite(fire.arcHaloMat);
    for (const s of [this.core, this.glow, this.halo]) s.renderOrder = 6;
    for (let i = 0; i < 2; i++) {
      const o = new THREE.Sprite(fire.arcOrbMat);
      o.renderOrder = 6;
      this.orbs.push(o);
    }
    this.group.add(this.halo, this.glow, this.aim, this.body, this.heart, this.core, ...this.orbs);
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastZ = p.z;
    const len = Math.hypot(p.vx, p.vy, p.vz) || 1;
    fire.arcMuzzle(p.x, p.y, p.z, p.vx / len, p.vy / len, p.vz / len);
    this.update(p, 0, 0);
  }

  update(p: Projectile, time: number, dt: number): void {
    const flick = 1 + 0.1 * Math.sin(time * 37 + this.seed) + 0.06 * Math.sin(time * 61 + this.seed * 3);
    this.group.position.set(p.x, p.y, p.z);
    const len = Math.hypot(p.vx, p.vy, p.vz) || 1;
    this.dir.set(p.vx / len, p.vy / len, p.vz / len);
    this.target.set(p.x + this.dir.x, p.y + this.dir.y, p.z + this.dir.z);
    this.aim.lookAt(this.target);

    this.body.rotation.set(time * 2.3 + this.seed, time * 3.1, 0);
    this.body.scale.setScalar(0.19 * flick);
    this.heart.scale.setScalar(0.11 * (1.05 + 0.12 * Math.sin(time * 47 + this.seed)));
    this.core.scale.setScalar(0.5 * flick);
    this.glow.scale.setScalar(1.1 * flick);
    this.halo.scale.setScalar(1.9 * (1 + 0.08 * Math.sin(time * 15 + this.seed)));
    const w = 1 + 0.08 * Math.sin(time * 29 + this.seed);
    this.tail.scale.set(0.13 * w, 0.13 * w, 0.6 * w);
    this.tailHeart.scale.set(0.07 * w, 0.07 * w, 0.4 * w);

    // Two motes spiral round the line of flight, opposite each other.
    const up = Math.abs(this.dir.y) > 0.95 ? this.u.set(1, 0, 0) : this.u.set(0, 1, 0);
    this.v.crossVectors(this.dir, up).normalize();
    this.u.crossVectors(this.v, this.dir).normalize();
    const spin = time * 15 + this.seed;
    const radius = 0.26;
    for (let i = 0; i < 2; i++) {
      const a = spin + i * Math.PI;
      const o = this.orbs[i];
      const ox = (this.u.x * Math.cos(a) + this.v.x * Math.sin(a)) * radius;
      const oy = (this.u.y * Math.cos(a) + this.v.y * Math.sin(a)) * radius;
      const oz = (this.u.z * Math.cos(a) + this.v.z * Math.sin(a)) * radius;
      o.position.set(ox, oy, oz);
      o.scale.setScalar(0.2 * (1 + 0.2 * Math.sin(time * 33 + i * 2)));
    }

    if (Math.hypot(p.x - this.lastX, p.y - this.lastY, p.z - this.lastZ) > 4) {
      this.lastX = p.x;
      this.lastY = p.y;
      this.lastZ = p.z;
    }
    if (dt > 0) {
      this.glintAcc += dt * 55;
      this.mistAcc += dt * 70;
      this.moteAcc += dt * 90;
      const glints = Math.floor(this.glintAcc);
      const mist = Math.floor(this.mistAcc);
      const motes = Math.floor(this.moteAcc);
      this.glintAcc -= glints;
      this.mistAcc -= mist;
      this.moteAcc -= motes;
      this.fire.arcTrail(this.lastX, this.lastY, this.lastZ, p.x, p.y, p.z, glints, mist);
      // A thread of mist where the motes are, so the spiral stays drawn behind them.
      for (let i = 0; i < motes; i++) {
        const k = Math.random();
        const a = spin - (1 - k) * 0.9 + (i % 2) * Math.PI;
        this.fire.mote(
          this.lastX + (p.x - this.lastX) * k + (this.u.x * Math.cos(a) + this.v.x * Math.sin(a)) * radius,
          this.lastY + (p.y - this.lastY) * k + (this.u.y * Math.cos(a) + this.v.y * Math.sin(a)) * radius,
          this.lastZ + (p.z - this.lastZ) * k + (this.u.z * Math.cos(a) + this.v.z * Math.sin(a)) * radius,
        );
      }
    }
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastZ = p.z;
  }
}
