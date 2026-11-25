'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { MODES, type HomeMode } from './modes';
import { MODE_SHOT, SHOT } from './homeAssets';
import { Spot } from './fx';

export type Way = 'single' | 'multi';

/**
 * What PLAY asks: single player or multiplayer, then (single player) the game mode.
 * Survival has its own modes. Island is the only one for now, and it is clicked before the character lobby.
 * Creative and Hardcore go straight on, and their world is chosen in the lobby.
 * `mode` is the badge the player came from, if any (it is lit).
 */
export function WayDialog({ mode, onDone, onClose }: { mode: HomeMode | null; onDone: (way: Way, mode: HomeMode | null) => void; onClose: () => void }) {
  const [step, setStep] = useState<'way' | 'mode' | 'survival'>('way');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fp-dlg-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fp-dlg-glow">
        <div className="fp-dlg fp-px" role="dialog" aria-modal="true" aria-labelledby="way-title" id="way-dialog">
          <button className="fp-dlg-x" id="way-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
          {step === 'way' ? (
            <>
              <p className="fp-dlg-kicker">Play SolRift</p>
              <h2 id="way-title">How do you want to play?</h2>
              <div className="fp-ways">
                <Spot as="div" className="fp-way-wrap">
                  <button type="button" id="pick-single" className="fp-way fp-tile fp-px" onClick={() => setStep('mode')}>
                    <i className="fp-tile-art" style={{ '--art': `url(${SHOT.isle})` } as CSSProperties} />
                    <span className="fp-tile-copy">
                      <small>Your own world</small>
                      <strong>Single player</strong>
                      <span>Play on this device. Pick a game mode, then your character.</span>
                      <em>
                        Choose <i>&rarr;</i>
                      </em>
                    </span>
                  </button>
                </Spot>
                <Spot as="div" className="fp-way-wrap">
                  <button type="button" id="pick-multi" className="fp-way fp-tile fp-px" onClick={() => onDone('multi', null)}>
                    <i className="fp-tile-art" style={{ '--art': `url(${SHOT.dusk})` } as CSSProperties} />
                    <span className="fp-tile-copy">
                      <small>With other players</small>
                      <strong>Multiplayer</strong>
                      <span>Join the Dawnwatch realm: a village, quests and a dungeon.</span>
                      <em>
                        Choose <i>&rarr;</i>
                      </em>
                    </span>
                  </button>
                </Spot>
              </div>
            </>
          ) : step === 'survival' ? (
            <>
              <p className="fp-dlg-kicker">Survival</p>
              <h2 id="way-title">Choose a survival mode</h2>
              <div className="fp-ways one">
                <Spot as="div" className="fp-way-wrap">
                  <button type="button" className="fp-way fp-tile fp-px" id="pick-survival-isle" onClick={() => onDone('single', 'survival')}>
                    <i className="fp-tile-art" style={{ '--art': 'url(/art/island-mode-survival.png)' } as CSSProperties} />
                    <span className="fp-tile-copy">
                      <small>Water on every side</small>
                      <strong>Island</strong>
                      <span>A small island. Days are counted, and you start with nothing.</span>
                      <em>
                        Choose <i>&rarr;</i>
                      </em>
                    </span>
                  </button>
                </Spot>
              </div>
              <button type="button" className="fp-dlg-back-btn" id="survival-back" onClick={() => setStep('mode')}>
                &larr; Back
              </button>
            </>
          ) : (
            <>
              <p className="fp-dlg-kicker">Single player</p>
              <h2 id="way-title">Choose a game mode</h2>
              <div className="fp-ways three">
                {MODES.map((m) => (
                  <Spot key={m.id} as="div" className="fp-way-wrap">
                    <button type="button" className={`fp-way fp-tile fp-px ${m.id === mode ? 'lit' : ''}`} data-mode={m.id} id={`pick-mode-${m.id}`} onClick={() => (m.id === 'survival' ? setStep('survival') : onDone('single', m.id))}>
                      <i className="fp-tile-art" style={{ '--art': `url(${MODE_SHOT[m.id]})` } as CSSProperties} />
                      <span className="fp-tile-copy">
                        <small>{m.tagline}</small>
                        <strong>{m.name}</strong>
                        <span>{m.blurb}</span>
                      </span>
                    </button>
                  </Spot>
                ))}
              </div>
              <button type="button" className="fp-dlg-back-btn" id="way-back" onClick={() => setStep('way')}>
                &larr; Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
