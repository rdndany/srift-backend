/**
 * The front page's menu (Play, The World, Classes, Expansions) is on the character lobby too. From there a menu button
 * leads to the front page, and this key (kept in the session, so that the address stays plain) says which part to show.
 */
export const SCROLL_KEY = 'solrift-scroll';

/** The parts of the front page the menu leads to, by the id of their section. */
export const FRONT_MENU = [
  { label: 'The World', id: 'site-world' },
  { label: 'Classes', id: 'site-features' },
  { label: 'Expansions', id: 'l-expansions' },
] as const;

/** The Market (the Auction House on the website) is a page of its own, so the menu button goes there rather than to a part of the front page. */
export const MARKET_PATH = '/market';
export const goMarket = (): void => location.assign(MARKET_PATH);
