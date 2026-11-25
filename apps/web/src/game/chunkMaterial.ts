import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, DYE_NAMES, GRASS_BASE, WATER_BASE, paletteColor, TINT_WATER_BASE, WATER_DEPTH_FLAG, WATER_DEPTH_STRIDE, tileIndex } from '@solrift/shared';
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

import { LEAF_TILES, FIELD_HERO, FIELD_TILES, HERO_COLS, HERO_PX, HERO_ROWS, HERO_TILES, ORE_HERO, SEAMLESS_HERO, heroSlot } from './heroTiles';

const tiles = (...names: string[]): string => names.map((n) => `t == ${tileIndex(n)}.0`).join(' || ');
const LEAF_TEST = tiles(...LEAF_TILES);
/** The cube-by-cube look of the blocks (creases, lip, grain, see the fragment shader): on, unless the address has ?blocklook=0 (to compare). */
const BLOCK_LOOK = typeof location !== 'undefined' && new URLSearchParams(location.search).get('blocklook') === '0' ? 0 : 1;
const LEAF_TEST_FRAG = LEAF_TEST.replaceAll('t ==', 'tile ==');
const PLANT_TEST = tiles('tall_grass', 'rose', 'dandelion', 'sapling', 'birch_sapling', 'spruce_sapling', 'acacia_sapling', 'jungle_sapling', 'dark_oak_sapling', 'cherry_sapling', 'pale_oak_sapling', 'mangrove_propagule', 'azalea', 'flowering_azalea', 'fern', 'tulip_red', 'tulip_orange', 'tulip_white', 'tulip_pink', 'oxeye_daisy', 'cornflower', 'allium', 'azure_bluet', 'blue_orchid', 'sugar_cane', 'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3', 'candle', ...DYE_NAMES.map((n) => `candle_${n}`), ...DYE_NAMES.map((n) => `banner_${n}`));
const PLANT_TEST_FRAG = PLANT_TEST.replaceAll('t ==', 'tile ==');
/** Plants that do not sway (a mushroom, a dead bush, a berry bush) but are as little a cube as the others: the cube-by-cube look leaves them alone. */
const STILL_PLANT_FRAG = tiles('dead_bush', 'brown_mushroom', 'red_mushroom', 'sweet_berry_0', 'sweet_berry_1', 'sweet_berry_2', 'sweet_berry_3').replaceAll('t ==', 'tile ==');

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

/** The sky for a mirror of rippled water: without the tight glow round the sun, which the ripples would break into flickering dashes. */
vec3 skyAtSoft(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 col = mix(uFogColor, uFogZenith, pow(h, 0.5));
  float s = max(dot(d, uSunDir), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.55, h);
  return col + uGlow * pow(s, 3.0) * 0.3 * (0.35 + 0.65 * low);
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
varying float vExtra;

void main() {
  vUv = uv;
  // The tile number also carries flags (see the mesher): water's shore sides, or how deep the water over a floor is (every 4096),
  // and the leaves' outer fuzz (1024).
  float ex = floor(aTile / 4096.0 + 0.001);
  float at = aTile - ex * 4096.0;
  vExtra = ex;
  float fuzz = step(1000.0, at);
  vShell = fuzz;
  vTile = at - 1024.0 * fuzz;
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
uniform sampler2D uHero;
uniform sampler2D uHeroAux;
uniform float uDay;
uniform float uTime;
${FOG_GLSL}
uniform float uAlphaTest;
uniform float uOpacity;
uniform float uInWater;
uniform sampler2D uPalette;
uniform vec3 uBaseGrass;
uniform vec3 uBaseWater;
uniform vec3 uAmbient;
uniform vec3 uSun;
uniform vec3 uLightDir;
uniform float uWind;
uniform float uBlockLook;
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
// Torches and lanterns in people's hands (xyz, reach; reach 0 = unused). The first is yours, the rest are whoever is near.
uniform vec4 uHeld[4];
uniform vec3 uHeldCol[4];
// The nearest soul lanterns standing about (x, y, z, reach; reach 0 = unused): the light near them is blue, not warm.
uniform vec4 uSoul[6];

varying vec2 vUv;
varying float vTile;
varying float vShell;
varying vec4 vLight;
varying float vDepth;
varying vec3 vWorld;
varying float vExtra;

const float COLS = ${ATLAS_COLS}.0;
const float ROWS = ${ATLAS_ROWS}.0;
// Fire is four tiles in a row; every flame shows the same frame, a few times a second.
const float FIRE0 = ${tileIndex('fire_0')}.0;
const float FLAME0 = ${tileIndex('torch_flame_0')}.0;
// The hero tiles (heroTiles.ts) are drawn from a texture of their own, side by side: HK of them, HPX pixels each.
const float HCOLS = ${HERO_COLS}.0;
const float HROWS = ${HERO_ROWS}.0;
const float HPX = ${HERO_PX}.0;
/** Where in the grid of hero pictures (see atlas.ts) the picture numbered idx is, at f (0..1 across it, f.y up). */
vec2 heroUv(float idx, vec2 f) {
  return vec2((mod(idx, HCOLS) + f.x) / HCOLS, (HROWS - 1.0 - floor(idx / HCOLS) + f.y) / HROWS);
}
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
/** A hash that stays clean far from the origin (the sin hash above bands into stripes at a few hundred blocks): for the water. */
float whash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
/** Smooth noise like vnoise3, on the clean hash. */
float wnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 u = smoothstep(0.0, 1.0, fract(p));
  vec2 zo = vec2(37.0, 17.0) * i.z;
  float a = mix(mix(whash(i.xy + zo), whash(i.xy + vec2(1.0, 0.0) + zo), u.x), mix(whash(i.xy + vec2(0.0, 1.0) + zo), whash(i.xy + vec2(1.0, 1.0) + zo), u.x), u.y);
  vec2 zp = zo + vec2(37.0, 17.0);
  float b = mix(mix(whash(i.xy + zp), whash(i.xy + vec2(1.0, 0.0) + zp), u.x), mix(whash(i.xy + vec2(0.0, 1.0) + zp), whash(i.xy + vec2(1.0, 1.0) + zp), u.x), u.y);
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

/** One swell of the water: its direction, how tight and how fast it runs, how high it stands; adds to the slope and the height. */
void swell(vec2 p, vec2 d, float f, float s, float a, float t, inout vec2 g, inout float h) {
  float ph = dot(p, d) * f + t * s;
  g += d * (cos(ph) * a * f);
  h += sin(ph) * a;
}

/** The slope of the water's surface at a point (and its height in h): five swells, bent by slower drifts. */
vec2 waterSlope(vec2 p, float t, out float h) {
  p += vec2(sin(p.y * 0.35 + t * 0.4), cos(p.x * 0.31 - t * 0.35)) * 0.9;
  vec2 g = vec2(0.0);
  h = 0.0;
  swell(p, vec2(0.80, 0.60), 1.3, 1.1, 0.50, t, g, h);
  swell(p, vec2(-0.60, 0.80), 2.1, 1.5, 0.35, t, g, h);
  swell(p, vec2(0.30, -0.95), 3.7, 2.0, 0.14, t, g, h);
  swell(p, vec2(-0.90, -0.40), 5.9, 2.7, 0.06, t, g, h);
  swell(p, vec2(0.95, 0.30), 9.0, 3.4, 0.02, t, g, h);
  return g;
}

/** The net of bright lines that sunlight makes on the bottom through rippling water (tiles every 1 / 0.12 blocks). */
float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * 6.28318530718, 6.28318530718) - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / 0.005), p.y / (cos(i.y + t) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

void main() {
  float tile = floor(vTile + 0.5);
  if (tile >= FIRE0 && tile < FIRE0 + 4.0) tile = FIRE0 + mod(floor(uTime * 9.0), 4.0);
  if (tile >= FLAME0 && tile < FLAME0 + 4.0) tile = FLAME0 + mod(floor(uTime * 9.0), 4.0);
  float col = mod(tile, COLS);
  float row = floor(tile / COLS);
  vec2 f = clamp(fract(vUv), 0.0005, 0.9995);
  bool leaf = ${LEAF_TEST_FRAG};
  float leafVar = 0.5;
  float leafHash = 0.0;
  vec2 leafUv = vec2(0.0);
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
  // The hero tiles: the same, from their own texture (the footprint is worked out outside the branch, as derivatives must be).
  // The face's own orientation, from screen-space derivatives (always turned towards the viewer).
  vec3 toCam = cameraPosition - vWorld;
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, toCam) < 0.0) n = -n;
  // The block this face belongs to: a point a little behind the face (a face lies exactly on a whole number, where a floor would flip from pixel to pixel).
  vec3 hcell = floor(vWorld - n * 0.137);
  float hero = -1.0;
${HERO_TILES.map((n) => {
  const { first, count } = heroSlot(n);
  // (A tile with several pictures shows a different one in every block, picked by where the block stands.)
  return `  if (tile == ${tileIndex(n)}.0) hero = ${first}.0${count > 1 && !FIELD_TILES.has(n) ? ` + min(floor(whash(vec2(hcell.x + (abs(n.y) > 0.5 ? 0.0 : 17.0 * hcell.y), hcell.z) + 5.0) * ${count}.0), ${count - 1}.0)` : ''};`;
}).join('\n')}
  // Foliage and the fields (stone, sand, snow...) are one carpet: the picture (two blocks wide) is laid over the world, not block by
  // block, so there are no seams between blocks; it is drifted by a slow warp so it never visibly repeats. A field has two pictures,
  // and the world drifts between them. Foliage colour wanders in clumps across the whole crown.
  bool field = hero >= ${FIELD_HERO.first}.0 && hero < ${FIELD_HERO.end}.0;
  float pic = 1.0;
  float hmix = 0.0;
  if (leaf || field) {
    pic = 0.5;
    vec3 an = abs(n);
    leafUv = an.y > 0.5 ? vWorld.xz : (an.x > 0.5 ? vWorld.zy : vWorld.xy);
    leafHash = an.y > 0.5 ? 0.0 : (an.x > 0.5 ? 0.31 : 0.67);
    vec2 warp = vec2(wnoise3(vWorld * 0.33 + 3.0), wnoise3(vWorld * 0.33 + 19.0)) - 0.5;
    f = clamp(fract((leafUv + warp * (leaf ? 1.1 : 0.9)) * 0.5), 0.0005, 0.9995);
    if (leaf) leafVar = vnoise3(vWorld * 0.42) * 0.6 + vnoise3(vWorld * vec3(1.1, 1.4, 1.1) + 11.0) * 0.4;
    else hmix = smoothstep(0.34, 0.66, wnoise3(vWorld * 0.19 + vec3(5.0, 1.0, 9.0)) * 0.65 + wnoise3(vWorld * 0.43 + vec3(2.0, 8.0, 4.0)) * 0.35);
  }
  vec2 hx = dFdx(vUv) * vec2(1.0 / HCOLS, 1.0 / HROWS) * 0.55 * pic;
  vec2 hy = dFdy(vUv) * vec2(1.0 / HCOLS, 1.0 / HROWS) * 0.55 * pic;
  float hfoot = max(length(hx * vec2(HCOLS * HPX, HROWS * HPX)), length(hy * vec2(HCOLS * HPX, HROWS * HPX)));
  if (hfoot > HPX) {
    hx *= HPX / hfoot;
    hy *= HPX / hfoot;
  }
  vec4 tex;
  vec4 aux;
  if (hero > -0.5) {
    vec2 huv = heroUv(hero, f);
    tex = textureGrad(uHero, huv, hx, hy);
    aux = textureGrad(uHeroAux, huv, hx, hy);
    if (field) {
      vec2 huv2 = heroUv(hero + 1.0, f);
      tex = mix(tex, textureGrad(uHero, huv2, hx, hy), hmix);
      aux = mix(aux, textureGrad(uHeroAux, huv2, hx, hy), hmix);
    }
  } else {
    tex = textureGrad(map, auv, gx, gy);
    aux = textureGrad(uAux, auv, gx, gy);
  }
  // An ore is only the ore: where its picture says "stone" (aux.a below the ore's 1.0) the stone of the world is shown, the same
  // field the plain stone blocks show, so the ore sits in the rock with no frame, and in the shade the picture gives it.
  if (hero >= ${ORE_HERO.first}.0 && hero < ${ORE_HERO.end}.0) {
    vec3 oan = abs(n);
    vec2 oUv = oan.y > 0.5 ? vWorld.xz : (oan.x > 0.5 ? vWorld.zy : vWorld.xy);
    vec2 oWarp = vec2(wnoise3(vWorld * 0.33 + 3.0), wnoise3(vWorld * 0.33 + 19.0)) - 0.5;
    vec2 oF = clamp(fract((oUv + oWarp * 0.9) * 0.5), 0.0005, 0.9995);
    float oMix = smoothstep(0.34, 0.66, wnoise3(vWorld * 0.19 + vec3(5.0, 1.0, 9.0)) * 0.65 + wnoise3(vWorld * 0.43 + vec3(2.0, 8.0, 4.0)) * 0.35);
    vec2 ohx = hx * 0.5;
    vec2 ohy = hy * 0.5;
    vec4 rock = mix(textureGrad(uHero, heroUv(${heroSlot('stone').first}.0, oF), ohx, ohy), textureGrad(uHero, heroUv(${heroSlot('stone').first + 1}.0, oF), ohx, ohy), oMix);
    float inRock = 1.0 - smoothstep(0.52, 0.8, aux.a);
    tex.rgb = mix(tex.rgb, rock.rgb * min(1.0, aux.a * 2.0), inRock);
    tex.a = 1.0;
  }
  float ndl = dot(n, uLightDir);

  if (tex.a < uAlphaTest) discard;

  if (vShell > 0.5) {
    // The fuzz around a crown: only scattered little groups of leaves are there, so the edge is feathery.
    vec2 tp = floor(leafUv * 16.0);
    if (whash(floor(tp * 0.5) * 1.7 + leafHash * 41.0 + 5.0) > 0.42 || whash(tp * 0.9 + leafHash * 17.0) > 0.88) discard;
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
    // Under the surface the water is the fog, not a stack of block faces. The sheet also goes the
    // moment the camera slips under it: the eyes are often still in the air cell above the water.
    if (uInWater > 0.5 || (abs(n.y) > 0.5 && cameraPosition.y < vWorld.y - 0.02)) discard;
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

  // ---- the look of a block ----
  // Every block is a little cube of its own: a dark crease where it meets the next, a lit lip along its top edge, and a grain laid over
  // the 16 pixels of the tile (twice as fine, new for every block), so a wall of stone reads as stones and not as one painted sheet.
  // It fades out where a block is only a few pixels wide (it would only shimmer), and leaves out water, glass, fire, lava, plants and leaves.
  if (uBlockLook > 0.0 && tex.a > 0.99 && !water && !leaf && vShell < 0.5 && aux.b < 0.5 && tile != LAVA && !(${PLANT_TEST_FRAG}) && !(${STILL_PLANT_FRAG}) && !(tile >= FIRE0 && tile < FIRE0 + 4.0) && !(tile >= FLAME0 && tile < FLAME0 + 4.0)) {
    float px = max(length(dFdx(vUv)), length(dFdy(vUv)));
    float near = (1.0 - smoothstep(0.05, 0.16, px)) * uBlockLook * (1.0 - aux.g);
    vec3 an2 = abs(n);
    vec3 cell = mix(floor(vWorld), floor(vWorld + 0.5), step(vec3(0.5), an2));
    float bh = whash(cell.xy * 1.7 + cell.z * 31.0 + 3.0);
    vec2 gcell = floor(f * 32.0);
    float gr = floor(whash(gcell + bh * 61.0 + cell.xz * 0.37) * 4.0) / 3.0 - 0.5;
    float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float crease = 1.0 - smoothstep(0.0, 0.1, e);
    float up = step(0.5, n.y);
    float lip = smoothstep(0.1, 0.14, e) * (1.0 - smoothstep(0.14, 0.22, e)) * up;
    float topEdge = smoothstep(0.86, 0.93, f.y) * (1.0 - up) * (1.0 - crease);
    // A lawn is one carpet: no creases, lip or per-block tint on a hero tile's top, so the blocks run into each other.
    // Stonework (the hero cobblestone) runs on across every face the same way.
    bool seam = hero >= ${SEAMLESS_HERO.first}.0 && hero < ${SEAMLESS_HERO.end}.0;
    float carpet = (hero > -0.5 && (up > 0.5 || seam)) ? 0.0 : 1.0;
    float look = 1.0 + gr * 0.34 * (hero > -0.5 ? 0.0 : 1.0) + (bh - 0.5) * 0.14 * carpet - 0.4 * crease * carpet + 0.1 * lip * carpet + 0.16 * topEdge * (seam ? 0.0 : 1.0);
    tex.rgb *= mix(1.0, look, near);
  }

  float alpha = tex.a;
  vec3 V = normalize(toCam);

  if (water) {
    float top = step(0.5, n.y);
    float tm = uTime;
    vec2 wp2 = vWorld.xz;
    // The pixels of the water texture are not wanted: the body of the water is one smooth colour (the biome's), so no square shows.
    vec3 palW = texture2D(uPalette, vec2((ti + 0.5) / 256.0, 0.5)).rgb;
    palW = mix(palW, vec3(dot(palW, vec3(0.3, 0.59, 0.11))), 0.28);
    tex.rgb = mix(tex.rgb, palW, 0.9);
    // Slow, wide patches of lighter and darker water, so a big sea is not one flat sheet.
    float blotch = wnoise3(vec3(wp2 * 0.045, tm * 0.04)) * 0.6 + wnoise3(vec3(wp2 * 0.13 + 7.0, tm * 0.07)) * 0.4;
    tex.rgb *= 0.9 + 0.2 * blotch;

    // Swells: a handful run different ways at different speeds, bent by slow drifts, so the surface rolls instead of repeating.
    // They are smooth (never cut along the blocks). Far away the small swells fade, so the sea does not shimmer.
    float wh;
    vec2 wg = waterSlope(wp2, tm, wh);
    float nearF = 1.0 - smoothstep(40.0, 190.0, vDepth);
    wg *= 0.3 + 0.7 * nearF;
    vec3 nw = normalize(vec3(-wg.x * 0.038, 1.0, -wg.y * 0.038));
    nw = mix(n, nw, top);

    // Where is the shore? The mesher says which sides of this block of water meet land (bits of vExtra).
    float edgeD = 9.0;
    if (top > 0.5) {
      vec2 cp = fract(vWorld.xz);
      float m = vExtra;
      if (mod(m, 2.0) > 0.5) edgeD = min(edgeD, cp.x);
      if (mod(floor(m / 2.0), 2.0) > 0.5) edgeD = min(edgeD, 1.0 - cp.x);
      if (mod(floor(m / 4.0), 2.0) > 0.5) edgeD = min(edgeD, cp.y);
      if (mod(floor(m / 8.0), 2.0) > 0.5) edgeD = min(edgeD, 1.0 - cp.y);
      // The line of the shore wanders, so it is not a ruler along the edge of the blocks.
      edgeD += (wnoise3(vec3(wp2 * 1.2, 0.0)) - 0.5) * 0.2;
    }

    // Depth colour: lighter and greener where it is shallow or by a shore, deep dark blue where it is deep. The steps between the
    // depth classes are kept small, so the blocks of the sea floor do not show through as squares.
    float deep = mix(0.9, 1.0, wdepth / 3.0);
    deep *= mix(0.7, 1.0, smoothstep(0.0, 0.6, edgeD));
    vec3 body = mix(vec3(0.46, 0.64, 0.68), vec3(0.12, 0.22, 0.38), deep);
    tex.rgb *= body;
    // A slight movement in the colour. It stays around the same brightness, so a dark pool is not painted lighter.
    float dap = wnoise3(vWorld * vec3(1.6, 2.2, 1.6) + vec3(tm * 0.25, -tm * 0.18, tm * 0.2));
    tex.rgb *= 0.94 + 0.12 * dap;
    // The light sinks into the swells: troughs a little darker, crests a little brighter.
    tex.rgb *= 1.0 + wh * 0.03 * top;

    // Sky on this water: the sun or the moon actually reaches the block. A torch is block light and does not make a sky.
    float skyReach = smoothstep(0.04, 0.4, vLight.g);

    // The sky in the mirror: a flat surface shows the sky only at a grazing look, a rippled one a little sooner.
    float cosT = clamp(dot(V, nw), 0.0, 1.0);
    float fres = clamp(0.04 + 0.96 * pow(1.0 - cosT, 4.0), 0.0, 1.0);
    vec3 R = reflect(-V, nw);
    R.y = abs(R.y);
    vec3 mirror = mix(uSkyReflect, skyAtSoft(normalize(R)), 0.75);
    tex.rgb = mix(tex.rgb, mirror * 0.8, fres * 0.55 * skyReach);
    // See-through everywhere, sea and cave the same: a side is a face of water, and the cave shows through it.
    alpha = mix(0.45, 0.62, deep);
    alpha = mix(alpha, 0.82, fres * skyReach);

    // (No foam line along the shore: any bright band there flickers and shows the edges of the blocks. The shore is only a lighter, greener shallow, see edgeD above.)

    // Glints: a hard shine where the swells mirror the sun or the moon.
    float sp = max(dot(R, uLightDir), 0.0);
    tex.rgb += uSun * (pow(sp, 40.0) * 1.0 + pow(sp, 14.0) * 0.1) * uGlint * top * skyReach;

    // From underneath, the surface is the bright ceiling of the sea: ripples, and the sun breaking through them.
    if (cameraPosition.y < vWorld.y && top > 0.5) {
      float up = clamp(-V.y, 0.0, 1.0);
      vec3 sunW = normalize(uLightDir);
      float sunUp = clamp(sunW.y, 0.0, 1.0);
      float broad = pow(max(dot(nw, sunW), 0.0), 3.0);
      float hit = pow(max(dot(nw, sunW), 0.0), 16.0);
      float gaze = pow(max(dot(normalize(-V), sunW), 0.0), 26.0);
      vec3 deepCol = vec3(0.04, 0.16, 0.32);
      vec3 litCol = vec3(0.62, 0.86, 1.0);
      vec3 col = mix(deepCol, litCol, (0.28 + 0.72 * up) * skyReach);
      col *= 0.78 + 0.4 * wh;
      col += uSun * broad * 0.55 * sunUp * uGlint * skyReach;
      col += vec3(1.0, 0.96, 0.82) * (hit * 1.5 + gaze * 1.15) * sunUp * uGlint * skyReach;
      tex.rgb = col;
      // Close under the surface, and looking up, the sky shows through. Deeper, the ceiling closes over.
      float below = max(vWorld.y - cameraPosition.y, 0.0);
      float close = exp(-max(below - 0.4, 0.0) / 7.0);
      alpha = mix(0.94, 0.38, close * up);
    }
    // (The material's own opacity is for glass and ice: the water's is what is set above.)
    alpha = min(alpha / max(uOpacity, 0.01), 1.0);
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
    // (Not on water: its surface lies a hair above the shore's blocks, so the map's depth tests flicker there in stripes.)
    if (uShadowOn > 0.5 && !water) sh = sunShadow(vWorld, n, ndl);
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
  for (int i = 0; i < 4; i++) {
    if (uHeld[i].w > 0.0) {
      vec3 hd = uHeld[i].xyz - vWorld;
      float hl = length(hd);
      float reach = clamp(1.0 - hl / uHeld[i].w, 0.0, 1.0);
      // Faces turned towards the flame take most of it; the ones turned away still get a share (the light bounces).
      float facing = 0.4 + 0.6 * max(dot(n, hd / max(hl, 0.001)), 0.0);
      float held = reach * reach * facing * (1.0 + 0.05 * sin(uTime * 8.3 + float(i) + 1.7));
      blkRGB += uHeldCol[i] * held;
    }
  }
  vec3 L = max(skyRGB, blkRGB) + 0.3 * min(skyRGB, blkRGB);
  L = mix(L, vec3(1.15), aux.g);

  // Foliage keeps more of its baked shade: the creases between clumps and the underside of a crown are deep.
  vec3 rgb = tex.rgb * (leaf ? pow(vLight.r, 1.3) : vLight.r) * L;
  // The bottom of a lake or the sea: sunlight through the ripples lays a moving net of bright lines on it, fading with depth
  // (vExtra is 1 + the depth class of the water over this face, see the mesher).
  if (!water && vExtra > 0.5 && vExtra < 4.5) {
    // The light under the surface is the blue of the water itself. The block keeps its own colour, only seen through that blue,
    // and the blue deepens as more water sits over it.
    float dep = clamp((vExtra - 1.0) / 3.0, 0.0, 1.0);
    rgb *= mix(vec3(0.62, 0.78, 0.96), vec3(0.32, 0.48, 0.72), dep);
    // Sunlight through the ripples: only where the sky reaches this block. A cave with no sun or moon stays dark.
    float cau = caustic(vWorld.xz * 0.16, uTime * 0.4);
    float sunHere = smoothstep(0.04, 0.4, vLight.g) * clamp(uGlint, 0.0, 1.0);
    rgb += vec3(0.62, 0.84, 1.08) * cau * sunHere * (1.0 - dep * 0.85) * max(n.y, 0.18) * 0.9;
  }
  // Glass stays clear face-on and picks up a cool reflection where you look along it.
  if (aux.b > 0.5) {
    float fres = pow(1.0 - clamp(abs(dot(V, n)), 0.0, 1.0), 1.7);
    rgb += vec3(0.42, 0.58, 0.72) * fres * L;
    alpha = mix(alpha, min(0.82, alpha + 0.38), fres);
  }
  // Lit ground glows: sunlit colour is pushed towards richer saturation while the shade stays cool and calm.
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(lum), rgb, 1.0 + 0.2 * uBlockLook + 0.3 * sunTerm * smoothstep(0.0, 0.12, uSun.r));

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
  float at = aTile - floor(aTile / 4096.0 + 0.001) * 4096.0;
  float fuzz = step(1000.0, at);
  vTile = at - 1024.0 * fuzz;
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

/** One carried torch or lantern: where it burns, its colour (0..1), and how far the light reaches in blocks. */
export interface HeldLightSpot {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  range: number;
}

export interface ChunkMaterials {
  opaque: THREE.ShaderMaterial;
  translucent: THREE.ShaderMaterial;
  /** Renders the opaque terrain's depth for the sun's shadow map (alpha-tested like the real thing). */
  depth: THREE.ShaderMaterial;
  setDay(v: number): void;
  /** Seconds, for the flicker of fire. */
  setTime(v: number): void;
  /** The camera is under water: the faces of the water blocks are not drawn. */
  setInWater(on: boolean): void;
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
  /** Torches and lanterns people are carrying. Up to four; a reach of 0 puts that one out. */
  setHeldLights(spots: readonly HeldLightSpot[]): void;
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
    uHero: { value: atlas.chunkHero },
    uHeroAux: { value: atlas.chunkHeroAux },
    uPalette: { value: palette },
    uBaseGrass: { value: linear(GRASS_BASE) },
    uBaseWater: { value: linear(WATER_BASE) },
    uDay: { value: 1 },
    uTime: { value: 0 },
    uInWater: { value: 0 },
    uWind: { value: 1 },
    uBlockLook: { value: BLOCK_LOOK },
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
    uHeld: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uHeldCol: { value: Array.from({ length: 4 }, () => new THREE.Vector3(1, 0.7, 0.4)) },
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
    // Writes depth (the mesher puts the water first in each chunk): what lies under the surface of the sea, a crystal or a block of ice,
    // then fails the depth test behind it instead of being drawn over it, whatever order the faces came in.
    depthWrite: true,
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
    setInWater(on: boolean) {
      shared.uInWater.value = on ? 1 : 0;
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
    setHeldLights(spots) {
      const pos = shared.uHeld.value as THREE.Vector4[];
      const col = shared.uHeldCol.value as THREE.Vector3[];
      for (let i = 0; i < 4; i++) {
        const s = spots[i];
        if (s && s.range > 0) {
          pos[i].set(s.x, s.y, s.z, s.range);
          col[i].set(s.r, s.g, s.b);
        } else pos[i].w = 0;
      }
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
