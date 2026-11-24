'use client';

import { toast } from 'sonner';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '../auth/store';
import { useCamp } from '../camp/store';
import { lobbyUrl } from '../game/route';
import { AccountPanel } from './AccountPanel';
import { CampChat } from './CampChat';
import { CampHero, HeroLine } from './CampHero';
import { CampMarket } from './CampMarket';
import { CampTrips, DailyCard } from './CampTrips';
import { ClickSparks, useFrontMotion } from './fx';
import { SCROLL_KEY, goMarket, goToken, goShop } from './frontNav';
import { WalletLinks } from './WalletLinks';
import './home.css';
import './front.css';
import './classPage.css';
import './sheet.css';
import './campPage.css';
import './responsive.css';

/** How often the hero is asked for again while the page is in view (ms): what the game or another device did shows up without a tap. */
const REFRESH_MS = 10_000;

type Tab = 'hero' | 'market' | 'trips' | 'realm';
const TABS: { id: Tab; name: string; icon: string }[] = [
  { id: 'hero', name: 'Hero', icon: '\u2694' },
  { id: 'market', name: 'Market', icon: '\u26C1' },
  { id: 'trips', name: 'Trips', icon: '\u26F0' },
  { id: 'realm', name: 'Realm', icon: '\u2709' },
];

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
    <section className="camp-signin" data-testid="camp-signin">
      <h2>Sign in to your camp</h2>
      <p>
        Your heroes, your Stash and your auctions follow your Solana wallet. Signing costs nothing and cannot touch your funds. No game is needed: this page works on a phone.
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

/** `/camp`: what a hero can do from a phone or a tablet, with no game running: gear, Stash, market, a daily gift, expeditions, chat. */
export function CampPage() {
  const root = useRef<HTMLDivElement>(null);
  useFrontMotion(root);
  const { status: authStatus, account, busy: authBusy, selectCharacter } = useAuth();
  const { view, status, error, load } = useCamp();
  const [tab, setTab] = useState<Tab>('hero');
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

  const pick = (id: string) => {
    if (id === heroId || authBusy) return;
    void selectCharacter(id).then(() => useCamp.setState({ view: null, status: 'loading' }));
  };

  const dailyDue = !!view?.camp.daily.can;
  const tripDone = !!view?.camp.trip && view.camp.now >= view.camp.trip.end;
  const mail = view?.auctions.mail.length ?? 0;
  const badge: Record<Tab, string> = { hero: dailyDue ? '!' : '', market: mail > 0 ? String(mail) : '', trips: tripDone ? '!' : '', realm: '' };

  let body;
  if (authStatus === 'loading') body = <p className="camp-empty">Checking your session...</p>;
  else if (authStatus !== 'in' || !account) body = <SignIn />;
  else if (status === 'idle' || status === 'loading') body = <p className="camp-empty">Opening your camp...</p>;
  else if (status === 'error' && !view) body = <p className="camp-warn" role="alert">{error}</p>;
  else if (status === 'out') body = <SignIn />;
  else if (!view) {
    body = (
      <section className="camp-signin">
        <h2>{account.displayName} has not set out yet</h2>
        <p>A hero has to enter the game once, on a computer, before it has a bag to look into. After that this page can manage it.</p>
      </section>
    );
  } else {
    body = (
      <>
        {error && <p className="camp-warn small">{error}</p>}
        {tab === 'hero' && (
          <>
            <DailyCard view={view} />
            <CampHero view={view} />
          </>
        )}
        {tab === 'market' && <CampMarket view={view} />}
        {tab === 'trips' && <CampTrips view={view} />}
        {tab === 'realm' && <CampChat hero={view.hero.id} guild={view.guild} />}
      </>
    );
  }

  const signed = authStatus === 'in' && !!account;

  return (
    <div className="fp cp camp" ref={root} style={{ '--c': '#f0b020' } as CSSProperties}>
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
            <button className="fp-link-camp" aria-current="page" onClick={() => document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'smooth' })}>
              Camp
            </button>
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

      <main className="camp-main" id="camp-top">
        <header className="camp-top">
          <p className="camp-crumbs">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                toFront(null);
              }}
            >
              SolRift
            </a>{' '}
            / <b>Camp</b>
          </p>
          <h1>
            Your <em>Camp</em>
          </h1>
          {view && signed ? <HeroLine view={view} /> : <p className="camp-lead">Manage your hero from a phone or a tablet: gear, Stash, market, a daily gift, expeditions and chat.</p>}
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
        </header>

        <div className="camp-body">{body}</div>
        {signed && (
          <p className="camp-fine">
            To create or remove a hero, or to fight, mine and build, use the game on a computer.{' '}
            <button type="button" className="camp-link" onClick={() => void load()}>
              Refresh
            </button>
          </p>
        )}
      </main>

      <Notice />

      {signed && view && (
        <nav className="camp-tabbar" role="tablist" aria-label="Camp">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} data-testid={`camp-tab-${t.id}`} onClick={() => setTab(t.id)}>
              <i aria-hidden="true">{t.icon}</i>
              <span>{t.name}</span>
              {badge[t.id] && <b>{badge[t.id]}</b>}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
