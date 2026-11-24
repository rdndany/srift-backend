'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/store';
import { goShop } from './frontNav';
import { txUrl, useToken, type LedgerRow } from '../token/store';
import './tokenShop.css';

const STATUS_LABEL: Record<LedgerRow['status'], string> = { ok: 'Credited', pending: 'On its way', done: 'Sent', failed: 'Cancelled' };

/** Reads the signed-in wallet's balance whenever the account changes, and again every few seconds while a withdrawal is on its way. */
export function useTokenBalance(): void {
  const wallet = useAuth((s) => s.account?.wallet ?? null);
  const live = useToken((s) => s.info?.live ?? false);
  const waiting = useToken((s) => !!s.me?.pending);
  const loadMe = useToken((s) => s.loadMe);
  const clearMe = useToken((s) => s.clearMe);
  useEffect(() => {
    if (wallet && live) void loadMe();
    else clearMe();
  }, [wallet, live, loadMe, clearMe]);
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => void loadMe(), 6000);
    return () => window.clearInterval(id);
  }, [waiting, loadMe]);
}

/**
 * What your $SOLRIFT can be spent on (today: more hero slots for your wallet). `compact` is the one-line form the lobby shows when
 * all the character slots are full. Nothing is shown until the token is live, you are signed in, and something is for sale.
 */
export function TokenShop({ compact = false }: { compact?: boolean }) {
  const info = useToken((s) => s.info);
  const me = useToken((s) => s.me);
  const busy = useToken((s) => s.busy);
  const buy = useToken((s) => s.buy);
  // The lobby's offer is the one-line form: what is kept for good (a slot, a tab). Keys and outfits are bought in the Shop (`/shop`).
  const items = compact ? me?.shop.filter((i) => !i.consumable) : me?.shop;
  if (!info?.live || !me || !items || items.length === 0) return null;
  return (
    <div className={`tkshop${compact ? ' compact' : ''}`} data-testid="token-shop">
      {!compact && <h4>Spend it</h4>}
      <ul>
        {items.map((item) => {
          const short = item.price !== null ? Math.max(0, item.price - me.balance) : 0;
          return (
            <li key={item.sku} data-sku={item.sku}>
              <span className="tkshop-what">
                <b>{item.name}</b>
                <small>
                  {item.blurb} {item.consumable ? `You hold ${item.owned} (up to ${item.max}).` : `${item.owned} of ${item.max} bought.`}
                </small>
              </span>
              {item.price === null ? (
                <span className="tkshop-done">{item.consumable ? 'You hold the most' : 'All bought'}</span>
              ) : (
                <button type="button" disabled={busy || short > 0} data-testid={`token-buy-${item.sku}`} onClick={() => void buy(item.sku)}>
                  {busy ? 'Buying\u2026' : `Buy for ${item.price.toLocaleString()} $SOLRIFT`}
                </button>
              )}
              {item.price !== null && short > 0 && <small className="tkshop-short">You need {short.toLocaleString()} more.</small>}
            </li>
          );
        })}
      </ul>
      {compact ? (
        <button type="button" className="tkshop-link" onClick={goShop}>
          More in the Shop
        </button>
      ) : (
        <p className="tkshop-fine">What you spend stays with the game's treasury and pays for later rewards. Nothing is burned.</p>
      )}
    </div>
  );
}

/** Your $SOLRIFT: the balance the game has earned for the signed-in wallet, the withdraw form, and what happened to it. Not shown until the token is live. */
export function TokenWallet() {
  const info = useToken((s) => s.info);
  const me = useToken((s) => s.me);
  const busy = useToken((s) => s.busy);
  const withdraw = useToken((s) => s.withdraw);
  const status = useAuth((s) => s.status);
  const [text, setText] = useState('');

  if (!info?.live) return null;

  if (status !== 'in' || !me) {
    return (
      <div className="tk-wallet fp-px" data-testid="token-wallet">
        <p className="tk-wallet-in">
          {status === 'loading' ? 'Looking for your wallet\u2026' : 'Sign in with your Solana wallet (top right) to see the $SOLRIFT you have earned and send it to your wallet.'}
        </p>
      </div>
    );
  }

  const amount = Number(text);
  const most = Math.max(0, Math.min(me.balance, me.withdrawableToday));
  const { minWithdraw } = info.limits;
  const problem =
    text === '' ? '' : !Number.isInteger(amount) || amount < 1 ? 'Enter a whole number.' : amount < minWithdraw ? `The least is ${minWithdraw}.` : amount > me.balance ? 'More than you have.' : amount > me.withdrawableToday ? `Only ${me.withdrawableToday.toLocaleString()} more today.` : '';
  const canSend = info.withdrawals && !busy && !me.pending && text !== '' && !problem;

  return (
    <div className="tk-wallet fp-px" data-testid="token-wallet">
      <div className="tk-wallet-top">
        <div>
          <small>Your balance</small>
          <b className="tk-balance" data-testid="token-balance">
            {me.balance.toLocaleString()} <em>$SOLRIFT</em>
          </b>
        </div>
        <p>
          Earned by winning achievements and clearing dungeons, and kept with your wallet, whichever hero you play.
          {me.pending ? ` ${me.pending.amount.toLocaleString()} is on its way to your wallet now.` : ''}
        </p>
      </div>

      <form
        className="tk-send"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) void withdraw(amount).then(() => setText(''));
        }}
      >
        <label>
          <span>Send to my wallet</span>
          <input type="number" inputMode="numeric" min={minWithdraw} step={1} placeholder={`${minWithdraw} or more`} value={text} disabled={!info.withdrawals || busy} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="button" className="tk-max" disabled={!info.withdrawals || busy || most < minWithdraw} onClick={() => setText(String(most))}>
          Max
        </button>
        <button type="submit" className="tk-go" disabled={!canSend} data-testid="token-withdraw">
          {busy ? 'Sending\u2026' : 'Withdraw'}
        </button>
      </form>
      {!info.withdrawals ? (
        <p className="tk-wallet-msg">Withdrawals are not open yet. Your balance is safe and keeps growing; you will be able to send it to your wallet as soon as they open.</p>
      ) : (
        <p className="tk-wallet-msg">
          At least {minWithdraw.toLocaleString()} at a time, up to {info.limits.walletDailyWithdraw.toLocaleString()} a day ({me.withdrawableToday.toLocaleString()} left today). It goes to the wallet you signed in with.
        </p>
      )}
      {problem && <p className="tk-wallet-msg warn">{problem}</p>}

      <div className="tk-toshop" data-testid="token-to-shop">
        <span>
          <b>Spend it in the Shop</b>
          <small>Hero slots, stash tabs, Hollow Keys and outfits for every class.</small>
        </span>
        <button type="button" className="tk-go" onClick={goShop}>
          Open the Shop
        </button>
      </div>

      {me.history.length > 0 && (
        <ul className="tk-ledger" aria-label="Your $SOLRIFT history">
          {me.history.map((h) => {
            const link = h.signature && h.kind === 'withdraw' ? txUrl(info, h.signature) : null;
            return (
              <li key={h.id} className={`${h.kind} ${h.status}`}>
                <span className="tk-l-what">
                  <b>{h.label}</b>
                  <small>{new Date(h.at).toLocaleString()}</small>
                </span>
                <span className="tk-l-amt">
                  {h.amount > 0 ? '+' : '\u2212'}
                  {Math.abs(h.amount).toLocaleString()}
                </span>
                <span className={`tk-l-state ${h.status}`}>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      {STATUS_LABEL[h.status]}
                    </a>
                  ) : h.kind === 'spend' ? (
                    'Spent'
                  ) : h.kind === 'trade' || h.kind === 'fee' ? (
                    h.amount > 0 ? 'Received' : 'Paid'
                  ) : (
                    STATUS_LABEL[h.status]
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
