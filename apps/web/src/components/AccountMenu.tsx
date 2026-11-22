'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shortAddress, useAuth } from '../auth/store';
import { siteUrl } from '../game/route';
import { TOKEN_PATH } from './frontNav';
import { WalletLinks } from './WalletLinks';
import './accountMenu.css';

/**
 * The account in the site's menu bar, kept small: one chip (a letter, the name, a caret) that opens a card with everything else (the wallet
 * address, the $SOLRIFT balance, sign out). Signed out it is a "Sign in" button that opens the wallet list. The card is drawn on the page body, so
 * the bar's notched edge cannot cut it off.
 */
export function AccountMenu({ tokenLive, balance }: { tokenLive: boolean; balance: number | null }) {
  const { status, account, wallets, busy, error, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 10, right: Math.max(8, window.innerWidth - r.right) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (close(), btn.current?.focus());
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    // the page scrolls under the bar: the card would stay behind where it was
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, place]);

  // Signing in (or out) is done: the card has said what it had to.
  useEffect(() => setOpen(false), [status]);

  if (status === 'loading') return <div className="acm" data-no-play />;

  const signedIn = status === 'in' && !!account;
  const card = open && at && typeof document !== 'undefined' && createPortal(
    <div ref={pop} className="acm-pop" role="dialog" aria-label={signedIn ? 'Your account' : 'Sign in'} style={{ top: at.top, right: at.right }} data-no-play>
      {signedIn ? (
        <>
          <div className="acm-head">
            <span className="acm-avatar big" aria-hidden="true">
              {account.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>{account.displayName}</b>
              {account.class && <small>{account.class}</small>}
            </span>
          </div>
          <button
            type="button"
            className="acm-row"
            title={account.wallet}
            onClick={() => {
              void navigator.clipboard?.writeText(account.wallet).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <span>Wallet</span>
            <code>{shortAddress(account.wallet)}</code>
            <em>{copied ? 'Copied' : 'Copy'}</em>
          </button>
          {tokenLive && balance !== null && (
            <a className="acm-row" href={siteUrl(TOKEN_PATH)} title="Your $SOLRIFT: earned by winning achievements" data-testid="account-balance">
              <span>Balance</span>
              <strong>{balance.toLocaleString()} $SOLRIFT</strong>
              <em>Open</em>
            </a>
          )}
          <button id="signout" type="button" className="acm-out" disabled={busy} onClick={() => void logout()}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="acm-title">Sign in with your wallet</p>
          {wallets.length === 0 ? (
            <>
              <p className="acm-note" id="account-msg-nowallet">
                No Solana wallet found. Install Phantom, Solflare or Backpack, then reload.
              </p>
              <WalletLinks className="wallet-links acm-links" />
            </>
          ) : (
            <>
              {wallets.map((w) => (
                <button key={w.name} type="button" className="acm-row wallet-option" disabled={busy} onClick={() => void login(w)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.icon} alt="" width={20} height={20} />
                  <span>{w.name}</span>
                </button>
              ))}
              <p className="acm-note">It costs nothing and cannot touch your funds. Guests can play; signing in lets saves follow you.</p>
            </>
          )}
          {error && <p className="acm-error" id="account-msg">{error}</p>}
        </>
      )}
    </div>,
    document.body,
  );

  return (
    <div className="acm" data-no-play>
      {signedIn ? (
        <button ref={btn} type="button" className={`acm-chip${open ? ' open' : ''}`} id="account-name" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={account.displayName}>
          <span className="acm-avatar" aria-hidden="true">
            {account.displayName.slice(0, 1).toUpperCase()}
          </span>
          <b>{account.displayName}</b>
          {tokenLive && !!balance && <span className="acm-bal">{compact(balance)}</span>}
          <i className="acm-caret" aria-hidden="true" />
        </button>
      ) : (
        <button ref={btn} type="button" className={`acm-chip signin${open ? ' open' : ''}`} id="signin" aria-haspopup="dialog" aria-expanded={open} aria-label="Sign in with Solana wallet" disabled={busy} onClick={() => setOpen((o) => !o)}>
          <span className="acm-long">Sign in with wallet</span>
          <span className="acm-short" aria-hidden="true">
            Sign in
          </span>
        </button>
      )}
      {card}
      {!open && error && <span className="sr-only" role="alert" id="account-msg">{error}</span>}
    </div>
  );
}

/** 1,250,000 as 1.3M: a balance in the chip has little room. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
}
