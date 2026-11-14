'use client';

import { useEffect, useState } from 'react';
import {
  B,
  I,
  FORGE_CHANCE,
  FORGE_TARGETS,
  RECIPES,
  canCraftWith,
  canForge,
  canRollGear,
  forgeIndex,
  forgeTarget,
  armorId,
  getItem,
  makeStack,
  recipeCategory,
  recipeNeeds,
  toolId,
  type CraftingMenu,
  type RecipeCategory,
} from '@solrift/shared';
import { useUi } from '../ui/store';
import { ItemView } from './ItemView';

const nameOf = (id: number): string => getItem(id).name.replace(/_/g, ' ');

/** Five columns by six rows. */
const PAGE_SIZE = 30;

/** The tabs down the left edge of the book, each with an item for an icon. */
const TABS: readonly { id: RecipeCategory | 'all' | 'forge'; label: string; icon: number }[] = [
  { id: 'all', label: 'All', icon: B.CRAFTING_TABLE },
  { id: 'tools', label: 'Tools', icon: toolId('pickaxe', 'iron') },
  { id: 'building', label: 'Building', icon: B.COBBLE },
  { id: 'armor', label: 'Armor', icon: armorId(1, 'iron') },
  { id: 'food', label: 'Food', icon: I.APPLE },
  { id: 'misc', label: 'Misc', icon: I.BUCKET },
  // The steps past +9 (a piece with Jewels of the Rift and of Dawn).
  { id: 'forge', label: 'Upgrades', icon: I.JEWEL_RIFT },
];

/** The icon of a step past +9: a jewel with the level on it. */
const forgeIcon = (step: number) => ({ ...makeStack(I.JEWEL_RIFT, 1), gear: { r: 0 as const, l: 1, s: [] as [], u: step } });
/** What the piece for a step looks like: a sword at the level below, to show the number. */
const pieceIcon = (step: number) => ({ ...makeStack(toolId('sword', 'iron'), 1), gear: { r: 0 as const, l: 1, s: [] as [], u: step - 1 } });

/**
 * The recipe book beside the crafting grid. It lists the recipes you have earned (all of them in creative) five to a
 * row, the ones you can make first. Pointing at one shows its ingredients as ghosts in the grid and, in the strip
 * under the list, what it needs and how much of that you have; a click lays them out for real, and shift-click fills as
 * many crafts as you have the items for. A gold mark on a tab says there is something to make under it.
 */
export function RecipeBookPanel({ menu, onPreview }: { menu: CraftingMenu; onPreview: (index: number | null) => void }) {
  const api = useUi((s) => s.api)!;
  useUi((s) => s.version);
  const [tab, setTab] = useState<RecipeCategory | 'all' | 'forge'>('all');
  const [query, setQuery] = useState('');
  const [craftableOnly, setCraftableOnly] = useState(false);
  const [page, setPage] = useState(0);
  // The recipe the pointer is on (the strip under the list describes it).
  const [focus, setFocus] = useState<number | null>(null);

  // Leaving the book (closing the screen, hiding it) must not leave a ghost layout behind.
  useEffect(() => () => onPreview(null), [onPreview]);

  const have = (id: number): number => api.inventory.countOf(id) + menu.grid.countOf(id);
  /** How many pieces at exactly this level the player has (bags and grid). */
  const pieces = (level: number): number =>
    [api.inventory, menu.grid].reduce((n, c) => n + c.slots.filter((s) => !!s && canRollGear(s.id) && s.count === 1 && (s.gear?.u ?? 0) === level).length, 0);
  const unlocked = api.recipeBook.list(menu.size, api.recipesAll());
  const q = query.trim().toLowerCase();

  interface Row {
    index: number;
    /** The recipe, or null for a step past +9. */
    recipe: (typeof RECIPES)[number] | null;
    step: number | null;
    can: boolean;
    cat: RecipeCategory | 'forge';
  }
  const recipes: Row[] = unlocked.map((index) => ({ index, recipe: RECIPES[index], step: null, can: canCraftWith(RECIPES[index], have), cat: recipeCategory(RECIPES[index]) }));
  // The steps past +9 are always in the book (the ones that fit the grid).
  const steps: Row[] = FORGE_TARGETS.map((step) => ({ index: forgeIndex(step), recipe: null, step, can: canForge(step, [api.inventory, menu.grid]), cat: 'forge' as const }));
  const known = [...recipes, ...steps];
  const craftable = known.filter((r) => r.can).length;
  // Which tabs have something to make right now.
  const ready = new Set<RecipeCategory | 'all' | 'forge'>(known.filter((r) => r.can).flatMap((r) => ['all' as const, r.cat]));

  const rows = known
    .filter(({ recipe, step, can, cat }) => {
      if (tab !== 'all' && cat !== tab) return false;
      if (craftableOnly && !can) return false;
      return q === '' || (recipe ? nameOf(recipe.result.id) : `+${step} upgrade jewel of the rift dawn`).includes(q);
    })
    // What you can make now comes first; the rest keep their order.
    .sort((a, b) => Number(b.can) - Number(a.can));

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const change = (fn: () => void) => {
    fn();
    setPage(0);
    setFocus(null);
    onPreview(null);
  };
  const point = (index: number | null) => {
    setFocus(index);
    onPreview(index);
  };

  const step = focus !== null ? forgeTarget(focus) : null;
  const detail = focus !== null && step === null ? RECIPES[focus] : null;
  const needs = detail ? [...recipeNeeds(detail)] : [];
  const lacking = needs.filter(([id, n]) => have(id) < n);

  return (
    <div className="recipe-book" data-testid="recipe-book" onMouseLeave={() => point(null)}>
      <div className="rb-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`rb-tab ${tab === t.id ? 'on' : ''}`}
            data-tab={t.id}
            title={t.label}
            onClick={() => change(() => setTab(t.id))}
          >
            <ItemView stack={makeStack(t.icon, 1)} />
            {ready.has(t.id) && <i className="rb-dot" aria-hidden />}
          </button>
        ))}
      </div>

      <div className="wow-head rb-head">
        <span>{tab === 'all' ? 'Recipe Book' : TABS.find((t) => t.id === tab)!.label}</span>
        <em className="rb-count" data-testid="rb-count" title="Recipes you can make now / recipes you know">
          {craftable} / {known.length}
        </em>
      </div>

      <div className="rb-top">
        <div className="rb-searchbox">
          <span className="rb-mag" aria-hidden />
          <input
            className="rb-search"
            placeholder="Search..."
            value={query}
            maxLength={24}
            onChange={(e) => change(() => setQuery(e.target.value))}
            onKeyDown={(e) => e.stopPropagation()}
          />
          {query !== '' && (
            <button className="rb-clear" title="Clear" aria-label="Clear the search" onClick={() => change(() => setQuery(''))}>
              &times;
            </button>
          )}
        </div>
        <button
          className={`rb-only ${craftableOnly ? 'on' : ''}`}
          data-testid="rb-only"
          aria-pressed={craftableOnly}
          title={craftableOnly ? 'Showing what you can make' : 'Showing everything you know'}
          onClick={() => change(() => setCraftableOnly((v) => !v))}
        >
          <span className="rb-check" aria-hidden />
          Can make
        </button>
      </div>

      <div className="rb-grid">
        {visible.map(({ index, recipe, step: forge, can }) =>
          recipe ? (
          <div
            key={index}
            className={`rb-item ${can ? 'can' : 'cannot'}`}
            data-recipe={index}
            data-name={nameOf(recipe.result.id)}
            onMouseEnter={() => point(index)}
            onMouseLeave={() => point(null)}
            onMouseDown={(e) => {
              e.preventDefault();
              if (e.button === 0 && can) api.fillRecipe(index, e.shiftKey);
            }}
          >
            <ItemView stack={makeStack(recipe.result.id, recipe.result.count)} />
          </div>
          ) : (
            <div
              key={index}
              className={`rb-item forge ${can ? 'can' : 'cannot'}`}
              data-recipe={index}
              data-name={`+${forge} upgrade`}
              onMouseEnter={() => point(index)}
              onMouseLeave={() => point(null)}
              onMouseDown={(e) => {
                e.preventDefault();
                if (e.button === 0 && can) api.fillRecipe(index, false);
              }}
            >
              <ItemView stack={forgeIcon(forge!)} />
            </div>
          ),
        )}
        {rows.length === 0 && (
          <div className="rb-empty">{unlocked.length === 0 ? 'Pick up something to learn recipes.' : 'No recipe matches.'}</div>
        )}
      </div>

      <div className="rb-pager">
        <button className="rb-arrow" data-testid="rb-prev" disabled={current === 0} onClick={() => { setPage(current - 1); point(null); }}>
          &#9664;
        </button>
        <span className="rb-page" data-testid="rb-page">
          {current + 1}/{pages}
        </span>
        <button className="rb-arrow" data-testid="rb-next" disabled={current >= pages - 1} onClick={() => { setPage(current + 1); point(null); }}>
          &#9654;
        </button>
      </div>

      <div className="rb-detail" data-testid="rb-detail">
        {detail ? (
          <>
            <div className="rb-d-name">
              {nameOf(detail.result.id)}
              {detail.result.count > 1 && <small> x{detail.result.count}</small>}
            </div>
            <div className="rb-d-needs">
              {needs.map(([id, n]) => {
                const got = have(id);
                return (
                  <span key={id} className={`rb-need ${got >= n ? 'ok' : 'lack'}`} title={nameOf(id)}>
                    <span className="rb-need-icon">
                      <ItemView stack={makeStack(id, 1)} />
                    </span>
                    {Math.min(got, n)}/{n}
                  </span>
                );
              })}
            </div>
            <div className={`rb-d-hint ${lacking.length === 0 ? 'ok' : 'lack'}`}>
              {lacking.length === 0
                ? 'Click to place it. Shift-click for as many as you can.'
                : `Missing ${lacking.map(([id, n]) => `${n - have(id)} ${nameOf(id)}`).join(', ')}`}
            </div>
          </>
        ) : step !== null ? (
          <>
            <div className="rb-d-name">Upgrade to +{step}</div>
            <div className="rb-d-needs">
              {(
                [
                  [pieceIcon(step), `A piece at +${step - 1}`, pieces(step - 1), 1],
                  [makeStack(I.JEWEL_RIFT, 1), nameOf(I.JEWEL_RIFT), have(I.JEWEL_RIFT), step - 9],
                  [makeStack(I.JEWEL_DAWN, 1), nameOf(I.JEWEL_DAWN), have(I.JEWEL_DAWN), step - 9],
                ] as const
              ).map(([stack, label, got, n]) => (
                <span key={label} className={`rb-need ${got >= n ? 'ok' : 'lack'}`} title={label}>
                  <span className="rb-need-icon">
                    <ItemView stack={stack} />
                  </span>
                  {Math.min(got, n)}/{n}
                </span>
              ))}
            </div>
            <div className={`rb-d-hint ${canForge(step, [api.inventory, menu.grid]) ? 'ok' : 'lack'}`}>
              {canForge(step, [api.inventory, menu.grid]) ? `Click to place them, then Forge: ${Math.round(FORGE_CHANCE * 100)}% to work, a failure costs a step.` : 'You need a piece at the level below and the jewels.'}
            </div>
          </>
        ) : (
          <div className="rb-d-hint">Point at a recipe to see what it needs.</div>
        )}
      </div>
    </div>
  );
}
