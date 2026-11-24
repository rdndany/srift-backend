import type { Metadata } from 'next';
import { MarketPage } from '@/components/MarketPage';

/** `/market`: the game's Auction House on the website: what is up for sale in the realm, live. */
export const metadata: Metadata = {
  title: 'The Market: the Auction House of the realm, live | SolRift',
  description: 'The Auction House of SolRift: bid, buy out, sell from your bags and collect your mail. The same house the Auctioneer keeps in Dawnwatch.',
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
