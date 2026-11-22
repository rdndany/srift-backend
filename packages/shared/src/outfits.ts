import { LOOK_COUNT, parseLookCode, lookCode, type CharacterLook } from './look';
import { OUTFITS, type OutfitDef } from './outfitData';

export * from './outfitData';

/**
 * Outfits: sets of armor for the hero that change how they look and nothing else, in the manner of the glowing sets of MU Online: plate with
 * horns, spikes and wings of blades, and a light of its own colour (a halo, a ring of runes, sparks). The picture of a set is made by the
 * client (see `setGear.ts` on the web side); what is shared here is which sets there are, what they cost by tier and the colours they are
 * made of. No outfit gives any stat, any item or any other advantage, and none is for sale for anything but $SOLRIFT: they are what the token
 * buys that shows. It takes the place of the armor the hero wears, in the eyes of others: the armor still counts, it is only not seen.
 *
 * Every class has its own eight (a Warrior's are plate, a Mage's robes, a Ranger's leathers and cloaks), and a hero wears only those of its class; a
 * wallet that plays several classes owns them for each. New sets go at the END of the list: the order is part of the wire number below.
 *
 * An outfit is a fixed entry of this list, so a client can only ever show one that exists. Each is also an ITEM (`outfitSetItemId`): the token shop
 * puts the one a wallet buys in its stash, and a hero wears it by putting it in the outfit slot of the inventory screen. The server reads what is in
 * that slot, so what a hero wears is only ever something it holds.
 *
 * On the wire an outfit is part of the number that already says what a player looks like (`look`): `worn = look + LOOK_COUNT * n`,
 * where `n` is 0 for no outfit and the 1-based place of the outfit in `OUTFITS` otherwise. Nothing that carries a look has to change,
 * everyone who sees a player sees their outfit, and `parseLookCode` (what a client may send, and what is saved with a character) still
 * only takes a plain look, so a client cannot make up an outfit.
 */


/** The perk a wallet owns an outfit by (see `wallet_perks`). */
export const outfitPerk = (id: string): string => `outfit:${id}`;

/** 0 for no outfit, else the 1-based place of the outfit in `OUTFITS`. */
const indexOf = (id: string | null | undefined): number => {
  const i = id ? OUTFITS.findIndex((o) => o.id === id) : -1;
  return i + 1;
};

/** Every look that has an outfit on has a code below this. */
export const WORN_COUNT = LOOK_COUNT * (OUTFITS.length + 1);

/** The number that says a hero with this look wears this outfit (a plain look code when `id` is null or not an outfit). */
export function wornCode(look: number | CharacterLook, id: string | null | undefined): number {
  const base = typeof look === 'number' ? look : lookCode(look);
  return base + LOOK_COUNT * indexOf(id);
}

/** A look or worn code the server made, checked: the number itself, or null when it is not one. */
export function parseWornCode(code: unknown): number | null {
  if (typeof code !== 'number' || !Number.isInteger(code) || code < 0 || code >= WORN_COUNT) return null;
  return parseLookCode(code % LOOK_COUNT) ? code : null;
}

/** The outfit in a worn code (null: none, or not one). */
export function outfitOfCode(code: unknown): OutfitDef | null {
  if (typeof code !== 'number' || !Number.isInteger(code) || code < LOOK_COUNT || code >= WORN_COUNT) return null;
  return OUTFITS[Math.floor(code / LOOK_COUNT) - 1] ?? null;
}

/** The plain look code of a worn code. */
export const plainCodeOf = (code: number): number => (Number.isInteger(code) && code >= 0 ? code % LOOK_COUNT : code);
