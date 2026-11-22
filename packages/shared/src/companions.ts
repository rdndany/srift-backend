/**
 * Companions, as in MU Online: a little creature that follows you, made from the things you gather. There are two: an imp of embers that makes
 * your blows hit harder, and a seraph of the dawn that softens the blows you take. A companion is an ITEM (`companionItemId`): it is crafted
 * (see crafting.ts: its parts are crafted too), carried, kept in the Stash and traded like any item, and it follows you while it is in the
 * companion slot of the inventory screen. Plain data with nothing imported, so the items table can have an item for each.
 *
 * What it gives is small on purpose (a tenth), so that it is a good thing to have and never the thing that decides a fight.
 */

export type CompanionId = 'cinder-imp' | 'dawn-seraph';

/** What a companion gives: `might` is a share more damage dealt, `ward` a share less damage taken (0.1 is a tenth). */
export interface CompanionDef {
  id: CompanionId;
  name: string;
  /** A line about it for the tooltip. */
  blurb: string;
  might: number;
  ward: number;
  /** The colours it is drawn in (CSS): its body, its trim and the light it gives off. */
  body: string;
  trim: string;
  glow: string;
}

/** The order is the item id (`companionItemId`), so new companions go on the end. */
export const COMPANIONS: readonly CompanionDef[] = [
  {
    id: 'cinder-imp',
    name: 'Cinder Imp',
    blurb: 'A scrap of ember with horns and a bad temper. It hovers at your shoulder, cackles at your enemies, and gets your blows to land harder.',
    might: 0.1,
    ward: 0,
    body: '#b8321c',
    trim: '#ffb23a',
    glow: '#ff7a2a',
  },
  {
    id: 'dawn-seraph',
    name: 'Dawn Seraph',
    blurb: 'A small bright keeper with a ring of light over its head. It hovers at your shoulder, and a tenth of every blow meant for you never lands.',
    might: 0,
    ward: 0.1,
    body: '#f4ecd6',
    trim: '#ffd666',
    glow: '#fff1b0',
  },
];

export const companionById = (id: string | null | undefined): CompanionDef | null => COMPANIONS.find((c) => c.id === id) ?? null;
export const companionIndex = (id: string | null | undefined): number => COMPANIONS.findIndex((c) => c.id === id);

/** The text of what it gives, for the tooltip: "+10% damage dealt". */
export function companionBonusText(def: CompanionDef): string {
  const parts: string[] = [];
  if (def.might > 0) parts.push(`+${Math.round(def.might * 100)}% damage dealt`);
  if (def.ward > 0) parts.push(`-${Math.round(def.ward * 100)}% damage taken`);
  return parts.join(', ');
}
