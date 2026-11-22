'use client';

import { getItem, tooltipLines, type ItemStack } from '@solrift/shared';
import { useEffect, type ReactNode } from 'react';
import { ItemPicture } from './CharacterSheet';
import { Tip } from './ItemView';

/** The name of an item as it reads on the page. */
export const itemName = (s: ItemStack): string => s.name || getItem(s.id).name.replace(/_/g, ' ');

/** One item slot of the Camp: a button (a finger needs one), with the game's own picture, the rarity ring and the count. */
export function CampSlot({ stack, label, onClick, selected, disabled }: { stack: ItemStack | null; label?: string; onClick?: () => void; selected?: boolean; disabled?: boolean }) {
  const item = stack ? getItem(stack.id) : null;
  const left = stack && item && item.durability > 0 ? 1 - stack.damage / item.durability : 1;
  const body = stack ? (
    <>
      <ItemPicture id={stack.id} />
      {stack.gear && stack.gear.r > 0 && <i className={`rarity-ring r${stack.gear.r}`} />}
      {!!stack.gear?.u && <b className="camp-plus">+{stack.gear.u}</b>}
      {stack.count > 1 && <b className="camp-count">{stack.count}</b>}
      {item && item.durability > 0 && left < 1 && <i className="camp-wear" style={{ width: `${Math.max(4, left * 100)}%` }} />}
    </>
  ) : (
    label && <small>{label}</small>
  );
  const name = stack ? `${itemName(stack)}${stack.count > 1 ? ` x${stack.count}` : ''}` : label ? `${label}: empty` : 'Empty slot';
  const cls = `camp-slot${stack ? ' full' : ''}${selected ? ' on' : ''}`;
  // Only a slot that can be tapped is a button (a button may not hold another: an offer in a list is one itself).
  if (!onClick) {
    return (
      <span className={cls} role="img" aria-label={name} data-item={stack?.id ?? ''}>
        {body}
      </span>
    );
  }
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick} aria-label={name} data-item={stack?.id ?? ''}>
      {body}
    </button>
  );
}

/** A panel that slides up from the bottom of the screen (what a phone does instead of a tooltip and a right click). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="camp-sheet-wrap" role="presentation" onClick={onClose}>
      <div className="camp-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="camp-sheet-x" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}

/** What an item is, as the game's tooltip says it, for a sheet. */
export function ItemCard({ stack }: { stack: ItemStack }) {
  return (
    <div className="camp-card-item">
      <CampSlot stack={stack} />
      <div className="camp-tip">
        <Tip lines={tooltipLines(stack, null, 0)} />
      </div>
    </div>
  );
}

/** A number the thumb can change: minus, the number, plus (and "all"). */
export function Stepper({ value, min, max, onChange, label, all = false }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; all?: boolean }) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.floor(Number.isFinite(n) ? n : min))));
  return (
    <div className="camp-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => set(value - 1)}>
        &minus;
      </button>
      <input inputMode="numeric" aria-label={label} value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')))} />
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>
        +
      </button>
      {all && max > min && (
        <button type="button" className="all" onClick={() => set(max)}>
          All
        </button>
      )}
    </div>
  );
}

/** Time as "1h 05m", "12m" or "40s". */
export function span(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
