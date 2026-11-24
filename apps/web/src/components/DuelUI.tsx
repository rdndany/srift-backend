'use client';

import { useEffect, useState } from 'react';
import { useUi } from '../ui/store';
import './duel.css';

/** "Ada wants to duel": buttons when the mouse is free, Y and N when it is not. */
function DuelAsk() {
  const from = useUi((s) => s.duelAsk);
  const trading = useUi((s) => !!s.trade);
  const tradeAsk = useUi((s) => s.tradeAsk);
  const partyInvite = useUi((s) => s.partyInvite);
  const api = useUi((s) => s.api);
  if (!from || trading || tradeAsk || partyInvite || !api) return null;
  return (
    <div id="duel-ask" data-testid="duel-ask" onContextMenu={(e) => e.preventDefault()}>
      <div className="invite-text">
        <b>{from}</b> wants to duel you
      </div>
      <div className="invite-buttons">
        <button className="quest-btn" data-testid="duel-ask-accept" onClick={() => api.duelAct({ a: 'accept' })}>
          Accept <kbd>Y</kbd>
        </button>
        <button className="quest-btn secondary" data-testid="duel-ask-decline" onClick={() => api.duelAct({ a: 'decline' })}>
          Decline <kbd>N</kbd>
        </button>
      </div>
    </div>
  );
}

/** 5, 4, 3, 2, 1, then Start, in the middle of the screen for both fighters. */
function DuelCount() {
  const n = useUi((s) => s.duelCount);
  const [shown, setShown] = useState(n);
  useEffect(() => {
    setShown(n);
    if (n !== 'start') return;
    const t = window.setTimeout(() => {
      if (useUi.getState().duelCount === 'start') useUi.setState({ duelCount: null });
    }, 1000);
    return () => window.clearTimeout(t);
  }, [n]);
  if (shown === null) return null;
  return (
    <div id="duel-count" data-testid="duel-count">
      <b>{shown === 'start' ? 'Start' : shown}</b>
    </div>
  );
}

export function DuelUI() {
  return (
    <>
      <DuelAsk />
      <DuelCount />
    </>
  );
}
