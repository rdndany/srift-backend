'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ARMOR_SLOTS,
  AnvilMenu,
  CLASSES,
  ChestMenu,
  CraftingMenu,
  CreativeMenu,
  EnchantMenu,
  FurnaceMenu,
  GrindstoneMenu,
  HOTBAR_SLOTS,
  I,
  LEVEL_NAMES,
  LAPIS,
  LEVEL_XP,
  BAG_MAX,
  BAG_SLOTS,
  PLAYER_SLOTS,
  RECIPES,
  TradeMenu,
  armorId,
  bagId,
  bagSlotsOf,
  bagTier,
  canTradeOffer,
  enchantName,
  FORGE_CHANCE,
  forgeGhostLayout,
  forgeGhostPlan,
  forgePiece,
  forgeUpgrade,
  forgeTarget,
  getItem,
  jewelKind,
  makeStack,
  plainTip,
  professionName,
  recipeLayout,
  tooltipLines,
  tooltipName,
  type ItemStack,
  type StackSpec,
  type TipLine,
} from '@solrift/shared';
import { useUi } from '../ui/store';
import { CharacterPreview } from './CharacterPreview';
import { Galactic } from './Galactic';
import { ItemView, Tip } from './ItemView';
import { AttrPoints, ClassAttributes, Spellbook } from './ClassUI';
import { CreativePanel } from './CreativePanel';
import { RecipeBookPanel, RecipeDetail } from './RecipeBookPanel';
import { CoinPurse } from './ShopUI';

type InvTab = 'inventory' | 'crafting' | 'spells';

const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);

/** A slot that is not in the game yet (necklace, rings): it takes nothing and says TBA. */
function LockedSlot({ label }: { label: string }) {
  return (
    <div className="slot locked" title={`${label}: to be announced`} data-testid="locked-slot" aria-disabled="true">
      <span>TBA</span>
    </div>
  );
}

/** How a cell of the grid takes part in the forge animation: the piece is the core, the jewels are pulled into it (dx, dy: where it is, in pixels). */
interface ForgeCell {
  core: boolean;
  dx: number;
  dy: number;
  /** How long it takes, in seconds. */
  time: number;
}

function Slot({ index, onHover, ghost, ghostCount, preview, selected, hot, forge }: { index: number; onHover: (i: number | null) => void; ghost?: number; ghostCount?: number; preview?: ItemStack; selected?: boolean; hot?: number; forge?: ForgeCell }) {
  const api = useUi((s) => s.api)!;
  const menu = useUi((s) => s.warmMenu) ?? api.menu()!;
  const slot = menu.slots[index];
  // With a jewel in hand, every item it would not work on is dimmed under a dark mask (empty slots are left alone).
  const jewelFx = useUi((s) => s.jewelFx);
  const fx = jewelFx && jewelFx.slot === index ? jewelFx : null;
  const dim = !!menu.cursor && slot.kind === 'normal' && jewelKind(menu.cursor.id) !== null && !!menu.stackAt(index) && !menu.jewelFits(index);
  const stack = menu.stackAt(index);
  const forging = !!forge && !!stack;
  const kind = stack ? jewelKind(stack.id) : null;
  // What the grid would craft sits in the result slot as a preview: it is made with the button, not taken.
  const isPreview = menu instanceof CraftingMenu && slot.kind === 'result' && !!stack && !menu.hasMade;
  return (
    <div
      className={`slot ${slot.kind}${selected ? ' selected' : ''}${dim ? ' jewel-dim' : ''}${forging ? (forge.core ? ' forge-core' : ' forge-pull') : ''}${isPreview ? ' preview' : ''}`}
      style={forging ? ({ '--dx': `${forge.dx}px`, '--dy': `${forge.dy}px`, '--ft': `${forge.time}s` } as CSSProperties) : undefined}
      data-jewel={forging && kind ? kind : undefined}
      data-slot={index}
      onMouseDown={(e) => {
        e.preventDefault();
        if (isPreview) return;
        if (e.button === 0 && e.shiftKey) api.shift(index);
        else if (e.button === 0) api.click(index, 0);
        else if (e.button === 2) api.click(index, 1);
      }}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      {ghost !== undefined && !menu.stackAt(index) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ghost" src={api.icons.url(ghost)} alt="" draggable={false} />
      )}
      {ghost !== undefined && !menu.stackAt(index) && ghostCount !== undefined && ghostCount > 1 && <span className="ghost-count">{ghostCount}</span>}
      {preview && !stack && (
        // The piece as the forge would make it: shown faded, the way a recipe's result is.
        <div className="forge-preview" data-testid="forge-preview">
          <ItemView stack={preview} />
        </div>
      )}
      {forging ? (
        <div className="forge-item">
          <ItemView stack={stack} />
        </div>
      ) : (
        <ItemView stack={stack} />
      )}
      {hot !== undefined && <em>{hot}</em>}
      {fx && (
        <>
          <span key={`f${fx.n}`} className={`jewel-flash ${fx.ok ? 'ok' : 'fail'}`} data-jewel={fx.kind} />
          <div key={`t${fx.n}`} className={`jewel-float ${fx.ok ? 'ok' : 'fail'}`} data-jewel={fx.kind} data-testid="jewel-result">
            <b>{fx.label}</b>
            {fx.detail && <i>{fx.detail}</i>}
          </div>
        </>
      )}
    </div>
  );
}

function Grid({ indices, cols, onHover, className, ghosts, ghostCounts, previews, forge }: { indices: number[]; cols: number; onHover: (i: number | null) => void; className?: string; ghosts?: number[] | null; ghostCounts?: number[] | null; previews?: (ItemStack | null)[] | null; forge?: { core: number; time: number } | null }) {
  const at = (n: number) => ({ x: n % cols, y: Math.floor(n / cols) });
  // The items are drawn into the piece (the core) or, for a recipe, into the middle of the grid.
  const rows = Math.ceil(indices.length / cols);
  const target = forge && forge.core >= 0 ? at(forge.core) : { x: (cols - 1) / 2, y: (rows - 1) / 2 };
  return (
    <div className={`slot-grid ${className ?? ''}`} style={{ gridTemplateColumns: `repeat(${cols}, 52px)` }}>
      {indices.map((i, n) => (
        <Slot
          key={i}
          index={i}
          onHover={onHover}
          ghost={ghosts?.[n] || undefined}
          ghostCount={ghostCounts?.[n]}
          preview={previews?.[n] || undefined}
          forge={forge ? { core: n === forge.core, dx: (target.x - at(n).x) * 52, dy: (target.y - at(n).y) * 52, time: forge.time } : undefined}
        />
      ))}
    </div>
  );
}

/**
 * The bags, as in World of Warcraft: a bar in the bottom right corner with the four slots the bags are worn in, and
 * above it each bag that is worn in a window of its own (its name, how full it is and its slots). They float outside
 * the inventory window, over the same screen, so items go between the backpack and the bags with the mouse.
 */
function BagHud({ onHover }: { onHover: (i: number | null) => void }) {
  const api = useUi((s) => s.api)!;
  const menu = useUi((s) => s.warmMenu) ?? api.menu()!;
  if (menu.bagStart < 0) return null;
  const worn = range(0, BAG_SLOTS).flatMap((b) => {
    const bag = api.bags.get(b);
    const n = bag ? bagSlotsOf(bag.id) : 0;
    return bag && n > 0 ? [{ b, bag, n }] : [];
  });
  return (
    <div id="bag-hud" className="wow" data-testid="bag-hud">
      <div className="bag-windows">
        {worn.map(({ b, bag, n }) => {
          const first = menu.bagStart + BAG_SLOTS + b * BAG_MAX;
          const slots = range(first, first + n);
          const used = slots.filter((i) => menu.stackAt(i)).length;
          return (
            <div key={b} className={`bag-window tier-${bagTier(bag.id)}`} data-testid="bag-window">
              <div className="bag-title">
                <span>{tooltipName(bag)}</span>
                <span className="bag-count" title="Slots used">
                  {used}/{n}
                </span>
              </div>
              <Grid indices={slots} cols={4} onHover={onHover} />
            </div>
          );
        })}
      </div>
      <div className="bag-bar" data-testid="bag-bar">
        {range(0, BAG_SLOTS).map((b) => {
          const w = worn.find((x) => x.b === b);
          const used = w ? range(0, w.n).filter((k) => menu.stackAt(menu.bagStart + BAG_SLOTS + b * BAG_MAX + k)).length : 0;
          const state = !w ? '' : used >= w.n ? ' full' : used === 0 ? ' empty' : '';
          return (
            <div key={b} className="bag-cell">
              <Slot index={menu.bagStart + b} onHover={onHover} ghost={bagId(0)} />
              {w && (
                <span className={`bag-fill${state}`} data-testid="bag-fill">
                  {used}/{w.n}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerInventory({ onHover }: { onHover: (i: number | null) => void }) {
  const api = useUi((s) => s.api)!;
  // Every window has the inventory's own heading, keeps the money in its footer (see Backpack) and leaves the hotbar where it is, on the screen (see .wow).
  return (
    <>
      <div className="wow-head">
        <span>Backpack</span>
        <button type="button" className="organize-btn" data-testid="organize" title="Merge stacks and sort the backpack and your bags" onClick={() => api.organize()}>
          Organize
        </button>
      </div>
      <Grid indices={range(HOTBAR_SLOTS, PLAYER_SLOTS)} cols={9} onHover={onHover} />
    </>
  );
}

/** Your bags under any window: the backpack and the money bar (the hotbar is the one under the window). */
function Backpack({ onHover }: { onHover: (i: number | null) => void }) {
  return (
    <>
      <PlayerInventory onHover={onHover} />
      <div className="wow-foot">
        <CoinPurse always />
      </div>
    </>
  );
}

/** A heading in the window's gold lettering. */
const Head = ({ children }: { children: ReactNode }) => (
  <div className="wow-head">
    <span>{children}</span>
  </div>
);
/** Where the arrow is when the grid holds something to craft: the button that starts it (the forge for a piece with its jewels), with the chance, and the bar of the crafting at work. */
function ForgeButton({ menu }: { menu: CraftingMenu }) {
  const api = useUi((s) => s.api)!;
  const ready = menu.forgeReady();
  const craft = menu.craftReady();
  const forging = menu.forging;
  return (
    <div className={`forge-box${forging ? ' on' : ''}`} data-testid="forge-box">
      <button
        className="forge-btn"
        data-testid="forge-button"
        disabled={!ready && !craft}
        title={craft ? 'Shift-click: as many as the items allow' : undefined}
        onMouseDown={(e) => {
          e.preventDefault();
          if (e.button === 0 && (ready || craft)) api.forge(e.shiftKey);
        }}
      >
        {forging ? (forging.sets > 0 ? 'Crafting' : 'Forging') : ready ? 'Forge' : 'Craft'}
      </button>
      <div className="forge-chance">
        <b>{ready || forging?.sets === 0 ? Math.round(FORGE_CHANCE * 100) : 100}%</b>
      </div>
      {forging && (
        <div className="forge-bar" aria-hidden>
          <i style={{ animationDuration: `${forging.duration}s` }} />
        </div>
      )}
    </div>
  );
}

/** The inventory / crafting table / furnace / chest / creative screen. */
/**
 * The trash: while a stack is held on the cursor, a place at the right of the window, level with its bottom edge, where it can be thrown away for good. Click to destroy all of
 * it, right-click to destroy one. (A click anywhere else outside the screen drops it on the ground instead.)
 */
function Trash({ stack }: { stack: ItemStack }) {
  const api = useUi((s) => s.api)!;
  return (
    <div
      id="menu-trash"
      data-testid="menu-trash"
      onMouseDown={(e) => {
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        e.stopPropagation();
        api.destroyCursor(e.button === 0);
      }}
    >
      <svg className="trash-icon" viewBox="0 0 16 16" width="44" height="44" shapeRendering="crispEdges" aria-hidden="true">
        <path d="M6 1h4v1h4v2H2V2h4z" fill="#c9b79a" />
        <path d="M3 5h10l-1 10H4z" fill="#8a7a62" />
        <path d="M3 5h10v1H3z" fill="#b6a486" />
        <path d="M6 7h1v6H6zm3 0h1v6H9z" fill="#3a3226" />
      </svg>
      <div className="trash-title">Destroy</div>
      <div className="trash-what">{stack.count > 1 ? `${stack.count} × ` : ''}{tooltipName(stack)}</div>
      <div className="trash-hint">Click: destroy it</div>
      {stack.count > 1 && <div className="trash-hint">Right-click: destroy one</div>}
    </div>
  );
}

export function MenuScreen() {
  const screen = useUi((s) => s.screen);
  useUi((s) => s.version);
  const api = useUi((s) => s.api);
  const level = useUi((s) => s.level);
  const mode = useUi((s) => s.mode);
  const selected = useUi((s) => s.selected);
  const cls = useUi((s) => s.cls);
  const invTab = useUi((s) => s.invTab);
  const [hover, setHover] = useState<number | null>(null);
  // The name of the item under the pointer in a villager's offer list.
  const [tradeTip, setTradeTip] = useState<TipLine[]>([]);
  // What was typed in the anvil's name box, and for which item (a different item starts over).
  const [typed, setTyped] = useState<{ key: string; text: string } | null>(null);
  // The recipe the pointer is on in the book: its ingredients show as ghosts in the grid.
  const [preview, setPreview] = useState<number | null>(null);
  // The recipe last clicked in the book: it stays described under the grid when the pointer is not on one.
  const [picked, setPicked] = useState<number | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const warmMenu = useUi((s) => s.warmMenu);
  const open = !!api && (!!warmMenu || (screen !== 'none' && screen !== 'dead' && !!api.menu()));

  // The tabs start over at the bags each time the screen is closed (a request for the spellbook is made before it opens).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) setTyped(null);
    if (open) wasOpen.current = true;
    else if (wasOpen.current) {
      wasOpen.current = false;
      setPicked(null);
      useUi.setState({ invTab: 'inventory' });
    }
  }, [open]);

  // The tooltip follows the pointer but never leaves the window: it flips to the left of the pointer at the right edge
  // and slides up at the bottom one.
  const mouse = useRef({ x: 0, y: 0 });
  const placeTip = () => {
    const tip = tipRef.current;
    if (!tip) return;
    const { x, y } = mouse.current;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const m = 6;
    let tx = x + 14;
    if (tx + w > window.innerWidth - m) tx = Math.max(m, x - 14 - w);
    const ty = Math.max(m, Math.min(y - 34, window.innerHeight - h - m));
    tip.style.transform = `translate(${tx}px, ${ty}px)`;
  };
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (cursorRef.current) cursorRef.current.style.transform = `translate(${e.clientX - 24}px, ${e.clientY - 24}px)`;
      placeTip();
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [open]);
  // A tooltip that changes under a still pointer (another item, a longer text) is placed again.
  useLayoutEffect(() => {
    if (open) placeTip();
  });

  if (!open || !api) return null;
  const menu = warmMenu ?? api.menu()!;
  // The piece the forge would make, previewed in the empty result slot (hovering it shows its new stats).
  const forgePreview = menu instanceof CraftingMenu && menu.forgeReady() ? forgeUpgrade(menu.grid.slots) : null;
  const shown = hover !== null ? (menu.stackAt(hover) ?? (menu instanceof CraftingMenu && hover === menu.resultSlot ? forgePreview : null)) : null;
  const tip: TipLine[] = hover !== null ? tooltipLines(shown, cls?.id ?? null, cls?.level ?? 0) : tradeTip.length ? tradeTip : preview !== null && RECIPES[preview] ? tooltipLines(makeStack(RECIPES[preview].result.id, 1)) : [];
  // A worn bag that still holds items cannot be taken off, moved or dropped until it is emptied.
  if (hover !== null && menu.isBagSlot(hover) && menu.stackAt(hover) && menu.slots[hover].canTake?.() === false) {
    tip.push({ text: 'Not empty: it cannot be removed or dropped', color: 'warn' }, { text: 'Empty the bag first', color: 'dim' });
  }
  // The ghosts in the grid: the recipe the pointer is on in the book, or, with a piece that is ready to go past +9 in it,
  // the jewels that go in the cells that are left.
  const previewStep = preview !== null ? forgeTarget(preview) : null;
  const forgeGhost =
    menu instanceof CraftingMenu && (previewStep !== null || !(preview !== null && RECIPES[preview]))
      ? previewStep !== null
        ? forgeGhostLayout(previewStep, menu.grid.size)
        : forgeGhostPlan(menu.grid.slots)
      : null;
  const ghosts =
    forgeGhost?.ids ?? (menu instanceof CraftingMenu && previewStep === null && preview !== null && RECIPES[preview] ? recipeLayout(RECIPES[preview], menu.size) : null);
  const ghostCounts = forgeGhost?.counts ?? null;

  // The forge: a piece at +9 or more with its jewels in the grid. It is started with a button and works for a while (the grid is
  // locked and the jewels are drawn into the piece) before the piece comes out in the result slot.
  const forgeReady = menu instanceof CraftingMenu ? menu.forgeReady() : null;
  const forgeAt = menu instanceof CraftingMenu ? forgePiece(menu.grid.slots) : null;
  const craftReady = menu instanceof CraftingMenu ? menu.craftReady() : null;
  const forgeCore = menu instanceof CraftingMenu && forgeAt ? menu.grid.slots.indexOf(forgeAt.piece) : -1;

  // Every window is the inventory's bronze frame; kind lets the narrower ones (everything but the crafting grid and the creative palette) size themselves.
  const wowScreen = true;
  const kind = menu instanceof CraftingMenu ? 'crafting' : menu instanceof CreativeMenu ? 'creative' : menu instanceof FurnaceMenu ? 'furnace' : menu instanceof ChestMenu ? 'chest' : menu instanceof TradeMenu ? 'trade' : menu instanceof EnchantMenu ? 'enchant' : menu instanceof AnvilMenu ? 'anvil' : 'grindstone';
  let title = 'Crafting';
  let body: ReactNode;
  // The inventory (E) has three tabs, as the windows of World of Warcraft do: the bags with the character, the crafting grid,
  // and the spellbook of a class. A crafting table has the grid alone. The hotbar stays on the screen below the window.
  const wornMenu = menu instanceof CraftingMenu && menu.armorStart >= 0;
  const tab: InvTab = !wornMenu ? 'crafting' : invTab === 'spells' && !cls ? 'inventory' : invTab;
  if (menu instanceof CraftingMenu) {
    const n = menu.size;
    title = !wornMenu ? 'Crafting Table' : tab === 'inventory' ? 'Inventory' : tab === 'crafting' ? 'Crafting' : 'Spellbook';
    const tabs: { id: InvTab; label: string }[] = [
      { id: 'inventory', label: 'Inventory' },
      { id: 'crafting', label: 'Crafting' },
      ...(cls ? [{ id: 'spells' as InvTab, label: 'Spellbook' }] : []),
    ];
    body = (
      <>
        {tab === 'inventory' && (
          <div className="inv-top">
            <div className="armor-col">
              {ARMOR_SLOTS.map((slot, i) => (
                <Slot key={slot} index={menu.armorStart + i} onHover={setHover} ghost={armorId(i, 'leather')} />
              ))}
              <LockedSlot label="Necklace" />
            </div>
            <div className="char-col">
            <div className="char-box">
              <CharacterPreview
                armor={ARMOR_SLOTS.map((_, i) => menu.armor?.get(i)?.id ?? 0)}
                shield={menu.offhand?.get(0)?.id ?? 0}
                shieldIcon={menu.offhand?.get(0) ? api.icons.url(menu.offhand.get(0)!.id) : null}
              />
              {menu.offhandSlot >= 0 && (
                <div className="off-slot" title="Off hand">
                  <Slot index={menu.offhandSlot} onHover={setHover} ghost={cls ? CLASSES[cls.id].startingOffhand : I.SHIELD} />
                </div>
              )}
              {menu.mountSlot >= 0 && (
                <div className="mount-slot-inv" title="Mount: put a horn here, then press H to ride">
                  <Slot index={menu.mountSlot} onHover={setHover} ghost={I.MOUNT_BASE} />
                </div>
              )}
              {cls && (
                <div className="char-class" data-testid="char-class">
                  {CLASSES[cls.id].name}
                </div>
              )}
              <div className="char-plate" data-testid="char-plate">
                {mode === 'creative' ? 'Creative' : `Level ${level}`}
              </div>
            </div>
            <div className="ring-row">
              <LockedSlot label="Ring" />
              <LockedSlot label="Ring" />
            </div>
            </div>
            {cls && (
              <div className="char-stats" data-testid="char-stats">
                <div className="wow-head">
                  <span>Attributes</span>
                </div>
                <ClassAttributes />
              </div>
            )}
          </div>
        )}
        {tab === 'crafting' && (
          <div className="craft-page">
            {wornMenu && (
              <div className="wow-head">
                <span>Crafting</span>
              </div>
            )}
            <div className="craft-row">
              <Grid
                indices={range(menu.gridStart, menu.gridStart + n * n)}
                cols={n}
                onHover={setHover}
                ghosts={ghosts}
                ghostCounts={ghostCounts}
                forge={menu.forging ? { core: forgeCore, time: menu.forging.duration } : null}
              />
              {forgeReady || craftReady || menu.forging ? <ForgeButton menu={menu} /> : <div className="arrow">&#10140;</div>}
              <Grid indices={[menu.resultSlot]} cols={1} onHover={setHover} className="big" previews={forgePreview ? [forgePreview] : null} />
            </div>
            <RecipeDetail menu={menu} index={preview ?? picked} />
          </div>
        )}
        {tab === 'spells' && <Spellbook />}
        {tab !== 'spells' && (
          <>
            <Backpack onHover={setHover} />
          </>
        )}
        {wornMenu && (
          <div className="wow-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`wow-tab${tab === t.id ? ' on' : ''}`}
                data-testid={`tab-${t.id}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  useUi.setState({ invTab: t.id });
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </>
    );
  } else if (menu instanceof FurnaceMenu) {
    title = 'Furnace';
    const f = api.furnaceState();
    body = (
      <>
        <Head>Smelting</Head>
        <div className="furnace-row wow-well">
          <div className="furnace-col">
            <Grid indices={[menu.inputSlot]} cols={1} onHover={setHover} />
            <div className="flame">
              <div style={{ height: `${Math.round((f?.burn ?? 0) * 100)}%` }} />
            </div>
            <Grid indices={[menu.fuelSlot]} cols={1} onHover={setHover} />
          </div>
          <div className="progress">
            <div style={{ width: `${Math.round((f?.cook ?? 0) * 100)}%` }} />
          </div>
          <Grid indices={[menu.outputSlot]} cols={1} onHover={setHover} className="big" />
        </div>
        <Backpack onHover={setHover} />
      </>
    );
  } else if (menu instanceof ChestMenu) {
    title = menu.chest.size > 27 ? 'Large Chest' : 'Chest';
    body = (
      <>
        <Head>Storage</Head>
        <Grid indices={range(menu.chestStart, menu.chestStart + menu.chest.size)} cols={9} onHover={setHover} />
        <Backpack onHover={setHover} />
      </>
    );
  } else if (menu instanceof TradeMenu) {
    const book = menu.villager;
    title = `${professionName(book.profession)} - ${LEVEL_NAMES[book.level - 1] ?? ''}`;
    const prev = book.level > 1 ? LEVEL_XP[book.level - 2] : 0;
    const next = LEVEL_XP[book.level - 1];
    const fill = next === undefined ? 1 : Math.max(0, Math.min(1, (book.xp - prev) / (next - prev)));
    const icon = (id: number) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={api.icons.url(id)} alt={getItem(id).name} draggable={false} />
    );
    const chip = (s: StackSpec | undefined) =>
      s ? (
        <span className="chip" onMouseEnter={() => setTradeTip(tooltipLines(makeStack(s[0], 1)))} onMouseLeave={() => setTradeTip([])}>
          {icon(s[0])}
          {s[1] > 1 && <b>{s[1]}</b>}
        </span>
      ) : (
        <span className="chip none" />
      );
    body = (
      <div className="trade-row">
        <div className="trade-list" data-testid="trade-list">
          <div className="trade-xp" title={`${book.xp} experience`}>
            <div style={{ width: `${Math.round(fill * 100)}%` }} />
          </div>
          {book.offers.map((o, i) => (
            <button
              key={i}
              data-offer={i}
              className={`offer ${menu.selected === i ? 'on' : ''} ${canTradeOffer(o) ? '' : 'out'}`}
              onMouseDown={(e) => {
                e.preventDefault();
                api.trade(i);
              }}
            >
              {chip(o.a)}
              {chip(o.b)}
              <span className="to">&#10140;</span>
              {chip(o.r)}
            </button>
          ))}
        </div>
        <div className="trade-side">
          <Head>Trade</Head>
          <div className="craft-row wow-well">
            <Grid indices={[menu.paymentStart, menu.paymentStart + 1]} cols={2} onHover={setHover} />
            <div className="arrow">&#10140;</div>
            <Grid indices={[menu.resultSlot]} cols={1} onHover={setHover} className="big" />
          </div>
          <div className="label">{menu.offer && !canTradeOffer(menu.offer) ? 'Out of stock - come back later' : 'Choose a trade, then take the result'}</div>
          <Backpack onHover={setHover} />
        </div>
      </div>
    );
  } else if (menu instanceof EnchantMenu) {
    title = 'Enchant';
    const lapis = menu.lapis?.count ?? 0;
    body = (
      <>
        <Head>Enchanting</Head>
        <div className="ench-row wow-well">
          <div className="ench-slots">
            <Grid indices={[menu.itemSlot]} cols={1} onHover={setHover} />
            <Grid indices={[menu.lapisSlot]} cols={1} onHover={setHover} ghosts={[LAPIS]} />
            <div className="label" data-testid="ench-shelves">
              {menu.shelves} {menu.shelves === 1 ? 'bookshelf' : 'bookshelves'}
            </div>
            {mode !== 'creative' && (
              <div className="label ench-level" data-testid="ench-level">
                Your level: {level}
              </div>
            )}
          </div>
          <div className="ench-offers" data-testid="ench-offers">
            {menu.offers.map((o, i) => {
              const need = i + 1;
              const has = o.cost > 0;
              const ok = has && (mode === 'creative' || (lapis >= need && level >= Math.max(o.cost, need)));
              return (
                <button
                  key={i}
                  data-offer={i}
                  className={`ench-offer ${has ? (ok ? 'ok' : 'no') : 'none'}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (ok) api.enchant(i);
                  }}
                  onMouseEnter={() => {
                    if (has) {
                      const free = mode === 'creative';
                      const needLevel = Math.max(o.cost, need);
                      const lines: TipLine[] = [{ text: o.clue ? `${enchantName(o.clue[0], o.clue[1])} ...?` : 'Enchantment', color: 'name' }];
                      lines.push({ text: `Needs level ${needLevel}`, color: free || level >= needLevel ? 'good' : 'warn' });
                      lines.push({ text: `Needs ${need} lapis lazuli`, color: free || lapis >= need ? 'good' : 'warn' });
                      if (!free && level < needLevel) lines.push({ text: `Not enough levels: you have ${level}`, color: 'warn' });
                      if (!free && lapis < need) lines.push({ text: `Not enough lapis: you have ${lapis}`, color: 'warn' });
                      if (!free && level >= needLevel && lapis >= need) lines.push({ text: `Click to spend ${need} level${need === 1 ? '' : 's'}`, color: 'dim' });
                      setTradeTip(lines);
                    } else {
                      setTradeTip(menu.item ? [] : plainTip('Put an item to enchant in the top slot'));
                    }
                  }}
                  onMouseLeave={() => setTradeTip([])}
                >
                  <span className="clue" data-clue={o.clue ? `${enchantName(o.clue[0], o.clue[1])} ...?` : ''}>
                    {o.clue ? <Galactic text={enchantName(o.clue[0], o.clue[1])} size={16} length={9} /> : null}
                  </span>
                  <span className="need">{has ? need : ''}</span>
                  <span className="cost">{has ? o.cost : ''}</span>
                </button>
              );
            })}
            {(() => {
              if (mode === 'creative') return null;
              const priced = menu.offers.filter((o) => o.cost > 0);
              let msg = '';
              if (!menu.item) msg = 'Put an item to enchant in the top slot.';
              else if (priced.length === 0) msg = 'This item cannot be enchanted.';
              else if (lapis < 1) msg = 'Put lapis lazuli in the second slot.';
              else if (!menu.offers.some((o, i) => o.cost > 0 && level >= Math.max(o.cost, i + 1))) msg = `Not enough levels: the cheapest offer needs level ${Math.min(...priced.map((o) => o.cost))}, you have ${level}.`;
              return msg ? <div className="ench-warning" data-testid="ench-warning">{msg}</div> : null;
            })()}
          </div>
        </div>
        <Backpack onHover={setHover} />
      </>
    );
  } else if (menu instanceof AnvilMenu) {
    title = 'Repair & Name';
    const short = menu.cost > 0 && !menu.tooExpensive && mode !== 'creative' && level < menu.cost;
    const left = menu.stackAt(menu.leftSlot);
    const key = left ? `${left.id}:${left.name ?? ''}` : '';
    const shown = typed && typed.key === key ? typed.text : (menu.name ?? left?.name ?? '');
    const note = !left
      ? 'Put an item in the first slot. Add another to repair or combine it, or just rename it.'
      : menu.tooExpensive
        ? 'Too Expensive!'
        : menu.cost > 0
          ? `Enchantment Cost: ${menu.cost}`
          : 'Add a second item to repair or combine, or type a new name.';
    body = (
      <>
        <Head>Anvil</Head>
        <input
          className="anvil-name"
          data-testid="anvil-name"
          type="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={35}
          disabled={!left}
          placeholder="Name"
          value={left ? shown : ''}
          onChange={(e) => {
            setTyped({ key, text: e.target.value });
            api.anvilName(e.target.value);
          }}
        />
        <div className="craft-row wow-well">
          <Grid indices={[menu.leftSlot, menu.rightSlot]} cols={2} onHover={setHover} />
          <div className="arrow">&#10140;</div>
          <Grid indices={[menu.resultSlot]} cols={1} onHover={setHover} className="big" />
        </div>
        <div className={`label anvil-cost ${menu.tooExpensive || short ? 'bad' : ''}`} data-testid="anvil-cost">
          {note}
        </div>
        {short && (
          <div className="ench-warning" data-testid="anvil-warning">
            Not enough levels: it costs {menu.cost}, you have {level}.
          </div>
        )}
        <Backpack onHover={setHover} />
      </>
    );
  } else if (menu instanceof GrindstoneMenu) {
    title = 'Repair & Disenchant';
    const has = !!menu.input.get(0) || !!menu.input.get(1);
    body = (
      <>
        <Head>Grindstone</Head>
        <div className="craft-row wow-well">
          <Grid indices={[menu.topSlot, menu.bottomSlot]} cols={1} onHover={setHover} />
          <div className="arrow">&#10140;</div>
          <Grid indices={[menu.resultSlot]} cols={1} onHover={setHover} className="big" />
        </div>
        <div className="label" data-testid="grind-note">
          {menu.xp > 0
            ? `Experience: ${menu.xp}`
            : has
              ? 'Nothing to take off. Put in an enchanted item, or two of the same worn item.'
              : 'Put an enchanted item in to take its enchantments off for experience.'}
        </div>
        <Backpack onHover={setHover} />
      </>
    );
  } else if (menu instanceof CreativeMenu) {
    title = 'Creative Inventory';
    body = (
      <CreativePanel
        menu={menu}
        grid={(indices) => <Grid indices={indices} cols={9} onHover={setHover} />}
        onTip={setTradeTip}
      />
    );
  }

  // The stat points are a column of the Inventory tab, inside the same frame.
  const withPoints = wornMenu && tab === 'inventory' && !!cls && mode !== 'creative';

  return (
    <div
      id="menu-screen"
      className={warmMenu ? 'ui-warm' : undefined}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        // A click beside the screen with something on the cursor puts it on the ground (left: all of it, right: one).
        if (menu.cursor && (e.button === 0 || e.button === 2) && !(e.target as HTMLElement).closest('.menu-wrap, #menu-hotbar, #bag-hud, #menu-trash')) {
          e.preventDefault();
          api.dropCursor(e.button === 0);
        }
      }}
    >
      <div className="menu-wrap">
        <div className={`panel ${menu instanceof CraftingMenu && tab === 'crafting' ? 'with-recipes' : ''} ${withPoints ? 'with-points' : ''} ${wowScreen ? 'wow' : ''} menu-${kind}`}>
          <div className="title">{title}</div>
          {wowScreen && (
            <button className="wow-close" data-testid="menu-close" aria-label="Close" onMouseDown={(e) => { e.preventDefault(); api.close(); }}>
              &times;
            </button>
          )}
          {body}
          {withPoints && <AttrPoints />}
          {menu instanceof CraftingMenu && tab === 'crafting' && <RecipeBookPanel menu={menu} onPreview={setPreview} onPick={setPicked} />}
        </div>
        {menu.cursor && <Trash stack={menu.cursor} />}
      </div>
      {wowScreen && (
        <div id="menu-hotbar" className="wow" data-testid="menu-hotbar">
          {range(0, HOTBAR_SLOTS).map((i) => (
            <Slot key={i} index={i} onHover={setHover} selected={i === selected} hot={i + 1} />
          ))}
        </div>
      )}
      <BagHud onHover={setHover} />
      <div ref={tipRef} className="tooltip" style={{ display: tip.length ? 'block' : 'none' }}>
        <Tip lines={tip} />
      </div>
      <div ref={cursorRef} className="cursor-item">
        <ItemView stack={menu.cursor} />
      </div>
    </div>
  );
}
