'use client';

import { useEffect, useMemo, useState } from 'react';
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
  recipeLayout,
  recipeNeeds,
  recipesForGrid,
  toolId,
  type CraftingMenu,
  type RecipeCategory,
} from '@solrift/shared';
import { useUi } from '../ui/store';
import { ItemView } from './ItemView';

const nameOf = (id: number): string => getItem(id).name.replace(/_/g, ' ');

type Tab = RecipeCategory | 'all' | 'forge';

/** The tabs across the top of the book, each with an item for an icon. */
const TABS: readonly { id: Tab; label: string; icon: number }[] = [
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

/** How many of an item the player has to hand: the bags and what is already in the grid. */
function useHave(menu: CraftingMenu): (id: number) => number {
  const api = useUi((s) => s.api)!;
  useUi((s) => s.version);
  return (id) => api.inventory.countOf(id) + menu.grid.countOf(id);
}

interface Row {
  /** Position in `RECIPES`, or the forge's index for a step past +9. */
  index: number;
  /** The recipe, or null for a step past +9. */
  recipe: (typeof RECIPES)[number] | null;
  step: number | null;
  /** Can it be made right now (it fits the grid here and the items are at hand)? */
  can: boolean;
  /** It only fits the crafting table's 3x3 grid, and this is the small one. */
  table: boolean;
  cat: RecipeCategory | 'forge';
}

/**
 * The recipe book, the right-hand column of the Crafting tab: every recipe in the game, whether or not it has been found (the
 * ones that need the crafting table are marked, and cannot be laid out in the small grid). Five to a row in a list that scrolls,
 * the ones you can make first. Pointing at one shows its ingredients as ghosts in the grid and its needs under the grid; a click
 * lays them out for real, and shift-click fills as many crafts as you have the items for. A gold mark on a tab says there is
 * something to make under it.
 */
export function RecipeBookPanel({
  menu,
  onPreview,
  onPick,
}: {
  menu: CraftingMenu;
  onPreview: (index: number | null) => void;
  /** A recipe was clicked: it stays described under the grid after the pointer moves away. */
  onPick: (index: number) => void;
}) {
  const api = useUi((s) => s.api)!;
  const have = useHave(menu);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [craftableOnly, setCraftableOnly] = useState(false);

  // Leaving the book (closing the screen, hiding it) must not leave a ghost layout behind.
  useEffect(() => () => onPreview(null), [onPreview]);

  // Every recipe that fits a table's grid, which is all of them, with whether it fits the grid in front of the player.
  const all = useMemo(() => recipesForGrid(3), []);
  const q = query.trim().toLowerCase();

  const recipes: Row[] = all.map((index) => {
    const recipe = RECIPES[index];
    const fits = !!recipeLayout(recipe, menu.size);
    return { index, recipe, step: null, can: fits && canCraftWith(recipe, have), table: !fits, cat: recipeCategory(recipe) };
  });
  // The steps past +9 are always in the book (the ones that fit the grid).
  const steps: Row[] = FORGE_TARGETS.map((step) => ({ index: forgeIndex(step), recipe: null, step, can: canForge(step, [api.inventory, menu.grid]), table: false, cat: 'forge' as const }));
  const known = [...recipes, ...steps];
  const craftable = known.filter((r) => r.can).length;
  // Which tabs have something to make right now.
  const ready = new Set<Tab>(known.filter((r) => r.can).flatMap((r) => ['all' as const, r.cat]));

  const rank = (r: Row): number => (r.can ? 0 : r.table ? 2 : 1);
  const rows = known
    .filter(({ recipe, step, can, cat }) => {
      if (tab !== 'all' && cat !== tab) return false;
      if (craftableOnly && !can) return false;
      return q === '' || (recipe ? nameOf(recipe.result.id) : `+${step} upgrade jewel of the rift dawn`).includes(q);
    })
    // What you can make now comes first, then what only lacks items, then what needs the table; each keeps its order.
    .sort((a, b) => rank(a) - rank(b));

  const change = (fn: () => void) => {
    fn();
    onPreview(null);
  };

  return (
    <aside className="cb" data-testid="recipe-book" onMouseLeave={() => onPreview(null)}>
      <div className="wow-head cb-head">
        <span>{tab === 'all' ? 'Recipe book' : TABS.find((t) => t.id === tab)!.label}</span>
        <em className="cb-count" data-testid="rb-count" title="Recipes you can make now / all recipes">
          {craftable} / {known.length}
        </em>
      </div>

      <div className="cb-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`cb-tab ${tab === t.id ? 'on' : ''}`}
            data-tab={t.id}
            title={t.label}
            onClick={() => change(() => setTab(t.id))}
          >
            <ItemView stack={makeStack(t.icon, 1)} />
            {ready.has(t.id) && <i className="cb-dot" aria-hidden />}
          </button>
        ))}
      </div>

      <div className="cb-top">
        <div className="cb-searchbox">
          <span className="cb-mag" aria-hidden />
          <input
            className="cb-search"
            placeholder="Search..."
            value={query}
            maxLength={24}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => change(() => setQuery(e.target.value))}
            onKeyDown={(e) => e.stopPropagation()}
          />
          {query !== '' && (
            <button className="cb-clear" title="Clear" aria-label="Clear the search" onClick={() => change(() => setQuery(''))}>
              &times;
            </button>
          )}
        </div>
        <button
          className={`cb-only ${craftableOnly ? 'on' : ''}`}
          data-testid="rb-only"
          aria-pressed={craftableOnly}
          title={craftableOnly ? 'Showing what you can make' : 'Showing every recipe'}
          onClick={() => change(() => setCraftableOnly((v) => !v))}
        >
          <span className="cb-check" aria-hidden />
          Can make
        </button>
      </div>

      <div className="cb-grid" data-testid="cb-grid">
        {rows.map(({ index, recipe, step, can, table }) => (
          <div
            key={index}
            className={`cb-item ${step !== null ? 'forge ' : ''}${can ? 'can' : table ? 'table' : 'cannot'}`}
            data-recipe={index}
            data-name={recipe ? nameOf(recipe.result.id) : `+${step} upgrade`}
            onMouseEnter={() => onPreview(index)}
            onMouseLeave={() => onPreview(null)}
            onMouseDown={(e) => {
              e.preventDefault();
              if (e.button !== 0) return;
              onPick(index);
              if (can) api.fillRecipe(index, step === null && e.shiftKey);
            }}
          >
            <ItemView stack={recipe ? makeStack(recipe.result.id, recipe.result.count) : forgeIcon(step!)} />
            {table && <i className="cb-table" aria-hidden />}
          </div>
        ))}
        {rows.length === 0 && <div className="cb-empty">No recipe matches.</div>}
      </div>
    </aside>
  );
}

/**
 * What a recipe needs, under the crafting grid: each ingredient with how much of it you have, and what to do about the rest. It
 * describes the recipe the pointer is on in the book, or else the one that was clicked last.
 */
export function RecipeDetail({ menu, index }: { menu: CraftingMenu; index: number | null }) {
  const api = useUi((s) => s.api)!;
  const have = useHave(menu);
  /** How many pieces at exactly this level the player has (bags and grid). */
  const pieces = (level: number): number =>
    [api.inventory, menu.grid].reduce((n, c) => n + c.slots.filter((s) => !!s && canRollGear(s.id) && s.count === 1 && (s.gear?.u ?? 0) === level).length, 0);

  const step = index !== null ? forgeTarget(index) : null;
  const recipe = index !== null && step === null ? RECIPES[index] : null;

  if (recipe) {
    const needs = [...recipeNeeds(recipe)];
    const lacking = needs.filter(([id, n]) => have(id) < n);
    const fits = !!recipeLayout(recipe, menu.size);
    return (
      <div className="cd" data-testid="rb-detail">
        <div className="cd-name">
          {nameOf(recipe.result.id)}
          {recipe.result.count > 1 && <small> x{recipe.result.count}</small>}
        </div>
        <div className="cd-needs">
          {needs.map(([id, n]) => {
            const got = have(id);
            return (
              <span key={id} className={`cd-need ${got >= n ? 'ok' : 'lack'}`} title={nameOf(id)}>
                <span className="cd-need-icon">
                  <ItemView stack={makeStack(id, 1)} />
                </span>
                {Math.min(got, n)}/{n}
              </span>
            );
          })}
        </div>
        <div className={`cd-hint ${!fits ? 'table' : lacking.length === 0 ? 'ok' : 'lack'}`}>
          {!fits
            ? 'Needs a crafting table: it does not fit the small grid.'
            : lacking.length === 0
              ? 'Click it in the book to place it. Shift-click for as many as you can.'
              : `Missing ${lacking.map(([id, n]) => `${n - have(id)} ${nameOf(id)}`).join(', ')}`}
        </div>
      </div>
    );
  }

  if (step !== null) {
    const ok = canForge(step, [api.inventory, menu.grid]);
    return (
      <div className="cd" data-testid="rb-detail">
        <div className="cd-name">Upgrade to +{step}</div>
        <div className="cd-needs">
          {(
            [
              [pieceIcon(step), `A piece at +${step - 1}`, pieces(step - 1), 1],
              [makeStack(I.JEWEL_RIFT, 1), nameOf(I.JEWEL_RIFT), have(I.JEWEL_RIFT), step - 9],
              [makeStack(I.JEWEL_DAWN, 1), nameOf(I.JEWEL_DAWN), have(I.JEWEL_DAWN), step - 9],
            ] as const
          ).map(([stack, label, got, n]) => (
            <span key={label} className={`cd-need ${got >= n ? 'ok' : 'lack'}`} title={label}>
              <span className="cd-need-icon">
                <ItemView stack={stack} />
              </span>
              {Math.min(got, n)}/{n}
            </span>
          ))}
        </div>
        <div className={`cd-hint ${ok ? 'ok' : 'lack'}`}>
          {ok ? `Click it to place them, then Forge: ${Math.round(FORGE_CHANCE * 100)}% to work, a failure costs a step.` : 'You need a piece at the level below and the jewels.'}
        </div>
      </div>
    );
  }

  return (
    <div className="cd" data-testid="rb-detail">
      <div className="cd-hint">Point at a recipe in the book to see what it needs, click it to lay it out in the grid.</div>
    </div>
  );
}
