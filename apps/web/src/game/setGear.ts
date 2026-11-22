import type { OutfitDef } from '@solrift/shared';
import { dressMageSet, MAGE_STYLE_IDS } from './mageSet';
import { dressRangerSet, RANGER_STYLE_IDS } from './rangerSet';
import { disposeSetKit, type SetCtx, type SetRig } from './setKit';
import { dressWarrior, WARRIOR_STYLE_IDS } from './warriorSet';

/**
 * The outfit sets: armor of a kind the game does not drop, in the manner of the glowing sets of MU Online, a different one for each class: plate for
 * the Warrior (`warriorSet.ts`), robes and magic for the Mage (`mageSet.ts`), leathers, cloaks and wings for the Ranger (`rangerSet.ts`). All are built
 * from blocks at the scale of the skin (see `mageGear.ts`) with what they share in `setKit.ts`: lights bright enough for the glow of the picture to pick up,
 * a halo, rings, sparks.
 *
 * What an outfit is for is how a hero looks, so a set takes the place of the armor the hero wears (it is a fashion: the armor still counts, it is only not
 * seen). The richer the tier, the more there is.
 */

export type { SetCtx, SetRig };

/** The sets each class knows how to dress (every outfit of the shared list has one: see its test). */
export const SET_STYLE_IDS: Readonly<Record<'warrior' | 'mage' | 'ranger', readonly string[]>> = { warrior: WARRIOR_STYLE_IDS, mage: MAGE_STYLE_IDS, ranger: RANGER_STYLE_IDS };

/** Dress the figure in the set of an outfit, in the style of its class. */
export function dressSet(ctx: SetCtx, def: OutfitDef): SetRig {
  switch (def.cls) {
    case 'mage':
      return dressMageSet(ctx, def);
    case 'ranger':
      return dressRangerSet(ctx, def);
    default:
      return dressWarrior(ctx, def);
  }
}

export const disposeSetGear = disposeSetKit;
