import { siteUrl, whereAmI } from '../game/route';

/**
 * The front page's menu (Play, The World, Classes, Expansions) is on the character lobby too. From there a menu button
 * leads to the front page, and this key (kept in the session, so that the address stays plain) says which part to show.
 */
export const SCROLL_KEY = 'solrift-scroll';

/** The parts of the front page the menu leads to, by the id of their section. The World is its own page (`/beyond`). */
export const FRONT_MENU = [
  { label: 'Classes', id: 'site-features' },
  { label: 'Expansions', id: 'l-expansions' },
] as const;

/** The World Beyond is a page of its own. */
export const BEYOND_PATH = '/beyond';
export const goBeyond = (): void => location.assign(siteUrl(BEYOND_PATH));

/** The Market (the Auction House on the website) is a page of its own, so the menu button goes there rather than to a part of the front page. */
export const MARKET_PATH = '/market';
export const goMarket = (): void => location.assign(siteUrl(MARKET_PATH));

/** The farm page: the daily check-in, and sending a hero out to farm while you are away. */
export const FARM_PATH = '/farm';
export const goFarm = (): void => location.assign(siteUrl(FARM_PATH));

/** The token page (what $SOLRIFT is for) is a page of the website too. */
export const TOKEN_PATH = '/token';
export const goToken = (): void => location.assign(siteUrl(TOKEN_PATH));

/** The Shop (what $SOLRIFT buys: hero slots, stash tabs, keys, outfits) is a page of the website too. */
export const SHOP_PATH = '/shop';
export const goShop = (): void => location.assign(siteUrl(SHOP_PATH));

/** The front page at a part of it, from anywhere (from the game's host the part goes in the address). */
export function frontUrl(id?: string): string {
  const base = siteUrl('/');
  return id && whereAmI() === 'play' ? `${base}?to=${encodeURIComponent(id)}` : base;
}
