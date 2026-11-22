'use client';

import { useEffect, useState } from 'react';

/**
 * A phone's browser has no wallet in it: the wallet apps carry their own browser, where the wallet exists. These links open the
 * current page inside that browser (the wallets' documented "browse" deep links), where signing in works as it does on a computer.
 */
export function walletLinks(href: string, origin: string): { name: string; href: string }[] {
  const url = encodeURIComponent(href);
  const ref = encodeURIComponent(origin);
  return [
    { name: 'Phantom', href: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { name: 'Solflare', href: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
  ];
}

/** Is this a phone or a tablet (where there is no wallet extension and a wallet app is the way)? */
export function isTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

/** "Open in Phantom" and "Open in Solflare", on phones and tablets only (nothing is drawn elsewhere). */
export function WalletLinks({ className = 'wallet-links' }: { className?: string }) {
  const [links, setLinks] = useState<{ name: string; href: string }[]>([]);
  useEffect(() => {
    if (isTouchDevice()) setLinks(walletLinks(location.href, location.origin));
  }, []);
  if (links.length === 0) return null;
  return (
    <span className={className} data-testid="wallet-links">
      <span className="wallet-links-note">On a phone, open this page in your wallet app:</span>
      {links.map((l) => (
        <a key={l.name} className="wallet-option" href={l.href} rel="noopener">
          Open in {l.name}
        </a>
      ))}
    </span>
  );
}
