'use client';

import { useEffect, useState } from 'react';
import { LocalSaveStore, type SavedWorld } from '../game/storage';
import { useAuth } from '../auth/store';
import { MODE_SHOT, SHOT } from './homeAssets';
import { NPCS, QUESTS } from '@solrift/shared';
import { MODES, modeInfo, modeOfSave, parseSeed, timeAgo, type HomeMode } from './modes';

type Way = 'single' | 'multi';

const serverUrl = (): string => process.env.NEXT_PUBLIC_SERVER_URL ?? `ws://${location.hostname}:8787`;

interface RealmStatus {
  status: 'checking' | 'online' | 'offline';
  /** Players in the realm and how many it takes, once the server has said (its welcome message). */
  players: number | null;
  max: number | null;
}

/** Whether the game server answers and how full it is: opens a connection, listens for the welcome, closes it again. */
function useRealmStatus(url: () => string): RealmStatus {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [count, setCount] = useState<{ players: number; max: number | null } | null>(null);
  useEffect(() => {
    setStatus('checking');
    setCount(null);
    let done = false;
    let ws: WebSocket | null = null;
    const finish = (s: 'online' | 'offline') => {
      if (done) return;
      done = true;
      setStatus(s);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    };
    const timer = setTimeout(() => finish('offline'), 4000);
    try {
      ws = new WebSocket(url());
      ws.onopen = () => {
        setStatus('online');
        // The welcome carries the head count; give it a moment, then hang up either way.
        setTimeout(() => finish('online'), 1500);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (msg.t === 'welcome' && typeof msg.players === 'number') {
            setCount({ players: msg.players, max: typeof msg.max === 'number' ? msg.max : null });
            finish('online');
          }
        } catch {
          /* not for us */
        }
      };
      ws.onerror = () => finish('offline');
    } catch {
      finish('offline');
    }
    return () => {
      done = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    };
  }, [url]);
  return { status, players: count?.players ?? null, max: count?.max ?? null };
}

/** Where the play page sends the player next: the character step, then the game. */
export type PlayTarget = { kind: 'single'; seed: number; mode: HomeMode } | { kind: 'multi' };

function WayCard({ id, title, tag, text, img, on, onPick }: { id: Way; title: string; tag: string; text: string; img: string; on: boolean; onPick: () => void }) {
  return (
    <button className={`way-card ${on ? 'on' : ''}`} id={`way-${id}`} aria-pressed={on} onClick={onPick}>
      <span className="way-img" style={{ backgroundImage: `url(${img})` }} />
      <span className="way-body">
        <span className="way-title">{title}</span>
        <span className="way-tag">{tag}</span>
        <span className="way-text">{text}</span>
      </span>
    </button>
  );
}

function SinglePanel({
  worlds,
  mode,
  setMode,
  seedText,
  setSeedText,
  onNew,
  onContinue,
  onOpen,
  onDelete,
  deleting,
  error,
}: {
  worlds: SavedWorld[] | null;
  mode: HomeMode;
  setMode: (m: HomeMode) => void;
  seedText: string;
  setSeedText: (s: string) => void;
  onNew: () => void;
  onContinue: (w: SavedWorld) => void;
  onOpen: (w: SavedWorld) => void;
  onDelete: (seed: number) => void;
  deleting: number | null;
  error: string | null;
}) {
  const info = modeInfo(mode);
  // `worlds` is only filled for a signed-in wallet character: saves belong to a character, and a guest keeps nothing.
  const latest = worlds?.find((w) => modeOfSave(w.player) === mode);
  const over = latest?.player.gameOver === true;
  const typedSeed = seedText.trim() === '' ? null : parseSeed(seedText);
  const clash = typedSeed !== null ? worlds?.find((w) => w.seed === typedSeed) : undefined;

  return (
    <div className="panel" id="single-panel" data-ready={worlds !== null}>
      <h2 className="step">
        <i>2</i> Choose a game mode
      </h2>
      <div className="mode-cards">
        {MODES.map((m) => (
          <button key={m.id} className={`mode-card ${m.id} ${m.id === mode ? 'on' : ''}`} data-mode={m.id} aria-pressed={m.id === mode} onClick={() => setMode(m.id)}>
            <span className="mc-img" style={{ backgroundImage: `url(${MODE_SHOT[m.id]})` }} />
            <span className="mc-name">{m.name}</span>
            <span className="mc-tag">{m.tagline}</span>
          </button>
        ))}
      </div>

      <div className={`mode-detail ${mode}`} id="mode-detail">
        <div className="md-info">
          <p className="md-blurb">{info.blurb}</p>
          <div className="md-cols">
            <div>
              <h3>What you can do</h3>
              <ul>
                {info.can.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Mechanics</h3>
              <ul>
                {info.mechanics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="md-best">
            <b>Best for:</b> {info.bestFor}
          </p>
        </div>
        <div className="md-start">
          <label htmlFor="seed-input">World seed</label>
          <input id="seed-input" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="random" spellCheck={false} autoComplete="off" maxLength={40} />
          {clash ? (
            <span className="seed-note">
              You already have this world ({modeInfo(modeOfSave(clash.player)).name}); New world opens it.
            </span>
          ) : (
            <span className="seed-hint">A number or any words. The same seed always gives the same world.</span>
          )}
          <button className="gold-btn new-world" onClick={onNew}>
            New world
          </button>
          <span className="seed-hint" id="single-next">
            Next you choose who you play. A guest world is not saved; a wallet character&apos;s worlds are.
          </span>
          {latest && (
            <button className="ghost-btn continue" onClick={() => onContinue(latest)}>
              {over ? 'Visit last world' : 'Continue'}
              <small>{timeAgo(latest.player.savedAt ?? null)}</small>
            </button>
          )}
        </div>
      </div>

      {worlds && worlds.length > 0 && (
        <section className="world-list">
          <h2 className="step">Your worlds</h2>
          <ul>
            {worlds.map((w) => {
              const m = modeOfSave(w.player);
              return (
                <li key={w.seed} data-seed={w.seed}>
                  <span className={`badge ${m}`}>{modeInfo(m).name}</span>
                  <span className="world-name">
                    World <code>{w.seed}</code>
                    {w.player.gameOver && <em> &middot; game over</em>}
                  </span>
                  <span className="world-when">{timeAgo(w.player.savedAt ?? null)}</span>
                  <button className="mini play" onClick={() => onOpen(w)}>
                    Play
                  </button>
                  <button className="mini delete danger" onClick={() => onDelete(w.seed)}>
                    {deleting === w.seed ? 'Really delete?' : 'Delete'}
                  </button>
                </li>
              );
            })}
          </ul>
          {error && <p className="home-error">{error}</p>}
        </section>
      )}
    </div>
  );
}

/** The one multiplayer realm: the Adventure world, with its village, quests and dungeon. */
function MultiPanel({ onJoin }: { onJoin: () => void }) {
  const { status, players, max } = useRealmStatus(serverUrl);
  const full = players !== null && max !== null && players >= max;
  const label = full
    ? `Full ${players}/${max}`
    : status === 'online' && players !== null
      ? `Online ${players}${max ? ` / ${max}` : ''}`
      : { checking: 'Checking...', online: 'Online', offline: 'Offline' }[status];

  return (
    <div className="panel" id="multi-panel">
      <h2 className="step">
        <i>2</i> Choose a realm
      </h2>
      <div className="realm-table">
        <div className="realm-head">
          <span>Realm</span>
          <span>Type</span>
          <span>Status</span>
        </div>
        <div className="realm-row on">
          <span className="realm-name">Dawnwatch</span>
          <span>Adventure: quests and dungeons</span>
          <span className={`realm-status ${status}`}>
            <i /> {label}
          </span>
        </div>
      </div>
      <div className="realm-join">
        <div className="realm-art" style={{ backgroundImage: `url(${SHOT.dusk})` }} />
        <div className="realm-form">
          <div className="adventure-about" id="adventure-about">
            <span className="adv-kicker">Embers of the Hollow King &middot; preview</span>
            <p>
              You wake with nothing in a cave under the village of Dawnwatch, half dead, found in the forest by its hunters. Climb out, meet {NPCS.length} villagers, take up {QUESTS.length} quests that teach you the whole game, from your first log to your first
              dungeon, and clear the Hollow Cellar together.
            </p>
            <ul>
              <li>Quest givers with ! and ? over their heads, a quest log (L) and a tracker</li>
              <li>Rewards, a named dungeon and place banners, like an MMO</li>
              <li>Kills count for everyone nearby, so a group can share its quests</li>
              <li>Talk to each other with the in-game chat (press T)</li>
            </ul>
          </div>
          <button id="online-link-home" className="gold-btn join" onClick={onJoin}>
            Join realm
          </button>
          {status === 'offline' && <span className="seed-note">The server did not answer. You can still try to join.</span>}
          <span className="seed-hint">Next you choose who you play: a guest (nothing saved) or a Solana wallet character (progress and character saved to your account).</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The first page after PLAY GAME: single player or multiplayer. Single player picks a game mode (and a seed or a saved
 * world), multiplayer picks a realm. Who you play (guest or wallet, name, look, class) is asked next, right before the game.
 */
export function PlayPage({
  onBack,
  onNext,
  initialMode,
  initialWay = 'single',
  initialSeed = '',
}: {
  onBack: () => void;
  onNext: (target: PlayTarget) => void;
  initialMode: HomeMode | null;
  initialWay?: Way;
  initialSeed?: string;
}) {
  const [way, setWay] = useState<Way>(initialWay);
  const init = useAuth((s) => s.init);
  const authStatus = useAuth((s) => s.status);
  // Saved worlds belong to a wallet character. They are listed once a wallet is signed in; a guest keeps nothing.
  const characterId = useAuth((s) => (s.status === 'in' && s.account && s.account.look !== null ? s.account.id : null));
  const [mode, setMode] = useState<HomeMode>(initialMode ?? 'survival');
  const [worlds, setWorlds] = useState<SavedWorld[] | null>(null);
  const [seedText, setSeedText] = useState(initialSeed);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    characterId === null
      ? Promise.resolve(setWorlds([]))
      : LocalSaveStore.listWorlds().then(setWorlds, (err) => {
          console.warn('could not list worlds', err);
          setWorlds([]);
        });
  useEffect(() => init(), [init]);
  useEffect(() => {
    if (authStatus === 'loading') return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, characterId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onBack]);

  const startNew = () => {
    const seed = parseSeed(seedText);
    const existing = worlds?.find((w) => w.seed === seed);
    // A seed is a world's name on this device: reuse the world if it is already there.
    onNext({ kind: 'single', seed, mode: existing ? modeOfSave(existing.player) : mode });
  };

  const remove = async (seed: number) => {
    if (deleting !== seed) {
      setDeleting(seed);
      return;
    }
    try {
      await new LocalSaveStore(String(seed)).clear();
      setError(null);
    } catch (err) {
      setError(`Could not delete the world: ${err instanceof Error ? err.message : String(err)}`);
    }
    setDeleting(null);
    await refresh();
  };

  const bg = way === 'multi' ? SHOT.dusk : MODE_SHOT[mode];
  const shots = [...new Set([SHOT.dusk, ...MODES.map((m) => MODE_SHOT[m.id])])];

  return (
    <div className="playpage">
      <div className="play-bg" aria-hidden>
        {shots.map((s) => (
          <div key={s} className={s === bg ? 'on' : ''} style={{ backgroundImage: `url(${s})` }} />
        ))}
      </div>
      <header className="play-top" data-no-play>
        <button className="back-btn" id="back-home" onClick={onBack}>
          &larr; Back
        </button>
        <div className="play-logo">
          Sol<b>Rift</b>
        </div>
        <div className="play-account" />
      </header>

      <main className="play-main">
        <h1 className="play-title">Choose your adventure</h1>
        <h2 className="step">
          <i>1</i> How do you want to play?
        </h2>
        <div className="way-cards">
          <WayCard id="single" title="Single player" tag="Your own world" text="Play on this device, offline. Pick a game mode and a world. A wallet character's worlds are saved in your browser; a guest's are not." img={SHOT.isle} on={way === 'single'} onPick={() => setWay('single')} />
          <WayCard id="multi" title="Multiplayer" tag="Play with others" text="Join the Adventure realm: a village, quests and a dungeon, with other players." img={SHOT.dusk} on={way === 'multi'} onPick={() => setWay('multi')} />
        </div>

        {way === 'single' ? (
          <SinglePanel
            worlds={worlds}
            mode={mode}
            setMode={setMode}
            seedText={seedText}
            setSeedText={setSeedText}
            onNew={startNew}
            onContinue={(w) => onNext({ kind: 'single', seed: w.seed, mode })}
            onOpen={(w) => onNext({ kind: 'single', seed: w.seed, mode: modeOfSave(w.player) })}
            onDelete={(s) => void remove(s)}
            deleting={deleting}
            error={error}
          />
        ) : (
          <MultiPanel onJoin={() => onNext({ kind: 'multi' })} />
        )}
        <p className="play-foot">Caves and villages to explore. The Nether and the End are not in the game yet.</p>
      </main>
    </div>
  );
}
