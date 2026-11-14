'use client';

import { useState } from 'react';
import { MAX_PARTY } from '@solrift/shared';
import { useUi } from '../ui/store';

/** The party, on the left of the screen: who is in it, with their health. */
function PartyFrame() {
  const party = useUi((s) => s.party);
  const screen = useUi((s) => s.screen);
  if (party.length === 0 || screen === 'dead') return null;
  return (
    <div id="party-frame" data-testid="party-frame">
      {party.map((m) => (
        <div key={m.name} className={`party-member${m.you ? ' you' : ''}`} data-member={m.name}>
          <div className="party-name">
            {m.lead ? <span className="party-crown" title="Party leader">&#9819;</span> : null}
            <span>{m.name}</span>
            <span className="party-level">{m.level}</span>
          </div>
          <div className="party-hp" title={`${m.hp} / 20`}>
            <div style={{ width: `${Math.max(0, Math.min(100, (m.hp / 20) * 100))}%` }} className={m.hp <= 6 ? 'low' : ''} />
          </div>
        </div>
      ))}
      <div className="party-hint">
        <kbd>P</kbd> party
      </div>
    </div>
  );
}

/** "Ada invites you to a party": buttons for when the mouse is free, Y and N for when it is not. */
function PartyInvite() {
  const invite = useUi((s) => s.partyInvite);
  const api = useUi((s) => s.api);
  if (!invite || !api) return null;
  return (
    <div id="party-invite" data-testid="party-invite" onContextMenu={(e) => e.preventDefault()}>
      <div className="invite-text">
        <b>{invite}</b> invites you to a party
      </div>
      <div className="invite-buttons">
        <button className="quest-btn" data-testid="party-accept" onClick={() => api.partyAction('accept')}>
          Accept <kbd>Y</kbd>
        </button>
        <button className="quest-btn secondary" data-testid="party-decline" onClick={() => api.partyAction('decline')}>
          Decline <kbd>N</kbd>
        </button>
      </div>
    </div>
  );
}

/** The party window (P): invite somebody, hand over the lead, remove a member, leave. */
function PartyWindow() {
  const open = useUi((s) => s.partyOpen);
  const party = useUi((s) => s.party);
  const api = useUi((s) => s.api);
  const [name, setName] = useState('');
  if (!open || !api) return null;
  const me = party.find((m) => m.you);
  const leader = !me || me.lead; // somebody on their own may start a party
  const full = party.length >= MAX_PARTY;
  const clean = name.replace(/[^\w -]/g, '').trim();
  const invite = () => {
    if (!clean) return;
    api.partyAction('invite', clean);
    setName('');
  };
  return (
    <div id="party-window" data-testid="party-window" onContextMenu={(e) => e.preventDefault()}>
      <div className="log-card party-card">
        <div className="title">Party</div>
        <button className="wow-close" onClick={() => api.togglePartyWindow(false)} aria-label="Close">
          &times;
        </button>
        <div className="log-head">
          <span className="log-count">
            {party.length}/{MAX_PARTY} members
          </span>
        </div>
        <div className="party-body">
          {party.length === 0 ? <p className="log-empty">You are not in a party. Invite a player by name; everyone in a party enters the same dungeon.</p> : null}
          {party.map((m) => (
            <div key={m.name} className="party-row" data-member={m.name}>
              <span className="party-row-name" style={m.you ? undefined : { cursor: 'pointer' }} onClick={(e) => !m.you && api.openPlayerMenu(m.name, e.clientX, e.clientY)}>
                {m.lead ? <span className="party-crown">&#9819;</span> : null} {m.name}
                {m.you ? ' (you)' : ''}
              </span>
              <span className="party-row-level">Level {m.level}</span>
              <span className="party-row-hp">{m.hp}/20</span>
              {leader && me && !m.you ? (
                <span className="party-row-actions">
                  <button className="quest-btn secondary small" onClick={() => api.partyAction('leader', m.name)}>
                    Make leader
                  </button>
                  <button className="quest-btn danger small" onClick={() => api.partyAction('kick', m.name)}>
                    Remove
                  </button>
                </span>
              ) : null}
            </div>
          ))}
          {leader ? (
            <form
              className="party-invite-form"
              onSubmit={(e) => {
                e.preventDefault();
                invite();
              }}
            >
              <input id="party-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={full ? 'The party is full' : 'Player name'} maxLength={24} disabled={full} spellCheck={false} autoComplete="off" />
              <button type="submit" className="quest-btn" data-testid="party-send" disabled={full || !clean}>
                Invite
              </button>
            </form>
          ) : (
            <p className="log-empty">Only the party leader can invite and remove players.</p>
          )}
        </div>
        <div className="dialog-foot">
          {me ? (
            <button className="quest-btn danger" data-testid="party-leave" onClick={() => api.partyAction('leave')}>
              Leave party
            </button>
          ) : null}
          <button className="quest-btn secondary" onClick={() => api.togglePartyWindow(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Everything about the party on screen. Only in the online Adventure realm. */
export function PartyUI() {
  const adventure = useUi((s) => s.adventure);
  if (!adventure) return null;
  return (
    <>
      <PartyFrame />
      <PartyInvite />
      <PartyWindow />
    </>
  );
}
