'use client';

import { useEffect, useState } from 'react';
import './loading.css';

const TIPS = [
  'Press E to open your inventory and crafting grid.',
  'Hold the left mouse button to mine. Right click places a block.',
  'Double-tap W to sprint. Shift sneaks along edges.',
  'Torches keep the monsters away. Place them before dark.',
  'Press J to hide or show the minimap.',
  'Press Esc at any time to pause and see the controls.',
  'Sleep in a bed to skip the night.',
  'Press T to chat when you are in the online realm.',
];

/**
 * Shown from the moment a game is chosen until the world around the player is ready. `game/main.ts` drives it by id:
 * `#loading-text` and `#loading-bar` (progress), and the classes `ready` (waiting for a click, because the browser would
 * not hand over the mouse by itself) and `gone` (finished).
 */
export function LoadingScreen() {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    setTip(Math.floor(Math.random() * TIPS.length));
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <div id="loading-screen" role="status" aria-live="polite">
      <div className="ld-embers" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37 + 6) % 100}%`, animationDelay: `${-(i * 1.9) % 12}s`, animationDuration: `${8 + (i % 5) * 2}s` }} />
        ))}
      </div>
      <div className="ld-center">
        <div className="ld-stage" aria-hidden>
          <div className="ld-cube">
            <span className="f front" />
            <span className="f back" />
            <span className="f left" />
            <span className="f right" />
            <span className="f top" />
            <span className="f bottom" />
          </div>
          <div className="ld-shadow" />
        </div>
        <h1 className="ld-logo">
          Sol<b>Rift</b>
        </h1>
        <div className="ld-bar" aria-hidden>
          <div id="loading-bar" />
        </div>
        <p id="loading-text">Loading...</p>
        <p className="ld-enter">Click to enter the world</p>
        <p className="ld-tip" key={tip}>
          {TIPS[tip]}
        </p>
      </div>
    </div>
  );
}
