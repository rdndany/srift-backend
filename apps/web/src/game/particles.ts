import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, TILE_PX } from '@solrift/shared';

const MAX = 512;
/** Chips of a broken or placed block. A separate pool, so smoke and sparks keep their own. */
const CHIPS = 384;
/** Rising bubbles and the blue specks that hang in the water. Their own pool, so a swim does not eat the break dust. */
const BUBBLES = 96;
/** A chip shows a 4×4 piece of the block's 16×16 tile, the way Minecraft's break dust does. */
const CROP = 4;
const WHITE = new THREE.Color(1, 1, 1);

/** Block-break debris: small tumbling cubes coloured from the block's texture. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  /** Flat chips of a block's texture. They face the camera. */
  readonly debris: THREE.InstancedMesh;
  /** Minecraft's underwater bubbles and the blue specks that hang in the water. They face the camera. */
  readonly bubbles: THREE.InstancedMesh;
  private px = new Float32Array(MAX);
  private py = new Float32Array(MAX);
  private pz = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private vz = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  /** How hard each one is pulled down (debris falls fast, dust drifts). */
  private grav = new Float32Array(MAX);
  private next = 0;
  private material: THREE.MeshBasicMaterial;
  private tileCache = new Map<number, Uint8ClampedArray>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private color = new THREE.Color();
  private cx = new Float32Array(CHIPS);
  private cy = new Float32Array(CHIPS);
  private cz = new Float32Array(CHIPS);
  private cvx = new Float32Array(CHIPS);
  private cvy = new Float32Array(CHIPS);
  private cvz = new Float32Array(CHIPS);
  private clife = new Float32Array(CHIPS);
  private cmax = new Float32Array(CHIPS);
  private csize = new Float32Array(CHIPS);
  private cgrav = new Float32Array(CHIPS);
  private cnext = 0;
  private cany = false;
  private uvRect: THREE.InstancedBufferAttribute;
  private fade: THREE.InstancedBufferAttribute;
  private debrisMat: THREE.ShaderMaterial;
  private bpx = new Float32Array(BUBBLES);
  private bpy = new Float32Array(BUBBLES);
  private bpz = new Float32Array(BUBBLES);
  /** Blocks per tick, the unit Minecraft's particles use. */
  private bvx = new Float32Array(BUBBLES);
  private bvy = new Float32Array(BUBBLES);
  private bvz = new Float32Array(BUBBLES);
  private blife = new Float32Array(BUBBLES);
  private bmax = new Float32Array(BUBBLES);
  private bsize = new Float32Array(BUBBLES);
  /** 1: a bubble that rises and pops out of the water. 0: a speck that hangs. */
  private brise = new Float32Array(BUBBLES);
  private bnext = 0;
  private bAcc = 0;
  private sAcc = 0;
  private vAcc = 0;
  private bfade: THREE.InstancedBufferAttribute;
  private bkind: THREE.InstancedBufferAttribute;
  private bubbleMat: THREE.ShaderMaterial;
  private waterAt: ((x: number, y: number, z: number) => boolean) | null = null;

  constructor(private readonly atlas: HTMLCanvasElement, texture: THREE.Texture) {
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.color.setRGB(1, 1, 1));
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    this.uvRect = new THREE.InstancedBufferAttribute(new Float32Array(CHIPS * 4), 4);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(CHIPS), 1);
    geo.setAttribute('uvRect', this.uvRect);
    geo.setAttribute('fade', this.fade);
    this.debrisMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, brightness: { value: 1 } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      vertexShader: /* glsl */ `
        attribute vec4 uvRect;
        attribute float fade;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uvRect.xy + uv * uvRect.zw;
          vFade = fade;
          vec3 origin = instanceMatrix[3].xyz;
          float s = length(instanceMatrix[0].xyz);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 world = origin + (position.x * right + position.y * up) * s;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float brightness;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec4 tex = texture2D(map, vUv);
          if (tex.a < 0.04) discard;
          gl_FragColor = vec4(tex.rgb * brightness * 0.82, tex.a * vFade);
          #include <colorspace_fragment>
        }
      `,
    });
    this.debris = new THREE.InstancedMesh(geo, this.debrisMat, CHIPS);
    this.debris.frustumCulled = false;
    this.debris.count = CHIPS;
    for (let i = 0; i < CHIPS; i++) this.debris.setMatrixAt(i, zero);

    const bgeo = new THREE.PlaneGeometry(1, 1);
    this.bfade = new THREE.InstancedBufferAttribute(new Float32Array(BUBBLES), 1);
    this.bkind = new THREE.InstancedBufferAttribute(new Float32Array(BUBBLES), 1);
    bgeo.setAttribute('fade', this.bfade);
    bgeo.setAttribute('kind', this.bkind);
    this.bubbleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      vertexShader: /* glsl */ `
        attribute float fade;
        attribute float kind;
        varying float vFade;
        varying float vKind;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vFade = fade;
          vKind = kind;
          vec3 origin = instanceMatrix[3].xyz;
          float s = length(instanceMatrix[0].xyz);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 world = origin + (position.x * right + position.y * up) * s;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vFade;
        varying float vKind;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          if (r > 1.0) discard;
          // A speck is a soft blue dot. A bubble is a bright ring with a glint, the way Minecraft draws one.
          float dotA = smoothstep(1.0, 0.2, r);
          float rim = smoothstep(1.0, 0.62, r) * smoothstep(0.38, 0.68, r);
          float glint = smoothstep(0.32, 0.0, length(p - vec2(-0.14, 0.16)));
          float speck = step(0.5, vKind);
          float a = mix(clamp(rim * 0.95 + glint * 0.8, 0.0, 1.0), dotA * 0.55, speck) * vFade;
          if (a < 0.02) discard;
          vec3 col = mix(vec3(0.93, 0.97, 1.0), vec3(0.4, 0.4, 0.7), speck);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
    });
    this.bubbles = new THREE.InstancedMesh(bgeo, this.bubbleMat, BUBBLES);
    this.bubbles.frustumCulled = false;
    this.bubbles.count = BUBBLES;
    this.bubbles.renderOrder = 3;
    for (let i = 0; i < BUBBLES; i++) this.bubbles.setMatrixAt(i, zero);
  }

  private pixels(tile: number): Uint8ClampedArray {
    let px = this.tileCache.get(tile);
    if (!px) {
      const ctx = this.atlas.getContext('2d')!;
      px = ctx.getImageData((tile % ATLAS_COLS) * TILE_PX, Math.floor(tile / ATLAS_COLS) * TILE_PX, TILE_PX, TILE_PX).data;
      this.tileCache.set(tile, px);
    }
    return px;
  }

  /** One tile, the break puff. Footsteps and sparks stay coloured cubes. */
  burst(x: number, y: number, z: number, tile: number, count = 16): void {
    this.chips(x, y, z, [tile], count, false);
  }

  /**
   * Chips cut from the block's own tiles. A break fills the block, flies outward and falls.
   * A placement (`soft`) is a few chips that only drift off the faces, and they are gone quickly.
   */
  chips(x: number, y: number, z: number, tiles: number[], count: number, soft: boolean): void {
    const use = tiles.length > 0 ? tiles : [0];
    for (let n = 0; n < count; n++) {
      const i = this.cnext++ % CHIPS;
      this.stamp(i, use[Math.floor(Math.random() * use.length)]);
      if (soft) {
        const face = Math.floor(Math.random() * 6);
        const u = Math.random();
        const v = Math.random();
        let ox = u;
        let oy = v;
        let oz = Math.random();
        let nx = 0;
        let ny = 0;
        let nz = 0;
        if (face < 2) {
          ox = face === 0 ? 1 : 0;
          oy = u;
          oz = v;
          nx = face === 0 ? 1 : -1;
        } else if (face < 4) {
          oy = face === 2 ? 1 : 0;
          ox = u;
          oz = v;
          ny = face === 2 ? 1 : -1;
        } else {
          oz = face === 4 ? 1 : 0;
          ox = u;
          oy = v;
          nz = face === 4 ? 1 : -1;
        }
        const sp = 0.45 + Math.random() * 0.7;
        this.cx[i] = x + ox;
        this.cy[i] = y + oy;
        this.cz[i] = z + oz;
        this.cvx[i] = nx * sp + (Math.random() - 0.5) * 0.25;
        this.cvy[i] = ny * sp + 0.2 + Math.random() * 0.35;
        this.cvz[i] = nz * sp + (Math.random() - 0.5) * 0.25;
        this.cmax[i] = this.clife[i] = 0.12 + Math.random() * 0.14;
        this.csize[i] = 0.055 + Math.random() * 0.03;
        this.cgrav[i] = 5;
      } else {
        const u = Math.random();
        const v = Math.random();
        const w = Math.random();
        this.cx[i] = x + 0.12 + u * 0.76;
        this.cy[i] = y + 0.12 + v * 0.76;
        this.cz[i] = z + 0.12 + w * 0.76;
        this.cvx[i] = (u - 0.5) * 2.6 + (Math.random() - 0.5) * 0.5;
        this.cvy[i] = (v - 0.5) * 2.2 + 1.2 + Math.random() * 0.8;
        this.cvz[i] = (w - 0.5) * 2.6 + (Math.random() - 0.5) * 0.5;
        this.cmax[i] = this.clife[i] = 0.38 + Math.random() * 0.42;
        this.csize[i] = 0.08 + Math.random() * 0.05;
        this.cgrav[i] = 8;
      }
    }
    this.cany = true;
  }

  /** Point one chip at a random 4×4 of a tile. The atlas is stored with its top at v = 1. */
  private stamp(i: number, tile: number): void {
    const ox = Math.floor(Math.random() * (TILE_PX - CROP + 1));
    const oy = Math.floor(Math.random() * (TILE_PX - CROP + 1));
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    const w = ATLAS_COLS * TILE_PX;
    const h = ATLAS_ROWS * TILE_PX;
    this.uvRect.setXYZW(i, (col * TILE_PX + ox) / w, 1 - (row * TILE_PX + oy + CROP) / h, CROP / w, CROP / h);
    this.uvRect.needsUpdate = true;
  }

  /**
   * A puff of dust for a footstep or a landing: small flecks in the colour of the ground that spread along it and drift up, slowly, and shrink away.
   * power is 0..1+ (a landing from a height is a lot more than a step).
   */
  dust(x: number, y: number, z: number, tile: number, count: number, power = 1): void {
    const px = this.pixels(tile);
    for (let n = 0; n < count; n++) {
      const i = this.next++ % MAX;
      const a = Math.random() * Math.PI * 2;
      const sp = (0.35 + Math.random() * 1.1) * (0.5 + 0.7 * power);
      this.px[i] = x + (Math.random() - 0.5) * 0.4;
      this.py[i] = y + 0.04 + Math.random() * 0.06;
      this.pz[i] = z + (Math.random() - 0.5) * 0.4;
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = 0.35 + Math.random() * 0.9 * (0.5 + 0.5 * power);
      this.grav[i] = 2.6;
      this.maxLife[i] = this.life[i] = 0.35 + Math.random() * 0.45;
      this.size[i] = 0.08 + Math.random() * 0.09;
      let o = 0;
      for (let tries = 0; tries < 6; tries++) {
        o = Math.floor(Math.random() * TILE_PX * TILE_PX) * 4;
        if (px[o + 3] > 128) break;
      }
      // Dust is paler than the ground it comes from.
      this.color.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace).lerp(WHITE, 0.3);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** A puff of campfire smoke: a grey fleck that drifts up and thins out. */
  smoke(x: number, y: number, z: number): void {
    const i = this.next++ % MAX;
    this.px[i] = x + (Math.random() - 0.5) * 0.2;
    this.py[i] = y;
    this.pz[i] = z + (Math.random() - 0.5) * 0.2;
    this.vx[i] = (Math.random() - 0.5) * 0.15;
    this.vz[i] = (Math.random() - 0.5) * 0.15;
    this.vy[i] = 0.55 + Math.random() * 0.35;
    this.grav[i] = -0.35;
    this.maxLife[i] = this.life[i] = 1.3 + Math.random() * 0.7;
    this.size[i] = 0.1 + Math.random() * 0.06;
    const g = 0.45 + Math.random() * 0.15;
    this.color.setRGB(g, g, g, THREE.SRGBColorSpace);
    this.mesh.setColorAt(i, this.color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** One mote of a place's air (pollen, spores, ash, embers, sand...): where it starts, how it drifts and falls, its life, size and colour. */
  mote(x: number, y: number, z: number, vx: number, vy: number, vz: number, fall: number, life: number, size: number, r: number, g: number, b: number): void {
    const i = this.next++ % MAX;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.grav[i] = fall;
    this.maxLife[i] = this.life[i] = life;
    this.size[i] = size;
    this.color.setRGB(r, g, b, THREE.SRGBColorSpace);
    this.mesh.setColorAt(i, this.color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Sparks of a hit: fast little flecks of one colour that fly out from a point and fall. */
  sparks(x: number, y: number, z: number, r: number, g: number, b: number, count = 8): void {
    for (let n = 0; n < count; n++) {
      const i = this.next++ % MAX;
      this.px[i] = x + (Math.random() - 0.5) * 0.2;
      this.py[i] = y + (Math.random() - 0.5) * 0.2;
      this.pz[i] = z + (Math.random() - 0.5) * 0.2;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.2;
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = 0.8 + Math.random() * 3;
      this.grav[i] = 12;
      this.maxLife[i] = this.life[i] = 0.22 + Math.random() * 0.28;
      this.size[i] = 0.07 + Math.random() * 0.06;
      this.color.setRGB(r, g, b, THREE.SRGBColorSpace);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const sz = this.size[i] * (0.4 + 0.6 * k);
      this.e.set(this.life[i] * 5, this.life[i] * 7, 0);
      this.q.setFromEuler(this.e);
      this.p.set(this.px[i], this.py[i], this.pz[i]);
      this.s.setScalar(this.life[i] > 0 ? sz : 0);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
    this.updateChips(dt);
    this.updateBubbles(dt);
  }

  /**
   * What Minecraft shows once your eyes are in water. Still water occasionally leaves a blue speck
   * (`UNDERWATER`, colour 0.4, 0.4, 0.7, no gravity). A bubble rises (a nudge of 0.002 a tick, then
   * the speed is taken down to 85%) and pops the moment it leaves the water.
   */
  underwater(dt: number, x: number, y: number, z: number, active: boolean, isWater: (x: number, y: number, z: number) => boolean): void {
    this.waterAt = isWater;
    if (!active || !isWater(Math.floor(x), Math.floor(y), Math.floor(z))) return;
    this.bAcc = Math.min(0.5, this.bAcc + dt);
    this.sAcc = Math.min(0.5, this.sAcc + dt);
    while (this.bAcc >= 0.16) {
      this.bAcc -= 0.16;
      this.spawnBubble(x, y, z, false);
    }
    while (this.sAcc >= 0.05) {
      this.sAcc -= 0.05;
      this.spawnBubble(x, y, z, true);
    }
  }

  /** Bubbles rising from sea blooms. One call covers every column in view. `underwater` must have run first. */
  columns(dt: number, spots: readonly { x: number; y: number; z: number }[]): void {
    if (!this.waterAt || spots.length === 0) return;
    this.vAcc += dt;
    if (this.vAcc < 0.22) return;
    this.vAcc = 0;
    const water = this.waterAt;
    for (const s of spots) {
      let rise = 0;
      for (let i = 1; i <= 32; i++) {
        if (!water(Math.floor(s.x), Math.floor(s.y + i), Math.floor(s.z))) break;
        rise = i;
      }
      const py = s.y + Math.random() * Math.max(0.6, rise);
      this.placeRise(s.x + (Math.random() - 0.5) * 0.2, py, s.z + (Math.random() - 0.5) * 0.2, true);
    }
  }

  private placeRise(x: number, y: number, z: number, column = false): void {
    const i = this.bnext++ % BUBBLES;
    this.bpx[i] = x;
    this.bpy[i] = y;
    this.bpz[i] = z;
    this.bvx[i] = (Math.random() * 2 - 1) * 0.01;
    this.bvy[i] = 0.01;
    this.bvz[i] = (Math.random() * 2 - 1) * 0.01;
    this.bmax[i] = this.blife[i] = column ? 3.4 : 2.2;
    this.bsize[i] = column ? 0.11 + Math.random() * 0.08 : 0.07 + Math.random() * 0.05;
    this.brise[i] = 1;
    this.bkind.setX(i, 0);
  }

  private spawnBubble(x: number, y: number, z: number, speck: boolean): void {
    const water = this.waterAt;
    if (!water) return;
    const reach = speck ? 6 : 3.2;
    for (let t = 0; t < 6; t++) {
      const ox = (Math.random() - 0.5) * reach * 2;
      const oy = (Math.random() - 0.5) * reach * 1.4;
      const oz = (Math.random() - 0.5) * reach * 2;
      const dist = Math.hypot(ox, oy, oz);
      if (dist < 0.5 || dist > reach) continue;
      const px = x + ox;
      const py = y + oy;
      const pz = z + oz;
      if (!water(Math.floor(px), Math.floor(py), Math.floor(pz))) continue;
      const i = this.bnext++ % BUBBLES;
      this.bpx[i] = px;
      this.bpy[i] = py;
      this.bpz[i] = pz;
      const jitter = (Math.random() * 2 - 1) * 0.02;
      this.bvx[i] = speck ? jitter * 0.15 : jitter;
      this.bvy[i] = speck ? 0 : jitter;
      this.bvz[i] = speck ? (Math.random() * 2 - 1) * 0.003 : (Math.random() * 2 - 1) * 0.02;
      const span = speck ? 16 : 8;
      this.bmax[i] = this.blife[i] = span / (Math.random() * 0.8 + 0.2) / 20;
      this.bsize[i] = speck ? 0.02 + Math.random() * 0.06 : 0.05 + Math.random() * 0.07;
      this.brise[i] = speck ? 0 : 1;
      this.bkind.setX(i, speck ? 1 : 0);
      return;
    }
  }

  private updateBubbles(dt: number): void {
    this.q.identity();
    const ticks = dt * 20;
    const drag = Math.pow(0.85, ticks);
    const water = this.waterAt;
    let any = false;
    for (let i = 0; i < BUBBLES; i++) {
      if (this.blife[i] <= 0) continue;
      any = true;
      this.blife[i] -= dt;
      if (this.brise[i] > 0) this.bvy[i] += 0.002 * ticks;
      this.bpx[i] += this.bvx[i] * ticks;
      this.bpy[i] += this.bvy[i] * ticks;
      this.bpz[i] += this.bvz[i] * ticks;
      if (this.brise[i] > 0) {
        this.bvx[i] *= drag;
        this.bvy[i] *= drag;
        this.bvz[i] *= drag;
        if (water && !water(Math.floor(this.bpx[i]), Math.floor(this.bpy[i]), Math.floor(this.bpz[i]))) this.blife[i] = 0;
      }
      const k = this.bmax[i] > 0 ? Math.max(0, this.blife[i] / this.bmax[i]) : 0;
      this.bfade.setX(i, k > 0.25 ? 1 : k / 0.25);
      const sz = this.blife[i] > 0 ? this.bsize[i] : 0;
      this.p.set(this.bpx[i], this.bpy[i], this.bpz[i]);
      this.s.set(sz, sz, sz);
      this.m4.compose(this.p, this.q, this.s);
      this.bubbles.setMatrixAt(i, this.m4);
    }
    if (!any) return;
    this.bubbles.instanceMatrix.needsUpdate = true;
    this.bfade.needsUpdate = true;
    this.bkind.needsUpdate = true;
  }

  private updateChips(dt: number): void {
    if (!this.cany) return;
    this.q.identity();
    let any = false;
    for (let i = 0; i < CHIPS; i++) {
      if (this.clife[i] <= 0) continue;
      any = true;
      this.clife[i] -= dt;
      this.cvy[i] -= this.cgrav[i] * dt;
      this.cx[i] += this.cvx[i] * dt;
      this.cy[i] += this.cvy[i] * dt;
      this.cz[i] += this.cvz[i] * dt;
      const k = Math.max(0, this.clife[i] / this.cmax[i]);
      this.fade.setX(i, k * k);
      const sz = this.clife[i] > 0 ? this.csize[i] * (0.35 + 0.65 * k) : 0;
      this.p.set(this.cx[i], this.cy[i], this.cz[i]);
      this.s.set(sz, sz, sz);
      this.m4.compose(this.p, this.q, this.s);
      this.debris.setMatrixAt(i, this.m4);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.fade.needsUpdate = true;
    this.cany = any;
  }

  setBrightness(b: number): void {
    const k = Math.max(0.25, b);
    this.material.color.setScalar(k);
    this.debrisMat.uniforms.brightness.value = k;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
    this.debris.geometry.dispose();
    this.debrisMat.dispose();
    this.debris.dispose();
    this.bubbles.geometry.dispose();
    this.bubbleMat.dispose();
    this.bubbles.dispose();
  }
}
