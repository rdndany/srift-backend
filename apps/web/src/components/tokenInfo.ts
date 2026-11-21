/**
 * The facts about the $SOLRIFT token, in one place. Anything that is not decided or not yet public is `null`, and the page
 * says "Announced at launch" for it. Fill these in when the token is created: the page, and nothing else, reads them.
 * (Never put a made-up address here: people will copy it.)
 */
export interface TokenInfo {
  readonly name: string;
  readonly ticker: string;
  readonly network: string;
  readonly standard: string;
  /** The token's mint address on Solana, the one official address (null until the token exists). */
  readonly mint: string | null;
  /** The total supply, written as it should read ("1,000,000,000"), or null. */
  readonly supply: string | null;
  readonly decimals: number | null;
  /** Where to read about it and where to find it (null links are not shown). */
  readonly links: { readonly explorer: string | null; readonly trade: string | null; readonly x: string | null; readonly discord: string | null };
}

export const TOKEN: TokenInfo = {
  name: 'SolRift',
  ticker: 'SOLRIFT',
  network: 'Solana',
  standard: 'SPL token',
  mint: null,
  supply: null,
  decimals: null,
  links: { explorer: null, trade: null, x: null, discord: null },
};

/** How far a part of the plan has come. */
export type Stage = 'live' | 'next' | 'planned';

export const STAGE_LABEL: Record<Stage, string> = { live: 'Live', next: 'Next', planned: 'Planned' };

/** What the token is for in the game's economy. */
export const UTILITIES: readonly { id: string; title: string; text: string; stage: Stage; tag: string }[] = [
  {
    id: 'market',
    title: 'The Auction House',
    text: 'List, bid and buy out in $SOLRIFT beside Auren. Part of the house\'s cut is taken out of circulation for good, so the busier the market, the scarcer the token.',
    stage: 'next',
    tag: 'Trade',
  },
  {
    id: 'crafting',
    title: 'Masterwork crafting',
    text: 'Rare recipes and reagents that smiths and arcanists ask $SOLRIFT for: the finest gear of the realm is made, not just found.',
    stage: 'planned',
    tag: 'Craft',
  },
  {
    id: 'keys',
    title: 'Keys to the deep',
    text: 'Dungeon keys and attunements, such as the Hollow Deep, are paid for in $SOLRIFT and used up when a party goes in.',
    stage: 'planned',
    tag: 'Dungeons',
  },
  {
    id: 'style',
    title: 'Outfits and dyes',
    text: 'Cosmetics that change how your hero looks and nothing else: dyes, outfits and banners. No gear that makes anyone stronger is sold for money.',
    stage: 'planned',
    tag: 'Style',
  },
  {
    id: 'services',
    title: 'Services of the realm',
    text: 'A new name, a stash tab, a second hero slot, a house plot: the conveniences a long-time adventurer wants.',
    stage: 'planned',
    tag: 'Services',
  },
  {
    id: 'say',
    title: 'A say in the realm',
    text: 'Holders vote on what comes next: the look of an Expansion, which new biome or dungeon is built first, and what the next event is.',
    stage: 'planned',
    tag: 'Community',
  },
];

/** The ways to earn $SOLRIFT by playing. `how` says what pays; `size` is how big the reward is meant to be, never a number of dollars. */
export const EARNINGS: readonly { id: string; title: string; text: string; how: string; size: 'Steady' | 'Good' | 'Rare' | 'Seasonal'; stage: Stage }[] = [
  {
    id: 'achievements',
    title: 'Win achievements',
    text: 'Reach level 5, 10, 15 and on to 30; slay monsters and elites; clear the Hollow Deep; hand in quests. Every achievement is won once per character and pays a reward set by its tier, from Bronze to Mythic.',
    how: 'Achievements',
    size: 'Good',
    stage: 'planned',
  },
  {
    id: 'bosses',
    title: 'Slay the bosses',
    text: 'The Hollow King and the bosses to come drop $SOLRIFT. A first kill on an account pays the most; the same boss pays less each time after.',
    how: 'Boss kills',
    size: 'Good',
    stage: 'planned',
  },
  {
    id: 'dungeons',
    title: 'Clear the dungeons',
    text: 'Break the cages, open the gates and reach the end of the Hollow Deep: a clear pays a reward, shared by the party that finished it.',
    how: 'Dungeon clears',
    size: 'Good',
    stage: 'planned',
  },
  {
    id: 'bounties',
    title: 'Daily bounties',
    text: 'Quests and bounties that change every day, from Hale and the other quest-givers. A small, steady reward for logging in and playing.',
    how: 'Quests',
    size: 'Steady',
    stage: 'planned',
  },
  {
    id: 'trade',
    title: 'Trade at the market',
    text: 'Gather, craft and sell to other players. Whatever a buyer pays you in $SOLRIFT is yours, less the house\'s cut.',
    how: 'Auction House',
    size: 'Steady',
    stage: 'next',
  },
  {
    id: 'craft',
    title: 'Master a craft',
    text: 'Masterwork gear and rare materials sell for $SOLRIFT: a smith or an arcanist with the right recipes is never short of buyers.',
    how: 'Crafting',
    size: 'Good',
    stage: 'planned',
  },
  {
    id: 'explore',
    title: 'Explore the rift',
    text: 'Be the first to find a place in the World Beyond (a temple, a hold, a far biome) and put your name on the discovery.',
    how: 'Discoveries',
    size: 'Rare',
    stage: 'planned',
  },
  {
    id: 'seasons',
    title: 'Seasons and events',
    text: 'Each season has a ladder (bosses, dungeons, discoveries) and its own pool of $SOLRIFT for the top of it.',
    how: 'Leaderboards',
    size: 'Seasonal',
    stage: 'planned',
  },
];

/** From a coin earned in the game to money in the bank. */
export const CASHOUT: readonly [string, string][] = [
  ['Earn in the game', 'What you win shows as your $SOLRIFT balance, kept with your account. Nothing leaves the game until you say so.'],
  ['Withdraw to your wallet', 'Send it to your own Solana wallet, the one you sign in with. It is a real token there: yours, on-chain, with a link to see it.'],
  ['Swap it', 'Exchange $SOLRIFT for SOL or a stablecoin such as USDC on a Solana exchange, at the market price of that moment.'],
  ['Cash out', 'Move the SOL or USDC to an exchange of your choice and sell it for your own currency, like any other crypto.'],
];

/** The rules that keep the economy sound, so that earning stays worth something. */
export const FAIR_PLAY: readonly [string, string][] = [
  ['A pool, not a printer', 'Rewards are paid from a fixed pool that is set per day and per season. When it runs dry for the day, rewards stop until the next one.'],
  ['Caps per account', 'Each kind of reward has a daily limit per account, and repeats pay less, so no one can grind the pool dry.'],
  ['One player, one account', 'Bots, scripts and many accounts run by one person are banned, and their rewards are taken back.'],
  ['Honest numbers', 'The size of the pool, what is paid out and what is burned are shown on this page, so anyone can check them.'],
];

/** Where the plan stands, in order. */
export const ROADMAP: readonly { title: string; text: string; stage: Stage }[] = [
  { title: 'Sign in with a Solana wallet', text: 'Your wallet is your account. Your heroes, bags and auctions belong to it. This is how the game works today.', stage: 'live' },
  { title: 'The token is created', text: 'The $SOLRIFT mint, the supply and the one official address are published on this page before anything else.', stage: 'next' },
  { title: 'Earn $SOLRIFT by playing', text: 'Boss kills, dungeon clears and daily bounties start paying from the reward pool, with the daily caps and the fair-play rules.', stage: 'planned' },
  { title: 'Withdraw to your wallet', text: 'Send what you earned to your own Solana wallet, where you can swap it for SOL or USDC.', stage: 'planned' },
  { title: 'The Auction House takes $SOLRIFT', text: 'Prices in $SOLRIFT beside Auren, with the burn on the house\'s cut.', stage: 'planned' },
  { title: 'Crafting, keys and services', text: 'The sinks that give the token a reason to be spent: masterwork recipes, dungeon keys, outfits and services.', stage: 'planned' },
  { title: 'The realm decides', text: 'Votes on the next Expansion, with holders\' voices counted.', stage: 'planned' },
];
