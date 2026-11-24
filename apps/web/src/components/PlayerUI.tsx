'use client';

import type { CSSProperties } from 'react';
import { CLASSES, MOBS, MOB_ROLE_LABEL, MOB_TIER_INFO, NPCS, RANK_OFFICER, mobRole, shownTier } from '@solrift/shared';
import { useUi } from '../ui/store';
import './player.css';

/** What the loading screen draws of the two target frames (see `warmHud` in the store): the first of each to appear would stand the game still while the browser builds how it is painted. */
const WARM_PLAYER = { name: 'Aurelia', cls: 'mage' as const, level: 40, guild: 'Dawnwatch' };
const WARM_MOB = { id: 0, kind: 'zombie' as const, variant: 0, level: 12, hp: 12, max: 20, elite: true };

/** The player the crosshair rests on, next to your own frame: name, class, level and guild. U (or a click) opens their menu. */
function TargetFrame() {
  const warm = useUi((s) => s.warmHud);
  const target = useUi((s) => s.target) ?? (warm ? WARM_PLAYER : null);
  const api = useUi((s) => s.api);
  const trading = useUi((s) => !!s.trade);
  if (!target || (!api && !warm) || trading) return null;
  const def = target.cls ? CLASSES[target.cls] : null;
  return (
    <div
      id="target-frame"
      data-testid="target-frame"
      style={{ '--cls': def?.color ?? '#d6aa46' } as CSSProperties}
      title="Press U for the menu of this player"
      onClick={(e) => api?.openPlayerMenu(target.name, e.clientX, e.clientY + 24)}
    >
      <div className="tf-level">{target.level ?? '?'}</div>
      <div className="tf-plate">
        <div className="tf-name">
          <b>{target.name}</b>
          {def ? <small>{def.name}</small> : null}
        </div>
        <div className="tf-sub">
          {target.guild ? <span className="tf-guild">&lt;{target.guild}&gt;</span> : <span>&nbsp;</span>}
          <span className="tf-hint">
            <kbd>U</kbd> menu
          </span>
        </div>
      </div>
    </div>
  );
}

/** A creature's name as the frame writes it: a person has their own name, everything else its kind's. */
function mobName(kind: string, variant: number): { name: string; title?: string } {
  if (kind === 'npc') {
    const npc = NPCS[variant];
    return { name: npc?.name ?? 'Villager', title: npc?.title };
  }
  const raw = (MOBS as Record<string, { name: string } | undefined>)[kind]?.name ?? kind;
  const text = raw.replace(/_/g, ' ');
  return { name: text.charAt(0).toUpperCase() + text.slice(1) };
}

/**
 * The creature the crosshair rests on (an animal, a monster, a person): the colour of its tier, its level, its name, how it treats you
 * (hostile, neutral, passive...) and a health bar with the numbers. The same place as a player's frame, which wins when both are in view.
 */
function MobTargetFrame() {
  const warm = useUi((s) => s.warmHud);
  const mob = useUi((s) => s.mobTarget) ?? (warm ? WARM_MOB : null);
  const player = useUi((s) => !!s.target);
  const trading = useUi((s) => !!s.trade);
  const bossShown = useUi((s) => !!s.boss);
  if (!mob || player || trading) return null;
  const def = MOBS[mob.kind];
  if (!def || (def.boss && bossShown)) return null;
  const tier = MOB_TIER_INFO[shownTier(mob.kind, mob.elite)];
  const role = mobRole(def);
  const { name, title } = mobName(mob.kind, mob.variant);
  const hurtable = !def.invulnerable;
  const frac = mob.max > 0 ? Math.max(0, Math.min(1, mob.hp / mob.max)) : 0;
  const bar = frac > 0.5 ? '#5fcf4a' : frac > 0.25 ? '#e0b030' : '#d8402c';
  return (
    <div id="target-frame" className="mob" data-testid="mob-target-frame" data-tier={shownTier(mob.kind, mob.elite)} style={{ '--cls': tier.color } as CSSProperties}>
      <div className="tf-level">{def.boss ? '☠' : mob.level}</div>
      <div className="tf-plate">
        <div className="tf-name">
          <b style={{ color: tier.color }}>{name}</b>
          <small>{tier.name}</small>
        </div>
        {hurtable ? (
          <div className="tf-hp" data-testid="mob-hp">
            <i style={{ width: `${frac * 100}%`, background: bar }} />
            <span>
              {Math.ceil(mob.hp).toLocaleString('en-US')} / {Math.round(mob.max).toLocaleString('en-US')}
            </span>
          </div>
        ) : null}
        <div className="tf-sub">
          <span className={`tf-role ${role}`}>{title ?? MOB_ROLE_LABEL[role]}{mob.elite ? ' · Elite' : ''}</span>
        </div>
      </div>
    </div>
  );
}

interface Entry {
  label: string;
  act: () => void;
  /** What the entry does not do now, and why (shown as its tooltip). */
  off?: string;
  danger?: boolean;
  /** The entry opens something over the game: the mouse stays free when the menu closes. */
  keepMouse?: boolean;
}

/**
 * The menu of a player, as in World of Warcraft's: whisper, inspect, trade, invite to the party or the guild, add as a friend,
 * ignore. Opened from the target frame (U), or by clicking a name in the social or party window.
 */
function PlayerMenu() {
  const menu = useUi((s) => s.playerMenu);
  const social = useUi((s) => s.social);
  const adventure = useUi((s) => s.adventure);
  const party = useUi((s) => s.party);
  const trading = useUi((s) => !!s.trade);
  const api = useUi((s) => s.api);
  if (!menu || !api) return null;

  const row = social?.online.find((o) => o.name.toLowerCase() === menu.name.toLowerCase()) ?? null;
  const known = social !== null; // before the lists arrive, nothing is known of friends and the ignored
  const me = row?.you ?? false;
  const gone = known && !row ? 'Not online' : undefined;
  const guild = social?.guild ?? null;
  const theirGuild = guild?.members.some((m) => m.name.toLowerCase() === menu.name.toLowerCase()) ?? false;
  const mine = party.find((m) => m.you);
  const def = row?.cls ? CLASSES[row.cls] : null;

  const done = (f: () => void, keepMouse = false) => () => {
    api.closePlayerMenu(!keepMouse);
    f();
  };
  const entries: Entry[] = [];
  if (!me) {
    entries.push({ label: 'Whisper', act: () => api.whisper(menu.name), off: row?.ignored ? 'You ignore them' : gone, keepMouse: true });
  }
  entries.push({ label: 'Inspect', act: () => api.inspect(menu.name), off: gone, keepMouse: true });
  if (!me) {
    entries.push({ label: 'Trade', act: () => api.tradeAct({ a: 'ask', name: menu.name }), off: trading ? 'You are already trading' : gone });
    if (adventure) {
      entries.push({ label: 'Invite to party', act: () => api.partyAction('invite', menu.name), off: gone ?? (mine && !mine.lead ? 'Only the party leader invites' : undefined) });
    }
    if (guild && guild.rank <= RANK_OFFICER) {
      entries.push({ label: 'Invite to guild', act: () => api.guild(`invite ${menu.name}`), off: gone ?? (theirGuild ? 'Already in your guild' : undefined) });
    }
    entries.push(
      row?.friend
        ? { label: 'Remove friend', act: () => api.socialAct('unfriend', menu.name) }
        : { label: 'Add friend', act: () => api.socialAct('friend', menu.name), off: gone },
      row?.ignored ? { label: 'Stop ignoring', act: () => api.socialAct('unignore', menu.name) } : { label: 'Ignore', act: () => api.socialAct('ignore', menu.name), off: gone, danger: true },
    );
  }

  const height = 70 + entries.length * 30;
  const left = Math.max(6, Math.min(menu.x, window.innerWidth - 216));
  const top = Math.max(6, Math.min(menu.y, window.innerHeight - height - 6));
  return (
    <div id="player-menu-layer" onMouseDown={() => api.closePlayerMenu(true)} onContextMenu={(e) => e.preventDefault()}>
      <div id="player-menu" data-testid="player-menu" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="pm-head" style={{ '--cls': def?.color ?? '#d6aa46' } as CSSProperties}>
          <b>{menu.name}</b>
          {def ? (
            <small>
              {def.name} {row?.level ?? ''}
            </small>
          ) : null}
        </div>
        {entries.map((e) => (
          <button key={e.label} className={`pm-item${e.danger ? ' danger' : ''}`} data-act={e.label} disabled={!!e.off} title={e.off} onClick={done(e.act, e.keepMouse)}>
            {e.label}
          </button>
        ))}
        <button className="pm-item cancel" onClick={() => api.closePlayerMenu(true)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The target frames (a player's, online only; a creature's, in every game) and the menu of a player. */
export function PlayerUI() {
  return (
    <>
      <TargetFrame />
      <MobTargetFrame />
      <PlayerMenu />
    </>
  );
}
