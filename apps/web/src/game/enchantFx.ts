import * as THREE from 'three';

/**
 * What a piece with glyphs looks like in the world: a band of light in the colour of its strongest element sweeps over the model
 * (and it breathes a little), and small four-pointed sparks rise off it. The first-person hand, the figures' hands and the items on
 * the ground all use `addAura`; `stripAura` takes it off again (and keeps a clone of a model from inheriting it).
 *
 * Nothing here is animated by a caller: the shaders read one clock, which every piece of the effect sets as it is drawn.
 */

const CLOCK = { value: 0 };
const tick = (): void => {
  CLOCK.value = performance.now() / 1000;
};

const sweeps = new Map<string, THREE.ShaderMaterial>();

/**
 * The light that lies over a model (drawn where the model is, with its picture's cut-outs when it has one), in two layers: `tint` multiplies
 * the piece by the element's colour (a pale blade, which a light that is only added would not change) with the band running through it
 * lighter, and `glow` adds a little light on top (a dark piece, which a tint would not change).
 */
function sweepMaterial(color: string, map: THREE.Texture | null, mode: 'tint' | 'glow'): THREE.ShaderMaterial {
  const key = `${color}|${map ? map.uuid : '-'}|${mode}`;
  let m = sweeps.get(key);
  if (!m) {
    const tint = mode === 'tint';
    const body = tint
      ? `vec3 c = mix(uColor, vec3(1.0), 0.15 + band * 0.55);
          gl_FragColor = vec4(mix(vec3(1.0), c, 0.78 + 0.22 * swell - band * 0.35), 1.0);`
      : 'gl_FragColor = vec4(uColor * (0.05 + 0.07 * swell + 0.32 * band), 1.0);';
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: CLOCK, uMap: { value: map }, uUseMap: { value: map ? 1 : 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vP;
        varying vec2 vUv;
        void main() {
          vP = position;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform sampler2D uMap;
        uniform float uUseMap;
        varying vec3 vP;
        varying vec2 vUv;
        void main() {
          if (uUseMap > 0.5 && texture2D(uMap, vUv).a < 0.45) discard;
          float s = vP.x + vP.y;
          // a bright band running along the piece, and a slower swell under it
          float run = fract(s * 0.8 - uTime * 0.6);
          float band = smoothstep(0.0, 0.07, run) * (1.0 - smoothstep(0.07, 0.3, run));
          float swell = 0.5 + 0.5 * sin(uTime * 2.4 + s * 3.5);
          ${body}
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      ...(tint ? { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor } : { blending: THREE.AdditiveBlending }),
      // (lying on the very same triangles as the piece: pulled a little toward the viewer so it never loses the depth test to it)
      polygonOffset: true,
      polygonOffsetFactor: tint ? -2 : -3,
      polygonOffsetUnits: tint ? -2 : -3,
    });
    sweeps.set(key, m);
  }
  return m;
}

const POINT_COUNT = 14;
const sparkMats = new Map<string, THREE.ShaderMaterial>();

/** The material of the sparks: each is born, rises, twinkles and fades on its own timing (all in the vertex shader). */
function sparkMaterial(color: string): THREE.ShaderMaterial {
  let m = sparkMats.get(color);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: CLOCK,
        uExtent: { value: new THREE.Vector3(1, 1, 1) },
        uSize: { value: 0.07 },
        uPx: { value: 700 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aRand;
        uniform float uTime;
        uniform vec3 uExtent;
        uniform float uSize;
        uniform float uPx;
        varying float vLife;
        void main() {
          float t = fract(uTime * (0.22 + aRand.w * 0.3) + aRand.z * 5.0);
          vLife = sin(t * 3.14159);
          vec3 p = (aRand.xyz - 0.5) * uExtent;
          p.y += (t - 0.5) * uExtent.y * 0.9;
          p.x += sin(uTime * 1.7 + aRand.z * 20.0) * uExtent.x * 0.06;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(2.5 * vLife, uSize * uPx * vLife / max(0.05, -mv.z));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vLife;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float core = smoothstep(0.5, 0.0, d);
          float cross = max(0.0, 1.0 - min(abs(c.x), abs(c.y)) * 9.0) * (1.0 - d * 1.9);
          float a = (core * 0.7 + cross) * vLife;
          if (a < 0.02) discard;
          gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.45) * a * 1.5, 1.0);
          #include <colorspace_fragment>
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    sparkMats.set(color, m);
  }
  return m;
}

let sparkGeo: THREE.BufferGeometry | null = null;
/** The points' one shared geometry: where each starts, as fractions of the box, and its own timing. */
function sparkGeometry(): THREE.BufferGeometry {
  if (!sparkGeo) {
    sparkGeo = new THREE.BufferGeometry();
    const r = new Float32Array(POINT_COUNT * 4);
    // (a fixed pattern, not random numbers drawn each time: every piece sparkles alike, and the sparks are spread out evenly)
    for (let i = 0; i < POINT_COUNT; i++) {
      const a = (i * 0.618034) % 1;
      const b = (i * 0.754877) % 1;
      const c = (i * 0.569840 + 0.13) % 1;
      r.set([a, b, c, (i * 0.3819) % 1], i * 4);
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POINT_COUNT * 3), 3));
    sparkGeo.setAttribute('aRand', new THREE.BufferAttribute(r, 4));
  }
  return sparkGeo;
}

/** Put the glow on a model: the light over each of its meshes, and the sparks round it. Anything it had before is taken off first. */
export function addAura(root: THREE.Object3D, color: string): void {
  stripAura(root);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.aura) meshes.push(o);
  });
  for (const m of meshes) {
    const src = m.material;
    // (a flame or a sheet drawn from both sides lights itself; a part with several materials is left alone)
    if (Array.isArray(src) || (src as THREE.Material).side === THREE.DoubleSide) continue;
    const map = (src as THREE.MeshBasicMaterial).map ?? null;
    const withMap = map && m.geometry.getAttribute('uv') ? map : null;
    for (const mode of ['tint', 'glow'] as const) {
      const over = new THREE.Mesh(m.geometry, sweepMaterial(color, withMap, mode));
      over.userData.aura = true;
      over.renderOrder = m.renderOrder + (mode === 'tint' ? 1 : 2);
      over.frustumCulled = m.frustumCulled;
      over.onBeforeRender = tick;
      m.add(over);
    }
  }
  // The sparks fill the model's own bounds (in its own units, taken from its meshes so a piece held at a slant is not measured as bigger), a little wider than it is.
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const back = root.matrixWorld.clone().invert();
  const part = new THREE.Box3();
  for (const m of meshes) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    part.copy(m.geometry.boundingBox!).applyMatrix4(back.clone().multiply(m.matrixWorld));
    box.union(part);
  }
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 0.05);
  const mat = sparkMaterial(color).clone();
  // (a clone has its own copy of every uniform, the shared clock included)
  mat.uniforms.uTime = CLOCK;
  (mat.uniforms.uExtent.value as THREE.Vector3).set(size.x + longest * 0.35, size.y + longest * 0.3, size.z + longest * 0.35);
  // Sizes are in units of the model (so the sparks stay in proportion to the piece, held or lying), and the pixel size follows the camera.
  mat.uniforms.uSize.value = longest * 0.035 * Math.max(root.getWorldScale(new THREE.Vector3()).x, 0.01);
  const sparks = new THREE.Points(sparkGeometry(), mat);
  sparks.userData.aura = true;
  sparks.position.copy(mid);
  sparks.frustumCulled = false;
  sparks.renderOrder = 30;
  const v = new THREE.Vector2();
  sparks.onBeforeRender = (renderer, _scene, camera) => {
    tick();
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
    mat.uniforms.uPx.value = renderer.getDrawingBufferSize(v).y / (2 * Math.tan((fov * Math.PI) / 360));
  };
  root.add(sparks);
}

/** Take the glow off a model, and off any clone made while it had it. */
export function stripAura(root: THREE.Object3D): void {
  const gone: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.aura) gone.push(o);
  });
  for (const o of gone) {
    o.parent?.remove(o);
    if (o instanceof THREE.Points) (o.material as THREE.Material).dispose();
  }
}

/** A tiny model with the glow's materials on it, for drawing once while loading so the shaders are built before they are needed. */
export function auraSamples(): THREE.Object3D[] {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const flat = new THREE.Mesh(box, sweepMaterial('#ffffff', null, 'tint'));
  const flat2 = new THREE.Mesh(box, sweepMaterial('#ffffff', null, 'glow'));
  const pts = new THREE.Points(sparkGeometry(), sparkMaterial('#ffffff'));
  pts.frustumCulled = false;
  return [flat, flat2, pts];
}
