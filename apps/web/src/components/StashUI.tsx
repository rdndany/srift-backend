'use client';

import { useEffect, useRef, useState } from 'react';
import { HOTBAR_SLOTS, STASH_SLOTS, stashBlocker, tooltipLines, type ItemStack, type NpcDef, type TipLine } from '@solrift/shared';
import { useUi } from '../ui/store';
import { ItemView, Tip } from './ItemView';
import './shop.css';
import './stash.css';

/**
 * The Stashkeeper's window, in the same bronze frame as a merchant's: the wallet's stash in slots (click one to take the stack,
 * Shift-click to take one) and your own bags below (click an item to put the stack in, Shift-click to put one in). What is in the
 * stash is shared by every character of the wallet and by nobody else.
 */
export function StashWindow({ npc }: { npc: NpcDef }) {
  const api = useUi((s) => s.api);
  useUi((s) => s.version);
  const view = useUi((s) => s.stash);
  const myClass = useUi((s) => s.cls)?.id ?? null;
  const myLevel = useUi((s) => s.cls)?.level ?? 0;
  const [tip, setTip] = useState<TipLine[]>([]);
  const tipRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });

  // The tooltip follows the pointer and never leaves the window (as in the inventory).
  const placeTip = () => {
    const el = tipRef.current;
    if (!el) return;
    const { x, y } = mouse.current;
    const m = 6;
    let tx = x + 14;
    if (tx + el.offsetWidth > window.innerWidth - m) tx = Math.max(m, x - 14 - el.offsetWidth);
    const ty = Math.max(m, Math.min(y - 34, window.innerHeight - el.offsetHeight - m));
    el.style.transform = `translate(${tx}px, ${ty}px)`;
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      placeTip();
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  useEffect(placeTip);

  if (!api) return null;
  const size = api.inventory.size;
  const hotbar = Array.from({ length: Math.min(HOTBAR_SLOTS, size) }, (_, i) => i);
  // The backpack, then the room of the bags that are worn (the slots of a bag that is not worn are shut).
  const backpack = Array.from({ length: Math.max(0, size - HOTBAR_SLOTS) }, (_, i) => HOTBAR_SLOTS + i).filter((i) => api.inventory.isUsable(i));
  const slots: (ItemStack | null)[] = view?.slots.length ? view.slots : Array.from({ length: STASH_SLOTS }, () => null);
  const used = slots.filter(Boolean).length;
  const signedIn = !!view && view.slots.length > 0;

  const stashSlot = (s: ItemStack | null, i: number) => (
    <button
      key={i}
      className={`slot shop-slot stash-slot${s ? ' full' : ''}`}
      data-testid={`stash-take-${i}`}
      disabled={!s}
      onMouseEnter={() => s && setTip([...tooltipLines(s, myClass, myLevel), { text: 'Click to take the stack, Shift-click to take one', color: 'dim' }])}
      onMouseLeave={() => setTip([])}
      onClick={(e) => s && api.stash({ a: 'take', slot: i, count: e.shiftKey ? 1 : Math.min(64, s.count) })}
    >
      <ItemView stack={s} />
    </button>
  );

  const bagSlot = (i: number) => {
    const s = api.inventory.get(i);
    const blocked = s ? stashBlocker(s) : null;
    const lines = s ? tooltipLines(s, myClass, myLevel) : [];
    if (s) lines.push(blocked ? { text: blocked, color: 'warn' } : { text: 'Click to store the stack, Shift-click to store one', color: 'dim' });
    return (
      <button
        key={i}
        className={`slot shop-slot${s && !blocked ? ' sellable' : s ? ' unsellable' : ''}`}
        data-testid={`stash-put-${i}`}
        disabled={!s || !!blocked || !signedIn}
        onMouseEnter={() => setTip(lines)}
        onMouseLeave={() => setTip([])}
        onClick={(e) => s && api.stash({ a: 'put', slot: i, count: e.shiftKey ? 1 : Math.min(64, s.count) })}
      >
        <ItemView stack={s} />
      </button>
    );
  };

  return (
    <div id="menu-screen" className="shop-screen" data-testid="quest-dialog" onContextMenu={(e) => e.preventDefault()}>
      <div className="menu-wrap">
        <div className="panel wow shop-win stash-win" data-testid="stash-panel">
          <div className="title">{npc.name}</div>
          <button className="wow-close" aria-label="Close" onClick={() => api.close()}>
            &times;
          </button>

          <div className="wow-head">
            <span>Stash</span>
            <span className="shop-sub" data-testid="stash-count" title="Shared by every character of your wallet. Nobody else can open it.">
              {used} / {STASH_SLOTS} - shared by your wallet's characters
            </span>
          </div>
          <div className="vendor-list">
            <div className="slot-grid shop-bags" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
              {slots.map(stashSlot)}
            </div>
          </div>
          <div className="wow-head">
            <span>Backpack</span>
            <span className="shop-sub">click to store - shift-click stores one</span>
          </div>
          <div className="slot-grid shop-bags" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
            {backpack.map(bagSlot)}
          </div>
          <div className="slot-grid shop-bags hotbar" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
            {hotbar.map(bagSlot)}
          </div>

          <div className="wow-foot shop-foot">
            <button className="quest-btn secondary" onClick={() => api.close()}>
              Goodbye
            </button>
          </div>
        </div>
      </div>
      <div ref={tipRef} className="tooltip" style={{ display: tip.length ? 'block' : 'none' }}>
        <Tip lines={tip} />
      </div>
    </div>
  );
}