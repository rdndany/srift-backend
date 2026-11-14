'use client';

import { useEffect, useRef, useState } from 'react';
import { CLASSES, HOTBAR_SLOTS, TRADE_SLOTS, formatCoins, tooltipLines, type ItemView as ItemData, type TipLine } from '@solrift/shared';
import { stackOf } from '../game/remote';
import { useUi } from '../ui/store';
import { ItemView, Tip } from './ItemView';
import { CoinIcon } from './ShopUI';
import './shop.css';
import './trade.css';

/** "Ada wants to trade": buttons for when the mouse is free, Y and N for when it is not. */
function TradeAsk() {
  const from = useUi((s) => s.tradeAsk);
  const trading = useUi((s) => !!s.trade);
  const partyInvite = useUi((s) => s.partyInvite); // a party invitation shows in this place first
  const api = useUi((s) => s.api);
  if (!from || trading || partyInvite || !api) return null;
  return (
    <div id="party-invite" className="trade-ask" data-testid="trade-ask" onContextMenu={(e) => e.preventDefault()}>
      <div className="invite-text">
        <b>{from}</b> wants to trade with you
      </div>
      <div className="invite-buttons">
        <button className="quest-btn" data-testid="trade-ask-accept" onClick={() => api.tradeAct({ a: 'accept' })}>
          Accept <kbd>Y</kbd>
        </button>
        <button className="quest-btn secondary" data-testid="trade-ask-decline" onClick={() => api.tradeAct({ a: 'decline' })}>
          Decline <kbd>N</kbd>
        </button>
      </div>
    </div>
  );
}

/**
 * The trade window: your side of the table and theirs, side by side, and your bags below. Click an item in your bags to put
 * it on the table (shift-click puts one, and one more each time), click it on the table to take it back. Both sides accept
 * to settle; changing anything takes both acceptances back.
 */
function TradeWindow() {
  const trade = useUi((s) => s.trade);
  const api = useUi((s) => s.api);
  const myCoins = useUi((s) => s.coins);
  useUi((s) => s.version);
  const cls = useUi((s) => s.cls);
  const [tip, setTip] = useState<TipLine[]>([]);
  const [coins, setCoins] = useState('0');
  const tipRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });

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
  // What the server says you offer wins over what was typed.
  const offered = trade?.mine.coins ?? 0;
  useEffect(() => setCoins(String(offered)), [offered]);

  if (!trade || !api) return null;
  const myClass = cls?.id ?? null;
  const myLevel = cls?.level ?? 0;
  const size = api.inventory.size;
  const hotbar = Array.from({ length: Math.min(HOTBAR_SLOTS, size) }, (_, i) => i);
  const backpack = Array.from({ length: Math.max(0, size - HOTBAR_SLOTS) }, (_, i) => HOTBAR_SLOTS + i).filter((i) => api.inventory.isUsable(i));
  const onTable = new Map(trade.mine.offers.map((o, i) => [o.slot, { i, count: o.item.count }]));
  const tipOf = (v: ItemData | null) => (v ? tooltipLines(stackOf(v)!, myClass, myLevel) : []);
  const commitCoins = () => {
    const n = Math.max(0, Math.floor(Number(coins) || 0));
    setCoins(String(Math.min(n, myCoins)));
    if (Math.min(n, myCoins) !== offered) api.tradeAct({ a: 'coins', n });
  };
  const clickBag = (i: number, shift: boolean) => {
    const s = api.inventory.get(i);
    if (!s) return;
    const on = onTable.get(i);
    if (shift) api.tradeAct({ a: 'put', slot: i, count: Math.min(s.count, (on?.count ?? 0) + 1) });
    else if (on) api.tradeAct({ a: 'take', i: on.i });
    else api.tradeAct({ a: 'put', slot: i });
  };

  const bagSlot = (i: number) => {
    const s = api.inventory.get(i);
    const on = onTable.get(i);
    return (
      <button
        key={i}
        className={`slot shop-slot${on ? ' offered' : ''}`}
        data-testid={`trade-bag-${i}`}
        onMouseEnter={() => setTip(s ? tooltipLines(s, myClass, myLevel) : [])}
        onMouseLeave={() => setTip([])}
        onClick={(e) => clickBag(i, e.shiftKey)}
      >
        <ItemView stack={s} />
        {on && on.count < (s?.count ?? 0) ? <span className="trade-part">{on.count}</span> : null}
      </button>
    );
  };

  const cells = (mine: boolean) => {
    const side = mine ? trade.mine : trade.theirs;
    return Array.from({ length: TRADE_SLOTS }, (_, k) => {
      const o = side.offers[k];
      return (
        <button
          key={k}
          className={`slot shop-slot trade-cell${o ? ' full' : ''}`}
          data-testid={`trade-${mine ? 'mine' : 'theirs'}-${k}`}
          disabled={!mine || !o}
          onMouseEnter={() => setTip(tipOf(o?.item ?? null))}
          onMouseLeave={() => setTip([])}
          onClick={() => mine && o && api.tradeAct({ a: 'take', i: k })}
        >
          <ItemView stack={o ? stackOf(o.item) : null} />
        </button>
      );
    });
  };

  const theirCls = trade.cls ? CLASSES[trade.cls] : null;
  return (
    <div id="menu-screen" className="shop-screen trade-screen" data-testid="trade-window" onContextMenu={(e) => e.preventDefault()}>
      <div className="menu-wrap">
        <div className="panel wow shop-win trade-win">
          <div className="title">Trade</div>
          <button className="wow-close" aria-label="Cancel the trade" onClick={() => api.tradeAct({ a: 'cancel' })}>
            &times;
          </button>

          <div className="trade-cols">
            <div className="trade-side" data-side="mine">
              <div className="wow-head">
                <span>You</span>
              </div>
              <div className="trade-table">{cells(true)}</div>
              <label className="trade-coins" title="Coins you offer">
                <CoinIcon size={16} />
                <input
                  data-testid="trade-coins"
                  type="number"
                  min={0}
                  max={myCoins}
                  value={coins}
                  onChange={(e) => setCoins(e.target.value)}
                  onBlur={commitCoins}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitCoins();
                  }}
                  onKeyUp={(e) => e.stopPropagation()}
                />
                <small>of {formatCoins(myCoins)}</small>
              </label>
              <div className={`trade-state${trade.mine.ready ? ' ok' : ''}`} data-testid="trade-mine-state">
                {trade.mine.ready ? 'You accepted' : 'Not accepted'}
              </div>
            </div>
            <div className="trade-side" data-side="theirs">
              <div className="wow-head">
                <span>{trade.with}</span>
                {theirCls ? (
                  <span className="shop-sub" style={{ color: theirCls.color }}>
                    {theirCls.name} {trade.level ?? ''}
                  </span>
                ) : null}
              </div>
              <div className="trade-table">{cells(false)}</div>
              <div className="trade-coins theirs" title="Coins they offer">
                <CoinIcon size={16} />
                <span data-testid="trade-their-coins">{formatCoins(trade.theirs.coins)}</span>
              </div>
              <div className={`trade-state${trade.theirs.ready ? ' ok' : ''}`} data-testid="trade-their-state">
                {trade.theirs.ready ? `${trade.with} accepted` : 'Not accepted'}
              </div>
            </div>
          </div>

          <div className="wow-head">
            <span>Backpack</span>
            <span className="shop-sub">click to offer - shift-click one at a time</span>
          </div>
          <div className="slot-grid shop-bags" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
            {backpack.map(bagSlot)}
          </div>
          <div className="slot-grid shop-bags hotbar" style={{ gridTemplateColumns: 'repeat(9, 52px)' }}>
            {hotbar.map(bagSlot)}
          </div>

          <div className="wow-foot shop-foot trade-foot">
            <button className="quest-btn secondary" data-testid="trade-cancel" onClick={() => api.tradeAct({ a: 'cancel' })}>
              Cancel
            </button>
            <button className="quest-btn" data-testid="trade-accept" onClick={() => api.tradeAct({ a: 'ready', on: !trade.mine.ready })}>
              {trade.mine.ready ? 'Accepted - undo' : 'Accept'}
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

/** Trading between players: the request on screen, and the table. Only online. */
export function TradeUI() {
  return (
    <>
      <TradeAsk />
      <TradeWindow />
    </>
  );
}
