import * as THREE from 'three';
import { EYE_COLORS, outfitById, outfitOfCode, HAIR_COLORS, PANTS_COLORS, SHIRT_COLORS, SKIN_TONES, lookCode, lookOfCode, type CharacterLook } from '@solrift/shared';
import type { Palette } from './character';

/** The colours and hair of a chosen look, ready for the character model. */
export function paletteOfLook(look: CharacterLook, outfitId: string | null = null): Palette {
  const outfit = outfitById(outfitId);
  return {
    shirt: new THREE.Color(outfit ? outfit.shirt : SHIRT_COLORS[look.shirt]),
    pants: new THREE.Color(outfit ? outfit.pants : PANTS_COLORS[look.pants]),
    ...(outfit ? { trim: new THREE.Color(outfit.trim), outfit } : {}),
    skin: new THREE.Color(SKIN_TONES[look.skin]),
    hair: new THREE.Color(HAIR_COLORS[look.hair]),
    eyes: new THREE.Color(EYE_COLORS[look.eyes]),
    style: look.style,
    // Fabric weave and hair strands differ a little from player to player.
    seed: lookCode(look) & 0xffff,
  };
}

/** The palette of a look code, wearing the outfit in it (a worn code, see outfits.ts) if there is one. */
export const paletteOfCode = (code: unknown): Palette => paletteOfLook(lookOfCode(code), outfitOfCode(code)?.id ?? null);
