'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CLASSES,
  GUILD_COST,
  GUILD_NAME_MAX,
  GUILD_RANKS,
  GUILD_TAG_MAX,
  INSPECT_SLOTS,
  MAX_GUILD_MEMBERS,
  MAX_MOTD,
  RANK_OFFICER,
  cleanGuildName,
  cleanGuildTag,
  guildNameError,
  tooltipLines,
  type ClassId,
  type TipLine,
} from '@solrift/shared';
import { stackOf } from '../game/remote';
import { useUi } from '../ui/store';
import { ItemView, Tip } from './ItemView';
import './social.css';

type Tab = 'friends' | 'online' | 'guild' | 'ignored';

/** "Warrior 12", in the colour of the class. */
export function ClassTag({ cls, level }: { cls?: ClassId; level?: number }) {
  if (!cls) return <span className="soc-class dim">{level ? `Level ${level}` : 'No class'}</span>;
  return (
    <span className="soc-class" style={{ color: CLASSES[cls].color }}>
      {CLASSES[cls].name} {level ?? ''}
    </span>
  );
}

/** Another player's equipment: class, level and the six slots, with their tooltips. */
function InspectWindow() {
  const inspect = useUi((s) => s.inspect);
  const [tip, setTip] = useState<TipLine[]>([]);
  const tipRef = useRef<HTMLDivElement>(null);
  const move = (e: { clientX: number; clientY: number }) => {
    const el = tipRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const x = e.clientX + 14 + w > window.innerWidth - 6 ? Math.max(6, e.clientX - 14 - w) : e.clientX + 14;
    el.style.transform = `translate(${x}px, ${Math.max(6, Math.min(e.clientY - 34, window.innerHeight - el.offsetHeight - 6))}px)`;
  };
  if (!inspect) return null;
  const close = () => {
    useUi.setState({ inspect: null });
    useUi.getState().api?.closePlayerMenu(true); // back to the game, when nothing else holds the mouse
  };
  const view = inspect.view;
  return (
    <div className="soc-inspect" data-testid="inspect-window" onMouseMove={move}>
      <div className="soc-inspect-head">
        <b>{inspect.name}</b>
        {view ? <ClassTag cls={view.cls} level={view.level} /> : null}
        <button className="wow-close" aria-label="Close" onClick={close}>
          &times;
        </button>
      </div>
      {view ? (
        <div className="soc-slots">
          {INSPECT_SLOTS.map((label, i) => {
            const stack = stackOf(view.items[i] ?? null);
            return (
              <div key={label} className="soc-slot-row">
                <div
                  className="slot"
                  data-testid={`inspect-slot-${i}`}
                  onMouseEnter={() => setTip(stack ? tooltipLines(stack, view.cls ?? null, view.level ?? 0) : [])}
                  onMouseLeave={() => setTip([])}
                >
                  <ItemView stack={stack} />
                </div>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="log-empty">{inspect.name} is not here any more.</p>
      )}
      <div ref={tipRef} className="tooltip" style={{ display: tip.length ? 'block' : 'none' }}>
        <Tip lines={tip} />
      </div>
    </div>
  );
}

/** The guild tab: found one, or see the roster and what your rank may do. */
function GuildTab() {
  const social = useUi((s) => s.social);
  const api = useUi((s) => s.api);
  const [gname, setGname] = useState('');
  const [tag, setTag] = useState('');
  const [invite, setInvite] = useState('');
  const [motd, setMotd] = useState<string | null>(null);
  const [sure, setSure] = useState<'disband' | 'leave' | null>(null);
  const guild = social?.guild ?? null;
  if (!api) return null;
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

  if (!guild) {
    const cn = cleanGuildName(gname);
    const ct = cleanGuildTag(tag);
    const err = guildNameError(cn, ct);
    return (
      <>
        <p className="log-empty">You are not in a guild. Accept an invitation, or found one for {GUILD_COST} coins.</p>
        <form
          className="soc-add soc-found"
          onSubmit={(e) => {
            e.preventDefault();
            if (err) return;
            api.guild(`create ${cn} ${ct}`);
            setGname('');
            setTag('');
          }}
        >
          <input data-testid="guild-name" value={gname} onChange={(e) => setGname(e.target.value)} placeholder="Guild name" maxLength={GUILD_NAME_MAX} spellCheck={false} autoComplete="off" onKeyDown={stop} />
          <input data-testid="guild-tag" className="soc-tag-input" value={tag} onChange={(e) => setTag(cleanGuildTag(e.target.value))} placeholder="TAG" maxLength={GUILD_TAG_MAX} spellCheck={false} autoComplete="off" onKeyDown={stop} />
          <button type="submit" className="quest-btn" disabled={!!err} title={err ?? `Costs ${GUILD_COST} coins`}>
            Found ({GUILD_COST})
          </button>
        </form>
      </>
    );
  }

  const me = guild.rank;
  const canInvite = me <= RANK_OFFICER;
  const act = (line: string) => {
    api.guild(line);
    setSure(null);
  };
  return (
    <>
      <div className="soc-guild-head" data-testid="guild-head">
        <b>
          &lt;{guild.tag}&gt; {guild.name}
        </b>
        <span className="soc-class dim">
          {GUILD_RANKS[me]} &middot; {guild.members.length}/{MAX_GUILD_MEMBERS}
        </span>
      </div>
      {motd === null ? (
        <p className="soc-motd" data-testid="guild-motd">
          {guild.motd || 'No message of the day.'}
          {canInvite && (
            <button className="quest-btn secondary small" onClick={() => setMotd(guild.motd)}>
              Edit
            </button>
          )}
        </p>
      ) : (
        <form
          className="soc-add"
          onSubmit={(e) => {
            e.preventDefault();
            api.guild(`motd ${motd.trim()}`);
            setMotd(null);
          }}
        >
          <input autoFocus value={motd} onChange={(e) => setMotd(e.target.value)} maxLength={MAX_MOTD} placeholder="Message of the day" onKeyDown={stop} />
          <button type="submit" className="quest-btn">
            Set
          </button>
        </form>
      )}
      {guild.members.map((m) => (
        <div key={m.name} className={`soc-row${m.online ? '' : ' off'}`} data-guild-member={m.name}>
          <span className={`soc-dot${m.online ? ' on' : ''}`} />
          <span className="soc-name">
            {m.rank === 0 ? '\u2605 ' : m.rank === 1 ? '\u2606 ' : ''}
            {m.name}
          </span>
          {m.online ? <ClassTag cls={m.cls} level={m.level} /> : <span className="soc-class dim">Offline</span>}
          <span className="soc-actions">
            {me === 0 && m.rank === 2 && (
              <button className="quest-btn secondary small" onClick={() => act(`promote ${m.name}`)}>
                Promote
              </button>
            )}
            {me === 0 && m.rank === 1 && (
              <>
                <button className="quest-btn secondary small" onClick={() => act(`demote ${m.name}`)}>
                  Demote
                </button>
                <button className="quest-btn secondary small" onClick={() => act(`leader ${m.name}`)}>
                  Lead
                </button>
              </>
            )}
            {me < m.rank && (
              <button className="quest-btn danger small" onClick={() => act(`kick ${m.name}`)}>
                Kick
              </button>
            )}
          </span>
        </div>
      ))}
      {canInvite && (
        <form
          className="soc-add"
          onSubmit={(e) => {
            e.preventDefault();
            const n = invite.replace(/[^\p{L}\p{N} _.-]/gu, '').trim();
            if (!n) return;
            act(`invite ${n}`);
            setInvite('');
          }}
        >
          <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Invite a player by name (they must be online)" maxLength={24} spellCheck={false} autoComplete="off" onKeyDown={stop} />
          <button type="submit" className="quest-btn" disabled={!invite.trim()}>
            Invite
          </button>
        </form>
      )}
      <div className="soc-guild-foot">
        {me === 0 && (
          <button className="quest-btn danger small" data-act="disband" onClick={() => (sure === 'disband' ? act('disband') : setSure('disband'))}>
            {sure === 'disband' ? 'Really disband?' : 'Disband'}
          </button>
        )}
        {(me !== 0 || guild.members.length === 1) && (
          <button className="quest-btn danger small" data-act="leave" onClick={() => (sure === 'leave' ? act('leave') : setSure('leave'))}>
            {sure === 'leave' ? 'Really leave?' : 'Leave guild'}
          </button>
        )}
      </div>
    </>
  );
}

/** The social window (O): friends, who is online, who is ignored. */
function SocialWindow() {
  const open = useUi((s) => s.socialOpen);
  const social = useUi((s) => s.social);
  const api = useUi((s) => s.api);
  const adventure = useUi((s) => s.adventure);
  const [tab, setTab] = useState<Tab>('online');
  const [name, setName] = useState('');

  // The lists change as people come and go, so they are asked for again while the window is up.
  useEffect(() => {
    if (!open || !api) return;
    const id = window.setInterval(() => api.socialRefresh(), 2500);
    return () => window.clearInterval(id);
  }, [open, api]);

  if (!open || !api) return null;
  const friends = social?.friends ?? [];
  const online = social?.online ?? [];
  const ignored = social?.ignored ?? [];
  const onlineFriends = friends.filter((f) => f.online).length;
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'friends', label: 'Friends', n: friends.length },
    { id: 'online', label: 'Online', n: online.length },
    { id: 'guild', label: 'Guild', n: social?.guild?.members.length ?? 0 },
    { id: 'ignored', label: 'Ignored', n: ignored.length },
  ];
  const clean = name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim();

  return (
    <div id="social-window" data-testid="social-window" onContextMenu={(e) => e.preventDefault()}>
      <div className="log-card party-card soc-card">
        <div className="title">Social</div>
        <button className="wow-close" onClick={() => api.toggleSocialWindow(false)} aria-label="Close">
          &times;
        </button>
        <div className="soc-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} data-tab={t.id} className={`soc-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label} <i>{t.n}</i>
            </button>
          ))}
        </div>

        {social?.guildInvite && (
          <div className="soc-invite" data-testid="guild-invite">
            <span>
              <b>{social.guildInvite.from}</b> invites you to <b>{social.guildInvite.guild}</b>.
            </span>
            <button className="quest-btn small" onClick={() => api.guild('accept')}>
              Accept
            </button>
            <button className="quest-btn secondary small" onClick={() => api.guild('decline')}>
              Decline
            </button>
          </div>
        )}

        <div className="soc-body" data-testid="social-body">
          {tab === 'guild' && <GuildTab />}
          {tab === 'friends' && (
            <>
              {friends.length === 0 ? <p className="log-empty">No friends yet. Open the Online tab and press Friend next to a player, or type /friend add name.</p> : null}
              {friends.map((f) => (
                <div key={f.name} className={`soc-row${f.online ? '' : ' off'}`} data-friend={f.name}>
                  <span className={`soc-dot${f.online ? ' on' : ''}`} title={f.online ? 'Online' : 'Offline'} />
                  <span className="soc-name clickable" title="Click for the menu of this player" onClick={(e) => api.openPlayerMenu(f.name, e.clientX, e.clientY)}>
                    {f.name}
                  </span>
                  {f.online ? <ClassTag cls={f.cls} level={f.level} /> : <span className="soc-class dim">Offline</span>}
                  <span className="soc-actions">
                    {f.online && (
                      <>
                        <button className="quest-btn secondary small" onClick={() => api.whisper(f.name)}>
                          Whisper
                        </button>
                        <button className="quest-btn secondary small" onClick={() => api.inspect(f.name)}>
                          Inspect
                        </button>
                        {adventure && (
                          <button className="quest-btn secondary small" onClick={() => api.partyAction('invite', f.name)}>
                            Invite
                          </button>
                        )}
                      </>
                    )}
                    <button className="quest-btn danger small" onClick={() => api.socialAct('unfriend', f.name)}>
                      Remove
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}

          {tab === 'online' &&
            online.map((o) => (
              <div key={o.name} className={`soc-row${o.ignored ? ' off' : ''}`} data-player={o.name}>
                <span className="soc-dot on" />
                <span className="soc-name clickable" title="Click for the menu of this player" onClick={(e) => api.openPlayerMenu(o.name, e.clientX, e.clientY)}>
                  {o.name}
                  {o.you ? ' (you)' : ''}
                </span>
                <ClassTag cls={o.cls} level={o.level} />
                <span className="soc-actions">
                  <button className="quest-btn secondary small" onClick={() => api.inspect(o.name)}>
                    Inspect
                  </button>
                  {!o.you && (
                    <>
                      <button className="quest-btn secondary small" disabled={o.ignored} onClick={() => api.whisper(o.name)}>
                        Whisper
                      </button>
                      <button className="quest-btn secondary small" data-act="trade" onClick={() => api.tradeAct({ a: 'ask', name: o.name })}>
                        Trade
                      </button>
                      {adventure && (
                        <button className="quest-btn secondary small" onClick={() => api.partyAction('invite', o.name)}>
                          Invite
                        </button>
                      )}
                      <button className="quest-btn secondary small" data-act={o.friend ? 'unfriend' : 'friend'} onClick={() => api.socialAct(o.friend ? 'unfriend' : 'friend', o.name)}>
                        {o.friend ? 'Unfriend' : 'Friend'}
                      </button>
                      <button className="quest-btn danger small" data-act={o.ignored ? 'unignore' : 'ignore'} onClick={() => api.socialAct(o.ignored ? 'unignore' : 'ignore', o.name)}>
                        {o.ignored ? 'Unignore' : 'Ignore'}
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
          {tab === 'online' && online.length === 0 ? <p className="log-empty">Looking for players...</p> : null}

          {tab === 'ignored' && (
            <>
              {ignored.length === 0 ? <p className="log-empty">You ignore nobody. What an ignored player says, and whispers to you, is never shown.</p> : null}
              {ignored.map((n) => (
                <div key={n} className="soc-row" data-ignored={n}>
                  <span className="soc-name">{n}</span>
                  <span className="soc-actions">
                    <button className="quest-btn secondary small" onClick={() => api.socialAct('unignore', n)}>
                      Hear again
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {(tab === 'friends' || tab === 'online') && (
          <form
            className="soc-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!clean) return;
              api.socialAct('friend', clean);
              setName('');
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a friend by name (they must be online)" maxLength={24} spellCheck={false} autoComplete="off" onKeyDown={(e) => e.stopPropagation()} />
            <button type="submit" className="quest-btn" disabled={!clean}>
              Add
            </button>
          </form>
        )}
        <div className="dialog-foot soc-foot">
          <span className="soc-hint">
            {onlineFriends}/{friends.length} friends online &middot; <kbd>O</kbd> to close
          </span>
          <button className="quest-btn secondary" onClick={() => api.toggleSocialWindow(false)}>
            Close
          </button>
        </div>
        <InspectWindow />
      </div>
    </div>
  );
}

/** A look at a player opened from a player's menu, when the social window is not up to hold it. */
function FloatingInspect() {
  const open = useUi((s) => s.inspect !== null && !s.socialOpen);
  if (!open) return null;
  return (
    <div id="inspect-float" data-testid="inspect-float" onContextMenu={(e) => e.preventDefault()}>
      <InspectWindow />
    </div>
  );
}

/** Everything of the social layer that is a window; only online. */
export function SocialUI() {
  return (
    <>
      <SocialWindow />
      <FloatingInspect />
    </>
  );
}
