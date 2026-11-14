'use client';

import { useEffect, useRef, useState } from 'react';
import { CURRENCY, cloneGear, HOTBAR_SLOTS, formatCoins, getItem, jewelKind, makeStack, stackSellPrice, shopOf, skillBookAbility, tooltipLines, tooltipName, type NpcDef, type TipLine } from '@solrift/shared';
import { useUi } from '../ui/store';
import { ItemView, Tip } from './ItemView';
import './shop.css';

const nice = (name: string): string => name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** A gold coin in the blocky pixel style of the item icons: 12 x 12 pixels, drawn crisp at any size. */
const COIN_ROWS = [
  '...OOOOOO...',
  '..OLLLLLMO..',
  '.OLWWLMMMDO.',
  'OLWLMMMMMMDO',
  'OLLMMDDMMMDO',
  'OLMMMDMMMMDO',
  'OLMMMDMMMMDO',
  'OLMMMDDMMMDO',
  'OMMMMMMMMMDO',
  '.OMMMMMMMDO.',
  '..ODDDDDDO..',
  '...OOOOOO...',
];
const COIN_COLORS: Record<string, string> = { O: '#4a2e00', D: '#b06a08', M: '#f0b020', L: '#ffe070', W: '#fff8c8' };
const COIN_PIXELS = COIN_ROWS.flatMap((row, y) => [...row].flatMap((c, x) => (COIN_COLORS[c] ? [{ x, y, fill: COIN_COLORS[c] }] : [])));

export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="coin-icon" width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
      {COIN_PIXELS.map((p) => (
        <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={p.fill} />
      ))}
    </svg>
  );
}
/** Experience: a green star in the same 12 x 12 pixel style as the coin. */
const XP_ROWS = [
  '.....OO.....',
  '.....OO.....',
  '....OLLO....',
  '....OLWO....',
  'OOOOLLWMOOOO',
  'OLLLLWWMMMMO',
  '.OLLWWMMMDO.',
  '..OLMMMMDO..',
  '..OMMMMMDO..',
  '.OMMMDDMMDO.',
  '.OMDDO.ODDO.',
  '..OO....OO..',
];
const XP_COLORS: Record<string, string> = { O: '#0c3306', D: '#2f8a1c', M: '#5fcf3e', L: '#a8f080', W: '#f0ffd8' };
const XP_PIXELS = XP_ROWS.flatMap((row, y) => [...row].flatMap((c, x) => (XP_COLORS[c] ? [{ x, y, fill: XP_COLORS[c] }] : [])));

export function XpIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="coin-icon xp-icon" width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
      {XP_PIXELS.map((p) => (
        <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={p.fill} />
      ))}
    </svg>
  );
}/** The coins you carry, shown in the inventory screens (in the Adventure, and wherever you have any). */
export function CoinPurse({ always }: { always?: boolean }) {
  const coins = useUi((s) => s.coins);
  const adventure = useUi((s) => s.adventure);
  if (!always && !adventure && coins <= 0) return null;
  return (
    <div id="coin-purse" data-testid="coin-purse" data-coins={coins} title={CURRENCY.name}>
      <CoinIcon />
      <span className="coin-amount">{formatCoins(coins)}</span>
    </div>
  );
}

/**
 * A merchant's counter, in the same bronze window as the inventory: the wares in slots (click one to buy it), your own bags
 * in the same slots below (click an item to sell one, Shift-click to sell the stack), and the purse in the money bar.
 * Hovering anything shows its tooltip with the price. Everything is paid in coins.
 */
export function ShopWindow({ npc, canGoBack = true }: { npc: NpcDef; canGoBack?: boolean }) {
  const api = useUi((s) => s.api);
  const coins = useUi((s) => s.coins);
  useUi((s) => s.version);
  const shopOpen = useUi((s) => s.shopOpen);
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

  const shop = shopOf(npc.id);
  if (!shop || !api) return null;
  const size = api.inventory.size;
  const hotbar = Array.from({ length: Math.min(HOTBAR_SLOTS, size) }, (_, i) => i);
  // The backpack, then the room of the bags that are worn (the slots of a bag that is not worn are shut).
  const backpack = Array.from({ length: Math.max(0, size - HOTBAR_SLOTS) }, (_, i) => HOTBAR_SLOTS + i).filter((i) => api.inventory.isUsable(i));

  const sellSlot = (i: number) => {
    const s = api.inventory.get(i);
    const each = s ? stackSellPrice(s) : 0;
    const lines = s ? tooltipLines(s, myClass, myLevel) : [];
    if (s) lines.push(each > 0 ? { text: `Sells for ${formatCoins(each)} each`, color: 'good' } : { text: 'The merchant will not buy this', color: 'warn' });
    return (
      <button
        key={i}
        className={`slot shop-slot${each > 0 ? ' sellable' : s ? ' unsellable' : ''}`}
        data-testid={`shop-sell-${i}`}
        disabled={each <= 0}
        onMouseEnter={() => setTip(lines)}
        onMouseLeave={() => setTip([])}
        onClick={(e) => api.shop('sell', i, e.shiftKey && s ? s.count : 1)}
      >
        <ItemView stack={s} />
      </button>
    );
  };

  return (
    <div id="menu-screen" className="shop-screen" data-testid="quest-dialog" onContextMenu={(e) => e.preventDefault()}>
      <div className="menu-wrap">
        <div className="panel wow shop-win" data-testid="shop-panel">
          <div className="title">{npc.name}</div>
          <button className="wow-close" aria-label="Close" onClick={() => api.close()}>
            &times;
          </button>

          <div className="wow-head">
            <span>Wares</span>
            <span className="shop-sub">{npc.title}</span>
          </div>
          <p className="shop-line" data-testid="shop-line">{shop.line}</p>
          <div className="vendor-list">
            <div className="slot-grid shop-bags" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
              {shop.stock.map((w, i) => {
                const afford = coins >= w.price;
                const stack = makeStack(w.id, w.count);
                if (w.gear) stack.gear = cloneGear(w.gear);
                // The name and the details come from the hover card, with the price at the end of it.
                const lines: TipLine[] = [...tooltipLines(stack, myClass, myLevel), { text: `Price: ${formatCoins(w.price)}`, color: afford ? 'good' : 'warn' }];
                return (
                  <button
                    key={i}
                    className="slot shop-slot ware"
                    data-testid={`shop-buy-${i}`}
                    data-name={skillBookAbility(w.id) !== null || jewelKind(w.id) !== null || w.gear ? tooltipName(stack) : nice(getItem(w.id).name)}
                    onMouseEnter={() => setTip(lines)}
                    onMouseLeave={() => setTip([])}
                    onClick={() => afford && api.shop('buy', i, 1)}
                  >
                    <ItemView stack={stack} />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="wow-head">
            <span>Backpack</span>
            <span className="shop-sub">click to sell - shift-click sells the stack</span>
          </div>
          <div className="slot-grid shop-bags" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
            {backpack.map(sellSlot)}
          </div>
          <div className="slot-grid shop-bags hotbar" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
            {hotbar.map(sellSlot)}
          </div>

          <div className="wow-foot shop-foot" data-testid="shop-coins">
            {canGoBack ? (
              <button className="quest-btn secondary" data-testid="shop-toggle" onClick={() => useUi.setState({ shopOpen: !shopOpen })}>
                Back
              </button>
            ) : (
              <button className="quest-btn secondary" onClick={() => api.close()}>
                Goodbye
              </button>
            )}
            <span className="wow-foot-label">You carry</span>
            <CoinPurse always />
          </div>
        </div>
      </div>
      <div ref={tipRef} className="tooltip" style={{ display: tip.length ? 'block' : 'none' }}>
        <Tip lines={tip} />
      </div>
    </div>
  );
}