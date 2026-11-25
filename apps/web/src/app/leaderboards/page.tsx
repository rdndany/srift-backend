import type { Metadata } from 'next';
import { BoardsPage } from '@/components/BoardsPage';

/** `/leaderboards`: Survival Island days, and realm character level. */
export const metadata: Metadata = {
  title: 'Leaderboards | SolRift',
  description: 'Survival Island ranked by days survived, and the realm ranked by character level.',
};

export default function LeaderboardsRoute() {
  return (
    <div id="home-layer">
      <div id="home" className="front">
        <BoardsPage />
      </div>
    </div>
  );
}
