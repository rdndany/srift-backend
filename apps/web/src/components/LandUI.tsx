'use client';

import { useEffect, useState } from 'react';
import { MESSAGES, type LandClaimView, type LandDetail, type LandPublicConfig, type Perms } from '@solrift/shared';
import { useUi } from '../ui/store';

/**
 * The land on screen: while the Land Surveyor is held, the keys, the live price and what the crosshair is on; the confirmation of a
 * purchase; and the window of the player's lands (key B). All of it only shows what the server said (see game/landClient.ts).
 */

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

const ROLE_NAMES: Record<string, string> = { owner: 'Owner', co_owner: 'Co-owner', builder: 'Builder', visitor: 'Visitor', public: 'Public' };
const KIND_NAMES: Record<string, string> = { mine: 'Your land', guild: 'Guild land', shared: 'Shared with you', other: 'Private land', wild: 'Unclaimed wilderness' };

function compass(dx: number, dz: number): string {
  if (Math.abs(dx) < 4 && Math.abs(dz) < 4) return 'here';
  const a = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[(Math.round(a / 45) + 8) % 8];
}

/** How long the wilderness takes to put itself back, in words. */
const restoreText = (c: LandPublicConfig): string => (c.restoreHoursMin === c.restoreHoursMax ? `${c.restoreHoursMin} hours` : `${c.restoreHoursMin} to ${c.restoreHoursMax} hours`);

function Keys() {
  const l = useUi((s) => s.land);
  return (
    <div id="land-keys" data-testid="land-keys">
      <span>
        <kbd>Left click</kbd> mark a corner
      </span>
      <span>
        <kbd>Right click</kbd> {l.closed ? 'open the shape' : 'undo'}
      </span>
      <span>
        <kbd>E</kbd> {l.closed ? 'review the price' : 'close the shape'}
      </span>
      <span>
        <kbd>B</kbd> my lands
      </span>
      <span>
        <kbd>Esc</kbd> cancel
      </span>
    </div>
  );
}

function LivePrice() {
  const l = useUi((s) => s.land);
  const cfg = l.cfg;
  if (!cfg || l.corners === 0) return null;
  const p = l.preview;
  const tone = l.fault ? 'bad' : !p ? 'info' : p.ok ? 'good' : p.status === 'funds' ? 'warn' : 'bad';
  const text = l.fault ?? p?.text ?? (l.corners < cfg.minCorners ? `Mark ${cfg.minCorners - l.corners} more corner${cfg.minCorners - l.corners === 1 ? '' : 's'}.` : 'Measuring...');
  return (
    <div id="land-price" data-testid="land-price" className={`tone-${tone}`}>
      <div className="land-price-title">{l.expanding ? 'Expand property' : 'Claim land'}</div>
      <dl>
        <dt>Corners</dt>
        <dd>
          {l.corners} / {cfg.maxCorners}
        </dd>
        <dt>Area</dt>
        <dd>{p && p.area > 0 ? `${fmt(p.area)} blocks` : '-'}</dd>
        <dt>Price per block</dt>
        <dd>{p ? fmt(p.pricePerBlock) : fmt(cfg.pricePerBlock)} Auren</dd>
        <dt>{l.expanding ? 'Extra cost' : 'Total'}</dt>
        <dd className="land-total">{p && p.area > 0 ? `${fmt(p.price)} Auren` : '-'}</dd>
        <dt>Your Auren</dt>
        <dd>{p ? fmt(p.balance) : '-'}</dd>
        <dt>Largest claim</dt>
        <dd>{p ? fmt(p.maxArea) : fmt(cfg.maxArea)} blocks</dd>
      </dl>
      {l.straightText && (
        <div className={`land-straight${l.perfect ? ' perfect' : ''}`} data-testid="land-straight">
          {l.perfect ? '\u25a3 ' : '\u2514 '}
          {l.straightText}
        </div>
      )}
      <div className="land-status" data-testid="land-status">
        {text}
      </div>
    </div>
  );
}

function Look() {
  const look = useUi((s) => s.land.look);
  if (!look) return null;
  return (
    <div id="land-look" data-testid="land-look" className={`kind-${look.kind}`}>
      <div className="land-look-name">{look.kind === 'wild' ? 'Available wilderness' : look.name}</div>
      {look.kind === 'wild' ? (
        <div className="land-look-line">{MESSAGES.wilderness}</div>
      ) : look.kind === 'protected' ? (
        <>
          <div className="land-look-line">Server territory</div>
          <div className="land-look-line">{look.note}</div>
        </>
      ) : (
        <>
          <div className="land-look-line">
            {KIND_NAMES[look.kind]} &middot; {look.owner}
          </div>
          <div className="land-look-line">
            {look.shared ? 'Shared' : 'Private'} &middot; {look.canBuild ? 'you may build here' : 'you may not build here'}
          </div>
        </>
      )}
    </div>
  );
}

function Hint() {
  const hint = useUi((s) => s.land.hint);
  if (!hint) return null;
  return (
    <div id="land-hint" key={hint.stamp} className={`tone-${hint.tone}`} data-testid="land-hint">
      {hint.text}
    </div>
  );
}

function Tutorial() {
  const show = useUi((s) => s.land.tutorial);
  const corners = useUi((s) => s.land.corners);
  const api = useUi((s) => s.landApi);
  if (!show || corners > 0 || !api) return null;
  return (
    <div id="land-tutorial" data-testid="land-tutorial">
      <div className="land-tutorial-title">The Land Surveyor</div>
      <p>{'Want to build a home that lasts? Use your Land Surveyor to mark a piece of wilderness. Land you claim is yours to shape, and your buildings will remain.'}</p>
      <ol>
        <li>Hold the Land Surveyor.</li>
        <li>Left-click to mark the corners of your land.</li>
        <li>Press E to close the shape.</li>
        <li>Check the price in Auren.</li>
        <li>Press E again to buy the claim.</li>
        <li>Build and dig freely inside it.</li>
      </ol>
      <button className="quest-btn secondary small" onClick={() => api.dismissTutorial()}>
        Got it
      </button>
    </div>
  );
}

/** Everything the Surveyor shows while it is in the hand. */
export function LandHud() {
  const holding = useUi((s) => s.land.holding);
  const screen = useUi((s) => s.screen);
  const confirm = useUi((s) => s.land.confirm);
  const manage = useUi((s) => s.land.manage);
  if (!holding || screen !== 'none' || confirm || manage) return null;
  return (
    <>
      <Keys />
      <LivePrice />
      <Look />
      <Hint />
      <Tutorial />
    </>
  );
}

function Confirm() {
  const l = useUi((s) => s.land);
  const api = useUi((s) => s.landApi);
  const [name, setName] = useState('');
  useEffect(() => {
    if (l.confirm) setName((n) => n || 'My Land');
  }, [l.confirm]);
  if (!l.confirm || !api || !l.cfg) return null;
  const p = l.preview;
  const cfg = l.cfg;
  const can = !!p && p.ok && !l.fault && !l.busy;
  const after = p ? p.balance - p.price : 0;
  const failed = l.result && !l.result.ok ? l.result.text : null;
  return (
    <div id="land-window" className="land-confirm" data-testid="land-confirm" onContextMenu={(e) => e.preventDefault()}>
      <div className="log-card land-card small">
        <div className="title">{l.expanding ? 'Expand this property' : 'Claim this land'}</div>
        <button className="wow-close" onClick={() => api.confirmClose()} aria-label="Close">
          &times;
        </button>
        <div className="land-body">
          {l.expanding ? null : (
            <label className="land-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} spellCheck={false} autoComplete="off" data-testid="land-name" />
            </label>
          )}
          <dl className="land-facts">
            <dt>Corners</dt>
            <dd>{l.corners}</dd>
            <dt>Area</dt>
            <dd>{p ? `${fmt(p.area)} blocks` : '-'}</dd>
            <dt>Price per block</dt>
            <dd>{p ? fmt(p.pricePerBlock) : fmt(cfg.pricePerBlock)} Auren</dd>
            <dt>{l.expanding ? 'Extra cost' : 'Total price'}</dt>
            <dd className="land-total" data-testid="land-total">
              {p ? fmt(p.price) : '-'} Auren
            </dd>
            <dt>Your Auren</dt>
            <dd>{p ? fmt(p.balance) : '-'}</dd>
            <dt>After the purchase</dt>
            <dd className={after < 0 ? 'neg' : ''}>{p ? fmt(after) : '-'}</dd>
            <dt>Largest claim you may make</dt>
            <dd>{p ? fmt(p.maxArea) : fmt(cfg.maxArea)} blocks</dd>
            <dt>Protected underground</dt>
            <dd>{cfg.depth} blocks below the original ground</dd>
          </dl>
          <div className={`land-verdict tone-${can ? 'good' : p && p.status === 'funds' ? 'warn' : 'bad'}`} data-testid="land-verdict">
            {l.fault ?? p?.text ?? 'Measuring...'}
          </div>
          <p className="land-note">
            What you build and dig inside a claim is yours and stays: it survives restarts, and nobody else can change it. Wilderness outside claims is different: what is changed there can regenerate after {restoreText(cfg)}. Anything you already changed in the wilderness
            that your claim covers becomes permanent when you buy it.
          </p>
          {failed ? <div className="land-verdict tone-bad">{failed}</div> : null}
        </div>
        <div className="dialog-foot">
          <button className="quest-btn" data-testid="land-buy" disabled={!can} onClick={() => api.buy(name)}>
            {l.busy ? 'Buying...' : l.expanding ? 'Expand' : 'Buy this land'}
          </button>
          <button className="quest-btn secondary" data-testid="land-back" onClick={() => api.confirmClose()}>
            Keep marking
          </button>
          <button
            className="quest-btn danger"
            onClick={() => {
              api.cancel();
              api.confirmClose();
            }}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

const PERM_LABELS: [keyof Perms, string][] = [
  ['build', 'Build and dig'],
  ['containers', 'Open chests'],
  ['stations', 'Use workstations'],
  ['doors', 'Use doors and levers'],
];

function Detail({ d }: { d: LandDetail }) {
  const api = useUi((s) => s.landApi)!;
  const cfg = useUi((s) => s.land.cfg)!;
  const at = useUi((s) => s.land.at);
  const result = useUi((s) => s.land.result);
  const [name, setName] = useState(d.name);
  const [who, setWho] = useState('');
  const [role, setRole] = useState('builder');
  const [sure, setSure] = useState(false);
  useEffect(() => {
    setName(d.name);
    setSure(false);
  }, [d.id, d.name]);
  const owner = d.role === 'owner';
  const manage = d.can.manage;
  const [x0, z0, x1, z1] = d.box;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const dist = Math.round(Math.hypot(cx - at[0], cz - at[1]));
  return (
    <div className="land-detail" data-testid="land-detail">
      <div className="land-row">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} disabled={!manage} spellCheck={false} autoComplete="off" data-testid="land-rename" />
        <button className="quest-btn small" disabled={!manage || name.trim() === d.name || !name.trim()} onClick={() => api.rename(d.id, name)}>
          Rename
        </button>
      </div>
      <dl className="land-facts">
        <dt>Owner</dt>
        <dd>
          {d.owner} ({ROLE_NAMES[d.role] ?? d.role})
        </dd>
        <dt>Area</dt>
        <dd>{fmt(d.area)} blocks</dd>
        <dt>Boundary</dt>
        <dd>
          {d.vertices.length} corners, from {x0},{z0} to {x1},{z1}
        </dd>
        <dt>Protected underground</dt>
        <dd>{d.depth} blocks below the original ground</dd>
        <dt>Value</dt>
        <dd>
          {fmt(d.paid)} Auren paid{d.price !== d.paid ? ` (${fmt(d.price)} now)` : ''}
        </dd>
        <dt>Where</dt>
        <dd>{dist < 4 ? 'You are here' : `${fmt(dist)} blocks ${compass(cx - at[0], cz - at[1])}`}</dd>
        {d.status === 'releasing' && d.releaseAt ? (
          <>
            <dt>Status</dt>
            <dd className="neg">Being released: ends {new Date(d.releaseAt).toLocaleString()}</dd>
          </>
        ) : null}
      </dl>

      <h3>Who may do what</h3>
      <div className="land-grants">
        {d.grants.length === 0 ? <p className="log-empty">Nobody else has been invited.</p> : null}
        {d.grants.map((g) => (
          <div className="land-grant" key={`${g.kind}:${g.name}`}>
            <span>
              {g.kind === 'guild' ? '[Guild] ' : ''}
              {g.name}
            </span>
            <span className="role">{ROLE_NAMES[g.role] ?? g.role}</span>
            {manage ? (
              <button className="quest-btn danger small" onClick={() => api.revoke(d.id, g.kind, g.kind === 'guild' ? g.id : g.name)}>
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {manage ? (
          <form
            className="land-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (who.trim()) {
                api.grant(d.id, 'player', who.trim(), role);
                setWho('');
              }
            }}
          >
            <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Player in the world" maxLength={24} spellCheck={false} autoComplete="off" data-testid="land-invite" />
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="visitor">Visitor</option>
              <option value="builder">Builder</option>
              <option value="co_owner">Co-owner</option>
            </select>
            <button type="submit" className="quest-btn small" disabled={!who.trim()}>
              Invite
            </button>
          </form>
        ) : null}
        {manage ? (
          <div className="land-row">
            <span>Your guild</span>
            <button className="quest-btn secondary small" onClick={() => api.grant(d.id, 'guild', 'guild', 'builder')}>
              Let it build
            </button>
            <button className="quest-btn secondary small" onClick={() => api.grant(d.id, 'guild', 'guild', 'visitor')}>
              Let it visit
            </button>
          </div>
        ) : null}
      </div>

      <h3>Everyone else</h3>
      <div className="land-perms">
        {PERM_LABELS.map(([k, label]) => (
          <label key={k}>
            <input type="checkbox" checked={d.publicPerms[k]} disabled={!manage} onChange={(e) => api.setPublic(d.id, { [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>

      <div className="dialog-foot land-actions">
        {owner || d.can.release ? (
          <button className="quest-btn" disabled={d.status !== 'active'} onClick={() => api.expand(d.id)} data-testid="land-expand">
            Expand
          </button>
        ) : null}
        {d.status === 'releasing' ? (
          <button className="quest-btn secondary" onClick={() => api.unrelease(d.id)}>
            Keep this land
          </button>
        ) : d.can.release ? (
          sure ? (
            <>
              <span className="land-warn">
                Release for {fmt(d.refund)} Auren? Your buildings stay for {cfg.releaseGraceHours} hours and you can change your mind until then.
              </span>
              <button
                className="quest-btn danger"
                data-testid="land-release-yes"
                onClick={() => {
                  api.release(d.id);
                  setSure(false);
                }}
              >
                Release
              </button>
              <button className="quest-btn secondary" onClick={() => setSure(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="quest-btn danger" data-testid="land-release" onClick={() => setSure(true)}>
              Release...
            </button>
          )
        ) : null}
      </div>
      {result && result.what !== 'buy' && result.what !== 'expand' ? <div className={`land-verdict tone-${result.ok ? 'good' : 'bad'}`}>{result.text}</div> : null}
    </div>
  );
}

function Manage() {
  const l = useUi((s) => s.land);
  const api = useUi((s) => s.landApi);
  if (!l.manage || !api || !l.cfg) return null;
  const owned = l.mine.filter((c) => c.status !== 'released' && c.status !== 'revoked');
  const total = owned.reduce((n, c) => n + c.area, 0);
  const cfg = l.cfg;
  const pick = (c: LandClaimView) => api.select(c.id);
  return (
    <div id="land-window" data-testid="land-manage" onContextMenu={(e) => e.preventDefault()}>
      <div className="log-card land-card">
        <div className="title">My Lands</div>
        <button className="wow-close" onClick={() => api.closeManage()} aria-label="Close">
          &times;
        </button>
        <div className="log-head">
          <span className="log-count" data-testid="land-limits">
            Claims {owned.length} / {cfg.maxClaims} &middot; Area {fmt(total)} / {fmt(cfg.maxTotalArea)} blocks &middot; {fmt(cfg.pricePerBlock)} Auren per block
          </span>
        </div>
        <div className="land-cols">
          <div className="land-list">
            {owned.length === 0 ? <p className="log-empty">You own no land yet. Hold the Land Surveyor, mark the corners, and buy a claim.</p> : null}
            {owned.map((c) => (
              <button key={c.id} className={`land-item${l.detail?.id === c.id ? ' sel' : ''}`} onClick={() => pick(c)} data-claim={c.id}>
                <b>{c.name}</b>
                <span>
                  {fmt(c.area)} blocks{c.status === 'releasing' ? ' - releasing' : c.shared ? ' - shared' : ''}
                </span>
              </button>
            ))}
            <button className="quest-btn secondary small" onClick={() => api.recover()}>
              Recover items taken by the wilderness
            </button>
          </div>
          <div className="land-pane">{l.detail ? <Detail d={l.detail} /> : <p className="log-empty">Choose a property to see its boundary, value and who may build on it.</p>}</div>
        </div>
        <div className="dialog-foot">
          <button className="quest-btn secondary" onClick={() => api.closeManage()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function LandUI() {
  const has = useUi((s) => !!s.land.cfg);
  if (!has) return null;
  return (
    <>
      <LandHud />
      <Confirm />
      <Manage />
    </>
  );
}
