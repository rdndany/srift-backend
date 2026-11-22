'use client';

import { useEffect, useState } from 'react';
import { shortAddress, useAuth } from '../auth/store';
import { siteUrl } from '../game/route';
import { useToken } from '../token/store';
import { TOKEN_PATH } from './frontNav';
import { useTokenBalance } from './TokenWallet';
import { AccountMenu } from './AccountMenu';
import { WalletLinks } from './WalletLinks';

/** Wallet sign-in. Guests can ignore it and just play. `bar`: the compact form for the site's menu bar. */
export function AccountPanel({ bar = false }: { bar?: boolean }) {
  const { status, account, wallets, busy, error, init, login, logout } = useAuth();
  const [picking, setPicking] = useState(false);
  // Once the game server has a token, a signed-in wallet sees its balance here (a link to the token page).
  const tokenLive = useToken((s) => s.info?.live ?? false);
  const balance = useToken((s) => s.me?.balance ?? null);
  const loadInfo = useToken((s) => s.loadInfo);
  useTokenBalance();

  useEffect(() => init(), [init]);
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  // In the site's menu bar the account is a small chip with a card (AccountMenu); elsewhere (the pause screen) it is spelled out.
  if (bar) return <AccountMenu tokenLive={tokenLive} balance={balance} />;

  if (status === 'loading') return <div className="account-panel" data-no-play />;

  if (status === 'in' && account) {
    return (
      <div className="account-panel" data-no-play>
        <span id="account-name">
          <span className="acc-pre">Signed in as </span>
          <b className="acc-who">{account.displayName}</b>
          <span className="acc-more">
            {' '}
            &middot; <code title={account.wallet}>{shortAddress(account.wallet)}</code>
            {tokenLive && balance !== null && (
              <>
                {' '}
                &middot;{' '}
                <a className="account-token" href={siteUrl(TOKEN_PATH)} title="Your $SOLRIFT: earned by winning achievements" data-testid="account-balance">
                  {balance.toLocaleString()} $SOLRIFT
                </a>
              </>
            )}
          </span>
        </span>
        <button id="signout" disabled={busy} onClick={() => void logout()}>
          Sign out
        </button>
        {error && <span id="account-msg">{error}</span>}
      </div>
    );
  }

  return (
    <div className="account-panel" data-no-play>
      {!picking ? (
        <button id="signin" disabled={busy} aria-label="Sign in with Solana wallet" onClick={() => setPicking(true)}>
          <span className="acc-long">Sign in with Solana wallet</span>
          <span className="acc-short" aria-hidden="true">
            Sign in
          </span>
        </button>
      ) : wallets.length === 0 ? (
        <span id="account-msg">
          No Solana wallet found. Install Phantom, Solflare or Backpack, then reload.{' '}
          <WalletLinks />{' '}
          <button className="link" onClick={() => setPicking(false)}>
            Back
          </button>
        </span>
      ) : (
        <>
          {wallets.map((w) => (
            <button
              key={w.name}
              className="wallet-option"
              disabled={busy}
              onClick={() => {
                void login(w).then(() => setPicking(false));
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.icon} alt="" width={16} height={16} /> {w.name}
            </button>
          ))}
          <button className="link" onClick={() => setPicking(false)}>
            Cancel
          </button>
        </>
      )}
      {error && <span id="account-msg">{error}</span>}
      <span className="account-hint">Optional. Guests can play; signing in lets saves follow you.</span>
    </div>
  );
}
