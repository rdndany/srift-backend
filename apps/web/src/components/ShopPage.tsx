'use client';

import { B, CLASSES, CLASS_IDS, GAME_VERSION, wornCode, type ClassId } from '@solrift/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '../auth/store';
import { useToken, type OutfitInfo, type TokenMe } from '../token/store';
import { AccountPanel } from './AccountPanel';
import { Blocks } from './BlockCube';
import { CharacterPreview } from './CharacterPreview';
import { ClickSparks, Embers, Reveal, useFrontMotion } from './fx';
import { lobbyUrl } from '../game/route';
import { SCROLL_KEY, goCamp, goMarket, goToken } from './frontNav';
import { ART } from './homeAssets';
import { TokenIcon } from './TokenPurse';
import { useTokenBalance } from './TokenWallet';
import './home.css';
import './front.css';
import './classPage.css';
import './shopPage.css';
import './responsive.css';

/** Goes to a part of the front page (its menu leads there too). */
const toFront = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(SCROLL_KEY, id);
  } catch {
    /* no storage: the page just opens at the top */
  }
  location.assign('/');
};

/** One thing the Shop sells to heroes and wallets: a slot, a tab, a key. */
interface Good {
  sku: string;
  name: string;
  blurb: string;
  owned: number;
  max: number;
  /** What the next one costs (null: none left to buy). */
  price: number | null;
  consumable: boolean;
}

/** What is for sale from what the server says it charges, for someone who is not signed in yet (the prices, with nothing owned). */
function catalogue(limits: { slotPrices: number[]; stashPrices: number[]; keyPrice: number }): Good[] {
  const list: Good[] = [];
  if (limits.slotPrices.length > 0) list.push({ sku: 'hero-slot', name: 'Hero slot', blurb: 'One more character on your wallet.', owned: 0, max: limits.slotPrices.length, price: limits.slotPrices[0], consumable: false });
  if (limits.stashPrices.length > 0) list.push({ sku: 'stash-tab', name: 'Stash tab', blurb: 'More slots in your shared Stash, for every hero of your wallet.', owned: 0, max: limits.stashPrices.length, price: limits.stashPrices[0], consumable: false });
  if (limits.keyPrice > 0) list.push({ sku: 'hollow-key', name: 'Hollow Key', blurb: 'Opens the Hollow Deep for you and your party, in place of a Hollow Sigil. Used up on entering.', owned: 0, max: 0, price: limits.keyPrice, consumable: true });
  return list;
}

const goodsOf = (me: TokenMe): Good[] => me.shop.map((i) => ({ sku: i.sku, name: i.name, blurb: i.blurb, owned: i.owned, max: i.max, price: i.price, consumable: !!i.consumable }));

/** How much of a thing you have: one pip for each there is to buy, filled for each one bought. */
function Pips({ owned, max }: { owned: number; max: number }) {
  const n = Math.min(max, 12);
  if (n <= 0) return null;
  return (
    <span className="sp-pips" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < owned ? 'on' : ''} />
      ))}
    </span>
  );
}

/** The three colours of an outfit as dots: the cloth, the trim and the light it shines with. */
function Swatch({ o }: { o: Pick<OutfitInfo, 'shirt' | 'trim' | 'glow'> }) {
  return (
    <span className="sp-swatch" aria-hidden="true">
      <i style={{ background: o.shirt }} />
      <i style={{ background: o.trim }} />
      <i style={{ background: o.glow, boxShadow: `0 0 8px ${o.glow}` }} />
    </span>
  );
}

/** `/shop`: what $SOLRIFT buys in the game. The balance is earned in the game and kept with the wallet (see `/token`); here it is spent. */
export function ShopPage() {
  const root = useRef<HTMLDivElement>(null);
  useFrontMotion(root);
  const info = useToken((s) => s.info);
  const infoStatus = useToken((s) => s.infoStatus);
  const me = useToken((s) => s.me);
  const busy = useToken((s) => s.busy);
  const loadInfo = useToken((s) => s.loadInfo);
  const buy = useToken((s) => s.buy);
  const status = useAuth((s) => s.status);
  const look = useAuth((s) => s.account?.look ?? 0);
  const heroClass = useAuth((s) => s.account?.class ?? null);
  const [tab, setTab] = useState<ClassId | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);
  useTokenBalance();
  // The page opens at the top, whatever the last page was scrolled to.
  useEffect(() => {
    document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const live = info?.live ?? false;
  const signedIn = status === 'in' && !!me;
  const scrollTo = (to: string) => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const play = () => {
    void import('./GameLobby').then(({ saveLobbyChoice }) => {
      saveLobbyChoice({ way: 'multi', mode: 'survival' });
      location.assign(lobbyUrl({ way: 'multi', mode: 'survival' }));
    });
  };

  const goods: Good[] = me ? goodsOf(me) : info?.live ? catalogue(info.limits) : [];
  const shownClass: ClassId = tab ?? heroClass ?? CLASS_IDS[0];
  const outfits = me?.outfits.filter((o) => o.cls === shownClass) ?? [];
  const shown = outfits.find((o) => o.id === pick) ?? outfits[0];
  const stashFull = !!me && me.stashFree === 0;
  const prices = info?.limits.outfitPrices ?? [];

  return (
    <div className="fp cp sp" ref={root} style={{ '--c': '#b98cff' } as CSSProperties}>
      <ClickSparks />

      <div className="fp-rail" data-no-play>
        <button className="fp-brand" onClick={() => toFront(null)} aria-label="SolRift, to the front page">
          <img src="/art/solrift-token-logo.png" alt="SolRift" draggable={false} />
        </button>
        <header className="fp-nav fp-px">
          <span className="fp-brand-gap" aria-hidden="true" />
          <nav className="site-nav fp-links" aria-label="Menu">
            <button className="fp-link-play" onClick={play}>
              Play
            </button>
            <button onClick={() => toFront('site-world')}>The World</button>
            <button onClick={() => toFront('site-features')}>Classes</button>
            <button onClick={() => toFront('l-expansions')}>Expansions</button>
            <button className="fp-link-camp" onClick={goCamp}>
              Camp
            </button>
            <button className="fp-link-market" onClick={goMarket}>
              Market
            </button>
            <button className="fp-link-shop" aria-current="page" onClick={() => scrollTo('sp-top')}>
              Shop
            </button>
            <button className="fp-link-token" onClick={goToken}>
              Token
            </button>
          </nav>
          <div className="fp-account">
            <AccountPanel bar />
          </div>
          <i className="fp-progress" aria-hidden="true" />
        </header>
      </div>

      {/* ------------------------------------------------------------------ the top */}
      <section className="cp-hero sp-hero" id="sp-top">
        <div className="fp-art" aria-hidden="true">
          <div className="fp-art-m">
            <div className="fp-art-kb" style={{ backgroundImage: `url(${ART.hero})` }} />
          </div>
        </div>
        <div className="fp-rays" aria-hidden="true" />
        <div className="cp-wash" aria-hidden="true" />
        <Embers />
        <div className="cp-hero-in">
          <div className="cp-hero-copy">
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
              <b>Shop</b>
            </nav>
            <p className="cp-role">Spend your $SOLRIFT</p>
            <h1 className="cp-name sp-title">
              The <em>Shop</em>
            </h1>
            <p className="cp-tagline">Room for more heroes, and a look of your own</p>
            <p className="cp-lead">More hero slots, stash tabs, Hollow Keys and glowing outfits for every class. Nothing here makes anyone stronger: it is room, access and style.</p>
            <div className="cp-actions">
              <button className="fp-play fp-px" onClick={play}>
                <span>
                  <i aria-hidden="true" />
                  Play SolRift
                </span>
              </button>
              <button className="fp-ghost fp-px" onClick={() => scrollTo('sp-outfits')}>
                <span>See the outfits</span>
              </button>
            </div>
          </div>

          <aside className="sp-purse fp-px" data-testid="shop-purse" aria-label="Your $SOLRIFT">
            <small>Your balance</small>
            {!live ? (
              <p className="sp-purse-note">{infoStatus === 'idle' || infoStatus === 'loading' ? 'Opening the shop\u2026' : 'The shop opens when $SOLRIFT goes live.'}</p>
            ) : signedIn ? (
              <>
                <b className="sp-balance" data-testid="shop-balance">
                  <TokenIcon size={26} />
                  {me.balance.toLocaleString()}
                  <em>$SOLRIFT</em>
                </b>
                <p className="sp-purse-note">Earned in the game and kept with your wallet, whichever hero you play.</p>
                <button type="button" className="sp-link" onClick={goToken}>
                  Earn more or withdraw
                </button>
              </>
            ) : (
              <p className="sp-purse-note">{status === 'loading' ? 'Looking for your wallet\u2026' : 'Sign in with your Solana wallet (top right) to see your balance and buy.'}</p>
            )}
          </aside>
        </div>
      </section>

      <main className="fp-below">
        <div className="fp-orbs" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>


        {/* ---------------------------------------------------------------- heroes and storage */}
        <section className="fp-sec sp-sec" id="sp-goods">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>01</b>
                Heroes and storage
              </small>
              <h2>
                Room to <em>grow</em>
              </h2>
            </div>
            <Blocks ids={[B.GOLD_ORE, B.CHEST, B.DIAMOND_ORE]} />
          </Reveal>

          {goods.length === 0 ? (
            <p className="sp-empty" data-testid="shop-empty">
              {live ? 'Nothing is for sale right now.' : 'The shop opens when $SOLRIFT goes live. Come back then.'}
            </p>
          ) : (
            <ul className="sp-goods" data-testid="token-shop">
              {goods.map((g, i) => {
                const short = g.price !== null && me ? Math.max(0, g.price - me.balance) : 0;
                return (
                  <Reveal as="li" key={g.sku} delay={i * 0.06} className={`sp-good ${g.sku}`} style={{ ['--k' as string]: g.sku === 'hollow-key' ? '#5fe0d0' : g.sku === 'stash-tab' ? '#ffd24a' : '#b98cff' }}>
                    <div className="sp-good-in fp-px" data-sku={g.sku}>
                      <h3>{g.name}</h3>
                      <p>{g.blurb}</p>
                      <p className="sp-have">
                        {g.consumable ? (me ? `You hold ${g.owned}${g.max ? ` (up to ${g.max})` : ''}.` : g.max ? `Hold up to ${g.max}.` : '') : g.max ? `${g.owned} of ${g.max} bought` : ''}
                        {!g.consumable && <Pips owned={g.owned} max={g.max} />}
                      </p>
                      <div className="sp-buy">
                        {g.price === null ? (
                          <span className="sp-done">{g.consumable ? 'You hold the most' : 'All bought'}</span>
                        ) : (
                          <button type="button" className="sp-btn" disabled={!signedIn || busy || short > 0} data-testid={`token-buy-${g.sku}`} onClick={() => void buy(g.sku)}>
                            <TokenIcon size={16} />
                            {busy ? 'Buying\u2026' : `${g.price.toLocaleString()}`}
                          </button>
                        )}
                        {g.price !== null && !signedIn && <small className="sp-short">Sign in to buy.</small>}
                        {g.price !== null && short > 0 && <small className="sp-short">You need {short.toLocaleString()} more.</small>}
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </ul>
          )}
          {goods.length > 0 && <p className="sp-fine">What you spend stays with the game&apos;s treasury and pays for later rewards. Nothing is burned.</p>}
        </section>

        {/* ---------------------------------------------------------------- outfits */}
        <section className="fp-sec sp-sec" id="sp-outfits">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>02</b>
                Outfits
              </small>
              <h2>
                A look of <em>light</em>
              </h2>
            </div>
            <Blocks ids={[B.GLOWSTONE, B.DIAMOND_ORE, B.GOLD_ORE]} />
          </Reveal>
          <p className="sp-lede">
            Outfits are sets of armor that change how your hero looks and nothing else: your real armor still counts, it is only not seen. A set you buy is an item and goes to your Stash (it needs a free slot). In the world, take it out, then right-click it or put it in the outfit slot of your inventory to wear it. A hero wears only the sets of its class, but you can buy the sets of every class, and trade them.
          </p>

          {!live ? (
            <p className="sp-empty">The outfits are for sale once $SOLRIFT goes live.</p>
          ) : !signedIn ? (
            <p className="sp-empty" data-testid="shop-outfits-signin">
              Sign in with your wallet (top right) to see the outfits on a stand and buy them.
              {prices.length === 3 && ` Common ${prices[0].toLocaleString()}, rare ${prices[1].toLocaleString()}, epic ${prices[2].toLocaleString()} $SOLRIFT.`}
            </p>
          ) : !shown ? (
            <p className="sp-empty">No outfits are for sale for this class yet.</p>
          ) : (
            <div className="sp-fit fp-px" data-testid="token-outfits">
              <div className="sp-fit-stand">
                <div className="sp-stage" data-testid="token-outfit-stage" data-outfit={shown.id} style={{ ['--glow' as string]: shown.glow }}>
                  <CharacterPreview armor={[]} turntable grounded lookCode={wornCode(look, shown.id)} />
                  <span className="sp-stage-name">{shown.name}</span>
                </div>
              </div>
              <div className="sp-fit-list">
                <div className="sp-tabs" role="tablist" aria-label="Class">
                  {CLASS_IDS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      aria-selected={c === shownClass}
                      data-testid={`token-outfit-tab:${c}`}
                      className={c === shownClass ? 'on' : ''}
                      onClick={() => {
                        setTab(c);
                        setPick(null);
                      }}
                    >
                      {CLASSES[c].name}
                      {c === heroClass ? ' (you)' : ''}
                    </button>
                  ))}
                </div>
                <ul>
                  {outfits.map((o) => {
                    const short = o.price !== null ? Math.max(0, o.price - (me?.balance ?? 0)) : 0;
                    return (
                      <li key={o.id} data-outfit={o.id} data-tier={o.tier} className={o.id === shown.id ? 'shown' : ''} onClick={() => setPick(o.id)}>
                        <span className="sp-what">
                          <b>
                            {o.name} <em className={`sp-tier ${o.tier}`}>{o.tier}</em>
                          </b>
                          <small>{o.blurb}</small>
                          {o.have > 0 && <small className="sp-stash">{o.have === 1 ? 'One is in your Stash.' : `${o.have} are in your Stash.`}</small>}
                        </span>
                        <span className="sp-foot">
                          <Swatch o={o} />
                          <span className="sp-buy">
                          <button
                            type="button"
                            className="sp-btn"
                            disabled={busy || short > 0 || stashFull || o.price === null}
                            data-testid={`token-buy-outfit:${o.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void buy(`outfit:${o.id}`);
                            }}
                          >
                            <TokenIcon size={16} />
                            {o.price?.toLocaleString() ?? ''}
                          </button>
                          {short > 0 && <small className="sp-short">You need {short.toLocaleString()} more.</small>}
                          {short === 0 && stashFull && <small className="sp-short">Your Stash is full: make room first.</small>}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- how it works */}
        <section className="fp-sec" id="sp-how">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>03</b>
                How it works
              </small>
              <h2>
                Earn it, then <em>spend</em> it
              </h2>
            </div>
            <Blocks ids={[B.GRASS, B.PLANKS, B.GOLD_ORE]} />
          </Reveal>
          <ol className="cp-steps">
            {[
              ['Earn', 'Win $SOLRIFT from achievements and dungeon clears. It is kept with your wallet, whichever hero you play.'],
              ['Spend', 'Pick a slot, a tab, a key or an outfit here. The price comes off your balance at once.'],
              ['Use it', 'Slots and tabs open the moment you buy. A key or an outfit waits in your Stash in the world.'],
            ].map(([t, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.08}>
                <span className="n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <footer className="fp-foot" data-no-play>
          <b>SolRift</b>
          <span>A voxel world in your browser, powered by Solana. Version {GAME_VERSION}.</span>
        </footer>
      </main>
    </div>
  );
}
