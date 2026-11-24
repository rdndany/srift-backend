import * as THREE from 'three';

/**
 * The flames that burn on the armor of the Hollow King: a standing flame is two crossing planes drawn by one shader (a tongue that
 * tapers, wavers and flickers as noise runs up it, white at the root, gold, orange, then red at the tip), added to the picture so it
 * glows. Every flame of every wearer shares one geometry and a few materials (one for each phase), so a crowd of them costs next to nothing;
 * nothing is animated by a caller, the shader reads one clock that each flame sets as it is drawn.
 */

const CLOCK = { value: 0 };
const PHASES = 5;
const mats: THREE.ShaderMaterial[] = [];
let geo: THREE.BufferGeometry | null = null;

function material(phase: number): THREE.ShaderMaterial {
  const i = ((phase % PHASES) + PHASES) % PHASES;
  let m = mats[i];
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uTime: CLOCK, uPhase: { value: i * 1.7 + 0.3 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uPhase;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          float t = uTime * 2.1 + uPhase;
          float h = vUv.y;
          float n = vnoise(vec2(vUv.x * 3.2 + uPhase, h * 2.6 - t)) * 0.65 + vnoise(vec2(vUv.x * 7.0, h * 5.0 - t * 1.7)) * 0.35;
          float sway = (n - 0.5) * 0.38 * h + sin(t * 1.3 + h * 2.0) * 0.07 * h;
          float dx = abs(vUv.x - 0.5 + sway);
          float w = mix(0.48, 0.03, pow(h, 0.75)) * (0.75 + 0.5 * n);
          float a = smoothstep(w, w * 0.25, dx) * smoothstep(1.0, 0.62, h + (n - 0.5) * 0.34);
          if (a < 0.02) discard;
          float heat = clamp(1.0 - h * 1.25 + n * 0.35, 0.0, 1.0);
          vec3 col = mix(vec3(0.85, 0.12, 0.03), vec3(1.0, 0.46, 0.08), smoothstep(0.0, 0.45, heat));
          col = mix(col, vec3(1.0, 0.82, 0.3), smoothstep(0.45, 0.8, heat));
          col = mix(col, vec3(1.0, 0.97, 0.8), smoothstep(0.8, 1.0, heat));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    mats[i] = m;
  }
  return m;
}

/** Two crossing planes, `w` wide and `h` tall, standing on y = 0 (the flame's root is the bottom edge). */
function crossGeometry(): THREE.BufferGeometry {
  if (!geo) {
    const a = new THREE.PlaneGeometry(1, 1);
    a.translate(0, 0.5, 0);
    const b = a.clone();
    b.rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const g of [a, b]) {
      const base = pos.length / 3;
      pos.push(...(g.getAttribute('position').array as Float32Array));
      uv.push(...(g.getAttribute('uv').array as Float32Array));
      for (const i of g.getIndex()!.array as Uint16Array) idx.push(base + i);
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.setIndex(idx);
    geo = merged;
  }
  return geo;
}

/**
 * A flame rooted at `at` in `parent`, `w` wide and `h` tall. The shared geometry and material are not the caller's to dispose; take the
 * returned mesh out of its parent to put the flame out.
 */
export function addFlame(parent: THREE.Object3D, at: [number, number, number], w: number, h: number, phase: number): THREE.Mesh {
  const mesh = new THREE.Mesh(crossGeometry(), material(phase));
  mesh.position.set(...at);
  mesh.scale.set(w, h, w);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = () => {
    CLOCK.value = performance.now() / 1000;
  };
  parent.add(mesh);
  return mesh;
}
