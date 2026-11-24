import type { Metadata } from 'next';
import { FarmPage } from '@/components/FarmPage';

/** `/farm`: the daily check-in and the offline farm. Bags, the Stash and realm chat stay on the Play page. */
export const metadata: Metadata = {
  title: 'Daily check-in and the offline farm | SolRift',
  description: 'Check in once a day for Auren, and send your SolRift hero to farm while you are away. Collect what it finds when it gets back.',
};

export default function FarmRoute() {
  return (
    <div id="home-layer">
      <div id="home" className="front">
        <FarmPage />
      </div>
    </div>
  );
}
