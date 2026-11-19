'use client';

import { CLASSES, abilitiesOf, type AbilityDef, type ClassId, type TipLine } from '@solrift/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AbilityIcon } from './AbilityIcon';
import { Tip } from './ItemView';

const num = (n: number): string => String(Math.round(n * 10) / 10);

/** What the skill book of an ability says when you hover it in the game: its name, class, level, what it does, what it costs. */
function abilityLines(a: AbilityDef): TipLine[] {
  const cls = CLASSES[a.classId];
  return [
    { text: a.name, color: 'name' },
    { text: `Class: ${cls.name}`, color: 'stat' },
    { text: `Requires level ${a.unlockLevel}`, color: 'stat' },
    { text: a.description, color: 'dim' },
    { text: `${a.cost} ${cls.resource.name.toLowerCase()} - ${num(a.cooldown)}s cooldown`, color: 'dim' },
  ];
}

/**
 * The four ability icons of a class card. Hovering (or focusing) one shows the same tooltip as in the game, drawn with
 * the game's own `.tooltip` style and following the pointer. It is drawn on the page itself, not inside the card: the
 * card's stepped corners would cut it off.
 */
export function ClassSkills({ id }: { id: ClassId }) {
  const [tip, setTip] = useState<AbilityDef | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const at = useRef({ x: 0, y: 0 });

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const m = 6;
    const { x, y } = at.current;
    let tx = x + 14;
    if (tx + el.offsetWidth > window.innerWidth - m) tx = Math.max(m, x - 14 - el.offsetWidth);
    const ty = Math.max(m, Math.min(y - 34, window.innerHeight - el.offsetHeight - m));
    el.style.transform = `translate(${tx}px, ${ty}px)`;
  };

  useEffect(() => {
    if (!tip) return;
    const move = (e: MouseEvent) => {
      at.current = { x: e.clientX, y: e.clientY };
      place();
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [tip]);
  useLayoutEffect(place);

  return (
    <div className="fp-skills" role="list" aria-label={`${CLASSES[id].name} abilities`}>
      {abilitiesOf(id).map((a) => (
        <span
          key={a.id}
          role="listitem"
          tabIndex={0}
          aria-label={`${a.name}: ${a.description}`}
          onMouseEnter={(e) => {
            at.current = { x: e.clientX, y: e.clientY };
            setTip(a);
          }}
          onMouseLeave={() => setTip(null)}
          onFocus={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            at.current = { x: r.right, y: r.top + r.height / 2 };
            setTip(a);
          }}
          onBlur={() => setTip(null)}
        >
          <AbilityIcon id={a.id} size={30} />
        </span>
      ))}
      {tip &&
        createPortal(
          <div ref={ref} className="tooltip" role="tooltip" style={{ fontFamily: "'Monocraft', 'Courier New', monospace", pointerEvents: 'none' }}>
            <Tip lines={abilityLines(tip)} />
          </div>,
          document.body,
        )}
    </div>
  );
}
