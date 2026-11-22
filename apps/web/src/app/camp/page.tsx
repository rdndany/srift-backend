import type { Metadata } from 'next';
import { CampPage } from '@/components/CampPage';

/** `/camp`: what a hero can do from a phone or a tablet with no game running: gear, the Stash, the market, a daily gift, expeditions and chat. */
export const metadata: Metadata = {
  title: 'Your Camp: manage your hero from a phone | SolRift',
  description: 'Play SolRift from your phone or tablet: manage your hero and its gear, use your Stash, bid and sell at the market, check in daily, send your hero on expeditions and chat with the realm.',
};

export default function CampRoute() {
  return (
    <div id="home-layer">
      <div id="home" className="front">
        <CampPage />
      </div>
    </div>
  );
}
