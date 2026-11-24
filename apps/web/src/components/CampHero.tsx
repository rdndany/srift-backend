'use client';

import {
  AUCTION_HOURS,
  AUCTION_RULES,
  MAX_COINS,
  companionOfItem,
  depositFor,
  getItem,
  holdsInOffhand,
  mountOfItem,
  sellBlocker,
  stackSellPrice,
  stashBlocker,
  wingOfItem,
  accessoryOfItem,
  type AuctionHours,
  type DeskAct,
  type DeskView,
  type ItemStack,
  type WornPlace,
} from '@solrift/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useCamp } from '../camp/store';
import { CampSlot, ItemCard, Sheet, Stepper, itemName } from './CampParts';
import { CoinIcon } from './ShopUI';

const WORN_LABEL: Record<WornPlace, string> = {
  helmet: 'Helmet',
  chestplate: 'Chest',
  leggings: 'Legs',
  boots: 'Boots',
  offhand: 'Off hand',
  mount: 'Mount',
  outfit: 'Outfit',
  companion: 'Pet',
  wings: 'Wings',
  ring1: 'Ring',
  ring2: 'Ring',
  necklace: 'Necklace',
};
const WORN_ORDER: WornPlace[] = ['helmet', 'chestplate', 'leggings', 'boots', 'offhand', 'mount', 'outfit', 'companion', 'wings', 'ring1', 'ring2', 'necklace'];

/** Can the item be worn (the server decides, but a button that always fails is no use)? */
const wearable = (s: ItemStack): boolean => !!getItem(s.id).armor || holdsInOffhand(s.id) || mountOfItem(s.id) !== null || !!companionOfItem(s.id) || !!wingOfItem(s.id) || !!accessoryOfItem(s.id);

type Target = { kind: 'bag'; slot: number; stack: ItemStack } | { kind: 'worn'; where: WornPlace; stack: ItemStack } | { kind: 'stash'; slot: number; stack: ItemStack };

/** A slot the lobby sheet can hand to the desk: a bag slot (empty while an item is being moved), something worn, or a stash slot. */
export type DeskPick = { kind: 'bag'; slot: number; stack: ItemStack | null } | { kind: 'worn'; where: WornPlace; stack: ItemStack } | { kind: 'stash'; slot: number; stack: ItemStack };

/** The Camp's first tab: the hero, what it wears, its bags and the Stash. A tap on an item opens what can be done with it. */
export function CampHero({ view }: { view: DeskView }) {
  const act = useCamp((s) => s.act);
  const busy = useCamp((s) => s.busy);
  const [target, setTarget] = useState<Target | null>(null);
  /** A bag slot picked up to be moved: the next slot tapped is where it goes. */
  const [moving, setMoving] = useState<number | null>(null);
  const locked = view.inGame;
  // The Stash is big and mostly empty: what is in it, and a row of free room (a put goes to the first free slot by itself).
  const stashUsed = view.stash.slots.filter(Boolean).length;
  const stashShown = (() => {
    const all = view.stash.slots.map((item, i) => ({ item, i }));
    const free = all.filter((s) => !s.item).slice(0, 6);
    return [...all.filter((s) => s.item), ...free];
  })();

  const done = (p: Promise<boolean>) => void p.then((ok) => ok && setTarget(null));
  const tapBag = (slot: number, stack: ItemStack | null) => {
    if (moving !== null) {
      if (moving !== slot) void act({ a: 'swap', from: moving, to: slot });
      setMoving(null);
      return;
    }
    if (stack) setTarget({ kind: 'bag', slot, stack });
  };

  return (
    <div className="camp-pane" data-testid="camp-hero">
      {locked && (
        <p className="camp-warn" role="status" data-testid="camp-ingame">
          Your hero is in the game right now, so it cannot be changed from here. This is a copy from a moment ago: leave the game to make changes.
        </p>
      )}

      <section className="camp-block" aria-label="Worn">
        <h3>Worn</h3>
        <div className="camp-worn">
          {WORN_ORDER.map((w) => (
            <div key={w} className="camp-worn-cell">
              <CampSlot stack={view.worn[w]} label={WORN_LABEL[w]} onClick={view.worn[w] ? () => setTarget({ kind: 'worn', where: w, stack: view.worn[w]! }) : undefined} />
              <span>{WORN_LABEL[w]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="camp-block" aria-label="Bags">
        <h3>
          Bags <small>{view.slots.filter((s) => s.item).length} of {view.slots.length} used</small>
        </h3>
        {moving !== null && (
          <p className="camp-hint" role="status">
            Tap the slot to move it to. <button type="button" className="camp-link" onClick={() => setMoving(null)}>Cancel</button>
          </p>
        )}
        <div className="camp-grid" data-testid="camp-bags">
          {view.slots.map(({ slot, item }) => (
            <CampSlot key={slot} stack={item} selected={moving === slot} onClick={item || moving !== null ? () => tapBag(slot, item) : undefined} disabled={locked} />
          ))}
        </div>
      </section>

      <section className="camp-block" aria-label="Stash">
        <h3>
          Stash <small>{stashUsed} of {view.stash.slots.length} used, shared by all of your heroes</small>
        </h3>
        <div className="camp-grid" data-testid="camp-stash">
          {stashShown.map(({ item, i }) => (
            <CampSlot key={i} stack={item} onClick={item ? () => setTarget({ kind: 'stash', slot: i, stack: item }) : undefined} disabled={locked} />
          ))}
        </div>
      </section>

      {target && (
        <Sheet title={itemName(target.stack)} onClose={() => setTarget(null)}>
          <ItemCard stack={target.stack} />
          {locked ? (
            <p className="camp-hint">Leave the game to change this hero.</p>
          ) : (
            <DeskActions
              target={target}
              coins={view.hero.coins}
              busy={busy}
              onMove={(slot) => {
                setMoving(slot);
                setTarget(null);
              }}
              run={(a) => done(act(a))}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}

export function DeskActions({ target, coins, busy, run, onMove, sellOnly = false, onClose }: { target: Target; coins: number; busy: boolean; run: (a: DeskAct) => void; onMove: (slot: number) => void; sellOnly?: boolean; onClose?: () => void }) {
  const { stack } = target;
  const [count, setCount] = useState(stack.count);
  const [selling, setSelling] = useState(sellOnly);

  if (target.kind === 'worn') {
    return (
      <div className="camp-actions">
        <button type="button" className="camp-btn" disabled={busy} onClick={() => run({ a: 'unequip', where: target.where })}>
          Take off
        </button>
      </div>
    );
  }

  if (target.kind === 'stash') {
    return (
      <div className="camp-actions">
        {stack.count > 1 && <Stepper label="amount" value={count} min={1} max={stack.count} onChange={setCount} all />}
        <button type="button" className="camp-btn" disabled={busy} onClick={() => run({ a: 'stash', c: { a: 'take', slot: target.slot, count } })}>
          Take {count > 1 ? count : ''} to the bags
        </button>
      </div>
    );
  }

  if (selling && target.kind === 'bag') return <SellForm slot={target.slot} stack={stack} coins={coins} busy={busy} run={run} back={() => (sellOnly ? onClose?.() : setSelling(false))} />;

  const stashWhy = stashBlocker(stack);
  const sellWhy = sellBlocker(stack);
  return (
    <div className="camp-actions">
      {wearable(stack) && (
        <button type="button" className="camp-btn primary" disabled={busy} onClick={() => run({ a: 'equip', slot: target.slot })}>
          Wear
        </button>
      )}
      {stack.count > 1 && !stashWhy && <Stepper label="amount" value={count} min={1} max={stack.count} onChange={setCount} all />}
      <button type="button" className="camp-btn" disabled={busy || !!stashWhy} title={stashWhy ?? undefined} onClick={() => run({ a: 'stash', c: { a: 'put', slot: target.slot, count } })}>
        {stashWhy ?? `Put ${count > 1 ? count : ''} in the Stash`}
      </button>
      <button type="button" className="camp-btn" disabled={!!sellWhy} title={sellWhy ?? undefined} onClick={() => setSelling(true)}>
        Sell at the Auction House
      </button>
      <button type="button" className="camp-btn" onClick={() => onMove(target.slot)}>
        Move to another slot
      </button>
    </div>
  );
}

function SellForm({ slot, stack, coins, busy, run, back }: { slot: number; stack: ItemStack; coins: number; busy: boolean; run: (a: DeskAct) => void; back: () => void }) {
  const [count, setCount] = useState(stack.count);
  const unit = Math.max(1, stackSellPrice(stack));
  const [bid, setBid] = useState(unit * stack.count);
  const [buyout, setBuyout] = useState(0);
  const [hours, setHours] = useState<AuctionHours>(24);
  const deposit = depositFor({ ...stack, count }, hours);
  const price = buyout > 0 ? buyout : bid;
  const bad = bid < 1 ? 'Name a starting bid.' : buyout > 0 && buyout < bid ? 'The buyout cannot be below the bid.' : deposit > coins ? `The deposit is ${deposit.toLocaleString('en-US')} Auren: you have ${coins.toLocaleString('en-US')}.` : null;
  const clamp = (to: (n: number) => void) => (n: number) => to(Math.min(MAX_COINS, Math.max(0, n)));
  return (
    <div className="camp-actions camp-sell" data-testid="camp-sell">
      {stack.count > 1 && (
        <label>
          Amount
          <Stepper label="amount" value={count} min={1} max={stack.count} onChange={(n) => (setCount(n), setBid(unit * n))} all />
        </label>
      )}
      <label>
        Starting bid <CoinIcon size={14} />
        <Stepper label="starting bid" value={bid} min={0} max={MAX_COINS} onChange={clamp(setBid)} />
      </label>
      <label>
        Buyout, 0 for none <CoinIcon size={14} />
        <Stepper label="buyout" value={buyout} min={0} max={MAX_COINS} onChange={clamp(setBuyout)} />
      </label>
      <div className="camp-hours" role="group" aria-label="How long">
        {AUCTION_HOURS.map((h) => (
          <button key={h} type="button" className={hours === h ? 'on' : ''} onClick={() => setHours(h)}>
            {h} h
          </button>
        ))}
      </div>
      <p className="camp-hint">
        Deposit {deposit.toLocaleString('en-US')} Auren, back when it sells. The house keeps {Math.round(AUCTION_RULES.cut * 100)}%: you would get {Math.floor(price * (1 - AUCTION_RULES.cut)).toLocaleString('en-US')}.
      </p>
      {bad && <p className="camp-warn small">{bad}</p>}
      <button type="button" className="camp-btn primary" disabled={busy || !!bad} onClick={() => run({ a: 'auction', c: { a: 'post', slot, count, bid, buyout, hours } })}>
        Put it up
      </button>
      <button type="button" className="camp-btn" onClick={back}>
        Back
      </button>
    </div>
  );
}

/** The Auren and the name of the hero, for the top of the Camp. */
export function HeroLine({ view }: { view: DeskView }) {
  return (
    <p className="camp-who">
      <b>{view.hero.name}</b>
      <span>{view.hero.class ? `${view.hero.class[0].toUpperCase()}${view.hero.class.slice(1)} ` : ''}level {view.hero.level}</span>
      <span className="camp-coins" title="Auren">
        {view.hero.coins.toLocaleString('en-US')} <CoinIcon size={16} />
      </span>
    </p>
  );
}

/**
 * The lobby's link to the same desk the Camp uses. A drag moves a stack, or wears it when it is dropped on what the hero has on.
 * A right click stores it or sells it.
 * `active` is a signed-in character on the realm. `reload` is called after a change so the sheet draws what the server kept.
 */
export type SheetHand = {
  menu: (p: { kind: 'bag'; slot: number; stack: ItemStack } | { kind: 'stash'; slot: number; stack: ItemStack }, x: number, y: number) => void;
  move: (from: number, to: number) => void;
  wear: (from: number) => void;
  takeOff: (where: WornPlace) => void;
  take: (stashSlot: number) => void;
  quiet: boolean;
};

export function LobbyDesk({ active, heroId, reload, children }: { active: boolean; heroId: string | null; reload: () => void; children: (hand: SheetHand | undefined) => ReactNode }) {
  const view = useCamp((s) => s.view);
  const load = useCamp((s) => s.load);
  const act = useCamp((s) => s.act);
  const busy = useCamp((s) => s.busy);
  const notice = useCamp((s) => s.notice);
  const clear = useCamp((s) => s.clear);
  const [menu, setMenu] = useState<{ x: number; y: number; pick: Target & { kind: 'bag' | 'stash' } } | null>(null);
  const [sell, setSell] = useState<(Target & { kind: 'bag' }) | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    setMenu(null);
    setSell(null);
    void load();
  }, [active, heroId, load]);

  useEffect(() => {
    if (!notice) return;
    (notice.ok ? toast.success : toast.error)(notice.text);
    clear();
  }, [notice, clear]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);

  const ready = active && view !== null && view.hero.id === heroId;
  const locked = !!view?.inGame;
  const done = (p: Promise<boolean>) => {
    void p.then((ok) => {
      if (!ok) return;
      setMenu(null);
      setSell(null);
      reload();
    });
  };
  const hand: SheetHand | undefined = ready && !locked && view
    ? {
        menu: (p, x, y) => setMenu({ pick: p, x, y }),
        move: (from, to) => from !== to && done(act({ a: 'swap', from, to })),
        wear: (from) => done(act({ a: 'equip', slot: from })),
        takeOff: (where) => done(act({ a: 'unequip', where })),
        take: (stashSlot) => {
          const stack = view.stash.slots[stashSlot];
          if (stack) done(act({ a: 'stash', c: { a: 'take', slot: stashSlot, count: stack.count } }));
        },
        quiet: menu !== null,
      }
    : undefined;
  const pick = menu?.pick ?? null;
  const stashWhy = pick?.kind === 'bag' ? stashBlocker(pick.stack) : null;
  const sellWhy = pick?.kind === 'bag' ? sellBlocker(pick.stack) : null;

  return (
    <>
      {ready && locked && (
        <p className="cs-warn" role="status">
          This character is in the game right now, so the bags cannot be changed from here.
        </p>
      )}
      {children(hand)}
      {menu && pick && view && createPortal(
        <div className="cs-menu" ref={menuRef} role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 120) }}>
          {pick.kind === 'bag' ? (
            <>
              <button type="button" role="menuitem" disabled={busy || !!stashWhy} title={stashWhy ?? undefined} onClick={() => done(act({ a: 'stash', c: { a: 'put', slot: pick.slot, count: pick.stack.count } }))}>
                {stashWhy ?? 'Put in the Stash'}
              </button>
              <button type="button" role="menuitem" disabled={!!sellWhy} title={sellWhy ?? undefined} onClick={() => (setSell(pick), setMenu(null))}>
                Sell at the Auction House
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" disabled={busy} onClick={() => done(act({ a: 'stash', c: { a: 'take', slot: pick.slot, count: pick.stack.count } }))}>
              Take to the bags
            </button>
          )}
        </div>,
        document.body,
      )}
      {sell && view && (
        <Sheet title={itemName(sell.stack)} onClose={() => setSell(null)}>
          <ItemCard stack={sell.stack} />
          <DeskActions
            sellOnly
            target={sell}
            coins={view.hero.coins}
            busy={busy}
            onMove={() => undefined}
            onClose={() => setSell(null)}
            run={(a) => done(act(a))}
          />
        </Sheet>
      )}
    </>
  );
}
