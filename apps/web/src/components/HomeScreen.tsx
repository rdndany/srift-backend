'use client';

import { useCallback, useEffect, useState } from 'react';
import './home.css';
import { IdentityPage } from './IdentityPage';
import { Landing } from './Landing';
import { PlayPage, type PlayTarget } from './PlayPage';
import type { WorldKind } from '@solrift/shared';
import { useProfile } from '../profile/store';
import { LocalSaveStore } from '../game/storage';
import { playPath } from '../game/route';
import { modeInfo, modeOfSave, startOptionsFor, type HomeMode } from './modes';

export interface PlayChoice {
  seed: number;
  mode: 'survival' | 'creative';
  hardcore: boolean;
  /** Set when the game restarts in the other world (/world). */
  world?: Exclude<WorldKind, 'adventure'>;
  /** Playing as a guest: nothing of this world or character is saved. */
  guest?: boolean;
}

const choiceFor = (seed: number, mode: HomeMode, guest: boolean): PlayChoice => ({ seed, ...startOptionsFor(mode), ...(guest ? { guest: true } : {}) });

type Page = 'landing' | 'play' | 'who';

/** What the character step says it leads to. */
function destinationOf(target: PlayTarget): { title: string; sub: string } {
  if (target.kind === 'multi') return { title: 'Multiplayer', sub: 'Dawnwatch realm' };
  return { title: 'Single player', sub: `${modeInfo(target.mode).name} \u00b7 world ${target.seed}` };
}

/**
 * The title screen. First a front page with a big PLAY GAME button. That opens `#play`: single player (then a game
 * mode, a seed or a saved world) or multiplayer (then a realm). Only then, right before the game, `#who`: enter as a
 * guest (nothing is saved) or with a Solana wallet (progress and character are saved), set a name and make a
 * character. It only appears on the plain address; links with `?seed=`, `?online` and the like go straight to the game.
 */
export function HomeScreen({ onPlay }: { onPlay: (choice: PlayChoice) => void }) {
  const [page, setPage] = useState<Page>('landing');
  const [pickedMode, setPickedMode] = useState<HomeMode | null>(null);
  // What was chosen on the play page; the character step needs it, so a reload on `#who` starts over at `#play`.
  const [target, setTarget] = useState<PlayTarget | null>(null);

  useEffect(() => {
    const sync = () => setPage(location.hash === '#play' ? 'play' : location.hash === '#who' ? 'who' : 'landing');
    sync();
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);

  // Each page starts at the top.
  useEffect(() => {
    document.getElementById('home-layer')?.scrollTo(0, 0);
  }, [page]);

  const go = useCallback((to: Page) => {
    const hash = to === 'landing' ? '' : `#${to}`;
    history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
    setPage(to);
  }, []);

  const openPlay = useCallback(
    (mode: HomeMode | null = null) => {
      setPickedMode(mode);
      setTarget(null);
      go('play');
    },
    [go],
  );

  /** The character is ready: into the game. */
  const enter = async (t: PlayTarget) => {
    const { identity, name } = useProfile.getState();
    if (t.kind === 'multi') {
      // The realm is its own page: `/play/<name>` joins it under the character's name.
      location.assign(playPath(name));
      return;
    }
    let mode = t.mode;
    if (identity === 'wallet') {
      // A seed is a world's name on this device: a world the chosen character already has keeps the mode it was made in.
      try {
        const existing = (await LocalSaveStore.listWorlds()).find((w) => w.seed === t.seed);
        if (existing) mode = modeOfSave(existing.player);
      } catch {
        /* no list: start the world as chosen */
      }
    }
    // The game gets the plain address, so a reload or "Title screen" starts from the front page.
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    onPlay(choiceFor(t.seed, mode, identity === 'guest'));
  };

  // `#who` without a choice (a reload, a pasted address) goes back to the play page.
  const shown: Page = page === 'who' && !target ? 'play' : page;

  return (
    <div id="home" className={shown}>
      {shown === 'landing' ? (
        <Landing onPlay={() => openPlay()} onMode={(m) => openPlay(m)} />
      ) : shown === 'play' ? (
        <PlayPage
          onBack={() => {
            setTarget(null);
            go('landing');
          }}
          onNext={(t) => {
            setTarget(t);
            go('who');
          }}
          // Coming back from the character step keeps what was chosen.
          initialMode={target?.kind === 'single' ? target.mode : pickedMode}
          initialWay={target?.kind === 'multi' ? 'multi' : 'single'}
          initialSeed={target?.kind === 'single' ? String(target.seed) : ''}
        />
      ) : (
        <IdentityPage destination={destinationOf(target!)} onBack={() => go('play')} onDone={() => void enter(target!)} />
      )}
    </div>
  );
}
