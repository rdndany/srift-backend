import type { Metadata } from 'next';
import { ShopPage } from '@/components/ShopPage';

/** `/shop`: what $SOLRIFT buys in the game: hero slots, stash tabs, Hollow Keys and the outfits of every class. */
export const metadata: Metadata = {
  title: 'The Shop: spend your $SOLRIFT | SolRift',
  description: 'Spend the $SOLRIFT you earn in SolRift: more hero slots for your wallet, stash tabs, Hollow Keys and glowing outfits for every class. Outfits change how a hero looks and nothing else.',
};

export default function ShopRoute() {
  return (
    <div id="home-layer">
      <div id="home" className="front">
        <ShopPage />
      </div>
    </div>
  );
}
