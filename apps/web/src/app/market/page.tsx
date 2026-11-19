import type { Metadata } from 'next';
import { MarketPage } from '@/components/MarketPage';

/** `/market`: the game's Auction House on the website: what is up for sale in the realm, live. */
export const metadata: Metadata = {
  title: 'The Market: the Auction House of the realm, live | SolRift',
  description: 'Browse everything players have put up for sale in SolRift: weapons, armor, materials and treasures, with the bids and buyouts as they stand now. Bid and sell in the game, at the Auctioneer of Dawnwatch.',
};

export default function MarketRoute() {
  return (
    <div id="home-layer">
      <div id="home" className="front">
        <MarketPage />
      </div>
    </div>
  );
}
