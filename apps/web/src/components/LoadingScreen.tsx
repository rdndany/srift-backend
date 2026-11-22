'use client';

import { useEffect, useState } from 'react';
import { B } from '@solrift/shared';
import { BlockCube } from './BlockCube';
import './loading.css';

const TIPS = [
  'Press E to open your inventory and crafting grid.',
  'Hold the left mouse button to mine. Right click places a block.',
  'Double-tap W to sprint. Shift sneaks along edges.',
  'Torches keep the monsters away. Place them before dark.',
  'Hold a map and right-click to unfold it and see where you are.',
  'Press Esc at any time to pause and see the controls.',
  'Sleep in a bed to skip the night.',
  'Press T to chat when you are in the online realm.',
];

/**
 * Shown from the moment a game is chosen until the world around the player is ready. `game/main.ts` drives it by id:
 * `#loading-text` and `#loading-bar` (progress), and the classes `ready` (shows the "Enter the world" button, because the browser
 * would not hand over the mouse by itself) and `gone` (finished).
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
        <div className="ld-blocks" aria-hidden>
          {[B.GRASS, B.PLANKS, B.STONE, B.GOLD_ORE, B.DIAMOND_ORE].map((id, i) => (
            <span key={id} style={{ animationDelay: `${(i * 0.14).toFixed(2)}s` }}>
              <BlockCube id={id} size={64} />
            </span>
          ))}
        </div>
        <h1 className="ld-logo">
          <img src="/art/solrift-logo.png" alt="SolRift" draggable={false} />
        </h1>
        <div className="ld-bar" aria-hidden>
          <div id="loading-bar" />
        </div>
        <p id="loading-text">Loading...</p>
        <button type="button" className="ld-enter" id="loading-enter">
          <span className="ld-enter-edge">
            <span className="ld-enter-face">
              <i aria-hidden="true" />
              Enter the world
            </span>
          </span>
        </button>
        <p className="ld-hint">or press any key</p>
        <p className="ld-tip" key={tip}>
          {TIPS[tip]}
        </p>
      </div>
    </div>
  );
}
