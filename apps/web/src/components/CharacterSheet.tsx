'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ACHIEVEMENTS, ACH_CATEGORIES, ACH_TIERS, CLASSES, MAX_LEVEL, STASH_SLOTS, STASHKEEPER, NPCS, briefOfSheet, getItem, tooltipLines, type AchCategory, type CharacterSheet as Sheet, type CharacterBrief, type ItemStack, type StashView, type TipLine } from '@solrift/shared';
import { lobbyIcons } from '../game/lobbyIcons';
import { useToken } from '../token/store';
import { Tip } from './ItemView';
import { timeAgo } from './modes';
import './sheet.css';

/** An item as the game draws it: a cube for a block, the sprite for anything else. */
export function ItemPicture({ id }: { id: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 48, 48);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lobbyIcons().canvas(id), 0, 0);
  }, [id]);
  return <canvas ref={ref} width={48} height={48} className="cs-icon" aria-hidden />;
}

type Show = (e: React.MouseEvent, lines: TipLine[]) => void;
/** Who looks (for the tooltips: what the class can wear) and what is being looked for (empty: nothing). */
type Viewer = { cls: Sheet['cls']; find: string };

/** The name of an item as it reads on the page. */
const nameOf = (id: number): string => getItem(id).name.replace(/_/g, ' ');
/** Does a stack answer the words typed in the search box? */
const matches = (s: ItemStack, find: string): boolean => nameOf(s.id).toLowerCase().includes(find) || (s.name ?? '').toLowerCase().includes(find);

/** One item slot: the sprite, the rarity ring, the count and the wear bar. Hovering shows the same tooltip the game does. */
function Cell({ stack, label, show, hide, viewer }: { stack: ItemStack | null; label?: string; show: Show; hide: () => void; viewer: Viewer }) {
  const item = stack ? getItem(stack.id) : null;
  const left = stack && item && item.durability > 0 ? 1 - stack.damage / item.durability : 1;
  return (
    <div className={`cs-slot ${stack ? 'full' : ''}${viewer.find && stack ? (matches(stack, viewer.find) ? ' hit' : ' dim') : ''}`} data-item={stack?.id ?? ''} aria-label={stack ? `${item!.name.replace(/_/g, ' ')}${stack.count > 1 ? ` x${stack.count}` : ''}` : label ? `${label}: empty` : 'Empty slot'} onMouseEnter={(e) => stack && show(e, tooltipLines(stack, viewer.cls?.id ?? null, viewer.cls?.level ?? 0))} onMouseMove={(e) => stack && show(e, tooltipLines(stack, viewer.cls?.id ?? null, viewer.cls?.level ?? 0))} onMouseLeave={hide}>
      {stack ? (
        <>
          <ItemPicture id={stack.id} />
          {stack.gear && stack.gear.r > 0 && <div className={`rarity-ring r${stack.gear.r}`} />}
          {!!stack.gear?.u && <span className="cs-plus">+{stack.gear.u}</span>}
          {stack.count > 1 && <span className="cs-count">{stack.count}</span>}
          {item!.durability > 0 && stack.damage > 0 && (
            <div className="cs-dur">
              <div style={{ width: `${Math.max(0, left) * 100}%`, background: `hsl(${Math.max(0, left) * 120} 85% 48%)` }} />
            </div>
          )}
        </>
      ) : label ? (
        <em>{label}</em>
      ) : null}
    </div>
  );
}

function Bar({ id, label, value, max, text, tone, glow }: { id: string; label: string; value: number; max: number; text: string; tone: string; glow: string }) {
  return (
    <div className="cs-bar" data-bar={id}>
      <span>{label}</span>
      <i>
        <b style={{ width: `${max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0}%`, background: tone, boxShadow: `0 0 10px ${glow}` }} />
      </i>
      <em>{text}</em>
    </div>
  );
}

const ARMOR_LABELS = ['Head', 'Chest', 'Legs', 'Feet'];
const filled = (slots: (ItemStack | null)[]): number => slots.reduce((n, s) => n + (s ? 1 : 0), 0);
const stashkeeper = NPCS.find((n) => n.id === STASHKEEPER)?.name ?? 'the Stashkeeper';

type Tab = 'carried' | 'ach' | 'stash';

/**
 * The achievements of the character on the page, by category: the ones won are ticked, the others show how far along they are.
 * It is the list the game shows (L, then Achievements), read from the character's save. With a token live on the server each
 * tier also says what it pays.
 */
function AchievementsTab({ ach }: { ach: Sheet['ach'] }) {
  const done = useMemo(() => new Set(ach.done), [ach]);
  const pays = useToken((s) => (s.info?.live ? s.info.tiers : null));
  const loadInfo = useToken((s) => s.loadInfo);
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);
  const won = ACHIEVEMENTS.filter((a) => done.has(a.id)).length;
  return (
    <div className="cs-tab" role="tabpanel" id="cs-achtab" data-testid="cs-ach">
      <p className="cs-note cs-ach-total" id="cs-ach-total">
        <b>{won}</b> of {ACHIEVEMENTS.length} won
      </p>
      {(Object.keys(ACH_CATEGORIES) as AchCategory[]).map((cat) => {
        const list = ACHIEVEMENTS.filter((a) => a.category === cat);
        return (
          <Section key={cat} title={ACH_CATEGORIES[cat].name} note={`${list.filter((a) => done.has(a.id)).length}/${list.length}`}>
            <ul className="cs-ach-list">
              {list.map((a) => {
                const isWon = done.has(a.id);
                const now = Math.min(a.goal, Math.floor(ach.stats[a.stat] ?? 0));
                return (
                  <li key={a.id} className={`cs-ach ${a.tier}${isWon ? ' won' : ''}`} data-ach={a.id} data-won={isWon ? '1' : '0'}>
                    <span className="cs-ach-mark" aria-hidden="true">
                      {isWon ? '\u2713' : ''}
                    </span>
                    <div className="cs-ach-body">
                      <b>{a.name}</b>
                      <span>{a.text}</span>
                      {!isWon && (
                        <i className="cs-ach-bar" aria-label={`${now} of ${a.goal}`}>
                          <u style={{ width: `${(now / a.goal) * 100}%` }} />
                          <em>
                            {now.toLocaleString()}/{a.goal.toLocaleString()}
                          </em>
                        </i>
                      )}
                    </div>
                    <small className="cs-ach-tier">
                      {ACH_TIERS[a.tier].name}
                      {pays ? ` +${pays[a.tier].toLocaleString()}` : ''}
                    </small>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}

/** A titled part of a tab, with what it holds written at the right. */
function Section({ title, note, id, children }: { title: string; note?: string; id?: string; children: React.ReactNode }) {
  return (
    <section className="cs-sec" id={id}>
      <h4>
        {title}
        {note && <small>{note}</small>}
      </h4>
      {children}
    </section>
  );
}

/**
 * The lobby's character sheet: level, experience, health and food, then two tabs for what the character owns. "Carried" is what is
 * worn, the backpack with its hotbar and the bags, from the character's saved record. "Stash" is the wallet's Stash in Dawnwatch,
 * which every character of the wallet shares (read only here: it is moved at the Stashkeeper). `sheet` is undefined while it is
 * being read, null when there is none. `stash` is undefined while it is being read, null when it cannot be (not shown without
 * `showStash`: single player has no Stash).
 */
export function CharacterSheet({ sheet, source, empty, stash, showStash, briefs = [], characters = [], selfId = null }: { sheet: Sheet | null | undefined; source: string; empty: string; stash?: StashView | null; showStash?: boolean; briefs?: CharacterBrief[]; characters?: { id: string; displayName: string }[]; selfId?: string | null }) {
  const [query, setQuery] = useState('');
  const [sorted, setSorted] = useState(false);
  const find = query.trim().toLowerCase();
  const findRef = useRef<HTMLInputElement>(null);
  // "/" jumps to the search box, as on most sites (Escape in it clears it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || !findRef.current) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      findRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [tip, setTip] = useState<{ x: number; y: number; lines: TipLine[] } | null>(null);
  const [tab, setTab] = useState<Tab>('carried');
  const show: Show = (e, lines) => setTip({ x: e.clientX, y: e.clientY, lines });
  const hide = () => setTip(null);
  const stashUsed = useMemo(() => (stash ? filled(stash.slots) : 0), [stash]);
  const tabs: Tab[] = showStash ? ['carried', 'ach', 'stash'] : ['carried', 'ach'];
  const current: Tab = tabs.includes(tab) ? tab : 'carried';

  if (sheet === undefined) {
    return (
      <div className="cs" id="char-sheet" data-state="loading">
        <p className="cs-note">Reading the character...</p>
      </div>
    );
  }
  if (sheet === null) {
    return (
      <div className="cs" id="char-sheet" data-state="empty">
        <p className="cs-note">{empty}</p>
        {showStash && <StashPanel stash={stash} used={stashUsed} sorted={sorted} onSort={setSorted} show={show} hide={hide} viewer={{ cls: null, find }} />}
        {tip && tip.lines.length > 0 && createPortal(<div className="tooltip" style={tipAt(tip)}><Tip lines={tip.lines} /></div>, document.body)}
      </div>
    );
  }

  const viewer: Viewer = { cls: sheet.cls, find };
  const color = sheet.cls ? CLASSES[sheet.cls.id].color : '#8a5cf5';
  const bagItems = sheet.bags.filter((b) => b.bag);
  const worn = filled(sheet.armor) + (sheet.offhand ? 1 : 0) + (sheet.mount ? 1 : 0) + (sheet.outfit ? 1 : 0) + (sheet.companion ? 1 : 0) + (sheet.wings ? 1 : 0) + filled(sheet.rings) + (sheet.necklace ? 1 : 0);
  const packSlots = sheet.hotbar.length + sheet.backpack.length;
  const packUsed = filled(sheet.hotbar) + filled(sheet.backpack);

  const finder = (
    <div className="cs-find" title={source}>
      <svg className="cs-find-ico" viewBox="0 0 12 12" width="14" height="14" shapeRendering="crispEdges" aria-hidden="true">
        <path d="M2 0h4v1h1v1h1v4H7v1H6v1H2V7H1V6H0V2h1V1h1zM3 2h2v1h1v2H5v1H3V5H2V3h1z" fillRule="evenodd" />
        <path d="M7 7h2v2H7zM8 8h2v2H8zM9 9h2v2H9z" />
      </svg>
      <input
        ref={findRef}
        id="cs-find"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && query) {
            e.stopPropagation();
            setQuery('');
          }
        }}
        placeholder="Find an item"
        aria-label="Find an item here, in the Stash and on your other characters"
        spellCheck={false}
        autoComplete="off"
        maxLength={30}
      />
      {query ? (
        <button type="button" aria-label="Clear the search" onClick={() => (setQuery(''), findRef.current?.focus())}>
          &times;
        </button>
      ) : (
        <kbd aria-hidden="true">/</kbd>
      )}
    </div>
  );

  return (
    <div className="cs" id="char-sheet" data-state="ready" style={{ '--c': color } as CSSProperties} onMouseLeave={hide}>
      {!showStash && <p className="cs-source">{source}</p>}

      <div className="cs-head">
        <div className="cs-level" data-level={sheet.level} title={sheet.cls ? 'Class level' : 'Experience level'}>
          <small>Level</small>
          <b>{sheet.level}</b>
        </div>
        <div className="cs-bars">
          {sheet.cls && <Bar id="class-xp" label={`${CLASSES[sheet.cls.id].name} XP`} value={sheet.cls.next === 0 ? 1 : sheet.cls.xp} max={sheet.cls.next === 0 ? 1 : sheet.cls.next} text={sheet.cls.next === 0 ? 'Max' : `${sheet.cls.xp} / ${sheet.cls.next}`} tone={`linear-gradient(90deg, color-mix(in srgb, ${color} 55%, #000), ${color})`} glow={`color-mix(in srgb, ${color} 70%, transparent)`} />}
          <Bar id="xp" label={`Experience ${sheet.xp.level}`} value={sheet.xp.level >= MAX_LEVEL ? 1 : sheet.xp.points} max={sheet.xp.level >= MAX_LEVEL ? 1 : sheet.xp.next} text={sheet.xp.level >= MAX_LEVEL ? 'Max' : `${sheet.xp.points} / ${sheet.xp.next}`} tone={sheet.xp.level >= MAX_LEVEL ? 'linear-gradient(90deg, #6a6a6a, #cfcfcf)' : 'linear-gradient(90deg, #2f8f2f, #7bff3a)'} glow={sheet.xp.level >= MAX_LEVEL ? 'rgba(210, 210, 210, 0.5)' : 'rgba(123, 255, 58, 0.6)'} />
          <Bar id="health" label="Health" value={sheet.health} max={sheet.maxHealth} text={`${sheet.health} / ${sheet.maxHealth}`} tone="linear-gradient(90deg, #8f1b1b, #ff4a4a)" glow="rgba(255, 74, 74, 0.6)" />
          <Bar id="food" label="Food" value={sheet.hunger} max={sheet.maxHunger} text={`${sheet.hunger} / ${sheet.maxHunger}`} tone="linear-gradient(90deg, #a35a14, #ffb04a)" glow="rgba(255, 176, 74, 0.6)" />
        </div>
      </div>

      {(sheet.gameOver || sheet.hardcore) && <p className="cs-warn">{sheet.gameOver ? 'Hardcore: this character has died.' : 'Hardcore: one life.'}</p>}

      <div className="cs-controls">
        <div className="cs-tabs" role="tablist" aria-label="Character" onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const to = tabs[(tabs.indexOf(current) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setTab(to); e.preventDefault(); (e.currentTarget.querySelector(`#cs-tab-${to}`) as HTMLElement | null)?.focus(); } }}>
          <button type="button" role="tab" id="cs-tab-carried" aria-selected={current === 'carried'} tabIndex={current === 'carried' ? 0 : -1} onClick={() => setTab('carried')}>
            <svg viewBox="0 0 12 12" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true">
              <path d="M4 0h4v1h1v1h1v1h1v8H1V3h1V2h1V1h1z" />
              <path d="M1 5h10v1H1zM4 7h4v3H4z" fill="rgba(0,0,0,0.42)" />
            </svg>
            <span>Carried</span>
            <b>{sheet.itemCount}</b>
          </button>
          <button type="button" role="tab" id="cs-tab-ach" aria-selected={current === 'ach'} tabIndex={current === 'ach' ? 0 : -1} onClick={() => setTab('ach')} title="The deeds this character has done">
            <svg viewBox="0 0 12 12" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true">
              <path d="M2 1h8v1h1v2h-1v1H9v1H8v1H7v1h1v1h1v1H3v-1h1V8h1V7H4V6H3V5H2V4H1V2h1z" />
              <path d="M4 2h4v2H7v1H5V4H4z" fill="rgba(0,0,0,0.42)" />
            </svg>
            <span>Achievements</span>
            <b>{sheet.ach.done.length}/{ACHIEVEMENTS.length}</b>
          </button>
          {showStash && (
            <button type="button" role="tab" id="cs-tab-stash" aria-selected={current === 'stash'} tabIndex={current === 'stash' ? 0 : -1} onClick={() => setTab('stash')} title="Shared by all the characters of this wallet">
              <svg viewBox="0 0 12 12" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true">
                <path d="M2 2h8v1h1v3H1V3h1z" />
                <path d="M1 7h10v4H1z" />
                <path d="M5 5h2v3H5z" fillOpacity="0.4" />
              </svg>
              <span>Stash</span>
              <b>{stash ? `${stashUsed}/${stash.slots.length || STASH_SLOTS}` : '-'}</b>
            </button>
          )}
        </div>
        {finder}
      </div>
      {find.length >= 2 && <Whereabouts find={find} sheet={sheet} stash={stash} briefs={briefs} selfId={selfId} characters={characters} />}

      {current === 'carried' ? (
        <div className="cs-tab" role="tabpanel" id="cs-carried">
          <Section title="Worn" note={`${worn} of ${sheet.armor.length + 5 + sheet.rings.length + 1}`} id="cs-equipment">
            <div className="cs-row">
              {sheet.armor.map((s, i) => (
                <Cell key={i} stack={s} label={ARMOR_LABELS[i]} show={show} hide={hide} viewer={viewer} />
              ))}
              <span className="cs-gap" aria-hidden="true" />
              <Cell stack={sheet.offhand} label="Off hand" show={show} hide={hide} viewer={viewer} />
              <Cell stack={sheet.mount} label="Mount" show={show} hide={hide} viewer={viewer} />
              <Cell stack={sheet.outfit} label="Outfit" show={show} hide={hide} viewer={viewer} />
              <Cell stack={sheet.companion} label="Companion" show={show} hide={hide} viewer={viewer} />
              <Cell stack={sheet.wings} label="Wings" show={show} hide={hide} viewer={viewer} />
            </div>
            <div className="cs-row">
              {sheet.rings.map((s, i) => (
                <Cell key={i} stack={s} label="Ring" show={show} hide={hide} viewer={viewer} />
              ))}
              <span className="cs-gap" aria-hidden="true" />
              <Cell stack={sheet.necklace} label="Necklace" show={show} hide={hide} viewer={viewer} />
            </div>
          </Section>

          <Section title="Backpack" note={`${packUsed} of ${packSlots} slots`} id="cs-pack">
            <div className="cs-grid" id="cs-backpack">
              {sheet.backpack.map((s, i) => (
                <Cell key={i} stack={s} show={show} hide={hide} viewer={viewer} />
              ))}
            </div>
            <div className="cs-hotbar-tag" aria-hidden="true">
              <span>Hotbar</span>
            </div>
            <div className="cs-grid" id="cs-hotbar">
              {sheet.hotbar.map((s, i) => (
                <Cell key={i} stack={s} show={show} hide={hide} viewer={viewer} />
              ))}
            </div>
          </Section>

          {bagItems.length > 0 && (
            <Section title="Bags" note={`${bagItems.length}`}>
              {bagItems.map((b, i) => (
                <div className="cs-bag" key={i} data-bag={i}>
                  <Cell stack={b.bag} show={show} hide={hide} viewer={viewer} />
                  <div className="cs-grid">
                    {b.items.map((s, k) => (
                      <Cell key={k} stack={s} show={show} hide={hide} viewer={viewer} />
                    ))}
                  </div>
                </div>
              ))}
            </Section>
          )}

          <p className="cs-where">
            {sheet.savedAt !== null ? `Saved ${timeAgo(sheet.savedAt)} \u00B7 ` : ''}at {sheet.position.x}, {sheet.position.y}, {sheet.position.z}
          </p>
        </div>
      ) : current === 'ach' ? (
        <AchievementsTab ach={sheet.ach} />
      ) : (
        <div className="cs-tab" role="tabpanel" id="cs-stashtab">
          <StashPanel stash={stash} used={stashUsed} sorted={sorted} onSort={setSorted} show={show} hide={hide} viewer={viewer} />
        </div>
      )}

      {tip && tip.lines.length > 0 && createPortal(<div className="tooltip" style={tipAt(tip)}><Tip lines={tip.lines} /></div>, document.body)}
    </div>
  );
}

const tipAt = (tip: { x: number; y: number }): CSSProperties => ({ left: Math.min(tip.x + 16, window.innerWidth - 360), top: Math.min(tip.y + 16, window.innerHeight - 40) });

/** The wallet's Stash as a grid of its slots, and who it is shared with. */
function StashPanel({ stash, used, sorted, onSort, show, hide, viewer }: { stash: StashView | null | undefined; used: number; sorted: boolean; onSort: (on: boolean) => void; show: Show; hide: () => void; viewer: Viewer }) {
  if (stash === undefined) return <p className="cs-note">Reading the Stash...</p>;
  if (stash === null) return <p className="cs-note">The Stash could not be read just now.</p>;
  return (
    <Section title="Shared Stash" note={`${used} of ${stash.slots.length || STASH_SLOTS} slots`} id="cs-stash">
      <div className="cs-stashbar">
        <p className="cs-note">Shared by every character of your wallet, and by no one else. Move items in and out at {stashkeeper} in Dawnwatch.</p>
        <button type="button" id="cs-sort" aria-pressed={sorted} onClick={() => onSort(!sorted)} title="Only how it is shown here: in the game the slots stay where you put them">
          A-Z
        </button>
      </div>
      <div className="cs-grid" id="cs-stash-grid">
        {(sorted ? sortedSlots(stash.slots) : stash.slots).map((s, i) => (
          <Cell key={i} stack={s} show={show} hide={hide} viewer={viewer} />
        ))}
      </div>
      {used === 0 && <p className="cs-note cs-empty">Nothing stored yet.</p>}
    </Section>
  );
}

/** The slots with the things first, by name, then the empty ones: how the Stash reads when it is sorted (the stored order is not touched). */
function sortedSlots(slots: (ItemStack | null)[]): (ItemStack | null)[] {
  const things = slots.filter((s): s is ItemStack => s !== null).sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)) || b.count - a.count);
  return [...things, ...slots.filter((s) => s === null)];
}

/** Where what was typed in the search box is: carried here, in the Stash, or carried by another character of the wallet. */
function Whereabouts({ find, sheet, stash, briefs, selfId, characters }: { find: string; sheet: Sheet; stash?: StashView | null; briefs: CharacterBrief[]; selfId: string | null; characters: { id: string; displayName: string }[] }) {
  const rows = useMemo(() => {
    const here = new Map(briefOfSheet('here', sheet).holds);
    const kept = new Map<number, number>();
    for (const s of stash?.slots ?? []) if (s) kept.set(s.id, (kept.get(s.id) ?? 0) + s.count);
    const others = briefs.filter((b) => b.id !== selfId);
    const ids = new Set<number>();
    for (const id of [...here.keys(), ...kept.keys(), ...others.flatMap((o) => o.holds.map((h) => h[0]))]) if (nameOf(id).toLowerCase().includes(find)) ids.add(id);
    return [...ids]
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
      .map((id) => {
        const parts: string[] = [];
        if (here.get(id)) parts.push(`${here.get(id)} carried`);
        if (kept.get(id)) parts.push(`${kept.get(id)} in the Stash`);
        for (const o of others) {
          const n = o.holds.find((h) => h[0] === id)?.[1];
          if (n) parts.push(`${n} on ${characters.find((c) => c.id === o.id)?.displayName ?? 'another character'}`);
        }
        return { id, name: nameOf(id), parts };
      });
  }, [find, sheet, stash, briefs, selfId, characters]);
  return (
    <ul className="cs-where-list" id="cs-found" aria-live="polite">
      {rows.length === 0 && <li className="none">Nothing like &ldquo;{find}&rdquo; was found.</li>}
      {rows.slice(0, 6).map((r) => (
        <li key={r.id} data-item={r.id}>
          <b>{r.name}</b>
          <span>{r.parts.join(' \u00B7 ')}</span>
        </li>
      ))}
      {rows.length > 6 && <li className="none">and {rows.length - 6} more kinds</li>}
    </ul>
  );
}