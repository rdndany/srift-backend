import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, GRASS_BASE, WATER_BASE, paletteColor, TINT_WATER_BASE, WATER_DEPTH_FLAG, WATER_DEPTH_STRIDE, tileIndex } from '@solrift/shared';
import type { Atlas } from './atlas';

/**
 * Chunk shader. Responsibilities:
 *  - resolve atlas tile + repeat UV (greedy-merged quads tile their texture), mip-mapped so distant ground is calm
 *  - combine baked per-vertex shade/AO, sky light (scaled by time of day) and block light
 *  - a real sun: warm direct light on faces that look at it, cool ambient fill in the shade, soft shadow map
 *  - living water (ripples, sky reflection, sun glints), pulsing lava, flickering torch light, swaying plants and leaves
 *  - distance fog that glows towards the sun
 *
 * Light data lives in vertex attributes, so changing the time of day only touches uniforms;
 * no remeshing is needed.
 */

const tiles = (...names: string[]): string => names.map((n) => `t == ${tileIndex(n)}.0`).join(' || ');
const LEAF_TEST = tiles('leaves', 'birch_leaves', 'spruce_leaves', 'acacia_leaves', 'jungle_leaves', 'dark_oak_leaves', 'cherry_leaves');
const LEAF_TEST_FRAG = LEAF_TEST.replaceAll('t ==', 'tile ==');
const PLANT_TEST = tiles('tall_grass', 'rose', 'dandelion', 'sapling', 'birch_sapling', 'spruce_sapling', 'acacia_sapling', 'jungle_sapling', 'dark_oak_sapling', 'cherry_sapling', 'fern', 'tulip_red', 'tulip_orange', 'tulip_white', 'tulip_pink', 'oxeye_daisy', 'cornflower', 'allium', 'azure_bluet', 'blue_orchid', 'sugar_cane', 'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3');

/**
 * The air: the sky's colour in a direction, and how much of it a thing at a distance is lost in.
 */
export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogZenith;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSunDir;
uniform vec3 uGlow;

/** The sky dome's colour in direction d (kept identical to the dome shader in sky.ts). */
vec3 skyAt(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 col = mix(uFogColor, uFogZenith, pow(h, 0.5));
  float s = max(dot(d, uSunDir), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.55, h);
  return col + uGlow * (pow(s, 5.0) * 0.45 * (0.35 + 0.65 * low) + pow(s, 48.0) * 0.55);
}

/** 0 clear .. 1 lost in the sky. */
float fogAmount(float d, float y) {
  return smoothstep(uFogNear, uFogFar, d);
}
`;

const vertexShader = /* glsl */ `
attribute float aTile;
attribute vec4 aLight;
uniform float uTime;
uniform float uWind;
varying vec2 vUv;
varying float vTile;
varying float vShell;
varying vec4 vLight;
varying float vDepth;
varying vec3 vWorld;

void main() {
  vUv = uv;
  // Tiles of the leaves' outer fuzz are numbered 1024 up (see the mesher).
  float fuzz = step(1000.0, aTile);
  vShell = fuzz;
  vTile = aTile - 1024.0 * fuzz;
  vLight = aLight;
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorld = wp;
  vec3 p = position;
  float t = floor(vTile + 0.5);
  float sw = 0.0;
  // Plants lean with the wind from their roots (uv.y runs 0 at the ground to 1 at the tip); leaves just breathe.
  if (${PLANT_TEST}) {
    float g = sin(uTime * 1.7 + wp.x * 0.85 + wp.z * 1.2) * 0.6 + sin(uTime * 2.9 + wp.z * 2.1 - wp.x * 0.7) * 0.4;
    sw = uv.y * 0.075 * uWind * (0.45 + 0.55 * g);
    p.x += sw;
    p.z += sw * 0.6;
  } else if (${LEAF_TEST}) {
    p += vec3(
      sin(uTime * 0.9 + wp.x * 0.8 + wp.y * 0.5),
      sin(uTime * 1.1 + wp.z * 0.7 + wp.y * 0.6) * 0.6,
      sin(uTime * 1.0 + wp.x * 0.5 + wp.z * 0.9)
    ) * 0.02 * uWind;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform sampler2D uAux;
uniform float uDay;
uniform float uTime;
${FOG_GLSL}
uniform float uAlphaTest;
uniform float uOpacity;
uniform sampler2D uPalette;
uniform vec3 uBaseGrass;
uniform vec3 uBaseWater;
uniform vec3 uAmbient;
uniform vec3 uSun;
uniform vec3 uLightDir;
uniform float uWind;
uniform vec3 uSkyReflect;
uniform float uGlint;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform float uShadowRange;
uniform sampler2D uShadowMapB;
uniform mat4 uShadowMatB;
uniform float uShadowBlend;
uniform sampler2D uShadowMap2;
uniform mat4 uShadowMat2;
uniform float uShadowOn2;
uniform float uShadowTexel2;
uniform float uShadowScale2;
uniform sampler2D uShadowMap2B;
uniform mat4 uShadowMat2B;
uniform float uShadowBlend2;
uniform sampler2D uShadowMapE;
uniform mat4 uShadowMatE;
uniform float uShadowOnE;
uniform float uShadowTexelE;
// A lantern in the hand: where it is, the colour of its light and how far it reaches (0 = none).
uniform vec3 uHeldPos;
uniform vec3 uHeldColor;
uniform float uHeldRange;
// The nearest soul lanterns standing about (x, y, z, reach; reach 0 = unused): the light near them is blue, not warm.
uniform vec4 uSoul[6];

varying vec2 vUv;
varying float vTile;
varying float vShell;
varying vec4 vLight;
varying float vDepth;
varying vec3 vWorld;

const float COLS = ${ATLAS_COLS}.0;
const float ROWS = ${ATLAS_ROWS}.0;
// Fire is four tiles in a row; every flame shows the same frame, a few times a second.
const float FIRE0 = ${tileIndex('fire_0')}.0;
const float LAVA = ${tileIndex('lava')}.0;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

/** Smooth noise in 0..1 over space (value noise on a lattice of whole units). */
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 u = smoothstep(0.0, 1.0, fract(p));
  float z0 = i.z * 17.0;
  float z1 = z0 + 17.0;
  float a = mix(mix(hash12(i.xy + z0), hash12(i.xy + vec2(1.0, 0.0) + z0), u.x), mix(hash12(i.xy + vec2(0.0, 1.0) + z0), hash12(i.xy + vec2(1.0, 1.0) + z0), u.x), u.y);
  float b = mix(mix(hash12(i.xy + z1), hash12(i.xy + vec2(1.0, 0.0) + z1), u.x), mix(hash12(i.xy + vec2(0.0, 1.0) + z1), hash12(i.xy + vec2(1.0, 1.0) + z1), u.x), u.y);
  return mix(a, b, u.z);
}
/** The share of a w x w texel square (in texels of the map) that the sun reaches: exact coverage, so a shadow's edge is smooth and steady. */
float shadowBox(sampler2D map, vec2 uv, float z, float texel, float w) {
  vec2 x = uv / texel;
  vec2 lo = x - 0.5 * w;
  vec2 base = floor(lo);
  float sum = 0.0;
  for (int j = 0; j < 4; j++) {
    float ky = base.y + float(j);
    float oy = clamp(min(ky + 1.0, lo.y + w) - max(ky, lo.y), 0.0, 1.0);
    if (oy <= 0.0) continue;
    for (int i = 0; i < 4; i++) {
      float kx = base.x + float(i);
      float ox = clamp(min(kx + 1.0, lo.x + w) - max(kx, lo.x), 0.0, 1.0);
      if (ox <= 0.0) continue;
      sum += ox * oy * step(z, textureLod(map, (vec2(kx, ky) + 0.5) * texel, 0.0).r);
    }
  }
  return sum / (w * w);
}

/** A coarse test first (five taps): away from an edge they all agree and the full filter is skipped. */
float shadowPcf(sampler2D map, vec2 uv, float z, float texel, float w) {
  float r = (0.5 * w + 0.5) * texel;
  float a = step(z, textureLod(map, uv, 0.0).r);
  float b = step(z, textureLod(map, uv + vec2(r, 0.0), 0.0).r);
  float c = step(z, textureLod(map, uv - vec2(r, 0.0), 0.0).r);
  float d = step(z, textureLod(map, uv + vec2(0.0, r), 0.0).r);
  float e = step(z, textureLod(map, uv - vec2(0.0, r), 0.0).r);
  if (a == b && a == c && a == d && a == e) return a;
  return shadowBox(map, uv, z, texel, w);
}

/**
 * How much of the sun reaches a point according to one shadow map; cover is how far inside the map the point is (0 outside, 1 well inside).
 * scale is the size of a texel of this map against the first one's: the offsets that keep a surface from shading itself grow with it.
 */
float cascadeLit(sampler2D map, mat4 sm, vec3 wp, vec3 n, float slope, float scale, float texel, float w, vec2 jitter, out float cover) {
  vec3 p = wp + n * ((0.035 + 0.07 * slope) * scale);
  vec3 c = (sm * vec4(p, 1.0)).xyz * 0.5 + 0.5;
  c.xy += jitter * texel;
  cover = c.z > 1.0 ? 0.0 : smoothstep(0.0, 0.1, min(min(c.x, 1.0 - c.x), min(c.y, 1.0 - c.y)));
  if (cover <= 0.0) return 1.0;
  float bias = (0.05 + 0.1 * slope) * scale / uShadowRange;
  return shadowPcf(map, c.xy, c.z - bias, texel, w);
}

/** 1 in the sun, 0 in the shadow of terrain, soft at the edges: the fine map near the player, melting into the wide one farther out. */
float sunShadow(vec3 wp, vec3 n, float ndl) {
  float slope = 1.0 - clamp(ndl, 0.0, 1.0);
  // Dappled light: the lookup drifts a fraction of a texel with the breeze, so the sunlight that falls through leaves
  // glimmers and moves instead of sitting still.
  vec2 jit = vec2(sin(uTime * 1.3 + wp.x * 0.9 + wp.z * 0.6), cos(uTime * 1.1 + wp.z * 0.8 - wp.x * 0.5)) * 0.9 * uWind;
  // What moves casts a shadow of its own, over the ground's.
  float ent = 1.0;
  if (uShadowOnE > 0.5) {
    float coverE;
    float le = cascadeLit(uShadowMapE, uShadowMatE, wp, n, slope, 1.0, uShadowTexelE, 3.0, vec2(0.0), coverE);
    ent = mix(1.0, le, coverE);
  }
  float cover1;
  float l1 = cascadeLit(uShadowMap, uShadowMat, wp, n, slope, 1.0, uShadowTexel, 3.0, jit, cover1);
  // The newest drawing of the map fades in over the one before it, so the shadows move with the sun without a jump or a flicker.
  // (Evenly, not eased: one fade follows the other, and an eased one would make the shadows go and stop, go and stop.)
  if (uShadowBlend < 1.0) {
    float coverB;
    float lb = cascadeLit(uShadowMapB, uShadowMatB, wp, n, slope, 1.0, uShadowTexel, 3.0, jit, coverB);
    l1 = mix(lb, l1, uShadowBlend);
    cover1 = mix(coverB, cover1, uShadowBlend);
  }
  if (cover1 >= 1.0 || uShadowOn2 < 0.5) return min(ent, mix(1.0, l1, cover1));
  float cover2;
  float l2 = cascadeLit(uShadowMap2, uShadowMat2, wp, n, slope, uShadowScale2, uShadowTexel2, 2.0, vec2(0.0), cover2);
  // The wide map fades in over its last drawing the same way.
  if (uShadowBlend2 < 1.0) {
    float coverC;
    float lc = cascadeLit(uShadowMap2B, uShadowMat2B, wp, n, slope, uShadowScale2, uShadowTexel2, 2.0, vec2(0.0), coverC);
    l2 = mix(lc, l2, uShadowBlend2);
    cover2 = mix(coverC, cover2, uShadowBlend2);
  }
  return min(ent, mix(mix(1.0, l2, cover2), l1, cover1));
}

void main() {
  float tile = floor(vTile + 0.5);
  if (tile >= FIRE0 && tile < FIRE0 + 4.0) tile = FIRE0 + mod(floor(uTime * 9.0), 4.0);
  float col = mod(tile, COLS);
  float row = floor(tile / COLS);
  vec2 f = clamp(fract(vUv), 0.0005, 0.9995);
  bool leaf = ${LEAF_TEST_FRAG};
  // Foliage never repeats: every block of leaves lays its tile down its own way (mirrored, and slid round by a whole number
  // of texels, which the tile allows as it wraps), and the colour drifts in slow clumps across the whole crown.
  float leafVar = 0.5;
  float leafHash = 0.0;
  if (leaf) {
    vec3 an = abs(normalize(cross(dFdx(vWorld), dFdy(vWorld))));
    vec3 cell = mix(floor(vWorld), floor(vWorld + 0.5), step(vec3(0.5), an));
    float hv = hash12(vec2(cell.x * 17.0 + cell.z * 31.0, cell.y * 13.0 + cell.z * 7.0) + 7.0);
    leafHash = hv;
    if (hv > 0.5) f.x = 1.0 - f.x;
    if (fract(hv * 7.31) > 0.5) f.y = 1.0 - f.y;
    vec2 slide = floor(vec2(fract(hv * 13.7), fract(hv * 29.3)) * 16.0) / 16.0;
    f = clamp(fract(f + slide), 0.0005, 0.9995);
    leafVar = vnoise3(vWorld * 0.42) * 0.6 + vnoise3(vWorld * vec3(1.1, 1.4, 1.1) + 11.0) * 0.4;
  }
  vec2 auv = vec2((col + f.x) / COLS, 1.0 - (row + 1.0 - f.y) / ROWS);

  // Mip-map level from the un-wrapped coordinates, capped at one texel per tile so tiles never bleed into each other.
  vec2 gx = dFdx(vUv) * vec2(1.0 / COLS, -1.0 / ROWS);
  vec2 gy = dFdy(vUv) * vec2(1.0 / COLS, -1.0 / ROWS);
  vec2 texSize = vec2(COLS, ROWS) * 16.0;
  // (Scaled down so textures stay crisp until they are really minified.)
  gx *= 0.55;
  gy *= 0.55;
  float foot = max(length(gx * texSize), length(gy * texSize));
  if (foot > 16.0) {
    gx *= 16.0 / foot;
    gy *= 16.0 / foot;
  }
  vec4 tex = textureGrad(map, auv, gx, gy);
  vec4 aux = textureGrad(uAux, auv, gx, gy);

  // The face's own orientation, from screen-space derivatives (always turned towards the viewer).
  vec3 toCam = cameraPosition - vWorld;
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, toCam) < 0.0) n = -n;
  float ndl = dot(n, uLightDir);

  if (tex.a < uAlphaTest) discard;

  if (vShell > 0.5) {
    // The fuzz around a crown: only scattered little groups of leaves are there, so the edge is feathery.
    vec2 tp = floor(f * 16.0);
    if (hash12(floor(tp * 0.5) * 1.7 + leafHash * 41.0 + 5.0) > 0.42 || hash12(tp * 0.9 + leafHash * 17.0) > 0.88) discard;
    tex.rgb *= 1.1;
  }

  // Biome tint: vLight.a is a palette index. Water is tinted whole; grass and leaves by the atlas's tint mask,
  // so the dirt part of a grass side stays brown.
  float ti = floor(vLight.a * 255.0 + 0.5);
  bool water = false;
  // Water also carries its depth class (0 one block .. 3 eight or more) above the palette index: see packWaterDepth.
  float wdepth = 0.0;
  if (ti > ${WATER_DEPTH_FLAG - 0.5}) {
    water = true;
    float k = ti - ${WATER_DEPTH_FLAG}.0;
    wdepth = floor(k / ${WATER_DEPTH_STRIDE}.0);
    ti = ${TINT_WATER_BASE}.0 + k - ${WATER_DEPTH_STRIDE}.0 * wdepth;
  }
  if (ti > 0.5) {
    vec3 pal = texture2D(uPalette, vec2((ti + 0.5) / 256.0, 0.5)).rgb;
    if (water) tex.rgb *= pal / uBaseWater;
    else tex.rgb = mix(tex.rgb, tex.rgb * pal / uBaseGrass, aux.r);
  }

  // Clumps of foliage: some lighter and yellower, some deep and cool, in patches of a block or two.
  if (leaf) tex.rgb *= mix(vec3(0.8, 0.9, 0.84), vec3(1.1, 1.06, 0.88), smoothstep(0.15, 0.85, leafVar));

  float alpha = tex.a;
  vec3 V = normalize(toCam);

  if (water) {
    // Waves, snapped to the texel grid so they read as pixels: three swells cross at different angles and speeds, each
    // bending the one before, so the surface rolls instead of repeating.
    float top = step(0.5, n.y);
    vec2 q = floor(vWorld.xz * 16.0) / 16.0;
    float tm = uTime;
    float w1 = sin(dot(q, vec2(1.7, 0.6)) + tm * 1.3 + sin(q.y * 1.1 + tm * 0.7) * 1.6);
    float w2 = sin(dot(q, vec2(-0.5, 2.3)) - tm * 1.7 + sin(q.x * 1.9 - tm * 0.9) * 1.4);
    float w3 = sin(dot(q, vec2(3.1, -2.2)) + tm * 2.6 + sin(q.x * 0.7 + q.y * 0.9 + tm * 0.5) * 2.0);
    float swell = (w1 + w2) * 0.5 + w3 * 0.25;

    // Depth colour: pale and see-through in the shallows, deep blue and nearly opaque in the deeps.
    float deep = smoothstep(0.0, 1.0, wdepth / 3.0);
    tex.rgb *= mix(vec3(1.2, 1.26, 1.04), vec3(0.5, 0.66, 0.9), deep);
    tex.rgb *= 1.0 + swell * 0.05 * top;
    tex.rgb += 0.07 * smoothstep(0.85, 1.2, swell) * top;

    vec3 nw = normalize(vec3((w1 * 0.06 + w3 * 0.03) * top, 1.0, (w2 * 0.06 - w3 * 0.03) * top));
    nw = mix(n, nw, top);
    float fres = pow(1.0 - clamp(dot(V, nw), 0.0, 1.0), 3.0);
    tex.rgb = mix(tex.rgb, uSkyReflect, fres * 0.6);
    alpha = mix(alpha * mix(0.62, 0.95, sqrt(deep)), 0.98, fres);

    // Soft shores: where the water is one block deep, frothy flecks drift in and out over the sand.
    float shallow = (1.0 - step(0.5, wdepth)) * top;
    float fp = sin(q.x * 3.1 + tm * 0.9 + sin(q.y * 2.3 + tm * 0.6) * 1.5) * sin(q.y * 2.7 - tm * 0.7 + sin(q.x * 1.7 - tm * 0.4) * 1.2);
    float foam = smoothstep(0.38, 0.8, fp) * shallow;
    tex.rgb = mix(tex.rgb, vec3(1.0), foam * 0.6);
    alpha = mix(alpha, 0.95, foam);

    // Glints: a hard shine where the waves mirror the sun, and pixel flecks that twinkle in its path.
    vec3 R = reflect(-V, nw);
    float sp = max(dot(R, uLightDir), 0.0);
    tex.rgb += uSun * pow(sp, 140.0) * 6.0 * uGlint * top;
    float tw = hash12(q * 7.0 + floor(tm * 4.0 + q.x));
    tex.rgb += uSun * step(0.94, tw) * pow(sp, 6.0) * 1.5 * uGlint * top;
  }

  if (tile == LAVA) {
    float h = hash12(floor(vWorld.xz * 8.0) + floor(vWorld.y * 8.0));
    tex.rgb *= 0.9 + 0.2 * sin(uTime * 1.6 + h * 6.2831) + 0.08 * sin(uTime * 3.1 + h * 17.0);
  }

  // ---- light ----
  float skyL = vLight.g;
  float open = smoothstep(0.8, 1.0, skyL);
  float sunTerm = 0.0;
  if (open > 0.01 && ndl > 0.0 && uSun.r > 0.001) {
    float sh = 1.0;
    if (uShadowOn > 0.5) sh = sunShadow(vWorld, n, ndl);
    // A low sun still floods the ground (golden hour), it only fades right at grazing angles.
    sunTerm = open * smoothstep(0.0, 0.3, ndl) * sh;
  }
  float sky = skyL * uDay;
  // Never pitch black: a sliver of light is left even with no sky at all.
  vec3 skyRGB = vec3(0.035) + 0.965 * pow(sky, 1.45) * (uAmbient + uSun * sunTerm);

  // Torch and glowstone light: deep orange where it is faint, creamy where it is strong, with a lively flicker.
  float blk = vLight.b;
  float flick = 1.0 + 0.045 * sin(uTime * 8.0 + dot(floor(vWorld), vec3(1.7, 2.3, 3.1))) * smoothstep(0.05, 0.9, blk);
  vec3 torch = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.88, 0.7), clamp(blk * 1.1, 0.0, 1.0));
  // Near a soul lantern the same baked light is blue: deep blue where it is faint, icy white-blue where it is strong.
  float soulW = 0.0;
  for (int i = 0; i < 6; i++) {
    if (uSoul[i].w > 0.0) soulW = max(soulW, clamp(1.0 - length(uSoul[i].xyz - vWorld) / uSoul[i].w, 0.0, 1.0));
  }
  soulW = smoothstep(0.1, 0.75, soulW);
  torch = mix(torch, mix(vec3(0.1, 0.36, 1.0), vec3(0.6, 0.86, 1.0), clamp(blk * 1.1, 0.0, 1.0)), soulW);
  vec3 blkRGB = pow(blk, 1.45) * flick * torch;
  if (uHeldRange > 0.0) {
    vec3 hd = uHeldPos - vWorld;
    float hl = length(hd);
    float reach = clamp(1.0 - hl / uHeldRange, 0.0, 1.0);
    // Faces turned towards the flame take most of it; the ones turned away still get a share (the light bounces).
    float facing = 0.4 + 0.6 * max(dot(n, hd / max(hl, 0.001)), 0.0);
    float held = reach * reach * facing * (1.0 + 0.05 * sin(uTime * 8.3 + 1.7));
    blkRGB += uHeldColor * held;
  }
  vec3 L = max(skyRGB, blkRGB) + 0.3 * min(skyRGB, blkRGB);
  L = mix(L, vec3(1.15), aux.g);

  // Foliage keeps more of its baked shade: the creases between clumps and the underside of a crown are deep.
  vec3 rgb = tex.rgb * (leaf ? pow(vLight.r, 1.3) : vLight.r) * L;
  // Lit ground glows: sunlit colour is pushed towards richer saturation while the shade stays cool and calm.
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(lum), rgb, 1.0 + 0.3 * sunTerm * smoothstep(0.0, 0.12, uSun.r));

  // ---- fog: the colour of the sky in this direction, so far hills melt into it ----
  float fog = fogAmount(vDepth, vWorld.y);
  // Golden haze: light scatters in the air towards the sun, so far land on that side melts into warm gold.
  float scat = pow(max(dot(-V, uSunDir), 0.0), 5.0);
  rgb += uGlow * scat * smoothstep(uFogNear * 0.25, uFogFar, vDepth) * 0.55 * (1.0 - fog);
  rgb = mix(rgb, skyAt(-V), fog);
  gl_FragColor = vec4(rgb, alpha * uOpacity);
  #include <colorspace_fragment>
}
`;

const depthVertex = /* glsl */ `
attribute float aTile;
varying vec2 vUv;
varying float vTile;
void main() {
  vUv = uv;
  float fuzz = step(1000.0, aTile);
  vTile = aTile - 1024.0 * fuzz;
  gl_Position = fuzz > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const depthFragment = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float vTile;
const float COLS = ${ATLAS_COLS}.0;
const float ROWS = ${ATLAS_ROWS}.0;
void main() {
  float tile = floor(vTile + 0.5);
  vec2 f = clamp(fract(vUv), 0.0005, 0.9995);
  vec2 auv = vec2((mod(tile, COLS) + f.x) / COLS, 1.0 - (floor(tile / COLS) + 1.0 - f.y) / ROWS);
  if (textureLod(map, auv, 0.0).a < 0.5) discard;
  gl_FragColor = vec4(1.0);
}
`;

/** What the sky tells the terrain each frame (all colours linear). */
export interface ChunkLighting {
  /** Fill light from the sky in the shade (cool by day, blue at night). */
  ambient: THREE.Color;
  /** Direct sunlight added on faces the sun reaches (black when the sun is down or it rains). */
  sun: THREE.Color;
  /** Unit vector towards the sun. */
  sunDir: THREE.Vector3;
  /** Unit vector towards the light that is actually shining: the sun by day, the moon at night. */
  lightDir: THREE.Vector3;
  /** Colour fog takes on towards the sun. */
  glow: THREE.Color;
  /** The sky colour water mirrors. */
  skyReflect: THREE.Color;
  /** 0..1, how bright the sun glints on water. */
  glint: number;
  /** 0..1 strength of the breeze in plants and leaves. */
  wind: number;
}

export interface ChunkMaterials {
  opaque: THREE.ShaderMaterial;
  translucent: THREE.ShaderMaterial;
  /** Renders the opaque terrain's depth for the sun's shadow map (alpha-tested like the real thing). */
  depth: THREE.ShaderMaterial;
  setDay(v: number): void;
  /** Seconds, for the flicker of fire. */
  setTime(v: number): void;
  /** `zenith` is the colour overhead that the fog fades into when looking up (the sky dome's top); flat fog without it. */
  setFog(color: THREE.Color, near: number, far: number, zenith?: THREE.Color): void;
  /**
   * With multisampling on, cut-outs (leaves, grass) fade out by coverage instead of a hard test: soft edges up close and
   * no sparkle in the distance, where the mip-mapped alpha is a fraction.
   */
  setMultisampled(on: boolean): void;
  setLighting(l: ChunkLighting): void;
  /** Hand the sun's shadow map to the terrain shader, or pass null to switch shadows off. */
  setShadow(map: THREE.Texture | null, matrix: THREE.Matrix4, texel: number, range: number): void;
  /** The drawing of the first map before the newest one, which the newest is fading in over (blend 0..1 = how far in it is), or null for none. */
  setShadowBefore(map: THREE.Texture | null, matrix: THREE.Matrix4, blend: number): void;
  /** The coarser, wider second shadow map (scale: how many times larger its texel is than the first one's), or null for none. */
  setShadowFar(map: THREE.Texture | null, matrix: THREE.Matrix4, texel: number, scale: number): void;
  /** The drawing of the wide map before the newest one, like `setShadowBefore`. */
  setShadowFarBefore(map: THREE.Texture | null, matrix: THREE.Matrix4, blend: number): void;
  /** The small map of what moves (figures, mobs, vehicles), drawn from the same sun as the first one, or null for none. */
  setShadowEntities(map: THREE.Texture | null, matrix: THREE.Matrix4, texel: number): void;
  /** The light of a lantern in the player's hand: a point in the world, a colour and a reach in blocks (range 0 puts it out). */
  setHeldLight(pos: THREE.Vector3, color: THREE.Color, range: number): void;
  /** The soul lantern slots the light shader tints blue around (fill them, e.g. with TorchGlow.soulLights). */
  readonly soulLights: THREE.Vector4[];
  dispose(): void;
}

/** A 256 x 1 texture of the biome colours (sRGB, so the shader gets them in linear light like the atlas). */
function makePalette(): THREE.DataTexture {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = paletteColor(i);
    data.set([Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255], i * 4);
  }
  const t = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const linear = (c: readonly number[]): THREE.Vector3 => {
  const col = new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
  return new THREE.Vector3(col.r, col.g, col.b);
};

export function createChunkMaterials(atlas: Atlas): ChunkMaterials {
  const palette = makePalette();
  const noShadow = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  noShadow.needsUpdate = true;
  const shared = {
    map: { value: atlas.chunkColor },
    uAux: { value: atlas.chunkAux },
    uPalette: { value: palette },
    uBaseGrass: { value: linear(GRASS_BASE) },
    uBaseWater: { value: linear(WATER_BASE) },
    uDay: { value: 1 },
    uTime: { value: 0 },
    uWind: { value: 1 },
    uFogColor: { value: new THREE.Color(0x8fc4ff) },
    uFogZenith: { value: new THREE.Color(0x3a76d6) },
    uFogNear: { value: 60 },
    uFogFar: { value: 120 },
    uAmbient: { value: new THREE.Color(0.54, 0.6, 0.75) },
    uSun: { value: new THREE.Color(0.5, 0.45, 0.31) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uSkyReflect: { value: new THREE.Color(0x8fc4ff) },
    uGlint: { value: 0 },
    uShadowMap: { value: noShadow as THREE.Texture },
    uShadowMat: { value: new THREE.Matrix4() },
    uShadowOn: { value: 0 },
    uShadowTexel: { value: 1 / 2048 },
    uShadowRange: { value: 400 },
    uShadowMapB: { value: noShadow as THREE.Texture },
    uShadowMatB: { value: new THREE.Matrix4() },
    uShadowBlend: { value: 1 },
    uShadowMap2: { value: noShadow as THREE.Texture },
    uShadowMat2: { value: new THREE.Matrix4() },
    uShadowOn2: { value: 0 },
    uShadowTexel2: { value: 1 / 2048 },
    uShadowScale2: { value: 4 },
    uShadowMap2B: { value: noShadow as THREE.Texture },
    uShadowMat2B: { value: new THREE.Matrix4() },
    uShadowBlend2: { value: 1 },
    uShadowMapE: { value: noShadow as THREE.Texture },
    uShadowMatE: { value: new THREE.Matrix4() },
    uShadowOnE: { value: 0 },
    uShadowTexelE: { value: 1 / 1024 },
    uHeldPos: { value: new THREE.Vector3() },
    uHeldColor: { value: new THREE.Vector3(1, 0.7, 0.4) },
    uHeldRange: { value: 0 },
    uSoul: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };

  const opaque = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { ...shared, uAlphaTest: { value: 0.5 }, uOpacity: { value: 1 } },
  });

  const translucent = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared, uAlphaTest: { value: 0.02 }, uOpacity: { value: 0.95 } },
  });

  const depth = new THREE.ShaderMaterial({
    vertexShader: depthVertex,
    fragmentShader: depthFragment,
    side: THREE.DoubleSide,
    uniforms: { map: { value: atlas.chunkColor } },
  });

  return {
    opaque,
    translucent,
    depth,
    setDay(v) {
      shared.uDay.value = v;
    },
    setTime(v) {
      shared.uTime.value = v;
    },
    setFog(color, near, far, zenith = color) {
      shared.uFogColor.value.copy(color);
      shared.uFogZenith.value.copy(zenith);
      shared.uFogNear.value = near;
      shared.uFogFar.value = far;
    },
    setMultisampled(on) {
      opaque.alphaToCoverage = on;
      opaque.uniforms.uAlphaTest.value = on ? 0.02 : 0.5;
    },
    setLighting(l) {
      shared.uAmbient.value.copy(l.ambient);
      shared.uSun.value.copy(l.sun);
      shared.uSunDir.value.copy(l.sunDir);
      shared.uLightDir.value.copy(l.lightDir);
      shared.uGlow.value.copy(l.glow);
      shared.uSkyReflect.value.copy(l.skyReflect);
      shared.uGlint.value = l.glint;
      shared.uWind.value = l.wind;
    },
    setShadow(map, matrix, texel, range) {
      shared.uShadowOn.value = map ? 1 : 0;
      shared.uShadowMap.value = map ?? noShadow;
      shared.uShadowMat.value.copy(matrix);
      shared.uShadowTexel.value = texel;
      shared.uShadowRange.value = range;
    },
    setShadowBefore(map, matrix, blend) {
      shared.uShadowMapB.value = map ?? noShadow;
      shared.uShadowMatB.value.copy(matrix);
      shared.uShadowBlend.value = map ? blend : 1;
    },
    setShadowFar(map, matrix, texel, scale) {
      shared.uShadowOn2.value = map ? 1 : 0;
      shared.uShadowMap2.value = map ?? noShadow;
      shared.uShadowMat2.value.copy(matrix);
      shared.uShadowTexel2.value = texel;
      shared.uShadowScale2.value = scale;
    },
    setShadowFarBefore(map, matrix, blend) {
      shared.uShadowMap2B.value = map ?? noShadow;
      shared.uShadowMat2B.value.copy(matrix);
      shared.uShadowBlend2.value = map ? blend : 1;
    },
    setShadowEntities(map, matrix, texel) {
      shared.uShadowOnE.value = map ? 1 : 0;
      shared.uShadowMapE.value = map ?? noShadow;
      shared.uShadowMatE.value.copy(matrix);
      shared.uShadowTexelE.value = texel;
    },
    soulLights: shared.uSoul.value as THREE.Vector4[],
    setHeldLight(pos, color, range) {
      shared.uHeldPos.value.copy(pos);
      shared.uHeldColor.value.set(color.r, color.g, color.b);
      shared.uHeldRange.value = range;
    },
    dispose() {
      palette.dispose();
      noShadow.dispose();
      opaque.dispose();
      translucent.dispose();
      depth.dispose();
    },
  };
}
