'use client';

import { useEffect, useState } from 'react';
import { AccountPanel } from './AccountPanel';
import { CloudPanel } from './CloudPanel';
import { GameUI } from './GameUI';
import { HomeScreen, type PlayChoice } from './HomeScreen';
import { isPlayPath } from '../game/route';
import { useProfile } from '../profile/store';
import { useUi } from '../ui/store';
import { WorldTools } from './WorldTools';
import { LoadingScreen } from './LoadingScreen';
import './pause.css';

/** The keys the pause screen lists: [keys, what they do]. */
const CONTROLS: readonly (readonly [readonly string[], string])[] = [
  [['W', 'A', 'S', 'D'], 'Move'],
  [['Space'], 'Jump'],
  [['Shift'], 'Sneak'],
  [['W', 'W'], 'Sprint (double-tap, or Ctrl)'],
  [['Left click'], 'Mine (hold)'],
  [['Right click'], 'Place, use, eat'],
  [['1-9'], 'Hotbar (or mouse wheel)'],
  [['E'], 'Inventory'],
  [['Q'], 'Drop (Ctrl+Q the stack)'],
  [['F4'], 'Survival / creative'],
  [['F'], 'Fly (creative)'],
  [['J'], 'Show / hide the minimap'],
  [['F3'], 'Debug info'],
  [['F2'], 'Admin bar (frame rate, load)'],
  [['[', ']'], 'Render distance'],
  [['R'], 'Respawn'],
  [['T'], 'Chat (online)'],
  [['Esc'], 'Pause'],
];

/**
 * Leave the game: the world is saved, then the page goes back to the front page. A guest keeps nothing, so for them it
 * asks a second time before everything is thrown away.
 */
function QuitButton({ guest }: { guest: boolean }) {
  const api = useUi((s) => s.api);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Going back into the game takes the question back.
  useEffect(() => {
    const onLock = () => document.pointerLockElement && setArmed(false);
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);
  const quit = () => {
    if (!api || busy) return;
    if (guest && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    api.quitToTitle();
  };
  return (
    <div className="pause-quit" data-no-play>
      <button id="quit-game" className={armed ? 'armed' : ''} disabled={busy} onClick={quit}>
        {busy ? 'Leaving...' : armed ? 'Yes, quit and lose everything' : 'Quit game'}
      </button>
      {armed && !busy && (
        <p id="quit-warning">
          You are a guest: this world, your progress and your character are not saved.{' '}
          <button className="link" id="quit-cancel" onClick={() => setArmed(false)}>
            Keep playing
          </button>
        </p>
      )}
    </div>
  );
}

/** The corner minimap on or off (key J too); the choice is remembered. It can be brought back from here while the game is paused. */
function MinimapSetting() {
  const on = useUi((s) => s.minimap);
  const toggle = () => {
    const next = !on;
    useUi.setState({ minimap: next });
    try {
      localStorage.setItem('solrift-minimap', next ? 'on' : 'off');
    } catch {
      /* storage may be blocked; the choice then lasts until the page is closed */
    }
  };
  return (
    <div className="pause-box" data-no-play>
      <h2>Display</h2>
      <button id="minimap-toggle" onClick={toggle}>
        Minimap: {on ? 'on' : 'off'} (J)
      </button>
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
  useEffect(() => setStart(!isPlayPath(location.pathname) && (location.search === '' || new URLSearchParams(location.search).has('home')) ? 'home' : 'direct'), []);

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
          <header className="pause-head">
            <h1>
              Sol<b>Rift</b>
            </h1>
            <div className="pause-sub">Game paused</div>
            {/* The connection status shows only here, while the game is paused. */}
            <div id="net" className="off">
              offline
            </div>
          </header>
          <p id="status">Generating world...</p>

          <div className="pause-body">
            <section className="pause-menu">
              <button id="resume" className="pause-resume">
                <span>Resume game</span>
              </button>
              <QuitButton guest={identity === 'guest'} />
              <div className="pause-box">
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
              <MinimapSetting />
              {identity !== 'guest' && (
                <div className="pause-box only-single">
                  <h2>World</h2>
                  <WorldTools />
                </div>
              )}
            </section>

            <section className="pause-keys">
              <h2>Controls</h2>
              <dl>
                {CONTROLS.map(([keys, what]) => (
                  <div key={what}>
                    <dt>
                      {keys.map((k, i) => (
                        <kbd key={i}>{k}</kbd>
                      ))}
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
          <p className="pause-foot">Click anywhere to play</p>
        </div>
      </div>
    </>
  );
}
