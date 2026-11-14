'use client';

import { useEffect, useState } from 'react';
import { useUi, clearRecipeToast } from '../ui/store';
import { ItemView } from './ItemView';
import { makeStack } from '@solrift/shared';

/** How long the announcement stays, and how often its icon changes while several recipes are new. */
const SHOW_MS = 5000;
const CYCLE_MS = 900;

/**
 * "New Recipes Unlocked!" in the top right, like the original: an icon of what you can now make (cycling when
 * there are several) and a hint to look in the recipe book. Recipes learned while it is up join it.
 */
export function RecipeToast() {
  const toast = useUi((s) => s.recipeToast);
  const stamp = toast?.stamp;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (stamp === undefined) return;
    const t = setTimeout(clearRecipeToast, SHOW_MS);
    return () => clearTimeout(t);
  }, [stamp]);

  const count = toast?.icons.length ?? 0;
  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setTick((n) => n + 1), CYCLE_MS);
    return () => clearInterval(t);
  }, [count]);

  if (!toast || toast.icons.length === 0) return null;
  const icon = toast.icons[tick % toast.icons.length];
  return (
    <div id="recipe-toast" data-testid="recipe-toast">
      <div className="toast-icon">
        <ItemView stack={makeStack(icon, 1)} />
      </div>
      <div className="toast-text">
        <b>New Recipes Unlocked!</b>
        <span>Check your recipe book</span>
      </div>
    </div>
  );
}
