import { OUTFITS, STASH_TAB_SLOTS } from '@solrift/shared';

/**
 * The facts about the $SOLRIFT token that the website owns. The mint address, the supply and the decimals are NOT here: they come
 * from the game server (`TOKEN_MINT` in its environment, read from the chain), so there is one place to set them and the page and the
 * game can never disagree. Anything not public yet is `null`, and the page says "Announced at launch" for it.
 * (Never put a made-up address anywhere: people will copy it.)
 */
export interface TokenInfo {
  readonly name: string;
  readonly ticker: string;
  readonly network: string;
  readonly standard: string;
  /** Where to read about it and where to find it (null links are not shown). The explorer link is made from the mint when the server has one. */
  readonly links: { readonly explorer: string | null; readonly trade: string | null; readonly x: string | null; readonly discord: string | null };
}

export const TOKEN: TokenInfo = {
  name: 'SolRift',
  ticker: 'SOLRIFT',
  network: 'Solana',
  standard: 'SPL token',
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
    text: 'List, bid and buy out in $SOLRIFT beside Auren. The house\'s cut goes back to the treasury that funds the reward pool, so what is spent in the market is what the game pays out later.',
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
    text: 'Reach level 5, 10, 15 and on to 30; slay monsters and elites; clear the Hollow Deep; hand in quests. Each achievement pays a reward set by its tier, from Bronze to Mythic, once per wallet.',
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
  ['Honest numbers', 'The size of the pool, what is paid out and what is withdrawn are shown on this page, so anyone can check them.'],
];

/** Where the plan stands, in order. */
export const ROADMAP: readonly { id: string; title: string; text: string; stage: Stage }[] = [
  { id: 'wallet', title: 'Sign in with a Solana wallet', text: 'Your wallet is your account. Your heroes, bags and auctions belong to it. This is how the game works today.', stage: 'live' },
  { id: 'created', title: 'The token is created', text: 'The $SOLRIFT mint, the supply and the one official address are published on this page before anything else.', stage: 'next' },
  { id: 'earn', title: 'Earn $SOLRIFT by playing', text: 'Boss kills, dungeon clears and daily bounties start paying from the reward pool, with the daily caps and the fair-play rules.', stage: 'planned' },
  { id: 'withdraw', title: 'Withdraw to your wallet', text: 'Send what you earned to your own Solana wallet, where you can swap it for SOL or USDC.', stage: 'planned' },
  { id: 'auction', title: 'The Auction House takes $SOLRIFT', text: 'Prices in $SOLRIFT beside Auren, with the house\'s cut returned to the treasury.', stage: 'planned' },
  { id: 'sinks', title: 'Crafting, keys and services', text: 'The sinks that give the token a reason to be spent: masterwork recipes, dungeon keys, outfits and services.', stage: 'planned' },
  { id: 'vote', title: 'The realm decides', text: 'Votes on the next Expansion, with holders\' voices counted.', stage: 'planned' },
];

/** What the live server says is already working: the page marks those parts of the plan "Live". */
export interface TokenProgress {
  /** There is a mint: achievements pay into balances. */
  live: boolean;
  /** Players can withdraw to their wallets. */
  withdrawals: boolean;
  /** What a dungeon clear pays through the day, in order (empty: clears do not pay). */
  clearRewards?: readonly number[];
  /** What the extra hero slots cost, in order (empty: none for sale). */
  slotPrices?: readonly number[];
  /** What the extra stash tabs cost, in order (empty: none for sale). */
  stashPrices?: readonly number[];
  /** What a daily bounty pays, easy, medium and hard (empty: bounties pay nothing). */
  bountyRewards?: readonly number[];
  /** What an outfit costs by tier: common, rare, epic (empty: none for sale). */
  outfitPrices?: readonly number[];
  /** What a Hollow Key costs (0: none for sale). */
  keyPrice?: number;
}

/** "20, then 10, 5, 3 and 2" */
const listOf = (n: readonly number[]): string => (n.length <= 1 ? `${n[0]}` : `${n[0]}, then ${n.slice(1, -1).join(', ')}${n.length > 2 ? ' and ' : ''}${n[n.length - 1]}`);

/** The plan with the finished parts marked. */
export function roadmapFor(p: TokenProgress): typeof ROADMAP {
  return ROADMAP.map((r) => {
    if (r.id === 'created' && p.live) return { ...r, stage: 'live', text: 'The $SOLRIFT mint, the supply and the one official address are published on this page.' };
    if (r.id === 'earn' && p.live) return { ...r, stage: 'live', title: p.clearRewards?.length ? 'Earn $SOLRIFT with achievements and dungeon clears' : 'Earn $SOLRIFT with achievements', text: p.clearRewards?.length ? 'Every achievement pays its tier\'s reward once per wallet, and every clear of the Hollow Deep pays you for the day, all from the day\'s pool with the daily caps and the fair-play rules. Daily bounties pay too.' : 'Every achievement pays its tier\'s reward from the day\'s pool, once per wallet, with the daily caps and the fair-play rules. Boss kills and dungeon clears follow.' };
    if (r.id === 'withdraw' && p.withdrawals) return { ...r, stage: 'live' };
    if (r.id === 'auction' && p.live) return { ...r, stage: 'live', text: 'Auctions can be priced in $SOLRIFT beside Auren. The house\'s cut stays with the treasury.' };
    if (r.id === 'sinks' && p.live && (p.slotPrices?.length || p.keyPrice || p.stashPrices?.length || p.outfitPrices?.length)) {
      const sale = [p.slotPrices?.length ? 'Extra hero slots' : '', p.stashPrices?.length ? 'Stash tabs' : '', p.keyPrice ? 'Hollow Keys' : '', p.outfitPrices?.length ? 'Outfits' : ''].filter(Boolean);
      const names = sale.length > 1 ? `${sale.slice(0, -1).join(', ')} and ${sale[sale.length - 1]}` : sale[0];
      return { ...r, stage: 'next', title: `${names}, then crafting`, text: `${names} ${sale.length > 1 ? 'are' : 'is'} for sale now, paid from your balance. Masterwork recipes follow. What is spent stays with the treasury and pays for later rewards.` };
    }
    return r;
  });
}

/** What the token buys, with what is for sale today marked "Live". */
export function utilitiesFor(p: TokenProgress): typeof UTILITIES {
  const slots = p.live && !!p.slotPrices?.length;
  const tabs = p.live && !!p.stashPrices?.length;
  return UTILITIES.map((u) => {
    if (u.id === 'market' && p.live) {
      return { ...u, stage: 'live' as const, text: 'Put an item up in $SOLRIFT or in Auren, at the Auctioneer: the buyer pays at once from their balance, an outbid bidder is refunded at once, and the seller is paid straight into theirs, less the house\'s 5%. The cut stays with the treasury that funds the reward pool.' };
    }
    if (u.id === 'style' && p.live && p.outfitPrices?.length === 3) {
      const [a, b, c] = p.outfitPrices;
      return { ...u, stage: 'live' as const, text: `${OUTFITS.length} glowing sets, ${OUTFITS.length / 3} for each class (plate for the Warrior, robes of magic for the Mage, leathers and wings for the Ranger), with horns, hats, wings, rings of light and sparks in their own colours, from ${a} $SOLRIFT (common) through ${b} (rare) to ${c} (epic). Each is an item: it goes to your Stash when you buy it (so you need a free slot), and you wear it from the new outfit slot of your inventory: right-click it, or drag it in. A hero wears only the sets of its class, but your wallet can buy the sets of every class, and trade them. They change how your hero looks and nothing else (the armor you really wear still counts, it is only not seen). Try them on the stand on this page; everyone sees what you wear. No gear that makes anyone stronger is sold for money.` };
    }
    if (u.id === 'keys' && p.live && p.keyPrice) {
      return { ...u, stage: 'live' as const, text: `A Hollow Key is ${p.keyPrice} $SOLRIFT, paid from your balance and kept in your wallet's name, so it follows you to any hero. It opens the Hollow Deep for you and your whole party in place of a Hollow Sigil, and is used up when a new copy of the dungeon opens (not when you step back into one that is still open). Sign in on this page to buy one.` };
    }
    if (u.id === 'services' && (slots || tabs)) {
      const bits: string[] = [];
      if (slots) bits.push(`more room for heroes: ${p.slotPrices!.length === 1 ? `one extra hero slot at ${p.slotPrices![0]}` : `${p.slotPrices!.length} extra hero slots, at ${p.slotPrices!.join(', then ')}`} $SOLRIFT`);
      if (tabs) bits.push(`more room in the shared Stash: ${p.stashPrices!.length === 1 ? `one tab of ${STASH_TAB_SLOTS} slots at ${p.stashPrices![0]}` : `${p.stashPrices!.length} tabs of ${STASH_TAB_SLOTS} slots each, at ${p.stashPrices!.join(', then ')}`} $SOLRIFT`);
      return { ...u, stage: 'live' as const, text: `For sale now, paid from your balance and yours for good: ${bits.join('; ')}. A new name and a house plot are still to come.` };
    }
    return u;
  });
}

/** The ways to earn, with the one that pays today marked "Live". */
export function earningsFor(p: TokenProgress): typeof EARNINGS {
  const clears = p.live && !!p.clearRewards?.length;
  return EARNINGS.map((e) => {
    if (e.id === 'achievements' && p.live) return { ...e, stage: 'live' as const };
    if (e.id === 'bounties' && p.live && p.bountyRewards?.length === 3) {
      const [a, b, c] = p.bountyRewards;
      return { ...e, stage: 'live' as const, text: `Every day the board posts three bounties, the same for everyone: an easy one (${a} $SOLRIFT), a medium one (${b}) and a hard one (${c}). Slay, earn and clear to finish them, and each pays once per wallet a day, however many heroes you play. They are in the quest log, under Daily (press L).` };
    }
    if (e.id === 'trade' && p.live) return { ...e, stage: 'live' as const, text: 'Gather, craft and sell to other players at the Auction House, priced in $SOLRIFT. Whatever a buyer pays you is yours, in your balance the moment it sells, less the house\'s 5%.' };
    // The Hollow King is the realm's only boss today, and bringing him down is the dungeon's clear: one payout, shown in both places.
    if (e.id === 'bosses' && clears) return { ...e, stage: 'live' as const, text: 'The Hollow King is the realm\'s first boss, and bringing him down is the clear of the Hollow Deep (below). The bosses to come will pay in the same way.' };
    if (e.id === 'dungeons' && clears) {
      return { ...e, stage: 'live' as const, text: `Break the cages, open the gates and bring down the Hollow King: a clear pays ${listOf(p.clearRewards!)} $SOLRIFT for your first clears of the day, and nothing more until tomorrow (UTC). It pays each player who struck a blow in the fight, not those who stood by.` };
    }
    return e;
  });
}
