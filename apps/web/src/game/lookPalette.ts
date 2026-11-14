import * as THREE from 'three';
import { EYE_COLORS, HAIR_COLORS, PANTS_COLORS, SHIRT_COLORS, SKIN_TONES, lookCode, lookOfCode, type CharacterLook } from '@solrift/shared';
import type { Palette } from './character';

/** The colours and hair of a chosen look, ready for the character model. */
export function paletteOfLook(look: CharacterLook): Palette {
  return {
    shirt: new THREE.Color(SHIRT_COLORS[look.shirt]),
    pants: new THREE.Color(PANTS_COLORS[look.pants]),
    skin: new THREE.Color(SKIN_TONES[look.skin]),
    hair: new THREE.Color(HAIR_COLORS[look.hair]),
    eyes: new THREE.Color(EYE_COLORS[look.eyes]),
    style: look.style,
    // Fabric weave and hair strands differ a little from player to player.
    seed: lookCode(look) & 0xffff,
  };
}

export const paletteOfCode = (code: unknown): Palette => paletteOfLook(lookOfCode(code));
