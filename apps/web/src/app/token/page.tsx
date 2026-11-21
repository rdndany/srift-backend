import type { Metadata } from 'next';
import { TokenPage } from '@/components/TokenPage';

/** `/token`: what the $SOLRIFT token is for in the game's economy. */
export const metadata: Metadata = {
  title: '$SOLRIFT: the token of the realm | SolRift',
  description: 'SolRift is a voxel MMORPG in your browser powered by Solana. $SOLRIFT is the token of its economy: the Auction House, masterwork crafting, dungeon keys, outfits, services and a say in the realm.',
};

export default function TokenRoute() {
  return (
    <div id="home-layer">
      <div id="home" className="front">
        <TokenPage />
      </div>
    </div>
  );
}
