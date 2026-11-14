'use client';

import { useEffect, useState } from 'react';
import { shortAddress, useAuth } from '../auth/store';

/** Wallet sign-in for the start/pause overlay. Guests can ignore it and just play. */
export function AccountPanel() {
  const { status, account, wallets, busy, error, init, login, logout } = useAuth();
  const [picking, setPicking] = useState(false);

  useEffect(() => init(), [init]);

  if (status === 'loading') return <div className="account-panel" data-no-play />;

  if (status === 'in' && account) {
    return (
      <div className="account-panel" data-no-play>
        <span id="account-name">
          Signed in as <b>{account.displayName}</b> &middot; <code title={account.wallet}>{shortAddress(account.wallet)}</code>
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
        <button id="signin" disabled={busy} onClick={() => setPicking(true)}>
          Sign in with Solana wallet
        </button>
      ) : wallets.length === 0 ? (
        <span id="account-msg">
          No Solana wallet found. Install Phantom, Solflare or Backpack, then reload.{' '}
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
