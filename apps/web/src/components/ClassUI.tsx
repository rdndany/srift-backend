'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { ABILITY_BY_ID, abilityCost, ATTR_INFO, ATTR_KEYS, CLASSES, CraftingMenu, POINTS_PER_LEVEL, abilitiesOf, accessoryModifiers, computeStats, gearModifiers, glyphModifiers, MAX_DEFENSE, offhandModifier, pointModifier, xpToNext, type ItemStack } from '@solrift/shared';
import { useUi } from '../ui/store';
import { AbilityIcon } from './AbilityIcon';
import { StatBars, statLines } from './ClassPicker';
import './classHud.css';

/** The keys of the four buttons, in order (shown on them). */
const KEYS = ['Z', 'X', 'C', 'G'];

/**
 * The class resource (mana, stamina or focus) as a labelled bar, right under the experience bar. What it shows is
 * the server's state.
 */
export function ResourceBar() {
  const cls = useUi((s) => s.cls);
  const screen = useUi((s) => s.screen);
  const spectating = useUi((s) => s.spectating);
  if (!cls || spectating || (screen !== 'none' && screen !== 'dead')) return null;
  const def = CLASSES[cls.id];
  return (
    <div className="cb-res" data-testid="class-resource" data-class={cls.id} title={def.resource.name} style={{ '--res': def.resource.color } as CSSProperties}>
      <i style={{ width: `${cls.maxResource > 0 ? Math.min(100, (cls.resource / cls.maxResource) * 100) : 0}%` }} />
      <span>
        {def.resource.name} {Math.floor(cls.resource)} / {Math.round(cls.maxResource)}
      </span>
    </div>
  );
}

/**
 * The four ability buttons with their cooldowns, to the right of the hotbar (as the off hand is to the left of it). An
 * ability that has not been learned yet (from its skill book) is greyed with a lock: its level is in its tooltip and the spellbook.
 * Pressing a button only asks; the server decides.
 */
export function AbilityBar() {
  const cls = useUi((s) => s.cls);
  const spectating = useUi((s) => s.spectating);
  const api = useUi((s) => s.api);
  const mounted = useUi((s) => s.mount.mount > 0);
  if (!cls || !api || spectating || mounted) return null;
  const def = CLASSES[cls.id];
  return (
    <div id="class-bar" data-testid="class-bar" data-class={cls.id} style={{ '--cls': def.color } as CSSProperties}>
      <div className="cb-slots">
        {cls.abilities.map((a, slot) => {
          const ab = ABILITY_BY_ID.get(a.id);
          if (!ab) return null;
          const cooling = a.unlocked && a.cd > 0;
          const poor = a.unlocked && !cooling && cls.resource < abilityCost(ab.cost);
          return (
            <button
              key={a.id}
              type="button"
              className={`cb-slot${cooling ? ' cooling' : ''}${poor ? ' poor' : ''}${a.unlocked ? '' : ' locked'}`}
              data-ability={a.id}
              data-slot={slot}
              title={`${ab.name}: ${ab.description} (${abilityCost(ab.cost)} ${def.resource.name.toLowerCase()}, ${ab.cooldown}s)${a.unlocked ? '' : ` \u2014 not learned: find or buy its skill book (level ${ab.unlockLevel})`}`}
              onPointerDown={(e) => {
                e.preventDefault();
                api.ability(slot);
              }}
            >
              <AbilityIcon id={ab.id} size={44} />
              <kbd>{KEYS[slot]}</kbd>
              {cooling && <span className="cb-cd" style={{ height: `${Math.min(100, (a.cd / ab.cooldown) * 100)}%` }} />}
              {cooling && <span className="cb-cd-num">{a.cd >= 10 ? Math.ceil(a.cd) : a.cd.toFixed(1)}</span>}
              {!a.unlocked && <span className="cb-lock" aria-label="Not learned yet" />}
            </button>
          );
        })}
      </div>
      {(cls.guard > 0 || cls.shield > 0 || cls.immune > 0) && (
        <div className="cb-buffs">
          {cls.guard > 0 && <span className="buff guard">Guarded {Math.ceil(cls.guard)}s</span>}
          {cls.shield > 0 && <span className="buff shield">Shield {Math.ceil(cls.shield)}</span>}
          {cls.immune > 0 && <span className="buff immune">Evading</span>}
        </div>
      )}
    </div>
  );
}
/**
 * What the class adds up to now (null without a class): its stats with everything worn counted: the item in hand, the off hand, the armor
 * (a piece that needs a higher level or another class adds nothing), the rings and the necklace, the off-hand bonus and the spent stat points.
 */
function useWornStats() {
  const cls = useUi((s) => s.cls);
  const api = useUi((s) => s.api);
  const armor = useUi((s) => s.armor);
  const selected = useUi((s) => s.selected);
  const warm = useUi((s) => s.warmMenu);
  useUi((s) => s.version); // the gear may change under the window (an item moved in or out of a slot)
  if (!cls) return null;
  // What is in the off hand adds to the numbers (an orb to the spells, a dagger to the critical hits).
  const bonus = offhandModifier(api?.offhand.get(0)?.id ?? 0);
  const menu = warm ?? api?.menu();
  const worn: (ItemStack | null)[] = [api?.inventory.get(selected) ?? null, api?.offhand.get(0) ?? null];
  if (menu instanceof CraftingMenu && menu.armor) for (let i = 0; i < menu.armor.size; i++) worn.push(menu.armor.get(i));
  const who = { id: cls.id, level: cls.level };
  // The rings and the necklace: fixed stats of their own.
  const jewelry: (ItemStack | null)[] = [];
  if (api) for (let i = 0; i < api.accessories.size; i++) jewelry.push(api.accessories.get(i));
  const gear = [...gearModifiers(worn, who), ...accessoryModifiers(jewelry, who), ...glyphModifiers(worn, who), ...glyphModifiers(jewelry, who)];
  const spent = pointModifier(cls.pts);
  const stats = computeStats(cls.id, cls.level, [...(bonus ? [bonus] : []), ...gear, ...(spent ? [spent] : [])]);
  return { cls, def: CLASSES[cls.id], stats, armor };
}

/** The numbers of the class, as lines (the Attributes tab). */
export function ClassAttributes() {
  const w = useWornStats();
  if (!w) return null;
  return (
    <div className="cs-attrs" data-testid="class-attributes">
      <StatBars lines={statLines(w.stats, w.def.resource.name, w.armor)} />
    </div>
  );
}

/** The four numbers that matter most, as a strip under the character on the Inventory tab (the rest is on the Attributes tab). */
export function QuickStats() {
  const w = useWornStats();
  if (!w) return null;
  const chips: { label: string; value: string; color?: string }[] = [
    { label: 'Health', value: `${Math.round(w.stats.maxHealth)}`, color: '#e5645c' },
    { label: 'Armor', value: `${w.armor} / ${MAX_DEFENSE}`, color: '#c9d3e0' },
    { label: w.def.resource.name, value: `${Math.round(w.stats.maxResource)}`, color: w.def.resource.color },
    { label: 'Crit', value: `${Math.round(w.stats.critChance * 100)}%`, color: '#ffe49a' },
  ];
  return (
    <div className="quick-stats" data-testid="quick-stats">
      {chips.map((c) => (
        <div key={c.label} className="quick-stat" style={{ '--qs': c.color } as CSSProperties}>
          <b>{c.value}</b>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The + of a stat: a click adds a point (Shift: five); keep the button pressed and it keeps adding, faster the longer it is held,
 * until the points run out. Keyboard presses (Enter or Space) add one each.
 */
function AttrAddButton({ attr, name }: { attr: (typeof ATTR_KEYS)[number]; name: string }) {
  const free = useUi((st) => st.cls?.free ?? 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  // Each step reads the points left from the store, so it stops by itself when they run out (the server has the last word on every spend).
  const press = (shift: boolean): void => {
    stop();
    let n = 0;
    const step = (): void => {
      const st = useUi.getState();
      if ((st.cls?.free ?? 0) <= 0) return stop();
      st.api?.spendStat(attr, shift ? POINTS_PER_LEVEL : 1);
      n++;
      timer.current = setTimeout(step, n === 1 ? 380 : Math.max(45, 130 - n * 8));
    };
    step();
  };
  return (
    <button
      type="button"
      className="attr-add"
      data-testid={`attr-add-${attr}`}
      disabled={free <= 0}
      aria-label={`Add a point to ${name}`}
      title={`Add a point (hold to keep adding, Shift: ${POINTS_PER_LEVEL} at a time)`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        press(e.shiftKey);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onClick={(e) => {
        if (e.detail === 0) useUi.getState().api?.spendStat(attr, e.shiftKey ? POINTS_PER_LEVEL : 1); // the keyboard
      }}
    >
      +
    </button>
  );
}

/**
 * The stat points (Strength, Agility, Vitality, Energy), under the character in the inventory window: every level gives five,
 * and a click puts one on a stat (shift-click five). The server counts them; this only asks.
 */
export function AttrPoints() {
  const cls = useUi((s) => s.cls);
  const api = useUi((s) => s.api);
  if (!cls) return null;
  const anySpent = cls.pts.some((n) => n > 0);
  const resource = CLASSES[cls.id].resource.name.toLowerCase();
  const say = (s: string): string => s.replace(/\{resource\}/g, resource);
  return (
    <aside className="attr-points" data-testid="attr-points" aria-label="Stat points">
      <div className="wow-head">
        <span>Stat points</span>
      </div>
      <div className="attr-bank">
        <span>To spend<small>{POINTS_PER_LEVEL} points per level</small></span>
        <b data-testid="attr-free" data-has={cls.free > 0 ? '1' : undefined}>
          {cls.free}
        </b>
      </div>
      {ATTR_KEYS.map((k, i) => (
        <div key={k} className="attr-card" data-attr={k} style={{ '--attr': ATTR_INFO[k].color } as CSSProperties}>
          <div className="attr-top">
            <span className="attr-name">{ATTR_INFO[k].name}</span>
            <b className="attr-val" data-testid={`attr-val-${k}`}>
              {cls.pts[i]}
            </b>
            <AttrAddButton attr={k} name={ATTR_INFO[k].name} />
          </div>
          <p className="attr-blurb">{say(ATTR_INFO[k].blurb)}</p>
        </div>
      ))}
      <button type="button" className="attr-reset" data-testid="attr-reset" disabled={!anySpent} title="Take every point back, to spend them again" onClick={() => api?.resetStats()}>
        Reset points
      </button>
    </aside>
  );
}

/** The spellbook, a tab of the inventory window (K opens it): your class, its level, the numbers it adds up to now, and all of its abilities. */
export function Spellbook() {
  const cls = useUi((s) => s.cls);
  const level = useUi((s) => s.level);
  const progress = useUi((s) => s.xpProgress);
  if (!cls) return null;
  const need = xpToNext(level);
  const def = CLASSES[cls.id];
  return (
    <div id="class-sheet" data-testid="class-sheet" style={{ '--cls': def.color } as CSSProperties}>
      <div className="cs-head">
        <h2>{def.name}</h2>
        <span className="cs-sub">
          {def.role} &middot; character level {level}
        </span>
      </div>
      <div className="cs-xp">
        <div className="cb-xp big">
          <i style={{ width: `${(progress * 100).toFixed(1)}%` }} />
          <span>{`${Math.round(progress * need)} / ${need} experience to level ${level + 1}`}</span>
        </div>
      </div>
      <div className="wow-head">
        <span>Abilities</span>
      </div>
      <div className="cs-list">
        {abilitiesOf(cls.id).map((a, slot) => {
          const learned = !!cls.abilities[slot]?.unlocked;
          return (
            <div key={a.id} className={`cs-ability${learned ? '' : ' locked'}`} data-ability={a.id}>
              <div className="cs-icon">
                <AbilityIcon id={a.id} size={44} />
                {!learned && <span className="cb-lock" aria-label="Not learned yet" />}
              </div>
              <div className="cs-body">
                <div className="cs-name">
                  <b>{a.name}</b>
                  <kbd>{KEYS[slot]}</kbd>
                  <span className={`cs-state${learned ? ' ok' : ''}`}>{learned ? 'Learned' : `Not learned: needs its skill book (level ${a.unlockLevel})`}</span>
                </div>
                <small>{a.description}</small>
                <div className="cs-meta">
                  <span style={{ color: def.resource.color }}>
                    {abilityCost(a.cost)} {def.resource.name.toLowerCase()}
                  </span>
                  <span>{a.cooldown}s cooldown</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="cs-foot">You start with no abilities. Each one is learned from its skill book: right-click the book to learn it. Skill books drop from monsters, are quest rewards and are sold by the merchants.</p>
    </div>
  );
}
