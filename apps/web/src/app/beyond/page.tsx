import type { Metadata } from 'next';
import { BeyondPage } from '@/components/BeyondPage';
import { COUNTS } from '@/components/beyondGuide';

/** `/beyond`: a page about the World Beyond, the second world, with captures of the game itself. */
export const metadata: Metadata = {
  title: 'The World Beyond: an endless planet made from a seed | SolRift',
  description: `The World Beyond is SolRift’s second world: ${COUNTS.biomes} biomes, ${COUNTS.realms} signature realms, ${COUNTS.places} ancient places, a layered underground and living weather, all generated from a seed. See it in captures from the game.`,
};

export default function BeyondRoute() {
  return (
    <div id="home-layer">
      <div id="home" className="front">
        <BeyondPage />
      </div>
    </div>
  );
}
