'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  B,
  CLASSES,
  CLASS_IDS,
  CLASS_LEVELS,
  CREATIVE_AMOUNTS,
  CREATIVE_TABS,
  I,
  UPGRADE_MAX,
  armorId,
  creativeCount,
  creativeGear,
  creativeIndices,
  gearBases,
  getItem,
  makeStack,
  toolId,
  tooltipLines,
  type ClassId,
  type CreativeAmount,
  type CreativeMenu,
  type CreativeTab,
  type GearSpec,
  type TipLine,
} from '@solrift/shared';
import { useUi } from '../ui/store';
import { ItemView } from './ItemView';
import './creative.css';

const gearIcon = (id: number, u: number) => ({ ...makeStack(id, 1), gear: { r: 0 as const, l: 1, s: [] as [], u } });

/** The icon of each tab, an item that stands for the shelf. */
const TAB_ICONS: Record<CreativeTab, ReturnType<typeof makeStack>> = {
  all: makeStack(B.CRAFTING_TABLE, 1),
  blocks: makeStack(B.COBBLE, 1),
  tools: makeStack(toolId('pickaxe', 'iron'), 1),
  weapons: makeStack(toolId('sword', 'iron'), 1),
  armor: makeStack(armorId(1, 'iron'), 1),
  food: makeStack(I.APPLE, 1),
  jewels: makeStack(I.JEWEL_RIFT, 1),
  materials: makeStack(I.IRON_INGOT, 1),
  gear: gearIcon(toolId('sword', 'diamond'), UPGRADE_MAX),
};

const RARITY_BUTTONS: readonly { id: GearSpec['rarity']; label: string }[] = [
  { id: 0, label: 'Plain' },
  { id: 1, label: 'Uncommon' },
  { id: 2, label: 'Rare' },
  { id: 3, label: 'Epic' },
];

const nameOf = (id: number): string => getItem(id).name.replace(/_/g, ' ');

/** The stats the preview shows are rolled with the middle of each range (the real piece varies a little around them). */
const MIDDLE = (): number => 0.5;

/**
 * The creative inventory, in the style of the inventory window: the shelves hang off the left edge like the tabs of the recipe
 * book, with a search, how many a click takes and the palette of what is on the shelf. The last shelf is the gear forge: pick a
 * piece, its rarity, level, class, upgrade (+0 to +13) and Bloom attribute, and it lands on the cursor. `grid` draws palette
 * slots (the screen owns the slots).
 */
export function CreativePanel({ menu, grid, onTip }: { menu: CreativeMenu; grid: (indices: number[]) => ReactNode; onTip: (lines: TipLine[]) => void }) {
  const api = useUi((s) => s.api)!;
  const cls = useUi((s) => s.cls);
  const [tab, setTab] = useState<CreativeTab>('all');
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState<CreativeAmount>(menu.amount);
  const [sure, setSure] = useState(false);
  const [spec, setSpec] = useState<GearSpec>({ id: toolId('sword', 'diamond'), rarity: 3, level: CLASS_LEVELS.max, cls: null, plus: 9, bloom: false });

  const indices = useMemo(() => creativeIndices(tab, query).map((i) => menu.paletteStart + i), [tab, query, menu.paletteStart]);
  const bases = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return gearBases().filter((id) => words.every((w) => nameOf(id).includes(w)));
  }, [query]);

  const pickAmount = (n: CreativeAmount) => {
    setAmount(n);
    menu.setAmount(n);
    api.creativeAmount(n);
  };
  const change = (patch: Partial<GearSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const made = tab === 'gear' ? creativeGear(spec, MIDDLE) : null;
  const plain = spec.rarity === 0;
  const shelf = CREATIVE_TABS.find((t) => t.id === tab)!;
  const shown = tab === 'gear' ? bases.length : indices.length;

  return (
    <div className="creative" data-testid="creative-panel" onMouseLeave={() => onTip([])}>
      <div className="rb-tabs">
        {CREATIVE_TABS.map((t) => (
          <button key={t.id} className={`rb-tab ${tab === t.id ? 'on' : ''}`} data-tab={t.id} title={`${t.label} (${creativeCount(t.id)})`} onClick={() => setTab(t.id)}>
            <ItemView stack={TAB_ICONS[t.id]} />
          </button>
        ))}
      </div>

      <div className="wow-head rb-head">
        <span>{tab === 'all' ? 'Every Item' : shelf.label}</span>
        <em className="rb-count" data-testid="creative-count">
          {shown} {tab === 'gear' ? 'pieces' : 'items'}
        </em>
      </div>

      <div className="rb-top">
        <div className="rb-searchbox">
          <span className="rb-mag" aria-hidden />
          <input
            className="rb-search"
            data-testid="creative-search"
            placeholder="Search..."
            value={query}
            maxLength={24}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          {query !== '' && (
            <button className="rb-clear" title="Clear" aria-label="Clear the search" onClick={() => setQuery('')}>
              &times;
            </button>
          )}
        </div>
        {tab !== 'gear' &&
          CREATIVE_AMOUNTS.map((n) => (
            <button key={n} className={`rb-only cr-amount ${amount === n ? 'on' : ''}`} data-amount={n} title={`A click takes ${n}`} aria-pressed={amount === n} onClick={() => pickAmount(n)}>
              &times;{n}
            </button>
          ))}
        <button
          className={`rb-only cr-clear ${sure ? 'on sure' : ''}`}
          data-testid="creative-clear"
          title="Empty the whole inventory"
          onBlur={() => setSure(false)}
          onClick={() => {
            if (sure) api.creativeClear();
            setSure(!sure);
          }}
        >
          {sure ? 'Sure?' : 'Clear'}
        </button>
      </div>

      {tab !== 'gear' ? (
        <>
          <div className="palette" data-testid="creative-palette">
            {indices.length > 0 ? grid(indices) : <div className="cr-none">Nothing matches &ldquo;{query}&rdquo;</div>}
          </div>
          <div className="wow-foot cr-foot">
            <span>Click &times;{amount} &middot; Right-click 1 &middot; Shift-click a stack to the bag &middot; Drop a stack on the list to delete it</span>
          </div>
        </>
      ) : (
        <div className="cr-forge" data-testid="creative-forge">
          <div className="cr-bases">
            {bases.map((id) => (
              <button key={id} className={`rb-item can ${spec.id === id ? 'on' : ''}`} title={nameOf(id)} onClick={() => change({ id })}>
                <ItemView stack={makeStack(id, 1)} />
              </button>
            ))}
            {bases.length === 0 && <div className="cr-none">Nothing matches &ldquo;{query}&rdquo;</div>}
          </div>

          <div className="cr-well cr-opts">
            <div className="cr-row">
              <b>Rarity</b>
              {RARITY_BUTTONS.map((r) => (
                <button key={r.id} className={`rb-only cr-chip r${r.id} ${spec.rarity === r.id ? 'on' : ''}`} onClick={() => change({ rarity: r.id })}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="cr-row">
              <b>Level</b>
              <input type="range" min={1} max={CLASS_LEVELS.max} value={spec.level} disabled={plain} onChange={(e) => change({ level: Number(e.target.value) })} />
              <em>{plain ? '-' : spec.level}</em>
            </div>
            <div className="cr-row">
              <b>Class</b>
              <select
                value={spec.cls ?? ''}
                disabled={plain}
                onChange={(e) => change({ cls: e.target.value === '' ? null : (e.target.value as ClassId) })}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <option value="">Anyone</option>
                {CLASS_IDS.map((id) => (
                  <option key={id} value={id}>
                    {CLASSES[id].name}
                  </option>
                ))}
              </select>
              {cls && !plain && spec.cls !== cls.id && (
                <button className="rb-only cr-chip" onClick={() => change({ cls: cls.id })}>
                  Mine
                </button>
              )}
            </div>
            <div className="cr-row">
              <b>Upgrade</b>
              <input type="range" min={0} max={UPGRADE_MAX} value={spec.plus} onChange={(e) => change({ plus: Number(e.target.value) })} />
              <em className={spec.plus > 9 ? 'hi' : ''}>+{spec.plus}</em>
            </div>
            <div className="cr-row">
              <b>Bloom</b>
              <button className={`rb-only cr-chip ${spec.bloom ? 'on' : ''}`} aria-pressed={spec.bloom} onClick={() => change({ bloom: !spec.bloom })}>
                <span className="rb-check" aria-hidden />
                Extra attribute
              </button>
            </div>
          </div>

          <div className="cr-well cr-make">
            <div className="slot big" data-testid="creative-preview" onMouseEnter={() => made && onTip(tooltipLines(made, cls?.id ?? null, cls?.level ?? 0))} onMouseLeave={() => onTip([])}>
              {made && <ItemView stack={made} />}
            </div>
            <div className="cr-name">{nameOf(spec.id)}</div>
            <button className="rb-only on cr-take" data-testid="creative-take" onClick={() => api.creativeGear(spec)}>
              Take it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
