'use client';

import { AUCTION_CATEGORIES, DEFAULT_AUCTION_QUERY, MAX_COINS, timeLeftLabel, type AuctionQuery, type AuctionRow, type AuctionView, type DeskView, type MailKind, type MailRow } from '@solrift/shared';
import { useEffect, useState } from 'react';
import { useCamp } from '../camp/store';
import { CampSlot, ItemCard, Sheet, Stepper, itemName } from './CampParts';
import { CoinIcon } from './ShopUI';
import { TokenIcon } from './TokenPurse';

const REFRESH_MS = 8000;

type Sub = 'browse' | 'mine' | 'bids' | 'mail';

/** The board, asked again every few seconds while this tab is the one in view. */
function useBoard(query: AuctionQuery, hero: string) {
  const [view, setView] = useState<AuctionView | null>(null);
  const [error, setError] = useState('');
  const bump = useCamp((s) => s.view);
  useEffect(() => {
    let live = true;
    let ctl: AbortController | null = null;
    const load = async () => {
      ctl?.abort();
      ctl = new AbortController();
      const qs = new URLSearchParams({ q: query.q, cat: query.cat, sort: query.sort, desc: query.desc ? '1' : '0', page: String(query.page) });
      try {
        const res = await fetch(`/api/market?${qs}`, { credentials: 'same-origin', cache: 'no-store', signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { view: AuctionView };
        if (!live) return;
        setView(body.view);
        setError('');
      } catch (e) {
        if (!live || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError('The market cannot be reached right now.');
      }
    };
    void load();
    const id = window.setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    return () => {
      live = false;
      ctl?.abort();
      window.clearInterval(id);
    };
    // `bump`: a bid or a sale made here changes the board, so it is asked again at once.
  }, [query.q, query.cat, query.sort, query.desc, query.page, hero, bump]);
  return { view, error };
}

const timeText = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
};

const Price = ({ n, token }: { n: number; token?: boolean }) => (
  <span className="camp-price">
    {n.toLocaleString('en-US')} {token ? <TokenIcon size={13} /> : <CoinIcon size={13} />}
  </span>
);

const MAIL_NAME: Record<MailKind, string> = { sold: 'Sold', won: 'Won', outbid: 'Outbid', expired: 'Expired', cancelled: 'Cancelled' };

function Offer({ r, onClick }: { r: AuctionRow; onClick: () => void }) {
  return (
    <li>
      <button type="button" className={`camp-offer${r.leading ? ' lead' : ''}${r.yours ? ' mine' : ''}`} onClick={onClick} data-testid={`camp-offer-${r.id}`}>
        <CampSlot stack={r.item} />
        <span className="camp-offer-main">
          <b>{r.name}</b>
          <small>
            {r.yours ? 'You' : r.seller} &middot; {timeLeftLabel(r.left)} ({timeText(r.left)})
          </small>
        </span>
        <span className="camp-offer-price">
          <Price n={r.top > 0 ? r.top : r.bid} token={r.token} />
          <small>{r.leading ? 'your bid' : r.top > 0 ? 'current bid' : 'no bids'}</small>
          {r.buyout > 0 && (
            <small>
              buyout <Price n={r.buyout} token={r.token} />
            </small>
          )}
        </span>
      </button>
    </li>
  );
}

/** The Camp's market tab: look for things, bid, buy out, put your own up (from the Hero tab), cancel, and collect the mail. */
export function CampMarket({ view }: { view: DeskView }) {
  const act = useCamp((s) => s.act);
  const busy = useCamp((s) => s.busy);
  const [sub, setSub] = useState<Sub>('browse');
  const [query, setQuery] = useState<AuctionQuery>({ ...DEFAULT_AUCTION_QUERY });
  const [text, setText] = useState('');
  const [open, setOpen] = useState<AuctionRow | null>(null);
  const { view: board, error } = useBoard(query, view.hero.id);
  const mine = view.auctions.mine;
  const bids = view.auctions.bids;
  const mail = view.auctions.mail;
  const counts: Record<Sub, number> = { browse: 0, mine: mine.length, bids: bids.length, mail: mail.length };
  const names: Record<Sub, string> = { browse: 'Browse', mine: 'Selling', bids: 'Bids', mail: 'Mail' };

  const list = (rows: AuctionRow[], empty: string) => (
    <ul className="camp-list" data-testid={`camp-market-${sub}`}>
      {rows.length === 0 && <li className="camp-empty">{empty}</li>}
      {rows.map((r) => (
        <Offer key={r.id} r={r} onClick={() => setOpen(r)} />
      ))}
    </ul>
  );

  return (
    <div className="camp-pane" data-testid="camp-market">
      <div className="camp-subtabs" role="tablist" aria-label="The market">
        {(Object.keys(names) as Sub[]).map((s) => (
          <button key={s} role="tab" aria-selected={sub === s} className={sub === s ? 'on' : ''} onClick={() => setSub(s)}>
            {names[s]}
            {counts[s] > 0 && <b>{counts[s]}</b>}
          </button>
        ))}
      </div>

      {sub === 'browse' && (
        <>
          <form
            className="camp-search"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery((q) => ({ ...q, q: text.trim(), page: 0 }));
            }}
          >
            <input value={text} placeholder="Search by name" maxLength={40} aria-label="Search by name" onChange={(e) => setText(e.target.value)} />
            <button type="submit">Search</button>
          </form>
          <div className="camp-cats" role="group" aria-label="Category">
            {AUCTION_CATEGORIES.map((c) => (
              <button key={c.id} className={query.cat === c.id ? 'on' : ''} onClick={() => setQuery((q) => ({ ...q, cat: c.id, page: 0 }))}>
                {c.name}
              </button>
            ))}
          </div>
          {error && <p className="camp-warn small">{error}</p>}
          {!board && !error ? <p className="camp-empty">Reading the ledgers...</p> : list(board?.rows ?? [], query.q || query.cat !== 'all' ? 'Nothing for sale matches that.' : 'Nothing is up for sale right now.')}
          {board && board.pages > 1 && (
            <div className="camp-pager">
              <button disabled={board.query.page <= 0} aria-label="Previous page" onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}>
                &lt;
              </button>
              <span>
                Page {board.query.page + 1} of {board.pages}
              </span>
              <button disabled={board.query.page + 1 >= board.pages} aria-label="Next page" onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}>
                &gt;
              </button>
            </div>
          )}
          <p className="camp-hint">To put something up, tap it in your bags on the Hero tab.</p>
        </>
      )}

      {sub === 'mine' && list(mine, 'You have nothing up. Tap an item in your bags to sell it.')}
      {sub === 'bids' && list(bids, 'You hold no bids right now.')}
      {sub === 'mail' && (
        <>
          <ul className="camp-list" data-testid="camp-market-mail">
            {mail.length === 0 && <li className="camp-empty">Nothing is waiting for you.</li>}
            {mail.map((m) => (
              <Letter key={m.id} m={m} busy={busy || view.inGame} take={() => void act({ a: 'auction', c: { a: 'take', id: m.id } })} />
            ))}
          </ul>
          {mail.length > 1 && (
            <button type="button" className="camp-btn primary" disabled={busy || view.inGame} onClick={() => void act({ a: 'auction', c: { a: 'take', id: 0 } })}>
              Collect it all
            </button>
          )}
          {view.inGame && mail.length > 0 && <p className="camp-hint">Leave the game to collect your mail.</p>}
        </>
      )}

      {open && <OfferSheet r={open} coins={view.hero.coins} locked={view.inGame} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Letter({ m, busy, take }: { m: MailRow; busy: boolean; take: () => void }) {
  return (
    <li className={`camp-letter k-${m.kind}`}>
      {m.item ? <CampSlot stack={m.item} /> : <span className="camp-slot coin">{<CoinIcon size={26} />}</span>}
      <span className="camp-offer-main">
        <b>{m.subject}</b>
        <small>
          {MAIL_NAME[m.kind]}
          {m.coins > 0 && (
            <>
              {' '}&middot; <Price n={m.coins} />
            </>
          )}
        </small>
      </span>
      <button type="button" className="camp-btn" disabled={busy} onClick={take}>
        Collect
      </button>
    </li>
  );
}

function OfferSheet({ r, coins, locked, onClose }: { r: AuctionRow; coins: number; locked: boolean; onClose: () => void }) {
  const act = useCamp((s) => s.act);
  const busy = useCamp((s) => s.busy);
  const [amount, setAmount] = useState(r.next);
  const fin = (p: Promise<boolean>) => void p.then((ok) => ok && onClose());
  const why = locked ? 'Leave the game to bid.' : r.token ? 'This one is priced in $SOLRIFT: bid on it in the game.' : null;
  return (
    <Sheet title={itemName(r.item)} onClose={onClose}>
      <ItemCard stack={r.item} />
      <p className="camp-hint">
        {r.yours ? 'You put this one up.' : `Sold by ${r.seller}.`} {timeLeftLabel(r.left)}: {timeText(r.left)} left. You have {coins.toLocaleString('en-US')} Auren.
      </p>
      {r.yours ? (
        <div className="camp-actions">
          <button type="button" className="camp-btn" disabled={busy || locked || r.top > 0} onClick={() => fin(act({ a: 'auction', c: { a: 'cancel', id: r.id } }))}>
            Cancel the auction
          </button>
          {r.top > 0 && <p className="camp-hint">It has a bid on it: it can only be cancelled while it has none.</p>}
        </div>
      ) : (
        <div className="camp-actions">
          {why && <p className="camp-warn small">{why}</p>}
          <label>
            Your bid (at least {r.next.toLocaleString('en-US')}) <CoinIcon size={14} />
            <Stepper label="bid" value={amount} min={0} max={MAX_COINS} onChange={setAmount} />
          </label>
          <button type="button" className="camp-btn primary" disabled={busy || !!why || amount < r.next} onClick={() => fin(act({ a: 'auction', c: { a: 'bid', id: r.id, amount } }))}>
            Bid {amount.toLocaleString('en-US')}
          </button>
          {r.buyout > 0 && (
            <button type="button" className="camp-btn" disabled={busy || !!why} onClick={() => fin(act({ a: 'auction', c: { a: 'buyout', id: r.id } }))}>
              Buy out for {r.pay.toLocaleString('en-US')}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
