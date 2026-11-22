'use client';

import { ELEMENTS, I, dominantElement, getItem, type ItemStack, type TipLine } from '@solrift/shared';
import type { CSSProperties } from 'react';
import { useUi } from '../ui/store';

export const isEnchanted = (stack: ItemStack | null): boolean => !!stack && (!!stack.ench || getItem(stack.id).storesEnchants);

/** Icon + stack count + durability bar for one item stack. Enchanted items shimmer. */
export function ItemView({ stack }: { stack: ItemStack | null }) {
  const api = useUi((s) => s.api);
  // A compass shows its needle wherever it lies: only these (and nothing else) redraw as it swings.
  const needle = useUi((s) => (stack?.id === I.COMPASS ? s.compassFrame : -1));
  if (!stack || !api) return null;
  const item = getItem(stack.id);
  const left = item.durability > 0 ? 1 - stack.damage / item.durability : 1;
  const el = isEnchanted(stack) ? (dominantElement(stack) ?? 'arcane') : null;
  const glow = el ? ({ '--gl': ELEMENTS[el].color } as CSSProperties) : undefined;
  const src = stack.id === I.COMPASS ? api.icons.compassUrl(needle) : api.icons.url(stack.id);
  return (
    <>
      {glow && <span className="ench-aura" data-ench-aura style={glow} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`${stack.gear?.r === 3 ? 'item-icon epic-icon' : 'item-icon'}${glow ? ' ench-icon' : ''}`} style={glow} src={src} alt={item.name} draggable={false} />
      {glow && <div className="glint" data-glint style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})`, ...glow }} />}
      {glow && (
        <span className="ench-sparks" aria-hidden="true" style={glow}>
          <i style={{ left: `${20 + (stack.id * 7) % 20}%`, animationDelay: '0s' }} />
          <i style={{ left: `${55 + (stack.id * 11) % 25}%`, animationDelay: '-0.9s' }} />
          <i style={{ left: `${35 + (stack.id * 3) % 30}%`, animationDelay: '-1.7s' }} />
        </span>
      )}
      {stack.gear && stack.gear.r > 0 && <div className={`rarity-ring r${stack.gear.r}`} data-testid="rarity-ring" />}
      {!!stack.gear?.u && (
        <span className={stack.gear.u >= 10 ? 'plus-badge hi max' : stack.gear.u >= 7 ? 'plus-badge hi' : 'plus-badge'} data-testid="plus-badge">
          +{stack.gear.u}
        </span>
      )}
      {!!stack.gear?.o && <span className="bloom-dot" data-testid="bloom-dot" />}
      {stack.count > 1 && <span className="count">{stack.count}</span>}
      {item.durability > 0 && stack.damage > 0 && (
        <div className="dur">
          <div style={{ width: `${Math.max(0, left) * 100}%`, background: `hsl(${Math.max(0, left) * 120} 85% 48%)` }} />
        </div>
      )}
    </>
  );
}

/** The coloured lines of an item's hover tooltip (see `tooltipLines`). */
export function Tip({ lines }: { lines: TipLine[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className={`tip-line tip-${l.color}${l.italic ? ' tip-italic' : ''}`}>
          {l.text}
        </div>
      ))}
    </>
  );
}