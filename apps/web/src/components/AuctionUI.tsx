'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AUCTION_CATEGORIES,
  AUCTION_HOURS,
  AUCTION_RULES,
  HOTBAR_SLOTS,
  cloneStack,
  depositFor,
  formatCoins,
  houseCut,
  sellBlocker,
  stackSellPrice,
  timeLeftLabel,
  tooltipLines,
  tooltipName,
  type AuctionCategory,
  type AuctionHours,
  type AuctionQuery,
  type AuctionRow,
  type AuctionSort,
  type MailRow,
  type NpcDef,
  type TipLine,
} from '@solrift/shared';
import { useUi } from '../ui/store';
import { ItemView, Tip } from './ItemView';
import { CoinIcon, CoinPurse } from './ShopUI';
import { TokenIcon } from './TokenPurse';
import { useToken } from '../token/store';
import './shop.css';
import './auction.css';

type Tab = 'browse' | 'sell' | 'auctions' | 'bids' | 'mail';
const TABS: { id: Tab; name: string }[] = [
  { id: 'browse', name: 'Browse' },
  { id: 'sell', name: 'Sell' },
  { id: 'auctions', name: 'My Auctions' },
  { id: 'bids', name: 'My Bids' },
  { id: 'mail', name: 'Mail' },
];

/** The ledger refreshes by itself this often (ms), as other players bid and buy. */
const REFRESH_MS = 5000;

const Price = ({ n, title, token }: { n: number; title?: string; token?: boolean }) => (
  <span className={`auc-price${token ? ' token' : ''}`} title={token ? `${title ?? 'Price'} (in $SOLRIFT)` : title}>
    {n.toLocaleString('en-US')}
    {token ? <TokenIcon size={14} /> : <CoinIcon size={14} />}
  </span>
);

/** A whole number from what was typed (0 when it is not one). */
const whole = (text: string): number => {
  const n = Math.floor(Number(text.replace(/[^\d]/g, '')));
  return Number.isFinite(n) ? Math.min(n, 999_999_999) : 0;
};

/**
 * The Auction House, in the manner of World of Warcraft's: browse what is up (search, shelf, sort), bid or buy out, put your own
 * things up for a deposit, watch your auctions and bids, and collect what you are owed from the mail. The Auctioneer's
 * window shows the house as the server last sent it, and asks again every few seconds.
 */
export function AuctionWindow({ npc }: { npc: NpcDef }) {
  const api = useUi((s) => s.api);
  const view = useUi((s) => s.auction);
  const coins = useUi((s) => s.coins);
  /** Your $SOLRIFT, as the server counts it for trading (null: you cannot trade in it here). */
  const tokens = view?.tokens ? view.tokens.balance : null;
  /** What you can pay for an auction: its own currency. */
  const funds = (r: { token: boolean }) => (r.token ? (tokens ?? 0) : coins);
  useUi((s) => s.version);
  const cls = useUi((s) => s.cls);
  const [tab, setTab] = useState<Tab>('browse');
  useEffect(() => {
    // the balance in the corner of the game follows what the house says it is now
    if (tokens !== null) void useToken.getState().loadMe();
  }, [tokens]);
  const [tip, setTip] = useState<TipLine[]>([]);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [bidText, setBidText] = useState('');
  // The sale being prepared: the slot of the bags, how many, the prices and how long.
  const [slot, setSlot] = useState<number | null>(null);
  const [count, setCount] = useState('1');
  const [startBid, setStartBid] = useState('');
  const [buyout, setBuyout] = useState('');
  const [hours, setHours] = useState<AuctionHours>(24);
  const [inTokens, setInTokens] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const query = useRef<AuctionQuery | null>(null);
  query.current = view?.query ?? null;

  const placeTip = () => {
    const el = tipRef.current;
    if (!el) return;
    const { x, y } = mouse.current;
    const m = 6;
    let tx = x + 14;
    if (tx + el.offsetWidth > window.innerWidth - m) tx = Math.max(m, x - 14 - el.offsetWidth);
    const ty = Math.max(m, Math.min(y - 34, window.innerHeight - el.offsetHeight - m));
    el.style.transform = `translate(${tx}px, ${ty}px)`;
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      placeTip();
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  useEffect(placeTip);

  // The house is asked again now and then, so that what others do shows up without a click.
  useEffect(() => {
    if (!api) return;
    const id = window.setInterval(() => {
      const q = query.current;
      if (q) api.auction({ a: 'search', ...q });
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [api]);

  if (!api) return null;
  if (!view) {
    return (
      <div id="menu-screen" className="shop-screen" data-testid="quest-dialog">
        <div className="menu-wrap">
          <div className="panel wow shop-win auction-win" data-testid="auction-panel">
            <div className="title">{npc.name}</div>
            <p className="shop-line">The Auctioneer is opening his ledgers...</p>
          </div>
        </div>
      </div>
    );
  }

  const myClass = cls?.id ?? null;
  const myLevel = cls?.level ?? 0;
  const search = (over: Partial<AuctionQuery>) => api.auction({ a: 'search', ...view.query, ...over });
  const show = (lines: TipLine[]) => () => setTip(lines);
  const hide = () => setTip([]);

  const counts: Record<Tab, number> = { browse: 0, sell: 0, auctions: view.mine.length, bids: view.bids.length, mail: view.mail.length };

  // ---- one row of a list -----------------------------------------------------------------------------------
  const rowCells = (r: AuctionRow, extra?: ReactNode) => {
    const lines = tooltipLines(r.item, myClass, myLevel);
    return (
      <>
        <span className="auc-cell auc-item" onMouseEnter={show(lines)} onMouseLeave={hide}>
          <span className="slot auc-slot">
            <ItemView stack={r.item} />
          </span>
          <span className="auc-name">{r.name}</span>
        </span>
        <span className="auc-cell auc-left" title={`${Math.ceil(r.left / 3600)}h left`}>
          {timeLeftLabel(r.left)}
        </span>
        <span className="auc-cell auc-seller">{r.yours ? 'You' : r.seller}</span>
        <span className="auc-cell auc-num">
          <Price n={r.top > 0 ? r.top : r.bid} title={r.top > 0 ? 'Current bid' : 'Starting bid'} token={r.token} />
          {r.leading ? <small className="auc-lead">your bid</small> : r.top > 0 ? <small>bid on</small> : null}
        </span>
        <span className="auc-cell auc-num">{r.buyout > 0 ? <Price n={r.buyout} title="Buyout" token={r.token} /> : <small>no buyout</small>}</span>
        {extra}
      </>
    );
  };

  // ---- the shelves -------------------------------------------------------------------------------------------
  const sortHead = (sort: AuctionSort, label: string, cls2: string) => (
    <button className={`auc-sort ${cls2}${view.query.sort === sort ? ' on' : ''}`} data-testid={`auction-sort-${sort}`} onClick={() => search({ sort, desc: view.query.sort === sort ? !view.query.desc : false, page: 0 })}>
      {label}
      {view.query.sort === sort ? (view.query.desc ? ' \u25BE' : ' \u25B4') : ''}
    </button>
  );

  const chosen = view.rows.find((r) => r.id === picked) ?? null;
  const chosenBid = chosen ? Math.max(chosen.next, whole(bidText)) : 0;

  const browse = (
    <div className="auc-browse">
      <div className="auc-cats" data-testid="auction-cats">
        {AUCTION_CATEGORIES.map((c) => (
          <button key={c.id} className={`auc-cat${view.query.cat === c.id ? ' on' : ''}`} data-testid={`auction-cat-${c.id}`} onClick={() => search({ cat: c.id as AuctionCategory, page: 0 })}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="auc-main">
        <form
          className="auc-search"
          onSubmit={(e) => {
            e.preventDefault();
            search({ q: text, page: 0 });
          }}
        >
          <input value={text} placeholder="Search by name" maxLength={40} data-testid="auction-search" onChange={(e) => setText(e.target.value)} />
          <button className="quest-btn small" data-testid="auction-search-go" type="submit">
            Search
          </button>
        </form>
        <div className="auc-head">
          {sortHead('name', 'Item', 'auc-item')}
          {sortHead('ending', 'Time left', 'auc-left')}
          <span className="auc-sort static auc-seller">Seller</span>
          {sortHead('bid', 'Bid', 'auc-num')}
          {sortHead('buyout', 'Buyout', 'auc-num')}
        </div>
        <div className="auc-list" data-testid="auction-list">
          {view.rows.length === 0 ? <p className="auc-empty">Nothing is up for sale that matches.</p> : null}
          {view.rows.map((r) => (
            <button key={r.id} className={`auc-row${r.id === picked ? ' on' : ''}${r.yours ? ' mine' : ''}`} data-testid={`auction-row-${r.id}`} data-name={r.name} onClick={() => (setPicked(r.id), setBidText(String(r.next)))}>
              {rowCells(r)}
            </button>
          ))}
        </div>
        <div className="auc-pager">
          <button className="quest-btn small secondary" data-testid="auction-prev" disabled={view.query.page <= 0} onClick={() => search({ page: view.query.page - 1 })}>
            &lt;
          </button>
          <span data-testid="auction-page">
            Page {view.query.page + 1} of {view.pages} &middot; {view.total} {view.total === 1 ? 'auction' : 'auctions'}
          </span>
          <button className="quest-btn small secondary" data-testid="auction-next" disabled={view.query.page + 1 >= view.pages} onClick={() => search({ page: view.query.page + 1 })}>
            &gt;
          </button>
        </div>
        <div className="auc-buy" data-testid="auction-buy">
          {chosen ? (
            <>
              <span className="auc-buy-name">{chosen.name}</span>
              <label className="auc-field">
                <span>Your bid</span>
                <input value={bidText} inputMode="numeric" data-testid="auction-bid-input" onChange={(e) => setBidText(e.target.value.replace(/[^\d]/g, ''))} />
              </label>
              <button
                className="quest-btn small"
                data-testid="auction-bid"
                disabled={chosen.yours || chosen.leading || chosenBid > funds(chosen) || (chosen.buyout > 0 && chosenBid > chosen.buyout)}
                title={chosen.yours ? 'Your own auction' : chosen.leading ? 'You hold the highest bid' : `At least ${chosen.next}`}
                onClick={() => api.auction({ a: 'bid', id: chosen.id, amount: chosenBid })}
              >
                Bid
              </button>
              <button className="quest-btn small" data-testid="auction-buyout" disabled={chosen.yours || chosen.buyout <= 0 || chosen.pay > funds(chosen)} onClick={() => api.auction({ a: 'buyout', id: chosen.id })}>
                Buyout{chosen.buyout > 0 ? ` (${chosen.pay.toLocaleString('en-US')})` : ''}
              </button>
            </>
          ) : (
            <span className="auc-hint">Choose an auction to bid on it or buy it out.</span>
          )}
        </div>
      </div>
    </div>
  );

  // ---- selling -------------------------------------------------------------------------------------------------------
  const size = api.inventory.size;
  const hotbar = Array.from({ length: Math.min(HOTBAR_SLOTS, size) }, (_, i) => i);
  const backpack = Array.from({ length: Math.max(0, size - HOTBAR_SLOTS) }, (_, i) => HOTBAR_SLOTS + i).filter((i) => api.inventory.isUsable(i));
  const held = slot !== null ? api.inventory.get(slot) : null;
  const saleCount = held ? Math.max(1, Math.min(held.count, whole(count))) : 0;
  const offered = held ? { ...cloneStack(held), count: saleCount } : null;
  const deposit = offered ? depositFor(offered, hours) : 0;
  const bidNum = whole(startBid);
  const buyNum = whole(buyout);
  const payToken = inTokens && tokens !== null;
  const top = payToken ? AUCTION_RULES.maxToken : 999_999_999;
  const problem = !held ? 'Choose an item from your bags.' : sellBlocker(held) ?? (bidNum < 1 ? 'Set a starting bid.' : bidNum > top || buyNum > top ? `The most is ${top.toLocaleString('en-US')} $SOLRIFT.` : buyNum > 0 && buyNum < bidNum ? 'The buyout is under the starting bid.' : deposit > coins ? 'You cannot afford the deposit.' : view.mine.length >= AUCTION_RULES.maxListings ? 'You have too many auctions up.' : null);

  const pick = (i: number) => {
    const s = api.inventory.get(i);
    setSlot(i);
    if (!s) return;
    const each = stackSellPrice(s);
    const base = Math.max(1, each * s.count);
    setCount(String(s.count));
    setStartBid(String(Math.ceil(base * 1.5)));
    setBuyout(String(Math.ceil(base * 2.5)));
  };

  const bagSlot = (i: number) => {
    const s = api.inventory.get(i);
    const ok = !!s && sellBlocker(s) === null;
    return (
      <button
        key={i}
        className={`slot shop-slot${ok ? ' sellable' : s ? ' unsellable' : ''}${slot === i ? ' picked' : ''}`}
        data-testid={`auction-slot-${i}`}
        disabled={!ok}
        onMouseEnter={show(s ? tooltipLines(s, myClass, myLevel) : [])}
        onMouseLeave={hide}
        onClick={() => pick(i)}
      >
        <ItemView stack={s} />
      </button>
    );
  };

  const sell = (
    <div className="auc-sell">
      <div className="auc-bags">
        <div className="slot-grid shop-bags" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
          {backpack.map(bagSlot)}
        </div>
        <div className="slot-grid shop-bags hotbar" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
          {hotbar.map(bagSlot)}
        </div>
      </div>
      <div className="auc-form" data-testid="auction-form">
        <div className="auc-form-item">
          <span className="slot auc-slot big">
            <ItemView stack={offered} />
          </span>
          <span className="auc-name">{offered ? tooltipName(offered) : 'Nothing chosen'}</span>
        </div>
        {tokens !== null ? (
          <div className="auc-field">
            <span>Price in</span>
            <div className="auc-hours" data-testid="auction-currency">
              <button className={`auc-hour${!payToken ? ' on' : ''}`} data-testid="auction-currency-auren" onClick={() => setInTokens(false)}>
                Auren
              </button>
              <button className={`auc-hour${payToken ? ' on' : ''}`} data-testid="auction-currency-token" onClick={() => setInTokens(true)}>
                $SOLRIFT
              </button>
            </div>
          </div>
        ) : null}
        <label className="auc-field">
          <span>Quantity</span>
          <input value={count} inputMode="numeric" data-testid="auction-count" disabled={!held || held.count < 2} onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
        <label className="auc-field">
          <span>Starting bid</span>
          <input value={startBid} inputMode="numeric" data-testid="auction-start" onChange={(e) => setStartBid(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
        <label className="auc-field">
          <span>Buyout (optional)</span>
          <input value={buyout} inputMode="numeric" data-testid="auction-buyout-price" onChange={(e) => setBuyout(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
        <div className="auc-field">
          <span>Duration</span>
          <div className="auc-hours">
            {AUCTION_HOURS.map((h) => (
              <button key={h} className={`auc-hour${hours === h ? ' on' : ''}`} data-testid={`auction-hours-${h}`} onClick={() => setHours(h)}>
                {h}h
              </button>
            ))}
          </div>
        </div>
        <div className="auc-sum">
          <div>
            <span>Deposit</span>
            <Price n={deposit} />
          </div>
          <small>Paid now. Returned when it sells; lost if it does not.</small>
          {buyNum > 0 ? (
            <div>
              <span>You get at a buyout</span>
              <Price n={buyNum - houseCut(buyNum)} token={payToken} />
            </div>
          ) : null}
          <small>
            The house keeps {Math.round(AUCTION_RULES.cut * 100)}% of a sale.
            {payToken ? ' You are paid in $SOLRIFT, straight into your wallet balance; the deposit is still in Auren.' : ''}
          </small>
        </div>
        <button
          className="quest-btn"
          data-testid="auction-post"
          disabled={!!problem}
          title={problem ?? undefined}
          onClick={() => {
            if (slot === null || problem) return;
            api.auction({ a: 'post', slot, count: saleCount, bid: bidNum, buyout: buyNum, hours, ...(payToken ? { token: true } : {}) });
            setSlot(null);
          }}
        >
          Create Auction
        </button>
        {problem && held ? <span className="auc-problem">{problem}</span> : null}
      </div>
    </div>
  );

  // ---- what is yours --------------------------------------------------------------------------------------------------
  const mine = (
    <div className="auc-lists">
      <div className="auc-head">
        <span className="auc-sort static auc-item">Item</span>
        <span className="auc-sort static auc-left">Time left</span>
        <span className="auc-sort static auc-seller">Seller</span>
        <span className="auc-sort static auc-num">Bid</span>
        <span className="auc-sort static auc-num">Buyout</span>
        <span className="auc-sort static auc-act" />
      </div>
      <div className="auc-list tall" data-testid="auction-mine">
        {view.mine.length === 0 ? <p className="auc-empty">You have nothing up for sale.</p> : null}
        {view.mine.map((r) => (
          <div key={r.id} className="auc-row static" data-testid={`auction-mine-${r.id}`}>
            {rowCells(
              r,
              <span className="auc-cell auc-act">
                <button className="quest-btn small danger" data-testid={`auction-cancel-${r.id}`} disabled={r.top > 0} title={r.top > 0 ? 'Somebody has bid on it' : 'Take it down (the deposit is lost)'} onClick={() => api.auction({ a: 'cancel', id: r.id })}>
                  Cancel
                </button>
              </span>,
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const bids = (
    <div className="auc-lists">
      <div className="auc-head">
        <span className="auc-sort static auc-item">Item</span>
        <span className="auc-sort static auc-left">Time left</span>
        <span className="auc-sort static auc-seller">Seller</span>
        <span className="auc-sort static auc-num">Bid</span>
        <span className="auc-sort static auc-num">Buyout</span>
        <span className="auc-sort static auc-act" />
      </div>
      <div className="auc-list tall" data-testid="auction-bids">
        {view.bids.length === 0 ? <p className="auc-empty">You hold no bids. When you are outbid, your coins come back by mail (your $SOLRIFT, straight to your balance).</p> : null}
        {view.bids.map((r) => (
          <div key={r.id} className="auc-row static" data-testid={`auction-bid-${r.id}`}>
            {rowCells(
              r,
              <span className="auc-cell auc-act">
                <button className="quest-btn small" disabled={r.buyout <= 0 || r.pay > funds(r)} onClick={() => api.auction({ a: 'buyout', id: r.id })}>
                  Buyout
                </button>
              </span>,
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ---- the mail ---------------------------------------------------------------------------------------------------
  const letter = (m: MailRow) => (
    <div key={m.id} className="auc-row static mail" data-testid={`auction-mail-${m.id}`} data-kind={m.kind}>
      <span className="auc-cell auc-item" onMouseEnter={show(m.item ? tooltipLines(m.item, myClass, myLevel) : [])} onMouseLeave={hide}>
        <span className="slot auc-slot">{m.item ? <ItemView stack={m.item} /> : <CoinIcon size={26} />}</span>
        <span className="auc-name">{m.subject}</span>
      </span>
      <span className="auc-cell auc-num">{m.coins > 0 ? <Price n={m.coins} /> : null}</span>
      <span className="auc-cell auc-act">
        <button className="quest-btn small" data-testid={`auction-take-${m.id}`} onClick={() => api.auction({ a: 'take', id: m.id })}>
          Take
        </button>
      </span>
    </div>
  );
  const owed = view.mail.reduce((n, m) => n + m.coins, 0);
  const mail = (
    <div className="auc-lists">
      <div className="auc-mailbar">
        <span>
          {view.mail.length} {view.mail.length === 1 ? 'letter' : 'letters'}
          {owed > 0 ? <> &middot; {formatCoins(owed)}</> : null}
        </span>
        <button className="quest-btn small" data-testid="auction-take-all" disabled={view.mail.length === 0} onClick={() => api.auction({ a: 'take', id: 0 })}>
          Take all
        </button>
      </div>
      <div className="auc-list tall" data-testid="auction-mail">
        {view.mail.length === 0 ? <p className="auc-empty">No mail. What you win, sell or get back comes here.</p> : null}
        {view.mail.map(letter)}
      </div>
    </div>
  );

  return (
    <div id="menu-screen" className="shop-screen auction-screen" data-testid="quest-dialog" onContextMenu={(e) => e.preventDefault()}>
      <div className="menu-wrap">
        <div className="panel wow shop-win auction-win" data-testid="auction-panel">
          <div className="title">{npc.name}</div>
          <button className="wow-close" aria-label="Close" onClick={() => api.close()}>
            &times;
          </button>
          <div className="wow-head">
            <span>Auction House</span>
            <span className="shop-sub">{view.member ? 'Browse, bid and sell' : 'Sign in to bid and sell'}</span>
          </div>
          <div className="auc-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`auc-tab${tab === t.id ? ' on' : ''}`} data-testid={`auction-tab-${t.id}`} onClick={() => setTab(t.id)}>
                {t.name}
                {counts[t.id] > 0 ? <b>{counts[t.id]}</b> : null}
              </button>
            ))}
          </div>
          {tab === 'browse' ? browse : tab === 'sell' ? sell : tab === 'auctions' ? mine : tab === 'bids' ? bids : mail}
          <div className="wow-foot shop-foot" data-testid="shop-coins">
            <button className="quest-btn secondary" onClick={() => api.close()}>
              Goodbye
            </button>
            <span className="wow-foot-label">You carry</span>
            <CoinPurse always />
            {tokens !== null ? (
              <span className="auc-tokens" data-testid="auction-tokens" data-balance={tokens} title="Your $SOLRIFT, for auctions priced in it">
                <TokenIcon size={16} />
                {tokens.toLocaleString('en-US')}
                <small>$SOLRIFT</small>
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div ref={tipRef} className="tooltip" style={{ display: tip.length ? 'block' : 'none' }}>
        <Tip lines={tip} />
      </div>
    </div>
  );
}
