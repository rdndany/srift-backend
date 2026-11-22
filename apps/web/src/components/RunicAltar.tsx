'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ELEMENTS,
  ENCHANTS,
  LAPIS,
  MAX_SHELVES,
  dominantElement,
  enchantName,
  glyphLine,
  glyphOptions,
  glyphSockets,
  resourceNameOf,
  type EnchantMenu,
  type GlyphOption,
  type GlyphState,
} from '@solrift/shared';
import { useUi } from '../ui/store';
import { CoinIcon } from './ShopUI';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/**
 * A sigil: the mark of one glyph, drawn from its id (a ring, and a star of 3 to 7 points joined in a pattern no other glyph shares)
 * in the colour of its element. Nothing is stored: the same glyph always draws the same mark.
 */
export function Sigil({ id, color, size = 34, dim = false }: { id: number; color: string; size?: number; dim?: boolean }) {
  const mark = useMemo(() => {
    const n = 3 + (id % 5);
    const step = 1 + (id % 2 === 0 ? 1 : 0) + (n > 5 && id % 3 === 0 ? 1 : 0);
    const pt = (i: number, r: number): [number, number] => {
      const a = ((i * 360) / n - 90) * (Math.PI / 180);
      return [16 + Math.cos(a) * r, 16 + Math.sin(a) * r];
    };
    const outer = Array.from({ length: n }, (_, i) => pt(i, 11));
    const star = outer.map((p, i) => [p, outer[(i + step) % n]] as const);
    const dots = Array.from({ length: n }, (_, i) => pt(i + 0.5, 7));
    const inner = id % 3 === 0 ? 'ring' : id % 3 === 1 ? 'dot' : 'cross';
    return { outer, star, dots, inner };
  }, [id]);
  return (
    <svg className={`sigil${dim ? ' dim' : ''}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ '--sg': color } as CSSProperties}>
      <circle cx="16" cy="16" r="14.5" className="sg-ring" />
      <circle cx="16" cy="16" r="12.5" className="sg-ring thin" />
      {mark.star.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="sg-line" />
      ))}
      {mark.dots.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="0.9" className="sg-dot" />
      ))}
      {mark.inner === 'ring' && <circle cx="16" cy="16" r="2.4" className="sg-line" fill="none" />}
      {mark.inner === 'dot' && <circle cx="16" cy="16" r="1.8" className="sg-dot" />}
      {mark.inner === 'cross' && (
        <>
          <line x1="13.5" y1="16" x2="18.5" y2="16" className="sg-line" />
          <line x1="16" y1="13.5" x2="16" y2="18.5" className="sg-line" />
        </>
      )}
    </svg>
  );
}

const WHY: Record<GlyphState, (o: GlyphOption, have: { shelves: number; lapis: number; auren: number }) => string> = {
  ok: () => '',
  maxed: () => 'Already at its highest rank.',
  sockets: () => 'Every socket is filled. Erase a glyph to make room.',
  conflict: (o) => `Cannot share a piece with ${enchantName(o.blockedBy ?? 0, 1).replace(/ [IVX]+$/, '') || 'another glyph'}.`,
  lore: (o, h) => `The altar needs ${o.lore} shelves of lore for this: it has ${h.shelves}.`,
  lapis: (o, h) => `Needs ${o.price.lapis} lapis lazuli: you have ${h.lapis}.`,
  auren: (o, h) => `Needs ${o.price.auren.toLocaleString('en-US')} Auren: you have ${h.auren.toLocaleString('en-US')}.`,
};

/** A short word for what is missing, on the list row. */
const SHORT: Partial<Record<GlyphState, string>> = { maxed: 'Max', sockets: 'Full', conflict: 'Clash', lore: 'Lore', lapis: 'Lapis', auren: 'Auren' };

/**
 * The Runic Altar: lay a piece on the altar, pick a glyph from what it can take, and inscribe it for lapis lazuli and Auren.
 * Every glyph is known and priced up front; the shelves of books around the altar are its lore, and the rarer glyphs and higher
 * ranks ask for more of it. A piece holds as many glyphs as it has sockets (rarer gear has more); erasing one is free.
 */
export function RunicAltar({ menu, slot }: { menu: EnchantMenu; slot: ReactNode }) {
  const api = useUi((s) => s.api)!;
  const mode = useUi((s) => s.mode);
  const coins = useUi((s) => s.coins);
  const cls = useUi((s) => s.cls);
  const creative = mode === 'creative';
  const item = menu.item;
  const lapis = menu.lapis;
  const have = { shelves: menu.shelves, lapis, auren: coins };
  const options = glyphOptions(item, { ...have, creative });
  const sockets = item ? glyphSockets(item) : 0;
  const held = item?.ench ?? [];
  const [pick, setPick] = useState<number | null>(null);
  const sel = options.find((o) => o.def.id === pick) ?? options.find((o) => o.state === 'ok') ?? options[0] ?? null;

  // The altar flashes in the colour of the glyph that was just inscribed (or fades grey for one erased).
  const key = item ? `${item.id}:${held.map(([a, b]) => `${a}.${b}`).join(',')}` : '';
  const prev = useRef<{ id: number; held: [number, number][] } | null>(null);
  const [flash, setFlash] = useState<{ n: number; color: string; erase: boolean; fail?: boolean } | null>(null);
  // A failed inscription changes nothing on the piece, so the server's word for it is what flashes the altar red.
  const failN = useUi((s) => s.altarFail?.n ?? 0);
  const seenFail = useRef(failN);
  useEffect(() => {
    if (failN === seenFail.current) return;
    seenFail.current = failN;
    setFlash({ n: Date.now(), color: '#ff5a4a', erase: false, fail: true });
  }, [failN]);
  useEffect(() => {
    const last = prev.current;
    prev.current = item ? { id: item.id, held: held.map(([a, b]) => [a, b]) } : null;
    if (!item || !last || last.id !== item.id) return;
    const grew = held.find(([a, b]) => (last.held.find(([x]) => x === a)?.[1] ?? 0) < b);
    const gone = last.held.find(([a]) => !held.some(([x]) => x === a));
    const hit = grew ?? gone;
    if (!hit) return;
    const def = ENCHANTS.find((d) => d.id === hit[0]);
    setFlash({ n: Date.now(), color: def ? ELEMENTS[def.element].color : '#c8b6ff', erase: !grew });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const glow = sel ? ELEMENTS[sel.def.element].color : ELEMENTS[dominantElement(item) ?? 'arcane'].color;
  const resource = resourceNameOf(cls?.id);
  const lore = Math.min(MAX_SHELVES, menu.shelves);

  const act = (o: GlyphOption) => {
    if (o.state === 'ok') api.enchant(o.def.id);
  };

  return (
    <div className="altar" data-testid="altar" style={{ '--glow': glow } as CSSProperties}>
      <div className="altar-top">
        <div className="altar-stage">
          <svg className="altar-runes" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <radialGradient id="altar-glow">
                <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.55" />
                <stop offset="70%" stopColor="var(--glow)" stopOpacity="0.1" />
                <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="100" cy="100" r="98" fill="url(#altar-glow)" className={item ? 'on' : 'off'} />
            <g className="ring-a">
              <circle cx="100" cy="100" r="92" className="r-line" />
              {Array.from({ length: 36 }, (_, i) => (
                <line key={i} x1="100" y1="8" x2="100" y2={i % 3 === 0 ? 17 : 12} className="r-tick" transform={`rotate(${i * 10} 100 100)`} />
              ))}
            </g>
            <g className="ring-b">
              <circle cx="100" cy="100" r="74" className="r-line thin" />
              <polygon points={Array.from({ length: 6 }, (_, i) => `${100 + Math.cos((i * 60 - 90) * (Math.PI / 180)) * 74},${100 + Math.sin((i * 60 - 90) * (Math.PI / 180)) * 74}`).join(' ')} className="r-line thin" />
              <polygon points={Array.from({ length: 3 }, (_, i) => `${100 + Math.cos((i * 120 - 90) * (Math.PI / 180)) * 74},${100 + Math.sin((i * 120 - 90) * (Math.PI / 180)) * 74}`).join(' ')} className="r-line thin" />
            </g>
            <circle cx="100" cy="100" r="46" className="r-line" />
            <circle cx="100" cy="100" r="40" className="r-line thin" />
          </svg>
          <div className="altar-slot">{slot}</div>
          {flash && <span key={flash.n} className={`altar-flash${flash.erase ? ' erase' : ''}${flash.fail ? ' fail' : ''}`} style={{ '--fx': flash.color } as CSSProperties} data-testid="altar-flash" />}
          {flash?.fail && <span key={`f${flash.n}`} className="altar-fizzle" data-testid="altar-fizzle">Fizzled!</span>}
        </div>
        <div className="altar-side">
          <div className="altar-meter" data-testid="ench-shelves" title="Bookshelves around the altar: the lore it can draw on">
            <span className="am-label">Lore</span>
            <span className="pips">
              {Array.from({ length: MAX_SHELVES }, (_, i) => (
                <i key={i} className={i < lore ? 'on' : ''} />
              ))}
            </span>
            <b>{menu.shelves}</b>
          </div>
          <div className="altar-sockets" data-testid="altar-sockets">
            <span className="am-label">Sockets</span>
            <span className="sock-row">
              {item && sockets > 0
                ? Array.from({ length: Math.max(sockets, held.length) }, (_, i) => {
                    const g = held[i];
                    const def = g ? ENCHANTS.find((d) => d.id === g[0]) : null;
                    return (
                      <button
                        key={i}
                        className={`sock${g ? ' full' : ''}${sel && g && sel.def.id === g[0] ? ' sel' : ''}`}
                        data-socket={i}
                        disabled={!g}
                        title={g ? enchantName(g[0], g[1]) : 'Empty socket'}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (g) setPick(g[0]);
                        }}
                      >
                        {def && <Sigil id={def.id} color={ELEMENTS[def.element].color} size={26} />}
                      </button>
                    );
                  })
                : <em>none</em>}
            </span>
          </div>
          <div className="altar-purse" data-testid="ench-purse">
            <span title="Lapis lazuli in your bags">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={api.icons.url(LAPIS)} alt="Lapis lazuli" draggable={false} width={20} height={20} />
              <b className={sel && sel.price.lapis > lapis && !creative ? 'short' : ''}>{lapis}</b>
            </span>
            {!creative && (
              <span title="Your Auren">
                <CoinIcon size={16} />
                <b className={sel && sel.price.auren > coins ? 'short' : ''}>{coins.toLocaleString('en-US')}</b>
              </span>
            )}
          </div>
        </div>
      </div>

      {!item ? (
        <div className="altar-empty" data-testid="ench-warning">
          <b>Lay a piece on the altar.</b>
          <span>A weapon, a tool, armour, a shield, a ring or a book (a book becomes a Glyph Tome). Glyphs cost lapis lazuli and Auren; shelves of books around the altar give it the lore for the rarer ones.</span>
        </div>
      ) : options.length === 0 ? (
        <div className="altar-empty" data-testid="ench-warning">
          <b>Nothing can be inscribed on this.</b>
          <span>{item.count > 1 ? 'Put one piece on the altar at a time.' : 'Glyphs go on weapons, tools, armour, shields, rings, necklaces, bows, rods and books.'}</span>
        </div>
      ) : (
        <div className="altar-body">
          <div className="glyph-list" data-testid="ench-offers">
            {options.map((o) => {
              const el = ELEMENTS[o.def.element];
              return (
                <button
                  key={o.def.id}
                  data-glyph={o.def.id}
                  data-state={o.state}
                  className={`glyph-row ${o.state}${sel?.def.id === o.def.id ? ' sel' : ''}${o.have > 0 ? ' has' : ''}`}
                  style={{ '--el': el.color } as CSSProperties}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setPick(o.def.id);
                    if (e.detail >= 2) act(o);
                  }}
                >
                  <Sigil id={o.def.id} color={el.color} size={30} dim={o.state !== 'ok' && o.have === 0} />
                  <span className="g-name">
                    {o.def.name}
                    <i className="g-tier">{'◆'.repeat(o.def.tier)}</i>
                  </span>
                  <span className="g-rank">{o.have > 0 ? `${ROMAN[o.have]}${o.state === 'maxed' ? '' : ` › ${ROMAN[o.rank]}`}` : o.def.max > 1 ? `I–${ROMAN[o.def.max]}` : ''}</span>
                  <span className="g-state">{o.state === 'ok' ? '' : SHORT[o.state]}</span>
                </button>
              );
            })}
          </div>

          {sel && (
            <div className="glyph-detail" data-testid="glyph-detail" style={{ '--el': ELEMENTS[sel.def.element].color } as CSSProperties}>
              <div className="gd-head">
                <Sigil id={sel.def.id} color={ELEMENTS[sel.def.element].color} size={40} />
                <div>
                  <div className="gd-name">{sel.def.name}</div>
                  <div className="gd-sub">
                    <span className="gd-el">{ELEMENTS[sel.def.element].name}</span> · {'◆'.repeat(sel.def.tier)}
                    {sel.def.max > 1 && (
                      <span className="rank-pips" aria-label={`Rank ${sel.have} of ${sel.def.max}`}>
                        {Array.from({ length: sel.def.max }, (_, i) => (
                          <i key={i} className={i < sel.have ? 'on' : i === sel.have && sel.state !== 'maxed' ? 'next' : ''} />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="gd-text" data-testid="glyph-text">
                {sel.have > 0 && <div className="now">Now {ROMAN[sel.have] || ''}: {glyphLine(sel.def.id, sel.have, resource)}</div>}
                {sel.state !== 'maxed' && (
                  <div className="next">
                    {sel.have > 0 ? `${ROMAN[sel.rank]}: ` : sel.def.max > 1 ? 'I: ' : ''}
                    {glyphLine(sel.def.id, sel.rank, resource)}
                  </div>
                )}
              </div>
              <div className="gd-cost">
                {sel.state !== 'maxed' && (
                  <>
                    <span className={`cost-chip${!creative && lapis < sel.price.lapis ? ' short' : ''}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={api.icons.url(LAPIS)} alt="" draggable={false} width={18} height={18} />
                      {creative ? 'free' : sel.price.lapis}
                    </span>
                    <span className={`cost-chip${!creative && coins < sel.price.auren ? ' short' : ''}`}>
                      <CoinIcon size={14} />
                      {creative ? 'free' : sel.price.auren.toLocaleString('en-US')}
                    </span>
                    <span className={`cost-chip lore${!creative && menu.shelves < sel.lore ? ' short' : ''}`} title="Shelves of lore this rank needs">
                      ✦ {sel.lore}
                    </span>
                    <span className={`cost-chip chance ${sel.chance >= 80 ? 'hi' : sel.chance >= 55 ? 'mid' : 'lo'}`} title="The chance that the glyph takes. More shelves of lore than it needs raise it." data-testid="glyph-chance">
                      {sel.chance}%
                    </span>
                  </>
                )}
              </div>
              {sel.state !== 'ok' && <div className="gd-why" data-testid="ench-why">{WHY[sel.state](sel, have)}</div>}
              {sel.state === 'ok' && sel.chance < 100 && (
                <div className="gd-risk" data-testid="glyph-risk">If it fails the lapis and half the Auren are lost. The piece is safe.</div>
              )}
              <div className="gd-actions">
                <button className="inscribe" data-testid="inscribe" disabled={sel.state !== 'ok'} onMouseDown={(e) => { e.preventDefault(); act(sel); }}>
                  {sel.state === 'maxed' ? 'Maxed' : `${sel.have > 0 ? `Raise to ${ROMAN[sel.rank]}` : 'Inscribe'}${sel.chance < 100 ? ` · ${sel.chance}%` : ''}`}
                </button>
                {sel.have > 0 && (
                  <button className="erase" data-testid="erase" title="Take the glyph off the piece (free)" onMouseDown={(e) => { e.preventDefault(); api.enchant(sel.def.id, true); }}>
                    Erase
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
