'use client';

import { useState } from 'react';
import { useUi } from '../ui/store';
import { ResourceBar } from './ClassUI';
import { ExperienceBar } from './ExperienceBar';import { Hotbar } from './Hotbar';
import { MiniMap } from './MapUI';
import { MenuScreen } from './MenuScreen';
import { QuestUI } from './QuestUI';
import { PartyUI } from './PartyUI';
import { SocialUI } from './SocialUI';
import { TradeUI } from './TradeUI';
import { PlayerUI } from './PlayerUI';
import { PickupFeed } from './PickupFeed';
import { RecipeToast } from './RecipeToast';
import { PlayerFrame } from './PlayerFrame';
import { MountSlot } from './MountUI';
import { AirBubbles } from './Vitals';

function DeathScreen() {
  const screen = useUi((s) => s.screen);
  const api = useUi((s) => s.api);
  const hardcore = useUi((s) => s.hardcore);
  const [confirm, setConfirm] = useState(false);
  if (screen !== 'dead' || !api) return null;
  if (hardcore) {
    return (
      <div id="death-screen" className="hardcore">
        <h2>Game over!</h2>
        <p>{api.deathMessage()}</p>
        <p className="sub">This was a hardcore world. You had one life.</p>
        <div className="buttons">
          <button id="spectate" onClick={() => api.respawn()}>
            Spectate world
          </button>
          <button id="to-title" onClick={() => api.quitToTitle()}>
            Title screen
          </button>
          <button id="delete-world" className="danger" onClick={() => (confirm ? void api.deleteWorld() : setConfirm(true))}>
            {confirm ? 'Really delete it?' : 'Delete world'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div id="death-screen">
      <h2>You died!</h2>
      <p>{api.deathMessage()}</p>
      <button onClick={() => api.respawn()}>Respawn</button>
    </div>
  );
}

/** Shown to a hardcore player after dying: the world carries on, but without them. */
function SpectatorBanner() {
  const spectating = useUi((s) => s.spectating);
  const screen = useUi((s) => s.screen);
  const api = useUi((s) => s.api);
  if (!spectating || screen !== 'none' || !api) return null;
  return (
    <div id="spectator-banner">
      <b>Spectating</b> &middot; your hardcore world is over. Fly with WASD, Space and Shift.
      <button onClick={() => api.quitToTitle()}>Title screen</button>
    </div>
  );
}

/** Lying in bed: the screen fades to black, with a way out. */
function SleepOverlay() {
  const sleeping = useUi((s) => s.sleeping);
  const fade = useUi((s) => s.sleep);
  const api = useUi((s) => s.api);
  if (fade <= 0 && !sleeping) return null;
  return (
    <div id="sleep-overlay" className={sleeping ? 'on' : 'off'} style={{ opacity: Math.min(0.94, fade * 0.94) }}>
      {sleeping && api ? (
        <button id="leave-bed" onClick={() => api.wake()}>
          Leave Bed
        </button>
      ) : null}
    </div>
  );
}

/** Flames along the bottom edge while the player is on fire. */
function FireOverlay() {
  const burning = useUi((s) => s.burning);
  return burning ? <div id="fire-overlay" /> : null;
}

/** All React-rendered game UI: vitals, hotbar, inventory screens and the death screen. */
export function GameUI() {
  const screen = useUi((s) => s.screen);
  const spectating = useUi((s) => s.spectating);
  return (
    <>
      <div id="hud-bottom" style={{ display: !spectating && (screen === 'none' || screen === 'dead') ? 'flex' : 'none' }}>
        <AirBubbles />
        <ExperienceBar />
        <ResourceBar />
        <Hotbar />
      </div>
      <PlayerFrame />
      <MountSlot />
      <MenuScreen />
      <DeathScreen />
      <SpectatorBanner />
      <SleepOverlay />
      <FireOverlay />
      <RecipeToast />
      <PickupFeed />
      <QuestUI />
      <PartyUI />
      <SocialUI />
      <PlayerUI />
      <TradeUI />
      <MiniMap />
    </>
  );
}
