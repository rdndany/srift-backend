'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/store';
import { useToken } from '../token/store';
import { useTokenBalance } from './TokenWallet';

/** A rift crystal in the same 12 x 12 pixel style as the coin and the experience star: the $SOLRIFT. */
const GEM_ROWS = [
  '.....OO.....',
  '....OLLO....',
  '...OLWMMO...',
  '..OLWMMMMO..',
  '.OLWMMMMMMO.',
  'OLMMMMMMMDDO',
  'OMMMMMMMMDDO',
  '.OMMMMMMDDO.',
  '..OMMMMDDO..',
  '...OMMDDO...',
  '....ODDO....',
  '.....OO.....',
];
const GEM_COLORS: Record<string, string> = { O: '#2a1049', D: '#7b3fd0', M: '#a96bff', L: '#d9b8ff', W: '#ffffff' };
const GEM_PIXELS = GEM_ROWS.flatMap((row, y) => [...row].flatMap((c, x) => (GEM_COLORS[c] ? [{ x, y, fill: GEM_COLORS[c] }] : [])));

export function TokenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="coin-icon token-icon" width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
      {GEM_PIXELS.map((p) => (
        <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={p.fill} />
      ))}
    </svg>
  );
}

/** The signed-in wallet's balance, or null when there is nothing to show (no token, a guest, signed out). */
export function useTokenAmount(): number | null {
  const live = useToken((s) => s.info?.live ?? false);
  const signedIn = useAuth((s) => s.status === 'in');
  const balance = useToken((s) => s.me?.balance ?? null);
  return live && signedIn ? balance : null;
}

/** How much the balance just grew by (for a few seconds), so a reward is seen as it lands. */
function useGain(balance: number | null): number {
  const last = useRef<number | null>(null);
  const [gain, setGain] = useState(0);
  useEffect(() => {
    const before = last.current;
    last.current = balance;
    if (balance === null || before === null || balance <= before) return;
    setGain(balance - before);
    const id = window.setTimeout(() => setGain(0), 4500);
    return () => window.clearTimeout(id);
  }, [balance]);
  return gain;
}

/**
 * Your $SOLRIFT, where you can see it while you play: under your bars, and in your bags beside the coins. It shows nothing for a
 * guest or while the token is off, and a reward that lands is shown as a green "+N" for a few seconds.
 */
export function TokenPurse({ where }: { where: 'frame' | 'bags' }) {
  const balance = useTokenAmount();
  const gain = useGain(balance);
  if (balance === null) return null;
  return (
    <div id={where === 'bags' ? 'token-purse' : undefined} className={`token-purse ${where}`} data-testid={`token-purse-${where}`} data-balance={balance} title="Your $SOLRIFT: earned by playing, kept with your wallet. Withdraw it on the token page.">
      <TokenIcon size={where === 'bags' ? 18 : 14} />
      <span className="tp-amount">{balance.toLocaleString()}</span>
      <small>$SOLRIFT</small>
      {gain > 0 && (
        <em className="tp-gain" role="status">
          +{gain.toLocaleString()}
        </em>
      )}
    </div>
  );
}

/**
 * Mounted once with the game: reads the token's settings and the wallet's balance, and reads the balance again whenever the server
 * says something was added to it (a reward) or taken from it.
 */
export function TokenSync() {
  const loadInfo = useToken((s) => s.loadInfo);
  useTokenBalance();
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);
  return null;
}
