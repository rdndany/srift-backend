'use client';

import {
  AUCTION_CATEGORIES,
  AUCTION_HOURS,
  AUCTION_RULES,
  B,
  DEFAULT_AUCTION_QUERY,
  GAME_VERSION,
  HOUSE_NAME,
  MAX_COINS,
  depositFor,
  sellBlocker,
  stackSellPrice,
  timeLeftLabel,
  tooltipLines,
  type AuctionHours,
  type AuctionQuery,
  type AuctionRow,
  type AuctionSort,
  type AuctionView,
  type DeskView,
  type ItemStack,
  type MailKind,
  type MailRow,
  type TipLine,
} from '@solrift/shared';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth/store';
import { useCamp } from '../camp/store';
import { AccountPanel } from './AccountPanel';
import { Blocks } from './BlockCube';
import { ItemPicture } from './CharacterSheet';
import { ClickSparks, Embers, Reveal, useFrontMotion } from './fx';
import { lobbyUrl } from '../game/route';
import { SCROLL_KEY, goBeyond, goToken, goFarm, goShop } from './frontNav';
import { ART } from './homeAssets';
import { Tip } from './ItemView';
import { CoinIcon } from './ShopUI';
import { TokenIcon } from './TokenPurse';
import './home.css';
import './front.css';
import './classPage.css';
import './sheet.css';
import './marketPage.css';
import './responsive.css';

/** How often the board asks the server again (ms), so that what others bid and buy shows up without a click. */
const REFRESH_MS = 5000;

type Tab = 'browse' | 'sell' | 'auctions' | 'bids' | 'mail';

interface MarketReply {
  view: AuctionView;
  players: number;
  max: number;
  now: number;
  user: string | null;
}

/** Goes to a part of the front page (its menu leads there too). */
const toFront = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(SCROLL_KEY, id);
  } catch {
    /* no storage: the page just opens at the top */
  }
  location.assign('/');
};

/** Asks the server for the board, again every few seconds (not while the tab is hidden), and again whenever the query, the account or a trade changes. */
function useMarket(query: AuctionQuery, account: string | null) {
  const [reply, setReply] = useState<MarketReply | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    let ctl: AbortController | null = null;
    const load = async () => {
      ctl?.abort();
      ctl = new AbortController();
      const qs = new URLSearchParams({ q: query.q, cat: query.cat, sort: query.sort, desc: query.desc ? '1' : '0', page: String(query.page) });
      try {
        const res = await fetch(`/api/market?${qs}`, { credentials: 'same-origin', cache: 'no-store', signal: ctl.signal });
        if (!res.ok) throw new Error(res.status === 429 ? 'Too many requests: wait a moment.' : res.status === 404 ? 'The game server is running an older version without the market. It needs to be updated.' : `The market answered ${res.status}.`);
        const body = (await res.json()) as MarketReply;
        if (!live) return;
        setReply(body);
        setError('');
      } catch (e) {
        if (!live || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError(e instanceof Error && /^(Too many|The game server)/.test(e.message) ? e.message : 'The market cannot be reached right now. The game server may be offline.');
      }
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => {
      live = false;
      ctl?.abort();
      window.clearInterval(id);
    };
  }, [query.q, query.cat, query.sort, query.desc, query.page, account, tick]);
  return { reply, error, reload: () => setTick((n) => n + 1) };
}

/** The time left, as the game tells it plus the hours and minutes: "Long (7h 20m)". */
const leftText = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
};

const Price = ({ n, title, token }: { n: number; title?: string; token?: boolean }) => (
  <span className="mk-price" title={token ? `${title ?? 'Price'} (in $SOLRIFT)` : title}>
    {n.toLocaleString('en-US')}
    {token ? <TokenIcon size={14} /> : <CoinIcon size={14} />}
  </span>
);

type Show = (e: React.MouseEvent, lines: TipLine[]) => void;

/** An item slot: the game's own picture, the rarity ring, the count. */
function Slot({ row }: { row: { item: AuctionRow['item'] } }) {
  const s = row.item;
  return (
    <span className="cs-slot full mk-slot">
      <ItemPicture id={s.id} />
      {s.gear && s.gear.r > 0 && <span className={`rarity-ring r${s.gear.r}`} />}
      {!!s.gear?.u && <span className="cs-plus">+{s.gear.u}</span>}
      {s.count > 1 && <span className="cs-count">{s.count}</span>}
    </span>
  );
}

function Row({ r, on, show, hide, open }: { r: AuctionRow; on: boolean; show: Show; hide: () => void; open: (r: AuctionRow) => void }) {
  const lines = tooltipLines(r.item, null, 0);
  const label = timeLeftLabel(r.left);
  return (
    <li
      className={`mk-row${r.yours ? ' mine' : ''}${r.leading ? ' lead' : ''}${on ? ' on' : ''}`}
      data-testid={`market-row-${r.id}`}
      data-name={r.name}
      role="button"
      tabIndex={0}
      onClick={() => {
        hide();
        open(r);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          hide();
          open(r);
        }
      }}
    >
      <span className="mk-cell mk-item" onMouseEnter={(e) => show(e, lines)} onMouseMove={(e) => show(e, lines)} onMouseLeave={hide}>
        <Slot row={r} />
        <span className="mk-name">{r.name}</span>
      </span>
      <span className={`mk-cell mk-left l-${label.toLowerCase().replace(' ', '-')}`} title={`${leftText(r.left)} left`}>
        {label}
        <small>{leftText(r.left)}</small>
      </span>
      <span className="mk-cell mk-seller" data-label="Seller">
        {r.yours ? 'You' : r.seller}
      </span>
      <span className="mk-cell mk-num" data-label="Bid">
        <Price n={r.top > 0 ? r.top : r.bid} title={r.top > 0 ? 'Current bid' : 'Starting bid'} token={r.token} />
        {r.leading ? <small className="mk-lead">your bid</small> : r.top > 0 ? <small>bid on</small> : <small>no bids</small>}
      </span>
      <span className="mk-cell mk-num" data-label="Buyout">
        {r.buyout > 0 ? <Price n={r.buyout} title="Buyout price" token={r.token} /> : <small>no buyout</small>}
      </span>
    </li>
  );
}

const MAIL_NAME: Record<MailKind, string> = { sold: 'Sold', won: 'Won', outbid: 'Outbid', expired: 'Expired', cancelled: 'Cancelled' };

function Letter({ m, show, hide, take, busy }: { m: MailRow; show: Show; hide: () => void; take: (() => void) | null; busy: boolean }) {
  const lines = m.item ? tooltipLines(m.item, null, 0) : [];
  return (
    <li className={`mk-letter k-${m.kind}`}>
      <span className="mk-cell mk-item" onMouseEnter={(e) => m.item && show(e, lines)} onMouseMove={(e) => m.item && show(e, lines)} onMouseLeave={hide}>
        {m.item ? <Slot row={{ item: m.item }} /> : <span className="cs-slot mk-slot mk-coinslot">{<CoinIcon size={26} />}</span>}
        <span className="mk-name">{m.subject}</span>
      </span>
      <span className="mk-cell mk-kind">{MAIL_NAME[m.kind]}</span>
      <span className="mk-cell mk-num">
        {m.coins > 0 ? <Price n={m.coins} title="Coins to collect" /> : <small>the item</small>}
        {take && (
          <button type="button" className="mk-go" disabled={busy} onClick={take}>
            Collect
          </button>
        )}
      </span>
    </li>
  );
}

const SORTS: { sort: AuctionSort; label: string; cls: string }[] = [
  { sort: 'name', label: 'Item', cls: 'mk-item' },
  { sort: 'ending', label: 'Time left', cls: 'mk-left' },
  { sort: 'bid', label: 'Bid', cls: 'mk-num' },
  { sort: 'buyout', label: 'Buyout', cls: 'mk-num' },
];

/** `/market`: the Auction House of the realm. Bid, buy out, sell from your bags and collect the mail here. */
export function MarketPage() {
  const root = useRef<HTMLDivElement>(null);
  useFrontMotion(root);
  const account = useAuth((s) => s.account?.id ?? null);
  const desk = useCamp((s) => s.view);
  const deskStatus = useCamp((s) => s.status);
  const loadDesk = useCamp((s) => s.load);
  const act = useCamp((s) => s.act);
  const busy = useCamp((s) => s.busy);
  const notice = useCamp((s) => s.notice);
  const clearNotice = useCamp((s) => s.clear);
  const [query, setQuery] = useState<AuctionQuery>({ ...DEFAULT_AUCTION_QUERY });
  const [text, setText] = useState('');
  const [tab, setTab] = useState<Tab>('browse');
  const [open, setOpen] = useState<AuctionRow | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: TipLine[] } | null>(null);
  const { reply, error, reload } = useMarket(query, account);
  const view = reply?.view ?? null;
  const show: Show = useCallback((e, lines) => setTip({ x: e.clientX, y: e.clientY, lines }), []);
  const hide = useCallback(() => setTip(null), []);
  const search = (over: Partial<AuctionQuery>) => setQuery((q) => ({ ...q, ...over }));
  const scrollTo = (to: string) => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // The page opens at the top, whatever the last page was scrolled to.
  useEffect(() => {
    document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // The purse, the bags and whether the hero is in the game: the same record the Camp asks for.
  useEffect(() => {
    if (account) void loadDesk();
  }, [account, loadDesk]);

  useEffect(() => {
    if (!notice) return;
    (notice.ok ? toast.success : toast.error)(notice.text);
    clearNotice();
  }, [notice, clearNotice]);

  // A bid or a sale changes the row that is open: keep it in step with the board when that row is still on it.
  useEffect(() => {
    if (!open || !view) return;
    const fresh = [...view.rows, ...view.mine, ...view.bids].find((r) => r.id === open.id);
    if (fresh && (fresh.next !== open.next || fresh.top !== open.top || fresh.pay !== open.pay || fresh.left !== open.left)) setOpen(fresh);
  }, [view, open]);

  const trade = async (c: Record<string, unknown>, close: boolean): Promise<boolean> => {
    const ok = await act({ a: 'auction', c });
    if (!ok) return false;
    reload();
    if (close) setOpen(null);
    return true;
  };

  /** Into the lobby as a multiplayer player: the house is the realm's, so that is where it is used. */
  const play = () => {
    void import('./GameLobby').then(({ saveLobbyChoice }) => {
      saveLobbyChoice({ way: 'multi', mode: 'survival' });
      location.assign(lobbyUrl({ way: 'multi', mode: 'survival' }));
    });
  };

  const counts: Record<Tab, number> = { browse: view?.total ?? 0, sell: 0, auctions: view?.mine.length ?? 0, bids: view?.bids.length ?? 0, mail: view?.mail.length ?? 0 };
  const TABS: { id: Tab; name: string }[] = [
    { id: 'browse', name: 'Browse' },
    { id: 'sell', name: 'Sell' },
    { id: 'auctions', name: 'My auctions' },
    { id: 'bids', name: 'My bids' },
    { id: 'mail', name: 'Mail' },
  ];
  const locked = !!desk?.inGame;
  const coins = desk?.hero.coins ?? null;

  const head = (
    <div className="mk-head" role="row">
      {SORTS.slice(0, 2).map((s) => (
        <HeadButton key={s.sort} s={s} view={view} search={search} />
      ))}
      <span className="mk-sort static mk-seller">Seller</span>
      {SORTS.slice(2).map((s) => (
        <HeadButton key={s.sort} s={s} view={view} search={search} />
      ))}
    </div>
  );
  const plainHead = (
    <div className="mk-head" role="row">
      <span className="mk-sort static mk-item">Item</span>
      <span className="mk-sort static mk-left">Time left</span>
      <span className="mk-sort static mk-seller">Seller</span>
      <span className="mk-sort static mk-num">Bid</span>
      <span className="mk-sort static mk-num">Buyout</span>
    </div>
  );

  const signIn = (what: string) => (
    <p className="mk-empty" data-testid="market-signin">
      Sign in with your wallet (top right) to see {what}. Your character&apos;s auctions are kept with its account.
    </p>
  );

  const list = (rows: AuctionRow[], empty: string, what: string) =>
    !view?.member ? (
      signIn(what)
    ) : (
      <>
        {plainHead}
        <ul className="mk-list">
          {rows.length === 0 && <li className="mk-empty">{empty}</li>}
          {rows.map((r) => (
            <Row key={r.id} r={r} on={open?.id === r.id} show={show} hide={hide} open={setOpen} />
          ))}
        </ul>
      </>
    );

  return (
    <div className="fp cp mk" ref={root} style={{ '--c': '#f0b020' } as CSSProperties}>
      <ClickSparks />
      {tip && tip.lines.length > 0 && createPortal(<div className="tooltip" style={{ left: Math.min(tip.x + 16, window.innerWidth - 360), top: Math.min(tip.y + 16, window.innerHeight - 40) }}><Tip lines={tip.lines} /></div>, document.body)}

      <div className="fp-rail" data-no-play>
        <button className="fp-brand" onClick={() => toFront(null)} aria-label="SolRift, to the front page"><img src="/art/solrift-token-logo.png" alt="SolRift" draggable={false} /></button>
          <header className="fp-nav fp-px">
          <span className="fp-brand-gap" aria-hidden="true" />
          <nav className="site-nav fp-links" aria-label="Menu">
            <button className="fp-link-play" onClick={play}>
              Play
            </button>
            <button onClick={goBeyond}>The World</button>
            <button onClick={() => toFront('site-features')}>Classes</button>
            <button onClick={() => toFront('l-expansions')}>Expansions</button>
            <button className="fp-link-farm" onClick={goFarm}>Farm</button>
            <button className="fp-link-market" aria-current="page" onClick={() => scrollTo('mk-top')}>
              Market
            </button>
          <button className="fp-link-shop" onClick={goShop}>Shop</button>
          <button className="fp-link-token" onClick={goToken}>Token</button>
          </nav>
          <div className="fp-account">
            <AccountPanel bar />
          </div>
          <i className="fp-progress" aria-hidden="true" />
        </header>
      </div>

      {/* ------------------------------------------------------------------ the top */}
      <section className="cp-hero mk-hero" id="mk-top">
        <div className="fp-art" aria-hidden="true">
          <div className="fp-art-m">
            <div className="fp-art-kb" style={{ backgroundImage: `url(${ART.hero})` }} />
          </div>
        </div>
        <div className="fp-rays" aria-hidden="true" />
        <div className="cp-wash" aria-hidden="true" />
        <Embers />
        <div className="mk-hero-in">
          <nav className="cp-crumbs" aria-label="Where you are">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                toFront(null);
              }}
            >
              SolRift
            </a>
            <span aria-hidden="true">/</span>
            <b>Market</b>
          </nav>
          <p className="cp-role">{HOUSE_NAME}</p>
          <h1 className="cp-name mk-title">
            The <em>Market</em>
          </h1>
          <p className="cp-tagline">The Auction House of Dawnwatch, live</p>
          <p className="cp-lead">
            Everything players have put up for sale in the realm, as it stands right now. Bid, buy it out, sell from your bags and collect your mail here.
          </p>
          <ul className="cp-badges mk-stats" aria-label="The market now">
            <li data-testid="market-count">{view ? `${view.total} ${view.total === 1 ? 'auction' : 'auctions'} up` : 'Reading the ledgers...'}</li>
            <li>{reply ? `${reply.players} ${reply.players === 1 ? 'player' : 'players'} in the realm` : 'Realm'}</li>
            <li>{Math.round(AUCTION_RULES.cut * 100)}% house cut</li>
          </ul>
          <div className="cp-actions">
            <button className="fp-play fp-px" id="market-play" onClick={play}>
              <span>
                <i aria-hidden="true" />
                Enter the realm
              </span>
            </button>
            <button className="fp-ghost fp-px" onClick={() => scrollTo('mk-board')}>
              <span>See what is for sale</span>
            </button>
          </div>
        </div>
      </section>

      <main className="fp-below">
        <div className="fp-orbs" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        {/* ---------------------------------------------------------------- the board */}
        <section className="fp-sec mk-sec" id="mk-board">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>01</b>
                The board
              </small>
              <h2>
                What is up for <em>sale</em>
              </h2>
            </div>
            <Blocks ids={[B.GOLD_ORE, B.DIAMOND_ORE, B.PLANKS]} />
          </Reveal>

          <div className="mk-board fp-px" data-testid="market-board">
            <div className="mk-tabs" role="tablist" aria-label="The market">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} data-testid={`market-tab-${t.id}`} onClick={() => setTab(t.id)}>
                  {t.name}
                  {t.id !== 'browse' && view?.member && counts[t.id] > 0 ? <b>{counts[t.id]}</b> : null}
                </button>
              ))}
              <span className="mk-live" title={error || `Updated every ${REFRESH_MS / 1000} seconds`}>
                <i className={error ? 'off' : reply ? 'on' : ''} aria-hidden="true" />
                {error ? 'Offline' : reply ? 'Live' : '...'}
              </span>
            </div>

            {error && (
              <p className="mk-error" role="alert" data-testid="market-error">
                {error}
              </p>
            )}

            {tab === 'browse' && (
              <div className="mk-browse">
                <div className="mk-cats" data-testid="market-cats">
                  {AUCTION_CATEGORIES.map((c) => (
                    <button key={c.id} className={query.cat === c.id ? 'on' : ''} data-testid={`market-cat-${c.id}`} onClick={() => search({ cat: c.id, page: 0 })}>
                      {c.name}
                    </button>
                  ))}
                </div>
                <div className="mk-main">
                  <form
                    className="mk-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      search({ q: text.trim(), page: 0 });
                    }}
                  >
                    <input value={text} placeholder="Search by name" maxLength={40} aria-label="Search by name" data-testid="market-search" onChange={(e) => setText(e.target.value)} />
                    <button type="submit" data-testid="market-search-go">
                      Search
                    </button>
                    {query.q && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setText('');
                          search({ q: '', page: 0 });
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </form>
                  {head}
                  <ul className="mk-list" data-testid="market-list">
                    {!view && !error && <li className="mk-empty">Reading the ledgers...</li>}
                    {view && view.rows.length === 0 && <li className="mk-empty">{query.q || query.cat !== 'all' ? 'Nothing for sale matches that.' : 'Nothing is up for sale right now.'}</li>}
                    {view?.rows.map((r) => (
                      <Row key={r.id} r={r} on={open?.id === r.id} show={show} hide={hide} open={setOpen} />
                    ))}
                  </ul>
                  <div className="mk-pager">
                    <button disabled={!view || view.query.page <= 0} data-testid="market-prev" onClick={() => search({ page: query.page - 1 })} aria-label="Previous page">
                      &lt;
                    </button>
                    <span data-testid="market-page">
                      {view ? `Page ${view.query.page + 1} of ${view.pages} \u00B7 ${view.total} ${view.total === 1 ? 'auction' : 'auctions'}` : ' '}
                    </span>
                    <button disabled={!view || view.query.page + 1 >= view.pages} data-testid="market-next" onClick={() => search({ page: query.page + 1 })} aria-label="Next page">
                      &gt;
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'sell' && <SellBoard account={account} desk={desk} status={deskStatus} busy={busy} locked={locked} onPost={(c) => trade(c, false)} />}
            {tab === 'auctions' && list(view?.mine ?? [], 'You have nothing up. Sell something from your bags.', 'the auctions you have up')}
            {tab === 'bids' && list(view?.bids ?? [], 'You hold no bids right now.', 'the auctions you have bid on')}
            {tab === 'mail' &&
              (!view?.member ? (
                signIn('what is waiting for you')
              ) : (
                <ul className="mk-list mk-mail" data-testid="market-mail">
                  {view.mail.length === 0 && <li className="mk-empty">Nothing is waiting for you.</li>}
                  {view.mail.map((m) => (
                    <Letter key={m.id} m={m} show={show} hide={hide} busy={busy || locked} take={account ? () => void trade({ a: 'take', id: m.id }, false) : null} />
                  ))}
                  {view.mail.length > 1 && (
                    <li className="mk-note">
                      <button type="button" className="mk-go" disabled={busy || locked} onClick={() => void trade({ a: 'take', id: 0 }, false)}>
                        Collect it all
                      </button>
                    </li>
                  )}
                  {locked && view.mail.length > 0 && <li className="mk-note">Leave the game to collect your mail.</li>}
                </ul>
              ))}
          </div>
          <p className="mk-fine">Prices are in Auren. This is the one house of the realm: a bid here is a bid at the Auctioneer.</p>
        </section>

        {/* ---------------------------------------------------------------- the rules */}
        <section className="fp-sec mk-sec" id="mk-rules">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>02</b>
                How it works
              </small>
              <h2>
                The rules of the <em>house</em>
              </h2>
            </div>
            <Blocks ids={[B.PLANKS, B.GOLD_ORE]} />
          </Reveal>
          <ul className="mk-rules">
            {[
              ['Post', `Put an item up for ${AUCTION_HOURS.join(', ')} hours with a starting bid and, if you like, a buyout. A deposit is paid at once: it comes back when the item sells.`],
              ['Bid', `A new bid has to beat the last one by at least ${Math.round(AUCTION_RULES.raise * 100)}%. Whoever is outbid gets their coins back by mail.`],
              ['Buy out', 'A buyout ends the auction at once, and the item is mailed to the buyer.'],
              ['Sell', `The seller is paid the price less the house's ${Math.round(AUCTION_RULES.cut * 100)}% cut. Up to ${AUCTION_RULES.maxListings} auctions at a time.`],
              ['Mail', 'Everything owed (items and coins) waits in your mail until you collect it here, so nothing is lost when a bag is full or you are away.'],
            ].map(([t, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.05}>
                <h3>{t}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="fp-sec" id="mk-start">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>03</b>
                How to trade
              </small>
              <h2>
                Three steps to your first <em>deal</em>
              </h2>
            </div>
            <Blocks ids={[B.GRASS, B.PLANKS, B.GOLD_ORE]} />
          </Reveal>
          <ol className="cp-steps">
            {[
              ['Sign in', 'Auctions belong to an account: sign in with your Solana wallet. Guests can look, but cannot sell or bid.'],
              ['Open a listing', 'Click anything on the board to bid or buy it out. Your own listings can be taken down while nobody has bid.'],
              ['Sell and collect', 'Put a bag item up from the Sell tab. When something sells, or you are outbid, collect it from Mail.'],
            ].map(([t, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.08}>
                <span className="n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="fp-sec fp-end">
          <Reveal>
            <div className="fp-pile">
              <Blocks ids={[B.GOLD_ORE, B.DIAMOND_ORE, B.PLANKS, B.GLOWSTONE, B.STONE]} size={72} />
            </div>
            <h2>
              Make your <em>fortune</em>
            </h2>
            <p>Free in your browser. Sign in with a wallet and name your price.</p>
            <span className="fp-glow">
              <button className="fp-play fp-px" onClick={play}>
                <span>
                  <i aria-hidden="true" />
                  Enter the realm
                </span>
              </button>
            </span>
          </Reveal>
        </section>

        <footer className="fp-foot" data-no-play>
          <b>SolRift</b>
          <span>A voxel world in your browser, powered by Solana. Version {GAME_VERSION}.</span>
        </footer>
      </main>
      {open && <Deal r={open} signed={!!account} coins={coins} waiting={!!account && !desk && deskStatus !== 'error' && deskStatus !== 'out'} locked={locked} busy={busy} trade={(c, close) => void trade(c, close)} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A dialog over the page: the market list stays where it is. */
function MarketDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const host = typeof document === 'undefined' ? null : document.querySelector('#home .fp');
  if (!host) return null;
  return createPortal(
    <div className="fp-dlg-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fp-dlg-glow mk-dlg-glow">
        <div className="fp-dlg fp-px mk-dlg" role="dialog" aria-modal="true" aria-label={title}>
          <button type="button" className="fp-dlg-x" onClick={onClose} aria-label="Close">
            &times;
          </button>
          {children}
        </div>
      </div>
    </div>,
    host,
  );
}

/** Bid, buy out, or take down the listing that was opened. */
function Deal({ r, signed, coins, waiting, locked, busy, trade, onClose }: { r: AuctionRow; signed: boolean; coins: number | null; waiting: boolean; locked: boolean; busy: boolean; trade: (c: Record<string, unknown>, close: boolean) => void; onClose: () => void }) {
  const [amount, setAmount] = useState(String(r.next));
  useEffect(() => setAmount(String(r.next)), [r.id, r.next]);
  const n = Math.max(0, Math.min(MAX_COINS, Math.floor(Number(amount) || 0)));
  const why = !signed ? 'Sign in with your wallet to bid or buy.' : waiting ? 'Reading your character...' : locked ? 'Leave the game to trade. The game is holding this character.' : r.token ? 'This one is priced in $SOLRIFT. Bid on it in the game.' : null;
  return (
    <MarketDialog title={r.name} onClose={onClose}>
      <div className="mk-deal" data-testid="market-deal">
        <div className="mk-deal-top">
          <Slot row={r} />
          <h2>{r.name}</h2>
        </div>
        <p className="mk-deal-meta">
          {r.yours ? 'You put this one up.' : `Sold by ${r.seller}.`}
          <span>
            {timeLeftLabel(r.left)} · {leftText(r.left)} left
          </span>
        </p>
        {coins !== null && !r.token && <p className="mk-deal-purse">You have {coins.toLocaleString('en-US')} Auren.</p>}
        {why && <p className="mk-warn">{why}</p>}
        {r.yours ? (
          <div className="mk-actions">
            {r.top > 0 && <span>It has a bid on it, so it stays up.</span>}
            <div className="mk-action-row">
              <button type="button" className="mk-go" disabled={busy || !!why || r.top > 0} onClick={() => trade({ a: 'cancel', id: r.id }, true)}>
                Cancel the auction
              </button>
            </div>
          </div>
        ) : (
          <div className="mk-actions">
            <label>
              Your bid, at least {r.next.toLocaleString('en-US')}
              <input className="mk-numin" inputMode="numeric" aria-label="Your bid" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
            </label>
            <div className="mk-action-row">
              {r.buyout > 0 && (
                <button type="button" className="mk-go ghost" disabled={busy || !!why} onClick={() => trade({ a: 'buyout', id: r.id }, true)}>
                  Buy out for {r.pay.toLocaleString('en-US')}
                </button>
              )}
              <button type="button" className="mk-go" disabled={busy || !!why || n < r.next} onClick={() => trade({ a: 'bid', id: r.id, amount: n }, false)}>
                Bid {n.toLocaleString('en-US')}
              </button>
            </div>
          </div>
        )}
      </div>
    </MarketDialog>
  );
}

/** Put something from the bags up for sale. */
function SellBoard({ account, desk, status, busy, locked, onPost }: { account: string | null; desk: DeskView | null; status: string; busy: boolean; locked: boolean; onPost: (c: Record<string, unknown>) => Promise<boolean> }) {
  const [slot, setSlot] = useState<number | null>(null);
  const piles = (desk?.slots ?? []).filter((s): s is { slot: number; item: ItemStack } => !!s.item && !sellBlocker(s.item));
  const held = piles.find((s) => s.slot === slot) ?? null;
  if (!account) return <p className="mk-empty">Sign in with your wallet to sell from your bags.</p>;
  if (!desk && status !== 'error' && status !== 'out') return <p className="mk-empty">Reading your bags...</p>;
  if (!desk) return <p className="mk-empty">Play this hero once in the game before selling from here.</p>;
  return (
    <div className="mk-selling" data-testid="market-sell">
      {locked && <p className="mk-warn">Leave the game to sell. The game is holding this character.</p>}
      {piles.length === 0 ? (
        <p className="mk-empty">Your bags have nothing that can be sold.</p>
      ) : (
        <ul className="mk-sell">
          {piles.map((s) => (
            <li key={s.slot}>
              <button type="button" className={slot === s.slot ? 'on' : ''} onClick={() => setSlot(s.slot)}>
                <Slot row={{ item: s.item }} />
                <span>{tooltipLines(s.item, null, 0)[0]?.text ?? 'Item'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {held && (
        <MarketDialog title={tooltipLines(held.item, null, 0)[0]?.text ?? 'Sell'} onClose={() => setSlot(null)}>
          <SellForm
            stack={held.item}
            slot={held.slot}
            coins={desk.hero.coins}
            busy={busy || locked}
            onPost={async (c) => {
              if (await onPost(c)) setSlot(null);
            }}
          />
        </MarketDialog>
      )}
    </div>
  );
}

function SellForm({ stack, slot, coins, busy, onPost }: { stack: ItemStack; slot: number; coins: number; busy: boolean; onPost: (c: Record<string, unknown>) => Promise<void> | void }) {
  const [count, setCount] = useState(stack.count);
  const unit = Math.max(1, stackSellPrice(stack));
  const [bid, setBid] = useState(unit * stack.count);
  const [buyout, setBuyout] = useState(0);
  const [hours, setHours] = useState<AuctionHours>(24);
  useEffect(() => {
    setCount(stack.count);
    setBid(Math.max(1, stackSellPrice(stack)) * stack.count);
    setBuyout(0);
  }, [stack, slot]);
  const deposit = depositFor({ ...stack, count }, hours);
  const price = buyout > 0 ? buyout : bid;
  const bad = bid < 1 ? 'Name a starting bid.' : buyout > 0 && buyout < bid ? 'The buyout cannot be below the bid.' : deposit > coins ? `The deposit is ${deposit.toLocaleString('en-US')} Auren. You have ${coins.toLocaleString('en-US')}.` : null;
  const num = (v: string): number => Math.max(0, Math.min(MAX_COINS, Math.floor(Number(v.replace(/[^\d]/g, '')) || 0)));
  return (
    <form
      className="mk-form"
      data-testid="market-sell-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!bad) void onPost({ a: 'post', slot, count, bid, buyout, hours });
      }}
    >
      {stack.count > 1 && (
        <label>
          Amount
          <input className="mk-numin" inputMode="numeric" aria-label="Amount" value={String(count)} onChange={(e) => {
            const n = Math.max(1, Math.min(stack.count, num(e.target.value) || 1));
            setCount(n);
            setBid(unit * n);
          }} />
        </label>
      )}
      <label>
        Starting bid
        <input className="mk-numin" inputMode="numeric" aria-label="Starting bid" value={String(bid)} onChange={(e) => setBid(num(e.target.value))} />
      </label>
      <label>
        Buyout, 0 for none
        <input className="mk-numin" inputMode="numeric" aria-label="Buyout" value={String(buyout)} onChange={(e) => setBuyout(num(e.target.value))} />
      </label>
      <div className="mk-hours" role="group" aria-label="How long">
        {AUCTION_HOURS.map((h) => (
          <button key={h} type="button" className={hours === h ? 'on' : ''} onClick={() => setHours(h)}>
            {h} h
          </button>
        ))}
      </div>
      <p>
        Deposit {deposit.toLocaleString('en-US')} Auren, back when it sells. The house keeps {Math.round(AUCTION_RULES.cut * 100)}%: you would get {Math.floor(price * (1 - AUCTION_RULES.cut)).toLocaleString('en-US')}.
      </p>
      {bad && <p className="mk-warn">{bad}</p>}
      <div className="mk-action-row">
        <button type="submit" className="mk-go" disabled={busy || !!bad}>
          Put it up
        </button>
      </div>
    </form>
  );
}

/** A heading of the list that sorts by its column (a second click turns the order round). */
function HeadButton({ s, view, search }: { s: { sort: AuctionSort; label: string; cls: string }; view: AuctionView | null; search: (o: Partial<AuctionQuery>) => void }) {
  const on = view?.query.sort === s.sort;
  return (
    <button className={`mk-sort ${s.cls}${on ? ' on' : ''}`} data-testid={`market-sort-${s.sort}`} onClick={() => search({ sort: s.sort, desc: on ? !view!.query.desc : false, page: 0 })}>
      {s.label}
      {on ? (view!.query.desc ? ' \u25BE' : ' \u25B4') : ''}
    </button>
  );
}
