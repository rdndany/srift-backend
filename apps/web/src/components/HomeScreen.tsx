'use client';

import { useState } from 'react';
import './home.css';
import { GameLobby, saveLobbyChoice, type PlayTarget } from './GameLobby';
import { Landing } from './Landing';
import type { Way } from './WayDialog';
import type { WorldKind } from '@solrift/shared';
import { useProfile } from '../profile/store';
import { LocalSaveStore } from '../game/storage';
import { gamePath, isGamePath, playPath } from '../game/route';
import { modeOfSave, startOptionsFor, type HomeMode } from './modes';

export interface PlayChoice {
  seed: number;
  mode: 'survival' | 'creative';
  hardcore: boolean;
  /** Set when the game restarts in the other world (/world). */
  world?: Exclude<WorldKind, 'adventure'>;
  /** Playing as a guest: nothing of this world or character is saved. */
  guest?: boolean;
}

const choiceFor = (seed: number, mode: HomeMode, guest: boolean, world?: 'beyond'): PlayChoice => ({ seed, ...startOptionsFor(mode), ...(guest ? { guest: true } : {}), ...(world ? { world } : {}) });

/**
 * The title screen: the front page at `/`, whose PLAY buttons ask single player or multiplayer (and the game mode) in a
 * dialog and then go to `/game`: the character lobby, where a guest or a Solana wallet picks or makes a character and
 * presses Play. It only appears on the plain addresses; links with `?seed=`, `?online` and the like go straight to the game.
 */
export function HomeScreen({ onPlay }: { onPlay: (choice: PlayChoice) => void }) {
  // (This is only ever drawn in the browser, once the game view has looked at the address: the address is read here.)
  const [lobby] = useState(() => isGamePath(location.pathname));

  /** The character is ready: into the game. */
  const enter = async (t: PlayTarget) => {
    const { identity, name } = useProfile.getState();
    if (t.kind === 'multi') {
      // The realm is its own page: `/play/<name>` joins it under the character's name.
      location.assign(playPath(name));
      return;
    }
    let mode = t.mode;
    if (identity === 'wallet' && !t.world) {
      // A seed is a world's name on this device: a world the chosen character already has keeps the mode it was made in.
      try {
        const existing = (await LocalSaveStore.listWorlds()).find((w) => w.seed === t.seed);
        if (existing) mode = modeOfSave(existing.player);
      } catch {
        /* no list: start the world as chosen */
      }
    }
    onPlay(choiceFor(t.seed, mode, identity === 'guest', t.world));
  };

  // (What PLAY's dialog chose goes to the game page through the session, so that is a plain address.)
  const toLobby = (way: Way, mode: HomeMode | null) => {
    saveLobbyChoice({ way, mode: mode ?? 'survival' });
    location.assign(gamePath(location.search));
  };

  return (
    // (The front page and the lobby are both `front`; "landing" is the class of the /welcome page, which pads and scrolls itself.)
    <div id="home" className="front">
      {lobby ? <GameLobby onEnter={(t) => void enter(t)} /> : <Landing onEnter={toLobby} />}
    </div>
  );
}
