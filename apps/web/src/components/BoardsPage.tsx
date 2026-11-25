'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { lobbyUrl } from '../game/route';
import { AccountPanel } from './AccountPanel';
import { ClickSparks, Embers, useFrontMotion } from './fx';
import { SCROLL_KEY, goBeyond, goFarm, goMarket, goShop, goToken } from './frontNav';
import { ART } from './homeAssets';
import './home.css';
import './front.css';
import './classPage.css';
import './boards.css';
import './responsive.css';

interface IsleRow {
  rank: number;
  name: string;
  days: number;
}

interface LevelRow {
  rank: number;
  name: string;
  level: number;
  class: string | null;
}

interface Boards {
  isle: IsleRow[];
  levels: LevelRow[];
  you: string | null;
}

const toFront = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(SCROLL_KEY, id);
  } catch {
    /* no storage: the page just opens at the top */
  }
  location.assign('/');
};

/** `/leaderboards`: Survival Island days, and realm character level. */
export function BoardsPage() {
  const root = useRef<HTMLDivElement>(null);
  useFrontMotion(root);
  const [boards, setBoards] = useState<Boards | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    void fetch('/api/leaderboard', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('boards'))))
      .then((body: Boards) => {
        setBoards(body);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'instant' });
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const play = () => location.assign(lobbyUrl());
  const you = boards?.you ?? null;

  return (
    <div className="fp cp lb" ref={root} style={{ '--c': '#f0b020' } as CSSProperties}>
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
            <button className="fp-link-farm" onClick={goFarm}>
              Farm
            </button>
            <button className="fp-link-ranks" aria-current="page" onClick={() => document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'smooth' })}>
              Ranks
            </button>
            <button className="fp-link-market" onClick={goMarket}>
              Market
            </button>
            <button className="fp-link-shop" onClick={goShop}>
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

      <section className="cp-hero lb-hero" id="lb-top">
        <div className="fp-art" aria-hidden="true">
          <div className="fp-art-m">
            <div className="fp-art-kb" style={{ backgroundImage: `url(${ART.hero})` }} />
          </div>
        </div>
        <div className="fp-rays" aria-hidden="true" />
        <div className="cp-wash" aria-hidden="true" />
        <Embers />
        <div className="lb-hero-in">
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
            <b>Leaderboards</b>
          </nav>
          <p className="cp-role">The standings</p>
          <h1 className="cp-name lb-title">
            The <em>Leaderboards</em>
          </h1>
          <p className="cp-tagline">Who has lasted on the island, and who has climbed in the realm.</p>
          <p className="cp-lead">Survival Island ranks the days a signed-in character has survived. The Realm ranks each character by level.</p>
          <ul className="cp-badges" aria-label="The boards">
            <li>Survival Island</li>
            <li>The Realm</li>
          </ul>
          <div className="cp-actions">
            <button className="fp-play fp-px" onClick={play}>
              <span>
                <i aria-hidden="true" />
                Enter the realm
              </span>
            </button>
            <button className="fp-ghost fp-px" onClick={() => document.getElementById('lb-boards')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <span>See the boards</span>
            </button>
          </div>
        </div>
      </section>

      <main className="fp-below">
      <div className="lb-boards" id="lb-boards">
        <Board
          title="Survival Island"
          note="Ranked by days survived. A signed-in character keeps their best day."
          error={error && !boards}
          waiting={!boards && !error}
        >
          <table className="lb-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Character</th>
                <th className="num">Days</th>
              </tr>
            </thead>
            <tbody>
              {boards?.isle.map((row) => (
                <tr key={row.name} className={row.name === you ? 'you' : undefined}>
                  <td className="num">{row.rank}</td>
                  <td>{row.name}</td>
                  <td className="num">{row.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {boards && boards.isle.length === 0 && <p className="lb-empty">No days recorded yet.</p>}
        </Board>
        <Board
          title="The Realm"
          note="Ranked by character level."
          error={error && !boards}
          waiting={!boards && !error}
        >
          <table className="lb-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Character</th>
                <th>Class</th>
                <th className="num">Level</th>
              </tr>
            </thead>
            <tbody>
              {boards?.levels.map((row) => (
                <tr key={row.name} className={row.name === you ? 'you' : undefined}>
                  <td className="num">{row.rank}</td>
                  <td>{row.name}</td>
                  <td>{row.class ?? '—'}</td>
                  <td className="num">{row.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {boards && boards.levels.length === 0 && <p className="lb-empty">No one has entered the realm yet.</p>}
        </Board>
      </div>
      </main>
    </div>
  );
}

function Board({
  title,
  note,
  error,
  waiting,
  children,
}: {
  title: string;
  note: string;
  error: boolean;
  waiting: boolean;
  children: ReactNode;
}) {
  return (
    <section className="lb-board">
      <h2>{title}</h2>
      <p className="lb-note">{note}</p>
      {waiting && <p className="lb-status">Loading…</p>}
      {error && <p className="lb-status">The boards could not be loaded.</p>}
      {!waiting && !error && children}
    </section>
  );
}
