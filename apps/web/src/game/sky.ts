import * as THREE from 'three';
import { daylightAt, smoothstep, sunHeight as sunHeightAt } from '@solrift/shared';
import type { ChunkLighting } from './chunkMaterial';

const DAY_SKY = new THREE.Color(0x8fc4ff);
const DUSK_SKY = new THREE.Color(0xff985a);
const NIGHT_SKY = new THREE.Color(0x070b1c);
const GREY_SKY = new THREE.Color(0x7d8794);
const FLASH_SKY = new THREE.Color(0xe8eeff);

const DAY_ZENITH = new THREE.Color(0x3a76d6);
const DUSK_ZENITH = new THREE.Color(0x5a3f9a);
const NIGHT_ZENITH = new THREE.Color(0x01030b);
const GREY_ZENITH = new THREE.Color(0x58616d);

const AMBIENT_DAY = new THREE.Color(0.54, 0.6, 0.75);
// Dusk shadows lean violet (the sky overhead is) while the low sun is gold: warm lights, cool shadows.
const AMBIENT_DUSK = new THREE.Color(0.7, 0.52, 0.84);
const AMBIENT_NIGHT = new THREE.Color(0.62, 0.92, 1.9);
const AMBIENT_GREY = new THREE.Color(0.8, 0.82, 0.86);
const SUN_NOON = new THREE.Color(1.0, 0.95, 0.84);
const SUN_LOW = new THREE.Color(1.0, 0.56, 0.18);
/** Moonlight on the ground: silver-blue, strong enough for the terrain shader to cast readable shadows at night. */
const MOON_LIGHT = new THREE.Color(1.3, 2.0, 3.9);

const CLOUD_Y = 150;
const CLOUD_CELL = 12;
const CLOUD_THICK = 5;
const CLOUD_R = 20;

/** Pixel-art disc for the sun: a bright core and a warmer rim, drawn at 16 x 16 and scaled up unsmoothed. */
function sunTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 7.5) continue;
      const rim = d > 6.5 ? [255, 222, 130] : d > 5.5 ? [255, 236, 168] : d > 3.5 ? [255, 246, 204] : [255, 253, 240];
      g.fillStyle = `rgb(${rim[0]},${rim[1]},${rim[2]})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return pixelTexture(c);
}

/** A square moon with a few craters. */
function moonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const craters = [[4, 4, 2], [10, 5, 1.5], [8, 10, 2.2], [3, 11, 1.2], [12, 11, 1.4]];
  for (let y = 1; y < 15; y++) {
    for (let x = 1; x < 15; x++) {
      let tone = 232;
      for (const [cx, cy, r] of craters) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < r) tone = 188 + (d > r - 0.8 ? 14 : 0);
      }
      if (x === 1 || y === 1 || x === 14 || y === 14) tone -= 22;
      g.fillStyle = `rgb(${tone},${tone + 5},${tone + 16})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return pixelTexture(c);
}

/** The same square moon, drawn only as a bright rim, so a black-moon night is not a black block in the sky. */
function eclipseTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 1; y < 15; y++) {
    for (let x = 1; x < 15; x++) {
      const edge = Math.min(x - 1, y - 1, 14 - x, 14 - y);
      if (edge > 1) continue;
      const rim = edge === 0 ? [255, 246, 220] : [176, 198, 228];
      g.fillStyle = `rgb(${rim[0]},${rim[1]},${rim[2]})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return pixelTexture(c);
}

function pixelTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round glow used behind the sun and moon. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const domeVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const domeFragment = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uGlow;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  // The colour holds near the horizon and then deepens quickly towards the top of the sky.
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
  float s = max(dot(d, uSunDir), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.55, h);
  col += uGlow * (pow(s, 5.0) * 0.45 * (0.35 + 0.65 * low) + pow(s, 48.0) * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const cloudVertex = /* glsl */ `
attribute float aShade;
varying float vShade;
varying float vDist;
void main() {
  vShade = aShade;
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vDist = length(wp.xz - cameraPosition.xz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const cloudFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFadeNear;
uniform float uFadeFar;
varying float vShade;
varying float vDist;
void main() {
  float a = uOpacity * (1.0 - smoothstep(uFadeNear, uFadeFar, vDist));
  gl_FragColor = vec4(uColor * vShade, a);
  #include <colorspace_fragment>
}
`;

function hash2(x: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Is there cloud in this cell? `thr` is the noise level above which the sky is covered. */
function cloudAt(ci: number, cj: number, thr: number): boolean {
  const n = 0.56 * valueNoise(ci * 0.2, cj * 0.2) + 0.3 * valueNoise(ci * 0.47 + 19, cj * 0.47 + 7) + 0.14 * valueNoise(ci * 1.1 + 3, cj * 1.1 + 31);
  return n > thr;
}

/** Sun, moon, stars, clouds, sky colour and global light level driven by time of day. */
export class Sky {
  /** 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. Set by the game each frame. */
  time = 0.2;
  brightness = 1;
  /** Show or hide the clouds (for pictures taken among them). */
  setCloudsVisible(v: boolean): void {
    this.cloudsWanted = v;
    this.clouds.visible = v && this.skyShown;
  }
  /** Weather inputs, set by the game each frame: 0..1 rain amount, sky dimming, lightning flash. */
  rain = 0;
  dim = 0;
  flash = 0;
  /** Isle black-moon night: a bright rim in the sky, and no moonlight on the land. Every other world leaves this off. */
  blackMoon = false;
  /** The colour of the sky at the horizon, which fog and the background share. */
  readonly color = new THREE.Color(DAY_SKY);
  readonly zenith = new THREE.Color(DAY_ZENITH);
  /** Unit vector from the player towards the sun, and the sine of its height above the horizon. */
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  sunHeight = 1;
  /** Towards the moon, and towards whichever of sun and moon is shining, with that light's sine above the horizon. */
  readonly moonDir = new THREE.Vector3(0, -1, 0);
  readonly lightDir = new THREE.Vector3(0, 1, 0);
  lightHeight = 1;
  /** What the terrain shader needs to light itself like the sky says. */
  readonly lighting: ChunkLighting = {
    ambient: new THREE.Color(AMBIENT_DAY),
    sun: new THREE.Color(),
    sunDir: this.sunDir,
    lightDir: this.lightDir,
    glow: new THREE.Color(),
    skyReflect: new THREE.Color(DAY_SKY),
    glint: 0,
    wind: 1,
  };
  readonly group = new THREE.Group();

  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private sun: THREE.Mesh;
  /** The sun's disc (the post-processing's sun rays come from it). */
  get sunMesh(): THREE.Mesh {
    return this.sun;
  }
  /** The moon's disc. At night the same ray pass uses this instead of the sun. */
  get moonMesh(): THREE.Mesh {
    return this.moon;
  }
  /** 1 at golden hour (the sun low, up or down), 0 otherwise; and 0..1 for how much daylight there is. Set by `update`. */
  dusk = 0;
  day = 1;
  private sunGlow: THREE.Mesh;
  private moon: THREE.Mesh;
  private moonGlow: THREE.Mesh;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.ShaderMaterial;
  private cloudKey = '';
  private readonly textures: THREE.Texture[] = [];
  private moonMap: THREE.Texture | null = null;
  private eclipseMap: THREE.Texture | null = null;
  private moonWasBlack = false;
  private readonly tmp = new THREE.Color();
  private horizonOverride = new THREE.Color();
  private hasOverride = false;
  private darkness = 0;
  /** The eyes are under water. The horizon is the water; overhead, the real sky still shows. */
  private submerged = false;
  /** 0 hides the sun and the stars (lava). Above 0, that much of the real sky remains overhead. */
  private skyOpen = 0;
  private cloudsWanted = true;
  private get skyShown(): boolean {
    return !this.submerged || this.skyOpen > 0.02;
  }

  constructor() {
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: domeVertex,
      fragmentShader: domeFragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uHorizon: { value: new THREE.Color(DAY_SKY) },
        uZenith: { value: new THREE.Color(DAY_ZENITH) },
        uGlow: { value: new THREE.Color(0, 0, 0) },
        uSunDir: { value: this.sunDir },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), this.domeMat);
    this.dome.renderOrder = -20;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const sunTex = sunTexture();
    const moonTex = moonTexture();
    const eclipseTex = eclipseTexture();
    const glowTex = glowTexture();
    this.moonMap = moonTex;
    this.eclipseMap = eclipseTex;
    this.textures.push(sunTex, moonTex, eclipseTex, glowTex);
    const quad = (size: number, tex: THREE.Texture, order: number, additive = false) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          map: tex,
          fog: false,
          depthWrite: false,
          transparent: true,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      );
      m.renderOrder = order;
      return m;
    };
    this.sunGlow = quad(560, glowTex, -12, true);
    // A tight edge only. The light around the moon is the ray pass, and a big copy of this
    // texture draws as rings.
    this.moonGlow = quad(72, glowTex, -12, true);
    this.sun = quad(84, sunTex, -10);
    this.moon = quad(60, moonTex, -10);
    this.group.add(this.sunGlow, this.moonGlow, this.sun, this.moon);

    const N = 900;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(t) * 400, u * 400, r * Math.sin(t) * 400], i * 3);
      const b = 0.35 + Math.pow(Math.random(), 3) * 0.65;
      const warm = Math.random();
      col.set([b * (0.85 + 0.15 * warm), b * 0.92, b * (1 - 0.18 * warm)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.renderOrder = -11;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uColor: { value: new THREE.Color(1, 1, 1) },
        uOpacity: { value: 0.88 },
        uFadeNear: { value: CLOUD_R * CLOUD_CELL * 0.55 },
        uFadeFar: { value: CLOUD_R * CLOUD_CELL * 0.97 },
      },
    });
    this.clouds = new THREE.Mesh(new THREE.BufferGeometry(), this.cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -5;
    this.group.add(this.clouds);
  }

  /** The colour at the top of the dome as drawn (fog uses it to fade into the sky when looking up). */
  get domeZenith(): THREE.Color {
    return this.domeMat.uniforms.uZenith.value as THREE.Color;
  }

  /**
   * Fit the sky to where the camera is looking from: `fog` is the horizon colour to show (the fog colour, which
   * is darker underground), `dark` how deep underground (0..1) the player is.
   * Under water the horizon is the water, and `skyOpen` (0..1) is how much of the real sky remains overhead.
   * Lava passes 0, so the dome closes over. Hiding the dome entirely leaves a black clear.
   */
  setView(fog: THREE.Color, dark: number, underwater: boolean, skyOpen = 0): void {
    this.horizonOverride.copy(fog);
    this.hasOverride = true;
    this.darkness = dark;
    this.submerged = underwater;
    this.skyOpen = underwater ? skyOpen : 1;
    this.group.visible = true;
    const show = this.skyShown;
    this.sun.visible = show;
    this.sunGlow.visible = show;
    this.moon.visible = show;
    this.moonGlow.visible = show;
    this.stars.visible = show;
    this.clouds.visible = show && this.cloudsWanted;
    this.applyDome();
    this.veilThroughWater();
  }

  /** Sun, moon and stars dim with the water overhead, a little per block, instead of vanishing at a line. */
  private veilThroughWater(): void {
    if (!this.submerged) return;
    const t = Math.min(1, Math.max(0, this.skyOpen));
    (this.sun.material as THREE.MeshBasicMaterial).opacity *= t;
    (this.sunGlow.material as THREE.MeshBasicMaterial).opacity *= t;
    (this.moon.material as THREE.MeshBasicMaterial).opacity *= t;
    (this.moonGlow.material as THREE.MeshBasicMaterial).opacity *= t;
    this.starMat.opacity *= t;
    const clouds = this.cloudMat.uniforms.uOpacity;
    clouds.value = (clouds.value as number) * (0.25 + 0.75 * t);
  }

  /** Underground the horizon follows the (darkened) fog and the upper sky fades to black. */
  private applyDome(): void {
    const u = this.domeMat.uniforms;
    u.uHorizon.value.copy(this.hasOverride ? this.horizonOverride : this.color);
    if (this.submerged && this.skyOpen <= 0.02) {
      u.uZenith.value.copy(this.horizonOverride);
      (u.uGlow.value as THREE.Color).setScalar(0);
    } else if (this.submerged) {
      // Overhead is the real sky, pulled a little toward the water. Looking up still finds the sun, the moon and the stars.
      u.uZenith.value.copy(this.zenith).lerp(this.horizonOverride, 1 - this.skyOpen);
      u.uGlow.value.copy(this.lighting.glow).multiplyScalar(this.skyOpen);
    } else {
      u.uZenith.value.copy(this.zenith).multiplyScalar(1 - 0.94 * this.darkness);
      u.uGlow.value.copy(this.lighting.glow).multiplyScalar(1 - this.darkness);
    }
  }

  update(camera: THREE.Camera): void {
    const a = this.time * Math.PI * 2;
    const sunHeight = sunHeightAt(this.time);
    this.sunHeight = sunHeight;
    this.sunDir.set(Math.cos(a), sunHeight, 40 / 300).normalize();
    // The moon sits opposite the sun; whichever is above the horizon is the light that casts shadows.
    this.moonDir.set(-Math.cos(a), -sunHeight, -40 / 300).normalize();
    const moonUp = sunHeight < 0 ? this.moonDir.y : 0;
    this.lightDir.copy(sunHeight >= -0.02 ? this.sunDir : this.moonDir);
    this.lightHeight = this.lightDir.y;

    this.group.position.copy(camera.position);
    const dist = 300;
    this.sun.position.set(Math.cos(a) * dist, sunHeight * dist, 40);
    this.moon.position.set(-Math.cos(a) * dist, -sunHeight * dist, -40);
    this.sunGlow.position.copy(this.sun.position).multiplyScalar(0.99);
    this.moonGlow.position.copy(this.moon.position).multiplyScalar(0.99);
    for (const m of [this.sun, this.moon, this.sunGlow, this.moonGlow]) m.lookAt(camera.position);
    this.stars.rotation.z = a;

    this.brightness = daylightAt(this.time, this.dim);
    const dayAmt = smoothstep(-0.05, 0.35, sunHeight);
    // Golden hour lasts until the sun is about 25 degrees up, but twilight below the horizon is short.
    const duskAmt = smoothstep(0, 1, Math.max(0, 1 - Math.abs(sunHeight) * (sunHeight >= 0 ? 2.2 : 5.5)));
    this.dusk = duskAmt;
    this.day = dayAmt;
    this.color.copy(NIGHT_SKY).lerp(DAY_SKY, dayAmt).lerp(DUSK_SKY, duskAmt * 0.85);
    this.zenith.copy(NIGHT_ZENITH).lerp(DAY_ZENITH, dayAmt).lerp(DUSK_ZENITH, duskAmt * 0.85);
    // Overcast: grey out the sky, hide the sun, moon and most stars, and flash on lightning.
    const grey = GREY_SKY.clone().multiplyScalar(Math.max(0.04, this.brightness));
    this.color.lerp(grey, Math.min(1, this.rain * 0.85));
    this.zenith.lerp(this.tmp.copy(GREY_ZENITH).multiplyScalar(Math.max(0.04, this.brightness)), Math.min(1, this.rain * 0.9));
    if (this.flash > 0) {
      this.brightness = daylightAt(this.time, this.dim, this.flash);
      this.color.lerp(FLASH_SKY, this.flash * 0.6);
      this.zenith.lerp(FLASH_SKY, this.flash * 0.45);
    }
    const clear = 1 - this.rain;

    // ---- light for the terrain ----
    const L = this.lighting;
    const sunUp = smoothstep(0, 0.18, sunHeight) * Math.max(0, 1 - this.rain * 0.92);
    const warm = 1 - smoothstep(0.02, 0.5, sunHeight);
    // Golden hour is a little stronger than noon; at night the same slot carries the moon's silver-blue light.
    L.sun.copy(SUN_NOON).lerp(SUN_LOW, warm).multiplyScalar((0.5 + 0.45 * warm) * sunUp);
    const moonLit = this.blackMoon ? 0 : smoothstep(0.05, 0.3, moonUp) * Math.max(0, 1 - this.rain * 0.9);
    if (moonLit > 0) L.sun.copy(MOON_LIGHT).multiplyScalar(moonLit);
    L.ambient.copy(AMBIENT_DAY).lerp(AMBIENT_DUSK, duskAmt * 0.9).lerp(AMBIENT_NIGHT, 1 - dayAmt).lerp(AMBIENT_GREY, this.rain * 0.8);
    if (this.flash > 0) L.ambient.addScalar(this.flash * 0.35);
    L.glow.copy(SUN_NOON).lerp(SUN_LOW, warm).multiplyScalar((0.22 + 0.78 * duskAmt) * smoothstep(-0.1, 0.1, sunHeight) * clear);
    L.skyReflect.copy(this.color).lerp(this.zenith, 0.45);
    L.glint = Math.max(sunUp, moonLit * 0.6);
    L.wind = 0.8 + this.rain * 1.4;

    this.applyDome();

    // ---- sun and moon ----
    const horizonFade = smoothstep(-0.12, 0.03, sunHeight);
    (this.sun.material as THREE.MeshBasicMaterial).opacity = clear * horizonFade;
    const moonMat = this.moon.material as THREE.MeshBasicMaterial;
    moonMat.opacity = clear * smoothstep(-0.03, 0.12, -sunHeight);
    moonMat.color.setRGB(1, 1, 1);
    if (this.blackMoon !== this.moonWasBlack && this.moonMap && this.eclipseMap) {
      this.moonWasBlack = this.blackMoon;
      moonMat.map = this.blackMoon ? this.eclipseMap : this.moonMap;
      moonMat.needsUpdate = true;
    }
    const sg = this.sunGlow.material as THREE.MeshBasicMaterial;
    sg.color.copy(SUN_NOON).lerp(SUN_LOW, warm);
    sg.opacity = clear * horizonFade * (0.2 + 0.5 * duskAmt);
    const mg = this.moonGlow.material as THREE.MeshBasicMaterial;
    const moonFade = clear * smoothstep(-0.03, 0.12, -sunHeight);
    mg.color.setRGB(this.blackMoon ? 1 : 0.5, this.blackMoon ? 0.92 : 0.6, this.blackMoon ? 0.72 : 0.85);
    mg.opacity = moonFade * (this.blackMoon ? 0.06 : 0.03);
    this.starMat.opacity = (1 - smoothstep(-0.2, 0.05, sunHeight)) * clear;

    this.updateClouds(camera, dayAmt, duskAmt);
  }

  private updateClouds(camera: THREE.Camera, dayAmt: number, duskAmt: number): void {
    const now = performance.now() / 1000;
    const scroll = now * 1.4;
    const coverage = Math.round(this.rain * 5) / 5;
    const thr = 0.585 - 0.17 * coverage;
    const ci0 = Math.floor((camera.position.x - scroll) / CLOUD_CELL);
    const cj0 = Math.floor(camera.position.z / CLOUD_CELL);
    const key = `${ci0},${cj0},${thr.toFixed(3)}`;
    if (key !== this.cloudKey) {
      this.cloudKey = key;
      this.buildClouds(ci0, cj0, thr);
    }
    this.clouds.position.set((ci0 - CLOUD_R) * CLOUD_CELL + scroll - camera.position.x, CLOUD_Y - camera.position.y, (cj0 - CLOUD_R) * CLOUD_CELL - camera.position.z);

    // White in daylight, peach at dusk, deep blue-grey at night, slate when it rains.
    const c = (this.cloudMat.uniforms.uColor.value as THREE.Color).setRGB(1, 1, 1);
    c.lerp(this.tmp.setRGB(1, 0.62, 0.45), duskAmt * 0.65);
    c.lerp(this.tmp.setRGB(0.25, 0.32, 0.55), 1 - dayAmt);
    c.multiplyScalar(0.22 + 0.78 * Math.min(1, this.brightness * 1.25));
    c.lerp(this.tmp.setRGB(0.5, 0.52, 0.57).multiplyScalar(0.3 + 0.7 * this.brightness), this.rain * 0.75);
    if (this.flash > 0) c.lerp(this.tmp.setRGB(1, 1, 1), this.flash * 0.7);
    this.cloudMat.uniforms.uOpacity.value = 0.9 * (1 - this.darkness);
  }

  private buildClouds(ci0: number, cj0: number, thr: number): void {
    const n = CLOUD_R * 2 + 1;
    const filled = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) filled[j * n + i] = cloudAt(ci0 - CLOUD_R + i, cj0 - CLOUD_R + j, thr) ? 1 : 0;
    const has = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < n && j < n && filled[j * n + i] === 1;

    const pos: number[] = [];
    const shade: number[] = [];
    const idx: number[] = [];
    const quad = (s: number, p: number[][]): void => {
      const v = pos.length / 3;
      for (const q of p) {
        pos.push(q[0], q[1], q[2]);
        shade.push(s);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    };
    const S = CLOUD_CELL;
    const H = CLOUD_THICK;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!has(i, j)) continue;
        const x0 = i * S;
        const x1 = x0 + S;
        const z0 = j * S;
        const z1 = z0 + S;
        quad(1, [[x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0]]);
        quad(0.74, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]]);
        if (!has(i + 1, j)) quad(0.9, [[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]]);
        if (!has(i - 1, j)) quad(0.9, [[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]]);
        if (!has(i, j + 1)) quad(0.82, [[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]]);
        if (!has(i, j - 1)) quad(0.82, [[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aShade', new THREE.BufferAttribute(new Float32Array(shade), 1));
    g.setIndex(idx);
    this.clouds.geometry.dispose();
    this.clouds.geometry = g;
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.domeMat.dispose();
    this.clouds.geometry.dispose();
    this.cloudMat.dispose();
    for (const m of [this.sun, this.moon, this.sunGlow, this.moonGlow]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.stars.geometry.dispose();
    this.starMat.dispose();
    for (const t of this.textures) t.dispose();
  }
}
