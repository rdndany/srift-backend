'use client';

import type { CSSProperties } from 'react';
import { ABILITY_SLOTS, CLASSES, CLASS_IDS, CLASS_LEVELS, abilitiesOf, computeStats, getItem, type ClassId, type ClassStats } from '@solrift/shared';
import { AbilityIcon } from './AbilityIcon';
import { ItemSprite } from './ItemSprite';
import './classPicker.css';

const itemName = (id: number): string => getItem(id).name.replace(/_/g, ' ');
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const times = (v: number): string => `\u00d7${v.toFixed(2).replace(/0$/, '')}`;
const clamp01 = (v: number): number => Math.max(0.04, Math.min(1, v));

export interface StatLine {
  key: string;
  label: string;
  value: string;
  /** How full the bar is (0..1). */
  fill: number;
}

/** The numbers a class starts with, as lines for the selection screen and the class sheet (the same rows in both). */
export function statLines(stats: ClassStats, resourceName: string, armor?: number): StatLine[] {
  const lines: StatLine[] = [
    { key: 'health', label: 'Health', value: `${Math.round(stats.maxHealth)} (${Math.round(stats.maxHealth) / 2} hearts)`, fill: stats.maxHealth / 32 },
    { key: 'melee', label: 'Melee damage', value: times(stats.damage.melee), fill: stats.damage.melee / 1.6 },
    { key: 'ranged', label: 'Ranged damage', value: times(stats.damage.ranged), fill: stats.damage.ranged / 1.6 },
    { key: 'spell', label: 'Spell damage', value: times(stats.damage.spell), fill: stats.damage.spell / 1.6 },
    {
      key: 'defense',
      label: 'Defense',
      value: stats.damageTaken <= 1 ? `${pct(1 - stats.damageTaken)} less damage taken` : `${pct(stats.damageTaken - 1)} more damage taken`,
      fill: 1 - (stats.damageTaken - 0.7) / 0.6,
    },
    { key: 'speed', label: 'Move speed', value: times(stats.moveSpeed), fill: (stats.moveSpeed - 0.8) / 0.5 },
    { key: 'crit', label: 'Crit hit chance', value: `${Math.round(stats.critChance * 1000) / 10}%`, fill: stats.critChance / 0.25 },
    { key: 'critdmg', label: 'Crit damage', value: times(stats.critDamage), fill: (stats.critDamage - 1) / 1.5 },
    { key: 'attack', label: 'Attack speed', value: times(stats.attackSpeed), fill: (stats.attackSpeed - 0.7) / 0.7 },
    { key: 'resource', label: resourceName, value: `${Math.round(stats.maxResource)} (+${stats.resourceRegen}/s)`, fill: stats.maxResource / 140 },
  ];
  // The armor you wear (0..20 points), right after the class's own defense.
  if (armor !== undefined) lines.splice(5, 0, { key: 'armor', label: 'Armor', value: `${armor} / 20`, fill: armor / 20 });
  return lines;
}

export function StatBars({ lines }: { lines: StatLine[] }) {
  return (
    <div className="cls-stats">
      {lines.map((l) => (
        <div key={l.key} className="cls-stat" data-stat={l.key}>
          <span className="cls-stat-label">{l.label}</span>
          <span className="cls-stat-value">{l.value}</span>
          <span className="cls-stat-bar">
            <i style={{ width: `${clamp01(l.fill) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** The three classes as cards to pick from. */
export function ClassCards({ value, onPick, disabled }: { value: ClassId | null; onPick: (id: ClassId) => void; disabled?: boolean }) {
  return (
    <div className="cls-cards" id="class-cards" role="radiogroup" aria-label="Class">
      {CLASS_IDS.map((id) => {
        const def = CLASSES[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            className={`cls-card${value === id ? ' on' : ''}`}
            data-class={id}
            disabled={disabled}
            style={{ '--cls': def.color } as CSSProperties}
            onClick={() => onPick(id)}
          >
            <span className="cls-art" aria-hidden>
              <ItemSprite id={def.startingWeapon} size={72} />
            </span>
            <span className="cls-name">{def.name}</span>
            <span className="cls-tag">{def.tagline}</span>
            <span className="cls-role">{def.role}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Everything about one class: what it is, how it plays, what it starts with and what it can do. */
export function ClassDetails({ id }: { id: ClassId }) {
  const def = CLASSES[id];
  const stats = computeStats(id, 1);
  const abilities = abilitiesOf(id);
  const kit = def.startingKit.filter((k) => k.id !== def.startingWeapon);
  return (
    <section className="cls-details" id="class-details" data-class={id} style={{ '--cls': def.color } as CSSProperties}>
      <header>
        <h3>{def.name}</h3>
        <span className="cls-role">{def.role}</span>
      </header>
      <p className="cls-desc">{def.description}</p>

      <div className="cls-cols">
        <div>
          <h4>Strengths</h4>
          <ul className="cls-good">
            {def.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <h4>Weaknesses</h4>
          <ul className="cls-bad">
            {def.weaknesses.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <h4>Starting weapon</h4>
          <div className="cls-weapon" id="class-weapon">
            <ItemSprite id={def.startingWeapon} size={40} />
            <span>
              <b>{itemName(def.startingWeapon)}</b>
              {kit.length > 0 && <small>also: {kit.map((k) => `${k.count > 1 ? `${k.count} ` : ''}${itemName(k.id)}`).join(', ')}</small>}
            </span>
          </div>
        </div>
        <div>
          <h4>Starting attributes</h4>
          <StatBars lines={statLines(stats, def.resource.name)} />
        </div>
      </div>

      <h4>Abilities</h4>
      <div className="cls-abilities" id="class-abilities">
        {abilities.slice(0, ABILITY_SLOTS).map((a) => (
          <div key={a.id} className="cls-ability" data-ability={a.id}>
            <AbilityIcon id={a.id} size={40} />
            <span>
              <b>{a.name}</b>
              <small>{a.description}</small>
              <em>
                {a.cost} {def.resource.name.toLowerCase()} &middot; {a.cooldown}s cooldown &middot; {a.unlockLevel <= 1 ? 'learned from its skill book' : `learned from its skill book at level ${a.unlockLevel}`}
              </em>
            </span>
          </div>
        ))}
      </div>
      <p className="cls-note">
        Your class levels up from 1 to {CLASS_LEVELS.max} by defeating monsters and finishing quests; every level makes you a little stronger. You start with no abilities: each one is learned by right-clicking its
        skill book, which drops from monsters, is a quest reward or is sold by the merchants. Mining, building, crafting and every item stay open to every class.
      </p>
    </section>
  );
}
