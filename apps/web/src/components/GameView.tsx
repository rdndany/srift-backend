'use client';

import { useEffect, useState } from 'react';
import { AccountPanel } from './AccountPanel';
import { CloudPanel } from './CloudPanel';
import { GameUI } from './GameUI';
import { HomeScreen, type PlayChoice } from './HomeScreen';
import { HANDOFF_KEYS, entryAllowed, gamePath, isPlayPath } from '../game/route';
import { useProfile } from '../profile/store';
import { useUi } from '../ui/store';
import { WorldTools } from './WorldTools';
import { LoadingScreen } from './LoadingScreen';
import { PauseSettings } from './PauseSettings';
import { GAME_VERSION, latestExpansion } from '@solrift/shared';
import './pause.css';

const latest = latestExpansion();

/**
 * Leave the game, for the character lobby or for the front page: the world is saved, then the page goes there. A guest keeps
 * nothing, so for them either one asks a second time before everything is thrown away.
 */
function QuitButton({ guest }: { guest: boolean }) {
  const api = useUi((s) => s.api);
  const [armed, setArmed] = useState<'characters' | 'title' | null>(null);
  const [busy, setBusy] = useState(false);
  // Going back into the game takes the question back.
  useEffect(() => {
    const onLock = () => document.pointerLockElement && setArmed(null);
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);
  const leave = (to: 'characters' | 'title') => {
    if (!api || busy) return;
    if (guest && armed !== to) {
      setArmed(to);
      return;
    }
    setBusy(true);
    if (to === 'characters') api.quitToCharacters();
    else api.quitToTitle();
  };
  return (
    <div className="pause-quit" data-no-play>
      <button id="to-characters" className={armed === 'characters' ? 'armed' : ''} disabled={busy} onClick={() => leave('characters')}>
        {busy ? 'Leaving...' : armed === 'characters' ? 'Yes, leave and lose everything' : 'Change character'}
      </button>
      <button id="quit-game" className={armed === 'title' ? 'armed' : ''} disabled={busy} onClick={() => leave('title')}>
        {busy ? 'Leaving...' : armed === 'title' ? 'Yes, quit and lose everything' : 'Quit game'}
      </button>
      {armed && !busy && (
        <p id="quit-warning">
          You are a guest: this world, your progress and your character are not saved.{' '}
          <button className="link" id="quit-cancel" onClick={() => setArmed(null)}>
            Keep playing
          </button>
        </p>
      )}
    </div>
  );
}
/**
 * React shell for the game. React owns the static DOM (canvas, HUD containers,
 * start overlay) and the inventory/vitals UI; the engine owns everything inside
 * the canvas and updates per-frame HUD bits imperatively. The engine is loaded
 * lazily on the client.
 */
export default function GameView() {
  // null until we have looked at the address; 'home' shows the title screen; anything else starts
  // that game. Addresses with parameters (?seed, ?online, ?debug ...) skip the title screen, unless they ask for it with ?home.
  const [start, setStart] = useState<PlayChoice | 'home' | 'direct' | null>(null);
  const identity = useProfile((s) => s.identity);
  const name = useProfile((s) => s.name);
  useEffect(() => {
    // An id address (`play.solrift.io/<uid>`) opened on its own, not from the lobby's Play: go through the lobby first.
    if (!entryAllowed(location.pathname)) return void location.replace(gamePath());
    const params = new URLSearchParams(location.search);
    // (What the website hands to the lobby, `?way=multi` and the like, is not a game parameter.)
    for (const k of HANDOFF_KEYS) params.delete(k);
    setStart(!isPlayPath(location.pathname) && (params.size === 0 || params.has('home')) ? 'home' : 'direct');
  }, []);

  useEffect(() => {
    if (start === null || start === 'home') return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const choice = start === 'direct' ? {} : start;

    import('../game/main')
      .then(({ startGame }) =>
        startGame({
          isCancelled: () => cancelled,
          ...choice,
          // /world: start over in the other world (the same choice of save, mode and seed).
          switchWorld: (world, mode) => setStart((s) => ({ ...(s === 'direct' || s === 'home' || s === null ? {} : s), world, mode, hardcore: false }) as PlayChoice),
        }),
      )
      .then((d) => {
        if (cancelled) d();
        else dispose = d;
      })
      .catch((err) => {
        console.error(err);
        const el = document.getElementById('status');
        if (el) {
          el.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
          el.style.color = '#ff6b6b';
        }
        // The message is on the pause screen: let it show through the loading screen.
        document.getElementById('loading-screen')?.classList.add('gone');
      });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [start]);

  return (
    <>
      <canvas id="game" />
      <div id="vignette" />
      <div id="underwater" />
      <div id="damage" />
      <div id="crosshair" />
      <div id="hitmarker" />
      <div id="break-progress">
        <div />
      </div>
      <div id="item-name" />
      <GameUI />
      <div id="debug" />
      <div id="admin-bar" />
      {start !== null && start !== 'home' && <LoadingScreen />}
      {(start === null || start === 'home') && (
        <div id="home-layer">{start === 'home' && <HomeScreen onPlay={setStart} />}</div>
      )}
      <div id="overlay">
        <div className="pause-card">
         <div className="pause-edge">
          <div className="pause-in">
          <header className="pause-head">
            <h1>
              Sol<b>Rift</b>
            </h1>
            <div className="pause-sub">
              <span className="only-single">Game paused</span>
              <span className="only-online">Menu</span>
            </div>
            {/* The connection status shows only here, while the game is paused. */}
            <div id="net" className="off">
              offline
            </div>
          </header>
          <p id="status">Generating world...</p>

          <div className="pause-body">
            <section className="pause-menu">
              <button id="resume" className="pause-resume">
                <span>
                  <i aria-hidden="true" />
                  <span className="only-single">Resume game</span>
                  <span className="only-online">Back to the game</span>
                </span>
              </button>
              <div className="pause-box" data-no-play>
                <h2>Account</h2>
                {identity === 'guest' ? (
                  <p className="guest-note" id="guest-pause-note">
                    Playing as <b>{name}</b>, a guest. Nothing is saved: your world, progress and character are gone when you leave. To keep them next time, quit and enter with a Solana wallet.
                  </p>
                ) : (
                  <>
                    <AccountPanel />
                    <CloudPanel />
                  </>
                )}
              </div>
              {identity !== 'guest' && (
                <div className="pause-box only-single" data-no-play>
                  <h2>World</h2>
                  <WorldTools />
                </div>
              )}
              <QuitButton guest={identity === 'guest'} />
            </section>

            <PauseSettings />
          </div>
          <footer className="pause-foot">
            <p className="pause-hint">
              <span className="only-single">Click anywhere outside the panels to play</span>
              <span className="only-online">The world keeps going while this is open. Click outside the panels to go back.</span>
            </p>
            <p className="pause-ver" id="pause-version">
              SolRift {GAME_VERSION}
              {latest?.subtitle ? ` \u00B7 ${latest.subtitle}` : ''}
            </p>
          </footer>
          </div>
         </div>
        </div>
      </div>
    </>
  );
}
