import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  KawaseBlurPass,
  KernelSize,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

/** The things that can be on, each with its own key in the game (F6 .. F10). */
export interface FxFlags {
  /** Soft darkening where blocks, the ground and the player meet (F6). */
  ao: boolean;
  /** Glow round bright things: torches, lava, gems, the staff's crystal (F7). */
  glow: boolean;
  /** Colour: a soft highlight roll-off, warm light and cool shadows following the time of day, a vignette (F8). */
  grade: boolean;
  /** Shafts of light from the sun (F9). */
  rays: boolean;
  /** The picture behind an open menu is blurred (F10). */
  menuBlur: boolean;
}

export const FX_KEYS: { key: string; flag: keyof FxFlags; name: string }[] = [
  { key: 'F6', flag: 'ao', name: 'Ambient occlusion' },
  { key: 'F7', flag: 'glow', name: 'Glow' },
  { key: 'F8', flag: 'grade', name: 'Colour grading' },
  { key: 'F9', flag: 'rays', name: 'Sun rays' },
  { key: 'F10', flag: 'menuBlur', name: 'Menu blur' },
];

export const DEFAULT_FX: FxFlags = { ao: true, glow: true, grade: true, rays: true, menuBlur: true };

/** What the picture needs to know about the world each frame. */
export interface FxFrame {
  dt: number;
  /** 1 at golden hour (the sun low), 0 otherwise. */
  dusk: number;
  /** 1 in full daylight, 0 at night. */
  day: number;
  /** 1 well underground (no sun, no grading of the weather), 0 in the open. */
  underground: number;
  /** 0..1, how overcast. */
  rain: number;
  underwater: boolean;
  /** A menu is open. */
  menu: boolean;
  /** While the game loads: every part is switched on for these frames so that its shaders are built then, not when the sun first comes into view. */
  warm?: boolean;
}

const GRADE_FRAGMENT = /* glsl */ `
uniform vec3 uShadow;
uniform vec3 uLight;
uniform float uAmount;
uniform float uSat;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float dark = 1.0 - smoothstep(0.0, 0.5, l);
  float bright = smoothstep(0.2, 0.9, l);
  c *= mix(vec3(1.0), uLight, bright * uAmount);
  c += uShadow * dark * uAmount;
  float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(g), c, mix(1.0, uSat, uAmount));
  // A soft shoulder: what is brighter than white (a lit snowfield, the sun's glow) rolls off instead of clipping; the darks are not touched.
  c = max(c, 0.0);
  vec3 over = max(c - 0.78, 0.0);
  c = min(c, 0.78) + 0.22 * (1.0 - exp(-over / 0.22));
  outputColor = vec4(c, inputColor.a);
}
`;

/** Split toning: the lights go towards one colour and the shadows towards another, and the colours are pushed a little. */
class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uShadow', new THREE.Uniform(new THREE.Vector3())],
        ['uLight', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['uAmount', new THREE.Uniform(0)],
        ['uSat', new THREE.Uniform(1)],
      ]),
    });
  }

  set(shadow: THREE.Vector3, light: THREE.Vector3, amount: number, saturation: number): void {
    (this.uniforms.get('uShadow') as THREE.Uniform<THREE.Vector3>).value.copy(shadow);
    (this.uniforms.get('uLight') as THREE.Uniform<THREE.Vector3>).value.copy(light);
    this.uniforms.get('uAmount')!.value = amount;
    this.uniforms.get('uSat')!.value = saturation;
  }
}

/**
 * The shafts of light from the sun. Two things are spared against the library's own: with no shafts to show (the sun behind you, or down)
 * none of its passes run; and the sun's disc, with the depth of the scene that hides it, is drawn at the small size the shafts are made
 * at, not at the full size of the picture to be shrunk straight afterwards.
 */
class SunRays extends GodRaysEffect {
  paused = false;

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, deltaTime?: number): void {
    if (!this.paused) super.update(renderer, inputBuffer, deltaTime);
  }

  override setSize(width: number, height: number): void {
    super.setSize(width, height);
    const r = this.resolution;
    (this as unknown as { renderTargetLight: THREE.WebGLRenderTarget }).renderTargetLight.setSize(r.width, r.height);
  }
}

/** The glow, which does none of its blurring while it is switched off. */
class Glow extends BloomEffect {
  paused = false;

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, deltaTime?: number): void {
    if (!this.paused) super.update(renderer, inputBuffer, deltaTime);
  }
}

/** The height in pixels the sun's shafts are made at, whatever the size of the picture: they are soft, and stretched over it. */
const RAYS_HEIGHT = 288;

// The colour of the light on the picture: neutral at noon, golden at the end of the day, moonlit blue at night; and the shadows' tint.
const LIGHT_DAY = new THREE.Vector3(1.0, 0.985, 0.95);
const LIGHT_DUSK = new THREE.Vector3(1.22, 0.96, 0.72);
const LIGHT_NIGHT = new THREE.Vector3(0.9, 0.98, 1.18);
const SHADOW_DAY = new THREE.Vector3(0.0, 0.004, 0.012);
const SHADOW_DUSK = new THREE.Vector3(0.022, 0.0, 0.042);
const SHADOW_NIGHT = new THREE.Vector3(0.0, 0.004, 0.02);

const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The picture after the scene is drawn. In order: ambient occlusion (the soft dark where blocks meet each other, the ground, the player and
 * the props: the mesher's own occlusion only knows blocks), shafts of sunlight, glow round bright things, the colour grade (tone curve,
 * time-of-day tint, vignette), a blur behind open menus, and edge smoothing in place of the card's multisampling (which cannot be used
 * with the occlusion). It is made on first use; each part can be turned off and on while playing; with all of them off the scene goes
 * straight to the screen as before.
 *
 * The hand is drawn after it, straight onto the screen (see `HeldItem.render`), and the fog and the sky stay the terrain shader's own.
 */
export class PostFx {
  private composer: EffectComposer | null = null;
  private ao: N8AOPostPass | null = null;
  /** The sun's shafts, the glow and the colour grade are one pass over the picture, not three: each is a full screen of work less. */
  private fxPass: EffectPass | null = null;
  private rays: SunRays | null = null;
  private bloom: Glow | null = null;
  private grade: GradeEffect | null = null;
  private vignette: VignetteEffect | null = null;
  private blurPass: KawaseBlurPass | null = null;
  private flags: FxFlags = { ...DEFAULT_FX, ao: false, glow: false, grade: false, rays: false, menuBlur: false };
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly shadow = new THREE.Vector3();
  private readonly light = new THREE.Vector3();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly sun: THREE.Mesh,
  ) {}

  /** True while the picture goes through the passes (any part is on). */
  get on(): boolean {
    const f = this.flags;
    return f.ao || f.glow || f.grade || f.rays || f.menuBlur;
  }

  get current(): Readonly<FxFlags> {
    return this.flags;
  }

  private build(): void {
    const { renderer, scene, camera } = this;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const composer = new EffectComposer(renderer, { multisampling: 0 });
    composer.addPass(new RenderPass(scene, camera));

    const ao = new N8AOPostPass(scene, camera, size.x, size.y);
    // A few blocks of reach: the corners and creases of rooms, the feet, the hat against a wall; not whole walls (the mesher's own occlusion
    // is still there, so this is the gentler of the two). Half the resolution is a good deal cheaper and the depth-aware upscale keeps the edges.
    ao.configuration.aoRadius = 3;
    ao.configuration.distanceFalloff = 1;
    ao.configuration.intensity = 4.5;
    ao.configuration.aoSamples = 12;
    ao.configuration.denoiseSamples = 6;
    ao.configuration.denoiseIterations = 1;
    ao.configuration.halfRes = true;
    // (Looking for see-through things to draw again would walk the whole scene each frame.)
    ao.configuration.transparencyAware = false;
    // The occlusion pass composes into a buffer of its own that is not labelled sRGB, while the picture it reads is (8 bits, sRGB): it
    // reads the colours back as linear light and stores them linear in 8 bits, where all the dark colours (the night sky, the shade)
    // are crushed into a few bands and black. Label the buffer the same as the picture and it is stored the same way.
    const internals = ao as unknown as { outputTargetInternal: THREE.WebGLRenderTarget };
    internals.outputTargetInternal.dispose();
    internals.outputTargetInternal = new THREE.WebGLRenderTarget(size.x, size.y, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      colorSpace: composer.inputBuffer.texture.colorSpace,
    });    composer.addPass(ao);

    const rays = new SunRays(camera, this.sun, {
      samples: 32,
      density: 0.92,
      decay: 0.93,
      weight: 0.45,
      exposure: 0.8,
      clampMax: 0.9,
      blur: true,
      kernelSize: KernelSize.SMALL,
      resolutionY: RAYS_HEIGHT,
    });
    // Bright things only: the threshold is above what lit snow and sky reach.
    const bloom = new Glow({ luminanceThreshold: 0.95, luminanceSmoothing: 0.3, intensity: 0.6, radius: 0.75, mipmapBlur: true, levels: 6 });
    const grade = new GradeEffect();
    const vignette = new VignetteEffect({ offset: 0.45, darkness: 0.42 });
    // All in one pass, in this order. Each stays in it when it is switched off (it is only made to add nothing, see `apply`): taking one out
    // would mean building the pass's shader again, which stops the game for a moment.
    const fxPass = new EffectPass(camera, rays, bloom, grade, vignette);
    composer.addPass(fxPass);

    const blurPass = new KawaseBlurPass({ kernelSize: KernelSize.LARGE, resolutionScale: 0.5 });
    composer.addPass(blurPass);
    composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM })));

    this.composer = composer;
    this.ao = ao;
    this.fxPass = fxPass;
    this.rays = rays;
    this.bloom = bloom;
    this.grade = grade;
    this.vignette = vignette;
    this.blurPass = blurPass;
    this.apply();
  }

  setFlags(flags: FxFlags): void {
    this.flags = { ...flags };
    if (this.on && !this.composer) this.build();
    this.apply();
  }

  private apply(): void {
    if (!this.composer) return;
    const f = this.flags;
    this.ao!.enabled = f.ao;
    this.showRays(f.rays);
    this.bloom!.paused = !f.glow;
    this.bloom!.blendMode.opacity.value = f.glow ? 1 : 0;
    this.grade!.blendMode.opacity.value = f.grade ? 1 : 0;
    this.vignette!.blendMode.opacity.value = f.grade ? 1 : 0;
    this.blurPass!.enabled = f.menuBlur;
  }

  /** The sun's shafts on or off for this frame (off: none of their passes run and they add nothing), and with them the pass they share. */
  private showRays(on: boolean): void {
    const f = this.flags;
    this.rays!.paused = !on;
    this.rays!.blendMode.opacity.value = on ? 1 : 0;
    this.fxPass!.enabled = on || f.glow || f.grade;
  }

  /** The window or the resolution changed (the renderer has already been told). */
  resize(width: number, height: number): void {
    this.composer?.setSize(width, height, false);
  }

  /** Fit the passes to the moment (the time of day, the weather, where the sun is on the screen), then draw the scene through them. */
  render(frame: FxFrame): void {
    const composer = this.composer;
    if (!composer) return;
    const f = this.flags;
    const open = 1 - frame.underground;

    if (f.rays) {
      // The sun must be in front of the camera and up; the shafts are strongest when it is low.
      this.sun.getWorldPosition(this.tmpA).sub(this.camera.position).normalize();
      this.camera.getWorldDirection(this.tmpB);
      const facing = sstep(0.15, 0.7, this.tmpA.dot(this.tmpB));
      const strength = facing * open * (1 - frame.rain) * (frame.underwater ? 0 : 1) * (0.3 + 0.7 * frame.dusk) * frame.day;
      this.showRays(frame.warm === true || strength > 0.02);
      this.rays!.godRaysMaterial.exposure = 0.9 * strength;
    }

    if (f.glow) {
      // Light things stand out more the darker it is; underwater and in the open they are tamer.
      const dark = 1 - frame.day * open;
      this.bloom!.intensity = 0.45 + 0.55 * dark;
    }

    if (f.grade) {
      // Golden light and violet shadows at dusk, cool at night, almost neutral at noon; none of it deep underground.
      const nightAmt = 1 - frame.day;
      this.light.copy(LIGHT_DAY).lerp(LIGHT_NIGHT, nightAmt).lerp(LIGHT_DUSK, frame.dusk);
      this.shadow.copy(SHADOW_DAY).lerp(SHADOW_NIGHT, nightAmt).lerp(SHADOW_DUSK, frame.dusk);
      const amount = (0.55 + 0.45 * frame.dusk) * (1 - 0.7 * frame.underground) * (1 - 0.6 * frame.rain);
      this.grade!.set(this.shadow, this.light, amount, 1.06 + 0.14 * frame.dusk);
    }

    this.blurPass!.enabled = f.menuBlur && frame.menu;
    composer.render(frame.dt);
  }

  /** For tuning and the debug hook. */
  get occlusion(): N8AOPostPass | null {
    return this.ao;
  }
  get glowEffect(): BloomEffect | null {
    return this.bloom;
  }
  get raysEffect(): GodRaysEffect | null {
    return this.rays;
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
    this.ao = null;
    this.fxPass = null;
    this.rays = null;
    this.bloom = null;
    this.grade = null;
    this.vignette = null;
    this.blurPass = null;
    this.flags = { ao: false, glow: false, grade: false, rays: false, menuBlur: false };
  }
}
