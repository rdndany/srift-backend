'use client';

import type { CSSProperties } from 'react';
import { ABILITY_BY_ID, CLASSES, CraftingMenu, abilitiesOf, computeStats, gearModifiers, offhandModifier, xpToNext, type ItemStack } from '@solrift/shared';
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
          const poor = a.unlocked && !cooling && cls.resource < ab.cost;
          return (
            <button
              key={a.id}
              type="button"
              className={`cb-slot${cooling ? ' cooling' : ''}${poor ? ' poor' : ''}${a.unlocked ? '' : ' locked'}`}
              data-ability={a.id}
              data-slot={slot}
              title={`${ab.name}: ${ab.description} (${ab.cost} ${def.resource.name.toLowerCase()}, ${ab.cooldown}s)${a.unlocked ? '' : ` \u2014 not learned: find or buy its skill book (level ${ab.unlockLevel})`}`}
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
/** What the class adds up to now (health, damage, defense, speed...): in the inventory window, beside the character. */
export function ClassAttributes() {
  const cls = useUi((s) => s.cls);
  const api = useUi((s) => s.api);
  const armor = useUi((s) => s.armor);
  const selected = useUi((s) => s.selected);
  useUi((s) => s.version); // the gear may change under the window (an item moved in or out of a slot)
  if (!cls) return null;
  const def = CLASSES[cls.id];
  // What is in the off hand adds to the numbers (an orb to the spells, a dagger to the critical hits).
  const bonus = offhandModifier(api?.offhand.get(0)?.id ?? 0);
  // The gear counts as it does for the character itself: the item in hand, the off hand and the armor worn, each with its bonus stats
  // (a piece that needs a higher level or another class adds nothing).
  const warm = useUi((s) => s.warmMenu);
  const menu = warm ?? api?.menu();
  const worn: (ItemStack | null)[] = [api?.inventory.get(selected) ?? null, api?.offhand.get(0) ?? null];
  if (menu instanceof CraftingMenu && menu.armor) for (let i = 0; i < menu.armor.size; i++) worn.push(menu.armor.get(i));
  const gear = gearModifiers(worn, { id: cls.id, level: cls.level });
  return (
    <div className="cs-attrs" data-testid="class-attributes">
      <StatBars lines={statLines(computeStats(cls.id, cls.level, [...(bonus ? [bonus] : []), ...gear]), def.resource.name, armor)} />
    </div>
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
                    {a.cost} {def.resource.name.toLowerCase()}
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
