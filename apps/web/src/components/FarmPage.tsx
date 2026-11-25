'use client';

import { B, GAME_VERSION } from '@solrift/shared';
import { toast } from 'sonner';
import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { useAuth } from '../auth/store';
import { useCamp } from '../camp/store';
import { lobbyUrl } from '../game/route';
import { AccountPanel } from './AccountPanel';
import { Blocks } from './BlockCube';
import { HeroLine } from './CampHero';
import { CampTrips, DailyCard } from './CampTrips';
import { ClickSparks, Embers, Reveal, useFrontMotion } from './fx';
import { SCROLL_KEY, goBeyond, goMarket, goToken, goShop, goRanks } from './frontNav';
import { ART } from './homeAssets';
import { WalletLinks } from './WalletLinks';
import './home.css';
import './front.css';
import './classPage.css';
import './sheet.css';
import './campPage.css';
import './farmPage.css';
import './responsive.css';

/** How often the hero is asked for again while the page is in view (ms): what the game or another device did shows up without a tap. */
const REFRESH_MS = 10_000;

const toFront = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(SCROLL_KEY, id);
  } catch {
    /* no storage: the page just opens at the top */
  }
  location.assign('/');
};

/** What is said when a tap is done: a toast (see `SiteToaster`) that goes away by itself. */
function Notice() {
  const notice = useCamp((s) => s.notice);
  const clear = useCamp((s) => s.clear);
  useEffect(() => {
    if (!notice) return;
    (notice.ok ? toast.success : toast.error)(notice.text);
    clear();
  }, [notice, clear]);
  return null;
}

function SignIn() {
  const { wallets, busy, error, login } = useAuth();
  return (
    <section className="camp-signin" data-testid="farm-signin">
      <h2>Sign in to check in and farm</h2>
      <p>
        Your heroes follow your Solana wallet. Signing costs nothing and cannot touch your funds. No game is needed: this page works on a phone.
      </p>
      {wallets.length > 0 ? (
        <div className="camp-wallets">
          {wallets.map((w) => (
            <button key={w.name} type="button" className="camp-btn primary" disabled={busy} onClick={() => void login(w)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.icon} alt="" width={20} height={20} /> {w.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="camp-hint">No Solana wallet found in this browser.</p>
      )}
      <WalletLinks className="wallet-links camp-wallet-links" />
      {error && <p className="camp-warn small">{error}</p>}
    </section>
  );
}

/** `/farm`: the daily check-in and the offline farm. Bags, the Stash and realm chat are on the Play page. The market is its own page. */
export function FarmPage() {
  const root = useRef<HTMLDivElement>(null);
  useFrontMotion(root);
  const { status: authStatus, account, busy: authBusy, selectCharacter } = useAuth();
  const { view, status, error, load } = useCamp();
  const heroId = account?.id ?? null;

  useEffect(() => {
    document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // The hero is asked for at once, again whenever the hero or the account changes, and every few seconds while the page is in view.
  useEffect(() => {
    if (authStatus !== 'in' || !heroId) return;
    void load();
    const again = () => document.visibilityState === 'visible' && void load();
    const id = window.setInterval(again, REFRESH_MS);
    document.addEventListener('visibilitychange', again);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', again);
    };
  }, [authStatus, heroId, load]);

  const play = useCallback(() => {
    void import('./GameLobby').then(({ saveLobbyChoice }) => {
      saveLobbyChoice({ way: 'multi', mode: 'survival' });
      location.assign(lobbyUrl({ way: 'multi', mode: 'survival' }));
    });
  }, []);

  const scrollTo = (to: string) => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const pick = (id: string) => {
    if (id === heroId || authBusy) return;
    void selectCharacter(id).then(() => useCamp.setState({ view: null, status: 'loading' }));
  };

  let body;
  if (authStatus === 'loading') body = <p className="camp-empty">Checking your session...</p>;
  else if (authStatus !== 'in' || !account) body = <SignIn />;
  else if (status === 'idle' || status === 'loading') body = <p className="camp-empty">Opening your farm...</p>;
  else if (status === 'error' && !view) body = <p className="camp-warn" role="alert">{error}</p>;
  else if (status === 'out') body = <SignIn />;
  else if (!view) {
    body = (
      <section className="camp-signin">
        <h2>{account.displayName} has not set out yet</h2>
        <p>A hero has to enter the game once, on a computer, before it can check in or go farming. After that this page can send it out.</p>
      </section>
    );
  } else {
    body = (
      <>
        {error && <p className="camp-warn small">{error}</p>}
        <DailyCard view={view} />
        <CampTrips view={view} />
      </>
    );
  }

  const signed = authStatus === 'in' && !!account;
  const daily = view?.camp.daily;
  const badges = daily
    ? [daily.can ? `Day ${daily.nextStreak} is ready` : `Day ${daily.streak} checked in`, view.camp.trip ? 'Out farming' : 'At home', `${view.hero.coins.toLocaleString('en-US')} Auren`]
    : ['Once a day', 'Four expeditions', 'Auren and supplies'];

  return (
    <div className="fp cp camp fm" ref={root} style={{ '--c': '#f0b020' } as CSSProperties}>
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
            <button onClick={goBeyond}>The World</button>
            <button onClick={() => toFront('site-features')}>Classes</button>
            <button onClick={() => toFront('l-expansions')}>Expansions</button>
            <button className="fp-link-farm" aria-current="page" onClick={() => document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'smooth' })}>
              Farm
            </button>
            <button className="fp-link-ranks" onClick={goRanks}>Ranks</button>
            <button className="fp-link-market" onClick={goMarket}>
              Market
            </button>
            <button className="fp-link-shop" onClick={goShop}>Shop</button>
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

      <section className="cp-hero fm-hero" id="farm-top">
        <div className="fp-art" aria-hidden="true">
          <div className="fp-art-m">
            <div className="fp-art-kb" style={{ backgroundImage: `url(${ART.hero})` }} />
          </div>
        </div>
        <div className="fp-rays" aria-hidden="true" />
        <div className="cp-wash" aria-hidden="true" />
        <Embers />
        <div className="fm-hero-in">
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
            <b>Farm</b>
          </nav>
          <p className="cp-role">While you are away</p>
          <h1 className="cp-name fm-title">
            The <em>Farm</em>
          </h1>
          <p className="cp-tagline">Check in once a day. Send your hero out while you are away.</p>
          <p className="cp-lead">
            A gift of Auren for showing up, and expeditions that forage, raid and delve until you come back for what they found. Bags, the Stash and realm chat stay on the Play page.
          </p>
          <ul className="cp-badges" aria-label="The farm">
            {badges.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="cp-actions">
            <button className="fp-play fp-px" id="farm-play" onClick={play}>
              <span>
                <i aria-hidden="true" />
                Enter the realm
              </span>
            </button>
            <button className="fp-ghost fp-px" onClick={() => scrollTo('farm-work')}>
              <span>Check in</span>
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

        <section className="fp-sec fm-sec" id="farm-work">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>01</b>
                The farm
              </small>
              <h2>
                Check in, then <em>send them out</em>
              </h2>
            </div>
            <Blocks ids={[B.FARMLAND, B.WHEAT_3, B.GOLD_ORE]} />
          </Reveal>

          <div className="fm-work">
            {view && signed && <HeroLine view={view} />}
            {signed && account.characters.length > 1 && (
              <div className="camp-heroes" role="group" aria-label="Your heroes">
                {account.characters.map((c) => (
                  <button key={c.id} type="button" className={c.id === heroId ? 'on' : ''} disabled={authBusy} aria-pressed={c.id === heroId} onClick={() => pick(c.id)}>
                    {c.displayName}
                    {c.class && <small>{c.class}</small>}
                  </button>
                ))}
              </div>
            )}
            {body}
            {signed && (
              <p className="camp-fine fm-fine">
                To create or remove a hero, or to fight, mine and build, use the game on a computer.{' '}
                <button type="button" className="camp-link" onClick={() => void load()}>
                  Refresh
                </button>
              </p>
            )}
          </div>
        </section>

        <section className="fp-sec fp-end">
          <Reveal>
            <div className="fp-pile">
              <Blocks ids={[B.GOLD_ORE, B.DIAMOND_ORE, B.PLANKS, B.GLOWSTONE, B.STONE]} size={72} />
            </div>
            <h2>
              Come back for what they <em>found</em>
            </h2>
            <p>Free in your browser. Sign in with your wallet, check in, and send your hero out.</p>
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

      <Notice />
    </div>
  );
}
